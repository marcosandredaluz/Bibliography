// Central de Buscadores: catálogo (editável), contagem automática via APIs abertas,
// resultados importáveis e histórico de buscas (para comparação e PRISMA).
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const UA = 'Bibliografia/1.2 (mailto:pesquisa@bibliografia.local; gerenciador de referencias academico)';

// login: 'livre' | 'parcial' | 'cadastro' | 'cafe' (CAPES/CAFe/instituição) | 'assinatura'
// {q} = termo de busca. Sem {q}, o link abre a página inicial do buscador.
const CATALOGO_PADRAO = [
  // Saúde – bases principais
  { id: 'pubmed', nome: 'PubMed / MEDLINE', categoria: 'Saúde – bases principais', login: 'livre', contagem: 'pubmed', url: 'https://pubmed.ncbi.nlm.nih.gov/?term={q}', descricao: 'Biomedicina e ciências da vida (NLM/EUA).' },
  { id: 'bvs', nome: 'BVS – Biblioteca Virtual em Saúde', categoria: 'Saúde – bases principais', login: 'livre', url: 'https://pesquisa.bvsalud.org/portal/?q={q}', descricao: 'Portal regional: LILACS, MEDLINE, BDENF, IBECS e outras.' },
  { id: 'lilacs', nome: 'LILACS', categoria: 'Saúde – bases principais', login: 'livre', url: 'https://pesquisa.bvsalud.org/portal/?q={q}&filter%5Bdb%5D%5B%5D=LILACS', descricao: 'Literatura latino-americana e do Caribe em saúde.' },
  { id: 'scielo', nome: 'SciELO', categoria: 'Saúde – bases principais', login: 'livre', url: 'https://search.scielo.org/?q={q}&lang=pt', descricao: 'Periódicos de acesso aberto da América Latina, Espanha e Portugal.' },
  { id: 'europepmc', nome: 'Europe PMC', categoria: 'Saúde – bases principais', login: 'livre', contagem: 'europepmc', url: 'https://europepmc.org/search?query={q}', descricao: 'PubMed + PMC + preprints + patentes; muito texto completo aberto.' },
  { id: 'embase', nome: 'Embase', categoria: 'Saúde – bases principais', login: 'cafe', url: 'https://www.embase.com/', descricao: 'Biomedicina e farmacologia (Elsevier). Acesso via CAPES/CAFe.' },
  { id: 'cinahl', nome: 'CINAHL (EBSCO)', categoria: 'Saúde – bases principais', login: 'cafe', url: 'https://search.ebscohost.com/', descricao: 'Enfermagem e profissões da saúde.' },
  { id: 'pedro', nome: 'PEDro', categoria: 'Saúde – bases principais', login: 'livre', url: 'https://search.pedro.org.au/', descricao: 'Evidências em fisioterapia.' },

  // Evidência
  { id: 'cochrane', nome: 'Cochrane Library', categoria: 'Evidência e revisões sistemáticas', login: 'parcial', url: 'https://www.cochranelibrary.com/search?searchBy=1&searchText={q}', descricao: 'Revisões sistemáticas e CENTRAL (ensaios controlados).' },
  { id: 'epistemonikos', nome: 'Epistemonikos', categoria: 'Evidência e revisões sistemáticas', login: 'livre', url: 'https://www.epistemonikos.org/pt/search?q={q}', descricao: 'Revisões sistemáticas e estudos primários relacionados.' },
  { id: 'trip', nome: 'TRIP Database', categoria: 'Evidência e revisões sistemáticas', login: 'parcial', url: 'https://www.tripdatabase.com/Searchresult?criteria={q}', descricao: 'Busca rápida de evidência clínica e diretrizes.' },
  { id: 'prospero', nome: 'PROSPERO', categoria: 'Evidência e revisões sistemáticas', login: 'livre', url: 'https://www.crd.york.ac.uk/prospero/', descricao: 'Registro de protocolos de revisões sistemáticas.' },

  // Ensaios clínicos
  { id: 'ctgov', nome: 'ClinicalTrials.gov', categoria: 'Ensaios clínicos', login: 'livre', contagem: 'ctgov', url: 'https://clinicaltrials.gov/search?term={q}', descricao: 'Registro de ensaios clínicos (EUA/mundo).' },
  { id: 'rebec', nome: 'ReBEC', categoria: 'Ensaios clínicos', login: 'livre', url: 'https://ensaiosclinicos.gov.br/', descricao: 'Registro Brasileiro de Ensaios Clínicos.' },
  { id: 'ictrp', nome: 'OMS – ICTRP', categoria: 'Ensaios clínicos', login: 'livre', url: 'https://trialsearch.who.int/', descricao: 'Plataforma internacional de registros de ensaios (OMS).' },

  // Multidisciplinares
  { id: 'capes', nome: 'Portal de Periódicos CAPES', categoria: 'Multidisciplinares', login: 'cafe', url: 'https://www.periodicos.capes.gov.br/index.php/acervo/buscador.html?q={q}', descricao: 'Acesso a Scopus, WoS, Embase etc. via login CAFe da instituição.' },
  { id: 'scopus', nome: 'Scopus', categoria: 'Multidisciplinares', login: 'cafe', url: 'https://www.scopus.com/results/results.uri?src=s&sot=b&sdt=b&s=TITLE-ABS-KEY({q})', descricao: 'Base multidisciplinar com métricas de citação (Elsevier).' },
  { id: 'wos', nome: 'Web of Science', categoria: 'Multidisciplinares', login: 'cafe', url: 'https://www.webofscience.com/wos/woscc/basic-search', descricao: 'Base multidisciplinar com índice de citações (Clarivate).' },
  { id: 'scholar', nome: 'Google Acadêmico', categoria: 'Multidisciplinares', login: 'livre', url: 'https://scholar.google.com/scholar?hl=pt-BR&q={q}', descricao: 'Amplo, inclui literatura cinzenta. Bom para complementar.' },
  { id: 'openalex', nome: 'OpenAlex', categoria: 'Multidisciplinares', login: 'livre', contagem: 'openalex', url: 'https://openalex.org/works?filter=default.search:{q}', descricao: 'Catálogo aberto com mais de 250 milhões de trabalhos.' },
  { id: 'semanticscholar', nome: 'Semantic Scholar', categoria: 'Multidisciplinares', login: 'livre', url: 'https://www.semanticscholar.org/search?q={q}', descricao: 'Busca com IA, resumos TLDR e rede de citações.' },
  { id: 'lens', nome: 'Lens.org', categoria: 'Multidisciplinares', login: 'livre', url: 'https://www.lens.org/lens/search/scholar/list?q={q}', descricao: 'Literatura acadêmica e patentes.' },
  { id: 'crossref', nome: 'Crossref', categoria: 'Multidisciplinares', login: 'livre', contagem: 'crossref', url: 'https://search.crossref.org/search/works?q={q}&from_ui=yes', descricao: 'Registro oficial de DOIs.' },

  // Teses
  { id: 'bdtd', nome: 'BDTD (IBICT)', categoria: 'Teses e dissertações', login: 'livre', url: 'https://bdtd.ibict.br/vufind/Search/Results?lookfor={q}&type=AllFields', descricao: 'Biblioteca Digital Brasileira de Teses e Dissertações.' },
  { id: 'capesteses', nome: 'Catálogo de Teses CAPES', categoria: 'Teses e dissertações', login: 'livre', url: 'https://catalogodeteses.capes.gov.br/catalogo-teses/', descricao: 'Teses e dissertações defendidas no Brasil.' },

  // Descritores
  { id: 'decs', nome: 'DeCS/MeSH (BVS)', categoria: 'Descritores', login: 'livre', url: 'https://decs.bvsalud.org/', descricao: 'Descritores em Ciências da Saúde (português/inglês/espanhol).' },
  { id: 'mesh', nome: 'MeSH (NLM)', categoria: 'Descritores', login: 'livre', url: 'https://www.ncbi.nlm.nih.gov/mesh/?term={q}', descricao: 'Medical Subject Headings – vocabulário do PubMed.' },

  // Consulta clínica
  { id: 'uptodate', nome: 'UpToDate', categoria: 'Consulta clínica', login: 'assinatura', url: 'https://www.uptodate.com/contents/search?search={q}', descricao: 'Suporte à decisão clínica (assinatura).' },
  { id: 'dynamed', nome: 'DynaMed', categoria: 'Consulta clínica', login: 'assinatura', url: 'https://www.dynamed.com/', descricao: 'Suporte à decisão clínica (EBSCO).' },
];

