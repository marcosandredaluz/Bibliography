// Motor automático de:
// 1. Extração de Resumo (OpenAlex inverted_index / Europe PMC) quando ausente no Crossref
// 2. Métricas e Nota Atual da Revista (Fator de Impacto 2 anos / 2yr_mean_citedness, H-Index, Quartil/Qualis estimado)
// 3. Métricas e Nota do Artigo (Citações totais, Citações/ano, FWCI, Percentil mundial, Open Access)
// 4. Classificação automática do Nível de Evidência Científica (Oxford CEBM: 1A, 1B, 2A, 2B, 3B, 4, 5, Diretriz)
// 5. Preenchimento automático de Notas de Fichamento e PICO (População, Intervenção, Comparador, Desfechos)

const { normalizarDoi } = require('./metadata.cjs');

const UA = 'Bibliografia/0.3 (mailto:pesquisa@bibliografia.local)';

async function buscarJsonSeguro(url, timeoutMs = 12000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'application/json' },
      signal: ctrl.signal,
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Reconstrói o texto do resumo a partir do `abstract_inverted_index` do OpenAlex. */
function reconstruirResumoOpenAlex(inv) {
  if (!inv || typeof inv !== 'object') return '';
  const palavras = [];
  for (const [palavra, posicoes] of Object.entries(inv)) {
    if (Array.isArray(posicoes)) {
      for (const pos of posicoes) {
        palavras[pos] = palavra;
      }
    }
  }
  return palavras.filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
}

/** Estima o Quartil / Qualis CAPES com base no Fator de Impacto de 2 anos (2yr_mean_citedness) e H-index da revista. */
function estimarQuartilEQualis(fi2Anos, hIndex, nomeRevista = '') {
  const fi = Number(fi2Anos) || 0;
  const h = Number(hIndex) || 0;
  const nomeNorm = String(nomeRevista || '').toLowerCase();

  if (fi >= 4.0 || h >= 120 || /lancet|new england|jama|bmj|nature|science|circulation|diabetes care|annals of internal|plos medicine/i.test(nomeNorm)) {
    return { quartil: 'Q1', qualis: 'A1', notaNum: Math.min(10, +(8.8 + Math.min(1.2, fi / 15)).toFixed(1)), selo: '🏆 Excelência Internacional (Q1 · Qualis A1 est.)' };
  }
  if (fi >= 2.5 || h >= 75) {
    return { quartil: 'Q1/Q2', qualis: 'A2', notaNum: +(8.0 + Math.min(0.7, (fi - 2.5) / 3)).toFixed(1), selo: '🥇 Alto Impacto (Q1/Q2 · Qualis A2 est.)' };
  }
  if (fi >= 1.5 || h >= 45 || /scielo|cadernos de saude publica|revista de saude publica|ciencia & saude coletiva|epidemiologia e servicos|arquivos brasileiros/i.test(nomeNorm)) {
    return { quartil: 'Q2', qualis: 'A3 / A4', notaNum: 7.5, selo: '🥈 Relevância Consolidada (Q2 · Qualis A3/A4 est.)' };
  }
  if (fi >= 0.7 || h >= 20) {
    return { quartil: 'Q3', qualis: 'B1 / B2', notaNum: 6.5, selo: '🥉 Impacto Moderado / Regional (Q3 · Qualis B1/B2 est.)' };
  }
  if (fi > 0 || h > 0) {
    return { quartil: 'Q4', qualis: 'B3 / B4', notaNum: 5.5, selo: '📘 Periódico Indexado (Q4 · Qualis B3/B4 est.)' };
  }
  return { quartil: '—', qualis: 'Institucional / Livro / N/A', notaNum: null, selo: '📋 Publicação Institucional / Livro / Base Geral' };
}

