// Sincronização automática com arquivo library.bib para LaTeX, Typst e Overleaf.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const MAPEAMENTO_TIPOS = {
  'article-journal': 'article',
  book: 'book',
  chapter: 'incollection',
  'paper-conference': 'inproceedings',
  thesis: 'phdthesis',
  report: 'techreport',
  webpage: 'misc',
};

function escaparBibtex(str) {
  if (!str) return '';
  return String(str)
    .replace(/\\/g, '\\\\')
    .replace(/[{}]/g, '')
    .replace(/[#&_]/g, '\\$&');
}

function cslParaBibtexEntry(ref) {
  const csl = ref.csl || {};
  const tipo = MAPEAMENTO_TIPOS[csl.type] || 'misc';
  const id = (ref.id || 'ref').replace(/\s+/g, '_');
  const campos = [];

  if (csl.title) campos.push(`  title = {${escaparBibtex(csl.title)}}`);
  if (Array.isArray(csl.author)) {
    const autores = csl.author
      .map((a) => {
        if (a.family && a.given) return `${a.family}, ${a.given}`;
        return a.literal || a.family || 'Unknown';
      })
      .join(' and ');
    campos.push(`  author = {${escaparBibtex(autores)}}`);
  }
  const ano = csl.issued?.['date-parts']?.[0]?.[0];
  if (ano) campos.push(`  year = {${ano}}`);
  if (csl['container-title']) campos.push(`  journal = {${escaparBibtex(csl['container-title'])}}`);
  if (csl.volume) campos.push(`  volume = {${csl.volume}}`);
  if (csl.issue) campos.push(`  number = {${csl.issue}}`);
  if (csl.page) campos.push(`  pages = {${csl.page}}`);
  if (csl.DOI) campos.push(`  doi = {${csl.DOI}}`);
  if (csl.ISBN) campos.push(`  isbn = {${csl.ISBN}}`);
  if (csl.publisher) campos.push(`  publisher = {${escaparBibtex(csl.publisher)}}`);

  return `@${tipo}{${id},\n${campos.join(',\n')}\n}`;
}

async function sincronizarLibraryBib(raizBiblioteca, referencias) {
  if (!raizBiblioteca || !Array.isArray(referencias)) return;
  try {
    const caminhoBib = path.join(raizBiblioteca, 'library.bib');
    const entradas = referencias
      .filter((r) => r && r.status !== 'descartada')
      .map(cslParaBibtexEntry)
      .join('\n\n');
    const cabecalho = `% Sincronizado automaticamente por Bibliografia\n% Data: ${new Date().toISOString()}\n\n`;
    await fsp.writeFile(caminhoBib, cabecalho + entradas, 'utf8');
  } catch (e) {
    // Falha silenciosa para não impedir salvar referência caso o arquivo esteja travado
  }
}

module.exports = { sincronizarLibraryBib, cslParaBibtexEntry };
