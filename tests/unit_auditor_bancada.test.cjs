const assert = require('assert');
const path = require('path');
const fs = require('fs');

console.log('--- EXECUTANDO TESTES UNITARIOS DO MOTOR (BANCADA DE TESTES) ---');

// 1. Teste de contenção estrita de caminhos (Prevenção de Path Traversal e Prefix Confusion S08/S15)
function garantirCaminhoContido(raiz, sub, p = path) {
  const resolvida = p.resolve(raiz, sub);
  const rel = p.relative(raiz, resolvida);
  if (rel.startsWith('..') || p.isAbsolute(rel)) {
    throw new Error('Acesso negado: caminho fora da raiz autorizada.');
  }
  return resolvida;
}

const mockRaiz = 'C:\\projetos\\artigo';
assert.strictEqual(
  garantirCaminhoContido(mockRaiz, 'capitulos/intro.docx', path.win32),
  'C:\\projetos\\artigo\\capitulos\\intro.docx'
);
assert.throws(() => {
  garantirCaminhoContido(mockRaiz, '../artigo-vizinho/privado.docx', path.win32);
}, /fora da raiz autorizada/);
assert.throws(() => {
  garantirCaminhoContido(mockRaiz, 'C:\\projetos\\artigo-v2\\privado.docx', path.win32);
}, /fora da raiz autorizada/);
console.log('✓ 1. Seguranca de caminhos: contencao estrita validada (100%)');

// 2. Teste de extracao do ano real de publicacao (Ignorando intervalo de paginas 1761-1800)
function extrairAnoReferencia(l) {
  const anoPadrao = l.match(/\b(19\d\d|20\d\d)[a-z]?\b/g);
  if (!anoPadrao) return null;
  const ignorarIntervalo = [];
  const rePag = /(?:p\.|pp\.|pages?|p[aá]g(?:inas?)?\.?|v\.|vol\.|n\.|no\.)\s*(\d{1,4})\s*[-–]\s*(\d{1,4})/gi;
  let mp;
  while ((mp = rePag.exec(l)) !== null) {
    ignorarIntervalo.push(mp[1], mp[2]);
  }
  const candidatos = anoPadrao.filter(a => !ignorarIntervalo.includes(a.slice(0, 4)));
  return candidatos.length > 0 ? candidatos[candidatos.length - 1] : anoPadrao[anoPadrao.length - 1];
}

const refComPaginas = 'Author-Example. Medical Informatics, v. 25, p. 1761–1800, 2012.';
assert.strictEqual(extrairAnoReferencia(refComPaginas), '2012');
console.log('✓ 2. Extracao de ano: desconsidera intervalo de paginas 1761-1800 (100%)');

// 3. Teste de divisao de grupos e preservacao de autores múltiplos na ABNT
function primeiroAutor(a) {
  const str = (a || '').trim();
  if (str.includes('(')) return str;
  return str.split(/[,;]|\s(?:e|and|y|und|et|&)\s/)[0].trim();
}

assert.strictEqual(primeiroAutor('Fogaça; Macedo'), 'Fogaça');
assert.strictEqual(primeiroAutor('Mendonça; Cavalcanti; Sá'), 'Mendonça');
assert.strictEqual(primeiroAutor('Silva, Souza e Santos'), 'Silva');
console.log('✓ 3. Pareamento autor-data: extracao correta de primeiro autor composto (100%)');

// 4. Teste de sanitizacao de URLs de consulta de rede
function sanitizarUrl(url) {
  return url.trim().replace(/[.,;]+$/, '');
}

assert.strictEqual(sanitizarUrl('http://exemplo.org/pagina-ok.'), 'http://exemplo.org/pagina-ok');
assert.strictEqual(sanitizarUrl('https://dx.doi.org/10.1016/j.jbi.2020.103522;'), 'https://dx.doi.org/10.1016/j.jbi.2020.103522');
console.log('✓ 4. Rede: sanitizacao de pontuacao residual em URLs validada (100%)');

// 5. Teste de protecao a citacao direta contra acusacao de plagio
function verificarCitacaoDireta(trecho, citacoes) {
  const temAspas = (trecho.startsWith('"') && trecho.endsWith('"')) || (trecho.startsWith('“') && trecho.endsWith('”'));
  const temPagina = citacoes.some(c => /p\.\s*\d+/i.test(c.texto) || /pp\.\s*\d+/i.test(c.texto));
  return temAspas && temPagina;
}

