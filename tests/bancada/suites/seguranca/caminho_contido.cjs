// Implementação de referência da contenção de caminhos (para o IPC do Electron).
// Usa path.relative em vez de startsWith, o que evita o desvio por prefixo (C:\Bib e C:\Bib2).
const path = require('path');

function garantirCaminhoContido(raiz, sub, p = path) {
  if (typeof sub !== 'string' || sub.includes('\0')) throw new Error('caminho inválido');
  const r = p.resolve(raiz);
  const alvo = p.resolve(r, sub || '.');
  const sep = p === path.win32 ? (s) => s.toLowerCase() : (s) => s;
  const rel = p.relative(sep(r), sep(alvo));
  if (rel === '') return alvo;
  if (rel.startsWith('..') || p.isAbsolute(rel)) throw new Error('acesso negado: fora da pasta da biblioteca');
  return alvo;
}

module.exports = { garantirCaminhoContido };

if (require.main === module) {
  // modo de teste: node caminho_contido.cjs casos.json  -> imprime JSON com o veredito de cada caso
  const casos = require(require('path').resolve(process.argv[2]));
  const out = casos.map((c) => {
    const p = c.plataforma === 'win32' ? path.win32 : path.posix;
    try { garantirCaminhoContido(c.raiz, c.sub, p); return { id: c.id, veredito: 'permitir' }; }
    catch { return { id: c.id, veredito: 'negar' }; }
  });
  console.log(JSON.stringify(out));
}
