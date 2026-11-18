# %% [markdown]
# # Bibliografia Forense — Fine-Tuning Semântico Bilíngue (PT ↔ EN) e Exportação ONNX INT8
#
# Este script/notebook treina o modelo **`sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`**
# com pares acadêmicos reais (suporte fiel vs. contradição vs. desvio temático), exporta para **ONNX**,
# quantiza para **`onnx/model_quantized.onnx`** (INT8) e empacota o arquivo **`custom-forensic-minilm.zip`**
# pronto para ser extraído em `~/.bibliografia_models_cache/custom-forensic-minilm/` no app Electron (`semantic_onnx.cjs`).

# %%
# CÉLULA 1 — Instalação das bibliotecas (no Google Colab, execute esta célula com `!pip install` ou descomente no ambiente local)
# !pip install -q --upgrade "sentence-transformers>=3.0.0" "optimum[onnxruntime]>=1.21.0" "datasets>=2.20.0" "accelerate>=0.34.0"
import subprocess
import sys

def instalar_dependencias_colab():
    subprocess.check_call([
        sys.executable, "-m", "pip", "install", "-q", "--upgrade",
        "sentence-transformers>=3.0.0", "optimum[onnxruntime]>=1.21.0",
        "datasets>=2.20.0", "accelerate>=0.34.0",
    ])

if "google.colab" in sys.modules:
    instalar_dependencias_colab()

# %%
# CÉLULA 2 — Verificação de GPU e escolha de pasta de trabalho
import os
import json
import torch

print("GPU disponível:", torch.cuda.is_available(), torch.cuda.get_device_name(0) if torch.cuda.is_available() else "CPU")
BASE_MODEL = "sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2"
WORK_DIR = "/content/bibliografia_treino"
EXPORT_DIR = "/content/custom-forensic-minilm"
os.makedirs(WORK_DIR, exist_ok=True)
os.makedirs(EXPORT_DIR, exist_ok=True)

# %%
# CÉLULA 3 — Dataset de Treino (Upload opcional de CSV/JSONL próprio + pares-semente acadêmicos)
# Formato esperado se você enviar seu próprio arquivo CSV ou JSONL:
# Colunas / chaves: sentence1 (frase citada no Word), sentence2 (trecho do artigo/PDF), score (0.0 a 1.0)
# Ex.: 0.95 = apoio fiel | 0.10 = inversão de polaridade/contradição | 0.05 = tema completamente distinto

PARES_SEMENTE = [
    # Pares positivos bilíngues (PT manuscrito <-> EN/PT evidência fiel)
    ("A vacinação contra HPV reduziu significativamente a incidência de lesões precursoras em adolescentes.", "HPV vaccination significantly reduced the incidence of high-grade cervical precursor lesions among vaccinated adolescents.", 0.96),
    ("O SI-PNI enfrenta subnotificação e atraso na digitação em municípios com baixa conectividade.", "Low internet connectivity and delayed data entry in primary health units contribute to underreporting in the National Immunization Program Information System.", 0.94),
    ("Estudos de avaliabilidade permitem identificar pontos críticos antes da avaliação somativa de programas.", "Evaluability assessments identify operational bottlenecks and clarify program theory prior to formal impact evaluation.", 0.95),
    ("A completitude dos dados nos sistemas de informação em saúde melhora com capacitação contínua das equipes.", "Continuous training of healthcare staff improves data completeness and consistency in Brazilian health information systems.", 0.95),
    # Negativos difíceis: mesmo tema, porém INVERSÃO de resultado / polaridade (alerta forense crítico!)
    ("A intervenção aumentou a cobertura vacinal em 25% após seis meses.", "The intervention led to a 25% decline in vaccination coverage after six months.", 0.12),
    ("Não houve diferença estatisticamente significativa na mortalidade entre os grupos (p = 0,48).", "Mortality was significantly lower in the intervention arm compared with placebo (p < 0.001).", 0.08),
    ("O registro eletrônico eliminou completamente os erros de duplicidade no período avaliado.", "Electronic records still exhibited substantial duplication rates and incomplete age fields during the audit period.", 0.15),
    # Negativos de desvio temático (palavras próximas, assunto clínico diferente)
    ("Avaliação do sistema de vigilância do Programa Nacional de Imunizações no Brasil.", "Molecular phylogeny and vector competence of Aedes aegypti populations in urban dengue outbreaks.", 0.05),
    ("Critérios de inclusão em ensaios clínicos randomizados para hipertensão arterial sistêmica.", "Geospatial distribution of visceral leishmaniasis and canine reservoirs in northeastern Brazil.", 0.04),
]

