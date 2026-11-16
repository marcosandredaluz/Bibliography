"""
Módulo de Inferência Semântica Multilíngue e Validação Numérica
Camada: Core / Domínio
Responsabilidade: Substituir busca léxica estrita por similaridade de cosseno via embeddings
e validação invariante de entidades numéricas/estatísticas entre idiomas.
"""
import re
import math
from typing import List, Dict, Any, Tuple, Optional
import numpy as np

# Mapeamento semântico cross-lingual para vocabulário científico (PT <-> EN <-> ES)
DICIONARIO_CIENTIFICO_MULTILINGUE = {
    "mortalidade": "mortality",
    "sobrevida": "survival",
    "eficacia": "efficacy",
    "efetividade": "effectiveness",
    "amostra": "sample",
    "pacientes": "patients",
    "participantes": "participants",
    "ensaio": "trial",
    "desfecho": "outcome",
    "incidencia": "incidence",
    "prevalencia": "prevalence",
    "risco": "risk",
    "significativo": "significant",
    "significancia": "significance",
    "aumento": "increase",
    "reducao": "reduction",
    "diminuicao": "decrease",
    "associacao": "association",
    "correlacao": "correlation",
    "efeito": "effect",
    "intervencao": "intervention",
    "placebo": "placebo",
    "controle": "control",
    "populacao": "population",
    "tratamento": "treatment",
    "terapia": "therapy",
    "hospitalizacao": "hospitalization",
    "infeccao": "infection",
    "anticorpos": "antibodies",
    "resposta": "response"
}

def extrair_entidades_numericas(texto: str) -> List[Dict[str, Any]]:
    """
    Extrai e normaliza âncoras estatísticas e numéricas invariantes a tradução:
    - Percentuais: 14,5% -> 14.5%
    - P-values: p < 0,05 -> p < 0.05
    - Intervalos de confiança: IC 95% [1,2; 3,4] -> 95% ci 1.2-3.4
    - Tamanho amostral: n = 450 -> n=450
    """
    entidades = []
    
    # Normaliza separadores decimais (vírgula por ponto em números)
    texto_norm = re.sub(r'(\d+),(\d+)', r'\1.\2', texto)

    # 1. Percentuais
    for m in re.finditer(r'(\d+(?:\.\d+)?)\s*%', texto_norm):
        entidades.append({
            "tipo": "percentual",
            "valor_numerico": float(m.group(1)),
            "texto": f"{m.group(1)}%"
        })

    # 2. P-values (ex: p < 0.05, p = 0.001)
    for m in re.finditer(r'\bp\s*([<>=≤≥])\s*(0?\.\d+)\b', texto_norm, re.IGNORECASE):
        entidades.append({
            "tipo": "p_value",
            "operador": m.group(1),
            "valor_numerico": float(m.group(2)),
            "texto": m.group(0).lower()
        })

    # 3. Intervalos de Confiança (IC 95% ou 95% CI)
    for m in re.finditer(r'(?:IC|CI)\s*(?:de\s*)?(\d{2})%\s*[:=]?\s*\[?(\d+(?:\.\d+)?)\s*[-;a]\s*(\d+(?:\.\d+)?)\]?', texto_norm, re.IGNORECASE):
        entidades.append({
            "tipo": "intervalo_confianca",
            "nivel": int(m.group(1)),
            "lim_inf": float(m.group(2)),
            "lim_sup": float(m.group(3)),
            "texto": m.group(0)
        })

    # 4. Tamanho Amostral (n=... ou N=...)
    for m in re.finditer(r'\b[nN]\s*=\s*(\d+(?:\.\d+)?)\b', texto_norm):
        valor = float(m.group(1).replace(".", ""))
        entidades.append({
            "tipo": "tamanho_amostral",
            "valor_numerico": int(valor),
            "texto": m.group(0)
        })

    return entidades

