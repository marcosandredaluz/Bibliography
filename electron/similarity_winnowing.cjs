/**
 * similarity_winnowing.cjs
 * 
 * Implementação formal do algoritmo Winnowing (Schleimer, Wilkerson & Aiken - MOSS, Stanford University).
 * 
 * Propósito:
 * Indexação e triagem de altíssima performance para detecção de similaridade de texto e código.
 * Com complexidade O(N) na indexação e O(1) médio por consulta de hash, garante matematicamente
 * que qualquer subsequência coincidente de tamanho >= t palavras compartilhará pelo menos uma
 * fingerprint digital (zero falsos negativos para sobreposições >= t).
 */

'use strict';

const MODULUS = 2147483647; // 2^31 - 1 (Mersenne prime)
const BASE = 31337;

/**
 * Função de hash 32-bit rápida de string para token individual (MurmurHash3 simplificado / FNV-1a).
 */
function hashString32(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0);
}

/**
 * Calcula os hashes de todos os k-gramas de uma sequência de palavras usando Rolling Hash (Rabin-Karp).
 * 
 * @param {string[]} palavras Array de palavras/tokens já normalizados
 * @param {number} k Tamanho do k-grama (padrão: 4 palavras)
 * @returns {number[]} Array com o hash de cada k-grama contíguo
 */
function calcularHashesKGramas(palavras, k = 4) {
  if (!Array.isArray(palavras) || palavras.length < k) {
    return [];
  }

  const n = palavras.length;
  const wordHashes = new Uint32Array(n);
  for (let i = 0; i < n; i++) {
    wordHashes[i] = hashString32(palavras[i]);
  }

  // Pré-calcula BASE^(k-1) % MODULUS
  let basePow = 1;
  for (let i = 0; i < k - 1; i++) {
    basePow = (basePow * BASE) % MODULUS;
  }

  const kgramCount = n - k + 1;
  const kgramHashes = new Array(kgramCount);

  // Calcula o primeiro k-grama
  let currentHash = 0;
  for (let i = 0; i < k; i++) {
    currentHash = (currentHash * BASE + wordHashes[i]) % MODULUS;
  }
  kgramHashes[0] = currentHash;

  // Rolling hash para os subsequentes em O(1) por passo
  for (let i = 1; i < kgramCount; i++) {
    const removeVal = (wordHashes[i - 1] * basePow) % MODULUS;
    currentHash = (currentHash - removeVal + MODULUS) % MODULUS;
    currentHash = (currentHash * BASE + wordHashes[i + k - 1]) % MODULUS;
    kgramHashes[i] = currentHash;
  }

  return kgramHashes;
}

/**
 * Executa a seleção por janela deslizante (Winnowing).
 * Seleciona o valor mínimo de hash em cada janela de tamanho w.
 * Em caso de empate, seleciona a ocorrência mais à direita para maximizar o avanço da janela.
 * 
 * @param {string[]} palavras Array de palavras normalizadas
 * @param {number} k Tamanho do shingle/k-grama (ex: 4)
 * @param {number} t Comprimento mínimo de garantia (ex: 7)
 * @returns {Array<{ hash: number, pos: number }>} Lista de fingerprints selecionadas
 */
