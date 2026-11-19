/**
 * electron/audit/docx_extractor.cjs
 * Extrator nativo ZIP/OpenXML para .docx e sanitizador de campos CSL embutidos.
 */
'use strict';

const fs = require('fs');
const zlib = require('zlib');
const { extrairMetadadosCslEmbutidosNoXml } = require('../csl_mendeley_parser.cjs');

let ultimoMapaCslEmbutidoDocx = null;

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

module.exports = {
  extrairArquivoDoZip,
  sanitizarCamposGerenciadorBibliografia,
  xmlParaTextoLimpo,
  extrairTextoDocx,
  obterUltimoMapaCslDocx: () => ultimoMapaCslEmbutidoDocx,
};