async function buscarJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') throw new Error('tempo esgotado');
    throw e;
  } finally {
    clearTimeout(t);
  }
}

const enc = encodeURIComponent;

// ---------- Contagem de resultados ----------
const CONTADORES = {
  pubmed: async (q) => Number((await buscarJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=0&term=${enc(q)}`)).esearchresult?.count ?? NaN),
  europepmc: async (q) => (await buscarJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&pageSize=1&query=${enc(q)}`)).hitCount,
  openalex: async (q) => {
    const d = await buscarJson(`https://api.openalex.org/works?per-page=1&search=${enc(q)}`);
    if (d?.meta?.count != null) return d.meta.count;
    if (d?.error) throw new Error(d.error === 'Rate limit exceeded' ? 'Limite temporário da API OpenAlex' : String(d.error));
    throw new Error('resposta inesperada');
  },
  ctgov: async (q) => (await buscarJson(`https://clinicaltrials.gov/api/v2/studies?countTotal=true&pageSize=1&query.term=${enc(q)}`)).totalCount,
  crossref: async (q) => (await buscarJson(`https://api.crossref.org/works?rows=0&query=${enc(q)}`)).message?.['total-results'],
};

async function contar(contadorId, q) {
  const fn = CONTADORES[contadorId];
  if (!fn) throw new Error('Este buscador não tem contagem automática.');
  const n = await fn(q);
  if (n == null || Number.isNaN(n)) throw new Error('resposta inesperada');
  return n;
}

