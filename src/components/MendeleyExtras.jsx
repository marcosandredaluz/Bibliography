import React, { useEffect, useMemo, useState } from 'react';
import { Icone, useAviso } from './ui.jsx';
import { autoresResumo, ano, semHtml } from '../lib/csl.js';

export default function MendeleyExtras({ refs, onImportarCsl, onImportarPdfs }) {
  const avisar = useAviso();
  const [aba, setAba] = useState('rabbit'); // 'rabbit' | 'caderno' | 'downloads' | 'estatisticas'

  // 1. ResearchRabbit (Artigo Semente -> Trabalhos Anteriores, Posteriores, Similares e Grafo Visual)
  const [sementeId, setSementeId] = useState('');
  const [buscaDoiDireto, setBuscaDoiDireto] = useState('');
  const [redeRabbit, setRedeRabbit] = useState(null);
  const [noSelecionado, setNoSelecionado] = useState(null);
  const [carregandoRabbit, setCarregandoRabbit] = useState(false);
  const [historicoNavegacao, setHistoricoNavegacao] = useState([]); // Pilha de navegação (snowballing recursivo)
  const [modoVisualizacao, setModoVisualizacao] = useState('colunas'); // 'colunas' | 'timeline' | 'grafo'
  const [termoFiltro, setTermoFiltro] = useState('');
  const [filtroSoOa, setFiltroSoOa] = useState(false);
  const [importandoItens, setImportandoItens] = useState({}); // { [chave]: 'salvando' | 'baixando_pdf' | 'concluido' }

  // 2. Caderno de Síntese (Mendeley Notebook)
  const [paginas, setPaginas] = useState([]);
  const [pagAtivaId, setPagAtivaId] = useState(null);
  const [todosGrifos, setTodosGrifos] = useState([]);

  // 3. Pasta Monitorada (Downloads)
  const [downloads, setDownloads] = useState({ pasta: '', arquivos: [] });

  useEffect(() => {
    window.api.mendeley.lerCaderno().then((lista) => {
      setPaginas(lista);
      if (lista[0]) setPagAtivaId(lista[0].id);
    });
    window.api.mendeley.listarPdfsDownloads().then(setDownloads).catch(() => {});
  }, []);

  useEffect(() => {
    if (!sementeId && refs.length > 0) {
      const comDoi = refs.find((r) => r.csl?.DOI || r.csl?.PMID) || refs[0];
      if (comDoi) setSementeId(comDoi.id);
    }
  }, [refs, sementeId]);

  useEffect(() => {
    (async () => {
      const acum = [];
      for (const r of refs.slice(0, 60)) {
        try {
          const gs = await window.api.bib.lerGrifos(r.id);
          for (const g of gs || []) {
            acum.push({
              ...g,
              refId: r.id,
              autorAno: `${(autoresResumo(r.csl) || 'AUTOR').toUpperCase()}, ${ano(r.csl) || 's.d.'}`,
              tituloRef: semHtml(r.csl?.title),
            });
          }
        } catch {}
      }
      setTodosGrifos(acum);
    })();
  }, [refs]);

  const pagAtiva = paginas.find((p) => p.id === pagAtivaId) || paginas[0];

  const salvarPaginas = async (novas) => {
    setPaginas(novas);
    await window.api.mendeley.salvarCaderno(novas);
  };

  const atualizarConteudoPag = (novoTexto) => {
    if (!pagAtiva) return;
    const novas = paginas.map((p) =>
      p.id === pagAtiva.id ? { ...p, conteudo: novoTexto, atualizadoEm: new Date().toISOString() } : p
    );
    salvarPaginas(novas);
  };

  const criarPaginaCaderno = () => {
    const nova = {
      id: 'p-' + Date.now().toString(36),
      titulo: `Página ${paginas.length + 1} — Novo Tópico`,
      conteudo: '',
      atualizadoEm: new Date().toISOString(),
    };
    const novas = [...paginas, nova];
    salvarPaginas(novas);
    setPagAtivaId(nova.id);
  };

  const inserirNoCaderno = (textoInserir) => {
    if (!pagAtiva) return;
    const novo = [pagAtiva.conteudo || '', textoInserir].filter(Boolean).join('\n\n');
    atualizarConteudoPag(novo);
    avisar('Trecho inserido na página ativa do Caderno!', 'ok');
  };

  // Mapear rede da semente inicial ou da biblioteca
  const explorarResearchRabbit = async (idAlvo = sementeId, empilharHistorico = false) => {
    const refSemente = refs.find((r) => r.id === idAlvo) || refs.find((r) => r.csl?.DOI || r.csl?.PMID) || refs[0];
    if (!refSemente) {
      avisar('Escolha um artigo na biblioteca ou digite um DOI/título para começar.', 'info');
      return;
    }

    if (empilharHistorico && redeRabbit) {
      setHistoricoNavegacao((ant) => [...ant, redeRabbit]);
    } else if (!empilharHistorico) {
      setHistoricoNavegacao([]);
    }

    setCarregandoRabbit(true);
    setNoSelecionado(null);
    try {
      let anteriores = [];
      let posteriores = [];
      let similares = [];
      let sementeResumo = semHtml(refSemente.csl?.abstract || '');

      if (refSemente.csl?.DOI || refSemente.csl?.PMID) {
        try {
          const rede = await window.api.meta.redeCitacoes(refSemente.id);
          anteriores = rede.referenciadas || [];
          posteriores = rede.citantes || [];
          if (!sementeResumo && rede.obraSemente?.resumo) {
            sementeResumo = rede.obraSemente.resumo;
          }
        } catch {}
      }

      if (refSemente.csl?.title) {
        try {
          similares = await window.api.busc.resultados('openalex', semHtml(refSemente.csl.title).slice(0, 90));
        } catch {}
      }

      setRedeRabbit({
        sementeId: refSemente.id,
        sementeTitulo: semHtml(refSemente.csl?.title) || 'Artigo Semente',
        sementeAutorAno: `${autoresResumo(refSemente.csl) || 'Autor'} (${ano(refSemente.csl) || 's.d.'})`,
        sementeAno: Number(ano(refSemente.csl)) || new Date().getFullYear(),
        sementeDoi: refSemente.csl?.DOI || null,
        sementeFonte: refSemente.csl?.['container-title'] || '',
        sementeResumo,
        anteriores,
        posteriores,
        similares: similares || [],
      });
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setCarregandoRabbit(false);
    }
  };

  useEffect(() => {
    if (sementeId && !redeRabbit && !carregandoRabbit) {
      explorarResearchRabbit(sementeId);
    }
  }, [sementeId]);

  // Navegar recursivamente para qualquer nó (Tornar Nova Semente / Snowballing)
  const navegarParaNovaSemente = async (item) => {
    if (!item) return;
    if (redeRabbit) {
      setHistoricoNavegacao((ant) => [...ant, redeRabbit]);
    }
    setCarregandoRabbit(true);
    setNoSelecionado(null);

    try {
      const rede = await window.api.meta.redeCitacoes({
        doi: item.doi,
        pmid: item.pmid,
        openAlexId: item.idOpenAlex,
      });

      let similares = [];
      if (item.titulo) {
        try {
          similares = await window.api.busc.resultados('openalex', item.titulo.slice(0, 90));
        } catch {}
      }

      const anoNum = Number(item.ano) || new Date().getFullYear();
      setRedeRabbit({
        sementeId: item.idOpenAlex || item.doi || item.titulo,
        sementeTitulo: item.titulo,
        sementeAutorAno: `${(item.autores || 'Autor').split(',')[0]} (${item.ano || 's.d.'})`,
        sementeAno: anoNum,
        sementeDoi: item.doi,
        sementeFonte: item.fonte,
        sementeResumo: item.resumo || '',
        anteriores: rede.referenciadas || [],
        posteriores: rede.citantes || [],
        similares: similares || [],
      });

      avisar(`Rede atualizada para: "${item.titulo.slice(0, 50)}…"`, 'ok');
    } catch (e) {
      avisar(`Erro ao consultar rede deste artigo: ${e.message}`, 'erro');
    } finally {
      setCarregandoRabbit(false);
    }
  };

  // Voltar no histórico de navegação
  const voltarHistorico = () => {
    if (historicoNavegacao.length === 0) return;
    const anterior = historicoNavegacao[historicoNavegacao.length - 1];
    setHistoricoNavegacao((ant) => ant.slice(0, -1));
    setRedeRabbit(anterior);
    setNoSelecionado(null);
  };

  // Adicionar ao Meu Estudo (+ Baixar PDF de Acesso Aberto)
  const adicionarAoEstudoComPdf = async (item, tipoRelacao = 'Derivado') => {
    const chave = item.doi || item.idOpenAlex || item.titulo;
    setImportandoItens((ant) => ({ ...ant, [chave]: 'salvando' }));

    try {
      let csl = null;
      if (item.doi) {
        try {
          csl = await window.api.meta.doi(item.doi);
        } catch {}
      }
      if (!csl && item.pmid) {
        try {
          csl = await window.api.meta.pmid(item.pmid);
        } catch {}
      }
      if (!csl) {
        csl = {
          type: 'article-journal',
          title: item.titulo || '(Sem título)',
          author: item.autores
            ? item.autores.split(/,| e | and /).map((n) => ({ family: n.trim() }))
            : undefined,
          issued: item.ano ? { 'date-parts': [[Number(item.ano)]] } : undefined,
          'container-title': item.fonte || undefined,
          DOI: item.doi || undefined,
          PMID: item.pmid || undefined,
          abstract: item.resumo || undefined,
        };
      }

      // Adiciona tags de proveniência para organização na biblioteca
      const autorSementeCurto = redeRabbit?.sementeAutorAno?.split(' ')[0] || 'Semente';
      csl.note = `Importado via ResearchRabbit (${tipoRelacao} de ${redeRabbit?.sementeAutorAno || 'Artigo Semente'})`;

      const criada = await onImportarCsl(csl, 'a_ler');
      if (criada?.id) {
        setImportandoItens((ant) => ({ ...ant, [chave]: 'baixando_pdf' }));
        let baixouPdf = false;
        try {
          const resPdf = await window.api.meta.buscarPdfAberto(criada.id);
          if (resPdf?.baixado) baixouPdf = true;
        } catch {}

        if (baixouPdf) {
          setImportandoItens((ant) => ({ ...ant, [chave]: 'concluido_com_pdf' }));
          avisar(`Artigo e PDF baixados no seu estudo: "${item.titulo.slice(0, 45)}…"`, 'ok');
        } else {
          setImportandoItens((ant) => ({ ...ant, [chave]: 'concluido_sem_pdf' }));
          avisar(`Artigo adicionado ao estudo (PDF em acesso aberto indisponível no momento).`, 'info');
        }
      }
    } catch (e) {
      setImportandoItens((ant) => ({ ...ant, [chave]: 'erro' }));
      avisar(e.message, 'erro');
    }
  };

  const copiarCitacaoAbnt = (item) => {
    const primAutor = (item.autores || 'AUTOR').split(',')[0].toUpperCase();
    const texto = `${primAutor}. ${item.titulo}. ${item.fonte ? item.fonte + ', ' : ''}${item.ano || 's.d.'}.${item.doi ? ' DOI: https://doi.org/' + item.doi : ''}`;
    window.api.sistema.copiarTexto(texto);
    avisar('Citação copiada para a área de transferência!', 'ok');
  };

  const buscarSementePorDoiOuTitulo = async (e) => {
    e.preventDefault();
    const q = buscaDoiDireto.trim();
    if (!q) return;
    setCarregandoRabbit(true);
    try {
      const mDoi = q.match(/10\.\d{4,9}\/[^\s"'<>]+/i);
      let csl = null;
      if (mDoi) {
        csl = await window.api.meta.doi(mDoi[0].replace(/[.,;:)\]}]+$/, ''));
      } else {
        const res = await window.api.meta.buscar(q);
        if (res[0]?.doi) csl = await window.api.meta.doi(res[0].doi);
      }
      if (!csl) throw new Error('Artigo não encontrado por esse DOI ou título.');
      const criada = await onImportarCsl(csl, 'a_ler');
      setBuscaDoiDireto('');
      if (criada?.id) {
        setSementeId(criada.id);
        await explorarResearchRabbit(criada.id);
      }
    } catch (err) {
      avisar(err.message, 'erro');
    } finally {
      setCarregandoRabbit(false);
    }
  };

  // Filtragem e ordenação dos nós
  const filtrarLista = (lista = []) => {
    return lista.filter((it) => {
      if (filtroSoOa && !it.acessoAberto) return false;
      if (!termoFiltro.trim()) return true;
      const q = termoFiltro.toLowerCase();
      return (
        (it.titulo && it.titulo.toLowerCase().includes(q)) ||
        (it.autores && it.autores.toLowerCase().includes(q)) ||
        (it.fonte && it.fonte.toLowerCase().includes(q))
      );
    });
  };

  const anterioresFiltrados = useMemo(() => filtrarLista(redeRabbit?.anteriores || []), [redeRabbit, termoFiltro, filtroSoOa]);
  const posterioresFiltrados = useMemo(() => filtrarLista(redeRabbit?.posteriores || []), [redeRabbit, termoFiltro, filtroSoOa]);
  const similaresFiltrados = useMemo(() => filtrarLista(redeRabbit?.similares || []), [redeRabbit, termoFiltro, filtroSoOa]);

  // Organização cronológica para a Linha do Tempo ("Antes e Depois" Real)
  const timelineData = useMemo(() => {
    if (!redeRabbit) return { antesPorAno: [], depoisPorAno: [] };
    const anoSemente = redeRabbit.sementeAno || new Date().getFullYear();

    const agrupar = (lista) => {
      const mapa = {};
      lista.forEach((it) => {
        const a = Number(it.ano) || anoSemente;
        if (!mapa[a]) mapa[a] = [];
        mapa[a].push(it);
      });
      return Object.entries(mapa)
        .map(([a, itens]) => ({ ano: Number(a), itens }))
        .sort((a, b) => a.ano - b.ano);
    };

    return {
      antesPorAno: agrupar(anterioresFiltrados),
      depoisPorAno: agrupar(posterioresFiltrados),
    };
  }, [redeRabbit, anterioresFiltrados, posterioresFiltrados]);

  // Estatísticas da Biblioteca (Regra dos 5 anos na área da saúde)
  const stats = useMemo(() => {
    const anoAtual = new Date().getFullYear();
    let ultimos5 = 0;
    let comAno = 0;
    const porAno = {};
    const porPeriodico = {};
    const porAutor = {};

    for (const r of refs) {
      const a = Number(ano(r.csl));
      if (a >= 1900 && a <= anoAtual + 1) {
        comAno++;
        if (a >= anoAtual - 5) ultimos5++;
        porAno[a] = (porAno[a] || 0) + 1;
      }
      const per = r.csl?.['container-title'];
      if (per) porPeriodico[per] = (porPeriodico[per] || 0) + 1;
      for (const aut of r.csl?.author || []) {
        const nome = aut.family ? `${aut.family}, ${aut.given || ''}`.trim() : aut.literal;
        if (nome) porAutor[nome] = (porAutor[nome] || 0) + 1;
      }
    }

    return {
      pctUltimos5: comAno ? Math.round((ultimos5 / comAno) * 100) : 0,
      ultimos5,
      comAno,
      anos: Object.entries(porAno).sort((a, b) => Number(b[0]) - Number(a[0])).slice(0, 12),
      periodicos: Object.entries(porPeriodico).sort((a, b) => b[1] - a[1]).slice(0, 10),
      autores: Object.entries(porAutor).sort((a, b) => b[1] - a[1]).slice(0, 10),
    };
  }, [refs]);

  const renderCardArtigo = (it, tipoRelacao = 'Derivado') => {
    const chave = it.doi || it.idOpenAlex || it.titulo;
    const statusImport = importandoItens[chave];
    const jaNaBib = refs.some(
      (r) => (it.doi && r.csl?.DOI?.toLowerCase() === it.doi.toLowerCase()) || (r.csl?.title && r.csl.title.toLowerCase() === it.titulo.toLowerCase())
    );

    return (
      <div
        key={chave}
        className={`card-historico ${noSelecionado?.titulo === it.titulo ? 'ativo' : ''}`}
        style={{
          borderLeft: tipoRelacao === 'Antecessor' ? '3px solid #2563eb' : tipoRelacao === 'Derivado' ? '3px solid #7c3aed' : '3px solid #059669',
          padding: '10px 12px',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
          <strong
            style={{ fontSize: 13, color: 'var(--texto)', cursor: 'pointer', lineHeight: 1.35 }}
            onClick={() => setNoSelecionado({ ...it, grupo: tipoRelacao })}
            title="Clique para ver o resumo completo e detalhes deste artigo"
          >
            {it.titulo}
          </strong>
          {it.acessoAberto && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 700,
                background: 'rgba(22, 163, 74, 0.15)',
                color: '#16a34a',
                padding: '1px 6px',
                borderRadius: 4,
                whiteSpace: 'nowrap',
              }}
            >
              🔓 Open Access
            </span>
          )}
        </div>

        <div className="sub-meta" style={{ marginTop: 4, fontSize: 11.5 }}>
          {[it.autores, it.ano, it.fonte, it.citacoes != null ? `★ ${it.citacoes} cit.` : null]
            .filter(Boolean)
            .join(' · ')}
        </div>

        {it.resumo && (
          <p
            style={{
              fontSize: 11.5,
              color: 'var(--texto-suave)',
              margin: '6px 0 0',
              lineHeight: 1.4,
              display: '-webkit-box',
              WebkitLineClamp: 2,
              WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
            }}
          >
            {it.resumo}
          </p>
        )}

        {/* BARRA DE AÇÕES DO ARTIGO */}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 8, alignItems: 'center' }}>
          {jaNaBib || statusImport === 'concluido_com_pdf' || statusImport === 'concluido_sem_pdf' ? (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                color: '#16a34a',
                background: 'rgba(22, 163, 74, 0.12)',
                padding: '3px 8px',
                borderRadius: 6,
              }}
            >
              ✓ No seu Estudo {statusImport === 'concluido_com_pdf' ? '(📄 PDF Baixado)' : ''}
            </span>
          ) : (
            <button
              type="button"
              className="btn pequeno primario"
              style={{ fontSize: 11 }}
              onClick={() => adicionarAoEstudoComPdf(it, tipoRelacao)}
              disabled={statusImport === 'salvando' || statusImport === 'baixando_pdf'}
              title="Importa para a sua biblioteca e já tenta baixar o PDF oficial gratuito!"
            >
              {statusImport === 'salvando'
                ? 'Salvando…'
                : statusImport === 'baixando_pdf'
                ? 'Baixando PDF…'
                : '📥 Adicionar ao Estudo (+ PDF)'}
            </button>
          )}

          <button
            type="button"
            className="btn pequeno secundario"
            style={{ fontSize: 11 }}
            onClick={() => navegarParaNovaSemente(it)}
            title="Torna este artigo a nova Semente para explorar a rede de quem o citou e quem ele citou (Snowballing)"
          >
            🎯 Explorar Rede Deste
          </button>

          <button
            type="button"
            className="btn pequeno fantasma"
            style={{ fontSize: 11, padding: '2px 6px' }}
            onClick={() => setNoSelecionado({ ...it, grupo: tipoRelacao })}
            title="Ver resumo completo e metadados detalhados"
          >
            👁️ Resumo
          </button>

          <button
            type="button"
            className="btn pequeno fantasma"
            style={{ fontSize: 11, padding: '2px 6px' }}
            onClick={() => copiarCitacaoAbnt(it)}
            title="Copiar citação formatada"
          >
            📋 Citar
          </button>

          {it.doi && (
            <button
              type="button"
              className="btn pequeno fantasma"
              style={{ fontSize: 11, padding: '2px 6px' }}
              onClick={() => window.api.sistema.abrirLink(`https://doi.org/${it.doi}`)}
              title="Abrir página oficial do DOI no navegador"
            >
              ↗ DOI
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="central-buscadores">
      <div className="topo-buscadores">
        <div>
          <h2>🔗 Grafo de Citações e Linhagem Científica: O "Antes e Depois" da Literatura</h2>
          <p className="subtitulo">
            Explore a rede causal de citações: <strong>⏪ O Antes</strong> (trabalhos anteriores e referências que deram base) e <strong>⏩ O Depois</strong> (trabalhos posteriores e derivados que citaram a obra), com navegação recursiva e adição de fontes ao seu estudo em 1 clique.
          </p>
        </div>
      </div>

      <div className="abas-central">
        <button className={aba === 'rabbit' ? 'ativa' : ''} onClick={() => setAba('rabbit')}>
          🔗 Grafo de Citações (Linhagem &amp; Conexões)
        </button>
        <button className={aba === 'caderno' ? 'ativa' : ''} onClick={() => setAba('caderno')}>
          <Icone nome="edit" tam={14} /> Caderno de Síntese &amp; Fichamento
        </button>
        <button
          className={aba === 'downloads' ? 'ativa' : ''}
          onClick={() => {
            setAba('downloads');
            window.api.mendeley.listarPdfsDownloads().then(setDownloads);
          }}
        >
          <Icone nome="folder" tam={14} /> Pasta Monitorada (Downloads: {downloads.arquivos.length})
        </button>
        <button className={aba === 'estatisticas' ? 'ativa' : ''} onClick={() => setAba('estatisticas')}>
          <Icone nome="book" tam={14} /> Estatísticas &amp; Regra dos 5 Anos
        </button>
      </div>

      {/* ABA 1: RESEARCH RABBIT (REDE VISUAL DE CITAÇÕES + ANTERIORES / POSTERIORES / SIMILARES) */}
      {aba === 'rabbit' && (
        <div>
          {/* BARRA DE SELEÇÃO E NAVEGAÇÃO DA SEMENTE */}
          <div className="bloco-proxy" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
              <label className="campo" style={{ flex: 2, minWidth: 260 }}>
                <span className="campo-rotulo">🌱 1. Escolha o Artigo Semente (Seed Paper) da sua Biblioteca:</span>
                <select
                  value={sementeId}
                  onChange={(e) => {
                    setSementeId(e.target.value);
                    explorarResearchRabbit(e.target.value);
                  }}
                >
                  {refs.length === 0 && <option value="">(Sua biblioteca está vazia — adicione um DOI ao lado)</option>}
                  {refs.map((r) => (
                    <option key={r.id} value={r.id}>
                      {autoresResumo(r.csl) || 'Autor'} ({ano(r.csl) || 's.d.'}) — {semHtml(r.csl?.title).slice(0, 75)}
                    </option>
                  ))}
                </select>
              </label>

              <button
                type="button"
                className="btn primario"
                onClick={() => explorarResearchRabbit(sementeId)}
                disabled={carregandoRabbit || !refs.length}
              >
                🐇 {carregandoRabbit ? 'Mapeando Rede…' : 'Mapear Rede'}
              </button>

              <form onSubmit={buscarSementePorDoiOuTitulo} style={{ display: 'flex', gap: 6, flex: 1.4, minWidth: 260 }}>
                <input
                  value={buscaDoiDireto}
                  onChange={(e) => setBuscaDoiDireto(e.target.value)}
                  placeholder="Ou cole um DOI / Título novo para explorar…"
                  style={{ flex: 1, padding: '7px 10px', borderRadius: 6, border: '1px solid var(--borda)' }}
                />
                <button type="submit" className="btn secundario" disabled={carregandoRabbit}>
                  + Semente
                </button>
              </form>
            </div>

            {/* BREADCRUMB / HISTÓRICO DE NAVEGAÇÃO (SNOWBALLING) */}
            {historicoNavegacao.length > 0 && (
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginTop: 10,
                  paddingTop: 8,
                  borderTop: '1px dashed var(--borda)',
                  flexWrap: 'wrap',
                }}
              >
                <button className="btn pequeno secundario" onClick={voltarHistorico}>
                  ⬅ Voltar para Semente Anterior
                </button>
                <span style={{ fontSize: 11.5, color: 'var(--texto-suave)' }}>Trilha de Navegação:</span>
                {historicoNavegacao.map((hist, idx) => (
                  <span
                    key={idx}
                    style={{
                      fontSize: 11,
                      background: 'rgba(37, 99, 235, 0.1)',
                      color: '#2563eb',
                      padding: '2px 8px',
                      borderRadius: 99,
                      fontWeight: 600,
                    }}
                  >
                    {hist.sementeAutorAno} ➔
                  </span>
                ))}
                <span
                  style={{
                    fontSize: 11,
                    background: 'rgba(16, 185, 129, 0.15)',
                    color: '#059669',
                    padding: '2px 8px',
                    borderRadius: 99,
                    fontWeight: 700,
                  }}
                >
                  🌱 {redeRabbit?.sementeAutorAno} (Atual)
                </span>
              </div>
            )}
          </div>

          {redeRabbit && (
            <>
              {/* CARD DESTAQUE DO ARTIGO SEMENTE EM ANÁLISE */}
              <div
                style={{
                  padding: '12px 16px',
                  borderRadius: 8,
                  background: 'linear-gradient(90deg, rgba(5, 150, 105, 0.08) 0%, rgba(37, 99, 235, 0.06) 100%)',
                  border: '1.5px solid rgba(5, 150, 105, 0.3)',
                  marginBottom: 14,
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
                  <div style={{ flex: 1, minWidth: 260 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <span style={{ background: '#059669', color: '#fff', fontSize: 11, fontWeight: 800, padding: '2px 8px', borderRadius: 4 }}>
                        🌱 ARTIGO SEMENTE ATIVO
                      </span>
                      <strong style={{ fontSize: 14, color: 'var(--texto)' }}>{redeRabbit.sementeTitulo}</strong>
                    </div>
                    <div className="sub-meta" style={{ marginTop: 4 }}>
                      <strong>{redeRabbit.sementeAutorAno}</strong>
                      {redeRabbit.sementeFonte && ` · ${redeRabbit.sementeFonte}`}
                      {redeRabbit.sementeDoi && ` · DOI: ${redeRabbit.sementeDoi}`}
                    </div>
                    {redeRabbit.sementeResumo && (
                      <p style={{ margin: '6px 0 0', fontSize: 12, color: 'var(--texto-suave)', lineHeight: 1.45 }}>
                        <strong>Resumo:</strong> {redeRabbit.sementeResumo}
                      </p>
                    )}
                  </div>

                  {/* CONTROLE DE MODOS DE VISUALIZAÇÃO */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <div style={{ display: 'flex', gap: 6, background: 'var(--fundo)', padding: 3, borderRadius: 6, border: '1px solid var(--borda)' }}>
                      <button
                        className={`chip ${modoVisualizacao === 'colunas' ? 'ativo' : ''}`}
                        onClick={() => setModoVisualizacao('colunas')}
                        style={{ fontSize: 11.5, padding: '3px 8px' }}
                      >
                        📊 3 Colunas
                      </button>
                      <button
                        className={`chip ${modoVisualizacao === 'timeline' ? 'ativo' : ''}`}
                        onClick={() => setModoVisualizacao('timeline')}
                        style={{ fontSize: 11.5, padding: '3px 8px' }}
                      >
                        ⏱️ Linha do Tempo (Antes &amp; Depois)
                      </button>
                      <button
                        className={`chip ${modoVisualizacao === 'grafo' ? 'ativo' : ''}`}
                        onClick={() => setModoVisualizacao('grafo')}
                        style={{ fontSize: 11.5, padding: '3px 8px' }}
                      >
                        🕸 Grafo Visual
                      </button>
                    </div>

                    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                      <input
                        type="text"
                        value={termoFiltro}
                        onChange={(e) => setTermoFiltro(e.target.value)}
                        placeholder="Filtrar nesta rede…"
                        style={{ padding: '3px 8px', fontSize: 11.5, borderRadius: 4, border: '1px solid var(--borda)', width: 140 }}
                      />
                      <label style={{ fontSize: 11, display: 'flex', alignItems: 'center', gap: 3, cursor: 'pointer' }}>
                        <input
                          type="checkbox"
                          checked={filtroSoOa}
                          onChange={(e) => setFiltroSoOa(e.target.checked)}
                        />
                        Só Open Access
                      </label>
                    </div>
                  </div>
                </div>
              </div>

              {/* MODO 2: LINHA DO TEMPO CRONOLÓGICA ("O ANTES E DEPOIS" REAL) */}
              {modoVisualizacao === 'timeline' && (
                <div className="bloco-painel" style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <div>
                      <h4 style={{ margin: 0 }}>⏱️ Linha do Tempo do Conhecimento: O "Antes e Depois" da Publicação</h4>
                      <p className="dica-texto" style={{ margin: '2px 0 0' }}>
                        Visualização cronológica por ano: à esquerda os fundamentos publicados antes; à direita os desdobramentos publicados depois.
                      </p>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr auto 1fr', gap: 16, alignItems: 'flex-start' }}>
                    {/* Lado Esquerdo: O ANTES (Trabalhos Anteriores) */}
                    <div>
                      <div style={{ padding: '6px 10px', background: 'rgba(37, 99, 235, 0.1)', borderRadius: 6, marginBottom: 10, borderLeft: '4px solid #2563eb' }}>
                        <strong style={{ color: '#1d4ed8', fontSize: 12.5 }}>⏪ O ANTES: Fundamentos Teóricos ({anterioresFiltrados.length})</strong>
                        <div style={{ fontSize: 11, color: 'var(--texto-suave)' }}>Obras citadas pela semente (publicadas antes)</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {timelineData.antesPorAno.length === 0 ? (
                          <p className="dica-texto">Nenhuma referência anterior aberta encontrada.</p>
                        ) : (
                          timelineData.antesPorAno.map((bloco) => (
                            <div key={bloco.ano} style={{ padding: '8px', background: 'var(--fundo)', borderRadius: 6, border: '1px solid var(--borda)' }}>
                              <span style={{ fontSize: 11, fontWeight: 800, background: '#2563eb', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>
                                📅 Ano {bloco.ano}
                              </span>
                              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {bloco.itens.map((it) => renderCardArtigo(it, 'Antecessor'))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Divisor Central: MARCO ZERO (Artigo Semente) */}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 8px' }}>
                      <div style={{ width: 2, height: 60, background: 'var(--borda)' }} />
                      <div
                        style={{
                          width: 44,
                          height: 44,
                          borderRadius: '50%',
                          background: '#059669',
                          color: '#fff',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontWeight: 800,
                          fontSize: 18,
                          boxShadow: '0 0 0 6px rgba(5, 150, 105, 0.2)',
                        }}
                      >
                        🌱
                      </div>
                      <strong style={{ fontSize: 11, marginTop: 4, textAlign: 'center', color: '#059669' }}>
                        Ano {redeRabbit.sementeAno}
                      </strong>
                      <div style={{ width: 2, flex: 1, minHeight: 120, background: 'var(--borda)', marginTop: 4 }} />
                    </div>

                    {/* Lado Direito: O DEPOIS (Trabalhos Posteriores) */}
                    <div>
                      <div style={{ padding: '6px 10px', background: 'rgba(124, 58, 237, 0.1)', borderRadius: 6, marginBottom: 10, borderLeft: '4px solid #7c3aed' }}>
                        <strong style={{ color: '#6d28d9', fontSize: 12.5 }}>⏩ O DEPOIS: Desdobramentos &amp; Derivados ({posterioresFiltrados.length})</strong>
                        <div style={{ fontSize: 11, color: 'var(--texto-suave)' }}>Obras que citaram a semente (publicadas depois)</div>
                      </div>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {timelineData.depoisPorAno.length === 0 ? (
                          <p className="dica-texto">Nenhum artigo posterior citante encontrado ainda.</p>
                        ) : (
                          timelineData.depoisPorAno.map((bloco) => (
                            <div key={bloco.ano} style={{ padding: '8px', background: 'var(--fundo)', borderRadius: 6, border: '1px solid var(--borda)' }}>
                              <span style={{ fontSize: 11, fontWeight: 800, background: '#7c3aed', color: '#fff', padding: '1px 6px', borderRadius: 4 }}>
                                📅 Ano {bloco.ano}
                              </span>
                              <div style={{ marginTop: 6, display: 'flex', flexDirection: 'column', gap: 6 }}>
                                {bloco.itens.map((it) => renderCardArtigo(it, 'Derivado'))}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* MODO 3: GRAFO VISUAL INTERATIVO */}
              {modoVisualizacao === 'grafo' && (
                <div className="bloco-painel" style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <h4>🕸 Mapa Visual de Conexões (Clique nos círculos para inspecionar ou navegar na rede)</h4>
                    <span style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
                      🔵 Esquerda: Referências Anteriores ({anterioresFiltrados.length}) · 🟢 Centro: Semente · 🟣 Direita: Posteriores ({posterioresFiltrados.length})
                    </span>
                  </div>

                  <svg
                    viewBox="0 0 820 340"
                    style={{
                      width: '100%',
                      height: 320,
                      background: 'linear-gradient(180deg, rgba(15,23,42,0.03) 0%, rgba(37,99,235,0.05) 100%)',
                      borderRadius: 10,
                      border: '1px solid var(--borda)',
                    }}
                  >
                    {/* Linhas da esquerda (Anteriores -> Semente) */}
                    {anterioresFiltrados.slice(0, 8).map((it, idx, arr) => {
                      const y = 35 + (idx * 270) / Math.max(1, arr.length - 1 || 1);
                      return <line key={`lin-ant-${idx}`} x1={175} y1={y} x2={410} y2={170} stroke="#60a5fa" strokeWidth="1.6" strokeDasharray="4 2" />;
                    })}

                    {/* Linhas da direita (Semente -> Posteriores) */}
                    {posterioresFiltrados.slice(0, 8).map((it, idx, arr) => {
                      const y = 35 + (idx * 270) / Math.max(1, arr.length - 1 || 1);
                      return <line key={`lin-pos-${idx}`} x1={410} y1={170} x2={645} y2={y} stroke="#a78bfa" strokeWidth="1.6" />;
                    })}

                    {/* Nós da Esquerda: Trabalhos Anteriores */}
                    {anterioresFiltrados.slice(0, 8).map((it, idx, arr) => {
                      const y = 35 + (idx * 270) / Math.max(1, arr.length - 1 || 1);
                      const rotulo = `${(it.autores || 'Autor').split(',')[0].slice(0, 14)} (${it.ano || '?'})`;
                      return (
                        <g key={`no-ant-${idx}`} style={{ cursor: 'pointer' }} onClick={() => setNoSelecionado({ ...it, grupo: 'Antecessor' })}>
                          <circle cx={160} cy={y} r={16} fill="#2563eb" stroke="#fff" strokeWidth="2" />
                          <text x={135} y={y + 4} textAnchor="end" fontSize="11" fill="currentColor" fontWeight="600">
                            {rotulo}
                          </text>
                        </g>
                      );
                    })}

                    {/* Nó Central: Artigo Semente */}
                    <g style={{ cursor: 'pointer' }} onClick={() => setNoSelecionado(null)}>
                      <circle cx={410} cy={170} r={32} fill="#059669" stroke="#a7f3d0" strokeWidth="4" />
                      <text x={410} y={166} textAnchor="middle" fontSize="11" fill="#fff" fontWeight="800">
                        🌱 SEMENTE
                      </text>
                      <text x={410} y={180} textAnchor="middle" fontSize="9" fill="#d1fae5">
                        {redeRabbit.sementeAutorAno.slice(0, 20)}
                      </text>
                    </g>

                    {/* Nós da Direita: Trabalhos Posteriores (Quem Citou) */}
                    {posterioresFiltrados.slice(0, 8).map((it, idx, arr) => {
                      const y = 35 + (idx * 270) / Math.max(1, arr.length - 1 || 1);
                      const rotulo = `${(it.autores || 'Autor').split(',')[0].slice(0, 14)} (${it.ano || '?'})`;
                      return (
                        <g key={`no-pos-${idx}`} style={{ cursor: 'pointer' }} onClick={() => setNoSelecionado({ ...it, grupo: 'Derivado' })}>
                          <circle cx={660} cy={y} r={16} fill="#7c3aed" stroke="#fff" strokeWidth="2" />
                          <text x={685} y={y + 4} textAnchor="start" fontSize="11" fill="currentColor" fontWeight="600">
                            {rotulo}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>
              )}

              {/* MODO 1: AS 3 COLUNAS CLÁSSICAS DO RESEARCH RABBIT COM SUPORTE TOTAL A CLIQUE E ADIÇÃO */}
              {modoVisualizacao === 'colunas' && (
                <div style={{ display: 'grid', gridTemplateColumns: noSelecionado ? '1.8fr 1fr' : '1fr', gap: 14 }}>
                  <div className="grade-3">
                    {/* Coluna 1: Trabalhos Anteriores (Earlier Work / O ANTES) */}
                    <div className="bloco-painel">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ color: '#2563eb', margin: 0 }}>⏪ O Antes ({anterioresFiltrados.length})</h4>
                        <span style={{ fontSize: 11, color: '#2563eb', fontWeight: 700 }}>Referências Citadas</span>
                      </div>
                      <p className="dica-texto" style={{ margin: '4px 0 8px' }}>
                        Trabalhos fundamentais que o artigo semente usou como alicerce:
                      </p>
                      <div className="lista-historico" style={{ maxHeight: 460, overflowY: 'auto' }}>
                        {anterioresFiltrados.length === 0 ? (
                          <p className="dica-texto">Nenhuma referência anterior aberta localizada.</p>
                        ) : (
                          anterioresFiltrados.map((it) => renderCardArtigo(it, 'Antecessor'))
                        )}
                      </div>
                    </div>

                    {/* Coluna 2: Trabalhos Posteriores (Later Work / O DEPOIS) */}
                    <div className="bloco-painel">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ color: '#7c3aed', margin: 0 }}>⏩ O Depois ({posterioresFiltrados.length})</h4>
                        <span style={{ fontSize: 11, color: '#7c3aed', fontWeight: 700 }}>Citações Futuras</span>
                      </div>
                      <p className="dica-texto" style={{ margin: '4px 0 8px' }}>
                        Artigos mais recentes que citaram, replicaram ou expandiram a semente:
                      </p>
                      <div className="lista-historico" style={{ maxHeight: 460, overflowY: 'auto' }}>
                        {posterioresFiltrados.length === 0 ? (
                          <p className="dica-texto">Nenhum artigo citante posterior encontrado ainda.</p>
                        ) : (
                          posterioresFiltrados.map((it) => renderCardArtigo(it, 'Derivado'))
                        )}
                      </div>
                    </div>

                    {/* Coluna 3: Artigos Similares (Similar Work) */}
                    <div className="bloco-painel">
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <h4 style={{ color: '#059669', margin: 0 }}>✨ Similares ({similaresFiltrados.length})</h4>
                        <span style={{ fontSize: 11, color: '#059669', fontWeight: 700 }}>Co-citações</span>
                      </div>
                      <p className="dica-texto" style={{ margin: '4px 0 8px' }}>
                        Estudos da mesma temática e com autores em comum no OpenAlex:
                      </p>
                      <div className="lista-historico" style={{ maxHeight: 460, overflowY: 'auto' }}>
                        {similaresFiltrados.length === 0 ? (
                          <p className="dica-texto">Nenhum artigo similar listado.</p>
                        ) : (
                          similaresFiltrados.map((it) => renderCardArtigo(it, 'Similar'))
                        )}
                      </div>
                    </div>
                  </div>

                  {/* PAINEL LATERAL DE INSPEÇÃO DO ARTIGO SELECIONADO */}
                  {noSelecionado && (
                    <div
                      className="bloco-painel"
                      style={{
                        borderLeft: noSelecionado.grupo === 'Antecessor' ? '4px solid #2563eb' : noSelecionado.grupo === 'Derivado' ? '4px solid #7c3aed' : '4px solid #059669',
                        height: 'fit-content',
                        position: 'sticky',
                        top: 10,
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span
                          style={{
                            fontSize: 11,
                            fontWeight: 800,
                            padding: '2px 8px',
                            borderRadius: 4,
                            background: noSelecionado.grupo === 'Antecessor' ? '#2563eb' : noSelecionado.grupo === 'Derivado' ? '#7c3aed' : '#059669',
                            color: '#fff',
                          }}
                        >
                          {noSelecionado.grupo}
                        </span>
                        <button className="btn pequeno fantasma" onClick={() => setNoSelecionado(null)}>
                          Fechar ×
                        </button>
                      </div>

                      <h4 style={{ margin: '8px 0 4px', fontSize: 14 }}>{noSelecionado.titulo}</h4>
                      <p className="sub-meta">
                        {[noSelecionado.autores, noSelecionado.ano, noSelecionado.fonte, noSelecionado.citacoes != null && `★ ${noSelecionado.citacoes} citações`]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>

                      {noSelecionado.doi && (
                        <p style={{ fontSize: 11.5, margin: '4px 0' }}>
                          DOI: <code>{noSelecionado.doi}</code>
                        </p>
                      )}

                      {noSelecionado.resumo && (
                        <div style={{ marginTop: 8, padding: '8px', background: 'var(--fundo)', borderRadius: 6, border: '1px solid var(--borda)' }}>
                          <strong style={{ fontSize: 11.5 }}>Resumo / Abstract:</strong>
                          <p style={{ fontSize: 11.8, lineHeight: 1.45, margin: '4px 0 0', color: 'var(--texto)' }}>
                            {noSelecionado.resumo}
                          </p>
                        </div>
                      )}

                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
                        <button
                          type="button"
                          className="btn primario"
                          onClick={() => adicionarAoEstudoComPdf(noSelecionado, noSelecionado.grupo)}
                        >
                          📥 Adicionar ao Meu Estudo (+ Baixar PDF)
                        </button>
                        <button
                          type="button"
                          className="btn secundario"
                          onClick={() => navegarParaNovaSemente(noSelecionado)}
                          title="Navega recursivamente na árvore genealógica de citações deste artigo!"
                        >
                          🎯 Explorar a Rede Deste Artigo (Snowballing)
                        </button>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <button
                            type="button"
                            className="btn pequeno secundario"
                            style={{ flex: 1 }}
                            onClick={() => copiarCitacaoAbnt(noSelecionado)}
                          >
                            📋 Copiar Citação
                          </button>
                          {noSelecionado.doi && (
                            <button
                              type="button"
                              className="btn pequeno fantasma"
                              style={{ flex: 1 }}
                              onClick={() => window.api.sistema.abrirLink(`https://doi.org/${noSelecionado.doi}`)}
                            >
                              🌐 Abrir DOI ↗
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ABA 2: CADERNO DE SÍNTESE (MENDELEY NOTEBOOK) */}
      {aba === 'caderno' && (
        <div className="grade-2-painel" style={{ gridTemplateColumns: '1.3fr 1fr' }}>
          <div className="bloco-painel">
            <div className="barra-filtros-cat">
              <div className="chips-categorias">
                {paginas.map((p) => (
                  <button
                    key={p.id}
                    className={`chip ${pagAtiva?.id === p.id ? 'ativo' : ''}`}
                    onClick={() => setPagAtivaId(p.id)}
                  >
                    {p.titulo}
                  </button>
                ))}
                <button className="btn pequeno secundario" onClick={criarPaginaCaderno}>
                  + Nova página
                </button>
              </div>
              {pagAtiva && (
                <button
                  className="btn pequeno primario"
                  onClick={() => {
                    window.api.sistema.copiarTexto(pagAtiva.conteudo || '');
                    avisar('Texto da página copiado para o Word!', 'ok');
                  }}
                >
                  <Icone nome="copy" tam={13} /> Copiar para Word
                </button>
              )}
            </div>

            {pagAtiva ? (
              <div style={{ marginTop: 10 }}>
                <input
                  value={pagAtiva.titulo}
                  onChange={(e) => {
                    const novoTit = e.target.value;
                    const novas = paginas.map((p) => (p.id === pagAtiva.id ? { ...p, titulo: novoTit } : p));
                    salvarPaginas(novas);
                  }}
                  style={{
                    fontSize: 16,
                    fontWeight: 700,
                    width: '100%',
                    padding: '6px 10px',
                    marginBottom: 8,
                    borderRadius: 6,
                    border: '1px solid var(--borda)',
                  }}
                />
                <textarea
                  rows={16}
                  value={pagAtiva.conteudo || ''}
                  onChange={(e) => atualizarConteudoPag(e.target.value)}
                  placeholder="Escreva aqui suas sínteses, fichamentos ou rascunhos de parágrafos. Clique nas citações e grifos ao lado para inseri-los aqui instantaneamente…"
                  style={{
                    width: '100%',
                    padding: 12,
                    fontSize: 13,
                    lineHeight: 1.6,
                    fontFamily: 'inherit',
                    borderRadius: 6,
                    border: '1px solid var(--borda)',
                    background: 'var(--painel)',
                    color: 'var(--texto)',
                  }}
                />
              </div>
            ) : (
              <p className="dica-texto">Clique em "+ Nova página" para começar a escrever.</p>
            )}
          </div>

          {/* Coluna da Direita do Caderno: Grifos e Trechos Citados de Toda a Biblioteca */}
          <div className="bloco-painel">
            <h4>🖍 Grifos &amp; Citações da Biblioteca ({todosGrifos.length})</h4>
            <p className="dica-texto">Clique em qualquer grifo para colá-lo na página ativa do Caderno com a citação formatada:</p>
            <div className="lista-historico" style={{ maxHeight: 440, overflowY: 'auto' }}>
              {todosGrifos.length === 0 ? (
                <p className="dica-texto">Nenhum grifo feito ainda. Abra um PDF na biblioteca, grife com marca-texto e eles aparecerão aqui!</p>
              ) : (
                todosGrifos.map((g, i) => (
                  <div key={g.id || i} className="card-historico" style={{ borderLeft: `3px solid ${g.cor === 'amarelo' ? '#eab308' : g.cor === 'verde' ? '#16a34a' : g.cor === 'rosa' ? '#ec4899' : '#2563eb'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <strong style={{ fontSize: 11.5 }}>{g.autorAno} (pág. {g.pagina})</strong>
                      <button
                        type="button"
                        className="btn pequeno secundario"
                        onClick={() => inserirNoCaderno(`"${g.trecho}" (${g.autorAno}, p. ${g.pagina})`)}
                        title="Insere este trecho citado na página do caderno"
                      >
                        + Colar no Caderno
                      </button>
                    </div>
                    <p style={{ margin: '4px 0 0', fontSize: 12, fontStyle: 'italic', color: 'var(--texto)' }}>
                      "{g.trecho}"
                    </p>
                    {g.nota && (
                      <div style={{ fontSize: 11, color: 'var(--texto-suave)', marginTop: 2 }}>
                        <strong>Nota:</strong> {g.nota}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* ABA 3: PASTA MONITORADA DOWNLOADS */}
      {aba === 'downloads' && (
        <div className="bloco-painel">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <div>
              <h4 style={{ margin: 0 }}>📥 PDFs Recentes na sua Pasta Downloads</h4>
              <p className="dica-texto" style={{ margin: '2px 0 0' }}>
                Pasta monitorada: <code>{downloads.pasta || 'C:\\Users\\...\\Downloads'}</code>
              </p>
            </div>
            <button
              type="button"
              className="btn secundario"
              onClick={() => window.api.mendeley.listarPdfsDownloads().then(setDownloads)}
            >
              🔄 Atualizar Pasta
            </button>
          </div>

          <div className="lista-historico">
            {downloads.arquivos.length === 0 ? (
              <p className="dica-texto">Nenhum PDF encontrado na pasta Downloads recentemente.</p>
            ) : (
              downloads.arquivos.map((arq, i) => (
                <div key={i} className="card-historico" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <strong>📄 {arq.nome}</strong>
                    <div className="sub-meta">
                      {(arq.tamanho / 1024 / 1024).toFixed(2)} MB · Modificado em {new Date(arq.mtime).toLocaleString('pt-BR')}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="btn pequeno primario"
                    onClick={async () => {
                      await onImportarPdfs([arq.caminho], 'a_ler');
                      avisar(`PDF "${arq.nome}" importado para a Biblioteca!`, 'ok');
                    }}
                  >
                    + Importar para Biblioteca
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* ABA 4: ESTATÍSTICAS E REGRA DOS 5 ANOS */}
      {aba === 'estatisticas' && (
        <div className="grade-2-painel">
          <div className="bloco-painel">
            <h4>📊 Diagnóstico Temporal (Regra dos 5 Anos na Saúde)</h4>
            <p className="dica-texto">
              Em bancas de mestrado, doutorado e periódicos médicos de alto impacto, recomenda-se que pelo menos <strong>60% a 70%</strong> das referências sejam dos últimos 5 anos.
            </p>
            <div style={{ margin: '14px 0', padding: 12, background: 'var(--fundo)', borderRadius: 8, border: '1px solid var(--borda)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 13, fontWeight: 700 }}>Atualidade do seu Acervo:</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: stats.pctUltimos5 >= 60 ? '#16a34a' : '#d97706' }}>
                  {stats.pctUltimos5}%
                </span>
              </div>
              <div style={{ width: '100%', height: 10, background: 'rgba(148, 163, 184, 0.2)', borderRadius: 99, margin: '8px 0', overflow: 'hidden' }}>
                <div
                  style={{
                    width: `${Math.min(100, stats.pctUltimos5)}%`,
                    height: '100%',
                    background: stats.pctUltimos5 >= 60 ? '#16a34a' : '#d97706',
                    borderRadius: 99,
                    transition: 'width 0.4s ease',
                  }}
                />
              </div>
              <span style={{ fontSize: 12, color: 'var(--texto-suave)' }}>
                {stats.ultimos5} de {stats.comAno} obras com ano identificado foram publicadas nos últimos 5 anos.
              </span>
            </div>

            <h5 style={{ margin: '14px 0 6px' }}>Distribuição por Ano de Publicação:</h5>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {stats.anos.map(([anoKey, qtd]) => (
                <span key={anoKey} className="pill-contagem">
                  <strong>{anoKey}:</strong> {qtd} obras
                </span>
              ))}
            </div>
          </div>

          <div className="bloco-painel">
            <h4>🏛 Principais Periódicos e Autores mais Citados</h4>
            <h5 style={{ margin: '8px 0 4px' }}>Top Revistas / Fontes:</h5>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {stats.periodicos.map(([per, n]) => (
                <div key={per} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12 }}>
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 300 }}>{per}</span>
                  <strong>{n}x</strong>
                </div>
              ))}
            </div>

            <h5 style={{ margin: '14px 0 4px' }}>Top Autores no seu Acervo:</h5>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {stats.autores.map(([aut, n]) => (
                <span key={aut} className="pill-contagem">
                  {aut}: <strong>{n}</strong>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
