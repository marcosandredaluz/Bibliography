import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Icone } from './ui.jsx';
import { autoresResumo, ano, semHtml, normalizar } from '../lib/csl.js';
import { useI18n } from '../i18n.jsx';

/**
 * Seletor Rápido de Citação (Estilo Zotero Quick Format)
 * Acionado pelo botão da aba do Word (`Ribbon_InserirCitacao`), pelo atalho global `Ctrl+Shift+B`
 * ou diretamente pelo app para injetar campo dinâmico protegido (`wdFieldAddin`) no cursor do Word.
 */
export default function WordQuickCitatorModal({
  aberto,
  requisicao = {},
  refs = [],
  estilo,
  estilos = [],
  idioma,
  onConfirmar,
  onCancelar,
}) {
  const { tr } = useI18n();
  const [busca, setBusca] = useState('');
  const [pagina, setPagina] = useState('');
  const [estiloSel, setEstiloSel] = useState(estilo || 'abnt');
  const [selecionadasIds, setSelecionadasIds] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const inputBuscaRef = useRef(null);

  useEffect(() => {
    if (!aberto) return;
    setBusca(requisicao?.termo || '');
    setPagina('');
    setEstiloSel(estilo || 'abnt');
    setSelecionadasIds([]);
    setEnviando(false);
    setTimeout(() => inputBuscaRef.current?.focus(), 60);
  }, [aberto, requisicao?.termo, estilo]);

  const resultados = useMemo(() => {
    const q = normalizar(busca).trim();
    const validas = refs.filter((r) => r.status !== 'descartada');
    if (!q) return validas.slice(0, 30);
    return validas
      .filter((r) => normalizar(`${r.csl?.title || ''} ${autoresResumo(r.csl)} ${ano(r.csl)} ${(r.tags || []).join(' ')}`).includes(q))
      .slice(0, 35);
  }, [refs, busca]);

  if (!aberto) return null;

  const toggleId = (id) => {
    setSelecionadasIds((ant) => (ant.includes(id) ? ant.filter((x) => x !== id) : [...ant, id]));
  };

  const confirmarEnvio = async (idsParaEnviar) => {
    const alvos = idsParaEnviar?.length ? idsParaEnviar : selecionadasIds;
    if (!alvos.length && resultados[0]) {
      alvos.push(resultados[0].id);
    }
    if (!alvos.length || enviando) return;
    setEnviando(true);
    try {
      await onConfirmar({
        origem: requisicao?.origem || 'app',
        ids: alvos,
        pagina: pagina.trim(),
        estilo: estiloSel,
        idioma,
      });
    } finally {
      setEnviando(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onCancelar();
    } else if (e.key === 'Enter' && (e.ctrlKey || selecionadasIds.length > 0 || resultados.length === 1)) {
      e.preventDefault();
      confirmarEnvio();
    }
  };

  const origemLabel =
    requisicao?.origem === 'word_ribbon'
      ? tr('Solicitado pela aba "Bibliografia Forense" dentro do Microsoft Word', 'Triggered from the "Bibliografia Forense" Ribbon tab in Microsoft Word')
      : requisicao?.origem === 'hotkey'
      ? tr('Atalho rápido Ctrl+Shift+B — injeta campo protegido direto no cursor do Word', 'Global hotkey Ctrl+Shift+B — injects protected field at Word cursor')
      : tr('Seletor rápido estilo Zotero (injeta campo protegido no Word aberto)', 'Zotero-style Quick Citator (injects protected field into active Word document)');

  return (
    <Modal titulo={tr('⚡ Inserir Citação Rápida no Microsoft Word', '⚡ Quick Citation Picker for Microsoft Word')} onFechar={onCancelar} largura={660}>
      <div className="form-vertical" onKeyDown={handleKeyDown}>
        <div style={{ fontSize: 12.5, color: '#475569', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '7px 10px', borderRadius: 6, marginBottom: 10 }}>
          <strong>{tr('Origem:', 'Source:')}</strong> {origemLabel}
        </div>

        <div className="grade-3" style={{ marginBottom: 8 }}>
          <label className="campo" style={{ gridColumn: 'span 2' }}>
            <span className="campo-rotulo">{tr('Buscar referência (autor, título, ano ou tag)', 'Search reference (author, title, year, or tag)')}</span>
            <input
              ref={inputBuscaRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder={tr('Digite para filtrar e clique para selecionar 1 ou mais obras…', 'Type to filter and select one or more items…')}
            />
          </label>
          <label className="campo">
            <span className="campo-rotulo">{tr('Página(s) (opcional)', 'Page(s) (optional)')}</span>
            <input
              value={pagina}
              onChange={(e) => setPagina(e.target.value)}
              placeholder={tr('Ex.: 45 ou 12-15', 'e.g., 45 or 12-15')}
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span>{tr('Norma:', 'Style:')}</span>
            <select value={estiloSel} onChange={(e) => setEstiloSel(e.target.value)} style={{ padding: '4px 8px' }}>
              {estilos.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </label>
          <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
            {selecionadasIds.length} {tr('obra(s) selecionada(s)', 'item(s) selected')} {selecionadasIds.length >= 2 ? tr('→ Citação composta', '→ Combined citation') : ''}
          </span>
        </div>

        <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 6, background: '#f8fafc', display: 'grid', gap: 5 }}>
          {resultados.length === 0 ? (
            <div style={{ padding: 14, textAlign: 'center', color: '#64748b' }}>{tr('Nenhuma referência encontrada.', 'No matching references found.')}</div>
          ) : (
            resultados.map((r) => {
              const marcada = selecionadasIds.includes(r.id);
              return (
                <div
                  key={r.id}
                  onClick={() => toggleId(r.id)}
                  onDoubleClick={() => confirmarEnvio([r.id])}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 10,
                    padding: '7px 10px',
                    borderRadius: 6,
                    cursor: 'pointer',
                    background: marcada ? '#dbeafe' : '#ffffff',
                    border: marcada ? '1px solid #3b82f6' : '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <input type="checkbox" checked={marcada} readOnly />
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {semHtml(r.csl?.title || tr('(Sem título)', '(Untitled)'))}
                      </div>
                      <div style={{ fontSize: 11.5, color: '#64748b' }}>
                        <strong>{[autoresResumo(r.csl), ano(r.csl)].filter(Boolean).join(', ')}</strong>
                        {r.csl?.['container-title'] ? ` · ${r.csl['container-title']}` : ''}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn pequeno primario"
                    onClick={(ev) => {
                      ev.stopPropagation();
                      confirmarEnvio([r.id]);
                    }}
                    disabled={enviando}
                  >
                    {tr('Citar', 'Cite')}
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10 }}>
          <span style={{ fontSize: 11.5, color: '#64748b' }}>
            {tr('Dica: duplo clique cita na hora; marque 2+ obras e clique abaixo para citação múltipla.', 'Tip: double-click inserts immediately; check 2+ items for multi-citation.')}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn fantasma" onClick={onCancelar} disabled={enviando}>
              {tr('Cancelar (Esc)', 'Cancel (Esc)')}
            </button>
            <button
              type="button"
              className="btn primario"
              disabled={enviando || (selecionadasIds.length === 0 && resultados.length === 0)}
              onClick={() => confirmarEnvio()}
            >
              <Icone nome="copy" tam={13} />{' '}
              {enviando
                ? tr('Inserindo no Word…', 'Inserting into Word…')
                : selecionadasIds.length > 0
                ? tr(`Inserir ${selecionadasIds.length} no Word (Ctrl+Enter)`, `Insert ${selecionadasIds.length} in Word (Ctrl+Enter)`)
                : tr('Inserir 1ª da Lista no Word', 'Insert First Match in Word')}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