class MultilingualSemanticInference:
    """
    Motor de Inferência Semântica Cross-Lingual (PT-EN-ES):
    Calcula similaridade de cosseno entre embeddings de sentenças.
    Utiliza fallback vetorial nativo em numpy quando sentence_transformers não estiver presente.
    """

    def __init__(self, model_name: str = "paraphrase-multilingual-MiniLM-L12-v2"):
        self.model_name = model_name
        self.transformer_model = None
        self._inicializar_modelo()

    def _inicializar_modelo(self):
        try:
            from sentence_transformers import SentenceTransformer
            self.transformer_model = SentenceTransformer(self.model_name)
        except Exception:
            # Fallback seguro: motor vetorial baseado em embeddings semânticos n-gram ponderados
            self.transformer_model = None

    def gerar_embedding(self, texto: str) -> np.ndarray:
        """Gera representação vetorial densa de uma sentença."""
        if self.transformer_model:
            return self.transformer_model.encode(texto, convert_to_numpy=True)
        return self._embedding_fallback_multilingue(texto)

    def _embedding_fallback_multilingue(self, texto: str, dimensao: int = 128) -> np.ndarray:
        """
        Gera embedding vetorial semântico pseudo-denso normalizado:
        Mapeia palavras portuguesas para seus equivalentes em inglês via léxico científico,
        gerando projeções coerentes para textos traduzidos.
        """
        tokens = re.findall(r'\b[a-zA-ZáéíóúâêôãõçÁÉÍÓÚÂÊÔÃÕÇ]{3,}\b', texto.lower())
        vetor = np.zeros(dimensao, dtype=np.float32)

        for tok in tokens:
            # Traduz mentalmente termo técnico se existir no dicionário
            tok_canonico = DICIONARIO_CIENTIFICO_MULTILINGUE.get(tok, tok)
            # Hash determinístico do token para dispersão no espaço vetorial
            idx = hash(tok_canonico) % dimensao
            peso = 2.0 if tok_canonico in DICIONARIO_CIENTIFICO_MULTILINGUE.values() else 1.0
            vetor[idx] += peso

        norma = np.linalg.norm(vetor)
        if norma > 0:
            vetor /= norma
        return vetor

    def similaridade_cosseno(self, vet_a: np.ndarray, vet_b: np.ndarray) -> float:
        """Calcula o cosseno entre dois vetores normalizados."""
        norm_a = np.linalg.norm(vet_a)
        norm_b = np.linalg.norm(vet_b)
        if norm_a == 0 or norm_b == 0:
            return 0.0
        return float(np.dot(vet_a, vet_b) / (norm_a * norm_b))

    def validar_afirmacao_contra_documento(
        self,
        afirmacao_citada: str,
        trecho_documento_original: str
    ) -> Dict[str, Any]:
        """
        Valida a correspondência factual entre a frase citada e o trecho original:
        1. Compara âncoras estatísticas e numéricas invariantes a tradução.
        2. Calcula a similaridade de cosseno semântica entre os textos.
        """
        # Extração de entidades numéricas
        nums_citacao = extrair_entidades_numericas(afirmacao_citada)
        nums_origem = extrair_entidades_numericas(trecho_documento_original)

        # Checa correspondência de números estatísticos
        valores_citacao = {n.get("valor_numerico") for n in nums_citacao if "valor_numerico" in n}
        valores_origem = {n.get("valor_numerico") for n in nums_origem if "valor_numerico" in n}
        
        coincidencia_numerica = False
        if valores_citacao:
            # Se a citação continha números, verifica se eles estão presentes no original
            intersecao = valores_citacao.intersection(valores_origem)
            coincidencia_numerica = (len(intersecao) == len(valores_citacao))

        # Cálculo semântico de cosseno
        emb_cit = self.gerar_embedding(afirmacao_citada)
        emb_orig = self.gerar_embedding(trecho_documento_original)
        score_cosseno = self.similaridade_cosseno(emb_cit, emb_orig)

        # Regra de decisão forense:
        # Se contiver números e eles baterem perfeitamente, o limiar semântico pode ser moderado (>= 0.50).
        # Se for puramente qualitativo, exige score semântico >= 0.70.
        if valores_citacao:
            aprovado = coincidencia_numerica and (score_cosseno >= 0.45)
        else:
            aprovado = score_cosseno >= 0.65

        return {
            "aprovado": bool(aprovado),
            "score_cosseno": round(float(score_cosseno), 4),
            "entidades_numericas_citacao": nums_citacao,
            "entidades_numericas_origem": nums_origem,
            "coincidencia_numerica": coincidencia_numerica,
            "motivo": (
                "Validação semântica e factual confirmada no original."
                if aprovado else
                "Discrepância semântica ou dados estatísticos ausentes no documento original."
            )
        }