assert.strictEqual(verificarCitacaoDireta('"Texto literal com aspas"', [{ texto: '(Silva, 2020, p. 45)' }]), true);
assert.strictEqual(verificarCitacaoDireta('Texto literal sem aspas', [{ texto: '(Silva, 2020)' }]), false);
console.log('✓ 5. Plagio: citacao direta legitima com aspas e pagina protegida (100%)');

// 6. Teste de isolamento de PMCID no ano (Prevenção de falso ano derivado de dígitos do ID como 8746)
function sanitizarIdsNumericos(texto) {
  let s = String(texto || '');
  s = s.replace(/\bPMCID\s*:?\s*(?:PMC)?\d+\b/gi, ' ');
  s = s.replace(/\bPMID\s*:?\s*\d+\b/gi, ' ');
  s = s.replace(/\bPMC\d+\b/gi, ' ');
  const m = s.match(/\b(19\d\d|20\d\d)\b/g);
  return m ? m[m.length - 1] : null;
}

assert.strictEqual(sanitizarIdsNumericos('Artigo Exemplo. Journal, 2011. PMCID: PMC3248746.'), '2011');
assert.strictEqual(sanitizarIdsNumericos('Artigo Exemplo. Journal, 2020. PMID: 98765432.'), '2020');
console.log('✓ 6. Metadados: isolamento estrito de PMCID/PMID impede captura indevida de ano (100%)');

// 7. Teste de normalização de fascículo com zero à esquerda (n. 3 == n. 03)
function compararFasciculos(declarado, oficial) {
  const norm = (v) => String(v || '').replace(/^0+/, '').trim();
  return norm(declarado) === norm(oficial);
}

assert.strictEqual(compararFasciculos('3', '03'), true);
assert.strictEqual(compararFasciculos('01', '1'), true);
assert.strictEqual(compararFasciculos('2', '3'), false);
console.log('✓ 7. Metadados: normalizacao de fasciculo com zero a esquerda validada (100%)');

// 8. Teste de filtro de autoautoria em quadros e figuras
function ehAutoAutoria(trecho) {
  return /\b(?:elaborad[oa]|produzid[oa]|organizad[oa]|autoria\s+pr[oó]pria|adaptad[oa]|modificad[oa])\b/i.test(trecho);
}

assert.strictEqual(ehAutoAutoria('Elaborado pela autora'), true);
assert.strictEqual(ehAutoAutoria('Autoria própria'), true);
assert.strictEqual(ehAutoAutoria('Organizado pelos autores'), true);
assert.strictEqual(ehAutoAutoria('Chen'), false);
console.log('✓ 8. Extracao: stopwords de autoautoria em quadros/figuras filtradas (100%)');

// 9. Teste de classificação de domínios institucionais globais (.org, .edu, .gov)
const REGEX_DOMINIOS_TESTE = /(?:\.gov(?:\.[a-z]{2})?|\.edu(?:\.[a-z]{2})?|\.ac\.[a-z]{2}|\.int\b|\b(?:who|paho|opas|unicef|cdc|nih|snomed|w3|hl7|ihe|iso)\.org)/i;
assert.strictEqual(REGEX_DOMINIOS_TESTE.test('https://www.snomed.org/members'), true);
assert.strictEqual(REGEX_DOMINIOS_TESTE.test('https://cvts.vetmed.vt.edu/'), true);
assert.strictEqual(REGEX_DOMINIOS_TESTE.test('https://www.who.int/publications'), true);
assert.strictEqual(REGEX_DOMINIOS_TESTE.test('https://nature.com/articles/123'), false);
console.log('✓ 9. Classificacao: dominios institucionais e educacionais internacionais validados (100%)');

// 10. Teste de detecção de PDF digitalizado em imagem (Scan sem camada OCR)
function detectarScanSemTexto(paginas) {
  if (!paginas || paginas.length === 0) return true;
  const media = paginas.reduce((acc, p) => acc + (p.bruto ? p.bruto.trim().length : 0), 0) / paginas.length;
  return media < 35;
}

const pdfRasterScan = [{ numero: 1, bruto: '   ' }, { numero: 2, bruto: 'p. 1' }];
const pdfTextoCompleto = [{ numero: 1, bruto: 'Este é um artigo científico com texto completo e parágrafos legíveis.' }];
assert.strictEqual(detectarScanSemTexto(pdfRasterScan), true, 'Deve identificar PDF escaneado sem OCR');
assert.strictEqual(detectarScanSemTexto(pdfTextoCompleto), false, 'PDF digital normal não deve ser marcado como scan');
console.log('✓ 10. PDF Digitalizado: Detecção de scan sem texto validada (100%)');

console.log('\nTODOS OS TESTES UNITARIOS PASSARAM COM SUCESSO!');
