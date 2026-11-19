'use strict';

/**
 * electron/intra_doc_reconciler.cjs
 *
 * Reconciliador Intra-Documento (Fase 2 - Aditivo):
 * 1. Extrai tabelas XML (<w:tbl>) de word/document.xml e confronta com chamadas "Tabela N" no texto.
 * 2. Confronta grandezas numericas (%, n=, OR/RR/HR, p=) entre Resumo/Abstract e Resultados.
 * 3. Rastreia siglas/acronimos (3 a 10 letras em caixa alta) usados sem definicao na primeira mencao.
 */

const fs = require('fs');
const { extrairArquivoDoZip, sanitizarCamposGerenciadorBibliografia } = require('./audit/docx_extractor.cjs');

const SIGLAS_UNIVERSAIS = new Set([
  'SUS', 'OMS', 'WHO', 'OPAS', 'PAHO', 'COVID', 'SARS', 'MERS', 'HIV', 'AIDS',
  'DNA', 'RNA', 'MRNA', 'PCR', 'UTI', 'ICU', 'IBGE', 'CID', 'ICD', 'FHIR',
  'HL7', 'RNDS', 'DOI', 'PMID', 'PMCID', 'URL', 'PDF', 'DOCX', 'XML', 'ISBN',
  'ISSN', 'ABNT', 'NBR', 'APA', 'CAPES', 'CNPQ', 'FAPESP', 'ANVISA', 'ANS',
  'CFM', 'CONITEC', 'NIH', 'CDC', 'FDA', 'EMA', 'PRISMA', 'CONSORT', 'STROBE',
  'GRADE', 'PICO', 'PICOS', 'ROB', 'ANOVA', 'USA', 'EUA', 'ONU', 'UNESCO',
  'UNICEF', 'HTTP', 'HTTPS', 'HTML', 'JSON', 'CSV', 'API', 'USB', 'CPU', 'GPU',
  'CTI', 'SAMU', 'UBS', 'ESF', 'APS', 'UFMG', 'UFRGS', 'USP', 'UNIFESP', 'FIOCRUZ',
  'INCA', 'MS', 'MEC', 'MCTI', 'CNES', 'SINAN', 'SIM', 'SIH', 'SIA', 'DATASUS',
  'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII', 'XIII', 'XIV', 'XV',
]);

