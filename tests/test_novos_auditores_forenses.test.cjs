/**
 * tests/test_novos_auditores_forenses.test.cjs
 * 
 * Bateria de Testes Unitários dos Novos Módulos Forenses Determinísticos:
 * 1. Detecção de Periódicos Predatórios e Clonados (Beall / Retraction Watch)
 * 2. Auditoria de Completude Normativa ABNT NBR 6023:2018
 * 3. Detecção de Corrupção Genômica por Planilhas (Ziemann / HGNC)
 * 4. Auditoria de Fomento, Bolsas e CAPES 001 (Portaria 206/2018 / CNPq)
 * 5. Suporte de Evidência e Desvio Temático TF-IDF (Claim-Support)
 * 6. Pontuação Ponderada por Campo (Field-Wise Composite Scoring)
 */

'use strict';

const assert = require('assert');
const { verificarPeriodicoPredatorio, auditarReferenciasPredatorias } = require('../electron/periodicos_predatorios_detector.cjs');
const { auditarReferenciaAbntIndividual, auditarCompletudeAbnt6023 } = require('../electron/abnt_nbr6023_auditor.cjs');
const { analisarCorrupcaoGeneTexto, auditarCorrupcaoBiomedicaDoManuscrito } = require('../electron/corrupcao_biomedica_detector.cjs');
const { auditarFomentoEAfiliacoes } = require('../electron/fomento_afiliacoes_auditor.cjs');
const { calcularSimilaridadeCossenoTfidf, auditarClaimSupportDoManuscrito } = require('../electron/tfidf_claim_support.cjs');
const { calcularPontuacaoPonderadaCitacao } = require('../electron/field_composite_scorer.cjs');

console.log('--- INICIANDO TESTES DOS NOVOS AUDITORES FORENSES DETERMINÍSTICOS ---');

// ==========================================
// 1. TESTE: PERIÓDICOS PREDATÓRIOS
// ==========================================
console.log('\n▶ 1. Testando Detecção de Periódicos Predatórios e Editoras Suspeitas...');

const refOmics = {
  refBibId: 'ref_1',
  periodico: 'Journal of Clinical Research',
  editora: 'OMICS Publishing Group',
  textoOriginal: 'SILVA, J. Clinical study. Journal of Clinical Research, OMICS Publishing Group, 2021.'
};
const diagOmics = verificarPeriodicoPredatorio(refOmics);
assert.ok(diagOmics, 'Deveria detectar OMICS Publishing Group');
assert.strictEqual(diagOmics.subtipo, 'editora_predatoria');

const refIdonea = {
  refBibId: 'ref_2',
  periodico: 'The Lancet',
  editora: 'Elsevier',
  textoOriginal: 'SMITH, J. Global epidemiology. The Lancet, v. 398, p. 100-110, 2021.'
};
const diagIdonea = verificarPeriodicoPredatorio(refIdonea);
assert.strictEqual(diagIdonea, null, 'Periódico idôneo (The Lancet) não deve ser sinalizado');

console.log('  ✓ 1. Periódicos predatórios identificados com precisão e periódicos idôneos protegidos.');

// ==========================================
// 2. TESTE: ABNT NBR 6023:2018
// ==========================================
console.log('\n▶ 2. Testando Auditoria de Completude Normativa ABNT NBR 6023:2018...');

const refLivroSemLocal = {
  textoOriginal: 'ALMEIDA, Carlos. Fundamentos de Epidemiologia. 2020.',
  primeiroSobrenome: 'ALMEIDA',
  ano: '2020'
};
const alertasLivro = auditarReferenciaAbntIndividual(refLivroSemLocal);
assert.ok(alertasLivro.some((a) => a.tipo === 'abnt_livro_sem_local_editora'), 'Deve alertar falta de cidade e editora no livro');

const refWebSemAcesso = {
  textoOriginal: 'ORGANIZAÇÃO MUNDIAL DA SAÚDE. Dados globais. Disponível em: https://who.int/data/report. 2023.',
  primeiroSobrenome: 'OMS',
  ano: '2023'
};
const alertasWeb = auditarReferenciaAbntIndividual(refWebSemAcesso);
assert.ok(alertasWeb.some((a) => a.tipo === 'abnt_data_acesso_ausente'), 'Deve alertar ausência de data de acesso');

