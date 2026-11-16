// Processo principal do Electron: janela, protocolo app:// e IPC.
const fsBoot = require('fs');
const pathBoot = require('path');
function logBoot(msg) {
  try {
    fsBoot.appendFileSync(pathBoot.join(__dirname, '..', 'boot.log'), `[${new Date().toISOString()}] ${msg}\n`);
  } catch {}
}
logBoot('Iniciando main.cjs | argv=' + JSON.stringify(process.argv));
const { app, BrowserWindow, ipcMain, dialog, shell, clipboard, protocol, net, Menu } = require('electron');
const path = require('path');
const fs = require('fs');
const { pathToFileURL } = require('url');

const config = require('./config.cjs');
const { Biblioteca } = require('./library.cjs');
const metadados = require('./metadata.cjs');
const citacoes = require('./citations.cjs');
const buscadores = require('./searchers.cjs');
const cofre = require('./vault.cjs');
const importadores = require('./importers.cjs');
const auditor = require('./auditor.cjs');
const { iniciarServidorWord, PORTA } = require('./wordServer.cjs');
const os = require('os');

const DEV = process.argv.includes('--dev');
const DIST = path.join(__dirname, '..', 'dist');

protocol.registerSchemesAsPrivileged([
  { scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } },
]);

let janela = null;
let cfg = config.carregar();
let biblioteca = null;

async function abrirBiblioteca(caminho, nomeCustomizado) {
  const b = new Biblioteca(caminho);
  await b.iniciar();
  biblioteca = b;
  cfg = config.carregar();
  cfg.libraryPath = caminho;
  const lista = config.registrarProjetoRecente(caminho, nomeCustomizado);
  cfg.projetosRecentes = lista;
  config.salvar(cfg);
  if (janela && !janela.isDestroyed()) {
    const nome = nomeCustomizado || path.basename(caminho) || 'Biblioteca';
    janela.setTitle(`Bibliografia — 📁 [${nome}] — ${caminho}`);
  }
  return b.estado();
}

function exigirBiblioteca() {
  if (!biblioteca) throw new Error('Nenhuma pasta de biblioteca configurada.');
  return biblioteca;
}