DATASET_CUSTOM_PATH = None
try:
    from google.colab import files
    print("Se quiser subir seu próprio arquivo (.csv ou .jsonl) com pares reais, selecione agora; ou clique em Cancel upload para testar com os pares-semente:")
    uploaded = files.upload()
    if uploaded:
        DATASET_CUSTOM_PATH = next(iter(uploaded.keys()))
        print("Arquivo carregado:", DATASET_CUSTOM_PATH)
except Exception:
    print("Execução fora do Colab ou upload pulado; seguindo com pares-semente.")

import csv
from datasets import Dataset

linhas_treino = [{"sentence1": a, "sentence2": b, "label": float(s)} for a, b, s in PARES_SEMENTE]

if DATASET_CUSTOM_PATH and os.path.exists(DATASET_CUSTOM_PATH):
    if DATASET_CUSTOM_PATH.lower().endswith(".jsonl"):
        with open(DATASET_CUSTOM_PATH, "r", encoding="utf-8") as f:
            for line in f:
                if line.strip():
                    obj = json.loads(line)
                    linhas_treino.append({
                        "sentence1": obj["sentence1"],
                        "sentence2": obj["sentence2"],
                        "label": float(obj["score"]),
                    })
    elif DATASET_CUSTOM_PATH.lower().endswith(".csv"):
        with open(DATASET_CUSTOM_PATH, "r", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                linhas_treino.append({
                    "sentence1": row["sentence1"],
                    "sentence2": row["sentence2"],
                    "label": float(row["score"]),
                })

# Divide 80% treino / 20% validação (garantindo mínimo de 2 amostras na validação)
n_val = max(2, int(len(linhas_treino) * 0.2))
train_ds = Dataset.from_list(linhas_treino[:-n_val])
val_ds = Dataset.from_list(linhas_treino[-n_val:])
print(f"Total: {len(linhas_treino)} pares | Treino: {len(train_ds)} | Validação: {len(val_ds)}")

# %%
# CÉLULA 4 — Fine-Tuning Contrastivo (CoSENTLoss preserva escala 0..1 e pune inversões de sentido)
from sentence_transformers import SentenceTransformer, SentenceTransformerTrainer, SentenceTransformerTrainingArguments
from sentence_transformers.losses import CoSENTLoss
from sentence_transformers.evaluation import EmbeddingSimilarityEvaluator

model = SentenceTransformer(BASE_MODEL)
loss = CoSENTLoss(model)

evaluator_antes = EmbeddingSimilarityEvaluator(
    sentences1=val_ds["sentence1"],
    sentences2=val_ds["sentence2"],
    scores=val_ds["label"],
    name="val_forense",
)
print("Métricas ANTES do fine-tuning:", evaluator_antes(model))

args = SentenceTransformerTrainingArguments(
    output_dir=os.path.join(WORK_DIR, "checkpoints"),
    num_train_epochs=8,
    per_device_train_batch_size=8,
    learning_rate=2e-5,
    warmup_ratio=0.1,
    fp16=torch.cuda.is_available(),
    eval_strategy="epoch",
    save_strategy="no",
    logging_steps=5,
)

trainer = SentenceTransformerTrainer(
    model=model,
    args=args,
    train_dataset=train_ds,
    eval_dataset=val_ds,
    loss=loss,
    evaluator=evaluator_antes,
)
trainer.train()

print("Métricas DEPOIS do fine-tuning:", evaluator_antes(model))
TUNED_PT_DIR = os.path.join(WORK_DIR, "tuned_pytorch")
model.save_pretrained(TUNED_PT_DIR)
print("Modelo PyTorch ajustado salvo em:", TUNED_PT_DIR)

# %%
# CÉLULA 5 — Exportar para ONNX + Quantizar INT8 exatamente como onnx/model_quantized.onnx
import shutil
from optimum.onnxruntime import ORTModelForFeatureExtraction, ORTQuantizer
from optimum.onnxruntime.configuration import AutoQuantizationConfig
from transformers import AutoTokenizer

ONNX_SUBDIR = os.path.join(EXPORT_DIR, "onnx")
os.makedirs(ONNX_SUBDIR, exist_ok=True)

# 1. Exporta grafo PyTorch -> ONNX FP32 dentro de custom-forensic-minilm/onnx/model.onnx
ort_model = ORTModelForFeatureExtraction.from_pretrained(TUNED_PT_DIR, export=True)
tokenizer = AutoTokenizer.from_pretrained(TUNED_PT_DIR)
ort_model.save_pretrained(ONNX_SUBDIR)
tokenizer.save_pretrained(EXPORT_DIR)
ort_model.config.save_pretrained(EXPORT_DIR)

# 2. Quantização dinâmica INT8 para CPU (model_quantized.onnx esperado pelo transformers.js dtype='q8')
quantizer = ORTQuantizer.from_pretrained(ONNX_SUBDIR, file_name="model.onnx")
qconfig = AutoQuantizationConfig.avx2(is_static=False, per_channel=False)
quantizer.quantize(save_dir=ONNX_SUBDIR, quantization_config=qconfig)

# Limpa o arquivo FP32 pesado mantendo apenas model_quantized.onnx se quiser pacote compacto (~118 MB vs ~470 MB)
fp32_path = os.path.join(ONNX_SUBDIR, "model.onnx")
q8_path = os.path.join(ONNX_SUBDIR, "model_quantized.onnx")
assert os.path.exists(q8_path), "Falha: onnx/model_quantized.onnx não foi gerado!"
if os.path.exists(fp32_path):
    os.remove(fp32_path)

for extra in ("config.json", "tokenizer.json", "tokenizer_config.json"):
    if not os.path.exists(os.path.join(EXPORT_DIR, extra)):
        raise FileNotFoundError(f"Arquivo obrigatório ausente: {extra}")

print("Conteúdo final pronto para @huggingface/transformers:")
for root, _, fns in os.walk(EXPORT_DIR):
    for fn in sorted(fns):
        full = os.path.join(root, fn)
        print(f" - {os.path.relpath(full, EXPORT_DIR)} ({os.path.getsize(full) / (1024*1024):.2f} MB)")

# %%
# CÉLULA 6 — Teste rápido do ONNX INT8 (mean pooling + L2 normalize idêntico ao semantic_onnx.cjs)
import numpy as np
import onnxruntime as ort

session = ort.InferenceSession(q8_path, providers=["CPUExecutionProvider"])

def embed_onnx(texto: str) -> np.ndarray:
    enc = tokenizer(texto, padding=True, truncation=True, max_length=128, return_tensors="np")
    inputs = {k: v.astype(np.int64) for k, v in enc.items() if k in {i.name for i in session.get_inputs()}}
    last_hidden = session.run(None, inputs)[0]
    mask = np.expand_dims(enc["attention_mask"], -1).astype(np.float32)
    pooled = np.sum(last_hidden * mask, axis=1) / np.clip(mask.sum(axis=1), 1e-9, None)
    norm = np.linalg.norm(pooled, axis=1, keepdims=True)
    return (pooled / np.clip(norm, 1e-9, None))[0]

v_pt = embed_onnx("A vacinação contra HPV reduziu lesões precursoras em adolescentes.")
v_en = embed_onnx("HPV vaccination decreased precancerous cervical lesions in adolescents.")
v_contra = embed_onnx("HPV vaccination increased precancerous cervical lesions by 40%.")
print("Dimensão do embedding (esperado 384):", len(v_pt))
print("Cosseno PT <-> EN (apoio fiel):", float(np.dot(v_pt, v_en)))
print("Cosseno PT <-> EN (contradição):", float(np.dot(v_pt, v_contra)))

# %%
# CÉLULA 7 — Compactar custom-forensic-minilm.zip e baixar para o seu Windows
ZIP_OUT = shutil.make_archive("/content/custom-forensic-minilm", "zip", "/content", "custom-forensic-minilm")
print("Pacote gerado:", ZIP_OUT)
try:
    from google.colab import files
    files.download(ZIP_OUT)
except Exception:
    print("Baixe manualmente o arquivo:", ZIP_OUT)