function decodificarXmlSimples(str = '') {
  return String(str || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function extrairTextoCelulaXml(xmlCelula = '') {
  const tokens = [];
  const re = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let m;
  while ((m = re.exec(xmlCelula)) !== null) {
    tokens.push(decodificarXmlSimples(m[1]));
  }
  return sanitizarCamposGerenciadorBibliografia(tokens.join('')).replace(/\s+/g, ' ').trim();
}

/**
 * Extrai todas as tabelas <w:tbl> de word/document.xml preservando linhas, celulas e titulo/numero.
 */
function extrairTabelasXml(xmlPrincipal = '') {
  const xml = String(xmlPrincipal || '');
  if (!xml.includes('<w:tbl')) return [];

  const tabelas = [];
  const reTbl = /<w:tbl\b[^>]*>[\s\S]*?<\/w:tbl>/g;
  let mTbl;
  let idxSeq = 0;

  while ((mTbl = reTbl.exec(xml)) !== null) {
    idxSeq++;
    const tblXml = mTbl[0];
    const linhas = [];
    const reRow = /<w:tr\b[^>]*>[\s\S]*?<\/w:tr>/g;
    let mRow;
    while ((mRow = reRow.exec(tblXml)) !== null) {
      const celulas = [];
      const reCell = /<w:tc\b[^>]*>[\s\S]*?<\/w:tc>/g;
      let mCell;
      while ((mCell = reCell.exec(mRow[0])) !== null) {
        celulas.push(extrairTextoCelulaXml(mCell[0]));
      }
      if (celulas.some(Boolean)) linhas.push(celulas);
    }
    if (!linhas.length) continue;

    // Detecta legenda imediatamente anterior (ate 1200 chars antes de <w:tbl>) ou na 1a linha da tabela
    const contextoAntesXml = xml.slice(Math.max(0, mTbl.index - 1200), mTbl.index);
    const ultimosParagrafos = [...contextoAntesXml.matchAll(/<w:p\b[^>]*>[\s\S]*?<\/w:p>/g)]
      .slice(-2)
      .map((mp) => extrairTextoCelulaXml(mp[0]))
      .join(' ');
    const textoHeader = `${ultimosParagrafos} ${linhas[0].join(' ')}`.trim();
    const mNum = textoHeader.match(/\b(?:Tabela|Table|Quadro)\s+(\d{1,3})\b/i);
    const numero = mNum ? Number(mNum[1]) : idxSeq;

    const textoTabela = linhas.map((r) => r.join(' | ')).join('\n');
    tabelas.push({
      indice: idxSeq,
      numero,
      rotulo: `Tabela ${numero}`,
      linhas,
      textoTabela,
      assinaturas: extrairAssinaturasIntra(textoTabela),
    });
  }

  return tabelas;
}

/**
 * Extrai assinaturas numericas tipadas (%, n=, OR/RR/HR, p=) para reconciliacao interna.
 */
function extrairAssinaturasIntra(texto = '') {
  const txt = String(texto || '');
  const saida = [];
  let m;

  const rePct = /(\d+(?:[.,]\d+)?)\s*%/g;
  while ((m = rePct.exec(txt)) !== null) {
    saida.push({ tipo: 'percentual', valor: parseFloat(m[1].replace(',', '.')), bruto: m[0] });
  }

  const reN = /\bn\s*=\s*(\d+(?:\.\d{3})*)\b/gi;
  while ((m = reN.exec(txt)) !== null) {
    saida.push({ tipo: 'amostra_n', valor: parseInt(m[1].replace(/\./g, ''), 10), bruto: m[0] });
  }

  const reMed = /\b(OR|RR|HR)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\b/gi;
  while ((m = reMed.exec(txt)) !== null) {
    saida.push({ tipo: `medida_${m[1].toUpperCase()}`, valor: parseFloat(m[2].replace(',', '.')), bruto: m[0] });
  }

  const reP = /\bp\s*([=<>≤≥])\s*(0[.,]\d+|1[.,]0+)\b/gi;
  while ((m = reP.exec(txt)) !== null) {
    saida.push({ tipo: 'valor_p', valor: parseFloat(m[2].replace(',', '.')), bruto: m[0] });
  }

  return saida;
}

function compararConjuntoAssinaturas(sigsA = [], sigsB = []) {
  const divergencias = [];
  for (const a of sigsA) {
    const mesmosTiposB = sigsB.filter((b) => b.tipo === a.tipo);
    if (!mesmosTiposB.length) continue;
    const tol = a.tipo === 'valor_p' ? 0.002 : a.tipo === 'amostra_n' ? 0 : 0.05;
    const bateu = mesmosTiposB.some((b) => Math.abs(b.valor - a.valor) <= tol);
    if (!bateu) {
      divergencias.push({
        tipo: a.tipo,
        valorOrigem: a.bruto,
        valoresComparados: [...new Set(mesmosTiposB.map((x) => x.bruto))].slice(0, 4),
      });
    }
  }
  return divergencias;
}

function normalizarParagrafosEntrada(paragrafosCorpo = [], textoCompleto = '') {
  if (Array.isArray(paragrafosCorpo) && paragrafosCorpo.length > 0) {
    return paragrafosCorpo.map((p, i) =>
      typeof p === 'string'
        ? { texto: p, numParagrafo: i + 1, numLinha: i + 1, secao: 'Corpo do Texto' }
        : p
    );
  }
  return String(textoCompleto || '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((l, i) => ({ texto: l, numParagrafo: i + 1, numLinha: i + 1, secao: 'Corpo do Texto' }));
}

function limparCitacoesParaSiglas(texto = '') {
  return String(texto || '')
    // Remove blocos inteiros de citacao autor-data onde sobrenomes vem em CAIXA ALTA: (SILVA, 2020; SOUZA, 2021)
    .replace(/\([^)]*\b(?:19|20)\d\d[a-f]?\b[^)]*\)/g, ' ')
    // Remove chamadas estilo "SILVA (2020)"
    .replace(/\b[A-ZÀ-Ú]{2,15}(?:\s+[A-ZÀ-Ú]{2,15}){0,3}\s*\(\s*(?:19|20)\d\d[a-f]?\s*\)/g, ' ')
    // Remove URLs e DOIs
    .replace(/https?:\/\/\S+|10\.\d{4,9}\/\S+/gi, ' ');
}

/**
 * Rastreia siglas/acronimos (3 a 10 letras) sem definicao por extenso na 1a ocorrencia.
 */
function verificarSiglasSemDefinicao(paragrafos = []) {
  const definicoesVistas = new Set();
  const siglasAlertadas = new Set();
  const alertas = [];

  for (const par of paragrafos) {
    const txtOriginal = String(par?.texto || '');
    if (!txtOriginal) continue;
    const secNorm = String(par?.secao || '').toLowerCase();
    if (/refer[eê]ncia|bibliografia|ap[eê]ndice|anexo|lista\s+de\s+(?:siglas|abreviaturas)/.test(secNorm)) continue;

    // 1. Captura definicoes explicitas em parenteses "(SIGLA)" ou "SIGLA — ..." / "SIGLA:"
    const reDefParen = /\(\s*([A-ZÀ-Ú]{3,10})\s*\)/g;
    let mDef;
    while ((mDef = reDefParen.exec(txtOriginal)) !== null) {
      definicoesVistas.add(mDef[1]);
    }
    const reDefTraco = /\b([A-ZÀ-Ú]{3,10})\s*(?:[-–—:]\s*[A-Za-zÀ-ÿ]{3,}|\([^)]{6,}\))/g;
    while ((mDef = reDefTraco.exec(txtOriginal)) !== null) {
      definicoesVistas.add(mDef[1]);
    }

    // 2. Varre siglas restantes no texto livre (sem sobrenomes de citacoes)
    const textoSemCits = limparCitacoesParaSiglas(txtOriginal);
    const reSigla = /\b([A-Z]{3,10})\b/g;
    let mSig;
    while ((mSig = reSigla.exec(textoSemCits)) !== null) {
      const sigla = mSig[1];
      if (SIGLAS_UNIVERSAIS.has(sigla)) continue;
      if (definicoesVistas.has(sigla)) continue;
      if (siglasAlertadas.has(sigla)) continue;

      // Ignora titulos inteiros em CAIXA ALTA (paragrafo/janela sem palavras comuns em minusculas)
      if (txtOriginal === txtOriginal.toUpperCase() && txtOriginal.trim().split(/\s+/).length >= 1) continue;
      const janela = textoSemCits.slice(Math.max(0, mSig.index - 25), Math.min(textoSemCits.length, mSig.index + sigla.length + 25));
      const palavrasCaps = (janela.match(/\b[A-ZÀ-Ú]{3,}\b/g) || []).length;
      const temPalavrasMinusculas = /[a-zá-ú]{4,}/.test(janela);
      if (palavrasCaps >= 3 && !temPalavrasMinusculas) continue;

      siglasAlertadas.add(sigla);
      alertas.push({
        codigo: 'SIGLA_SEM_DEFINICAO',
        tipo: 'intra_sigla_sem_definicao',
        severidade: 'media',
        sigla,
        numParagrafo: par.numParagrafo || 0,
        numLinha: par.numLinha || 0,
        secao: par.secao || 'Corpo do Texto',
        fraseWord: txtOriginal.slice(0, 220),
        mensagem: `Sigla "${sigla}" utilizada no §${par.numParagrafo || '?'} (${par.secao || 'Texto'}) sem definição prévia por extenso na primeira menção.`,
      });
    }
  }

  return alertas;
}

