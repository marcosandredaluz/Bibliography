/**
 * CAMADA 1 — Extrator Nativo de Metadados CSL-JSON (Mendeley / Zotero / EndNote) + Mammoth OpenXML
 * -----------------------------------------------------------------------------------------------
 * Lê diretamente os blocos estruturados `ADDIN CSL_CITATION {...}` e `ADDIN ZOTERO_ITEM CSL_CITATION {...}`
 * dentro do XML do Word (`word/document.xml`, `footnotes.xml`, `endnotes.xml`) ANTES da limpeza das tags
 * `<w:instrText>`, extraindo a verdade absoluta (Ground-Truth) cadastrada no gerenciador bibliográfico:
 *   - `type` oficial do CSL (`report`, `legislation`, `bill`, `statute`, `webpage`, `book`, `article-journal`, etc.)
 *   - `DOI`, `URL`, `title`, `author`, `issued`, `container-title`, `publisher`
 *   - `plainTextFormattedCitation` (ex.: `"1"`, `"3,4"`, `"11–14"`, `"(SILVA, 2020)"`)
 *   - Nota: nunca permite que o campo `abstract` interno do JSON do Mendeley vaze para o corpo do texto.
 */

let mammoth = null;
try {
  mammoth = require('mammoth');
} catch {
  mammoth = null;
}

function normalizarChaveSimples(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

/**
 * Extrai objetos JSON balanceados após um marcador como `ADDIN CSL_CITATION` ou `CSL_CITATION`.
 */
function extrairBlocosJsonCslDeString(textoOuXml) {
  if (!textoOuXml) return [];
  // Junta tags <w:instrText> contíguas do Word E extrai atributos <w:fldSimple w:instr="...">
  let limpo = String(textoOuXml);
  if (limpo.includes('<w:instrText') || limpo.includes('<w:fldSimple')) {
    const trechosInstr = [];
    const reParagrafo = /<w:p\b[^>]*>([\s\S]*?)<\/w:p>/g;
    let mPar;
    while ((mPar = reParagrafo.exec(limpo)) !== null) {
      const pXml = mPar[1];
      if (!pXml.includes('CSL_CITATION') && !pXml.includes('BIBLIOGRAFIA_ITEM') && !pXml.includes('BIB_REF:')) continue;
      const instrConcat = [...pXml.matchAll(/<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/g)]
        .map((m) => m[1])
        .join('')
        .replace(/&quot;/g, '"')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&#39;/g, "'");
      if (instrConcat.includes('CSL_CITATION')) {
        trechosInstr.push(instrConcat);
      }
      for (const mf of pXml.matchAll(/<w:fldSimple\b[^>]*\bw:instr="([^"]+)"/g)) {
        const dec = mf[1]
          .replace(/&quot;/g, '"')
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&#39;/g, "'");
        if (dec.includes('CSL_CITATION')) trechosInstr.push(dec);
      }
    }
    limpo = trechosInstr.join('\n');
  }

  const objetos = [];
  let idx = -1;
  while ((idx = limpo.indexOf('CSL_CITATION', idx + 1)) !== -1) {
    const inicioJson = limpo.indexOf('{', idx);
    if (inicioJson === -1) break;
    let nivel = 0;
    let emString = false;
    let escape = false;
    let fimJson = -1;
    for (let i = inicioJson; i < limpo.length; i++) {
      const ch = limpo[i];
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
      const fatiaJson = limpo.slice(inicioJson, fimJson + 1);
      try {
        const parsed = JSON.parse(fatiaJson);
        if (parsed && Array.isArray(parsed.citationItems)) {
          objetos.push(parsed);
        }
      } catch {
        // Ignora JSON malformado
      }
      idx = fimJson;
    }
  }
  return objetos;
}

/**
 * Extrai metadados nativos do suplemento Bibliografia.dotm (`BIB_REF:id` / `BIBLIOGRAFIA_ITEM id=...`)
 * presentes em `<w:tag>` e `<w:instrText>` / `<w:fldSimple>`.
 */
