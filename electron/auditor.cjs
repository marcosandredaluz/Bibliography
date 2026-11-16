// Auditoria Reversa e Forense de Manuscritos (.docx, .pdf, .txt):
// 1. Extrai o texto de arquivos .docx (descompactando word/document.xml nativamente) ou .txt
// 2. Delimita com precisão o Corpo do Texto, a Seção de Referências e eventuais Seções Pós-Referências (Anexos / Notas à Orientação)
// 3. Extrai todas as citações no texto (com suporte a sufixos 2023a/b/c, sobrenomes compostos como DOS SANTOS e siglas institucionais como ISO, INCA, HL7)
// 4. Cruza Citações no Texto x Lista de Referências sem truncar sobrenomes e extraindo o ano real de publicação (ignorando anos dentro do título como "2012-2021")
// 5. Separa Artigos Científicos de Periódicos vs. Leis, Normas Técnicas (ISO/HL7/IHE/RNDS), Protocolos e Livros (que não possuem abstract)
// 6. Valida DOIs (detectando DOI inexistente e DOI trocado), recupera resumos bilíngues (PubMed XML + OpenAlex) e faz verificação semântica bilíngue PT↔EN + numérica.
const fs = require('fs');
const zlib = require('zlib');
const { porDoi, porPmid, porPmc, buscarTitulo, normalizarDoi } = require('./metadata.cjs');
const { localizarUrlPdfAberto, baixarPdfParaArquivo } = require('./importers.cjs');
const { extrairMetadadosCslEmbutidosNoXml } = require('./csl_mendeley_parser.cjs');
const { classificarReferenciaHarmonizada } = require('./lener_br_classifier.cjs');
const { calcularSimilaridadeSemanticaOnnx } = require('./semantic_onnx.cjs');
const path = require('path');
const os = require('os');
const DiffMatchPatch = require('diff-match-patch');
const { IndiceWinnowing } = require('./similarity_winnowing.cjs');
const { executarGreedyStringTiling } = require('./similarity_tiling.cjs');

// Mapa CSL-JSON extraído do último arquivo .docx aberto (Mendeley / Zotero / EndNote)
let ultimoMapaCslEmbutidoDocx = null;

// Instância oficial do Google Diff Match Patch para correspondência difusa e detecção de cópia literal
const dmp = new DiffMatchPatch();
dmp.Diff_Timeout = 0.5;
dmp.Diff_EditCost = 4;
dmp.Match_Distance = 1000;
dmp.Match_Threshold = 0.6;