const refConforme = {
  textoOriginal: 'SOUZA, Marcos. Metodologia Científica. São Paulo: Atlas, 2022.',
  primeiroSobrenome: 'SOUZA',
  ano: '2022'
};
const alertasConforme = auditarReferenciaAbntIndividual(refConforme);
assert.strictEqual(alertasConforme.length, 0, 'Referência conforme de livro não deve gerar alertas');

const refVancouverConforme = {
  textoOriginal: '1. Domingues CMAS, Teixeira AMS. Coberturas vacinais no Brasil. Epidemiol Serv Saúde [Internet]. 2013 jan-mar [citado 2018 set 6];22(1):9-27. Disponível em: http://scielo.iec.gov.br/artigo.pdf',
  primeiroSobrenome: 'Domingues',
  ano: '2013',
};
const alertasVancouver = auditarReferenciaAbntIndividual(refVancouverConforme);
assert.strictEqual(alertasVancouver.length, 0, 'Referência Vancouver com [citado] e 22(1):9-27 não deve gerar falso positivo ABNT');

console.log('  ✓ 2. Elementos obrigatórios ABNT NBR 6023 (Local, Editora, Acesso em) e tolerância Vancouver validados.');

// ==========================================
// 3. TESTE: CORRUPÇÃO GENÔMICA (ZIEMANN / HGNC)
// ==========================================
console.log('\n▶ 3. Testando Detecção de Corrupção Genômica por Planilhas...');

const textoCorrompido = 'A análise de PCR revelou que a expressão tumoral do gene 1-Mar apresentou aumento significativo.';
const achadosGene = analisarCorrupcaoGeneTexto(textoCorrompido);
assert.strictEqual(achadosGene.length, 1, 'Deve detectar a corrupção de 1-Mar');
assert.strictEqual(achadosGene[0].geneCorrompido, 'MARCH1');
assert.strictEqual(achadosGene[0].geneAtualHgnc, 'MARCHF1');

const textoDataLegitima = 'As amostras de sangue foram coletadas entre 1-Mar-2022 e 15-Mar-2022 durante a campanha.';
const achadosData = analisarCorrupcaoGeneTexto(textoDataLegitima);
assert.strictEqual(achadosData.length, 0, 'Data cronológica legítima com ano não deve ser falso positivo');

console.log('  ✓ 3. Corrupção genômica por planilhas detectada com imunidade a datas cronológicas.');

// ==========================================
// 4. TESTE: DECLARAÇÃO DE FOMENTO / CAPES 001
// ==========================================
console.log('\n▶ 4. Testando Auditoria de Fomento e Portaria CAPES 206/2018...');

const paragrafosSemCodigo = [
  { texto: 'Este trabalho foi financiado pela CAPES através de bolsa de doutorado.', secao: 'Agradecimentos' }
];
const resFomento = auditarFomentoEAfiliacoes(paragrafosSemCodigo);
assert.ok(resFomento.alertasFomento.some((a) => a.tipo === 'capes_falta_codigo_001'), 'Deve alertar falta do Código 001 da CAPES');

const paragrafosConformes = [
  { texto: 'O presente trabalho foi realizado com apoio da Coordenação de Aperfeiçoamento de Pessoal de Nível Superior - Brasil (CAPES) - Código de Financiamento 001.', secao: 'Agradecimentos' }
];
const resConforme = auditarFomentoEAfiliacoes(paragrafosConformes);
assert.strictEqual(resConforme.alertasFomento.length, 0, 'Declaração padrão CAPES 001 não deve gerar alerta');

console.log('  ✓ 4. Exigências regulamentares da Portaria CAPES 206/2018 e processos validadas.');

// ==========================================
// 5. TESTE: TF-IDF CLAIM-SUPPORT
// ==========================================
console.log('\n▶ 5. Testando Suporte de Evidência e Desvio Temático TF-IDF...');

