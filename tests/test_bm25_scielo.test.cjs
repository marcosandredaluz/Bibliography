/**
 * Testes Unitários: Okapi BM25 e SciELO PID / BVS Parser
 */
const assert = require('assert');
const { MotorOkapiBM25, calcularSimilaridadeBM25 } = require('../electron/bm25_scorer.cjs');
const {
  decodificarPidScielo,
  extrairIdentificadoresRegionais,
  normalizarRegistroRegional,
} = require('../electron/scielo_bvs_parser.cjs');

console.log('--- TESTANDO OKAPI BM25 DETERMINÍSTICO ---');

// 1. BM25: consulta relevante vs documento irrelevante
const consulta = "efeitos colaterais do itraconazol no tratamento de esporotricose felina";
const docRelevante = "O itraconazol e a terapia de primeira linha para esporotricose felina apresentando efeitos colaterais hepaticos em doses elevadas.";
const docIrrelevante = "Modelagem estatistica de series temporais na economia monetaria e inflacao de precos.";

const scoreRelevante = calcularSimilaridadeBM25(consulta, docRelevante);
const scoreIrrelevante = calcularSimilaridadeBM25(consulta, docIrrelevante);

console.log(`Score Relevante: ${scoreRelevante.scoreBM25} (status: ${scoreRelevante.status}, termos comuns: ${scoreRelevante.totalTermosComuns})`);
console.log(`Score Irrelevante: ${scoreIrrelevante.scoreBM25} (status: ${scoreIrrelevante.status}, termos comuns: ${scoreIrrelevante.totalTermosComuns})`);

assert(scoreRelevante.scoreBM25 > scoreIrrelevante.scoreBM25, 'BM25 deve pontuar mais alto no doc relevante');
assert(scoreRelevante.totalTermosComuns >= 2, 'Doc relevante deve ter pelo menos 2 termos em comum');
assert.strictEqual(scoreIrrelevante.scoreBM25, 0, 'Documento totalmente irrelevante deve ter score 0');
assert.strictEqual(scoreIrrelevante.status, 'desvio_tematico', 'Documento irrelevante deve ser classificado como desvio temático');
console.log('✓ 1. Okapi BM25 determinístico validado com sucesso.');

console.log('\n--- TESTANDO SCIELO PID DECODER E BVS PARSER ---');

// 2. SciELO PID de 23 caracteres: S0103-84782020000300105
const pid = 'S0103-84782020000300105';
const decodificado = decodificarPidScielo(pid);
assert(decodificado !== null, 'PID deve ser decodificado');
assert.strictEqual(decodificado.issn, '0103-8478', 'ISSN extraído do PID incorreto');
assert.strictEqual(decodificado.ano, 2020, 'Ano extraído do PID incorreto');
assert.strictEqual(decodificado.fasciculo, 3, 'Fascículo extraído do PID incorreto');
assert.strictEqual(decodificado.ordemArtigo, 105, 'Ordem do artigo incorreta');
console.log('✓ 2. SciELO PID decoder (23 caracteres) validado com sucesso.');

// 3. Extração e normalização de referências regionais
const textoRefSciElo = 'SILVA, J. A. et al. Esporotricose zoonótica. Ciência Rural, 2020. Disponível em: https://www.scielo.br/j/cr/a/S0103-84782020000300105/';
const idReg = extrairIdentificadoresRegionais(textoRefSciElo);
assert.strictEqual(idReg.temSciElo, true, 'Deve identificar SciELO');
assert.strictEqual(idReg.pidScielo, 'S0103-84782020000300105', 'Deve extrair o PID da URL');

const norm = normalizarRegistroRegional({
  textoOriginal: textoRefSciElo,
  tituloBuscado: 'Esporotricose zoonótica'
});
assert(norm !== null, 'Deve normalizar o registro regional');
assert.strictEqual(norm.ISSN, '0103-8478', 'ISSN normalizado');
assert.strictEqual(norm.issued['date-parts'][0][0], 2020, 'Ano normalizado');
assert.strictEqual(norm.source, 'SciELO Brasil / Regional', 'Fonte identificada corretamente');
console.log('✓ 3. Normalizador SciELO/BVS para CSL-JSON validado com sucesso.');

console.log('\n================================================================');
console.log('🎉 TODOS OS TESTES BM25 E SCIELO/BVS PASSARAM COM 100% DE SUCESSO!');
console.log('================================================================');
