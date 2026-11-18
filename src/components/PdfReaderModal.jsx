import React, { useEffect, useRef, useState } from 'react';
import * as pdfjs from 'pdfjs-dist';
import { Icone, useAviso } from './ui.jsx';
import { autoresResumo, ano, semHtml } from '../lib/csl.js';
import { useI18n } from '../i18n.jsx';

const CORES_GRIFO = [
  { id: 'amarelo', nome: 'Achado principal', nomeEn: 'Key Finding', cor: '#fde047', badge: '🟡' },
  { id: 'verde', nome: 'Metodologia / PICO', nomeEn: 'Methodology / PICO', cor: '#86efac', badge: '🟢' },
  { id: 'azul', nome: 'Citar no Word', nomeEn: 'Cite in Word', cor: '#93c5fd', badge: '🔵' },
  { id: 'rosa', nome: 'Limitação / Crítica', nomeEn: 'Limitation / Critique', cor: '#fda4af', badge: '🔴' },
];

export default function PdfReaderModal({ refItem, paginaInicial = 1, onFechar, onAtualizarRef, emAba = false }) {
  const avisar = useAviso();
  const { ehEn, tr } = useI18n();
  const canvasRef = useRef(null);
  const containerPaginaRef = useRef(null);
  const textLayerRef = useRef(null);
  const comentarioInputRef = useRef(null);

  const [docPdf, setDocPdf] = useState(null);
  const [numPaginas, setNumPaginas] = useState(0);
  const [paginaAtual, setPaginaAtual] = useState(paginaInicial || 1);

  useEffect(() => {
    if (paginaInicial && paginaInicial >= 1) {
      setPaginaAtual(Number(paginaInicial));
    }
  }, [paginaInicial]);

  const [escala, setEscala] = useState(1.25);
  const [textoPagina, setTextoPagina] = useState('');
  const [grifos, setGrifos] = useState([]);
  const [novoTrecho, setNovoTrecho] = useState('');
  const [novaNota, setNovaNota] = useState('');
  const [ondeCitei, setOndeCitei] = useState('');
  const [marcarCitado, setMarcarCitado] = useState(true);
  const [corAtiva, setCorAtiva] = useState('azul');
  const [filtroIndice, setFiltroIndice] = useState('todos');

  // Barra flutuante de cor ao selecionar texto no PDF
  const [barraFlutuante, setBarraFlutuante] = useState({
    visivel: false,
    x: 0,
    y: 0,
    trecho: '',
  });

  // Carregar bytes do PDF e grifos salvos
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const [bytes, grifosSalvos] = await Promise.all([
          window.api.bib.lerPdfBytes(refItem.id),
          window.api.bib.lerGrifos(refItem.id),
        ]);
        if (cancelado) return;
        setGrifos(grifosSalvos || []);
        const dados = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes || []);
        const tarefa = pdfjs.getDocument({ data: dados, isEvalSupported: false });
        const d = await tarefa.promise;
        if (cancelado) {
          try {
            if (typeof d?.destroy === 'function') await d.destroy();
            else if (typeof tarefa?.destroy === 'function') await tarefa.destroy();
          } catch {}
          return;
        }
        setDocPdf(d);
        setNumPaginas(d.numPages);
      } catch (e) {
        avisar(e.message, 'erro');
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [refItem.id]);

  // Renderizar página no canvas e montar a textLayer selecionável
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

        // Renderizar camada de texto sobre o canvas para permitir seleção nativa no PDF
        if (textLayerRef.current) {
          textLayerRef.current.innerHTML = '';
          textLayerRef.current.style.width = `${vp.width}px`;
          textLayerRef.current.style.height = `${vp.height}px`;

          const txt = await pag.getTextContent();
          if (!cancelado) {
            setTextoPagina(txt.items.map((i) => i.str + (i.hasEOL ? '\n' : ' ')).join(''));
            try {
              const tl = new pdfjs.TextLayer({
                textContentSource: txt,
                container: textLayerRef.current,
                viewport: vp,
              });
              await tl.render();
            } catch (err) {
              console.warn('TextLayer render warning:', err);
            }
          }
        }
      } catch (err) {
        console.error('Erro ao renderizar página do PDF:', err);
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [docPdf, paginaAtual, escala]);

  // Listener para capturar seleção de texto direto no PDF
  const verificarSelecaoTextoPdf = () => {
    const sel = window.getSelection();
    const texto = sel ? sel.toString().trim() : '';

    if (!texto || texto.length < 2) {
      setBarraFlutuante({ visivel: false, x: 0, y: 0, trecho: '' });
      return;
    }

    // Copia AUTOMATICAMENTE o trecho selecionado para a lateral
    setNovoTrecho(texto);

    // Posiciona barra flutuante de cores sobre o texto selecionado
    try {
      const range = sel.getRangeAt(0);
      const rect = range.getBoundingClientRect();
      const containerRect = containerPaginaRef.current?.getBoundingClientRect() || { left: 0, top: 0 };
      const scrollWrap = containerPaginaRef.current?.parentElement;
      const wrapScrollTop = scrollWrap ? scrollWrap.scrollTop : 0;
      const wrapScrollLeft = scrollWrap ? scrollWrap.scrollLeft : 0;

      const posX = Math.max(10, rect.left - containerRect.left + rect.width / 2 - 110);
      const posY = Math.max(10, rect.top - containerRect.top - 46);

      setBarraFlutuante({
        visivel: true,
        x: posX,
        y: posY,
        trecho: texto,
      });
    } catch {
      setBarraFlutuante({ visivel: true, x: 40, y: 30, trecho: texto });
    }
  };

  // Clicar em cor na barra flutuante ou formulário
  const selecionarCorEComentar = (corId) => {
    setCorAtiva(corId);
    if (barraFlutuante.trecho) {
      setNovoTrecho(barraFlutuante.trecho);
    }
    setBarraFlutuante((b) => ({ ...b, visivel: false }));
    if (comentarioInputRef.current) {
      comentarioInputRef.current.focus();
    }
  };

  const salvarListaGrifos = async (novaLista) => {
    setGrifos(novaLista);
    await window.api.bib.salvarGrifos(refItem.id, novaLista);
  };

  const adicionarGrifo = async (e) => {
    if (e) e.preventDefault();
    if (!novoTrecho.trim()) {
      avisar('Selecione primeiro o trecho do artigo direto no PDF!', 'erro');
      return;
    }
    const item = {
      id: Date.now().toString(36),
      pagina: paginaAtual,
      cor: marcarCitado ? 'azul' : corAtiva,
      trecho: novoTrecho.trim(),
      nota: novaNota.trim(),
      ondeCitei: ondeCitei.trim(),
      citadoNoTexto: !!marcarCitado,
      criadoEm: new Date().toISOString(),
    };
    await salvarListaGrifos([item, ...grifos]);
    setNovoTrecho('');
    setNovaNota('');
    setOndeCitei('');
    setBarraFlutuante({ visivel: false, x: 0, y: 0, trecho: '' });

    if (marcarCitado) {
      onAtualizarRef(refItem.id, { status: 'citada' });
    } else if (refItem.status === 'a_ler') {
      onAtualizarRef(refItem.id, { status: 'consultada' });
    }
    avisar(
      marcarCitado
        ? 'Trecho salvo no Resumo de Comentários e marcado como Citado!'
        : 'Grifo e comentário salvos com sucesso!',
      'ok'
    );
  };

  const removerGrifo = async (id) => {
    const novaLista = grifos.filter((x) => x.id !== id);
    await salvarListaGrifos(novaLista);
    avisar('Grifo removido!', 'ok');
  };

  const alternarCitadoGrifo = async (g) => {
    const novoValor = !g.citadoNoTexto;
    const novaLista = grifos.map((x) => (x.id === g.id ? { ...x, citadoNoTexto: novoValor } : x));
    await salvarListaGrifos(novaLista);
    if (novoValor) onAtualizarRef(refItem.id, { status: 'citada' });
  };

  const copiarCitacaoDireta = (g) => {
    const aut = (autoresResumo(refItem.csl) || 'AUTOR').toUpperCase();
    const a = ano(refItem.csl) || 's.d.';
    const texto = `"${g.trecho}" (${aut}, ${a}, p. ${g.pagina})`;
    window.api.sistema.copiarTexto(texto);
    onAtualizarRef(refItem.id, { status: 'citada' });
    avisar('Citação direta copiada e referência marcada como Citada!', 'ok');
  };

  // Gerar e copiar resumo consolidado completo de comentários e grifos para o Word
  const copiarResumoCompletoWord = () => {
    if (grifos.length === 0) {
      avisar('Nenhum grifo ou comentário registrado neste PDF ainda.', 'erro');
      return;
    }
    const tit = semHtml(refItem.csl?.title) || 'Artigo';
    const aut = autoresResumo(refItem.csl) || 'Autor';
    const a = ano(refItem.csl) || 's.d.';

    // Ordena grifos por página
    const grifosOrdenados = [...grifos].sort((x, y) => x.pagina - y.pagina);

    let texto = `======================================================================\n`;
    texto += `📑 RESUMO DE COMENTÁRIOS E GRIFOS DE LEITURA\n`;
    texto += `======================================================================\n`;
    texto += `Trabalho: ${tit}\n`;
    texto += `Referência: ${aut} (${a})\n`;
    texto += `Total de anotações: ${grifos.length}\n`;
    texto += `Data da compilação: ${new Date().toLocaleDateString('pt-BR')}\n`;
    texto += `======================================================================\n\n`;

    grifosOrdenados.forEach((g, idx) => {
      const infoCor = CORES_GRIFO.find((c) => c.id === g.cor) || CORES_GRIFO[0];
      texto += `[${idx + 1}] PÁGINA ${g.pagina} — ${infoCor.badge} ${infoCor.nome.toUpperCase()}\n`;
      texto += `Trecho original: "${g.trecho}"\n`;
      if (g.nota) {
        texto += `💬 Comentário / Paráfrase: ${g.nota}\n`;
      }
      if (g.ondeCitei) {
        texto += `📍 No Word: ${g.ondeCitei}\n`;
      }
      if (g.citadoNoTexto) {
        texto += `✔ Status: Utilizado / Citado no artigo\n`;
      }
      texto += `\n`;
    });

    window.api.sistema.copiarTexto(texto);
    avisar('Resumo consolidado copiado! Basta colar (Ctrl+V) no Word ou Bloco de Notas.', 'ok');
  };

  // Salvar resumo de comentários diretamente nas notas de fichamento da obra
  const salvarResumoNoFichamento = () => {
    if (grifos.length === 0) {
      avisar('Nenhum grifo para transferir.', 'erro');
      return;
    }
    const grifosOrdenados = [...grifos].sort((x, y) => x.pagina - y.pagina);
    const blocos = grifosOrdenados.map((g) => {
      const infoCor = CORES_GRIFO.find((c) => c.id === g.cor) || CORES_GRIFO[0];
      return `[p. ${g.pagina} · ${infoCor.nome}] "${g.trecho}"${g.nota ? `\n💬 ${g.nota}` : ''}${g.ondeCitei ? `\n📍 ${g.ondeCitei}` : ''}`;
    }).join('\n\n');

    const cabecalho = `=== RESUMO DE LEITURA (PDF) ===\n${blocos}`;
    const notasExistentes = refItem.notas || '';
    const novasNotas = notasExistentes ? `${notasExistentes}\n\n${cabecalho}` : cabecalho;

    onAtualizarRef(refItem.id, {
      notas: novasNotas,
      status: refItem.status === 'a_ler' ? 'consultada' : refItem.status,
    });
    avisar('Resumo de comentários salvo nas Notas de Fichamento da obra!', 'ok');
  };

  // Grifos filtrados para o índice
  const grifosFiltrados = grifos.filter((g) => {
    if (filtroIndice === 'todos') return true;
    return g.cor === filtroIndice;
  });

  return (
    <div className={`overlay-modal ${emAba ? 'leitor-em-aba' : ''}`} onClick={onFechar}>
      <div className="caixa-modal leitor-pdf-modal" onClick={(e) => e.stopPropagation()}>
        <header className="cabecalho-modal leitor-cabecalho">
          <div className="leitor-titulo-box">
            <h3 title={refItem.csl?.title}>{semHtml(refItem.csl?.title) || tr('Leitor de Artigo PDF', 'PDF Article Reader')}</h3>
            <span className="leitor-subtitulo">
              {autoresResumo(refItem.csl)} ({ano(refItem.csl)}) · {tr('Página', 'Page')} {paginaAtual} {tr('de', 'of')} {numPaginas || '…'} · {tr('Total de', 'Total of')} {grifos.length} {tr('anotações', 'notes')}
            </span>
          </div>

          <div className="leitor-controles">
            <button
              className="btn secundario pequeno"
              disabled={paginaAtual <= 1}
              onClick={() => {
                setPaginaAtual((p) => Math.max(1, p - 1));
                setBarraFlutuante({ visivel: false, x: 0, y: 0, trecho: '' });
              }}
            >
              ◄ {tr('Anterior', 'Prev')}
            </button>
            <input
              type="number"
              min={1}
              max={numPaginas || 1}
              value={paginaAtual}
              onChange={(e) => {
                const v = parseInt(e.target.value, 10);
                if (v >= 1 && v <= numPaginas) {
                  setPaginaAtual(v);
                  setBarraFlutuante({ visivel: false, x: 0, y: 0, trecho: '' });
                }
              }}
              className="input-pagina"
            />
            <button
              className="btn secundario pequeno"
              disabled={paginaAtual >= numPaginas}
              onClick={() => {
                setPaginaAtual((p) => Math.min(numPaginas, p + 1));
                setBarraFlutuante({ visivel: false, x: 0, y: 0, trecho: '' });
              }}
            >
              {tr('Próxima', 'Next')} ►
            </button>
            <button className="btn secundario pequeno" onClick={() => setEscala((e) => Math.max(0.75, e - 0.15))}>
              Zoom −
            </button>
            <button className="btn secundario pequeno" onClick={() => setEscala((e) => Math.min(2.5, e + 0.15))}>
              Zoom ＋
            </button>
            <button
              className="btn secundario pequeno"
              onClick={() => window.api.bib.abrirPdfExterno(refItem.id)}
              title={tr('Abrir no Adobe Acrobat, Edge ou navegador padrão', 'Open in Adobe Acrobat, Edge, or default browser')}
            >
              ↗ {tr('Abrir no Navegador Externo', 'Open in External Browser')}
            </button>
            <button
              className="btn secundario pequeno"
              onClick={() => window.api.bib.mostrarArquivo(refItem.id)}
              title={tr('Abrir pasta onde o PDF está salvo', 'Open folder where PDF is saved')}
            >
              📁 {tr('Mostrar na pasta', 'Show in folder')}
            </button>
            <button className="btn pequeno primario" onClick={onFechar}>
              {tr('Fechar leitor', 'Close reader')}
            </button>
          </div>
        </header>

        <div className="leitor-pdf-corpo">
          {/* Lado Esquerdo: Canvas com camada de texto interativa direta no PDF */}
          <div className="leitor-canvas-wrap">
            <div
              className="pagina-pdf-container"
              ref={containerPaginaRef}
              onMouseUp={verificarSelecaoTextoPdf}
              onKeyUp={verificarSelecaoTextoPdf}
            >
              <canvas ref={canvasRef} />
              {/* TextLayer do PDF.js: permite selecionar o texto com o mouse direto no documento */}
              <div className="textLayer" ref={textLayerRef} />

              {/* Barra Flutuante de Cores que surge exatamente sobre o texto selecionado */}
              {barraFlutuante.visivel && (
                <div
                  className="toolbar-selecao-flutuante"
                  style={{
                    left: `${barraFlutuante.x}px`,
                    top: `${barraFlutuante.y}px`,
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <span style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', marginRight: 4 }}>
                    Grifar com:
                  </span>
                  {CORES_GRIFO.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      className="btn-cor-rapida"
                      style={{ background: c.cor }}
                      title={`${c.badge} ${c.nome} (clique para aplicar)`}
                      onClick={() => selecionarCorEComentar(c.id)}
                    />
                  ))}
                  <button
                    type="button"
                    className="btn-copiar-selecao"
                    onClick={() => {
                      adicionarGrifo();
                    }}
                    title="Salvar imediatamente no Resumo de Comentários"
                  >
                    ✔ Salvar
                  </button>
                </div>
              )}
            </div>

            {/* Texto bruto de contingência recolhido */}
            {textoPagina && (
              <details className="texto-extraido-box" style={{ marginTop: 16 }}>
                <summary style={{ cursor: 'pointer', fontSize: 12, color: '#94a3b8' }}>
                  Ver texto extraído desta página em texto simples ({textoPagina.length} caracteres)
                </summary>
                <pre
                  onMouseUp={() => {
                    const sel = window.getSelection()?.toString()?.trim();
                    if (sel) setNovoTrecho(sel);
                  }}
                >
                  {textoPagina}
                </pre>
              </details>
            )}
          </div>

          {/* Lado Direito: Formulário de Grifo/Comentário + Resumo com Índice */}
          <aside className="leitor-lateral-grifos">
            <h4>Grifos e Anotações (pág. {paginaAtual})</h4>

            <form onSubmit={adicionarGrifo} className="form-grifo">
              <div className="seletor-cores-grifo">
                {CORES_GRIFO.map((c) => (
                  <button
                    type="button"
                    key={c.id}
                    className={`pill-cor ${corAtiva === c.id ? 'ativa' : ''}`}
                    style={{ background: c.cor }}
                    onClick={() => setCorAtiva(c.id)}
                    title={c.nome}
                  >
                    {c.badge} {c.nome}
                  </button>
                ))}
              </div>

              <textarea
                rows={3}
                value={novoTrecho}
                onChange={(e) => setNovoTrecho(e.target.value)}
                placeholder="Selecione o texto direto no PDF (ou cole aqui o trecho citado)…"
              />

              <textarea
                ref={comentarioInputRef}
                rows={2}
                value={novaNota}
                onChange={(e) => setNovaNota(e.target.value)}
                placeholder="Como você reescreveu / paráfrase ou comentário pessoal…"
              />

              <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                <input
                  style={{ flex: 1 }}
                  value={ondeCitei}
                  onChange={(e) => setOndeCitei(e.target.value)}
                  placeholder="Onde usou no Word? (ex.: Introdução §3)"
                />
                <label className="checkbox-rotulo" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                  <input
                    type="checkbox"
                    checked={marcarCitado}
                    onChange={(e) => setMarcarCitado(e.target.checked)}
                  />
                  ✔ Trecho citado
                </label>
              </div>

              <button type="submit" className="btn primario pequeno">
                + Salvar trecho da pág. {paginaAtual}
              </button>
            </form>

            {/* ÍNDICE E RESUMO DE COMENTÁRIOS LOGO ABAIXO */}
            <div className="secao-indice-resumo">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4 style={{ margin: 0, fontSize: 13 }}>
                  📑 Resumo &amp; Índice ({grifos.length})
                </h4>
              </div>

              {/* Botões de Ação do Resumo */}
              <div className="botoes-resumo-topo">
                <button
                  type="button"
                  className="btn secundario pequeno"
                  onClick={copiarResumoCompletoWord}
                  disabled={grifos.length === 0}
                  title="Copiar todos os comentários e grifos organizados por página para colar no Word"
                >
                  <Icone nome="copy" tam={13} /> Copiar Resumo de Comentários (Word)
                </button>
                <button
                  type="button"
                  className="btn secundario pequeno"
                  onClick={salvarResumoNoFichamento}
                  disabled={grifos.length === 0}
                  title="Transferir todo o resumo de leitura para as Notas de Fichamento da obra"
                >
                  📝 Inserir no Fichamento da Obra
                </button>
              </div>

              {/* Filtro de Cores no Índice */}
              {grifos.length > 0 && (
                <div className="filtro-chips-grifos">
                  <button
                    type="button"
                    className={`btn-chip-filtro ${filtroIndice === 'todos' ? 'ativo' : ''}`}
                    onClick={() => setFiltroIndice('todos')}
                  >
                    Todos ({grifos.length})
                  </button>
                  {CORES_GRIFO.map((c) => {
                    const count = grifos.filter((g) => g.cor === c.id).length;
                    if (count === 0) return null;
                    return (
                      <button
                        type="button"
                        key={c.id}
                        className={`btn-chip-filtro ${filtroIndice === c.id ? 'ativo' : ''}`}
                        onClick={() => setFiltroIndice(c.id)}
                        style={{ borderBottom: `2px solid ${c.cor}` }}
                      >
                        {c.badge} {count}
                      </button>
                    );
                  })}
                </div>
              )}

              {/* Lista / Índice de Cards de Comentários e Grifos */}
              <div className="lista-grifos">
                {grifosFiltrados.length === 0 ? (
                  <p className="dica-texto" style={{ textAlign: 'center', padding: '12px 0' }}>
                    {grifos.length === 0
                      ? 'Nenhum grifo salvo neste PDF ainda. Selecione qualquer frase no PDF ao lado para grifar!'
                      : 'Nenhum grifo encontrado com esta cor.'}
                  </p>
                ) : (
                  grifosFiltrados.map((g) => {
                    const infoCor = CORES_GRIFO.find((c) => c.id === g.cor) || CORES_GRIFO[0];
                    return (
                      <div
                        key={g.id}
                        className="card-grifo"
                        style={{ borderLeftColor: infoCor.cor }}
                      >
                        <div className="card-grifo-topo">
                          <button
                            type="button"
                            className="tag-pagina-clicavel"
                            onClick={() => {
                              setPaginaAtual(g.pagina);
                              setBarraFlutuante({ visivel: false, x: 0, y: 0, trecho: '' });
                            }}
                            title={`Ir para a página ${g.pagina} no PDF`}
                          >
                            Pág. {g.pagina} ↗
                          </button>
                          <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>
                            {infoCor.badge} {infoCor.nome}
                          </span>
                        </div>

                        <blockquote>"{g.trecho}"</blockquote>

                        {g.nota && (
                          <div className="comentario-destaque">
                            <strong>💬 Comentário:</strong> {g.nota}
                          </div>
                        )}

                        {g.ondeCitei && (
                          <p style={{ fontSize: 11, color: '#0284c7', margin: '2px 0' }}>
                            📍 No Word: <strong>{g.ondeCitei}</strong>
                          </p>
                        )}

                        <div className="acoes-grifo">
                          <button
                            type="button"
                            className="btn secundario pequeno"
                            onClick={() => copiarCitacaoDireta(g)}
                            title="Copiar citação com página já formatada para o Word"
                          >
                            <Icone nome="copy" tam={11} /> Citar c/ pág.
                          </button>
                          <button
                            type="button"
                            className="btn secundario pequeno"
                            onClick={() => alternarCitadoGrifo(g)}
                            title="Alternar se o trecho foi utilizado no texto"
                          >
                            {g.citadoNoTexto ? '✔ Citado' : 'Marcar citado'}
                          </button>
                          <button
                            type="button"
                            className="btn-icone"
                            onClick={() => removerGrifo(g.id)}
                            title="Excluir este grifo"
                            style={{ color: '#ef4444', marginLeft: 'auto' }}
                          >
                            <Icone nome="trash" tam={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