// ---------- Resultados importáveis ----------
async function resultadosPubmed(q, n = 20) {
  const ids = (await buscarJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&sort=relevance&retmax=${n}&term=${enc(q)}`)).esearchresult?.idlist || [];
  if (!ids.length) return [];
  const s = (await buscarJson(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(',')}`)).result || {};
  return ids.map((id) => {
    const r = s[id] || {};
    const doi = (r.articleids || []).find((a) => a.idtype === 'doi')?.value;
    return {
      pmid: id,
      doi,
      titulo: r.title || '',
      autores: (r.authors || []).slice(0, 4).map((a) => a.name).join(', ') + ((r.authors || []).length > 4 ? ' et al.' : ''),
      ano: (r.pubdate || '').slice(0, 4),
      fonte: r.fulljournalname || r.source || '',
      tipos: r.pubtype || [],
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
    };
  });
}

async function resultadosEuropePmc(q, n = 20) {
  const d = await buscarJson(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=lite&pageSize=${n}&query=${enc(q)}`);
  return (d.resultList?.result || []).map((r) => ({
    pmid: r.pmid,
    doi: r.doi,
    titulo: r.title || '',
    autores: r.authorString || '',
    ano: r.pubYear || '',
    fonte: r.journalTitle || r.bookOrReportDetails?.publisher || '',
    acessoAberto: r.isOpenAccess === 'Y',
    url: r.pmid ? `https://europepmc.org/article/MED/${r.pmid}` : r.doi ? `https://doi.org/${r.doi}` : null,
  }));
}

