import React, { useEffect, useState } from 'react';
import {
  STATUS,
  TIPOS,
  camposDoTipo,
  autoresParaTexto,
  textoParaAutores,
  dataParaTexto,
  textoParaData,
  autoresResumo,
  ano,
  semHtml,
} from '../lib/csl.js';
import { Icone, Campo, useAviso } from './ui.jsx';

const NIVEIS_EVIDENCIA = [
  { id: '', nome: '— Não classificado —' },
  { id: '1a', nome: '1A – Revisão sistemática / meta-análise de ECRs' },
  { id: '1b', nome: '1B – Ensaio clínico randomizado (ECR)' },
  { id: '2a', nome: '2A – Revisão sistemática de coortes' },
  { id: '2b', nome: '2B – Estudo de coorte' },
  { id: '3a', nome: '3A – Revisão sistemática de caso-controle' },
  { id: '3b', nome: '3B – Estudo caso-controle' },
  { id: '4', nome: '4 – Série de casos / transversal' },
  { id: '5', nome: '5 – Opinião de especialista / revisão narrativa' },
  { id: 'diretriz', nome: 'Diretriz clínica / consenso' },
];

export default function ReferenceDetail({
  refItem,
  estilo,
  idioma,
  colecoes,
  onAtualizar,
  onExcluir,
  onAnexarPdf,
  onAbrirLeitorPdf,
  onImportarCsl,
  onRecarregar,
}) {
  const avisar = useAviso();
  const [aba, setAba] = useState('dados'); // 'dados' | 'fichamento' | 'citacao' | 'rede'
  const [novaTag, setNovaTag] = useState('');
  const [previa, setPrevia] = useState({ citacao: '', bibliografiaHtml: '' });
  const [buscandoDoi, setBuscandoDoi] = useState(false);
  const [buscandoPdfOa, setBuscandoPdfOa] = useState(false);
  const [gerandoInsights, setGerandoInsights] = useState(false);
  const [rede, setRede] = useState(null);
  const [carregandoRede, setCarregandoRede] = useState(false);
  const [grifos, setGrifos] = useState([]);
  const [novoTrecho, setNovoTrecho] = useState('');
  const [novaFraseWord, setNovaFraseWord] = useState('');
  const [novaPag, setNovaPag] = useState('');
  const [ondeCitei, setOndeCitei] = useState('');

  const csl = refItem?.csl || {};
  const pico = refItem?.pico || {};
  const insights = refItem?.insights || {};

  const gerarInsightsEPicoAutomatico = async (consultarOnline = true) => {
    if (!refItem) return;
    try {
      setGerandoInsights(true);
      await window.api.meta.gerarInsights({
        id: refItem.id,
        consultarOnline,
        forcarReescrita: true,
      });
      await onRecarregar?.();
      avisar(
        'Insights do artigo, Nota da Revista, Resumo, Notas de Fichamento e PICO atualizados automaticamente!',
        'ok'
      );
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setGerandoInsights(false);
    }
  };

  const abrirBuscaManualPdf = () => {
    if (!refItem) return;
    const q = csl.DOI
      ? csl.DOI
      : `${semHtml(csl.title) || ''} ${autoresResumo(csl) || ''} ${ano(csl) || ''} filetype:pdf`.trim();
    window.api.sistema.abrirLink(`https://scholar.google.com.br/scholar?q=${encodeURIComponent(q)}`);
    avisar(
      'Google Acadêmico aberto! Baixe o PDF no navegador e depois clique em "📎 Anexar PDF do PC".',
      'info'
    );
  };

  useEffect(() => {
    setRede(null);
    let ativo = true;
    if (!refItem) return;
    window.api.cit
      .formatar({ ids: [refItem.id], estilo, idioma })
      .then((f) => {
        if (ativo) setPrevia(f);
      })
      .catch(() => {});
    window.api.bib
      .lerGrifos(refItem.id)
      .then((g) => {
        if (ativo) setGrifos(g || []);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, [refItem, estilo, idioma]);

  const adicionarTrechoCitado = async (e) => {
    e.preventDefault();
    if (!novoTrecho.trim() && !novaFraseWord.trim()) return;
    const item = {
      id: Date.now().toString(36),
      pagina: Number(novaPag) || 1,
      cor: 'azul',
      trecho: novoTrecho.trim() || novaFraseWord.trim(),
      fraseWord: novaFraseWord.trim(),
      ondeCitei: ondeCitei.trim(),
      citadoNoTexto: true,
      criadoEm: new Date().toISOString(),
    };
    const novaLista = [item, ...grifos];
    setGrifos(novaLista);
    await window.api.bib.salvarGrifos(refItem.id, novaLista);
    await onAtualizar(refItem.id, { status: 'citada' });
    setNovoTrecho('');
    setNovaFraseWord('');
    setNovaPag('');
    setOndeCitei('');
    avisar('Localização no Word + Trecho do artigo salvos e referência marcada como Citada!', 'ok');
  };

  const removerTrecho = async (idGrifo) => {
    const novaLista = grifos.filter((x) => x.id !== idGrifo);
    setGrifos(novaLista);
    await window.api.bib.salvarGrifos(refItem.id, novaLista);
  };

  const buscarPdfGratuito = async () => {
    try {
      setBuscandoPdfOa(true);
      const res = await window.api.meta.buscarPdfAberto(refItem.id);
      await onRecarregar?.();
      if (res.baixado) {
        avisar('PDF gratuito encontrado e salvo automaticamente no OneDrive!', 'ok');
      } else {
        avisar('Link de acesso aberto localizado e aberto no navegador!', 'info');
      }
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setBuscandoPdfOa(false);
    }
  };

  const carregarRedeCitacoes = async () => {
    try {
      setCarregandoRede(true);
      const r = await window.api.meta.redeCitacoes(refItem.id);
      setRede(r);
      if (r.retratado) await onRecarregar?.();
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setCarregandoRede(false);
    }
  };

  if (!refItem) {
    return (
      <aside className="painel-detalhe vazio-detalhe">
        <Icone nome="book" tam={36} />
        <p>Selecione uma referência para ver e editar os detalhes, notas, PICO e formatação ABNT/APA/Vancouver.</p>
      </aside>
    );
  }

  const salvarCsl = (patch) => {
    const novoCsl = { ...csl, ...patch };
    Object.keys(novoCsl).forEach((k) => {
      if (novoCsl[k] === '' || novoCsl[k] === undefined) delete novoCsl[k];
    });
    onAtualizar(refItem.id, { csl: novoCsl, metadadosIncompletos: false });
  };

  const completarPorDoiOuPmid = async () => {
    try {
      setBuscandoDoi(true);
      let novo = null;
      if (csl.DOI) novo = await window.api.meta.doi(csl.DOI);
      else if (csl.PMID) novo = await window.api.meta.pmid(csl.PMID);
      else if (csl.ISBN) novo = await window.api.meta.isbn(csl.ISBN);
      if (!novo) {
        avisar('Preencha um DOI, PMID ou ISBN antes de buscar.', 'erro');
        return;
      }
      onAtualizar(refItem.id, { csl: { ...csl, ...novo, id: refItem.id }, metadadosIncompletos: false });
      avisar('Metadados atualizados com sucesso!', 'ok');
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setBuscandoDoi(false);
    }
  };

  const copiar = async (tipo) => {
    try {
      await window.api.cit.copiar({ ids: [refItem.id], estilo, idioma, tipo });
      avisar(
        tipo === 'citacao'
          ? 'Citação copiada! Cole no Word com Ctrl+V.'
          : 'Referência bibliográfica copiada! Cole no Word com Ctrl+V.',
        'ok'
      );
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const adicionarTag = (e) => {
    e.preventDefault();
    const t = novaTag.trim();
    if (!t) return;
    if (!(refItem.tags || []).includes(t)) {
      onAtualizar(refItem.id, { tags: [...(refItem.tags || []), t] });
    }
    setNovaTag('');
  };

  const removerTag = (t) => {
    onAtualizar(refItem.id, { tags: (refItem.tags || []).filter((x) => x !== t) });
  };

  const alternarColecao = (colId) => {
    const atual = refItem.colecoes || [];
    const nova = atual.includes(colId) ? atual.filter((x) => x !== colId) : [...atual, colId];
    onAtualizar(refItem.id, { colecoes: nova });
  };

  const campos = camposDoTipo(csl.type || 'article-journal');

  return (
    <aside className="painel-detalhe">
      {/* Cabeçalho com Status (Consultada vs Citada) e Favorito */}
      <div className="detalhe-topo">
        <div className="status-pills" role="group" aria-label="Status da referência">
          {STATUS.map((s) => (
            <button
              key={s.id}
              className={`pill-status ${refItem.status === s.id ? 'ativo' : ''}`}
              style={{ '--cor-status': s.cor }}
              onClick={() => onAtualizar(refItem.id, { status: s.id })}
              title={`Marcar como "${s.nome}"`}
            >
              <span className="ponto-status" style={{ background: s.cor }} />
              {s.nome}
            </button>
          ))}
        </div>
        <div className="detalhe-acoes-topo">
          <button
            className={`btn-icone ${refItem.favorito ? 'favorito-ativo' : ''}`}
            onClick={() => onAtualizar(refItem.id, { favorito: !refItem.favorito })}
            title={refItem.favorito ? 'Remover dos favoritos' : 'Marcar como favorito'}
          >
            <Icone nome="star" cheio={refItem.favorito} />
          </button>
          <button
            className="btn-icone perigo"
            onClick={() => onExcluir([refItem.id])}
            title="Mover para a lixeira"
          >
            <Icone nome="trash" />
          </button>
        </div>
      </div>

      {/* Título resumido */}
      <div className="detalhe-cabecalho">
        {refItem.retratado && (
          <div className="alerta-retratado">
            ⚠ ATENÇÃO: Este artigo consta como RETRATADO nas bases científicas!
          </div>
        )}
        <h4>{semHtml(csl.title) || '(Sem título)'}</h4>
        {/* Barra de PDF */}
        <div className="barra-pdf">
          {refItem.pdf ? (
            <>
              <button
                className="btn primario pequeno"
                onClick={() => onAbrirLeitorPdf?.(refItem)}
                title="Abrir no leitor interno com grifos e anotações"
              >
                <Icone nome="book" tam={14} /> Ler e Grifar PDF
              </button>
              <button
                className="btn secundario pequeno"
                onClick={() => window.api.bib.abrirPdf(refItem.id).catch((e) => avisar(e.message, 'erro'))}
                title="Abrir no navegador externo (Chrome/Edge) ou leitor padrão do Windows"
              >
                <Icone nome="file" tam={14} /> ↗ Abrir no Navegador
              </button>
              <button
                className="btn fantasma pequeno"
                onClick={() => window.api.bib.mostrarPdf(refItem.id)}
                title="Mostrar arquivo na pasta do Windows Explorer"
              >
                <Icone nome="folder" tam={14} /> 📁 Mostrar na Pasta
              </button>
              <button
                className="btn fantasma pequeno"
                onClick={() => onAnexarPdf(refItem.id)}
                title="Substituir o PDF anexado por outro arquivo do computador"
              >
                <Icone nome="upload" tam={14} /> Trocar PDF
              </button>
            </>
          ) : (
            <>
              <button
                className="btn primario pequeno"
                onClick={() => onAnexarPdf(refItem.id)}
                title="Escolher um arquivo PDF que você baixou no seu computador para vincular a esta referência"
              >
                <Icone nome="upload" tam={14} /> 📎 Anexar PDF do PC
              </button>
              {(csl.DOI || csl.PMID) && (
                <button
                  className="btn secundario pequeno"
                  onClick={buscarPdfGratuito}
                  disabled={buscandoPdfOa}
                  title="Procura e baixa automaticamente o PDF em Acesso Aberto (Unpaywall / OpenAlex / Europe PMC)"
                >
                  {buscandoPdfOa ? 'Buscando PDF…' : '⬇ Baixar Automático'}
                </button>
              )}
              <button
                className="btn secundario pequeno"
                onClick={abrirBuscaManualPdf}
                title="Abre o Google Acadêmico com o título/DOI deste artigo para você baixar o PDF manualmente"
              >
                🌐 Buscar PDF no Google
              </button>
            </>
          )}
          {csl.DOI && (
            <button
              className="btn fantasma pequeno"
              onClick={() => window.api.sistema.abrirLink(`https://doi.org/${csl.DOI}`)}
              title="Abrir página do DOI no navegador"
            >
              <Icone nome="external" tam={14} /> DOI
            </button>
          )}
          {csl.PMID && (
            <button
              className="btn fantasma pequeno"
              onClick={() => window.api.sistema.abrirLink(`https://pubmed.ncbi.nlm.nih.gov/${csl.PMID}/`)}
              title="Abrir no PubMed"
            >
              <Icone nome="external" tam={14} /> PubMed
            </button>
          )}
        </div>
      </div>

      {/* Abas do detalhe */}
      <div className="abas-detalhe abas-4">
        <button className={aba === 'dados' ? 'ativa' : ''} onClick={() => setAba('dados')}>
          Metadados
        </button>
        <button className={aba === 'fichamento' ? 'ativa' : ''} onClick={() => setAba('fichamento')}>
          Notas &amp; PICO
        </button>
        <button className={aba === 'citacao' ? 'ativa' : ''} onClick={() => setAba('citacao')}>
          Citar
        </button>
        <button
          className={aba === 'rede' ? 'ativa' : ''}
          onClick={() => {
            setAba('rede');
            if (!rede && (csl.DOI || csl.PMID)) carregarRedeCitacoes();
          }}
        >
          Rede Citações
        </button>
      </div>

      <div className="detalhe-corpo">
        {aba === 'rede' && (
          <div className="secao-rede">
            <div className="barra-pdf" style={{ marginBottom: 10 }}>
              <button className="btn pequeno secundario" onClick={carregarRedeCitacoes} disabled={carregandoRede}>
                <Icone nome="refresh" tam={13} />{' '}
                {carregandoRede ? 'Consultando OpenAlex…' : 'Atualizar Rede de Citações'}
              </button>
              {rede && (
                <span className="pill-contagem">
                  Citado por <strong>{rede.totalCitacoes}</strong> trabalhos
                </span>
              )}
            </div>

            {!rede && !carregandoRede && (
              <p className="dica-texto">
                Descubra quem citou este artigo e quais obras ele referenciou (Snowballing / estilo Research Rabbit). Requer DOI ou PMID.
              </p>
            )}

            {rede && (
              <>
                <h5>Artigos que CITAM este trabalho ({rede.citantes.length} principais)</h5>
                {rede.citantes.map((it) => (
                  <div key={it.idOpenAlex} className="item-resultado-modal">
                    <div>
                      <strong>{it.titulo}</strong>
                      <div className="sub-meta">
                        {[it.autores, it.ano, it.fonte, `${it.citacoes} citações`].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <button
                      className="btn pequeno primario"
                      onClick={async () => {
                        if (it.doi) {
                          const novoCsl = await window.api.meta.doi(it.doi);
                          await onImportarCsl(novoCsl, 'a_ler');
                          avisar('Artigo importado para a fila "A ler"!', 'ok');
                        }
                      }}
                    >
                      + A ler
                    </button>
                  </div>
                ))}

                <h5 style={{ marginTop: 14 }}>Referências citadas POR este artigo ({rede.referenciadas.length})</h5>
                {rede.referenciadas.map((it) => (
                  <div key={it.idOpenAlex} className="item-resultado-modal">
                    <div>
                      <strong>{it.titulo}</strong>
                      <div className="sub-meta">
                        {[it.autores, it.ano, it.fonte, `${it.citacoes} citações`].filter(Boolean).join(' · ')}
                      </div>
                    </div>
                    <button
                      className="btn pequeno secundario"
                      onClick={async () => {
                        if (it.doi) {
                          const novoCsl = await window.api.meta.doi(it.doi);
                          await onImportarCsl(novoCsl, 'a_ler');
                          avisar('Referência importada para a fila "A ler"!', 'ok');
                        }
                      }}
                    >
                      + A ler
                    </button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {aba === 'citacao' && (
          <div className="secao-citacao">
            <div className="caixa-previa">
              <div className="caixa-previa-topo">
                <span>Citação no texto</span>
                <button className="btn pequeno primario" onClick={() => copiar('citacao')}>
                  <Icone nome="copy" tam={13} /> Copiar citação
                </button>
              </div>
              <div
                className="previa-html"
                dangerouslySetInnerHTML={{ __html: previa.citacao || '<em>—</em>' }}
              />
            </div>

            <div className="caixa-previa">
              <div className="caixa-previa-topo">
                <span>Entrada na lista de referências</span>
                <button className="btn pequeno primario" onClick={() => copiar('bibliografia')}>
                  <Icone nome="copy" tam={13} /> Copiar referência
                </button>
              </div>
              <div
                className="previa-html"
                dangerouslySetInnerHTML={{ __html: previa.bibliografiaHtml || '<em>—</em>' }}
              />
            </div>

            <p className="dica-texto">
              Ao copiar e colar no Word (Ctrl+V), o texto já vai com itálico/negrito e espaçamento da norma selecionada no topo.
            </p>

            {/* Registro de Trechos Citados deste artigo + Parágrafo e Linha no Word */}
            <div className="bloco-pico" style={{ marginTop: 14 }}>
              <h5>📍 Em qual Parágrafo/Linha você citou no Word e Qual Trecho do Artigo ({grifos.length})</h5>
              <form onSubmit={adicionarTrechoCitado} style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10 }}>
                <div style={{ display: 'flex', gap: 6 }}>
                  <input
                    style={{ flex: 1 }}
                    value={ondeCitei}
                    onChange={(e) => setOndeCitei(e.target.value)}
                    placeholder="Onde usou no Word? (ex.: Parágrafo §4 · Linha 18 · Introdução)"
                  />
                  <input
                    style={{ width: 92 }}
                    value={novaPag}
                    onChange={(e) => setNovaPag(e.target.value)}
                    placeholder="Pág. PDF (ex: 5)"
                  />
                </div>
                <input
                  value={novaFraseWord}
                  onChange={(e) => setNovaFraseWord(e.target.value)}
                  placeholder="Frase como ficou escrita no seu Word (opcional)…"
                />
                <textarea
                  rows={2}
                  value={novoTrecho}
                  onChange={(e) => setNovoTrecho(e.target.value)}
                  placeholder="Trecho exato do artigo original que fundamentou sua citação…"
                />
                <button type="submit" className="btn pequeno primario">
                  + Salvar Parágrafo/Linha do Word e Trecho do Artigo
                </button>
              </form>

              {grifos.length === 0 ? (
                <p className="dica-texto">
                  Nenhum trecho registrado ainda. Ao rodar a <strong>✔ Auditoria Reversa (.DOCX)</strong>, o programa preenche sozinho o <strong>Parágrafo, a Linha, a Frase do seu Word e o Trecho/Página do Artigo</strong> aqui!
                </p>
              ) : (
                <div className="lista-grifos">
                  {grifos.map((g) => (
                    <div key={g.id} className="card-grifo" style={{ borderLeftColor: g.citadoNoTexto ? '#2563eb' : '#fde047' }}>
                      <div className="card-grifo-topo">
                        <strong>
                          📍 {g.ondeCitei || (g.numParagrafo ? `Parágrafo §${g.numParagrafo} · Linha ${g.numLinha}` : 'No trabalho')}{' '}
                          · 📄 Pág. {g.pagina} do PDF {g.citadoNoTexto ? '· ✓ CITADO' : ''}
                        </strong>
                        <button className="btn-icone perigo" onClick={() => removerTrecho(g.id)}>
                          <Icone nome="trash" tam={12} />
                        </button>
                      </div>
                      {g.fraseWord && (
                        <div style={{ fontSize: 12, marginTop: 4, color: 'var(--texto)' }}>
                          <strong>📝 Frase no seu Word:</strong> <em>"{g.fraseWord}"</em>
                        </div>
                      )}
                      {g.trecho && (
                        <blockquote style={{ marginTop: 4 }}>
                          <strong>📄 Trecho do Artigo (p. {g.pagina}):</strong> "{g.trecho}"
                        </blockquote>
                      )}
                      {g.nota && g.nota !== `No PDF (p. ${g.pagina}): "${g.trecho}"` && <p>{g.nota}</p>}
                      <div className="acoes-grifo" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {refItem.pdf && (
                          <button
                            className="btn pequeno primario"
                            onClick={() => onAbrirLeitorPdf?.(refItem, g.pagina)}
                          >
                            📖 Abrir PDF na Pág. {g.pagina}
                          </button>
                        )}
                        <button
                          className="btn pequeno secundario"
                          onClick={() => {
                            const aut = (autoresResumo(csl) || 'AUTOR').toUpperCase();
                            const a = ano(csl) || 's.d.';
                            window.api.sistema.copiarTexto(`"${g.trecho}" (${aut}, ${a}, p. ${g.pagina})`);
                            avisar('Citação direta com página copiada para colar no Word!', 'ok');
                          }}
                        >
                          <Icone nome="copy" tam={12} /> Copiar citação direta c/ pág.
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {aba === 'fichamento' && (
          <div className="secao-fichamento">
            {/* Quadro de Nota e Qualidade da Revista + Nível e Nota do Artigo também visível em Notas & PICO */}
            <div className="quadro-resumo-qualidade">
              <div className="quadro-resumo-topo">
                <span className="quadro-resumo-titulo">
                  🏆 NOTA &amp; QUALIDADE DA REVISTA · IMPACTO E NÍVEL DO ARTIGO
                </span>
                <button
                  className="btn pequeno primario"
                  onClick={() => gerarInsightsEPicoAutomatico(true)}
                  disabled={gerandoInsights}
                >
                  {gerandoInsights ? '⏳ Atualizando…' : '✨ Atualizar Nota & PICO'}
                </button>
              </div>
              <div className="grade-score-qualidade" style={{ marginBottom: 0 }}>
                <div className="card-score-item revista">
                  <div className="card-score-cabecalho">
                    <span className="card-score-rotulo">🏛️ Nota Atual e Qualidade da Revista</span>
                    <span className="pilula-nota-grande azul">
                      Nota {insights.notaRevista != null ? `${insights.notaRevista}/10` : '—'}
                      {insights.quartil && insights.quartil !== '—' ? ` · ${insights.quartil} (Qualis ${insights.qualisEstimado})` : ''}
                    </span>
                  </div>
                  <div className="card-score-principal">
                    {insights.nomeRevista || csl['container-title'] || 'Periódico científico'}
                  </div>
                  <div className="card-score-metricas">
                    <span className="chip-metrica-qualidade">
                      📈 Fator de Impacto (2 anos): <strong>{insights.fi2Anos ?? 'N/D'}</strong>
                    </span>
                    <span className="chip-metrica-qualidade">
                      🏅 H-Index da Revista: <strong>{insights.hIndexRevista ?? 'N/D'}</strong>
                    </span>
                    <span className="chip-metrica-qualidade">
                      🎖️ {insights.seloRevista || 'Periódico Indexado'}
                    </span>
                  </div>
                </div>

                <div className="card-score-item artigo">
                  <div className="card-score-cabecalho">
                    <span className="card-score-rotulo">🌟 Nota Atual e Impacto do Artigo</span>
                    <span className="pilula-nota-grande verde">
                      ★ {insights.notaArtigo != null ? `${insights.notaArtigo}/10` : '—'} · {insights.citacoes ?? 0} citações
                    </span>
                  </div>
                  <div className="card-score-principal">
                    {insights.classificacaoArtigo || 'Impacto científico avaliado'}
                  </div>
                  <div className="card-score-metricas">
                    <span className="chip-metrica-qualidade">
                      📊 Média: <strong>{insights.citacoesPorAno ?? 0} cit./ano</strong>
                    </span>
                    {insights.fwci != null && (
                      <span className="chip-metrica-qualidade">
                        ⚡ FWCI (Impacto Relativo): <strong>{insights.fwci}x</strong>
                      </span>
                    )}
                    {insights.percentil != null && (
                      <span className="chip-metrica-qualidade">
                        🔝 Top <strong>{Math.max(1, 100 - insights.percentil)}%</strong> da área
                      </span>
                    )}
                  </div>
                </div>

                <div className="card-score-item evidencia">
                  <div className="card-score-cabecalho">
                    <span className="card-score-rotulo">🩺 Nível do Artigo (Evidência Científica)</span>
                    <span className="pilula-nota-grande roxo">
                      NÍVEL {(refItem.nivelEvidencia || insights.nivelId || '4').toUpperCase()}
                    </span>
                  </div>
                  <div className="card-score-principal">
                    {insights.nivelNome || 'Estudo científico'}
                  </div>
                </div>
              </div>
            </div>

            <label className="campo">
              <span className="campo-rotulo">Nível de evidência / delineamento (Saúde — detectado automaticamente)</span>
              <select
                value={refItem.nivelEvidencia || ''}
                onChange={(e) => onAtualizar(refItem.id, { nivelEvidencia: e.target.value })}
              >
                {NIVEIS_EVIDENCIA.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.nome}
                  </option>
                ))}
              </select>
            </label>

            <Campo
              rotulo="Fichamento / anotações de leitura"
              valor={refItem.notas || ''}
              multilinha
              linhas={7}
              placeholder="Principais achados, citações diretas com página, limitações metodológicas, onde usar na tese/artigo…"
              onSalvar={(v) => onAtualizar(refItem.id, { notas: v })}
            />

            <div className="bloco-pico">
              <h5>Resumo estruturado PICO (preenchido automaticamente quando aplicável)</h5>
              <Campo
                rotulo="P – População / Problema"
                valor={pico.p || ''}
                placeholder="Ex.: Adultos com diabetes tipo 2"
                onSalvar={(v) => onAtualizar(refItem.id, { pico: { ...pico, p: v } })}
              />
              <Campo
                rotulo="I – Intervenção / Exposição"
                valor={pico.i || ''}
                placeholder="Ex.: Exercício aeróbico + resistido 3x/sem"
                onSalvar={(v) => onAtualizar(refItem.id, { pico: { ...pico, i: v } })}
              />
              <Campo
                rotulo="C – Comparador / Controle"
                valor={pico.c || ''}
                placeholder="Ex.: Cuidado usual / sem exercício supervisionado"
                onSalvar={(v) => onAtualizar(refItem.id, { pico: { ...pico, c: v } })}
              />
              <Campo
                rotulo="O – Desfechos (Outcomes) e resultados principais"
                valor={pico.o || ''}
                multilinha
                linhas={3}
                placeholder="Ex.: Redução de HbA1c em -0,6% (IC95% -0,9 a -0,3; p<0,001)"
                onSalvar={(v) => onAtualizar(refItem.id, { pico: { ...pico, o: v } })}
              />
            </div>

            {/* Coleções */}
            <div className="bloco-tags">
              <span className="campo-rotulo">Coleções / capítulos</span>
              {colecoes.length === 0 ? (
                <p className="dica-texto">Crie coleções na barra lateral esquerda (ex.: "Cap. 1 – Introdução").</p>
              ) : (
                <div className="lista-chips">
                  {colecoes.map((c) => {
                    const ativo = (refItem.colecoes || []).includes(c.id);
                    return (
                      <button
                        key={c.id}
                        className={`chip ${ativo ? 'ativo' : ''}`}
                        onClick={() => alternarColecao(c.id)}
                      >
                        <Icone nome="folder" tam={12} /> {c.nome}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Tags */}
            <div className="bloco-tags">
              <span className="campo-rotulo">Etiquetas (tags)</span>
              <div className="lista-chips">
                {(refItem.tags || []).map((t) => (
                  <span key={t} className="chip ativo">
                    #{t}
                    <button onClick={() => removerTag(t)} title="Remover tag">
                      ×
                    </button>
                  </span>
                ))}
              </div>
              <form onSubmit={adicionarTag} className="linha-form">
                <input
                  value={novaTag}
                  onChange={(e) => setNovaTag(e.target.value)}
                  placeholder="Nova tag (Enter para adicionar)…"
                />
                <button type="submit" className="btn pequeno secundario">
                  Adicionar
                </button>
              </form>
            </div>
          </div>
        )}

        {aba === 'dados' && (
          <div className="secao-dados">
            <div className="linha-tipo">
              <label className="campo">
                <span className="campo-rotulo">Tipo de documento</span>
                <select
                  value={csl.type || 'article-journal'}
                  onChange={(e) => salvarCsl({ type: e.target.value })}
                >
                  {TIPOS.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="btn pequeno secundario"
                onClick={completarPorDoiOuPmid}
                disabled={buscandoDoi}
                title="Preenche automaticamente os campos a partir do DOI, PMID ou ISBN"
              >
                <Icone nome="refresh" tam={13} /> {buscandoDoi ? 'Buscando…' : 'Completar por DOI/PMID'}
              </button>
            </div>

            <Campo
              rotulo="Título"
              valor={csl.title || ''}
              multilinha
              linhas={2}
              onSalvar={(v) => salvarCsl({ title: v })}
            />

            {/* QUADRO UNIFICADO DE RESUMO + NOTA & QUALIDADE DA REVISTA + NOTA & NÍVEL DO ARTIGO */}
            <div className="quadro-resumo-qualidade">
              <div className="quadro-resumo-topo">
                <span className="quadro-resumo-titulo">
                  🏆 QUADRO DE RESUMO · NOTA &amp; QUALIDADE DA REVISTA E DO ARTIGO
                </span>
                <button
                  className="btn pequeno primario"
                  onClick={() => gerarInsightsEPicoAutomatico(true)}
                  disabled={gerandoInsights}
                  title="Consulta OpenAlex, PubMed e PDF para atualizar a Nota da Revista, Fator de Impacto, Nota do Artigo, Resumo e PICO"
                >
                  {gerandoInsights ? '⏳ Atualizando…' : '✨ Atualizar Nota & Resumo'}
                </button>
              </div>

              <div className="grade-score-qualidade">
                {/* 1. NOTA E QUALIDADE DA REVISTA */}
                <div className="card-score-item revista">
                  <div className="card-score-cabecalho">
                    <span className="card-score-rotulo">🏛️ Nota Atual &amp; Qualidade da Revista</span>
                    <span className="pilula-nota-grande azul">
                      Nota {insights.notaRevista != null ? `${insights.notaRevista}/10` : '—'}
                      {insights.quartil && insights.quartil !== '—' ? ` · ${insights.quartil} (Qualis ${insights.qualisEstimado})` : ''}
                    </span>
                  </div>
                  <div className="card-score-principal">
                    {insights.nomeRevista || csl['container-title'] || 'Periódico científico'}
                  </div>
                  <div className="card-score-metricas">
                    <span className="chip-metrica-qualidade">
                      📈 Fator de Impacto (2 anos): <strong>{insights.fi2Anos ?? 'N/D'}</strong>
                    </span>
                    <span className="chip-metrica-qualidade">
                      🏅 H-Index da Revista: <strong>{insights.hIndexRevista ?? 'N/D'}</strong>
                    </span>
                    <span className="chip-metrica-qualidade">
                      🎖️ {insights.seloRevista || 'Periódico Indexado'}
                    </span>
                  </div>
                </div>

                {/* 2. NOTA E IMPACTO DO ARTIGO */}
                <div className="card-score-item artigo">
                  <div className="card-score-cabecalho">
                    <span className="card-score-rotulo">🌟 Nota Atual &amp; Impacto do Artigo</span>
                    <span className="pilula-nota-grande verde">
                      ★ {insights.notaArtigo != null ? `${insights.notaArtigo}/10` : '—'} · {insights.citacoes ?? 0} citações
                    </span>
                  </div>
                  <div className="card-score-principal">
                    {insights.classificacaoArtigo || 'Impacto científico avaliado'}
                  </div>
                  <div className="card-score-metricas">
                    <span className="chip-metrica-qualidade">
                      📊 Média: <strong>{insights.citacoesPorAno ?? 0} cit./ano</strong>
                    </span>
                    {insights.fwci != null && (
                      <span className="chip-metrica-qualidade">
                        ⚡ FWCI (Impacto Relativo): <strong>{insights.fwci}x</strong>
                      </span>
                    )}
                    {insights.percentil != null && (
                      <span className="chip-metrica-qualidade">
                        🔝 Top <strong>{Math.max(1, 100 - insights.percentil)}%</strong> da área
                      </span>
                    )}
                  </div>
                </div>

                {/* 3. NÍVEL DE EVIDÊNCIA DO ARTIGO */}
                <div className="card-score-item evidencia">
                  <div className="card-score-cabecalho">
                    <span className="card-score-rotulo">🩺 Nível do Artigo &amp; Delineamento (Oxford CEBM)</span>
                    <span className="pilula-nota-grande roxo">
                      NÍVEL {(refItem.nivelEvidencia || insights.nivelId || '4').toUpperCase()}
                    </span>
                  </div>
                  <div className="card-score-principal">
                    {insights.nivelNome || 'Estudo científico'}
                  </div>
                </div>
              </div>

              <Campo
                rotulo="📄 Resumo Completo do Artigo (Abstract + Síntese da Nota)"
                valor={csl.abstract || ''}
                multilinha
                linhas={9}
                onSalvar={(v) => salvarCsl({ abstract: v })}
              />
            </div>

            {/* Resumo rápido de onde esta referência foi citada no Word (Parágrafo, Linha e Trecho do Artigo) */}
            {(refItem.ocorrenciasWord?.length > 0 || grifos.length > 0) && (
              <div className="bloco-pico" style={{ marginBottom: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                  <h5 style={{ margin: 0, color: 'var(--primaria)' }}>
                    📍 Onde você usou no Word ({refItem.ocorrenciasWord?.length || grifos.length}x) &amp; Trecho do Artigo
                  </h5>
                  <button className="btn pequeno fantasma" onClick={() => setAba('citacao')}>
                    Ver / Editar todos →
                  </button>
                </div>
                {(refItem.ocorrenciasWord?.length ? refItem.ocorrenciasWord : grifos).map((oc, i) => {
                  const pag = oc.paginaPdf || oc.paginaDeclarada || oc.pagina || null;
                  const trechoArtigo = oc.trechoPdf || oc.trechoArtigoResumo || oc.trecho || '';
                  const fraseNoWord = oc.fraseContexto || oc.fraseWord || '';
                  const rotuloLoc = oc.numParagrafo
                    ? `Parágrafo §${oc.numParagrafo} · Linha ${oc.numLinha}${oc.secao ? ` (${oc.secao})` : ''}`
                    : oc.ondeCitei || `Ocorrência ${i + 1}`;
                  return (
                    <div
                      key={i}
                      style={{
                        padding: '6px 9px',
                        borderRadius: 6,
                        background: 'var(--painel)',
                        border: '1px solid var(--borda)',
                        borderLeft: '3px solid #2563eb',
                        marginBottom: 5,
                        fontSize: 11.8,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}>
                        <strong style={{ color: '#1e3a8a' }}>
                          📍 {rotuloLoc} {pag ? `· 📄 Pág. ${pag} do PDF` : ''}
                        </strong>
                        {refItem.pdf && pag && (
                          <button
                            className="btn pequeno primario"
                            style={{ padding: '1px 7px', fontSize: 11 }}
                            onClick={() => onAbrirLeitorPdf?.(refItem, pag)}
                          >
                            📖 Pág. {pag}
                          </button>
                        )}
                      </div>
                      {fraseNoWord && (
                        <div style={{ marginTop: 3 }}>
                          <strong>No seu Word:</strong> <em>"{fraseNoWord}"</em>
                        </div>
                      )}
                      {trechoArtigo && trechoArtigo !== fraseNoWord && (
                        <div style={{ marginTop: 2, color: 'var(--texto-suave)' }}>
                          <strong>Trecho no Artigo:</strong> "{trechoArtigo}"
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            <Campo
              rotulo="Autores (um por linha: Sobrenome, Nome)"
              valor={autoresParaTexto(csl.author)}
              multilinha
              linhas={3}
              dica="Para autor institucional, coloque entre chaves: {Ministério da Saúde}"
              onSalvar={(v) => salvarCsl({ author: textoParaAutores(v) })}
            />

            <div className="grade-2">
              <Campo
                rotulo="Data / Ano (AAAA ou AAAA-MM-DD)"
                valor={dataParaTexto(csl.issued)}
                onSalvar={(v) => salvarCsl({ issued: textoParaData(v) })}
              />
              <Campo
                rotulo="PMID (PubMed)"
                valor={csl.PMID || ''}
                onSalvar={(v) => salvarCsl({ PMID: v.trim() })}
              />
            </div>

            {campos.map(([chave, rotulo]) => (
              <Campo
                key={chave}
                rotulo={rotulo}
                valor={csl[chave] || ''}
                onSalvar={(v) => salvarCsl({ [chave]: v })}
              />
            ))}

            <div className="rodape-id">
              <span>Arquivo: <code>{refItem.id}.json</code></span>
            </div>
          </div>
        )}
      </div>
    </aside>
  );
}
