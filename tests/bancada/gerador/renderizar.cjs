// Renderiza um plano com citeproc-js: devolve o HTML de cada aglomerado de citação e da bibliografia.
// Uso: node renderizar.cjs plano.json saida.json
const fs = require('fs');
const path = require('path');
const CSL = require('citeproc');

const SRC = path.join(__dirname, '..', 'src');
const plano = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const itens = Object.fromEntries(plano.itens.map((i) => [i.id, i]));

const sys = {
  retrieveLocale: (lang) => {
    const f = path.join(SRC, `locales-${lang}.xml`);
    return fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : fs.readFileSync(path.join(SRC, 'locales-en-US.xml'), 'utf8');
  },
  retrieveItem: (id) => itens[id],
};
const estilo = fs.readFileSync(path.join(SRC, plano.csl + '.csl'), 'utf8');
const eng = new CSL.Engine(sys, estilo, plano.locale, true);
eng.setOutputFormat('html');

// Monta a sequência de aglomerados na ordem do texto
const seq = []; // {chave, citeItems, modo}
let n = 0;
function registra(cl, onde) {
  if (!cl) return;
  const base = cl.itens.map((x) => ({ id: x.id, ...(x.locator ? { locator: x.locator, label: x.label } : {}) }));
  if (cl.narrativa) {
    seq.push({ chave: `${onde}#a`, citeItems: base.map((b) => ({ ...b, 'author-only': true })) });
    seq.push({ chave: `${onde}#s`, citeItems: base.map((b) => ({ ...b, 'suppress-author': true })) });
  } else {
    seq.push({ chave: onde, citeItems: base });
  }
}
plano.paragrafos.forEach((fr, p) => fr.forEach((f, s) => registra(f.citacao, `p${p}s${s}`)));
registra(plano.direta.citacao, 'direta');
plano.tabela.forEach((lin, i) => registra(lin[2], `tab${i}`));
registra(plano.base_fonte, 'fonte');

const pre = [];
const resultado = {};
const idPorIndice = [];
seq.forEach((c, i) => {
  const citation = { citationID: `c${i}`, citationItems: c.citeItems, properties: { noteIndex: 0 } };
  const [, upd] = eng.processCitationCluster(citation, pre, []);
  for (const [idx, str] of upd) resultado[idx] = str;
  pre.push([`c${i}`, 0]);
  idPorIndice.push(c.chave);
});
const aglomerados = {};
idPorIndice.forEach((k, i) => (aglomerados[k] = resultado[i]));

if (plano.injecoes.nao_citadas.length) eng.updateUncitedItems(plano.injecoes.nao_citadas);
const bib = eng.makeBibliography();
const entradas = bib ? bib[1].map((h, i) => ({ id: bib[0].entry_ids[i][0], html: h })) : [];

// Ordem dos números nos estilos numéricos: o registro do citeproc dá a ordem final
fs.writeFileSync(process.argv[3], JSON.stringify({ aglomerados, entradas }, null, 0));
