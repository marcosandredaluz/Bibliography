// Servidor local (http://127.0.0.1:23119) para comunicação com o Suplemento do Word
// e sincronização em tempo real do status "Citada" vs "Consultada".
const http = require('http');
const fs = require('fs');
const path = require('path');
const citacoes = require('./citations.cjs');
const auditor = require('./auditor.cjs');

const PORTA = 23119;
const DIR_ADDIN = path.join(__dirname, '..', 'resources', 'word-addin');

const telemetriaWord = {
  iniciadoEm: new Date().toISOString(),
  ultimaAtividadeEm: null,
  ultimoCliente: null,
  requisicoesAtendidas: 0,
  ultimaAuditoriaWord: null,
};

let seletorPendenteResolver = null;

function resolverSeletorPendente(resultado) {
  if (typeof seletorPendenteResolver === 'function') {
    const fn = seletorPendenteResolver;
    seletorPendenteResolver = null;
    fn(resultado);
    return true;
  }
  return false;
}

function gerarCodigoCampoBibliografia(ids = [], pagina = '') {
  const cleanIds = [...new Set((ids || []).filter(Boolean))];
  const p = String(pagina || '').trim();
  return `BIBLIOGRAFIA_ITEM id=${cleanIds.join(',')}${p ? `|p=${p}` : ''}`;
}

