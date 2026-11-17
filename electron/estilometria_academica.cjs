/**
 * electron/estilometria_academica.cjs
 * 
 * Módulo de Análise Estilométrica Determinística e Perfil Linguístico Acadêmico.
 * Inspirado em projetos de análise textual pura offline (irgifebry/plagiarism-checker,
 * NLTK text statistics e métricas de Burstiness linguístico).
 * 
 * Funcionalidades:
 * 1. Riqueza Lexical e Variabilidade de Vocabulário:
 *    - TTR (Type-Token Ratio): Razão vocábulos únicos / total de palavras.
 *    - Índice R de Guiraud: R = V / sqrt(N), invariante ao tamanho do texto.
 *    - Detecção de pobreza de vocabulário ou repetição cíclica.
 * 2. Dinâmica Rítmica Sintática (Sentence Burstiness):
 *    - Comprimento médio de sentença (palavras/frase) e desvio padrão.
 *    - Coeficiente de Variação Sintática (Burstiness = σ / μ).
 *    - Detecção de monotonia mecânica (marca registrada de spin-bots e IAs sem estilo humano).
 * 3. Diversidade e Repetição de N-Grams (3-grams):
 *    - Detecção de clichês repetidos e redundâncias frasais contíguas.
 * 4. Densidade Informacional / Lexical:
 *    - Razão entre palavras conceituais e palavras funcionais gramaticais.
 * 5. Índice de Legibilidade Acadêmica (Flesch Adaptado):
 *    - Avaliação do nível de complexidade sintática da redação científica.
 */

'use strict';

// Conjunto padrão de stopwords gramaticais em português (palavras funcionais)
const STOPWORDS_GRAMATICAIS = new Set([
  'a', 'as', 'o', 'os', 'um', 'uma', 'uns', 'umas',
  'de', 'da', 'do', 'das', 'dos', 'em', 'na', 'no', 'nas', 'nos',
  'por', 'pela', 'pelo', 'pelas', 'pelos', 'para', 'com', 'sem',
  'sob', 'sobre', 'entre', 'ante', 'ate', 'apos', 'desde',
  'e', 'ou', 'mas', 'porem', 'contudo', 'todavia', 'entretanto',
  'que', 'se', 'como', 'quando', 'onde', 'porque', 'pois',
  'este', 'esta', 'estes', 'estas', 'esse', 'essa', 'esses', 'essas',
  'aquele', 'aquela', 'aqueles', 'aquelas', 'isto', 'isso', 'aquilo',
  'seu', 'sua', 'seus', 'suas', 'meu', 'minha', 'nosso', 'nossa',
  'ele', 'ela', 'eles', 'elas', 'lhe', 'lhes', 'me', 'te', 'nos',
  'foi', 'foram', 'era', 'eram', 'e', 'sao', 'ser', 'sendo', 'sido',
  'ha', 'havia', 'ter', 'tem', 'tinha', 'tendo', 'tido',
  'ja', 'mais', 'menos', 'muito', 'pouco', 'tambem', 'nao', 'sim'
]);

/**
 * Conta sílabas aproximadas em português via regras fonéticas determinísticas.
 */
function contarSilabas(palavra) {
  const p = palavra.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (p.length <= 3) return 1;
  const m = p.match(/[aeiouy]{1,2}/g);
  return m ? Math.max(1, m.length) : 1;
}

/**
 * Calcula todas as métricas estilométricas de um trecho de texto.
 */
