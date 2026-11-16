/**
 * CAMADA 4 — Motor Semântico Multilíngue ONNX (`@huggingface/transformers`)
 * -------------------------------------------------------------------------
 * Utiliza o modelo neural quantizado `Xenova/paraphrase-multilingual-MiniLM-L12-v2` (ONNX Runtime)
 * para calcular a similaridade semântica de cosseno densa entre frases em Português (no Word)
 * e resumos/textos científicos em Inglês ou Português (PubMed / Crossref / OpenAlex / Mendeley CSL).
 * Possui cache em memória de vetores de embeddings e degradação graciosa caso esteja offline.
 */

const path = require('path');
const os = require('os');

let extratorEmbeddingsPromise = null;
let falhaCarregamentoOnnx = false;
const cacheVetores = new Map();

async function obterExtratorOnnx() {
  if (falhaCarregamentoOnnx) return null;
  if (extratorEmbeddingsPromise) return extratorEmbeddingsPromise;

  extratorEmbeddingsPromise = (async () => {
    try {
      const transformers = await import('@huggingface/transformers');
      if (transformers.env) {
        transformers.env.cacheDir = path.join(os.homedir(), '.bibliografia_models_cache');
        transformers.env.allowLocalModels = true;
      }
      const pipe = await transformers.pipeline(
        'feature-extraction',
        'Xenova/paraphrase-multilingual-MiniLM-L12-v2',
        { quantized: true }
      );
      return pipe;
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
};
