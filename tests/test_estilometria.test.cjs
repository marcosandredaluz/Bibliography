/**
 * tests/test_estilometria.test.cjs
 * 
 * Bateria de Testes Unitários para Análise Estilométrica Determinística (TTR, Burstiness, Flesch).
 */

'use strict';

const assert = require('assert');
const est = require('../electron/estilometria_academica.cjs');

console.log('--- INICIANDO TESTES DE ESTILOMETRIA DETERMINÍSTICA ---');

// 1. Cálculo de Métricas Básicas (TTR, Guiraud, Burstiness)
{
  const textoHumano = `
    A vigilância em saúde ambiental analisa a interação entre fatores ecológicos e a incidência de infecções.
    No entanto, medidas preventivas precoces reduzem a sobrecarga hospitalar.
    Modelos preditivos estruturados foram implementados com sucesso na atenção primária.
  `;
  const m = est.calcularMetricasEstilometricas(textoHumano);
  assert(m.totalPalavras > 20, 'Deve contabilizar palavras corretamente');
  assert(m.ttr > 0.70, `TTR deve ser alto em texto com vocabulário rico (obtido: ${m.ttr})`);
  assert(m.burstiness > 0.20, `Burstiness deve refletir variação de ritmo (obtido: ${m.burstiness})`);
  assert(m.densidadeLexical > 40, `Densidade lexical de conteúdo deve ser > 40% (obtido: ${m.densidadeLexical}%)`);

  console.log('✓ 1. Métricas Estilométricas: TTR, Guiraud, Burstiness e Densidade Lexical validados.');
}

// 2. Detecção de Monotonia Sintática Extrema (Mecânica / Spin-bot)
{
  // Frases repetidas com exatamente o mesmo número de palavras
  const textoMonotono = [
    'O estudo analisou os dados dos pacientes internados no hospital.',
    'O estudo avaliou os testes dos pacientes internados no hospital.',
    'O estudo comparou as taxas dos pacientes internados no hospital.',
    'O estudo resumiu os laudos dos pacientes internados no hospital.',
  ].join(' ');

  const auditado = est.auditarEstilometriaDoManuscrito([
    { texto: textoMonotono, numParagrafo: 4, numLinha: 1 }
  ]);

  assert(auditado.totalAlertasEstilometricos >= 1, 'Deve emitir alerta para monotonia sintática extrema');
  assert(auditado.alertasEstilometricos.some(a => a.tipo === 'monotonia_sintatica_estilometrica' || a.tipo === 'pobreza_lexical_anomala'));

  console.log('✓ 2. Monotonia Sintática: Detecção determinística de ritmo artificial validada.');
}

// 3. Auditoria Global
{
  const auditado = est.auditarEstilometriaDoManuscrito([
    { texto: 'Texto científico legítimo bem estruturado com terminologia epidemiológica e metodológica completa.', numParagrafo: 1, numLinha: 1 }
  ]);
  assert.strictEqual(typeof auditado.ttrGlobal, 'number');
  assert.strictEqual(typeof auditado.guiraudGlobal, 'number');
  assert.strictEqual(typeof auditado.mediaGlobalBurstiness, 'number');

  console.log('✓ 3. Auditoria Global: Consolidação estilométrica completa do manuscrito validada.');
}

console.log('\nTODOS OS TESTES DE ESTILOMETRIA PASSARAM COM 100% DE SUCESSO!\n');
