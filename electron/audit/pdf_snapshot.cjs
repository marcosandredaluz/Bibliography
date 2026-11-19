/**
 * electron/audit/pdf_snapshot.cjs
 * Extração de texto integral de PDFs em ciclo único (Python bridge + PDF.js), snapshot Read-Only,
 * matching de grifos Ground Truth e busca em acervo local.
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { extrairLayoutPdfComBackend } = require('../pythonBridge.cjs');

function normalizarChave(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

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

let pdfjsNodePromise = null;
async function extrairTextoPdfNoNode(caminhoOuBytes, maxChars = 150000) {
  try {
    if (typeof caminhoOuBytes === 'string' && fs.existsSync(caminhoOuBytes)) {
      const pyLayout = await extrairLayoutPdfComBackend(caminhoOuBytes);
      if (pyLayout?.sucesso && pyLayout?.texto_completo) {
        const tabelasTxt = (pyLayout.tabelas || [])
          .map((t) => String(t?.conteudo || '').trim())
          .filter(Boolean)
          .join('\n\n');
        const unido = [pyLayout.texto_completo, tabelasTxt].filter(Boolean).join('\n\n');
        if (unido.trim().length > 40) return unido.slice(0, maxChars);
      }
    }
    const buf = Buffer.isBuffer(caminhoOuBytes)
      ? caminhoOuBytes
      : typeof caminhoOuBytes === 'string' && fs.existsSync(caminhoOuBytes)
      ? await fs.promises.readFile(caminhoOuBytes)
      : null;
    if (!buf || !buf.length) return '';
    if (!pdfjsNodePromise) {
      pdfjsNodePromise = import('pdfjs-dist/legacy/build/pdf.mjs').catch(() => null);
    }
    const pdfjs = await pdfjsNodePromise;
    if (!pdfjs || typeof pdfjs.getDocument !== 'function') return '';
    const tarefa = pdfjs.getDocument({
      data: new Uint8Array(buf),
      isEvalSupported: false,
      verbosity: 0,
    });
    const doc = await tarefa.promise;
    try {
      const partes = [];
      let acumulado = 0;
      for (let i = 1; i <= doc.numPages && acumulado < maxChars; i++) {
        const pag = await doc.getPage(i);
        const txt = await pag.getTextContent();
        const pagStr = (txt.items || [])
          .map((it) => String(it.str || '') + (it.hasEOL ? '\n' : ' '))
          .join('')
          .replace(/[ \t]+/g, ' ')
          .trim();
        if (pagStr) {
          partes.push(pagStr);
          acumulado += pagStr.length + 2;
        }
      }
      return partes.join('\n\n').slice(0, maxChars);
    } finally {
      try {
        if (typeof doc.destroy === 'function') await doc.destroy();
      } catch {}
    }
  } catch {
    return '';
  }
}

function criarBibliotecaSnapshotSomenteLeitura(bibOriginal) {
  const refsClone = new Map(
    [...(bibOriginal?.refs?.entries?.() || [])].map(([id, r]) => [id, JSON.parse(JSON.stringify(r))])
  );
  const grifosMem = new Map();
  let seq = 1;
  return {
    raiz: bibOriginal?.raiz || '',
    refs: refsClone,
    p: (...partes) => (typeof bibOriginal?.p === 'function' ? bibOriginal.p(...partes) : ''),
    caminhoPdf: (id) => {
      const r = refsClone.get(id);
      if (r?._caminhoPdfTemp && fs.existsSync(r._caminhoPdfTemp)) return r._caminhoPdfTemp;
      if (r?.pdf && typeof bibOriginal?.p === 'function') {
        const cand = bibOriginal.p('pdfs', r.pdf);
        if (fs.existsSync(cand)) return cand;
      }
      return null;
    },
    porDoi: (doi) => {
      if (!doi) return null;
      const d = String(doi).toLowerCase();
      for (const r of refsClone.values()) {
        if (String(r.csl?.DOI || '').toLowerCase() === d) return r;
      }
      return null;
    },
    async criar(dados = {}) {
      const id = `snap-${seq++}`;
      const csl = { type: 'article-journal', title: '', ...(dados.csl || {}), id };
      const ref = { status: 'a_ler', tags: [], colecoes: [], notas: '', pdf: null, ...dados, id, csl };
      refsClone.set(id, ref);
      return ref;
    },
    async atualizar(id, patch = {}) {
      const atual = refsClone.get(id);
      if (!atual) throw new Error('Referência não encontrada no snapshot');
      const prox = { ...atual, ...patch, id, csl: { ...(patch.csl || atual.csl || {}), id } };
      refsClone.set(id, prox);
      return prox;
    },
    async anexarPdf(id, origem) {
      const textoPdf = await extrairTextoPdfNoNode(origem);
      return this.atualizar(id, {
        pdf: path.basename(String(origem || `${id}.pdf`)),
        _caminhoPdfTemp: String(origem || ''),
        textoExtraido: textoPdf || undefined,
      });
    },
    async lerGrifos(id) {
      if (grifosMem.has(id)) return [...grifosMem.get(id)];
      if (typeof bibOriginal?.lerGrifos === 'function') {
        try {
          return await bibOriginal.lerGrifos(id);
        } catch {}
      }
      return [];
    },
    async salvarGrifos(id, grifos) {
      grifosMem.set(id, [...(grifos || [])]);
      return grifosMem.get(id);
    },
  };
}

function verificarMatchComGrifoUsuario(oc, grifosGroundTruth = []) {
  if (!grifosGroundTruth?.length) return null;
  const alvoQuote = normalizarChave(oc?.trechoDireto || '');
  const tokensFrase = new Set(
    String(oc?.fraseContextoSemantico || oc?.fraseContexto || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4)
  );

  for (const g of grifosGroundTruth) {
    const gTrecho = String(g?.trecho || '');
    if (gTrecho.length < 15) continue;
    const gNorm = normalizarChave(gTrecho);
    if (alvoQuote.length >= 16 && (gNorm.includes(alvoQuote) || alvoQuote.includes(gNorm))) {
      return g;
    }
    if (g.fraseWord && normalizarChave(g.fraseWord) === normalizarChave(oc?.fraseContexto || '')) {
      return g;
    }
    const gTokens = gTrecho
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((w) => w.length >= 4);
    if (tokensFrase.size >= 4 && gTokens.length >= 4) {
      let comuns = 0;
      const setG = new Set(gTokens);
      for (const t of tokensFrase) if (setG.has(t)) comuns++;
      const taxa = comuns / Math.min(tokensFrase.size, setG.size);
      const mesmaPag = oc?.paginaDeclarada && g?.pagina && String(oc.paginaDeclarada) === String(g.pagina);
      if (taxa >= 0.45 || (mesmaPag && taxa >= 0.30)) return g;
    }
  }
  return null;
}

module.exports = {
  localizarPdfNoAcervoLocal,
  extrairTextoPdfNoNode,
  criarBibliotecaSnapshotSomenteLeitura,
  verificarMatchComGrifoUsuario,
};
