/**
 * electron/statcheck_forense.cjs
 * 
 * Módulo de Auditoria Matemática e Forense de Resultados Estatísticos.
 * Inspirado no projeto 'statcheck' (Michele Nuijten et al.) e diretrizes APA / ICMJE.
 * 
 * Funcionalidades:
 * 1. Extração por regex avançado de testes estatísticos no texto e tabelas:
 *    - Distribuição t de Student: t(df) = valor, p = valor
 *    - Distribuição F de Snedecor: F(df1, df2) = valor, p = valor
 *    - Distribuição Qui-quadrado de Pearson: χ²(df) = valor, p = valor
 *    - Estatística Z (normal padrão): z = valor, p = valor
 *    - Coeficiente de correlação r de Pearson: r(df) = valor, p = valor
 * 2. Recálculo probabilístico exato sem dependências externas via aproximações
 *    analíticas de alta precisão (Incomplete Beta, Incomplete Gamma, Lanczos lnGamma e Erf).
 * 3. Classificação forense de integridade:
 *    - 'consistente': Matemática reportada confere com a distribuição teórica.
 *    - 'inconsistencia_estatistica': Divergência numérica (> 0.015) decorrente de arredondamento excessivo ou erro tipográfico.
 *    - 'inconsistencia_grave_decisao': Erro crítico de decisão (ex: relatou p < .05 mas o recálculo dá p >= .05, evidência clássica de p-hacking / falsificação estatística).
 *    - 'p_valor_impossivel': p > 1 ou p < 0.
 */

'use strict';

// -----------------------------------------------------------------------------
// FUNÇÕES MATEMÁTICAS E DE DISTRIBUIÇÃO PROBABILÍSTICA
// -----------------------------------------------------------------------------

/**
 * Logaritmo da função Gamma ln(Γ(z)) via aproximação de Lanczos (g=7, 9 coeficientes).
 * Precisão típica > 10^-12.
 */
function lnGamma(z) {
  const g = 7;
  const C = [
    0.99999999999980993,
    676.5203681218851,
    -1259.1392167224028,
    771.32342877765313,
    -176.61502916214059,
    12.507343278686905,
    -0.138571095836524,
    9.9843695780195716e-6,
    1.5056327351493116e-7
  ];
  if (z < 0.5) {
    return Math.log(Math.PI / Math.sin(Math.PI * z)) - lnGamma(1 - z);
  }
  z -= 1;
  let base = C[0];
  for (let i = 1; i < g + 2; i++) {
    base += C[i] / (z + i);
  }
  const t = z + g + 0.5;
  return 0.5 * Math.log(2 * Math.PI) + (z + 0.5) * Math.log(t) - t + Math.log(base);
}

/**
 * Função Beta Incompleta Regularizada I_x(a, b) via Frações Contínuas de Lentz.
 */
function betaInc(x, a, b) {
  if (x < 0 || x > 1) return NaN;
  if (x === 0) return 0;
  if (x === 1) return 1;
  // Simetria para garantir convergência rápida
  if (x > (a + 1) / (a + b + 2)) {
    return 1 - betaInc(1 - x, b, a);
  }
  const factor = Math.exp(a * Math.log(x) + b * Math.log(1 - x) - lnGamma(a) - lnGamma(b) + lnGamma(a + b)) / a;
  const maxIter = 300;
  const eps = 1e-15;
  let c = 1;
  let d = 1 - (a + b) * x / (a + 1);
  if (Math.abs(d) < eps) d = eps;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= maxIter; m++) {
    // Passo par
    let num = m * (b - m) * x / ((a + 2 * m - 1) * (a + 2 * m));
    d = 1 + num * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + num / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    h *= d * c;

    // Passo ímpar
    num = -(a + m) * (a + b + m) * x / ((a + 2 * m) * (a + 2 * m + 1));
    d = 1 + num * d;
    if (Math.abs(d) < eps) d = eps;
    c = 1 + num / c;
    if (Math.abs(c) < eps) c = eps;
    d = 1 / d;
    const delta = d * c;
    h *= delta;
    if (Math.abs(delta - 1) < eps) break;
  }
  return Math.min(1, Math.max(0, factor * h));
}