async function resultadosOpenAlex(q, n = 20) {
  const d = await buscarJson(`https://api.openalex.org/works?per-page=${n}&search=${enc(q)}`);
  return (d.results || []).map((r) => ({
    doi: r.doi ? r.doi.replace(/^https?:\/\/doi\.org\//i, '') : null,
    pmid: r.ids?.pmid ? String(r.ids.pmid).replace(/\D/g, '') : null,
    titulo: r.display_name || r.title || '',
    autores: (r.authorships || []).slice(0, 4).map((a) => a.author?.display_name).filter(Boolean).join(', ') + ((r.authorships || []).length > 4 ? ' et al.' : ''),
    ano: r.publication_year || '',
    fonte: r.primary_location?.source?.display_name || '',
    citacoes: r.cited_by_count,
    acessoAberto: !!r.open_access?.is_oa,
    url: r.doi || r.id,
  }));
}

const RESULTADOS = { pubmed: resultadosPubmed, europepmc: resultadosEuropePmc, openalex: resultadosOpenAlex };

async function resultados(fonte, q) {
  const fn = RESULTADOS[fonte];
  if (!fn) throw new Error('Fonte sem listagem de resultados.');
  return fn(q);
}

// ---------- Catálogo personalizado e histórico (na pasta da biblioteca) ----------
async function lerCatalogo(raiz) {
  let personal = { buscadores: [], ocultos: [], favoritos: null };
  try {
    personal = { ...personal, ...JSON.parse(await fsp.readFile(path.join(raiz, 'buscadores.json'), 'utf8')) };
  } catch { /* ainda não personalizado */ }
  const favoritos = personal.favoritos || ['pubmed', 'bvs', 'scielo', 'cochrane', 'europepmc', 'scholar', 'capes'];
  const porId = new Map(CATALOGO_PADRAO.map((b) => [b.id, { ...b, padrao: true }]));
  for (const b of personal.buscadores || []) porId.set(b.id, { ...(porId.get(b.id) || {}), ...b, personalizado: true });
  return [...porId.values()].map((b) => ({
    ...b,
    oculto: (personal.ocultos || []).includes(b.id),
    favorito: favoritos.includes(b.id),
  }));
}

async function salvarCatalogo(raiz, { buscadores }) {
  // Guarda só o que difere do padrão (novos ou editados) + ocultos e favoritos.
  const padrao = new Map(CATALOGO_PADRAO.map((b) => [b.id, b]));
  const campos = ['nome', 'categoria', 'login', 'url', 'descricao', 'contagem'];
  const diffs = buscadores
    .filter((b) => {
      const p = padrao.get(b.id);
      return !p || campos.some((c) => (b[c] || '') !== (p[c] || ''));
    })
    .map((b) => Object.fromEntries(['id', ...campos].filter((c) => b[c] != null).map((c) => [c, b[c]])));
  const dados = {
    buscadores: diffs,
    ocultos: buscadores.filter((b) => b.oculto).map((b) => b.id),
    favoritos: buscadores.filter((b) => b.favorito).map((b) => b.id),
  };
  await fsp.writeFile(path.join(raiz, 'buscadores.json'), JSON.stringify(dados, null, 2), 'utf8');
  return lerCatalogo(raiz);
}

function dirBuscas(raiz) {
  return path.join(raiz, 'buscas');
}

async function listarBuscas(raiz) {
  const dir = dirBuscas(raiz);
  await fsp.mkdir(dir, { recursive: true });
  const arquivos = (await fsp.readdir(dir)).filter((f) => f.endsWith('.json'));
  const itens = [];
  for (const f of arquivos) {
    try {
      itens.push({ ...JSON.parse(await fsp.readFile(path.join(dir, f), 'utf8')), id: f.slice(0, -5) });
    } catch { /* ignora arquivo ilegível */ }
  }
  return itens.sort((a, b) => String(b.data).localeCompare(String(a.data)));
}

async function salvarBusca(raiz, busca) {
  const dir = dirBuscas(raiz);
  await fsp.mkdir(dir, { recursive: true });
  const agora = new Date();
  const id =
    busca.id ||
    `${agora.toISOString().slice(0, 19).replace(/[:T]/g, '-')}-${String(busca.consulta || 'busca')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .slice(0, 40)
      .replace(/^-|-$/g, '')}`;
  const dados = { ...busca, id, data: busca.data || agora.toISOString(), modificadoEm: agora.toISOString() };
  await fsp.writeFile(path.join(dir, `${id}.json`), JSON.stringify(dados, null, 2), 'utf8');
  return dados;
}

async function excluirBusca(raiz, id) {
  const arq = path.join(dirBuscas(raiz), `${path.basename(id)}.json`);
  if (fs.existsSync(arq)) {
    await fsp.mkdir(path.join(raiz, 'lixeira'), { recursive: true });
    await fsp.rename(arq, path.join(raiz, 'lixeira', `busca-${path.basename(id)}.json`));
  }
  return true;
}

module.exports = { CATALOGO_PADRAO, contar, resultados, lerCatalogo, salvarCatalogo, listarBuscas, salvarBusca, excluirBusca };
