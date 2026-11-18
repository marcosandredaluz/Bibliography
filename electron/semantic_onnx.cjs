/**
 * CAMADA 4 — Motor Semântico Multilíngue ONNX (`@huggingface/transformers`)
 * -------------------------------------------------------------------------
 * Utiliza o modelo neural quantizado `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (ONNX Runtime)
 * para calcular a similaridade semântica de cosseno densa entre frases em Português (no Word)
 * e resumos/textos científicos em Inglês ou Português (PubMed / Crossref / OpenAlex / Mendeley CSL).
 * Possui cache em memória de vetores de embeddings e degradação graciosa caso esteja offline.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

const CUSTOM_MODEL_ID = 'custom-forensic-minilm';
const BASE_MODEL_ID = 'Xenova/paraphrase-multilingual-MiniLM-L12-v2';

let extratorEmbeddingsPromise = null;
let falhaCarregamentoOnnx = false;
let modeloAtivoId = BASE_MODEL_ID;
const cacheVetores = new Map();

function resolverPastaCacheModelos() {
  return process.env.BIBLIOGRAPHY_MODELS_DIR || path.join(os.homedir(), '.bibliografia_models_cache');
}

function resolverRaizesBuscaModeloLocal() {
  const raizes = [resolverPastaCacheModelos()];
  if (process.resourcesPath) {
    raizes.push(path.join(process.resourcesPath, 'models'));
  }
  raizes.push(path.join(__dirname, '..', 'calibration_gate'));
  return raizes;
}

function detectarModeloLocalCustomizado(cacheRoot) {
  const dirCustom = path.join(cacheRoot, CUSTOM_MODEL_ID);
  const quantizado = path.join(dirCustom, 'onnx', 'model_quantized.onnx');
  const fp32 = path.join(dirCustom, 'onnx', 'model.onnx');
  if (fs.existsSync(quantizado)) return { rootDir: cacheRoot, modelId: CUSTOM_MODEL_ID, dtype: 'q8' };
  if (fs.existsSync(fp32)) return { rootDir: cacheRoot, modelId: CUSTOM_MODEL_ID, dtype: 'fp32' };
  return null;
}

function localizarModeloCustomizadoNosCaminhos() {
  for (const raiz of resolverRaizesBuscaModeloLocal()) {
    const achado = detectarModeloLocalCustomizado(raiz);
    if (achado) return achado;
  }
  return null;
}

async function obterExtratorOnnx() {
  if (falhaCarregamentoOnnx) return null;
  if (extratorEmbeddingsPromise) return extratorEmbeddingsPromise;

  extratorEmbeddingsPromise = (async () => {
    try {
      const transformers = await import('@huggingface/transformers');
      const cacheRoot = resolverPastaCacheModelos();
      const customLocal = localizarModeloCustomizadoNosCaminhos();

      if (transformers.env) {
        transformers.env.cacheDir = cacheRoot;
        transformers.env.localModelPath = customLocal ? customLocal.rootDir : cacheRoot;
        transformers.env.allowLocalModels = true;
      }

      if (customLocal) {
        modeloAtivoId = customLocal.modelId;
        return await transformers.pipeline('feature-extraction', customLocal.modelId, {
          dtype: customLocal.dtype,
          local_files_only: true,
        });
      }

      modeloAtivoId = BASE_MODEL_ID;
      return await transformers.pipeline('feature-extraction', BASE_MODEL_ID, {
        dtype: 'q8',
      });
    } catch {
      falhaCarregamentoOnnx = true;
      return null;
    }
  })();

  return extratorEmbeddingsPromise;
}

async function gerarVetorEmbedding(texto) {
  const limpo = String(texto || '').trim().slice(0, 1200);
  if (limpo.length < 15) return null;
  if (cacheVetores.has(limpo)) return cacheVetores.get(limpo);

  const pipe = await obterExtratorOnnx();
  if (!pipe) return null;

  try {
    const out = await pipe(limpo, { pooling: 'mean', normalize: true });
    const vetor = Array.from(out.data || []);
    if (vetor.length > 0) {
      if (cacheVetores.size > 2000) cacheVetores.clear();
      cacheVetores.set(limpo, vetor);
      return vetor;
    }
  } catch {
    // Continua com fallback léxico
  }
  return null;
}

function produtoEscalarNormalizado(vA, vB) {
  if (!vA || !vB || vA.length !== vB.length) return null;
  let soma = 0;
  for (let i = 0; i < vA.length; i++) {
    soma += vA[i] * vB[i];
  }
  return Math.max(0, Math.min(1, soma));
}

/**
 * Calcula a similaridade semântica densa bilíngue (PT <-> EN) entre a afirmação no Word e o artigo.
 * Retorna número entre 0 e 1 (ou null se o modelo ONNX ainda não estiver em cache local/offline).
 */
async function calcularSimilaridadeSemanticaOnnx(fraseWord, textoArtigo, timeoutMs = 2500) {
  try {
    const tarefa = (async () => {
      const [vFrase, vArtigo] = await Promise.all([
        gerarVetorEmbedding(fraseWord),
        gerarVetorEmbedding(String(textoArtigo || '').slice(0, 1500)),
      ]);
      return produtoEscalarNormalizado(vFrase, vArtigo);
    })();

    const timer = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
    return await Promise.race([tarefa, timer]);
  } catch {
    return null;
  }
}

module.exports = {
  obterExtratorOnnx,
  calcularSimilaridadeSemanticaOnnx,
  resolverPastaCacheModelos,
  detectarModeloLocalCustomizado,
  obterModeloAtivoId: () => modeloAtivoId,
};