/** Calcula uma nota de impacto do artigo (0 a 10) combinando citações, FWCI e percentil. */
function calcularNotaDoArtigo({ citacoes = 0, anoPub, fwci = null, percentil = null, isTop10 = false, isTop1 = false }) {
  const anoAtual = new Date().getFullYear();
  const idade = Math.max(1, anoAtual - (Number(anoPub) || anoAtual));
  const citPorAno = +(citacoes / idade).toFixed(1);

  let nota = 6.0;
  if (isTop1 || (percentil && percentil >= 0.99)) nota = 9.8;
  else if (isTop10 || (percentil && percentil >= 0.90)) nota = 9.0;
  else if (percentil && percentil >= 0.75) nota = 8.2;
  else if (percentil && percentil >= 0.50) nota = 7.4;
  else if (citacoes >= 100 || citPorAno >= 15) nota = 9.2;
  else if (citacoes >= 30 || citPorAno >= 5) nota = 8.3;
  else if (citacoes >= 10 || citPorAno >= 2) nota = 7.5;
  else if (citacoes >= 3) nota = 6.8;

  if (fwci != null && fwci > 1.2) nota = Math.min(10, +(nota + Math.min(0.8, (fwci - 1) * 0.25)).toFixed(1));

  let classificacao = 'Artigo Recente / Em Indexação';
  if (nota >= 9.0) classificacao = '🌟 Artigo Altamente Citado (Referência-Chave na Área)';
  else if (nota >= 8.0) classificacao = '✅ Artigo de Forte Impacto Científico';
  else if (nota >= 7.0) classificacao = '📘 Artigo Consolidado na Literatura';

  return {
    notaArtigo: +nota.toFixed(1),
    citacoesPorAno: citPorAno,
    classificacaoArtigo: classificacao,
  };
}

/** Detecta automaticamente o Nível de Evidência (Oxford CEBM) e o delineamento do estudo. */
function detectarNivelEvidencia(csl = {}, textoExtra = '') {
  const texto = `${csl.title || ''} ${csl.abstract || ''} ${csl['container-title'] || ''} ${textoExtra.slice(0, 4000)}`.toLowerCase();
  const autorLit = (csl.author || []).map((a) => a.literal || a.family || '').join(' ').toLowerCase();

  if (
    /\b(meta-anal|metaanal|metanálise|meta-análise)\b/i.test(texto) &&
    /\b(randomiz|rct|ensaio|trial)\b/i.test(texto)
  ) {
    return { id: '1a', nome: '1A – Revisão sistemática / meta-análise de ECRs', delineamento: 'Revisão Sistemática com Meta-Análise de Ensaios Clínicos' };
  }
  if (/\b(systematic review|revis[aã]o sistem[aá]tica|meta-analysis|meta-an[aá]lise|metan[aá]lise|prisma)\b/i.test(texto)) {
    return { id: '2a', nome: '2A – Revisão sistemática / síntese de evidências', delineamento: 'Revisão Sistemática / Meta-Análise' };
  }
  if (/\b(randomized controlled trial|randomised controlled trial|ensaio cl[ií]nico randomizado|duplo-cego|double-blind|placebo-controlled|phase iii trial|estudo randomizado)\b/i.test(texto)) {
    return { id: '1b', nome: '1B – Ensaio clínico randomizado (ECR)', delineamento: 'Ensaio Clínico Randomizado (ECR)' };
  }
  if (
    /\b(guideline|diretriz|consensus|consenso|world health organization|organiza[cç][aã]o mundial da sa[uú]de|minist[eé]rio da sa[uú]de|position statement|recomenda[cç][oõ]es oficiais)\b/i.test(texto) ||
    /\b(who|oms|minist[eé]rio da sa[uú]de|opas|paho|sociedade brasileira)\b/i.test(autorLit)
  ) {
    return { id: 'diretriz', nome: 'Diretriz clínica / consenso / relatório oficial', delineamento: 'Diretriz Oficial / Relatório Técnico Institucional' };
  }
  if (/\b(cohort|coorte|prospective study|estudo prospectivo|longitudinal|follow-up study|seguimento)\b/i.test(texto)) {
    return { id: '2b', nome: '2B – Estudo de coorte / longitudinal', delineamento: 'Estudo Observacional de Coorte / Longitudinal' };
  }
  if (/\b(case-control|caso-controle|casos e controles)\b/i.test(texto)) {
    return { id: '3b', nome: '3B – Estudo caso-controle', delineamento: 'Estudo Observacional Caso-Controle' };
  }
  if (/\b(cross-sectional|transversal|prevalence study|estudo de preval[eê]ncia|ecological study|estudo ecol[oó]gico|s[eé]rie de casos|case series|case report|relato de caso|survey|inqu[eé]rito|sinan|datasus|sistema de informa[cç][aã]o)\b/i.test(texto)) {
    return { id: '4', nome: '4 – Estudo transversal / ecológico / série de casos', delineamento: 'Estudo Observacional Transversal / Ecológico / Vigilância' };
  }
  if (/\b(revis[aã]o integrativa|integrative review|revis[aã]o narrativa|narrative review|scoping review|revis[aã]o de escopo|literature review|revis[aã]o bibliogr[aá]fica|revis[aã]o de literatura)\b/i.test(texto)) {
    return { id: '5', nome: '5 – Revisão narrativa / integrativa / escopo', delineamento: 'Revisão de Literatura / Integrativa / Escopo' };
  }
  if (csl.type === 'book' || csl.type === 'chapter') {
    return { id: '5', nome: '5 – Livro / Capítulo de referência teórica', delineamento: 'Obra de Referência / Livro-Texto' };
  }
  if (csl.type === 'thesis') {
    return { id: '4', nome: '4 – Dissertação / Tese acadêmica', delineamento: 'Pesquisa Acadêmica (Tese / Dissertação)' };
  }
  return { id: '4', nome: '4 – Estudo empírico / artigo científico', delineamento: 'Artigo Científico Original' };
}

