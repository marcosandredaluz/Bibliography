/**
 * electron/word_ref_extractor.cjs
 *
 * Extrator Reverso de Campos Bibliográficos do Microsoft Word (.DOCX),
 * inspirado no projeto open-source `rmzelle/ref-extractor` e na arquitetura Zotero/Mendeley/EndNote.
 *
 * Lê diretamente os XMLs internos do pacote OOXML (`word/document.xml`, `word/footnotes.xml`,
 * `word/endnotes.xml`), extraindo:
 * 1. Campos dinâmicos Zotero (`ADDIN ZOTERO_ITEM CSL_CITATION {...}`)
 * 2. Campos dinâmicos Mendeley (`ADDIN CSL_CITATION {...}`)
 * 3. Campos EndNote (`ADDIN EN.CITE ...`)
 * 4. Campos e Content Controls nativos do Bibliografia (`BIB_REF:...`, `BIBLIOGRAFIA_ITEM ...`)
 * 5. Fallback para lista de Referências em texto plano quando os campos já foram convertidos em texto estático.
 */

'use strict';

const fs = require('fs');
const JSZip = require('jszip');
const { extrairBlocosJsonCslDeString } = require('./csl_mendeley_parser.cjs');
const auditor = require('./auditor.cjs');

function normalizarChaveMatch(str = '') {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/<[^>]+>/g, '')
    .replace(/[^a-z0-9]/g, '');
}

function limparDoi(doi) {
  if (!doi) return null;
  const m = String(doi).match(/10\.\d{4,9}\/[^\s"'<>]+/i);
  return m ? m[0].replace(/[.,;:)\]}]+$/, '').toLowerCase() : null;
}

