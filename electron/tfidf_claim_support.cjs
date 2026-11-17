/**
 * electron/tfidf_claim_support.cjs
 * 
 * Motor Algébrico Puro de TF-IDF e Similaridade por Cosseno para Suporte de Evidência (Claim-Support).
 * Inspirado nos princípios matemáticos do scikit-learn (TfidfVectorizer) e em sistemas
 * determinísticos de aferição de desvio semântico / pertinência temática de citações.
 * 
 * Funcionalidade:
 * 1. Vetorização vetorial de textos (Frase do autor no Word vs. Resumo/Abstract da obra citada);
 * 2. Filtragem de stopwords bilíngues (Português e Inglês) e radicais lexicais;
 * 3. Cálculo de Term Frequency (TF com escala sublinear: 1 + log(tf)) e Inverse Document Frequency (Smooth IDF);
 * 4. Cálculo da Similaridade por Cosseno entre os vetores de termos;
 * 5. Classificação do suporte de evidência:
 *    - Cosseno >= 0.25 : Forte alinhamento temático / sustentado lexicalmente
 *    - 0.12 <= Cosseno < 0.25 : Alinhamento moderado / periférico
 *    - Cosseno < 0.12 : Alerta de Desvio Temático (Thematic Drift) / Possível citação impertinente.
 */

'use strict';

/**
 * Stopwords expandidas (Português e Inglês) para isolar termos de conteúdo substantivo
 */
const STOPWORDS = new Set([
  // Português
  'a', 'o', 'as', 'os', 'um', 'uma', 'uns', 'umas', 'de', 'do', 'da', 'dos', 'das',
  'em', 'no', 'na', 'nos', 'nas', 'por', 'pelo', 'pela', 'pelos', 'pelas', 'para',
  'com', 'como', 'sem', 'sob', 'sobre', 'entre', 'ate', 'contra', 'desde', 'durante',
  'e', 'ou', 'mas', 'porem', 'contudo', 'todavia', 'entretanto', 'que', 'se', 'quando',
  'onde', 'porque', 'pois', 'portanto', 'assim', 'alem', 'embora', 'caso',
  'ele', 'ela', 'eles', 'elas', 'este', 'esta', 'estes', 'estas', 'esse', 'essa',
  'esses', 'essas', 'aquele', 'aquela', 'aqueles', 'aquelas', 'isso', 'isto', 'aquilo',
  'seu', 'sua', 'seus', 'suas', 'meu', 'minha', 'nosso', 'nossa',
  'ser', 'estar', 'haver', 'ter', 'fazer', 'ir', 'foi', 'foram', 'era', 'eram',
  'sao', 'e', 'esta', 'estao', 'sendo', 'tendo', 'havendo', 'qual', 'quais',
  'mesmo', 'mesma', 'proprio', 'propria', 'cada', 'todo', 'toda', 'todos', 'todas',
  'muito', 'muita', 'pouco', 'pouca', 'mais', 'menos', 'bem', 'mal', 'ja', 'ainda',
  'segundo', 'conforme', 'acordo', 'estudo', 'artigo', 'pesquisa', 'trabalho', 'autor',
  'autores', 'dados', 'resultado', 'resultados', 'atraves', 'meio', 'forma',
  
  // Inglês
  'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'by', 'from', 'up', 'about', 'into', 'over', 'after', 'beneath', 'under', 'above',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does',
  'did', 'can', 'could', 'shall', 'should', 'will', 'would', 'may', 'might', 'must',
  'it', 'its', 'they', 'them', 'their', 'theirs', 'he', 'him', 'his', 'she', 'her',
  'hers', 'we', 'us', 'our', 'ours', 'you', 'your', 'yours', 'that', 'which', 'who',
  'whom', 'this', 'these', 'those', 'there', 'where', 'when', 'why', 'how', 'all',
  'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'just', 'study',
  'paper', 'research', 'results', 'findings', 'author', 'authors', 'using', 'used'
]);

/**
 * Extrai o radical cognato de um termo acadêmico bilíngue (Português / Inglês)
 */
function extrairRadicalCognato(termo = '') {
  if (!termo || termo.length <= 3) return termo;
  let t = termo
    .toLowerCase()
    .replace(/^hyper/i, 'hiper')
    .replace(/ph/g, 'f')
    .replace(/th/g, 't')
    .replace(/y/g, 'i')
    .replace(/tion\b/g, 'cao')
    .replace(/cular\b/g, 'cul')
    .replace(/ment\b/g, 'mento');

  return t.length > 5 ? t.slice(0, 5) : t;
}

/**
 * Normaliza e tokeniza um texto removendo acentos e pontuação
 */
function tokenizarEFiltrar(texto = '') {
  if (!texto || typeof texto !== 'string') return [];

  const tokens = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !STOPWORDS.has(t))
    .map(extrairRadicalCognato);

  return tokens;
}

/**
 * Calcula a frequência de termos (TF) de um documento
 */