function extrairIdsNativosBibliografiaDoXml(xmlStr = '') {
  const mapaNativos = new Map();
  const s = String(xmlStr || '');
  for (const m of s.matchAll(/BIB_REF:([a-zA-Z0-9_,-]+)/g)) {
    for (const id of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      mapaNativos.set(id, (mapaNativos.get(id) || 0) + 1);
    }
  }
  for (const m of s.matchAll(/BIBLIOGRAFIA_ITEM\s+([^<\r\n"]+)/g)) {
    const seg = m[1];
    const idMatch = seg.match(/\bid=([a-zA-Z0-9_-]+)/);
    if (idMatch) {
      mapaNativos.set(idMatch[1], (mapaNativos.get(idMatch[1]) || 0) + 1);
    }
  }
  return mapaNativos;
}

/**
 * Constrói um Mapa de Metadados CSL-JSON a partir dos campos embutidos pelo Mendeley/Zotero/Bibliografia no `.docx`.
 * Permite consultar por título normalizado, por DOI, por autor+ano, por número de citação ou ID nativo.
 */
function extrairMetadadosCslEmbutidosNoXml(xmlStr) {
  const blocos = extrairBlocosJsonCslDeString(xmlStr);
  const idsNativosBib = extrairIdsNativosBibliografiaDoXml(xmlStr);
  const porTitulo = new Map();
  const porDoi = new Map();
  const porNumero = new Map();
  const todosItens = [];

  for (const bloco of blocos) {
    const citTexto = String(
      bloco?.mendeley?.plainTextFormattedCitation ||
        bloco?.properties?.formattedCitation ||
        bloco?.properties?.plainCitation ||
        ''
    )
      .replace(/<[^>]+>/g, '')
      .trim();

    const itens = bloco.citationItems || [];
    // Se a chamada é um número único (ex.: "1", "32", "40") e tem 1 único itemData, vincula diretamente ao número!
    const numUnico = /^\d{1,3}$/.test(citTexto) && itens.length === 1 ? Number(citTexto) : null;

    for (const item of itens) {
      const data = item.itemData || {};
      if (!data.title && !data.DOI) continue;

      const autores = (data.author || []).map((a) => a.family || a.literal || '').filter(Boolean);
      const ano = String(data.issued?.['date-parts']?.[0]?.[0] || '');
      const doiLimpo = data.DOI ? String(data.DOI).trim().toLowerCase().replace(/^https?:\/\/(dx\.)?doi\.org\//i, '') : null;
      const chaveTit = normalizarChaveSimples(data.title).slice(0, 36);

      const registro = {
        id: data.id || item.id,
        type: data.type || 'article-journal',
        title: data.title || '',
        doi: doiLimpo,
        url: data.URL || null,
        autores,
        primeiroAutor: autores[0] || '',
        ano,
        periodico: data['container-title'] || data.publisher || '',
        abstractEmbutido: data.abstract || null,
        citacaoFormatada: citTexto,
        numeroInferido: numUnico,
      };

      todosItens.push(registro);
      if (chaveTit.length >= 8) porTitulo.set(chaveTit, registro);
      if (doiLimpo) porDoi.set(doiLimpo, registro);
      if (numUnico) porNumero.set(numUnico, registro);
    }
  }

  return {
    totalBlocosCsl: blocos.length,
    totalItensUnicos: porTitulo.size,
    porTitulo,
    porDoi,
    porNumero,
    idsNativosBib,
    todosItens,
    buscarParaReferencia(refDoc) {
      if (!refDoc) return null;
      if (refDoc.numeroRef && porNumero.has(refDoc.numeroRef)) {
        return porNumero.get(refDoc.numeroRef);
      }
      if (refDoc.doi) {
        const d = String(refDoc.doi).toLowerCase().trim();
        if (porDoi.has(d)) return porDoi.get(d);
      }
      const titRef = normalizarChaveSimples(refDoc.tituloBuscado || refDoc.textoOriginal);
      if (titRef.length >= 10) {
        for (const [kTit, reg] of porTitulo.entries()) {
          if (titRef.includes(kTit.slice(0, 18)) || kTit.includes(titRef.slice(0, 18))) {
            return reg;
          }
        }
      }
      return null;
    },
  };
}

/**
 * Extração auxiliar via Mammoth (quando disponível) para validação cruzada de parágrafos limpos.
 */
async function extrairTextoLimpoComMammoth(caminhoDocx) {
  if (!mammoth) return null;
  try {
    const res = await mammoth.extractRawText({ path: caminhoDocx });
    return res?.value || null;
  } catch {
    return null;
  }
}

module.exports = {
  extrairBlocosJsonCslDeString,
  extrairMetadadosCslEmbutidosNoXml,
  extrairTextoLimpoComMammoth,
};
