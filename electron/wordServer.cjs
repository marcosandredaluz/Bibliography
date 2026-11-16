// Servidor local (http://127.0.0.1:23119) para comunicação com o Suplemento do Word
// e sincronização em tempo real do status "Citada" vs "Consultada".
const http = require('http');
const fs = require('fs');
const path = require('path');
const citacoes = require('./citations.cjs');

const PORTA = 23119;
const DIR_ADDIN = path.join(__dirname, '..', 'resources', 'word-addin');

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

function iniciarServidorWord({ obterBiblioteca, obterConfig, aoAtualizarBiblioteca }) {
  const srv = http.createServer(async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      return res.end();
    }

    const url = new URL(req.url, `http://127.0.0.1:${PORTA}`);
    const enviarJson = (codigo, obj) => {
      res.writeHead(codigo, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify(obj));
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

      if (url.pathname === '/api/status') {
        if (!bib) return enviarJson(200, { ativo: false, estilos: [], refs: [] });
        const estilos = citacoes.listarEstilos(bib.raiz).map(({ id, nome }) => ({ id, nome }));
        const refs = [...bib.refs.values()].map((r) => ({
          id: r.id,
          titulo: String(r.csl?.title || '(Sem título)').replace(/<[^>]+>/g, ''),
          autorAno: resumoAutorAno(r.csl),
          status: r.status,
          busca: `${r.csl?.title || ''} ${resumoAutorAno(r.csl)} ${(r.tags || []).join(' ')}`.toLowerCase(),
        }));
        return enviarJson(200, { ativo: true, estiloAtivo: cfg.estilo, estilos, refs });
      }

      // Lê corpo JSON de requisições POST
      const lerCorpo = () =>
        new Promise((resolve, reject) => {
          let dados = '';
          req.on('data', (c) => (dados += c));
          req.on('end', () => {
            try {
              resolve(dados ? JSON.parse(dados) : {});
            } catch (e) {
              reject(e);
            }
          });
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

      enviarJson(404, { erro: 'Rota não encontrada' });
    } catch (e) {
      enviarJson(500, { erro: e.message });
    }
  });

  srv.on('error', (err) => {
    console.warn('Servidor local Word (porta 23119):', err.message);
  });
  srv.listen(PORTA, '127.0.0.1');
  return { porta: PORTA, caminhoManifesto: path.join(DIR_ADDIN, 'manifest.xml') };
}

module.exports = { iniciarServidorWord, PORTA };
