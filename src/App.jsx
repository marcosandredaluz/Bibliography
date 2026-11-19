import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  STATUS,
  TIPOS,
  statusPorId,
  rotuloStatus,
  tipoPorId,
  autoresResumo,
  ano,
  semHtml,
  normalizar,
  textoDeBusca,
} from './lib/csl.js';
import { analisarPdf } from './lib/pdf.js';
import { I18nProvider, useI18n } from './i18n.jsx';
import { Icone, ProvedorAvisos, Modal, Vazio, useAviso } from './components/ui.jsx';
import ReferenceDetail from './components/ReferenceDetail.jsx';
import QuickAddModal from './components/QuickAddModal.jsx';
import SearchHub from './components/SearchHub.jsx';
import PdfReaderModal from './components/PdfReaderModal.jsx';
import { WordHubView, PrismaAndScreeningView } from './components/WordAndPrismaView.jsx';
import WordQuickCitatorModal from './components/WordQuickCitatorModal.jsx';
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
  const [idiomaUi, setIdiomaUi] = useState(() => {
    try {
      const salvo = localStorage.getItem('bib_idioma_ui');
      return salvo === 'en' ? 'en' : 'pt-BR';
    } catch {
      return 'pt-BR';
    }
  });

  const atualizarIdiomaUi = async (novo) => {
    const val = novo === 'en' ? 'en' : 'pt-BR';
    setIdiomaUi(val);
    try {
      localStorage.setItem('bib_idioma_ui', val);
      document.documentElement.lang = val;
    } catch {}
    try {
      await window.api?.config?.definir?.({ idiomaInterface: val });
    } catch {}
  };

  return (
    <I18nProvider idioma={idiomaUi} aoMudarIdioma={atualizarIdiomaUi}>
      <ProvedorAvisos>
        <ConteudoApp aoSincronizarIdiomaCfg={(val) => setIdiomaUi(val === 'en' ? 'en' : 'pt-BR')} />
      </ProvedorAvisos>
    </I18nProvider>
  );
}