const fraseTemaCardio = 'A hipertensão arterial sistêmica foi associada com hipertrofia ventricular esquerda e risco coronariano elevado.';
const abstractCardio = 'This study investigated systemic hypertension, left ventricular hypertrophy, and cardiovascular risk factors in adult patients.';
const resCardio = calcularSimilaridadeCossenoTfidf(fraseTemaCardio, abstractCardio);
assert.ok(resCardio.similaridade >= 0.20, `Similaridade cardiológica deveria ser >= 0.20, obteve ${resCardio.similaridade}`);
assert.notStrictEqual(resCardio.suporte, 'desvio_tematico');

const abstractBotanica = 'Photosynthesis and chlorophyll fluorescence dynamics in tropical rainforest canopy leaves under drought conditions.';
const resDesvio = calcularSimilaridadeCossenoTfidf(fraseTemaCardio, abstractBotanica);
assert.ok(resDesvio.similaridade < 0.10, `Similaridade divergente deveria ser < 0.10, obteve ${resDesvio.similaridade}`);
assert.strictEqual(resDesvio.suporte, 'desvio_tematico');

console.log('  ✓ 5. TF-IDF Cosseno distinguiu com perfeição alinhamento temático de desvio.');

// ==========================================
// 6. TESTE: FIELD-WISE COMPOSITE SCORING
// ==========================================
console.log('\n▶ 6. Testando Pontuação Ponderada Composta por Campo (Composite Scoring)...');

const avaliacaoAutentica = calcularPontuacaoPonderadaCitacao({
  tituloCitado: 'Epidemiologia Global da Diabetes Mellitus no Século XXI',
  autorCitado: 'SILVA',
  anoCitado: '2021',
  periodicoCitado: 'Revista Brasileira de Epidemiologia',
  tituloOficial: 'Epidemiologia Global da Diabetes Mellitus no Século XXI: Revisão',
  autoresOficiais: ['Silva, João', 'Santos, Maria'],
  anoOficial: '2021',
  periodicoOficial: 'Revista Brasileira de Epidemiologia',
  artigoRetratado: false
});
assert.ok(avaliacaoAutentica.scoreComposto >= 0.85, `Score de citação autêntica deveria ser >= 0.85, obteve ${avaliacaoAutentica.scoreComposto}`);
assert.strictEqual(avaliacaoAutentica.classificacao, 'autentica');

const avaliacaoAlucinada = calcularPontuacaoPonderadaCitacao({
  tituloCitado: 'Algoritmo Quântico para Cura do Câncer',
  autorCitado: 'SOUZA',
  anoCitado: '2025',
  periodicoCitado: 'Nature Medicine',
  tituloOficial: 'A Randomized Trial of Drug X for Hypertension',
  autoresOficiais: ['Johnson, Peter', 'Miller, Alan'],
  anoOficial: '2018',
  periodicoOficial: 'The New England Journal of Medicine',
  artigoRetratado: false
});
assert.ok(avaliacaoAlucinada.scoreComposto < 0.60, `Score de citação alucinada deveria ser < 0.60, obteve ${avaliacaoAlucinada.scoreComposto}`);
assert.strictEqual(avaliacaoAlucinada.classificacao, 'suspeita_alucinacao');

const avaliacaoRetratada = calcularPontuacaoPonderadaCitacao({
  tituloCitado: 'Estudo Clínico com Dados Falsificados',
  autorCitado: 'PEREIRA',
  anoCitado: '2019',
  tituloOficial: 'Estudo Clínico com Dados Falsificados',
  autoresOficiais: ['Pereira, R.'],
  anoOficial: '2019',
  artigoRetratado: true,
  motivoRetratacao: 'Falsificação de imagens e dados duplicados'
});
assert.strictEqual(avaliacaoRetratada.classificacao, 'artigo_retratado');

console.log('  ✓ 6. Pontuação composta por componentes (Título 60%, Autores 25%, Ano 15%) validada com 100% de precisão.');

console.log('\n================================================================');
console.log('🎉 TODOS OS TESTES DOS NOVOS AUDITORES FORENSES PASSARAM COM SUCESSO!');
console.log('================================================================');