/**
 * Função Gamma Incompleta Superior Q(a, x) = 1 - P(a, x).
 */
function gammaIncQ(a, x) {
  if (x <= 0) return 1;
  if (x < a + 1) {
    // Série para P(a, x) e depois 1 - P
    let sum = 1 / a;
    let term = 1 / a;
    for (let n = 1; n < 300; n++) {
      term *= x / (a + n);
      sum += term;
      if (Math.abs(term) < Math.abs(sum) * 1e-15) break;
    }
    const p = Math.exp(a * Math.log(x) - x - lnGamma(a)) * sum;
    return Math.max(0, Math.min(1, 1 - p));
  } else {
    // Fração contínua para Q(a, x)
    const eps = 1e-15;
    let b = x + 1 - a;
    let c = 1 / 1e-30;
    let d = 1 / b;
    let h = d;
    for (let i = 1; i <= 300; i++) {
      const an = -i * (i - a);
      b += 2;
      d = an * d + b;
      if (Math.abs(d) < eps) d = eps;
      c = b + an / c;
      if (Math.abs(c) < eps) c = eps;
      d = 1 / d;
      const del = d * c;
      h *= del;
      if (Math.abs(del - 1) < eps) break;
    }
    return Math.max(0, Math.min(1, Math.exp(a * Math.log(x) - x - lnGamma(a)) * h));
  }
}

/**
 * Função erro de Gauss (erf) com aproximação de Abramowitz & Stegun.
 */
function erf(x) {
  const sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * x);
  const y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
}

// -----------------------------------------------------------------------------
// RECÁLCULO DE VALOR-P PARA CADA TESTE ESTATÍSTICO
// -----------------------------------------------------------------------------

/** Recalcula p-valor bicaudal para estatística Z (Normal Padrão) */
function pValorZ(z) {
  return Math.max(0, Math.min(1, 1 - erf(Math.abs(z) / Math.SQRT2)));
}

/** Recalcula p-valor bicaudal para distribuição t de Student */
function pValorT(t, df) {
  if (df <= 0) return NaN;
  const x = df / (df + t * t);
  return Math.max(0, Math.min(1, betaInc(x, df / 2, 0.5)));
}

/** Recalcula p-valor monocaudal (cauda superior) para distribuição F de Snedecor */
function pValorF(f, df1, df2) {
  if (df1 <= 0 || df2 <= 0 || f < 0) return NaN;
  const x = df2 / (df2 + df1 * f);
  return Math.max(0, Math.min(1, betaInc(x, df2 / 2, df1 / 2)));
}

/** Recalcula p-valor monocaudal (cauda superior) para Qui-quadrado χ² */
function pValorChi2(chi2, df) {
  if (df <= 0 || chi2 < 0) return NaN;
  return Math.max(0, Math.min(1, gammaIncQ(df / 2, chi2 / 2)));
}

/** Recalcula p-valor bicaudal para correlação r de Pearson */
function pValorR(r, df) {
  if (df <= 0 || Math.abs(r) >= 1) return Math.abs(r) >= 1 ? 0 : NaN;
  const t = r * Math.sqrt(df) / Math.sqrt(1 - r * r);
  return pValorT(t, df);
}

// -----------------------------------------------------------------------------
// EXTRAÇÃO FORENSE DE TESTES ESTATÍSTICOS NO TEXTO
// -----------------------------------------------------------------------------

function normalizarNumero(str) {
  if (!str) return NaN;
  let s = str.trim().replace(',', '.');
  if (s.startsWith('.')) s = '0' + s;
  else if (s.startsWith('-.')) s = '-0' + s.slice(1);
  else if (s.startsWith('+.')) s = '0' + s.slice(1);
  return parseFloat(s);
}

/**
 * Extrai todos os testes estatísticos relatados em uma string de texto.
 */
