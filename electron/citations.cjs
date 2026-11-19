// Formatação de citações e bibliografias com citeproc-js (o mesmo motor do Zotero)
// e estilos CSL (ABNT, APA, Vancouver... e qualquer .csl extra da biblioteca).
const CSL = require('citeproc');
const fs = require('fs');
const path = require('path');
const { escreverArquivoAtomico } = require('./atomicWrite.cjs');

const RECURSOS = path.join(__dirname, '..', 'resources');

const NOMES = {
  // Família ABNT (NBR 6023 / 10520 e Universidades)
  'associacao-brasileira-de-normas-tecnicas': 'ABNT (NBR 6023/10520) – Autor-Data (Padrão)',
  'associacao-brasileira-de-normas-tecnicas-numerico': 'ABNT (NBR 6023/10520) – Numérico [1]',
  'associacao-brasileira-de-normas-tecnicas-note': 'ABNT – Notas de Rodapé',
  'associacao-brasileira-de-normas-tecnicas-usp-fmvz': 'ABNT – USP (FMVZ)',
  'universidade-de-sao-paulo-escola-de-comunicacoes-e-artes-abnt': 'ABNT – USP (ECA)',
  'universidade-de-sao-paulo-instituto-de-matematica-e-estatistica': 'ABNT – USP (IME)',
  'associacao-brasileira-de-normas-tecnicas-ufmg-face-full': 'ABNT – UFMG (Nomes Completos)',
  'associacao-brasileira-de-normas-tecnicas-ufmg-face-initials': 'ABNT – UFMG (Iniciais)',
  'associacao-brasileira-de-normas-tecnicas-ufrgs': 'ABNT – UFRGS (Nomes Completos)',
  'associacao-brasileira-de-normas-tecnicas-ufrgs-initials': 'ABNT – UFRGS (Iniciais)',
  'associacao-brasileira-de-normas-tecnicas-ufrgs-note-initials-with-ibid': 'ABNT – UFRGS (Notas c/ Ibid.)',
  'associacao-brasileira-de-normas-tecnicas-ufpr': 'ABNT – UFPR',
  'associacao-brasileira-de-normas-tecnicas-ufs': 'ABNT – UFS (Sergipe)',
  'universidade-do-estado-do-rio-de-janeiro-abnt': 'ABNT – UERJ',
  'pontificia-universidade-catolica-do-parana-abnt': 'ABNT – PUCPR',
  'universidade-estadual-de-alagoas-abnt': 'ABNT – UNEAL',
  'associacao-brasileira-de-normas-tecnicas-ipea': 'ABNT – IPEA',
  'associacao-brasileira-de-normas-tecnicas-eceme': 'ABNT – ECEME',
  'associacao-brasileira-de-normas-tecnicas-instituto-meira-mattos': 'ABNT – Instituto Meira Mattos',

  // Família Vancouver e Área da Saúde / Medicina
  vancouver: 'Vancouver – Padrão NLM/ICMJE (1)',
  'sage-vancouver-brackets': 'Vancouver – Colchetes [1] (SAGE)',
  'elsevier-vancouver': 'Vancouver – Numérico (Elsevier)',
  'elsevier-vancouver-short-author-list': 'Vancouver – Lista Curta de Autores (et al. após 3)',
  'elsevier-vancouver-no-et-al': 'Vancouver – Todos os Autores (Sem et al.)',
  'elsevier-vancouver-author-date': 'Vancouver – Autor-Data (Elsevier)',
  'elsevier-vancouver-author-date-alphabetical': 'Vancouver – Autor-Data Alfabético',
  'nature-publishing-group-vancouver': 'Vancouver – Sobrescrito (Nature Group)',
  'mary-ann-liebert-vancouver': 'Vancouver – Mary Ann Liebert',
  'cardiff-university-vancouver': 'Vancouver – Cardiff University',
  'medizinische-universitat-innsbruck-vancouver': 'Vancouver – Med. Univ. Innsbruck',
  'bibliotheque-universitaire-de-medecine-vancouver': 'Vancouver – Medicina (BU)',
  'african-online-scientific-information-systems-vancouver': 'Vancouver – AOSIS Saúde',
  'nlm-citation-sequence': 'NLM / PubMed (Sequência de Citação)',
  'american-medical-association': 'AMA 11ª edição (JAMA / Medicina)',
  'the-lancet': 'The Lancet (Saúde / Medicina)',
  bmj: 'BMJ (British Medical Journal)',
  nature: 'Nature',

  // APA, Harvard, Chicago, IEEE
  apa: 'APA 7ª edição (Autor-Data)',
  'apa-numeric-superscript-brackets': 'APA – Numérico Sobrescrito [1]',
  'harvard-cite-them-right': 'Harvard (Cite Them Right)',
  'chicago-author-date': 'Chicago (Autor-Data)',
  ieee: 'IEEE (Numérico [1])',
};

