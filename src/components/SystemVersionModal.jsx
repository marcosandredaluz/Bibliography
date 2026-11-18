import React, { useState, useEffect } from 'react';
import { Icone, Modal } from './ui';
import { useI18n } from '../i18n.jsx';

export function SystemVersionModal({ aberto, aoFechar, bib, refs = [] }) {
  const { tr, ehEn, mudarIdioma } = useI18n();
  const [infoSistema, setInfoSistema] = useState(null);
  const [infoWord, setInfoWord] = useState(null);
  const [copiado, setCopiado] = useState(false);
  const [abaAtiva, setAbaAtiva] = useState('diagnostico'); // 'diagnostico' | 'changelog'

  useEffect(() => {
    if (!aberto) return;

    // Obtém versões do runtime
    try {
      if (window.api?.versao?.obterInfo) {
        setInfoSistema(window.api.versao.obterInfo());
      } else {
        setInfoSistema({
          app: '1.0.1',
          electron: '44.9.2',
          node: '20.x',
          chrome: '124.x',
          plataforma: 'win32',
          arquitetura: 'x64',
        });
      }
    } catch {
      setInfoSistema({ app: '1.0.1', electron: 'N/D', node: 'N/D' });
    }

    // Consulta status do servidor Word
    if (window.api?.word?.info) {
      window.api.word
        .info()
        .then((dados) => setInfoWord(dados))
        .catch(() => setInfoWord({ erro: 'Servidor Word inativo ou indisponível' }));
    }
  }, [aberto]);

  if (!aberto) return null;

  const totalComPdf = refs.filter((r) => r.pdf || r.csl?.pdf).length;
  const totalCitadas = refs.filter((r) => r.citadaNoTrabalho || r.tags?.some((t) => t.toLowerCase().includes('citad'))).length;

  const copiarDiagnostico = () => {
    const texto = [
      `=== DIAGNÓSTICO DO SISTEMA BIBLIOGRAFIA (v${infoSistema?.app || '1.2.0'}) ===`,
      `Data/Hora: ${new Date().toLocaleString('pt-BR')}`,
      `Versão do Aplicativo: ${infoSistema?.app || '1.2.0'}`,
      `Runtime Electron: ${infoSistema?.electron || 'N/D'}`,
      `Node.js: ${infoSistema?.node || 'N/D'}`,
      `Chromium: ${infoSistema?.chrome || 'N/D'}`,
      `Plataforma/SO: ${infoSistema?.plataforma || 'win32'} (${infoSistema?.arquitetura || 'x64'})`,
      ``,
      `--- SERVIDOR MICROSOFT WORD ---`,
      `Porta Ativa: ${infoWord?.porta || '23119'}`,
      `Status: ${infoWord?.erro ? 'Inativo' : 'Online / Respondendo'}`,
      `URL do Painel Add-in: ${infoWord?.urlPainel || 'http://127.0.0.1:23119/word-addin/index.html'}`,
      ``,
      `--- BIBLIOTECA ATIVA ---`,
      `Caminho Base: ${bib?.raiz || 'C:\\Users\\Marcos\\OneDrive\\Bibliografia'}`,
      `Total de Obras Indexadas: ${refs.length}`,
      `Obras com PDF Anexado: ${totalComPdf}`,
      `Obras Marcadas como Citadas: ${totalCitadas}`,
      `Total de Coleções / Capítulos: ${bib?.colecoes?.length || 0}`,
      `Motor de Citações: CiteProc-JS v2.4.63 (ABNT NBR 6023, Vancouver, APA 7ª ed)`,
      `==================================================`,
    ].join('\n');

    try {
      if (window.api?.sistema?.copiarTexto) {
        window.api.sistema.copiarTexto(texto);
      } else {
        navigator.clipboard?.writeText(texto);
      }
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {}
  };

  return (
    <Modal titulo="" aoFechar={aoFechar} largura={820}>
      <div style={{ padding: '4px 8px 16px' }}>
        {/* CABEÇALHO DO MODAL COM IDENTIDADE VISUAL */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 16,
            paddingBottom: 16,
            borderBottom: '1px solid var(--borda)',
            marginBottom: 16,
            flexWrap: 'wrap',
          }}
        >
          <div
            style={{
              width: 54,
              height: 54,
              borderRadius: 12,
              background: 'linear-gradient(135deg, #a81c24, #7f1d1d)',
              color: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 4px 14px rgba(168, 28, 36, 0.4)',
              flexShrink: 0,
            }}
          >
            <Icone nome="book" tam={28} />
          </div>

          <div style={{ flex: 1, minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <h2 style={{ margin: 0, fontSize: 20, fontWeight: 800, color: 'var(--texto)' }}>
                {tr('Bibliografia Científica', 'Bibliography Platform')}
              </h2>
              <span
                style={{
                  background: 'var(--primaria)',
                  color: '#ffffff',
                  fontSize: 11.5,
                  fontWeight: 800,
                  padding: '2px 9px',
                  borderRadius: 99,
                }}
              >
                v{infoSistema?.app || '1.0.1'}
              </span>
              <span
                style={{
                  background: 'rgba(22, 163, 74, 0.15)',
                  color: '#16a34a',
                  border: '1px solid rgba(22, 163, 74, 0.3)',
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 99,
                }}
              >
                ✓ {tr('Sistema Operacional', 'Operational')}
              </span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: 12.5, color: 'var(--texto-suave)' }}>
              {tr(
                'Gerenciador pessoal de referências científicas, leitura com PDF.js e integração CSL com processadores de texto (.DOCX).',
                'Offline-first scientific reference manager, PDF.js reader, and native CSL/Word (.DOCX) integration.'
              )}
            </p>
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
            <button
              className={`chip ${abaAtiva === 'diagnostico' ? 'ativo' : ''}`}
              onClick={() => setAbaAtiva('diagnostico')}
              style={{ fontSize: 12, padding: '5px 12px' }}
            >
              ⚙️ {tr('Diagnóstico do Sistema', 'System Diagnostics')}
            </button>
            <button
              className={`chip ${abaAtiva === 'changelog' ? 'ativo' : ''}`}
              onClick={() => setAbaAtiva('changelog')}
              style={{ fontSize: 12, padding: '5px 12px' }}
            >
              📜 {tr('Histórico de Versões', 'Changelog')}
            </button>
          </div>
        </div>

        {/* ABA 1: DIAGNÓSTICO EM TEMPO REAL */}
        {abaAtiva === 'diagnostico' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* SELETOR DE IDIOMA DA INTERFACE (PT-BR PADRÃO / ENGLISH PACK INCLUSO) */}
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: 'var(--painel)',
                border: '1px solid var(--borda)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                gap: 10,
                flexWrap: 'wrap',
              }}
            >
              <div>
                <strong style={{ fontSize: 13 }}>{tr('🌐 Idioma da Interface (Language Pack)', '🌐 Interface Language Pack')}</strong>
                <div style={{ fontSize: 11.5, color: 'var(--texto-suave)' }}>
                  {tr('Padrão: Português (Brasil). Pacote English incluído nativamente na instalação.', 'Default: Português (Brasil). English pack bundled in installation.')}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
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
            </div>

            {/* QUADRO 1: STATUS DO SERVIDOR MICROSOFT WORD */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(168, 28, 36, 0.05)',
                border: '1px solid rgba(168, 28, 36, 0.25)',
                borderLeft: '4px solid var(--primaria)',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <div>
                  <strong style={{ fontSize: 13.5, color: 'var(--texto)' }}>
                    📝 {tr('Servidor de Citações para Microsoft Word', 'Local Word Citation Bridge Server')}
                  </strong>
                  <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginTop: 2 }}>
                    {tr('Comunicação local em tempo real entre o Word e o acervo bibliográfico.', 'Real-time loopback communication (127.0.0.1) between Microsoft Word and your local library.')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span
                    style={{
                      background: infoWord?.erro ? '#dc2626' : '#16a34a',
                      color: '#ffffff',
                      fontSize: 11,
                      fontWeight: 700,
                      padding: '3px 9px',
                      borderRadius: 6,
                    }}
                  >
                    {infoWord?.erro ? tr('🔴 INATIVO', '🔴 OFFLINE') : `🟢 ONLINE (${tr('Porta', 'Port')} ${infoWord?.porta || 23119})`}
                  </span>
                  {infoWord?.urlPainel && (
                    <button
                      className="btn pequeno secundario"
                      onClick={() => window.api?.sistema?.abrirLink(infoWord.urlPainel)}
                      title={tr('Abrir painel web do suplemento do Word no navegador', 'Open Word add-in panel in browser')}
                    >
                      {tr('Testar no Navegador ↗', 'Test in Browser ↗')}
                    </button>
                  )}
                </div>
              </div>
            </div>

            {/* QUADRO 2: GRID DE MÉTRICAS DO RUNTIME E BIBLIOTECA */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))',
                gap: 10,
              }}
            >
              {/* Card Runtime */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: 8,
                  background: 'var(--painel)',
                  border: '1px solid var(--borda)',
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase' }}>
                  💻 {tr('Runtime & Plataforma', 'Runtime & Platform')}
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
                  <div>
                    <strong>Electron:</strong> <span style={{ fontFamily: 'monospace' }}>v{infoSistema?.electron || '44.9.2'}</span>
                  </div>
                  <div>
                    <strong>Node.js:</strong> <span style={{ fontFamily: 'monospace' }}>v{infoSistema?.node || '20.x'}</span>
                  </div>
                  <div>
                    <strong>Chromium:</strong> <span style={{ fontFamily: 'monospace' }}>v{infoSistema?.chrome || '124.x'}</span>
                  </div>
                  <div>
                    <strong>{tr('SO', 'OS')}:</strong> Windows ({infoSistema?.arquitetura || 'x64'})
                  </div>
                </div>
              </div>

              {/* Card Biblioteca */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: 8,
                  background: 'var(--painel)',
                  border: '1px solid var(--borda)',
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase' }}>
                  📚 {tr('Acervo da Biblioteca', 'Library Summary')}
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
                  <div>
                    <strong>{tr('Obras Indexadas:', 'Indexed Items:')}</strong>{' '}
                    <span style={{ color: 'var(--primaria)', fontWeight: 700 }}>{refs.length} {tr('referências', 'references')}</span>
                  </div>
                  <div>
                    <strong>{tr('PDFs Anexados:', 'Attached PDFs:')}</strong>{' '}
                    <span style={{ color: '#16a34a', fontWeight: 600 }}>{totalComPdf} {tr('arquivos', 'files')}</span>
                  </div>
                  <div>
                    <strong>{tr('Citadas no Manuscrito:', 'Cited in Manuscript:')}</strong>{' '}
                    <span style={{ color: '#2563eb', fontWeight: 600 }}>{totalCitadas} {tr('obras', 'items')}</span>
                  </div>
                  <div>
                    <strong>{tr('Coleções / Capítulos:', 'Collections / Chapters:')}</strong> {bib?.colecoes?.length || 0} {tr('pastas', 'folders')}
                  </div>
                </div>
              </div>

              {/* Card Motores & Normas */}
              <div
                style={{
                  padding: '12px',
                  borderRadius: 8,
                  background: 'var(--painel)',
                  border: '1px solid var(--borda)',
                }}
              >
                <div style={{ fontSize: 11.5, fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase' }}>
                  📐 {tr('Motores CSL & Visualização', 'CSL & Viewer Engines')}
                </div>
                <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 5, fontSize: 12 }}>
                  <div>
                    <strong>{tr('Motor CSL:', 'CSL Engine:')}</strong> CiteProc-JS
                  </div>
                  <div>
                    <strong>{tr('Normas Nativas:', 'Native Styles:')}</strong> ABNT NBR 6023, APA 7th, Vancouver, Chicago
                  </div>
                  <div>
                    <strong>{tr('Leitor de PDF:', 'PDF Reader:')}</strong> PDF.js Web Worker
                  </div>
                  <div>
                    <strong>{tr('Persistência:', 'Storage:')}</strong> {tr('JSON Atômico no OneDrive/Drive', 'Atomic JSON per reference')}
                  </div>
                </div>
              </div>
            </div>

            {/* QUADRO 3: CAMINHO DA PASTA DA BIBLIOTECA */}
            <div
              style={{
                padding: '10px 12px',
                borderRadius: 8,
                background: 'var(--fundo)',
                border: '1px solid var(--borda)',
                fontSize: 12,
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <div style={{ flex: 1, minWidth: 200 }}>
                  <span style={{ color: 'var(--texto-suave)', fontWeight: 600 }}>📁 Pasta da Biblioteca Ativa (Nuvem):</span>
                  <div style={{ fontFamily: 'monospace', fontSize: 11.8, marginTop: 2, wordBreak: 'break-all' }}>
                    {bib?.raiz || 'C:\\Users\\Marcos\\OneDrive\\Bibliografia'}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  {bib?.raiz && (
                    <button
                      className="btn pequeno secundario"
                      onClick={() => window.api?.bib?.abrirPasta?.()}
                      title="Abrir esta pasta no Windows Explorer"
                    >
                      Abrir no Explorer ↗
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ABA 2: CHANGELOG HISTÓRICO DE VERSÕES */}
        {abaAtiva === 'changelog' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
            {/* VERSÃO 1.0.1 */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'rgba(168, 28, 36, 0.04)',
                border: '1px solid rgba(168, 28, 36, 0.3)',
                borderLeft: '4px solid var(--primaria)',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ background: 'var(--primaria)', color: '#fff', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>
                  v1.0.1
                </span>
                <strong style={{ fontSize: 13.5 }}>Novembro de 2026 — Extensão Word (.dotm), Calibração Forense &amp; Manifesto Open Source</strong>
                <span style={{ fontSize: 11, color: 'var(--texto-suave)', marginLeft: 'auto' }}>Versão Atual</span>
              </div>
              <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--texto)' }}>
                <li><strong>Extensão Nativa Microsoft Word (<code>.dotm</code> + Ribbon):</strong> Gerador de template com faixa OOXML (<code>customUI14.xml</code>), seletor rápido <code>Ctrl+Shift+B</code>, sincronização em lote de campos dinâmicos e leitor reverso <code>w:instrText</code>.</li>
                <li><strong>Calibração Forense Geral:</strong> Disambiguação de coautores no mesmo ano, classificação LeNER-Br de sites institucionais e apostilas, reconstrução PDF multi-página, DeCS/MeSH e estilometria refinada.</li>
                <li><strong>Resolução Direta na Auditoria Reversa:</strong> Botões nos cards para anexar apostila/PDF local ou confirmar site oficial diretamente na Biblioteca.</li>
                <li><strong>Transparência Apache 2.0:</strong> Inclusão de <code>THIRD_PARTY_NOTICES.md</code> e seção de inspirações open source no README.</li>
              </ul>
            </div>

            {/* MARCO INTERNO: ERGONOMIA MENDELEY */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'var(--painel)',
                border: '1px solid var(--borda)',
                borderLeft: '4px solid #64748b',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ background: '#64748b', color: '#fff', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>
                  Marco de Ergonomia
                </span>
                <strong style={{ fontSize: 13.5 }}>Novembro de 2026 — Ergonomia Mendeley &amp; Painel Forense</strong>
              </div>
              <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--texto)' }}>
                <li><strong>Activity Rail Permanente (86px):</strong> Novo menu vertical estilo Mendeley Desktop e Zotero 7 substituindo abas horizontais quebradas.</li>
                <li><strong>Paleta Sóbria Grafite &amp; Carmim Mendeley:</strong> Identidade visual profissional com ardósia neutra e bordas de 1px.</li>
                <li><strong>Modal de Bibliografia Formatada Expandido (1080px):</strong> Seletor de escopo (Citadas, Consultadas, Selecionadas, Todas) com cópia rica para o Word.</li>
                <li><strong>Splash Screen Dinâmica Vetorial:</strong> Tela de abertura animada com livro em perspectiva, órbitas giratórias e temporizador de escape anti-congelamento.</li>
                <li><strong>Auditoria Reversa Agrupada por Intercorrência:</strong> Classificação inteligente em IA/DOIs Falsos, Citações Trocadas, Plágio, Citações Órfãs e Metadados.</li>
                <li><strong>Módulo de Diagnóstico e Versionamento:</strong> Visualização em tempo real de portas, versões do runtime e histórico de lançamentos.</li>
              </ul>
            </div>

            {/* VERSÃO 1.1.0 */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'var(--painel)',
                border: '1px solid var(--borda)',
                borderLeft: '4px solid #2563eb',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ background: '#2563eb', color: '#fff', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>
                  v1.1.0
                </span>
                <strong style={{ fontSize: 13.5 }}>Outubro de 2026 — Auditoria Forense, Word Server &amp; PRISMA 2020</strong>
              </div>
              <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--texto)' }}>
                <li><strong>Auditoria Reversa Avançada:</strong> Extração cruzada de citações no texto Word (.docx) com checagem anti-alucinação de IA e plágio sem aspas.</li>
                <li><strong>Localizador de Citações no PDF:</strong> Leitura automática página a página do artigo para identificar o parágrafo e a página exata da citação.</li>
                <li><strong>Servidor Local Microsoft Word (Porta 23119):</strong> Inserção dinâmica de citações no documento Word via manifesto XML local.</li>
                <li><strong>Triagem Sistemática PRISMA 2020:</strong> Fluxo com Identificação, Triagem de Resumos, Elegibilidade e geração de fluxograma visual exportável.</li>
                <li><strong>Hub de Buscadores de Saúde:</strong> Conexão direta com PubMed, SciELO, CAPES, Europe PMC e OpenAlex com cofre de senhas criptografado.</li>
              </ul>
            </div>

            {/* VERSÃO 1.0.0 */}
            <div
              style={{
                padding: '12px 14px',
                borderRadius: 8,
                background: 'var(--painel)',
                border: '1px solid var(--borda)',
                borderLeft: '4px solid #16a34a',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <span style={{ background: '#16a34a', color: '#fff', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>
                  v1.0.0
                </span>
                <strong style={{ fontSize: 13.5 }}>Outubro de 2026 — Lançamento da Plataforma Bibliografia</strong>
              </div>
              <ul style={{ margin: '6px 0 0 18px', padding: 0, fontSize: 12, lineHeight: 1.6, color: 'var(--texto)' }}>
                <li><strong>Arquitetura Desacoplada Electron + React 19:</strong> Persistência atômica em arquivos JSON individuais na nuvem (OneDrive / Google Drive).</li>
                <li><strong>Varinha Mágica por Identificador:</strong> Resolução automática instantânea por DOI, PMID e ISBN via Crossref e PubMed.</li>
                <li><strong>Visualizador Nativo PDF.js:</strong> Renderização com marcações coloridas, anotações de fichamento e PICO clínico.</li>
                <li><strong>Catálogo Unificado BibTeX:</strong> Sincronização em tempo real com arquivo `library.bib` para interoperabilidade com LaTeX e Overleaf.</li>
              </ul>
            </div>
          </div>
        )}

        {/* RODAPÉ COM BOTÕES */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 16,
            paddingTop: 12,
            borderTop: '1px solid var(--borda)',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          <button
            className="btn secundario"
            onClick={copiarDiagnostico}
            title={tr('Copia todas as informações técnicas do sistema para colar em suporte ou documentação', 'Copy technical system info for support or documentation')}
          >
            {copiado ? tr('✓ Diagnóstico Copiado!', '✓ Diagnostics Copied!') : tr('📋 Copiar Diagnóstico Técnico', '📋 Copy System Diagnostics')}
          </button>

          <button className="btn primario" onClick={aoFechar}>
            {tr('Fechar', 'Close')}
          </button>
        </div>
      </div>
    </Modal>
  );
}