function extrairTestesEstatisticos(texto, meta = {}) {
  const testes = [];
  if (!texto || typeof texto !== 'string') return testes;

  // Regex para operadores relacionais de p: =, <, >, <=, >=, ≤, ≥
  const opRel = '(?:[=<>≤≥]|<=|>=)';
  const numVal = '[+-]?(?:\\d+(?:[.,]\\d+)?|[.,]\\d+)';
  const numP = '(?:0?[.,]\\d+|1(?:[.,]0+)?|0)';

  // 1. Teste t de Student: t(df) = val, p [op] val ou t[df] = val
  const reT = new RegExp(
    `\\bt\\s*[\\(\\[]\\s*(\\d+(?:[.,]\\d+)?)\\s*[\\)\\]]\\s*=\\s*(${numVal})\\s*[,;]\\s*p\\s*(${opRel})\\s*(${numP})`,
    'gi'
  );
  let m;
  while ((m = reT.exec(texto)) !== null) {
    testes.push({
      tipo: 't',
      nomeLegivel: 'Teste t de Student',
      df1: normalizarNumero(m[1]),
      df2: null,
      estatisticaValor: normalizarNumero(m[2]),
      operadorP: m[3] === '<=' ? '≤' : m[3] === '>=' ? '≥' : m[3],
      pRelatado: normalizarNumero(m[4]),
      textoBruto: m[0],
      indice: m.index,
      ...meta,
    });
  }

  // 2. Teste F de ANOVA/Regressão: F(df1, df2) = val, p [op] val
  const reF = new RegExp(
    `\\bF\\s*[\\(\\[]\\s*(\\d+(?:[.,]\\d+)?)\\s*[,;]\\s*(\\d+(?:[.,]\\d+)?)\\s*[\\)\\]]\\s*=\\s*(${numVal})\\s*[,;]\\s*p\\s*(${opRel})\\s*(${numP})`,
    'gi'
  );
  while ((m = reF.exec(texto)) !== null) {
    testes.push({
      tipo: 'F',
      nomeLegivel: 'Teste F (ANOVA / Regressão)',
      df1: normalizarNumero(m[1]),
      df2: normalizarNumero(m[2]),
      estatisticaValor: normalizarNumero(m[3]),
      operadorP: m[4] === '<=' ? '≤' : m[4] === '>=' ? '≥' : m[4],
      pRelatado: normalizarNumero(m[5]),
      textoBruto: m[0],
      indice: m.index,
      ...meta,
    });
  }

  // 3. Teste Qui-quadrado: χ²(df), X²(df), qui-quadrado(df) = val, p [op] val
  const reChi = new RegExp(
    `(?:[χX]\\s*(?:2|²)|qui-quadrado|chi-quadrado)\\s*(?:[\\(\\[]\\s*(?:df\\s*=\\s*)?(\\d+(?:[.,]\\d+)?)(?:\\s*[,;]\\s*N\\s*=\\s*\\d+)?\\s*[\\)\\]])?\\s*=\\s*(${numVal})\\s*[,;]\\s*p\\s*(${opRel})\\s*(${numP})`,
    'gi'
  );
  while ((m = reChi.exec(texto)) !== null) {
    testes.push({
      tipo: 'chi2',
      nomeLegivel: 'Teste Qui-quadrado de Pearson (χ²)',
      df1: m[1] ? normalizarNumero(m[1]) : 1, // default df=1 se omitido
      df2: null,
      estatisticaValor: normalizarNumero(m[2]),
      operadorP: m[3] === '<=' ? '≤' : m[3] === '>=' ? '≥' : m[3],
      pRelatado: normalizarNumero(m[4]),
      textoBruto: m[0],
      indice: m.index,
      ...meta,
    });
  }

  // 4. Teste Z (Normal Padrão): z = val, p [op] val ou Z = val
  const reZ = new RegExp(
    `\\b[zZ]\\s*=\\s*(${numVal})\\s*[,;]\\s*p\\s*(${opRel})\\s*(${numP})`,
    'gi'
  );
  while ((m = reZ.exec(texto)) !== null) {
    testes.push({
      tipo: 'z',
      nomeLegivel: 'Estatística Z (Normal Padrão)',
      df1: null,
      df2: null,
      estatisticaValor: normalizarNumero(m[1]),
      operadorP: m[2] === '<=' ? '≤' : m[2] === '>=' ? '≥' : m[2],
      pRelatado: normalizarNumero(m[3]),
      textoBruto: m[0],
      indice: m.index,
      ...meta,
    });
  }

  // 5. Coeficiente de Correlação r de Pearson: r(df) = val, p [op] val
  const reR = new RegExp(
    `\\br\\s*[\\(\\[]\\s*(\\d+(?:[.,]\\d+)?)\\s*[\\)\\]]\\s*=\\s*(${numVal})\\s*[,;]\\s*p\\s*(${opRel})\\s*(${numP})`,
    'gi'
  );
  while ((m = reR.exec(texto)) !== null) {
    testes.push({
      tipo: 'r',
      nomeLegivel: 'Correlação de Pearson (r)',
      df1: normalizarNumero(m[1]),
      df2: null,
      estatisticaValor: normalizarNumero(m[2]),
      operadorP: m[3] === '<=' ? '≤' : m[3] === '>=' ? '≥' : m[3],
      pRelatado: normalizarNumero(m[4]),
      textoBruto: m[0],
      indice: m.index,
      ...meta,
    });
  }

  return testes;
}

