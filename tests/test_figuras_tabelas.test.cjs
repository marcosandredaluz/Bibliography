/**
 * Testes Unitários: Auditoria de Figuras, Quadros e Tabelas (ABNT NBR 14724 & IBGE)
 */
const assert = require('assert');
const { auditarFigurasETabelasDoManuscrito } = require('../electron/figuras_tabelas_auditor.cjs');

console.log('--- TESTANDO AUDITORIA DE FIGURAS, QUADROS E TABELAS ---');

// Cenário 1: Manuscrito com Figura 1 conforme (tem chamada e tem fonte)
const paragrafosConformes = [
  {
    numParagrafo: 1,
    numLinha: 10,
    secao: 'Introdução',
    texto: 'Os dados epidemiológicos são apresentados conforme a Figura 1 abaixo.'
  },
  {
    numParagrafo: 2,
    numLinha: 15,
    secao: 'Introdução',
    texto: 'Figura 1 – Distribuição geográfica dos casos de esporotricose no Brasil.'
  },
  {
    numParagrafo: 3,
    numLinha: 16,
    secao: 'Introdução',
    texto: 'Fonte: Ministério da Saúde (2025).'
  }
];

const res1 = auditarFigurasETabelasDoManuscrito(paragrafosConformes);
assert.strictEqual(res1.totalElementos, 1, 'Deve identificar 1 figura');
assert.strictEqual(res1.totalChamadas, 1, 'Deve identificar 1 chamada no texto');
assert.strictEqual(res1.alertasFigurasTabelas.length, 0, 'Não deve gerar alertas para figura conforme');
console.log('✓ 1. Figura com chamada e fonte conforme validada com sucesso.');

// Cenário 2: Manuscrito com Tabela 1 sem chamada no texto e sem fonte
const paragrafosSemChamadaESemFonte = [
  {
    numParagrafo: 1,
    numLinha: 10,
    secao: 'Resultados',
    texto: 'Tabela 1: Perfil socioeconômico dos pacientes atendidos.'
  },
  {
    numParagrafo: 2,
    numLinha: 12,
    secao: 'Resultados',
    texto: 'A maioria dos indivíduos reside em áreas periféricas com saneamento precário.'
  }
];

const res2 = auditarFigurasETabelasDoManuscrito(paragrafosSemChamadaESemFonte);
assert.strictEqual(res2.totalElementos, 1, 'Deve identificar 1 tabela');
assert(res2.alertasFigurasTabelas.some(a => a.tipo === 'figura_tabela_sem_chamada'), 'Deve alertar falta de chamada');
assert(res2.alertasFigurasTabelas.some(a => a.tipo === 'ausencia_fonte_ilustracao'), 'Deve alertar ausência de fonte');
console.log('✓ 2. Alertas de falta de chamada e ausência de fonte validados com sucesso.');

// Cenário 3: Manuscrito citando Quadro 3 que não existe (chamada órfã)
const paragrafosChamadaOrfa = [
  {
    numParagrafo: 1,
    numLinha: 20,
    secao: 'Metodologia',
    texto: 'As variáveis coletadas foram organizadas como demonstrado no Quadro 3.'
  }
];

const res3 = auditarFigurasETabelasDoManuscrito(paragrafosChamadaOrfa);
assert(res3.alertasFigurasTabelas.some(a => a.tipo === 'chamada_tabela_inexistente'), 'Deve alertar chamada para elemento inexistente');
console.log('✓ 3. Detecção de chamada para elemento inexistente validada com sucesso.');

// Cenário 4: Salto de numeração (Figura 1 e Figura 3, pulando a 2)
const paragrafosSalto = [
  { numParagrafo: 1, numLinha: 5, texto: 'Conforme Figura 1 e Figura 3 no texto.' },
  { numParagrafo: 2, numLinha: 10, texto: 'Figura 1 – Primeiro mapa.' },
  { numParagrafo: 3, numLinha: 11, texto: 'Fonte: Autor (2026).' },
  { numParagrafo: 4, numLinha: 20, texto: 'Figura 3 – Terceiro mapa.' },
  { numParagrafo: 5, numLinha: 21, texto: 'Fonte: Autor (2026).' }
];

const res4 = auditarFigurasETabelasDoManuscrito(paragrafosSalto);
assert(res4.alertasFigurasTabelas.some(a => a.tipo === 'salto_numeracao_ilustracao'), 'Deve alertar quebra de sequência numérica');
console.log('✓ 4. Detecção de salto na sequência numérica validada com sucesso.');

console.log('\n================================================================');
console.log('🎉 TODOS OS TESTES DE FIGURAS E TABELAS PASSARAM COM 100% DE SUCESSO!');
console.log('================================================================');