/**
 * Confronta grandezas entre paragrafos do texto e celulas reais <w:tbl> do DOCX.
 */
function verificarTabelasContraTexto(tabelas = [], paragrafos = []) {
  if (!tabelas.length || !paragrafos.length) return [];
  const alertas = [];
  const mapaTabelas = new Map();
  for (const t of tabelas) {
    mapaTabelas.set(t.numero, t);
  }

  for (const par of paragrafos) {
    const txt = String(par?.texto || '');
    const mRefs = [...txt.matchAll(/\b(?:Tabela|Table|Quadro)\s+(\d{1,3})\b/gi)];
    if (!mRefs.length) continue;

    // Ignora a propria legenda "Tabela 1 — Distribuicao..."
    if (/^\s*(?:Tabela|Table|Quadro)\s+\d{1,3}\s*[:.–—-]/i.test(txt)) continue;

    const sigsPar = extrairAssinaturasIntra(txt);
    if (!sigsPar.length) continue;

    for (const mr of mRefs) {
      const numTab = Number(mr[1]);
      const tab = mapaTabelas.get(numTab);
      if (!tab || !tab.assinaturas.length) continue;

      const divs = compararConjuntoAssinaturas(sigsPar, tab.assinaturas);
      for (const d of divs) {
        alertas.push({
          codigo: 'DIVERGENCIA_TABELA_XML',
          tipo: 'intra_divergencia_tabela_xml',
          severidade: 'alta',
          tabelaNumero: numTab,
          numParagrafo: par.numParagrafo || 0,
          numLinha: par.numLinha || 0,
          secao: par.secao || 'Resultados',
          fraseWord: txt.slice(0, 240),
          mensagem: `Divergência interna com ${tab.rotulo} (${d.tipo}): o texto no §${par.numParagrafo || '?'} cita "${d.valorOrigem}", enquanto as células XML da ${tab.rotulo} registram "${d.valoresComparados.join(', ')}".`,
        });
      }
    }
  }

  return alertas;
}

