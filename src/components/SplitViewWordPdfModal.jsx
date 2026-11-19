import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { autoresResumo, ano, semHtml } from '../lib/csl.js';
import { useI18n } from '../i18n.jsx';

export default function SplitViewWordPdfModal({
  dadosComparacao, // { refItem, paginaInicial, fraseWord, paragrafoCompleto, locWord, diagnostico, trechoPdf }
  onFechar,
  onAbrirEditorResolucao,
  onAbrirNoWord,
  onAbrirPdfLeitor,
  onSalvarTrechoCitado,
  somenteLeitura = false,
  onMarcarResolvido,
  onMarcarIgnorado,
}) {
  const { tr } = useI18n();
  const canvasRef = useRef(null);
  const textLayerRef = useRef(null);

  const refItem = dadosComparacao?.refItem;
  const [docPdf, setDocPdf] = useState(null);
  const [numPaginas, setNumPaginas] = useState(0);
  const [paginaAtual, setPaginaAtual] = useState(Number(dadosComparacao?.paginaInicial) || 1);
  const [escala, setEscala] = useState(1.15);
  const [carregandoPdf, setCarregandoPdf] = useState(true);
  const [erroPdf, setErroPdf] = useState('');
  const [termoBuscaPdf, setTermoBuscaPdf] = useState('');
  const [resultadosBusca, setResultadosBusca] = useState([]); // [{ pagina, trecho }]
  const [buscandoNoPdf, setBuscandoNoPdf] = useState(false);
  const [salvandoTrecho, setSalvandoTrecho] = useState(false);
  const [trechoSalvoOk, setTrechoSalvoOk] = useState(false);

  // Carrega o PDF via IPC
  useEffect(() => {
    if (!refItem?.id) {
      setCarregandoPdf(false);
      setErroPdf('Esta referência não possui PDF anexado na biblioteca.');
      return;
    }
    let cancelado = false;
    setCarregandoPdf(true);
    setErroPdf('');
    (async () => {
      try {
        const bytes = await window.api.bib.lerPdfBytes(refItem.id);
        if (cancelado) return;
        const dados = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes || []);
        const tarefa = pdfjs.getDocument({ data: dados, isEvalSupported: false });
        const d = await tarefa.promise;
        if (cancelado) {
          try { if (typeof d?.destroy === 'function') await d.destroy(); } catch {}
          return;
        }
        setDocPdf(d);
        setNumPaginas(d.numPages);
        const pagAlvo = Math.min(Math.max(1, Number(dadosComparacao?.paginaInicial) || 1), d.numPages);
        setPaginaAtual(pagAlvo);
      } catch (e) {
        if (!cancelado) setErroPdf(e.message || 'Erro ao carregar PDF');
      } finally {
        if (!cancelado) setCarregandoPdf(false);
      }
    })();
    return () => { cancelado = true; };
  }, [refItem?.id]);

  // Renderiza página atual no canvas
  useEffect(() => {
    if (!docPdf || !canvasRef.current) return;
    let cancelado = false;
    (async () => {
      try {
        const pag = await docPdf.getPage(paginaAtual);
        if (cancelado) return;
        const vp = pag.getViewport({ scale: escala });
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        canvas.width = vp.width;
        canvas.height = vp.height;
        await pag.render({ canvasContext: ctx, viewport: vp }).promise;

        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = '';
          textLayerRef.current.style.width = `${vp.width}px`;
          textLayerRef.current.style.height = `${vp.height}px`;
          const txt = await pag.getTextContent();
          if (!cancelado) {
            try {
              const tl = new pdfjs.TextLayer({
                textContentSource: txt,
                container: textLayerRef.current,
                viewport: vp,
              });
              await tl.render();
            } catch {}
          }
        }
      } catch (e) {
        console.error('Erro ao renderizar PDF no SplitView:', e);
      }
    })();
    return () => { cancelado = true; };
  }, [docPdf, paginaAtual, escala]);

  const buscarPalavraNoPdf = async (e) => {
    e?.preventDefault();
    const q = termoBuscaPdf.trim().toLowerCase();
    if (!q || !docPdf) return;
    setBuscandoNoPdf(true);
    const achados = [];
    try {
      for (let i = 1; i <= docPdf.numPages; i++) {
        const pag = await docPdf.getPage(i);
        const txt = await pag.getTextContent();
        const bruto = txt.items.map((it) => it.str).join(' ');
        const idx = bruto.toLowerCase().indexOf(q);
        if (idx !== -1) {
          const ini = Math.max(0, idx - 55);
          const fim = Math.min(bruto.length, idx + q.length + 85);
          achados.push({
            pagina: i,
            trecho: (ini > 0 ? '…' : '') + bruto.slice(ini, fim) + (fim < bruto.length ? '…' : ''),
          });
        }
      }
      setResultadosBusca(achados);
      if (achados.length > 0) {
        setPaginaAtual(achados[0].pagina);
      }
    } catch {}
    setBuscandoNoPdf(false);
  };

  if (!dadosComparacao) return null;

  const tituloRef = semHtml(refItem?.csl?.title) || dadosComparacao.tituloObra || 'Obra Citada';
  const autorAno = refItem ? `${autoresResumo(refItem.csl)} (${ano(refItem.csl)})` : (dadosComparacao.autorAno || '');

  return (
    <div
      className="overlay-modal"
      style={{ zIndex: 450, background: 'rgba(15, 23, 42, 0.72)', padding: 16 }}
      onClick={onFechar}
    >
      <div
        className="caixa-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '96vw',
          maxWidth: 1460,
          height: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 10,
        }}
      >
        {/* Cabeçalho do Split View */}
        <header
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '10px 16px',
            background: 'var(--painel)',
            borderBottom: '1px solid var(--borda)',
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <strong style={{ fontSize: 14.5, color: 'var(--texto)' }}>
                ⚖️ {tr('Comparador Lado a Lado: Seu Manuscrito Word ↔ Artigo Original (PDF)', 'Side-by-Side Comparator: Your Word Manuscript ↔ Original Article (PDF)')}
              </strong>
              <span
                className="tag-mini"
                style={{ background: 'rgba(13, 148, 136, 0.12)', color: '#0f766e', border: '1px solid rgba(13, 148, 136, 0.3)', fontWeight: 700 }}
              >
                🔗 {tr('Cruzamento Forense', 'Forensic Cross-Check')}
              </span>
            </div>
            <div style={{ fontSize: 12, color: 'var(--texto-suave)', marginTop: 2 }}>
              <strong>{tr('Obra de Referência:', 'Reference Work:')}</strong> {autorAno} — {tituloRef}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
            {onAbrirPdfLeitor && refItem?.id && (
              <button
                type="button"
                className="btn pequeno secundario"
                onClick={() => {
                  onFechar();
                  onAbrirPdfLeitor(refItem, paginaAtual);
                }}
                title={tr('Abrir este PDF completo no leitor interno direto nesta página', 'Open full PDF in internal reader at this page')}
              >
                📄 {tr(`Abrir PDF (Pág. ${paginaAtual})`, `Open PDF (P. ${paginaAtual})`)}
              </button>
            )}
            {onAbrirEditorResolucao && (
              <button
                type="button"
                className="btn pequeno primario"
                onClick={() => {
                  onFechar();
                  onAbrirEditorResolucao();
                }}
              >
                🛠️ {tr('Editar / Corrigir Texto', 'Edit / Fix Text')}
              </button>
            )}
            {onAbrirNoWord && (
              <button
                type="button"
                className="btn pequeno secundario"
                onClick={onAbrirNoWord}
              >
                📂 {tr('Ir para o Ponto no Word', 'Go to Spot in Word')}
              </button>
            )}
            <button
              type="button"
              className="btn pequeno fantasma"
              onClick={onFechar}
              style={{ fontSize: 16, fontWeight: 700, padding: '4px 10px' }}
              title={tr('Fechar comparador (Esc)', 'Close comparator (Esc)')}
            >
              ✕
            </button>
          </div>
        </header>

        {/* Corpo Lado a Lado */}
        <div
          className="split-view-grid"
          style={{
            display: 'grid',
            gridTemplateColumns: '42% 58%',
            flex: 1,
            minHeight: 0,
            overflow: 'hidden',
          }}
        >
          {/* ESQUERDA: MANUSCRITO WORD */}
          <div
            style={{
              padding: 16,
              borderRight: '2px solid var(--borda)',
              overflowY: 'auto',
              background: 'var(--fundo)',
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span
                style={{
                  fontSize: 11.5,
                  fontWeight: 800,
                  textTransform: 'uppercase',
                  letterSpacing: 0.5,
                  color: '#1d4ed8',
                  background: 'rgba(37, 99, 235, 0.1)',
                  padding: '3px 8px',
                  borderRadius: 4,
                }}
              >
                📝 {tr('Lado Esquerdo: O que está escrito no seu Word', 'Left Pane: What is written in Word')}
              </span>
              {dadosComparacao.locWord && (
                <span style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--texto-suave)' }}>
                  📍 {dadosComparacao.locWord}
                </span>
              )}
            </div>

            {dadosComparacao.diagnostico && (
              <div
                style={{
                  background: 'rgba(220, 38, 38, 0.08)',
                  border: '1px solid rgba(220, 38, 38, 0.25)',
                  borderLeft: '4px solid #dc2626',
                  borderRadius: 6,
                  padding: '10px 12px',
                  fontSize: 12.5,
                  color: '#991b1b',
                  fontWeight: 600,
                }}
              >
                {dadosComparacao.diagnostico}
              </div>
            )}

            <div
              style={{
                background: 'var(--painel)',
                border: '1px solid var(--borda)',
                borderRadius: 8,
                padding: 14,
                fontSize: 13.5,
                lineHeight: 1.65,
                color: 'var(--texto)',
              }}
            >
              <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--texto-suave)', textTransform: 'uppercase', marginBottom: 6 }}>
                {tr('Trecho citado no manuscrito:', 'Cited passage in manuscript:')}
              </div>
              <div style={{ borderLeft: '3px solid #2563eb', paddingLeft: 10, fontStyle: 'italic' }}>
                "{dadosComparacao.fraseWord || dadosComparacao.paragrafoCompleto}"
              </div>
            </div>

            {dadosComparacao.paragrafoCompleto && dadosComparacao.paragrafoCompleto !== dadosComparacao.fraseWord && (
              <div
                style={{
                  background: 'var(--painel)',
                  border: '1px solid var(--borda)',
                  borderRadius: 8,
                  padding: 14,
                  fontSize: 12.5,
                  lineHeight: 1.6,
                  color: 'var(--texto-suave)',
                }}
              >
                <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', marginBottom: 4 }}>
                  {tr('Parágrafo completo no Word:', 'Full paragraph in Word:')}
                </div>
                {dadosComparacao.paragrafoCompleto}
              </div>
            )}

            {dadosComparacao.trechoPdf && (
              <div
                style={{
                  background: 'rgba(22, 163, 74, 0.06)',
                  border: '1px solid rgba(22, 163, 74, 0.3)',
                  borderRadius: 8,
                  padding: 12,
                  fontSize: 12.2,
                  lineHeight: 1.5,
                }}
              >
                <strong style={{ color: '#15803d', fontSize: 11.5 }}>
                  ✅ {tr('Passagem mais próxima localizada automaticamente no PDF:', 'Closest passage automatically matched in PDF:')}
                </strong>
                <div style={{ marginTop: 4, fontStyle: 'italic', color: 'var(--texto)' }}>
                  "{dadosComparacao.trechoPdf}"
                </div>
              </div>
            )}

            <div style={{ marginTop: 'auto', paddingTop: 12, borderTop: '1px solid var(--borda)', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {onSalvarTrechoCitado && refItem?.id && (
                <button
                  type="button"
                  className="btn pequeno"
                  disabled={salvandoTrecho || somenteLeitura}
                  title={
                    somenteLeitura
                      ? tr('Desative o modo Somente Leitura para gravar Trecho Citado na Biblioteca', 'Disable Read-Only mode to save Cited Excerpt to Library')
                      : tr('Salva o trecho do PDF nesta página como Trecho Citado (Ground Truth) na Biblioteca', 'Save this excerpt and page as Cited Excerpt Ground Truth in Library')
                  }
                  style={{
                    background: trechoSalvoOk ? '#dbeafe' : 'rgba(37, 99, 235, 0.1)',
                    color: '#1d4ed8',
                    borderColor: 'rgba(37, 99, 235, 0.35)',
                    fontWeight: 700,
                  }}
                  onClick={async () => {
                    const txt = dadosComparacao.trechoPdf || dadosComparacao.fraseWord || dadosComparacao.paragrafoCompleto || '';
                    if (!txt.trim()) return;
                    setSalvandoTrecho(true);
                    try {
                      const ok = await onSalvarTrechoCitado({
                        refItem,
                        pagina: paginaAtual,
                        trecho: txt,
                        ondeCitei: dadosComparacao.locWord || '',
                      });
                      if (ok) setTrechoSalvoOk(true);
                    } finally {
                      setSalvandoTrecho(false);
                    }
                  }}
                >
                  {trechoSalvoOk
                    ? `✓ ${tr(`Trecho Salvo (Pág. ${paginaAtual})`, `Excerpt Saved (P. ${paginaAtual})`)}`
                    : salvandoTrecho
                    ? tr('Salvando…', 'Saving…')
                    : `📌 ${tr(`Salvar Trecho Citado (Pág. ${paginaAtual})`, `Save Cited Excerpt (P. ${paginaAtual})`)}`}
                </button>
              )}
              {onMarcarResolvido && (
                <button
                  type="button"
                  className="btn pequeno"
                  style={{ background: '#dcfce7', color: '#15803d', borderColor: '#86efac', fontWeight: 700 }}
                  onClick={() => { onMarcarResolvido(); onFechar(); }}
                >
                  ✓ {tr('Já Corrigi / Resolvido', 'Fixed / Resolved')}
                </button>
              )}
              {onMarcarIgnorado && (
                <button
                  type="button"
                  className="btn pequeno secundario"
                  onClick={() => { onMarcarIgnorado(); onFechar(); }}
                >
                  🚫 {tr('Falso Positivo / Ignorar Alerta', 'False Positive / Ignore Alert')}
                </button>
              )}
            </div>
          </div>

          {/* DIREITA: VISUALIZADOR DO PDF AUTÊNTICO */}
          <div style={{ display: 'flex', flexDirection: 'column', minHeight: 0, background: '#334155' }}>
            {/* Controles do PDF + Busca no PDF */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '8px 12px',
                background: 'var(--painel)',
                borderBottom: '1px solid var(--borda)',
                gap: 8,
                flexWrap: 'wrap',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <button
                  type="button"
                  className="btn pequeno secundario"
                  disabled={paginaAtual <= 1 || !docPdf}
                  onClick={() => setPaginaAtual((p) => Math.max(1, p - 1))}
                >
                  ◄
                </button>
                <span style={{ fontSize: 12, fontWeight: 600 }}>
                  Pág.{' '}
                  <input
                    type="number"
                    min={1}
                    max={numPaginas || 1}
                    value={paginaAtual}
                    onChange={(e) => {
                      const val = parseInt(e.target.value, 10);
                      if (val >= 1 && val <= numPaginas) setPaginaAtual(val);
                    }}
                    style={{ width: 48, textAlign: 'center', padding: '2px 4px', borderRadius: 4, border: '1px solid var(--borda)' }}
                  />{' '}
                  / {numPaginas || '—'}
                </span>
                <button
                  type="button"
                  className="btn pequeno secundario"
                  disabled={paginaAtual >= numPaginas || !docPdf}
                  onClick={() => setPaginaAtual((p) => Math.min(numPaginas, p + 1))}
                >
                  ►
                </button>
                <button
                  type="button"
                  className="btn pequeno fantasma"
                  onClick={() => setEscala((s) => Math.max(0.6, Number((s - 0.15).toFixed(2))))}
                  title="Diminuir Zoom"
                >
                  −
                </button>
                <span style={{ fontSize: 11.5 }}>{Math.round(escala * 100)}%</span>
                <button
                  type="button"
                  className="btn pequeno fantasma"
                  onClick={() => setEscala((s) => Math.min(2.4, Number((s + 0.15).toFixed(2))))}
                  title="Aumentar Zoom"
                >
                  +
                </button>
              </div>

              <form onSubmit={buscarPalavraNoPdf} style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                <input
                  value={termoBuscaPdf}
                  onChange={(e) => setTermoBuscaPdf(e.target.value)}
                  placeholder="Buscar palavra dentro deste PDF…"
                  style={{ fontSize: 11.8, padding: '3px 8px', width: 205, borderRadius: 4, border: '1px solid var(--borda)' }}
                />
                <button type="submit" className="btn pequeno primario" disabled={buscandoNoPdf || !docPdf}>
                  {buscandoNoPdf ? '…' : '🔎 Buscar no PDF'}
                </button>
              </form>
            </div>

            {resultadosBusca.length > 0 && (
              <div
                style={{
                  background: '#fefce8',
                  borderBottom: '1px solid #fde047',
                  padding: '6px 12px',
                  fontSize: 11.5,
                  display: 'flex',
                  gap: 6,
                  flexWrap: 'wrap',
                  alignItems: 'center',
                  maxHeight: 72,
                  overflowY: 'auto',
                }}
              >
                <strong style={{ color: '#854d0e' }}>
                  {resultadosBusca.length} ocorrência(s) em:
                </strong>
                {resultadosBusca.map((rb, idx) => (
                  <button
                    key={idx}
                    type="button"
                    className={`btn pequeno ${paginaAtual === rb.pagina ? 'primario' : 'secundario'}`}
                    style={{ fontSize: 11, padding: '1px 6px' }}
                    onClick={() => setPaginaAtual(rb.pagina)}
                    title={rb.trecho}
                  >
                    Pág. {rb.pagina}
                  </button>
                ))}
              </div>
            )}

            <div style={{ flex: 1, overflow: 'auto', padding: 16, display: 'flex', justifyContent: 'center', alignItems: 'flex-start' }}>
              {carregandoPdf ? (
                <div style={{ color: '#fff', padding: 40 }}>Carregando arquivo PDF…</div>
              ) : erroPdf ? (
                <div style={{ color: '#fecaca', background: 'rgba(153, 27, 27, 0.4)', padding: 20, borderRadius: 8 }}>
                  {erroPdf}
                </div>
              ) : (
                <div className="pagina-pdf-container" style={{ position: 'relative', boxShadow: '0 8px 24px rgba(0,0,0,0.4)', background: '#fff' }}>
                  <canvas ref={canvasRef} />
                  <div ref={textLayerRef} className="textLayer" />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
