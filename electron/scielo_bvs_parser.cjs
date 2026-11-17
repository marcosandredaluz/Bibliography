/**
 * electron/scielo_bvs_parser.cjs
 * 
 * Conector e Normalizador Nativo para Literatura Regional de Saúde da América Latina (SciELO, BVS, LILACS).
 * Inspirado nas arquiteturas modulares do Paperlib e CSL-JSON.
 * 
 * Funcionalidade:
 * 1. Identificação determinística de identificadores regionais (PIDs SciELO, códigos LILACS e BVS/BIREME);
 * 2. Decomposição estruturada de PIDs SciELO (padrão de 23 caracteres que codifica ISSN, Ano, Fascículo e Ordem);
 * 3. Conversão direta para o esquema canônico CSL-JSON sem dependência de BeautifulSoup ou Python;
 * 4. Validação de formato para periódicos da base SciELO Brasil / Saúde Coletiva.
 */

'use strict';

/**
 * Regex para PID clássico SciELO de 23 caracteres:
 * Ex: S0104-11692020000100015 -> S + ISSN (0104-1169) + Ano (2020) + Fascículo (0001) + Artigo (00015)
 */
const REGEX_PID_SCIELO = /\bS(\d{4}-\d{3}[0-9xX])(\d{4})(\d{4})(\d{5})\b/i;

/**
 * Regex para URLs da plataforma SciELO (antiga e nova)
 */
const REGEX_URL_SCIELO = /https?:\/\/(?:www\.)?scielo\.(?:br|org|cl|org\.co|org\.mx|sa\.cr)\/(?:j\/[a-zA-Z0-9-]+\/a\/[a-zA-Z0-9]+|scielo\.php\?[^ \t\r\n>]+)/i;

/**
 * Regex para identificadores e URLs da BVS / LILACS (BIREME / OPAS / OMS)
 */
const REGEX_LILACS_BVS = /\b(?:LILACS|BVS|BIREME|ID:\s*lil[-_]?\d+|lil-\d+)\b/i;
const REGEX_URL_BVS = /https?:\/\/pesquisa\.bvsalud\.org\/portal\/resource\/[a-zA-Z0-9_-]+\/(?:lil-[0-9]+|[a-zA-Z0-9]+)/i;

/**
 * Decodifica um PID SciELO canônico extraindo ISSN, ano de publicação e fascículo
 */
function decodificarPidScielo(pid = '') {
  const m = String(pid).match(REGEX_PID_SCIELO);
  if (!m) return null;

  const issn = m[1];
  const ano = parseInt(m[2], 10);
  const numFasciculo = parseInt(m[3], 10);
  const numArtigo = parseInt(m[4], 10);

  return {
    pidCanonica: `S${issn}${m[2]}${m[3]}${m[4]}`,
    issn,
    ano,
    fasciculo: numFasciculo > 0 ? numFasciculo : null,
    ordemArtigo: numArtigo,
    fonte: 'SciELO'
  };
}

/**
 * Analisa uma referência ou URL e extrai identificadores regionais de saúde
 */
function extrairIdentificadoresRegionais(texto = '') {
  const achados = {
    temSciElo: false,
    temLilacsBvs: false,
    pidScielo: null,
    urlSciElo: null,
    urlBvs: null,
    dadosPid: null
  };

  if (!texto || typeof texto !== 'string') return achados;

  // 1. SciELO PID
  const mPid = texto.match(REGEX_PID_SCIELO);
  if (mPid) {
    achados.temSciElo = true;
    achados.pidScielo = mPid[0];
    achados.dadosPid = decodificarPidScielo(mPid[0]);
  }

  // 2. SciELO URL
  const mUrlSciElo = texto.match(REGEX_URL_SCIELO);
  if (mUrlSciElo) {
    achados.temSciElo = true;
    achados.urlSciElo = mUrlSciElo[0];
    if (!achados.pidScielo) {
      const mPidNaUrl = mUrlSciElo[0].match(/pid=([S0-9xX-]+)/i);
      if (mPidNaUrl) {
        achados.pidScielo = mPidNaUrl[1];
        achados.dadosPid = decodificarPidScielo(mPidNaUrl[1]);
      }
    }
  }

  // 3. LILACS / BVS
  if (REGEX_LILACS_BVS.test(texto) || REGEX_URL_BVS.test(texto)) {
    achados.temLilacsBvs = true;
    const mUrlBvs = texto.match(REGEX_URL_BVS);
    if (mUrlBvs) achados.urlBvs = mUrlBvs[0];
  }

  return achados;
}

/**
 * Normaliza uma referência regional transformando-a em formato compatível com CSL-JSON
 */
function normalizarRegistroRegional(ref = {}) {
  const texto = ref.textoOriginal || ref.raw || '';
  const idRegionais = extrairIdentificadoresRegionais(texto);

  if (!idRegionais.temSciElo && !idRegionais.temLilacsBvs) {
    return null;
  }

  const csl = {
    type: 'article-journal',
    title: ref.tituloBuscado || ref.titulo || '',
    issued: { 'date-parts': [[idRegionais.dadosPid?.ano || ref.ano || null]] },
    ISSN: idRegionais.dadosPid?.issn || null,
    issue: idRegionais.dadosPid?.fasciculo || null,
    URL: idRegionais.urlSciElo || idRegionais.urlBvs || ref.url || null,
    source: idRegionais.temSciElo ? 'SciELO Brasil / Regional' : 'BVS / LILACS',
    scieloPid: idRegionais.pidScielo || null,
  };

  return csl;
}

module.exports = {
  REGEX_PID_SCIELO,
  REGEX_URL_SCIELO,
  REGEX_LILACS_BVS,
  decodificarPidScielo,
  extrairIdentificadoresRegionais,
  normalizarRegistroRegional,
};