function parsearCodigoCampoBibliografia(codigo = '') {
  const s = String(codigo || '').trim();
  const mId = s.match(/BIBLIOGRAFIA_ITEM\s+id=([^\s|]+)/i);
  if (mId) {
    const ids = mId[1].split(',').map((x) => x.trim()).filter(Boolean);
    const mPag = s.match(/\|p=([^\s"]+)/i);
    return { ids, pagina: mPag ? mPag[1].trim() : '' };
  }
  const mJson = s.match(/BIBLIOGRAFIA_ITEM\s+(\{[\s\S]*\})/);
  if (mJson) {
    try {
      const obj = JSON.parse(mJson[1]);
      return { ids: Array.isArray(obj.ids) ? obj.ids : [], pagina: obj.pagina || '' };
    } catch {}
  }
  return { ids: [], pagina: '' };
}

function limparHtmlParaTexto(html = '') {
  return String(html || '')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|li)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

function normalizarBusca(s = '') {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function resumoAutorAno(csl) {
  const a = csl?.author?.[0] || csl?.editor?.[0];
  const nome = a?.family || a?.literal || 'Anônimo';
  const ano = csl?.issued?.['date-parts']?.[0]?.[0] || 's.d.';
  return `${nome}, ${ano}`;
}

function formatarEntradasParaWord(entradas) {
  return (entradas || [])
    .map((e) =>
      e
        .replace(/^\s*<div class="csl-entry">/, '<p style="margin:0 0 12pt 0;text-align:left">')
        .replace(/<\/div>\s*$/, '</p>')
        .replace(/<div class="csl-left-margin">(.*?)<\/div><div class="csl-right-inline">(.*?)<\/div>/g, '$1 $2')
    )
    .join('');
}

function escaparHtml(str = '') {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function ehHostLocalPermitido(host = '') {
  return /^(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/i.test(String(host || '').trim());
}

function ehOrigemLocalPermitida(origin = '') {
  const o = String(origin || '').trim();
  if (!o) return true; // Clientes nativos sem cabeçalho Origin (ex.: Word VBA COM, desktop local)
  return /^https?:\/\/(?:127\.0\.0\.1|localhost)(?::\d{1,5})?$/i.test(o);
}

const MAX_BODY_BYTES = 15 * 1024 * 1024; // Limite de 15 MB por requisição local

function iniciarServidorWord({ obterBiblioteca, obterConfig, aoAtualizarBiblioteca, aoSolicitarSeletorCitacao, porta = PORTA }) {
  const srv = http.createServer(async (req, res) => {
    const hostHeader = req.headers.host;
    if (hostHeader && !ehHostLocalPermitido(hostHeader)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'X-Content-Type-Options': 'nosniff' });
      return res.end(JSON.stringify({ erro: 'Host não autorizado' }));
    }

    const originHeader = req.headers.origin;
    if (originHeader && !ehOrigemLocalPermitida(originHeader)) {
      res.writeHead(403, { 'Content-Type': 'application/json; charset=utf-8', 'Vary': 'Origin', 'X-Content-Type-Options': 'nosniff' });
      return res.end(JSON.stringify({ erro: 'Origem CORS não autorizada' }));
    }

    if (originHeader) {
      res.setHeader('Access-Control-Allow-Origin', originHeader);
    }
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://127.0.0.1:${PORTA}`);
    telemetriaWord.ultimaAtividadeEm = new Date().toISOString();
    telemetriaWord.ultimoCliente = req.headers['user-agent'] || 'word-client';
    telemetriaWord.requisicoesAtendidas += 1;

    const enviarJson = (codigo, obj) => {
      res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
    };
    const enviarTexto = (codigo, txt) => {
      res.writeHead(codigo, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(String(txt || ''));
    };

    try {
      if (url.pathname === '/word-addin/' || url.pathname === '/word-addin/index.html') {
        const html = fs.readFileSync(path.join(DIR_ADDIN, 'index.html'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(html);
      }
      if (url.pathname === '/word-addin/manifest.xml') {
        const xml = fs.readFileSync(path.join(DIR_ADDIN, 'manifest.xml'), 'utf8');
        res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
        return res.end(xml);
      }

      const bib = obterBiblioteca();
      const cfg = obterConfig();

      if (url.pathname === '/api/word/ping') {
        return enviarJson(200, {
          ok: true,
          engine: 'Bibliografia Word Integration Engine',
          version: '2.0.0',
          status: 'online',
          port: PORTA,
          bibliotecaAtiva: Boolean(bib),
          estiloAtivo: cfg?.estilo || 'abnt',
          totalObras: bib ? bib.refs.size : 0,
          suporte_formatos: ['campos_word_zotero', 'bookmarks_mendeley', 'content_control_officejs'],
        });
      }

      if (url.pathname === '/api/status') {
        if (!bib) return enviarJson(200, { ativo: false, estilos: [], refs: [], telemetria: telemetriaWord });
        const estilos = citacoes.listarEstilos(bib.raiz).map(({ id, nome }) => ({ id, nome }));
        const refs = [...bib.refs.values()].map((r) => ({
          id: r.id,
          titulo: String(r.csl?.title || '(Sem título)').replace(/<[^>]+>/g, ''),
          autorAno: resumoAutorAno(r.csl),
          status: r.status,
          busca: `${r.csl?.title || ''} ${resumoAutorAno(r.csl)} ${(r.tags || []).join(' ')}`.toLowerCase(),
        }));
        return enviarJson(200, { ativo: true, estiloAtivo: cfg.estilo, estilos, refs, telemetria: telemetriaWord });
      }

      if (url.pathname === '/api/word/gerar-bibliografia' && req.method === 'GET') {
        if (!bib) throw new Error('Nenhuma biblioteca ativa no Bibliografia.');
        const idsCitadas = [...bib.refs.values()].filter((r) => r.status === 'citada').map((r) => r.id);
        const itens = idsCitadas.map((id) => bib.refs.get(id)?.csl).filter(Boolean);
        if (!itens.length) return enviarTexto(200, '');
        const f = citacoes.formatar({
          itens,
          estiloId: cfg.estilo,
          idioma: cfg.idioma,
          raizBiblioteca: bib.raiz,
        });
        const textoLinhas = (f.entradas || []).map((h) => limparHtmlParaTexto(h)).filter(Boolean).join('\r\n\r\n');
        return enviarTexto(200, textoLinhas);
      }

      // Lê corpo JSON de requisições POST com limite de tamanho
      const lerCorpo = () =>
        new Promise((resolve, reject) => {
          let dados = '';
          let bytes = 0;
          req.on('data', (c) => {
            bytes += Buffer.byteLength(c);
            if (bytes > MAX_BODY_BYTES) {
              req.destroy();
              return reject(new Error('Corpo da requisição excede o limite máximo permitido.'));
            }
            dados += c;
          });
          req.on('end', () => {
            try {
              resolve(dados ? JSON.parse(dados) : {});
            } catch (e) {
              reject(e);
            }
          });
          req.on('error', reject);
        });

      if (url.pathname === '/api/citar' && req.method === 'POST') {
        if (!bib) throw new Error('Nenhuma biblioteca aberta.');
        const { ids = [], estilo, pagina } = await lerCorpo();
        const itens = ids.map((id) => bib.refs.get(id)?.csl).filter(Boolean);
        const f = citacoes.formatar({
          itens,
          estiloId: estilo || cfg.estilo,
          idioma: cfg.idioma,
          raizBiblioteca: bib.raiz,
        });
        let citacaoTexto = f.citacaoTexto;
        let citacaoHtml = f.citacao;
        if (pagina) {
          citacaoTexto = citacaoTexto.replace(/\)\s*$/, `, ${pagina})`);
          citacaoHtml = citacaoHtml.replace(/\)\s*(<\/[^>]+>)?\s*$/, `, ${pagina})$1`);
        }
        // Marca automaticamente como "citada" e atualiza a janela principal
        for (const id of ids) {
          if (bib.refs.has(id)) await bib.atualizar(id, { status: 'citada' });
        }
        aoAtualizarBiblioteca?.();
        return enviarJson(200, { citacaoTexto, citacaoHtml });
      }

      if (url.pathname === '/api/sincronizar-word' && req.method === 'POST') {
        if (!bib) throw new Error('Nenhuma biblioteca aberta.');
        const { docId, titulo, estilo, citadasIds = [], incluirConsultadas = false } = await lerCorpo();
        // Se o documento não tinha contentControls ainda, usa as referências já marcadas como 'citada'
        const idsCitadas =
          citadasIds.length > 0
            ? [...new Set(citadasIds)]
            : [...bib.refs.values()].filter((r) => r.status === 'citada').map((r) => r.id);

        await bib.sincronizarDocumentoWord({
          docId: docId || 'documento-word',
          titulo: titulo || 'Documento Word',
          estilo: estilo || cfg.estilo,
          citadasIds: idsCitadas,
        });
        aoAtualizarBiblioteca?.();

        const itensCitados = idsCitadas.map((id) => bib.refs.get(id)?.csl).filter(Boolean);
        const fCit = citacoes.formatar({
          itens: itensCitados,
          estiloId: estilo || cfg.estilo,
          idioma: cfg.idioma,
          raizBiblioteca: bib.raiz,
        });

        let htmlCompleto = `<h2>REFERÊNCIAS</h2>${formatarEntradasParaWord(fCit.entradas)}`;

        if (incluirConsultadas) {
          const itensCons = [...bib.refs.values()]
            .filter((r) => r.status === 'consultada' && !idsCitadas.includes(r.id))
            .map((r) => r.csl)
            .filter(Boolean);
          if (itensCons.length) {
            const fCons = citacoes.formatar({
              itens: itensCons,
              estiloId: estilo || cfg.estilo,
              idioma: cfg.idioma,
              raizBiblioteca: bib.raiz,
            });
            htmlCompleto += `<h2>BIBLIOGRAFIA CONSULTADA</h2>${formatarEntradasParaWord(fCons.entradas)}`;
          }
        }

        return enviarJson(200, {
          totalCitadas: itensCitados.length,
          htmlCompleto,
        });
      }

      if (url.pathname === '/api/campos-atualizar' && req.method === 'POST') {
        if (!bib) throw new Error('Nenhuma biblioteca aberta.');
        const { grupos = [], estilo } = await lerCorpo();
        const estiloAlvo = estilo || cfg.estilo;
        const citacoesAtualizadas = {};
        const todosIds = new Set();

        for (const grupo of grupos) {
          const idsGrupo = (grupo.ids || []).filter((id) => bib.refs.has(id));
          if (!idsGrupo.length) continue;
          idsGrupo.forEach((id) => todosIds.add(id));
          const itens = idsGrupo.map((id) => bib.refs.get(id).csl);
          const f = citacoes.formatar({
            itens,
            estiloId: estiloAlvo,
            idioma: cfg.idioma,
            raizBiblioteca: bib.raiz,
          });
          let citacaoTexto = f.citacaoTexto;
          let citacaoHtml = f.citacao;
          if (grupo.pagina) {
            citacaoTexto = citacaoTexto.replace(/\)\s*$/, `, ${grupo.pagina})`);
            citacaoHtml = citacaoHtml.replace(/\)\s*(<\/[^>]+>)?\s*$/, `, ${grupo.pagina})$1`);
          }
          citacoesAtualizadas[grupo.chave || idsGrupo.join(',')] = { citacaoTexto, citacaoHtml };
        }

        const itensCit = [...todosIds].map((id) => bib.refs.get(id)?.csl).filter(Boolean);
        const fBib = itensCit.length
          ? citacoes.formatar({ itens: itensCit, estiloId: estiloAlvo, idioma: cfg.idioma, raizBiblioteca: bib.raiz })
          : { entradas: [] };
        return enviarJson(200, {
          estilo: estiloAlvo,
          citacoesAtualizadas,
          htmlCompleto: `<h2>REFERÊNCIAS</h2>${formatarEntradasParaWord(fBib.entradas)}`,
          totalAtualizadas: Object.keys(citacoesAtualizadas).length,
        });
      }

      if (url.pathname === '/api/word/seletor-citacao' && req.method === 'POST') {
        if (!bib) throw new Error('Nenhuma biblioteca aberta.');
        const { termo = '', pagina = '' } = await lerCorpo();
        const q = normalizarBusca(termo).trim();
        const todas = [...bib.refs.values()].filter((r) => r.status !== 'descartada');
        const escolhida = q
          ? todas.find((r) =>
              normalizarBusca(`${r.csl?.title || ''} ${resumoAutorAno(r.csl)} ${(r.tags || []).join(' ')}`).includes(q)
            ) || todas[0]
          : todas.find((r) => r.status === 'citada') || todas[0];
        if (!escolhida) return enviarTexto(404, '');

        const f = citacoes.formatar({
          itens: [escolhida.csl],
          estiloId: cfg.estilo,
          idioma: cfg.idioma,
          raizBiblioteca: bib.raiz,
        });
        let citTxt = f.citacaoTexto;
        if (pagina) {
          citTxt = citTxt.replace(/\)\s*$/, `, p. ${String(pagina).replace(/^p\.?\s*/i, '')})`);
        }
        await bib.atualizar(escolhida.id, { status: 'citada' });
        aoAtualizarBiblioteca?.();
        return enviarTexto(200, citTxt);
      }

      if (url.pathname === '/api/word/seletor-citacao-interativo' && req.method === 'POST') {
        if (!bib) throw new Error('Nenhuma biblioteca aberta.');
        const { termo = '', modo = 'campos' } = await lerCorpo();
        if (typeof aoSolicitarSeletorCitacao === 'function') {
          if (seletorPendenteResolver) {
            seletorPendenteResolver({ cancelado: true });
          }
          const escolha = await new Promise((resolve) => {
            const timer = setTimeout(() => {
              if (seletorPendenteResolver === resolve) seletorPendenteResolver = null;
              resolve({ cancelado: true });
            }, 90000);
            seletorPendenteResolver = (resEscolha) => {
              clearTimeout(timer);
              resolve(resEscolha || { cancelado: true });
            };
            aoSolicitarSeletorCitacao({ termo, modo });
          });

          if (escolha?.cancelado || !escolha?.ids?.length) {
            res.writeHead(204);
            return res.end();
          }
          const itens = escolha.ids.map((id) => bib.refs.get(id)?.csl).filter(Boolean);
          if (!itens.length) {
            res.writeHead(204);
            return res.end();
          }
          const f = citacoes.formatar({
            itens,
            estiloId: escolha.estilo || cfg.estilo,
            idioma: cfg.idioma,
            raizBiblioteca: bib.raiz,
          });
          let citacaoTexto = f.citacaoTexto;
          const pagStr = String(escolha.pagina || '').trim().replace(/^p\.?\s*/i, '');
          if (pagStr) {
            citacaoTexto = citacaoTexto.replace(/\)\s*$/, `, p. ${pagStr})`);
          }
          for (const id of escolha.ids) {
            if (bib.refs.has(id)) await bib.atualizar(id, { status: 'citada' });
          }
          aoAtualizarBiblioteca?.();
          return enviarJson(200, {
            ok: true,
            citacaoTexto,
            codigoCampo: gerarCodigoCampoBibliografia(escolha.ids, pagStr),
            ids: escolha.ids,
            pagina: pagStr,
          });
        }

        // Fallback automático caso não haja UI interativa acoplada
        const fallback = [...bib.refs.values()].filter((r) => r.status !== 'descartada')[0];
        if (!fallback) {
          res.writeHead(204);
          return res.end();
        }
        const f = citacoes.formatar({ itens: [fallback.csl], estiloId: cfg.estilo, idioma: cfg.idioma, raizBiblioteca: bib.raiz });
        return enviarJson(200, {
          ok: true,
          citacaoTexto: f.citacaoTexto,
          codigoCampo: gerarCodigoCampoBibliografia([fallback.id], ''),
          ids: [fallback.id],
          pagina: '',
        });
      }

      if (url.pathname === '/api/word/atualizar-lote-campos' && req.method === 'POST') {
        if (!bib) throw new Error('Nenhuma biblioteca aberta.');
        const { campos = [], estilo } = await lerCorpo();
        const estiloAlvo = estilo || cfg.estilo;
        const atualizados = [];
        for (const cp of campos) {
          const parsed = parsearCodigoCampoBibliografia(cp.codigo || '');
          const idsValidos = parsed.ids.filter((id) => bib.refs.has(id));
          if (!idsValidos.length) continue;
          const itens = idsValidos.map((id) => bib.refs.get(id).csl);
          const f = citacoes.formatar({
            itens,
            estiloId: estiloAlvo,
            idioma: cfg.idioma,
            raizBiblioteca: bib.raiz,
          });
          let citacaoTexto = f.citacaoTexto;
          if (parsed.pagina) {
            citacaoTexto = citacaoTexto.replace(/\)\s*$/, `, p. ${String(parsed.pagina).replace(/^p\.?\s*/i, '')})`);
          }
          for (const id of idsValidos) {
            await bib.atualizar(id, { status: 'citada' });
          }
          atualizados.push({ idx: cp.idx, citacaoTexto });
        }
        aoAtualizarBiblioteca?.();
        return enviarJson(200, { ok: true, estilo: estiloAlvo, atualizados });
      }

      if (url.pathname === '/api/word/auditar' && req.method === 'POST') {
        if (!bib) throw new Error('Nenhuma biblioteca aberta.');
        const { texto = '', modulo = 'todos' } = await lerCorpo();
        const resAudit = await auditor.auditarManuscrito({
          texto,
          biblioteca: bib,
          buscarEBaixar: false,
          modulo,
        });
        const alertas = [];
        for (const rm of resAudit.refsMapeadas || []) {
          if (['ia_doi_inexistente', 'ia_doi_trocado', 'suspeita_ia_fantasma'].includes(rm.statusAutenticidade)) {
            const occ = rm.ocorrenciasNoTexto?.[0];
            alertas.push({
              tipo: rm.statusAutenticidade,
              paragrafo: occ?.numParagrafo || 0,
              trecho: occ?.fraseContexto?.slice(0, 75) || rm.textoOriginal?.slice(0, 75) || '',
              mensagem: rm.alertaAutenticidade || 'Fonte não confirmada nas bases.',
              gravidade: 'critica',
            });
          }
        }
        for (const cOrfa of resAudit.citacoesSemReferencia || []) {
          const occ = cOrfa.ocorrencias?.[0];
          alertas.push({
            tipo: 'citacao_orfa',
            paragrafo: occ?.numParagrafo || 0,
            trecho: occ?.fraseContexto?.slice(0, 75) || `${cOrfa.autor} (${cOrfa.ano})`,
            mensagem: `Citação (${cOrfa.autor}, ${cOrfa.ano}) ausente na lista final de Referências.`,
            gravidade: 'media',
          });
        }
        for (const aEst of resAudit.alertasEstiloIa || []) {
          alertas.push({
            tipo: 'estilo_ia',
            paragrafo: aEst.numParagrafo || 0,
            trecho: (aEst.trecho || aEst.fraseWord || '').slice(0, 75),
            mensagem: aEst.mensagem || 'Cadência sintética detectada.',
            gravidade: 'estilo_ia',
          });
        }
        telemetriaWord.ultimaAuditoriaWord = {
          data: new Date().toISOString(),
          total_palavras: String(texto).trim().split(/\s+/).filter(Boolean).length,
          total_citacoes: resAudit.totalCitacoesOcorrencias || 0,
          alertas,
        };
        return enviarJson(200, {
          status: 'concluido',
          total_palavras: telemetriaWord.ultimaAuditoriaWord.total_palavras,
          total_citacoes: telemetriaWord.ultimaAuditoriaWord.total_citacoes,
          alertas,
          resumo: {
            referenciasLista: resAudit.totalReferenciasListaFinal || 0,
            orfas: (resAudit.citacoesSemReferencia || []).length,
          },
        });
      }

      if (url.pathname === '/painel-auditoria') {
        const ult = telemetriaWord.ultimaAuditoriaWord;
        const linhas = (ult?.alertas || [])
          .map((a) => `<li><strong>[§${escaparHtml(a.paragrafo)}] ${escaparHtml(a.tipo)}</strong> — ${escaparHtml(a.mensagem)}</li>`)
          .join('');
        const htmlPainel = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Diagnóstico Word — Bibliografia</title><style>body{font-family:Segoe UI,sans-serif;max-width:860px;margin:24px auto;padding:0 16px;color:#0f172a}h1{color:#991b1b}li{margin:8px 0;padding:8px 12px;background:#f8fafc;border-left:4px solid #b91c1c;border-radius:4px}</style></head><body><h1>Diagnóstico Word · Bibliografia Forense</h1><p>${ult ? `${ult.total_citacoes} citações verificadas · ${(ult.alertas || []).length} ocorrência(s)` : 'Nenhuma auditoria executada pelo Word ainda.'}</p><ul>${linhas || '<li>Nenhuma inconformidade pendente.</li>'}</ul></body></html>`;
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        return res.end(htmlPainel);
      }

      enviarJson(404, { erro: 'Rota não encontrada' });
    } catch (e) {
      enviarJson(500, { erro: e.message });
    }
  });

  srv.on('error', (err) => {
    console.warn(`Servidor local Word (porta ${porta}):`, err.message);
  });
  srv.listen(porta, '127.0.0.1');
  return { porta, srv, caminhoManifesto: path.join(DIR_ADDIN, 'manifest.xml'), telemetriaWord };
}

module.exports = {
  iniciarServidorWord,
  PORTA,
  telemetriaWord,
  resolverSeletorPendente,
  gerarCodigoCampoBibliografia,
  parsearCodigoCampoBibliografia,
};