function ConteudoApp({ aoSincronizarIdiomaCfg }) {
  const avisar = useAviso();
  const { idioma, ehEn, t, tr, alternarIdioma, mudarIdioma } = useI18n();
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
  const [seletorWordModal, setSeletorWordModal] = useState(null); // { origem, termo, modo } | null
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
        '⚠️ ATENÇÃO: Auditoria em andamento!\n\nUma verificação de manuscrito está em execução neste projeto.\nSe você trocar ou criar outro projeto agora, a auditoria atual será interrompida.\n\nDeseja realmente trocar de projeto?'
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
    caminhoArquivo: '',
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

  // Aba lateral de detalhes (Metadados, Notas e PICO) sob demanda para desobstruir a tela inicial
  const [painelDireitoAberto, setPainelDireitoAberto] = useState(() => {
    try {
      const salvo = localStorage.getItem('bib_painel_direito_aberto');
      return salvo !== null ? JSON.parse(salvo) : false; // Por demanda: nasce fechado para tela inicial limpa e ampla!
    } catch {
      return false;
    }
  });

  const alternarPainelDireito = (forcarEstado) => {
    setPainelDireitoAberto((ant) => {
      const novo = typeof forcarEstado === 'boolean' ? forcarEstado : !ant;
      try {
        localStorage.setItem('bib_painel_direito_aberto', JSON.stringify(novo));
      } catch {}
      return novo;
    });
  };

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
      setCfg(c || { libraryPath: null, recentes: [], tema: 'escuro', estilo: 'abnt', idioma: 'pt-BR', idiomaInterface: 'pt-BR' });
      if (c?.idiomaInterface) {
        aoSincronizarIdiomaCfg?.(c.idiomaInterface);
        try { localStorage.setItem('bib_idioma_ui', c.idiomaInterface === 'en' ? 'en' : 'pt-BR'); } catch {}
      }
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
    const desinscreverWordSeletor = window.api.word?.aoAbrirSeletorCitacao?.((dados) => {
      setSeletorWordModal(dados || { origem: 'app' });
    });
    return () => {
      window.removeEventListener('click', fecharMenus);
      desinscrever?.();
      desinscreverWordSeletor?.();
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
    document.documentElement.lang = idioma;
  }, [cfg, cfg?.tema, idioma]);

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
      const p = semHtml(r.csl?.['container-title'] || '').trim();
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
      if (visao.startsWith('per:') && semHtml(r.csl?.['container-title'] || '').trim() !== visao.slice(4)) return false;
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
            {tr('BIBLIOGRAFIA', 'BIBLIOGRAPHY')}
          </h1>
          <p style={{ margin: '0 0 24px', fontSize: '13px', color: '#94a3b8', letterSpacing: '1px' }}>
            {tr('Gerenciador Científico & Citações CSL', 'Scientific Reference Manager & CSL Citations')}
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
          <div style={{ fontSize: '12px', color: '#64748b' }}>{tr('Carregando sua biblioteca…', 'Loading your library…')}</div>
        </div>
      </div>
    );
  }
  if (!cfg.libraryPath || !bib) {
    return (
      <div className="tela-boas-vindas">
        <div className="card-boas-vindas">
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6, marginBottom: 8 }}>
            <button
              type="button"
              className={`btn pequeno ${!ehEn ? 'primario' : 'secundario'}`}
              onClick={() => mudarIdioma('pt-BR')}
            >
              🇧🇷 Português (Padrão)
            </button>
            <button
              type="button"
              className={`btn pequeno ${ehEn ? 'primario' : 'secundario'}`}
              onClick={() => mudarIdioma('en')}
            >
              🇺🇸 English
            </button>
          </div>
          <div className="logo-boas-vindas">
            <Icone nome="book" tam={36} />
            <div>
              <h1>{t('app.title')}</h1>
              <p>{t('app.subtitle')}</p>
            </div>
          </div>
          <p className="explicacao">
            {tr(
              'Escolha a pasta onde sua biblioteca ficará salva. Seus artigos, fichamentos e PDFs ficarão sincronizados com segurança na sua nuvem pessoal.',
              'Choose the folder where your library will be stored. Your papers, reading notes, and PDFs stay safely synced in your personal cloud drive.'
            )}
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
                  <strong>{s.nome} {idx === 0 ? tr('(Recomendado)', '(Recommended)') : ''}</strong>
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
              <Icone nome="folder" tam={18} /> {tr('Escolher outra pasta no computador…', 'Choose another folder on computer…')}
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
            <h3>{tr('Solte os PDFs para adicionar à Minha Biblioteca', 'Drop PDFs to add them to My Library')}</h3>
            <p>{tr('O DOI é lido automaticamente e os metadados vêm do Crossref/PubMed.', 'DOI is read automatically and metadata is fetched from Crossref/PubMed.')}</p>
          </div>
        </div>
      )}

      {/* 1. BARRA LATERAL VERTICAL PERMANENTE ESTILO MENDELEY / ACTIVITY RAIL */}
      <aside className="rail-vertical-zotero">
        <div className="rail-topo-marca" title={t('app.subtitle')}>
          <div className="rail-logo-icone">
            <Icone nome="book" tam={22} />
          </div>
        </div>

        <div className="rail-grupo-itens">
          <button
            className={`rail-item ${abaSuperior === 'biblioteca' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('biblioteca')}
            title={tr('Minha Biblioteca de Referências', 'My Reference Library')}
          >
            <span className="rail-icone"><Icone nome="library" tam={20} /></span>
            <span className="rail-rotulo">{t('menu.library')}</span>
            <span className="rail-badge">{refs.length}</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'buscadores' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('buscadores')}
            title={tr('Buscadores Científicos e Credenciais', 'Scientific Search Hub & Accounts')}
          >
            <span className="rail-icone"><Icone nome="search" tam={20} /></span>
            <span className="rail-rotulo">{t('menu.searchers')}</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'word' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('word')}
            title={tr('Manuscrito (.DOCX - Consultadas × Citadas)', 'Manuscript (.DOCX - Consulted vs. Cited)')}
          >
            <span className="rail-icone"><Icone nome="edit" tam={20} /></span>
            <span className="rail-rotulo">{t('menu.manuscript')}</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'auditoria' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('auditoria')}
            title={tr('Auditoria Reversa (.DOCX/PDF)', 'Reverse Audit (.DOCX/PDF)')}
          >
            <span className="rail-icone"><Icone nome="audit" tam={20} /></span>
            <span className="rail-rotulo">{t('menu.auditing')}</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'prisma' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('prisma')}
            title={tr('Triagem Sistemática & Fluxograma PRISMA 2020', 'Systematic Screening & PRISMA 2020 Flowchart')}
          >
            <span className="rail-icone"><Icone nome="chart" tam={20} /></span>
            <span className="rail-rotulo">{t('menu.prisma')}</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'mendeley' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('mendeley')}
            title={tr('Grafo de Citações & Caderno de Síntese', 'Citation Graph & Research Notebook')}
          >
            <span className="rail-icone"><Icone nome="link" tam={20} /></span>
            <span className="rail-rotulo">{t('menu.graph')}</span>
          </button>

          <button
            className={`rail-item ${abaSuperior === 'ajuda' ? 'ativo' : ''}`}
            onClick={() => setAbaSuperior('ajuda')}
            title={tr('Manual & Roteiro Passo a Passo', 'User Guide & Walkthrough')}
          >
            <span className="rail-icone"><Icone nome="help" tam={20} /></span>
            <span className="rail-rotulo">{t('menu.tutorial')}</span>
          </button>
        </div>

        <div className="rail-rodape">
          <button
            className="rail-item-rodape"
            onClick={alternarIdioma}
            title={tr('Idioma da interface: Português (Brasil) — clique para mudar para English', 'Interface language: English — click to switch to Português (Brasil)')}
            style={{ fontWeight: 800, fontSize: '11px', letterSpacing: '0.2px' }}
          >
            {ehEn ? 'EN' : 'PT'}
          </button>
          <button
            className="rail-item-rodape"
            onClick={() => setModalVersaoAberto(true)}
            title={`${tr('Sobre o Bibliografia, Versão', 'About Bibliography, Version')} ${(typeof window !== 'undefined' && window.api?.versao?.obterInfo?.()?.app) || '1.2.0'} & ${t('menu.diagnostics')}`}
            style={{ fontWeight: 800, fontSize: '11px', letterSpacing: '0.2px' }}
          >
            v{(typeof window !== 'undefined' && window.api?.versao?.obterInfo?.()?.app) || '1.2.0'}
          </button>
          <button
            className="rail-item-rodape"
            onClick={alternarTema}
            title={cfg.tema === 'escuro' ? tr('Mudar para Modo Claro', 'Switch to Light Mode') : tr('Mudar para Modo Escuro', 'Switch to Dark Mode')}
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
            title={`${tr('Projeto ativo', 'Active project')}: ${bib?.raiz || tr('Pasta de trabalho', 'Workspace folder')}\n${tr('Clique para alternar entre pastas de projetos ou abrir outro diretório.', 'Click to switch between project folders or open another directory.')}`}
          >
            <span className="icone-pasta-proj"><Icone nome="folder" tam={15} /></span>
            <div className="badge-projeto-meta">
              <span className="rotulo-proj-topo">{tr('PROJETO ATIVO')}</span>
              <span className="nome-proj-atual">
                {bib?.raiz ? bib.raiz.split(/[\\/]/).pop() : tr('Minha Biblioteca', 'My Library')}
              </span>
            </div>
            <span className="badge-contador-obras-proj" title={`${refs.length} ${tr('obras cadastradas neste projeto', 'items in this project')}`}>
              {refs.length} {refs.length === 1 ? tr('obra', 'item') : tr('obras', 'items')}
            </span>
            <span className="caret-proj-topo">▾ {tr('Alternar', 'Switch')}</span>
          </button>
          {menuProjetosAberto && (
            <div className="menu-dropdown-projetos">
              <div className="cabecalho-dropdown-proj">
                <div className="cabecalho-dropdown-titulo">
                  <span>{tr('Projetos & Bibliotecas', 'Projects & Libraries')}</span>
                  <span className="badge-total-proj">{Math.min(10, projetosRecentes.length)} {tr('recentes', 'recent')}</span>
                </div>
                <div className="subtitulo-dropdown-proj">{tr('Selecione para alternar imediatamente:', 'Select to switch immediately:')}</div>
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
                          {ehAtivo && <span className="item-proj-badge-ativo">✓ {tr('Ativo', 'Active')}</span>}
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
                {tr('Abrir outra pasta no computador ou nuvem…', 'Open another folder on PC or cloud…')}
              </button>
              <button
                className="btn-acao-proj destaque"
                onClick={() => {
                  setMenuProjetosAberto(false);
                  setModalNovoProjeto(true);
                }}
              >
                + {tr('Criar nova pasta de projeto…', 'Create new project folder…')}
              </button>
            </div>
          )}
        </div>

        {/* Abas de PDFs abertos exclusivamente no topo */}
        <div className="container-abas-pdf-topo">
          {abasPdf.map((idPdf) => {
            const r = refs.find((x) => x.id === idPdf);
            if (!r) return null;
            const rotulo = `${autoresResumo(r.csl) || 'PDF'} (${ano(r.csl) || 'n.d.'}) — ${semHtml(r.csl?.title).slice(0, 30)}`;
            return (
              <button
                key={idPdf}
                className={`aba-zotero aba-pdf ${abaSuperior === `pdf:${idPdf}` ? 'ativa' : ''}`}
                onClick={() => setAbaSuperior(`pdf:${idPdf}`)}
                title={semHtml(r.csl?.title)}
              >
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}><Icone nome="file" tam={12} /> {rotulo}</span>
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
            title={`${tr('Abrir pasta sincronizada', 'Open synced folder')}: ${bib.raiz}`}
          >
            {tr('Pasta sincronizada', 'Folder synced')}
          </span>
        </div>
      </div>

      {/* 2. BARRA DE FERRAMENTAS (Exibida apenas na Biblioteca) */}
      {!refPdfAba && abaSuperior === 'biblioteca' && (
        <div className="toolbar-zotero">
        <div className="grupo-toolbar-esq">
          {/* Menu Consolidado: "+ Adicionar" */}
          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-toolbar-zotero destaque"
              onClick={() => setMenuNovoItem((v) => !v)}
              title={tr('Adicionar referências ou arquivos', 'Add references or files')}
            >
              <span style={{ color: '#16a34a', fontWeight: 900 }}>＋</span> {t('actions.add')} ▾
            </button>
            {menuNovoItem && (
              <div className="menu-flutuante-zotero">
                <button onClick={() => { setMenuNovoItem(false); setVarinhaAberta(true); }}>
                  <strong>{tr('Adicionar por DOI / PMID / ISBN…', 'Add by DOI / PMID / ISBN…')}</strong>
                </button>
                <button onClick={async () => { setMenuNovoItem(false); const c = await window.api.dialogo.escolherPdfs(); if (c?.length) await importarPdfs(c, 'a_ler'); }}>
                  {tr('Anexar arquivos PDF…', 'Attach PDF files…')}
                </button>
                <button onClick={() => { setMenuNovoItem(false); importarPastaDePdfsDireto(); }}>
                  {tr('Importar pasta de PDFs…', 'Import PDF folder…')}
                </button>
                <button onClick={() => { setMenuNovoItem(false); importarArquivoRisBib(); }}>
                  {tr('Importar RIS / BibTeX (.ris, .bib)…', 'Import RIS / BibTeX (.ris, .bib)…')}
                </button>
                <button onClick={() => { setMenuNovoItem(false); importarMendeley(); }}>
                  {tr('Importar do Mendeley (SQLite)…', 'Import from Mendeley (SQLite)…')}
                </button>
                <div className="divisor-menu" />
                <button onClick={() => { setMenuNovoItem(false); setModalAdicionar(true); }}>
                  {tr('Busca online / cadastro manual…', 'Online search / manual entry…')}
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
                placeholder={tr('Cole o DOI, PMID ou ISBN e tecle Enter…', 'Paste DOI, PMID, or ISBN and press Enter…')}
              />
              <button type="submit" className="btn pequeno primario" disabled={carregandoVarinha}>
                {carregandoVarinha ? '…' : 'OK'}
              </button>
            </form>
          )}

          {/* Menu de Ações */}
          <div style={{ position: 'relative' }} onClick={(e) => e.stopPropagation()}>
            <button
              className="btn-toolbar-zotero"
              onClick={() => setMenuAcoesRapidas((v) => !v)}
              title={tr('Ações em lote', 'Batch actions')}
            >
              {t('actions.quickActions')} ▾
            </button>
            {menuAcoesRapidas && (
              <div className="menu-flutuante-zotero">
                <button onClick={() => { setMenuAcoesRapidas(false); baixarPdfsEmLote(); }} disabled={baixandoLote}>
                  {tr('Buscar PDFs em acesso aberto (Unpaywall)', 'Fetch open-access PDFs (Unpaywall)')}
                </button>
                <button onClick={() => { setMenuAcoesRapidas(false); gerarInsightsPicosEmLote(); }} disabled={gerandoInsightsLote}>
                  {tr('Extrair resumo PICO e fichamento', 'Extract PICO summary & reading notes')}
                </button>
                <button onClick={() => { setMenuAcoesRapidas(false); setAbaSuperior('word'); }}>
                  {tr('Sincronizar citações com Word', 'Sync citations with Word')}
                </button>
              </div>
            )}
          </div>
        </div>

        <div className="grupo-toolbar-centro">
          <label className="seletor-estilo">
            <span>{tr('Estilo:')}</span>
            <select value={cfg.estilo} onChange={(e) => mudarEstilo(e.target.value)}>
              {estilos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <button className="btn-toolbar-zotero" onClick={() => setModalEstilos(true)} title={tr('Instalar estilos CSL', 'Install CSL citation styles')}>
            {tr('+ Estilos')}
          </button>
          <button className="btn-toolbar-zotero" onClick={() => copiarSelecionadas('citacao')} title={t('actions.copyCitation')}>
            📋 {t('actions.cite')}
          </button>
          <button className="btn-toolbar-zotero destaque-azul" onClick={() => setModalExportarWord(true)} title={t('actions.createBibliography')}>
            📄 {t('actions.bibliography')}
          </button>
          <button
            className={`btn-toolbar-zotero ${painelDireitoAberto ? 'destaque-azul' : ''}`}
            onClick={() => alternarPainelDireito()}
            title={painelDireitoAberto ? tr('Ocultar aba lateral de detalhes (expandir tabela)', 'Hide right inspector pane (expand table)') : tr('Abrir aba lateral de detalhes (Metadados, Notas e PICO)', 'Open right inspector pane (Metadata, Notes & PICO)')}
          >
            {painelDireitoAberto ? `◀ ${t('actions.hideDetails')}` : `ℹ️ ${t('actions.details')}`}
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
            placeholder={tr('Pesquisar título, autor, ano, tag ou dentro do PDF…', 'Search title, author, year, tag, or inside PDF…')}
          />
          <select
            value={escopoBusca}
            onChange={(e) => setEscopoBusca(e.target.value)}
            title={tr('Escopo da busca (igual ao Zotero)', 'Search scope')}
          >
            <option value="basico">{tr('Título, Autor, Ano', 'Title, Author, Year')}</option>
            <option value="tudo">{tr('Todos os Campos e Notas', 'All Fields & Notes')}</option>
            <option value="pdf">{tr('Texto dos PDFs', 'Full-Text PDFs')}</option>
          </select>
          {busca && (
            <button className="btn-icone" onClick={() => setBusca('')}>
              ×
            </button>
          )}
        </div>
      </div>
      )}

      {/* Guia inicial limpo exibido apenas quando a biblioteca estiver vazia */}
      {!refPdfAba && abaSuperior === 'biblioteca' && refs.length === 0 && (
        <div className="banner-cockpit-projeto">
          <div className="cockpit-linha-superior">
            <div className="cockpit-bloco-identificacao">
              <h2 className="cockpit-titulo-projeto">
                {bib?.raiz ? bib.raiz.split(/[\\/]/).pop() : tr('Minha Biblioteca', 'My Library')}
              </h2>
              <span className="cockpit-caminho-projeto" title={bib?.raiz}>
                <code>{bib?.raiz || tr('Pasta de trabalho', 'Workspace folder')}</code>
              </span>
            </div>
            <div className="cockpit-bloco-metricas">
              <button
                type="button"
                className="btn-cockpit-alternar"
                onClick={() => {
                  atualizarProjetosRecentes();
                  setMenuProjetosAberto(true);
                }}
              >
                ⇄ {t('actions.switchProject')}
              </button>
            </div>
          </div>

          <div className="cockpit-grid-acoes">
            <div className="cockpit-card-acao" onClick={() => setAbaSuperior('buscadores')}>
              <div className="cockpit-card-icone">🔍</div>
              <div className="cockpit-card-conteudo">
                <strong>{tr('1. Buscadores de Literatura', '1. Literature Search')}</strong>
                <p>{tr('PubMed, Europe PMC, SciELO, OpenAlex. Importe com 1 clique.', 'PubMed, Europe PMC, SciELO, OpenAlex. One-click import.')}</p>
              </div>
              <span className="cockpit-card-seta">→</span>
            </div>

            <div className="cockpit-card-acao" onClick={() => setVarinhaAberta(true)}>
              <div className="cockpit-card-icone">🪄</div>
              <div className="cockpit-card-conteudo">
                <strong>{tr('2. Inserir via DOI / PMID', '2. Add by DOI / PMID')}</strong>
                <p>{tr('Cole DOI/PMID para preencher metadados e baixar PDF.', 'Paste DOI/PMID to enrich metadata and fetch PDF.')}</p>
              </div>
              <span className="cockpit-card-seta">→</span>
            </div>

            <div className="cockpit-card-acao" onClick={() => setAbaSuperior('prisma')}>
              <div className="cockpit-card-icone">📊</div>
              <div className="cockpit-card-conteudo">
                <strong>{tr('3. Triagem PRISMA 2020', '3. PRISMA 2020 Screening')}</strong>
                <p>{tr('Seleção de artigos, desduplicação e fluxograma.', 'Title/abstract screening, deduplication, and flowchart.')}</p>
              </div>
              <span className="cockpit-card-seta">→</span>
            </div>

            <div className="cockpit-card-acao" onClick={() => setModalExportarWord(true)}>
              <div className="cockpit-card-icone">📝</div>
              <div className="cockpit-card-conteudo">
                <strong>{tr('4. Citar no Word', '4. Cite in Word')}</strong>
                <p>{tr('Formate referências em ABNT, APA ou Vancouver.', 'Format references in ABNT, APA, Vancouver, or 2,800+ styles.')}</p>
              </div>
              <span className="cockpit-card-seta">→</span>
            </div>
          </div>
        </div>
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
          estilo={cfg.estilo}
          idioma={cfg.idioma}
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
            gridTemplateColumns: painelDireitoAberto
              ? `${largurasPaineis.esquerdo}px 5px minmax(360px, 1fr) 5px ${largurasPaineis.direito}px`
              : `${largurasPaineis.esquerdo}px 5px 1fr`,
          }}
        >
          {/* PAINEL 1 (ESQUERDA): Árvore de Coleções em cima + Seletor de Tags/Autores embaixo */}
          <aside className="painel-esquerdo-zotero">
            <div className="arvore-colecoes-zotero">
              <div className="cabecalho-secao-zotero" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span>{tr('MINHA BIBLIOTECA', 'MY LIBRARY')}</span>
                <span style={{ fontSize: 10.5, fontWeight: 600, color: 'var(--texto-suave)' }}>
                  {refs.length}{contagens.citada > 0 ? ` · ${contagens.citada} ${tr('cit.', 'cited')}` : ''}
                </span>
              </div>

              <button
                className={`no-arvore ${visao === 'todas' ? 'ativo' : ''}`}
                onClick={() => setVisao('todas')}
              >
                <span>📚 {tr('Todos os Itens')}</span>
                <span className="cont-arvore">{refs.length}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'status:a_ler' ? 'ativo' : ''}`}
                onClick={() => setVisao('status:a_ler')}
              >
                <span>📌 {tr('A Ler (Fila de Triagem)')}</span>
                <span className="cont-arvore">{contagens.a_ler}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'status:consultada' ? 'ativo' : ''}`}
                onClick={() => setVisao('status:consultada')}
              >
                <span>📘 {tr('Consultadas (Lidas)')}</span>
                <span className="cont-arvore">{contagens.consultada}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'status:citada' ? 'ativo' : ''}`}
                onClick={() => setVisao('status:citada')}
              >
                <span>✅ {tr('Citadas no Trabalho')}</span>
                <span className="cont-arvore">{contagens.citada}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'favoritos' ? 'ativo' : ''}`}
                onClick={() => setVisao('favoritos')}
              >
                <span>⭐ {tr('Favoritos (Mendeley)')}</span>
                <span className="cont-arvore">{contagens.favoritos}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'lidos_recentes' ? 'ativo' : ''}`}
                onClick={() => setVisao('lidos_recentes')}
              >
                <span>👁 {tr('Lidos Recentemente')}</span>
                <span className="cont-arvore">{contagens.lidos_recentes}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'sem_colecao' ? 'ativo' : ''}`}
                onClick={() => setVisao('sem_colecao')}
              >
                <span>📂 {tr('Itens Não Classificados')}</span>
                <span className="cont-arvore">{contagens.sem_colecao}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'revisao' ? 'ativo' : ''}`}
                onClick={() => setVisao('revisao')}
              >
                <span>⚠ {tr('Precisa de Revisão')}</span>
                <span className="cont-arvore">{contagens.revisao}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'sem_pdf' ? 'ativo' : ''}`}
                onClick={() => setVisao('sem_pdf')}
              >
                <span>📎 {tr('Sem PDF Anexado')}</span>
                <span className="cont-arvore">{contagens.sem_pdf}</span>
              </button>
              <button
                className={`no-arvore ${visao === 'status:descartada' ? 'ativo' : ''}`}
                onClick={() => setVisao('status:descartada')}
              >
                <span>🗑 {tr('Excluídas na Triagem')}</span>
                <span className="cont-arvore">{contagens.descartada}</span>
              </button>

              <div className="cabecalho-secao-zotero" style={{ marginTop: 10 }}>
                <span>{tr('COLEÇÕES / CAPÍTULOS')}</span>
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
                      title={tr('Remover coleção', 'Remove collection')}
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
                  placeholder={tr('+ Nova coleção (Enter)…', '+ New collection (Enter)…')}
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
                  🏷 {tr('Tags', 'Tags')} ({listaTags.length})
                </button>
                <button
                  className={abaSeletorInferior === 'autores' ? 'ativa' : ''}
                  onClick={() => setAbaSeletorInferior('autores')}
                >
                  👤 {tr('Autores', 'Authors')} ({listaAutores.length})
                </button>
                <button
                  className={abaSeletorInferior === 'periodicos' ? 'ativa' : ''}
                  onClick={() => setAbaSeletorInferior('periodicos')}
                >
                  📰 {tr('Revistas', 'Journals')}
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
                  placeholder={tr(`Filtrar ${abaSeletorInferior}…`, `Filter ${abaSeletorInferior === 'autores' ? 'authors' : abaSeletorInferior === 'periodicos' ? 'journals' : 'tags'}…`)}
                />
                {visao !== 'todas' && (
                  <button className="btn pequeno fantasma" onClick={() => setVisao('todas')}>
                    {tr('Limpar')}
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
            title={tr('Arraste para redimensionar o painel esquerdo (2 cliques restaura o padrão)', 'Drag to resize left pane (double-click resets)')}
          />

          {/* PAINEL 2 (CENTRO): TABELA MULTICOLUNAS CLÁSSICA DO ZOTERO & MENDELEY */}
          <section className="painel-tabela-zotero">
            {refsFiltradas.length === 0 ? (
              refs.length === 0 ? (
                <div className="estado-vazio-projeto-novo">
                  <div className="icone-grande-vazio">📚</div>
                  <h3>{tr('Esta pasta de projeto está pronta para sua pesquisa!', 'This project folder is ready for your research!')}</h3>
                  <p className="texto-apoio-vazio">
                    {tr('Você está trabalhando no projeto:', 'Active project:')} <strong>{bib?.raiz ? bib.raiz.split(/[\\/]/).pop() : tr('Minha Biblioteca', 'My Library')}</strong>
                    <br />
                    <code className="caminho-vazio-code">{bib?.raiz}</code>
                  </p>
                  <p className="subtexto-vazio">
                    {tr('Escolha por onde deseja começar a adicionar artigos nesta biblioteca:', 'Choose how you would like to start adding references to this library:')}
                  </p>
                  <div className="botoes-acao-vazio-grid">
                    <button className="btn-vazio-card" onClick={() => setAbaSuperior('buscadores')}>
                      <span className="icone-vazio-card">🔍</span>
                      <div className="info-vazio-card">
                        <strong>{tr('Buscar nas Bases Científicas', 'Search Scientific Databases')}</strong>
                        <span>PubMed, Europe PMC, SciELO, OpenAlex, Cochrane…</span>
                      </div>
                      <span className="seta-vazio-card">→</span>
                    </button>
                    <button className="btn-vazio-card" onClick={() => setVarinhaAberta(true)}>
                      <span className="icone-vazio-card">🪄</span>
                      <div className="info-vazio-card">
                        <strong>{tr('Inserir via DOI / PMID', 'Add via DOI / PMID')}</strong>
                        <span>{tr('Metadados automáticos e download de PDF', 'Automatic metadata and PDF retrieval')}</span>
                      </div>
                      <span className="seta-vazio-card">→</span>
                    </button>
                    <button className="btn-vazio-card" onClick={async () => {
                      const p = await window.api.dialogo.escolherPdfs();
                      if (p?.length) await importarPdfs(p, 'a_ler');
                    }}>
                      <span className="icone-vazio-card">📎</span>
                      <div className="info-vazio-card">
                        <strong>{tr('Adicionar PDFs do Computador', 'Add Local PDF Files')}</strong>
                        <span>{tr('Importe arquivos PDF já salvos no seu disco', 'Import PDFs already stored on your disk')}</span>
                      </div>
                      <span className="seta-vazio-card">→</span>
                    </button>
                    <button className="btn-vazio-card" onClick={importarRisOuBib}>
                      <span className="icone-vazio-card">📄</span>
                      <div className="info-vazio-card">
                        <strong>{tr('Importar RIS / BibTeX', 'Import RIS / BibTeX')}</strong>
                        <span>{tr('Traga referências do Zotero, Mendeley ou EndNote', 'Bring references from Zotero, Mendeley, or EndNote')}</span>
                      </div>
                      <span className="seta-vazio-card">→</span>
                    </button>
                  </div>
                </div>
              ) : (
                <Vazio icone="book" titulo={tr('Nenhum item nesta coleção ou filtro', 'No items in this collection or filter')}>
                  <p>
                    {tr('Nenhuma obra corresponde aos filtros ativos nesta coleção ou busca.', 'No items match the active filters in this collection or search.')}
                  </p>
                  <button className="btn pequeno fantasma" onClick={() => setVisao('todas')}>
                    {tr('Ver todas as', 'Show all')} {refs.length} {tr('obras da biblioteca', 'library items')}
                  </button>
                </Vazio>
              )
            ) : (
              <div className="wrap-tabela-zotero">
                <table className="tabela-itens-zotero">
                  <thead>
                    <tr>
                      <th className="col-icone-fixa" style={{ width: 28 }} title={tr('Expandir anexos e notas (estilo árvore do Zotero)', 'Expand attachments and notes')} />
                      <th className="col-icone-fixa" style={{ width: 28 }} title={tr('Lido / Não lido (bolinha verde do Mendeley)', 'Read / Unread')}>
                        ●
                      </th>
                      <th className="col-icone-fixa" style={{ width: 28 }} title={tr('Favorito', 'Favorite')}>
                        ★
                      </th>
                      <th
                        className="ordenavel th-redimensionavel"
                        style={largurasColunas.titulo ? { width: largurasColunas.titulo } : undefined}
                        onClick={() => alternarOrdenacaoColuna('titulo')}
                      >
                        <span>{tr('Título')} {colunaOrdem === 'titulo' ? (direcaoOrdem === 'asc' ? '▲' : '▼') : ''}</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('titulo', e)}
                          title={tr('Arraste para redimensionar a coluna Título', 'Drag to resize Title column')}
                        />
                      </th>
                      <th
                        className="ordenavel th-redimensionavel"
                        style={{ width: largurasColunas.autor }}
                        onClick={() => alternarOrdenacaoColuna('autor')}
                      >
                        <span>{tr('Autor / Criador')} {colunaOrdem === 'autor' ? (direcaoOrdem === 'asc' ? '▲' : '▼') : ''}</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('autor', e)}
                          title={tr('Arraste para redimensionar a coluna Autor', 'Drag to resize Author column')}
                        />
                      </th>
                      <th
                        className="ordenavel th-redimensionavel"
                        style={{ width: largurasColunas.ano }}
                        onClick={() => alternarOrdenacaoColuna('ano')}
                      >
                        <span>{tr('Ano')} {colunaOrdem === 'ano' ? (direcaoOrdem === 'asc' ? '▲' : '▼') : ''}</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('ano', e)}
                          title={tr('Arraste para redimensionar a coluna Ano', 'Drag to resize Year column')}
                        />
                      </th>
                      <th
                        className="ordenavel th-redimensionavel"
                        style={{ width: largurasColunas.periodico }}
                        onClick={() => alternarOrdenacaoColuna('periodico')}
                      >
                        <span>{tr('Publicação')} {colunaOrdem === 'periodico' ? (direcaoOrdem === 'asc' ? '▲' : '▼') : ''}</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('periodico', e)}
                          title={tr('Arraste para redimensionar a coluna Publicação', 'Drag to resize Publication column')}
                        />
                      </th>
                      <th
                        className="th-redimensionavel"
                        style={{ width: largurasColunas.nivel }}
                        title={tr('Nível de Evidência (1A a 5), Nota da Revista (Quartil/Qualis/FI) e Nota do Artigo', 'Evidence Level (1A-5), Journal Quartile/IF, and Article Score')}
                      >
                        <span>{tr('Nível & Nota')}</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('nivel', e)}
                          title={tr('Arraste para redimensionar a coluna Nível & Nota', 'Drag to resize Level & Score column')}
                        />
                      </th>
                      <th
                        className="ordenavel th-redimensionavel"
                        style={{ width: largurasColunas.status }}
                        onClick={() => alternarOrdenacaoColuna('status')}
                      >
                        <span>{tr('Uso / Status')} {colunaOrdem === 'status' ? (direcaoOrdem === 'asc' ? '▲' : '▼') : ''}</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('status', e)}
                          title={tr('Arraste para redimensionar a coluna Uso / Status', 'Drag to resize Status column')}
                        />
                      </th>
                      <th
                        className="th-redimensionavel"
                        style={{ width: largurasColunas.pdf, textAlign: 'center' }}
                        title={tr('PDF (Abrir, Baixar Automático, Buscar no Google ou Anexar do PC)', 'PDF (Open, Auto-Fetch, Google Scholar, or Attach Local PDF)')}
                      >
                        <span>📎 PDF</span>
                        <span
                          className="alca-redim-col"
                          onClick={(e) => e.stopPropagation()}
                          onMouseDown={(e) => iniciarRedimColuna('pdf', e)}
                          title={tr('Arraste para redimensionar a coluna PDF', 'Drag to resize PDF column')}
                        />
                      </th>
                      <th
                        style={{ width: 84, textAlign: 'center' }}
                        title={tr('Abrir aba lateral de detalhes, metadados, notas e PICO', 'Open right inspector pane (metadata, notes, PICO)')}
                      >
                        <span>{tr('Detalhes')}</span>
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
                              {r.retratado && <span className="tag-retratado-mini">{tr('RETRATADO', 'RETRACTED')}</span>}
                              <span>{semHtml(r.csl?.title) || tr('(Sem título)', '(Untitled)')}</span>
                            </td>

                            <td className="cel-truncada">{autoresResumo(r.csl) || '—'}</td>
                            <td>{ano(r.csl) || '—'}</td>
                            <td className="cel-truncada">{semHtml(r.csl?.['container-title'] || r.csl?.publisher || '') || '—'}</td>

                            {/* Coluna Nível de Evidência + Nota da Revista & Artigo */}
                            <td
                              className="cel-truncada"
                              title={`${ins.nivelNome || ''}\n${tr('Revista', 'Journal')}: ${ins.quartil || ''} (Qualis ${ins.qualisEstimado || 'N/A'}) · ${tr('FI', 'IF')}: ${ins.fi2Anos ?? 'N/A'}\n${tr('Nota do Artigo', 'Article Score')}: ${ins.notaArtigo ?? '—'}/10 (${ins.citacoes ?? 0} ${tr('citações', 'citations')})`}
                            >
                              <span className="badge-evidencia" style={{ marginRight: 4 }}>
                                {nivCod === 'DIRETRIZ' ? tr('DIR', 'GL') : `${tr('Nív.', 'Lvl')} ${nivCod}`}
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
                                    {rotuloStatus(s.id, idioma)}
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
                                    title={tr('Abrir no leitor integrado (com grifos)', 'Open in built-in PDF reader')}
                                  >
                                    PDF
                                  </button>
                                  <button
                                    className="btn-icone-pdf-externo"
                                    onClick={() => window.api.bib.abrirPdf(r.id).catch((e) => avisar(e.message, 'erro'))}
                                    title={tr('Abrir no Navegador Externo (Edge/Chrome) ou Leitor Padrão do Windows', 'Open in external PDF viewer')}
                                  >
                                    ↗
                                  </button>
                                  <button
                                    className="btn-icone-pdf-pasta"
                                    onClick={() => window.api.bib.mostrarPdf(r.id).catch((e) => avisar(e.message, 'erro'))}
                                    title={tr('Mostrar e selecionar o arquivo PDF na pasta do Windows Explorer', 'Reveal PDF file in folder')}
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
                                      title={tr('Tentar baixar PDF gratuito automaticamente (Unpaywall / OpenAlex)', 'Try auto-downloading free PDF (Unpaywall / OpenAlex)')}
                                    >
                                      ⬇
                                    </button>
                                  )}
                                  <button
                                    className="badge-baixar-pdf"
                                    onClick={() => buscarPdfGoogleManual(r)}
                                    title={tr('Buscar este PDF no Google Acadêmico no navegador para baixar manualmente', 'Search PDF on Google Scholar')}
                                  >
                                    🌐
                                  </button>
                                  <button
                                    className="badge-baixar-pdf"
                                    onClick={() => anexarPdfManual(r.id)}
                                    title={tr('Anexar manualmente um arquivo PDF que você baixou no seu computador', 'Attach a local PDF file')}
                                  >
                                    📎
                                  </button>
                                </div>
                              )}
                            </td>

                            {/* Botão de Detalhes sob demanda na linha */}
                            <td style={{ textAlign: 'center', whiteSpace: 'nowrap' }} onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                className="btn pequeno secundario"
                                onClick={() => {
                                  if (painelDireitoAberto && refAtiva?.id === r.id) {
                                    alternarPainelDireito(false);
                                  } else {
                                    setSelecionadas([r.id]);
                                    alternarPainelDireito(true);
                                  }
                                }}
                                title={
                                  painelDireitoAberto && refAtiva?.id === r.id
                                    ? tr('Clique novamente para fechar o painel de detalhes', 'Click again to close details pane')
                                    : tr('Ver detalhes, metadados, notas e PICO desta obra', 'View metadata, notes, and PICO')
                                }
                                style={{
                                  padding: '2px 7px',
                                  fontSize: 11,
                                  borderRadius: 4,
                                  border: painelDireitoAberto && refAtiva?.id === r.id ? '1px solid var(--primaria)' : '1px solid var(--borda)',
                                  background: painelDireitoAberto && refAtiva?.id === r.id ? 'var(--primaria)' : 'var(--fundo)',
                                  color: painelDireitoAberto && refAtiva?.id === r.id ? '#ffffff' : 'var(--texto)',
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                }}
                              >
                                ℹ️ {tr('Detalhes')}
                              </button>
                            </td>
                          </tr>

                          {/* Linhas filhas expansíveis (Árvore de anexos, citações no Word e notas igual ao Zotero) */}
                          {exp && (
                            <>
                              {(r.ocorrenciasWord || []).map((oc, idxOc) => (
                                <tr key={`oc-${idxOc}`} className="linha-filha-zotero">
                                  <td colSpan={3} />
                                  <td colSpan={7} style={{ whiteSpace: 'normal', lineHeight: 1.4 }}>
                                    ↳ 📍 <strong>Word ({tr('Parágrafo', 'Paragraph')} §{oc.numParagrafo || idxOc + 1} · {tr('Linha', 'Line')} {oc.numLinha || '?'}{oc.secao ? ` · ${oc.secao}` : ''}):</strong>{' '}
                                    <em>"{oc.fraseContexto}"</em>
                                    {(oc.trechoPdf || oc.trechoArtigoResumo) && (
                                      <div style={{ color: 'var(--texto-suave)', marginTop: 2 }}>
                                        📄 <strong>{tr('Trecho no Artigo', 'Source Excerpt')}{oc.paginaPdf ? ` (${tr('pág.', 'p.')} ${oc.paginaPdf})` : ''}:</strong> "{oc.trechoPdf || oc.trechoArtigoResumo}"
                                      </div>
                                    )}
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    {r.pdf && oc.paginaPdf && (
                                      <button
                                        className="btn pequeno primario"
                                        onClick={() => abrirPdfEmAba(r, oc.paginaPdf)}
                                      >
                                        {tr('Pág.', 'p.')} {oc.paginaPdf}
                                      </button>
                                    )}
                                  </td>
                                </tr>
                              ))}
                              {r.pdf && (
                                <tr className="linha-filha-zotero" onDoubleClick={() => abrirPdfEmAba(r)}>
                                  <td colSpan={3} />
                                  <td colSpan={7}>
                                    ↳ 📄 <strong>{tr('Texto Completo (PDF):', 'Full-Text PDF:')}</strong> <code>{r.pdf}</code>
                                  </td>
                                  <td style={{ textAlign: 'center' }}>
                                    <button className="btn pequeno primario" onClick={() => abrirPdfEmAba(r)}>
                                      {tr('Abrir aba', 'Open tab')}
                                    </button>
                                  </td>
                                </tr>
                              )}
                              {r.notas && (
                                <tr className="linha-filha-zotero">
                                  <td colSpan={3} />
                                  <td colSpan={8}>
                                    ↳ 📝 <strong>{tr('Nota de Fichamento:', 'Reading Note:')}</strong> {r.notas.slice(0, 140)}
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
                {tr('Exibindo', 'Showing')} <strong>{refsFiltradas.length}</strong> {tr('de', 'of')} {refs.length} {tr('itens', 'items')} ·{' '}
                <strong style={{ color: '#2f80ed' }}>{contagens.consultada} {tr('Consultadas', 'Consulted')}</strong> ·{' '}
                <strong style={{ color: '#27ae60' }}>{contagens.citada} {tr('Citadas no Word', 'Cited in Word')}</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span>{tr('Arraste as bordas das colunas ou painéis para redimensionar.', 'Drag column or pane borders to resize.')}</span>
                <button
                  className="btn pequeno fantasma"
                  style={{ padding: '2px 7px', fontSize: 11 }}
                  onClick={restaurarLargurasPadrao}
                  title={tr('Restaurar tamanho padrão das colunas e painéis', 'Reset default column & pane widths')}
                >
                  ↺ {tr('Restaurar Colunas', 'Reset Layout')}
                </button>
                <button
                  type="button"
                  className={`btn pequeno ${painelDireitoAberto ? 'secundario' : 'primario'}`}
                  onClick={() => alternarPainelDireito()}
                  title={painelDireitoAberto ? t('actions.hideDetails') : t('actions.details')}
                  style={{ marginLeft: 6, padding: '2px 9px', fontSize: 11, fontWeight: 600 }}
                >
                  {painelDireitoAberto ? `◀ ${tr('Ocultar Painel Lateral', 'Hide Side Pane')}` : `▶ ${tr('Detalhes do Artigo', 'Item Details')}`}
                </button>
              </span>
            </footer>
          </section>

          {/* Divisor redimensionável e Painel Direito (apenas quando aberto sob demanda) */}
          {painelDireitoAberto && (
            <>
              <div
                className="divisor-painel-zotero"
                onMouseDown={(e) => iniciarRedimPainel('direito', e)}
                onDoubleClick={restaurarLargurasPadrao}
                title={tr('Arraste para redimensionar o painel direito (2 cliques restaura o padrão)', 'Drag to resize right pane (double-click resets)')}
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
                onFechar={() => alternarPainelDireito(false)}
              />
            </>
          )}
        </div>
      )}

      {/* Menu de Contexto do Botão Direito (estilo Zotero / Mendeley) */}
      {menuContexto && (
        <div
          className="menu-flutuante-zotero"
          style={{ position: 'fixed', top: menuContexto.y, left: menuContexto.x, zIndex: 300 }}
        >
          <button
            onClick={() => {
              setSelecionadas([menuContexto.ref.id]);
              alternarPainelDireito(true);
              setMenuContexto(null);
            }}
          >
            ℹ️ {tr('Ver Detalhes do Artigo (Metadados, Notas & PICO)', 'View Item Details (Metadata, Notes & PICO)')}
          </button>
          {menuContexto.ref.pdf ? (
            <>
              <button onClick={() => abrirPdfEmAba(menuContexto.ref)}>📄 {tr('Abrir PDF em Aba (Leitor Integrado)', 'Open PDF in Built-in Tab')}</button>
              <button
                onClick={() => {
                  window.api.bib.abrirPdf(menuContexto.ref.id).catch((e) => avisar(e.message, 'erro'));
                  setMenuContexto(null);
                }}
              >
                ↗ {tr('Abrir no Navegador / Leitor Externo (Windows)', 'Open in External PDF Viewer')}
              </button>
              <button
                onClick={() => {
                  window.api.bib.mostrarPdf(menuContexto.ref.id).catch((e) => avisar(e.message, 'erro'));
                  setMenuContexto(null);
                }}
              >
                📁 {tr('Mostrar Arquivo na Pasta do Windows Explorer', 'Reveal File in Folder')}
              </button>
              <button onClick={() => anexarPdfManual(menuContexto.ref.id)}>🔄 {tr('Substituir PDF por outro do PC…', 'Replace PDF with local file…')}</button>
            </>
          ) : (
            <>
              <button onClick={() => anexarPdfManual(menuContexto.ref.id)}>
                📎 {tr('Anexar PDF Baixado do Computador…', 'Attach Local PDF File…')}
              </button>
              <button onClick={() => buscarPdfGoogleManual(menuContexto.ref)}>
                🌐 {tr('Buscar PDF no Google Acadêmico (p/ Baixar Manual)', 'Search PDF on Google Scholar')}
              </button>
              <button onClick={() => baixarPdfDeUmaRef(menuContexto.ref)}>
                ⬇ {tr('Tentar Baixar PDF Gratuito Automático (Unpaywall)', 'Try Auto-Download Free PDF (Unpaywall)')}
              </button>
            </>
          )}
          <button
            onClick={async () => {
              await window.api.meta.gerarInsights({ id: menuContexto.ref.id, consultarOnline: true, forcarReescrita: true });
              await recarregarBiblioteca();
              avisar(tr('Notas, PICO, Nível do Artigo e Nota da Revista atualizados!', 'Notes, PICO, Evidence Level, and Journal Score updated!'), 'ok');
            }}
          >
            ✨ {tr('Gerar / Atualizar Notas, PICO & Nota da Revista', 'Generate / Update Notes, PICO & Journal Metrics')}
          </button>
          <button onClick={() => copiarSelecionadas('citacao', [menuContexto.ref.id])}>
            📋 {tr('Copiar Citação para o Word (e marcar Citada)', 'Copy In-Text Citation (and mark Cited)')}
          </button>
          <button onClick={() => copiarSelecionadas('bibliografia', [menuContexto.ref.id])}>
            📄 {tr('Copiar Referência Bibliográfica Formatada', 'Copy Formatted Bibliography Entry')}
          </button>
          <div className="divisor-menu" />
          <button onClick={() => atualizarRef(menuContexto.ref.id, { status: 'consultada', lido: true })}>
            📘 {tr('Marcar como Consultada (Lida)', 'Mark as Consulted (Read)')}
          </button>
          <button onClick={() => atualizarRef(menuContexto.ref.id, { status: 'citada', lido: true })}>
            ✅ {tr('Marcar como Citada no Trabalho', 'Mark as Cited in Manuscript')}
          </button>
          <button onClick={() => atualizarRef(menuContexto.ref.id, { status: 'a_ler' })}>
            📌 {tr('Marcar como A Ler', 'Mark as To Read')}
          </button>
          <div className="divisor-menu" />
          <button
            style={{ color: '#dc2626' }}
            onClick={() => excluirRefs([menuContexto.ref.id])}
          >
            🗑 {tr('Mover Item para a Lixeira', 'Move Item to Trash')}
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

      {seletorWordModal && (
        <WordQuickCitatorModal
          aberto={Boolean(seletorWordModal)}
          requisicao={seletorWordModal}
          refs={refs}
          estilo={cfg?.estilo || 'abnt'}
          estilos={estilos}
          idioma={cfg?.idioma || 'pt-BR'}
          onConfirmar={async (payload) => {
            const res = await window.api.word.responderSeletorCitacao(payload);
            setSeletorWordModal(null);
            if (res?.enviadoParaRibbon) {
              avisar('✓ Citação enviada diretamente para o cursor do Word!', 'ok');
            } else if (res?.injetadoDireto) {
              avisar(`✓ ${res.citacaoTexto} inserida como Campo no Word (${res.documentoAtivoNome})!`, 'ok');
            } else if (res?.citacaoTexto) {
              avisar(`Copiado: ${res.citacaoTexto} — cole no Word (Ctrl+V).`, 'ok');
            }
          }}
          onCancelar={async () => {
            const orig = seletorWordModal?.origem;
            setSeletorWordModal(null);
            if (orig === 'word_ribbon') {
              await window.api.word.responderSeletorCitacao({ origem: orig, cancelado: true }).catch(() => {});
            }
          }}
        />
      )}

      {modalNovoProjeto && (
        <div className="overlay-modal" onClick={() => setModalNovoProjeto(false)}>
          <div className="caixa-modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: '440px' }}>
            <header className="cabecalho-modal">
              <h3>{tr('Criar Novo Projeto / Biblioteca', 'Create New Project / Library')}</h3>
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
                {tr(
                  'Uma nova pasta será criada para este projeto com a estrutura completa e isolada de referências, PDFs, grifos e notas.',
                  'A dedicated folder will be created for this project with an isolated structure for references, PDFs, highlights, and notes.'
                )}
              </p>
              <div className="campo">
                <label style={{ fontSize: '12px', fontWeight: 600 }}>{tr('Nome do Projeto / Artigo / Tese:', 'Project / Paper / Thesis Name:')}</label>
                <input
                  autoFocus
                  type="text"
                  placeholder={tr('Ex: Tese Doutorado, Artigo Revista X, Revisão 2024', 'e.g., Systematic Review 2026, Journal Manuscript')}
                  value={nomeNovoProjeto}
                  onChange={(e) => setNomeNovoProjeto(e.target.value)}
                  style={{ width: '100%', marginTop: '4px' }}
                  required
                />
              </div>
              <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '10px' }}>
                <button type="button" className="btn secundario" onClick={() => setModalNovoProjeto(false)}>
                  {tr('Cancelar')}
                </button>
                <button type="submit" className="btn primario" disabled={!nomeNovoProjeto.trim()}>
                  {tr('Criar e Abrir Projeto', 'Create & Open Project')}
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
  const { tr } = useI18n();
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
      avisar(tr(`Modelo "${novo.nome}" instalado na pasta estilos/ e ativado!`, `Style "${novo.nome}" installed and activated!`), 'ok');
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
        avisar(tr(`Arquivo "${novo.nome}" importado e ativado!`, `Style "${novo.nome}" imported and activated!`), 'ok');
      }
    } catch (err) {
      avisar(err.message, 'erro');
    }
  };

  return (
    <Modal titulo={tr('Modelos de Formatação (ABNT, Universidades, Saúde & Internacionais)', 'Citation Styles Manager (2,800+ CSL Repositories)')} onFechar={onFechar} largura={680}>
      <div className="form-vertical">
        <div className="barra-pdf" style={{ marginBottom: 12 }}>
          <button className="btn primario pequeno" onClick={importarDoPc}>
            <Icone nome="upload" tam={13} /> {tr('Importar arquivo .CSL do computador', 'Import local .CSL file')}
          </button>
          <button className="btn secundario pequeno" onClick={() => window.api.bib.abrirPasta('estilos')}>
            <Icone nome="folder" tam={13} /> {tr('Abrir pasta estilos/ no OneDrive', 'Open estilos/ folder')}
          </button>
        </div>

        <form onSubmit={buscar} className="linha-form" style={{ marginBottom: 12 }}>
          <input
            value={consulta}
            onChange={(e) => setConsulta(e.target.value)}
            placeholder={tr('Buscar entre +2.800 normas oficiais (ex.: abnt, usp, ufmg, vancouver, lancet, ama, harvard)…', 'Search 2,800+ official CSL styles (e.g., apa, vancouver, nature, lancet, ama, ieee, abnt)…')}
          />
          <button type="submit" className="btn primario" disabled={buscando}>
            <Icone nome="search" tam={14} /> {buscando ? tr('Buscando…', 'Searching…') : tr('Buscar online', 'Search Online')}
          </button>
        </form>

        {resultados.length > 0 && (
          <div className="lista-resultados-modal" style={{ marginBottom: 14 }}>
            <h5>{tr('Resultados no repositório oficial Citation Style Language:', 'Official Citation Style Language Repository Results:')}</h5>
            {resultados.map((r) => (
              <div key={r.id} className="item-resultado-modal">
                <div>
                  <strong>{r.nomeSugerido}</strong>
                  <div className="sub-meta">
                    <code>{r.id}.csl</code>
                  </div>
                </div>
                {idsInstalados.has(r.id) ? (
                  <span className="badge-ja-existe">✓ {tr('Instalado', 'Installed')}</span>
                ) : (
                  <button
                    className="btn pequeno primario"
                    disabled={instalando === r.id}
                    onClick={() => instalar(r.id)}
                  >
                    {instalando === r.id ? tr('Instalando…', 'Installing…') : tr('+ Instalar', '+ Install')}
                  </button>
                )}
              </div>
            ))}
          </div>
        )}

        <h5>{tr('Modelos recomendados (Universidades Brasileiras & Periódicos da Saúde) — 1 clique:', 'Recommended Citation Styles — One Click:')}</h5>
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
                <span className="badge-ja-existe">✓ {tr('Instalado', 'Installed')}</span>
              ) : (
                <button
                  className="btn pequeno secundario"
                  disabled={instalando === s.id}
                  onClick={() => instalar(s.id)}
                >
                  {instalando === s.id ? tr('Baixando…', 'Downloading…') : tr('+ Baixar e Ativar', '+ Install & Activate')}
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
  const { tr } = useI18n();
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
    <Modal titulo={tr('📄 Gerar Bibliografia Formatada (Word / ABNT / Vancouver / APA)', '📄 Generate Formatted Bibliography (Word / APA / Vancouver / ABNT)')} onFechar={onFechar} largura={1080}>
      <div className="form-vertical" style={{ gap: 14 }}>
        {/* Barra de Seleção de Escopo com Abas Grandes e Fáceis de Navegar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', borderBottom: '1px solid var(--borda)', paddingBottom: 10 }}>
          <span style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
            {tr('Escopo:', 'Scope:')}
          </span>
          <button
            type="button"
            className={`btn pequeno ${escopo === 'todas' ? 'primario' : 'secundario'}`}
            style={{ fontWeight: 600, padding: '6px 14px', borderRadius: 6 }}
            onClick={() => setEscopo('todas')}
          >
            📚 {tr('Todas as Obras', 'All Items')} ({refs.filter((r) => r.status !== 'descartada').length})
          </button>
          {temSelecionadas && (
            <button
              type="button"
              className={`btn pequeno ${escopo === 'selecionadas' ? 'primario' : 'secundario'}`}
              style={{ fontWeight: 600, padding: '6px 14px', borderRadius: 6, background: escopo === 'selecionadas' ? '#2563eb' : undefined }}
              onClick={() => setEscopo('selecionadas')}
            >
              📌 {tr('Selecionadas na Tabela', 'Selected Rows')} ({selecionadas.length})
            </button>
          )}
          <button
            type="button"
            className={`btn pequeno ${escopo === 'citadas' ? 'primario' : 'secundario'}`}
            style={{ fontWeight: 600, padding: '6px 14px', borderRadius: 6 }}
            onClick={() => setEscopo('citadas')}
          >
            ✔ {tr('Citadas no Texto', 'Cited in Text')} ({qtdCitadas})
          </button>
          <button
            type="button"
            className={`btn pequeno ${escopo === 'consultadas' ? 'primario' : 'secundario'}`}
            style={{ fontWeight: 600, padding: '6px 14px', borderRadius: 6 }}
            onClick={() => setEscopo('consultadas')}
          >
            📖 {tr('Consultadas', 'Consulted')} ({qtdConsultadas})
          </button>
          <button
            type="button"
            className={`btn pequeno ${escopo === 'ambas' ? 'primario' : 'secundario'}`}
            style={{ fontWeight: 600, padding: '6px 14px', borderRadius: 6 }}
            onClick={() => setEscopo('ambas')}
          >
            {tr('Citadas + Consultadas', 'Cited + Consulted')}
          </button>
        </div>

        {/* Linha de Controles: Norma CSL, Pasta/Coleção e Busca Rápida */}
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1.1fr 1.5fr', gap: 12, alignItems: 'center' }}>
          <label className="campo" style={{ margin: 0 }}>
            <span className="campo-rotulo">{tr('Norma Bibliográfica (Estilo CSL)', 'Citation Standard (CSL Style)')}</span>
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
            <span className="campo-rotulo">{tr('Filtrar por Coleção / Pasta', 'Filter by Collection / Folder')}</span>
            <select
              value={colecaoId}
              onChange={(e) => setColecaoId(e.target.value)}
              style={{ height: 38 }}
              disabled={escopo === 'selecionadas'}
            >
              <option value="todas">{tr('Toda a Biblioteca', 'Entire Library')}</option>
              {colecoes.map((c) => (
                <option key={c.id} value={c.id}>
                  📁 {c.nome}
                </option>
              ))}
            </select>
          </label>

          <label className="campo" style={{ margin: 0 }}>
            <span className="campo-rotulo">{tr('Buscar nesta prévia', 'Filter preview')}</span>
            <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
              <input
                type="text"
                placeholder={tr('Filtrar por autor, título ou ano…', 'Filter by author, title, or year…')}
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
                {idsFiltrados.length} {idsFiltrados.length === 1 ? tr('referência ordenada', 'formatted reference') : tr('referências ordenadas', 'formatted references')}
              </span>
              <span style={{ fontSize: '12px', padding: '2px 8px', borderRadius: 999, background: 'rgba(59, 130, 246, 0.15)', color: '#3b82f6', fontWeight: 600 }}>
                {nomeEstiloAtual}
              </span>
              {carregandoPrevia && (
                <span style={{ fontSize: '12px', color: 'var(--texto-suave)' }}>{tr('Formatando…', 'Formatting…')}</span>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button
                type="button"
                className="btn secundario pequeno"
                onClick={async () => {
                  const arq = await window.api.imp.exportarArquivo({ ids: idsFiltrados, formato: 'ris' });
                  if (arq) avisar(tr(`Arquivo RIS exportado: ${arq}`, `RIS file exported: ${arq}`), 'ok');
                }}
                disabled={!idsFiltrados.length}
                title={tr('Exportar para formato .RIS (compatível com Zotero, Mendeley e EndNote)', 'Export to .RIS format')}
              >
                {tr('Exportar .RIS', 'Export .RIS')}
              </button>
              <button
                type="button"
                className="btn secundario pequeno"
                onClick={async () => {
                  const arq = await window.api.imp.exportarArquivo({ ids: idsFiltrados, formato: 'bib' });
                  if (arq) avisar(tr(`Arquivo BibTeX exportado: ${arq}`, `BibTeX file exported: ${arq}`), 'ok');
                }}
                disabled={!idsFiltrados.length}
                title={tr('Exportar para formato .BIB (BibTeX / Overleaf / LaTeX)', 'Export to .BIB (BibTeX / Overleaf / LaTeX)')}
              >
                {tr('Exportar .BIB', 'Export .BIB')}
              </button>
              <button
                type="button"
                className="btn secundario pequeno"
                onClick={exportarWordDocx}
                disabled={!idsFiltrados.length}
                title={tr('Gerar documento .DOCX para Word', 'Save formatted .DOCX file')}
              >
                💾 {tr('Salvar .DOCX', 'Save .DOCX')}
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
                {tr('Nenhuma obra encontrada para o filtro atual.', 'No items match the current filter.')}
              </p>
              <p style={{ margin: '0 0 18px', fontSize: 13, color: 'var(--texto-suave)', maxWidth: 520, marginInline: 'auto' }}>
                {escopo === 'citadas'
                  ? tr('Você ainda não marcou referências como "Citadas". Clique abaixo para ver todas as obras da biblioteca ou selecione "Todas as Obras" nas abas acima.', 'No references are marked "Cited" yet. Click below to display all library items.')
                  : tr('Nenhuma referência corresponde aos critérios ou à busca informada.', 'No reference matches the current filter or query.')}
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
                📚 {tr('Mostrar Todas as Obras', 'Show All Items')} ({refs.filter((r) => r.status !== 'descartada').length})
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
              dangerouslySetInnerHTML={{ __html: previaHtml || `<em>${tr('Gerando referências pela norma…', 'Formatting references…')}</em>` }}
            />
          )}
        </div>

        {/* Rodapé do Modal com Ações Primárias em Destaque */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--borda)' }}>
          <span style={{ fontSize: '12.5px', color: 'var(--texto-suave)' }}>
            💡 {tr('Dica: Clicar no botão abaixo copia a bibliografia com itálicos e formatação rica, pronta para colar no Word com', 'Tip: Clicking below copies rich-formatted italics ready to paste into Word with')} <strong>Ctrl+V</strong>.
          </span>
          <div style={{ display: 'flex', gap: 10 }}>
            <button type="button" className="btn secundario" onClick={onFechar} style={{ padding: '8px 16px' }}>
              {tr('Fechar')}
            </button>
            <button
              type="button"
              className="btn primario"
              onClick={copiar}
              disabled={!idsFiltrados.length}
              style={{ padding: '8px 22px', fontSize: '14px', fontWeight: 700, display: 'inline-flex', alignItems: 'center', gap: 8 }}
            >
              <Icone nome="copy" tam={16} /> {tr('Copiar Bibliografia Formatada para o Word (Ctrl+V)', 'Copy Formatted Bibliography for Word (Ctrl+V)')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
