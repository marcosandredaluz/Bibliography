import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Modal, Icone } from './ui.jsx';
import { autoresResumo, ano, semHtml, normalizar } from '../lib/csl.js';

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
      ? 'Solicitado pela aba "Bibliografia Forense" dentro do Microsoft Word'
      : requisicao?.origem === 'hotkey'
      ? 'Atalho rápido Ctrl+Shift+B — injeta campo protegido direto no cursor do Word'
      : 'Seletor rápido estilo Zotero (injeta campo protegido no Word aberto)';

  return (
    <Modal titulo="⚡ Inserir Citação Rápida no Microsoft Word" onFechar={onCancelar} largura={660}>
      <div className="form-vertical" onKeyDown={handleKeyDown}>
        <div style={{ fontSize: 12.5, color: '#475569', background: '#eff6ff', border: '1px solid #bfdbfe', padding: '7px 10px', borderRadius: 6, marginBottom: 10 }}>
          <strong>Origem:</strong> {origemLabel}
        </div>

        <div className="grade-3" style={{ marginBottom: 8 }}>
          <label className="campo" style={{ gridColumn: 'span 2' }}>
            <span className="campo-rotulo">Buscar referência (autor, título, ano ou tag)</span>
            <input
              ref={inputBuscaRef}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Digite para filtrar e clique para selecionar 1 ou mais obras…"
            />
          </label>
          <label className="campo">
            <span className="campo-rotulo">Página(s) (opcional)</span>
            <input
              value={pagina}
              onChange={(e) => setPagina(e.target.value)}
              placeholder="Ex.: 45 ou 12-15"
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 10, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}>
            <span>Norma:</span>
            <select value={estiloSel} onChange={(e) => setEstiloSel(e.target.value)} style={{ padding: '4px 8px' }}>
              {estilos.map((e) => (
                <option key={e.id} value={e.id}>{e.nome}</option>
              ))}
            </select>
          </label>
          <span style={{ fontSize: 12, color: '#1d4ed8', fontWeight: 600 }}>
            {selecionadasIds.length} obra(s) selecionada(s) {selecionadasIds.length >= 2 ? '→ Citação composta' : ''}
          </span>
        </div>

        <div style={{ maxHeight: 280, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8, padding: 6, background: '#f8fafc', display: 'grid', gap: 5 }}>
          {resultados.length === 0 ? (
            <div style={{ padding: 14, textAlign: 'center', color: '#64748b' }}>Nenhuma referência encontrada.</div>
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
                        {semHtml(r.csl?.title || '(Sem título)')}
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
                    Citar
                  </button>
                </div>
              );
            })
          )}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, gap: 10 }}>
          <span style={{ fontSize: 11.5, color: '#64748b' }}>
            Dica: duplo clique cita na hora; marque 2+ obras e clique abaixo para citação múltipla.
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn fantasma" onClick={onCancelar} disabled={enviando}>
              Cancelar (Esc)
            </button>
            <button
              type="button"
              className="btn primario"
              disabled={enviando || (selecionadasIds.length === 0 && resultados.length === 0)}
              onClick={() => confirmarEnvio()}
            >
              <Icone nome="copy" tam={13} />{' '}
              {enviando
                ? 'Inserindo no Word…'
                : selecionadasIds.length > 0
                ? `Inserir ${selecionadasIds.length} no Word (Ctrl+Enter)`
                : 'Inserir 1ª da Lista no Word'}
            </button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
