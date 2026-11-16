import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  STATUS,
  TIPOS,
  statusPorId,
  tipoPorId,
  autoresResumo,
  ano,
  semHtml,
  normalizar,
  textoDeBusca,
} from './lib/csl.js';
import { analisarPdf } from './lib/pdf.js';
import { Icone, ProvedorAvisos, Modal, Vazio, useAviso } from './components/ui.jsx';
import ReferenceDetail from './components/ReferenceDetail.jsx';
import QuickAddModal from './components/QuickAddModal.jsx';
import SearchHub from './components/SearchHub.jsx';
import PdfReaderModal from './components/PdfReaderModal.jsx';
import { WordHubView, PrismaAndScreeningView } from './components/WordAndPrismaView.jsx';
import ReverseAuditView from './components/ReverseAuditView.jsx';
import MendeleyExtras from './components/MendeleyExtras.jsx';
import HelpGuideView, { TutorialEtapa } from './components/HelpGuideView.jsx';
import { SystemVersionModal } from './components/SystemVersionModal.jsx';

const ICONE_TIPO = {
  'article-journal': '📄',
  book: '📘',
  chapter: '📑',
  'paper-conference': '🎤',
  thesis: '🎓',
  report: '📋',
  webpage: '🌐',
  legislation: '⚖️',
  standard: '📏',
  dataset: '📊',
};

export default function App() {
  return (
    <ProvedorAvisos>
      <ConteudoApp />
    </ProvedorAvisos>
  );
}

