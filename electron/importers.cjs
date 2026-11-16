// Fase 2 & 4:
// - Importação e exportação de arquivos RIS (.ris / .nbib) e BibTeX (.bib)
// - Busca de PDF gratuito (Open Access) via Unpaywall / OpenAlex / Europe PMC
// - Verificação de retratação (Retraction Watch / OpenAlex / Crossref)
// - Rede de citações (quem cita / referências citadas via OpenAlex)
const fs = require('fs');
const fsp = fs.promises;
const { normalizarDoi, separarNome } = require('./metadata.cjs');

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36 (mailto:pesquisa@bibliografia.local)';

async function buscarJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

// ---------- 1. Importador RIS / NBIB (PubMed, Scopus, Embase, BVS, SciELO, Zotero, Mendeley) ----------
const MAPA_TIPO_RIS = {
  JOUR: 'article-journal',
  BOOK: 'book',
  CHAP: 'chapter',
  CONF: 'paper-conference',
  CPAPER: 'paper-conference',
  THES: 'thesis',
  RPRT: 'report',
  ELEC: 'webpage',
  NEWS: 'article-newspaper',
  MGZN: 'article-magazine',
};

function parseRis(texto) {
  const itens = [];
  const blocos = String(texto || '').split(/\r?\nER\s*-\s*.*(?:\r?\n|$)/);
  for (const bloco of blocos) {
    const linhas = bloco.split(/\r?\n/);
    const tags = {};
    let ultimaTag = null;
    for (const l of linhas) {
      const m = l.match(/^([A-Z0-9]{2,4})\s*-\s?(.*)$/);
      if (m) {
        ultimaTag = m[1].trim();
        (tags[ultimaTag] ||= []).push(m[2].trim());
      } else if (ultimaTag && l.trim()) {
        const arr = tags[ultimaTag];
        arr[arr.length - 1] += ' ' + l.trim();
      }
    }
    const primeiro = (...chaves) => {
      for (const k of chaves) if (tags[k]?.[0]) return tags[k][0];
      return undefined;
    };
    const todos = (...chaves) => chaves.flatMap((k) => tags[k] || []);

    const titulo = primeiro('TI', 'T1', 'CT', 'BT');
    if (!titulo && !primeiro('DO', 'LID', 'PMID')) continue;

    const tipoRis = primeiro('TY') || 'JOUR';
    const csl = {
      type: MAPA_TIPO_RIS[tipoRis] || 'article-journal',
      title: titulo || '(Sem título)',
    };
    const autores = todos('AU', 'A1', 'FAU').map(separarNome).filter(Boolean);
    if (autores.length) csl.author = autores;

    const periodico = primeiro('T2', 'JF', 'JO', 'JA', 'JT', 'BT');
    if (periodico && periodico !== titulo) csl['container-title'] = periodico;

    const anoStr = primeiro('PY', 'Y1', 'DA', 'DP');
    const mAno = String(anoStr || '').match(/\b(19\d\d|20\d\d)\b/);
    if (mAno) csl.issued = { 'date-parts': [[Number(mAno[1])]] };

    if (primeiro('VL', 'VI')) csl.volume = primeiro('VL', 'VI');
    if (primeiro('IS', 'IP')) csl.issue = primeiro('IS', 'IP');
    const sp = primeiro('SP', 'PG');
    const ep = primeiro('EP');
    if (sp) csl.page = ep && !sp.includes('-') ? `${sp}-${ep}` : sp;
    if (primeiro('PB')) csl.publisher = primeiro('PB');
    if (primeiro('CY', 'PP')) csl['publisher-place'] = primeiro('CY', 'PP');
    if (primeiro('SN')) csl.ISSN = primeiro('SN');
    if (primeiro('AB', 'N2')) csl.abstract = primeiro('AB', 'N2');
    if (primeiro('UR', 'L2')) csl.URL = primeiro('UR', 'L2');
    if (primeiro('PMID')) csl.PMID = primeiro('PMID').replace(/\D/g, '');

    const doiCand = todos('DO', 'LID', 'AID', 'N1', 'M3').join(' ');
    const doi = normalizarDoi(doiCand);
    if (doi) csl.DOI = doi;

    const kws = todos('KW', 'MH', 'OT').map((k) => k.replace(/\*$/, '').trim()).filter(Boolean);
    itens.push({ csl, tags: kws.slice(0, 12) });
  }
  return itens;
}

