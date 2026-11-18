import React, { useState } from 'react';
import { useI18n } from '../i18n.jsx';

/**
 * Faixa de Tutorial Passo a Passo Contextual para o topo de telas/etapas do sistema.
 * Pode ser recolhida/expandida pelo usuário e lembra a preferência no localStorage.
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
          <span className="badge-tutorial-etapa">📖 {tr('TUTORIAL DESTA ETAPA', 'STEP-BY-STEP GUIDE')}</span>
          <strong>{titulo}</strong>
          {!aberto && <span className="tutorial-etapa-resumo">— {resumo}</span>}
        </div>
        <button type="button" className="btn-toggle-tutorial">
          {aberto ? tr('▲ Ocultar passo a passo', '▲ Hide step-by-step') : tr('▼ Ver passo a passo desta tela', '▼ Show screen walkthrough')}
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
                      {p.rotuloAcao || tr('⚡ Fazer agora', '⚡ Do this now')}
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
 * 6 Capítulos Oficiais do Manual Técnico e de Leitura (v1.0.2)
 */
const CAPITULOS_MANUAL = [
  {
    id: 'cap1',
    titulo: 'Capítulo 1 — Conexão, Arquitetura, Seletor de Projetos e Sincronização na Nuvem (OneDrive / Google Drive)',
    conteudo: [
      {
        subtitulo: '1.1. Persistência Atômica Desacoplada e Imunidade a Corrupção',
        texto:
          'Diferente de gerenciadores tradicionais que utilizam um único arquivo de banco de dados SQLite (que corrompe facilmente quando sincronizado em pastas de nuvem como OneDrive, Dropbox ou Google Drive), o Bibliografia utiliza arquitetura de persistência atômica. Cada obra é armazenada em um arquivo .json individual na pasta "referencias/", seus arquivos de texto integral residem na pasta "storage/" (ou "pdfs/"), e todos os grifos e notas clínicas ficam isolados em "grifos/".',
      },
      {
        subtitulo: '1.2. Seletor de Projetos e Topo com PROJETO ATIVO em Destaque',
        itens: [
          'Badge PROJETO ATIVO: O topo da tela exibe com clareza o nome da pasta e a contagem exata de obras do projeto ativo atual (ex.: "TCC UFMA SEIDIGI (29 obras)").',
          'Menu de 10 Projetos Recentes: Ao clicar no seletor, o sistema lista automaticamente até 10 projetos e bibliotecas acessados ou autodetectados no OneDrive e no computador (#1, #2, ... #10) para alternância instantânea com 1 clique.',
          'Regra de Ouro da Nuvem: No Windows Explorer, clique com o botão direito na pasta do projeto no OneDrive e selecione "Sempre manter neste dispositivo" para evitar atrasos de download do Windows.',
          'Catálogo Unificado BibTeX: O sistema mantém o arquivo "library.bib" atualizado automaticamente na raiz para integração com LaTeX, Overleaf e Python/R.',
        ],
      },
    ],
  },
  {
    id: 'cap2',
    titulo: 'Capítulo 2 — Operação da Barra Lateral Vertical Permanente (Activity Rail Mendeley/Zotero)',
    conteudo: [
      {
        subtitulo: '2.1. O que é o Activity Rail e por que ele substituiu o menu horizontal',
        texto:
          'Na arquitetura moderna (v1.0.2), o menu superior horizontal com abas que sofriam cortes e problemas de rolagem foi definitivamente substituído por um Rail Vertical Permanente de 86px de largura, inspirado nas interfaces profissionais do Mendeley Desktop, Zotero 7 e VS Code. O rail fica fixo à esquerda, permitindo troca de contexto com 1 clique sem perda de dados.',
      },
      {
        subtitulo: '2.2. Anatomia dos Módulos do Rail Vertical',
        itens: [
          '📚 Biblioteca: Painel principal com árvore de coleções à esquerda, tabela ordenável com colunas de status (A Ler, Consultada, Citada) ao centro e inspetor CSL/PICO à direita.',
          '🔍 Buscadores: Hub científico com conexão direta ao PubMed, SciELO, CAPES Periódicos, Europe PMC, OpenAlex e cofre criptografado de credenciais.',
          '📝 Manuscrito: Painel de controle de citações ativas, vinculação de arquivos .docx e integração com o servidor local HTTP na porta 23119.',
          '🔬 Auditoria: Motor de auditoria reversa forense para validação de manuscritos .docx/.pdf contra alucinações de IA, plágio e citações falsas.',
          '📊 PRISMA: Ambiente de triagem sistemática de artigos em 4 fases e geração automática do diagrama de fluxo PRISMA 2020.',
          '🔗 Grafo: Exploração de grafos de citação, linhagem científica e caderno de notas.',
          '❓ Tutorial: Este guia de treinamento interativo e manual completo.',
          'v1.2 & Tema: No rodapé do rail, acesse o Painel de Diagnóstico do Sistema e alterne entre os Modos Claro e Escuro.',
        ],
      },
    ],
  },
  {
    id: 'cap3',
    titulo: 'Capítulo 3 — Leitor de Artigo PDF com Rolagem Livre, Zoom e Grifos Coloridos',
    conteudo: [
      {
        subtitulo: '3.1. Navegação Sem Cortes: Barras de Rolagem Vertical e Horizontal',
        texto:
          'O leitor de PDF possui barras de rolagem vertical e horizontal completas e de alto contraste. Mesmo com níveis elevados de ampliação (Zoom ＋ até 250%), a página permanece perfeitamente navegável sem cortes nas bordas ou no cabeçalho.',
      },
      {
        subtitulo: '3.2. Seleção Direta no PDF, Barra Flutuante e Resumo Consolidado',
        itens: [
          'Seleção com o Mouse: Selecione frases diretamente sobre o PDF graças à camada TextLayer integrada do PDF.js.',
          'Barra Flutuante de Cores: Ao selecionar um trecho, uma barra de marcação surge sobre o texto para grifar em Amarelo (Conceito), Verde (PICO), Azul (Citação no Word) ou Rosa (Crítica/Limitação).',
          'Exportação com 1 Clique: O botão "Copiar Resumo de Comentários (Word)" compila todas as anotações organizadas por página com status de citação para colar imediatamente no seu documento.',
        ],
      },
    ],
  },
  {
    id: 'cap4',
    titulo: 'Capítulo 4 — Auditoria Reversa e Forense (.DOCX e .PDF) & Detecção Anti-IA',
    conteudo: [
      {
        subtitulo: '4.1. Algoritmo Determinístico de Cruzamento Citação × Referência',
        texto:
          'A Auditoria Reversa Forense utiliza processamento determinístico estruturado (inspirado em algoritmos acadêmicos de n-grams, índice invertido e análise sintática NBR 10520:2023 / NBR 6023). O motor agrupa parágrafos do corpo do texto e entradas completas de referências sem cortar leis nem periódicos, eliminando os falsos alarmes de pós-referências e de citações ausentes.',
      },
      {
        subtitulo: '4.2. Seletor de Pasta de Destino dos PDFs & Download Automático',
        itens: [
          'Escolha da Pasta de Destino: O usuário pode selecionar qualquer pasta local ou no OneDrive para armazenar os artigos e PDFs autenticados.',
          'Download em Lote: Com o botão "Salvar PDFs na Pasta", o sistema baixa ou sincroniza todos os artigos reais autenticados diretamente para a pasta escolhida.',
          'Validação de DOIs e Anti-Alucinação: Consulta Crossref, PubMed e OpenAlex para assegurar que cada fonte é real e não inventada por modelos generativos (ChatGPT/Claude).',
          'Prompt Estruturado para IA: O botão "🤖 Copiar Relatório p/ Colar na IA" gera um relatório técnico com parágrafo (§), linha e diagnóstico para você colar na IA solicitando reescrita pontual.',
        ],
      },
    ],
  },
  {
    id: 'cap5',
    titulo: 'Capítulo 5 — Citações no Texto e Formatação CSL para Microsoft Word (Porta 23119)',
    conteudo: [
      {
        subtitulo: '5.1. Mecanismo CSL Oficial (citeproc-js) e Normas Acadêmicas',
        texto:
          'O Bibliografia processa referências utilizando o padrão internacional Citation Style Language (CSL) através da biblioteca oficial citeproc-js. O sistema vem configurado de fábrica com ABNT NBR 6023 / 10520 (Autor-Data e Numérico), APA 7ª Edição, Vancouver, Harvard, Chicago e Nature, com repositório online para instalar mais de 10.000 estilos de revistas científicas.',
      },
      {
        subtitulo: '5.2. Modal de Bibliografia Formatada Expandido (1080px)',
        itens: [
          'Seletor de Escopo: Exporte referências filtrando apenas pelas "Citadas no Manuscrito", "Consultadas", "Selecionadas" ou "Todas as Obras".',
          'Cópia Rica Formatada: O botão "📋 Copiar Referências Formatadas para o Word" transfere o texto com formatação HTML/RTF completa (itálico em títulos de periódicos, negrito conforme a norma e recuo francês).',
          'Servidor Local Word: O backend mantém o servidor HTTP local na porta 23119 ativo para integração via suplemento XML dentro do Microsoft Word.',
        ],
      },
    ],
  },
  {
    id: 'cap6',
    titulo: 'Capítulo 6 — Triagem Sistemática e Fluxograma PRISMA 2020',
    conteudo: [
      {
        subtitulo: '6.1. Metodologia de Revisão Sistemática e Escopo PRISMA',
        texto:
          'Para revisões sistemáticas da literatura e scoping reviews, o módulo PRISMA permite gerenciar o pipeline de inclusão e exclusão de artigos científicos conforme as diretrizes internacionais PRISMA 2020.',
      },
      {
        subtitulo: '6.2. As 4 Etapas do Fluxo PRISMA',
        itens: [
          '1. Identificação: Registro de resultados brutos extraídos de bases de dados (PubMed, Scopus, Web of Science, Embase, SciELO, Lilacs) e remoção automática de duplicatas por DOI.',
          '2. Triagem (Screening): Avaliação rápida de títulos e resumos com marcação de "Incluir", "Dúvida" ou "Excluir com Motivo".',
          '3. Elegibilidade: Avaliação aprofundada dos textos completos dos artigos pré-selecionados.',
          '4. Inclusão & Diagrama: Geração visual interativa do fluxograma oficial PRISMA 2020 com exportação em alta resolução para inclusão direta em sua publicação.',
        ],
      },
    ],
  },
  {
    id: 'cap7',
    titulo: 'Capítulo 7 — Manual de Elaboração do Projeto de Intervenção (UFMA / UNA-SUS / SEIDIGI)',
    conteudo: [
      {
        subtitulo: '7.1. Diretrizes Estruturais do Módulo 17 (UFMA)',
        texto:
          'O Projeto de Intervenção para o SUS Digital é o Trabalho de Conclusão de Curso (TCC) voltado à resolução de um problema concreto de saúde pública, fundamentado no Módulo 17 da Universidade Federal do Maranhão (UFMA / UNA-SUS / SEIDIGI). O manual completo detalhado está registrado no arquivo MANUAL_PROJETO_INTERVENCAO_UFMA.md.',
      },
      {
        subtitulo: '7.2. Os 7 Elementos Obrigatórios do Projeto de Intervenção',
        itens: [
          '1. Tema e Objeto: Delimitação de um problema real de saúde na APS ou na rede de atenção (ex.: rastreamento e confirmação diagnóstica de câncer de mama).',
          '2. Problematização e Justificativa: Diagnóstico epidemiológico local apoiado em dados do SUS (SISCAN, e-SUS APS, SIA/SIH) e literatura científica.',
          '3. Objetivos Geral e Específicos: Ações resolutivas mensuráveis com verbos no infinitivo (implantar, padronizar, integrar, capacitar).',
          '4. Fundamentação Teórica / Revisão: Artigos de periódicos qualificados, portarias do Ministério da Saúde e protocolos clínicos autenticados.',
          '5. Metodologia e Plano Operativo: Descrição de etapas, atores envolvidos, instrumentos de coleta e fluxo de intervenção tecnológica.',
          '6. Cronograma e Recursos: Distribuição temporal realista de atividades e orçamento detalhado.',
          '7. Referências ABNT NBR 6023/10520: Alinhamento estrito à margem esquerda, espaço simples e conferência de todas as citações feitas no texto.',
        ],
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

  const capitulosFiltrados = CAPITULOS_MANUAL.filter((cap) => {
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
    const texto = CAPITULOS_MANUAL.map((cap) => {
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
    alert('Manual Oficial v1.0.2 copiado para a área de transferência! Cole no Microsoft Word se desejar imprimir.');
  };

  return (
    <div className="guia-container">
      {/* BANNER SUPERIOR COM SELETOR DE MODO */}
      <div className="guia-banner">
        <div>
          <h2>📚 {tr('Manual de Operação & Tutorial Didático Interativo (v1.0.2)', 'Operations Manual & Interactive Walkthrough (v1.0.2)')}</h2>
          <p>
            {tr('Instruções completas cobrindo os 6 módulos essenciais do sistema: Sincronização na Nuvem, Activity Rail, Leitor de PDFs, Auditoria Reversa Forense, Citações Word e PRISMA 2020.', 'Complete instructions covering the 6 core modules: Cloud Sync, Activity Rail, PDF Reader, Forensic Reverse Audit, Word Citations, and PRISMA 2020.')}
          </p>
        </div>
        <div className="guia-banner-acoes" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className={modoGuia === 'tutorial' ? 'aba-modo-guia ativa' : 'aba-modo-guia'}
            onClick={() => setModoGuia('tutorial')}
          >
            🎯 1. {tr('Roteiro Passo a Passo Interativo', 'Interactive Step-by-Step Guide')}
          </button>
          <button
            type="button"
            className={modoGuia === 'manual' ? 'aba-modo-guia ativa' : 'aba-modo-guia'}
            onClick={() => setModoGuia('manual')}
          >
            📖 2. {tr('Manual Completo para Leitura', 'Full Reference Manual')}
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
            📚 {tr('Abrir Minha Biblioteca', 'Open My Library')}
          </button>
        </div>
      </div>

      {/* MODO 2: MANUAL COMPLETO PARA LEITURA */}
      {modoGuia === 'manual' ? (
        <div className="manual-leitura-container">
          <div className="manual-leitura-topo">
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
              <strong>🔍 {tr('Buscar no Manual:', 'Search Manual:')}</strong>
              <input
                value={buscaManual}
                onChange={(e) => setBuscaManual(e.target.value)}
                placeholder={tr('Ex.: nuvem, rail, PDF, ABNT, reversa, plágio, Word, PRISMA…', 'e.g. cloud, rail, PDF, ABNT, audit, plagiarism, Word, PRISMA…')}
                style={{ flex: 1, maxWidth: 440, padding: '7px 12px', borderRadius: 6, border: '1px solid var(--borda)' }}
              />
              {buscaManual && (
                <button type="button" className="btn pequeno" onClick={() => setBuscaManual('')}>
                  {tr('Limpar', 'Clear')}
                </button>
              )}
            </div>
            <button type="button" className="btn secundario" onClick={copiarManualCompleto}>
              📋 {tr('Copiar Manual Completo (para Word / Impressão)', 'Copy Full Manual (for Word / Print)')}
            </button>
          </div>

          <div className="manual-leitura-folha">
            <div className="manual-capa">
              <h1>📖 MANUAL OFICIAL DO SISTEMA BIBLIOGRAFIA — v1.0.2</h1>
              <p>
                Guia de referência para gerenciamento científico, leitura atômica de PDFs, auditoria forense anti-alucinação de IA, cópia CSL para o Microsoft Word e triagem sistemática PRISMA 2020.
              </p>
              <div className="manual-indice">
                <strong>Índice dos 6 Capítulos Oficiais:</strong>
                <div className="manual-indice-links">
                  {CAPITULOS_MANUAL.map((c) => (
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
        /* MODO 1: ROTEIRO DIDÁTICO INTERATIVO (6 ETAPAS ESSENCIAIS) */
        <div className="guia-corpo">
          <aside className="guia-menu">
            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-nuvem' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-nuvem')}
            >
              <span className="guia-menu-icone">☁️</span>
              <div className="guia-menu-texto">
                <strong>Etapa 1: Nuvem &amp; Projetos</strong>
                <span>Sincronização atômica OneDrive/Drive e seletor de pastas.</span>
              </div>
            </button>

            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-rail' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-rail')}
            >
              <span className="guia-menu-icone">🧭</span>
              <div className="guia-menu-texto">
                <strong>Etapa 2: Activity Rail Mendeley</strong>
                <span>Navegação vertical permanente e paleta sóbria grafite.</span>
              </div>
            </button>

            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-pdf' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-pdf')}
            >
              <span className="guia-menu-icone">🖍</span>
              <div className="guia-menu-texto">
                <strong>Etapa 3: Leitura &amp; Grifos em PDF</strong>
                <span>Abas superiores, marca-texto, trechos citados com página e PICO.</span>
              </div>
            </button>

            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-auditoria' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-auditoria')}
            >
              <span className="guia-menu-icone">🔬</span>
              <div className="guia-menu-texto">
                <strong>Etapa 4: Auditoria Reversa Anti-IA</strong>
                <span>Conferência de .docx/.pdf contra alucinações, plágio e citações falsas.</span>
              </div>
            </button>

            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-word' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-word')}
            >
              <span className="guia-menu-icone">📝</span>
              <div className="guia-menu-texto">
                <strong>Etapa 5: Citações &amp; Word (Porta 23119)</strong>
                <span>Modal expandido (1080px), normas CSL e servidor local do Word.</span>
              </div>
            </button>

            <button
              type="button"
              className={`guia-menu-item ${etapaAtiva === 'etapa-prisma' ? 'ativo' : ''}`}
              onClick={() => setEtapaAtiva('etapa-prisma')}
            >
              <span className="guia-menu-icone">📊</span>
              <div className="guia-menu-texto">
                <strong>Etapa 6: Triagem PRISMA 2020</strong>
                <span>Pipeline sistemático em 4 fases e geração de fluxograma exportável.</span>
              </div>
            </button>
          </aside>

          <section className="guia-conteudo">
            {/* ETAPA 1: NUVEM E PROJETOS */}
            {etapaAtiva === 'etapa-nuvem' && (
              <div className="guia-secao">
                <h3>☁️ Etapa 1: Conexão e Sincronização na Nuvem (OneDrive / Google Drive)</h3>
                <p className="guia-intro">
                  Aprenda como seus arquivos científicos ficam salvos com segurança, sem risco de corromper banco de dados na nuvem, e como gerenciar múltiplos projetos acadêmicos.
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
                        <strong>1.1. Localização da Biblioteca e Pastas Atômicas</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      Sua biblioteca principal fica em <code>C:\Users\Marcos\OneDrive\Bibliografia</code>. Dentro dela, a subpasta <code>referencias/</code> guarda cada artigo em um arquivo JSON individual, a pasta <code>storage/</code> (ou <code>pdfs/</code>) armazena os PDFs completos, e o arquivo <code>library.bib</code> mantém o catálogo sincronizado para LaTeX.
                    </p>
                    <div style={{ margin: '8px 0 0 28px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn pequeno primario" onClick={() => window.api?.bib?.abrirPasta?.()}>
                        📂 Abrir Pasta da Biblioteca no Windows Explorer
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
                        <strong>1.2. Regra de Ouro: "Sempre Manter Neste Dispositivo"</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      No Windows Explorer, clique com o botão direito na pasta do OneDrive da Bibliografia e marque <strong>"Sempre manter neste dispositivo"</strong>. Isso evita que o Windows descarregue os arquivos para economizar espaço e garante abertura instantânea de todos os PDFs.
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
                        <strong>1.3. Gestão de Múltiplos Projetos &amp; Pastas Independentes</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      Para criar uma nova biblioteca isolada (ex: para outro projeto ou artigo específico), clique no botão <code>Pasta: [Nome] ▾</code> no topo da tela e selecione <em>"📂 Abrir Pasta Existente…"</em> ou <em>"Criar Novo Projeto"</em>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 2: ACTIVITY RAIL MENDELEY */}
            {etapaAtiva === 'etapa-rail' && (
              <div className="guia-secao">
                <h3>🧭 Etapa 2: Operação do Novo Rail Vertical Permanente (Estilo Mendeley)</h3>
                <p className="guia-intro">
                  Conheça o menu lateral ergonômico de 86px projetado para acesso direto a todos os módulos com alta legibilidade e paleta sóbria grafite.
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
                        <strong>2.1. Troca de Contexto com 1 Clique</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      O Rail Vertical substitui definitivamente as abas horizontais quebradas. Ele abriga os botões ampliados (74px × 66px) com tipografia destacada e ícones de 22px: Biblioteca, Buscadores Saúde, Manuscrito, Auditoria Reversa, PRISMA, Grafo e Tutorial.
                    </p>
                    <div style={{ margin: '8px 0 0 28px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn pequeno primario" onClick={() => irParaAba('biblioteca')}>
                        📚 Ir para Biblioteca
                      </button>
                      <button className="btn pequeno secundario" onClick={() => irParaAba('buscadores')}>
                        🔍 Ir para Buscadores Saúde
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
                        <strong>2.2. Paleta Sóbria Grafite &amp; Carmim Mendeley</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      Inspirado nas diretrizes editoriais da Elsevier e Mendeley, o sistema utiliza fundo ardósia grafite (<code>#141b24</code>) e realce em carmim acadêmico (<code>#a81c24</code>). Clique no botão do sol/lua no rodapé do rail para alternar entre Modo Escuro e Claro.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 3: LEITURA E GRIFOS EM PDF */}
            {etapaAtiva === 'etapa-pdf' && (
              <div className="guia-secao">
                <h3>🖍 Etapa 3: Leitura Multitasking, Grifos Coloridos e Anotações PICO</h3>
                <p className="guia-intro">
                  Aprenda a abrir múltiplos artigos em abas, aplicar marca-texto semântico e salvar a página exata das passagens que você vai citar no manuscrito.
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
                        <strong>3.1. Abertura de Artigos em Abas no Topo</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      Dê duplo-clique sobre qualquer artigo da tabela que tenha o selo PDF. Ele se abrirá em uma aba dedicada na barra superior. Você pode manter vários artigos abertos simultaneamente sem perder o ponto de leitura.
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
                        <strong>3.2. Marcação com Página e Citação Automática</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      Ao selecionar o trecho que fundamenta seu trabalho no PDF, clique em <strong>"❝ Marcar como Trecho Citado"</strong>. O programa grava o texto exato, vincula o número da página (ex: p. 4) e muda o status da obra para "Citada" automaticamente.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 4: AUDITORIA REVERSA FORENSE */}
            {etapaAtiva === 'etapa-auditoria' && (
              <div className="guia-secao">
                <h3>🔬 Etapa 4: Auditoria Reversa Forense (.DOCX/.PDF) &amp; Detecção Anti-IA</h3>
                <p className="guia-intro">
                  Blindagem científica para seu trabalho: identifique alucinações de inteligência artificial, citações trocadas, plágio e confira as páginas no PDF.
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
                        <strong>4.1. Como Executar a Auditoria em um Arquivo .DOCX ou .PDF</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      Abra o módulo <strong>Auditoria</strong> no rail lateral, carregue o arquivo do seu trabalho ou cole o texto. O motor lê os parágrafos, identifica as citações (ex: "Silva (2020)"), cruza com as Referências finais e baixa os PDFs disponíveis.
                    </p>
                    <div style={{ margin: '8px 0 0 28px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn pequeno primario" onClick={() => irParaAba('auditoria')}>
                        🔬 Abrir Auditoria Reversa Forense
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
                        <strong>4.2. Agrupamento Inteligente por Tipo de Intercorrência</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      Os resultados são classificados em chips de filtro: <strong>🤖 IA / DOI Falso</strong>, <strong>🚨 Citação Trocada / Inexistente</strong>, <strong>🔍 Plágio / Cópia sem Aspas</strong>, <strong>❌ Citações Órfãs</strong> e <strong>📐 Metadados &amp; ABNT</strong>.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 5: CITAÇÕES E WORD */}
            {etapaAtiva === 'etapa-word' && (
              <div className="guia-secao">
                <h3>📝 Etapa 5: Citações no Texto &amp; Formatação CSL para Microsoft Word</h3>
                <p className="guia-intro">
                  Exporte sua bibliografia completa com formatação ABNT NBR 6023, Vancouver ou APA 7ª e conecte o Word ao acervo bibliográfico.
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
                        <strong>5.1. Modal de Bibliografia Formatada Expandido (1080px)</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      Na barra de ferramentas da Biblioteca, clique em <strong>"📄 Criar Bibliografia"</strong>. O modal de 1080px permite escolher o escopo (Citadas, Consultadas, Selecionadas ou Todas) e copiar em texto formatado para colar direto no final do Word.
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
                        <strong>5.2. Servidor Local HTTP na Porta 23119</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      O aplicativo mantém um servidor HTTP ativo na porta 23119. Acesse o módulo <strong>Word</strong> no rail lateral para verificar a comunicação ou instalar o manifesto XML do suplemento.
                    </p>
                    <div style={{ margin: '8px 0 0 28px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn pequeno primario" onClick={() => irParaAba('word')}>
                        📝 Abrir Painel Word
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* ETAPA 6: TRIAGEM PRISMA 2020 */}
            {etapaAtiva === 'etapa-prisma' && (
              <div className="guia-secao">
                <h3>📊 Etapa 6: Triagem Sistemática e Fluxograma PRISMA 2020</h3>
                <p className="guia-intro">
                  Conduza revisões sistemáticas e scoping reviews com rigor metodológico, desduplicação e exportação do diagrama oficial PRISMA 2020.
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
                        <strong>6.1. Pipeline de 4 Fases PRISMA 2020</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      Importe listas de buscas de diferentes bases de dados (PubMed, Scopus, Web of Science). O sistema faz a desduplicação automática e permite triar títulos/resumos (Screening) e textos integrais (Elegibilidade).
                    </p>
                    <div style={{ margin: '8px 0 0 28px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                      <button className="btn pequeno primario" onClick={() => irParaAba('prisma')}>
                        📊 Abrir Triagem PRISMA 2020
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
                        <strong>6.2. Diagrama de Fluxo Visual Exportável</strong>
                      </label>
                    </div>
                    <p style={{ margin: '6px 0 0 28px', fontSize: 13, lineHeight: 1.5 }}>
                      O diagrama oficial PRISMA 2020 é recalculado em tempo real conforme você inclui ou exclui artigos, pronto para cópia ou exportação para o artigo final.
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
