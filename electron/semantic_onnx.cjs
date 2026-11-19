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
const CUSTOM_NLI_MODEL_ID = 'custom-forensic-nli-int8';

let extratorEmbeddingsPromise = null;
let falhaCarregamentoOnnx = false;
let modeloAtivoId = BASE_MODEL_ID;
const cacheVetores = new Map();

let classificadorNliPromise = null;
let falhaCarregamentoNli = false;
let modeloNliAtivoId = null;
const cacheNliPares = new Map();

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

function detectarModeloLocalCustomizado(cacheRoot = resolverPastaCacheModelos()) {
  if (!cacheRoot) return null;
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

const STOPWORDS_TRIAGEM = new Set([
  'para', 'como', 'entre', 'sobre', 'pelo', 'pela', 'pelos', 'pelas', 'com', 'sem',
  'que', 'uma', 'uns', 'umas', 'dos', 'das', 'nos', 'nas', 'mais', 'menos', 'muito',
  'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas', 'isso', 'isto',
  'foram', 'sido', 'pode', 'podem', 'tambem', 'onde', 'quando', 'apos', 'durante',
  'that', 'this', 'with', 'from', 'were', 'been', 'have', 'which', 'their', 'about',
  'such', 'than', 'more', 'most', 'also', 'between', 'among', 'study', 'studies',
]);

function extrairTokensTriagem(texto) {
  const norm = String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/(\d),(\d)/g, '$1.$2');
  const palavras = norm
    .replace(/[^a-z0-9.%<>=/-]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const termos = [];
  const numeros = [];
  for (const w of palavras) {
    const limpo = w.replace(/^[.,;:()]+|[.,;:()]+$/g, '');
    if (!limpo) continue;
    if (/\d/.test(limpo) && (limpo.length >= 2 || /%/.test(limpo))) {
      numeros.push(limpo);
    }
    const alfa = limpo.replace(/[^a-z0-9]/g, '');
    if (alfa.length >= 4 && !STOPWORDS_TRIAGEM.has(alfa)) {
      termos.push(alfa.slice(0, 8));
    }
  }
  return { termos, numeros };
}

/**
 * Divide todo o texto integral do artigo em blocos de 900 caracteres com overlap de 150 caracteres
 * (passo 750), sem truncar artigos longos com 30.000+ caracteres.
 */
function fatiarBlocosComOverlap(texto, tamBloco = 900, overlap = 150) {
  const limpo = String(texto || '').replace(/\s+/g, ' ').trim();
  if (limpo.length < 15) return [];
  if (limpo.length <= tamBloco) return [{ idx: 0, texto: limpo }];
  const passo = Math.max(100, tamBloco - overlap);
  const blocos = [];
  for (let i = 0, idx = 0; i < limpo.length; i += passo, idx++) {
    const seg = limpo.slice(i, i + tamBloco).trim();
    if (seg.length >= 25) blocos.push({ idx, texto: seg });
    if (i + tamBloco >= limpo.length) break;
  }
  return blocos;
}

/**
 * Pontuação BM25-like + âncoras quantitativas determinística para triagem léxica rápida de blocos.
 */
function pontuarBlocoLexical(consulta, blocoTexto, idfMap = null, avgDl = 120) {
  const q = extrairTokensTriagem(consulta);
  if (!q.termos.length && !q.numeros.length) return 0;
  const d = extrairTokensTriagem(blocoTexto);
  const dl = Math.max(1, d.termos.length);

  const tfDoc = new Map();
  for (const t of d.termos) tfDoc.set(t, (tfDoc.get(t) || 0) + 1);

  const k1 = 1.2;
  const b = 0.75;
  let score = 0;
  const qUnicos = new Set(q.termos);

  for (const tq of qUnicos) {
    let tf = tfDoc.get(tq) || 0;
    if (tf === 0 && tq.length >= 5) {
      // Pequeno matching por prefixo comum (>= 5 chars) para capturar variações morfológicas PT/EN
      const pref = tq.slice(0, 5);
      for (const [td, cnt] of tfDoc.entries()) {
        if (td.startsWith(pref)) tf += cnt * 0.75;
      }
    }
    if (tf > 0) {
      const idf = idfMap?.get(tq) ?? (1 + Math.min(2, tq.length * 0.15));
      const num = tf * (k1 + 1);
      const den = tf + k1 * (1 - b + b * (dl / Math.max(40, avgDl)));
      score += idf * (num / den);
    }
  }

  // Bônus explícito para números exatos, percentuais, valores de p e amostras n=
  if (q.numeros.length > 0 && d.numeros.length > 0) {
    const setNumDoc = new Set(d.numeros);
    for (const nq of new Set(q.numeros)) {
      if (setNumDoc.has(nq)) score += 3.5;
    }
  }
  return score;
}

/**
 * Executa triagem léxica (BM25 + âncoras) em TODOS os blocos de 900 caracteres (overlap 150) do PDF
 * e seleciona deterministicamente os Top-12 blocos candidatos para o modelo ONNX INT8.
 */
function selecionarTopCandidatosLexicos(fraseWord, textoArtigo, topN = 12) {
  const blocos = fatiarBlocosComOverlap(textoArtigo, 900, 150);
  if (!blocos.length) return [];
  if (blocos.length <= topN) return blocos.map((b) => b.texto);

  // Calcula IDF por bloco no documento para valorizar termos raros e específicos
  const df = new Map();
  let somaLen = 0;
  for (const b of blocos) {
    const { termos } = extrairTokensTriagem(b.texto);
    somaLen += termos.length;
    for (const t of new Set(termos)) df.set(t, (df.get(t) || 0) + 1);
  }
  const N = blocos.length;
  const avgDl = Math.max(40, somaLen / N);
  const idfMap = new Map();
  for (const [t, freq] of df.entries()) {
    idfMap.set(t, Math.log(1 + (N - freq + 0.5) / (freq + 0.5)));
  }

  const avaliados = blocos.map((b) => ({
    idx: b.idx,
    texto: b.texto,
    score: pontuarBlocoLexical(fraseWord, b.texto, idfMap, avgDl),
  }));

  // Ordenação estrita determinística (maior escore primeiro, desempate por menor índice)
  avaliados.sort((a, b) => (b.score !== a.score ? b.score - a.score : a.idx - b.idx));

  const selecionados = [];
  const vistos = new Set();
  for (const item of avaliados) {
    if (selecionados.length >= topN) break;
    selecionados.push(item);
    vistos.add(item.idx);
  }
  // Garante presença do bloco inicial (título/abstract) quando ainda couber ou substituindo o último sem escore
  if (!vistos.has(0) && selecionados.length > 0) {
    if (selecionados.length < topN) {
      selecionados.push(avaliados.find((x) => x.idx === 0));
    } else if (selecionados[selecionados.length - 1].score <= 0) {
      selecionados[selecionados.length - 1] = avaliados.find((x) => x.idx === 0);
    }
  }
  return selecionados.filter(Boolean).sort((a, b) => a.idx - b.idx).map((x) => x.texto);
}

/**
 * Pre-warming Singleton da sessão ONNX na inicialização do app Electron.
 */
async function prewarmOnnx() {
  try {
    return await obterExtratorOnnx();
  } catch {
    return null;
  }
}

/**
 * Calcula a similaridade semântica densa bilíngue (PT <-> EN) entre a afirmação no Word e o artigo.
 * Percorre TODO o artigo via triagem léxica BM25 (blocos de 900 chars com overlap de 150) e aplica
 * o modelo ONNX INT8 nos Top-12 blocos candidatos, retornando a maior similaridade encontrada (0..1).
 */
async function calcularSimilaridadeSemanticaOnnx(fraseWord, textoArtigo, timeoutMs = 8000) {
  try {
    const tarefa = (async () => {
      const vFrase = await gerarVetorEmbedding(fraseWord);
      if (!vFrase) return null;
      const candidatos = selecionarTopCandidatosLexicos(fraseWord, textoArtigo, 12);
      if (!candidatos.length) return null;
      let melhorScore = 0;
      const scoresBloco = [];
      for (const janela of candidatos) {
        const vJanela = await gerarVetorEmbedding(janela);
        if (!vJanela) continue;
        const sim = produtoEscalarNormalizado(vFrase, vJanela);
        if (sim !== null) {
          scoresBloco.push({ janela, sim });
          if (sim > melhorScore) melhorScore = sim;
        }
      }
      // Refina nos melhores blocos candidatos comparando sentenças/sub-janelas para evitar diluição em parágrafos longos
      scoresBloco.sort((a, b) => b.sim - a.sim);
      for (const cand of scoresBloco.slice(0, 3)) {
        const sentencas = cand.janela
          .split(/(?<=[.!?])\s+/)
          .map((s) => s.trim())
          .filter((s) => s.length >= 25);
        for (const s of sentencas) {
          const vs = await gerarVetorEmbedding(s);
          if (!vs) continue;
          const simS = produtoEscalarNormalizado(vFrase, vs);
          if (simS !== null && simS > melhorScore) melhorScore = simS;
        }
      }
      return melhorScore;
    })();

    const timer = new Promise((resolve) => setTimeout(() => resolve(null), timeoutMs));
    return await Promise.race([tarefa, timer]);
  } catch {
    return null;
  }
}

/**
 * Localiza o melhor bloco candidato no artigo inteiro e sua posicao relativa (0..1)
 * para avaliacao simbolica aditiva (NegEx, divergencia numerica e apud).
 */
function localizarMelhorBlocoComPosicao(fraseWord, textoArtigo) {
  const blocos = fatiarBlocosComOverlap(textoArtigo, 900, 150);
  if (!blocos.length) return null;
  let melhor = blocos[0];
  let melhorScore = -1;
  for (const b of blocos) {
    const sc = pontuarBlocoLexical(fraseWord, b.texto);
    if (sc > melhorScore) {
      melhorScore = sc;
      melhor = b;
    }
  }
  const denom = Math.max(1, blocos.length - 1);
  return {
    texto: melhor.texto,
    idx: melhor.idx,
    totalBlocos: blocos.length,
    scoreLexical: melhorScore,
    posicaoRelativaNoTexto: blocos.length === 1 ? 0.5 : melhor.idx / denom,
  };
}

function detectarModeloNliLocal(cacheRoot = resolverPastaCacheModelos()) {
  if (!cacheRoot) return null;
  const dirNli = path.join(cacheRoot, CUSTOM_NLI_MODEL_ID);
  const quantizado = path.join(dirNli, 'onnx', 'model_quantized.onnx');
  const fp32 = path.join(dirNli, 'onnx', 'model.onnx');
  if (fs.existsSync(quantizado)) return { rootDir: cacheRoot, modelId: CUSTOM_NLI_MODEL_ID, dtype: 'q8' };
  if (fs.existsSync(fp32)) return { rootDir: cacheRoot, modelId: CUSTOM_NLI_MODEL_ID, dtype: 'fp32' };
  return null;
}

function localizarModeloNliNosCaminhos(raizesCustom = null) {
  if (process.env.BIBLIOGRAPHY_DISABLE_NLI === '1') return null;
  const raizes = Array.isArray(raizesCustom)
    ? raizesCustom
    : [
        ...(process.env.BIBLIOGRAPHY_NLI_DIR ? [path.dirname(process.env.BIBLIOGRAPHY_NLI_DIR)] : []),
        ...resolverRaizesBuscaModeloLocal(),
      ];
  for (const raiz of raizes) {
    const achado = detectarModeloNliLocal(raiz);
    if (achado) return achado;
  }
  return null;
}

/**
 * Carregador singleton pre-warmed do Cross-Encoder NLI (`custom-forensic-nli-int8`).
 * Opera com fallback silencioso (retorna null) caso a pasta opcional nao exista.
 */
async function obterClassificadorNli({ raizesBusca = null, ignorarSingleton = false } = {}) {
  const nliLocal = localizarModeloNliNosCaminhos(raizesBusca);
  if (!nliLocal) return null;

  if (!ignorarSingleton) {
    if (falhaCarregamentoNli) return null;
    if (classificadorNliPromise) return classificadorNliPromise;
  }

  const tarefa = (async () => {
    try {
      const transformers = await import('@huggingface/transformers');
      const cacheRoot = resolverPastaCacheModelos();
      if (transformers.env) {
        transformers.env.cacheDir = cacheRoot;
        transformers.env.localModelPath = nliLocal.rootDir;
        transformers.env.allowLocalModels = true;
      }
      const pipe = await transformers.pipeline('text-classification', nliLocal.modelId, {
        dtype: nliLocal.dtype,
        quantized: nliLocal.dtype === 'q8',
        local_files_only: true,
      });
      modeloNliAtivoId = nliLocal.modelId;
      return pipe;
    } catch {
      if (!ignorarSingleton) falhaCarregamentoNli = true;
      return null;
    }
  })();

  if (!ignorarSingleton) classificadorNliPromise = tarefa;
  return tarefa;
}

function prewarmNli() {
  return obterClassificadorNli().catch(() => null);
}

function extrairProbabilidadesNli(saidaBruta) {
  const lista = Array.isArray(saidaBruta)
    ? Array.isArray(saidaBruta[0])
      ? saidaBruta[0]
      : saidaBruta
    : saidaBruta && typeof saidaBruta === 'object'
    ? [saidaBruta]
    : [];

  const probs = { entailment: 0, neutral: 0, contradiction: 0 };
  for (const item of lista) {
    const lbl = String(item?.label || '').toLowerCase().trim();
    const sc = Number(item?.score || 0);
    if (!Number.isFinite(sc)) continue;
    if (lbl.includes('entail') || lbl === 'label_0') probs.entailment = Math.round(sc * 1e6) / 1e6;
    else if (lbl.includes('neutr') || lbl === 'label_1') probs.neutral = Math.round(sc * 1e6) / 1e6;
    else if (lbl.includes('contra') || lbl === 'label_2') probs.contradiction = Math.round(sc * 1e6) / 1e6;
  }
  return probs;
}

function classificarVereditoNli(probs) {
  if (probs.contradiction >= probs.entailment && probs.contradiction >= probs.neutral) return 'contradiction';
  if (probs.entailment >= probs.neutral && probs.entailment >= probs.contradiction) return 'entailment';
  return 'neutral';
}

/**
 * Seleciona os Top-3 blocos candidatos (ranqueados pelo Bi-Encoder quando disponivel,
 * com fallback deterministico para triagem lexica BM25).
 */
async function selecionarTop3BlocosParaNli(fraseWord, textoArtigo) {
  const candidatosLex = selecionarTopCandidatosLexicos(fraseWord, textoArtigo, 8);
  if (candidatosLex.length <= 3) return candidatosLex;
  const vFrase = await gerarVetorEmbedding(fraseWord);
  if (!vFrase) return candidatosLex.slice(0, 3);

  const pontuados = [];
  for (let i = 0; i < candidatosLex.length; i++) {
    const texto = candidatosLex[i];
    const vBloco = await gerarVetorEmbedding(texto);
    const sim = vBloco ? produtoEscalarNormalizado(vFrase, vBloco) : 0;
    pontuados.push({ texto, sim: sim || 0, idx: i });
  }
  pontuados.sort((a, b) => b.sim - a.sim || a.idx - b.idx);
  return pontuados.slice(0, 3).map((p) => p.texto);
}

/**
 * 2o estagio em cascata (Cross-Encoder NLI):
 * Recebe a frase do manuscrito (hypothesis) e os Top-3 blocos filtrados pelo Bi-Encoder (premises),
 * avalia cada par com `top_k: null` para obter `entailment`, `neutral` e `contradiction`
 * e retorna o veredito ordenado de forma deterministica.
 */
async function avaliarSustentacaoNliTop3(fraseManuscrito, top3BlocosCandidatos = [], opcoes = {}) {
  const hypothesis = String(fraseManuscrito || '').trim().slice(0, 900);
  const blocosLimpos = (Array.isArray(top3BlocosCandidatos) ? top3BlocosCandidatos : [])
    .slice(0, 3)
    .map((b, indice) => ({
      indice,
      texto: String(typeof b === 'string' ? b : b?.texto || '').trim().slice(0, 1200),
    }))
    .filter((b) => b.texto.length >= 15);

  const fallbackIndisponivel = {
    disponivel: false,
    modelo: null,
    veredito: 'indisponivel',
    contradicaoDetectada: false,
    maxEntailment: 0,
    maxContradiction: 0,
    melhorBloco: null,
    avaliacoes: [],
  };

  if (!hypothesis || hypothesis.length < 10 || blocosLimpos.length === 0) {
    return fallbackIndisponivel;
  }

  const pipe =
    typeof opcoes.classificadorCustom === 'function'
      ? opcoes.classificadorCustom
      : await obterClassificadorNli({
          raizesBusca: opcoes.raizesBusca || null,
          ignorarSingleton: Boolean(opcoes.raizesBusca),
        });

  if (!pipe) return fallbackIndisponivel;

  const avaliacoes = [];
  for (const bloco of blocosLimpos) {
    const chaveCache = `${bloco.texto}|||${hypothesis}`;
    let probs;
    if (!opcoes.classificadorCustom && cacheNliPares.has(chaveCache)) {
      probs = cacheNliPares.get(chaveCache);
    } else {
      try {
        // DeBERTa-v2 Cross-Encoder NLI em @huggingface/transformers v4: par premise [SEP] hypothesis
        const parEntrada = `${bloco.texto} [SEP] ${hypothesis}`;
        const out = await pipe(parEntrada, { top_k: null });
        probs = extrairProbabilidadesNli(out);
        if (!opcoes.classificadorCustom) {
          if (cacheNliPares.size > 2000) cacheNliPares.clear();
          cacheNliPares.set(chaveCache, probs);
        }
      } catch {
        continue;
      }
    }
    const vereditoBloco = classificarVereditoNli(probs);
    const forcaDecisao = Math.round(Math.max(probs.entailment, probs.contradiction) * 1e6) / 1e6;
    avaliacoes.push({
      indice: bloco.indice,
      texto: bloco.texto,
      veredito: vereditoBloco,
      forcaDecisao,
      probabilidades: probs,
    });
  }

  if (avaliacoes.length === 0) return fallbackIndisponivel;

  // Ordenacao deterministica: prioriza maior sinal decisorio (entailment ou contradiction),
  // desempatando por entailment decrescente, contradiction decrescente e indice original crescente.
  avaliacoes.sort(
    (a, b) =>
      b.forcaDecisao - a.forcaDecisao ||
      b.probabilidades.entailment - a.probabilidades.entailment ||
      b.probabilidades.contradiction - a.probabilidades.contradiction ||
      a.indice - b.indice
  );

  const melhorBloco = avaliacoes[0];
  const maxEntailment = Math.max(...avaliacoes.map((a) => a.probabilidades.entailment));
  const maxContradiction = Math.max(...avaliacoes.map((a) => a.probabilidades.contradiction));
  const limiarContradicao = typeof opcoes.limiarContradicao === 'number' ? opcoes.limiarContradicao : 0.72;
  const contradicaoDetectada = melhorBloco.probabilidades.contradiction >= limiarContradicao;

  return {
    disponivel: true,
    modelo: opcoes.classificadorCustom ? 'custom-mock-nli' : modeloNliAtivoId || CUSTOM_NLI_MODEL_ID,
    veredito: melhorBloco.veredito,
    contradicaoDetectada,
    maxEntailment,
    maxContradiction,
    melhorBloco,
    avaliacoes,
  };
}

module.exports = {
  obterExtratorOnnx,
  prewarmOnnx,
  calcularSimilaridadeSemanticaOnnx,
  fatiarBlocosComOverlap,
  pontuarBlocoLexical,
  selecionarTopCandidatosLexicos,
  localizarMelhorBlocoComPosicao,
  resolverPastaCacheModelos,
  detectarModeloLocalCustomizado,
  obterModeloAtivoId: () => modeloAtivoId,
  CUSTOM_NLI_MODEL_ID,
  detectarModeloNliLocal,
  localizarModeloNliNosCaminhos,
  obterClassificadorNli,
  prewarmNli,
  selecionarTop3BlocosParaNli,
  avaliarSustentacaoNliTop3,
};
