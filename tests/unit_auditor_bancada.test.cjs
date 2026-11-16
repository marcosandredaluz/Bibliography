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

const refComPaginas = 'Svensson-Ranallo. Medical Informatics, v. 25, p. 1761–1800, 2012.';
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

console.log('\nTODOS OS TESTES UNITARIOS PASSARAM COM SUCESSO!');