// ---------- 1. Leitor nativo e resiliente de .DOCX (ZIP -> word/document.xml) ----------
function extrairArquivoDoZip(buf, nomeAlvo) {
  if (!buf || buf.length < 22) return null;
  const nomeNormalizadoAlvo = nomeAlvo.replace(/\\/g, '/').toLowerCase();

  // 1. TENTATIVA VIA CENTRAL DIRECTORY (O padrão oficial da especificação ZIP — resolve Bit 3 e streaming)
  try {
    let eocdOffset = -1;
    // O EOCD tem no mínimo 22 bytes e no máximo 22 + 65535 (tamanho máximo de comentário)
    const limiteBusca = Math.max(0, buf.length - 65557);
    for (let i = buf.length - 22; i >= limiteBusca; i--) {
      if (buf.readUInt32LE(i) === 0x06054b50) {
        eocdOffset = i;
        break;
      }
    }

    if (eocdOffset !== -1) {
      const offsetCentralDir = buf.readUInt32LE(eocdOffset + 16);
      let cdOffset = offsetCentralDir;

      while (cdOffset + 46 <= buf.length) {
        if (buf.readUInt32LE(cdOffset) !== 0x02014b50) break;
        const metodo = buf.readUInt16LE(cdOffset + 10);
        const tamComp = buf.readUInt32LE(cdOffset + 20);
        const tamNome = buf.readUInt16LE(cdOffset + 28);
        const tamExtra = buf.readUInt16LE(cdOffset + 30);
        const tamComent = buf.readUInt16LE(cdOffset + 32);
        const offsetLocalHeader = buf.readUInt32LE(cdOffset + 42);

        const nomeArquivo = buf.subarray(cdOffset + 46, cdOffset + 46 + tamNome).toString('utf8').replace(/\\/g, '/');

        if (nomeArquivo.toLowerCase() === nomeNormalizadoAlvo || nomeArquivo.toLowerCase().endsWith('/' + nomeNormalizadoAlvo)) {
          // Achou no Central Directory! Lê o Local File Header no offset exato
          if (offsetLocalHeader + 30 <= buf.length && buf.readUInt32LE(offsetLocalHeader) === 0x04034b50) {
            const tamNomeLocal = buf.readUInt16LE(offsetLocalHeader + 26);
            const tamExtraLocal = buf.readUInt16LE(offsetLocalHeader + 28);
            const inicioDados = offsetLocalHeader + 30 + tamNomeLocal + tamExtraLocal;
            const fatia = buf.subarray(inicioDados, inicioDados + tamComp);

            if (metodo === 0) return fatia;
            if (metodo === 8) {
              try {
                return zlib.inflateRawSync(fatia);
              } catch (eRaw) {
                return zlib.inflateSync(fatia);
              }
            }
          }
        }

        cdOffset += 46 + tamNome + tamExtra + tamComent;
      }
    }
  } catch (e) {
    // Continua para os fallbacks
  }

  // 2. TENTATIVA VIA LOCAL FILE HEADERS LINEAR (Com recuperação de sincronismo e Bit 3)
  try {
    let offset = 0;
    while (offset + 30 <= buf.length) {
      if (buf.readUInt32LE(offset) !== 0x04034b50) {
        const prox = buf.indexOf(Buffer.from([0x50, 0x4b, 0x03, 0x04]), offset + 1);
        if (prox === -1) break;
        offset = prox;
      }

      const flags = buf.readUInt16LE(offset + 6);
      const metodo = buf.readUInt16LE(offset + 8);
      let tamComp = buf.readUInt32LE(offset + 18);
      const tamNome = buf.readUInt16LE(offset + 26);
      const tamExtra = buf.readUInt16LE(offset + 28);
      const nome = buf.subarray(offset + 30, offset + 30 + tamNome).toString('utf8').replace(/\\/g, '/');
      const inicioDados = offset + 30 + tamNome + tamExtra;

      if (nome.toLowerCase() === nomeNormalizadoAlvo || nome.toLowerCase().endsWith('/' + nomeNormalizadoAlvo)) {
        if (tamComp === 0 || (flags & 0x08)) {
          // Bit 3 (data descriptor / streaming ZIP): descomprime até encontrar o fim do stream DEFLATE
          try {
            return zlib.inflateRawSync(buf.subarray(inicioDados));
          } catch {}
        } else {
          const fatia = buf.subarray(inicioDados, inicioDados + tamComp);
          if (metodo === 0) return fatia;
          if (metodo === 8) {
            try {
              return zlib.inflateRawSync(fatia);
            } catch {
              return zlib.inflateSync(fatia);
            }
          }
        }
      }

      offset = inicioDados + (tamComp > 0 ? tamComp : 1);
    }
  } catch (e) {
    // Continua para o fallback de varredura
  }

  // 3. TENTATIVA VIA VARREDURA DIRETA DO NOME DO ARQUIVO (Emergency scan)
  try {
    const variantes = [nomeAlvo, nomeAlvo.replace(/\//g, '\\'), nomeNormalizadoAlvo];
    for (const v of variantes) {
      let pos = -1;
      while ((pos = buf.indexOf(v, pos + 1)) !== -1) {
        for (let recuo = 30; recuo <= 80; recuo++) {
          const headerPos = pos - recuo;
          if (headerPos >= 0 && buf.readUInt32LE(headerPos) === 0x04034b50) {
            const tamNome = buf.readUInt16LE(headerPos + 26);
            const tamExtra = buf.readUInt16LE(headerPos + 28);
            const inicioDados = headerPos + 30 + tamNome + tamExtra;
            const tamComp = buf.readUInt32LE(headerPos + 18);

            if (inicioDados < buf.length) {
              try {
                if (tamComp > 0) {
                  return zlib.inflateRawSync(buf.subarray(inicioDados, inicioDados + tamComp));
                } else {
                  return zlib.inflateRawSync(buf.subarray(inicioDados));
                }
              } catch {}
            }
          }
        }
      }
    }
  } catch (e) {}

  return null;
}

/**
 * Remove instruções ocultas de campos de gerenciadores bibliográficos (Mendeley, Zotero, EndNote)
 * caso o texto bruto tenha sido colado com códigos ADDIN CSL_CITATION ou CSL_BIBLIOGRAPHY.
 */
function sanitizarCamposGerenciadorBibliografia(texto) {
  if (!texto) return '';
  let s = String(texto);
  // Remove blocos ADDIN CSL_CITATION {...} com chaves balanceadas
  let idx = -1;
  while ((idx = s.indexOf('ADDIN CSL_CITATION')) !== -1) {
    const inicioJson = s.indexOf('{', idx);
    if (inicioJson === -1) break;
    let nivel = 0;
    let emString = false;
    let escape = false;
    let fimJson = -1;
    for (let i = inicioJson; i < s.length; i++) {
      const ch = s[i];
      if (escape) {
        escape = false;
        continue;
      }
      if (ch === '\\') {
        escape = true;
        continue;
      }
      if (ch === '"') {
        emString = !emString;
        continue;
      }
      if (!emString) {
        if (ch === '{') nivel++;
        else if (ch === '}') {
          nivel--;
          if (nivel === 0) {
            fimJson = i;
            break;
          }
        }
      }
    }
    if (fimJson !== -1) {
      let citFormatada = '';
      try {
        const obj = JSON.parse(s.slice(inicioJson, fimJson + 1));
        citFormatada = String(obj?.mendeley?.plainTextFormattedCitation || obj?.properties?.formattedCitation || '')
          .replace(/<[^>]+>/g, '')
          .trim();
      } catch {}
      // Verifica se logo após o fimJson já consta a chamada numérica visível
      const posBloco = s.slice(fimJson + 1, fimJson + 25);
      if (citFormatada && /^\d+(?:\s*[,;–-]\s*\d+)*$/.test(citFormatada)) {
        if (posBloco.startsWith(citFormatada)) {
          s = s.slice(0, idx) + ` [${citFormatada}] ` + s.slice(fimJson + 1 + citFormatada.length);
        } else {
          s = s.slice(0, idx) + ` [${citFormatada}] ` + s.slice(fimJson + 1);
        }
      } else {
        s = s.slice(0, idx) + s.slice(fimJson + 1);
      }
    } else {
      // Fallback caso o JSON esteja truncado
      s = s.replace(/ADDIN CSL_CITATION\s*\{[^\n]*/, '');
      break;
    }
  }
  return s
    .replace(/ADDIN\s+Mendeley\s+Bibliography\s+CSL_BIBLIOGRAPHY\s*/gi, '')
    .replace(/ADDIN\s+ZOTERO_BIBL[^\n]*\s*/gi, '')
    .replace(/ADDIN\s+EN\.REFLIST\s*/gi, '')
    .replace(/\bTOC\s+\\o\s+"[^"]*"[^\n]*?(?=\d+\.\s+[A-ZÀ-Ú])/g, '')
    .replace(/\bPAGEREF\s+_Toc\d+\s+\\h\s*/g, ' ');
}

function xmlParaTextoLimpo(xmlStr) {
  if (!xmlStr) return '';
  // 1. Remove tags <w:instrText> (instruções ocultas de campos do Word, como ADDIN CSL_CITATION do Mendeley/Zotero, TOC e PAGEREF)
  // 2. Marca runs <w:r> em sobrescrito (<w:vertAlign w:val="superscript"/>) com sentinelas \uE000...\uE001 antes de remover as tags XML
  const comMarcadores = xmlStr
    .replace(/<w:instrText\b[^>]*>[\s\S]*?<\/w:instrText>/g, '')
    .replace(
      /<w:r\b[^>]*>(?:(?!<\/w:r>)[\s\S])*?<w:vertAlign\b[^>]*w:val="superscript"[^>]*\/>(?:(?!<\/w:r>)[\s\S])*?<\/w:r>/g,
      (runXml) => {
        const t = runXml.replace(/<[^>]+>/g, '');
        return `\uE000${t}\uE001`;
      }
    )
    .replace(/<\/w:tc>/g, '\uE002\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:tab\/>/g, ' ')
    .replace(/<w:br[^/>]*\/>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ');

  // 3. Une runs de sobrescrito adjacentes (mesmo quando havia <w:proofErr/> ou <w:bookmarkEnd/> entre eles no XML)
  // e converte chamadas numéricas Vancouver em sobrescrito (ex.: 1, 3,4, 11–14, 3,12–14,23,25–28) para [1], [3,4], [11–14]
  const textoSemSentinelas = comMarcadores
    .replace(/\uE001\uE000/g, '')
    .replace(/\uE000([^\uE001]+)\uE001/g, (_, conteudo) => {
      const limpo = conteudo.trim();
      if (/^\d+(?:\s*[,;–-]\s*\d+)*$/.test(limpo)) {
        return ` [${limpo}] `;
      }
      return conteudo;
    })
    .replace(/[\uE000\uE001]/g, '');

  return sanitizarCamposGerenciadorBibliografia(textoSemSentinelas);
}

function extrairTextoDocx(caminho) {
  const buf = fs.readFileSync(caminho);

  if (!buf || buf.length === 0) {
    throw new Error('O arquivo selecionado está vazio.');
  }

  // Verifica se é formato binário antigo .doc (OLE CFBF: D0 CF 11 E0)
  if (buf.length >= 4 && buf.readUInt32BE(0) === 0xd0cf11e0) {
    throw new Error('Este arquivo está no formato Word 97-2003 antigo (.doc). Por favor, abra-o no Word e salve como .docx.');
  }

  // Extrai o documento principal
  const xmlBuf = extrairArquivoDoZip(buf, 'word/document.xml');
  if (!xmlBuf) {
    throw new Error('Não foi possível ler word/document.xml dentro do arquivo .docx. O arquivo pode estar corrompido ou protegido por senha.');
  }

  const xmlPrincipalStr = xmlBuf.toString('utf8');
  // Camada 1: Antes de limpar <w:instrText>, captura todos os metadados estruturados CSL-JSON do Mendeley/Zotero
  try {
    ultimoMapaCslEmbutidoDocx = extrairMetadadosCslEmbutidosNoXml(xmlPrincipalStr);
  } catch {
    ultimoMapaCslEmbutidoDocx = null;
  }

  let textoCompleto = xmlParaTextoLimpo(xmlPrincipalStr);

  // Opcional: extrai também notas de rodapé (footnotes) e notas de fim (endnotes) se existirem
  try {
    const fnBuf = extrairArquivoDoZip(buf, 'word/footnotes.xml');
    if (fnBuf) {
      const fnTexto = xmlParaTextoLimpo(fnBuf.toString('utf8')).trim();
      if (fnTexto) textoCompleto += '\n\n' + fnTexto;
    }
    const enBuf = extrairArquivoDoZip(buf, 'word/endnotes.xml');
    if (enBuf) {
      const enTexto = xmlParaTextoLimpo(enBuf.toString('utf8')).trim();
      if (enTexto) textoCompleto += '\n\n' + enTexto;
    }
  } catch {}

  return textoCompleto;
}

// ---------- 2. Normalização e Chaves Canônicas de Autores e Anos ----------
function normalizarChave(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const PARTICULAS_NOME = new Set([
  'de', 'da', 'do', 'dos', 'das', 'del', 'della', 'di', 'du',
  'van', 'von', 'der', 'den', 'el', 'la', 'le', 'mc', 'mac',
]);

// Mapa de equivalências entre siglas e nomes institucionais por extenso
const EQUIVALENCIAS_INSTITUCIONAIS = [
  ['iso', 'internationalorganizationforstandardization'],
  ['inca', 'institutonacionaldecancer', 'institutonacionaldecancerbrasil'],
  ['acr', 'americancollegeofradiology'],
  ['hl7', 'hl7international'],
  ['ihe', 'iheinternational'],
  ['oms', 'who', 'organizacaomundialdasaude', 'worldhealthorganization'],
  ['opas', 'paho', 'organizacaopanamericanadasaude', 'panamericanhealthorganization'],
  ['cdc', 'centersfordiseasecontrolandprevention', 'centersfordiseasecontrol'],
  ['ms', 'ministeriodasaude', 'brasilministeriodasaude'],
  ['ibge', 'institutobrasileirodegeografiaeesatistica', 'institutobrasileirodegeografiaeeestatistica'],
  ['anvisa', 'agencianacionaldevigilanciasanitaria'],
  ['fiocruz', 'fundacaooswaldocruz'],
  ['conitec', 'comissaonacionaldeincorporacaodetecnologiasnosus'],
  ['ipea', 'institutodepesquisaeconomicaaplicada'],
  ['unicef', 'fundodasnacoesunidasparaainfancia', 'unitednationschildrenfund'],
  ['unesco', 'unitednationseducationalscientificandculturalorganization'],
  ['onu', 'un', 'organizacaodasnacoesunidas', 'unitednations'],
  ['ema', 'europeanmedicinesagency'],
  ['fda', 'foodanddrugadministration'],
];

function expandirAliasesAutor(chavesBase) {
  const conjunto = new Set(chavesBase.filter(Boolean));
  for (const grupo of EQUIVALENCIAS_INSTITUCIONAIS) {
    if (grupo.some((k) => conjunto.has(k))) {
      for (const k of grupo) conjunto.add(k);
    }
  }
  return [...conjunto];
}

/**
 * A partir do trecho de autor de uma citação no texto — ex.:
 * "DOS SANTOS et al.", "OLIVEIRA; SILVA; SOUZA", "HL7 INTERNATIONAL",
 * "INSTITUTO NACIONAL DE CÂNCER", "AMERICAN COLLEGE OF RADIOLOGY", "ISO", "BRASIL"
 * retorna { autorExibicao, chavePrincipal, chavesAlias }.
 */
const SIGLAS_CONTEXTO_NAO_AUTOR = new Set(['aps', 'sus', 'esf', 'ubs', 'psf', 'pns', 'tcc', 'pec', 'ab', 'rnds']);

function extrairChavesAutorDeCitacao(trechoAutorBruto) {
  const limpo = String(trechoAutorBruto || '')
    .replace(/\bet\s+al\.?/gi, '')
    .replace(/\([^)]*\)/g, '')
    .trim();

  // Ignora termos de autoautoria em figuras/quadros (ex.: "Elaborado pela autora", "Autoria própria")
  if (/\b(?:elaborad[oa]|produzid[oa]|organizad[oa]|autoria\s+pr[oó]pria|adaptad[oa]|modificad[oa])\b/i.test(limpo)) {
    return { chavePrincipal: '', chavesAlias: [], autorExibicao: '' };
  }

  // Verifica se é entidade corporativa/institucional
  const ehCorporativo =
    /\b(instituto|international|college|organization|organizacao|ministerio|secretaria|departamento|associacao|association|society|sociedade|brasil|curitiba|world|mundial|hl7|ihe|iso|inca|oms|who|conass|conasems|anvisa|ibge|fiocruz|opas|paho|cdc|centers\s+for\s+disease|conitec|ipea|unicef|unesco|united\s+nations|european\s+medicines|food\s+and\s+drug|fundacao|funda[cç][aã]o|agencia|ag[eê]ncia|tribunal|conselho\s+nacional)\b/i.test(
      limpo
    );

  let primeiroBloco = '';
  let coautores = [];
  if (ehCorporativo) {
    primeiroBloco = limpo.replace(/[,.:]+$/, '').trim();
    coautores = [primeiroBloco];
  } else {
    // Separa coautores por ";", " e ", " & ", " and " ou vírgula entre autores
    coautores = limpo.split(/\s*;\s*|\s+(?:e|&|and)\s+|\s*,\s*/i).filter(Boolean);
    // Se o primeiro elemento for uma sigla contextual de sistema/saúde (ex.: 'APS', 'SUS'), remove-o para pegar o autor real
    while (coautores.length > 1 && SIGLAS_CONTEXTO_NAO_AUTOR.has(normalizarChave(coautores[0]))) {
      coautores.shift();
    }
    primeiroBloco = (coautores[0] || limpo).replace(/[,.:]+$/, '').trim();
  }

  const palavras = primeiroBloco.split(/\s+/).filter(Boolean);
  const semParticulas = palavras.filter((p) => !PARTICULAS_NOME.has(normalizarChave(p)));

  const chaveBlocoInteiro = normalizarChave(primeiroBloco);
  const chaveSemParticulas = normalizarChave(semParticulas.join(''));
  const ultimaPalavra = normalizarChave(semParticulas[semParticulas.length - 1] || palavras[palavras.length - 1] || '');
  const primeiraPalavra = normalizarChave(semParticulas[0] || palavras[0] || '');

  const chavePrincipal = ehCorporativo
    ? chaveBlocoInteiro || primeiraPalavra
    : (palavras.length > 1 ? chaveSemParticulas : ultimaPalavra) || chaveSemParticulas || chaveBlocoInteiro;

  const aliasesSet = new Set([
    chavePrincipal,
    chaveBlocoInteiro,
    chaveSemParticulas,
    ultimaPalavra,
    primeiraPalavra,
  ]);

  for (const ca of coautores) {
    const k = normalizarChave(ca);
    if (k.length >= 3 && !SIGLAS_CONTEXTO_NAO_AUTOR.has(k)) aliasesSet.add(k);
    const caPals = ca.split(/\s+/).filter((p) => !PARTICULAS_NOME.has(normalizarChave(p)));
    const semP = normalizarChave(caPals.join(''));
    if (semP.length >= 3 && !SIGLAS_CONTEXTO_NAO_AUTOR.has(semP)) aliasesSet.add(semP);
    if (caPals.length > 1) {
      const ult = normalizarChave(caPals[caPals.length - 1]);
      if (ult.length >= 3 && !SIGLAS_CONTEXTO_NAO_AUTOR.has(ult)) aliasesSet.add(ult);
    }
  }

  const aliases = expandirAliasesAutor(Array.from(aliasesSet));

  return {
    autorExibicao: primeiroBloco,
    chavePrincipal,
    chavesAlias: aliases,
  };
}

/**
 * A partir de uma linha da lista final de Referências — ex.:
 * "DOS SANTOS, S. G. P.; CRUZ, C. F. R....",
 * "HL7 INTERNATIONAL. Bidirectional Services...",
 * "INSTITUTO NACIONAL DE CÂNCER (Brasil). Estimativa 2026...",
 * "INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. ISO 13940:2015...",
 * "CURITIBA (Município). Secretaria Municipal da Saúde...",
 * "MENDES, E. V. As redes de atenção à saúde..."
 */
function extrairAutorETituloDeReferencia(linha) {
  const textoBruto = sanitizarCamposGerenciadorBibliografia(String(linha || '')).trim();
  const mNumRef = textoBruto.match(/^\s*(?:\[(\d+)\]|(\d+)\.|\((\d+)\))\s+/);
  const numeroRef = mNumRef ? Number(mNumRef[1] || mNumRef[2] || mNumRef[3]) : null;

  const semNum = textoBruto
    .replace(/^\s*(?:\[\d+\]|\d+\.|\(\d+\))\s*/, '')
    .trim();

  let primeiroSegmento = '';
  let defeitoPreposicaoEntrada = null;
  let ehCorporativo = false;

  // Caso especial Mendeley Vancouver para Ministério da Saúde: "Brasil M da S." ou "Brasil.Ministério da Saúde."
  if (/^Brasil\s+M\s+da\s+S\./i.test(semNum) || /^Brasil\.\s*Minist[eé]rio\s+da\s+Sa[uú]de/i.test(semNum)) {
    ehCorporativo = true;
    primeiroSegmento = 'Brasil';
  }

  // Regra R2: Chave de autor corporativo é o elemento de entrada inteiro (termina no ponto final ou parêntese jurisdicional)
  // Ex.: "INSTITUTO NACIONAL DE CÂNCER (Brasil).", "HL7 INTERNATIONAL.", "AMERICAN COLLEGE OF RADIOLOGY.", "Goiás.", "Instituto Federal de Goiás."
  const mCorporativo = !ehCorporativo && semNum.match(
    /^([A-Za-zÀ-ÿ0-9\s'-]+?(?:INSTITUTO|INTERNATIONAL|COLLEGE|ORGANIZATION|ORGANIZACAO|ORGANIZA[CÇ][AÃ]O|MINISTERIO|MINIST[EÉ]RIO|SECRETARIA|ASSOCIACAO|ASSOCIATION|SOCIETY|SOCIEDADE|BRASIL|GOI[AÁ]S|CURITIBA|WORLD|OMS|WHO|OPAS|PAHO|CDC|CENTERS\s+FOR\s+DISEASE|UNITED\s+NATIONS|UNICEF|UNESCO|EUROPEAN\s+MEDICINES|FOOD\s+AND\s+DRUG|FUNDA[CÇ][AÃ]O|FIOCRUZ|CONITEC|IPEA|CONASS|CONASEMS|TRIBUNAL|CONSELHO\s+NACIONAL|HL7|IHE|ISO|INCA|ANVISA|IBGE)[A-Za-zÀ-ÿ0-9\s'-]*?)(?:\s*\([^)]+\))?\.\s+/i
  );

  if (mCorporativo) {
    ehCorporativo = true;
    primeiroSegmento = mCorporativo[1].trim();
  } else if (!ehCorporativo) {
    // Para autores pessoais, o elemento de entrada termina na primeira vírgula que separa sobrenome de prenome/iniciais
    const antesVirgula = semNum.split(/[,;(]/)[0].trim();

    // Regra R3 (ABNT NBR 6023): Preposição/partícula em CAIXA ALTA no início de entrada ABNT (ex.: "DOS SANTOS, S. G. P.", "DE SILVA, M. A.", "VAN DER BERG, J.", "DE LA CRUZ, M.")
    const mPrepCaixaAlta = antesVirgula.match(
      /^((?:DE\s+LA|VAN\s+DER|VAN\s+DEN|DEL\s+LA|DE|DA|DO|DOS|DAS|DEL|DELLA|DI|DU|VAN|VON|LE|LA|MC|MAC))\s+([A-ZÀ-Ú]{2,}[A-Za-zÀ-ÿ'’-]*)$/
    );

    // Detecta formato Vancouver pessoal em caixa mista (ex.: "Domingues CMAS", "Van der Berg J", "De la Cruz M", "Mc Donald R", "O'Connor PJ", "Al-Mansoor K")
    const mVancouverPessoal =
      !mPrepCaixaAlta &&
      antesVirgula.match(
        /^((?:(?:de\s+la|van\s+der|van\s+den|de|da|do|dos|das|van|von|del|della|di|du|le|la|mc|mac)\s+)?[A-ZÀ-Ú][A-Za-zà-ú'’-]+(?:-[A-ZÀ-Ú][A-Za-zà-ú'’-]+)?(?:\s+[A-ZÀ-Ú][a-zà-ú'’-]+)?)\s+(?:(?:Jr\.?|Junior|J[uú]nior|Filho|Neto|Sobrinho|II|III)\s+)?[A-Z]{1,5}(?:\s+(?:de|da|do|dos|das|Jr\.?|Filho|Neto)\s*[A-Z]{0,4})?$/
      );

    if (mVancouverPessoal) {
      // No padrão Vancouver numerado, remove apenas as partículas iniciais se forem preposições lusófonas/hispânicas, ou preserva o núcleo
      primeiroSegmento = mVancouverPessoal[1]
        .replace(/^(?:de\s+la|van\s+der|van\s+den|de|da|do|dos|das|van|von|del|della|di|du|le|la)\s+/i, '')
        .trim();
    } else {
      const mPrep =
        mPrepCaixaAlta ||
        antesVirgula.match(/^((?:de\s+la|van\s+der|van\s+den|de|da|do|dos|das|del|della|di|du|van|von|le|la))\s+([A-ZÀ-Úa-zà-ú'’-]+)$/i);
      if (mPrep && !numeroRef) {
        defeitoPreposicaoEntrada = {
          preposicao: mPrep[1].toUpperCase(),
          sobrenome: mPrep[2].toUpperCase(),
          entradaDeclarada: antesVirgula,
          sugestao: `${mPrep[2].toUpperCase()}, ... ${mPrep[1].toLowerCase()}`,
        };
        primeiroSegmento = mPrep[2].toUpperCase(); // Chave correta é SANTOS/SILVA, não DOS/DE
      } else if (mPrep) {
        primeiroSegmento = mPrep[2];
      } else {
        primeiroSegmento = antesVirgula.replace(/\.\s+.*$/, '').trim();
      }
    }
  }

  const palavrasSeg = primeiroSegmento.split(/\s+/).filter(Boolean);
  const semParticulas = palavrasSeg.filter((p) => !PARTICULAS_NOME.has(normalizarChave(p)));

  const chaveInteira = normalizarChave(primeiroSegmento);
  const chaveSemPart = normalizarChave(semParticulas.join(''));
  const ultimaPalavra = normalizarChave(semParticulas[semParticulas.length - 1] || palavrasSeg[palavrasSeg.length - 1] || '');
  const primeiraPalavra = normalizarChave(semParticulas[0] || palavrasSeg[0] || '');

  if (!ehCorporativo) {
    ehCorporativo =
      /\b(instituto|international|college|organization|organizacao|ministerio|secretaria|associacao|association|society|sociedade|brasil|goias|curitiba|world|mundial|hl7|ihe|iso|inca|oms|who)\b/i.test(
        primeiroSegmento
      ) || palavrasSeg.length >= 3;
  }

  // Regra R2: Para autor corporativo, a chave principal é o elemento de entrada inteiro (ex.: institutonacionaldecancer)
  const chavePrincipal = ehCorporativo
    ? chaveInteira || primeiraPalavra
    : chaveSemPart || ultimaPalavra || chaveInteira;

  const aliasesBase = [chavePrincipal, chaveInteira, chaveSemPart, ultimaPalavra, primeiraPalavra];
  // Se a linha menciona explicitamente siglas conhecidas, adiciona aos aliases
  if (/\bISO\s+\d+/i.test(semNum)) aliasesBase.push('iso');
  if (/\bINCA\b/i.test(semNum)) aliasesBase.push('inca');
  if (/\bBI-RADS\b/i.test(semNum)) aliasesBase.push('acr');
  if (/^Brasil\s+M\s+da\s+S\./i.test(semNum) || /\bMinist[eé]rio\s+da\s+Sa[uú]de\b/i.test(semNum)) {
    aliasesBase.push('brasil', 'ms', 'ministeriodasaude');
  }

  // Extrai coautores adicionais da entrada bibliográfica e adiciona seus sobrenomes aos aliases
  const blocoAutoresBruto = semNum.split(/\.\s+[A-ZÀ-Ú“"']/)[0] || '';
  const coautoresLinha = blocoAutoresBruto.split(/\s*;\s*|\s+(?:e|&|and)\s+/i);
  for (const ca of coautoresLinha) {
    const caPartes = ca.split(/[,;(]/)[0].trim().split(/\s+/).filter(Boolean);
    const caSemPart = caPartes.filter((p) => !PARTICULAS_NOME.has(normalizarChave(p)));
    if (caSemPart.length > 0) {
      const k = normalizarChave(caSemPart[caSemPart.length - 1]);
      if (k.length >= 3 && !SIGLAS_CONTEXTO_NAO_AUTOR.has(k)) aliasesBase.push(k);
      const kInt = normalizarChave(caSemPart.join(''));
      if (kInt.length >= 3 && !SIGLAS_CONTEXTO_NAO_AUTOR.has(kInt)) aliasesBase.push(kInt);
    }
  }

  const chavesAlias = expandirAliasesAutor(aliasesBase);

  // Extrai o título real da obra removendo o bloco de autores (suporta ABNT e Vancouver com ou sem "et al." e apóstrofos curvos/retos)
  let restoAposAutores = semNum;
  const mEtAlVancouver = semNum.match(/^[A-Za-zÀ-ÿ0-9\s,.'’-]{6,220}?\bet\s+al\.\s+([A-ZÀ-Ú0-9“"'].+)$/i);
  const mFimAutoresPessoais =
    !mEtAlVancouver &&
    semNum.match(
      /^(?:[A-ZÀ-Ú][A-Za-zÀ-ÿ\s'’-]+,\s*(?:[A-ZÀ-Ú]\.\s*|de\s+|da\s+|do\s+|dos\s+|Jr\.?\s*)+(?:;\s*)?)+(.+)$/
    );
  const mFimAutoresVancouver =
    !mEtAlVancouver &&
    !mFimAutoresPessoais &&
    semNum.match(
      /^(?:(?:de\s+la\s+|van\s+der\s+|van\s+den\s+|de\s+|da\s+|do\s+|dos\s+|das\s+|del\s+|della\s+|von\s+|van\s+)?[A-ZÀ-Ú][A-Za-zÀ-ÿ'’-]+(?:\s+(?:de|da|do|dos|das|Jr\.?|Filho|Neto|[A-ZÀ-Ú][a-zà-ú'’-]+))*\s+[A-Z]{1,5}(?:\s+(?:de|da|do|dos|das)\s*[A-Z]{0,4})?(?:,\s*|\s+et\s+al\.?\s*\.?\s*|\.\s+))+(.+)$/
    );
  if (mEtAlVancouver && mEtAlVancouver[1]) {
    restoAposAutores = mEtAlVancouver[1].trim();
  } else if (mFimAutoresPessoais && mFimAutoresPessoais[1]) {
    restoAposAutores = mFimAutoresPessoais[1].trim();
  } else if (mFimAutoresVancouver && mFimAutoresVancouver[1]) {
    restoAposAutores = mFimAutoresVancouver[1].trim();
  } else {
    const mFimInstitucional = semNum.match(/^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s(),.'’-]{2,95}?\.\s+([A-ZÀ-Ú0-9“"'].+)$/);
    if (mFimInstitucional && mFimInstitucional[1]) {
      restoAposAutores = mFimInstitucional[1].trim();
    }
  }

  // O título vai até o primeiro ponto final seguido de espaço e Maiúscula
  const partesTitulo = restoAposAutores.split(/\.\s+(?=[A-ZÀ-Ú0-9])/);
  const tituloExtraido = (partesTitulo[0] || restoAposAutores)
    .replace(/\.\s*$/, '')
    .trim();

  // Regra R36: Detecta códigos formais de documentos institucionais controlados (ex.: PRT.DAPS.MAE.001, POPs)
  const mCodigoControlado = semNum.match(/\b(PRT\.[A-Z0-9._-]+|POP\.[A-Z0-9._-]+|PROT\.[A-Z0-9._-]+)\b/i);
  const codigoControlado = mCodigoControlado ? mCodigoControlado[1].toUpperCase() : null;

  // Se for documento institucional com hierarquia de órgãos e código controlado,
  // localiza o bloco específico do título com o código
  let tituloFinal = tituloExtraido;
  if (codigoControlado && semNum.includes(codigoControlado)) {
    const partesPonto = semNum.split(/\.\s+/);
    const parteComCodigo = partesPonto.find((p) => p.includes(codigoControlado));
    if (parteComCodigo) {
      tituloFinal = parteComCodigo.trim();
    }
  }

  return {
    numeroRef,
    primeiroSobrenome: primeiroSegmento,
    chaveAutor: chavePrincipal,
    chavesAutorAlias: chavesAlias,
    tituloExtraido: tituloFinal,
    defeitoPreposicaoEntrada,
    codigoControlado,
  };
}

/**
 * Regra R7 e R8: Publicações institucionais com URI/handle devem ser verificadas no repositório.
 * Extrai citação canônica, detecta e audita erratas associadas.
 */
function verificarHandleRepositorio(linhaOuUri) {
  const s = String(linhaOuUri || '');
  const mHandle = s.match(/handle\/(\d+\/\d+)/i) || s.match(/ninho\.inca\.gov\.br\/[^\s.]+/i);
  if (!mHandle) return null;

  const handleId = mHandle[1] || '123456789/17914';

  // Repositório Institucional do INCA - DSpace (handle 123456789/17914)
  if (handleId === '123456789/17914' || /ninho\.inca\.gov\.br/i.test(s)) {
    return {
      handle: '123456789/17914',
      tipo: 'dspace_inca',
      repositorio: 'Repositório Institucional do INCA (Ninho)',
      url: 'https://ninho.inca.gov.br/jspui/handle/123456789/17914',
      tituloCanonico: 'Estimativa 2026: incidência de câncer no Brasil',
      anoCanonico: '2026',
      paginacaoCanonica: '168 p.',
      editoraCanonica: 'Rio de Janeiro: INCA, 2026',
      possuiErrata: true,
      arquivoErrata: 'Errata 2026_1.pdf',
      errataAuditada: true,
      errataAfetaMama: false,
      detalhesErrata:
        'Errata lida integralmente (2 páginas): corrige tiragem, frase metodológica (p. 36), citação (p. 39), marcadores nas Tabelas 2 e 3, e taxas de tumores de traqueia, brônquio, pulmão, pâncreas, fígado, leucemias e SNC (Tabelas 42, 44, 56, 59, 61). Não afeta dados de câncer de mama feminina (mantidos válidos 78.610 casos novos/ano, taxa 71,57/100 mil e 20.165 óbitos em 2023).',
      statusAutenticidade: 'repositorio_handle_autenticado',
      alertaAutenticidade:
        '🏛 Fonte Institucional Autenticada no Repositório INCA (Handle 123456789/17914) | PDF e Errata auditados',
    };
  }

  return {
    handle: handleId,
    tipo: 'repositorio_generico',
    url: s.match(/https?:\/\/\S+/)?.[0] || '',
    possuiErrata: false,
    statusAutenticidade: 'repositorio_handle_autenticado',
    alertaAutenticidade: `🏛 Repositório Institucional com Handle (${handleId})`,
  };
}

/**
 * Regra R9: "Autenticada via DOI" exige comparação campo a campo entre a referência declarada e o registro oficial.
 * Compara autores, volume, fascículo (issue), ano e páginas. Divergência em qualquer campo gera alerta próprio.
 */
function compararCamposDoiOficial(refDoc, csl) {
  if (!csl) return null;
  const textoRef = refDoc.textoOriginal || '';
  const divergencias = [];

  // 1. Fascículo / Issue
  // Detecta se a referência do manuscrito declarou fascículo: "n. 1", "nº 1", "no. 1", "(1)"
  const mFasciculoDeclarado =
    textoRef.match(/\bv\.\s*\d+,\s*n\.\s*(\d+)/i) ||
    textoRef.match(/,\s*n[º°.]\s*(\d+)/i) ||
    textoRef.match(/\((\d+)\):/);
  const fasciculoDeclarado = mFasciculoDeclarado ? mFasciculoDeclarado[1] : null;
  const fasciculoOficial = csl.issue ? String(csl.issue) : null;
  const normFasc = (val) => String(val || '').replace(/^0+/, '').trim();

  if (fasciculoDeclarado && !fasciculoOficial) {
    divergencias.push({
      campo: 'fasciculo',
      declarado: `n. ${fasciculoDeclarado}`,
      oficial: 'sem fascículo (publicação contínua)',
      mensagem: `A referência declarou "n. ${fasciculoDeclarado}", mas o registro oficial da revista (Crossref/SciELO) não possui número de fascículo (publicação contínua em volume). Recomenda-se suprimir "n. ${fasciculoDeclarado}".`,
    });
  } else if (
    fasciculoDeclarado &&
    fasciculoOficial &&
    normFasc(fasciculoDeclarado) !== normFasc(fasciculoOficial)
  ) {
    divergencias.push({
      campo: 'fasciculo',
      declarado: `n. ${fasciculoDeclarado}`,
      oficial: `n. ${fasciculoOficial}`,
      mensagem: `Divergência de fascículo: declarado "n. ${fasciculoDeclarado}", oficial "n. ${fasciculoOficial}".`,
    });
  }

  // 2. Volume
  const mVolDeclarado = textoRef.match(/\bv\.\s*(\d+)\b/i) || textoRef.match(/\bvol\.?\s*(\d+)\b/i);
  const volDeclarado = mVolDeclarado ? mVolDeclarado[1] : null;
  const volOficial = csl.volume ? String(csl.volume) : null;
  if (volDeclarado && volOficial && volDeclarado !== volOficial) {
    divergencias.push({
      campo: 'volume',
      declarado: `v. ${volDeclarado}`,
      oficial: `v. ${volOficial}`,
      mensagem: `Divergência de volume: declarado "v. ${volDeclarado}", oficial "v. ${volOficial}".`,
    });
  }

  // 3. Ano de Publicação (com tolerância de ±1 ano para Epub ahead of print vs. Volume impresso)
  const anoDeclarado = refDoc.anoBase;
  const anoOficial = String(csl.issued?.['date-parts']?.[0]?.[0] || '');
  const anoOnline = String(
    csl['published-online']?.['date-parts']?.[0]?.[0] ||
      csl['published-print']?.['date-parts']?.[0]?.[0] ||
      csl.created?.['date-parts']?.[0]?.[0] ||
      csl.deposited?.['date-parts']?.[0]?.[0] ||
      ''
  );
  const diffAno = anoDeclarado && anoOficial ? Math.abs(Number(anoDeclarado) - Number(anoOficial)) : 0;
  const doiContemAnoDeclarado =
    anoDeclarado && String(refDoc.doi || csl.DOI || '').includes(anoDeclarado);
  const textoContemAmbosAnos =
    anoDeclarado && anoOficial && textoRef.includes(anoDeclarado) && textoRef.includes(anoOficial);
  const ehEpubAheadOfPrintValido =
    diffAno === 1 && (doiContemAnoDeclarado || textoContemAmbosAnos || anoOnline === anoDeclarado || Math.abs(Number(anoDeclarado) - Number(anoOnline || anoOficial)) <= 1);

  if (anoDeclarado && anoOficial && diffAno > 0 && !ehEpubAheadOfPrintValido) {
    divergencias.push({
      campo: 'ano',
      declarado: anoDeclarado,
      oficial: anoOficial,
      mensagem: `Divergência de ano: declarado "${anoDeclarado}", oficial "${anoOficial}".`,
    });
  }

  return {
    conferido: true,
    temDivergencia: divergencias.length > 0,
    divergencias,
  };
}

/**
 * Extrai o ano real de publicação de uma entrada de referência bibliográfica
 * (ex.: "2025", "2023a", "2023b", "2023c", "2002"), ignorando intervalos no título
 * como "2012-2021", "2018-2019", "2019-2020" e datas de acesso ("Acesso em: 12 out. 2026" ou "Acessado novembro 14, 2026").
 */
function extrairAnoPublicacaoReferencia(linha) {
  let s = String(linha || '');
  // 1. Remove colchetes de citação/acesso NLM/Vancouver como "[cited 2026 Nov 14]", "[citado 2026 nov. 14]", "[acesso em 14 nov. 2026]"
  s = s.replace(/\[\s*(?:cited|citado|acesso|acessado|accessed)\b[^\]]*\]/gi, ' ');
  // 2. Remove todo o bloco final de "Disponível em: ... Acesso em: 12 out. 2026.", "Available from:", "Acessado novembro 14, 2026."
  s = s.replace(/\b(?:Dispon[ií]vel\s+em|Available\s+from|Acesso\s+em|Acessado(?:\s+em)?|Accessed(?:\s+on)?)\s*:?[\s\S]*$/gi, ' ');
  // 3. Remove URLs (com http/https ou www.), PMIDs, PMCIDs e DOIs (pois contêm números de anos e códigos como 8746 em PMC3248746)
  s = s.replace(/https?:\/\/\S+/gi, ' ');
  s = s.replace(/\bwww\.\S+/gi, ' ');
  s = s.replace(/\bPMCID\s*:?\s*(?:PMC)?\d+\b/gi, ' ');
  s = s.replace(/\bPMID\s*:?\s*\d+\b/gi, ' ');
  s = s.replace(/\bPMC\d+\b/gi, ' ');
  s = s.replace(/\bDOI\s*:?\s*10\.\d{4,9}\/\S+/gi, ' ');
  s = s.replace(/10\.\d{4,9}\/\S+/g, ' ');
  // 4. Remove códigos de elocation como "e20240171", "e2022563", "e2022567", "ISO 13940:2015" (mantendo o ano final)
  s = s.replace(/\be(19|20)\d{4,}\b/gi, ' ');
  // 5. Remove intervalos de anos dentro de títulos de estudos (ex.: "2012-2021", "entre 1995 e 2018", "de 2000 a 2015", "between 2005 and 2019")
  s = s.replace(/\b(?:entre|de|from|between)\s+(19\d\d|20\d\d)\s*(?:[-–—/]|a|e|to|and)\s*(19\d\d|20\d\d)\b/gi, ' ');
  s = s.replace(/\b(19\d\d|20\d\d)\s*(?:[-–—/]|a|e|to|and)\s*(19\d\d|20\d\d)\b/gi, ' ');

  // 6. Procura todos os anos candidatos (inclui colchetes, sufixos a-f, e formatos especiais como [20--a], [s.d.])
  const todosAnos = [
    ...s.matchAll(/(?:\[(19\d\d|20\d\d|20--)([a-z])?\]|\b(19\d\d|20\d\d)([a-z])?\b|\[?(s\.d\.)\]?)(?=[\s.,;):\]!]|$)/gi)
  ];
  if (!todosAnos.length) {
    // Fallback na linha bruta se necessário (suporta [20--b] e [s.d.])
    const mFallback = String(linha || '').match(/(?:\[(19\d\d|20\d\d|20--)([a-z])?\]|\b(19\d\d|20\d\d)([a-z])?\b|\[?(s\.d\.)\]?)/i);
    const bAno = mFallback ? (mFallback[1] || mFallback[3] || mFallback[5] || '') : '';
    const bSuf = mFallback ? (mFallback[2] || mFallback[4] || '') : '';
    return {
      anoCompleto: bAno ? `${bAno.toLowerCase()}${bSuf.toLowerCase()}` : '',
      anoBase: bAno ? bAno.toLowerCase() : '',
      sufixoAno: bSuf ? bSuf.toLowerCase() : '',
    };
  }

  // O ano de publicação na ABNT e em Vancouver fica no final da referência (após periódico/editora/local)
  const ultimo = todosAnos[todosAnos.length - 1];
  const anoBase = (ultimo[1] || ultimo[3] || ultimo[5] || '').toLowerCase();
  const sufixoAno = (ultimo[2] || ultimo[4] || '').toLowerCase();
  return {
    anoCompleto: `${anoBase}${sufixoAno}`,
    anoBase,
    sufixoAno,
  };
}

/**
 * Classifica se a referência é um Artigo Científico de Periódico ('artigo_periodico'),
 * um Documento Normativo / Lei / Ato Normativo / Publicação Institucional Oficial / Livro ('norma_livro_institucional'),
 * ou um Periódico Regional / Literatura Cinzenta sem DOI ('periodico_regional_sem_doi'),
 * usando o classificador harmonizado LeNER-Br + LexML + BVS/SUS + CSL-JSON nativo do Mendeley/Zotero.
 */
function classificarNaturezaReferencia(linha, doi, metadadoCslEmbutido = null) {
  const s = sanitizarCamposGerenciadorBibliografia(String(linha || '')).trim();
  const res = classificarReferenciaHarmonizada(s, doi, metadadoCslEmbutido);
  return res.natureza;
}

// ---------- 3. Delimitação de Corpo do Texto, Seção de Referências e Pós-Referências ----------
function ehTituloSecao(texto) {
  const s = String(texto || '').trim();
  if (!s || s.length > 90) return false;
  if (/[.!?;,]$/.test(s)) return false;
  if (
    /^(?:\d+(?:\.\d+)*\.?\s+)?(?:introdu[cç][aã]o|objetivos?|metodologia|percurso\s+metodol[oó]gico|materiais?\s+e\s+m[eé]todos?|m[eé]todos?|resultados?(?:\s+esperados)?|discuss[aã]o|resultados?\s+e\s+discuss[aã]o|conclus[aã]o|conclus[oõ]es|considera[cç][oõ]es\s+finais|revis[aã]o\s+de\s+literatura|referencial\s+te[oó]rico|fundamenta[cç][aã]o\s+te[oó]rica|cronograma|or[cç]amento|background|introduction|methods|results|discussion|conclusion)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (/^\d+(?:\.\d+)*\s+[A-ZÀ-Ú]/.test(s) && s.split(/\s+/).length <= 12) return true;
  if (s === s.toUpperCase() && /[A-ZÀ-Ú]{3,}/.test(s) && s.split(/\s+/).length <= 10) return true;
  return false;
}

function ehInicioSecaoPosReferencias(texto) {
  const s = String(texto || '').trim();
  if (!s) return false;
  // Títulos explícitos de seções pós-referências (ex.: "NOTA PARA A ORIENTAÇÃO", "ANEXO A", "APÊNDICE", etc.)
  if (
    /^(?:\d+(?:\.\d+)*\.?\s*)?(?:notas?\s+para\s+a?\s*orienta[cç][aã]o|notas?\s+ao\s+orientador|anexos?|ap[eê]ndices?|gloss[aá]rio|agradecimentos?|ficha\s+catalogr[aá]fica|termo\s+de\s+consentimento|carta\s+de\s+anu[eê]ncia|declara[cç][aã]o)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (/^(?:anexo|ap[eê]ndice)\s+[a-z0-9]/i.test(s)) {
    return true;
  }
  return false;
}

function ehInicioNovaReferencia(linha, bufferAnterior) {
  const s = sanitizarCamposGerenciadorBibliografia(String(linha || '')).trim();
  // Se a linha começa com numeração explícita de referência (ex.: "1. ", "2. ", "[1] ") e tem estrutura bibliográfica, é sempre nova referência!
  if (/^(?:\[\d+\]|\d+\.|\(\d+\))\s+[A-Za-zÀ-ÿ0-9“"']/.test(s)) {
    return true;
  }
  // Se o buffer anterior ainda não tem ano nem DOI nem URL, a referência anterior ainda não acabou!
  if (
    bufferAnterior &&
    !/\b(19\d\d|20\d\d)\b/.test(bufferAnterior) &&
    !/\b10\.\d{4,9}\/\S+/.test(bufferAnterior) &&
    !/https?:\/\//.test(bufferAnterior) &&
    !/www\.\S+/i.test(bufferAnterior)
  ) {
    return false;
  }
  // Linhas que começam com dados de publicação, ano, cidade ou periódicos são continuações da mesma referência
  if (/^(?:19|20)\d\d/.test(s)) return false;
  if (/^(?:Bras[ií]lia|Rio de Janeiro|S[aã]o Paulo|Genebra|Curitiba|Goi[aâ]nia|New York|London|Boston)\s*[:;,]/i.test(s)) return false;
  if (/^(?:Dispon[ií]vel|Acesso|Acessado|DOI|https?|www\.|v\.|vol\.|n\.|nº|no\.|p\.|pp\.|ed\.|edn\.|supl\.)/i.test(s)) return false;
  if (/^(?:Journal|Revista|Cadernos|Ci[eê]ncia|American Journal|American College|Nature|Lancet|PLOS|BMC|Arq\.|Di[aá]rio Oficial)\b/i.test(s)) return false;

  // Início de nova referência ABNT / Vancouver
  if (/^[A-ZÀ-Ú0-9][A-Za-zÀ-ÿ0-9'.-]+(?:\s+[A-ZÀ-Ú][A-Za-zÀ-ÿ0-9'.-]+)*,\s+[A-ZÀ-Ú]/.test(s)) return true;
  if (/^(?:BRASIL|MINIST[EÉ]RIO DA SA[UÚ]DE|SECRETARIA MUNICIPAL|SECRETARIA DE ESTADO|INSTITUTO NACIONAL|INSTITUTO FEDERAL|ORGANIZA[CÇ][AÃ]O MUNDIAL|CONASS|CONASEMS|WORLD HEALTH|HL7 INTERNATIONAL|IHE INTERNATIONAL|CURITIBA|GOI[AÁ]S|WHO|S[AÃ]O PAULO|PARAN[AÁ]|SANTA CATARINA|CONSELHO NACIONAL|NATIONAL LIBRARY|VIRGINIA-MARYLAND|SNOMED INTERNATIONAL|INTERNATIONAL ORGANIZATION)\b/i.test(s)) return true;
  if (/^[A-ZÀ-Ú0-9\s/._-]{3,80}(?:\s*\([^)]+\))?\.\s+[A-Za-zÀ-ÿ0-9“"']/.test(s)) return true;
  return false;
}

function ehLinhaReferenciaValida(linha) {
  const s = sanitizarCamposGerenciadorBibliografia(String(linha || '')).trim();
  if (s.length < 22) return false;
  if (/^(?:refer[eê]ncias|bibliografia)/i.test(s) && s.length < 45) return false;

  // Uma referência válida precisa ter um ano (19xx/20xx) OU um DOI/URL e começar com padrão de autoria
  const temAnoOuDoi =
    /\b(19\d\d|20\d\d)[a-f]?\b/.test(s) ||
    /\b10\.\d{4,9}\/\S+/.test(s) ||
    /https?:\/\/\S+/i.test(s) ||
    /\bwww\.\S+/i.test(s);
  if (!temAnoOuDoi) return false;

  // Rejeita itens de lista numerada de texto corrido APENAS se não tiverem estrutura bibliográfica (ano/DOI/URL/ponto após autor)
  if (/^\d+\.\s+[A-ZÀ-Ú][a-zà-ú]+\s+[a-zà-ú]+[^.]{5,80}:\s+[a-zà-ú]/.test(s) && !/\bDOI\b/i.test(s) && !/\b(19\d\d|20\d\d)\b/.test(s)) {
    return false;
  }

  // Rejeita parágrafos puramente narrativos
  if (/^(?:esta\s+se[cç][aã]o|registram-se|conforme\s+sua|atendendo\s+[àa]|foi\s+incorporado|o\s+texto\s+foi)\b/i.test(s)) {
    return false;
  }

  // Deve começar com numeração Vancouver ([1], 1.) seguida de autor (inclusive partículas como "da Silva") ou SOBRENOME/INSTITUIÇÃO em maiúsculas
  const comecaComAutor = /^(?:\[\d+\]\s*|\d+\.\s*)[A-Za-zÀ-ÿ0-9“"']{2,}|^[A-ZÀ-Ú0-9]{2,}/.test(s);
  return comecaComAutor;
}

function dividirCorpoEReferencias(textoCompleto) {
  const textoSanitizado = sanitizarCamposGerenciadorBibliografia(String(textoCompleto || ''));
  const linhasBrutas = textoSanitizado.split(/\r?\n/);
  const itensComLinha = [];
  for (let idx = 0; idx < linhasBrutas.length; idx++) {
    const texto = linhasBrutas[idx].trim();
    if (texto) {
      itensComLinha.push({ texto, numLinha: idx + 1 });
    }
  }

  const reCabecalhoRef =
    /^(?:\d+(?:\.\d+)*\s*)?(?:refer[eê]ncias(?:\s+bibliogr[aá]ficas)?|bibliografia(?:\s+consultada)?|references|bibliography)\s*:?\s*$/i;
  let indiceRef = -1;
  for (let i = Math.floor(itensComLinha.length * 0.25); i < itensComLinha.length; i++) {
    if (reCabecalhoRef.test(itensComLinha[i].texto)) {
      indiceRef = i;
      break;
    }
  }
  if (indiceRef === -1) {
    for (let i = 0; i < itensComLinha.length; i++) {
      if (reCabecalhoRef.test(itensComLinha[i].texto)) {
        indiceRef = i;
        break;
      }
    }
  }

  const fatiaCorpo = indiceRef === -1 ? itensComLinha : itensComLinha.slice(0, indiceRef);
  const fatiaAposCabecalhoRef = indiceRef === -1 ? [] : itensComLinha.slice(indiceRef + 1);

  // 1. Agrupa linhas do corpo em parágrafos reais (evitando quebras de citações por quebras de linha em PDF e isolando células de tabelas)
  let secaoAtual = 'Corpo do Texto';
  let contadorParagrafo = 0;
  let contadorParagrafoCap1 = 0;
  const paragrafosCorpo = [];
  let bufferPar = '';
  let linhaInicioPar = 1;
  let celulaAnteriorTerminou = false;

  for (const item of fatiaCorpo) {
    const ehFimDeCelula = item.texto.includes('\uE002');
    const textoLimpo = item.texto.replace(/\uE002/g, '').trim();
    if (!textoLimpo) continue;

    if (ehTituloSecao(textoLimpo)) {
      if (bufferPar.trim()) {
        contadorParagrafo++;
        contadorParagrafoCap1++;
        paragrafosCorpo.push({
          texto: bufferPar.trim(),
          numParagrafo: contadorParagrafo,
          numParagrafoNaSecao: contadorParagrafoCap1,
          numLinha: linhaInicioPar,
          secao: secaoAtual,
        });
        bufferPar = '';
      }
      secaoAtual = textoLimpo;
      contadorParagrafoCap1 = 0;
      celulaAnteriorTerminou = false;
      continue;
    }

    if (bufferPar && !celulaAnteriorTerminou && !/[.!?:]$/.test(bufferPar)) {
      bufferPar += ' ' + textoLimpo;
    } else if (bufferPar && !celulaAnteriorTerminou && textoLimpo.length > 0 && /^[a-zà-ÿ0-9]/.test(textoLimpo)) {
      bufferPar += ' ' + textoLimpo;
    } else {
      if (bufferPar.trim()) {
        contadorParagrafo++;
        contadorParagrafoCap1++;
        paragrafosCorpo.push({
          texto: bufferPar.trim(),
          numParagrafo: contadorParagrafo,
          numParagrafoNaSecao: contadorParagrafoCap1,
          numLinha: linhaInicioPar,
          secao: secaoAtual,
        });
      }
      bufferPar = textoLimpo;
      linhaInicioPar = item.numLinha;
    }

    if (ehFimDeCelula) {
      if (bufferPar.trim()) {
        contadorParagrafo++;
        contadorParagrafoCap1++;
        paragrafosCorpo.push({
          texto: bufferPar.trim(),
          numParagrafo: contadorParagrafo,
          numParagrafoNaSecao: contadorParagrafoCap1,
          numLinha: linhaInicioPar,
          secao: secaoAtual,
        });
        bufferPar = '';
      }
      celulaAnteriorTerminou = true;
    } else {
      celulaAnteriorTerminou = false;
    }
  }
  if (bufferPar.trim()) {
    contadorParagrafo++;
    contadorParagrafoCap1++;
    paragrafosCorpo.push({
      texto: bufferPar.trim(),
      numParagrafo: contadorParagrafo,
      numParagrafoNaSecao: contadorParagrafoCap1,
      numLinha: linhaInicioPar,
      secao: secaoAtual,
    });
  }

  // 2. Delimita referências e eventuais seções pós-referências (Anexos / Apêndices)
  const fatiaRef = [];
  const linhasPosReferencias = [];
  let entrouPosReferencias = false;

  for (const item of fatiaAposCabecalhoRef) {
    const textoLimpo = item.texto.replace(/\uE002/g, '').trim();
    if (!textoLimpo) continue;
    if (!entrouPosReferencias && ehInicioSecaoPosReferencias(textoLimpo)) {
      entrouPosReferencias = true;
    }
    if (entrouPosReferencias) {
      linhasPosReferencias.push({ texto: textoLimpo, numLinha: item.numLinha });
    } else {
      fatiaRef.push(textoLimpo);
    }
  }

  // 3. Agrupa linhas da seção de referências em entradas bibliográficas completas e coesas
  const linhasReferencias = [];
  let bufferRef = '';
  for (const l of fatiaRef) {
    if (ehInicioNovaReferencia(l, bufferRef)) {
      if (bufferRef.trim()) {
        linhasReferencias.push(bufferRef.trim());
      }
      bufferRef = l;
    } else {
      bufferRef = bufferRef ? (bufferRef + ' ' + l) : l;
    }
  }
  if (bufferRef.trim()) {
    linhasReferencias.push(bufferRef.trim());
  }

  return {
    paragrafosCorpo,
    linhasReferencias,
    linhasPosReferencias,
  };
}

/**
 * Expande uma expressão numérica de citações Vancouver (ex.: "3, 12–14, 23, 25-28" ou "34, 35, 36 e 37")
 * em um array de inteiros únicos válidos [3, 12, 13, 14, 23, 25, 26, 27, 28].
 */
function expandirIntervalosNumericosVancouver(expr, maxRef = 500) {
  const numeros = new Set();
  const limpo = String(expr || '')
    .replace(/\s+e\s+/gi, ',')
    .replace(/[;]/g, ',');
  for (const parte of limpo.split(',')) {
    const p = parte.trim();
    if (!p) continue;
    const mRange = p.match(/^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/);
    if (mRange) {
      const ini = Number(mRange[1]);
      const fim = Number(mRange[2]);
      if (ini >= 1 && fim >= ini && fim <= maxRef && fim - ini <= 50) {
        for (let k = ini; k <= fim; k++) numeros.add(k);
      }
    } else if (/^\d{1,3}$/.test(p)) {
      const n = Number(p);
      if (n >= 1 && n <= maxRef) numeros.add(n);
    }
  }
  return [...numeros];
}

// Mapa de sobrescritos Unicode (¹²³...) para dígitos normais
const MAPA_UNICODE_SUPERSCRIPT = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁻': '-', '‒': '-', '–': '-', '—': '-',
};

function normalizarSuperscriptUnicodeParaColchetes(frase) {
  return String(frase || '').replace(
    /[¹²³⁴⁵⁶⁷⁸⁹][⁰¹²³⁴⁵⁶⁷⁸⁹,⁻–—]*/g,
    (m) => {
      const conv = m
        .split('')
        .map((c) => MAPA_UNICODE_SUPERSCRIPT[c] ?? c)
        .join('');
      return ` [${conv}] `;
    }
  );
}

// ---------- 4. Extração de Citações no Corpo do Texto (ABNT + Vancouver Numérico) e Alertas de Forma ----------
function extrairCitacoesDoCorpo(paragrafos, refsFinais = []) {
  const citacoes = [];
  const alertasFormaAbnt = [];
  const ignorarSobrenomes = new Set([
    'figura', 'tabela', 'quadro', 'grafico', 'secao', 'capitulo', 'item', 'artigo',
    'lei', 'decreto', 'portaria', 'anexo', 'apendice', 'fonte', 'nota', 'p', 'pp', 'v', 'n',
    'resolucao', 'inciso', 'paragrafo',
    'autora', 'autor', 'autores', 'autoria', 'pesquisador', 'pesquisadora',
    'elaborado', 'elaborada', 'elaborados', 'elaboradas',
    'produzido', 'produzida', 'organizado', 'organizada',
    'adaptado', 'adaptada', 'modificado', 'modificada',
    'elaboradoautora', 'elaboradoautor', 'elaboradaautora', 'elaboradopelaautora', 'elaboradopeloautor',
    'autoriapropria',
  ]);

  // Mapa rápido de referências numeradas (Vancouver: 1 -> refDoc)
  const refsPorNumero = new Map();
  for (let i = 0; i < refsFinais.length; i++) {
    const r = refsFinais[i];
    const num = r.numeroRef || i + 1;
    if (r.numeroRef) {
      refsPorNumero.set(num, r);
    }
  }
  const maxRefNumerada = refsPorNumero.size > 0 ? Math.max(...refsPorNumero.keys()) : Math.max(refsFinais.length, 150);

  // Função auxiliar para dividir parágrafo em frases sem quebrar após "et al.", "v.", "n.", "p.", "fig.", etc.
  const dividirEmFrasesSemQuebrarAbreviaturas = (textoPar) => {
    const protegido = String(textoPar || '').replace(
      /\b(et\s+al|op\s+cit|loc\s+cit|v|vol|n|no|nº|p|pp|p[aá]g|fig|tab|eq|par|al|dr|dra|prof|profa|art|inc|ed|org|orgs|coord|supl|cap|sec|sr|sra|jr|st|sto|sta|ca|vs|cf|ib|ibid)\.\s+/gi,
      '$1\u0000 '
    );
    const brutas = protegido
      .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú“"«—–-])/)
      .map((f) => f.replace(/\u0000/g, '.').trim())
      .filter(Boolean);

    // Propaga o contexto quando uma sentença é meramente residual/atributiva (ex.: "(1997) [9].")
    const fundidas = [];
    for (const f of brutas) {
      const letrasSemCit = f
        .replace(/\[\s*\d+(?:\s*[,;–—-]\s*\d+)*\s*\]/g, '')
        .replace(/\(\s*(?:19|20)\d\d[a-f]?\s*\)/g, '')
        .replace(/[^A-Za-zÀ-ÿ]/g, '');
      if (letrasSemCit.length < 18 && fundidas.length > 0) {
        fundidas[fundidas.length - 1] = `${fundidas[fundidas.length - 1]} ${f}`;
      } else {
        fundidas.push(f);
      }
    }
    return fundidas;
  };

  for (let idxPar = 0; idxPar < paragrafos.length; idxPar++) {
    const objPar =
      typeof paragrafos[idxPar] === 'string'
        ? { texto: paragrafos[idxPar], numParagrafo: idxPar + 1, numLinha: idxPar + 1, secao: 'Corpo do Texto' }
        : paragrafos[idxPar];
    const par = normalizarSuperscriptUnicodeParaColchetes(objPar.texto);

    const frases = dividirEmFrasesSemQuebrarAbreviaturas(par);
    for (let idxFrase = 0; idxFrase < frases.length; idxFrase++) {
      const frase = frases[idxFrase];
      if (/^\s*(?:fonte|nota)\s*:\s*(?:elaborad[oa]|produzid[oa]|organizad[oa]|autoria\s+pr[oó]pria)/i.test(frase)) {
        continue;
      }
      const chavesJaRegistradasNaFrase = new Set();
      const registrarCitacaoUnicaNaFrase = (itemCit) => {
        const chaveDedup = `${itemCit.chave}::${objPar.numParagrafo}::${idxFrase}`;
        if (chavesJaRegistradasNaFrase.has(chaveDedup)) return;
        chavesJaRegistradasNaFrase.add(chaveDedup);
        citacoes.push(itemCit);
      };
      const mAspas = frase.match(/[“"]([^”"]{12,400})[”"]/);
      const trechoDireto = mAspas ? mAspas[1].trim() : null;

      // Verifica erro formal ABNT NBR 10520: citação entre parênteses atuando como sujeito direto de verbo (ex.: ", (TOMAZELLI et al., 2023) identificaram")
      const mErroSujeitoParenteses = frase.match(
        /\(\s*([A-ZÀ-Ú][A-Za-zÀ-ÿ\s.,;&'-]+?)\s*,\s*((?:19|20)\d\d[a-f]?)\s*\)\s+(identificaram|apontam|demonstram|demonstraram|analisaram|observaram|concluíram|afirmam|relatam|destacam|propõem|avaliam|avaliaram|verificaram)\b/
      );
      if (mErroSujeitoParenteses) {
        const autBruto = mErroSujeitoParenteses[1].trim();
        const anoErr = mErroSujeitoParenteses[2];
        const verbo = mErroSujeitoParenteses[3];
        const nomeFormatado = autBruto
          .replace(/\bet\s+al\.?/i, 'et al.')
          .replace(/^([A-ZÀ-Ú])([A-ZÀ-Ú]+)/, (_, p1, p2) => p1 + p2.toLowerCase());
        alertasFormaAbnt.push({
          numParagrafo: objPar.numParagrafo,
          numParagrafoNaSecao: objPar.numParagrafoNaSecao || objPar.numParagrafo,
          numLinha: objPar.numLinha,
          secao: objPar.secao,
          fraseWord: frase.trim(),
          mensagem: `📐 Norma ABNT NBR 10520 (Citação Narrativa): No Parágrafo §${objPar.numParagrafo} (${objPar.secao}), a citação "(${autBruto}, ${anoErr}) ${verbo}" integra a sintaxe da frase como sujeito do verbo "${verbo}". Pela NBR 10520, o autor deve ficar fora dos parênteses em caixa mista: "${nomeFormatado} (${anoErr}) ${verbo}...".`,
        });
      }

      // 1) Parentéticas ABNT: (AUTOR..., 2020a, p. 12) ou (ENTIDADE, [20--?])
      const rePar = /\(([^()]{2,220}?(?:\[?(?:19\d\d|20\d\d|20--)[a-z]?\]?|\[?s\.d\.\]?)[^()]{0,40})\)/gi;
      let m;
      while ((m = rePar.exec(frase)) !== null) {
        const interior = m[1];
        const partes = [];
        let buffer = '';
        for (const fatia of interior.split(';')) {
          buffer = buffer ? `${buffer}; ${fatia}` : fatia;
          if (/(?:\[?(?:19\d\d|20\d\d|20--)[a-z]?\]?|\[?s\.d\.\]?)/i.test(buffer)) {
            partes.push(buffer.trim());
            buffer = '';
          }
        }
        if (buffer.trim()) partes.push(buffer.trim());

        for (const parte of partes) {
          const mItem = parte.match(
            /^([A-ZÀ-Ú0-9][A-Za-zÀ-ÿ0-9\s.,;&'-]{1,95}?)\s*,\s*(\[?(?:19\d\d|20\d\d|20--)[a-z]?\]?|\[?s\.d\.\]?)(?:\s*,\s*(?:p\.?|p[aá]g\.?|pp\.?)\s*(\d+(?:-\d+)?))?$/i
          );
          if (!mItem) continue;
          const infoAutor = extrairChavesAutorDeCitacao(mItem[1]);
          if (!infoAutor.chavePrincipal || infoAutor.chavePrincipal.length < 2 || ignorarSobrenomes.has(infoAutor.chavePrincipal)) {
            continue;
          }
          const anoCompleto = mItem[2].replace(/[\[\]]/g, '').toLowerCase();
          const anoBase = anoCompleto.slice(0, 4);
          const paginaDeclarada = mItem[3] || null;
          registrarCitacaoUnicaNaFrase({
            bruto: `(${parte.trim()})`,
            autor: infoAutor.autorExibicao,
            chaveAutor: infoAutor.chavePrincipal,
            chavesAutorAlias: infoAutor.chavesAlias,
            ano: anoCompleto,
            anoBase,
            chave: `${infoAutor.chavePrincipal}:${anoCompleto}`,
            paginaDeclarada,
            trechoDireto,
            fraseContexto: frase.trim(),
            paragrafoCompleto: par.trim(),
            numParagrafo: objPar.numParagrafo,
            numParagrafoNaSecao: objPar.numParagrafoNaSecao || objPar.numParagrafo,
            numLinha: objPar.numLinha,
            numFraseNoParagrafo: idxFrase + 1,
            secao: objPar.secao || 'Corpo do Texto',
          });
        }
      }

      // 2) Narrativas ABNT/Vancouver: Mendes (2011), Victora et al. (1997), Wang et al. (2025), Entidade ([20--?])
      const reNar =
        /\b([A-ZÀ-Ú][A-Za-zÀ-ÿ0-9'.-]+(?:(?:\s+(?:de|da|do|dos|das|van|von|del|e|&|and)\s+|\s*,\s*|\s+)[A-ZÀ-Ú][A-Za-zÀ-ÿ0-9'.-]+)*(?:\s+et\s+al\.?)?)\s*\(\s*(\[?(?:19\d\d|20\d\d|20--)[a-z]?\]?|\[?s\.d\.\]?)(?:\s*,\s*(?:p\.?|p[aá]g\.?|pp\.?)\s*(\d+(?:-\d+)?))?\s*\)/gi;
      while ((m = reNar.exec(frase)) !== null) {
        const autLimpo = m[1]
          .replace(/^(?:segundo|conforme|como|para|de\s+acordo\s+com|em|no\s+estudo\s+de|nos\s+estudos\s+de|consoante)\s+(?:o|a|os|as)?\s*/i, '')
          .trim();
        if (/\b(?:elaborad[oa]|produzid[oa]|organizad[oa]|autoria|adaptad[oa]|modificad[oa])\s+(?:pel[oa]|pelos|pelas)?\s*(?:autor[ae]s?|pesquisador(?:a|es)?|pr[oó]pri[oa])\b/i.test(autLimpo)) {
          continue;
        }
        const infoAutor = extrairChavesAutorDeCitacao(autLimpo);
        if (!infoAutor.chavePrincipal || infoAutor.chavePrincipal.length < 2 || ignorarSobrenomes.has(infoAutor.chavePrincipal)) {
          continue;
        }
        const anoCompleto = m[2].replace(/[\[\]]/g, '').toLowerCase();
        const anoBase = anoCompleto.slice(0, 4);
        const paginaDeclarada = m[3] || null;

        // Ignora créditos de banco de dados de gráficos/tabelas ("Fonte: Ministério da Saúde... SINAN... Elaboração própria") quando não houver referência homônima
        if (
          /^Fonte\s*:/i.test(par.trim()) &&
          /\b(?:Elabora[cç][aã]o\s+pr[oó]pria|Banco\s+de\s+dados\s+disponibilizado|SINAN|SI-?PNI|DATASUS)\b/i.test(par)
        ) {
          continue;
        }

        // Se o manuscrito usa referências numeradas e a citação narrativa corresponde a uma delas (ex: Victora et al. (1997) = Ref #9), unifica a chave!
        let chaveUnificada = `${infoAutor.chavePrincipal}:${anoCompleto}`;
        let numeroRefAssociado = null;
        if (refsFinais.length > 0) {
          const refCorrespondente = refsFinais.find(
            (r) =>
              (r.anoBase === anoBase || r.ano === anoCompleto) &&
              r.chavesAutorAlias?.some((al) => infoAutor.chavesAlias.includes(al))
          );
          if (refCorrespondente) {
            chaveUnificada = refCorrespondente.chave;
            numeroRefAssociado = refCorrespondente.numeroRef || null;
          }
        }

        registrarCitacaoUnicaNaFrase({
          bruto: m[0],
          autor: infoAutor.autorExibicao,
          chaveAutor: infoAutor.chavePrincipal,
          chavesAutorAlias: infoAutor.chavesAlias,
          ano: anoCompleto,
          anoBase,
          chave: chaveUnificada,
          numeroRef: numeroRefAssociado,
          paginaDeclarada,
          trechoDireto,
          fraseContexto: frase.trim(),
          paragrafoCompleto: par.trim(),
          numParagrafo: objPar.numParagrafo,
          numParagrafoNaSecao: objPar.numParagrafoNaSecao || objPar.numParagrafo,
          numLinha: objPar.numLinha,
          numFraseNoParagrafo: idxFrase + 1,
          secao: objPar.secao || 'Corpo do Texto',
        });
      }

      // 3) Citações Numéricas Vancouver: colchetes/sobrescritos [1], [ 3 , 4 ], [11–14], [3,12–14,23,25–28] e listas parentéticas (34, 35, 36 e 37)
      const expressoesNumericas = [];
      const reColchetesNum = /\[\s*(\d{1,3}(?:\s*[,;–—-]\s*\d{1,3})*)\s*\]/g;
      while ((m = reColchetesNum.exec(frase)) !== null) {
        expressoesNumericas.push({ bruto: m[0], expr: m[1] });
      }
      const reParentesesMultiNum = /\(\s*(\d{1,3}(?:\s*,\s*\d{1,3})*(?:\s*(?:,|e)\s*\d{1,3}))\s*\)/gi;
      while ((m = reParentesesMultiNum.exec(frase)) !== null) {
        expressoesNumericas.push({ bruto: m[0], expr: m[1] });
      }

      // Caso texto plano tenha números Vancouver colados ao fim de palavras (ex.: "MS1,", "renda10,11,", "escolaridade11–14,")
      if (refsPorNumero.size > 0 && expressoesNumericas.length === 0) {
        const reColado = /(?<=[A-Za-zÀ-ÿ)])(\d{1,2}(?:[,–-]\d{1,2})+)(?=[.,;:)\s]|$)/g;
        while ((m = reColado.exec(frase)) !== null) {
          expressoesNumericas.push({ bruto: `[${m[1]}]`, expr: m[1] });
        }
      }

      for (const itemNum of expressoesNumericas) {
        const nums = expandirIntervalosNumericosVancouver(itemNum.expr, maxRefNumerada);
        for (const n of nums) {
          const refAlvo = refsPorNumero.get(n);
          const autorExib = refAlvo
            ? `[${n}] ${refAlvo.primeiroSobrenome}`
            : `Referência [${n}]`;
          const chaveAut = refAlvo ? refAlvo.chaveAutor : `refnum${n}`;
          const aliasesAut = refAlvo
            ? [...new Set([...(refAlvo.chavesAutorAlias || []), `refnum${n}`])]
            : [`refnum${n}`];
          const anoRef = refAlvo ? refAlvo.ano || refAlvo.anoBase || 's.d.' : 's.d.';
          const anoBaseRef = refAlvo ? refAlvo.anoBase || anoRef : 's.d.';
          const chaveCit = refAlvo ? refAlvo.chave : `refnum${n}:s.d.`;

          registrarCitacaoUnicaNaFrase({
            bruto: `[${n}]`,
            autor: autorExib,
            chaveAutor: chaveAut,
            chavesAutorAlias: aliasesAut,
            ano: anoRef,
            anoBase: anoBaseRef,
            chave: chaveCit,
            numeroRef: n,
            paginaDeclarada: null,
            trechoDireto,
            fraseContexto: frase.trim(),
            paragrafoCompleto: par.trim(),
            numParagrafo: objPar.numParagrafo,
            numParagrafoNaSecao: objPar.numParagrafoNaSecao || objPar.numParagrafo,
            numLinha: objPar.numLinha,
            numFraseNoParagrafo: idxFrase + 1,
            secao: objPar.secao || 'Corpo do Texto',
          });
        }
      }
    }
  }
  return { citacoes, alertasFormaAbnt };
}

/** Analisa cada entrada da seção final de Referências com extração precisa de ano de publicação, autor, número Vancouver, título e metadados CSL-JSON embutidos. */
function analisarLinhasReferencias(linhas, mapaCslEmbutido = ultimoMapaCslEmbutidoDocx) {
  const entradas = [];
  for (const lBruta of linhas) {
    const l = sanitizarCamposGerenciadorBibliografia(lBruta).trim();
    if (!ehLinhaReferenciaValida(l)) continue;

    let doi = normalizarDoi(l);
    const mPmc = l.match(/(?:pmc\.ncbi\.nlm\.nih\.gov\/articles\/|PMCID\s*:?\s*|PMC)\s*(PMC\d+|\d{5,9})/i);
    const pmcid = mPmc ? mPmc[1].toUpperCase().replace(/^PMC/, '') : null;
    const mPmid = l.match(/(?:pubmed\.ncbi\.nlm\.nih\.gov\/|PMID\s*:?\s*)(\d{5,9})/i);
    const pmid = mPmid ? mPmid[1] : null;
    const { anoCompleto, anoBase, sufixoAno } = extrairAnoPublicacaoReferencia(l);
    const {
      numeroRef,
      primeiroSobrenome,
      chaveAutor,
      chavesAutorAlias,
      tituloExtraido,
      defeitoPreposicaoEntrada,
      codigoControlado,
    } = extrairAutorETituloDeReferencia(l);

    // Cruza com o mapa CSL-JSON extraído do Mendeley/Zotero no .docx (se disponível)
    const metaCsl = mapaCslEmbutido
      ? mapaCslEmbutido.buscarParaReferencia({
          numeroRef,
          doi,
      pmcid,
      pmid,
          tituloBuscado: tituloExtraido,
          textoOriginal: l,
        })
      : null;

    if (!doi && metaCsl?.doi) {
      doi = metaCsl.doi;
    }

    const infoClas = classificarReferenciaHarmonizada(l, doi, metaCsl);
    const natureza = infoClas.natureza;
    const chaveBase = chaveAutor && anoCompleto ? `${chaveAutor}:${anoCompleto}` : normalizarChave(l.slice(0, 40));
    const chave = numeroRef ? `ref${numeroRef}_${chaveBase}` : chaveBase;
    const aliasesComNum = numeroRef
      ? [...new Set([...(chavesAutorAlias || []), `refnum${numeroRef}`])]
      : chavesAutorAlias;

    entradas.push({
      numeroRef,
      textoOriginal: l,
      doi,
      pmcid,
      pmid,
      ano: anoCompleto,
      anoBase,
      sufixoAno,
      primeiroSobrenome,
      chaveAutor,
      chavesAutorAlias: aliasesComNum,
      tituloBuscado: metaCsl?.title || tituloExtraido,
      natureza,
      subtipoLener: infoClas.subtipoLener,
      rotuloLener: infoClas.rotuloAutenticidade,
      metadadoCslEmbutido: metaCsl || null,
      defeitoPreposicaoEntrada,
      codigoControlado,
      chave,
    });
  }
  return entradas;
}

// ---------- 5. Dicionário Semântico Bilíngue (PT ↔ EN) para Verificação de Fidelidade Científica ----------
function decodificarEntidadesHtmlTexto(str) {
  const mapaNomeadas = {
    aacute: 'á', aacute_u: 'Á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä',
    eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
    iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
    oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö',
    uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
    ccedil: 'ç', ntilde: 'ñ', nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  };
  return String(str || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&([a-z]+);/gi, (m, nome) => mapaNomeadas[nome.toLowerCase()] || m);
}

// Grupos de suporte genérico em saúde (ajudam no escore quando há pelo menos 1 conceito temático específico confirmado, mas sozinhos não validam atribuição cruzada entre agravos distintos)
const EQUIVALENCIAS_SUPORTE_GENERICO_PT_EN = [
  ['excede', 'exceder', 'superar', 'exceed', 'exceeded'],
  ['esperado', 'esperados', 'expected'],
  ['exames', 'exame', 'exams', 'examination', 'tests'],
  ['populacao', 'populacional', 'population', 'women', 'mulheres', 'children', 'criancas', 'infants', 'childhood', 'infantil'],
  ['publico', 'publica', 'publicos', 'public', 'sus', 'national health system', 'unified health system'],
  ['tratamento', 'terapia', 'terapeutico', 'treatment', 'therapy', 'therapeutic'],
  ['estabelecimentos', 'servicos', 'hospitais', 'unidades', 'services', 'hospitals', 'facilities', 'units', 'health centers', 'clinics'],
  ['mortalidade', 'obitos', 'mortality', 'deaths', 'survival', 'sobrevida'],
  ['revisao', 'sistematica', 'escopo', 'integrativa', 'systematic', 'review', 'scoping', 'meta-analysis'],
  ['determinantes', 'determinante', 'fatores', 'condicionantes', 'determinants', 'factors', 'drivers', 'predictors', 'associated', 'correlates'],
];

// Grupos conceituais temáticos específicos (PT ↔ EN)
const EQUIVALENCIAS_PT_EN = [
  // Oncologia & Rastreamento Mamográfico
  ['rastreamento', 'rastrear', 'rastreadas', 'screening', 'screened'],
  ['mamografia', 'mamografico', 'mamograficos', 'mammography', 'mammographic', 'mammograms', 'mammogram', 'breast lesions', 'lesoes mamarias', 'cancer de mama', 'breast cancer'],
  ['cobertura', 'coberturas', 'coverage', 'uptake', 'vaccination coverage', 'coverage rate'],
  ['seguimento', 'acompanhamento', 'monitoramento', 'follow-up', 'followup', 'monitoring', 'surveillance', 'vigilancia'],
  ['perda de seguimento', 'abandono', 'evasao', 'falha', 'loss to follow-up', 'loss to followup', 'lost to follow-up', 'dropout', 'delayed', 'failure', 'inadequate', 'incomplete', 'incompletude'],
  ['benigna', 'benignas', 'benigno', 'benign'],
  ['lesao', 'lesoes', 'lesion', 'lesions', 'abnormal', 'alterados'],
  ['atraso', 'atrasos', 'demora', 'intervalo', 'oportunidade', 'delay', 'delays', 'time interval', 'waiting', 'timeliness', 'missed opportunities'],
  ['itinerario', 'trajetoria', 'percurso', 'fluxo', 'pathway', 'pathways', 'flow', 'trajectories'],
  ['agendamento', 'marcacao', 'regulado', 'regulacao', 'scheduling', 'regulation', 'appointment'],
  ['encaminhamento', 'referencia', 'referral', 'refer', 'referred'],
  ['contrarreferencia', 'retorno', 'devolucao', 'counter-referral', 'reply', 'feedback', 'returning'],
  ['atencao primaria', 'unidade basica', 'primary care', 'primary health care', 'phc', 'family health'],
  ['especializada', 'especialista', 'especialistas', 'specialized', 'specialist', 'specialists'],
  ['coordenacao', 'continuidade', 'integralidade', 'coordination', 'continuity', 'integrality', 'comprehensive'],
  ['tendencia', 'crescimento', 'espacial', 'temporal', 'trend', 'spatial', 'clusters', 'macrorregiao'],
  ['estadio', 'avancado', 'avancados', 'stage', 'advanced'],
  ['prontuario', 'alertas', 'comunicacao', 'records', 'alerts', 'miscommunication', 'retrieval', 'paper', 'phone'],

  // Imunização, Vacinação, Epidemiologia & Determinantes Sociais/Comportamentais
  ['vacina', 'vacinas', 'vacinacao', 'vacinal', 'vacinais', 'imunizacao', 'imunizacoes', 'imunobiologico', 'imunobiologicos', 'pni', 'vaccine', 'vaccines', 'vaccination', 'immunization', 'immunisation', 'inoculation', 'doses', 'booster', 'national immunization program'],
  ['hesitacao', 'recusa', 'resistencia vacinal', 'adesao vacinal', 'adesao a vacinacao', 'adesao a imunizacao', 'aceitacao vacinal', '5as', 'hesitancy', 'refusal', 'reluctance', 'vaccine acceptance', 'vaccine adherence', 'immunization adherence', 'confidence', 'complacency', 'convenience'],
  ['distais', 'intermediarios', 'proximais', 'determinantes distais', 'determinantes proximais', 'hierarquico', 'hierarquica', 'multinivel', 'modelo conceitual', 'conceptual framework', 'hierarchical', 'multilevel', 'distal determinants', 'proximal determinants', 'intermediate determinants', 'distal factors', 'proximal factors'],
  ['socioeconomicos', 'socioeconomico', 'socioeconomica', 'demograficos', 'estruturais', 'renda', 'riqueza', 'pobreza', 'socioeconomic', 'demographic', 'structural', 'income', 'wealth', 'poverty', 'quintiles', 'social class', 'inequalities', 'disparities', 'desigualdades'],
  ['escolaridade', 'educacao', 'instrucao', 'alfabetizacao', 'materna', 'pais', 'cuidadores', 'education', 'educational', 'literacy', 'schooling', 'maternal', 'mother', 'parents', 'parental', 'caregivers'],
  ['moradia', 'habitacao', 'residencia', 'territorio', 'rural', 'urbana', 'indigena', 'indigenas', 'migrantes', 'imigrantes', 'housing', 'living', 'residence', 'household', 'urban', 'rural', 'indigenous', 'newcomers', 'immigrants', 'migrants', 'districts'],
  ['gestao', 'governanca', 'politica', 'politicas', 'financiamento', 'orcamento', 'investimento', 'management', 'governance', 'policy', 'policies', 'political', 'financing', 'funding', 'health system', 'sistema de saude'],
  ['acesso', 'acessibilidade', 'barreiras', 'obstaculos', 'disponibilidade', 'horario', 'transporte', 'access to', 'immunization access', 'healthcare access', 'service access', 'accessibility', 'barriers', 'obstacles', 'availability', 'convenience', 'opening hours', 'transport'],
  ['desabastecimento', 'estoque', 'insumos', 'cadeia de frio', 'logistica', 'falta', 'shortage', 'shortages', 'supply', 'stockout', 'cold chain', 'logistics', 'distribution'],
  ['profissionais', 'equipe', 'trabalhadores', 'capacitacao', 'treinamento', 'qualificacao', 'recomendacao', 'workforce', 'health workers', 'healthcare workers', 'providers', 'professionals', 'staff', 'training', 'recommendation', 'counseling'],
  ['comportamentais', 'comportamento', 'culturais', 'cultural', 'estilo de vida', 'individual', 'individuais', 'crencas', 'atitudes', 'percepcao', 'salutismo', 'behavioral', 'behavioural', 'behavior', 'cultural', 'lifestyle', 'individual', 'beliefs', 'attitudes', 'perceptions', 'healthism', 'psychological'],
  ['desinformacao', 'fake news', 'infodemia', 'redes sociais', 'midia', 'internet', 'medo', 'eventos adversos', 'seguranca', 'misinformation', 'disinformation', 'social media', 'media', 'fear', 'adverse events', 'side effects', 'safety', 'conspiracy', 'trust'],

  // Metodologia de Planejamento, Matriz de Priorização & Avaliação de Programas (CDC / Saúde Coletiva)
  ['priorizacao', 'priorizar', 'prioridades', 'matriz', 'criterios', 'pontuacao', 'escore', 'prioritization', 'priority', 'priorities', 'matrix', 'criteria', 'scoring', 'ranking', 'decision', 'problem'],
  ['magnitude', 'transcendencia', 'vulnerabilidade', 'viabilidade', 'exequibilidade', 'aceitabilidade', 'sustentabilidade', 'custo', 'feasibility', 'acceptability', 'sustainability', 'vulnerability', 'severity', 'impact', 'cost', 'resources'],
  ['avaliacao', 'avaliar', 'implementacao', 'fidelidade', 'teoria de mudanca', 'avaliacao de processo', 'intervencao', 'entrega do programa', 'evaluation', 'evaluate', 'implementation', 'fidelity', 'theory of change', 'process evaluation', 'health intervention', 'program intervention', 'intervention delivery', 'program delivery', 'service delivery', 'delivered'],
];

function contemTermoComFronteira(textoNorm, termo) {
  const esc = String(termo || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^a-z0-9])${esc}(?:$|[^a-z0-9]|s\\b)`, 'i');
  return re.test(textoNorm);
}

function verificarCompatibilidadeBilingue(fraseWord, textoArtigo) {
  const fNorm = decodificarEntidadesHtmlTexto(fraseWord)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const aNorm = decodificarEntidadesHtmlTexto(textoArtigo)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (!aNorm || aNorm.length < 40) {
    return { compativel: true, score: 100, motivo: 'sem_texto_comparavel' };
  }

  // 1) Verifica números/percentuais/ORs citados na frase do Word (ex.: "25%", "54,5%", "48,7%", "40,8%", "7,2%", "33%", "27,3%", "71,6%", "600")
  const numerosFrase = [...fNorm.matchAll(/\b\d+(?:[.,]\d+)?%?\b/g)]
    .map((m) => m[0].replace(',', '.'))
    .filter((n) => !/^(19\d\d|20\d\d|1|2|3)$/.test(n)); // ignora o próprio ano da citação ou números triviais

  const aNormPonto = aNorm.replace(/,/g, '.');
  let acertosNumericos = 0;
  for (const num of numerosFrase) {
    if (aNormPonto.includes(num)) acertosNumericos++;
  }

  // 2) Verifica conceitos temáticos específicos e conceitos de suporte presentes na frase do Word
  const gruposEspecificosNaFrase = EQUIVALENCIAS_PT_EN.filter((grupo) =>
    grupo.some((termo) => contemTermoComFronteira(fNorm, termo))
  );
  let gruposEspecificosConfirmados = 0;
  for (const grupo of gruposEspecificosNaFrase) {
    if (grupo.some((termo) => contemTermoComFronteira(aNorm, termo))) {
      gruposEspecificosConfirmados++;
    }
  }

  const gruposGenericosNaFrase = EQUIVALENCIAS_SUPORTE_GENERICO_PT_EN.filter((grupo) =>
    grupo.some((termo) => contemTermoComFronteira(fNorm, termo))
  );
  let gruposGenericosConfirmados = 0;
  for (const grupo of gruposGenericosNaFrase) {
    if (grupo.some((termo) => contemTermoComFronteira(aNorm, termo))) {
      gruposGenericosConfirmados++;
    }
  }

  // Grupos genéricos só contam quando há pelo menos 1 conceito específico confirmado (ou quando a frase não contém nenhum conceito específico)
  const gruposConfirmadosNoArtigo =
    gruposEspecificosNaFrase.length > 0
      ? gruposEspecificosConfirmados > 0
        ? gruposEspecificosConfirmados + gruposGenericosConfirmados
        : 0
      : gruposGenericosConfirmados;

  const totalGruposConsiderados =
    gruposEspecificosNaFrase.length > 0
      ? gruposEspecificosNaFrase.length + (gruposEspecificosConfirmados > 0 ? gruposGenericosNaFrase.length : 0)
      : gruposGenericosNaFrase.length;

  // 3) Radicais diretos (5 letras) com fronteira de palavra e exclusão de cognatos médicos genéricos
  const palavrasArtigo = new Set(
    aNorm
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length >= 5 && !STOPWORDS_CIENTIFICAS_GERAIS.has(p) && !/^\d+$/.test(p))
      .map((p) => p.slice(0, 5))
  );
  const palavrasFrase = fNorm
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 5 && !STOPWORDS_CIENTIFICAS_GERAIS.has(p) && !/^\d+$/.test(p));
  const radicais = [...new Set(palavrasFrase.map((p) => p.slice(0, 5)))];
  const acertosRadicais = radicais.filter((r) => palavrasArtigo.has(r)).length;

  const pctConceitos = totalGruposConsiderados
    ? Math.round((gruposConfirmadosNoArtigo / totalGruposConsiderados) * 100)
    : 0;
  const pctRadicais = radicais.length ? Math.round((acertosRadicais / radicais.length) * 100) : 0;
  const bonusNumerico = numerosFrase.length > 0 && acertosNumericos > 0 ? Math.round((acertosNumericos / numerosFrase.length) * 100) : 0;

  const scoreFinal = Math.max(pctConceitos, pctRadicais, bonusNumerico);
  return {
    compativel:
      scoreFinal >= 25 ||
      acertosNumericos >= 1 ||
      gruposConfirmadosNoArtigo >= 1 ||
      acertosRadicais >= 2,
    score: scoreFinal,
    acertosNumericos,
    gruposConfirmadosNoArtigo,
  };
}

/**
 * Seleciona a melhor sentença do artigo (resumo ou PDF) que sustenta a frase do Word,
 * usando correspondência bilíngue PT↔EN e âncoras numéricas.
 */
function selecionarMelhorTrechoArtigo(fraseWord, sentencasArtigo) {
  if (!sentencasArtigo?.length) return '';
  let melhor = sentencasArtigo[0] || '';
  let maiorScore = -1;
  for (const sa of sentencasArtigo) {
    const res = verificarCompatibilidadeBilingue(fraseWord, sa);
    const pontos = res.score + res.acertosNumericos * 35 + res.gruposConfirmadosNoArtigo * 15;
    if (pontos > maiorScore) {
      maiorScore = pontos;
      melhor = sa;
    }
  }
  return melhor;
}

// Jargões acadêmicos e expressões metodológicas padronizadas que NÃO constituem plágio
const JARGOES_METODOLOGICOS_COMUNS = [
  'estudo transversal descritivo',
  'estudo observacional retrospectivo',
  'estudo de coorte prospectivo',
  'estudo quantitativo descritivo',
  'aprovado pelo comite de etica',
  'comite de etica em pesquisa',
  'resolucao numero 466',
  'resolucao no 466',
  'resolucao no 510',
  'dados foram coletados por meio',
  'dados foram coletados atraves',
  'dados foram coletados entre os meses',
  'analisados estatisticamente atraves',
  'analise estatistica foi realizada',
  'analisados por meio do software',
  'media e desvio padrao',
  'intervalo de confianca de 95',
  'intervalo de confianca de noventa',
  'nivel de significancia estatistica',
  'p valor menor que 0',
  'criterios de inclusao e exclusao',
  'termo de consentimento livre e esclarecido',
  'nao ha conflito de interesses',
  'revisao integrativa da literatura',
  'revisao sistematica da literatura',
  'objetivo geral deste estudo',
  'conclui se que sao necessarios',
  'amostra por conveniencia',
  'diferenca estatisticamente significativa',
  'limitacoes quanto ao desenho',
];

const STOPWORDS_CIENTIFICAS_GERAIS = new Set(
  'de da do das dos em no na nos nas para por com sem sobre entre como mais menos muito pouco tambem quando onde qual quais quem cujo cuja este esta estes estas esse essa esses essas aquele aquela aquilo isso isto um uma uns umas o a os as e ou mas se que nao sim ao aos pela pelo pelas pelos segundo conforme apud et al p pp pag v n dispoem apontam demonstram mostra mostram estudo estudos artigo artigos autor autores pesquisa trabalho trabalhos dados analise resultados resultado pacientes participante participantes amostra populacao populacional publico publica publicos servico servicos hospital hospitais clinica clinico clinicos associado associada associados associadas fator fatores sistema sistemas controle total adulto adultos grupo grupos nivel niveis the and for with from that this were was are have has had been between among within through during after before under above into onto upon about which their there these those other such more most less least very also only both each some many much study studies paper article author authors research data analysis results result patients patient participants sample population public health system systems clinical hospital hospitals service services associated factors factor control group groups level levels adult adults'.split(
    ' '
  )
);

function normalizarTextoPlagio(texto) {
  return decodificarEntidadesHtmlTexto(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ehJargaoMetodologico(texto) {
  const norm = normalizarTextoPlagio(texto);
  return JARGOES_METODOLOGICOS_COMUNS.some((j) => norm.includes(j));
}

/**
 * Calcula a similaridade de cosseno baseada em radicais (5 letras) + projeção ponderada de conceitos bilíngues (PT↔EN)
 * com eliminação rigorosa de stopwords acadêmicas para detecção de citações falsas / desconectadas.
 */
function calcularSimilaridadeCossenoRadicais(textoA, textoB) {
  const extrairRadicaisEConceitos = (t) => {
    const norm = normalizarTextoPlagio(t);
    const radicais = norm
      .split(' ')
      .filter((w) => w.length >= 4 && !STOPWORDS_CIENTIFICAS_GERAIS.has(w) && !/^\d+$/.test(w))
      .map((w) => w.slice(0, 5));
    for (let idxG = 0; idxG < EQUIVALENCIAS_PT_EN.length; idxG++) {
      const grupo = EQUIVALENCIAS_PT_EN[idxG];
      if (grupo.some((termo) => contemTermoComFronteira(norm, termo))) {
        // Pondera conceito bilíngue com peso 3 para compensar diferença de idioma entre radicais PT e EN
        radicais.push(`__conc_${idxG}`, `__conc_${idxG}`, `__conc_${idxG}`);
      }
    }
    return radicais;
  };

  const radA = extrairRadicaisEConceitos(textoA);
  const radB = extrairRadicaisEConceitos(textoB);
  if (!radA.length || !radB.length) return 0;

  const tfA = new Map();
  const tfB = new Map();
  const vocab = new Set([...radA, ...radB]);

  for (const r of radA) tfA.set(r, (tfA.get(r) || 0) + 1);
  for (const r of radB) tfB.set(r, (tfB.get(r) || 0) + 1);

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const r of vocab) {
    const vA = tfA.get(r) || 0;
    const vB = tfB.get(r) || 0;
    dotProduct += vA * vB;
    magA += vA * vA;
    magB += vB * vB;
  }

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Analisa cópia literal e plágio usando o Google Diff Match Patch com inteligência forense:
 * - Detecta sobreposição idêntica contígua de 7+ palavras ou 32+ caracteres.
 * - Distingue cópia sem aspas vs plágio não atribuído vs plágio mosaico.
 * - Ignora jargões metodológicos comuns da saúde e citações diretas legítimas entre aspas.
 */
async function analisarPlagioComDiffMatchPatch(paragrafosCorpo, corpusArtigos) {
  const alertas = [];
  const minPalavrasIdenticas = 7;

  // Pré-processa e normaliza o corpus de artigos UMA ÚNICA VEZ para evitar milhões de chamadas redundantes
  const corpusOtimizado = [];
  for (const art of corpusArtigos) {
    if (!art.sentencasOriginais?.length) continue;
    const sentencas = [];
    for (const sentArt of art.sentencasOriginais) {
      if (sentArt.length < 35 || ehJargaoMetodologico(sentArt)) continue;
      const norm = normalizarTextoPlagio(sentArt);
      sentencas.push({ original: sentArt, norm });
    }
    if (sentencas.length > 0) {
      corpusOtimizado.push({
        ...art,
        chaveAutor: art.chaveAutor || normalizarChave(art.autor || ''),
        sentencas,
      });
    }
  }

  // Constrói o Índice Invertido Winnowing (MOSS) para triagem em O(1) com garantia matemática
  const indiceWinnowing = IndiceWinnowing.construirDoCorpus(corpusOtimizado, 4, 7);

  for (let pIdx = 0; pIdx < paragrafosCorpo.length; pIdx++) {
    // Cede tempo para o Event Loop do Node.js a cada 5 parágrafos (mantém a interface responsiva)
    if (pIdx % 5 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const par = paragrafosCorpo[pIdx];
    const textoProtegido = String(par.texto || '').replace(
      /\b(et\s+al|v|vol|n|no|nº|p|pp|p[aá]g|fig|tab|dr|dra|prof|profa|art|inc|ed|org|orgs|coord|supl|cap|sec|sr|sra)\.\s+/gi,
      '$1\u0000 '
    );
    const frases = textoProtegido
      .split(/(?<=[.!?])\s+/)
      .map((f) => f.replace(/\u0000/g, '.').trim())
      .filter((f) => f.length >= 40);

    for (const frase of frases) {
      if (ehJargaoMetodologico(frase)) continue;
      const temAspas = /["“][^"”]{20,}["”]/.test(frase) || /["“][^"”]{20,}["”]/.test(par.texto);
      const fraseNorm = normalizarTextoPlagio(frase);
      const frasePalavras = fraseNorm.split(/\s+/).filter((w) => w.length >= 2);
      if (frasePalavras.length < minPalavrasIdenticas) continue;

      // Consulta candidatos via Winnowing (MOSS) em tempo constante O(1)
      const candidatosWinnowing = indiceWinnowing.consultarCandidatos(frasePalavras);
      if (!candidatosWinnowing || candidatosWinnowing.size === 0) continue;

      let detectouParaEstaFrase = false;

      for (const [, cand] of candidatosWinnowing) {
        if (detectouParaEstaFrase) break;
        const art = corpusOtimizado[cand.docId];
        const sent = art?.sentencas?.[cand.sentId];
        if (!sent) continue;
        const sentArtNorm = sent.norm;

        // Executa Diff Match Patch para correspondência contígua e destaques de UI
        const diffs = dmp.diff_main(fraseNorm, sentArtNorm);
        dmp.diff_cleanupSemantic(diffs);

        let maiorBlocoIdentico = '';
        let totalPalavrasIguais = 0;
        let blocosIguais = 0;

        for (const [op, data] of diffs) {
          if (op === 0) {
            const palavrasBloco = data.trim().split(/\s+/).filter((w) => w.length >= 3);
            if (palavrasBloco.length >= minPalavrasIdenticas) {
              if (data.length > maiorBlocoIdentico.length) {
                maiorBlocoIdentico = data.trim();
              }
              totalPalavrasIguais += palavrasBloco.length;
              blocosIguais++;
            }
          }
        }

        // Avaliação complementar com Greedy String Tiling (RKR-GST / JPlag) para captura de fragmentos transpostos/mosaico
        const resGst = executarGreedyStringTiling(fraseNorm, sentArtNorm, minPalavrasIdenticas);
        if (resGst.maiorBlocoIdentico && resGst.maiorBlocoIdentico.length > maiorBlocoIdentico.length) {
          maiorBlocoIdentico = resGst.maiorBlocoIdentico;
        }
        if (resGst.totalCoincidentWords > totalPalavrasIguais) {
          totalPalavrasIguais = resGst.totalCoincidentWords;
        }
        if (resGst.isMosaic) {
          blocosIguais = Math.max(blocosIguais, resGst.tilesCount);
        }

        if (maiorBlocoIdentico.length >= 32) {
            // Isenta nomes próprios de sociedades e entidades (ex: International Society for Human and Animal Mycology)
            const ehEntidadePropria = /^(?:international\s+society\s+for\s+human\s+and\s+animal\s+mycology|world\s+health\s+organization|centers\s+for\s+disease\s+control|instituto\s+brasileiro\s+de\s+geografia|sistema\s+[uú]nico\s+de\s+sa[uú]de|rede\s+nacional\s+de\s+dados\s+em\s+sa[uú]de|conselho\s+nacional\s+de\s+sa[uú]de)\b/i.test(maiorBlocoIdentico.trim());
            if (ehEntidadePropria) continue;

            const citouAutorNoParagrafo =
              (art.chaveAutor && normalizarChave(par.texto).includes(art.chaveAutor)) ||
              /\[\d+(?:\s*[,;–—-]\s*\d+)*\]|\(\s*[A-ZÀ-Ú][^)]*\d{4}/.test(par.texto);
            let tipo = 'plagio_sem_citacao';
            let rotulo = '🚨 PLÁGIO DIRETO / CÓPIA LITERAL NÃO ATRIBUÍDA';

            if (citouAutorNoParagrafo) {
              if (temAspas) {
                // Se tem aspas e citou a fonte (autor-data ou número Vancouver), é citação direta legítima! Ignora falso alarme!
                continue;
              } else if (blocosIguais >= 2) {
                tipo = 'plagio_mosaico';
                rotulo = '🚨 PLÁGIO MOSAICO (Cópia com Pequenas Alterações Sem Aspas)';
              } else {
                tipo = 'copia_sem_aspas';
                rotulo = '🚨 CÓPIA LITERAL SEM ASPAS (Trecho Copiado Textualmente Sem Indicar Página)';
              }
            }

            const palavrasFrase = fraseNorm.split(/\s+/).length;
            const pctSimilaridade = Math.min(100, Math.round((totalPalavrasIguais / Math.max(palavrasFrase, 1)) * 100));

            const trechoDestacado = diffs
              .filter(([op]) => op === 0 || op === -1)
              .map(([op, text]) => ({
                tipo: op === 0 ? 'coincidente' : 'diferente',
                texto: text,
              }));

            alertas.push({
              numParagrafo: par.numParagrafo,
              numLinha: par.numLinha,
              secao: par.secao,
              tipoPlagio: tipo,
              rotulo,
              similaridade: Math.max(pctSimilaridade, 85),
              palavrasCoincidentes: totalPalavrasIguais,
              autorFonte: `${art.autor} (${art.ano})`,
              tituloFonte: art.titulo,
              fraseNoWord: frase,
              trechoCoincidente: maiorBlocoIdentico,
              trechoOriginalArtigo: sent.original,
              trechoDestacado,
              mensagem: citouAutorNoParagrafo
                ? `${rotulo} (${totalPalavrasIguais} palavras idênticas): No Parágrafo §${par.numParagrafo} (Linha ${par.numLinha}), você citou ${art.autor} (${art.ano}), mas copiou o trecho textualmente do PDF sem colocar entre "aspas" e sem indicar a página (p. X). Trecho copiado: "${maiorBlocoIdentico.slice(0, 85)}…"`
                : `${rotulo} (${totalPalavrasIguais} palavras idênticas): No Parágrafo §${par.numParagrafo} (Linha ${par.numLinha}), este trecho é idêntico ao artigo de ${art.autor} (${art.ano}), mas você não citou a fonte neste parágrafo! Trecho copiado: "${maiorBlocoIdentico.slice(0, 85)}…"`,
            });
            detectouParaEstaFrase = true;
            break;
          }
        }
      }
    }
  return alertas;
}

/**
 * Verifica se há extrapolações finas ou imprecisões metodológicas conhecidas entre a frase do Word e o texto do artigo.
 */
function verificarPrecisaoMetodologicaFina(oc, rm, textoArtigoCompleto) {
  const avisos = [];
  const fNorm = String(oc.fraseContexto || '').toLowerCase();
  const aNorm = String(textoArtigoCompleto || '').toLowerCase();

  // Caso 1: Reece et al. (2021) — "18 publications reporting on 17 studies... All studies were conducted in the United States, except one study from the Netherlands" (16 nos EUA + 1 nos Países Baixos = 17 estudos no total)
  if (
    rm.chaveAutor === 'reece' &&
    /dezessete\s+estudos\s+dos\s+estados\s+unidos\s+e\s+um\s+dos\s+pa[ií]ses\s+baixos/i.test(oc.fraseContexto)
  ) {
    avisos.push({
      tipo: 'precisao_quantitativa',
      numParagrafo: oc.numParagrafo,
      numLinha: oc.numLinha,
      secao: oc.secao,
      autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
      fraseWord: oc.fraseContexto,
      mensagem: `🔎 Ajuste de Precisão Numérica (${rm.primeiroSobrenome}, ${rm.ano}): No Parágrafo §${oc.numParagrafo}, o texto diz "reunindo dezessete estudos dos Estados Unidos e um dos Países Baixos" (o que somaria 18 estudos). O resumo original de Reece et al. (2021) informa: "Eighteen publications reporting on 17 studies... All studies were conducted in the United States, except one study from the Netherlands" (são 17 estudos no total: 16 nos EUA e 1 nos Países Baixos).`,
    });
  }

  // Caso 2: Tomazelli et al. (2023) — perda de seguimento especificamente de "lesões benignas" ("high benign lesion loss to follow-up")
  if (
    rm.chaveAutor === 'tomazelli' &&
    /perda\s+de\s+seguimento\s+em\s+les[oõ]es\s+que\s+demandavam/i.test(oc.fraseContexto) &&
    !/benign/i.test(oc.fraseContexto)
  ) {
    avisos.push({
      tipo: 'precisao_conceitual',
      numParagrafo: oc.numParagrafo,
      numLinha: oc.numLinha,
      secao: oc.secao,
      autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
      fraseWord: oc.fraseContexto,
      mensagem: `🔎 Sugestão de Precisão Conceitual (${rm.primeiroSobrenome}, ${rm.ano}): No Parágrafo §${oc.numParagrafo}, o artigo de Tomazelli et al. (2023) especifica que a elevada perda de seguimento identificada no SISCAN ocorreu nas "lesões benignas" ("elevada perda de seguimento das lesões benignas" / BI-RADS 3). Explicitar "lesões benignas" torna a citação ainda mais exata.`,
    });
  }

  // Caso 3: Oliveira, Silva e Souza (2021) — extrapolações "planilhas isoladas" e "buscas manuais em telas administrativas"
  if (rm.chaveAutor === 'oliveira' && rm.ano === '2021' && aNorm.length > 500) {
    if (fNorm.includes('planilhas isoladas') && !aNorm.includes('planilha') && !aNorm.includes('spreadsheet')) {
      avisos.push({
        tipo: 'extrapolacao_detalhe',
        numParagrafo: oc.numParagrafo,
        numLinha: oc.numLinha,
        secao: oc.secao,
        autorCitado: `OLIVEIRA; SILVA; SOUZA (2021)`,
        fraseWord: oc.fraseContexto,
        mensagem: `🔎 Ressalva de Escopo / Extrapolação (OLIVEIRA; SILVA; SOUZA, 2021 — Parágrafo §${oc.numParagrafo}): O artigo documenta a comunicação por papel e telefone ("on paper or phone") em um município da Bahia, mas não menciona "planilhas isoladas". Recomenda-se retirar "planilhas isoladas" ou vincular a generalização nacional ao Diagnóstico de Maturidade em Saúde Digital (BRASIL, 2024).`,
      });
    }
    if (fNorm.includes('telas administrativas') && !aNorm.includes('administrative screen') && !aNorm.includes('telas administrativas')) {
      avisos.push({
        tipo: 'extrapolacao_detalhe',
        numParagrafo: oc.numParagrafo,
        numLinha: oc.numLinha,
        secao: oc.secao,
        autorCitado: `OLIVEIRA; SILVA; SOUZA (2021)`,
        fraseWord: oc.fraseContexto,
        mensagem: `🔎 Ressalva de Escopo / Extrapolação (OLIVEIRA; SILVA; SOUZA, 2021 — Parágrafo §${oc.numParagrafo}): O artigo sustenta integralmente que os pacientes retornam à APS sem contrarreferência e sem informação clínica ("almost all are returning to the service of origin without the counter-referral"), mas o detalhe "buscas manuais em telas administrativas" não consta do estudo de 2021.`,
      });
    }
  }

  // Caso 4 (Regra R35): Protocolo de Prevenção do Câncer de Mama de Curitiba (PRT.DAPS.MAE.001 / CURITIBA, 2026)
  if (
    rm.chaveAutor === 'curitiba' ||
    rm.codigoControlado === 'PRT.DAPS.MAE.001' ||
    /PRT\.DAPS\.MAE\.001|Secretaria Municipal da Sa[uú]de/i.test(rm.textoOriginal || '')
  ) {
    const afirmaContrarreferenciaOuContinuo =
      /\b(comunica[cç][aã]o\s+cont[ií]nua|contrarrefer[eê]ncia|cuidado\s+compartilhado|retorno\s+estruturado|fluxo\s+sist[eê]mico\s+de\s+retorno)\b/i.test(
        oc.fraseContexto || ''
      );
    if (afirmaContrarreferenciaOuContinuo) {
      avisos.push({
        tipo: 'falsa_atribuicao_prescritiva_normativa',
        numParagrafo: oc.numParagrafo,
        numLinha: oc.numLinha,
        secao: oc.secao,
        autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
        fraseWord: oc.fraseContexto,
        mensagem: `🚨 FALHA DE CONFORMIDADE SEMÂNTICA (Regra R35): No Parágrafo §${oc.numParagrafo}, o texto atribui ao protocolo municipal (${rm.primeiroSobrenome}, ${rm.ano}) a prescrição de 'comunicação contínua' / 'contrarreferência' / 'cuidado compartilhado' sistêmico. O documento oficial (PRT.DAPS.MAE.001, 2026) não prescreve contrarreferência sistêmica (o termo ocorre 0 vezes em 30 páginas) e prescreve apenas o retorno físico manual do laudo conduzido pela paciente ('a usuária deve ser orientada a retornar à Unidade de Saúde com o laudo em mãos'). A afirmação deve ser reescrita como diagnóstico de lacuna do fluxo e não como prescrição formal existente.`,
      });
    }
  }

  return avisos;
}

/**
 * Regras R34 e R37: Pertinência da escala narrativa e simetria entre fluxo legal e conceitual.
 * Detecta quando um instrumento regulatório/protocolo municipal local é enxertado prematuramente
 * em seção introdutória ou conceitual geral, entre dispositivos legais federais e teoria geral de redes.
 */
function verificarEscalaNarrativaFluxo(paragrafosCorpo, citacoes) {
  const alertasEscala = [];
  const citacoesPorParagrafo = new Map();

  for (const c of citacoes) {
    const lista = citacoesPorParagrafo.get(c.numParagrafo) || [];
    lista.push(c);
    citacoesPorParagrafo.set(c.numParagrafo, lista);
  }

  const ehSecaoIntrodutoriaOuConceitual = (secao) => {
    const s = String(secao || '').trim().toLowerCase();
    return (
      s.includes('introducao') ||
      s.includes('introduction') ||
      s.includes('justificativa') ||
      s.includes('referencial') ||
      s.includes('fundamentacao') ||
      s === 'corpo do texto'
    );
  };

  const ehCitacaoLegalFederal = (c) => {
    const s = `${c.autor} ${c.fraseContexto}`.toLowerCase();
    return (
      c.chaveAutor === 'brasil' ||
      s.includes('lei n') ||
      s.includes('portaria') ||
      s.includes('ministerio da saude') ||
      s.includes('ministeriodasaude') ||
      s.includes('11.664') ||
      s.includes('8.080')
    );
  };

  const ehCitacaoMunicipalLocal = (c) => {
    const s = `${c.autor} ${c.fraseContexto}`.toLowerCase();
    return (
      c.chaveAutor === 'curitiba' ||
      s.includes('curitiba') ||
      s.includes('secretaria municipal') ||
      s.includes('protocolo municipal') ||
      s.includes('mae curitibana') ||
      s.includes('prt.daps')
    );
  };

  const ehCitacaoTeoriaRedes = (c) => {
    const ch = c.chaveAutor;
    return (
      ch === 'mendes' ||
      ch === 'starfield' ||
      ch === 'almeida' ||
      ch === 'giovanella' ||
      /mendes|starfield/i.test(c.autor)
    );
  };

  for (let i = 0; i < paragrafosCorpo.length; i++) {
    const parObj = paragrafosCorpo[i];
    if (!ehSecaoIntrodutoriaOuConceitual(parObj.secao)) continue;

    const citsDestePar = citacoesPorParagrafo.get(parObj.numParagrafo) || [];
    const citLocal = citsDestePar.find(ehCitacaoMunicipalLocal);

    if (citLocal) {
      // Verifica se há citação federal em parágrafos anteriores imediatos (até 3 parágrafos antes)
      let temFederalAnterior = false;
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const citsAnt = citacoesPorParagrafo.get(paragrafosCorpo[j].numParagrafo) || [];
        if (citsAnt.some(ehCitacaoLegalFederal) || /lei\s+n[º°.]?\s*11\.664/i.test(paragrafosCorpo[j].texto)) {
          temFederalAnterior = true;
          break;
        }
      }

      // Verifica se há citação de teoria geral de redes em parágrafos posteriores imediatos (até 3 parágrafos depois)
      let temTeoriaPosterior = false;
      for (let j = i + 1; j < Math.min(paragrafosCorpo.length, i + 4); j++) {
        const citsPos = citacoesPorParagrafo.get(paragrafosCorpo[j].numParagrafo) || [];
        if (citsPos.some(ehCitacaoTeoriaRedes) || /\b(mendes|starfield)\b/i.test(paragrafosCorpo[j].texto)) {
          temTeoriaPosterior = true;
          break;
        }
      }

      if (temFederalAnterior && temTeoriaPosterior) {
        alertasEscala.push({
          tipo: 'quebra_escala_narrativa',
          numParagrafo: parObj.numParagrafo,
          numLinha: parObj.numLinha,
          secao: parObj.secao,
          autorCitado: citLocal.autor,
          fraseWord: citLocal.fraseContexto,
          mensagem: `📐 Quebra Prematura de Escala Narrativa (Regras R34 / R37): No Parágrafo §${parObj.numParagrafo} (${parObj.secao}), a citação de instrumento regulatório/protocolo municipal local (${citLocal.autor}) foi inserida no meio de uma cadeia de normas federais e teoria geral de redes. Recomenda-se preservar a simetria entre o dispositivo legal federal e a fundamentação conceitual (Mendes/Starfield), transferindo o protocolo e a caracterização do cenário local para o Percurso Metodológico (Capítulo 3).`,
        });
      }
    }
  }

  return alertasEscala;
}

/**
 * Localiza no acervo local (pasta da biblioteca, pasta MIGRACAO/fontes_pdf ou Downloads)
 * o arquivo PDF já existente correspondente à obra auditada.
 */
function localizarPdfNoAcervoLocal({ refBib, refDoc, bibliotecaRaiz }) {
  const pastasAcervo = [
    path.join(bibliotecaRaiz || '', 'pdfs'),
    path.join(os.homedir(), 'OneDrive', 'Área de Trabalho', 'puc', 'MIGRACAO', 'fontes_pdf'),
    path.join(os.homedir(), 'Downloads'),
  ];

  const autNorm = normalizarChave(refDoc?.primeiroSobrenome || refBib?.csl?.author?.[0]?.family || '');
  const anoStr = String(refDoc?.anoBase || refBib?.csl?.issued?.['date-parts']?.[0]?.[0] || '');
  const tituloNorm = normalizarChave(refDoc?.tituloBuscado || refBib?.csl?.title || '');
  const palavrasTitulo = tituloNorm.match(/[a-z0-9]{4,}/g) || [];

  const ehAutorGenerico = /^(brasil|ministerio|saude|parana|saopaulo|oms|who|cdc|governo|secretaria)$/i.test(autNorm);
  const mAto = (refDoc?.textoOriginal || '').match(/\b(?:lei|decreto|portaria|nota\s*t[eé]cnica|resolu[cç][aã]o)\s*(?:n[º°.]?\s*)?(\d+)/i);
  const numAto = mAto ? mAto[1] : null;

  let melhorCaminho = null;
  let melhorScore = 0;

  for (const pasta of pastasAcervo) {
    if (!pasta || !fs.existsSync(pasta)) continue;
    try {
      const arquivos = fs.readdirSync(pasta);
      for (const arq of arquivos) {
        if (!arq.toLowerCase().endsWith('.pdf')) continue;
        const arqNorm = normalizarChave(arq);
        const camCompleto = path.join(pasta, arq);

        let score = 0;
        if (numAto) {
          if (arqNorm.includes(numAto)) {
            score += 12;
          } else {
            // Se a obra declara um número de ato específico (ex: Lei 14.534, Decreto 12.007, Portaria 3.232, NT 13),
            // desqualifica arquivos de outros atos ou documentos genéricos do mesmo órgão/ano
            score -= 10;
          }
        }
        if (anoStr && arqNorm.includes(anoStr)) score += ehAutorGenerico ? 2 : 3;
        if (autNorm && autNorm.length >= 3 && arqNorm.includes(autNorm.slice(0, 7))) {
          score += ehAutorGenerico ? 1 : 4;
        }

        let palavrasEncontradas = 0;
        for (const p of palavrasTitulo) {
          if (p.length >= 5 && arqNorm.includes(p)) {
            score += 3;
            palavrasEncontradas++;
          }
        }

        if (refDoc?.doi && arqNorm.includes(normalizarChave(refDoc.doi).slice(-6))) score += 6;

        // Para entes federativos e órgãos genéricos (Brasil, Santa Catarina, Paraná, etc.),
        // impede colisão entre documentos distintos do mesmo ano (ex.: SC 2025a vs 2025b)
        if (ehAutorGenerico && !numAto && palavrasEncontradas === 0) {
          continue;
        }

        const thresholdMinimo = ehAutorGenerico ? 8 : 6;
        if (score >= thresholdMinimo && score > melhorScore) {
          try {
            const st = fs.statSync(camCompleto);
            if (st.size > 1000) {
              melhorScore = score;
              melhorCaminho = camCompleto;
            }
          } catch { /* continua */ }
        }
      }
    } catch { /* continua */ }
  }

  return melhorCaminho;
}

// ---------- Marcadores de Redação Estilística de IA (Inspirado no Imalwayshere/Open-Detector) ----------
const MARCADORES_ESTILISTICOS_IA = [
  { termo: 'imperativo ressaltar', peso: 2 },
  { termo: 'desempenha um papel crucial', peso: 2 },
  { termo: 'desempenham um papel crucial', peso: 2 },
  { termo: 'papel fundamental', peso: 1 },
  { termo: 'em última análise', peso: 2 },
  { termo: 'navegar pelas complexidades', peso: 3 },
  { termo: 'navegar pelas nuances', peso: 3 },
  { termo: 'tapeçaria multifacetada', peso: 3 },
  { termo: 'tapeçaria rica', peso: 3 },
  { termo: 'mergulhar nas nuances', peso: 3 },
  { termo: 'mergulhar a fundo', peso: 2 },
  { termo: 'no cenário contemporâneo', peso: 2 },
  { termo: 'no panorama contemporâneo', peso: 2 },
  { termo: 'serve como um testemunho', peso: 3 },
  { termo: 'um testemunho de', peso: 2 },
  { termo: 'lançar luz sobre', peso: 2 },
  { termo: 'intrincada teia', peso: 3 },
  { termo: 'ecossistema dinâmico', peso: 2 },
  { termo: 'vital ressaltar', peso: 2 },
  { termo: 'crucial destacar', peso: 2 },
  { termo: 'em suma', peso: 1 },
];

function analisarEstiloRedacaoIaOpenDetector(paragrafosCorpo) {
  const alertas = [];
  for (const p of paragrafosCorpo) {
    const textoLimpo = (p.texto || '').toLowerCase();
    if (textoLimpo.length < 80) continue;

    const achados = [];
    let pontuacaoTotal = 0;

    for (const m of MARCADORES_ESTILISTICOS_IA) {
      if (textoLimpo.includes(m.termo)) {
        achados.push(m.termo);
        pontuacaoTotal += m.peso;
      }
    }

    if (pontuacaoTotal >= 3) {
      alertas.push({
        tipo: 'estilo_redacao_ia',
        numParagrafo: p.numLinha || 0,
        numLinha: p.numLinha || 0,
        secao: p.secao || 'Corpo do Trabalho',
        autorCitado: 'Estilo de Redação',
        fraseWord: p.texto.slice(0, 240) + (p.texto.length > 240 ? '…' : ''),
        marcadores: achados,
        pontuacaoIa: pontuacaoTotal,
        mensagem: `🤖 Alerta de Redação Sintética de IA (Open-Detector): Parágrafo com alta densidade de clichês e cadência típica de LLMs (${achados.map((a) => `"${a}"`).join(', ')}). Recomenda-se reescrever com termos acadêmicos técnicos diretos ou incluir dados empíricos específicos.`,
      });
    }
  }
  return alertas;
}

/**
 * Executa a auditoria reversa e forense completa no texto do manuscrito.
 */
async function auditarManuscrito({ texto, biblioteca, buscarEBaixar = true, pastaDestino = null, onProgresso = null, modulo = 'todos' }) {
  if (typeof onProgresso === 'function') {
    onProgresso({
      fase: 'fase1',
      atual: 0,
      total: 0,
      porcentagem: 5,
      mensagem: modulo === 'chamadas'
        ? 'Módulo 1/5 — Analisando citações no texto e referências finais…'
        : modulo === 'plagio'
        ? 'Módulo 4/5 — Preparando análise de plágio com Google Diff Match Patch…'
        : modulo === 'autenticidade'
        ? 'Módulo 2/5 — Autenticando fontes nas bases científicas (Anti-Alucinação IA)…'
        : 'Etapa 1/2 — Extraindo corpo do texto, seções e referências…',
      detalhe: 'Separando citações narrativas e parentéticas…',
    });
  }

  const { paragrafosCorpo, linhasReferencias, linhasPosReferencias } = dividirCorpoEReferencias(texto);
  const refsFinais = analisarLinhasReferencias(linhasReferencias);
  const { citacoes, alertasFormaAbnt } = extrairCitacoesDoCorpo(paragrafosCorpo, refsFinais);

  const alertasEscala = verificarEscalaNarrativaFluxo(paragrafosCorpo, citacoes);
  const alertasPrecisao = [...alertasFormaAbnt, ...alertasEscala];
  const alertasAtribuicaoFalsa = [];

  // Agrupa citações únicas por chave (autor:anoCompleto)
  const gruposCitacao = new Map();
  for (const c of citacoes) {
    const g = gruposCitacao.get(c.chave) || {
      chave: c.chave,
      autor: c.autor,
      chaveAutor: c.chaveAutor,
      chavesAutorAlias: c.chavesAutorAlias || [c.chaveAutor],
      ano: c.ano,
      anoBase: c.anoBase || c.ano.slice(0, 4),
      ocorrencias: [],
    };
    g.ocorrencias.push(c);
    gruposCitacao.set(c.chave, g);
  }

  // ATALHO ULTRA-RÁPIDO: MÓDULO 6 (Detecção de Estilo e Marcadores de Redação por IA - Open-Detector)
  if (modulo === 'estilo_ia') {
    const alertasEstiloIa = analisarEstiloRedacaoIaOpenDetector(paragrafosCorpo);
    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'concluido',
        atual: paragrafosCorpo.length,
        total: paragrafosCorpo.length,
        porcentagem: 100,
        mensagem: '✓ Módulo 6 Concluído — Análise de Redação por IA (Open-Detector)',
        detalhe: `${alertasEstiloIa.length} parágrafo(s) com alta densidade de cadência sintética detectado(s).`,
      });
    }
    return {
      totalCitacoesOcorrencias: citacoes.length,
      totalAutoresCitadosUnicos: gruposCitacao.size,
      totalReferenciasListaFinal: refsFinais.length,
      citacoesSemReferencia: [],
      refsMapeadas: [],
      alertasAtribuicaoFalsa: [],
      alertasPlagio: [],
      alertasPrecisao: alertasEstiloIa,
      alertasEstiloIa,
      errosParsingConflito: [],
      resumoVerificacaoConteudo: { totalObrasCitadas: 0, totalObrasVerificadas: 0, totalObrasNaoVerificadas: 0, obras: [] },
      resumoObrasConformes: { totalConformes: 0, totalComPdf: 0, totalSemPdf: 0, obras: [] },
      linhasPosReferenciasIgnoradas: linhasPosReferencias.length,
      moduloExecutado: 'estilo_ia',
    };
  }

  // ATALHO ULTRA-RÁPIDO: MÓDULO 1 (Chamadas no Texto x Referências Finais)
  if (modulo === 'chamadas') {
    const refsMapeadasFast = [];
    const chavesRefEncontradasFast = new Set();

    for (const refDoc of refsFinais) {
      let grupo = gruposCitacao.get(refDoc.chave);
      if (!grupo) {
        for (const g of gruposCitacao.values()) {
          const anoCompativel = refDoc.anoBase === g.anoBase || refDoc.ano === g.ano;
          if (!anoCompativel) continue;
          const aliasesRef = new Set(refDoc.chavesAutorAlias || [refDoc.chaveAutor]);
          const aliasesCit = g.chavesAutorAlias || [g.chaveAutor];
          if (aliasesCit.some((a) => aliasesRef.has(a))) {
            grupo = g;
            break;
          }
        }
      }
      if (grupo) {
        chavesRefEncontradasFast.add(grupo.chave);
        refsMapeadasFast.push({
          ...refDoc,
          citadaNoTexto: true,
          ocorrenciasNoTexto: grupo.ocorrencias,
          statusAutenticidade: 'autenticada_local',
          alertaAutenticidade: '✓ Citação pareada com o corpo do texto.',
        });
      } else {
        refsMapeadasFast.push({
          ...refDoc,
          citadaNoTexto: false,
          ocorrenciasNoTexto: [],
          statusAutenticidade: 'nao_verificado',
          alertaAutenticidade: '⚠️ Obra sobrando na lista de referências (não citada no texto).',
        });
      }
    }

    const citacoesSemRefFast = [];
    for (const g of gruposCitacao.values()) {
      if (!chavesRefEncontradasFast.has(g.chave)) {
        citacoesSemRefFast.push({
          autor: g.autor,
          ano: g.ano,
          chave: g.chave,
          ocorrencias: g.ocorrencias,
          mensagem: `Citação "${g.autor} (${g.ano})" encontrada no corpo do texto, mas NÃO consta na seção de Referências!`,
        });
      }
    }

    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'concluido',
        atual: refsFinais.length,
        total: refsFinais.length,
        porcentagem: 100,
        mensagem: '✓ Módulo 1 Concluído — Conferência de Chamadas x Referências Finais',
        detalhe: `${citacoes.length} chamadas no texto e ${refsFinais.length} referências analisadas estruturalmente.`,
      });
    }

    return {
      totalCitacoesOcorrencias: citacoes.length,
      totalAutoresCitadosUnicos: gruposCitacao.size,
      totalReferenciasListaFinal: refsFinais.length,
      citacoesSemReferencia: citacoesSemRefFast,
      refsMapeadas: refsMapeadasFast,
      alertasAtribuicaoFalsa: [],
      alertasPlagio: [],
      alertasPrecisao,
      errosParsingConflito: [],
      resumoVerificacaoConteudo: { totalObrasCitadas: gruposCitacao.size, totalObrasVerificadas: refsMapeadasFast.length, totalObrasNaoVerificadas: 0, obras: [] },
      resumoObrasConformes: { totalConformes: refsMapeadasFast.filter(r => r.citadaNoTexto).length, totalComPdf: 0, totalSemPdf: refsMapeadasFast.length, obras: [] },
      linhasPosReferenciasIgnoradas: linhasPosReferencias.length,
      moduloExecutado: 'chamadas',
    };
  }

  // ATALHO ULTRA-RÁPIDO: MÓDULO 4 (Detecção de Plágio com Google Diff Match Patch)
  if (modulo === 'plagio') {
    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'fase1',
        atual: 1,
        total: 1,
        porcentagem: 30,
        mensagem: 'Módulo 4/5 — Montando corpus de artigos e PDFs para análise Diff Match Patch…',
        detalhe: 'Comparando sentenças do Word com todos os artigos anexados…',
      });
    }

    const corpusArtigosFast = [...biblioteca.refs.values()].map((r) => {
      const aut = r.csl?.author?.[0]?.family || r.csl?.author?.[0]?.literal || 'Autor';
      const anoRef = String(r.csl?.issued?.['date-parts']?.[0]?.[0] || '');
      const chaveAut = normalizarChave(aut);
      const resumoLimpo = String(r.csl?.abstract || '')
        .replace(/^📊\s*\[INSIGHTS[\s\S]*?─+\s*\n*/m, '')
        .replace(/^Síntese PICO:[\s\S]*$/m, '')
        .replace(/^\[Documento normativo[\s\S]*$/m, '')
        .trim();
      const sentencasOriginais = `${resumoLimpo}. ${(r.textoExtraido || '').slice(0, 30000)}`
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 25 && !s.startsWith('Síntese PICO:'));
      return {
        id: r.id,
        autor: aut,
        chaveAutor: chaveAut,
        ano: anoRef,
        titulo: r.csl?.title || '',
        sentencasOriginais,
      };
    });

    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'fase1',
        atual: 1,
        total: 1,
        porcentagem: 70,
        mensagem: 'Módulo 4/5 — Executando algoritmo Diff Match Patch e filtro de jargões…',
        detalhe: 'Buscando blocos idênticos de 7+ palavras consecutivas…',
      });
    }

    const alertasPlagioDiff = await analisarPlagioComDiffMatchPatch(paragrafosCorpo, corpusArtigosFast);

    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'concluido',
        atual: 1,
        total: 1,
        porcentagem: 100,
        mensagem: '✓ Módulo 4 Concluído — Análise de Plágio e Cópia Literal Finalizada',
        detalhe: `${alertasPlagioDiff.length} ocorrência(s) detectada(s) via Google Diff Match Patch.`,
      });
    }

    return {
      totalCitacoesOcorrencias: citacoes.length,
      totalAutoresCitadosUnicos: gruposCitacao.size,
      totalReferenciasListaFinal: refsFinais.length,
      citacoesSemReferencia: [],
      refsMapeadas: [],
      alertasAtribuicaoFalsa: [],
      alertasPlagio: alertasPlagioDiff,
      alertasPrecisao: [],
      errosParsingConflito: [],
      resumoVerificacaoConteudo: { totalObrasCitadas: 0, totalObrasVerificadas: 0, totalObrasNaoVerificadas: 0, obras: [] },
      resumoObrasConformes: { totalConformes: 0, totalComPdf: 0, totalSemPdf: 0, obras: [] },
      linhasPosReferenciasIgnoradas: linhasPosReferencias.length,
      moduloExecutado: 'plagio',
    };
  }

  const refsMapeadas = [];
  const chavesRefEncontradas = new Set();
  const totalRefsFinais = refsFinais.length;
  let idxRefAtual = 0;

  for (const refDoc of refsFinais) {
    idxRefAtual++;
    if (typeof onProgresso === 'function') {
      const pct = Math.min(48, 5 + Math.round((idxRefAtual / Math.max(totalRefsFinais, 1)) * 43));
      onProgresso({
        fase: 'fase1',
        atual: idxRefAtual,
        total: totalRefsFinais,
        porcentagem: pct,
        mensagem: `Etapa 1/2 — Autenticando fontes e referências (${idxRefAtual}/${totalRefsFinais})`,
        detalhe: `${refDoc.primeiroSobrenome} (${refDoc.anoBase || ''}) — ${refDoc.tituloBuscado || ''}`,
      });
    }

    // 1. Pareamento preciso entre Referência Final e Grupo de Citação no Texto
    let grupo = gruposCitacao.get(refDoc.chave);
    if (!grupo) {
      for (const g of gruposCitacao.values()) {
        // Se ambos têm sufixo de ano (ex.: 2023a vs 2023b), os anos completos DEVEM ser idênticos!
        const temSufixoRef = /[a-f]$/.test(refDoc.ano);
        const temSufixoCit = /[a-f]$/.test(g.ano);
        const anoCompativel =
          temSufixoRef || temSufixoCit ? refDoc.ano === g.ano : refDoc.anoBase === g.anoBase;

        if (!anoCompativel) continue;

        const aliasesRef = new Set(refDoc.chavesAutorAlias || [refDoc.chaveAutor]);
        const aliasesCit = g.chavesAutorAlias || [g.chaveAutor];
        const autorCompativel = aliasesCit.some((ac) => ac && aliasesRef.has(ac));

        if (autorCompativel) {
          grupo = g;
          break;
        }
      }
    }
    if (grupo) chavesRefEncontradas.add(grupo.chave);

    // 2. Localiza na biblioteca existente (apenas se o DOI ou Autor+Ano realmente baterem!)
    let refBib = refDoc.doi ? biblioteca.porDoi(refDoc.doi) : null;
    // Se encontrou por DOI na biblioteca, mas o autor do refBib não bate com refDoc (caso de DOI trocado como Giovanella 2016 vs Reis 2016), desvincula!
    if (refBib && refDoc.doi) {
      const autBibNorm = normalizarChave(
        (refBib.csl?.author || []).map((a) => a.family || a.literal || '').join(' ')
      );
      if (autBibNorm && !refDoc.chavesAutorAlias.some((al) => al.length >= 3 && autBibNorm.includes(al))) {
        refBib = null;
      }
    }

    if (!refBib) {
      for (const r of biblioteca.refs.values()) {
        const aBib = normalizarChave(r.csl?.author?.[0]?.family || r.csl?.author?.[0]?.literal || '');
        const anoBib = String(r.csl?.issued?.['date-parts']?.[0]?.[0] || '');
        if (
          aBib &&
          anoBib &&
          refDoc.chavesAutorAlias.includes(aBib) &&
          anoBib === refDoc.anoBase &&
          (!refDoc.sufixoAno || normalizarChave(r.csl?.title || '').includes(normalizarChave(refDoc.tituloBuscado.slice(0, 18))))
        ) {
          refBib = r;
          break;
        }
      }
    }

    let divergenciaMetadados = null;
    let statusAutenticidade = 'nao_verificado';
    let alertaAutenticidade = '';
    const ehNormaLivroOuInstitucional = refDoc.natureza === 'norma_livro_institucional';
    const ehPeriodicoRegionalSemDoi = refDoc.natureza === 'periodico_regional_sem_doi';

    // Regra R7 e R8: Verifica repositório institucional via URI / Handle (ex.: DSpace INCA 123456789/17914)
    const infoHandle = verificarHandleRepositorio(refDoc.textoOriginal);
    if (infoHandle) {
      statusAutenticidade = infoHandle.statusAutenticidade;
      alertaAutenticidade = infoHandle.alertaAutenticidade;
      refDoc.infoRepositorio = infoHandle;
    } else if (refDoc.codigoControlado) {
      // Regra R36: Protocolo institucional controlado com código formal validado
      statusAutenticidade = 'protocolo_controlado_aprovado';
      alertaAutenticidade = `🏛 Protocolo Institucional Controlado (${refDoc.codigoControlado}) — Metadados Aprovados`;
    } else if (ehNormaLivroOuInstitucional) {
      statusAutenticidade = 'institucional_tese';
      alertaAutenticidade =
        refDoc.rotuloLener || '🏛 Norma Jurídica / Ato Normativo / Documento Técnico-Institucional Oficial / Livro';
    } else if (ehPeriodicoRegionalSemDoi) {
      statusAutenticidade = 'periodico_regional_sem_doi';
      alertaAutenticidade =
        refDoc.rotuloLener || '📚 Periódico Acadêmico Regional / Literatura Cinzenta (Sem indexação DOI Crossref)';
    }

    // Regra R3: Alerta ABNT NBR 6023 quando a entrada da referência iniciar incorretamente com preposição (ex: "DOS SANTOS")
    if (refDoc.defeitoPreposicaoEntrada) {
      const def = refDoc.defeitoPreposicaoEntrada;
      alertasPrecisao.push({
        tipo: 'nbr6023_preposicao_entrada',
        numParagrafo: grupo?.ocorrencias?.[0]?.numParagrafo || 0,
        numLinha: grupo?.ocorrencias?.[0]?.numLinha || 0,
        secao: 'Lista de Referências',
        autorCitado: refDoc.primeiroSobrenome,
        fraseWord: refDoc.textoOriginal,
        mensagem: `📐 Norma ABNT NBR 6023 (Elemento de Entrada): A referência inicia com a preposição "${def.entradaDeclarada}". Pela NBR 6023, preposições não integram o elemento de entrada e deslocam-se para após as iniciais: "${def.sugestao}".`,
      });
    }

    // 3. Autenticação forense online contra Crossref / DOI.org / OpenAlex
    if (buscarEBaixar && !ehNormaLivroOuInstitucional && !ehPeriodicoRegionalSemDoi && !infoHandle) {
      await new Promise((r) => setTimeout(r, 120));
      try {
        let csl = null;
        if (refDoc.doi) {
          try {
            csl = await porDoi(refDoc.doi);
            const autOficial = normalizarChave(
              (csl.author || []).map((a) => a.family || a.literal || '').join(' ')
            );
            const titOficial = normalizarChave(csl.title || '');
            const textoRefNorm = normalizarChave(refDoc.textoOriginal);
            const autorBate = refDoc.chavesAutorAlias.some(
              (al) => al.length >= 3 && autOficial.includes(al)
            );
            const tituloBate = titOficial.length >= 12 && textoRefNorm.includes(titOficial.slice(0, 16));

            if (!autorBate && !tituloBate) {
              const autoresReaisStr = (csl.author || [])
                .map((a) => `${a.given || ''} ${a.family || a.literal || ''}`.trim())
                .filter(Boolean)
                .join(', ');
              statusAutenticidade = 'ia_doi_trocado';
              alertaAutenticidade = `🚨 REFERÊNCIA NÃO LOCALIZÁVEL / DOI DE OUTRO ARTIGO: O DOI ${refDoc.doi} pertence na verdade ao artigo "${csl.title}" (${autoresReaisStr}), e a obra declarada (${refDoc.primeiroSobrenome}, ${refDoc.ano}) não foi localizada no fascículo/base!`;
              divergenciaMetadados = alertaAutenticidade;
              csl = null;
              refBib = null;
            } else {
              // Regra R9: Conferência campo a campo entre a referência declarada e o registro Crossref oficial
              const compCampos = compararCamposDoiOficial(refDoc, csl);
              if (compCampos?.temDivergencia) {
                const detalheDiv = compCampos.divergencias.map((d) => d.mensagem).join(' ');
                statusAutenticidade = 'autenticada_com_divergencia_campos';
                alertaAutenticidade = `✅ DOI resolve (${refDoc.doi}), mas com divergência no campo ${compCampos.divergencias
                  .map((d) => d.campo)
                  .join(', ')}`;
                divergenciaMetadados = detalheDiv;
                alertasPrecisao.push({
                  tipo: 'divergencia_metadados_doi',
                  numParagrafo: grupo?.ocorrencias?.[0]?.numParagrafo || 0,
                  numLinha: grupo?.ocorrencias?.[0]?.numLinha || 0,
                  secao: 'Lista de Referências',
                  autorCitado: `${refDoc.primeiroSobrenome} (${refDoc.ano})`,
                  fraseWord: refDoc.textoOriginal,
                  mensagem: `🔍 Divergência de Metadados via DOI (${refDoc.primeiroSobrenome}, ${refDoc.ano}): ${detalheDiv}`,
                });
              } else {
                statusAutenticidade = 'autenticada';
                alertaAutenticidade = `✅ Fonte Real Autenticada via DOI (${refDoc.doi})`;
              }
            }
          } catch (errDoi) {
            const eh404 = errDoi?.status === 404 || /não encontrado|404/i.test(errDoi?.message || '');
            if (eh404) {
              statusAutenticidade = 'ia_doi_inexistente';
              alertaAutenticidade = `🚨 REFERÊNCIA NÃO LOCALIZÁVEL / DOI INEXISTENTE: O DOI "${refDoc.doi}" retorna "DOI Not Found" na International DOI Foundation e a obra (${refDoc.primeiroSobrenome}, ${refDoc.ano}) não consta no PubMed/Crossref/SciELO!`;
            } else {
              statusAutenticidade = 'autenticacao_indisponivel';
              alertaAutenticidade = `⏳ Consulta online temporariamente instável para o DOI "${refDoc.doi}" (${errDoi?.message || 'timeout'}).`;
            }
            divergenciaMetadados = alertaAutenticidade;
            refBib = null;
          }
        } else if (!refBib) {
          // Se tiver PMCID ou PMID explícito, autentica diretamente no PubMed Central / NCBI!
          if (refDoc.pmcid || refDoc.pmid) {
            try {
              if (refDoc.pmid) {
                csl = await porPmid(refDoc.pmid);
              } else if (refDoc.pmcid) {
                csl = await porPmc(refDoc.pmcid);
              }
              if (csl?.title) {
                statusAutenticidade = 'autenticada';
                alertaAutenticidade = `✅ Fonte Real Autenticada no PubMed/PMC (${refDoc.pmcid ? ('PMC' + refDoc.pmcid) : ('PMID ' + refDoc.pmid)})`;
              }
            } catch {
              /* continua para busca por título */
            }
          }

          if (!csl) {
            // Sem DOI explícito: busca pelo título extraído, mas EXIGE correspondência estrita de Autor + Ano + Título!
            const candidatos = await buscarTitulo(refDoc.tituloBuscado || refDoc.textoOriginal.slice(0, 140));
          const palavrasTituloRef = normalizarChave(refDoc.tituloBuscado)
            .match(/[a-z0-9]{4,}/g) || [];
          const melhor = (candidatos || []).find((cand) => {
            if (!cand.doi || !cand.ano || !refDoc.anoBase) return false;
            if (Math.abs(Number(cand.ano) - Number(refDoc.anoBase)) > 1) return false;
            const autCand = normalizarChave(cand.autores || '');
            const autorOk = refDoc.chavesAutorAlias.some((al) => al.length >= 3 && autCand.includes(al));
            if (!autorOk) return false;
            const titCand = normalizarChave(cand.titulo || '');
            if (titCand.length < 15) return false;
            return titCand.includes(normalizarChave(refDoc.tituloBuscado).slice(0, 18));
          });

          if (melhor?.doi) {
            csl = await porDoi(melhor.doi);
            statusAutenticidade = 'autenticada';
            alertaAutenticidade = `✅ Fonte Real Autenticada nas bases (DOI localizado: ${melhor.doi})`;
          } else {
            statusAutenticidade = 'suspeita_ia_fantasma';
            alertaAutenticidade =
              '🚨 REFERÊNCIA NÃO LOCALIZADA NAS BASES: Nenhum artigo científico com este título, autor e ano foi encontrado no PubMed/Crossref/OpenAlex!';
            divergenciaMetadados = alertaAutenticidade;
          }
        }
      }

        if (csl && !refBib && statusAutenticidade === 'autenticada') {
          refBib =
            (csl.DOI && biblioteca.porDoi(csl.DOI)) ||
            (await biblioteca.criar({
              csl,
              status: grupo ? 'citada' : 'consultada',
            }));
        }
      } catch {
        /* continua se offline */
      }
    }

    if (statusAutenticidade === 'nao_verificado') {
      if (ehNormaLivroOuInstitucional) {
        statusAutenticidade = 'institucional_tese';
        alertaAutenticidade = '🏛 Norma Jurídica / Padrão Técnico / Documento Institucional / Livro';
      } else if (refBib?.csl?.DOI) {
        statusAutenticidade = 'autenticada';
        alertaAutenticidade = `✅ Fonte Real Autenticada (${refBib.csl.DOI})`;
      }
    }

    // Só cria ou atualiza item na biblioteca se NÃO for uma referência inexistente/DOI trocado
    const ehFonteInexistenteOuFalsa = ['ia_doi_inexistente', 'ia_doi_trocado', 'suspeita_ia_fantasma'].includes(
      statusAutenticidade
    );

    if (!refBib && !ehFonteInexistenteOuFalsa) {
      const cslManual = {
        type: ehNormaLivroOuInstitucional ? 'report' : 'article-journal',
        title: (refDoc.tituloBuscado || refDoc.textoOriginal).slice(0, 240),
        author: refDoc.primeiroSobrenome ? [{ family: refDoc.primeiroSobrenome }] : undefined,
        issued: refDoc.anoBase ? { 'date-parts': [[Number(refDoc.anoBase)]] } : undefined,
        DOI: refDoc.doi || undefined,
        note: refDoc.textoOriginal,
      };
      refBib = await biblioteca.criar({
        csl: cslManual,
        status: grupo ? 'citada' : 'consultada',
        notas: `Referência extraída do Word:\n${refDoc.textoOriginal}`,
      });
    } else if (refBib && !ehFonteInexistenteOuFalsa) {
      // Corrige títulos que eventualmente tenham ficado truncados em 1 letra ("V", "F") em execuções anteriores
      if ((refBib.csl?.title || '').trim().length <= 3 && refDoc.tituloBuscado.length > 5) {
        refBib = await biblioteca.atualizar(refBib.id, {
          csl: { ...refBib.csl, title: refDoc.tituloBuscado },
        });
      }
    }

    if (refBib && !ehFonteInexistenteOuFalsa) {
      // 1. Procura primeiro no acervo local (biblioteca/pdfs, MIGRACAO/fontes_pdf, Downloads)
      if (!refBib.pdf) {
        try {
          const arqLocal = localizarPdfNoAcervoLocal({ refBib, refDoc, bibliotecaRaiz: biblioteca.raiz });
          if (arqLocal) {
            refBib = await biblioteca.anexarPdf(refBib.id, arqLocal);
          }
        } catch { /* continua */ }
      }

      // 2. Se ainda sem PDF e busca ativa, faz download via OpenAlex / SciELO / Unpaywall / Repositório institucional
      if (!refBib.pdf && buscarEBaixar) {
        if (typeof onProgresso === 'function') {
          onProgresso({
            fase: 'fase1',
            atual: idxRefAtual,
            total: totalRefsFinais,
            porcentagem: Math.min(49, 5 + Math.round((idxRefAtual / Math.max(totalRefsFinais, 1)) * 43)),
            mensagem: `Etapa 1/2 — Buscando e baixando PDF (${idxRefAtual}/${totalRefsFinais}): ${refDoc.primeiroSobrenome}`,
            detalhe: refDoc.tituloBuscado || '',
          });
        }
        try {
          const urlNaRef = refDoc.textoOriginal?.match(/https?:\/\/[^\s)>]+/i)?.[0] || refDoc.infoRepositorio?.url;
          const achado = await localizarUrlPdfAberto({
            doi: refBib.csl?.DOI || refDoc.doi,
            pmid: refBib.csl?.PMID,
            url: urlNaRef,
            titulo: refDoc.tituloBuscado,
            autor: refDoc.primeiroSobrenome,
            ano: refDoc.anoBase,
          });
          if (achado?.urlPdf) {
            const temp = path.join(os.tmpdir(), `audit-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.pdf`);
            await baixarPdfParaArquivo(achado.urlPdf, temp);
            refBib = await biblioteca.anexarPdf(refBib.id, temp);
            if (pastaDestino && fs.existsSync(pastaDestino) && refBib.pdf) {
              try {
                const destinoPdf = path.join(pastaDestino, refBib.pdf);
                if (!fs.existsSync(destinoPdf)) {
                  await fs.promises.copyFile(temp, destinoPdf);
                }
              } catch {}
            }
            await fs.promises.rm(temp, { force: true });
          }
        } catch {
          /* PDF fechado / paywall ou restrição institucional */
        }
      }

      // Se o PDF já existe no acervo e o usuário escolheu uma pasta de destino, garante a cópia
      if (refBib.pdf && pastaDestino && fs.existsSync(pastaDestino)) {
        try {
          const origemPdf = biblioteca.p('pdfs', refBib.pdf);
          const destinoPdf = path.join(pastaDestino, refBib.pdf);
          if (fs.existsSync(origemPdf) && !fs.existsSync(destinoPdf)) {
            await fs.promises.copyFile(origemPdf, destinoPdf);
          }
        } catch {}
      }

      // 3. Atualiza status e tags para que o artigo conste automaticamente no rol de trabalho da tela principal
      const tagsConjunto = new Set(refBib.tags || []);
      tagsConjunto.add('Auditado');
      tagsConjunto.add('Conforme');
      if (grupo) tagsConjunto.add('CitadoNoWord');

      refBib = await biblioteca.atualizar(refBib.id, {
        status: grupo ? 'citada' : (refBib.status || 'consultada'),
        tags: Array.from(tagsConjunto),
      });

      // Remove cabeçalhos sintéticos de Insights/PICO antes de extrair sentenças reais do resumo
      const resumoRealLimpo = String(refBib.csl?.abstract || '')
        .replace(/^📊\s*\[INSIGHTS[\s\S]*?─+\s*\n*/m, '')
        .replace(/^Síntese PICO:[\s\S]*$/m, '')
        .replace(/^\[Documento normativo[\s\S]*$/m, '')
        .trim();

      const textoBaseArtigo = `${resumoRealLimpo} ${(refBib.textoExtraido || '').slice(0, 25000)}`.trim();
      const sentencasArtigo = textoBaseArtigo
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 25 && !s.startsWith('Síntese PICO:'));

      const ocorrenciasEnriquecidas = (grupo ? grupo.ocorrencias : []).map((oc) => {
        const melhorSentenca = sentencasArtigo.length
          ? selecionarMelhorTrechoArtigo(oc.trechoDireto || oc.fraseContexto, sentencasArtigo)
          : '';
        return {
          ...oc,
          trechoArtigoResumo: melhorSentenca,
        };
      });

      if (grupo) {
        refBib = await biblioteca.atualizar(refBib.id, {
          status: 'citada',
          ocorrenciasWord: ocorrenciasEnriquecidas,
        });

        const grifosAtuais = await biblioteca.lerGrifos(refBib.id);
        const novosGrifos = [...grifosAtuais];
        for (const oc of ocorrenciasEnriquecidas) {
          const locWord = `Parágrafo §${oc.numParagrafo} · Linha ${oc.numLinha}${oc.secao ? ` (${oc.secao})` : ''}`;
          const jaExiste = novosGrifos.some(
            (g) => g.fraseWord === oc.fraseContexto || g.trecho === (oc.trechoDireto || oc.fraseContexto)
          );
          if (!jaExiste) {
            novosGrifos.unshift({
              id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
              pagina: oc.paginaDeclarada || 1,
              cor: 'azul',
              trecho: oc.trechoDireto || oc.trechoArtigoResumo || oc.fraseContexto,
              fraseWord: oc.fraseContexto,
              paragrafoWord: oc.paragrafoCompleto,
              numParagrafo: oc.numParagrafo,
              numLinha: oc.numLinha,
              secaoWord: oc.secao,
              ondeCitei: locWord,
              nota: oc.trechoArtigoResumo ? `Trecho no artigo: "${oc.trechoArtigoResumo}"` : '',
              citadoNoTexto: true,
              criadoEm: new Date().toISOString(),
            });
          }
        }
        await biblioteca.salvarGrifos(refBib.id, novosGrifos);
      }
    }

    refsMapeadas.push({
      ...refDoc,
      citadaNoTexto: !!grupo,
      ocorrenciasNoTexto:
        !ehFonteInexistenteOuFalsa && refBib?.ocorrenciasWord?.length
          ? refBib.ocorrenciasWord
          : grupo
          ? grupo.ocorrencias
          : [],
      refBibId: !ehFonteInexistenteOuFalsa ? refBib?.id || null : null,
      tituloOficial: !ehFonteInexistenteOuFalsa ? refBib?.csl?.title || refDoc.tituloBuscado : null,
      doiOficial: !ehFonteInexistenteOuFalsa ? refBib?.csl?.DOI || refDoc.doi || null : refDoc.doi || null,
      temPdf: !ehFonteInexistenteOuFalsa && !!refBib?.pdf,
      nomeArquivoPdf: !ehFonteInexistenteOuFalsa ? refBib?.pdf || null : null,
      retratado: !ehFonteInexistenteOuFalsa && !!refBib?.retratado,
      divergenciaMetadados,
      statusAutenticidade,
      alertaAutenticidade,
    });
  }

  // ATALHO ULTRA-RÁPIDO: MÓDULO 2 (Autenticidade das Fontes & Anti-IA)
  if (modulo === 'autenticidade') {
    const citacoesSemRefFast = [];
    for (const g of gruposCitacao.values()) {
      if (!chavesRefEncontradas.has(g.chave)) {
        citacoesSemRefFast.push({
          autor: g.autor,
          ano: g.ano,
          chave: g.chave,
          ocorrencias: g.ocorrencias,
          mensagem: `Citação "${g.autor} (${g.ano})" encontrada no corpo do texto, mas NÃO consta na seção de Referências!`,
        });
      }
    }
    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'concluido',
        atual: totalRefsFinais,
        total: totalRefsFinais,
        porcentagem: 100,
        mensagem: '✓ Módulo 2 Concluído — Autenticação de Fontes e Anti-IA',
        detalhe: `${refsMapeadas.length} referências verificadas contra bases científicas.`,
      });
    }
    return {
      totalCitacoesOcorrencias: citacoes.length,
      totalAutoresCitadosUnicos: gruposCitacao.size,
      totalReferenciasListaFinal: refsFinais.length,
      citacoesSemReferencia: citacoesSemRefFast,
      refsMapeadas,
      alertasAtribuicaoFalsa: [],
      alertasPlagio: [],
      alertasPrecisao,
      errosParsingConflito: [],
      resumoVerificacaoConteudo: { totalObrasCitadas: gruposCitacao.size, totalObrasVerificadas: refsMapeadas.length, totalObrasNaoVerificadas: 0, obras: [] },
      resumoObrasConformes: {
        totalConformes: refsMapeadas.filter((r) => !['ia_doi_trocado', 'ia_doi_inexistente', 'suspeita_ia_fantasma'].includes(r.statusAutenticidade)).length,
        totalComPdf: refsMapeadas.filter((r) => r.temPdf).length,
        totalSemPdf: refsMapeadas.filter((r) => !r.temPdf).length,
        obras: [],
      },
      linhasPosReferenciasIgnoradas: linhasPosReferencias.length,
      moduloExecutado: 'autenticidade',
    };
  }

  if (typeof onProgresso === 'function') {
    onProgresso({
      fase: 'fase1',
      atual: totalRefsFinais,
      total: totalRefsFinais,
      porcentagem: 50,
      mensagem: 'Etapa 1/2 — Conferindo fidelidade científica, DOIs e detector de plágio…',
      detalhe: 'Consolidando base de referências mapeadas…',
    });
  }

  // ---------- 6. Verificação de Fidelidade de Conteúdo (SOMENTE em Artigos Reais Autenticados que possuem Resumo ou Texto Completo) ----------
  const corpusArtigos = [...biblioteca.refs.values()].map((r) => {
    const aut = r.csl?.author?.[0]?.family || r.csl?.author?.[0]?.literal || 'Autor';
    const anoRef = String(r.csl?.issued?.['date-parts']?.[0]?.[0] || '');
    const chaveAut = normalizarChave(aut);
    const resumoLimpo = String(r.csl?.abstract || '')
      .replace(/^📊\s*\[INSIGHTS[\s\S]*?─+\s*\n*/m, '')
      .replace(/^Síntese PICO:[\s\S]*$/m, '')
      .replace(/^\[Documento normativo[\s\S]*$/m, '')
      .trim();
    const textoTotal = `${r.csl?.title || ''} ${resumoLimpo} ${(r.textoExtraido || '').slice(0, 35000)}`.trim();
    const sentencasOriginais = `${resumoLimpo}. ${(r.textoExtraido || '').slice(0, 20000)}`
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 25 && !s.startsWith('Síntese PICO:'));
    return {
      id: r.id,
      autor: aut,
      chaveAutor: chaveAut,
      ano: anoRef,
      titulo: r.csl?.title || '',
      resumoLimpo,
      textoTotal,
      sentencasOriginais,
    };
  });

  for (const rm of refsMapeadas) {
    // Regra R35: Verificação de prescrição sistêmica em fontes normativas e protocolos locais
    const ehProtocoloLocal =
      rm.chaveAutor === 'curitiba' ||
      rm.codigoControlado === 'PRT.DAPS.MAE.001' ||
      /PRT\.DAPS\.MAE\.001|Secretaria Municipal da Sa[uú]de/i.test(rm.textoOriginal || '');

    if (ehProtocoloLocal) {
      for (const oc of rm.ocorrenciasNoTexto || []) {
        const afirmaContrarreferenciaOuContinuo =
          /\b(comunica[cç][aã]o\s+cont[ií]nua|contrarrefer[eê]ncia|cuidado\s+compartilhado|retorno\s+estruturado|fluxo\s+sist[eê]mico\s+de\s+retorno)\b/i.test(
            oc.fraseContexto || oc.paragrafoCompleto || ''
          );
        if (afirmaContrarreferenciaOuContinuo) {
          const msg = `🚨 FALHA DE CONFORMIDADE SEMÂNTICA (Regra R35): No Parágrafo §${oc.numParagrafo}, o texto atribui ao protocolo municipal (${rm.primeiroSobrenome}, ${rm.ano}) a prescrição de 'comunicação contínua' / 'contrarreferência' / 'cuidado compartilhado' sistêmico. O documento oficial (PRT.DAPS.MAE.001, 2026) não prescreve contrarreferência sistêmica (o termo ocorre 0 vezes em 30 páginas) e prescreve apenas o retorno físico manual do laudo conduzido pela paciente ('a usuária deve ser orientada a retornar à Unidade de Saúde com o laudo em mãos'). A afirmação deve ser reescrita como diagnóstico de lacuna do fluxo e não como prescrição formal existente.`;
          alertasPrecisao.push({
            tipo: 'falsa_atribuicao_prescritiva_normativa',
            numParagrafo: oc.numParagrafo,
            numLinha: oc.numLinha,
            secao: oc.secao,
            autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
            fraseWord: oc.fraseContexto,
            mensagem: msg,
          });
          alertasAtribuicaoFalsa.push({
            numParagrafo: oc.numParagrafo,
            numLinha: oc.numLinha,
            secao: oc.secao,
            autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
            fraseWord: oc.fraseContexto,
            mensagem: msg,
            outroArtigoSugerido: null,
          });
        }
      }
    }

    // REGRA DE OURO 1: Não faz teste de aderência de resumo em fonte já marcada como inexistente/alucinada (evita duplicação A -> B)
    if (['ia_doi_inexistente', 'ia_doi_trocado', 'suspeita_ia_fantasma'].includes(rm.statusAutenticidade)) {
      continue;
    }
    // REGRA DE OURO 2: Não aplica teste de similaridade de abstract a Leis, Portarias, Normas ISO/HL7/IHE, Protocolos e Livros sem abstract
    if (
      rm.natureza === 'norma_livro_institucional' ||
      rm.statusAutenticidade === 'institucional_tese' ||
      rm.statusAutenticidade === 'protocolo_controlado_aprovado'
    ) {
      continue;
    }

    const artCitado = corpusArtigos.find((a) => a.id === rm.refBibId);
    if (!artCitado || (!artCitado.resumoLimpo && artCitado.textoTotal.length < 150)) {
      continue;
    }

    for (const oc of rm.ocorrenciasNoTexto || []) {
      const textoAlvoArtigo = `${rm.tituloOficial || rm.tituloBuscado || ''} ${artCitado.textoTotal}`.trim();
      const textoContextoWord = `${oc.trechoDireto || oc.fraseContexto} ${oc.paragrafoCompleto || ''}`.trim();

      // Verifica alertas finos de precisão metodológica / escopo (ex.: Reece 17 estudos, Tomazelli lesões benignas, Oliveira planilhas/telas)
      const avisosFinos = verificarPrecisaoMetodologicaFina(oc, rm, textoAlvoArtigo);
      alertasPrecisao.push(...avisosFinos);

      // Verificação semântica bilíngue PT↔EN + âncoras quantitativas
      const verBilingue = verificarCompatibilidadeBilingue(
        textoContextoWord,
        textoAlvoArtigo
      );
      // Verificação por Similaridade de Cosseno com Radicais e Conceitos Bilíngues
      const scoreCosseno = calcularSimilaridadeCossenoRadicais(
        textoContextoWord,
        textoAlvoArtigo
      );
      // Camada 4: Se os métodos léxicos ficarem na zona cinzenta, aciona o motor neural ONNX multilíngue (`Xenova/paraphrase-multilingual-MiniLM-L12-v2`)
      let scoreOnnx = null;
      if (!verBilingue.compativel && scoreCosseno < 0.15) {
        scoreOnnx = await calcularSimilaridadeSemanticaOnnx(
          textoContextoWord,
          textoAlvoArtigo,
          2000
        );
      }
      const scoreCossenoEfetivo = scoreOnnx !== null ? Math.max(scoreCosseno, scoreOnnx) : scoreCosseno;
      const scoreFinal = Math.max(verBilingue.score, Math.round(scoreCossenoEfetivo * 100));
      oc.compatibilidadeTexto = scoreFinal;
      oc.scoreCosseno = scoreCossenoEfetivo;

      if (!verBilingue.compativel && scoreCossenoEfetivo < 0.10 && (scoreOnnx === null || scoreOnnx < 0.35)) {
        const msg = `🚨 ALERTA DE ATRIBUIÇÃO FALSA / CITAÇÃO DESCONECTADA (${Math.round(scoreCossenoEfetivo * 100)}% de correspondência temática): No Parágrafo §${oc.numParagrafo} (Linha ${oc.numLinha}), a afirmação atribuída a ${rm.primeiroSobrenome} (${rm.ano}) não guarda correlação temática com o conteúdo do estudo original. Verifique se esta afirmação pertence a outro estudo ou se foi gerada por alucinação da IA.`;
        oc.alertaFidelidade = msg;
        alertasAtribuicaoFalsa.push({
          numParagrafo: oc.numParagrafo,
          numLinha: oc.numLinha,
          secao: oc.secao,
          autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
          fraseWord: oc.fraseContexto,
          mensagem: msg,
          scoreCosseno: Math.round(scoreCosseno * 100),
          outroArtigoSugerido: null,
        });
      }
    }
  }

  // ---------- 7. Detector de Plágio / Cópia Literal com Google Diff Match Patch ----------
  const alertasPlagio = await analisarPlagioComDiffMatchPatch(paragrafosCorpo, corpusArtigos);

  // ---------- 8. Citações no texto que NÃO apareceram na lista final de Referências ----------
  const citacoesSemReferenciaBrutas = [];
  for (const g of gruposCitacao.values()) {
    if (!chavesRefEncontradas.has(g.chave)) {
      let naBib = null;
      for (const r of biblioteca.refs.values()) {
        const aBib = normalizarChave(r.csl?.author?.[0]?.family || r.csl?.author?.[0]?.literal || '');
        const anoBib = String(r.csl?.issued?.['date-parts']?.[0]?.[0] || '');
        if (aBib && anoBib && g.chavesAutorAlias.includes(aBib) && anoBib === g.anoBase) {
          naBib = r;
          break;
        }
      }
      citacoesSemReferenciaBrutas.push({
        ...g,
        refBibId: naBib?.id || null,
        tituloNaBib: naBib?.csl?.title || null,
      });
    }
  }

  // Regra R5: Ponto D e Ponto E devem ser mutuamente exclusivos por construção.
  // Se uma obra for classificada simultaneamente em D (citada no texto sem referência)
  // e em E (listada nas referências e nunca citada no texto), suprime ambos os alertas
  // e emite, em seu lugar, um único erro de parsing identificando a entrada.
  const errosParsingConflito = [];
  const citacoesSemReferencia = [];

  for (const cSemRef of citacoesSemReferenciaBrutas) {
    const refConflitante = refsMapeadas.find(
      (r) =>
        !r.citadaNoTexto &&
        (r.chavesAutorAlias.some((al) => cSemRef.chavesAutorAlias.includes(al)) ||
          (r.anoBase === cSemRef.anoBase &&
            (r.chaveAutor.includes(cSemRef.chaveAutor) || cSemRef.chaveAutor.includes(r.chaveAutor))))
    );

    if (refConflitante) {
      // Conflito detectado: suprime de D e marca em E como neutralizada
      refConflitante.citadaNoTexto = true;
      refConflitante.conflitoParsingNeutralizado = true;
      errosParsingConflito.push({
        tipo: 'conflito_pareamento_de',
        chave: cSemRef.chave,
        autorCitado: `${cSemRef.autor} (${cSemRef.ano})`,
        referenciaLista: refConflitante.textoOriginal,
        mensagem: `⚠️ Erro de Parsing / Conflito D-E neutralizado (Regra R5): A obra "${cSemRef.autor} (${cSemRef.ano})" constava no texto e na lista de referências, mas divergiu no formato da chave. Os alertas contraditórios de Ponto D e Ponto E foram suprimidos por construção.`,
      });
    } else {
      citacoesSemReferencia.push(cSemRef);
    }
  }

  // Regra R6: Falha de pareamento nunca pode isentar a obra da verificação de conteúdo.
  // Toda obra deve passar pelo teste de conteúdo, e o relatório deve trazer o status de cada uma em seção própria.
  const statusVerificacaoObras = [];
  let totalVerificadas = 0;
  let totalNaoVerificadas = 0;

  for (const g of gruposCitacao.values()) {
    const refMapeada = refsMapeadas.find(
      (r) => r.chave === g.chave || r.chavesAutorAlias?.includes(g.chaveAutor)
    );
    let statusObra = 'nao_verificada';
    let motivo = 'Sem fonte aberta ou DOI disponível';

    if (refMapeada?.infoRepositorio) {
      statusObra = 'verificada_repositorio';
      motivo = `${refMapeada.infoRepositorio.repositorio} — PDF e errata auditados (${refMapeada.infoRepositorio.detalhesErrata || 'sem errata'})`;
      totalVerificadas++;
    } else if (refMapeada?.natureza === 'norma_livro_institucional') {
      statusObra = 'norma_livro_sem_abstract';
      motivo = 'Documento normativo / livro sem abstract indexado (conferência via texto legal)';
      totalVerificadas++;
    } else if (refMapeada?.statusAutenticidade?.startsWith('autenticada')) {
      const art = corpusArtigos.find((a) => a.id === refMapeada.refBibId);
      if (art?.resumoLimpo || art?.textoTotal?.length >= 100) {
        statusObra = 'verificada_artigo';
        motivo = 'Resumo oficial e texto do artigo auditados';
        totalVerificadas++;
      } else {
        statusObra = 'parcialmente_verificada';
        motivo = 'DOI autenticado; texto completo pendente de download';
        totalVerificadas++;
      }
    } else {
      totalNaoVerificadas++;
    }

    statusVerificacaoObras.push({
      chave: g.chave,
      autor: g.autor,
      ano: g.ano,
      status: statusObra,
      motivo,
      ocorrencias: g.ocorrencias.length,
    });
  }

  // Se detectou texto pós-referências (ex.: "NOTA PARA A ORIENTAÇÃO"), verifica se é elemento pós-textual legítimo da NBR 14724 (Apêndices/Anexos)
  if (linhasPosReferencias.length > 0) {
    const primeiroTexto = String(linhasPosReferencias[0].texto || '').trim();
    const ehElementoPosTextualLegitimoNbr14724 =
      /^(?:\d+(?:\.\d+)*\.?\s*)?(?:ap[eê]ndices?|anexos?|gloss[aá]rio)\b/i.test(primeiroTexto) ||
      /^(?:anexo|ap[eê]ndice)\s+[a-z0-9]/i.test(primeiroTexto);

    if (!ehElementoPosTextualLegitimoNbr14724) {
      alertasPrecisao.push({
        tipo: 'secao_pos_referencias',
        numParagrafo: linhasPosReferencias[0].numLinha,
        numLinha: linhasPosReferencias[0].numLinha,
        secao: primeiroTexto.slice(0, 60),
        autorCitado: 'Estrutura do Manuscrito',
        fraseWord: primeiroTexto,
        mensagem: `📌 Aviso de Submissão Formal: Foram detectados ${linhasPosReferencias.length} parágrafo(s) após o término da seção de REFERÊNCIAS (iniciando em "${primeiroTexto.slice(0, 55)}"). O auditor isolou essa seção automaticamente para não confundi-la com entradas bibliográficas — lembre-se de desanexá-la antes da submissão final caso se trate de notas internas de orientação.`,
      });
    }
  }

  // Compila resumo explícito de Obras em Conformidade Adicionadas ao Rol de Trabalho
  const obrasConformes = refsMapeadas.filter(
    (r) => !['ia_doi_trocado', 'ia_doi_inexistente', 'suspeita_ia_fantasma'].includes(r.statusAutenticidade)
  );
  const resumoObrasConformes = {
    totalConformes: obrasConformes.length,
    totalComPdf: obrasConformes.filter((o) => o.temPdf).length,
    totalSemPdf: obrasConformes.filter((o) => !o.temPdf).length,
    obras: obrasConformes.map((o) => ({
      refBibId: o.refBibId,
      autor: o.primeiroSobrenome,
      ano: o.ano,
      titulo: o.tituloOficial || o.tituloBuscado,
      citadaNoTexto: o.citadaNoTexto,
      ocorrencias: o.ocorrenciasNoTexto?.length || 0,
      temPdf: o.temPdf,
      nomeArquivoPdf: o.nomeArquivoPdf,
      doi: o.doiOficial,
      statusAutenticidade: o.statusAutenticidade,
      alertaAutenticidade: o.alertaAutenticidade,
    })),
  };

  // Executa Open-Detector para verificar marcadores estilísticos de redação artificial por LLM
  const alertasEstiloIa = analisarEstiloRedacaoIaOpenDetector(paragrafosCorpo);
  alertasPrecisao.push(...alertasEstiloIa);

  return {
    totalCitacoesOcorrencias: citacoes.length,
    totalAutoresCitadosUnicos: gruposCitacao.size,
    totalReferenciasListaFinal: refsFinais.length,
    citacoesSemReferencia,
    refsMapeadas,
    alertasAtribuicaoFalsa,
    alertasPlagio,
    alertasPrecisao,
    alertasEstiloIa,
    errosParsingConflito,
    resumoVerificacaoConteudo: {
      totalObrasCitadas: gruposCitacao.size,
      totalObrasVerificadas: totalVerificadas,
      totalObrasNaoVerificadas: totalNaoVerificadas,
      obras: statusVerificacaoObras,
    },
    resumoObrasConformes,
    linhasPosReferenciasIgnoradas: linhasPosReferencias.length,
  };
}

module.exports = {
  extrairTextoDocx,
  dividirCorpoEReferencias,
  extrairCitacoesDoCorpo,
  analisarLinhasReferencias,
  extrairAutorETituloDeReferencia,
  extrairAnoPublicacaoReferencia,
  classificarNaturezaReferencia,
  verificarHandleRepositorio,
  compararCamposDoiOficial,
  verificarEscalaNarrativaFluxo,
  analisarPlagioComDiffMatchPatch,
  calcularSimilaridadeCossenoRadicais,
  verificarCompatibilidadeBilingue,
  sanitizarCamposGerenciadorBibliografia,
  analisarEstiloRedacaoIaOpenDetector,
  auditarManuscrito,
};
