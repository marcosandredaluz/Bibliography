import React, { useEffect, useMemo, useState } from 'react';
import { Icone, useAviso } from './ui.jsx';
import { autoresResumo, ano, semHtml, normalizar, rotuloStatus } from '../lib/csl.js';
import { useI18n } from '../i18n.jsx';

const MOTIVOS_EXCLUSAO = [
  'Fora do escopo / PICO',
  'População diferente',
  'Intervenção/exposição diferente',
  'Delineamento inadequado (ex.: revisão narrativa / relato de caso)',
  'Idioma ou período fora do critério',
  'Texto completo indisponível',
];

export function WordHubView({ refs, documentos = [], estilo, estilos, idioma, onMudarEstilo, onAtualizarRef, onRecarregar }) {
  const avisar = useAviso();
  const { tr } = useI18n();
  const [infoWord, setInfoWord] = useState(null);
  const [sempreNoTopo, setSempreNoTopo] = useState(false);
  const [nomeDoc, setNomeDoc] = useState(documentos[0]?.titulo || 'Tese / Artigo Principal');
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState('');
  const [usarCampoNativo, setUsarCampoNativo] = useState(true);
  const [mostrarPlugIns, setMostrarPlugIns] = useState(false);
  const [selecionadasComposta, setSelecionadasComposta] = useState(new Set());
  const [extracaoDocx, setExtracaoDocx] = useState(null);
  const [extraindoDocx, setExtraindoDocx] = useState(false);
  const [importandoExtracao, setImportandoExtracao] = useState(false);
  const [instalandoExtensao, setInstalandoExtensao] = useState(false);
  const [atualizandoCampos, setAtualizandoCampos] = useState(false);
  const [avisoTrustVba, setAvisoTrustVba] = useState(false);

  const carregarInfoWord = () => window.api.word.info().then(setInfoWord).catch(() => {});

  useEffect(() => {
    carregarInfoWord();
  }, []);

  const alternarTopo = async () => {
    const novo = await window.api.word.modoTopo(!sempreNoTopo);
    setSempreNoTopo(novo);
    avisar(
      novo
        ? 'Janela fixada sempre no topo! Abra o Word ao lado e clique em "Citar no Word".'
        : 'Janela desafixada do topo.',
      'info'
    );
  };

  const refsFiltradas = useMemo(() => {
    const q = normalizar(busca);
    return refs
      .filter((r) => r.status !== 'descartada')
      .filter((r) => !q || normalizar(`${r.csl?.title || ''} ${autoresResumo(r.csl)} ${ano(r.csl)}`).includes(q));
  }, [refs, busca]);

  const toggleSelecaoComposta = (id) => {
    setSelecionadasComposta((ant) => {
      const prox = new Set(ant);
      if (prox.has(id)) prox.delete(id);
      else prox.add(id);
      return prox;
    });
  };

  const citarIdsNoWord = async (ids) => {
    try {
      const docAtual = documentos.find((d) => d.titulo === nomeDoc);
      const idsSync = [...new Set([...(docAtual?.citadasIds || []), ...ids])];
      const res = await window.api.word.inserirCitacaoWordAtivo({
        ids,
        estilo,
        idioma,
        pagina,
        comCampoNativo: usarCampoNativo,
        docId: nomeDoc,
        tituloDoc: nomeDoc,
      });
      await window.api.bib.sincronizarWord({
        docId: nomeDoc,
        titulo: nomeDoc,
        estilo,
        citadasIds: idsSync,
      });
      onRecarregar?.();
      if (res?.injetadoDireto) {
        avisar(
          `✓ ${res.citacaoTexto} injetada direto no Word (${res.documentoAtivoNome}) ${usarCampoNativo ? 'como Campo protegido' : 'no cursor'} + copiada!`,
          'ok'
        );
      } else {
        avisar(`Copiado: ${res?.citacaoTexto || ''} — cole no Word (Ctrl+V). Marcada(s) como Citada!`, 'ok');
      }
      if (ids.length > 1) setSelecionadasComposta(new Set());
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const inserirOuCopiarListaWord = async (escopo) => {
    try {
      const res = await window.api.word.inserirBibliografiaWordAtivo({ escopo, estilo, idioma });
      if (res?.injetadoDireto) {
        avisar(
          `✓ ${escopo === 'citadas' ? 'REFERÊNCIAS' : 'BIBLIOGRAFIA CONSULTADA'} (${res.total} obras) inserida/atualizada direto no Word (${res.documentoAtivoNome})!`,
          'ok'
        );
      } else {
        avisar(
          escopo === 'citadas'
            ? `Lista de REFERÊNCIAS (${res.total} obras citadas) copiada! Cole no fim do Word (Ctrl+V).`
            : `Lista de BIBLIOGRAFIA CONSULTADA (${res.total} obras) copiada! Cole no Word (Ctrl+V).`,
          'ok'
        );
      }
    } catch (e) {
      avisar(e.message, 'info');
    }
  };

  const abrirExtratorDocx = async () => {
    setExtraindoDocx(true);
    try {
      const res = await window.api.word.extrairReferenciasDocx();
      if (!res) return;
      setExtracaoDocx(res);
      avisar(
        `Extraídas ${res.resumo.totalObrasUnicas} obra(s) de "${res.nomeArquivo}" (${res.resumo.novasParaImportar} nova(s) p/ importar).`,
        'ok'
      );
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setExtraindoDocx(false);
    }
  };

  const importarExtraidasParaBiblioteca = async () => {
    if (!extracaoDocx?.itens?.length) return;
    setImportandoExtracao(true);
    try {
      const res = await window.api.word.importarExtraidas({
        itens: extracaoDocx.itens,
        marcarComoCitada: true,
      });
      await onRecarregar?.();
      const atualizada = await window.api.word.extrairReferenciasDocx(extracaoDocx.caminhoDocx);
      if (atualizada) setExtracaoDocx(atualizada);
      avisar(
        `✓ Importação concluída: ${res.adicionadas} obra(s) adicionada(s), ${res.atualizadasCitada} atualizada(s) como Citada (${res.jaExistentes} já estavam na biblioteca).`,
        'ok'
      );
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setImportandoExtracao(false);
    }
  };

  const instalarExtensaoWord = async () => {
    setInstalandoExtensao(true);
    setAvisoTrustVba(false);
    try {
      const res = await window.api.word.compilarEInstalarDotm();
      await carregarInfoWord();
      if (res?.ok) {
        avisar('✓ Extensão "Bibliografia Forense" (.dotm) instalada na pasta STARTUP do Word! Reinicie o Word para ver a aba.', 'ok');
      } else if (res?.precisaConfiarVba) {
        setAvisoTrustVba(true);
        avisar(res.mensagem, 'info');
      } else {
        avisar(res?.mensagem || 'Não foi possível gerar o .dotm automaticamente.', 'erro');
      }
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setInstalandoExtensao(false);
    }
  };

  const importarDotmPronto = async () => {
    try {
      const res = await window.api.word.escolherEInstalarDotm();
      if (!res) return;
      await carregarInfoWord();
      setAvisoTrustVba(false);
      avisar('✓ Arquivo .dotm instalado no STARTUP do Word com sucesso!', 'ok');
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const removerExtensaoDoWord = async () => {
    try {
      await window.api.word.removerExtensaoWord();
      await carregarInfoWord();
      avisar('Extensão removida da pasta STARTUP do Word.', 'info');
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const atualizarCamposWordAberto = async () => {
    setAtualizandoCampos(true);
    try {
      const res = await window.api.word.atualizarCamposWordAtivo({ estilo, idioma });
      await onRecarregar?.();
      avisar(
        `✓ ${res.totalCamposAtualizados} citação(ões) dinâmica(s) e ${res.totalReferencias} referência(s) atualizadas no Word (${res.documentoAtivoNome})!`,
        'ok'
      );
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setAtualizandoCampos(false);
    }
  };

  const alternarAtalhoZotero = async () => {
    try {
      const res = await window.api.word.alternarAtalhoGlobal(!infoWord?.atalhoAtivo);
      await carregarInfoWord();
      avisar(
        res.atalhoAtivo
          ? '⌨️ Atalho Zotero Ctrl+Shift+B ativado! Pressione Ctrl+Shift+B dentro do Word para abrir o seletor rápido.'
          : 'Atalho global Ctrl+Shift+B desativado.',
        'info'
      );
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const citadasCount = refs.filter((r) => r.status === 'citada').length;
  const consultadasCount = refs.filter((r) => r.status === 'consultada').length;
  const dotmInstalado = Boolean(infoWord?.extensaoDotm?.instaladoNoWord);

  return (
    <div className="central-buscadores">
      <div className="topo-buscadores">
        <div>
          <h2>{tr('Integração Nativa com o Microsoft Word (ABNT, APA 7ª ed., Vancouver)', 'Native Microsoft Word Integration (APA 7th, Vancouver, ABNT)')}</h2>
          <p className="subtitulo">
            {tr('Injete citações direto no cursor do Word como', 'Inject citations directly at the Word cursor as')} <strong>{tr('Campos dinâmicos (estilo Zotero/Mendeley)', 'dynamic fields (Zotero/Mendeley style)')}</strong> {tr('ou copie via ponte local na porta', 'or sync via local HTTP bridge on port')} <code>{infoWord?.porta || 23119}</code>.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <span
            style={{
              fontSize: 12,
              padding: '4px 10px',
              borderRadius: 999,
              background: '#dcfce7',
              color: '#166534',
              fontWeight: 600,
              border: '1px solid #86efac',
            }}
            title={infoWord?.telemetria?.ultimaAtividadeEm ? `${tr('Última comunicação Word:', 'Last Word activity:')} ${infoWord.telemetria.ultimaAtividadeEm}` : tr('Servidor HTTP local pronto', 'Local HTTP bridge ready')}
          >
            ● {tr('Ponte Word', 'Word Bridge')} :{infoWord?.porta || 23119} {tr('Ativa', 'Online')}
          </span>
          <button className="btn fantasma" onClick={() => setMostrarPlugIns((v) => !v)}>
            🔌 {mostrarPlugIns ? tr('Ocultar Extensão Word (.dotm / Office.js)', 'Hide Word Extension (.dotm / Office.js)') : dotmInstalado ? tr('✓ Extensão Word (.dotm) Ativa', '✓ Word Extension (.dotm) Active') : tr('Instalar Extensão no Word (.dotm)', 'Install Word Extension (.dotm)')}
          </button>
          <button
            className="btn secundario"
            onClick={() => window.api.word.abrirSeletorRapido()}
            title={tr('Abre o Seletor Rápido de Citações (também acessível direto do Word com Ctrl+Shift+B)', 'Open Quick Citation Picker (global hotkey Ctrl+Shift+B)')}
          >
            ⚡ {tr('Seletor Rápido', 'Quick Citator')} ({infoWord?.atalhoGlobal || 'Ctrl+Shift+B'})
          </button>
          <button className={`btn ${sempreNoTopo ? 'primario' : 'secundario'}`} onClick={alternarTopo}>
            <Icone nome="external" tam={14} />{' '}
            {sempreNoTopo ? tr('Fixado no Topo (Ativo)', 'Always on Top (Active)') : tr('Fixar janela ao lado do Word', 'Pin Window Side-by-Side')}
          </button>
        </div>
      </div>

      {mostrarPlugIns && infoWord && (
        <div className="bloco-proxy" style={{ borderLeft: `4px solid ${dotmInstalado ? '#16a34a' : '#2563eb'}`, background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
            <div style={{ flex: 1, minWidth: 280 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                <strong>{tr('Extensão Nativa no Microsoft Word (Aba "Bibliografia Forense" estilo Zotero & Mendeley)', 'Native Microsoft Word Extension (Fluent Ribbon Tab)')}</strong>
                <span
                  className="pill-contagem"
                  style={{
                    background: dotmInstalado ? '#dcfce7' : '#fef3c7',
                    color: dotmInstalado ? '#166534' : '#92400e',
                  }}
                >
                  {dotmInstalado ? tr('✓ Instalada no STARTUP do Word', '✓ Installed in Word STARTUP') : tr('Ainda não instalada no Word', 'Not yet installed in Word')}
                </span>
              </div>
              <div style={{ fontSize: 12.5, color: '#475569', marginTop: 6, lineHeight: 1.45 }}>
                • <strong>{tr('Aba Ribbon no Word', 'Word Ribbon Tab')} (<code>Bibliografia.dotm</code>):</strong> {tr('instala na pasta de inicialização do Word', 'installs in the Word startup folder')} (<code>{infoWord.pastaStartupWord || '%APPDATA%\\Microsoft\\Word\\STARTUP'}</code>) {tr('para adicionar botões nativos de Citar, Atualizar Norma, Inserir Referências e Grifar Erros/IA dentro do Word.', 'to add native buttons for Cite, Update Standard, Insert References, and Highlight Errors/AI inside Word.')}<br />
                • <strong>{tr('Atalho Instantâneo Sem Macro', 'Instant Macro-Free Shortcut')} (<code>{infoWord.atalhoGlobal || 'Ctrl+Shift+B'}</code>):</strong>{' '}
                <button
                  type="button"
                  onClick={alternarAtalhoZotero}
                  style={{ border: 'none', background: 'none', color: '#2563eb', fontWeight: 600, cursor: 'pointer', padding: 0, textDecoration: 'underline' }}
                >
                  {infoWord.atalhoAtivo ? tr('Ativo (clique p/ desativar)', 'Active (click to disable)') : tr('Desativado (clique p/ ativar)', 'Disabled (click to enable)')}
                </button>{' '}
                — {tr('funciona dentro do Word mesmo se sua instituição bloquear macros VBA!', 'works inside Word even if your institution blocks VBA macros!')}
              </div>

              {avisoTrustVba && (
                <div style={{ marginTop: 10, padding: '8px 10px', borderRadius: 6, background: '#fffbeb', border: '1px solid #f59e0b', fontSize: 12.5, color: '#78350f' }}>
                  <strong>{tr('Permissão necessária no Word para compilar o', 'Permission needed in Word to compile')} <code>.dotm</code> {tr('automaticamente:', 'automatically:')}</strong><br />
                  {tr(
                    'No Microsoft Word, acesse Arquivo → Opções → Central de Confiabilidade → Configurações da Central de Confiabilidade → Configurações de Macro e marque "Confiar no acesso ao modelo de objeto do projeto do VBA". Depois clique novamente em "🔨 Compilar & Instalar no Word" (ou importe manualmente Bibliografia.bas via Alt+F11, salve como Bibliografia.dotm e clique em "Selecionar .dotm pronto").',
                    'In Microsoft Word, go to File → Options → Trust Center → Trust Center Settings → Macro Settings and check "Trust access to the VBA project object model". Then click "🔨 Generate & Install Extension (.dotm)" again (or manually import Bibliografia.bas via Alt+F11, save as Bibliografia.dotm, and click "Select ready .dotm").'
                  )}
                </div>
              )}
            </div>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button className="btn pequeno primario" onClick={instalarExtensaoWord} disabled={instalandoExtensao}>
                {instalandoExtensao ? tr('Gerando .dotm…', 'Generating .dotm…') : dotmInstalado ? tr('🔄 Reinstalar / Atualizar .dotm no Word', '🔄 Reinstall / Update .dotm in Word') : tr('🔨 Gerar & Instalar Extensão (.dotm)', '🔨 Generate & Install Extension (.dotm)')}
              </button>
              <button className="btn pequeno secundario" onClick={importarDotmPronto}>
                📥 {tr('Selecionar .dotm pronto', 'Select ready .dotm')}
              </button>
              {dotmInstalado && (
                <button className="btn pequeno fantasma" onClick={removerExtensaoDoWord} style={{ color: '#b91c1c' }}>
                  🗑️ {tr('Remover do Word', 'Remove from Word')}
                </button>
              )}
              <button className="btn pequeno fantasma" onClick={() => window.api.word.abrirPastaVba()}>
                <Icone nome="folder" tam={13} /> {tr('Pasta VBA (.bas / customUI)', 'VBA Folder (.bas / customUI)')}
              </button>
              <button className="btn pequeno fantasma" onClick={() => window.api.word.mostrarManifesto()}>
                <Icone nome="folder" tam={13} /> {tr('Manifesto Office.js', 'Office.js Manifest')}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de configuração do documento e exportação/injeção em 1 clique */}
      <div className="bloco-proxy">
        <div className="grade-3">
          <label className="campo">
            <span className="campo-rotulo">{tr('Documento / Manuscrito ativo', 'Active Document / Manuscript')}</span>
            <input
              value={nomeDoc}
              onChange={(e) => setNomeDoc(e.target.value)}
              placeholder={tr('Ex.: Dissertação - Cap. 2', 'e.g. Thesis - Ch. 2')}
            />
          </label>
          <label className="campo">
            <span className="campo-rotulo">{tr('Norma de formatação do documento', 'Document formatting standard')}</span>
            <select value={estilo} onChange={(e) => onMudarEstilo(e.target.value)}>
              {estilos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span className="campo-rotulo">{tr('Página p/ citação direta (opcional)', 'Page for direct quote (optional)')}</span>
            <input
              value={pagina}
              onChange={(e) => setPagina(e.target.value)}
              placeholder={tr('Ex.: 45 (gera SILVA, 2023, p. 45)', 'e.g. 45 (produces SILVA, 2023, p. 45)')}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
          <div className="barra-pdf">
            <button className="btn primario" onClick={() => inserirOuCopiarListaWord('citadas')}>
              <Icone nome="copy" tam={14} /> 1. {tr('Inserir/Copiar REFERÊNCIAS', 'Insert/Copy REFERENCES')} ({citadasCount} {tr('Citadas', 'Cited')})
            </button>
            <button className="btn secundario" onClick={() => inserirOuCopiarListaWord('consultadas')}>
              <Icone nome="copy" tam={14} /> 2. {tr('Inserir/Copiar CONSULTADAS', 'Insert/Copy CONSULTED')} ({consultadasCount})
            </button>
            <button className="btn secundario" onClick={atualizarCamposWordAberto} disabled={atualizandoCampos}>
              🔄 {atualizandoCampos ? tr('Atualizando Campos no Word…', 'Updating Word Fields…') : tr('Atualizar Campos & Norma no Word Aberto', 'Update Fields & Style in Open Word')}
            </button>
            <button className="btn fantasma" onClick={abrirExtratorDocx} disabled={extraindoDocx} style={{ border: '1px solid #cbd5e1' }}>
              🔍 {extraindoDocx ? tr('Extraindo XML do Word…', 'Extracting Word XML…') : tr('Extrair Citações / Campos de .DOCX (Ref-Extractor)', 'Extract Citations / Fields from .DOCX (Ref-Extractor)')}
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={usarCampoNativo}
              onChange={(e) => setUsarCampoNativo(e.target.checked)}
            />
            {tr('Inserir como Campo protegido no Word aberto', 'Insert as protected Field in open Word')} (<code>wdFieldAddin</code>)
          </label>
        </div>
      </div>

      {/* Resultado do Ref-Extractor (Zotero / Mendeley / EndNote / ABNT de qualquer .DOCX) */}
      {extracaoDocx && (
        <div className="bloco-cofre" style={{ borderLeft: '4px solid #0d9488' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            <div>
              <strong>🔍 {tr('Extrator Reverso de Citações', 'Reverse Citation Extractor')} ({extracaoDocx.nomeArquivo})</strong>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                {tr('Modo:', 'Mode:')} <strong>{extracaoDocx.origemModo === 'campos_dinamicos' ? tr('Campos Dinâmicos XML (Zotero / Mendeley / EndNote / Bibliografia)', 'Dynamic XML Fields (Zotero / Mendeley / EndNote / Bibliografia)') : tr('Referências Estáticas (ABNT/Vancouver)', 'Static References (ABNT/Vancouver)')}</strong> ·{' '}
                Total: <strong>{extracaoDocx.resumo.totalObrasUnicas}</strong> {tr('obra(s)', 'work(s)')} · {tr('Já na biblioteca:', 'Already in library:')} <strong>{extracaoDocx.resumo.jaNaBiblioteca}</strong> · {tr('Novas:', 'New:')} <strong>{extracaoDocx.resumo.novasParaImportar}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn pequeno primario"
                onClick={importarExtraidasParaBiblioteca}
                disabled={importandoExtracao || !extracaoDocx.itens.length}
              >
                {importandoExtracao ? tr('Importando…', 'Importing…') : `📥 ${tr('Importar / Sincronizar', 'Import / Sync')} (${extracaoDocx.resumo.totalObrasUnicas}) ${tr('como Citadas', 'as Cited')}`}
              </button>
              <button className="btn pequeno fantasma" onClick={() => setExtracaoDocx(null)}>
                {tr('Fechar', 'Close')}
              </button>
            </div>
          </div>

          <div style={{ maxHeight: 230, overflowY: 'auto', display: 'grid', gap: 6 }}>
            {extracaoDocx.itens.map((it) => (
              <div
                key={it.chaveUnica}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '6px 10px',
                  borderRadius: 6,
                  background: '#ffffff',
                  border: '1px solid #e2e8f0',
                  gap: 10,
                }}
              >
                <div style={{ fontSize: 12.5 }}>
                  <strong>{it.csl?.title || it.textoOriginal}</strong>
                  <div style={{ fontSize: 11.5, color: '#64748b' }}>
                    {it.csl?.author?.[0]?.family || it.csl?.author?.[0]?.literal || tr('Autor n/d', 'Author n/a')} ·{' '}
                    {it.csl?.issued?.['date-parts']?.[0]?.[0] || tr('s.d.', 'n.d.')} ·{' '}
                    {it.csl?.DOI ? `DOI: ${it.csl.DOI} · ` : ''}
                    {tr('Citada', 'Cited')} {it.ocorrencias}x ({it.origens.join(', ')})
                  </div>
                </div>
                <span
                  className="pill-contagem"
                  style={{
                    background: it.naBiblioteca ? '#dcfce7' : '#fef3c7',
                    color: it.naBiblioteca ? '#166534' : '#92400e',
                    whiteSpace: 'nowrap',
                  }}
                >
                  {it.naBiblioteca ? tr('✓ Na Biblioteca', '✓ In Library') : tr('+ Nova p/ Importar', '+ New to Import')}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista rápida para citar em 1 clique (com suporte a multi-citação composta) */}
      <div className="bloco-cofre">
        <div className="barra-lista" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <strong>{tr('Clique em "⚡ Citar no Word" para injetar no cursor / copiar e já marcar como Citada:', 'Click "⚡ Cite in Word" to inject at cursor / copy and mark as Cited:')}</strong>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selecionadasComposta.size >= 2 && (
              <button
                className="btn pequeno primario"
                onClick={() => citarIdsNoWord([...selecionadasComposta])}
              >
                ⚡ {tr('Citar', 'Cite')} {selecionadasComposta.size} {tr('juntas no Word', 'together in Word')}
              </button>
            )}
            <input
              style={{ width: 320, padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={tr('Buscar por autor, título ou ano…', 'Search by author, title, or year…')}
            />
          </div>
        </div>

        <div className="lista-artigos-inline">
          {refsFiltradas.map((r) => (
            <div key={r.id} className="item-artigo-inline">
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <input
                  type="checkbox"
                  checked={selecionadasComposta.has(r.id)}
                  onChange={() => toggleSelecaoComposta(r.id)}
                  title="Marque 2+ artigos para gerar citação composta única: (Autor A, 2020; Autor B, 2022)"
                />
                <div className="item-artigo-info">
                  <h4>{semHtml(r.csl?.title)}</h4>
                  <div className="sub-meta">
                    <strong>{[autoresResumo(r.csl), ano(r.csl)].filter(Boolean).join(', ')}</strong>
                    {r.csl?.['container-title'] ? ` · ${r.csl['container-title']}` : ''}
                  </div>
                </div>
              </div>
              <div className="item-artigo-acoes">
                <span
                  className="pill-contagem"
                  style={{
                    background: r.status === 'citada' ? '#dcfce7' : r.status === 'consultada' ? '#dbeafe' : '#f1f5f9',
                    color: r.status === 'citada' ? '#166534' : r.status === 'consultada' ? '#1e40af' : '#475569',
                  }}
                >
                  {r.status === 'citada' ? tr('✓ Citada', '✓ Cited') : r.status === 'consultada' ? tr('Consultada', 'Consulted') : tr('A ler', 'To Read')}
                </span>
                <button className="btn pequeno primario" onClick={() => citarIdsNoWord([r.id])}>
                  <Icone nome="copy" tam={13} /> ⚡ {tr('Citar no Word', 'Cite in Word')}
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function PrismaAndScreeningView({ refs, onAtualizarRef, onRecarregar }) {
  const avisar = useAviso();
  const { tr } = useI18n();
  const [aba, setAba] = useState('duplicatas'); // 'duplicatas' | 'triagem' | 'prisma'
  const [historicoBuscas, setHistoricoBuscas] = useState([]);
  const [motivoPadrao, setMotivoPadrao] = useState(MOTIVOS_EXCLUSAO[0]);
  const [buscaTriagem, setBuscaTriagem] = useState('');
  const [buscaDuplicatas, setBuscaDuplicatas] = useState('');
  const [processandoMescla, setProcessandoMescla] = useState(false);
  const [resumosAbertos, setResumosAbertos] = useState(new Set());
  const [mostrarExplicacaoSeguranca, setMostrarExplicacaoSeguranca] = useState(true);

  useEffect(() => {
    window.api.busc.historico().then(setHistoricoBuscas).catch(() => {});
  }, []);

  // Detector inteligente de duplicatas com critério e pontuação de completude
  const gruposDuplicados = useMemo(() => {
    const mapa = new Map();

    const adicionar = (chave, ref, criterioTipo, criterioValor) => {
      if (!chave) return;
      const entrada = mapa.get(chave) || { criterioTipo, criterioValor, itens: [] };
      if (!entrada.itens.some((x) => x.id === ref.id)) {
        entrada.itens.push(ref);
      }
      mapa.set(chave, entrada);
    };

    for (const r of refs) {
      if (r.csl?.DOI) {
        adicionar(`doi:${r.csl.DOI.trim().toLowerCase()}`, r, 'doi', r.csl.DOI.trim());
      }
      if (r.csl?.PMID) {
        adicionar(`pmid:${String(r.csl.PMID).trim()}`, r, 'pmid', String(r.csl.PMID).trim());
      }
      const tit = normalizar(semHtml(r.csl?.title || '')).replace(/[^a-z0-9]/g, '');
      if (tit.length > 18) {
        adicionar(`tit:${tit}`, r, 'titulo', semHtml(r.csl?.title || ''));
      }
    }

    // Calcula completude para eleger o registro principal sugerido
    const pontuarRef = (ref) => {
      let pts = 0;
      if (ref.pdf) pts += 20; // Prioridade máxima: ter o PDF anexo
      if (ref.status === 'citada') pts += 12;
      else if (ref.status === 'consultada') pts += 8;
      else if (ref.status === 'a_ler') pts += 3;
      if (ref.notas && ref.notas.trim()) pts += 6;
      if (ref.tags && ref.tags.length > 0) pts += ref.tags.length * 2;
      if (ref.csl?.abstract) pts += 5;
      if (ref.csl?.DOI) pts += 4;
      if (ref.csl?.PMID) pts += 3;
      pts += Object.keys(ref.csl || {}).length;
      return pts;
    };

    const vistos = new Set();
    const grupos = [];

    for (const [, { criterioTipo, criterioValor, itens }] of mapa.entries()) {
      if (itens.length > 1) {
        const chaveGrupo = itens.map((x) => x.id).sort().join('|');
        if (!vistos.has(chaveGrupo)) {
          vistos.add(chaveGrupo);
          const ordenados = [...itens].sort((a, b) => pontuarRef(b) - pontuarRef(a));
          grupos.push({
            id: chaveGrupo,
            criterioTipo,
            criterioValor,
            itens: ordenados,
            principalSugerido: ordenados[0],
            copias: ordenados.slice(1),
          });
        }
      }
    }
    return grupos;
  }, [refs]);

  const mesclarGrupo = async (grupo, principalPersonalizado = null) => {
    try {
      const principal = principalPersonalizado || grupo.principalSugerido || grupo.itens[0];
      const dups = grupo.itens.filter((x) => x.id !== principal.id);
      if (!dups.length) return;

      await window.api.bib.mesclar(
        principal.id,
        dups.map((d) => d.id)
      );
      await onRecarregar();
      avisar(`Duplicata mesclada! Todos os PDFs, anotações e tags foram transferidos para o registro principal mantido.`, 'ok');
    } catch (e) {
      avisar(`Falha ao mesclar grupo: ${e.message}`, 'erro');
    }
  };

  const mesclarTodasDuplicatas = async () => {
    if (!gruposDuplicados.length) return;
    setProcessandoMescla(true);
    try {
      let totalMescladas = 0;
      for (const grupo of gruposDuplicados) {
        const principal = grupo.principalSugerido || grupo.itens[0];
        const dups = grupo.itens.filter((x) => x.id !== principal.id);
        if (dups.length > 0) {
          await window.api.bib.mesclar(principal.id, dups.map((d) => d.id));
          totalMescladas += dups.length;
        }
      }
      await onRecarregar();
      avisar(`Concluído com sucesso! ${totalMescladas} registros duplicados foram unificados sem nenhuma perda de dados.`, 'ok');
    } catch (e) {
      avisar(`Erro na deduplicação em lote: ${e.message}`, 'erro');
    } finally {
      setProcessandoMescla(false);
    }
  };

  const toggleResumo = (id) => {
    setResumosAbertos((ant) => {
      const n = new Set(ant);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  };

  const pendentesTriagem = useMemo(() => {
    const q = normalizar(buscaTriagem);
    return refs
      .filter((r) => r.status === 'a_ler')
      .filter((r) => {
        if (!q) return true;
        const texto = normalizar(`${r.csl?.title || ''} ${autoresResumo(r.csl)} ${ano(r.csl)} ${r.csl?.abstract || ''}`);
        return texto.includes(q);
      });
  }, [refs, buscaTriagem]);

  // Números do PRISMA 2020
  const totalIdentificadosBases = historicoBuscas.reduce(
    (acc, h) => acc + Object.values(h.resultados || {}).reduce((s, n) => s + (Number(n) || 0), 0),
    0
  );
  const descartadas = refs.filter((r) => r.status === 'descartada');
  const consultadas = refs.filter((r) => r.status === 'consultada');
  const citadas = refs.filter((r) => r.status === 'citada');

  const motivosContagem = useMemo(() => {
    const m = {};
    for (const r of descartadas) {
      const mot = r.motivoExclusao || 'Fora do escopo / PICO';
      m[mot] = (m[mot] || 0) + 1;
    }
    return m;
  }, [descartadas]);

  const copiarRelatorioPrisma = () => {
    const linhasMotivos = Object.entries(motivosContagem)
      .map(([k, v]) => `  - ${k}: ${v}`)
      .join('\n');
    const txt = [
      'FLUXOGRAMA PRISMA 2020 — RESUMO QUANTITATIVO OFICIAL',
      '======================================================',
      '1. FASE DE IDENTIFICAÇÃO:',
      `   • Registros identificados nas buscas (Histórico): ${totalIdentificadosBases || refs.length}`,
      `   • Registros importados na biblioteca: ${refs.length}`,
      `   • Grupos duplicados pendentes de mescla: ${gruposDuplicados.length}`,
      '',
      '2. FASE DE TRIAGEM (SCREENING):',
      `   • Registros avaliados por título e resumo: ${refs.length}`,
      `   • Registros excluídos na triagem: ${descartadas.length}`,
      linhasMotivos || '  (Nenhum motivo registrado)',
      `   • Pendentes aguardando triagem ("A ler"): ${pendentesTriagem.length}`,
      '',
      '3. FASE DE ELEGIBILIDADE (ELIGIBILITY):',
      `   • Artigos em texto completo avaliados: ${consultadas.length + citadas.length}`,
      `   • Lidos na íntegra para fundamentação (Consultadas): ${consultadas.length}`,
      '',
      '4. FASE DE INCLUSÃO FINAL (INCLUDED):',
      `   • Estudos incluídos / De fato Citados no manuscrito: ${citadas.length}`,
    ].join('\n');

    window.api.sistema.copiarTexto(txt);
    avisar('Resumo PRISMA 2020 copiado para colar no Word!', 'ok');
  };

  const copiarTabelaMarkdown = () => {
    const linhas = [
      '| Fase do Fluxo PRISMA 2020 | Quantitativo (N) | Detalhes / Justificativa |',
      '| :--- | :---: | :--- |',
      `| **1. Identificação** | ${totalIdentificadosBases || refs.length} | Registros brutos retornados pelas buscas em bases |`,
      `| **1.1 Desduplicação** | ${gruposDuplicados.length} | Grupos duplicados detectados por DOI/PMID/Título |`,
      `| **2. Triagem** | ${refs.length} | Títulos e resumos submetidos a avaliação de critérios |`,
      `| **2.1 Exclusão na Triagem** | ${descartadas.length} | Excluídos com base nos critérios PICO |`,
      ...Object.entries(motivosContagem).map(([m, n]) => `| ↳ Motivo | ${n} | ${m} |`),
      `| **3. Elegibilidade** | ${consultadas.length + citadas.length} | Textos completos avaliados na íntegra |`,
      `| **3.1 Bibliografia Consultada** | ${consultadas.length} | Obras lidas como suporte teórico (não citadas diretamente) |`,
      `| **4. Inclusão Final** | **${citadas.length}** | **Estudos formalmente incluídos e citados no manuscrito** |`,
    ].join('\n');

    window.api.sistema.copiarTexto(linhas);
    avisar('Tabela Markdown do PRISMA 2020 copiada!', 'ok');
  };

  const gruposFiltrados = useMemo(() => {
    const q = normalizar(buscaDuplicatas);
    if (!q) return gruposDuplicados;
    return gruposDuplicados.filter((g) => {
      const txt = normalizar(
        g.itens.map((x) => `${x.csl?.title || ''} ${autoresResumo(x.csl)} ${x.csl?.DOI || ''}`).join(' ')
      );
      return txt.includes(q);
    });
  }, [gruposDuplicados, buscaDuplicatas]);

  return (
    <div className="central-buscadores">
      {/* Topo informativo */}
      <div className="topo-buscadores">
        <div>
          <h2>{tr('Triagem Sistemática em Duplo-Cego, Deduplicação Segura & Fluxograma PRISMA 2020', 'Double-Blind Systematic Screening, Safe Deduplication & PRISMA 2020 Flowchart')}</h2>
          <p className="subtitulo">
            {tr('Gestão metodológica completa da sua revisão: remova duplicatas sem perder notas e PDFs, faça a triagem rápida de resumos e gere o fluxograma oficial para publicação.', 'Complete methodological management for your review: remove duplicates without losing notes and PDFs, screen abstracts rapidly, and generate the official flowchart for publication.')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primario" onClick={copiarRelatorioPrisma}>
            <Icone nome="copy" tam={14} /> {tr('Copiar Relatório (.DOCX)', 'Copy Report (.DOCX)')}
          </button>
          <button className="btn secundario" onClick={copiarTabelaMarkdown}>
            <Icone nome="copy" tam={14} /> {tr('Copiar Tabela Markdown', 'Copy Markdown Table')}
          </button>
        </div>
      </div>

      {/* Stepper visual do fluxo PRISMA */}
      <div className="prisma-passos-banner">
        <div
          className={`prisma-passo-card ${aba === 'duplicatas' ? 'ativo' : ''}`}
          onClick={() => setAba('duplicatas')}
        >
          <strong>1. {tr('Desduplicação Segura', 'Safe Deduplication')}</strong>
          <span>{tr('Une cópias sem perder PDFs, anotações ou tags', 'Merges copies without losing PDFs, notes, or tags')}</span>
          <div
            className="prisma-passo-badge"
            style={{
              background: gruposDuplicados.length > 0 ? '#fef3c7' : '#dcfce7',
              color: gruposDuplicados.length > 0 ? '#92400e' : '#166534',
            }}
          >
            {gruposDuplicados.length > 0 ? `${gruposDuplicados.length} ${tr('grupos duplicados', 'duplicate groups')}` : tr('✓ 0 duplicatas', '✓ 0 duplicates')}
          </div>
        </div>

        <div
          className={`prisma-passo-card ${aba === 'triagem' ? 'ativo' : ''}`}
          onClick={() => setAba('triagem')}
        >
          <strong>2. {tr('Triagem de Títulos e Resumos (Duplo-Cego)', 'Title & Abstract Screening (Double-Blind)')}</strong>
          <span>{tr('Avalie títulos e resumos: inclua ou exclua com motivo', 'Evaluate titles and abstracts: include or exclude with reason')}</span>
          <div
            className="prisma-passo-badge"
            style={{
              background: pendentesTriagem.length > 0 ? '#dbeafe' : '#f1f5f9',
              color: pendentesTriagem.length > 0 ? '#1e40af' : '#64748b',
            }}
          >
            {pendentesTriagem.length} {tr('pendentes na fila', 'pending in queue')}
          </div>
        </div>

        <div
          className={`prisma-passo-card ${aba === 'prisma' ? 'ativo' : ''}`}
          onClick={() => setAba('prisma')}
        >
          <strong>3. {tr('Fluxograma PRISMA 2020', 'PRISMA 2020 Flowchart')}</strong>
          <span>{tr('Diagrama oficial com números consolidados para o artigo', 'Official diagram with consolidated figures for the paper')}</span>
          <div
            className="prisma-passo-badge"
            style={{
              background: '#dcfce7',
              color: '#166534',
            }}
          >
            {citadas.length} {tr('incluídas', 'included')} · {consultadas.length} {tr('lidas', 'read')}
          </div>
        </div>
      </div>

      {/* ABA 1: DETECTOR DE DUPLICATAS */}
      {aba === 'duplicatas' && (
        <div>
          {/* Banner explicativo sobre o que acontece na mescla */}
          <div className="banner-didatico-prisma">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h4 style={{ margin: 0 }}>
                🛡️ {tr('Como funciona a Deduplicação e o que acontece ao Mesclar?', 'How Deduplication works and what happens when you Merge?')}
              </h4>
              <button
                className="btn fantasma pequeno"
                onClick={() => setMostrarExplicacaoSeguranca((v) => !v)}
                style={{ padding: '2px 8px', fontSize: 11 }}
              >
                {mostrarExplicacaoSeguranca ? tr('Recolher explicação', 'Collapse explanation') : tr('Entender o que acontece', 'See what happens')}
              </button>
            </div>

            {mostrarExplicacaoSeguranca && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: '0 0 6px' }}>
                  <strong>{tr('Por que o sistema sugere mesclar?', 'Why does the system suggest merging?')}</strong>{' '}
                  {tr('Artigos importados de diferentes bases (ex.: PubMed, SciELO, Crossref) frequentemente possuem o mesmo identificador digital (DOI), código PubMed (PMID) ou título idêntico. O sistema detecta essas repetições automaticamente.', 'Articles imported from different databases (e.g., PubMed, SciELO, Crossref) often share the same DOI, PubMed ID (PMID), or identical title. The system detects these duplicates automatically.')}
                </p>
                <strong>{tr('O que acontece ao clicar em "Mesclar":', 'What happens when clicking "Merge":')}</strong>
                <ul>
                  <li><strong>{tr('Zero perda de PDFs:', 'Zero PDF loss:')}</strong> {tr('Se qualquer um dos registros possuir PDF anexo, ele é preservado e associado à obra definitiva mantida.', 'If any record has an attached PDF, it is preserved and linked to the retained master work.')}</li>
                  <li><strong>{tr('Unificação de Notas e Etiquetas:', 'Unified Notes & Tags:')}</strong> {tr('Suas anotações de leitura e tags de ambos os registros são unidas e concatenadas, nunca apagadas.', 'Your reading notes and tags from both records are merged and concatenated, never deleted.')}</li>
                  <li><strong>{tr('Preservação do Status Mais Avançado:', 'Highest Status Preserved:')}</strong> {tr('Se uma cópia estava como "A ler" e a outra já foi marcada como "Consultada" ou "Citada", o status ativo é mantido.', 'If one copy was "To Read" and another was "Consulted" or "Cited", the active status is preserved.')}</li>
                  <li><strong>{tr('Enriquecimento de Metadados:', 'Metadata Enrichment:')}</strong> {tr('Campos vazios em um registro (resumo, volume, páginas, periódico) são completados a partir do outro.', 'Missing fields in one record (abstract, volume, pages, journal) are filled from the other.')}</li>
                  <li><strong>{tr('Exclusão limpa:', 'Clean removal:')}</strong> {tr('Apenas o arquivo JSON redundante é removido do disco, mantendo seu catálogo limpo e exato.', 'Only the redundant JSON file is removed from disk, keeping your catalog clean and accurate.')}</li>
                </ul>
              </div>
            )}
          </div>

          {gruposDuplicados.length === 0 ? (
            <div className="bloco-painel" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
              <h3 style={{ margin: '0 0 6px', color: '#166534' }}>{tr('Nenhuma Duplicata Detectada!', 'No Duplicates Detected!')}</h3>
              <p style={{ color: 'var(--texto-suave)', maxWidth: 520, margin: '0 auto', fontSize: 13 }}>
                {tr('Todos os registros da sua biblioteca possuem DOIs, PMIDs e títulos únicos. Você pode prosseguir com segurança para a fase de Triagem Rápida ou consultar o Fluxograma PRISMA 2020.', 'All records in your library have unique DOIs, PMIDs, and titles. You can safely proceed to Abstract Screening or inspect the PRISMA 2020 Flowchart.')}
              </p>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 10,
                  marginBottom: 14,
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <input
                    style={{ width: 320, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--borda)' }}
                    value={buscaDuplicatas}
                    onChange={(e) => setBuscaDuplicatas(e.target.value)}
                    placeholder={tr('Filtrar duplicatas por título, autor ou DOI…', 'Filter duplicates by title, author, or DOI…')}
                  />
                  <span style={{ fontSize: 12.5, color: 'var(--texto-suave)' }}>
                    {tr('Exibindo', 'Showing')} {gruposFiltrados.length} {tr('de', 'of')} {gruposDuplicados.length} {tr('grupos', 'groups')}
                  </span>
                </div>

                <button
                  className="btn primario"
                  onClick={mesclarTodasDuplicatas}
                  disabled={processandoMescla}
                >
                  ⚡ {processandoMescla ? tr('Mesclando...', 'Merging...') : `${tr('Mesclar Todos os', 'Safely Merge All')} ${gruposDuplicados.length} ${tr('Grupos com Segurança', 'Groups')}`}
                </button>
              </div>

              {gruposFiltrados.map((g, i) => {
                const principal = g.principalSugerido;
                const criterioBadge =
                  g.criterioTipo === 'doi'
                    ? `🎯 ${tr('DOI Idêntico:', 'Identical DOI:')} ${g.criterioValor}`
                    : g.criterioTipo === 'pmid'
                    ? `🧬 ${tr('PMID Idêntico:', 'Identical PMID:')} ${g.criterioValor}`
                    : `🔤 ${tr('Título Praticamente Idêntico', 'Nearly Identical Title')}`;

                return (
                  <div key={g.id} className="card-duplicata-grupo">
                    <div className="card-duplicata-cabecalho">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="badge-criterio">{criterioBadge}</span>
                        <strong style={{ fontSize: 13.5 }}>{tr('Grupo', 'Group')} #{i + 1}: {semHtml(principal.csl?.title)}</strong>
                      </div>
                      <button
                        className="btn pequeno primario"
                        onClick={() => mesclarGrupo(g, principal)}
                        disabled={processandoMescla}
                      >
                        ✓ {tr('Mesclar', 'Merge')} {g.itens.length} {tr('cópias (Manter o mais completo)', 'copies (Keep most complete)')}
                      </button>
                    </div>

                    <div className="card-duplicata-lista">
                      {g.itens.map((r, idx) => {
                        const ehPrincipal = r.id === principal.id;
                        return (
                          <div
                            key={r.id}
                            className={`card-duplicata-item ${ehPrincipal ? 'principal' : ''}`}
                          >
                            <div style={{ flex: 1 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4, flexWrap: 'wrap' }}>
                                <span
                                  className="pill-contagem"
                                  style={{
                                    background: ehPrincipal ? '#dcfce7' : '#f1f5f9',
                                    color: ehPrincipal ? '#166534' : '#64748b',
                                    fontWeight: ehPrincipal ? 700 : 500,
                                  }}
                                >
                                  {ehPrincipal ? tr('⭐ Principal Recomendado (Mais Completo)', '⭐ Recommended Primary (Most Complete)') : `${tr('Cópia redundante', 'Redundant copy')} #${idx}`}
                                </span>
                                <code style={{ fontSize: 11, color: '#64748b' }}>{r.id}.json</code>
                                <span
                                  className="pill-contagem"
                                  style={{
                                    background: r.status === 'citada' ? '#dcfce7' : r.status === 'consultada' ? '#dbeafe' : '#f1f5f9',
                                    color: r.status === 'citada' ? '#166534' : r.status === 'consultada' ? '#1e40af' : '#475569',
                                  }}
                                >
                                  Status: {r.status === 'citada' ? tr('✓ Citada', '✓ Cited') : r.status === 'consultada' ? tr('Consultada', 'Consulted') : tr('A ler', 'To Read')}
                                </span>
                                {r.pdf ? (
                                  <span className="pill-contagem" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                                    📄 {tr('PDF Anexo', 'Attached PDF')}
                                  </span>
                                ) : (
                                  <span className="pill-contagem" style={{ background: '#f8fafc', color: '#94a3b8' }}>
                                    {tr('Sem PDF', 'No PDF')}
                                  </span>
                                )}
                                {r.notas && (
                                  <span className="pill-contagem" style={{ background: '#fef3c7', color: '#92400e' }}>
                                    📝 {tr('Com Anotações', 'With Notes')}
                                  </span>
                                )}
                              </div>

                              <div style={{ fontSize: 13, fontWeight: 600 }}>{semHtml(r.csl?.title)}</div>
                              <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 2 }}>
                                {[autoresResumo(r.csl), ano(r.csl), r.csl?.['container-title'], r.csl?.DOI ? `DOI: ${r.csl.DOI}` : '']
                                  .filter(Boolean)
                                  .join(' · ')}
                              </div>
                            </div>

                            {!ehPrincipal && (
                              <button
                                className="btn fantasma pequeno"
                                onClick={() => mesclarGrupo(g, r)}
                                title={tr('Define este registro como o principal a ser mantido em vez do sugerido automaticamente', 'Set this record as the primary record to retain instead of the auto-suggested one')}
                                style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                              >
                                {tr('Manter este em vez do outro', 'Keep this one instead')}
                              </button>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ABA 2: TRIAGEM RÁPIDA (RAYYAN STYLE) */}
      {aba === 'triagem' && (
        <div>
          <div className="banner-didatico-prisma">
            <h4 style={{ margin: '0 0 4px' }}>📋 {tr('Como operar a Triagem Rápida de Título e Resumo', 'How to operate Rapid Title & Abstract Screening')}</h4>
            <p style={{ margin: 0 }}>
              {tr(
                'Avalie cada estudo importado. Clique em "✓ Incluir (Consultada)" para aprovar para leitura integral, "★ Incluir e Citar" se já for usar diretamente na escrita, ou "✕ Excluir" selecionando o motivo para o diagrama PRISMA.',
                'Evaluate each imported study. Click "✓ Include (Consulted)" to approve for full-text reading, "★ Include & Cite" if ready to cite directly, or "✕ Exclude" choosing the reason for the PRISMA flowchart.'
              )}
            </p>
          </div>

          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: 10,
              marginBottom: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                style={{ width: 340, padding: '6px 12px', borderRadius: 6, border: '1px solid var(--borda)' }}
                value={buscaTriagem}
                onChange={(e) => setBuscaTriagem(e.target.value)}
                placeholder={tr('Buscar por termo no título, autor ou resumo…', 'Search by term in title, author, or abstract…')}
              />
              <span style={{ fontSize: 12.5, color: 'var(--texto-suave)' }}>
                {pendentesTriagem.length} {tr('artigos aguardando triagem', 'papers awaiting screening')}
              </span>
            </div>

            <label className="campo-inline" style={{ margin: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>{tr('Motivo padrão ao Excluir:', 'Default Exclusion Reason:')}</span>
              <select
                value={motivoPadrao}
                onChange={(e) => setMotivoPadrao(e.target.value)}
                style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--borda)' }}
              >
                {MOTIVOS_EXCLUSAO.map((m) => (
                  <option key={m} value={m}>
                    {m}
                  </option>
                ))}
              </select>
            </label>
          </div>

          {pendentesTriagem.length === 0 ? (
            <div className="bloco-painel" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
              <h3 style={{ margin: '0 0 6px', color: '#166534' }}>{tr('Fila de Triagem Vazia!', 'Screening Queue Empty!')}</h3>
              <p style={{ color: 'var(--texto-suave)', maxWidth: 500, margin: '0 auto', fontSize: 13 }}>
                {tr('Todos os artigos da biblioteca já foram triados (como Consultados, Citados ou Descartados com justificativa).', 'All library articles have already been screened (as Consulted, Cited, or Excluded with reason).')}
              </p>
            </div>
          ) : (
            <div className="lista-artigos-inline">
              {pendentesTriagem.map((r) => {
                const temResumo = Boolean(r.csl?.abstract);
                const aberto = resumosAbertos.has(r.id);

                return (
                  <div key={r.id} className="card-historico">
                    <div className="card-historico-topo">
                      <div style={{ flex: 1, paddingRight: 10 }}>
                        <h4 style={{ margin: '0 0 4px 0', fontSize: 14 }}>{semHtml(r.csl?.title)}</h4>
                        <div className="sub-meta">
                          {[autoresResumo(r.csl), ano(r.csl), r.csl?.['container-title'], r.csl?.DOI ? `DOI: ${r.csl.DOI}` : '']
                            .filter(Boolean)
                            .join(' · ')}
                        </div>
                      </div>

                      <div className="item-artigo-acoes" style={{ display: 'flex', gap: 6 }}>
                        <button
                          className="btn pequeno primario"
                          onClick={() => {
                            onAtualizarRef(r.id, { status: 'consultada' });
                            avisar(tr('Artigo incluído como "Consultada" (para leitura integral)!', 'Article included as "Consulted" (for full-text reading)!'), 'ok');
                          }}
                        >
                          ✓ {tr('Incluir (Consultada)', 'Include (Consulted)')}
                        </button>
                        <button
                          className="btn pequeno secundario"
                          onClick={() => {
                            onAtualizarRef(r.id, { status: 'citada' });
                            avisar(tr('Artigo marcado para citação direta!', 'Article marked for direct citation!'), 'ok');
                          }}
                        >
                          ★ {tr('Incluir e Citar', 'Include & Cite')}
                        </button>
                        <button
                          className="btn pequeno perigo"
                          onClick={() => {
                            onAtualizarRef(r.id, { status: 'descartada', motivoExclusao: motivoPadrao });
                            avisar(`${tr('Artigo excluído:', 'Article excluded:')} "${motivoPadrao}"`, 'info');
                          }}
                          title={`${tr('Exclui registrando o motivo:', 'Exclude recording reason:')} "${motivoPadrao}"`}
                        >
                          ✕ {tr('Excluir', 'Exclude')} ({motivoPadrao.split(' ')[0]}…)
                        </button>
                      </div>
                    </div>

                    {temResumo && (
                      <div style={{ marginTop: 8 }}>
                        <p
                          style={{
                            margin: 0,
                            fontSize: 12.5,
                            lineHeight: 1.5,
                            color: 'var(--texto)',
                            display: aberto ? 'block' : '-webkit-box',
                            WebkitLineClamp: aberto ? 'unset' : 3,
                            WebkitBoxOrient: 'vertical',
                            overflow: 'hidden',
                          }}
                        >
                          {r.csl.abstract}
                        </p>
                        <button
                          className="btn fantasma pequeno"
                          onClick={() => toggleResumo(r.id)}
                          style={{ padding: '2px 0', fontSize: 11, color: '#2563eb', marginTop: 3 }}
                        >
                          {aberto ? tr('▲ Recolher Resumo', '▲ Collapse Abstract') : tr('▼ Ler Resumo Completo', '▼ Read Full Abstract')}
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ABA 3: FLUXOGRAMA PRISMA 2020 */}
      {aba === 'prisma' && (
        <div>
          <div className="banner-didatico-prisma">
            <h4 style={{ margin: '0 0 4px' }}>📊 {tr('Fluxograma Oficial PRISMA 2020 (Page et al., 2021)', 'Official PRISMA 2020 Flowchart (Page et al., 2021)')}</h4>
            <p style={{ margin: 0 }}>
              {tr('Este diagrama reflete com exatidão as 4 etapas da sua revisão sistemática. Use os botões no topo para copiar o relatório quantitativo e colá-lo pronto no Word ou Markdown.', 'This diagram accurately reflects the 4 stages of your systematic review. Use the top buttons to copy the quantitative report and paste it into Word or Markdown.')}
            </p>
          </div>

          <div className="prisma-diagrama">
            {/* ETAPA 1: IDENTIFICAÇÃO */}
            <div style={{ width: '100%', textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              1. {tr('Fase de Identificação', 'Identification Phase')}
            </div>
            <div className="prisma-etapa-linha">
              <div className="prisma-caixa">
                <h5>{tr('Registros identificados nas buscas em bases de dados', 'Records identified from database searches')}</h5>
                <div className="prisma-numero">{(totalIdentificadosBases || refs.length).toLocaleString('pt-BR')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 4 }}>
                  {tr('Histórico de buscas em bases (PubMed, Scopus, SciELO, etc.)', 'Database search history (PubMed, Scopus, SciELO, etc.)')}
                </div>
              </div>

              <div className="prisma-seta-lado">➔</div>

              <div className="prisma-caixa exclusao">
                <h5>{tr('Duplicatas removidas antes da triagem', 'Duplicate records removed before screening')}</h5>
                <div className="prisma-numero">{gruposDuplicados.length} {tr('grupos detectados', 'groups detected')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 4 }}>
                  {gruposDuplicados.length === 0 ? tr('✓ Biblioteca 100% deduplicada', '✓ Library 100% deduplicated') : tr('Aguardando mescla segura na Aba 1', 'Awaiting safe merge in Tab 1')}
                </div>
              </div>
            </div>

            <div className="prisma-seta-baixo">↓</div>

            {/* ETAPA 2: TRIAGEM */}
            <div style={{ width: '100%', textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 }}>
              2. {tr('Fase de Triagem (Screening)', 'Screening Phase')}
            </div>
            <div className="prisma-etapa-linha">
              <div className="prisma-caixa">
                <h5>{tr('Registros triados por título e resumo', 'Records screened by title & abstract')}</h5>
                <div className="prisma-numero">{refs.length.toLocaleString('pt-BR')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 4 }}>
                  {pendentesTriagem.length > 0 ? `(${pendentesTriagem.length} ${tr('pendentes na fila de triagem', 'pending in screening queue')})` : tr('✓ Triagem de resumos concluída', '✓ Abstract screening completed')}
                </div>
              </div>

              <div className="prisma-seta-lado">➔</div>

              <div className="prisma-caixa exclusao">
                <h5>{tr('Registros excluídos na triagem', 'Records excluded during screening')}</h5>
                <div className="prisma-numero">{descartadas.length} {tr('artigos', 'records')}</div>
                <div style={{ marginTop: 6, fontSize: 11.5 }}>
                  {Object.entries(motivosContagem).length === 0 ? (
                    <span style={{ color: 'var(--texto-suave)' }}>{tr('Nenhuma exclusão registrada ainda', 'No exclusions recorded yet')}</span>
                  ) : (
                    Object.entries(motivosContagem).map(([mot, n]) => (
                      <div key={mot} style={{ marginBottom: 2 }}>
                        • {mot}: <strong>{n}</strong>
                      </div>
                    ))
                  )}
                </div>
              </div>
            </div>

            <div className="prisma-seta-baixo">↓</div>

            {/* ETAPA 3: ELEGIBILIDADE */}
            <div style={{ width: '100%', textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 }}>
              3. {tr('Fase de Elegibilidade (Texto Completo)', 'Eligibility Phase (Full Text)')}
            </div>
            <div className="prisma-etapa-linha">
              <div className="prisma-caixa">
                <h5>{tr('Artigos em texto completo avaliados para elegibilidade', 'Full-text articles assessed for eligibility')}</h5>
                <div className="prisma-numero">{(consultadas.length + citadas.length).toLocaleString('pt-BR')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 4 }}>
                  {tr('Leitura na íntegra do PDF do artigo', 'Full-text PDF reading')}
                </div>
              </div>

              <div className="prisma-seta-lado">➔</div>

              <div className="prisma-caixa">
                <h5>{tr('Bibliografia Consultada (Leitura Integral)', 'Consulted Bibliography (Full Reading)')}</h5>
                <div className="prisma-numero" style={{ color: '#2563eb' }}>{consultadas.length} {tr('artigos', 'records')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 4 }}>
                  {tr('Lidos como suporte teórico, sem citação direta no texto', 'Read as background support, without direct in-text citation')}
                </div>
              </div>
            </div>

            <div className="prisma-seta-baixo">↓</div>

            {/* ETAPA 4: INCLUSÃO FINAL */}
            <div style={{ width: '100%', textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 }}>
              4. {tr('Fase de Inclusão Final', 'Final Inclusion Phase')}
            </div>
            <div className="prisma-caixa inclusao" style={{ width: '100%', maxWidth: 520 }}>
              <h5 style={{ color: '#065f46', fontSize: 14 }}>
                🏆 {tr('Estudos incluídos na síntese qualitativa / Citados no manuscrito', 'Studies included in qualitative synthesis / Cited in manuscript')}
              </h5>
              <div className="prisma-numero">{citadas.length} {tr('estudos finais', 'final studies')}</div>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#047857' }}>
                {tr('Estes são os artigos com status Citada, exportados automaticamente para a seção de Referências no seu Word.', 'These are the articles marked Cited, automatically exported to the References section in your Word document.')}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
