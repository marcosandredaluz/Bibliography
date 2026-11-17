/**
 * tests/test_tortured_phrases.test.cjs
 * 
 * Bateria de Testes Unitários para Detecção de Frases Torturadas (Problematic Paper Screener).
 */

'use strict';

const assert = require('assert');
const detector = require('../electron/tortured_phrases_detector.cjs');

console.log('--- INICIANDO TESTES DE DETECÇÃO DE FRASES TORTURADAS (CABANAC / PUBPEER) ---');

// 1. Identificação de Frases Torturadas Médicas
{
  const textoMedico = 'O estudo avaliou pacientes com doença metabólica de glicose e desordem maligna de mama.';
  const res = detector.analisarFrasesTorturadas(textoMedico);
  assert.strictEqual(res.length, 2, 'Deve identificar 2 frases torturadas médicas');
  assert.strictEqual(res[0].termoCanonica, 'Diabetes Mellitus');
  assert.strictEqual(res[1].termoCanonica, 'Câncer de Mama (Neoplasia Mamária)');
  console.log('✓ 1. Medicina/Saúde: Frases torturadas de Diabetes e Câncer de Mama detectadas.');
}

// 2. Identificação de Frases Torturadas de IA e Computação
{
  const textoIa = 'Utilizou-se um modelo de consciência contrafeita baseado em aprendizado profundo e informação colossal.';
  const res = detector.analisarFrasesTorturadas(textoIa);
  assert.strictEqual(res.length, 3, 'Deve identificar 3 frases torturadas de IA');
  assert.strictEqual(res[0].termoCanonica, 'Inteligência Artificial (Artificial Intelligence - AI)');
  assert.strictEqual(res[1].termoCanonica, 'Aprendizado Profundo (Deep Learning)');
  assert.strictEqual(res[2].termoCanonica, 'Big Data / Macrodados');
  console.log('✓ 2. IA e Computação: Frases torturadas de AI, Deep Learning e Big Data identificadas.');
}

// 3. Auditoria em Nível de Manuscrito
{
  const paragrafos = [
    { texto: 'Na introdução discutiu-se a consciência falsificada em saúde.', numParagrafo: 1, numLinha: 2 },
    { texto: 'No método, realizou-se uma organização básica irregular.', numParagrafo: 2, numLinha: 5 },
    { texto: 'Texto com redação científica autêntica sobre epidemiologia e vigilância.', numParagrafo: 3, numLinha: 8 }
  ];

  const auditado = detector.auditarFrasesTorturadasDoManuscrito(paragrafos);
  assert.strictEqual(auditado.totalFrasesTorturadas, 2);
  assert.strictEqual(auditado.alertasFrasesTorturadas.length, 2);
  assert.strictEqual(auditado.porCategoria['Inteligência Artificial'], 1);
  assert.strictEqual(auditado.porCategoria['Saúde e Medicina'], 1);

  console.log('✓ 3. Auditoria de Manuscrito: Relatório consolidado de frases torturadas validado.');
}

console.log('\nTODOS OS TESTES DE FRASES TORTURADAS PASSARAM COM 100% DE SUCESSO!\n');