function calcularTf(tokens) {
  const contagem = new Map();
  for (const t of tokens) {
    contagem.set(t, (contagem.get(t) || 0) + 1);
  }

  const tf = new Map();
  for (const [termo, freq] of contagem.entries()) {
    // Escala sublinear de TF: 1 + ln(frequência)
    tf.set(termo, 1 + Math.log(freq));
  }
  return tf;
}

/**
 * Calcula a Similaridade por Cosseno exata entre duas sequências de texto
 * (ex: Frase do autor no Word vs. Resumo/Abstract da obra citada)
 */
function calcularSimilaridadeCossenoTfidf(textoA = '', textoB = '') {
  const tokensA = tokenizarEFiltrar(textoA);
  const tokensB = tokenizarEFiltrar(textoB);

  if (tokensA.length === 0 || tokensB.length === 0) {
    return {
      similaridade: 0,
      termosComuns: [],
      suporte: 'indeterminado',
      detalhes: 'Texto vazio ou sem termos substantivos suficientes para análise vetorial.'
    };
  }

  const tfA = calcularTf(tokensA);
  const tfB = calcularTf(tokensB);

  // Vocabulário conjunto dos dois textos
  const vocabulario = new Set([...tfA.keys(), ...tfB.keys()]);
  const nDocs = 2;

  // IDF Suave (Smooth IDF): ln((1 + N) / (1 + df)) + 1
  const idf = new Map();
  for (const termo of vocabulario) {
    let df = 0;
    if (tfA.has(termo)) df++;
    if (tfB.has(termo)) df++;
    idf.set(termo, Math.log((1 + nDocs) / (1 + df)) + 1);
  }

  // Montagem dos vetores ponderados TF-IDF e cálculo do Produto Escalar
  let produtoEscalar = 0;
  let normaAQuadrada = 0;
  let normaBQuadrada = 0;
  const termosComuns = [];

  for (const termo of vocabulario) {
    const valA = (tfA.get(termo) || 0) * idf.get(termo);
    const valB = (tfB.get(termo) || 0) * idf.get(termo);

    normaAQuadrada += valA * valA;
    normaBQuadrada += valB * valB;

    if (valA > 0 && valB > 0) {
      produtoEscalar += valA * valB;
      termosComuns.push(termo);
    }
  }

  const normaA = Math.sqrt(normaAQuadrada);
  const normaB = Math.sqrt(normaBQuadrada);

  const similaridade = (normaA > 0 && normaB > 0)
    ? Number((produtoEscalar / (normaA * normaB)).toFixed(4))
    : 0;

  let suporte = 'baixo';
  if (similaridade >= 0.22) {
    suporte = 'forte';
  } else if (similaridade >= 0.10) {
    suporte = 'moderado';
  } else {
    suporte = 'desvio_tematico';
  }

  return {
    similaridade,
    termosComuns,
    totalTermosComuns: termosComuns.length,
    suporte,
  };
}

/**
 * Audita o suporte de evidência (Claim-Support) para as citações do manuscrito que possuem resumo ou PDF
 */
function auditarClaimSupportDoManuscrito(refsMapeadas = []) {
  const alertasDesvioTematico = [];
  let totalAuditadas = 0;

  for (const r of refsMapeadas) {
    const abstractOuTexto = r.abstract || r.resumoArtigo || r.resumoOficial || '';
    if (!abstractOuTexto || abstractOuTexto.length < 50) continue;

    for (const oc of r.ocorrenciasNoTexto || []) {
      const fraseWord = oc.fraseContexto || '';
      if (fraseWord.length < 25) continue;

      totalAuditadas++;
      const analise = calcularSimilaridadeCossenoTfidf(fraseWord, abstractOuTexto);

      if (analise.suporte === 'desvio_tematico' && analise.similaridade < 0.08) {
        alertasDesvioTematico.push({
          tipo: 'desvio_tematico_citacao',
          refBibId: r.refBibId,
          autorCitado: `${r.primeiroSobrenome} (${r.ano})`,
          numParagrafo: oc.numParagrafo,
          numLinha: oc.numLinha,
          secao: oc.secao || 'Corpo',
          fraseWord,
          similaridadeCosseno: analise.similaridade,
          termosComuns: analise.termosComuns,
          mensagem: `⚠️ DESVIO TEMÁTICO DE CITAÇÃO (TF-IDF Cosseno = ${analise.similaridade}): A afirmação escrita no Word não apresenta correspondência lexical substantiva com o resumo oficial do artigo citado (${r.primeiroSobrenome}, ${r.ano}). Possível erro de atribuição de fonte ou ausência de suporte temático.`,
          sugestao: `Verifique se o estudo de ${r.primeiroSobrenome} (${r.ano}) realmente ampara essa afirmação ou se ela pertence a outra obra da sua bibliografia.`
        });
      }
    }
  }

  return {
    totalAuditadas,
    totalDesviosTematicos: alertasDesvioTematico.length,
    alertasDesvioTematico,
  };
}

module.exports = {
  STOPWORDS,
  tokenizarEFiltrar,
  calcularTf,
  calcularSimilaridadeCossenoTfidf,
  auditarClaimSupportDoManuscrito,
};
