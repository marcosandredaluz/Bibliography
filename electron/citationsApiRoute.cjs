/**
 * electron/citationsApiRoute.cjs
 *
 * Contratos HTTP locais para filtros Pandoc / Quarto (panflute BSD-3-Clause):
 * - POST /api/v1/citations/resolve
 * - POST /api/v1/citations/bibliography
 * - Validador estrito de versão do Quarto CLI (>= 1.4.0 MIT; < 1.4 rejeitado por GPL-2.0)
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { cslParaBibtexEntry } = require('./bibtexSync.cjs');

function normalizarChaveCitacao(k = '') {
  return String(k || '').trim().replace(/^@/, '');
}

function localizarReferenciasPorChaves(bib, chaves = []) {
  const todasRefs = [...(bib?.refs?.values() || [])];
  const resolved = {};
  const missing_keys = [];
  const duplicate_keys = [];

  for (const rawKey of chaves) {
    const key = normalizarChaveCitacao(rawKey);
    if (!key) continue;

    // 1. Match exato por ref.id (chave canônica do library.bib)
    const matchId = bib.refs.get(key);
    if (matchId) {
      resolved[key] = matchId;
      continue;
    }

    // 2. Match secundário por DOI exato ou alias normalizado (detectando ambiguidade/duplicidade)
    const keyLower = key.toLowerCase();
    const candidatos = todasRefs.filter(
      (r) =>
        r.id?.toLowerCase() === keyLower ||
        (r.csl?.DOI && r.csl.DOI.toLowerCase() === keyLower)
    );

    if (candidatos.length === 0) {
      missing_keys.push(key);
    } else if (candidatos.length > 1) {
      duplicate_keys.push(key);
    } else {
      resolved[key] = candidatos[0];
    }
  }

  return { resolved, missing_keys, duplicate_keys };
}

function resolverChavesPandoc({ keys = [], page = '', estiloId, idioma, bib, citacoes }) {
  if (!bib) {
    return { statusCode: 400, body: { erro: 'Nenhuma biblioteca aberta.' } };
  }
  const listaKeys = Array.isArray(keys) ? keys.map(normalizarChaveCitacao).filter(Boolean) : [];
  if (!listaKeys.length) {
    return { statusCode: 400, body: { erro: 'Lista de chaves (@chave) vazia.' } };
  }

  const { resolved, missing_keys, duplicate_keys } = localizarReferenciasPorChaves(bib, listaKeys);
  if (missing_keys.length > 0) {
    return {
      statusCode: 404,
      body: {
        erro: `Chave(s) inexistente(s) na biblioteca: ${missing_keys.join(', ')}`,
        missing_keys,
        duplicate_keys,
      },
    };
  }
  if (duplicate_keys.length > 0) {
    return {
      statusCode: 409,
      body: {
        erro: `Ambiguidade detectada para chave(s) duplicada(s): ${duplicate_keys.join(', ')}`,
        missing_keys,
        duplicate_keys,
      },
    };
  }

  const out = {};
  for (const key of Object.keys(resolved)) {
    const ref = resolved[key];
    let formattedCitation = '';
    if (citacoes && typeof citacoes.formatar === 'function') {
      try {
        const f = citacoes.formatar({
          itens: [ref.csl],
          estiloId: estiloId || 'associacao-brasileira-de-normas-tecnicas',
          idioma: idioma || 'pt-BR',
          raizBiblioteca: bib.raiz,
        });
        formattedCitation = f.citacaoTexto || '';
        if (page) {
          formattedCitation = formattedCitation.replace(/\)\s*$/, `, p. ${String(page).replace(/^p\.?\s*/i, '')})`);
        }
      } catch {}
    }

    out[key] = {
      id: ref.id,
      csl: ref.csl,
      bibtex: cslParaBibtexEntry(ref),
      formatted_citation: formattedCitation,
    };
  }

  return {
    statusCode: 200,
    body: {
      ok: true,
      resolved: out,
      missing_keys: [],
      duplicate_keys: [],
    },
  };
}

function construirBibliografiaPandoc({ keys = [], style, idioma, bib, citacoes, outBibDir = null }) {
  if (!bib) {
    return { statusCode: 400, body: { erro: 'Nenhuma biblioteca aberta.' } };
  }
  const listaKeys = Array.isArray(keys) ? [...new Set(keys.map(normalizarChaveCitacao).filter(Boolean))] : [];
  if (!listaKeys.length) {
    return { statusCode: 400, body: { erro: 'Nenhuma chave citada informada para gerar bibliografia.' } };
  }

  const { resolved, missing_keys, duplicate_keys } = localizarReferenciasPorChaves(bib, listaKeys);
  if (missing_keys.length > 0) {
    return {
      statusCode: 404,
      body: {
        erro: `Chave(s) inexistente(s) para bibliografia: ${missing_keys.join(', ')}`,
        missing_keys,
        duplicate_keys,
      },
    };
  }
  if (duplicate_keys.length > 0) {
    return {
      statusCode: 409,
      body: {
        erro: `Ambiguidade detectada para chave(s) na bibliografia: ${duplicate_keys.join(', ')}`,
        missing_keys,
        duplicate_keys,
      },
    };
  }

  const refsCitadas = Object.values(resolved);
  const bibtexContent = refsCitadas.map(cslParaBibtexEntry).join('\n\n') + '\n';
  const cslItems = refsCitadas.map((r) => r.csl);

  let entries = [];
  if (citacoes && typeof citacoes.formatar === 'function') {
    try {
      const f = citacoes.formatar({
        itens: cslItems,
        estiloId: style || 'associacao-brasileira-de-normas-tecnicas',
        idioma: idioma || 'pt-BR',
        raizBiblioteca: bib.raiz,
      });
      entries = f.entradas || [];
    } catch {}
  }

  let bibFilePath = null;
  const pastaDestino = outBibDir || (bib.raiz ? path.join(bib.raiz, 'documentos') : null);
  if (pastaDestino && fs.existsSync(bib.raiz || pastaDestino)) {
    fs.mkdirSync(pastaDestino, { recursive: true });
    bibFilePath = path.join(pastaDestino, 'cited-only.bib');
    fs.writeFileSync(bibFilePath, bibtexContent, 'utf8');
  }

  return {
    statusCode: 200,
    body: {
      ok: true,
      total_cited: refsCitadas.length,
      csl_json: cslItems,
      bibtex: bibtexContent,
      entries,
      bib_file_path: bibFilePath,
    },
  };
}

/**
 * Quarto CLI mudou para licença MIT apenas a partir da v1.4.0 (<= 1.3.x era GPL-2.0).
 * Rejeita explicitamente qualquer versão anterior a 1.4.0.
 */
function verificarQuartoCliCompatibilidade(versaoTexto = '') {
  const m = String(versaoTexto || '').trim().match(/(\d+)\.(\d+)(?:\.(\d+))?/);
  if (!m) {
    return { compativel: false, versao: null, erro: 'Versão do Quarto CLI não identificada.' };
  }
  const major = Number(m[1]);
  const minor = Number(m[2]);
  const patch = Number(m[3] || 0);
  const compativel = major > 1 || (major === 1 && minor >= 4);
  return {
    compativel,
    versao: `${major}.${minor}.${patch}`,
    licenca: compativel ? 'MIT' : 'GPL-2.0 (Bloqueada)',
    erro: compativel ? null : `Quarto ${major}.${minor}.${patch} usa licença GPL-2.0. Exigido Quarto >= 1.4.0 (MIT).`,
  };
}

module.exports = {
  resolverChavesPandoc,
  construirBibliografiaPandoc,
  verificarQuartoCliCompatibilidade,
};
