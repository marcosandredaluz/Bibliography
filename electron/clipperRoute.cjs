/**
 * electron/clipperRoute.cjs
 *
 * Receptor HTTP local-first para o Web Clipper Manifest V3 (POST /api/v1/clip).
 * Protegido por token local X-Bibliography-Local-Token (timingSafeEqual),
 * sanitização de HTML, deduplicação em 6 critérios e registro de provenance.
 */
'use strict';

const crypto = require('crypto');

function validarTokenLocal(req, tokenEsperado) {
  if (!tokenEsperado) return false;
  const recebido = String(req?.headers?.['x-bibliography-local-token'] || '').trim();
  const esperado = String(tokenEsperado || '').trim();
  const a = Buffer.from(recebido, 'utf8');
  const b = Buffer.from(esperado, 'utf8');
  if (a.length === 0 || a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function sanitizarHtmlBasico(html = '') {
  return String(html || '')
    .replace(/<script[\s\S]*?<\/script>/gi, '')
    .replace(/<iframe[\s\S]*?<\/iframe>/gi, '')
    .replace(/\son[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript\s*:/gi, 'blocked:')
    .slice(0, 2000000);
}

function normalizarTokenTexto(s = '') {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '');
}

function detectarDuplicataLocal(bib, { doi, pmid, pmcid, isbn, title, contentHash }) {
  if (!bib?.refs) return null;
  const titleNorm = normalizarTokenTexto(title);
  const isbnNorm = normalizarTokenTexto(isbn);

  for (const r of bib.refs.values()) {
    const c = r.csl || {};
    if (doi && c.DOI && c.DOI.toLowerCase() === String(doi).toLowerCase()) return r;
    if (pmid && c.PMID && String(c.PMID).trim() === String(pmid).trim()) return r;
    if (pmcid && c.PMCID && String(c.PMCID).trim().toUpperCase() === String(pmcid).trim().toUpperCase()) return r;
    if (isbnNorm && c.ISBN && normalizarTokenTexto(c.ISBN) === isbnNorm) return r;
    if (contentHash && r.provenance?.snapshot_sha256 === contentHash) return r;
    if (titleNorm.length >= 12 && normalizarTokenTexto(c.title) === titleNorm) return r;
  }
  return null;
}

async function processarRequisicaoClip(payload, { bib, metadata, aoAtualizarBiblioteca }) {
  if (!bib) throw new Error('Nenhuma biblioteca aberta.');
  if (!payload || !payload.source_url || !payload.title) {
    throw new Error('Campos obrigatórios ausentes: source_url e title.');
  }

  const doiLimpo = metadata.normalizarDoi(payload.doi || payload.source_url || '');
  const htmlSanitizado = payload.html ? sanitizarHtmlBasico(payload.html) : null;
  const contentHash =
    payload.snapshot?.content_ref ||
    (htmlSanitizado
      ? `sha256:${crypto.createHash('sha256').update(htmlSanitizado, 'utf8').digest('hex')}`
      : null);

  const existente = detectarDuplicataLocal(bib, {
    doi: doiLimpo,
    pmid: payload.pmid,
    pmcid: payload.pmcid,
    isbn: payload.isbn,
    title: payload.title,
    contentHash,
  });

  if (existente) {
    return {
      reference_id: existente.id,
      dedupe_status: 'duplicate_skipped',
      warnings: ['Obra já presente na biblioteca; registro duplicado ignorado sem chamadas externas.'],
      created_files: [],
    };
  }

  const nowDate = new Date();
  const csl = metadata.limparCsl({
    type: payload.detected_type || 'article-journal',
    title: payload.title,
    DOI: doiLimpo || undefined,
    PMID: payload.pmid || undefined,
    PMCID: payload.pmcid || undefined,
    ISBN: payload.isbn || undefined,
    URL: payload.source_url,
    'container-title': payload.container_title || undefined,
    issued: payload.issued_year ? { 'date-parts': [[Number(payload.issued_year)]] } : undefined,
    accessed: { 'date-parts': [[nowDate.getFullYear(), nowDate.getMonth() + 1, nowDate.getDate()]] },
    author: Array.isArray(payload.authors) ? payload.authors : undefined,
  });

  const warnings = [];
  if (!doiLimpo && !payload.pmid && !payload.isbn) {
    warnings.push('Captura sem DOI/PMID/ISBN; recomenda-se conferir metadados na aba Metadados.');
  }

  const salva = await bib.adicionar({
    csl,
    status: 'a_ler',
    tags: Array.isArray(payload.tags) && payload.tags.length ? payload.tags : ['web-clipper'],
    provenance: {
      source_url: payload.source_url,
      pdf_url: payload.pdf_url || null,
      snapshot_format: payload.snapshot?.format || null,
      snapshot_sha256: contentHash,
      captured_at: payload.captured_at || nowDate.toISOString(),
      extension_version: payload.extension_version || '1.0.0',
    },
  });

  aoAtualizarBiblioteca?.();
  return {
    reference_id: salva.id,
    dedupe_status: 'created',
    warnings,
    created_files: [`referencias/${salva.id}.json`],
  };
}

module.exports = {
  validarTokenLocal,
  sanitizarHtmlBasico,
  detectarDuplicataLocal,
  processarRequisicaoClip,
};
