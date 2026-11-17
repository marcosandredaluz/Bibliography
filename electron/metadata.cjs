// Busca de metadados: DOI (Crossref/DataCite), ISBN (Google Books/Open Library)
// e busca por título (Crossref). Tudo é convertido para CSL-JSON.
const UA = 'Bibliografia/1.0.0 (https://github.com/marcosandredaluz/Bibliography; mailto:pesquisa@bibliografia.local)';

const CAMPOS_CSL = new Set([
  'type', 'title', 'title-short', 'container-title', 'container-title-short', 'collection-title',
  'author', 'editor', 'translator', 'issued', 'accessed', 'volume', 'issue', 'page', 'number-of-pages',
  'publisher', 'publisher-place', 'edition', 'DOI', 'URL', 'ISBN', 'ISSN', 'PMID', 'PMCID',
  'abstract', 'language', 'genre', 'number', 'event-title', 'event-place', 'section', 'medium', 'note',
]);

function semTags(s) {
  return String(s).replace(/<\/?(jats:)?[a-z][^>]*>/gi, (t) => (/^<\/?(i|b|sup|sub)>$/i.test(t) ? t : ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function limparCsl(bruto) {
  const csl = {};
  for (const [k, v] of Object.entries(bruto || {})) {
    if (!CAMPOS_CSL.has(k) || v == null || v === '') continue;
    let valor = Array.isArray(v) && !['author', 'editor', 'translator'].includes(k) ? v[0] : v;
    if (typeof valor === 'string') valor = k === 'abstract' ? semTags(valor).replace(/<\/?[a-z]+>/gi, '') : semTags(valor);
    if (valor == null || valor === '') continue;
    csl[k] = valor;
  }
  for (const k of ['author', 'editor', 'translator']) {
    if (Array.isArray(csl[k])) {
      csl[k] = csl[k]
        .map((n) => {
          const o = {};
          if (n.family) o.family = n.family;
          if (n.given) o.given = n.given;
          if (n.literal || n.name) o.literal = n.literal || n.name;
          if (n.suffix) o.suffix = n.suffix;
          if (n['non-dropping-particle']) o['non-dropping-particle'] = n['non-dropping-particle'];
          return o;
        })
        .filter((o) => Object.keys(o).length);
      if (!csl[k].length) delete csl[k];
    }
  }
  if (csl.type === 'journal-article') csl.type = 'article-journal';
  if (csl.type === 'book-chapter') csl.type = 'chapter';
  if (csl.type === 'proceedings-article') csl.type = 'paper-conference';
  for (const k of ['volume', 'issue', 'page', 'edition', 'number', 'number-of-pages']) {
    if (csl[k] != null) csl[k] = String(csl[k]);
  }
  return csl;
}

function normalizarDoi(texto) {
  const m = String(texto || '').match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  return m ? m[0].replace(/[.,;:)\]}]+$/, '') : null;
}

async function buscarJson(url, headers = {}, retries = 3) {
  for (let tentativa = 1; tentativa <= retries; tentativa++) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA, ...headers }, signal: ctrl.signal, redirect: 'follow' });
      if (res.status === 429 || (res.status >= 502 && res.status <= 504)) {
        if (tentativa === retries) {
          const err = new Error(`HTTP ${res.status}`);
          err.status = res.status;
          throw err;
        }
        const delay = 600 * Math.pow(2, tentativa - 1) + Math.random() * 200;
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
      if (!res.ok) {
        const err = new Error(`HTTP ${res.status}`);
        err.status = res.status;
        throw err;
      }
      return await res.json();
    } catch (e) {
      if (tentativa === retries) {
        if (e.name === 'AbortError') {
          const err = new Error('Tempo esgotado ao consultar o servidor.');
          err.status = 408;
          throw err;
        }
        throw e;
      }
      await new Promise((r) => setTimeout(r, 400 * tentativa));
    } finally {
      clearTimeout(t);
    }
  }
}

async function porDoi(entrada) {
  const doi = normalizarDoi(entrada);
  if (!doi) throw new Error('DOI inválido. Exemplo: 10.1038/nature12373');
  try {
    const bruto = await buscarJson(`https://doi.org/${encodeURI(doi)}`, { Accept: 'application/vnd.citationstyles.csl+json' });
    const csl = limparCsl(bruto);
    csl.DOI = doi;
    return csl;
  } catch (e) {
    if (e.status === 404) {
      const err404 = new Error(`DOI não encontrado: ${doi}`);
      err404.status = 404;
      throw err404;
    }
    throw new Error(`Não foi possível obter o DOI ${doi}: ${e.message}`);
  }
}

const SUFIXOS = /^(filho|filha|neto|neta|junior|júnior|jr\.?|sobrinho|segundo|terceiro)$/i;