function ConteudoApp() {
  const avisar = useAviso();
  const [cfg, setCfg] = useState(null);
  const [bib, setBib] = useState(null);
  const [estilos, setEstilos] = useState([]);

  // Abas superiores estilo Zotero 7 / Mendeley Desktop:
  // 'biblioteca' | 'buscadores' | 'word' | 'auditoria' | 'prisma' | 'mendeley' | 'pdf:<id>'
  const [abaSuperior, setAbaSuperior] = useState('biblioteca');
  const [abasPdf, setAbasPdf] = useState([]); // lista de ids de referências com PDF aberto em aba
  const [paginasPdfAba, setPaginasPdfAba] = useState({}); // { [id]: paginaInicial }

  // Filtro na árvore esquerda da biblioteca (estilo Zotero)
  const [visao, setVisao] = useState('todas');
  const [abaSeletorInferior, setAbaSeletorInferior] = useState('tags'); // 'tags' | 'autores' | 'periodicos'
  const [buscaTagAutor, setBuscaTagAutor] = useState('');

  // Busca e ordenação na tabela central (estilo Zotero/Mendeley)
  const [busca, setBusca] = useState('');
  const [escopoBusca, setEscopoBusca] = useState('tudo'); // 'basico' | 'tudo' | 'pdf'
  const [colunaOrdem, setColunaOrdem] = useState('adicionado'); // 'titulo' | 'autor' | 'ano' | 'periodico' | 'status' | 'adicionado'
  const [direcaoOrdem, setDirecaoOrdem] = useState('desc');
  const [selecionadas, setSelecionadas] = useState([]);
  const [expandidas, setExpandidas] = useState({}); // { [id]: true } para mostrar anexos/notas filhos na árvore Zotero

  // Barra da "Varinha Mágica" do Zotero (Adicionar rápido por DOI/PMID/ISBN direto na toolbar)
  const [varinhaAberta, setVarinhaAberta] = useState(false);
  const [textoVarinha, setTextoVarinha] = useState('');
  const [carregandoVarinha, setCarregandoVarinha] = useState(false);
  const [menuNovoItem, setMenuNovoItem] = useState(false);

  // Menu de contexto do botão direito (estilo Zotero)
  const [menuContexto, setMenuContexto] = useState(null); // { x, y, ref }

  // Modais
  const [modalAdicionar, setModalAdicionar] = useState(false);
  const [modalVersaoAberto, setModalVersaoAberto] = useState(false);
  const [modalExportarWord, setModalExportarWord] = useState(false);
  const [modalEstilos, setModalEstilos] = useState(false);
  const [baixandoLote, setBaixandoLote] = useState(false);
  const [gerandoInsightsLote, setGerandoInsightsLote] = useState(false);
  const [novaColecao, setNovaColecao] = useState('');
  const [arrastandoPdf, setArrastandoPdf] = useState(false);

  // Estados do Design Elegante: Seletor de Projetos e Menus Agrupados
  const [projetosRecentes, setProjetosRecentes] = useState([]);
  const [menuProjetosAberto, setMenuProjetosAberto] = useState(false);
  const [modalNovoProjeto, setModalNovoProjeto] = useState(false);
  const [nomeNovoProjeto, setNomeNovoProjeto] = useState('');
  const [menuAcoesRapidas, setMenuAcoesRapidas] = useState(false);
  const barraAbasRef = useRef(null);

  // Controle de execução da Auditoria Reversa em segundo plano (evita interrupção acidental)
  const [auditoriaEmExecucao, setAuditoriaEmExecucao] = useState(false);

  const confirmarSePodeTrocarProjeto = () => {
    if (auditoriaEmExecucao) {
      return window.confirm(
        '⚠️ ATENÇÃO: Auditoria em andamento!\n\nUma verificação forense de manuscrito está em execução neste projeto.\nSe você trocar ou criar outro projeto agora, a auditoria atual será interrompida.\n\nDeseja realmente trocar de projeto?'
      );
    }
    return true;
  };

  // Cockpit de Início Rápido na Tela Inicial (persistência de estado recolhido/expandido)
  const [mostrarCockpit, setMostrarCockpit] = useState(() => {
    try {
      const s = localStorage.getItem('bib_mostrar_cockpit');
      return s !== '0';
    } catch {
      return true;
    }
  });
  const alternarCockpit = () => {
    setMostrarCockpit((v) => {
      const novo = !v;
      try { localStorage.setItem('bib_mostrar_cockpit', novo ? '1' : '0'); } catch {}
      return novo;
    });
  };

  // Definição e isolamento do estado da Auditoria Reversa por projeto
  const ESTADO_AUDITORIA_LIMPO = {
    nomeArquivo: '',
    textoManuscrito: '',
    buscarEBaixar: true,
    resultado: null,
    dataHora: null,
    mostrarCaixaTexto: true,
  };

  const obterChaveAuditoriaProjeto = (raiz) => {
    if (!raiz) return 'bib_auditoria_sessao_temp';
    let hash = 0;
    for (let i = 0; i < raiz.length; i++) {
      hash = ((hash << 5) - hash) + raiz.charCodeAt(i);
      hash |= 0;
    }
    return `bib_auditoria_proj_${Math.abs(hash)}`;
  };

  const carregarAuditoriaDoProjeto = (raiz) => {
    try {
      if (!raiz) return { ...ESTADO_AUDITORIA_LIMPO };
      const chave = obterChaveAuditoriaProjeto(raiz);
      const salvo = JSON.parse(localStorage.getItem(chave) || 'null');
      return salvo || { ...ESTADO_AUDITORIA_LIMPO };
    } catch {
      return { ...ESTADO_AUDITORIA_LIMPO };
    }
  };

  // Estado da Auditoria Reversa: isolado por projeto (ao criar novo projeto, nasce 100% limpo!)
  const [estadoAuditoria, setEstadoAuditoriaState] = useState(() => ({ ...ESTADO_AUDITORIA_LIMPO }));

  const setEstadoAuditoria = (atualizador) => {
    setEstadoAuditoriaState((ant) => {
      const prox = typeof atualizador === 'function' ? atualizador(ant) : { ...ant, ...atualizador };
      try {
        if (bib?.raiz) {
          const chave = obterChaveAuditoriaProjeto(bib.raiz);
          localStorage.setItem(chave, JSON.stringify(prox));
        }
      } catch {
        /* caso exceda quota do localStorage, mantém em memória */
      }
      return prox;
    });
  };

  // Larguras redimensionáveis das colunas da tabela central (nascem comprimidas cabendo 100% na tela!)
  const PADRAO_COLUNAS = {
    titulo: null, // ocupa o espaço restante automaticamente (comprimido na tela)
    autor: '14%',
    ano: 48,
    periodico: '13%',
    nivel: 84,
    status: 102,
    pdf: 74,
  };
  const [largurasColunas, setLargurasColunas] = useState(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem('bib_larguras_colunas_v3') || 'null');
      return salvo ? { ...PADRAO_COLUNAS, ...salvo } : PADRAO_COLUNAS;
    } catch {
      return PADRAO_COLUNAS;
    }
  });
  const [largurasPaineis, setLargurasPaineis] = useState(() => {
    try {
      const salvo = JSON.parse(localStorage.getItem('bib_larguras_paineis_v2') || 'null');
      return salvo || { esquerdo: 220, direito: 430 };
    } catch {
      return { esquerdo: 220, direito: 430 };
    }
  });

  const iniciarRedimColuna = (colKey, e) => {
    e.preventDefault();
    e.stopPropagation();
    const xInicial = e.clientX;
    const thEl = e.currentTarget.parentElement;
    const largInicial = thEl ? thEl.getBoundingClientRect().width : Number(largurasColunas[colKey]) || 120;
    const aoMover = (ev) => {
      const delta = ev.clientX - xInicial;
      const nova = Math.max(42, Math.min(900, Math.round(largInicial + delta)));
      setLargurasColunas((ant) => {
        const prox = { ...ant, [colKey]: nova };
        try {
          localStorage.setItem('bib_larguras_colunas_v3', JSON.stringify(prox));
        } catch {}
        return prox;
      });
    };
    const aoSoltar = () => {
      window.removeEventListener('mousemove', aoMover);
      window.removeEventListener('mouseup', aoSoltar);
    };
    window.addEventListener('mousemove', aoMover);
    window.addEventListener('mouseup', aoSoltar);
  };

  const iniciarRedimPainel = (qual, e) => {
    e.preventDefault();
    e.stopPropagation();
    const xInicial = e.clientX;
    const largInicial = largurasPaineis[qual];
    const aoMover = (ev) => {
      const delta = ev.clientX - xInicial;
      const nova =
        qual === 'esquerdo'
          ? Math.max(165, Math.min(420, largInicial + delta))
          : Math.max(300, Math.min(680, largInicial - delta));
      setLargurasPaineis((ant) => {
        const prox = { ...ant, [qual]: nova };
        try {
          localStorage.setItem('bib_larguras_paineis_v2', JSON.stringify(prox));
        } catch {}
        return prox;
      });
    };
    const aoSoltar = () => {
      window.removeEventListener('mousemove', aoMover);
      window.removeEventListener('mouseup', aoSoltar);
    };
    window.addEventListener('mousemove', aoMover);
    window.addEventListener('mouseup', aoSoltar);
  };

  const restaurarLargurasPadrao = () => {
    setLargurasColunas(PADRAO_COLUNAS);
    setLargurasPaineis({ esquerdo: 220, direito: 430 });
    try {
      localStorage.removeItem('bib_larguras_colunas_v3');
      localStorage.removeItem('bib_larguras_paineis_v2');
    } catch {}
    avisar('Tabela comprimida novamente para caber inteira na tela!', 'info');
  };

  const recarregarBiblioteca = async () => {
    const estado = await window.api.bib.estado();
    if (estado) setBib(estado);
  };

  const atualizarProjetosRecentes = async () => {
    try {
      const lista = await window.api.config.projetosRecentes();
      setProjetosRecentes(lista || []);
    } catch {}
  };

  const alternarParaProjeto = async (caminho, nome) => {
    if (!confirmarSePodeTrocarProjeto()) return;
    try {
      setMenuProjetosAberto(false);
      const estado = await window.api.config.alternarProjeto(caminho, nome);
      setBib(estado);
      setCfg(await window.api.config.obter());
      setAbasPdf([]);
      setSelecionadas([]);
      setVisao('todas');
      setBusca('');
      setBuscaTagAutor('');
      setExpandidas({});
      // Carrega exclusivamente a auditoria salva deste projeto (se for novo/sem auditoria, 100% limpo!)
      const aud = carregarAuditoriaDoProjeto(caminho);
      setEstadoAuditoriaState(aud);
      setAbaSuperior('biblioteca');
      await atualizarProjetosRecentes();
      avisar(`Projeto "${nome || caminho.split(/[\\/]/).pop()}" carregado!`, 'ok');
    } catch (e) {
      avisar(`Erro ao alternar projeto: ${e.message}`, 'erro');
    }
  };

  const criarNovoProjeto = async () => {
    if (!nomeNovoProjeto.trim()) return;
    if (!confirmarSePodeTrocarProjeto()) return;
    try {
      const estado = await window.api.config.criarNovoProjeto(nomeNovoProjeto.trim());
      setBib(estado);
      setCfg(await window.api.config.obter());
      setAbasPdf([]);
      setSelecionadas([]);
      setVisao('todas');
      setBusca('');
      setBuscaTagAutor('');
      setExpandidas({});
      // Projeto novo: Zera completamente todas as telas e a auditoria reversa!
      try {
        localStorage.removeItem(obterChaveAuditoriaProjeto(estado?.raiz));
      } catch {}
      setEstadoAuditoriaState({ ...ESTADO_AUDITORIA_LIMPO });
      setModalNovoProjeto(false);
      setNomeNovoProjeto('');
      setAbaSuperior('biblioteca');
      await atualizarProjetosRecentes();
      avisar(`Novo projeto "${nomeNovoProjeto}" criado com sucesso! Telas limpas e prontas.`, 'ok');
    } catch (e) {
      avisar(`Erro ao criar projeto: ${e.message}`, 'erro');
    }
  };

  const escolherOutroProjeto = async () => {
    if (!confirmarSePodeTrocarProjeto()) return;
    try {
      const p = await window.api.dialogo.escolherPasta();
      if (p) {
        await alternarParaProjeto(p);
      }
    } catch (e) {
      avisar(`Erro ao escolher pasta: ${e.message}`, 'erro');
    }
  };

  const importarRisOuBib = async () => {
    try {
      const res = await window.api.imp.escolherEImportar('a_ler');
      if (res?.importadas > 0) {
        avisar(`${res.importadas} referências importadas com sucesso!`, 'ok');
        await recarregarBiblioteca();
      }
    } catch (err) {
      avisar('Erro ao importar arquivo: ' + err.message, 'erro');
    }
  };

  const carregarInicial = async () => {
    try {
      const c = await window.api.config.obter();
      setCfg(c || { libraryPath: null, recentes: [], tema: 'escuro', estilo: 'abnt', idioma: 'pt-BR' });
      if (c?.libraryPath) {
        try {
          const estado = await window.api.bib.estado();
          setBib(estado);
          if (estado?.raiz) {
            setEstadoAuditoriaState(carregarAuditoriaDoProjeto(estado.raiz));
          }
          // Limpa chaves legadas globais que não eram isoladas por projeto
          try {
            localStorage.removeItem('bib_ultima_auditoria_v2');
            localStorage.removeItem('bib_ultima_auditoria');
          } catch {}
          const ests = await window.api.cit.estilos();
          setEstilos(ests || []);
          await atualizarProjetosRecentes();
        } catch (errBib) {
          console.error('Erro ao ler estado da biblioteca:', errBib);
        }
      }
    } catch (e) {
      console.error('Erro na inicialização da configuração:', e);
      setCfg({ libraryPath: null, recentes: [], tema: 'escuro', estilo: 'abnt', idioma: 'pt-BR' });
    }
  };

  useEffect(() => {
    carregarInicial();
    const fecharMenus = () => {
      setMenuContexto(null);
      setMenuNovoItem(false);
      setMenuProjetosAberto(false);
      setMenuAcoesRapidas(false);
    };
    window.addEventListener('click', fecharMenus);
    const desinscrever = window.api.bib.aoAtualizar(() => recarregarBiblioteca());
    return () => {
      window.removeEventListener('click', fecharMenus);
      desinscrever?.();
    };
  }, []);

  useEffect(() => {
    if (cfg) {
      if (typeof window.__removerSplash === 'function') {
        window.__removerSplash();
      } else {
        const splash = document.getElementById('splash-screen');
        if (splash) {
          splash.classList.add('splash-oculto');
          setTimeout(() => {
            try { splash.remove(); } catch {}
          }, 500);
        }
      }
    }
    if (cfg?.tema) {
      document.documentElement.setAttribute('data-tema', cfg.tema);
    }
  }, [cfg, cfg?.tema]);

  const escolherPastaBiblioteca = async (caminho) => {
    try {
      const estado = await window.api.config.definirBiblioteca(caminho);
      setBib(estado);
      setCfg(await window.api.config.obter());
      setEstilos(await window.api.cit.estilos());
      avisar(`Biblioteca ativa em: ${caminho}`, 'ok');
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const mudarEstilo = async (novoEstilo) => {
    const c = await window.api.config.definir({ estilo: novoEstilo });
    setCfg((ant) => ({ ...ant, estilo: c.estilo }));
  };

  const alternarTema = async () => {
    const novoTema = cfg?.tema === 'escuro' ? 'claro' : 'escuro';
    document.documentElement.setAttribute('data-tema', novoTema);
    const c = await window.api.config.definir({ tema: novoTema });
    setCfg((ant) => ({ ...ant, tema: c.tema }));
  };

  const mudarProxy = async (novoProxy) => {
    const c = await window.api.config.definir({ proxy: novoProxy });
    setCfg((ant) => ({ ...ant, proxy: c.proxy }));
  };

  // --- Abrir PDF em aba superior (igual ao Zotero 7 e Mendeley), opcionalmente pulando para uma página exata ---
  const abrirPdfEmAba = (refObj, pag = 1) => {
    if (!refObj?.pdf) {
      avisar('Esta referência ainda não tem PDF anexado.', 'info');
      return;
    }
    if (!abasPdf.includes(refObj.id)) {
      setAbasPdf((ant) => [...ant, refObj.id]);
    }
    if (pag && Number(pag) >= 1) {
      setPaginasPdfAba((ant) => ({ ...ant, [refObj.id]: Number(pag) }));
    }
    setAbaSuperior(`pdf:${refObj.id}`);
    if (!refObj.lido) {
      atualizarRef(refObj.id, { lido: true, ultimoAbertoEm: new Date().toISOString() });
    }
  };

  const fecharAbaPdf = (id, e) => {
    e?.stopPropagation();
    const novas = abasPdf.filter((x) => x !== id);
    setAbasPdf(novas);
    if (abaSuperior === `pdf:${id}`) {
      setAbaSuperior(novas.length ? `pdf:${novas[novas.length - 1]}` : 'biblioteca');
    }
  };

  // --- Operações na biblioteca ---
  const atualizarRef = async (id, patch) => {
    try {
      const atualizada = await window.api.bib.atualizar(id, patch);
      setBib((ant) => ({
        ...ant,
        refs: ant.refs.map((r) => (r.id === id ? atualizada : r)),
      }));
      return atualizada;
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const excluirRefs = async (ids) => {
    if (!ids?.length) return;
    try {
      await window.api.bib.excluir(ids);
      setBib((ant) => ({
        ...ant,
        refs: ant.refs.filter((r) => !ids.includes(r.id)),
      }));
      setSelecionadas((ant) => ant.filter((id) => !ids.includes(id)));
      setAbasPdf((ant) => ant.filter((id) => !ids.includes(id)));
      avisar(
        ids.length === 1
          ? 'Item movido para a Lixeira.'
          : `${ids.length} itens movidos para a Lixeira.`,
        'info'
      );
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const importarCsl = async (csl, status = 'consultada') => {
    if (csl.DOI) {
      const existente = await window.api.bib.porDoi(csl.DOI);
      if (existente) {
        setSelecionadas([existente.id]);
        avisar('Este item já estava na sua biblioteca (selecionado).', 'info');
        return existente;
      }
    }
    const colecaoAtiva = visao.startsWith('col:') ? [visao.slice(4)] : [];
    const nova = await window.api.bib.criar({
      csl,
      status,
      colecoes: colecaoAtiva,
    });
    setBib((ant) => ({ ...ant, refs: [nova, ...ant.refs] }));
    setSelecionadas([nova.id]);
    return nova;
  };

  // Varinha Mágica do Zotero (DOI / PMID / ISBN direto na barra de ferramentas)
  const executarVarinhaMagica = async (e) => {
    e.preventDefault();
    const s = textoVarinha.trim();
    if (!s) return;
    setCarregandoVarinha(true);
    try {
      let csl = null;
      const mDoi = s.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
      const mPmidUrl = s.match(/pubmed\.ncbi\.nlm\.nih\.gov\/(\d{1,9})/i);
      const limpoIsbn = s.replace(/[^0-9Xx]/g, '');
      if (mDoi) {
        csl = await window.api.meta.doi(mDoi[0].replace(/[.,;:)\]}]+$/, ''));
      } else if (mPmidUrl || /^pmid\s*:?\s*\d{1,9}$/i.test(s) || /^\d{7,8}$/.test(s)) {
        csl = await window.api.meta.pmid(mPmidUrl ? mPmidUrl[1] : s.replace(/\D/g, ''));
      } else if (limpoIsbn.length === 10 || limpoIsbn.length === 13) {
        csl = await window.api.meta.isbn(limpoIsbn);
      } else {
        const res = await window.api.meta.buscar(s);
        if (res[0]?.doi) csl = await window.api.meta.doi(res[0].doi);
      }
      if (!csl) throw new Error('Não encontrado por identificador. Use o botão de busca completa.');
      const criada = await importarCsl(csl, 'a_ler');
      setTextoVarinha('');
      setVarinhaAberta(false);
      avisar(`Adicionado pela Varinha Mágica: ${semHtml(criada.csl?.title).slice(0, 55)}…`, 'ok');
    } catch (err) {
      avisar(err.message, 'erro');
    } finally {
      setCarregandoVarinha(false);
    }
  };

  const criarNovoItemPorTipo = async (tipoId) => {
    const nova = await importarCsl({ type: tipoId, title: 'Sem título' }, 'a_ler');
    setAbaSuperior('biblioteca');
    setSelecionadas([nova.id]);
  };

  const importarPdfs = async (caminhos, status = 'a_ler') => {
    for (const caminho of caminhos) {
      try {
        avisar(`Lendo PDF: ${caminho.split(/[\\/]/).pop()}…`, 'info', 2500);
        const bytes = await window.api.bib.lerArquivo(caminho);
        const info = await analisarPdf(bytes);
        let csl = null;
        if (info.doi) {
          try {
            csl = await window.api.meta.doi(info.doi);
          } catch { /* fallback */ }
        }
        const nomeBase = caminho.split(/[\\/]/).pop().replace(/\.pdf$/i, '').replace(/[_-]+/g, ' ');
        if (!csl) {
          csl = {
            type: 'article-journal',
            title: info.titulo || nomeBase,
            DOI: info.doi || undefined,
          };
        }
        const criada = await importarCsl(csl, status);
        await window.api.bib.atualizar(criada.id, {
          textoExtraido: info.texto || '',
          metadadosIncompletos: !info.doi,
        });
        const comPdf = await window.api.bib.anexarPdf(criada.id, caminho);
        setBib((ant) => ({
          ...ant,
          refs: ant.refs.map((r) => (r.id === comPdf.id ? comPdf : r)),
        }));
        avisar(
          info.doi ? `PDF catalogado via DOI (${info.doi})!` : `PDF importado: ${comPdf.csl.title}`,
          'ok'
        );
      } catch (e) {
        avisar(`Erro ao importar PDF: ${e.message}`, 'erro');
      }
    }
  };

  const importarPastaDePdfsDireto = async () => {
    const caminhos = await window.api.dialogo.escolherPastaComPdfs();
    if (caminhos?.length) await importarPdfs(caminhos, 'a_ler');
    else if (caminhos) avisar('Nenhum arquivo .pdf encontrado nessa pasta.', 'info');
  };

  const baixarPdfDeUmaRef = async (r) => {
    try {
      avisar(`Buscando PDF gratuito (Unpaywall/OpenAlex) para: ${semHtml(r.csl?.title).slice(0, 45)}…`, 'info', 2500);
      const res = await window.api.meta.buscarPdfAberto(r.id);
      await recarregarBiblioteca();
      if (res.baixado) avisar('PDF gratuito baixado e anexado ao item!', 'ok');
      else avisar('Link localizado e aberto no navegador.', 'info');
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const baixarPdfsEmLote = async () => {
    const semPdf = refsFiltradas.filter((r) => !r.pdf && (r.csl?.DOI || r.csl?.PMID));
    if (!semPdf.length) {
      avisar('Nenhum item sem PDF (com DOI/PMID) na lista atual.', 'info');
      return;
    }
    setBaixandoLote(true);
    let baixados = 0;
    for (const r of semPdf) {
      try {
        const res = await window.api.meta.buscarPdfAberto(r.id);
        if (res.baixado) baixados++;
      } catch { /* próximo */ }
    }
    await recarregarBiblioteca();
    setBaixandoLote(false);
    avisar(`Concluído: ${baixados} de ${semPdf.length} PDFs baixados!`, 'ok');
  };

  const anexarPdfManual = async (refId) => {
    const caminhos = await window.api.dialogo.escolherPdfs();
    if (!caminhos?.length) return;
    try {
      const bytes = await window.api.bib.lerArquivo(caminhos[0]);
      const info = await analisarPdf(bytes);
      if (info?.texto) {
        await window.api.bib.atualizar(refId, { textoExtraido: info.texto });
      }
      const atualizada = await window.api.bib.anexarPdf(refId, caminhos[0]);
      setBib((ant) => ({
        ...ant,
        refs: ant.refs.map((r) => (r.id === refId ? atualizada : r)),
      }));
      avisar('PDF anexado manualmente! Notas, PICO e texto para busca foram extraídos.', 'ok');
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const buscarPdfGoogleManual = (r) => {
    const csl = r?.csl || {};
    const q = csl.DOI
      ? csl.DOI
      : `${semHtml(csl.title) || ''} ${autoresResumo(csl) || ''} ${ano(csl) || ''} filetype:pdf`.trim();
    window.api.sistema.abrirLink(`https://scholar.google.com.br/scholar?q=${encodeURIComponent(q)}`);
    avisar('Google Acadêmico aberto! Baixe o PDF no navegador e depois clique em "📎" para anexar.', 'info');
  };

  const gerarInsightsPicosEmLote = async () => {
    if (!refsFiltradas.length) return;
    setGerandoInsightsLote(true);
    try {
      avisar('Consultando Fator de Impacto das revistas, citações e gerando Notas & PICO de todas as referências…', 'info', 4000);
      const ids = refsFiltradas.map((r) => r.id);
      const res = await window.api.meta.gerarInsightsLote({ ids, consultarOnline: true });
      await recarregarBiblioteca();
      avisar(
        `Pronto! Notas, PICO, Nível do Artigo e Nota da Revista gerados para ${res.atualizados} de ${res.total} referências!`,
        'ok'
      );
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setGerandoInsightsLote(false);
    }
  };

  const criarColecao = async (e) => {
    e.preventDefault();
    const nome = novaColecao.trim();
    if (!nome) return;
    const id =
      nome
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      Date.now().toString(36).slice(-3);
    const novas = [...(bib.colecoes || []), { id, nome }];
    await window.api.bib.salvarColecoes(novas);
    setBib((ant) => ({ ...ant, colecoes: novas }));
    setNovaColecao('');
    setVisao(`col:${id}`);
    setAbaSuperior('biblioteca');
  };

  const removerColecao = async (colId) => {
    const novas = (bib.colecoes || []).filter((c) => c.id !== colId);
    await window.api.bib.salvarColecoes(novas);
    setBib((ant) => ({ ...ant, colecoes: novas }));
    if (visao === `col:${colId}`) setVisao('todas');
  };

  // --- Contagens e seletores laterais (estilo Zotero/Mendeley) ---
  const refs = bib?.refs || [];
  const contagens = useMemo(() => {
    const m = {
      a_ler: 0,
      consultada: 0,
      citada: 0,
      descartada: 0,
      favoritos: 0,
      sem_pdf: 0,
      sem_colecao: 0,
      revisao: 0,
      lidos_recentes: 0,
    };
    for (const r of refs) {
      if (m[r.status] !== undefined) m[r.status]++;
      if (r.favorito) m.favoritos++;
      if (!r.pdf) m.sem_pdf++;
      if (!r.colecoes?.length) m.sem_colecao++;
      if (r.metadadosIncompletos || !r.csl?.author?.length || !ano(r.csl)) m.revisao++;
      if (r.ultimoAbertoEm || r.lido) m.lidos_recentes++;
    }
    return m;
  }, [refs]);

  const listaTags = useMemo(() => {
    const m = new Map();
    for (const r of refs) for (const t of r.tags || []) m.set(t, (m.get(t) || 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [refs]);

  const listaAutores = useMemo(() => {
    const m = new Map();
    for (const r of refs) {
      for (const a of r.csl?.author || []) {
        const fam = a.family || a.literal;
        if (fam) m.set(fam, (m.get(fam) || 0) + 1);
      }
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [refs]);

  const listaPeriodicos = useMemo(() => {
    const m = new Map();
    for (const r of refs) {
      const p = r.csl?.['container-title'];
      if (p) m.set(p, (m.get(p) || 0) + 1);
    }
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [refs]);

  const refsFiltradas = useMemo(() => {
    const q = normalizar(busca.trim());
    const lista = refs.filter((r) => {
      if (visao === 'favoritos' && !r.favorito) return false;
      if (visao === 'sem_pdf' && r.pdf) return false;
      if (visao === 'sem_colecao' && r.colecoes?.length > 0) return false;
      if (visao === 'revisao' && !(r.metadadosIncompletos || !r.csl?.author?.length || !ano(r.csl))) return false;
      if (visao === 'lidos_recentes' && !(r.ultimoAbertoEm || r.lido)) return false;
      if (visao.startsWith('autor:') && !(r.csl?.author || []).some((a) => (a.family || a.literal) === visao.slice(6))) return false;
      if (visao.startsWith('per:') && r.csl?.['container-title'] !== visao.slice(4)) return false;
      if (visao.startsWith('status:') && r.status !== visao.slice(7)) return false;
      if (visao.startsWith('col:') && !(r.colecoes || []).includes(visao.slice(4))) return false;
      if (visao.startsWith('tag:') && !(r.tags || []).includes(visao.slice(4))) return false;
      if (q) {
        if (escopoBusca === 'basico') {
          const bas = normalizar(`${r.csl?.title || ''} ${autoresResumo(r.csl)} ${ano(r.csl)} ${r.csl?.['container-title'] || ''}`);
          if (!bas.includes(q)) return false;
        } else if (escopoBusca === 'pdf') {
          if (!normalizar(r.textoExtraido || '').includes(q)) return false;
        } else if (!textoDeBusca(r).includes(q)) {
          return false;
        }
      }
      return true;
    });

    const mult = direcaoOrdem === 'asc' ? 1 : -1;
    return lista.sort((a, b) => {
      if (colunaOrdem === 'ano') return mult * String(ano(a.csl)).localeCompare(String(ano(b.csl)));
      if (colunaOrdem === 'autor') return mult * autoresResumo(a.csl).localeCompare(autoresResumo(b.csl));
      if (colunaOrdem === 'titulo') return mult * semHtml(a.csl?.title).localeCompare(semHtml(b.csl?.title));
      if (colunaOrdem === 'periodico') {
        return mult * String(a.csl?.['container-title'] || '').localeCompare(String(b.csl?.['container-title'] || ''));
      }
      if (colunaOrdem === 'status') return mult * String(a.status).localeCompare(String(b.status));
      return mult * String(a.adicionadoEm || '').localeCompare(String(b.adicionadoEm || ''));
    });
  }, [refs, visao, busca, escopoBusca, colunaOrdem, direcaoOrdem]);

  const alternarOrdenacaoColuna = (col) => {
    if (colunaOrdem === col) {
      setDirecaoOrdem((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setColunaOrdem(col);
      setDirecaoOrdem(col === 'ano' || col === 'adicionado' ? 'desc' : 'asc');
    }
  };

  const refAtiva = useMemo(() => {
    if (!selecionadas.length) return refsFiltradas[0] || null;
    return refs.find((r) => r.id === selecionadas[selecionadas.length - 1]) || null;
  }, [refs, refsFiltradas, selecionadas]);

  const copiarSelecionadas = async (tipo, idsEspecificos = null) => {
    const ids = idsEspecificos || (selecionadas.length ? selecionadas : refAtiva ? [refAtiva.id] : []);
    if (!ids.length) {
      avisar('Selecione pelo menos um item na tabela.', 'info');
      return;
    }
    try {
      const n = await window.api.cit.copiar({
        ids,
        estilo: cfg.estilo,
        idioma: cfg.idioma,
        tipo,
      });
      if (tipo === 'citacao') {
        for (const id of ids) await atualizarRef(id, { status: 'citada' });
      }
      avisar(
        tipo === 'citacao'
          ? `Citação copiada (${n} ${n === 1 ? 'item marcado como Citada' : 'itens marcados como Citada'})! Cole no Word.`
          : `Bibliografia com ${n} ${n === 1 ? 'referência copiada' : 'referências copiadas'} para o Word!`,
        'ok'
      );
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  if (!cfg) {
    return (
      <div
        style={{
          position: 'fixed',
          inset: 0,
          background: 'radial-gradient(circle at 50% 40%, #1e293b 0%, #0f172a 100%)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          color: '#f8fafc',
          zIndex: 99999,
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        <div style={{ textAlign: 'center', maxWidth: 440, padding: 20 }}>
          <div style={{ position: 'relative', width: 96, height: 96, margin: '0 auto 20px' }}>
            <svg width="96" height="96" viewBox="0 0 120 120" fill="none">
              <defs>
                <linearGradient id="logo-grad-react" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#38bdf8" />
                  <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
              </defs>
              <circle cx="60" cy="60" r="54" stroke="url(#logo-grad-react)" strokeWidth="3" opacity="0.4" strokeDasharray="6 6" />
              <path d="M60 28 L94 44 L94 82 L60 66 Z" fill="url(#logo-grad-react)" opacity="0.85" />
              <path d="M60 28 L26 44 L26 82 L60 66 Z" fill="url(#logo-grad-react)" opacity="0.65" />
              <path d="M60 66 L60 102" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" />
            </svg>
          </div>
          <h1
            style={{
              margin: '0 0 8px',
              fontSize: '28px',
              fontWeight: 800,
              letterSpacing: '4px',
              background: 'linear-gradient(135deg, #ffffff 0%, #38bdf8 60%, #818cf8 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            BIBLIOGRAFIA
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: '13px', color: '#94a3b8', letterSpacing: '1px' }}>
            Gerenciador Científico & Citações CSL
          </p>
          <div
            style={{
              width: '180px',
              height: '4px',
              background: 'rgba(255, 255, 255, 0.1)',
              borderRadius: '99px',
              overflow: 'hidden',
              margin: '0 auto 14px',
              position: 'relative',
            }}
          >
            <div
              style={{
                width: '60%',
                height: '100%',
                background: 'linear-gradient(90deg, #38bdf8, #818cf8)',
                borderRadius: '99px',
              }}
            />
          </div>
          <div style={{ fontSize: '12px', color: '#64748b' }}>Carregando sua biblioteca…</div>
        </div>
      </div>
    );
  }
  if (!cfg.libraryPath || !bib) {
    return (
      <div className="tela-boas-vindas">
        <div className="card-boas-vindas">
          <div className="logo-boas-vindas">
            <Icone nome="book" tam={36} />
            <div>
              <h1>Bibliografia</h1>
              <p>Gerenciador Científico &amp; Auditoria Forense de Manuscritos</p>
            </div>
          </div>
          <p className="explicacao">
            Escolha a pasta onde sua biblioteca ficará salva. Seus artigos, fichamentos e PDFs ficarão sincronizados com segurança na sua nuvem pessoal.
          </p>
          <div className="opcoes-pastas">
            {(cfg.sugestoes || []).map((s, idx) => (
              <button
                key={s.caminho}
                className="botao-pasta-sugerida"
                onClick={() => escolherPastaBiblioteca(s.caminho)}
              >
                <Icone nome="folder" tam={22} />
                <div>
                  <strong>{s.nome} {idx === 0 ? '(Recomendado)' : ''}</strong>
                  <span>{s.caminho}</span>
                </div>
              </button>
            ))}
            <button
              className="botao-pasta-outra"
              onClick={async () => {
                const p = await window.api.dialogo.escolherPasta();
                if (p) escolherPastaBiblioteca(p);
              }}
            >
              <Icone nome="folder" tam={18} /> Escolher outra pasta no computador…
            </button>
          </div>
        </div>
      </div>
    );
  }

  const pdfAbaAtivaId = abaSuperior.startsWith('pdf:') ? abaSuperior.slice(4) : null;
  const refPdfAba = pdfAbaAtivaId ? refs.find((r) => r.id === pdfAbaAtivaId) : null;

  return (
    <div
      className="zotero-shell layout-com-rail"
      onDragOver={(e) => {
        if (e.dataTransfer?.types?.includes('Files')) {
          e.preventDefault();
          setArrastandoPdf(true);
        }
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setArrastandoPdf(false);
      }}
      onDrop={async (e) => {
        e.preventDefault();
        setArrastandoPdf(false);
        const arquivos = [...(e.dataTransfer?.files || [])]
          .map((f) => window.api.sistema.caminhoDoArquivo(f))
          .filter((p) => p && p.toLowerCase().endsWith('.pdf'));
        if (arquivos.length) {
          setAbaSuperior('biblioteca');
          await importarPdfs(arquivos, 'a_ler');
        }
      }}
    >
      {arrastandoPdf && (
        <div className="overlay-drop">
          <div className="caixa-drop">
            <Icone nome="upload" tam={42} />
            <h3>Solte os PDFs para adicionar à Minha Biblioteca</h3>
            <p>O DOI é lido automaticamente e os metadados vêm do Crossref/PubMed.</p>
          </div>
        </div>
      )}

      {/* 1. BARRA LATERAL VERTICAL PERMANENTE ESTILO MENDELEY / ACTIVITY RAIL */}
      <aside className="rail-vertical-zotero">
        <div className="rail-topo-marca" title="Bibliografia Científica">
          <div className="rail-logo-icone">
            <Icone nome="book" tam={22} />
          </div>
        </div>

        <div className="rail-grupo-itens">
          <button
            className={`rail-item ${abaSuperior === 'biblioteca' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('biblioteca')}
            title="Minha Biblioteca de Referências"
          >
            <span className="rail-icone">📚</span>
            <span className="rail-rotulo">Biblioteca</span>
            <span className="rail-badge">{refs.length}</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'buscadores' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('buscadores')}
            title="Buscadores Saúde & Contas de Acesso"
          >
            <span className="rail-icone">🔍</span>
            <span className="rail-rotulo">Buscadores</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'word' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('word')}
            title="Manuscrito (.DOCX - Consultadas × Citadas)"
          >
            <span className="rail-icone">📝</span>
            <span className="rail-rotulo">Manuscrito</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'auditoria' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('auditoria')}
            title="Auditoria Reversa (.DOCX/PDF)"
          >
            <span className="rail-icone">🔬</span>
            <span className="rail-rotulo">Auditoria</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'prisma' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('prisma')}
            title="Triagem Sistemática & Fluxograma PRISMA 2020"
          >
            <span className="rail-icone">📊</span>
            <span className="rail-rotulo">PRISMA</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'mendeley' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('mendeley')}
            title="Grafo de Citações & Caderno de Síntese"
          >
            <span className="rail-icone">🔗</span>
            <span className="rail-rotulo">Grafo</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'ajuda' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('ajuda')}
            title="Manual & Tutorial Passo a Passo Interativo"
          >
            <span className="rail-icone">❓</span>
            <span className="rail-rotulo">Tutorial</span>
          </button>
        </div>

        <div className="rail-rodape">
          <button
            className="rail-item-rodape"
            onClick={() => setModalVersaoAberto(true)}
            title="Sobre o Bibliografia, Versão 1.0.0 & Diagnóstico do Sistema"
            style={{ fontWeight: 800, fontSize: '11px', letterSpacing: '0.2px' }}
          >
            v1.0.0
          </button>
          <button
            className="rail-item-rodape"
            onClick={alternarTema}
            title={cfg.tema === 'escuro' ? 'Mudar para Modo Claro' : 'Mudar para Modo Escuro'}
          >
            <Icone nome={cfg.tema === 'escuro' ? 'sun' : 'moon'} tam={20} />
          </button>
        </div>
      </aside>

      {/* 2. ÁREA PRINCIPAL DA APLICAÇÃO */}
      <div className="conteudo-principal-com-rail">
        {/* BARRA SUPERIOR: SELETOR DE PROJETO + ABAS DE PDFS ABERTOS + STATUS DA NUVEM */}
        <div className="barra-superior-limpa">
        {/* Seletor de Projetos com Exibição em Destaque do Projeto Ativo */}
        <div className="seletor-projeto-topo" onClick={(e) => e.stopPropagation()}>
          <button
            className="btn-projeto-atual"
            onClick={() => {
              atualizarProjetosRecentes();
              setMenuProjetosAberto((v) => !v);
            }}
            title={`Projeto ativo: ${bib?.raiz || 'Pasta de trabalho'}\nClique para alternar entre pastas de projetos ou abrir outro diretório.`}
          >
            <span className="icone-pasta-proj">📁</span>
            <div className="badge-projeto-meta">
              <span className="rotulo-proj-topo">PROJETO ATIVO</span>
              <span className="nome-proj-atual">
                {bib?.raiz ? bib.raiz.split(/[\\/]/).pop() : 'Minha Biblioteca'}
              </span>
            </div>
            <span className="badge-contador-obras-proj" title={`${refs.length} obras cadastradas neste projeto`}>
              {refs.length} {refs.length === 1 ? 'obra' : 'obras'}
            </span>
            <span className="caret-proj-topo">▾ Alternar</span>
          </button>
          {menuProjetosAberto && (
            <div className="menu-dropdown-projetos">
              <div className="cabecalho-dropdown-proj">
                <div className="cabecalho-dropdown-titulo">
                  <span>📚 Projetos &amp; Bibliotecas</span>
                  <span className="badge-total-proj">{Math.min(10, projetosRecentes.length)} recentes</span>
                </div>
                <div className="subtitulo-dropdown-proj">Selecione para alternar instantaneamente:</div>
              </div>
              <div className="lista-projetos-recentes">
                {projetosRecentes.slice(0, 10).map((p, idx) => {
                  const ehAtivo = p.caminho === bib?.raiz;
                  const nomeExibicao = p.nome || p.caminho.split(/[\\/]/).pop();
                  return (
                    <div
                      key={p.caminho}
                      className={`item-proj-recente ${ehAtivo ? 'ativo' : ''}`}
                      onClick={() => alternarParaProjeto(p.caminho, p.nome)}
                    >
                      <span className="item-proj-indice">#{idx + 1}</span>
                      <div className="item-proj-info">
                        <div className="item-proj-linha-superior">
                          <span className="item-proj-nome">{nomeExibicao}</span>
                          {ehAtivo && <span className="item-proj-badge-ativo">✓ Ativo</span>}
                        </div>
                        <span className="item-proj-caminho" title={p.caminho}>{p.caminho}</span>
                      </div>
                      {ehAtivo ? <span className="item-proj-check">●</span> : <span className="item-proj-seta">→</span>}
                    </div>
                  );
                })}
              </div>
              <div className="divisor-dropdown-proj" />
              <button className="btn-acao-proj" onClick={escolherOutroProjeto}>
                📂 Abrir Outra Pasta no Computador ou OneDrive…
              </button>
              <button
                className="btn-acao-proj destaque"
                onClick={() => {
                  setMenuProjetosAberto(false);
                  setModalNovoProjeto(true);
                }}
              >
                ➕ Criar Nova Pasta de Projeto Acadêmico…
              </button>
            </div>
          )}
        </div>

        {/* Abas de PDFs abertos exclusivamente no topo */}
        <div className="container-abas-pdf-topo">
          {abasPdf.map((idPdf) => {
            const r = refs.find((x) => x.id === idPdf);
            if (!r) return null;
            const rotulo = `${autoresResumo(r.csl) || 'PDF'} (${ano(r.csl) || 's.d.'}) — ${semHtml(r.csl?.title).slice(0, 30)}`;
            return (
              <button
                key={idPdf}
                className={`aba-zotero aba-pdf ${abaSuperior === `pdf:${idPdf}` ? 'ativa' : ''}`}
                onClick={() => setAbaSuperior(`pdf:${idPdf}`)}
                title={semHtml(r.csl?.title)}
              >
                <span>📄 {rotulo}</span>
                <span className="fechar-aba-zotero" onClick={(e) => fecharAbaPdf(idPdf, e)}>
                  ×
                </span>
              </button>
            );
          })}
        </div>

        <div className="abas-direita-zotero">
          <span
            className="pill-nuvem-topo"
            onClick={() => window.api.bib.abrirPasta()}
            title={`Abrir pasta sincronizada: ${bib.raiz}`}
          >
            ☁ OneDrive sincronizado
          </span>
          <button
            className="btn-icone"
            onClick={alternarTema}
            title={cfg.tema === 'escuro' ? 'Modo Claro' : 'Modo Escuro'}
          >
            <Icone nome={cfg.tema === 'escuro' ? 'sun' : 'moon'} tam={16} />
          </button>
        </div>
      </div>

      {/* 2. BARRA DE FERRAMENTAS REFINADA (AGRUPADA, SEM EMPILHAMENTO) */}
      {!refPdfAba && (
        <div className="toolbar-zotero">
        <div className="grupo-toolbar-esq">
          {/* Menu Consolidado: "+ Adicionar" */}
          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-toolbar-zotero destaque"
              onClick={() => setMenuNovoItem((v) => !v)}
              title="Adicionar referências ou arquivos"
            >
              <span style={{ color: '#16a34a', fontWeight: 900 }}>＋</span> Adicionar ▾
            </button>
            {menuNovoItem && (
              <div className="menu-flutuante-zotero">
                <button onClick={() => { setMenuNovoItem(false); setVarinhaAberta(true); }}>
                  🪄 <strong>Colar DOI / PMID / ISBN…</strong>
                </button>
                <button onClick={async () => { setMenuNovoItem(false); const c = await window.api.dialogo.escolherPdfs(); if (c?.length) await importarPdfs(c, 'a_ler'); }}>
                  📎 Adicionar Arquivos PDF…
                </button>
                <button onClick={() => { setMenuNovoItem(false); importarPastaDePdfsDireto(); }}>
                  📁 Importar Pasta de PDFs…
                </button>
                <button onClick={() => { setMenuNovoItem(false); importarArquivoRisBib(); }}>
                  📥 Importar RIS / BibTeX (.ris, .bib)…
                </button>
                <button onClick={() => { setMenuNovoItem(false); importarMendeley(); }}>
                  📦 Importar do Mendeley (SQLite)…
                </button>
                <div className="divisor-menu" />
                <button onClick={() => { setMenuNovoItem(false); setModalAdicionar(true); }}>
                  🔍 Busca Completa (Online)…
                </button>
              </div>
            )}
          </div>

          {varinhaAberta && (
            <form onSubmit={executarVarinhaMagica} className="form-varinha-zotero">
              <input
                autoFocus
                value={textoVarinha}
                onChange={(e) => setTextoVarinha(e.target.value)}
                placeholder="Cole o DOI, PMID ou ISBN e tecle Enter…"
              />
              <button type="submit" className="btn pequeno primario" disabled={carregandoVarinha}>
                {carregandoVarinha ? '…' : 'OK'}
              </button>
            </form>
          )}

          {/* Menu "Ações Inteligentes" */}
          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-toolbar-zotero"
              onClick={() => setMenuAcoesRapidas((v) => !v)}
              title="Ações automatizadas com IA e nuvem"
            >
              ⚡ Ações ▾
            </button>
            {menuAcoesRapidas && (
              <div className="menu-flutuante-zotero">
                <button onClick={() => { setMenuAcoesRapidas(false); baixarPdfsEmLote(); }} disabled={baixandoLote}>
                  ⬇ Buscar PDFs Gratuitos (Unpaywall)
                </button>
                <button onClick={() => { setMenuAcoesRapidas(false); gerarInsightsPicosEmLote(); }} disabled={gerandoInsightsLote}>
                  ✨ Fichamento, PICO &amp; Insights (IA)
                </button>
                <button onClick={() => { setMenuAcoesRapidas(false); setAbaSuperior('word'); }}>
                  📝 Sincronizar Citações com Word
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grupo-toolbar-centro">
          <label className="seletor-estilo">
            <span>Estilo:</span>
            <select value={cfg.estilo} onChange={(e) => mudarEstilo(e.target.value)}>
              {estilos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-toolbar-zotero" onClick={() => setModalEstilos(true)} title="Instalar estilos CSL">
            + Estilos
          </button>
          <button className="btn-toolbar-zotero" onClick={() => copiarSelecionadas('citacao')} title="Copiar citação">
            📋 Citar
          </button>
          <button className="btn-toolbar-zotero destaque-azul" onClick={() => setModalExportarWord(true)} title="Gerar bibliografia">
            📄 Bibliografia
          </button>
        </div>

        {/* Direita: Caixa de Busca Estilo Zotero com Escopo */}
        <div className="busca-zotero">
          <Icone nome="search" tam={14} />
          <input
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              if (abaSuperior !== 'biblioteca') setAbaSuperior('biblioteca');
            }}
            placeholder="Pesquisar título, autor, ano, tag ou dentro do PDF…"
          />
          <select
            value={escopoBusca}
            onChange={(e) => setEscopoBusca(e.target.value)}
            title="Escopo da busca (igual ao Zotero)"
          >
            <option value="basico">Título, Autor, Ano</option>
            <option value="tudo">Todos os Campos e Notas</option>
            <option value="pdf">Texto dos PDFs</option>
          </select>
          {busca && (
            <button className="btn-icone" onClick={() => setBusca('')}>
              ×
            </button>
          )}
        </div>
      </div>
      )}

      {/* 3. FAIXA DE TUTORIAL PASSO A PASSO CONTEXTUAL DE CADA ETAPA */}
      {refPdfAba && (
        <TutorialEtapa
          idEtapa="pdf"
          abertoPorPadrao={true}
          titulo="Como Ler o PDF, Navegar com Rolagem Livre e Marcar Trechos Citados"
          resumo="Navegue pelas páginas com barras de rolagem vertical e horizontal, use zoom sem cortes e selecione frases diretamente no texto para grifar ou citar no Word."
          passos={[
            {
              titulo: 'Navegação e Rolagem Livre',
              texto: 'Utilize as barras de rolagem vertical e horizontal acessíveis nas bordas do leitor. Ajuste o zoom com Zoom + / Zoom − mantendo a página centralizada e totalmente visível.',
            },
            {
              titulo: 'Grifar com a Barra Flutuante',
              texto: 'Selecione qualquer trecho no PDF com o mouse. Uma barra de cores surge instantaneamente sobre o texto para grifar com Amarelo (Conceito), Verde (PICO), Azul (Citação) ou Rosa (Crítica).',
            },
            {
              titulo: 'Marcar Página e Copiar para o Word',
              texto: 'Ao selecionar uma frase citada, clique em "✔ Salvar". O sistema indexa a página exata (ex: p. 4) e disponibiliza o botão "Copiar Resumo de Comentários" para colar no Word.',
            },
          ]}
        />
      )}

      {!refPdfAba && abaSuperior === 'biblioteca' && (
        <div className="banner-cockpit-projeto">
          <div className="cockpit-linha-superior">
            <div className="cockpit-bloco-identificacao">
              <div className="cockpit-tag-com-caminho">
                <span className="cockpit-badge-status">PROJETO ATIVO</span>
                <span className="cockpit-caminho-projeto" title={bib?.raiz}>
                  📍 <code>{bib?.raiz || 'Pasta de trabalho'}</code>
                </span>
                <button
                  type="button"
                  className="btn-abrir-pasta-mini"
                  onClick={() => window.api.bib.abrirPasta()}
                  title="Abrir esta pasta no Windows Explorer"
                >
                  Abrir pasta ↗
                </button>
              </div>
              <h2 className="cockpit-titulo-projeto">
                📁 {bib?.raiz ? bib.raiz.split(/[\\/]/).pop() : 'Minha Biblioteca'}
              </h2>
            </div>

            <div className="cockpit-bloco-metricas">
              <div className="cockpit-metrica-card">
                <span className="cockpit-metrica-num">{refs.length}</span>
                <span className="cockpit-metrica-legenda">Obras</span>
              </div>
              <div className="cockpit-metrica-card">
                <span className="cockpit-metrica-num">
                  {refs.filter((r) => r.anexos?.some((a) => a.tipo === 'pdf')).length}
                </span>
                <span className="cockpit-metrica-legenda">Com PDF</span>
              </div>
              <div className="cockpit-metrica-card">
                <span className="cockpit-metrica-num">{contagens.citada || 0}</span>
                <span className="cockpit-metrica-legenda">Citadas</span>
              </div>
              <button
                type="button"
                className="btn-cockpit-alternar"
                onClick={() => {
                  atualizarProjetosRecentes();
                  setMenuProjetosAberto(true);
                }}
                title="Trocar para outro projeto acadêmico ou pasta"
              >
                ⇄ Alternar Projeto
              </button>
              <button
                type="button"
                className="btn-cockpit-recolher"
                onClick={alternarCockpit}
                title={mostrarCockpit ? 'Recolher Central de Início Rápido' : 'Expandir Central de Início Rápido'}
              >
                {mostrarCockpit ? '▲ Recolher Ações' : '▼ Ações Rápidas'}
              </button>
            </div>
          </div>

          {mostrarCockpit && (
            <div className="cockpit-grid-acoes">
              <div className="cockpit-card-acao" onClick={() => setAbaSuperior('buscadores')}>
                <div className="cockpit-card-icone">🔍</div>
                <div className="cockpit-card-conteudo">
                  <strong>1. Buscadores de Literatura</strong>
                  <p>PubMed, Europe PMC, SciELO, OpenAlex, Cochrane. Importe com 1 clique.</p>
                </div>
                <span className="cockpit-card-seta">→</span>
              </div>

              <div className="cockpit-card-acao" onClick={() => setVarinhaAberta(true)}>
                <div className="cockpit-card-icone">🪄</div>
                <div className="cockpit-card-conteudo">
                  <strong>2. Inserir via DOI / PMID</strong>
                  <p>Cole DOI/PMID para preenchimento de metadados e download de PDF.</p>
                </div>
                <span className="cockpit-card-seta">→</span>
              </div>

              <div className="cockpit-card-acao" onClick={() => setAbaSuperior('prisma')}>
                <div className="cockpit-card-icone">📊</div>
                <div className="cockpit-card-conteudo">
                  <strong>3. Triagem PRISMA 2020</strong>
                  <p>Seleção duplo-cega de artigos, desduplicação e diagrama de fluxo.</p>
                </div>
                <span className="cockpit-card-seta">→</span>
              </div>

              <div className="cockpit-card-acao" onClick={() => setModalExportarWord(true)}>
                <div className="cockpit-card-icone">📝</div>
                <div className="cockpit-card-conteudo">
                  <strong>4. Citar no Manuscrito .DOCX</strong>
                  <p>Exportar normas ABNT/Vancouver e auditar referências contra alucinações.</p>
                </div>
                <span className="cockpit-card-seta">→</span>
              </div>
            </div>
          )}
        </div>
      )}

      {!refPdfAba && abaSuperior === 'biblioteca' && (
        <TutorialEtapa
          idEtapa="biblioteca"
          abertoPorPadrao={true}
          titulo="Passo a Passo da Minha Biblioteca (Baixar PDFs → Ler/Grifar → Marcar Uso → Exportar Word)"
          resumo="Siga os 4 passos abaixo para usar sua biblioteca ou clique em '❓ Manual & Tutorial Passo a Passo' lá no topo para abrir o manual completo."
          passos={[
            {
              titulo: 'Baixar Artigos e PDFs',
              texto: 'Cole um DOI/PMID na "🪄 Varinha Mágica", pesquise temas em "🔍 Buscadores Saúde" ou clique em "⬇ Buscar PDFs Gratuitos" para baixar os PDFs automaticamente.',
              rotuloAcao: '⬇ Buscar PDFs Gratuitos',
              acao: baixarPdfsEmLote,
            },
            {
              titulo: 'Ler PDF e Marcar Trecho Citado',
              texto: 'Dê 2 cliques em qualquer artigo com botão azul "PDF" na tabela para abrir o PDF em aba, grifar e clicar em "❝ Marcar como Trecho Citado" (salva a página!).',
              rotuloAcao: '📎 Adicionar PDFs do PC',
              acao: async () => {
                const p = await window.api.dialogo.escolherPdfs();
                if (p?.length) await importarPdfs(p, 'a_ler');
              },
            },
            {
              titulo: 'Marcar o que Vai Usar (Coluna Uso/Status)',
              texto: 'Na tabela abaixo, mude o status do artigo entre "A ler" (separado), "Consultada" (lido/estudado) ou "Citada" (usado no texto do Word).',
              rotuloAcao: '📖 Ver Manual Completo',
              acao: () => setAbaSuperior('ajuda'),
            },
            {
              titulo: 'Exportar para o Word ou Auditar .DOCX',
              texto: 'Selecione um artigo e clique em "📋 Citar" ou "📄 Criar Bibliografia" na barra acima — ou use a aba "✔ Auditoria Reversa" para conferir um Word pronto!',
              rotuloAcao: '📄 Criar Bibliografia p/ Word',
              acao: () => setModalExportarWord(true),
            },
          ]}
        />
      )}

      {!refPdfAba && abaSuperior === 'buscadores' && (
        <TutorialEtapa
          idEtapa="buscadores"
          abertoPorPadrao={true}
          titulo="Passo a Passo: Como Pesquisar Artigos na Saúde e Importar Direto para o App"
          resumo="Pesquise em 28 bases científicas (PubMed, Europe PMC, OpenAlex, SciELO, LILACS) sem sair do programa."
          passos={[
            {
              titulo: 'Digite o tema da pesquisa',
              texto: 'Escreva as palavras-chave na barra abaixo (ex.: "diabetes exercise") para ver na hora quantos artigos existem em cada base.',
            },
            {
              titulo: 'Busque e importe dentro do próprio App',
              texto: 'Nos cartões do PubMed, Europe PMC, OpenAlex ou Crossref, clique em "⚡ Buscar Artigos Aqui no App" e depois em "+ Biblioteca".',
            },
            {
              titulo: 'Baixe os PDFs gratuitos',
              texto: 'Depois de importar os artigos para a Biblioteca, clique em "⬇ Buscar PDFs Gratuitos" na Biblioteca para baixar os PDFs Open Access.',
              rotuloAcao: '📚 Voltar à Biblioteca e Baixar PDFs',
              acao: () => {
                setAbaSuperior('biblioteca');
                baixarPdfsEmLote();
              },
            },
          ]}
        />
      )}

      {!refPdfAba && abaSuperior === 'word' && (
        <TutorialEtapa
          idEtapa="word"
          abertoPorPadrao={true}
          titulo="Passo a Passo: Como Exportar Citações e Referências (Consultadas × Citadas) para o Word"
          resumo="Gere separadamente a lista de Referências Citadas no texto e a Bibliografia Consultada em ABNT, Vancouver ou APA."
          passos={[
            {
              titulo: 'Escolha a norma de formatação',
              texto: 'Selecione ABNT, Vancouver, APA 7ª ed. ou instale normas de mais de 2.800 revistas e universidades brasileiras.',
              rotuloAcao: '+ Instalar Outros Estilos',
              acao: () => setModalEstilos(true),
            },
            {
              titulo: 'Copie as Citadas ou as Consultadas',
              texto: 'Clique em "📋 Copiar Bibliografia das Citadas" (obras que entraram no texto) ou "📋 Copiar Bibliografia das Consultadas" e dê Ctrl+V no Word.',
            },
            {
              titulo: 'Vincule um .DOCX ou use o Painel no Word',
              texto: 'Você também pode escolher um arquivo .docx para sincronizar o que já foi citado ou instalar o suplemento lateral dentro do Microsoft Word.',
            },
          ]}
        />
      )}

      {!refPdfAba && abaSuperior === 'auditoria' && (
        <TutorialEtapa
          idEtapa="auditoria"
          abertoPorPadrao={true}
          titulo="Passo a Passo da Auditoria Reversa e Forense (.DOCX, .PDF ou Texto)"
          resumo="Audite citações no texto × referências com conferência determinística, eliminação de falsos alarmes, download de PDFs em pasta à sua escolha e relatório forense para IA."
          passos={[
            {
              titulo: '1. Carregar Arquivo ou Colar Texto',
              texto: 'Clique em "Carregar Arquivo (.DOCX, .PDF, .TXT)" ou cole o manuscrito. O algoritmo analisa o corpo do texto e a seção de REFERÊNCIAS mantendo cada entrada completa sem fragmentação.',
            },
            {
              titulo: '2. Escolher Pasta de Destino (OneDrive / PC)',
              texto: 'Defina a pasta onde os artigos e PDFs autenticados devem ser salvos. Você pode apontar para sua pasta do OneDrive ou qualquer diretório do seu computador.',
            },
            {
              titulo: '3. Executar a Auditoria Completa',
              texto: 'O sistema cruza as citações narrativas e parentéticas (norma ABNT NBR 10520:2023), autentica DOIs no Crossref/PubMed, elimina alucinações de IA e baixa os PDFs gratuitos.',
            },
            {
              titulo: '4. Relatório Forense e Assistente de IA',
              texto: 'Veja o diagnóstico de cada citação com Parágrafo (§), Linha e Página do PDF. Clique em "🤖 Copiar Relatório p/ Colar na IA" para obter assistência direta de reescrita no ChatGPT ou Claude.',
            },
          ]}
        />
      )}

      {!refPdfAba && abaSuperior === 'prisma' && (
        <TutorialEtapa
          idEtapa="prisma"
          abertoPorPadrao={true}
          titulo="Passo a Passo: Como Fazer Remoção de Duplicatas, Triagem Cega e Fluxograma PRISMA 2020"
          resumo="Ideal para revisões sistemáticas, integrativas e de escopo na área da saúde."
          passos={[
            {
              titulo: '1. Detectar e Mesclar Duplicatas',
              texto: 'Na primeira sub-aba, veja pares de artigos repetidos vindos de bases diferentes e clique em "Mesclar" sem perder notas nem PDFs.',
            },
            {
              titulo: '2. Triagem Cega (Estilo Rayyan)',
              texto: 'Na sub-aba Triagem, leia título/resumo e clique em "✅ Incluir", "❓ Talvez" ou "❌ Excluir (informando o motivo para o PRISMA)".',
            },
            {
              titulo: '3. Exportar Fluxograma PRISMA 2020',
              texto: 'Na sub-aba PRISMA 2020, os números são preenchidos automaticamente a partir da sua biblioteca e você pode copiar o fluxograma oficial.',
            },
          ]}
        />
      )}

      {!refPdfAba && abaSuperior === 'mendeley' && (
        <TutorialEtapa
          idEtapa="mendeley"
          abertoPorPadrao={true}
          titulo="Passo a Passo: Caderno de Síntese, Sugestões por IA e Pasta Downloads Monitorada"
          resumo="Recursos clássicos do Mendeley Desktop & Reference Manager integrados à sua biblioteca."
          passos={[
            {
              titulo: '📓 Caderno de Leitura (Notebook)',
              texto: 'Anote sínteses comparando vários artigos ao mesmo tempo e insira citações clicáveis direto nas suas notas.',
            },
            {
              titulo: '✨ Sugestões de Artigos Parecidos',
              texto: 'Escolha qualquer artigo da sua biblioteca para o programa buscar na base OpenAlex outros estudos semelhantes.',
            },
            {
              titulo: '📥 Pasta Downloads do Windows',
              texto: 'Veja todos os PDFs que você baixou recentemente no navegador e traga para sua biblioteca com 1 único clique!',
            },
          ]}
        />
      )}

      {/* 4. CORPO PRINCIPAL: OU UMA ABA DE PDF/FERRAMENTA, OU OS 3 PAINÉIS CLÁSSICOS DO ZOTERO/MENDELEY */}
      {/* ReverseAuditView mantido vivo em memória para continuar executando mesmo ao trocar de aba */}
      <div
        style={{
          display: !refPdfAba && abaSuperior === 'auditoria' ? 'flex' : 'none',
          flex: 1,
          minHeight: 0,
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <ReverseAuditView
          refs={refs}
          bib={bib}
          estadoAuditoria={estadoAuditoria}
          setEstadoAuditoria={setEstadoAuditoria}
          aoMudarRodando={setAuditoriaEmExecucao}
          onImportarCsl={importarCsl}
          onRecarregar={recarregarBiblioteca}
          onAbrirPdfNaPagina={(r, pag) => abrirPdfEmAba(r, pag)}
          onIrParaBiblioteca={(termoOuId) => {
            setAbaSuperior('biblioteca');
            if (termoOuId) {
              setVisao('todas');
              setBusca(termoOuId);
              if (refs.some((x) => x.id === termoOuId)) {
                setSelecionadas([termoOuId]);
              }
            }
          }}
        />
      </div>

      {refPdfAba ? (
        <PdfReaderModal
          emAba
          refItem={refPdfAba}
          paginaInicial={paginasPdfAba[refPdfAba.id] || 1}
          onFechar={() => fecharAbaPdf(refPdfAba.id)}
          onAtualizarRef={atualizarRef}
        />
      ) : abaSuperior === 'buscadores' ? (
        <SearchHub refs={refs} proxy={cfg.proxy} onMudarProxy={mudarProxy} onImportarCsl={importarCsl} />
      ) : abaSuperior === 'word' ? (
        <WordHubView
          refs={refs}
          documentos={bib.documentos || []}
          estilo={cfg.estilo}
          estilos={estilos}
          idioma={cfg.idioma}
          onMudarEstilo={mudarEstilo}
          onAtualizarRef={atualizarRef}
          onRecarregar={recarregarBiblioteca}
        />
      ) : abaSuperior === 'auditoria' ? null : abaSuperior === 'prisma' ? (
        <PrismaAndScreeningView refs={refs} onAtualizarRef={atualizarRef} onRecarregar={recarregarBiblioteca} />
      ) : abaSuperior === 'mendeley' ? (
        <MendeleyExtras refs={refs} onImportarCsl={importarCsl} onImportarPdfs={importarPdfs} />
      ) : abaSuperior === 'ajuda' ? (
        <HelpGuideView
          irParaAba={(novaAba) => setAbaSuperior(novaAba)}
          aoAcionarVarinha={() => setVarinhaAberta(true)}
          aoAdicionarPdfs={async () => {
            const p = await window.api.dialogo.escolherPdfs();
            if (p?.length) await importarPdfs(p, 'a_ler');
          }}
          aoImportarPasta={importarPastaDePdfsDireto}
          aoBuscarPdfsGratuitos={baixarPdfsEmLote}
          aoAbrirModalEstilos={() => setModalEstilos(true)}
          aoAbrirModalCadastro={() => setModalAdicionar(true)}
        />
      ) : (
        /* OS 3 PAINÉIS CLÁSSICOS DO ZOTERO 7 + MENDELEY DESKTOP (COM DIVISORES REDIMENSIONÁVEIS) */
        <div
          className="grade-3-paineis-zotero"
          style={{
            gridTemplateColumns: `${largurasPaineis.esquerdo}px 5px minmax(360px, 1fr) 5px ${largurasPaineis.direito}px`,
          }}
        >
          {/* PAINEL 1 (ESQUERDA): Árvore de Coleções em cima + Seletor de Tags/Autores embaixo */}
          <aside className="painel-esquerdo-zotero">
            <div className="arvore-colecoes-zotero">
              {/* Card de Identificação em Destaque do Projeto Ativo */}
              <div className="card-projeto-ativo-sidebar">
                <div className="card-proj-topo-linha">
                  <span className="card-proj-etiqueta">PROJETO ATIVO</span>
                  <button
                    type="button"
                    className="btn-trocar-proj-sidebar"
                    onClick={() => {
                      atualizarProjetosRecentes();
                      setMenuProjetosAberto(true);
                    }}
                    title="Alternar entre pastas de projetos ou criar novo"
                  >
                    ⇄ Alternar
                  </button>
                </div>
                <div className="card-proj-nome-linha" title={bib?.raiz || 'Pasta do projeto'}>
                  <span className="icone-pasta-sidebar">📁</span>
                  <strong className="nome-pasta-sidebar">
                    {bib?.raiz ? bib.raiz.split(/[\\/]/).pop() : 'Minha Biblioteca'}
                  </strong>
                </div>
                <div className="card-proj-caminho-linha" title={bib?.raiz}>
                  📍 {bib?.raiz ? (bib.raiz.length > 28 ? '…' + bib.raiz.slice(-25) : bib.raiz) : 'Pasta local'}
                </div>
                <div className="card-proj-meta-linha">
                  <span className="badge-obras-sidebar">📚 {refs.length} {refs.length === 1 ? 'obra' : 'obras'}</span>
                  {contagens.citada > 0 && (
                    <span className="badge-citadas-sidebar">✅ {contagens.citada} citadas</span>
                  )}
                </div>
              </div>

              <div className="cabecalho-secao-zotero">MINHA BIBLIOTECA</div>

              <button
                className={`no-arvore ${visao === 'todas' ? 'ativo' : ''}`}
                onClick={() => setVisao('todas')}
              >
                <span>📚 Todos os Itens</span>
                <span className="cont-arvore">{refs.length}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'status:a_ler' ? 'ativo' : ''}`}
                onClick={() => setVisao('status:a_ler')}
              >
                <span>📌 A Ler (Fila de Triagem)</span>
                <span className="cont-arvore">{contagens.a_ler}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'status:consultada' ? 'ativo' : ''}`}
                onClick={() => setVisao('status:consultada')}
              >
                <span>📘 Consultadas (Lidas)</span>
                <span className="cont-arvore">{contagens.consultada}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'status:citada' ? 'ativo' : ''}`}
                onClick={() => setVisao('status:citada')}
              >
                <span>✅ Citadas no Trabalho</span>
                <span className="cont-arvore">{contagens.citada}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'favoritos' ? 'ativo' : ''}`}
                onClick={() => setVisao('favoritos')}
              >
                <span>⭐ Favoritos (Mendeley)</span>
                <span className="cont-arvore">{contagens.favoritos}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'lidos_recentes' ? 'ativo' : ''}`}
                onClick={() => setVisao('lidos_recentes')}
              >
                <span>👁 Lidos Recentemente</span>
                <span className="cont-arvore">{contagens.lidos_recentes}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'sem_colecao' ? 'ativo' : ''}`}
                onClick={() => setVisao('sem_colecao')}
              >
                <span>📂 Itens Não Classificados</span>
                <span className="cont-arvore">{contagens.sem_colecao}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'revisao' ? 'ativo' : ''}`}
                onClick={() => setVisao('revisao')}
              >
                <span>⚠ Precisa de Revisão</span>
                <span className="cont-arvore">{contagens.revisao}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'sem_pdf' ? 'ativo' : ''}`}
                onClick={() => setVisao('sem_pdf')}
              >
                <span>📎 Sem PDF Anexado</span>
                <span className="cont-arvore">{contagens.sem_pdf}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'status:descartada' ? 'ativo' : ''}`}
                onClick={() => setVisao('status:descartada')}
              >
                <span>🗑 Excluídas na Triagem</span>
                <span className="cont-arvore">{contagens.descartada}</span>
              </button>

              <div className="cabecalho-secao-zotero" style={{ marginTop: 10 }}>
                <span>COLEÇÕES / CAPÍTULOS</span>
              </div>
              {(bib.colecoes || []).map((c) => {
                const qtd = refs.filter((r) => (r.colecoes || []).includes(c.id)).length;
                return (
                  <div key={c.id} className="linha-no-colecao">
                    <button
                      className={`no-arvore ${visao === `col:${c.id}` ? 'ativo' : ''}`}
                      onClick={() => setVisao(`col:${c.id}`)}
                    >
                      <span>📁 {c.nome}</span>
                      <span className="cont-arvore">{qtd}</span>
                    </button>
                    <button
                      className="btn-excluir-col"
                      onClick={() => removerColecao(c.id)}
                      title="Remover coleção"
                    >
                      ×
                    </button>
                  </div>
                );
              })}
              <form onSubmit={criarColecao} className="form-colecao-zotero">
                <input
                  value={novaColecao}
                  onChange={(e) => setNovaColecao(e.target.value)}
                  placeholder="+ Nova coleção (Enter)…"
                />
              </form>
            </div>

            {/* Metade inferior do painel esquerdo: Seletor de Tags (Zotero) / Autores / Periódicos (Mendeley) */}
            <div className="seletor-inferior-zotero">
              <div className="abas-seletor-inferior">
                <button
                  className={abaSeletorInferior === 'tags' ? 'ativa' : ''}
                  onClick={() => setAbaSeletorInferior('tags')}
                >
                  🏷 Tags ({listaTags.length})
                </button>
                <button
                  className={abaSeletorInferior === 'autores' ? 'ativa' : ''}
                  onClick={() => setAbaSeletorInferior('autores')}
                >
                  👤 Autores ({listaAutores.length})
                </button>
                <button
                  className={abaSeletorInferior === 'periodicos' ? 'ativa' : ''}
                  onClick={() => setAbaSeletorInferior('periodicos')}
                >
                  📰 Revistas
                </button>
              </div>

              <div className="corpo-seletor-inferior">
                {abaSeletorInferior === 'tags' &&
                  listaTags
                    .filter(([t]) => !buscaTagAutor || normalizar(t).includes(normalizar(buscaTagAutor)))
                    .map(([t, n]) => (
                      <button
                        key={t}
                        className={`chip-zotero ${visao === `tag:${t}` ? 'ativo' : ''}`}
                        onClick={() => setVisao(visao === `tag:${t}` ? 'todas' : `tag:${t}`)}
                      >
                        #{t} <span>{n}</span>
                      </button>
                    ))}

                {abaSeletorInferior === 'autores' &&
                  listaAutores
                    .filter(([a]) => !buscaTagAutor || normalizar(a).includes(normalizar(buscaTagAutor)))
                    .map(([a, n]) => (
                      <button
                        key={a}
                        className={`linha-autor-mendeley ${visao === `autor:${a}` ? 'ativo' : ''}`}
                        onClick={() => setVisao(visao === `autor:${a}` ? 'todas' : `autor:${a}`)}
                      >
                        <span>{a}</span>
                        <span className="cont-arvore">{n}</span>
                      </button>
                    ))}

                {abaSeletorInferior === 'periodicos' &&
                  listaPeriodicos
                    .filter(([p]) => !buscaTagAutor || normalizar(p).includes(normalizar(buscaTagAutor)))
                    .map(([p, n]) => (
                      <button
                        key={p}
                        className={`linha-autor-mendeley ${visao === `per:${p}` ? 'ativo' : ''}`}
                        onClick={() => setVisao(visao === `per:${p}` ? 'todas' : `per:${p}`)}
                      >
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p}</span>
                        <span className="cont-arvore">{n}</span>
                      </button>
                    ))}
              </div>

              <div className="rodape-seletor-inferior">
                <input
                  value={buscaTagAutor}
                  onChange={(e) => setBuscaTagAutor(e.target.value)}
                  placeholder={`Filtrar ${abaSeletorInferior}…`}
                />
                {visao !== 'todas' && (
                  <button className="btn pequeno fantasma" onClick={() => setVisao('todas')}>
                    Limpar
                  </button>
                )}
              </div>
            </div>
          </aside>

          {/* Divisor redimensionável entre Painel Esquerdo e Tabela Central */}
          <div
            className="divisor-painel-zotero"
            onMouseDown={(e) => iniciarRedimPainel('esquerdo', e)}
            onDoubleClick={restaurarLargurasPadrao}
            title="Arraste para redimensionar o painel esquerdo (2 cliques restaura o padrão)"
          />

          {/* PAINEL 2 (CENTRO): TABELA MULTICOLUNAS CLÁSSICA DO ZOTERO & MENDELEY */}
          <section className="painel-tabela-zotero">
            {refsFiltradas.length === 0 ? (
              refs.length === 0 ? (
                <div className="estado-vazio-projeto-novo">
                  <div className="icone-grande-vazio">📚</div>
                  <h3>Esta pasta de projeto está pronta para sua pesquisa!</h3>
                  <p className="texto-apoio-vazio">
                    Você está trabalhando no projeto: <strong>{bib?.raiz ? bib.raiz.split(/[\\/]/).pop() : 'Minha Biblioteca'}</strong>
                    <br />
                    <code className="caminho-vazio-code">{bib?.raiz}</code>
                  </p>
                  <p className="subtexto-vazio">
                    Escolha por onde deseja começar a adicionar artigos nesta biblioteca:
                  </p>
                  <div className="botoes-acao-vazio-grid">
                    <button className="btn-vazio-card" onClick={() => setAbaSuperior('buscadores')}>
                      <span className="icone-vazio-card">🔍</span>
                      <div className="info-vazio-card">
                        <strong>Buscar nas Bases Científicas</strong>
                        <span>PubMed, Europe PMC, SciELO, OpenAlex, Cochrane…</span>
                      </div>
                      <span className="seta-vazio-card">→</span>
                    </button>
                    <button className="btn-vazio-card" onClick={() => setVarinhaAberta(true)}>
                      <span className="icone-vazio-card">🪄</span>
                      <div className="info-vazio-card">
                        <strong>Inserir via DOI / PMID</strong>
                        <span>Metadados automáticos e download de PDF</span>
                      </div>
                      <span className="seta-vazio-card">→</span>
                    </button>
                    <button className="btn-vazio-card" onClick={async () => {
                      const p = await window.api.dialogo.escolherPdfs();
                      if (p?.length) await importarPdfs(p, 'a_ler');
                    }}>
                      <span className="icone-vazio-card">📎</span>
                      <div className="info-vazio-card">
                        <strong>Adicionar PDFs do Computador</strong>
                        <span>Importe arquivos PDF já salvos no seu disco</span>
                      </div>
                      <span className="seta-vazio-card">→</span>
                    </button>
                    <button className="btn-vazio-card" onClick={importarRisOuBib}>
                      <span className="icone-vazio-card">📄</span>
                      <div className="info-vazio-card">
                        <strong>Importar RIS / BibTeX</strong>
                        <span>Traga referências do Zotero, Mendeley ou EndNote</span>
                      </div>
                      <span className="seta-vazio-card">→</span>
                    </button>
                  </div>
                </div>
              ) : (
                <Vazio icone="book" titulo="Nenhum item nesta coleção ou filtro">
                  <p>
                    Nenhuma obra corresponde aos filtros ativos nesta coleção ou busca.
                  </p>
                  <button className="btn pequeno fantasma" onClick={() => setVisao('todas')}>
                    Ver todas as {refs.length} obras da biblioteca
                  </button>
                </Vazio>
              )
            ) : (
              <div className="wrap-tabela-zotero">
                <table className="tabela-itens-zotero">
                  <thead>
                    <tr>
                      <th className="col-icone-fixa" style={{ width: 28 }} title="Expandir anexos e notas (estilo árvore do Zotero)" />
                      <th className="col-icone-fixa" style={{ width: 28 }} title="Lido / Não lido (bolinha verde do Mendeley)">
                        ●
                      </th>
                      <th className="col-icone-fixa" style={{ width: 28 }} title="Favorito">
                        ★
                      </th>
                      <th
                        className="ordenavel th-redimensionavel"
                        style={largurasColunas.titulo ? { width: largurasColunas.titulo } : undefined}
                        onClick={() => alternarOrdenacaoColuna('titulo')}
                      >
                        <span>Título {colunaOrdem === 'titulo' ? (direcaoOrdem === 'asc' ? '▲' : '▼') : ''}</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('titulo', e)}
                          title="Arraste para redimensionar a coluna Título"
                        />
                      </th>
                      <th
                        className="ordenavel th-redimensionavel"
                        style={{ width: largurasColunas.autor }}
                        onClick={() => alternarOrdenacaoColuna('autor')}
                      >
                        <span>Autor / Criador {colunaOrdem === 'autor' ? (direcaoOrdem === 'asc' ? '▲' : '▼') : ''}</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('autor', e)}
                          title="Arraste para redimensionar a coluna Autor"
                        />
                      </th>
                      <th
                        className="ordenavel th-redimensionavel"
                        style={{ width: largurasColunas.ano }}
                        onClick={() => alternarOrdenacaoColuna('ano')}
                      >
                        <span>Ano {colunaOrdem === 'ano' ? (direcaoOrdem === 'asc' ? '▲' : '▼') : ''}</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('ano', e)}
                          title="Arraste para redimensionar a coluna Ano"
                        />
                      </th>
                      <th
                        className="ordenavel th-redimensionavel"
                        style={{ width: largurasColunas.periodico }}
                        onClick={() => alternarOrdenacaoColuna('periodico')}
                      >
                        <span>Publicação {colunaOrdem === 'periodico' ? (direcaoOrdem === 'asc' ? '▲' : '▼') : ''}</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('periodico', e)}
                          title="Arraste para redimensionar a coluna Publicação"
                        />
                      </th>
                      <th
                        className="th-redimensionavel"
                        style={{ width: largurasColunas.nivel }}
                        title="Nível de Evidência (1A a 5), Nota da Revista (Quartil/Qualis/FI) e Nota do Artigo"
                      >
                        <span>Nível &amp; Nota</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('nivel', e)}
                          title="Arraste para redimensionar a coluna Nível & Nota"
                        />
                      </th>
                      <th
                        className="ordenavel th-redimensionavel"
                        style={{ width: largurasColunas.status }}
                        onClick={() => alternarOrdenacaoColuna('status')}
                      >
                        <span>Uso / Status {colunaOrdem === 'status' ? (direcaoOrdem === 'asc' ? '▲' : '▼') : ''}</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('status', e)}
                          title="Arraste para redimensionar a coluna Uso / Status"
                        />
                      </th>
                      <th
                        className="th-redimensionavel"
                        style={{ width: largurasColunas.pdf, textAlign: 'center' }}
                        title="PDF (Abrir, Baixar Automático, Buscar no Google ou Anexar do PC)"
                      >
                        <span>📎 PDF</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('pdf', e)}
                          title="Arraste para redimensionar a coluna PDF"
                        />
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {refsFiltradas.map((r) => {
                      const sel = selecionadas.includes(r.id) || (!selecionadas.length && refAtiva?.id === r.id);
                      const exp = !!expandidas[r.id];
                      const st = statusPorId[r.status] || statusPorId.a_ler;
                      const icone = ICONE_TIPO[r.csl?.type] || '📄';
                      const temFilhos = !!(r.pdf || r.notas || r.pico?.o);
                      const ins = r.insights || {};
                      const nivCod = String(r.nivelEvidencia || ins.nivelId || '4').toUpperCase();

                      return (
                        <React.Fragment key={r.id}>
                          <tr
                            className={`linha-tabela-zotero ${sel ? 'selecionada' : ''} ${!r.lido ? 'nao-lido' : ''}`}
                            onClick={(e) => {
                              if (e.ctrlKey || e.metaKey) {
                                setSelecionadas((ant) =>
                                  ant.includes(r.id) ? ant.filter((x) => x !== r.id) : [...ant, r.id]
                                );
                              } else {
                                setSelecionadas([r.id]);
                              }
                            }}
                            onDoubleClick={() => {
                              if (r.pdf) abrirPdfEmAba(r);
                            }}
                            onContextMenu={(e) => {
                              e.preventDefault();
                              setSelecionadas([r.id]);
                              setMenuContexto({ x: e.clientX, y: e.clientY, ref: r });
                            }}
                          >
                            {/* Setinha de expandir filhos igual ao Zotero */}
                            <td
                              className="cel-expandir col-icone-fixa"
                              onClick={(e) => {
                                e.stopPropagation();
                                setExpandidas((ant) => ({ ...ant, [r.id]: !ant[r.id] }));
                              }}
                            >
                              {temFilhos ? (exp ? '▾' : '▸') : ''}
                            </td>

                            {/* Bolinha verde Mendeley Lido/Não lido */}
                            <td
                              className="col-icone-fixa"
                              onClick={(e) => {
                                e.stopPropagation();
                                atualizarRef(r.id, {
                                  lido: !r.lido,
                                  ultimoAbertoEm: !r.lido ? new Date().toISOString() : r.ultimoAbertoEm,
                                });
                              }}
                              title={r.lido ? 'Lido (clique p/ marcar não lido)' : 'Não lido (clique p/ marcar lido)'}
                            >
                              <span className={`bolinha-mendeley ${r.lido ? 'lido' : 'nao-lido'}`} />
                            </td>

                            {/* Estrela de Favorito */}
                            <td
                              className="col-icone-fixa"
                              onClick={(e) => {
                                e.stopPropagation();
                                atualizarRef(r.id, { favorito: !r.favorito });
                              }}
                              style={{ color: r.favorito ? '#f59e0b' : '#cbd5e1', cursor: 'pointer' }}
                            >
                              ★
                            </td>

                            {/* Título com ícone de tipo + alerta de retratação */}
                            <td className="cel-titulo">
                              <span className="icone-tipo-item">{icone}</span>
                              {r.retratado && <span className="tag-retratado-mini">RETRATADO</span>}
                              <span>{semHtml(r.csl?.title) || '(Sem título)'}</span>
                            </td>

                            <td className="cel-truncada">{autoresResumo(r.csl) || '—'}</td>
                            <td>{ano(r.csl) || '—'}</td>
                            <td className="cel-truncada">{r.csl?.['container-title'] || r.csl?.publisher || '—'}</td>

                            {/* Coluna Nível de Evidência + Nota da Revista & Artigo */}
                            <td
                              className="cel-truncada"
                              title={`${ins.nivelNome || ''}\nRevista: ${ins.quartil || ''} (Qualis ${ins.qualisEstimado || 'N/A'}) · FI: ${ins.fi2Anos ?? 'N/D'}\nNota do Artigo: ${ins.notaArtigo ?? '—'}/10 (${ins.citacoes ?? 0} citações)`}
                            >
                              <span className="badge-evidencia" style={{ marginRight: 4 }}>
                                {nivCod === 'DIRETRIZ' ? 'DIR' : `Nív. ${nivCod}`}
                              </span>
                              {ins.quartil && ins.quartil !== '—' && (
                                <span className="tag-mini" style={{ fontWeight: 700, color: '#1d4ed8', marginRight: 4 }}>
                                  {ins.quartil}
                                </span>
                              )}
                              {ins.notaArtigo != null && (
                                <span style={{ fontSize: 11, color: 'var(--texto-suave)' }}>★{ins.notaArtigo}</span>
                              )}
                            </td>

                            {/* Status Consultada x Citada */}
                            <td onClick={(e) => e.stopPropagation()}>
                              <select
                                className="select-status-zotero"
                                style={{ borderColor: st.cor, color: st.cor }}
                                value={r.status}
                                onChange={(e) => atualizarRef(r.id, { status: e.target.value })}
                              >
                                {STATUS.map((s) => (
                                  <option key={s.id} value={s.id}>
                                    {s.nome}
                                  </option>
                                ))}
                              </select>
                            </td>

                            {/* Coluna de Anexo PDF com Abertura Externa e Revelar na Pasta */}
                            <td style={{ textAlign: 'center' }} onClick={(e) => e.stopPropagation()}>
                              {r.pdf ? (
                                <div className="acoes-pdf-linha">
                                  <button
                                    className="badge-pdf"
                                    onClick={() => abrirPdfEmAba(r)}
                                    title="Abrir no leitor integrado (com grifos)"
                                  >
                                    PDF
                                  </button>
                                  <button
                                    className="btn-icone-pdf-externo"
                                    onClick={() => window.api.bib.abrirPdf(r.id).catch((e) => avisar(e.message, 'erro'))}
                                    title="Abrir no Navegador Externo (Edge/Chrome) ou Leitor Padrão do Windows"
                                  >
                                    ↗
                                  </button>
                                  <button
                                    className="btn-icone-pdf-pasta"
                                    onClick={() => window.api.bib.mostrarPdf(r.id).catch((e) => avisar(e.message, 'erro'))}
                                    title="Mostrar e selecionar o arquivo PDF na pasta do Windows Explorer"
                                  >
                                    📁
                                  </button>
                                </div>
                              ) : (
                                <div style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}>
                                  {(r.csl?.DOI || r.csl?.PMID) && (
                                    <button
                                      className="badge-baixar-pdf"
                                      onClick={() => baixarPdfDeUmaRef(r)}
                                      title="Tentar baixar PDF gratuito automaticamente (Unpaywall / OpenAlex)"
                                    >
                                      ⬇
                                    </button>
                                  )}
                                  <button
                                    className="badge-baixar-pdf"
                                    onClick={() => buscarPdfGoogleManual(r)}
                                    title="Buscar este PDF no Google Acadêmico no navegador para baixar manualmente"
                                  >
                                    🌐
                                  </button>
                                  <button
                                    className="badge-baixar-pdf"
                                    onClick={() => anexarPdfManual(r.id)}
                                    title="Anexar manualmente um arquivo PDF que você baixou no seu computador"
                                  >
                                    📎
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>

                          {/* Linhas filhas expansíveis (Árvore de anexos, citações no Word e notas igual ao Zotero) */}
                          {exp && (
                            <>
                              {(r.ocorrenciasWord || []).map((oc, idxOc) => (
                                <tr key={`oc-${idxOc}`} className="linha-filha-zotero">
                                  <td colSpan={3} />
                                  <td colSpan={6} style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>
                                    ↳ 📍 <strong>Word (Parágrafo §{oc.numParagrafo || idxOc + 1} · Linha {oc.numLinha || '?'}{oc.secao ? ` · ${oc.secao}` : ''}):</strong>{' '}
                                    <em>"{oc.fraseContexto}"</em>
                                    {(oc.trechoPdf || oc.trechoArtigoResumo) && (
                                      <div style={{ color: 'var(--texto-suave)', marginTop: 2 }}>
                                        📄 <strong>Trecho no Artigo{oc.paginaPdf ? ` (pág. ${oc.paginaPdf})` : ''}:</strong> "{oc.trechoPdf || oc.trechoArtigoResumo}"
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {r.pdf && oc.paginaPdf && (
                                      <button
                                        className="btn pequeno primario"
                                        onClick={() => abrirPdfEmAba(r, oc.paginaPdf)}
                                      >
                                        Pág. {oc.paginaPdf}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {r.pdf && (
                                <tr className="linha-filha-zotero" onDoubleClick={() => abrirPdfEmAba(r)}>
                                  <td colSpan={3} />
                                  <td colSpan={6}>
                                    ↳ 📄 <strong>Texto Completo (PDF):</strong> <code>{r.pdf}</code>
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button className="btn pequeno primario" onClick={() => abrirPdfEmAba(r)}>
                                      Abrir aba
                                    </button>
                                  </td>
                                </tr>
                              )}
                              {r.notas && (
                                <tr className="linha-filha-zotero">
                                  <td colSpan={3} />
                                  <td colSpan={7}>
                                    ↳ 📝 <strong>Nota de Fichamento:</strong> {r.notas.slice(0, 140)}
                                    {r.notas.length > 140 ? '…' : ''}
                                  </td>
                                </tr>
                              )}
                            </>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}

            {/* Barra de status inferior estilo Zotero */}
            <footer className="rodape-tabela-zotero">
              <span>
                Exibindo <strong>{refsFiltradas.length}</strong> de {refs.length} itens ·{' '}
                <strong style={{ color: '#2f80ed' }}>{contagens.consultada} Consultadas</strong> ·{' '}
                <strong style={{ color: '#27ae60' }}>{contagens.citada} Citadas no Word</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>Arraste as bordas das colunas ou painéis para redimensionar.</span>
                <button
                  className="btn pequeno fantasma"
                  style={{ padding: '2px 7px', fontSize: 11 }}
                  onClick={restaurarLargurasPadrao}
                  title="Restaurar tamanho padrão das colunas e painéis"
                >
                  ↺ Restaurar Colunas
                </button>
              </span>
            </footer>
          </section>

          {/* Divisor redimensionável entre Tabela Central e Painel Direito */}
          <div
            className="divisor-painel-zotero"
            onMouseDown={(e) => iniciarRedimPainel('direito', e)}
            onDoubleClick={restaurarLargurasPadrao}
            title="Arraste para redimensionar o painel direito (2 cliques restaura o padrão)"
          />

          {/* PAINEL 3 (DIREITA): INSPETOR DE METADADOS, NOTAS, PICO, CITAÇÕES E REDE */}
          <ReferenceDetail
            refItem={refAtiva}
            estilo={cfg.estilo}
            idioma={cfg.idioma}
            colecoes={bib.colecoes || []}
            onAtualizar={atualizarRef}
            onExcluir={excluirRefs}
            onAnexarPdf={anexarPdfManual}
            onAbrirLeitorPdf={(r, pag) => abrirPdfEmAba(r, pag)}
            onImportarCsl={importarCsl}
            onRecarregar={recarregarBiblioteca}
          />
        </div>
      )}

      {/* Menu de Contexto do Botão Direito (estilo Zotero / Mendeley) */}
      {menuContexto && (
        <div
          className="menu-flutuante-zotero"
          style={{ position: 'fixed', top: menuContexto.y, left: menuContexto.x, zIndex: 300 }}
        >
          {menuContexto.ref.pdf ? (
            <>
              <button onClick={() => abrirPdfEmAba(menuContexto.ref)}>📄 Abrir PDF em Aba (Leitor Integrado)</button>
              <button
                onClick={() => {
                  window.api.bib.abrirPdf(menuContexto.ref.id).catch((e) => avisar(e.message, 'erro'));
                  setMenuContexto(null);
                }}
              >
                ↗ Abrir no Navegador / Leitor Externo (Windows)
              </button>
              <button
                onClick={() => {
                  window.api.bib.mostrarPdf(menuContexto.ref.id).catch((e) => avisar(e.message, 'erro'));
                  setMenuContexto(null);
                }}
              >
                📁 Mostrar Arquivo na Pasta do Windows Explorer
              </button>
              <button onClick={() => anexarPdfManual(menuContexto.ref.id)}>🔄 Substituir PDF por outro do PC…</button>
            </>
          ) : (
            <>
              <button onClick={() => anexarPdfManual(menuContexto.ref.id)}>
                📎 Anexar PDF Baixado do Computador…
              </button>
              <button onClick={() => buscarPdfGoogleManual(menuContexto.ref)}>
                🌐 Buscar PDF no Google Acadêmico (p/ Baixar Manual)
              </button>
              <button onClick={() => baixarPdfDeUmaRef(menuContexto.ref)}>
                ⬇ Tentar Baixar PDF Gratuito Automático (Unpaywall)
              </button>
            </>
          )}
          <button
            onClick={async () => {
              await window.api.meta.gerarInsights({ id: menuContexto.ref.id, consultarOnline: true, forcarReescrita: true });
              await recarregarBiblioteca();
              avisar('Notas, PICO, Nível do Artigo e Nota da Revista atualizados!', 'ok');
            }}
          >
            ✨ Gerar / Atualizar Notas, PICO &amp; Nota da Revista
          </button>
          <button onClick={() => copiarSelecionadas('citacao', [menuContexto.ref.id])}>
            📋 Copiar Citação para o Word (e marcar Citada)
          </button>
          <button onClick={() => copiarSelecionadas('bibliografia', [menuContexto.ref.id])}>
            📄 Copiar Referência Bibliográfica Formatada
          </button>
          <div className="divisor-menu" />
          <button onClick={() => atualizarRef(menuContexto.ref.id, { status: 'consultada', lido: true })}>
            📘 Marcar como Consultada (Lida)
          </button>
          <button onClick={() => atualizarRef(menuContexto.ref.id, { status: 'citada', lido: true })}>
            ✅ Marcar como Citada no Trabalho
          </button>
          <button onClick={() => atualizarRef(menuContexto.ref.id, { status: 'a_ler' })}>
            📌 Marcar como A Ler
          </button>
          <div className="divisor-menu" />
          <button
            style={{ color: '#dc2626' }}
            onClick={() => excluirRefs([menuContexto.ref.id])}
          >
            🗑 Mover Item para a Lixeira
          </button>
        </div>
      )}

      </div> {/* Fim da div.conteudo-principal-com-rail */}

      {modalAdicionar && (
        <QuickAddModal
          onFechar={() => setModalAdicionar(false)}
          onImportarCsl={importarCsl}
          onImportarPdfs={importarPdfs}
          onRecarregar={recarregarBiblioteca}
        />
      )}

      {modalVersaoAberto && (
        <SystemVersionModal
          aberto={modalVersaoAberto}
          aoFechar={() => setModalVersaoAberto(false)}
          bib={bib}
          refs={refs}
        />
      )}

      {modalExportarWord && (
        <ModalBibliografiaWord
          refs={refs}
          selecionadas={selecionadas}
          colecoes={bib.colecoes || []}
          estiloInicial={cfg.estilo}
          estilos={estilos}
          idioma={cfg.idioma}
          onFechar={() => setModalExportarWord(false)}
        />
      )}

      {modalEstilos && (
        <ModalGerenciarEstilos
          estilos={estilos}
          onFechar={() => setModalEstilos(false)}
          onInstalado={async (novoId) => {
            setEstilos(await window.api.cit.estilos());
            if (novoId) await mudarEstilo(novoId);
          }}
        />
      )}

      {modalNovoProjeto && (
        <div className="overlay-modal" onClick={() => setModalNovoProjeto(false)}>
          <div className="caixa-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <header className="cabecalho-modal">
              <h3>Criar Novo Projeto / Biblioteca</h3>
              <button className="btn-fechar" onClick={() => setModalNovoProjeto(false)}>×</button>
            </header>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                criarNovoProjeto();
              }}
              style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '14px' }}
            >
              <p style={{ margin: 0, fontSize: '13px', color: 'var(--texto-suave)' }}>
                Uma nova pasta será criada para este projeto com a estrutura completa e isolada de referências, PDFs, grifos e notas.
              </p>
              <div className="campo">
                <label style={{ fontSize: '12px', fontWeight: 600 }}>Nome do Projeto / Artigo / Tese:</label>
                <input
                  autoFocus
                  type="text"
                  placeholder="Ex: Tese Doutorado, Artigo Revista X, Revisão 2024"
                  value={nomeNovoProjeto}
                  onChange={(e) => setNomeNovoProjeto(e.target.value)}
                  style={{ width: '100%', marginTop: '4px' }}
                  required
                />
              </div>
              <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn secundario" onClick={() => setModalNovoProjeto(false)}>
                  Cancelar
                </button>
                <button type="submit" className="btn primario" disabled={!nomeNovoProjeto.trim()}>
                  Criar e Abrir Projeto
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

const SUGESTOES_ESTILOS = [
  { id: 'associacao-brasileira-de-normas-tecnicas', nome: 'ABNT — Padrão Oficial (NBR 6023 / 10520)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-numeric', nome: 'ABNT — Numérico [1], [2]' },
  { id: 'associacao-brasileira-de-normas-tecnicas-note', nome: 'ABNT — Notas de Rodapé' },
  { id: 'universidade-de-sao-paulo-escola-de-comunicacoes-e-artes-abnt', nome: 'ABNT — USP (ECA)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-usp-fmvz', nome: 'ABNT — USP (FMVZ)' },
  { id: 'universidade-de-sao-paulo-faculdade-de-saude-publica', nome: 'ABNT — USP (Faculdade de Saúde Pública)' },
  { id: 'universidade-de-sao-paulo-instituto-de-fisica-abnt', nome: 'ABNT — USP (Instituto de Física)' },
  { id: 'escola-nacional-de-saude-publica-sergio-arouca-abnt', nome: 'ABNT — FIOCRUZ / ENSP' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufmg-face-full', nome: 'ABNT — UFMG (FACE)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufrgs', nome: 'ABNT — UFRGS' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufrgs-initials', nome: 'ABNT — UFRGS (Iniciais)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufpr', nome: 'ABNT — UFPR' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufsc', nome: 'ABNT — UFSC' },
  { id: 'universidade-federal-de-santa-catarina-abnt', nome: 'ABNT — UFSC (Biblioteca Universitária)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufba', nome: 'ABNT — UFBA' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufc', nome: 'ABNT — UFC (Ceará)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufes', nome: 'ABNT — UFES (Espírito Santo)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufg', nome: 'ABNT — UFG (Goiás)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufjf', nome: 'ABNT — UFJF (Juiz de Fora)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufla', nome: 'ABNT — UFLA (Lavras)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufop', nome: 'ABNT — UFOP (Ouro Preto)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufpa', nome: 'ABNT — UFPA (Pará)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufpel', nome: 'ABNT — UFPel (Pelotas)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufrn', nome: 'ABNT — UFRN (Rio Grande do Norte)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufscar', nome: 'ABNT — UFSCar (São Carlos)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufu', nome: 'ABNT — UFU (Uberlândia)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ufv', nome: 'ABNT — UFV (Viçosa)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-unicamp', nome: 'ABNT — UNICAMP' },
  { id: 'associacao-brasileira-de-normas-tecnicas-unesp', nome: 'ABNT — UNESP' },
  { id: 'associacao-brasileira-de-normas-tecnicas-unifesp', nome: 'ABNT — UNIFESP (Escola Paulista de Medicina)' },
  { id: 'associacao-brasileira-de-normas-tecnicas-unb', nome: 'ABNT — UnB (Brasília)' },
  { id: 'universidade-estadual-de-londrina-abnt', nome: 'ABNT — UEL (Londrina)' },
  { id: 'universidade-estadual-de-maringa-abnt', nome: 'ABNT — UEM (Maringá)' },
  { id: 'universidade-federal-de-pernambuco-abnt', nome: 'ABNT — UFPE' },
  { id: 'universidade-tecnologica-federal-do-parana-abnt', nome: 'ABNT — UTFPR' },
  { id: 'pontificia-universidade-catolica-do-parana-abnt', nome: 'ABNT — PUC-PR' },
  { id: 'pontificia-universidade-catolica-de-minas-gerais-abnt', nome: 'ABNT — PUC-Minas' },
  { id: 'pontificia-universidade-catolica-do-rio-grande-do-sul-abnt', nome: 'ABNT — PUCRS' },
  { id: 'pontificia-universidade-catolica-de-sao-paulo-abnt', nome: 'ABNT — PUC-SP' },
  { id: 'instituto-brasileiro-de-informacao-em-ciencia-e-tecnologia-abnt', nome: 'ABNT — IBICT' },
  { id: 'associacao-brasileira-de-normas-tecnicas-ipea', nome: 'ABNT — IPEA' },
  { id: 'vancouver', nome: 'Vancouver — Padrão ICMJE (Entre Parênteses)' },
  { id: 'vancouver-superscript', nome: 'Vancouver — Sobrescrito ¹ ² ³' },
  { id: 'vancouver-brackets', nome: 'Vancouver — Entre Colchetes [1], [2]' },
  { id: 'vancouver-brackets-only-year', nome: 'Vancouver — Colchetes (Apenas Ano)' },
  { id: 'vancouver-author-date', nome: 'Vancouver — Autor-Data (Harvard/ICMJE)' },
  { id: 'nlm-citation-sequence', nome: 'Vancouver / NLM — National Library of Medicine (PubMed)' },
  { id: 'nlm-citation-sequence-superscript', nome: 'Vancouver / NLM — PubMed Sobrescrito' },
  { id: 'sage-vancouver', nome: 'Vancouver — SAGE' },
  { id: 'elsevier-vancouver', nome: 'Vancouver — Elsevier' },
  { id: 'springer-vancouver', nome: 'Vancouver — Springer' },
  { id: 'springer-vancouver-brackets', nome: 'Vancouver — Springer [Colchetes]' },
  { id: 'taylor-and-francis-national-library-of-medicine', nome: 'Vancouver / NLM — Taylor & Francis' },
  { id: 'cadernos-de-saude-publica', nome: 'Saúde Coletiva — Cadernos de Saúde Pública (FIOCRUZ)' },
  { id: 'revista-de-saude-publica', nome: 'Saúde Coletiva — Revista de Saúde Pública (USP)' },
  { id: 'ciencia-e-saude-coletiva', nome: 'Saúde Coletiva — Ciência & Saúde Coletiva (ABRASCO)' },
  { id: 'epidemiologia-e-servicos-de-saude', nome: 'Saúde Coletiva — Epidemiologia e Serviços de Saúde (SUS)' },
  { id: 'arquivos-brasileiros-de-cardiologia', nome: 'Medicina — Arquivos Brasileiros de Cardiologia' },
  { id: 'jornal-brasileiro-de-pneumologia', nome: 'Medicina — Jornal Brasileiro de Pneumologia' },
  { id: 'revista-brasileira-de-enfermagem', nome: 'Enfermagem — Revista Brasileira de Enfermagem (REBEn)' },
  { id: 'american-medical-association', nome: 'AMA 11th ed. (Medicina / JAMA)' },
  { id: 'the-lancet', nome: 'The Lancet (Vancouver Sobrescrito)' },
  { id: 'new-england-journal-of-medicine', nome: 'New England Journal of Medicine (NEJM)' },
  { id: 'bmj', nome: 'BMJ (British Medical Journal)' },
  { id: 'plos-one', nome: 'PLOS ONE (Vancouver Colchetes)' },
  { id: 'nature', nome: 'Nature' },
  { id: 'ieee', nome: 'IEEE' },
  { id: 'chicago-author-date', nome: 'Chicago (Autor-Data)' },
  { id: 'harvard-cite-them-right', nome: 'Harvard' },
];

function ModalGerenciarEstilos({ estilos, onFechar, onInstalado }) {
  const avisar = useAviso();
  const [consulta, setConsulta] = useState('');
  const [resultados, setResultados] = useState([]);
  const [buscando, setBuscando] = useState(false);
  const [instalando, setInstalando] = useState(null);

  const idsInstalados = new Set(estilos.map((e) => e.id));

  const buscar = async (e) => {
    e.preventDefault();
    if (!consulta.trim()) return;
    setBuscando(true);
    try {
      setResultados(await window.api.cit.buscarOnline(consulta));
    } catch (err) {
      avisar(err.message, 'erro');
    } finally {
      setBuscando(false);
    }
  };

  const instalar = async (id) => {
    setInstalando(id);
    try {
      const novo = await window.api.cit.instalarOnline(id);
      await onInstalado(novo.id);
      avisar(`Modelo "${novo.nome}" instalado na pasta estilos/ do OneDrive e ativado!`, 'ok');
    } catch (err) {
      avisar(err.message, 'erro');
    } finally {
      setInstalando(null);
    }
  };

  const importarDoPc = async () => {
    try {
      const novo = await window.api.cit.importarCsl();
      if (novo) {
        await onInstalado(novo.id);
        avisar(`Arquivo "${novo.nome}" importado e ativado!`, 'ok');
      }
    } catch (err) {
      avisar(err.message, 'erro');
    }
  };

  return (
    <Modal titulo="Modelos de Formatação (ABNT, Universidades, Saúde & Internacionais)" onFechar={onFechar} largura={680}>
      <div className="form-vertical">
        <div className="barra-pdf" style={{ marginBottom: 12 }}>
          <button className="btn primario pequeno" onClick={importarDoPc}>
            <Icone nome="upload" tam={13} /> Importar arquivo .CSL do computador
          </button>
          <button className="btn secundario pequeno" onClick={() => window.api.bib.abrirPasta('estilos')}>
            <Icone nome="folder" tam={13} /> Abrir pasta estilos/ no OneDrive
          </button>
        </div>

        <form onSubmit={buscar} className="linha-form" style={{ marginBottom: 12 }}>
          <input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder="Buscar entre +2.800 normas oficiais (ex.: abnt, usp, ufmg, vancouver, lancet, ama, harvard)…"
          />
          <button type="submit" className="btn primario" disabled={buscando}>
            <Icone nome="search" tam={14} /> {buscando ? 'Buscando…' : 'Buscar online'}
          </button>
        </form>

        {resultados.length > 0 && (
          <div className="lista-resultados-modal" style={{ marginBottom: 14 }}>
            <h5>Resultados no repositório oficial Citation Style Language:</h5>
            {resultados.map((r) => (
              <div key={r.id} className="item-resultado-modal">
                <div>
                  <strong>{r.nomeSugerido}</strong>
                  <div className="sub-meta">
                    <code>{r.id}.csl</code>
                  </div>
                </div>
                {idsInstalados.has(r.id) ? (
                  <span className="badge-ja-existe">✓ Instalado</span>
                ) : (
                  <button
                    className="btn pequeno primario"
                    disabled={instalando === r.id}
                    onClick={() => instalar(r.id)}
                  >
                    {instalando === r.id ? 'Instalando…' : '+ Instalar'}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <h5>Modelos recomendados (Universidades Brasileiras &amp; Periódicos da Saúde) — 1 clique:</h5>
        <div className="lista-resultados-modal">
          {SUGESTOES_ESTILOS.map((s) => (
            <div key={s.id} className="item-resultado-modal">
              <div>
                <strong>{s.nome}</strong>
                <div className="sub-meta">
                  <code>{s.id}.csl</code>
                </div>
              </div>
              {idsInstalados.has(s.id) ? (
                <span className="badge-ja-existe">✓ Instalado</span>
              ) : (
                <button
                  className="btn pequeno secundario"
                  disabled={instalando === s.id}
                  onClick={() => instalar(s.id)}
                >
                  {instalando === s.id ? 'Baixando…' : '+ Baixar e Ativar'}
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function ModalBibliografiaWord({ refs, selecionadas = [], colecoes, estiloInicial, estilos, idioma, onFechar }) {
  const avisar = useAviso();
  const temSelecionadas = selecionadas && selecionadas.length > 0;
  const qtdCitadas = useMemo(() => refs.filter((r) => r.status === 'citada').length, [refs]);
  const qtdConsultadas = useMemo(() => refs.filter((r) => r.status === 'consultada').length, [refs]);
  const escopoInicial = temSelecionadas ? 'selecionadas' : qtdCitadas > 0 ? 'citadas' : 'todas';

  const [escopo, setEscopo] = useState(escopoInicial);
  const [colecaoId, setColecaoId] = useState('todas');
  const [estilo, setEstilo] = useState(estiloInicial);
  const [buscaInterna, setBuscaInterna] = useState('');
  const [previaHtml, setPreviaHtml] = useState('');
  const [carregandoPrevia, setCarregandoPrevia] = useState(false);

  const idsFiltrados = useMemo(() => {
    return refs
      .filter((r) => {
        if (escopo === 'selecionadas') {
          if (!selecionadas.includes(r.id)) return false;
        } else {
          if (colecaoId !== 'todas' && !(r.colecoes || []).includes(colecaoId)) return false;
          if (escopo === 'citadas' && r.status !== 'citada') return false;
          if (escopo === 'consultadas' && r.status !== 'consultada') return false;
          if (escopo === 'ambas' && r.status !== 'citada' && r.status !== 'consultada') return false;
          if (r.status === 'descartada') return false;
        }

        if (buscaInterna.trim()) {
          const termo = buscaInterna.toLowerCase();
          const titulo = (r.csl?.title || '').toLowerCase();
          const autores = (r.csl?.author || []).map((a) => `${a.family || ''} ${a.given || ''}`).join(' ').toLowerCase();
          const anoRef = String(ano(r.csl) || '');
          if (!titulo.includes(termo) && !autores.includes(termo) && !anoRef.includes(termo)) {
            return false;
          }
        }

        return true;
      })
      .map((r) => r.id);
  }, [refs, selecionadas, escopo, colecaoId, buscaInterna]);

  useEffect(() => {
    if (!idsFiltrados.length) {
      setPreviaHtml('');
      return;
    }
    setCarregandoPrevia(true);
    let cancelado = false;
    window.api.cit
      .formatar({ ids: idsFiltrados, estilo, idioma })
      .then((f) => {
        if (!cancelado) {
          setPreviaHtml(f.bibliografiaHtml || '');
          setCarregandoPrevia(false);
        }
      })
      .catch((err) => {
        console.error('Erro ao formatar bibliografia:', err);
        if (!cancelado) setCarregandoPrevia(false);
      });
    return () => {
      cancelado = true;
    };
  }, [idsFiltrados, estilo, idioma]);

  const copiar = async () => {
    if (!idsFiltrados.length) {
      avisar('Nenhuma referência selecionada para copiar.', 'info');
      return;
    }
    await window.api.cit.copiar({ ids: idsFiltrados, estilo, idioma, tipo: 'bibliografia' });
    avisar(`${idsFiltrados.length} referências formatadas copiadas! Cole no Word com Ctrl+V.`, 'ok');
  };

  const exportarWordDocx = async () => {
    if (!idsFiltrados.length) return;
    try {
      const arq = await window.api.imp.exportarArquivo({ ids: idsFiltrados, formato: 'docx', estilo, idioma });
      if (arq) avisar(`Arquivo Word gerado com sucesso: ${arq}`, 'ok');
    } catch (err) {
      // Fallback: copia em HTML rico formatado para colar direto no Word
      copiar();
    }
  };

  const nomeEstiloAtual = estilos.find((e) => e.id === estilo)?.nome || estilo;

  return (
    <Modal titulo="📄 Gerar Bibliografia Formatada (Word / ABNT / Vancouver / APA)" onFechar={onFechar} largura={1080}>
      <div className="form-vertical" style={{ gap: 14 }}>
        {/* Barra de Seleção de Escopo com Abas Grandes e Fáceis de Navegar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--borda)', paddingBottom: 10 }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            Escopo:
          </span>
          <button
            type="button"
            className={`btn pequeno ${escopo === 'todas' ? 'primario' : 'secundario'}`}
            style={{ fontWeight: 600, padding: '6px 14px', borderRadius: 6 }}
            onClick={() => setEscopo('todas')}
          >
            📚 Todas as Obras ({refs.filter((r) => r.status !== 'descartada').length})
          </button>
          {temSelecionadas && (
            <button
              type="button"
              className={`btn pequeno ${escopo === 'selecionadas' ? 'primario' : 'secundario'}`}
              style={{ fontWeight: 600, padding: '6px 14px', borderRadius: 6, background: escopo === 'selecionadas' ? '#2563eb' : undefined }}
              onClick={() => setEscopo('selecionadas')}
            >
              📌 Selecionadas na Tabela ({selecionadas.length})
            </button>
          )}
          <button
            type="button"
            className={`btn pequeno ${escopo === 'citadas' ? 'primario' : 'secundario'}`}
            style={{ fontWeight: 600, padding: '6px 14px', borderRadius: 6 }}
            onClick={() => setEscopo('citadas')}
          >
            ✔ Citadas no Texto ({qtdCitadas})
          </button>
          <button
            type="button"
            className={`btn pequeno ${escopo === 'consultadas' ? 'primario' : 'secundario'}`}
            style={{ fontWeight: 600, padding: '6px 14px', borderRadius: 6 }}
            onClick={() => setEscopo('consultadas')}
          >
            📖 Consultadas ({qtdConsultadas})
          </button>
          <button
            type="button"
            className={`btn pequeno ${escopo === 'ambas' ? 'primario' : 'secundario'}`}
            style={{ fontWeight: 600, padding: '6px 14px', borderRadius: 6 }}
            onClick={() => setEscopo('ambas')}
          >
            Citadas + Consultadas
          </button>
        </div>

        {/* Linha de Controles: Norma CSL, Pasta/Coleção e Busca Rápida */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.1fr 1.5fr', gap: 12, alignItems: 'center' }}>
          <label className="campo" style={{ margin: 0 }}>
            <span className="campo-rotulo">Norma Bibliográfica (Estilo CSL)</span>
            <select
              value={estilo}
              onChange={(e) => setEstilo(e.target.value)}
              style={{ fontWeight: 600, height: 38 }}
            >
              {estilos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="campo" style={{ margin: 0 }}>
            <span className="campo-rotulo">Filtrar por Coleção / Pasta</span>
            <select
              value={colecaoId}
              onChange={(e) => setColecaoId(e.target.value)}
              style={{ height: 38 }}
              disabled={escopo === 'selecionadas'}
            >
              <option value="todas">Toda a Biblioteca</option>
              {colecoes.map((c) => (
                <option key={c.id} value={c.id}>
                  📁 {c.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="campo" style={{ margin: 0 }}>
            <span className="campo-rotulo">Buscar nesta prévia</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                placeholder="Filtrar por autor, título ou ano…"
                value={buscaInterna}
                onChange={(e) => setBuscaInterna(e.target.value)}
                style={{ height: 38, width: '100%', paddingRight: buscaInterna ? 28 : 10 }}
              />
              {buscaInterna && (
                <button
                  type="button"
                  className="btn-icone"
                  onClick={() => setBuscaInterna('')}
                  style={{ position: 'absolute', right: 6, top: 8 }}
                >
                  ×
                </button>
              )}
            </div>
          </label>
        </div>

        {/* Caixa de Prévia Grande e Ampla */}
        <div className="caixa-previa-grande" style={{ border: '2px solid var(--borda)', borderRadius: 8, padding: 14, background: 'var(--painel)' }}>
          <div className="caixa-previa-topo" style={{ marginBottom: 10, display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--texto)' }}>
                {idsFiltrados.length} {idsFiltrados.length === 1 ? 'referência ordenada' : 'referências ordenadas'}
              </span>
              <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: 999, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontWeight: 600 }}>
                {nomeEstiloAtual}
              </span>
              {carregandoPrevia && (
                <span style={{ fontSize: '12px', color: 'var(--texto-suave)' }}>Formatando…</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secundario pequeno"
                onClick={async () => {
                  const arq = await window.api.imp.exportarArquivo({ ids: idsFiltrados, formato: 'ris' });
                  if (arq) avisar(`Arquivo RIS exportado: ${arq}`, 'ok');
                }}
                disabled={!idsFiltrados.length}
                title="Exportar para formato .RIS (compatível com Zotero, Mendeley e EndNote)"
              >
                Exportar .RIS
              </button>
              <button
                type="button"
                className="btn secundario pequeno"
                onClick={async () => {
                  const arq = await window.api.imp.exportarArquivo({ ids: idsFiltrados, formato: 'bib' });
                  if (arq) avisar(`Arquivo BibTeX exportado: ${arq}`, 'ok');
                }}
                disabled={!idsFiltrados.length}
                title="Exportar para formato .BIB (BibTeX / Overleaf / LaTeX)"
              >
                Exportar .BIB
              </button>
              <button
                type="button"
                className="btn secundario pequeno"
                onClick={exportarWordDocx}
                disabled={!idsFiltrados.length}
                title="Gerar documento .DOCX para Word"
              >
                💾 Salvar .DOCX
              </button>
            </div>
          </div>

          {idsFiltrados.length === 0 ? (
            <div
              style={{
                padding: '40px 20px',
                textAlign: 'center',
                background: 'rgba(59, 130, 246, 0.06)',
                borderRadius: 8,
                border: '1px dashed #3b82f6',
                margin: '10px 0',
              }}
            >
              <p style={{ margin: '0 0 10px', fontSize: 15, fontWeight: 700, color: 'var(--texto)' }}>
                Nenhuma obra encontrada para o filtro atual.
              </p>
              <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--texto-suave)', maxWidth: 520, marginInline: 'auto' }}>
                {escopo === 'citadas'
                  ? 'Você ainda não marcou referências como "Citadas". Clique abaixo para ver todas as obras da biblioteca ou selecione "Todas as Obras" nas abas acima.'
                  : 'Nenhuma referência corresponde aos critérios ou à busca informada.'}
              </p>
              <button
                type="button"
                className="btn primario"
                style={{ padding: '8px 18px', fontSize: '13.5px', fontWeight: 600 }}
                onClick={() => {
                  setEscopo('todas');
                  setColecaoId('todas');
                  setBuscaInterna('');
                }}
              >
                📚 Mostrar Todas as Obras ({refs.filter((r) => r.status !== 'descartada').length})
              </button>
            </div>
          ) : (
            <div
              className="previa-html lista-bib-previa"
              style={{
                height: '440px',
                maxHeight: '52vh',
                overflowY: 'auto',
                padding: '18px 24px',
                background: 'var(--fundo)',
                border: '1px solid var(--borda)',
                borderRadius: '6px',
                lineHeight: 1.8,
                fontSize: '13.5px',
                color: 'var(--texto)',
                userSelect: 'text',
              }}
              dangerouslySetInnerHTML={{ __html: previaHtml || '<em>Gerando referências pela norma…</em>' }}
            />
          )}
        </div>

        {/* Rodapé do Modal com Ações Primárias em Destaque */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--borda)' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--texto-suave)' }}>
            💡 Dica: Clicar no botão abaixo copia a bibliografia com itálicos e formatação rica, pronta para colar no Word com <strong>Ctrl+V</strong>.
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn secundario" onClick={onFechar} style={{ padding: '8px 16px' }}>
              Fechar
            </button>
            <button
              type="button"
              className="btn primario"
              onClick={copiar}
              disabled={!idsFiltrados.length}
              style={{ padding: '8px 22px', fontSize: '14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Icone nome="copy" tam={16} /> Copiar Bibliografia Formatada para o Word (Ctrl+V)
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