// ---------- 2. Importador BibTeX (.bib) ----------
const MAPA_TIPO_BIB = {
  article: 'article-journal',
  book: 'book',
  incollection: 'chapter',
  inbook: 'chapter',
  inproceedings: 'paper-conference',
  conference: 'paper-conference',
  phdthesis: 'thesis',
  mastersthesis: 'thesis',
  techreport: 'report',
  misc: 'document',
};

function limparValorBib(v) {
  return String(v || '')
    .replace(/^[{"]+|["},]+$/g, '')
    .replace(/[{}]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseBibtex(texto) {
  const itens = [];
  const entradas = String(texto || '').split(/(?=@[a-zA-Z]+\s*\{)/);
  for (const ent of entradas) {
    const mCab = ent.match(/^@([a-zA-Z]+)\s*\{\s*([^,]+),([\s\S]*)\}\s*$/);
    if (!mCab) continue;
    const tipoBib = mCab[1].toLowerCase();
    const corpo = mCab[3];
    const campos = {};
    const reCampo = /([a-zA-Z0-9_-]+)\s*=\s*(\{(?:[^{}]|\{[^{}]*\})*\}|"[^"]*"|[^,\r\n]+)/g;
    let m;
    while ((m = reCampo.exec(corpo)) !== null) {
      campos[m[1].toLowerCase()] = limparValorBib(m[2]);
    }
    if (!campos.title && !campos.doi) continue;
    const csl = {
      type: MAPA_TIPO_BIB[tipoBib] || 'article-journal',
      title: campos.title || '(Sem título)',
    };
    if (campos.author) {
      csl.author = campos.author.split(/\s+and\s+/i).map(separarNome).filter(Boolean);
    }
    if (campos.journal || campos.booktitle) csl['container-title'] = campos.journal || campos.booktitle;
    if (campos.year && /^\d{4}$/.test(campos.year)) csl.issued = { 'date-parts': [[Number(campos.year)]] };
    if (campos.volume) csl.volume = campos.volume;
    if (campos.number) csl.issue = campos.number;
    if (campos.pages) csl.page = campos.pages.replace(/--/g, '-');
    if (campos.publisher || campos.school || campos.institution) {
      csl.publisher = campos.publisher || campos.school || campos.institution;
    }
    if (campos.address) csl['publisher-place'] = campos.address;
    if (campos.doi) csl.DOI = normalizarDoi(campos.doi) || campos.doi;
    if (campos.isbn) csl.ISBN = campos.isbn;
    if (campos.issn) csl.ISSN = campos.issn;
    if (campos.url) csl.URL = campos.url;
    if (campos.pmid) csl.PMID = campos.pmid;
    if (campos.abstract) csl.abstract = campos.abstract;
    const tags = campos.keywords
      ? campos.keywords.split(/[,;]/).map((s) => s.trim()).filter(Boolean)
      : [];
    itens.push({ csl, tags });
  }
  return itens;
}

function importarTextoBibliografia(texto, nomeArquivo = '') {
  const t = String(texto || '').trim();
  if (nomeArquivo.toLowerCase().endsWith('.bib') || /^@[a-zA-Z]+\s*\{/m.test(t)) {
    return parseBibtex(t);
  }
  return parseRis(t);
}

// ---------- 3. Exportador RIS e BibTeX ----------
function exportarRis(refs) {
  return refs
    .map((r) => {
      const c = r.csl || {};
      const linhas = ['TY  - ' + (c.type === 'book' ? 'BOOK' : c.type === 'chapter' ? 'CHAP' : 'JOUR')];
      if (c.title) linhas.push(`TI  - ${c.title}`);
      for (const a of c.author || []) {
        linhas.push(`AU  - ${a.literal || [a.family, a.given].filter(Boolean).join(', ')}`);
      }
      const ano = c.issued?.['date-parts']?.[0]?.[0];
      if (ano) linhas.push(`PY  - ${ano}`);
      if (c['container-title']) linhas.push(`T2  - ${c['container-title']}`);
      if (c.volume) linhas.push(`VL  - ${c.volume}`);
      if (c.issue) linhas.push(`IS  - ${c.issue}`);
      if (c.page) linhas.push(`SP  - ${c.page}`);
      if (c.publisher) linhas.push(`PB  - ${c.publisher}`);
      if (c['publisher-place']) linhas.push(`CY  - ${c['publisher-place']}`);
      if (c.DOI) linhas.push(`DO  - ${c.DOI}`);
      if (c.PMID) linhas.push(`PMID- ${c.PMID}`);
      if (c.URL) linhas.push(`UR  - ${c.URL}`);
      if (c.abstract) linhas.push(`AB  - ${c.abstract}`);
      for (const tg of r.tags || []) linhas.push(`KW  - ${tg}`);
      linhas.push(`N1  - Status: ${r.status}`);
      linhas.push('ER  - ');
      return linhas.join('\r\n');
    })
    .join('\r\n\r\n');
}

function exportarBibtex(refs) {
  return refs
    .map((r) => {
      const c = r.csl || {};
      const tipo = c.type === 'book' ? 'book' : c.type === 'chapter' ? 'incollection' : 'article';
      const chave = (r.id || 'ref').replace(/[^a-zA-Z0-9_-]/g, '');
      const campos = [];
      if (c.title) campos.push(`  title = {${c.title}}`);
      if (c.author?.length) {
        const aut = c.author.map((a) => a.literal || [a.family, a.given].filter(Boolean).join(', ')).join(' and ');
        campos.push(`  author = {${aut}}`);
      }
      const ano = c.issued?.['date-parts']?.[0]?.[0];
      if (ano) campos.push(`  year = {${ano}}`);
      if (c['container-title']) campos.push(`  journal = {${c['container-title']}}`);
      if (c.volume) campos.push(`  volume = {${c.volume}}`);
      if (c.issue) campos.push(`  number = {${c.issue}}`);
      if (c.page) campos.push(`  pages = {${c.page}}`);
      if (c.publisher) campos.push(`  publisher = {${c.publisher}}`);
      if (c.DOI) campos.push(`  doi = {${c.DOI}}`);
      if (c.URL) campos.push(`  url = {${c.URL}}`);
      return `@${tipo}{${chave},\n${campos.join(',\n')}\n}`;
    })
    .join('\n\n');
}

// ---------- 4. Encontrar PDF em Acesso Aberto (Unpaywall / OpenAlex / SciELO / Repositórios) ----------
async function localizarUrlPdfAberto({ doi, pmid, url, titulo, autor, ano }) {
  // 0) URL direta fornecida ou repositório institucional conhecido
  if (url && typeof url === 'string') {
    const uLimpa = url.trim();
    if (uLimpa.includes('ninho.inca.gov.br/jspui/handle/123456789/17914')) {
      return {
        urlPdf: 'https://ninho.inca.gov.br/jspui/bitstream/123456789/17914/1/Estima2026_completo%20%281%29.pdf',
        retratado: false,
      };
    }
    if (uLimpa.includes('ninho.inca.gov.br/jspui/handle/123456789/17713')) {
      return {
        urlPdf: 'https://ninho.inca.gov.br/jspui/bitstream/123456789/17713/1/SEI_0050548355_Nota_Tecnica_626.pdf',
        retratado: false,
      };
    }
    if (uLimpa.includes('redes_de_atencao_saude.pdf')) {
      return {
        urlPdf: 'https://www.conass.org.br/bibliotecav3/pdfs/redesAtencao.pdf',
        retratado: false,
      };
    }
    if (
      uLimpa.toLowerCase().endsWith('.pdf') ||
      uLimpa.includes('format=pdf') ||
      uLimpa.includes('bitstream') ||
      uLimpa.includes('script=sci_pdf')
    ) {
      return { urlPdf: uLimpa, retratado: false };
    }
    if (uLimpa.includes('scielo.br') && !uLimpa.includes('format=pdf')) {
      const sep = uLimpa.includes('?') ? '&' : '?';
      return { urlPdf: `${uLimpa}${sep}format=pdf`, retratado: false };
    }
  }

  const d = normalizarDoi(doi);

  // 1) OpenAlex (não exige chave, tem cobertura Unpaywall integrada + status de retratação)
  if (d) {
    try {
      const oa = await buscarJson(`https://api.openalex.org/works/https://doi.org/${encodeURI(d)}`);
      let urlPdf =
        oa.best_oa_location?.pdf_url ||
        oa.primary_location?.pdf_url ||
        oa.open_access?.oa_url;
      if (urlPdf) {
        if (urlPdf.includes('scielo.br') && !urlPdf.includes('format=pdf')) {
          urlPdf += (urlPdf.includes('?') ? '&' : '?') + 'format=pdf';
        }
        return { urlPdf, retratado: !!oa.is_retracted, citacoes: oa.cited_by_count };
      }
    } catch { /* tenta o próximo */ }

    // 2) Unpaywall direto
    try {
      const up = await buscarJson(`https://api.unpaywall.org/v2/${encodeURI(d)}?email=pesquisa@bibliografia.local`);
      let urlPdf = up.best_oa_location?.url_for_pdf || up.best_oa_location?.url;
      if (urlPdf) {
        if (urlPdf.includes('scielo.br') && !urlPdf.includes('format=pdf')) {
          urlPdf += (urlPdf.includes('?') ? '&' : '?') + 'format=pdf';
        }
        return { urlPdf, retratado: false };
      }
    } catch { /* tenta SciELO / Europe PMC */ }

    // 3) Resolução direta SciELO para periódicos nacionais
    if (d.startsWith('10.1590/') || d.startsWith('10.11606/')) {
      try {
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 8000);
        const resDoi = await fetch(`https://doi.org/${encodeURI(d)}`, {
          headers: {
            'User-Agent': UA,
            Accept: 'application/pdf,text/html,*/*',
          },
          redirect: 'manual',
          signal: ctrl.signal,
        });
        clearTimeout(t);
        const loc = resDoi.headers.get('location');
        if (loc) {
          if (loc.includes('scielo.php') && loc.includes('script=sci_arttext')) {
            const pdfUrl = loc.replace('script=sci_arttext', 'script=sci_pdf');
            return { urlPdf: pdfUrl, retratado: false };
          }
          if (loc.includes('scielo.br') && !loc.includes('format=pdf')) {
            return { urlPdf: `${loc}${loc.includes('?') ? '&' : '?'}format=pdf`, retratado: false };
          }
        }
      } catch { /* continua */ }
    }
  }

  // 4) Europe PMC (por PMID ou DOI)
  const q = pmid ? `EXT_ID:${pmid} AND SRC:MED` : d ? `DOI:"${d}"` : null;
  if (q) {
    try {
      const ep = await buscarJson(
        `https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&pageSize=1&query=${encodeURIComponent(q)}`
      );
      const item = ep.resultList?.result?.[0];
      if (item?.pmcid) {
        return {
          urlPdf: `https://europepmc.org/backend/ptpmcrender.fcgi?accid=${item.pmcid}&blobtype=pdf`,
          retratado: item.pubTypeList?.pubType?.includes('Retracted Publication') || false,
        };
      }
    } catch { /* sem PDF aberto */ }
  }
  return null;
}

async function baixarPdfParaArquivo(urlPdf, destinoTemp) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 30000);
  try {
    const res = await fetch(urlPdf, {
      headers: { 'User-Agent': UA, Accept: 'application/pdf,*/*' },
      redirect: 'follow',
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    // Verifica assinatura %PDF-
    if (buf.length < 1000 || buf.subarray(0, 5).toString('ascii') !== '%PDF-') {
      throw new Error('O endereço aberto redirecionou para uma página web em vez de um arquivo PDF direto.');
    }
    await fsp.writeFile(destinoTemp, buf);
    return destinoTemp;
  } finally {
    clearTimeout(t);
  }
}

// ---------- 5. Rede de citações (Snowballing) e Retratação via OpenAlex ----------
function reconstruirResumoOpenAlex(invertedIndex) {
  if (!invertedIndex || typeof invertedIndex !== 'object') return '';
  const palavras = [];
  for (const [palavra, posicoes] of Object.entries(invertedIndex)) {
    if (Array.isArray(posicoes)) {
      for (const pos of posicoes) {
        palavras[pos] = palavra;
      }
    }
  }
  return palavras.filter(Boolean).join(' ');
}

function mapearObraOpenAlex(r) {
  const resumo = reconstruirResumoOpenAlex(r.abstract_inverted_index);
  return {
    idOpenAlex: r.id,
    doi: r.doi ? r.doi.replace(/^https?:\/\/doi\.org\//i, '') : null,
    pmid: r.ids?.pmid ? String(r.ids.pmid).replace(/\D/g, '') : null,
    titulo: r.display_name || r.title || '(Sem título)',
    autores:
      (r.authorships || [])
        .slice(0, 4)
        .map((a) => a.author?.display_name)
        .filter(Boolean)
        .join(', ') + ((r.authorships || []).length > 4 ? ' et al.' : ''),
    ano: r.publication_year || '',
    fonte: r.primary_location?.source?.display_name || '',
    citacoes: r.cited_by_count || 0,
    retratado: !!r.is_retracted,
    acessoAberto: !!r.open_access?.is_oa,
    oaUrl: r.open_access?.oa_url || r.best_oa_location?.pdf_url || null,
    resumo: resumo ? (resumo.length > 500 ? resumo.slice(0, 497) + '…' : resumo) : '',
    url: r.doi || r.id,
    tipo: r.type || 'article',
  };
}

async function redeDeCitacoes({ doi, pmid, openAlexId, perPage = 25 }) {
  let idBusca = null;
  if (openAlexId) {
    idBusca = openAlexId.startsWith('http') ? openAlexId.split('/').pop() : openAlexId;
  } else if (doi) {
    const d = normalizarDoi(doi);
    if (d) idBusca = `https://doi.org/${encodeURI(d)}`;
  } else if (pmid) {
    idBusca = `pmid:${pmid}`;
  }

  if (!idBusca) throw new Error('Esta obra precisa ter DOI, PMID ou ID OpenAlex para consultar a rede de citações.');

  const obra = await buscarJson(`https://api.openalex.org/works/${idBusca}`);
  const idCurto = String(obra.id || '').split('/').pop();

  // Quem cita esta obra (cited_by) — Trabalhos Posteriores / Derivados
  let citantes = [];
  try {
    const citantesJson = await buscarJson(
      `https://api.openalex.org/works?filter=cites:${idCurto}&sort=cited_by_count:desc&per-page=${perPage}`
    );
    citantes = (citantesJson.results || []).map(mapearObraOpenAlex);
  } catch {}

  // Obras que este artigo referenciou (referenced_works) — Trabalhos Anteriores / Fundamentos
  let referenciadas = [];
  const refsIds = (obra.referenced_works || []).slice(0, perPage).map((u) => u.split('/').pop());
  if (refsIds.length) {
    try {
      const refsJson = await buscarJson(
        `https://api.openalex.org/works?filter=openalex_id:${refsIds.join('|')}&per-page=${perPage}`
      );
      referenciadas = (refsJson.results || []).map(mapearObraOpenAlex);
    } catch {}
  }

  const sementeMapeada = mapearObraOpenAlex(obra);

  return {
    obraSemente: sementeMapeada,
    retratado: !!obra.is_retracted,
    totalCitacoes: obra.cited_by_count || 0,
    citantes,
    referenciadas,
  };
}

module.exports = {
  importarTextoBibliografia,
  exportarRis,
  exportarBibtex,
  localizarUrlPdfAberto,
  baixarPdfParaArquivo,
  redeDeCitacoes,
};