function tituloDoCsl(xml) {
  const m = xml.match(/<title>([^<]*)<\/title>/);
  return m ? m[1] : null;
}

/** Lista os estilos embutidos + os .csl que o usuário colocar em <biblioteca>/estilos. */
function listarEstilos(raizBiblioteca) {
  const estilos = [];
  const add = (dir, origem) => {
    if (!dir || !fs.existsSync(dir)) return;
    for (const f of fs.readdirSync(dir).filter((x) => x.toLowerCase().endsWith('.csl'))) {
      const id = f.slice(0, -4);
      if (estilos.some((e) => e.id === id)) continue;
      let nome = NOMES[id];
      if (!nome) {
        try { nome = tituloDoCsl(fs.readFileSync(path.join(dir, f), 'utf8')); } catch { /* ignora */ }
      }
      estilos.push({ id, nome: nome || id, origem, arquivo: path.join(dir, f) });
    }
  };
  add(raizBiblioteca && path.join(raizBiblioteca, 'estilos'), 'biblioteca');
  add(path.join(RECURSOS, 'estilos'), 'embutido');
  const ordem = Object.keys(NOMES);
  return estilos.sort((a, b) => {
    const ia = ordem.indexOf(a.id), ib = ordem.indexOf(b.id);
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.nome.localeCompare(b.nome);
  });
}

const cacheXml = new Map();
function lerXml(arquivo) {
  const st = fs.statSync(arquivo);
  const c = cacheXml.get(arquivo);
  if (c && c.mtime === st.mtimeMs) return c.xml;
  const xml = fs.readFileSync(arquivo, 'utf8');
  cacheXml.set(arquivo, { xml, mtime: st.mtimeMs });
  return xml;
}

function lerLocale(lang) {
  const tentar = [lang, lang?.split('-')[0] === 'pt' ? 'pt-BR' : null, 'en-US'].filter(Boolean);
  for (const l of tentar) {
    const f = path.join(RECURSOS, 'locales', `locales-${l}.xml`);
    if (fs.existsSync(f)) return lerXml(f);
  }
  return lerXml(path.join(RECURSOS, 'locales', 'locales-en-US.xml'));
}

function criarMotor(estilo, itens, idioma, formato) {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const sys = {
    retrieveLocale: (lang) => lerLocale(lang),
    retrieveItem: (id) => porId.get(id),
  };
  const motor = new CSL.Engine(sys, lerXml(estilo.arquivo), idioma || 'pt-BR', true);
  motor.setOutputFormat(formato);
  motor.updateItems(itens.map((i) => i.id));
  return motor;
}

/**
 * Formata citações e bibliografia.
 * @returns {{ citacao: string, citacaoTexto: string, bibliografiaHtml: string, bibliografiaTexto: string, entradas: string[] }}
 */
function formatar({ itens, estiloId, idioma, raizBiblioteca }) {
  const estilos = listarEstilos(raizBiblioteca);
  const estilo = estilos.find((e) => e.id === estiloId) || estilos[0];
  if (!itens.length) return { citacao: '', citacaoTexto: '', bibliografiaHtml: '', bibliografiaTexto: '', entradas: [] };

  const html = criarMotor(estilo, itens, idioma, 'html');
  const texto = criarMotor(estilo, itens, idioma, 'text');
  const cluster = itens.map((i) => ({ id: i.id }));

  let citacao = '', citacaoTexto = '';
  try {
    citacao = html.makeCitationCluster(cluster);
    citacaoTexto = texto.makeCitationCluster(cluster);
  } catch { /* alguns estilos só de nota podem falhar aqui */ }

  const bibHtml = html.makeBibliography();
  const bibTexto = texto.makeBibliography();
  const entradas = bibHtml ? bibHtml[1] : [];
  return {
    estilo: estilo.id,
    citacao,
    citacaoTexto,
    entradas,
    bibliografiaHtml: bibHtml ? bibHtml[0].bibstart + bibHtml[1].join('') + bibHtml[0].bibend : '',
    bibliografiaTexto: bibTexto ? bibTexto[1].map((s) => s.trim()).join('\n') : '',
  };
}