// -----------------------------------------------------------------------------
// AUDITORIA E CLASSIFICAÇÃO FORENSE DE CONSISTÊNCIA
// -----------------------------------------------------------------------------

/**
 * Avalia um teste estatístico individual comparando o p-valor relatado com o recalculado.
 */
function auditarTesteEstatistico(teste) {
  let pRecalculado = NaN;

  switch (teste.tipo) {
    case 't':
      pRecalculado = pValorT(teste.estatisticaValor, teste.df1);
      break;
    case 'F':
      pRecalculado = pValorF(teste.estatisticaValor, teste.df1, teste.df2);
      break;
    case 'chi2':
      pRecalculado = pValorChi2(teste.estatisticaValor, teste.df1);
      break;
    case 'z':
      pRecalculado = pValorZ(teste.estatisticaValor);
      break;
    case 'r':
      pRecalculado = pValorR(teste.estatisticaValor, teste.df1);
      break;
  }

  if (isNaN(pRecalculado)) {
    return {
      ...teste,
      pRecalculado: null,
      status: 'grau_liberdade_invalido',
      mensagem: `Graus de liberdade ou valor do teste inválidos em "${teste.textoBruto}".`,
    };
  }

  if (teste.pRelatado < 0 || teste.pRelatado > 1) {
    return {
      ...teste,
      pRecalculado,
      status: 'p_valor_impossivel',
      mensagem: `Valor-p relatado (${teste.pRelatado}) é probabilisticamente impossível (fora do intervalo [0, 1]).`,
    };
  }

  const alpha = 0.05;
  const op = teste.operadorP;
  const pRel = teste.pRelatado;
  const pRec = pRecalculado;

  // Determina se o autor alegou significância estatística
  let alegouSignificativo = false;
  if (op === '<' || op === '≤') {
    alegouSignificativo = pRel <= alpha;
  } else if (op === '>' || op === '≥') {
    alegouSignificativo = false;
  } else {
    // op === '='
    alegouSignificativo = pRel < alpha;
  }

  const ehRealmenteSignificativo = pRec < alpha;

  // Erro crítico de decisão (Decision Error - Nuijten et al.)
  if (alegouSignificativo !== ehRealmenteSignificativo) {
    const detalhe = alegouSignificativo
      ? `O autor reportou significância estatística (${teste.textoBruto}), mas a matemática real indica p = ${pRec.toFixed(4)} (NÃO significativo a α = 0.05). Forte indício de erro de cálculo ou p-hacking!`
      : `O autor reportou resultado não significativo (${teste.textoBruto}), mas o recálculo exato indica p = ${pRec.toFixed(4)} (significativo a α = 0.05).`;
    return {
      ...teste,
      pRecalculado,
      status: 'inconsistencia_grave_decisao',
      mensagem: `🚨 ERRO CRÍTICO DE DECISÃO ESTATÍSTICA: ${detalhe}`,
    };
  }

  // Inconsistência de valor (mesma decisão, mas valor numérico discrepante além do arredondamento aceitável)
  const toleranciaArredondamento = 0.015;
  let inconsistente = false;

  if (op === '=') {
    if (Math.abs(pRel - pRec) > toleranciaArredondamento) {
      inconsistente = true;
    }
  } else if (op === '<' || op === '≤') {
    if (pRec > pRel + toleranciaArredondamento) {
      inconsistente = true;
    }
  } else if (op === '>' || op === '≥') {
    if (pRec < pRel - toleranciaArredondamento) {
      inconsistente = true;
    }
  }

  if (inconsistente) {
    return {
      ...teste,
      pRecalculado,
      status: 'inconsistencia_estatistica',
      mensagem: `⚠ INCONSISTÊNCIA NUMÉRICA ESTATÍSTICA: O texto relata "${teste.textoBruto}", mas a estatística recalcula para p = ${pRec.toFixed(4)} (diferença de ${Math.abs(pRel - pRec).toFixed(4)}).`,
    };
  }

  return {
    ...teste,
    pRecalculado,
    status: 'consistente',
    mensagem: `✓ Estatística matematicamente consistente: ${teste.textoBruto} (recalculado p = ${pRec.toFixed(4)}).`,
  };
}

