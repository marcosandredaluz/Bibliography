/**
 * tests/test_rede_citacoes.test.cjs
 * 
 * Bateria de Testes Unitários para Análise Forense de Redes de Citação e Concentração de Autoria.
 */

'use strict';

const assert = require('assert');
const rede = require('../electron/rede_citacoes_forense.cjs');

console.log('--- INICIANDO TESTES DO MÓDULO FORENSE DE REDES DE CITAÇÃO ---');

// 1. Normalização de Nomes e Acentuações
{
  assert.strictEqual(rede.normalizarNome('SÃO PAULO'), 'sao paulo');
  assert.strictEqual(rede.normalizarNome('O\'Connor'), 'o connor');
  assert.strictEqual(rede.normalizarNome('Müller-Lyer'), 'muller lyer');
  console.log('✓ 1. Normalização: Acentos, hífens e apóstrofos tratados com sucesso.');
}

// 2. Análise de Concentração de Autores
{
  // 2.1. Manuscrito balanceado (10 autores distintos em 10 obras)
  const refsBalanceadas = [
    { primeiroSobrenome: 'Silva', citadaNoTexto: true },
    { primeiroSobrenome: 'Santos', citadaNoTexto: true },
    { primeiroSobrenome: 'Oliveira', citadaNoTexto: true },
    { primeiroSobrenome: 'Pereira', citadaNoTexto: true },
    { primeiroSobrenome: 'Almeida', citadaNoTexto: true },
    { primeiroSobrenome: 'Costa', citadaNoTexto: true },
    { primeiroSobrenome: 'Rodrigues', citadaNoTexto: true },
    { primeiroSobrenome: 'Martins', citadaNoTexto: true },
    { primeiroSobrenome: 'Gomes', citadaNoTexto: true },
    { primeiroSobrenome: 'Ferreira', citadaNoTexto: true },
  ];
  const resBal = rede.analisarConcentracaoAutores(refsBalanceadas);
  assert.strictEqual(resBal.alertasConcentracao.length, 0, 'Manuscrito balanceado não deve gerar alerta de concentração');

  // 2.2. Manuscrito com concentração anômala (> 25% no autor Silva)
  const refsConcentradas = [
    { primeiroSobrenome: 'Silva', citadaNoTexto: true },
    { primeiroSobrenome: 'Silva', citadaNoTexto: true },
    { primeiroSobrenome: 'Silva', citadaNoTexto: true },
    { primeiroSobrenome: 'Silva', citadaNoTexto: true },
    { primeiroSobrenome: 'Santos', citadaNoTexto: true },
    { primeiroSobrenome: 'Oliveira', citadaNoTexto: true },
    { primeiroSobrenome: 'Pereira', citadaNoTexto: true },
    { primeiroSobrenome: 'Almeida', citadaNoTexto: true },
    { primeiroSobrenome: 'Costa', citadaNoTexto: true },
    { primeiroSobrenome: 'Rodrigues', citadaNoTexto: true },
  ];
  const resConc = rede.analisarConcentracaoAutores(refsConcentradas);
  assert.strictEqual(resConc.alertasConcentracao.length, 1, 'Deve disparar alerta de alta concentração de autoria');
  assert.strictEqual(resConc.alertasConcentracao[0].autor, 'Silva');
  assert.strictEqual(resConc.alertasConcentracao[0].percentual, 40);

  console.log('✓ 2. Concentração de Autoria: Detecção de viés de citação validada.');
}

// 3. Análise de Diversidade de Periódicos
{
  const refsPeriodicos = [
    { nomePeriodico: 'Cadernos de Saúde Pública', citadaNoTexto: true },
    { nomePeriodico: 'Cadernos de Saúde Pública', citadaNoTexto: true },
    { nomePeriodico: 'Cadernos de Saúde Pública', citadaNoTexto: true },
    { nomePeriodico: 'Cadernos de Saúde Pública', citadaNoTexto: true },
    { nomePeriodico: 'Revista de Saúde Pública', citadaNoTexto: true },
    { nomePeriodico: 'Memórias do Instituto Oswaldo Cruz', citadaNoTexto: true },
    { nomePeriodico: 'Lancet', citadaNoTexto: true },
    { nomePeriodico: 'BMJ', citadaNoTexto: true },
    { nomePeriodico: 'PLOS ONE', citadaNoTexto: true },
    { nomePeriodico: 'Nature Medicine', citadaNoTexto: true },
  ];
  const resPer = rede.analisarDiversidadePeriodicos(refsPeriodicos);
  assert.strictEqual(resPer.alertasPeriodicos.length, 1, 'Deve identificar concentração no mesmo periódico');
  assert.strictEqual(resPer.alertasPeriodicos[0].totalObras, 4);

  console.log('✓ 3. Diversidade de Periódicos: Monopólio de veículos identificado com sucesso.');
}

// 4. Auditoria Integrada
{
  const resIntegrado = rede.auditarRedeCitacoesDoManuscrito({
    refsMapeadas: [
      { primeiroSobrenome: 'Silva', citadaNoTexto: true, nomePeriodico: 'Periódico Alfa' },
      { primeiroSobrenome: 'Silva', citadaNoTexto: true, nomePeriodico: 'Periódico Alfa' },
      { primeiroSobrenome: 'Silva', citadaNoTexto: true, nomePeriodico: 'Periódico Alfa' },
      { primeiroSobrenome: 'Silva', citadaNoTexto: true, nomePeriodico: 'Periódico Alfa' },
      { primeiroSobrenome: 'Santos', citadaNoTexto: true, nomePeriodico: 'Periódico Beta' },
      { primeiroSobrenome: 'Oliveira', citadaNoTexto: true, nomePeriodico: 'Periódico Gama' },
      { primeiroSobrenome: 'Pereira', citadaNoTexto: true, nomePeriodico: 'Periódico Delta' },
      { primeiroSobrenome: 'Almeida', citadaNoTexto: true, nomePeriodico: 'Periódico Epsilon' },
      { primeiroSobrenome: 'Costa', citadaNoTexto: true, nomePeriodico: 'Periódico Zeta' },
      { primeiroSobrenome: 'Rodrigues', citadaNoTexto: true, nomePeriodico: 'Periódico Eta' },
    ]
  });

  assert.strictEqual(resIntegrado.alertasRede.length, 2, 'Deve gerar alertas de autor e periódico concentrados');
  assert.strictEqual(resIntegrado.totalAutoresDistintos, 7);
  assert.strictEqual(resIntegrado.totalPeriodicosDistintos, 7);

  console.log('✓ 4. Auditoria Integrada: Relatório consolidado de redes gerado com sucesso.');
}

console.log('\nTODOS OS TESTES DE REDES DE CITAÇÃO PASSARAM COM 100% DE SUCESSO!\n');