/** PubMed ID -> CSL-JSON (serviço oficial de citações da NCBI). */
async function porPmid(entrada) {
  const pmid = String(entrada || '').match(/\d{1,9}/)?.[0];
  if (!pmid) throw new Error('PMID inválido.');
  let bruto;
  try {
    bruto = await buscarJson(`https://api.ncbi.nlm.nih.gov/lit/ctxp/v1/pubmed/?format=csl&id=${pmid}`);
  } catch (e) {
    throw new Error(`Não foi possível obter o PMID ${pmid}: ${e.message}`);
  }
  if (Array.isArray(bruto)) bruto = bruto[0];
  if (!bruto?.title) throw new Error(`PMID não encontrado: ${pmid}`);
  const csl = limparCsl(bruto);
  delete csl.accessed; // a NCBI preenche "acessado em" com a data de hoje; não faz sentido para artigos
  csl.PMID = pmid;
  if (bruto.PMCID) csl.PMCID = bruto.PMCID;
  if (csl.DOI) csl.DOI = normalizarDoi(csl.DOI) || csl.DOI;
  if (csl['container-title-short'] && !csl['container-title']) csl['container-title'] = csl['container-title-short'];
  return csl;
}

/** PMCID (PubMed Central) -> CSL-JSON via NCBI E-utilities. */
async function porPmc(entrada) {
  const pmcid = String(entrada || '').replace(/[^0-9]/g, '');
  if (!pmcid) throw new Error('PMCID inválido.');
  const url = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pmc&id=${pmcid}&retmode=json`;
  const dados = await buscarJson(url);
  const doc = dados.result?.[pmcid];
  if (!doc || !doc.title) throw new Error(`PMC${pmcid} não encontrado.`);

  const csl = {
    type: 'article-journal',
    title: semTags(doc.title),
    PMCID: `PMC${pmcid}`,
    'container-title': doc.source || doc.fulljournalname || '',
    volume: doc.volume || undefined,
    issue: doc.issue || undefined,
    page: doc.pages || undefined,
  };
  if (doc.authors?.length) {
    csl.author = doc.authors.map((a) => separarNome(a.name)).filter(Boolean);
  }
  if (doc.pubdate) {
    const m = doc.pubdate.match(/(\d{4})/);
    if (m) csl.issued = { 'date-parts': [[Number(m[1])]] };
  }
  if (doc.articleids?.length) {
    const doiObj = doc.articleids.find((i) => i.idtype === 'doi');
    if (doiObj?.value) csl.DOI = normalizarDoi(doiObj.value);
    const pmidObj = doc.articleids.find((i) => i.idtype === 'pmid');
    if (pmidObj?.value) csl.PMID = pmidObj.value;
  }
  return limparCsl(csl);
}

/** "João da Silva Filho" -> { family: "Silva Filho", given: "João da" }; "Silva, João" também. */
function separarNome(nome) {
  const s = String(nome || '').trim().replace(/\s+/g, ' ');
  if (!s) return null;
  if (s.includes(',')) {
    const [family, ...resto] = s.split(',');
    return { family: family.trim(), given: resto.join(',').trim() || undefined };
  }
  const partes = s.split(' ');
  if (partes.length === 1) return { family: partes[0] };
  let corte = partes.length - 1;
  if (SUFIXOS.test(partes[corte]) && corte > 1) corte--;
  return { family: partes.slice(corte).join(' '), given: partes.slice(0, corte).join(' ') };
}

function dataParaCsl(texto) {
  const m = String(texto || '').match(/(\d{4})(?:-(\d{1,2}))?(?:-(\d{1,2}))?/);
  if (!m) return undefined;
  return { 'date-parts': [[m[1], m[2], m[3]].filter(Boolean).map(Number)] };
}

async function porIsbn(entrada) {
  const isbn = String(entrada || '').replace(/[^0-9Xx]/g, '').toUpperCase();
  if (![10, 13].includes(isbn.length)) throw new Error('ISBN inválido (precisa ter 10 ou 13 dígitos).');
  const csl = { type: 'book', ISBN: isbn };

  try {
    const g = await buscarJson(`https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}`);
    const v = g.items?.[0]?.volumeInfo;
    if (v) {
      csl.title = v.subtitle ? `${v.title}: ${v.subtitle}` : v.title;
      if (v.authors?.length) csl.author = v.authors.map(separarNome).filter(Boolean);
      if (v.publisher) csl.publisher = v.publisher;
      if (v.publishedDate) csl.issued = dataParaCsl(v.publishedDate);
      if (v.pageCount) csl['number-of-pages'] = String(v.pageCount);
      if (v.language) csl.language = v.language;
      if (v.description) csl.abstract = semTags(v.description);
    }
  } catch { /* tenta a próxima fonte */ }

  try {
    const o = await buscarJson(`https://openlibrary.org/api/books?bibkeys=ISBN:${isbn}&format=json&jscmd=data`);
    const b = o[`ISBN:${isbn}`];
    if (b) {
      csl.title ||= b.subtitle ? `${b.title}: ${b.subtitle}` : b.title;
      if (!csl.author && b.authors?.length) csl.author = b.authors.map((a) => separarNome(a.name)).filter(Boolean);
      csl.publisher ||= b.publishers?.[0]?.name;
      csl['publisher-place'] ||= b.publish_places?.[0]?.name?.replace(/[[\]]/g, '').replace(/,\s*(Brazil|Brasil)$/i, '');
      csl.issued ||= dataParaCsl(b.publish_date);
      csl['number-of-pages'] ||= b.number_of_pages ? String(b.number_of_pages) : undefined;
    }
  } catch { /* sem dados */ }

  if (!csl.title) throw new Error(`Nenhum livro encontrado para o ISBN ${isbn}.`);
  return limparCsl(csl);
}

