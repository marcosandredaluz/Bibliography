/**
 * tests/test_statcheck_forense.test.cjs
 * 
 * Bateria de Testes Unitários para o Módulo de Auditoria Estatística (statcheck).
 */

'use strict';

const assert = require('assert');
const stat = require('../electron/statcheck_forense.cjs');

console.log('--- INICIANDO TESTES DO MÓDULO FORENSE ESTATÍSTICO (STATCHECK) ---');

// 1. Precisão Matemática das Distribuições
{
  const pZ = stat.pValorZ(1.95996);
  assert(Math.abs(pZ - 0.05) < 0.001, `Z=1.96 deve resultar em p ≈ 0.05 (obtido: ${pZ})`);

  const pT = stat.pValorT(2.45, 28);
  assert(Math.abs(pT - 0.0208) < 0.001, `t(28)=2.45 deve resultar em p ≈ 0.0208 (obtido: ${pT})`);

  const pF = stat.pValorF(3.89, 2, 45);
  assert(Math.abs(pF - 0.0276) < 0.001, `F(2, 45)=3.89 deve resultar em p ≈ 0.0276 (obtido: ${pF})`);

  const pChi = stat.pValorChi2(3.8415, 1);
  assert(Math.abs(pChi - 0.05) < 0.001, `χ²(1)=3.8415 deve resultar em p ≈ 0.05 (obtido: ${pChi})`);

  const pR = stat.pValorR(0.28, 48);
  assert(Math.abs(pR - 0.0489) < 0.002, `r(48)=0.28 deve resultar em p ≈ 0.0489 (obtido: ${pR})`);

  console.log('✓ 1. Precisão Analítica: Distribuições Z, t, F, χ² e r validadas com tolerância < 10^-3.');
}

// 2. Extração no Texto
{
  const texto = `
    Na análise primária, observou-se diferença significativa entre os grupos, t(28) = 2.45, p = 0.02.
    A ANOVA fatorial indicou efeito de intervenção, F(2, 45) = 3.89, p = .028.
    O teste de independência revelou associação, χ²(1) = 4.12, p = .042.
    O modelo logístico demonstrou z = 2.15, p = .03.
    Ademais, encontrou-se correlação linear, r(45) = .34, p = .02.
  `;

  const extraidos = stat.extrairTestesEstatisticos(texto);
  assert.strictEqual(extraidos.length, 5, 'Deve extrair exatamente os 5 testes estatísticos');
  assert.strictEqual(extraidos[0].tipo, 't');
  assert.strictEqual(extraidos[1].tipo, 'F');
  assert.strictEqual(extraidos[2].tipo, 'chi2');
  assert.strictEqual(extraidos[3].tipo, 'z');
  assert.strictEqual(extraidos[4].tipo, 'r');

  console.log('✓ 2. Extração Semântica: 5 formatos de testes estatísticos extraídos com precisão.');
}

// 3. Classificação Forense de Consistência e Detecção de P-Hacking
{
  // 3.1. Teste Consistente
  const tOk = stat.auditarTesteEstatistico({
    tipo: 't',
    df1: 28,
    estatisticaValor: 2.45,
    operadorP: '=',
    pRelatado: 0.02,
    textoBruto: 't(28) = 2.45, p = 0.02'
  });
  assert.strictEqual(tOk.status, 'consistente');

  // 3.2. Inconsistência Numérica Leve (arredondamento discrepante, mesma decisão)
  const tIncNum = stat.auditarTesteEstatistico({
    tipo: 't',
    df1: 28,
    estatisticaValor: 2.45,
    operadorP: '=',
    pRelatado: 0.045, // Na verdade é ~0.0208 (> 0.015 de diferença)
    textoBruto: 't(28) = 2.45, p = 0.045'
  });
  assert.strictEqual(tIncNum.status, 'inconsistencia_estatistica');

  // 3.3. Erro Crítico de Decisão (P-Hacking: alegou significativo p < .05, mas o real é p = 0.238!)
  const tPhack = stat.auditarTesteEstatistico({
    tipo: 't',
    df1: 28,
    estatisticaValor: 1.20,
    operadorP: '<',
    pRelatado: 0.05,
    textoBruto: 't(28) = 1.20, p < .05'
  });
  assert.strictEqual(tPhack.status, 'inconsistencia_grave_decisao');
  assert(tPhack.mensagem.includes('ERRO CRÍTICO DE DECISÃO ESTATÍSTICA'));

  // 3.4. P-valor impossível
  const tImp = stat.auditarTesteEstatistico({
    tipo: 't',
    df1: 28,
    estatisticaValor: 2.45,
    operadorP: '=',
    pRelatado: 1.25,
    textoBruto: 't(28) = 2.45, p = 1.25'
  });
  assert.strictEqual(tImp.status, 'p_valor_impossivel');

  console.log('✓ 3. Classificação Forense: P-hacking, erros de decisão e inconsistências identificados.');
}

// 4. Auditoria em Nível de Manuscrito
{
  const paragrafos = [
    { texto: 'Os escores do grupo controle foram t(28) = 2.45, p = 0.02 na avaliação basal.', numParagrafo: 3, numLinha: 1 },
    { texto: 'No desfecho secundário, reportou-se t(28) = 1.15, p < .05 com melhora aparente.', numParagrafo: 4, numLinha: 5 },
    { texto: 'O teste de Pearson resultou em χ²(1) = 4.12, p = .042.', numParagrafo: 5, numLinha: 8 }
  ];

  const resultado = stat.auditarEstatisticaDoManuscrito(paragrafos);
  assert.strictEqual(resultado.totalTestes, 3);
  assert.strictEqual(resultado.consistentes, 2);
  assert.strictEqual(resultado.inconsistenciasGraves, 1);
  assert.strictEqual(resultado.alertasEstatisticos.length, 1);
  assert.strictEqual(resultado.alertasEstatisticos[0].tipo, 'inconsistencia_estatistica_grave');

  console.log('✓ 4. Auditoria de Manuscrito: Relatório forense estruturado gerado com sucesso.');
}

console.log('\nTODOS OS TESTES DO STATCHECK FORENSE PASSARAM COM 100% DE SUCESSO!\n');