function extrairCamposEndNoteDeXml(xmlStr = '') {
  const registros = [];
  const reInstr = /<w:instrText\b[^>]*>([\s\S]*?)<\/w:instrText>/g;
  const concatenado = [...String(xmlStr).matchAll(reInstr)]
    .map((m) => m[1])
    .join('')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&');

  if (!concatenado.includes('EN.CITE') && !concatenado.includes('<EndNote>')) return registros;

  const reRec = /<record>([\s\S]*?)<\/record>/gi;
  let m;
  while ((m = reRec.exec(concatenado)) !== null) {
    const rec = m[1];
    const tag = (nome) => {
      const mt = rec.match(new RegExp(`<${nome}[^>]*>([\\s\\S]*?)<\\/${nome}>`, 'i'));
      return mt ? mt[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim() : '';
    };
    const titulo = tag('title');
    if (!titulo) continue;
    const ano = tag('year').match(/(?:19|20)\d\d/)?.[0] || '';
    const doi = limparDoi(tag('electronic-resource-num'));
    const periodico = tag('secondary-title') || tag('full-title') || '';
    const volume = tag('volume');
    const issue = tag('number');
    const pages = tag('pages');
    const autores = [...rec.matchAll(/<author[^>]*>([\s\S]*?)<\/author>/gi)].map((ma) => {
      const nome = ma[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
      const partes = nome.split(',');
      if (partes.length >= 2) return { family: partes[0].trim(), given: partes.slice(1).join(' ').trim() };
      const toks = nome.split(/\s+/);
      return toks.length > 1
        ? { family: toks[toks.length - 1], given: toks.slice(0, -1).join(' ') }
        : { literal: nome };
    });

    registros.push({
      origemCampo: 'endnote',
      csl: {
        type: 'article-journal',
        title: titulo,
        author: autores,
        issued: ano ? { 'date-parts': [[Number(ano)]] } : undefined,
        'container-title': periodico || undefined,
        volume: volume || undefined,
        issue: issue || undefined,
        page: pages || undefined,
        DOI: doi || undefined,
      },
    });
  }
  return registros;
}

function extrairIdsNativosBibliografia(xmlStr = '') {
  const counts = new Map();
  const s = String(xmlStr || '');
  // ContentControls Office.js (<w:tag w:val="BIB_REF:id1,id2"/>)
  for (const m of s.matchAll(/BIB_REF:([a-zA-Z0-9_,-]+)/g)) {
    for (const id of m[1].split(',').map((x) => x.trim()).filter(Boolean)) {
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  // Campos VBA wdFieldAddin (`BIBLIOGRAFIA_ITEM ...`)
  for (const m of s.matchAll(/BIBLIOGRAFIA_ITEM\s+([^\s<"]+)/g)) {
    const token = m[1].trim();
    if (token.startsWith('id=')) {
      const id = token.slice(3);
      counts.set(id, (counts.get(id) || 0) + 1);
    }
  }
  return counts;
}

function extrairReferenciasDeXml(xmlStr = '') {
  const mapaUnicos = new Map();
  let zoteroCount = 0;
  let mendeleyCount = 0;

  const adicionarItem = (cslBruto, origemCampo) => {
    if (!cslBruto || (!cslBruto.title && !cslBruto.DOI)) return;
    const doi = limparDoi(cslBruto.DOI);
    const chaveTit = normalizarChaveMatch(cslBruto.title).slice(0, 48);
    const ano = String(cslBruto.issued?.['date-parts']?.[0]?.[0] || '');
    const chaveUnica = doi ? `doi:${doi}` : `tit:${chaveTit}:${ano}`;

    if (mapaUnicos.has(chaveUnica)) {
      const existente = mapaUnicos.get(chaveUnica);
      existente.ocorrencias += 1;
      if (!existente.origens.includes(origemCampo)) existente.origens.push(origemCampo);
      return;
    }

    mapaUnicos.set(chaveUnica, {
      chaveUnica,
      ocorrencias: 1,
      origens: [origemCampo],
      csl: {
        type: cslBruto.type || 'article-journal',
        title: String(cslBruto.title || '').replace(/<[^>]+>/g, '').trim(),
        author: Array.isArray(cslBruto.author) ? cslBruto.author : [],
        issued: cslBruto.issued || (ano ? { 'date-parts': [[Number(ano)]] } : undefined),
        'container-title': cslBruto['container-title'] || undefined,
        publisher: cslBruto.publisher || undefined,
        volume: cslBruto.volume || undefined,
        issue: cslBruto.issue || undefined,
        page: cslBruto.page || undefined,
        DOI: doi || undefined,
        URL: cslBruto.URL || undefined,
      },
    });
  };

  // Zotero & Mendeley CSL_CITATION blocks
  const isZoteroXml = /ZOTERO_ITEM\s+CSL_CITATION/i.test(xmlStr);
  const blocos = extrairBlocosJsonCslDeString(xmlStr);
  for (const bloco of blocos) {
    const origem = bloco?.mendeley ? 'mendeley' : (isZoteroXml ? 'zotero' : 'csl_addin');
    if (origem === 'zotero') zoteroCount++;
    else mendeleyCount++;
    for (const item of bloco.citationItems || []) {
      if (item?.itemData) {
        adicionarItem(item.itemData, origem);
      }
    }
  }

  // EndNote blocks
  const endNoteItens = extrairCamposEndNoteDeXml(xmlStr);
  for (const en of endNoteItens) {
    adicionarItem(en.csl, 'endnote');
  }

  return {
    itens: [...mapaUnicos.values()],
    zoteroCount,
    mendeleyCount,
    endnoteCount: endNoteItens.length,
  };
}

/**
 * Lê um arquivo `.docx` e extrai todas as citações e referências (dinâmicas ou estáticas),
 * confrontando com a biblioteca local ativa.
 */
async function extrairReferenciasDeDocx(caminhoDocx, biblioteca = null) {
  if (!caminhoDocx || !fs.existsSync(caminhoDocx)) {
    throw new Error('Arquivo .docx não encontrado para extração de citações.');
  }
  const buffer = await fs.promises.readFile(caminhoDocx);
  const zip = await JSZip.loadAsync(buffer);

  const partesXml = ['word/document.xml', 'word/footnotes.xml', 'word/endnotes.xml'];
  let xmlCombinado = '';
  for (const p of partesXml) {
    const f = zip.file(p);
    if (f) xmlCombinado += '\n' + (await f.async('string'));
  }

  const extracaoCampos = extrairReferenciasDeXml(xmlCombinado);
  const bibIdsMap = extrairIdsNativosBibliografia(xmlCombinado);

  // Confronto com a biblioteca ativa
  const refsBib = biblioteca?.refs ? [...biblioteca.refs.values()] : [];
  const encontrarNaBiblioteca = (csl) => {
    const doi = limparDoi(csl?.DOI);
    if (doi) {
      const porDoi = refsBib.find((r) => limparDoi(r.csl?.DOI) === doi);
      if (porDoi) return porDoi;
    }
    const chTit = normalizarChaveMatch(csl?.title).slice(0, 36);
    if (chTit.length >= 10) {
      const porTit = refsBib.find((r) => normalizarChaveMatch(r.csl?.title).slice(0, 36) === chTit);
      if (porTit) return porTit;
    }
    const aut0 = normalizarChaveMatch(csl?.author?.[0]?.family || csl?.author?.[0]?.literal || '');
    const ano0 = String(csl?.issued?.['date-parts']?.[0]?.[0] || '');
    if (aut0.length >= 3 && ano0) {
      return refsBib.find((r) => {
        const ra = normalizarChaveMatch(r.csl?.author?.[0]?.family || r.csl?.author?.[0]?.literal || '');
        const ry = String(r.csl?.issued?.['date-parts']?.[0]?.[0] || '');
        return ra === aut0 && ry === ano0;
      }) || null;
    }
    return null;
  };

  const itensResultado = extracaoCampos.itens.map((it) => {
    const matchBib = encontrarNaBiblioteca(it.csl);
    return {
      ...it,
      naBiblioteca: Boolean(matchBib),
      refBibId: matchBib?.id || null,
      statusNaBiblioteca: matchBib?.status || null,
    };
  });

  // Inclui IDs nativos do próprio Bibliografia inseridos via Office.js / VBA
  for (const [id, qtd] of bibIdsMap.entries()) {
    const refBib = biblioteca?.refs?.get(id);
    if (!refBib) continue;
    const jaExiste = itensResultado.some((x) => x.refBibId === id);
    if (jaExiste) continue;
    itensResultado.push({
      chaveUnica: `bib:${id}`,
      ocorrencias: qtd,
      origens: ['bibliografia_field'],
      csl: refBib.csl,
      naBiblioteca: true,
      refBibId: id,
      statusNaBiblioteca: refBib.status,
    });
  }

  // Fallback para lista de Referências em texto estático se não havia campos XML (ou poucos comparados ao texto)
  let origemModo = 'campos_dinamicos';
  if (itensResultado.length === 0) {
    origemModo = 'texto_plano_referencias';
    try {
      const texto = auditor.extrairTextoDocx(caminhoDocx);
      const { paragrafosCorpo, linhasReferencias } = auditor.dividirCorpoEReferencias(texto);
      const refsFinais = auditor.analisarLinhasReferencias(linhasReferencias);
      const { citacoes } = auditor.extrairCitacoesDoCorpo(paragrafosCorpo, refsFinais);

      for (const rf of refsFinais) {
        const ocorrencias = citacoes.filter(
          (c) => c.chave === rf.chave || ((c.ano === rf.ano || c.anoBase === rf.anoBase) && c.chavesAutorAlias.some((al) => rf.chavesAutorAlias.includes(al)))
        ).length;
        const anoNum = /^\d{4}/.test(rf.anoBase || '') ? Number(rf.anoBase) : undefined;
        const cslEst = {
          type: rf.natureza === 'artigo_periodico' ? 'article-journal' : 'report',
          title: rf.tituloExtraido || rf.textoOriginal.slice(0, 120),
          author: rf.primeiroSobrenome ? [{ family: rf.primeiroSobrenome }] : [],
          issued: anoNum ? { 'date-parts': [[anoNum]] } : undefined,
          DOI: rf.doi || undefined,
        };
        const matchBib = encontrarNaBiblioteca(cslEst);
        itensResultado.push({
          chaveUnica: `texto:${rf.chave}`,
          ocorrencias: Math.max(1, ocorrencias),
          origens: ['texto_abnt_vancouver'],
          textoOriginal: rf.textoOriginal,
          csl: cslEst,
          naBiblioteca: Boolean(matchBib),
          refBibId: matchBib?.id || null,
          statusNaBiblioteca: matchBib?.status || null,
        });
      }
    } catch {
      /* mantém lista vazia se falhar leitura textual */
    }
  }

  return {
    caminhoDocx,
    origemModo,
    resumo: {
      zoteroCount: extracaoCampos.zoteroCount,
      mendeleyCount: extracaoCampos.mendeleyCount,
      endnoteCount: extracaoCampos.endnoteCount,
      bibliografiaCount: bibIdsMap.size,
      totalObrasUnicas: itensResultado.length,
      jaNaBiblioteca: itensResultado.filter((i) => i.naBiblioteca).length,
      novasParaImportar: itensResultado.filter((i) => !i.naBiblioteca).length,
    },
    itens: itensResultado,
  };
}

module.exports = {
  extrairReferenciasDeXml,
  extrairIdsNativosBibliografia,
  extrairReferenciasDeDocx,
};
