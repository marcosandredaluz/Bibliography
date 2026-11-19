'use strict';

/**
 * Guardiao Simbolico Forense (Aditivo - Nao altera escores base nem calibracao)
 * Atua apenas para detectar inversao de polaridade (NegEx), divergencia numerica
 * exata e citacao secundaria (apud oculto na Introducao).
 */

const NEGACAO_PT = [
  'nao houve', 'não houve', 'nao apresentou', 'não apresentou',
  'nao demonstrou', 'não demonstrou', 'nao encontrou', 'não encontrou',
  'nao observou', 'não observou', 'nao reduziu', 'não reduziu',
  'nao aumentou', 'não aumentou', 'nao melhorou', 'não melhorou',
  'nao diferiu', 'não diferiu', 'nao foi associad', 'não foi associad',
  'sem diferenca significativa', 'sem diferença significativa',
  'sem diferenca', 'sem diferença', 'sem associacao', 'sem associação',
  'sem impacto', 'sem efeito', 'ausencia de associacao', 'ausência de associação',
  'ausencia de diferenca', 'ausência de diferença', 'ausencia de efeito', 'ausência de efeito',
  'falhou em', 'nenhuma diferenca', 'nenhuma diferença',
  'nenhuma associacao', 'nenhuma associação', 'nenhum efeito', 'nenhum impacto',
  'efeito nulo', 'resultado nulo',
];

const NEGACAO_EN_FRASES = [
  'no significant', 'no statistically significant', 'no difference', 'no differences',
  'no association', 'no associations', 'no effect', 'no effects', 'no evidence',
  'no benefit', 'no impact', 'no reduction', 'no improvement', 'no correlation',
  'no change', 'failed to', 'did not show', 'did not find', 'did not observe',
  'did not reduce', 'did not increase', 'did not improve', 'did not differ',
  'was not associated', 'were not associated', 'not significantly',
  'null effect', 'null finding',
];