function extrairFingerprintsWinnowing(palavras, k = 4, t = 7) {
  if (!Array.isArray(palavras) || palavras.length < k) {
    return [];
  }

  const w = Math.max(1, t - k + 1); // Tamanho da janela de amostragem
  const kgramHashes = calcularHashesKGramas(palavras, k);
  if (kgramHashes.length === 0) return [];

  const fingerprints = [];
  let minIdx = -1;

  for (let i = 0; i <= kgramHashes.length - w; i++) {
    let currentMin = Infinity;
    let currentMinIdx = -1;

    for (let j = 0; j < w; j++) {
      const idx = i + j;
      const h = kgramHashes[idx];
      // '<=' para preferir a ocorrência mais à direita em empates
      if (h <= currentMin) {
        currentMin = h;
        currentMinIdx = idx;
      }
    }

    if (currentMinIdx !== minIdx) {
      minIdx = currentMinIdx;
      fingerprints.push({
        hash: kgramHashes[minIdx],
        pos: minIdx,
      });
    }
  }

  // Se a sentença tiver menos que w k-gramas, mas tiver pelo menos 1 k-grama:
  if (fingerprints.length === 0 && kgramHashes.length > 0) {
    let minH = Infinity;
    let minP = -1;
    for (let i = 0; i < kgramHashes.length; i++) {
      if (kgramHashes[i] <= minH) {
        minH = kgramHashes[i];
        minP = i;
      }
    }
    fingerprints.push({ hash: minH, pos: minP });
  }

  return fingerprints;
}

/**
 * Classe de Índice Invertido baseada em Winnowing para triagem de alta performance de corpora de artigos.
 */
class IndiceWinnowing {
  constructor(k = 4, t = 7) {
    this.k = k;
    this.t = t;
    // Map: Hash (número) -> Array<{ docId: number|string, sentId: number, pos: number }>
    this.tabela = new Map();
    this.totalDocumentos = 0;
    this.totalSentencas = 0;
  }

  /**
   * Adiciona uma sentença normalizada ao índice.
   */
  indexarSentenca(docId, sentId, palavras) {
    if (!palavras || palavras.length < this.k) return;
    const fps = extrairFingerprintsWinnowing(palavras, this.k, this.t);
    for (let i = 0; i < fps.length; i++) {
      const { hash, pos } = fps[i];
      let lista = this.tabela.get(hash);
      if (!lista) {
        lista = [];
        this.tabela.set(hash, lista);
      }
      lista.push({ docId, sentId, pos });
    }
    this.totalSentencas++;
  }

  /**
   * Constrói o índice a partir do corpus otimizado de artigos.
   */
  static construirDoCorpus(corpusOtimizado, k = 4, t = 7) {
    const indice = new IndiceWinnowing(k, t);
    for (let d = 0; d < corpusOtimizado.length; d++) {
      const art = corpusOtimizado[d];
      if (!art.sentencas?.length) continue;
      indice.totalDocumentos++;
      for (let s = 0; s < art.sentencas.length; s++) {
        const sent = art.sentencas[s];
        const palavras = (sent.norm || '').split(/\s+/).filter((w) => w.length >= 2);
        indice.indexarSentenca(d, s, palavras);
      }
    }
    return indice;
  }

  /**
   * Consulta os candidatos no corpus que compartilham fingerprints com a frase sob análise.
   * Retorna um Map de matches agregados por docId e sentId.
   */
  consultarCandidatos(palavrasFrase) {
    if (!palavrasFrase) return new Map();
    const tokens = (Array.isArray(palavrasFrase) ? palavrasFrase : String(palavrasFrase).split(/\s+/))
      .filter((w) => w.length >= 2);
    if (tokens.length < this.k) return new Map();

    const fps = extrairFingerprintsWinnowing(tokens, this.k, this.t);
    // candidatos: "docId:sentId" -> { docId, sentId, matches: count }
    const candidatos = new Map();

    for (let i = 0; i < fps.length; i++) {
      const matchEntries = this.tabela.get(fps[i].hash);
      if (matchEntries) {
        for (let m = 0; m < matchEntries.length; m++) {
          const entry = matchEntries[m];
          const chave = `${entry.docId}:${entry.sentId}`;
          const atual = candidatos.get(chave);
          if (atual) {
            atual.matches++;
          } else {
            candidatos.set(chave, {
              docId: entry.docId,
              sentId: entry.sentId,
              matches: 1,
            });
          }
        }
      }
    }

    return candidatos;
  }
}

module.exports = {
  hashString32,
  calcularHashesKGramas,
  extrairFingerprintsWinnowing,
  IndiceWinnowing,
};