/**
 * Confronta metricas principais declaradas no Resumo/Abstract contra a secao Resultados.
 */
function verificarResumoContraResultados(paragrafos = []) {
  const txtResumo = [];
  const txtResultados = [];
  let parResumoRef = null;

  for (const p of paragrafos) {
    const sec = String(p?.secao || '').toLowerCase();
    if (/^(?:resumo|abstract)\b/.test(sec) || /\bresumo\b|\babstract\b/.test(sec)) {
      txtResumo.push(p.texto);
      if (!parResumoRef) parResumoRef = p;
    } else if (/\bresultados?\b|\bresults?\b/.test(sec)) {
      txtResultados.push(p.texto);
    }
  }

  if (!txtResumo.length || !txtResultados.length) return [];

  const sigsResumo = extrairAssinaturasIntra(txtResumo.join(' '));
  const sigsResultados = extrairAssinaturasIntra(txtResultados.join(' '));
  if (!sigsResumo.length || !sigsResultados.length) return [];

  // Foca nas grandezas de amostra (n=) e percentuais declarados no Resumo que nao aparecem em Resultados
  const divs = compararConjuntoAssinaturas(sigsResumo, sigsResultados);
  const alertas = [];
  const vistas = new Set();

  for (const d of divs) {
    const chave = `${d.tipo}:${d.valorOrigem}`;
    if (vistas.has(chave)) continue;
    vistas.add(chave);
    alertas.push({
      codigo: 'DIVERGENCIA_RESUMO_RESULTADOS',
      tipo: 'intra_divergencia_resumo_resultados',
      severidade: 'alta',
      numParagrafo: parResumoRef?.numParagrafo || 1,
      numLinha: parResumoRef?.numLinha || 1,
      secao: 'Resumo × Resultados',
      fraseWord: txtResumo[0]?.slice(0, 240) || '',
      mensagem: `Divergência interna Resumo × Resultados (${d.tipo}): o Resumo informa "${d.valorOrigem}", mas a seção Resultados apresenta "${d.valoresComparados.join(', ')}".`,
    });
  }

  return alertas;
}

/**
 * Ponto de entrada principal da Fase 2.1: reconcilia tabelas XML, Resumo vs Resultados e siglas.
 */
function reconciliarIntraDocumento({ bufferDocx = null, xmlDocument = null, textoCompleto = '', paragrafosCorpo = [] } = {}) {
  let xml = xmlDocument || '';
  if (!xml && bufferDocx) {
    const buf = Buffer.isBuffer(bufferDocx)
      ? bufferDocx
      : typeof bufferDocx === 'string' && fs.existsSync(bufferDocx)
      ? fs.readFileSync(bufferDocx)
      : null;
    if (buf) {
      const xmlBuf = extrairArquivoDoZip(buf, 'word/document.xml');
      if (xmlBuf) xml = xmlBuf.toString('utf8');
    }
  }

  const paragrafos = normalizarParagrafosEntrada(paragrafosCorpo, textoCompleto);
  const tabelasXml = xml ? extrairTabelasXml(xml) : [];

  const alertasTabelas = verificarTabelasContraTexto(tabelasXml, paragrafos);
  const alertasResumo = verificarResumoContraResultados(paragrafos);
  const alertasSiglas = verificarSiglasSemDefinicao(paragrafos);

  const alertas = [...alertasTabelas, ...alertasResumo, ...alertasSiglas];

  return {
    tabelasDetectadas: tabelasXml.length,
    tabelasXml,
    alertasTabelas,
    alertasResumo,
    alertasSiglas,
    alertas,
  };
}

module.exports = {
  SIGLAS_UNIVERSAIS,
  extrairTabelasXml,
  extrairAssinaturasIntra,
  verificarTabelasContraTexto,
  verificarResumoContraResultados,
  verificarSiglasSemDefinicao,
  reconciliarIntraDocumento,
};
