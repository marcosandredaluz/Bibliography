/**
 * tests/test_auditor_metodologico_clinico.test.cjs
 * 
 * Bateria de Testes Unitários para Auditoria Forense Metodológica e Clínica (PICO / STROBE / CONSORT).
 */

'use strict';

const assert = require('assert');
const clinico = require('../electron/auditor_metodologico_clinico.cjs');

console.log('--- INICIANDO TESTES DO AUDITOR FORENSE METODOLÓGICO E CLÍNICO ---');

// 1. Identificação de Desenho do Estudo
{
  const rct = clinico.identificarDesenhoEstudo('Trata-se de um ensaio clínico randomizado duplo-cego para avaliar a intervenção.');
  assert.strictEqual(rct.tipo, 'ensaio_clinico');
  assert.strictEqual(rct.checklist, 'CONSORT');

  const trans = clinico.identificarDesenhoEstudo('Foi realizado um estudo transversal de base populacional.');
  assert.strictEqual(trans.tipo, 'transversal');
  assert.strictEqual(trans.checklist, 'STROBE');

  const meta = clinico.identificarDesenhoEstudo('Esta revisão sistemática com metanálise seguiu os critérios do PRISMA.');
  assert.strictEqual(meta.tipo, 'revisao_sistematica');
  assert.strictEqual(meta.checklist, 'PRISMA');

  console.log('✓ 1. Desenhos Metodológicos: RCT (CONSORT), Transversal (STROBE) e Revisão (PRISMA) identificados.');
}

// 2. Aspectos Éticos e CAAE / CEP
{
  // 2.1. Estudo ético com aprovação e CAAE
  const textoEticaOk = `
    O projeto de pesquisa foi submetido e aprovado pelo Comitê de Ética em Pesquisa (CEP) institucional,
    sob parecer número 4.567.890 e CAAE 12345678.9.0000.5432. Todos os participantes assinaram o TCLE.
  `;
  const resEticaOk = clinico.auditarAspectosEticos(textoEticaOk);
  assert.strictEqual(resEticaOk.aprovadoCep, true);
  assert.strictEqual(resEticaOk.mencaoTcle, true);
  assert(resEticaOk.caae.includes('12345678'), 'Deve extrair o número do CAAE');
  assert.strictEqual(resEticaOk.alertas.length, 0);

  // 2.2. Estudo com seres humanos sem menção a CEP (Alerta Crítico)
  const textoEticaFaltando = `
    Foram avaliados 500 pacientes internados em hospital terciário para coleta de sangue e biópsias.
  `;
  const resEticaFalta = clinico.auditarAspectosEticos(textoEticaFaltando);
  assert.strictEqual(resEticaFalta.aprovadoCep, false);
  assert(resEticaFalta.alertas.some(a => a.tipo === 'ausencia_aprovacao_etica'));

  // 2.3. Estudo com dados públicos anônimos do DataSUS / SINAN (Isenção Ética Legítima)
  const textoDatasus = `
    Utilizaram-se dados secundários de domínio público disponibilizados pelo SINAN / DATASUS sem identificação nominal.
  `;
  const resDatasus = clinico.auditarAspectosEticos(textoDatasus);
  assert.strictEqual(resDatasus.alertas.length, 0, 'Dados públicos anônimos não devem disparar falso positivo ético');

  console.log('✓ 2. Ética em Pesquisa: CAAE, CEP, TCLE e isenção legítima para bancos públicos validados.');
}

// 3. Critérios de Elegibilidade e Tamanho Amostral N
{
  const textoMetodo = `
    A amostra foi composta por 1.250 participantes com diagnóstico confirmado.
    Critérios de inclusão: adultos com idade entre 18 e 65 anos.
    Critérios de exclusão: gestantes e indivíduos em uso de imunossupressores.
    O cálculo do tamanho amostral considerou poder estatístico de 80%.
  `;
  const resAmostra = clinico.auditarElegibilidadeEAmostra(textoMetodo);
  assert.strictEqual(resAmostra.tamanhoAmostral, 1250);
  assert.strictEqual(resAmostra.temCriteriosInclusao, true);
  assert.strictEqual(resAmostra.temCriteriosExclusao, true);
  assert.strictEqual(resAmostra.temCalculoAmostral, true);
  assert.strictEqual(resAmostra.alertas.length, 0);

  console.log('✓ 3. Elegibilidade e Amostra: N amostral, critérios e cálculo de poder extraídos com sucesso.');
}

// 4. Registro Clínico e Transparência
{
  const textoRegOk = `
    O ensaio clínico foi registrado prospectivamente no ClinicalTrials.gov sob o identificador NCT04123456.
    Conflito de interesses: Os autores declaram não possuir conflitos de interesse.
    Financiamento: Este estudo foi financiado pelo CNPq.
  `;
  const resRegOk = clinico.auditarTransparenciaERegistro(textoRegOk, { tipo: 'ensaio_clinico' });
  assert.strictEqual(resRegOk.temRegistroClinico, true);
  assert.strictEqual(resRegOk.identificadorRegistro, 'NCT04123456');
  assert.strictEqual(resRegOk.temConflitoInteresse, true);
  assert.strictEqual(resRegOk.temFinanciamento, true);
  assert.strictEqual(resRegOk.alertas.length, 0);

  // Ensaio clínico sem registro
  const resSemReg = clinico.auditarTransparenciaERegistro('Ensaio realizado no hospital.', { tipo: 'ensaio_clinico' });
  assert(resSemReg.alertas.some(a => a.tipo === 'ensaio_sem_registro_icmje'));

  console.log('✓ 4. Registro e Transparência: Identificação de NCT/ReBEC e declaração de conflitos validadas.');
}

// 5. Descritores DeCS / MeSH
{
  const textoKw = 'Palavras-chave: Vigilância Epidemiológica; Saúde Pública; Sistemas de Informação em Saúde.';
  const resKw = clinico.auditarDescritoresDecsMesh(textoKw);
  assert.strictEqual(resKw.descritoresEncontrados.length, 3);
  assert.strictEqual(resKw.alertas.length, 0);

  console.log('✓ 5. Descritores DeCS/MeSH: Formatação e extração validadas.');
}

console.log('\nTODOS OS TESTES DO AUDITOR METODOLÓGICO CLÍNICO PASSARAM COM 100% DE SUCESSO!\n');