/**
 * Executa a auditoria matemática forense sobre uma lista de parágrafos/células do documento.
 */
function auditarEstatisticaDoManuscrito(paragrafos = []) {
  const todosTestes = [];
  const alertasEstatisticos = [];

  for (const p of paragrafos) {
    const texto = typeof p === 'string' ? p : p.texto || '';
    const meta = typeof p === 'object' ? {
      numParagrafo: p.numParagrafo || 0,
      numLinha: p.numLinha || 0,
      secao: p.secao || 'Corpo do Texto',
      fraseWord: texto
    } : { fraseWord: texto };

    const encontrados = extrairTestesEstatisticos(texto, meta);
    for (const t of encontrados) {
      const auditado = auditarTesteEstatistico(t);
      todosTestes.push(auditado);
      if (auditado.status !== 'consistente') {
        alertasEstatisticos.push({
          tipo: auditado.status === 'inconsistencia_grave_decisao'
            ? 'inconsistencia_estatistica_grave'
            : 'inconsistencia_estatistica_numerica',
          numParagrafo: auditado.numParagrafo,
          numLinha: auditado.numLinha,
          secao: auditado.secao,
          textoBruto: auditado.textoBruto,
          pRelatado: auditado.pRelatado,
          pRecalculado: auditado.pRecalculado ? Number(auditado.pRecalculado.toFixed(4)) : null,
          mensagem: auditado.mensagem,
          fraseWord: auditado.fraseWord,
        });
      }
    }
  }

  const consistentes = todosTestes.filter((t) => t.status === 'consistente').length;
  const inconsistencias = todosTestes.filter((t) => t.status === 'inconsistencia_estatistica').length;
  const inconsistenciasGraves = todosTestes.filter((t) => t.status === 'inconsistencia_grave_decisao').length;

  return {
    totalTestes: todosTestes.length,
    consistentes,
    inconsistencias,
    inconsistenciasGraves,
    testes: todosTestes,
    alertasEstatisticos,
  };
}

module.exports = {
  lnGamma,
  betaInc,
  gammaIncQ,
  erf,
  pValorZ,
  pValorT,
  pValorF,
  pValorChi2,
  pValorR,
  extrairTestesEstatisticos,
  auditarTesteEstatistico,
  auditarEstatisticaDoManuscrito,
};
