/**
 * electron/bm25_scorer.cjs
 * 
 * Implementação Determinística do Algoritmo Okapi BM25 para Recuperação de Informação e Claim-Support.
 * Inspirado na arquitetura do 'rank_bm25' (Python), operando nativamente em Node.js sem dependências externas.
 * 
 * Parâmetros Canônicos:
 * - k1 = 1.5 : Saturação de frequência de termos (evita que termos repetidos inflem desproporcionalmente a pontuação)
 * - b = 0.75 : Normalização pelo comprimento do documento (penaliza documentos excessivamente longos)
 * 
 * Fórmula:
 * Score(D, Q) = SUM_{q in Q} [ IDF(q) * (f(q, D) * (k1 + 1)) / (f(q, D) + k1 * (1 - b + b * (|D| / avgdl))) ]
 */

'use strict';

const { STOPWORDS, tokenizarEFiltrar } = require('./tfidf_claim_support.cjs');

const K1_PADRAO = 1.5;
const B_PADRAO = 0.75;

/**
 * Classe do Motor BM25 para indexação e pontuação de passagens e resumos
 */
class MotorOkapiBM25 {
  constructor(documentos = [], k1 = K1_PADRAO, b = B_PADRAO) {
    this.k1 = k1;
    this.b = b;
    this.tamanhoDocs = [];
    this.totalDocs = 0;
    this.avgdl = 0;
    this.frequenciaDocs = new Map(); // df: em quantos documentos cada termo aparece
    this.termFreqsPorDoc = [];

    if (documentos.length > 0) {
      this.indexarDocumentos(documentos);
    }
  }

  indexarDocumentos(documentos) {
    this.totalDocs = documentos.length;
    let somaTamanhos = 0;
    this.tamanhoDocs = [];
    this.termFreqsPorDoc = [];
    this.frequenciaDocs.clear();

    for (const doc of documentos) {
      const tokens = typeof doc === 'string' ? tokenizarEFiltrar(doc) : (Array.isArray(doc) ? doc : []);
      const len = tokens.length;
      this.tamanhoDocs.push(len);
      somaTamanhos += len;

      const tfMap = new Map();
      const termosVistos = new Set();

      for (const t of tokens) {
        tfMap.set(t, (tfMap.get(t) || 0) + 1);
        if (!termosVistos.has(t)) {
          termosVistos.add(t);
          this.frequenciaDocs.set(t, (this.frequenciaDocs.get(t) || 0) + 1);
        }
      }

      this.termFreqsPorDoc.push(tfMap);
    }

    this.avgdl = this.totalDocs > 0 ? somaTamanhos / this.totalDocs : 1;
  }

  /**
   * Calcula o IDF suave Robertson-Spärck Jones para um termo
   */
  calcularIdf(termo) {
    const df = this.frequenciaDocs.get(termo) || 0;
    const n = this.totalDocs;
    // IDF BM25 clássico com proteção anti-negativa: ln( (N - df + 0.5) / (df + 0.5) + 1 )
    return Math.log((n - df + 0.5) / (df + 0.5) + 1);
  }

  /**
   * Calcula a pontuação BM25 entre uma consulta (afirmação do autor) e um documento indexado
   */
  pontuarDocumento(indiceDoc, consulta) {
    if (indiceDoc < 0 || indiceDoc >= this.totalDocs) return 0;

    const tokensConsulta = typeof consulta === 'string' ? tokenizarEFiltrar(consulta) : consulta;
    const tfDoc = this.termFreqsPorDoc[indiceDoc];
    const docLen = this.tamanhoDocs[indiceDoc];
    const denomNorm = 1 - this.b + this.b * (docLen / (this.avgdl || 1));

    let score = 0;
    for (const q of tokensConsulta) {
      if (!tfDoc.has(q)) continue;
      const freq = tfDoc.get(q);
      const idf = this.calcularIdf(q);
      const numerador = freq * (this.k1 + 1);
      const denominador = freq + this.k1 * denomNorm;

      score += idf * (numerador / denominador);
    }

    return Number(score.toFixed(4));
  }

  /**
   * Pontuação direta de par (Afirmação vs. Abstract/Resumo)
   */
  static pontuarParDireto(afirmacao = '', abstract = '', k1 = K1_PADRAO, b = B_PADRAO) {
    const tokensAfirmacao = tokenizarEFiltrar(afirmacao);
    const tokensAbstract = tokenizarEFiltrar(abstract);

    if (tokensAfirmacao.length === 0 || tokensAbstract.length === 0) {
      return { scoreBM25: 0, termosComuns: [], status: 'indeterminado' };
    }

    // Cria corpus local de 2 documentos para contraste de IDF
    const motor = new MotorOkapiBM25([tokensAbstract, tokensAfirmacao], k1, b);
    const score = motor.pontuarDocumento(0, tokensAfirmacao);

    const termosComuns = [];
    const setAbs = new Set(tokensAbstract);
    for (const t of tokensAfirmacao) {
      if (setAbs.has(t) && !termosComuns.includes(t)) {
        termosComuns.push(t);
      }
    }

    let status = 'baixo';
    if (score >= 2.0 && termosComuns.length >= 2) {
      status = 'forte';
    } else if (score >= 0.8 || termosComuns.length >= 1) {
      status = 'moderado';
    } else {
      status = 'desvio_tematico';
    }

    return {
      scoreBM25: score,
      termosComuns,
      totalTermosComuns: termosComuns.length,
      status,
    };
  }
}

/**
 * Função utilitária direta para cálculo de BM25 entre afirmação e resumo
 */
function calcularSimilaridadeBM25(afirmacao, abstract, k1 = K1_PADRAO, b = B_PADRAO) {
  return MotorOkapiBM25.pontuarParDireto(afirmacao, abstract, k1, b);
}

module.exports = {
  MotorOkapiBM25,
  calcularSimilaridadeBM25,
  K1_PADRAO,
  B_PADRAO,
};