function criarJanela() {
  const tituloInicial = cfg?.libraryPath
    ? `Bibliografia — 📁 [${path.basename(cfg.libraryPath)}] — ${cfg.libraryPath}`
    : 'Bibliografia';

  janela = new BrowserWindow({
    width: 1400,
    height: 860,
    minWidth: 1000,
    minHeight: 600,
    title: tituloInicial,
    backgroundColor: '#f6f7f9',
    autoHideMenuBar: true,
    show: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Nunca navegar para um PDF solto na janela; links externos abrem no navegador.
  janela.webContents.on('will-navigate', (e, url) => {
    if (!url.startsWith('app://') && !url.startsWith('http://localhost:5173')) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  janela.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });
  janela.webContents.on('before-input-event', (_e, input) => {
    if (input.type === 'keyDown' && input.key === 'F12') janela.webContents.toggleDevTools();
  });

  janela.webContents.on('console-message', (_e, level, message, line, sourceId) => {
    if (level >= 2) logBoot(`CONSOLE [${level}] ${message} (${sourceId}:${line})`);
  });
  janela.webContents.on('did-fail-load', (_e, code, desc, url) => {
    logBoot(`DID-FAIL-LOAD: ${code} ${desc} (${url})`);
  });
  janela.webContents.on('did-finish-load', () => {
    logBoot('DID-FINISH-LOAD concluído');
  });

  janela.once('ready-to-show', () => {
    logBoot('READY-TO-SHOW disparado');
    janela.show();
    janela.focus();
  });

  if (DEV) janela.loadURL('http://localhost:5173');
  else janela.loadURL('app://bibliografia/index.html');
}

// ---------- IPC ----------
const h = (canal, fn) =>
  ipcMain.handle(canal, async (_e, ...args) => {
    try {
      return { ok: true, dados: await fn(...args) };
    } catch (e) {
      console.error(`[${canal}]`, e);
      return { ok: false, erro: e.message || String(e) };
    }
  });

function registrarIpc() {
  h('config:obter', async () => ({
    libraryPath: cfg.libraryPath,
    estilo: cfg.estilo,
    idioma: cfg.idioma,
    tema: cfg.tema || 'claro',
    proxy: cfg.proxy || '',
    sugestoes: config.sugestoesDePasta(),
    versao: app.getVersion(),
  }));
  h('config:definir', async (patch) => {
    cfg = { ...cfg, ...patch, libraryPath: cfg.libraryPath };
    config.salvar(cfg);
    return cfg;
  });
  h('config:definirBiblioteca', async (caminho) => abrirBiblioteca(caminho));
  h('config:projetosRecentes', async () => config.obterProjetosRecentes());
  h('config:alternarProjeto', async (caminho, nome) => abrirBiblioteca(caminho, nome));
  h('config:criarNovoProjeto', async (nomeProjeto, pastaBase) => {
    if (!nomeProjeto) throw new Error('Nome do projeto é obrigatório.');
    const raiz = pastaBase || (cfg.libraryPath ? path.dirname(cfg.libraryPath) : process.cwd());
    const destino = path.join(raiz, nomeProjeto.replace(/[\\/:*?"<>|]/g, '-').trim());
    await fs.promises.mkdir(destino, { recursive: true });
    return abrirBiblioteca(destino, nomeProjeto);
  });
  h('config:removerProjetoRecente', async (caminho) => config.removerProjetoRecente(caminho));

  h('dialogo:escolherPasta', async () => {
    const r = await dialog.showOpenDialog(janela, {
      title: 'Escolha a pasta da biblioteca (de preferência dentro do OneDrive)',
      properties: ['openDirectory', 'createDirectory'],
    });
    return r.canceled ? null : r.filePaths[0];
  });
  h('dialogo:escolherPdfs', async () => {
    const r = await dialog.showOpenDialog(janela, {
      title: 'Escolha os PDFs',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    return r.canceled ? [] : r.filePaths;
  });
  h('dialogo:escolherPastaComPdfs', async () => {
    const r = await dialog.showOpenDialog(janela, {
      title: 'Escolha uma pasta que já tenha seus arquivos PDF para importar tudo',
      properties: ['openDirectory'],
    });
    if (r.canceled || !r.filePaths.length) return [];
    const dirRaiz = r.filePaths[0];
    const encontrados = [];
    async function varrer(dir) {
      let itens = [];
      try {
        itens = await fs.promises.readdir(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const it of itens) {
        const completo = path.join(dir, it.name);
        // Evita reimportar a própria pasta da biblioteca
        if (biblioteca && path.resolve(completo).toLowerCase().startsWith(path.resolve(biblioteca.raiz).toLowerCase())) {
          continue;
        }
        if (it.isDirectory()) await varrer(completo);
        else if (it.isFile() && it.name.toLowerCase().endsWith('.pdf')) encontrados.push(completo);
      }
    }
    await varrer(dirRaiz);
    return encontrados;
  });

  h('bib:estado', async () => (biblioteca ? biblioteca.carregarTudo() : null));
  h('bib:criar', async (dados) => exigirBiblioteca().criar(dados));
  h('bib:atualizar', async (id, patch) => exigirBiblioteca().atualizar(id, patch));
  h('bib:excluir', async (ids) => {
    for (const id of ids) await exigirBiblioteca().excluir(id);
    return true;
  });
  h('bib:porDoi', async (doi) => exigirBiblioteca().porDoi(doi));
  h('bib:anexarPdf', async (id, origem) => exigirBiblioteca().anexarPdf(id, origem));
  h('bib:lerArquivo', async (caminho) => fs.promises.readFile(caminho));
  h('bib:abrirPdf', async (id) => {
    const p = exigirBiblioteca().caminhoPdf(id);
    if (!p) throw new Error('Esta referência não tem PDF.');
    const erro = await shell.openPath(p);
    if (erro) throw new Error(erro);
    return true;
  });
  h('bib:mostrarPdf', async (id) => {
    const p = exigirBiblioteca().caminhoPdf(id);
    if (p) shell.showItemInFolder(p);
    return true;
  });
  h('bib:abrirPasta', async (sub) => {
    const b = exigirBiblioteca();
    const erro = await shell.openPath(sub ? b.p(sub) : b.raiz);
    if (erro) throw new Error(erro);
    return true;
  });
  h('bib:salvarColecoes', async (colecoes) => exigirBiblioteca().salvarColecoes(colecoes));
  h('bib:lerPdfBytes', async (id) => {
    const p = exigirBiblioteca().caminhoPdf(id);
    if (!p || !fs.existsSync(p)) throw new Error('PDF não encontrado para esta referência.');
    return fs.promises.readFile(p);
  });
  h('bib:lerGrifos', async (id) => exigirBiblioteca().lerGrifos(id));
  h('bib:salvarGrifos', async (id, grifos) => exigirBiblioteca().salvarGrifos(id, grifos));
  h('bib:mesclar', async (idPrincipal, idsDuplicados) => exigirBiblioteca().mesclar(idPrincipal, idsDuplicados));
  h('bib:sincronizarWord', async (dados) => exigirBiblioteca().sincronizarDocumentoWord(dados));
  h('bib:padronizarNomesPdfs', async () => exigirBiblioteca().padronizarNomesPdfs());
  h('bib:verificarIntegridade', async () => exigirBiblioteca().verificarIntegridade());

  // Fase 2 & 4: RIS/BibTeX, Unpaywall PDF aberto, Retratação e Rede de Citações
  h('imp:escolherEImportar', async (statusInicial = 'a_ler') => {
    const r = await dialog.showOpenDialog(janela, {
      title: 'Importar arquivo RIS (.ris / .nbib) ou BibTeX (.bib)',
      properties: ['openFile', 'multiSelections'],
      filters: [{ name: 'Bibliografia (RIS, NBIB, BibTeX)', extensions: ['ris', 'nbib', 'bib', 'txt'] }],
    });
    if (r.canceled || !r.filePaths.length) return { importadas: 0 };
    const b = exigirBiblioteca();
    let importadas = 0;
    for (const arq of r.filePaths) {
      const texto = await fs.promises.readFile(arq, 'utf8');
      const itens = importadores.importarTextoBibliografia(texto, arq);
      for (const it of itens) {
        if (it.csl?.DOI && b.porDoi(it.csl.DOI)) continue;
        await b.criar({ csl: it.csl, tags: it.tags || [], status: statusInicial });
        importadas++;
      }
    }
    return { importadas };
  });

  h('imp:exportarArquivo', async ({ ids, formato }) => {
    const b = exigirBiblioteca();
    const lista = (ids?.length ? ids.map((id) => b.refs.get(id)) : [...b.refs.values()]).filter(Boolean);
    const ext = formato === 'bib' ? 'bib' : 'ris';
    const r = await dialog.showSaveDialog(janela, {
      title: `Exportar ${lista.length} referências (.${ext})`,
      defaultPath: `bibliografia-exportada.${ext}`,
      filters: [{ name: formato === 'bib' ? 'BibTeX' : 'RIS', extensions: [ext] }],
    });
    if (r.canceled || !r.filePath) return null;
    const conteudo = formato === 'bib' ? importadores.exportarBibtex(lista) : importadores.exportarRis(lista);
    await fs.promises.writeFile(r.filePath, conteudo, 'utf8');
    return r.filePath;
  });

  h('meta:buscarPdfAberto', async (id) => {
    const b = exigirBiblioteca();
    const ref = b.refs.get(id);
    if (!ref) throw new Error('Referência não encontrada.');
    const achado = await importadores.localizarUrlPdfAberto({ doi: ref.csl?.DOI, pmid: ref.csl?.PMID });
    if (!achado?.urlPdf) throw new Error('Nenhum PDF gratuito (Open Access) encontrado para este artigo.');
    if (achado.retratado) await b.atualizar(id, { retratado: true });
    const temp = path.join(os.tmpdir(), `bib-oa-${Date.now()}.pdf`);
    try {
      await importadores.baixarPdfParaArquivo(achado.urlPdf, temp);
      const atualizada = await b.anexarPdf(id, temp);
      await fs.promises.rm(temp, { force: true });
      return { baixado: true, ref: atualizada, url: achado.urlPdf };
    } catch {
      await fs.promises.rm(temp, { force: true });
      await shell.openExternal(achado.urlPdf);
      return { baixado: false, ref: b.refs.get(id), url: achado.urlPdf };
    }
  });

  h('meta:redeCitacoes', async (alvo) => {
    const b = exigirBiblioteca();
    let doi = null;
    let pmid = null;
    let openAlexId = null;
    let refId = null;

    if (typeof alvo === 'string') {
      const ref = b.refs.get(alvo);
      if (ref) {
        refId = ref.id;
        doi = ref.csl?.DOI;
        pmid = ref.csl?.PMID;
      } else if (alvo.startsWith('10.') || alvo.includes('doi.org')) {
        doi = alvo;
      } else if (alvo.startsWith('W') || alvo.includes('openalex.org')) {
        openAlexId = alvo;
      } else {
        pmid = alvo;
      }
    } else if (alvo && typeof alvo === 'object') {
      doi = alvo.doi || alvo.csl?.DOI;
      pmid = alvo.pmid || alvo.csl?.PMID;
      openAlexId = alvo.openAlexId || alvo.idOpenAlex || alvo.id;
      if (alvo.refId) refId = alvo.refId;
    }

    const rede = await importadores.redeDeCitacoes({ doi, pmid, openAlexId });
    if (refId && rede.retratado) {
      const ref = b.refs.get(refId);
      if (ref && !ref.retratado) await b.atualizar(refId, { retratado: true });
    }
    return rede;
  });

  h('meta:gerarInsights', async ({ id, consultarOnline = true, forcarReescrita = true }) => {
    const b = exigirBiblioteca();
    return b.enriquecerInsights(id, { consultarOnline, forcarReescrita });
  });

  h('meta:gerarInsightsLote', async ({ ids, consultarOnline = true } = {}) => {
    const b = exigirBiblioteca();
    const alvos = ids?.length ? ids : [...b.refs.keys()];
    let atualizados = 0;
    for (const id of alvos) {
      try {
        await b.enriquecerInsights(id, { consultarOnline, forcarReescrita: true });
        atualizados++;
      } catch { /* continua */ }
    }
    return { atualizados, total: alvos.length };
  });

  // Fase 3: Integração Word
  h('word:info', async () => ({
    porta: PORTA,
    urlPainel: `http://127.0.0.1:${PORTA}/word-addin/index.html`,
    caminhoManifesto: path.join(__dirname, '..', 'resources', 'word-addin', 'manifest.xml'),
  }));
  h('word:mostrarManifesto', async () => {
    const p = path.join(__dirname, '..', 'resources', 'word-addin', 'manifest.xml');
    shell.showItemInFolder(p);
    return p;
  });
  h('word:modoTopo', async (ativo) => {
    if (janela) janela.setAlwaysOnTop(!!ativo);
    return !!ativo;
  });

  // Auditoria Reversa de Manuscrito (.docx, .pdf, .txt)
  h('audit:escolherArquivo', async () => {
    const r = await dialog.showOpenDialog(janela, {
      title: 'Escolha o seu arquivo (.docx do Word, .pdf ou .txt) com citações e referências',
      properties: ['openFile'],
      filters: [{ name: 'Manuscrito (Word .docx, PDF, TXT)', extensions: ['docx', 'pdf', 'txt', 'md'] }],
    });
    if (r.canceled || !r.filePaths.length) return null;
    const caminho = r.filePaths[0];
    const ext = path.extname(caminho).toLowerCase();
    if (ext === '.docx') {
      return { nome: path.basename(caminho), tipo: 'docx', texto: auditor.extrairTextoDocx(caminho) };
    }
    if (ext === '.pdf') {
      return { nome: path.basename(caminho), tipo: 'pdf', bytes: await fs.promises.readFile(caminho) };
    }
    return { nome: path.basename(caminho), tipo: 'txt', texto: await fs.promises.readFile(caminho, 'utf8') };
  });

  h('audit:executar', async ({ texto, buscarEBaixar = true, pastaDestino = null, modulo = 'todos' }) => {
    const b = exigirBiblioteca();
    const res = await auditor.auditarManuscrito({
      texto,
      biblioteca: b,
      buscarEBaixar,
      pastaDestino,
      modulo,
      onProgresso: (p) => {
        if (janela && !janela.isDestroyed()) {
          janela.webContents.send('audit:progresso', p);
        }
      },
    });
    if (janela && !janela.isDestroyed()) {
      janela.webContents.send('bib:atualizado');
    }
    return res;
  });

  h('audit:baixarPdfsParaPasta', async ({ pastaDestino, refs }) => {
    if (!pastaDestino) throw new Error('Pasta de destino não especificada.');
    await fs.promises.mkdir(pastaDestino, { recursive: true });
    const b = exigirBiblioteca();
    let baixados = 0;
    let copiados = 0;
    let erros = 0;
    for (const r of (refs || [])) {
      try {
        if (r.refBibId) {
          const refBib = b.refs.get(r.refBibId);
          if (refBib?.pdf) {
            const origem = b.p('pdfs', refBib.pdf);
            const destino = path.join(pastaDestino, refBib.pdf);
            if (fs.existsSync(origem)) {
              if (!fs.existsSync(destino)) {
                await fs.promises.copyFile(origem, destino);
              }
              copiados++;
              continue;
            }
          }
        }
        const doiOuUrl = r.doi || r.doiOficial || r.textoOriginal?.match(/https?:\/\/[^\s)>]+/i)?.[0];
        if (doiOuUrl) {
          const achado = await importadores.localizarUrlPdfAberto({
            doi: r.doi || r.doiOficial,
            titulo: r.tituloOficial || r.tituloBuscado,
            autor: r.primeiroSobrenome,
            ano: r.anoBase,
          });
          if (achado?.urlPdf) {
            const nomeArq = `${r.anoBase || 'artigo'}-${(r.primeiroSobrenome || 'autor').toLowerCase().replace(/[^a-z0-9]/g, '-')}.pdf`;
            const destino = path.join(pastaDestino, nomeArq);
            await importadores.baixarPdfParaArquivo(achado.urlPdf, destino);
            baixados++;
            if (r.refBibId) {
              await b.anexarPdf(r.refBibId, destino);
            }
          }
        }
      } catch (err) {
        erros++;
      }
    }
    if (janela && !janela.isDestroyed()) {
      janela.webContents.send('bib:atualizado');
    }
    return { baixados, copiados, erros, pasta: pastaDestino };
  });

  // Recursos estilo Mendeley: Caderno (Notebook) e Pasta Monitorada (Downloads)
  h('bib:lerCaderno', async () => {
    const b = exigirBiblioteca();
    try {
      return JSON.parse(await fs.promises.readFile(b.p('caderno.json'), 'utf8')).paginas || [];
    } catch {
      return [{ id: 'p1', titulo: 'Rascunho / Síntese da Literatura', conteudo: '', atualizadoEm: new Date().toISOString() }];
    }
  });
  h('bib:salvarCaderno', async (paginas) => {
    const b = exigirBiblioteca();
    await fs.promises.writeFile(b.p('caderno.json'), JSON.stringify({ paginas }, null, 2), 'utf8');
    return paginas;
  });
  h('dialogo:listarPdfsDownloads', async () => {
    const dir = app.getPath('downloads');
    if (!dir || !fs.existsSync(dir)) return { pasta: dir, arquivos: [] };
    const nomes = (await fs.promises.readdir(dir)).filter((f) => f.toLowerCase().endsWith('.pdf'));
    const detalhes = [];
    for (const nome of nomes) {
      try {
        const caminho = path.join(dir, nome);
        const st = await fs.promises.stat(caminho);
        detalhes.push({ nome, caminho, tamanhoKb: Math.round(st.size / 1024), modificadoEm: st.mtime.toISOString() });
      } catch { /* ignora */ }
    }
    detalhes.sort((a, b) => String(b.modificadoEm).localeCompare(String(a.modificadoEm)));
    return { pasta: dir, arquivos: detalhes.slice(0, 40) };
  });

  h('meta:doi', async (doi) => metadados.porDoi(doi));
  h('meta:pmid', async (pmid) => metadados.porPmid(pmid));
  h('meta:isbn', async (isbn) => metadados.porIsbn(isbn));
  h('meta:buscar', async (q) => metadados.buscarTitulo(q));

  // Central de Buscadores
  h('busc:catalogo', async () => buscadores.lerCatalogo(exigirBiblioteca().raiz));
  h('busc:salvarCatalogo', async (dados) => buscadores.salvarCatalogo(exigirBiblioteca().raiz, dados));
  h('busc:contar', async (contador, q) => buscadores.contar(contador, q));
  h('busc:resultados', async (fonte, q) => buscadores.resultados(fonte, q));
  h('busc:historico', async () => buscadores.listarBuscas(exigirBiblioteca().raiz));
  h('busc:salvarBusca', async (busca) => buscadores.salvarBusca(exigirBiblioteca().raiz, busca));
  h('busc:excluirBusca', async (id) => buscadores.excluirBusca(exigirBiblioteca().raiz, id));
  h('busc:abrir', async ({ url, usarProxy }) => {
    if (!/^https?:/.test(url)) throw new Error('Link inválido.');
    const final = usarProxy && cfg.proxy ? cfg.proxy + url : url;
    await shell.openExternal(final);
    return true;
  });

  // Cofre de contas (local, criptografado pelo Windows)
  h('cofre:disponivel', async () => cofre.disponivel());
  h('cofre:listar', async () => cofre.listar());
  h('cofre:salvar', async (id, dados) => cofre.salvar(id, dados));
  h('cofre:remover', async (id) => cofre.remover(id));
  h('cofre:revelar', async (id) => cofre.revelar(id));
  h('cofre:copiarSenha', async (id) => cofre.copiarSenha(id));
  h('sistema:copiarTexto', async (texto) => {
    clipboard.writeText(String(texto ?? ''));
    return true;
  });

  h('cit:estilos', async () => citacoes.listarEstilos(biblioteca?.raiz).map(({ id, nome, origem }) => ({ id, nome, origem })));
  h('cit:buscarOnline', async (q) => citacoes.buscarEstilosOnline(q));
  h('cit:instalarOnline', async (id) => citacoes.instalarEstiloOnline(id, exigirBiblioteca().raiz));
  h('cit:importarCsl', async () => {
    const r = await dialog.showOpenDialog(janela, {
      title: 'Escolha um arquivo de norma de formatação (.csl)',
      properties: ['openFile'],
      filters: [{ name: 'Estilo CSL (.csl)', extensions: ['csl', 'xml'] }],
    });
    if (r.canceled || !r.filePaths.length) return null;
    return citacoes.importarArquivoCsl(r.filePaths[0], exigirBiblioteca().raiz);
  });
  const itensDe = (ids) => ids.map((id) => exigirBiblioteca().refs.get(id)?.csl).filter(Boolean);
  h('cit:formatar', async ({ ids, estilo, idioma }) =>
    citacoes.formatar({ itens: itensDe(ids), estiloId: estilo || cfg.estilo, idioma: idioma || cfg.idioma, raizBiblioteca: biblioteca?.raiz })
  );
  h('cit:copiar', async ({ ids, estilo, idioma, tipo }) => {
    const f = citacoes.formatar({
      itens: itensDe(ids),
      estiloId: estilo || cfg.estilo,
      idioma: idioma || cfg.idioma,
      raizBiblioteca: biblioteca?.raiz,
    });
    if (tipo === 'citacao') {
      clipboard.write({ text: f.citacaoTexto, html: f.citacao });
    } else {
      // Cada entrada vira um parágrafo, com uma linha em branco entre elas (padrão ABNT).
      const corpo = f.entradas
        .map((e) => e.replace(/^\s*<div class="csl-entry">/, '<p style="margin:0 0 12pt 0;text-align:left">').replace(/<\/div>\s*$/, '</p>'))
        .map((e) => e.replace(/<div class="csl-left-margin">(.*?)<\/div><div class="csl-right-inline">(.*?)<\/div>/g, '$1 $2'))
        .join('');
      clipboard.write({ text: f.bibliografiaTexto, html: `<html><body>${corpo}</body></html>` });
    }
    return f.entradas.length;
  });
  h('sistema:abrirLink', async (url) => {
    if (/^https?:/.test(url)) await shell.openExternal(url);
    return true;
  });
}

function destacarJanela() {
  if (!janela || janela.isDestroyed()) return;
  if (janela.isMinimized()) janela.restore();
  janela.show();
  janela.setAlwaysOnTop(true);
  janela.focus();
  setTimeout(() => {
    if (janela && !janela.isDestroyed()) janela.setAlwaysOnTop(false);
  }, 600);
}

// ---------- Inicialização ----------
const instanciaUnica = app.requestSingleInstanceLock();
if (!instanciaUnica) {
  app.quit();
} else {
  app.on('second-instance', () => {
    destacarJanela();
  });

  app.whenReady().then(async () => {
    logBoot('app.whenReady disparado');
    Menu.setApplicationMenu(null);
    protocol.handle('app', (req) => {
      const { pathname } = new URL(req.url);
      const alvo = path.normalize(path.join(DIST, decodeURIComponent(pathname)));
      if (!alvo.startsWith(DIST)) return new Response('Proibido', { status: 403 });
      return net.fetch(pathToFileURL(alvo).toString());
    });

    registrarIpc();
    if (cfg.libraryPath) {
      try {
        await abrirBiblioteca(cfg.libraryPath);
        logBoot('Biblioteca aberta: ' + cfg.libraryPath);
      } catch (e) {
        logBoot('Erro ao abrir biblioteca: ' + e.message);
        console.error('Falha ao abrir a biblioteca:', e);
        biblioteca = null;
      }
    }
    iniciarServidorWord({
      obterBiblioteca: () => biblioteca,
      obterConfig: () => cfg,
      aoAtualizarBiblioteca: () => {
        if (janela && !janela.isDestroyed()) {
          janela.webContents.send('bib:atualizado');
        }
      },
    });
    criarJanela();
    destacarJanela();
    logBoot('criarJanela concluído');
  }).catch((e) => {
    logBoot('Erro fatal no whenReady: ' + (e && e.stack || e));
  });

  app.on('window-all-closed', () => {
    logBoot('window-all-closed');
    app.quit();
  });
}