function normalizarSimples(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function parecePortugues(norm) {
  return / (?:que|para|com|dos|das|uma|uns|umas|aos|pelo|pela|pelos|pelas|entre|sobre|em|na|nas|nos|foi|foram|sao|esta|este) /.test(
    ` ${norm} `
  );
}

/**
 * 1. Detector de Polaridade (NegEx Simplificado Bilingue)
 * Retorna true se houver gatilho explicito de negacao clinica/estatistica.
 * Protege a preposicao portuguesa "no" ("no estudo", "no SUS") contra falso disparo como ingles "no".
 */
function detectarPolaridadeNegativa(trecho) {
  const normSemPont = normalizarSimples(trecho);
  if (!normSemPont) return false;
  const norm = ` ${normSemPont} `;

  for (const g of [...NEGACAO_PT, ...NEGACAO_EN_FRASES]) {
    const gNorm = ` ${normalizarSimples(g)} `;
    if (norm.includes(gNorm)) return true;
  }

  return false;
}

/**
 * 2. Extrator de Assinaturas Numericas Tipadas
 * Captura percentuais, N amostral e medidas OR/RR/HR para confronto exato.
 */
function extrairAssinaturasNumericas(trecho) {
  const txt = String(trecho || '');
  const assinaturas = [];

  const rePct = /(\d+(?:[.,]\d+)?)\s*%/g;
  let m;
  while ((m = rePct.exec(txt)) !== null) {
    assinaturas.push({ tipo: 'percentual', valor: parseFloat(m[1].replace(',', '.')), bruto: m[0] });
  }

  const reN = /\bn\s*=\s*(\d+(?:\.\d{3})*)\b/gi;
  while ((m = reN.exec(txt)) !== null) {
    assinaturas.push({ tipo: 'amostra_n', valor: parseInt(m[1].replace(/\./g, ''), 10), bruto: m[0] });
  }

  const reAssoc = /\b(OR|RR|HR)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\b/gi;
  while ((m = reAssoc.exec(txt)) !== null) {
    assinaturas.push({
      tipo: `medida_${m[1].toUpperCase()}`,
      valor: parseFloat(m[2].replace(',', '.')),
      bruto: m[0],
    });
  }

  return assinaturas;
}

/**
 * Compara assinaturas do manuscrito contra o bloco vencedor do PDF.
 * So acusa divergencia se AMBOS declararem a mesma metrica com valores diferentes.
 */
function verificarDivergenciaNumerica(fraseManuscrito, blocoPdf) {
  const numMs = extrairAssinaturasNumericas(fraseManuscrito);
  const numPdf = extrairAssinaturasNumericas(blocoPdf);
  if (numMs.length === 0 || numPdf.length === 0) return null;

  for (const aMs of numMs) {
    const mesmosTipos = numPdf.filter((aPdf) => aPdf.tipo === aMs.tipo);
    if (mesmosTipos.length > 0) {
      const bateu = mesmosTipos.some((aPdf) => Math.abs(aPdf.valor - aMs.valor) < 0.01);
      if (!bateu) {
        return {
          divergente: true,
          tipo: aMs.tipo,
          manuscrito: aMs.bruto,
          fonte: mesmosTipos.map((x) => x.bruto).join(', '),
        };
      }
    }
  }
  return null;
}

/**
 * 3. Classificador Heuristico de Secao IMRaD e Citacao Secundaria (Apud)
 */
function verificarApudOcultoNaIntroducao(blocoPdf, posicaoRelativaNoTexto) {
  if (posicaoRelativaNoTexto > 0.18) return false;
  const temCitacaoInterna = /\([A-Z][a-zA-Z-]+(?:\s+et\s+al\.?)?,?\s*\d{4}\)|\[\d{1,3}(?:,\s*\d{1,3})*\]/.test(
    String(blocoPdf || '')
  );
  return temCitacaoInterna;
}

/**
 * Funcao principal aditiva: avalia um pareamento ja aprovado pelo ONNX/BM25.
 */
function auditarPareamentoSimbolico({ fraseManuscrito, blocoPdf, posicaoRelativaNoTexto = 0.5 }) {
  const alertas = [];

  const negMs = detectarPolaridadeNegativa(fraseManuscrito);
  const negPdf = detectarPolaridadeNegativa(blocoPdf);
  if (negMs !== negPdf) {
    alertas.push({
      codigo: 'INVERSAO_POLARIDADE_NEGEX',
      severidade: 'alta',
      mensagem: negMs
        ? 'O manuscrito afirma negacao/ausencia de efeito, mas o trecho correspondente na fonte tem polaridade afirmativa.'
        : 'O manuscrito faz afirmacao positiva, mas o trecho correspondente na fonte contem termos de negacao ou ausencia de significancia.',
    });
  }

  const divNum = verificarDivergenciaNumerica(fraseManuscrito, blocoPdf);
  if (divNum) {
    alertas.push({
      codigo: 'DIVERGENCIA_NUMERICA_EXATA',
      severidade: 'alta',
      mensagem: `Divergencia factual (${divNum.tipo}): manuscrito informa "${divNum.manuscrito}", enquanto o trecho da fonte registra "${divNum.fonte}".`,
    });
  }

  if (verificarApudOcultoNaIntroducao(blocoPdf, posicaoRelativaNoTexto)) {
    alertas.push({
      codigo: 'POSSIVEL_APUD_INTRODUCAO',
      severidade: 'media',
      mensagem:
        'O dado foi localizado apenas na secao inicial (Introducao) do artigo citado acompanhado de outra referencia. Verifique se o dado pertence originalmente a terceiros (apud).',
    });
  }

  return alertas;
}

module.exports = {
  detectarPolaridadeNegativa,
  extrairAssinaturasNumericas,
  verificarDivergenciaNumerica,
  verificarApudOcultoNaIntroducao,
  auditarPareamentoSimbolico,
};