async function buscarTitulo(consulta) {
  const q = String(consulta || '').trim();
  if (q.length < 3) throw new Error('Digite pelo menos 3 caracteres.');
  const itens = [];
  try {
    const url = `https://api.crossref.org/works?rows=10&query.bibliographic=${encodeURIComponent(q)}` +
      '&select=DOI,title,author,issued,container-title,type,publisher';
    const dados = await buscarJson(url);
    for (const it of dados.message?.items || []) {
      itens.push({
        doi: it.DOI,
        titulo: semTags(it.title?.[0] || '(sem título)'),
        autores: (it.author || []).map((a) => a.family || a.name).filter(Boolean).slice(0, 4).join(', ') +
          ((it.author || []).length > 4 ? ' et al.' : ''),
        ano: it.issued?.['date-parts']?.[0]?.[0] || '',
        fonte: semTags(it['container-title']?.[0] || it.publisher || ''),
        tipo: it.type,
      });
    }
  } catch {}

  // Fallback no OpenAlex para artigos sem DOI no Crossref ou falhas temporárias
  if (itens.length === 0) {
    try {
      const qLimpa = q.split(/[:–—]/)[0].trim().slice(0, 100);
      const urlOa = `https://api.openalex.org/works?per-page=5&search=${encodeURIComponent(qLimpa)}`;
      const dadosOa = await buscarJson(urlOa);
      for (const r of dadosOa.results || []) {
        itens.push({
          doi: r.doi ? r.doi.replace(/^https?:\/\/doi\.org\//i, '') : null,
          pmid: r.ids?.pmid ? String(r.ids.pmid).replace(/\D/g, '') : null,
          titulo: r.display_name || r.title || '(sem título)',
          autores: (r.authorships || []).slice(0, 4).map((a) => a.author?.display_name).filter(Boolean).join(', ') +
            ((r.authorships || []).length > 4 ? ' et al.' : ''),
          ano: r.publication_year || '',
          fonte: r.primary_location?.source?.display_name || '',
          tipo: r.type || 'article',
        });
      }
    } catch {}
  }

  // Fallback complementar no Semantic Scholar (Inspirado no RefChecker)
  if (itens.length === 0) {
    try {
      const qLimpa = q.split(/[:–—]/)[0].trim().slice(0, 100);
      const urlS2 = `https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(qLimpa)}&limit=5&fields=title,year,authors,externalIds,isRetracted`;
      const dadosS2 = await buscarJson(urlS2, {}, 1);
      for (const r of dadosS2.data || []) {
        itens.push({
          doi: r.externalIds?.DOI ? normalizarDoi(r.externalIds.DOI) : null,
          pmid: r.externalIds?.PubMed ? String(r.externalIds.PubMed) : null,
          titulo: r.title || '(sem título)',
          autores: (r.authors || []).slice(0, 4).map((a) => a.name).filter(Boolean).join(', ') +
            ((r.authors || []).length > 4 ? ' et al.' : ''),
          ano: r.year || '',
          fonte: 'Semantic Scholar',
          tipo: 'article',
          isRetracted: Boolean(r.isRetracted),
        });
      }
    } catch {}
  }

  return itens;
}

/**
 * Consulta a API do Semantic Scholar (Graph API) por DOI, PMID ou S2 PaperId.
 * Extrai metadados completos em CSL-JSON e flag de retratação.
 */
async function porSemanticScholar(entrada) {
  const limpo = String(entrada || '').trim();
  let idS2 = limpo;
  if (/^10\.\d{4,9}\//.test(limpo)) {
    idS2 = `DOI:${limpo}`;
  } else if (/^\d{5,9}$/.test(limpo)) {
    idS2 = `PMID:${limpo}`;
  }
  const url = `https://api.semanticscholar.org/graph/v1/paper/${encodeURIComponent(idS2)}?fields=title,authors,year,journal,externalIds,isRetracted,citationCount,abstract,publicationDate,isOpenAccess`;
  const dados = await buscarJson(url, {}, 2);
  if (!dados || !dados.title) {
    throw new Error(`Obra não encontrada no Semantic Scholar: ${entrada}`);
  }

  const csl = {
    type: 'article-journal',
    title: semTags(dados.title),
    DOI: dados.externalIds?.DOI ? normalizarDoi(dados.externalIds.DOI) : undefined,
    PMID: dados.externalIds?.PubMed ? String(dados.externalIds.PubMed) : undefined,
    'container-title': dados.journal?.name || undefined,
    volume: dados.journal?.volume || undefined,
    page: dados.journal?.pages || undefined,
    abstract: dados.abstract ? semTags(dados.abstract) : undefined,
  };
  if (dados.year) {
    csl.issued = { 'date-parts': [[Number(dados.year)]] };
  }
  if (dados.authors?.length) {
    csl.author = dados.authors.map((a) => separarNome(a.name)).filter(Boolean);
  }

  return {
    csl: limparCsl(csl),
    isRetracted: Boolean(dados.isRetracted),
    citationCount: dados.citationCount || 0,
    externalIds: dados.externalIds || {},
  };
}

/**
 * Triagem Forense Ativa de Retratações (Inspirado no RefChecker):
 * Cruza OpenAlex (Retraction Watch) + PubMed ('Retracted Publication') + Crossref + Semantic Scholar.
 */
async function verificarRetratacaoArtigo({ doi, pmid, titulo } = {}) {
  const resultado = {
    retratado: false,
    motivo: null,
    fonte: null,
  };

  const doiNorm = doi ? normalizarDoi(doi) : null;
  const pmidNorm = pmid ? String(pmid).replace(/\D/g, '') : null;

  // 1. Verificação via OpenAlex (Catálogo Retraction Watch de mais de 250M de trabalhos)
  if (doiNorm || pmidNorm) {
    try {
      const idBusca = doiNorm ? `https://doi.org/${encodeURI(doiNorm)}` : `pmid:${pmidNorm}`;
      const urlOa = `https://api.openalex.org/works/${idBusca}?select=id,title,is_retracted`;
      const dadosOa = await buscarJson(urlOa, {}, 2);
      if (dadosOa?.is_retracted) {
        resultado.retratado = true;
        resultado.fonte = 'OpenAlex / Retraction Watch';
        resultado.motivo = dadosOa.title?.startsWith('RETRACTED')
          ? dadosOa.title
          : 'Artigo formalmente retratado/despublicado pela revista científica conforme indexação do Retraction Watch.';
        return resultado;
      }
    } catch {}
  }

  // 2. Verificação via PubMed (PubType: 'Retracted Publication')
  if (pmidNorm) {
    try {
      const urlPm = `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${pmidNorm}`;
      const dadosPm = await buscarJson(urlPm, {}, 2);
      const pubtypes = dadosPm?.result?.[pmidNorm]?.pubtype || [];
      if (pubtypes.some((pt) => /retracted\s+publication/i.test(pt))) {
        resultado.retratado = true;
        resultado.fonte = 'PubMed / National Library of Medicine';
        resultado.motivo = 'Artigo classificado formalmente pelo PubMed/NLM como "Retracted Publication".';
        return resultado;
      }
    } catch {}
  }

  // 3. Verificação no título oficial de Crossref/CSL
  if (titulo && /^RETRACTED\b/i.test(titulo.trim())) {
    resultado.retratado = true;
    resultado.fonte = 'Registro Oficial Crossref';
    resultado.motivo = `Artigo com marcação de retratação no título oficial: "${titulo}".`;
    return resultado;
  }

  // 4. Verificação complementar no Semantic Scholar (com tolerância a 429)
  if (doiNorm) {
    try {
      const urlS2 = `https://api.semanticscholar.org/graph/v1/paper/DOI:${encodeURIComponent(doiNorm)}?fields=isRetracted,title`;
      const dadosS2 = await buscarJson(urlS2, {}, 1);
      if (dadosS2?.isRetracted) {
        resultado.retratado = true;
        resultado.fonte = 'Semantic Scholar';
        resultado.motivo = 'Artigo identificado como retratado no índice do Semantic Scholar.';
        return resultado;
      }
    } catch {}
  }

  return resultado;
}

module.exports = {
  porDoi,
  porPmid,
  porPmc,
  porSemanticScholar,
  porIsbn,
  buscarTitulo,
  verificarRetratacaoArtigo,
  normalizarDoi,
  separarNome,
};