let cacheArvoreCsl = null;

/** Busca estilos no repositório oficial do Citation Style Language / Zotero (+2.800 estilos). */
async function buscarEstilosOnline(consulta) {
  const q = String(consulta || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
  if (!cacheArvoreCsl) {
    const res = await fetch('https://api.github.com/repos/citation-style-language/styles/git/trees/master', {
      headers: { 'User-Agent': 'Bibliografia/0.2', Accept: 'application/vnd.github+json' },
    });
    if (!res.ok) throw new Error(`Falha ao consultar o catálogo online (HTTP ${res.status}).`);
    const json = await res.json();
    cacheArvoreCsl = (json.tree || [])
      .filter((x) => x.path && x.path.endsWith('.csl') && !x.path.includes('/'))
      .map((x) => x.path.slice(0, -4));
  }
  const termos = q.split(/\s+/).filter(Boolean);
  const filtrados = cacheArvoreCsl.filter((id) => termos.every((t) => id.includes(t))).slice(0, 40);
  return filtrados.map((id) => ({
    id,
    nomeSugerido: id.replace(/-/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase()),
  }));
}

/** Baixa um estilo .csl do repositório oficial e salva em <biblioteca>/estilos/<id>.csl */
async function instalarEstiloOnline(id, raizBiblioteca) {
  if (!raizBiblioteca) throw new Error('Nenhuma pasta de biblioteca configurada.');
  const limpo = String(id || '').replace(/[^a-z0-9_-]/gi, '');
  const url = `https://raw.githubusercontent.com/citation-style-language/styles/master/${limpo}.csl`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Bibliografia/0.2' } });
  if (!res.ok) throw new Error(`Não foi possível baixar o estilo ${limpo} (HTTP ${res.status}).`);
  let xml = await res.text();

  // Se for um estilo dependente (link rel="independent-parent"), baixa o estilo-pai mantendo o título
  const mPai = xml.match(/rel="independent-parent"\s+href="https?:\/\/www\.zotero\.org\/styles\/([^"]+)"/i) ||
               xml.match(/href="https?:\/\/www\.zotero\.org\/styles\/([^"]+)"\s+rel="independent-parent"/i);
  const tituloOriginal = tituloDoCsl(xml);
  if (mPai) {
    const paiId = mPai[1];
    const resPai = await fetch(`https://raw.githubusercontent.com/citation-style-language/styles/master/${paiId}.csl`);
    if (resPai.ok) {
      xml = await resPai.text();
      if (tituloOriginal) {
        xml = xml.replace(/<title>[^<]*<\/title>/, `<title>${tituloOriginal}</title>`);
      }
    }
  }

  const dir = path.join(raizBiblioteca, 'estilos');
  await fs.promises.mkdir(dir, { recursive: true });
  const destino = path.join(dir, `${limpo}.csl`);
  await escreverArquivoAtomico(destino, xml, 'utf8');
  return { id: limpo, nome: tituloDoCsl(xml) || limpo };
}

/** Importa um arquivo .csl local do computador para <biblioteca>/estilos/ */
async function importarArquivoCsl(caminhoOrigem, raizBiblioteca) {
  if (!raizBiblioteca) throw new Error('Nenhuma pasta de biblioteca configurada.');
  const xml = await fs.promises.readFile(caminhoOrigem, 'utf8');
  if (!xml.includes('<style')) throw new Error('O arquivo selecionado não parece ser um estilo .csl válido.');
  const dir = path.join(raizBiblioteca, 'estilos');
  await fs.promises.mkdir(dir, { recursive: true });
  const nomeArq = path.basename(caminhoOrigem).toLowerCase().endsWith('.csl')
    ? path.basename(caminhoOrigem)
    : `${path.basename(caminhoOrigem)}.csl`;
  const destino = path.join(dir, nomeArq);
  await escreverArquivoAtomico(destino, xml, 'utf8');
  const id = nomeArq.slice(0, -4);
  return { id, nome: tituloDoCsl(xml) || id };
}

module.exports = { listarEstilos, formatar, buscarEstilosOnline, instalarEstiloOnline, importarArquivoCsl };