/** Divide um texto em sentenças limpas. */
function dividirSentencas(texto) {
  return String(texto || '')
    .replace(/\r?\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+(?=[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ0-9])/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);
}

/**
 * Extrai PICO (População, Intervenção, Comparador, Desfechos) automaticamente
 * do resumo (abstract), do texto extraído do PDF ou do título.
 */
function extrairPicoAutomatico(csl = {}, textoExtraido = '') {
  const titulo = String(csl.title || '').replace(/<\/?[a-z]+>/gi, '').trim();
  const resumo = String(csl.abstract || '')
    .replace(/^📊\s*\[INSIGHTS[\s\S]*?─+\s*/m, '') // remove cabeçalho de insights se já existir
    .trim();

  // Se não tiver abstract, pega o início do PDF (procurando Resumo/Abstract)
  let baseTexto = resumo;
  if (!baseTexto && textoExtraido) {
    const mResumo = textoExtraido.match(/(?:resumo|abstract|summary)\s*[:.-]?\s*([\s\S]{120,2400})/i);
    baseTexto = mResumo ? mResumo[1] : textoExtraido.slice(0, 2200);
  }

  const sentencas = dividirSentencas(baseTexto);

  let p = '';
  let i = '';
  let c = '';
  let o = '';

  // 1) Busca por marcadores explícitos ou padrões semânticos nas sentenças
  for (const s of sentencas) {
    const sl = s.toLowerCase();
    if (!p && /\b(patients|participants|population|subjects|individuals|adults|children|women|men|cases|sample|pacientes|participantes|popula[cç][aã]o|indiv[ií]duos|adultos|crian[cç]as|gestantes|idosos|casos notificados|amostra|munic[ií]pios|unidades de sa[uú]de|n\s*=\s*\d+)\b/i.test(sl)) {
      p = s;
    }
    if (!i && /\b(intervention|treatment|therapy|program|system|exposure|administered|received|evaluated|analyzed|assessed|interven[cç][aã]o|tratamento|terapia|programa|sistema|exposi[cç][aã]o|avalia[cç][aã]o|implant|monitoramento|vigil[aâ]ncia|uso de|administra[cç][aã]o)\b/i.test(sl)) {
      if (s !== p) i = s;
    }
    if (!c && /\b(compared with|compared to|versus|\bvs\.?\b|control group|placebo|usual care|standard care|comparado|em compara[cç][aã]o|grupo controle|antes e depois|entre as regi[oõ]es|per[ií]odo de)\b/i.test(sl)) {
      c = s;
    }
    if (!o && /\b(results|findings|outcomes|conclusions|showed|demonstrated|reduced|increased|associated with|mortality|incidence|prevalence|resultados|desfechos|conclus[aã]o|mostrou|demonstraram|redu[cç][aã]o|aumento|associad|mortalidade|incid[eê]ncia|preval[eê]ncia|taxa de|p\s*[<=>]\s*0[.,]\d+|ic\s*95%|95%\s*ci)\b/i.test(sl)) {
      o = s;
    }
  }

  // 2) Fallbacks inteligentes a partir da estrutura do resumo ou do título
  if (!p) {
    if (sentencas[0]) {
      p = sentencas[0];
    } else if (titulo) {
      p = `Contexto/Tema central: ${titulo}`;
    }
  }
  if (!i) {
    if (sentencas[1] && sentencas[1] !== p && sentencas[1] !== o) {
      i = sentencas[1];
    } else if (titulo) {
      i = `Análise / investigação sobre: ${titulo}`;
    }
  }
  if (!c) {
    c = /randomiz|control|placebo|vs\.|versus|compar/i.test(baseTexto + ' ' + titulo)
      ? 'Grupo controle / comparador descrito no estudo'
      : 'Não aplicável ou análise descritiva / observacional / revisão';
  }
  if (!o) {
    if (sentencas.length >= 2) {
      o = sentencas.slice(-2).join(' ');
    } else if (sentencas[0]) {
      o = sentencas[0];
    } else if (titulo) {
      o = `Referência bibliográfica utilizada para fundamentação sobre "${titulo}".`;
    }
  }

  const limpar = (str, max = 360) => String(str || '').replace(/\s+/g, ' ').trim().slice(0, max);

  return {
    p: limpar(p, 320),
    i: limpar(i, 320),
    c: limpar(c, 260),
    o: limpar(o, 420),
  };
}

/**
 * Consulta na OpenAlex e Europe PMC os dados de impacto da revista, citações do artigo
 * e recupera o abstract caso não esteja preenchido.
 */
async function buscarMetricasOnline(csl = {}) {
  const doi = normalizarDoi(csl.DOI);
  const pmid = csl.PMID ? String(csl.PMID).replace(/\D/g, '') : null;
  const titulo = String(csl.title || '').replace(/<\/?[a-z]+>/gi, '').trim();

  let obraOa = null;
  if (doi) {
    obraOa = await buscarJsonSeguro(`https://api.openalex.org/works/https://doi.org/${encodeURI(doi)}`);
  }
  if (!obraOa && pmid) {
    obraOa = await buscarJsonSeguro(`https://api.openalex.org/works/pmid:${pmid}`);
  }
  if (!obraOa && titulo.length >= 12) {
    const busca = await buscarJsonSeguro(
      `https://api.openalex.org/works?search=${encodeURIComponent(titulo)}&per-page=1`
    );
    const cand = busca?.results?.[0];
    if (cand && cand.display_name) {
      // Verifica se o título tem semelhança mínima
      const t1 = titulo.toLowerCase().slice(0, 25);
      const t2 = String(cand.display_name).toLowerCase();
      if (t2.includes(t1.slice(0, 15))) obraOa = cand;
    }
  }

  let resumoRecuperado = '';
  let citacoes = 0;
  let fwci = null;
  let percentil = null;
  let isTop10 = false;
  let isTop1 = false;
  let statusOa = null;
  let retratado = false;
  let sourceId = null;
  let nomeRevista = csl['container-title'] || csl.publisher || '';
  let issn = csl.ISSN || '';

  if (obraOa) {
    resumoRecuperado = reconstruirResumoOpenAlex(obraOa.abstract_inverted_index);
    citacoes = obraOa.cited_by_count || 0;
    fwci = obraOa.fwci != null ? +Number(obraOa.fwci).toFixed(2) : null;
    percentil = obraOa.citation_normalized_percentile?.value != null
      ? +Number(obraOa.citation_normalized_percentile.value).toFixed(3)
      : null;
    isTop10 = !!obraOa.citation_normalized_percentile?.is_in_top_10_percent;
    isTop1 = !!obraOa.citation_normalized_percentile?.is_in_top_1_percent;
    statusOa = obraOa.open_access?.oa_status || null;
    retratado = !!obraOa.is_retracted;
    const src = obraOa.primary_location?.source;
    if (src) {
      sourceId = src.id ? String(src.id).split('/').pop() : null;
      nomeRevista = nomeRevista || src.display_name || '';
      issn = issn || src.issn_l || (Array.isArray(src.issn) ? src.issn[0] : '');
    }
  }

  // Tenta recuperar resumo bilíngue completo no PubMed (XML efetch traz tanto AbstractText em inglês quanto OtherAbstract em português!)
  const pmidEfetivo =
    pmid ||
    (obraOa?.ids?.pmid ? String(obraOa.ids.pmid).replace(/\D/g, '') : null);
  if (pmidEfetivo) {
    try {
      const rPm = await fetch(
        `https://eutils.ncbi.nlm.nih.gov/entrez/eutils/efetch.fcgi?db=pubmed&id=${pmidEfetivo}&retmode=xml`,
        { headers: { 'User-Agent': 'BibliografiaApp/1.0' } }
      );
      if (rPm.ok) {
        const xml = await rPm.text();
        const blocosAbs = [
          ...xml.matchAll(/<AbstractText[^>]*>([\s\S]*?)<\/AbstractText>/gi),
          ...xml.matchAll(/<OtherAbstract[^>]*>([\s\S]*?)<\/OtherAbstract>/gi),
        ]
          .map((m) => m[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim())
          .filter(Boolean);
        if (blocosAbs.length > 0) {
          const textoPm = blocosAbs.join('\n\n');
          if (textoPm.length > resumoRecuperado.length) {
            resumoRecuperado = textoPm;
          }
        }
      }
    } catch {
      /* ignora falha de rede no PubMed */
    }
  }

  // Se ainda não tiver abstract, tenta Europe PMC
  if (!csl.abstract && !resumoRecuperado && (doi || pmidEfetivo)) {
    const q = pmidEfetivo ? `EXT_ID:${pmidEfetivo} AND SRC:MED` : `DOI:"${doi}"`;
    const ep = await buscarJsonSeguro(
      `https://www.ebi.ac.uk/europepmc/webservices/rest/search?format=json&resultType=core&pageSize=1&query=${encodeURIComponent(q)}`
    );
    const item = ep?.resultList?.result?.[0];
    if (item?.abstractText) {
      resumoRecuperado = String(item.abstractText).replace(/<\/?[a-z][^>]*>/gi, ' ').replace(/\s+/g, ' ').trim();
    }
    if (item?.citedByCount != null && !citacoes) {
      citacoes = Number(item.citedByCount) || 0;
    }
  }

  // Consulta dados da Revista (Source) na OpenAlex para pegar Fator de Impacto (2yr_mean_citedness) e H-Index
  let dadosRevista = null;
  if (sourceId) {
    dadosRevista = await buscarJsonSeguro(`https://api.openalex.org/sources/${sourceId}`);
  } else if (issn) {
    const bIssn = await buscarJsonSeguro(`https://api.openalex.org/sources?filter=issn:${encodeURIComponent(issn)}&per-page=1`);
    dadosRevista = bIssn?.results?.[0] || null;
  } else if (nomeRevista && nomeRevista.length >= 4) {
    const bNome = await buscarJsonSeguro(`https://api.openalex.org/sources?search=${encodeURIComponent(nomeRevista)}&per-page=1`);
    dadosRevista = bNome?.results?.[0] || null;
  }

  const fi2Anos = dadosRevista?.summary_stats?.['2yr_mean_citedness'] != null
    ? +Number(dadosRevista.summary_stats['2yr_mean_citedness']).toFixed(2)
    : null;
  const hIndexRevista = dadosRevista?.summary_stats?.h_index ?? null;
  const i10IndexRevista = dadosRevista?.summary_stats?.i10_index ?? null;

  return {
    resumoRecuperado,
    citacoes,
    fwci,
    percentil,
    isTop10,
    isTop1,
    statusOa,
    retratado,
    nomeRevista: nomeRevista || dadosRevista?.display_name || '',
    issn: issn || dadosRevista?.issn_l || '',
    fi2Anos,
    hIndexRevista,
    i10IndexRevista,
  };
}

/**
 * Gera o pacote completo de Insights (Nível do Artigo, Nota da Revista, Nota do Artigo,
 * Resumo enriquecido, Notas de Fichamento e PICO).
 */
async function gerarInsightsCompletos(ref = {}, { consultarOnline = true } = {}) {
  const csl = { ...(ref.csl || {}) };
  const textoExtraido = ref.textoExtraido || '';
  const anoPub = csl.issued?.['date-parts']?.[0]?.[0] || '';

  let online = {
    resumoRecuperado: '',
    citacoes: ref.insights?.citacoes || 0,
    fwci: ref.insights?.fwci ?? null,
    percentil: ref.insights?.percentil ?? null,
    isTop10: ref.insights?.isTop10 || false,
    isTop1: ref.insights?.isTop1 || false,
    statusOa: ref.insights?.statusOa || null,
    retratado: !!ref.retratado,
    nomeRevista: csl['container-title'] || csl.publisher || '',
    issn: csl.ISSN || '',
    fi2Anos: ref.insights?.fi2Anos ?? null,
    hIndexRevista: ref.insights?.hIndexRevista ?? null,
    i10IndexRevista: ref.insights?.i10IndexRevista ?? null,
  };

  if (consultarOnline && (csl.DOI || csl.PMID || csl.ISSN || csl.title)) {
    const buscado = await buscarMetricasOnline(csl);
    online = { ...online, ...buscado };
  }

  // Se o artigo não tinha abstract (ou só tinha síntese sintética curta) e conseguimos recuperar online, preenche!
  const resumoLimpoAtual = String(csl.abstract || '')
    .replace(/^📊\s*\[INSIGHTS[\s\S]*?─+\s*\n*/m, '')
    .replace(/^Síntese PICO:\s*\[P\]\s*Contexto\/Tema central:[\s\S]*$/m, '')
    .trim();
  const textoResumoBase =
    online.resumoRecuperado && online.resumoRecuperado.length > resumoLimpoAtual.length
      ? online.resumoRecuperado
      : resumoLimpoAtual || online.resumoRecuperado || '';

  const cslComResumo = { ...csl, abstract: textoResumoBase || undefined };

  // 1. Nível de evidência e delineamento
  const evid = detectarNivelEvidencia(cslComResumo, textoExtraido);

  // 2. Qualidade / Nota da Revista
  const avalRevista = estimarQuartilEQualis(online.fi2Anos, online.hIndexRevista, online.nomeRevista);

  // 3. Nota e Impacto do Artigo
  const avalArtigo = calcularNotaDoArtigo({
    citacoes: online.citacoes,
    anoPub,
    fwci: online.fwci,
    percentil: online.percentil,
    isTop10: online.isTop10,
    isTop1: online.isTop1,
  });

  // 4. PICO automático
  const picoAuto = extrairPicoAutomatico(cslComResumo, textoExtraido);
  const picoExistente = ref.pico || {};
  const limparPico = (v) =>
    v && !/^Contexto\/Tema central:\s*[A-Z]\.?$/i.test(v) && !/^Análise \/ investigação sobre:\s*[A-Z]\.?$/i.test(v)
      ? v
      : '';
  const picoFinal = {
    p: limparPico(picoExistente.p) || picoAuto.p,
    i: limparPico(picoExistente.i) || picoAuto.i,
    c: limparPico(picoExistente.c) || picoAuto.c,
    o: limparPico(picoExistente.o) || picoAuto.o,
  };

  // 5. Monta o cabeçalho de Insights para o Resumo e para as Notas
  const partesRevista = [];
  if (online.nomeRevista) partesRevista.push(online.nomeRevista);
  if (avalRevista.quartil !== '—') partesRevista.push(`${avalRevista.quartil} (Qualis ${avalRevista.qualis} est.)`);
  if (online.fi2Anos != null) partesRevista.push(`Fator de Impacto (2a): ${online.fi2Anos}`);
  if (online.hIndexRevista != null) partesRevista.push(`H-Index da Revista: ${online.hIndexRevista}`);
  if (avalRevista.notaNum != null) partesRevista.push(`Nota da Revista: ${avalRevista.notaNum}/10`);

  const partesArtigo = [
    `Nota do Artigo: ${avalArtigo.notaArtigo}/10`,
    `${online.citacoes} citações (${avalArtigo.citacoesPorAno}/ano)`,
  ];
  if (online.fwci != null) partesArtigo.push(`FWCI: ${online.fwci}`);
  if (online.percentil != null) partesArtigo.push(`Percentil Mundial: Top ${Math.max(1, Math.round((1 - online.percentil) * 100))}%`);

  const cabecalhoResumo = [
    `📊 [INSIGHTS DO ARTIGO & NOTA DA REVISTA]`,
    `• Nível de Evidência: ${evid.nome} (${evid.delineamento})`,
    `• Avaliação da Revista: ${partesRevista.length ? partesRevista.join(' · ') : avalRevista.selo}`,
    `• Avaliação do Artigo: ${partesArtigo.join(' · ')} — ${avalArtigo.classificacaoArtigo}`,
    `──────────────────────────────────────────────────────────`,
  ].join('\n');

  const novoAbstract = textoResumoBase
    ? `${cabecalhoResumo}\n${textoResumoBase}`
    : `${cabecalhoResumo}\n[Documento normativo, padrão técnico ou livro sem resumo de periódico indexado]`;

  // 6. Notas de fichamento automáticas (se estiverem vazias ou se forem geradas automaticamente)
  const notasAtuais = String(ref.notas || '').trim();
  let novasNotas = notasAtuais;
  if (!notasAtuais || notasAtuais.startsWith('📊 [FICHAMENTO & INSIGHTS AUTOMÁTICOS]')) {
    novasNotas = [
      `📊 [FICHAMENTO & INSIGHTS AUTOMÁTICOS]`,
      `• Delineamento / Nível: ${evid.nome}`,
      `• Periódico: ${partesRevista.length ? partesRevista.join(' | ') : avalRevista.selo}`,
      `• Impacto do Artigo: ${partesArtigo.join(' | ')}`,
      ``,
      `📌 SÍNTESE PICO EXTRAÍDA:`,
      `• P (População/Problema): ${picoFinal.p}`,
      `• I (Intervenção/Exposição): ${picoFinal.i}`,
      `• C (Comparador/Controle): ${picoFinal.c}`,
      `• O (Desfechos/Resultados): ${picoFinal.o}`,
    ].join('\n');
  }

  const insights = {
    nivelId: evid.id,
    nivelNome: evid.nome,
    delineamento: evid.delineamento,
    nomeRevista: online.nomeRevista,
    issn: online.issn,
    quartil: avalRevista.quartil,
    qualisEstimado: avalRevista.qualis,
    seloRevista: avalRevista.selo,
    notaRevista: avalRevista.notaNum,
    fi2Anos: online.fi2Anos,
    hIndexRevista: online.hIndexRevista,
    i10IndexRevista: online.i10IndexRevista,
    notaArtigo: avalArtigo.notaArtigo,
    classificacaoArtigo: avalArtigo.classificacaoArtigo,
    citacoes: online.citacoes,
    citacoesPorAno: avalArtigo.citacoesPorAno,
    fwci: online.fwci,
    percentil: online.percentil,
    isTop10: online.isTop10,
    isTop1: online.isTop1,
    statusOa: online.statusOa,
    atualizadoEm: new Date().toISOString(),
  };

  return {
    csl: {
      ...csl,
      abstract: novoAbstract,
      ...(online.issn && !csl.ISSN ? { ISSN: online.issn } : {}),
    },
    nivelEvidencia: ref.nivelEvidencia || evid.id,
    pico: picoFinal,
    notas: novasNotas,
    insights,
    retratado: ref.retratado || online.retratado,
  };
}

module.exports = {
  gerarInsightsCompletos,
  detectarNivelEvidencia,
  extrairPicoAutomatico,
  estimarQuartilEQualis,
  calcularNotaDoArtigo,
};
