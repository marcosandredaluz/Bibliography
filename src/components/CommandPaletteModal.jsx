import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Icone } from './ui.jsx';

export default function CommandPaletteModal({
  aberto,
  aoFechar,
  refs = [],
  onNavegarAba,
  onAbrirPdf,
  onSelecionarRef,
  onAbrirExportarWord,
  onVerificarIntegridade,
  onPadronizarPdfs,
  onMudarEstilo,
  estiloAtual,
}) {
  const [busca, setBusca] = useState('');
  const [indiceFoco, setIndiceFoco] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (aberto) {
      setBusca('');
      setIndiceFoco(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [aberto]);

  // Lista base de comandos do sistema
  const acoesEstaticas = useMemo(
    () => [
      {
        id: 'auditoria',
        tipo: 'comando',
        icone: 'search',
        titulo: 'Auditoria Forense de Manuscrito (Anti-IA, Anti-Plágio & Páginas)',
        categoria: 'Navegação',
        executar: () => onNavegarAba('auditoria'),
      },
      {
        id: 'exportar_word',
        tipo: 'comando',
        icone: 'file',
        titulo: 'Exportar Citações & Bibliografia para Word (ABNT / Vancouver)',
        categoria: 'Word & Citações',
        executar: onAbrirExportarWord,
      },
      {
        id: 'integridade_jabref',
        tipo: 'comando',
        icone: 'settings',
        titulo: '🛡️ Verificador de Integridade Bibliográfica do Catálogo (JabRef)',
        categoria: 'Ferramentas JabRef',
        executar: onVerificarIntegridade,
      },
      {
        id: 'padronizar_pdfs',
        tipo: 'comando',
        icone: 'folder',
        titulo: '📁 Padronizar Nomes de Todos os PDFs da Pasta (JabRef)',
        categoria: 'Ferramentas JabRef',
        executar: onPadronizarPdfs,
      },
      {
        id: 'buscadores',
        tipo: 'comando',
        icone: 'search',
        titulo: 'Buscadores Científicos (PubMed, SciELO, CAPES, Periódicos)',
        categoria: 'Navegação',
        executar: () => onNavegarAba('buscadores'),
      },
      {
        id: 'biblioteca',
        tipo: 'comando',
        icone: 'library',
        titulo: 'Ir para a Tabela da Biblioteca Principal',
        categoria: 'Navegação',
        executar: () => onNavegarAba('biblioteca'),
      },
      {
        id: 'estilo_abnt',
        tipo: 'comando',
        icone: 'file',
        titulo: 'Mudar Estilo Ativo para ABNT (NBR 6023/10520)',
        subtitulo: estiloAtual?.includes('abnt') ? '✓ Atualmente selecionado' : '',
        categoria: 'Estilos Bibliográficos',
        executar: () => onMudarEstilo('abnt-ipea'),
      },
      {
        id: 'estilo_vancouver',
        tipo: 'comando',
        icone: 'file',
        titulo: 'Mudar Estilo Ativo para Vancouver (Numérico)',
        subtitulo: estiloAtual?.includes('vancouver') ? '✓ Atualmente selecionado' : '',
        categoria: 'Estilos Bibliográficos',
        executar: () => onMudarEstilo('vancouver'),
      },
    ],
    [onNavegarAba, onAbrirExportarWord, onVerificarIntegridade, onPadronizarPdfs, onMudarEstilo, estiloAtual]
  );

  // Filtra comandos e artigos pelo termo digitado
  const resultados = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return acoesEstaticas;

    const comandosFiltrados = acoesEstaticas.filter(
      (c) => c.titulo.toLowerCase().includes(q) || c.categoria.toLowerCase().includes(q)
    );

    // Busca rápida nos artigos da biblioteca
    const artigosFiltrados = refs
      .filter((r) => {
        const tit = (r.csl?.title || '').toLowerCase();
        const aut = (r.csl?.author?.[0]?.family || r.csl?.author?.[0]?.literal || '').toLowerCase();
        const ano = String(r.csl?.issued?.['date-parts']?.[0]?.[0] || '');
        return tit.includes(q) || aut.includes(q) || ano.includes(q);
      })
      .slice(0, 8)
      .map((r) => ({
        id: `ref_${r.id}`,
        tipo: 'artigo',
        icone: r.pdf ? 'file' : 'search',
        titulo: r.csl?.title || 'Artigo sem título',
        subtitulo: `${r.csl?.author?.[0]?.family || 'Autor'} (${r.csl?.issued?.['date-parts']?.[0]?.[0] || 'S/D'}) · ${r.pdf ? '📄 Tem PDF' : 'Sem PDF'}`,
        categoria: 'Artigos no Acervo',
        executar: () => {
          onSelecionarRef(r.id);
          onNavegarAba('biblioteca');
          if (r.pdf) onAbrirPdf(r);
        },
      }));

    return [...comandosFiltrados, ...artigosFiltrados];
  }, [busca, acoesEstaticas, refs, onSelecionarRef, onNavegarAba, onAbrirPdf]);

  const executarItem = (item) => {
    if (!item) return;
    aoFechar();
    item.executar();
  };

  const aoKeyDown = (e) => {
    if (e.key === 'Escape') {
      aoFechar();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setIndiceFoco((ant) => (ant + 1) % Math.max(resultados.length, 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setIndiceFoco((ant) => (ant - 1 + resultados.length) % Math.max(resultados.length, 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (resultados[indiceFoco]) executarItem(resultados[indiceFoco]);
    }
  };

  if (!aberto) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(15, 23, 42, 0.65)',
        backdropFilter: 'blur(4px)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
        paddingTop: '12vh',
      }}
      onClick={aoFechar}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 620,
          background: 'var(--painel)',
          borderRadius: 12,
          boxShadow: '0 20px 50px rgba(0, 0, 0, 0.35)',
          border: '1px solid var(--borda)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          animation: 'modalSurgir 0.15s ease-out',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '12px 16px',
            borderBottom: '1px solid var(--borda)',
            gap: 10,
          }}
        >
          <Icone nome="search" tam={18} style={{ color: 'var(--texto-suave)' }} />
          <input
            ref={inputRef}
            type="text"
            placeholder="Digite um comando, título ou autor… (↑↓ navega · Enter executa · Esc fecha)"
            value={busca}
            onChange={(e) => {
              setBusca(e.target.value);
              setIndiceFoco(0);
            }}
            onKeyDown={aoKeyDown}
            style={{
              flex: 1,
              border: 'none',
              outline: 'none',
              background: 'transparent',
              fontSize: 14.5,
              color: 'var(--texto)',
            }}
          />
          <span
            style={{
              fontSize: 11,
              padding: '2px 6px',
              borderRadius: 4,
              background: 'var(--fundo)',
              border: '1px solid var(--borda)',
              color: 'var(--texto-suave)',
              fontWeight: 700,
            }}
          >
            ESC
          </span>
        </div>

        <div style={{ maxHeight: 380, overflowY: 'auto', padding: '6px 0' }}>
          {resultados.length === 0 ? (
            <div style={{ padding: '24px 16px', textAlign: 'center', color: 'var(--texto-suave)', fontSize: 13 }}>
              Nenhum comando ou artigo encontrado para "{busca}".
            </div>
          ) : (
            resultados.map((item, idx) => {
              const focado = idx === indiceFoco;
              return (
                <div
                  key={item.id}
                  onClick={() => executarItem(item)}
                  onMouseEnter={() => setIndiceFoco(idx)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '8px 16px',
                    cursor: 'pointer',
                    background: focado ? 'rgba(37, 99, 235, 0.12)' : 'transparent',
                    borderLeft: focado ? '3px solid #2563eb' : '3px solid transparent',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
                    <Icone
                      nome={item.icone}
                      tam={16}
                      style={{ color: focado ? '#2563eb' : 'var(--texto-suave)', flexShrink: 0 }}
                    />
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div
                        style={{
                          fontSize: 13.2,
                          fontWeight: focado ? 600 : 500,
                          color: 'var(--texto)',
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {item.titulo}
                      </div>
                      {item.subtitulo && (
                        <div
                          style={{
                            fontSize: 11.5,
                            color: 'var(--texto-suave)',
                            whiteSpace: 'nowrap',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                          }}
                        >
                          {item.subtitulo}
                        </div>
                      )}
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: 11,
                      color: 'var(--texto-suave)',
                      marginLeft: 12,
                      flexShrink: 0,
                      opacity: 0.8,
                    }}
                  >
                    {item.categoria}
                  </span>
                </div>
              );
            })
          )}
        </div>

        <div
          style={{
            padding: '8px 16px',
            background: 'var(--fundo)',
            borderTop: '1px solid var(--borda)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            fontSize: 11.5,
            color: 'var(--texto-suave)',
          }}
        >
          <span>Paperlib Command Palette · <strong>Ctrl+K</strong></span>
          <span>
            Pressione <strong>Enter</strong> para selecionar
          </span>
        </div>
      </div>
    </div>
  );
}
