import React, { useState } from 'react';
import { useI18n } from '../i18n.jsx';

/**
 * Faixa de tutorial contextual recolhível para o topo das telas principais.
 * Mantém a preferência de exibição salva em localStorage.
 */
export function TutorialEtapa({ idEtapa, titulo, resumo, passos = [], abertoPorPadrao = true, acoesExtras = null }) {
  const { tr } = useI18n();
  const chaveStorage = `bib_tutorial_etapa_${idEtapa}`;
  const [aberto, setAberto] = useState(() => {
    try {
      const salvo = localStorage.getItem(chaveStorage);
      if (salvo !== null) return salvo === '1';
    } catch {}
    return abertoPorPadrao;
  });

  const alternar = () => {
    const novo = !aberto;
    setAberto(novo);
    try {
      localStorage.setItem(chaveStorage, novo ? '1' : '0');
    } catch {}
  };

  return (
    <div className={`tutorial-etapa-box ${aberto ? 'aberto' : 'fechado'}`}>
      <div className="tutorial-etapa-cabecalho" onClick={alternar}>
        <div className="tutorial-etapa-titulo">
          <span className="badge-tutorial-etapa">{tr('ROTEIRO DA ETAPA', 'STEP-BY-STEP GUIDE')}</span>
          <strong>{titulo}</strong>
          {!aberto && <span className="tutorial-etapa-resumo">— {resumo}</span>}
        </div>
        <button type="button" className="btn-toggle-tutorial">
          {aberto ? tr('▲ Ocultar passo a passo', '▲ Hide walkthrough') : tr('▼ Ver passo a passo', '▼ Show walkthrough')}
        </button>
      </div>

      {aberto && (
        <div className="tutorial-etapa-corpo">
          {resumo && <p className="tutorial-etapa-intro">{resumo}</p>}
          <div className="tutorial-etapa-grid">
            {passos.map((p, idx) => (
              <div key={idx} className="tutorial-etapa-card">
                <div className="tutorial-etapa-num">{idx + 1}</div>
                <div className="tutorial-etapa-texto">
                  <strong>{p.titulo}</strong>
                  <p>{p.texto}</p>
                  {p.acao && (
                    <button
                      type="button"
                      className="btn pequeno primario"
                      style={{ marginTop: 6 }}
                      onClick={(e) => {
                        e.stopPropagation();
                        p.acao();
                      }}
                    >
                      {p.rotuloAcao || tr('Executar agora', 'Run now')}
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
          {acoesExtras && <div className="tutorial-etapa-rodape">{acoesExtras}</div>}
        </div>
      )}
    </div>
  );
}

/**
 * 6 Capítulos do Manual de Uso e Referência (v1.2.0)
 */
const CAPITULOS_MANUAL = [
  {
    id: 'cap1',
    titulo: 'Capítulo 1 — Estrutura em Nuvem, Seletor de Projetos e Armazenamento Atômico',
    conteudo: [
      {
        subtitulo: '1.1. Por que cada referência fica em um arquivo separado',
        texto:
          'Para evitar conflitos e corrupção comuns em bancos monolíticos SQLite sincronizados em nuvem (OneDrive, Google Drive ou Dropbox), o Bibliografia armazena cada referência em um arquivo .json próprio dentro de "referencias/". Os PDFs ficam organizados em "pdfs/" (ou "storage/") e as marcações de leitura permanecem isoladas por obra.',
      },
      {
        subtitulo: '1.2. Troca rápida de projetos e sincronização BibTeX',
        itens: [
          'Indicador de Projeto Ativo: o cabeçalho exibe a pasta em uso e a quantidade exata de referências carregadas no projeto atual.',
          'Seletor de Projetos Recentes: clique no botão de pasta para alternar rapidamente entre bibliotecas detectadas no computador ou na nuvem.',
          'Sincronização em nuvem: no Windows Explorer, marque "Sempre manter neste dispositivo" na pasta da biblioteca no OneDrive para manter os PDFs acessíveis offline.',
          'Arquivo library.bib: atualizado automaticamente na raiz da pasta após cada edição para uso contínuo em LaTeX e Overleaf.',
        ],
      },
    ],
  },
  {
    id: 'cap2',
    titulo: 'Capítulo 2 — Navegação pela Barra Lateral Permanente',
    conteudo: [
      {
        subtitulo: '2.1. Organização dos módulos na barra esquerda',
        texto:
          'A barra lateral fixa concentra os sete ambientes do fluxo de trabalho acadêmico, permitindo alternar entre pesquisa, leitura, redação e revisão sem perder os filtros abertos.',
      },
      {
        subtitulo: '2.2. Descrição de cada módulo',
        itens: [
          'Biblioteca: árvore de coleções e filtros à esquerda, tabela ordenável com status (A ler, Consultada, Citada) ao centro e inspetor CSL/PICO à direita.',
          'Buscadores: consulta integrada ao PubMed, Europe PMC, Crossref, OpenAlex, SciELO com botões claros ("Ir ao site" para abrir o portal externo e "Importar" quando houver resultados pela API).',
          'Manuscrito: controle de obras Consultadas vs. Citadas, vínculo com o Microsoft Word (porta 23119) e exportação do Pacote de Submissão (.zip) com revisão cega e SVGs PRISMA/RoB.',
          'Auditoria: revisão reversa com Guardião Simbólico, Cross-Encoder NLI (2º estágio), reconciliação de tabelas XML/Resumo/siglas, citações múltiplas, Raio-X Bibliométrico, Memória de Decisão SHA-256 e Pre-Flight Editorial.',
          'PRISMA: deduplicação, triagem de títulos e resumos, fluxograma PRISMA 2020 e painel de Risco de Viés (Cochrane RoB 2 / ROBINS-I).',
          'Grafo: navegação por referências citadas e citantes (citation chaining) e caderno de síntese.',
          'Tutorial: roteiro interativo e manual textual do sistema.',
          'Rodapé: seletor de idioma (PT/EN), alternância de tema Claro/Escuro e janela de Diagnóstico / Versão v1.2.0 (incluindo Token Local do Web Clipper).',
        ],
      },
    ],
  },
  {
    id: 'cap3',
    titulo: 'Capítulo 3 — Leitor de PDF, Zoom e Marcação de Trechos Citados',
    conteudo: [
      {
        subtitulo: '3.1. Leitura em abas com rolagem completa',
        texto:
          'Ao dar duplo-clique em qualquer artigo com PDF anexado, o documento abre em uma aba própria no topo da janela. A barra de zoom vai até 250% mantendo rolagem vertical e horizontal sem cortes.',
      },
      {
        subtitulo: '3.2. Grifos coloridos e registro de página exata',
        itens: [
          'Seleção direta: selecione frases sobre a página usando a camada de texto do PDF.js.',
          'Marca-texto por categoria: escolha entre Amarelo (Conceito), Verde (PICO), Azul (Citação) ou Rosa (Limitação/Crítica).',
          'Trecho Citado com página: ao marcar um trecho como citação, o sistema salva o texto original com o número exato da página e altera o status da obra para "Citada".',
          'Exportação de notas: copie os comentários organizados por página diretamente para colar no documento de texto.',
        ],
      },
    ],
  },
  {
    id: 'cap4',
    titulo: 'Capítulo 4 — Auditoria Reversa de Manuscritos (.DOCX e .PDF)',
    conteudo: [
      {
        subtitulo: '4.1. Conferência determinística entre texto, lista final e bases',
        texto:
          'A Auditoria Reversa extrai citações no corpo do texto (ABNT Autor-Data e Vancouver numérico/sobrescrito, inclusive após pontuação) e cruza com a lista final de referências, consultando Crossref, PubMed e OpenAlex com cache local para manter consistência entre execuções.',
      },
      {
        subtitulo: '4.2. Recursos específicos para PDFs e validação semântica',
        itens: [
          'Layout em 2 colunas e figuras rotacionadas: detecta calha central para evitar mistura entre colunas e preserva textos rotacionados a 90°, removendo cabeçalhos repetidos de página.',
          'Validação em cascata offline (Bi-Encoder + Cross-Encoder NLI + Guardião Simbólico): combina triagem BM25, modelo ONNX custom-forensic-minilm, Cross-Encoder NLI custom-forensic-nli-int8 (detecção de contradição lógica) e checagem simbólica de polaridade NegEx, divergência numérica e apud oculto.',
          'Reconciliador Intra-Documento, Citações Múltiplas e Raio-X Bibliométrico: confronta tabelas XML (<w:tbl>) × texto, Resumo × Resultados, siglas sem definição, detecta obra intrusa em citações compostas e exibe a Pirâmide de Evidência em 7 níveis.',
          'Memória de Decisão Editorial (SHA-256) e Pre-Flight Editorial: salve falsos positivos justificados em auditoria_decisoes.json (reativa automaticamente se 1 palavra mudar) e valide limites de palavras, referências, tabelas e ética para perfis ICMJE/Vancouver, Saúde Coletiva Brasil (CSP/RSP/C&SC) ou Personalizado.',
          'Download em lote de PDFs e detecção de retratações: salva PDFs abertos em pasta local e sinaliza artigos retratados no Crossref e OpenAlex.',
        ],
      },
    ],
  },
  {
    id: 'cap5',
    titulo: 'Capítulo 5 — Formatação CSL, Microsoft Word e Pandoc / Quarto',
    conteudo: [
      {
        subtitulo: '5.1. Processamento CSL (citeproc-js)',
        texto:
          'As citações e listas finais seguem o padrão Citation Style Language (CSL), com suporte nativo a ABNT NBR 6023/10520, Vancouver, APA 7ª ed., Harvard, Chicago e Nature, além de instalação sob demanda de estilos adicionais.',
      },
      {
        subtitulo: '5.2. Exportação e integrações locais',
        itens: [
          'Modal Criar Bibliografia: selecione apenas "Citadas", "Consultadas", uma "Coleção" ou "Todas" e copie mantendo itálico e recuo para colar no Word.',
          'Servidor local (porta 23119): comunica-se exclusivamente em loopback (127.0.0.1) com o suplemento .dotm do Microsoft Word, Web Clipper Manifest V3 e filtro Pandoc/Quarto (>= 1.4.0).',
          'Pacote de Submissão Editorial (.zip): na aba Manuscrito, exporte um .zip com cópia limpa do .docx para revisão cega (campos dinâmicos convertidos em texto plano e metadados do autor removidos), diagramas vetoriais SVG (PRISMA 2020 e RoB 2 / ROBINS-I) e resumo técnico de conformidade.',
        ],
      },
    ],
  },
  {
    id: 'cap6',
    titulo: 'Capítulo 6 — Triagem Sistemática (PRISMA 2020) e Risco de Viés',
    conteudo: [
      {
        subtitulo: '6.1. Pipeline de revisão sistemática',
        texto:
          'O módulo PRISMA reúne ferramentas para deduplicação, triagem de títulos e resumos, seleção de texto completo e geração do diagrama de fluxo PRISMA 2020.',
      },
      {
        subtitulo: '6.2. Etapas e avaliação de Risco de Viés',
        itens: [
          '1. Deduplicação segura: compara DOI, PMID e título mesclando registros duplicados sem descartar PDFs ou anotações.',
          '2. Triagem e Elegibilidade: registra decisões (Incluir, Dúvida, Excluir) com motivos padronizados e calcula o fluxograma em tempo real.',
          '3. Risco de Viés (RoB 2 / ROBINS-I): gera sugestões iniciais por domínio ancoradas ao texto, exigindo confirmação explícita de um revisor humano e gravando trilha encadeada por SHA-256.',
        ],
      },
    ],
  },
];

const CAPITULOS_MANUAL_EN = [
  {
    id: 'cap1',
    titulo: 'Chapter 1 — Cloud Storage, Project Switcher & Atomic Persistence',
    conteudo: [
      {
        subtitulo: '1.1. Why each reference is stored in an independent JSON file',
        texto:
          'To prevent database locks and corruption common in monolithic SQLite files synced over cloud drives (OneDrive, Google Drive, Dropbox), Bibliography saves each reference as an atomic .json file inside "referencias/". PDFs live in "pdfs/" (or "storage/") and reading annotations remain isolated per work.',
      },
      {
        subtitulo: '1.2. Fast project switching and continuous BibTeX sync',
        itens: [
          'Active Project Indicator: the top bar displays the active folder and exact reference count.',
          'Recent Projects Switcher: switch between thesis, manuscript, or team libraries in one click.',
          'Offline Cloud Sync: on Windows OneDrive, mark the library folder as "Always keep on this device" for instant PDF loading.',
          'library.bib: continuously updated at the library root for LaTeX and Overleaf workflows.',
        ],
      },
    ],
  },
  {
    id: 'cap2',
    titulo: 'Chapter 2 — Permanent Sidebar Navigation',
    conteudo: [
      {
        subtitulo: '2.1. Seven integrated academic workspaces',
        texto:
          'The left navigation rail keeps all seven modules one click away without losing active filters or open PDF tabs.',
      },
      {
        subtitulo: '2.2. Module overview',
        itens: [
          'Library: collections & filters on the left, sortable table (To read, Consulted, Cited) in the center, and CSL/PICO inspector on the right.',
          'Search Hub: parallel queries across PubMed, Europe PMC, Crossref, OpenAlex, and SciELO with clear "Go to site" vs. "Import" actions.',
          'Manuscript: Cited vs. Consulted tracking, Microsoft Word bridge (port 23119), and Blind-Review Submission Package (.zip) export.',
          'Forensic Audit: reverse audit with Symbolic Guardian, 2nd-stage Cross-Encoder NLI, XML table/abstract/acronym reconciler, multiple-citation intruder detection, Bibliometric X-Ray, SHA-256 Decision Memory, and Editorial Pre-Flight.',
          'PRISMA: safe deduplication, title/abstract screening, PRISMA 2020 flow diagram, and Risk of Bias (RoB 2 / ROBINS-I).',
          'Citation Graph: earlier, later, and similar paper exploration (OpenAlex) plus synthesis notebook.',
          'Tutorial: interactive walkthrough and searchable reference manual (v1.2.0).',
        ],
      },
    ],
  },
  {
    id: 'cap3',
    titulo: 'Chapter 3 — Tabbed PDF Reader, Highlights & Cited Excerpts',
    conteudo: [
      {
        subtitulo: '3.1. Multi-tab reading with full zoom',
        texto:
          'Double-click any work with an attached PDF to open it in a dedicated top tab with zoom up to 250% and smooth scrolling.',
      },
      {
        subtitulo: '3.2. Color highlights and Ground-Truth cited pages',
        itens: [
          'Direct text selection via PDF.js text layer.',
          'Color categories: Yellow (Concept), Green (PICO), Blue (Citation), and Pink (Limitation/Critique).',
          'Cited Excerpt: saves exact passage + page number as Ground Truth for Forensic Audit and marks the work as Cited.',
        ],
      },
    ],
  },
  {
    id: 'cap4',
    titulo: 'Chapter 4 — Forensic Reverse Audit (.DOCX and .PDF)',
    conteudo: [
      {
        subtitulo: '4.1. Deterministic verification across text, references, and databases',
        texto:
          'Extracts in-text citations (ABNT Author-Date and Vancouver/Nature numeric/superscript), cross-checks the reference list, and verifies sources against Crossref, PubMed, and OpenAlex with local caching.',
      },
      {
        subtitulo: '4.2. Cascade AI, Symbolic Guardian, Intra-Doc & Pre-Flight',
        itens: [
          'Offline Cascade Validation: combines BM25 retrieval, Bi-Encoder ONNX (custom-forensic-minilm), Cross-Encoder NLI (custom-forensic-nli-int8) for logical contradiction detection, and Symbolic Guardian (NegEx polarity, numeric checks, hidden apud).',
          'Intra-Document Reconciler & Bibliometric X-Ray: checks XML <w:tbl> tables vs. prose, Abstract vs. Results, undefined acronyms, multiple-citation intruders, and 7-level Evidence Pyramid.',
          'SHA-256 Editorial Decision Memory & Pre-Flight: suppress justified false positives in auditoria_decisoes.json (auto-reactivates if 1 word changes) and validate ICMJE/Vancouver, Public Health Brazil, or Custom journal limits.',
        ],
      },
    ],
  },
  {
    id: 'cap5',
    titulo: 'Chapter 5 — CSL Formatting, Microsoft Word & Submission Package',
    conteudo: [
      {
        subtitulo: '5.1. Citation Style Language (citeproc-js)',
        texto:
          'Native support for ABNT NBR 6023/10520, Vancouver, APA 7th, Harvard, Chicago, and Nature, plus on-demand CSL style installation.',
      },
      {
        subtitulo: '5.2. Local bridge (port 23119) & Blind-Review .zip export',
        itens: [
          'Loopback-only local server (127.0.0.1:23119) for the Word .dotm add-in, Chrome/Edge Web Clipper, and Pandoc/Quarto.',
          'Submission Package (.zip): flattens dynamic Word fields, strips author metadata for double-blind review, and bundles PRISMA 2020 & RoB SVG figures plus compliance summary.',
        ],
      },
    ],
  },
  {
    id: 'cap6',
    titulo: 'Chapter 6 — Systematic Screening (PRISMA 2020) & Risk of Bias',
    conteudo: [
      {
        subtitulo: '6.1. End-to-end systematic review workflow',
        texto:
          'Combines safe deduplication, dual-blind title/abstract screening, real-time PRISMA 2020 diagram generation, and human-verified RoB 2 / ROBINS-I assessments with SHA-256 audit trail.',
      },
    ],
  },
];

export default function HelpGuideView({
  irParaAba,
  aoAcionarVarinha,
  aoAdicionarPdfs,
  aoImportarPasta,
  aoBuscarPdfsGratuitos,
  aoAbrirModalEstilos,
  aoAbrirModalCadastro,
}) {
  const { tr } = useI18n();
  const ehEn = tr('pt', 'en') === 'en';
  const capitulosAtivos = ehEn ? CAPITULOS_MANUAL_EN : CAPITULOS_MANUAL;
  const [modoGuia, setModoGuia] = useState('tutorial'); // 'tutorial' | 'manual'
  const [etapaAtiva, setEtapaAtiva] = useState('etapa-nuvem');
  const [buscaManual, setBuscaManual] = useState('');
  const [passosConcluidos, setPassosConcluidos] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('bib_checklist_tutorial_v12') || '{}');
    } catch {
      return {};
    }
  });

  const alternarChecklist = (id) => {
    const novo = { ...passosConcluidos, [id]: !passosConcluidos[id] };
    setPassosConcluidos(novo);
    try {
      localStorage.setItem('bib_checklist_tutorial_v12', JSON.stringify(novo));
    } catch {}
  };

  const capitulosFiltrados = capitulosAtivos.filter((cap) => {
    if (!buscaManual.trim()) return true;
    const q = buscaManual.toLowerCase();
    if (cap.titulo.toLowerCase().includes(q)) return true;
    return cap.conteudo.some(
      (c) =>
        (c.subtitulo && c.subtitulo.toLowerCase().includes(q)) ||
        (c.texto && c.texto.toLowerCase().includes(q)) ||
        (c.itens && c.itens.some((i) => i.toLowerCase().includes(q)))
    );
  });

  const copiarManualCompleto = () => {
    const texto = capitulosAtivos.map((cap) => {
      const blocos = cap.conteudo
        .map((c) => {
          const linhas = [c.subtitulo];
          if (c.texto) linhas.push(c.texto);
          if (c.itens) linhas.push(...c.itens.map((i) => `  • ${i}`));
          return linhas.join('\n');
        })
        .join('\n\n');
      return `${cap.titulo}\n${'='.repeat(cap.titulo.length)}\n\n${blocos}`;
    }).join('\n\n\n');

    if (window.api?.sistema?.copiarTexto) {
      window.api.sistema.copiarTexto(texto);
    } else {
      navigator.clipboard?.writeText(texto);
    }
    alert(tr('Manual de uso (v1.2.0) copiado para a área de transferência.', 'User manual (v1.2.0) copied to clipboard.'));
  };

  return (
    <div className="guia-container">
      {/* BANNER SUPERIOR COM SELETOR DE MODO */}
      <div className="guia-banner">
        <div>
          <h2>{tr('Guia de Operação e Manual de Referência (v1.2.0)', 'User Guide & Reference Manual (v1.2.0)')}</h2>
          <p>
            {tr(
              'Instruções práticas cobrindo armazenamento em nuvem, navegação lateral, leitor de PDFs, auditoria reversa, integração com Word e triagem PRISMA 2020.',
              'Practical guide covering cloud storage, sidebar navigation, PDF reader, reverse audit, Word integration, and PRISMA 2020 screening.'
            )}
          </p>
        </div>
        <div className="guia-banner-acoes" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={modoGuia === 'tutorial' ? 'aba-modo-guia ativa' : 'aba-modo-guia'}
            onClick={() => setModoGuia('tutorial')}
          >
            {tr('1. Roteiro Interativo', '1. Interactive Walkthrough')}
          </button>
          <button
            type="button"
            className={modoGuia === 'manual' ? 'aba-modo-guia ativa' : 'aba-modo-guia'}
            onClick={() => setModoGuia('manual')}
          >
            {tr('2. Manual de Leitura', '2. Reference Manual')}
          </button>
          <button
            type="button"
            style={{
              background: 'var(--primaria)',
              color: '#ffffff',
              border: 'none',
              padding: '8px 14px',
              borderRadius: 6,
              fontWeight: 700,
              cursor: 'pointer',
            }}
            onClick={() => irParaAba('biblioteca')}
          >
            {tr('Abrir Biblioteca', 'Open Library')}
          </button>
        </div>
      </div>

      {/* MODO 2: MANUAL COMPLETO PARA LEITURA */}
      {modoGuia === 'manual' ? (
        <div className="manual-leitura-container">
          <div className="manual-leitura-topo">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
              <strong>{tr('Buscar no Manual:', 'Search Manual:')}</strong>
              <input
                value={buscaManual}
                onChange={(e) => setBuscaManual(e.target.value)}
                placeholder={tr('Ex.: nuvem, PDF, ABNT, Vancouver, auditoria, Word, PRISMA…', 'e.g. cloud, PDF, ABNT, Vancouver, audit, Word, PRISMA…')}
                style={{ flex: 1, maxWidth: 440, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--borda)' }}
              />
              {buscaManual && (
                <button type="button" className="btn pequeno" onClick={() => setBuscaManual('')}>
                  {tr('Limpar', 'Clear')}
                </button>
              )}
            </div>
            <button type="button" className="btn secundario" onClick={copiarManualCompleto}>
              {tr('Copiar Manual Completo', 'Copy Full Manual')}
            </button>
          </div>

          <div className="manual-leitura-folha">
            <div className="manual-capa">
              <h1>{tr('MANUAL DE USO — BIBLIOGRAFIA CIENTÍFICA (v1.2.0)', 'USER MANUAL — SCIENTIFIC BIBLIOGRAPHY (v1.2.0)')}</h1>
              <p>
                {tr(
                  'Guia de referência para organização bibliográfica, leitura de PDFs com marcação de páginas citadas, auditoria reversa de manuscritos, formatação CSL para Word e revisão sistemática PRISMA 2020.',
                  'Reference guide for bibliographic management, tabbed PDF reading with cited pages, forensic manuscript auditing, CSL Word formatting, and PRISMA 2020 systematic reviews.'
                )}
              </p>
              <div className="manual-indice">
                <strong>{tr('Índice dos 6 Capítulos:', 'Table of Contents (6 Chapters):')}</strong>
                <div className="manual-indice-links">
                  {capitulosAtivos.map((c) => (
                    <a key={c.id} href={`#${c.id}`} className="link-indice-manual">
                      {c.titulo}
                    </a>
                  ))}
                </div>
              </div>
            </div>

            {capitulosFiltrados.map((cap) => (
              <article key={cap.id} id={cap.id} className="manual-capitulo">
                <h2>{cap.titulo}</h2>
                {cap.conteudo.map((bloco, i) => (
                  <div key={i} className="manual-bloco">
                    <h3>{bloco.subtitulo}</h3>
                    {bloco.texto && <p>{bloco.texto}</p>}
                    {bloco.itens && (
                      <ul>
                        {bloco.itens.map((item, j) => (
                          <li key={j}>{item}</li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </article>
            ))}
          </div>
        </div>
      ) : (
        /* MODO 1: ROTEIRO INTERATIVO (6 ETAPAS) */
        <div className="guia-corpo">
          <aside className="guia-menu">
            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-nuvem' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-nuvem')}
            >
              <span className="guia-menu-icone">1</span>
              <div className="guia-menu-texto">
                <strong>{tr('Etapa 1: Nuvem e Projetos', 'Step 1: Cloud & Projects')}</strong>
                <span>{tr('Armazenamento atômico e troca de pastas.', 'Atomic storage and folder switching.')}</span>
              </div>
            </button>

            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-rail' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-rail')}
            >
              <span className="guia-menu-icone">2</span>
              <div className="guia-menu-texto">
                <strong>{tr('Etapa 2: Barra Lateral', 'Step 2: Sidebar Navigation')}</strong>
                <span>{tr('Navegação entre módulos e tema claro/escuro.', 'Module switching and light/dark theme.')}</span>
              </div>
            </button>

            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-pdf' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-pdf')}
            >
              <span className="guia-menu-icone">3</span>
              <div className="guia-menu-texto">
                <strong>{tr('Etapa 3: Leitura e Grifos em PDF', 'Step 3: PDF Reading & Highlights')}</strong>
                <span>{tr('Abas superiores, marca-texto e página citada.', 'Top tabs, highlights, and cited pages.')}</span>
              </div>
            </button>

            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-auditoria' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-auditoria')}
            >
              <span className="guia-menu-icone">4</span>
              <div className="guia-menu-texto">
                <strong>{tr('Etapa 4: Auditoria Reversa', 'Step 4: Forensic Reverse Audit')}</strong>
                <span>{tr('Conferência de .docx/.pdf nas bases e nos PDFs.', 'Verify .docx/.pdf against databases & PDFs.')}</span>
              </div>
            </button>

            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-word' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-word')}
            >
              <span className="guia-menu-icone">5</span>
              <div className="guia-menu-texto">
                <strong>{tr('Etapa 5: Citações e Word (23119)', 'Step 5: Citations & Word (23119)')}</strong>
                <span>{tr('Normas CSL, .dotm e Pacote .zip.', 'CSL styles, .dotm add-in & .zip package.')}</span>
              </div>
            </button>

            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-prisma' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-prisma')}
            >
              <span className="guia-menu-icone">6</span>
              <div className="guia-menu-texto">
                <strong>{tr('Etapa 6: PRISMA 2020 e Viés', 'Step 6: PRISMA 2020 & Bias')}</strong>
                <span>{tr('Triagem sistemática e avaliação RoB 2 / ROBINS-I.', 'Systematic screening & RoB 2 / ROBINS-I.')}</span>
              </div>
            </button>
          </aside>

          <section className="guia-conteudo">
            {/* ETAPA 1: NUVEM E PROJETOS */}
            {etapaAtiva === 'etapa-nuvem' && (
              <div className="guia-secao">
                <h3>{tr('Etapa 1: Organização na Nuvem e Seletor de Projetos', 'Step 1: Cloud Organization & Project Switcher')}</h3>
                <p className="guia-intro">
                  {tr(
                    'Entenda como as referências são gravadas sem risco de conflito na nuvem e como alternar entre múltiplos projetos.',
                    'Learn how references are saved atomically without cloud sync conflicts and how to switch between projects.'
                  )}
                </p>

                <div className="guia-passos-lista">
                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['nuvem_1']}
                          onChange={() => alternarChecklist('nuvem_1')}
                        />
                        <strong>{tr('1.1. Estrutura das pastas da biblioteca', '1.1. Library folder structure')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'Na pasta escolhida para a sua biblioteca, a subpasta referencias/ armazena cada obra em um arquivo JSON independente, a pasta pdfs/ (ou storage/) guarda os textos integrais e library.bib é atualizado continuamente para uso em LaTeX.',
                        'Inside your library folder, referencias/ stores each work in an independent atomic JSON file, pdfs/ (or storage/) holds full-text PDFs, and library.bib stays synced for LaTeX.'
                      )}
                    </p>
                    <div style={{ margin: '8px 0 0 28px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn pequeno primario" onClick={() => window.api?.bib?.abrirPasta?.()}>
                        {tr('Abrir Pasta da Biblioteca no Explorer', 'Open Library Folder in Explorer')}
                      </button>
                    </div>
                  </div>

                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['nuvem_2']}
                          onChange={() => alternarChecklist('nuvem_2')}
                        />
                        <strong>{tr('1.2. Manter cópia local no OneDrive / Drive', '1.2. Keep local copy on OneDrive / Drive')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'Se usar OneDrive no Windows, clique com o botão direito sobre a pasta da biblioteca e selecione "Sempre manter neste dispositivo" para evitar atrasos ao abrir PDFs em modo Arquivos Sob Demanda.',
                        'When using Windows OneDrive, right-click your library folder and select "Always keep on this device" to prevent Files On-Demand delays when opening PDFs.'
                      )}
                    </p>
                  </div>

                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['nuvem_3']}
                          onChange={() => alternarChecklist('nuvem_3')}
                        />
                        <strong>{tr('1.3. Múltiplos projetos e bibliotecas independentes', '1.3. Multiple independent project libraries')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'Use o seletor de pasta no cabeçalho superior para abrir outra biblioteca existente ou criar uma nova pasta separada por tese, artigo ou equipe.',
                        'Use the project selector in the top header to switch to another existing library or create a separate folder per thesis, paper, or team.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 2: BARRA LATERAL */}
            {etapaAtiva === 'etapa-rail' && (
              <div className="guia-secao">
                <h3>{tr('Etapa 2: Navegação pela Barra Lateral', 'Step 2: Sidebar Navigation')}</h3>
                <p className="guia-intro">
                  {tr(
                    'A barra vertical à esquerda mantém todos os módulos acessíveis sem quebrar rótulos em telas menores.',
                    'The left vertical rail keeps all modules accessible without breaking layout on smaller screens.'
                  )}
                </p>

                <div className="guia-passos-lista">
                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['rail_1']}
                          onChange={() => alternarChecklist('rail_1')}
                        />
                        <strong>{tr('2.1. Troca direta entre módulos', '2.1. Instant switching across modules')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'Alterna rapidamente entre Biblioteca, Buscadores, Manuscrito, Auditoria, PRISMA, Grafo e Tutorial mantendo seu trabalho ativo.',
                        'Quickly switch between Library, Search Hub, Manuscript, Forensic Audit, PRISMA, Citation Graph, and Tutorial without losing active work.'
                      )}
                    </p>
                    <div style={{ margin: '8px 0 0 28px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn pequeno primario" onClick={() => irParaAba('biblioteca')}>
                        {tr('Ir para Biblioteca', 'Go to Library')}
                      </button>
                      <button className="btn pequeno secundario" onClick={() => irParaAba('buscadores')}>
                        {tr('Ir para Buscadores', 'Go to Search Hub')}
                      </button>
                    </div>
                  </div>

                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['rail_2']}
                          onChange={() => alternarChecklist('rail_2')}
                        />
                        <strong>{tr('2.2. Idioma, Tema e Diagnóstico do Sistema', '2.2. Language, Theme & System Diagnostics')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'No rodapé da barra lateral ficam os controles de idioma (PT/EN), alternância entre tema claro e escuro e o botão de versão (v1.2.0) com diagnóstico local e token do Web Clipper.',
                        'At the bottom of the sidebar you can toggle language (PT/EN), switch Light/Dark mode, and open the v1.2.0 Diagnostics & Web Clipper Token modal.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 3: LEITURA E GRIFOS EM PDF */}
            {etapaAtiva === 'etapa-pdf' && (
              <div className="guia-secao">
                <h3>{tr('Etapa 3: Leitura em Abas, Grifos e Trechos Citados', 'Step 3: Tabbed PDF Reading, Highlights & Cited Excerpts')}</h3>
                <p className="guia-intro">
                  {tr(
                    'Abra múltiplos artigos em paralelo, destaque passagens relevantes e registre o número exato da página citada.',
                    'Open multiple papers side by side in tabs, highlight key passages, and record exact cited page numbers.'
                  )}
                </p>

                <div className="guia-passos-lista">
                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['pdf_1']}
                          onChange={() => alternarChecklist('pdf_1')}
                        />
                        <strong>{tr('3.1. Abertura de artigos em abas', '3.1. Opening papers in tabs')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'Dê duplo-clique sobre qualquer item da tabela que possua PDF anexado. Cada arquivo abre em uma aba própria no topo da tela.',
                        'Double-click any table row with an attached PDF to open it in its own tab at the top of the window.'
                      )}
                    </p>
                  </div>

                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['pdf_2']}
                          onChange={() => alternarChecklist('pdf_2')}
                        />
                        <strong>{tr('3.2. Registro de trecho citado e página', '3.2. Saving cited excerpt & exact page')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'Selecione a frase desejada no PDF e clique em "Marcar como Trecho Citado". O sistema salva a citação vinculada à página exata e altera o status da obra para "Citada".',
                        'Select a passage in the PDF and click "Mark as Cited Excerpt". The system saves it with the exact page number as Ground Truth and marks the work as Cited.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 4: AUDITORIA REVERSA */}
            {etapaAtiva === 'etapa-auditoria' && (
              <div className="guia-secao">
                <h3>{tr('Etapa 4: Auditoria Reversa de Manuscritos (.DOCX e .PDF)', 'Step 4: Forensic Reverse Audit (.DOCX and .PDF)')}</h3>
                <p className="guia-intro">
                  {tr(
                    'Confira citações órfãs, referências não localizadas nas bases científicas, páginas de citações diretas e compatibilidade semântica com as fontes.',
                    'Verify orphan citations, unindexed references, direct quote pages, logical consistency, and semantic alignment with source papers.'
                  )}
                </p>

                <div className="guia-passos-lista">
                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['audit_1']}
                          onChange={() => alternarChecklist('audit_1')}
                        />
                        <strong>{tr('4.1. Carregar arquivo .DOCX ou .PDF', '4.1. Load a .DOCX or .PDF manuscript')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'Abra o módulo Auditoria, selecione seu arquivo .docx ou .pdf (ou cole o texto) e execute a conferência. Arquivos .docx preservam tabelas XML e parágrafos originais; PDFs publicados passam por segmentação de 2 colunas.',
                        'Open Forensic Audit, load your .docx or .pdf file (or paste text), and run the audit. .docx files preserve XML tables and original paragraphs; published PDFs use 2-column layout extraction.'
                      )}
                    </p>
                    <div style={{ margin: '8px 0 0 28px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn pequeno primario" onClick={() => irParaAba('auditoria')}>
                        {tr('Abrir Auditoria Reversa', 'Open Forensic Audit')}
                      </button>
                    </div>
                  </div>

                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['audit_2']}
                          onChange={() => alternarChecklist('audit_2')}
                        />
                        <strong>{tr('4.2. Filtros forenses, NLI em cascata, Raio-X e Pre-Flight Editorial', '4.2. Forensic filters, Cascade NLI, X-Ray & Editorial Pre-Flight')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'Os apontamentos combinam triagem ONNX Bi-Encoder + Cross-Encoder NLI (contradição lógica), Guardião Simbólico (polaridade/números/apud), reconciliação de tabelas XML/Resumo/siglas, detecção de obra intrusa em citações múltiplas, Raio-X Bibliométrico, Pre-Flight Editorial (ICMJE/Saúde Coletiva) e Memória de Decisão SHA-256 ("Ignorar / Falso Positivo Justificado").',
                        'Findings combine ONNX Bi-Encoder + Cross-Encoder NLI (logical contradiction), Symbolic Guardian (polarity/numbers/apud), XML table/Abstract/acronym reconciliation, multiple-citation intruder detection, Bibliometric X-Ray, Editorial Pre-Flight (ICMJE/Public Health), and SHA-256 Decision Memory ("Ignore / Justified False Positive").'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 5: CITAÇÕES E WORD */}
            {etapaAtiva === 'etapa-word' && (
              <div className="guia-secao">
                <h3>{tr('Etapa 5: Citações e Integração com Word (Porta 23119)', 'Step 5: Citations & Microsoft Word Integration (Port 23119)')}</h3>
                <p className="guia-intro">
                  {tr(
                    'Gere listas bibliográficas conforme ABNT NBR 6023, Vancouver ou APA 7ª ed. e conecte o Microsoft Word ao acervo local.',
                    'Generate formatted reference lists (ABNT, Vancouver, APA 7th) and connect Microsoft Word directly to your local library.'
                  )}
                </p>

                <div className="guia-passos-lista">
                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['word_1']}
                          onChange={() => alternarChecklist('word_1')}
                        />
                        <strong>{tr('5.1. Exportação de bibliografia formatada', '5.1. Formatted bibliography export')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'Na barra de ferramentas da Biblioteca, clique em "Criar Bibliografia" para filtrar por Citadas, Consultadas, Selecionadas ou Todas e copiar mantendo formatação rica para o Word.',
                        'From the Library toolbar, click "Create Bibliography" to filter Cited, Consulted, Selected, or All works and copy rich formatting into Word.'
                      )}
                    </p>
                  </div>

                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['word_2']}
                          onChange={() => alternarChecklist('word_2')}
                        />
                        <strong>{tr('5.2. Suplemento .dotm, API local (23119) e Pacote de Submissão (.zip)', '5.2. Word .dotm Add-in, Local API (23119) & Submission Package (.zip)')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'No módulo Manuscrito, instale o modelo .dotm na pasta STARTUP do Word, acione o seletor rápido com Ctrl+Shift+B ou clique em Exportar Pacote de Submissão (.zip) para gerar uma cópia limpa do .docx para revisão cega acompanhada dos diagramas SVG PRISMA 2020 e RoB.',
                        'In the Manuscript module, install the .dotm add-in into Word STARTUP, invoke the Quick Picker with Ctrl+Shift+B, or click Export Submission Package (.zip) for a blind-review .docx plus PRISMA 2020 & RoB SVG figures.'
                      )}
                    </p>
                    <div style={{ margin: '8px 0 0 28px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn pequeno primario" onClick={() => irParaAba('word')}>
                        {tr('Abrir Painel Manuscrito / Word', 'Open Manuscript / Word Hub')}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 6: TRIAGEM PRISMA 2020 */}
            {etapaAtiva === 'etapa-prisma' && (
              <div className="guia-secao">
                <h3>{tr('Etapa 6: Triagem Sistemática PRISMA 2020 e Risco de Viés', 'Step 6: PRISMA 2020 Systematic Screening & Risk of Bias')}</h3>
                <p className="guia-intro">
                  {tr(
                    'Organize deduplicação, triagem de estudos, diagrama PRISMA 2020 e avaliação humana de Risco de Viés (RoB 2 / ROBINS-I).',
                    'Manage deduplication, study screening, PRISMA 2020 flow diagrams, and human-verified Risk of Bias (RoB 2 / ROBINS-I) assessments.'
                  )}
                </p>

                <div className="guia-passos-lista">
                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['prisma_1']}
                          onChange={() => alternarChecklist('prisma_1')}
                        />
                        <strong>{tr('6.1. Deduplicação, triagem e fluxograma', '6.1. Deduplication, screening & flow diagram')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'Remova duplicatas sem perder PDFs nem notas, registre inclusões/exclusões por título e resumo e gere o diagrama PRISMA 2020 atualizado.',
                        'Merge duplicates without losing PDFs or notes, record title/abstract inclusion/exclusion reasons, and generate an up-to-date PRISMA 2020 diagram.'
                      )}
                    </p>
                    <div style={{ margin: '8px 0 0 28px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn pequeno primario" onClick={() => irParaAba('prisma')}>
                        {tr('Abrir Módulo PRISMA 2020', 'Open PRISMA 2020 Module')}
                      </button>
                    </div>
                  </div>

                  <div className="guia-passo-item">
                    <div className="guia-passo-topo">
                      <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={!!passosConcluidos['prisma_2']}
                          onChange={() => alternarChecklist('prisma_2')}
                        />
                        <strong>{tr('6.2. Avaliação RoB 2 / ROBINS-I com validação humana', '6.2. Human-verified RoB 2 / ROBINS-I assessment')}</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      {tr(
                        'Na aba de Risco de Viés dentro do módulo PRISMA, revise cada domínio e registre a decisão final do revisor em trilha auditável SHA-256.',
                        'Inside the PRISMA Risk of Bias tab, review each domain and record the human reviewer decision on a SHA-256 audit trail.'
                      )}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}