function calcularMetricasEstilometricas(texto) {
  if (!texto || typeof texto !== 'string') {
    return {
      totalPalavras: 0,
      vocabularioUnico: 0,
      ttr: 0,
      guiraud: 0,
      mediaComprimentoFrase: 0,
      desvioPadraoFrase: 0,
      burstiness: 0,
      densidadeLexical: 0,
      fleschLegibilidade: 0,
      trigramasRepetidos: [],
    };
  }

  // Tokenização de palavras
  const palavras = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/\b[a-z0-9'-]+\b/g) || [];

  const totalPalavras = palavras.length;
  if (totalPalavras === 0) {
    return {
      totalPalavras: 0,
      vocabularioUnico: 0,
      ttr: 0,
      guiraud: 0,
      mediaComprimentoFrase: 0,
      desvioPadraoFrase: 0,
      burstiness: 0,
      densidadeLexical: 0,
      fleschLegibilidade: 0,
      trigramasRepetidos: [],
    };
  }

  // 1. Riqueza Lexical
  const vocabUnicoSet = new Set(palavras);
  const vocabularioUnico = vocabUnicoSet.size;
  const ttr = Number((vocabularioUnico / totalPalavras).toFixed(3));
  const guiraud = Number((vocabularioUnico / Math.sqrt(totalPalavras)).toFixed(2));

  // 2. Comprimento e Variação Rítmica das Sentenças (Burstiness)
  const frases = texto
    .split(/[.!?]+/)
    .map((f) => f.trim())
    .filter((f) => f.length >= 8);

  const contagemFrases = frases.map(
    (f) => (f.match(/\b[a-zA-Z0-9à-úÀ-Ú'-]+\b/g) || []).length
  ).filter((c) => c > 0);

  const numFrases = contagemFrases.length || 1;
  const mediaComprimentoFrase = Number(
    (contagemFrases.reduce((a, b) => a + b, 0) / numFrases).toFixed(1)
  );

  const variancia = contagemFrases.reduce(
    (acc, c) => acc + Math.pow(c - mediaComprimentoFrase, 2),
    0
  ) / numFrases;
  const desvioPadraoFrase = Number(Math.sqrt(variancia).toFixed(1));
  const burstiness = mediaComprimentoFrase > 0
    ? Number((desvioPadraoFrase / mediaComprimentoFrase).toFixed(2))
    : 0;

  // 3. Densidade Lexical (Palavras de Conteúdo vs Gramaticais)
  const palavrasConteudo = palavras.filter((w) => !STOPWORDS_GRAMATICAIS.has(w));
  const densidadeLexical = Number(((palavrasConteudo.length / totalPalavras) * 100).toFixed(1));

  // 4. Índice de Legibilidade Flesch
  const totalSilabas = palavras.reduce((acc, w) => acc + contarSilabas(w), 0);
  const mediaSilabasPorPalavra = totalSilabas / totalPalavras;
  const flesch = Number(
    (248.835 - (1.015 * mediaComprimentoFrase) - (84.6 * mediaSilabasPorPalavra)).toFixed(1)
  );

  // 5. Diversidade de Trigramas (3-grams) e detecção de repetições mecânicas contíguas
  // Remove citações parentéticas autor-data antes de analisar trigramas para não gerar falso positivo por citar a mesma instituição/autor
  const textoSemCitacoes = texto.replace(/\([^)]*(?:\d{4}|s\.d\.|et\s+al\.?)[^)]*\)/gi, ' ');
  const palavrasSemCit = textoSemCitacoes
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .match(/\b[a-z0-9'-]+\b/g) || [];

  const trigramasContagem = new Map();
  const trigramasIndices = new Map();
  const trigramasRepetidos = [];
  for (let i = 0; i <= palavrasSemCit.length - 3; i++) {
    const w1 = palavrasSemCit[i];
    const w2 = palavrasSemCit[i + 1];
    const w3 = palavrasSemCit[i + 2];
    const tri = `${w1} ${w2} ${w3}`;

    // Ignora citações, anos, números e trigramas que começam/terminam em preposição/artigo fraco
    if (
      /\bet\s+al\b/i.test(tri) ||
      /\b\d+\b/.test(w1) ||
      /\b\d+\b/.test(w2) ||
      /\b\d+\b/.test(w3) ||
      STOPWORDS_GRAMATICAIS.has(w1) ||
      STOPWORDS_GRAMATICAIS.has(w3)
    ) {
      continue;
    }

    // Evita contar sobreposição imediata da mesma expressão (ex: "referencia e contrarreferencia" deslizando)
    const ultimoIdx = trigramasIndices.get(tri);
    if (ultimoIdx !== undefined && i - ultimoIdx < 4) {
      continue;
    }
    trigramasIndices.set(tri, i);

    const n = (trigramasContagem.get(tri) || 0) + 1;
    trigramasContagem.set(tri, n);
    if (n === 2) {
      // Verifica se já não é sobreposição direta de um trigrama repetido registrado logo antes
      const ehSobreposicaoAnterior = trigramasRepetidos.some((ant) => {
        const partsAnt = ant.split(' ');
        return (partsAnt[1] === w1 && partsAnt[2] === w2) || (partsAnt[0] === w2 && partsAnt[1] === w3);
      });
      if (!ehSobreposicaoAnterior) {
        trigramasRepetidos.push(tri);
      }
    }
  }

  return {
    totalPalavras,
    vocabularioUnico,
    ttr,
    guiraud,
    numFrases,
    mediaComprimentoFrase,
    desvioPadraoFrase,
    burstiness,
    densidadeLexical,
    fleschLegibilidade: flesch,
    trigramasRepetidos: trigramasRepetidos.slice(0, 5),
  };
}

/**
 * Audita os parágrafos do manuscrito e emite alertas estilométricos determinísticos.
 */
function auditarEstilometriaDoManuscrito(paragrafos = []) {
  const alertasEstilometricos = [];
  const metricasParagrafos = [];

  let somaTokens = 0;
  const conjuntoGlobalVocab = new Set();
  let somaBurstiness = 0;
  let somaFlesch = 0;
  let qtdValidos = 0;

  for (const p of paragrafos) {
    const texto = typeof p === 'string' ? p : p.texto || '';
    if (!texto || texto.trim().length < 80) continue;

    // Ignora elementos pré-textuais (Capa, Folha de Rosto, Ficha Catalográfica, Dedicatória)
    if (/\b(?:Trabalho\s+de\s+Conclus[ãa]o\s+de\s+Curso|Disserta[çc][ãa]o\s+apresentada|Tese\s+apresentada|requisito\s+obrigat[óo]rio\s+para\s+obten[çc][ãa]o|Projeto\s+de\s+Interven[çc][ãa]o|Ficha\s+catalogr[áa]fica|Orientador\s*:)\b/i.test(texto)) {
      continue;
    }

    const meta = typeof p === 'object' ? {
      numParagrafo: p.numParagrafo || 0,
      numLinha: p.numLinha || 0,
      secao: p.secao || 'Corpo do Texto',
      fraseWord: texto
    } : { fraseWord: texto };

    const m = calcularMetricasEstilometricas(texto);
    metricasParagrafos.push({ ...m, ...meta });

    somaTokens += m.totalPalavras;
    const palavrasLocais = texto.toLowerCase().match(/\b[a-zà-ú0-9'-]+\b/g) || [];
    palavrasLocais.forEach((w) => conjuntoGlobalVocab.add(w));
    somaBurstiness += m.burstiness;
    somaFlesch += m.fleschLegibilidade;
    qtdValidos++;

    // Alerta 1: Monotonia sintática extrema em parágrafo com 3+ frases (Sintoma de Spin-Bot ou IA mecânica)
    if (m.totalPalavras >= 35 && m.numFrases >= 3 && m.burstiness < 0.12) {
      alertasEstilometricos.push({
        tipo: 'monotonia_sintatica_estilometrica',
        numParagrafo: meta.numParagrafo,
        numLinha: meta.numLinha,
        secao: meta.secao,
        fraseWord: texto,
        mensagem: `⚠️ MONOTONIA SINTÁTICA EXTREMA (Burstiness = ${m.burstiness}): Todas as frases do parágrafo têm comprimentos quase idênticos (média ${m.mediaComprimentoFrase} palavras, desvio σ = ${m.desvioPadraoFrase}). Redação acadêmica humana apresenta variação rítmica entre orações simples e complexas.`,
        metricas: m,
      });
    }

    // Alerta 2: Pobreza lexical anômala em parágrafo (Guiraud < 3.5 em N >= 40)
    if (m.totalPalavras >= 40 && m.guiraud < 3.5) {
      alertasEstilometricos.push({
        tipo: 'pobreza_lexical_anomala',
        numParagrafo: meta.numParagrafo,
        numLinha: meta.numLinha,
        secao: meta.secao,
        fraseWord: texto,
        mensagem: `⚠️ VOCABULÁRIO RESTRITO (Índice de Guiraud = ${m.guiraud}): Riqueza vocabular muito abaixo do padrão científico (TTR = ${m.ttr}). Há alta repetição de termos no mesmo parágrafo.`,
        metricas: m,
      });
    }

    // Alerta 3: Repetição mecânica de trigramas no mesmo parágrafo
    if (m.trigramasRepetidos.length >= 2) {
      alertasEstilometricos.push({
        tipo: 'repeticao_trigramas_mecanica',
        numParagrafo: meta.numParagrafo,
        numLinha: meta.numLinha,
        secao: meta.secao,
        fraseWord: texto,
        mensagem: `📌 REDUNDÂNCIA FRASAL: Repetição idêntica de sequências de 3 palavras no mesmo parágrafo (ex: "${m.trigramasRepetidos.join('", "')}").`,
        metricas: m,
      });
    }
  }

  const mediaGlobalBurstiness = qtdValidos ? Number((somaBurstiness / qtdValidos).toFixed(2)) : 0;
  const mediaGlobalFlesch = qtdValidos ? Number((somaFlesch / qtdValidos).toFixed(1)) : 0;
  const ttrGlobal = somaTokens ? Number((conjuntoGlobalVocab.size / somaTokens).toFixed(3)) : 0;
  const guiraudGlobal = somaTokens ? Number((conjuntoGlobalVocab.size / Math.sqrt(somaTokens)).toFixed(2)) : 0;

  return {
    totalPalavrasAuditadas: somaTokens,
    vocabularioGlobalUnico: conjuntoGlobalVocab.size,
    ttrGlobal,
    guiraudGlobal,
    mediaGlobalBurstiness,
    mediaGlobalFlesch,
    paragrafosAnalisados: qtdValidos,
    totalAlertasEstilometricos: alertasEstilometricos.length,
    alertasEstilometricos,
  };
}

module.exports = {
  STOPWORDS_GRAMATICAIS,
  contarSilabas,
  calcularMetricasEstilometricas,
  auditarEstilometriaDoManuscrito,
};
