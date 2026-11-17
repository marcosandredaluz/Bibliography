/**
 * electron/field_composite_scorer.cjs
 * 
 * Motor Híbrido de Pontuação Ponderada por Campo (Field-Wise Composite Scoring)
 * para Detecção Determinística de Citações Alucinadas ou Fabricadas.
 * 
 * Inspirado nas arquiteturas abertas do GitHub:
 * - atomgptlab/hallucination_detector
 * - Vikranth3140/Citation-Hallucination-Detection
 * - hadipourh/verifyref
 * - markrussinovich/refchecker
 * 
 * Fórmula de Pontuação Ponderada:
 * Score = 0.60 * S_titulo + 0.25 * S_autores + 0.15 * S_ano_periodico
 * 
 * Limiares Determinísticos:
 * - Score >= 0.85 : Citação Válida (Autêntica e Conforme)
 * - 0.60 <= Score < 0.85 : Citação Parcialmente Válida (Divergência tipográfica menor ou ano epub/print)
 * - Score < 0.60 : Provável Alucinação / Citação Fabricada por IA
 */

'use strict';

/**
 * Normaliza strings para comparação fonética e lexical sem acentos
 */
function normalizarTextoComparacao(str = '') {
  return String(str || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Distância de Levenshtein entre duas strings
 */
function calcularDistanciaLevenshtein(a = '', b = '') {
  const s1 = normalizarTextoComparacao(a);
  const s2 = normalizarTextoComparacao(b);
  if (!s1) return s2.length;
  if (!s2) return s1.length;

  const matriz = Array(s2.length + 1)
    .fill(null)
    .map(() => Array(s1.length + 1).fill(null));

  for (let i = 0; i <= s1.length; i++) matriz[0][i] = i;
  for (let j = 0; j <= s2.length; j++) matriz[j][0] = j;

  for (let j = 1; j <= s2.length; j++) {
    for (let i = 1; i <= s1.length; i++) {
      const custo = s1[i - 1] === s2[j - 1] ? 0 : 1;
      matriz[j][i] = Math.min(
        matriz[j][i - 1] + 1,      // deleção
        matriz[j - 1][i] + 1,      // inserção
        matriz[j - 1][i - 1] + custo // substituição
      );
    }
  }

  return matriz[s2.length][s1.length];
}

/**
 * Coeficiente de Similaridade de Jaccard sobre conjuntos de tokens
 */
function calcularSimilaridadeJaccardTokens(a = '', b = '') {
  const tokensA = new Set(normalizarTextoComparacao(a).split(' ').filter((t) => t.length >= 2));
  const tokensB = new Set(normalizarTextoComparacao(b).split(' ').filter((t) => t.length >= 2));

  if (tokensA.size === 0 && tokensB.size === 0) return 1.0;
  if (tokensA.size === 0 || tokensB.size === 0) return 0.0;

  let intersecao = 0;
  for (const t of tokensA) {
    if (tokensB.has(t)) intersecao++;
  }

  const uniao = new Set([...tokensA, ...tokensB]).size;
  return Number((intersecao / uniao).toFixed(4));
}

/**
 * Calcula a pontuação individual do Título (Peso 60%)
 */
function calcularScoreTitulo(tituloCitado = '', tituloOficial = '') {
  const t1 = normalizarTextoComparacao(tituloCitado);
  const t2 = normalizarTextoComparacao(tituloOficial);

  if (!t1 || !t2) return 0.0;
  if (t1 === t2) return 1.0;

  // Se um título contém o outro integralmente (ex: título com subtítulo cortado)
  if (t1.includes(t2) || t2.includes(t1)) {
    const razaoComprimento = Math.min(t1.length, t2.length) / Math.max(t1.length, t2.length);
    if (razaoComprimento >= 0.70) return 0.95;
    return 0.85;
  }

  const maxLen = Math.max(t1.length, t2.length);
  const dist = calcularDistanciaLevenshtein(t1, t2);
  const scoreLevenshtein = Math.max(0, 1 - dist / maxLen);
  const scoreJaccard = calcularSimilaridadeJaccardTokens(t1, t2);

  // Média harmônica/ponderada entre Levenshtein e Jaccard para tolerar inversões
  return Number((0.5 * scoreLevenshtein + 0.5 * scoreJaccard).toFixed(4));
}

/**
 * Calcula a pontuação individual dos Autores (Peso 25%)
 */
function calcularScoreAutores(autorCitado = '', autoresOficiais = []) {
  const autCitNorm = normalizarTextoComparacao(autorCitado);
  if (!autCitNorm) return 0.0;

  const listaOficiaisNorm = (Array.isArray(autoresOficiais) ? autoresOficiais : [autoresOficiais])
    .map(normalizarTextoComparacao)
    .filter(Boolean);

  if (listaOficiaisNorm.length === 0) return 0.5; // Dados de autores indisponíveis na base

  // 1. Verifica se o primeiro autor citado coincide exatamente com algum dos autores oficiais
  for (const aOfic of listaOficiaisNorm) {
    if (aOfic === autCitNorm || aOfic.includes(autCitNorm) || autCitNorm.includes(aOfic)) {
      return 1.0;
    }
  }

  // 2. Se não coincide exatamente, calcula proximidade de Levenshtein com o autor mais próximo
  let melhorScore = 0;
  for (const aOfic of listaOficiaisNorm) {
    const maxLen = Math.max(aOfic.length, autCitNorm.length);
    if (maxLen === 0) continue;
    const dist = calcularDistanciaLevenshtein(aOfic, autCitNorm);
    const score = Math.max(0, 1 - dist / maxLen);
    if (score > melhorScore) melhorScore = score;
  }

  // Se o autor mais próximo tiver similaridade < 0.75, penaliza fortemente (indicador de alucinação)
  return Number(melhorScore.toFixed(4));
}

/**
 * Calcula a pontuação do Ano e Periódico (Peso 15%)
 */
function calcularScoreAnoEPeriodico(anoCitado, anoOficial, periodicoCitado = '', periodicoOficial = '') {
  let scoreAno = 0.0;
  const aCit = parseInt(String(anoCitado).replace(/\D/g, ''), 10);
  const aOfic = parseInt(String(anoOficial).replace(/\D/g, ''), 10);

  if (aCit && aOfic) {
    const diff = Math.abs(aCit - aOfic);
    if (diff === 0) {
      scoreAno = 1.0;
    } else if (diff === 1) {
      // Tolera 1 ano de diferença entre epub ahead of print e publicação impressa
      scoreAno = 0.75;
    } else {
      scoreAno = 0.0;
    }
  } else {
    scoreAno = 0.5;
  }

  let scorePeriodico = 0.5;
  const pCit = normalizarTextoComparacao(periodicoCitado);
  const pOfic = normalizarTextoComparacao(periodicoOficial);

  if (pCit && pOfic) {
    if (pCit === pOfic || pCit.includes(pOfic) || pOfic.includes(pCit)) {
      scorePeriodico = 1.0;
    } else {
      scorePeriodico = calcularSimilaridadeJaccardTokens(pCit, pOfic);
    }
  }

  return Number((0.6 * scoreAno + 0.4 * scorePeriodico).toFixed(4));
}

/**
 * Avalia de forma híbrida e ponderada uma citação contra os metadados oficiais retornados
 * pela cadeia de recuperação (Crossref, OpenAlex, PubMed, Semantic Scholar).
 */
function calcularPontuacaoPonderadaCitacao({
  tituloCitado = '',
  autorCitado = '',
  anoCitado = '',
  periodicoCitado = '',
  doiCitado = '',
  tituloOficial = '',
  autoresOficiais = [],
  anoOficial = '',
  periodicoOficial = '',
  doiOficial = '',
  artigoRetratado = false,
  motivoRetratacao = '',
}) {
  const divergencias = [];

  // Se o artigo estiver formalmente retratado nas bases oficiais
  if (artigoRetratado) {
    return {
      scoreComposto: 0.0,
      classificacao: 'artigo_retratado',
      autenticidade: 'critica',
      pontuacoes: { titulo: 1.0, autores: 1.0, anoPeriodico: 1.0 },
      mensagem: `🚨 ARTIGO CIENTÍFICO RETRATADO (Retraction Watch / Crossref): A obra foi formalmente despublicada ou retirada pelo periódico. Motivo: ${motivoRetratacao || 'Má conduta, fraude ou erro metodológico crítico'}.`,
      divergencias: ['artigo_retratado_pelas_bases']
    };
  }

  // 1. Pontuações por componente
  const sTitulo = calcularScoreTitulo(tituloCitado, tituloOficial);
  const sAutores = calcularScoreAutores(autorCitado, autoresOficiais);
  const sAnoPeriodico = calcularScoreAnoEPeriodico(anoCitado, anoOficial, periodicoCitado, periodicoOficial);

  // 2. Pontuação Ponderada Composta
  const scoreComposto = Number((0.60 * sTitulo + 0.25 * sAutores + 0.15 * sAnoPeriodico).toFixed(4));

  // 3. Mapeamento de desvios específicos (markrussinovich/refchecker)
  if (sTitulo < 0.65) {
    divergencias.push({
      campo: 'titulo',
      tipo: 'divergencia_titulo',
      mensagem: `Título citado diverge substantivamente do registro oficial (similaridade ${Math.round(sTitulo * 100)}%).`
    });
  }

  if (sAutores < 0.65) {
    divergencias.push({
      campo: 'autores',
      tipo: 'divergencia_autores',
      mensagem: `O primeiro autor citado ("${autorCitado}") não foi localizado entre os autores oficiais do registro (${(autoresOficiais || []).slice(0, 3).join(', ')}).`
    });
  }

  const aCit = parseInt(String(anoCitado).replace(/\D/g, ''), 10);
  const aOfic = parseInt(String(anoOficial).replace(/\D/g, ''), 10);
  if (aCit && aOfic && Math.abs(aCit - aOfic) >= 2) {
    divergencias.push({
      campo: 'ano',
      tipo: 'divergencia_ano',
      mensagem: `Ano citado (${aCit}) difere do ano oficial registrado (${aOfic}).`
    });
  }

  // 4. Classificação determinística
  let classificacao = 'autentica';
  let mensagem = 'Citação autêntica confirmada pelos registros oficiais.';

  if (scoreComposto >= 0.85) {
    classificacao = 'autentica';
    mensagem = `✓ Citação Conforme: Validação multivariada confirmada com score ${Math.round(scoreComposto * 100)}%.`;
  } else if (scoreComposto >= 0.60) {
    classificacao = 'parcialmente_valida';
    mensagem = `⚠️ Citação Parcialmente Válida (Score ${Math.round(scoreComposto * 100)}%): Existem divergências menores de título, ano ou grafia em relação ao registro oficial.`;
  } else {
    classificacao = 'suspeita_alucinacao';
    mensagem = `❌ PROVÁVEL ALUCINAÇÃO / CITAÇÃO FABRICADA (Score ${Math.round(scoreComposto * 100)}%): Os metadados citados divergem criticamente da obra indexada sob este DOI/registro oficial (Vikranth3140 / atomgptlab).`;
  }

  return {
    scoreComposto,
    classificacao,
    pontuacoes: {
      titulo: sTitulo,
      autores: sAutores,
      anoPeriodico: sAnoPeriodico,
    },
    divergencias,
    mensagem,
  };
}

module.exports = {
  normalizarTextoComparacao,
  calcularDistanciaLevenshtein,
  calcularSimilaridadeJaccardTokens,
  calcularScoreTitulo,
  calcularScoreAutores,
  calcularScoreAnoEPeriodico,
  calcularPontuacaoPonderadaCitacao,
};
