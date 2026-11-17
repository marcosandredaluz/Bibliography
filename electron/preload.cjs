// Ponte segura entre a interface (React) e o processo principal.
const { contextBridge, ipcRenderer, webUtils } = require('electron');

const chamar = async (canal, ...args) => {
  const r = await ipcRenderer.invoke(canal, ...args);
  if (!r.ok) throw new Error(r.erro);
  return r.dados;
};

contextBridge.exposeInMainWorld('api', {
  config: {
    obter: () => chamar('config:obter'),
    definir: (patch) => chamar('config:definir', patch),
    definirBiblioteca: (caminho, nome) => chamar('config:definirBiblioteca', caminho, nome),
    projetosRecentes: () => chamar('config:projetosRecentes'),
    alternarProjeto: (caminho, nome) => chamar('config:alternarProjeto', caminho, nome),
    criarNovoProjeto: (nome, pastaBase) => chamar('config:criarNovoProjeto', nome, pastaBase),
    removerProjetoRecente: (caminho) => chamar('config:removerProjetoRecente', caminho),
  },
  dialogo: {
    escolherPasta: () => chamar('dialogo:escolherPasta'),
    escolherPdfs: () => chamar('dialogo:escolherPdfs'),
    escolherPastaComPdfs: () => chamar('dialogo:escolherPastaComPdfs'),
  },
  bib: {
    estado: () => chamar('bib:estado'),
    criar: (dados) => chamar('bib:criar', dados),
    atualizar: (id, patch) => chamar('bib:atualizar', id, patch),
    excluir: (ids) => chamar('bib:excluir', ids),
    porDoi: (doi) => chamar('bib:porDoi', doi),
    anexarPdf: (id, origem) => chamar('bib:anexarPdf', id, origem),
    lerArquivo: (caminho) => chamar('bib:lerArquivo', caminho),
    abrirPdf: (id) => chamar('bib:abrirPdf', id),
    mostrarPdf: (id) => chamar('bib:mostrarPdf', id),
    abrirPasta: (sub) => chamar('bib:abrirPasta', sub),
    salvarColecoes: (c) => chamar('bib:salvarColecoes', c),
    lerPdfBytes: (id) => chamar('bib:lerPdfBytes', id),
    lerGrifos: (id) => chamar('bib:lerGrifos', id),
    salvarGrifos: (id, g) => chamar('bib:salvarGrifos', id, g),
    mesclar: (idPrincipal, idsDup) => chamar('bib:mesclar', idPrincipal, idsDup),
    sincronizarWord: (d) => chamar('bib:sincronizarWord', d),
    padronizarNomesPdfs: () => chamar('bib:padronizarNomesPdfs'),
    verificarIntegridade: () => chamar('bib:verificarIntegridade'),
    aoAtualizar: (cb) => {
      const fn = () => cb();
      ipcRenderer.on('bib:atualizado', fn);
      return () => ipcRenderer.removeListener('bib:atualizado', fn);
    },
  },
  imp: {
    escolherEImportar: (st) => chamar('imp:escolherEImportar', st),
    exportarArquivo: (opts) => chamar('imp:exportarArquivo', opts),
  },
  meta: {
    doi: (doi) => chamar('meta:doi', doi),
    pmid: (pmid) => chamar('meta:pmid', pmid),
    isbn: (isbn) => chamar('meta:isbn', isbn),
    buscar: (q) => chamar('meta:buscar', q),
    buscarPdfAberto: (id) => chamar('meta:buscarPdfAberto', id),
    redeCitacoes: (id) => chamar('meta:redeCitacoes', id),
    gerarInsights: (opts) => chamar('meta:gerarInsights', opts),
    gerarInsightsLote: (opts) => chamar('meta:gerarInsightsLote', opts),
  },
  word: {
    info: () => chamar('word:info'),
    mostrarManifesto: () => chamar('word:mostrarManifesto'),
    modoTopo: (ativo) => chamar('word:modoTopo', ativo),
  },
  audit: {
    escolherArquivo: () => chamar('audit:escolherArquivo'),
    executar: (opts) => chamar('audit:executar', opts),
    baixarPdfsParaPasta: (opts) => chamar('audit:baixarPdfsParaPasta', opts),
    cirurgiaDocx: (opts) => chamar('audit:cirurgiaDocx', opts),
    abrirNoWord: (opts) => chamar('audit:abrirNoWord', opts),
    exportarDocxComentarios: (opts) => chamar('audit:exportarDocxComentarios', opts),
    gerarLaudoPericial: (opts) => chamar('audit:gerarLaudoPericial', opts),
    aoProgresso: (cb) => {
      const fn = (_e, dados) => cb(dados);
      ipcRenderer.on('audit:progresso', fn);
      return () => ipcRenderer.removeListener('audit:progresso', fn);
    },
  },
  mendeley: {
    lerCaderno: () => chamar('bib:lerCaderno'),
    salvarCaderno: (p) => chamar('bib:salvarCaderno', p),
    listarPdfsDownloads: () => chamar('dialogo:listarPdfsDownloads'),
  },
  busc: {
    catalogo: () => chamar('busc:catalogo'),
    salvarCatalogo: (d) => chamar('busc:salvarCatalogo', d),
    contar: (contador, q) => chamar('busc:contar', contador, q),
    resultados: (fonte, q) => chamar('busc:resultados', fonte, q),
    historico: () => chamar('busc:historico'),
    salvarBusca: (b) => chamar('busc:salvarBusca', b),
    excluirBusca: (id) => chamar('busc:excluirBusca', id),
    abrir: (url, usarProxy) => chamar('busc:abrir', { url, usarProxy }),
  },
  cofre: {
    disponivel: () => chamar('cofre:disponivel'),
    listar: () => chamar('cofre:listar'),
    salvar: (id, d) => chamar('cofre:salvar', id, d),
    remover: (id) => chamar('cofre:remover', id),
    revelar: (id) => chamar('cofre:revelar', id),
    copiarSenha: (id) => chamar('cofre:copiarSenha', id),
  },
  cit: {
    estilos: () => chamar('cit:estilos'),
    buscarOnline: (q) => chamar('cit:buscarOnline', q),
    instalarOnline: (id) => chamar('cit:instalarOnline', id),
    importarCsl: () => chamar('cit:importarCsl'),
    formatar: (opts) => chamar('cit:formatar', opts),
    copiar: (opts) => chamar('cit:copiar', opts),
  },
  sistema: {
    abrirLink: (url) => chamar('sistema:abrirLink', url),
    copiarTexto: (t) => chamar('sistema:copiarTexto', t),
    caminhoDoArquivo: (file) => webUtils.getPathForFile(file),
  },
  versao: {
    obterInfo: () => ({
      app: '1.2.0',
      electron: process.versions.electron,
      node: process.versions.node,
      chrome: process.versions.chrome,
      v8: process.versions.v8,
      plataforma: process.platform,
      arquitetura: process.arch,
    }),
  },
});
