import React, { useEffect, useState } from 'react';
import { Icone, Modal, useAviso } from './ui.jsx';
import { useI18n } from '../i18n.jsx';

const ROTULO_LOGIN = {
  livre: { texto: 'Livre', textoEn: 'Open', classe: 'badge-livre' },
  parcial: { texto: 'Parcial', textoEn: 'Partial', classe: 'badge-parcial' },
  cadastro: { texto: 'Cadastro', textoEn: 'Free Account', classe: 'badge-parcial' },
  cafe: { texto: 'CAPES/CAFe', textoEn: 'Institutional', classe: 'badge-cafe' },
  assinatura: { texto: 'Assinatura', textoEn: 'Subscription', classe: 'badge-assinatura' },
};

function montarUrl(modeloUrl, consulta) {
  const q = encodeURIComponent(String(consulta || '').trim());
  if (!modeloUrl) return '';
  if (modeloUrl.includes('{q}')) return modeloUrl.replace(/\{q\}/g, q);
  if (modeloUrl.includes('{busca}')) return modeloUrl.replace(/\{busca\}/g, q);
  return modeloUrl;
}

export default function SearchHub({ refs, proxy, onMudarProxy, onImportarCsl }) {
  const avisar = useAviso();
  const { tr, ehEn } = useI18n();
  const [catalogo, setCatalogo] = useState([]);
  const [contas, setContas] = useState({});
  const [historico, setHistorico] = useState([]);
  const [consulta, setConsulta] = useState('');
  const [contagens, setContagens] = useState({}); // { [id]: { status: 'loading'|'ok'|'erro', valor } }
  const [contagensManuais, setContagensManuais] = useState({});
  const [notasBusca, setNotasBusca] = useState('');
  const [aba, setAba] = useState('painel'); // 'painel' | 'resultados' | 'historico' | 'contas'
  const [fonteResultados, setFonteResultados] = useState('pubmed');
  const [listaResultados, setListaResultados] = useState([]);
  const [carregandoRes, setCarregandoRes] = useState(false);
  const [modalConta, setModalConta] = useState(null); // buscador selecionado para editar login/senha
  const [modalNovoBuscador, setModalNovoBuscador] = useState(null); // null ou objeto do buscador
  const [filtroCategoria, setFiltroCategoria] = useState('todas');
  const [modoVisual, setModoVisual] = useState('grade'); // 'grade' | 'lista'

  const carregarTudo = async () => {
    try {
      const [cat, cts, hist] = await Promise.all([
        window.api.busc.catalogo(),
        window.api.cofre.listar(),
        window.api.busc.historico(),
      ]);
      setCatalogo(cat);
      setContas(cts);
      setHistorico(hist);
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  useEffect(() => {
    carregarTudo();
  }, []);

  const dispararContagens = async (termo) => {
    const q = String(termo ?? consulta).trim();
    if (!q) {
      avisar('Digite os termos ou estratégia de busca primeiro.', 'info');
      return;
    }
    const comContador = catalogo.filter((b) => b.contagem && !b.oculto);
    const inicial = {};
    for (const b of comContador) inicial[b.id] = { status: 'loading', valor: null };
    setContagens(inicial);

    await Promise.all(
      comContador.map(async (b) => {
        try {
          const n = await window.api.busc.contar(b.contagem, q);
          setContagens((ant) => ({ ...ant, [b.id]: { status: 'ok', valor: n } }));
        } catch (e) {
          setContagens((ant) => ({ ...ant, [b.id]: { status: 'erro', valor: e.message } }));
        }
      })
    );
  };

  const buscarResultadosInline = async (fonte = fonteResultados, termo = consulta) => {
    const q = String(termo || '').trim();
    if (!q) {
      avisar('Digite os termos de busca no campo superior.', 'info');
      return;
    }
    setFonteResultados(fonte);
    setAba('resultados');
    setCarregandoRes(true);
    try {
      const r = await window.api.busc.resultados(fonte, q);
      setListaResultados(r);
    } catch (e) {
      avisar(e.message, 'erro');
    } finally {
      setCarregandoRes(false);
    }
  };

  const abrirBuscador = async (b, usarProxy = false) => {
    const url = montarUrl(b.url, consulta);
    try {
      // Se tiver conta salva, oferece atalho de senha copiada
      if (contas[b.id]?.temSenha) {
        await window.api.cofre.copiarSenha(b.id);
        avisar(`Abrindo ${b.nome} — senha copiada para a área de transferência (30s).`, 'ok');
      }
      await window.api.busc.abrir(url, usarProxy);
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const abrirFavoritos = async () => {
    const favs = catalogo.filter((b) => b.favorito && !b.oculto);
    for (const b of favs) {
      await window.api.busc.abrir(montarUrl(b.url, consulta), false);
    }
    avisar(`${favs.length} buscadores favoritos abertos no navegador.`, 'ok');
  };

  const alternarFavorito = async (id) => {
    const novo = catalogo.map((b) => (b.id === id ? { ...b, favorito: !b.favorito } : b));
    setCatalogo(await window.api.busc.salvarCatalogo({ buscadores: novo }));
  };

  const registrarNoHistorico = async () => {
    const q = consulta.trim();
    if (!q) {
      avisar('Digite uma busca antes de registrar no histórico.', 'info');
      return;
    }
    const resultadosPorBase = {};
    for (const b of catalogo) {
      if (contagens[b.id]?.status === 'ok') resultadosPorBase[b.nome] = contagens[b.id].valor;
      else if (contagensManuais[b.id] !== undefined && contagensManuais[b.id] !== '') {
        resultadosPorBase[b.nome] = Number(contagensManuais[b.id]);
      }
    }
    const salvo = await window.api.busc.salvarBusca({
      consulta: q,
      resultados: resultadosPorBase,
      notas: notasBusca,
    });
    setHistorico([salvo, ...historico.filter((h) => h.id !== salvo.id)]);
    avisar('Estratégia de busca salva no histórico (pasta buscas/ no OneDrive).', 'ok');
  };

  const jaNaBiblioteca = (item) => {
    const doi = (item.doi || '').toLowerCase();
    const pmid = String(item.pmid || '');
    return refs.some(
      (r) =>
        (doi && (r.csl?.DOI || '').toLowerCase() === doi) ||
        (pmid && String(r.csl?.PMID || '') === pmid)
    );
  };

  const importarItemResultado = async (item, status = 'a_ler', tentarBaixarPdf = false) => {
    try {
      let csl = null;
      if (item.pmid) {
        try {
          csl = await window.api.meta.pmid(item.pmid);
        } catch {
          /* fallback para DOI */
        }
      }
      if (!csl && item.doi) csl = await window.api.meta.doi(item.doi);
      if (!csl) {
        csl = {
          type: 'article-journal',
          title: item.titulo,
          'container-title': item.fonte,
          issued: item.ano ? { 'date-parts': [[Number(item.ano)]] } : undefined,
        };
      }
      const criada = await onImportarCsl(csl, status);
      if (tentarBaixarPdf && criada?.id) {
        try {
          const resPdf = await window.api.meta.buscarPdfAberto(criada.id);
          if (resPdf.baixado) {
            avisar(`Artigo e PDF baixados no OneDrive: ${item.titulo.slice(0, 45)}…`, 'ok');
            return;
          }
        } catch {
          avisar('Artigo importado (PDF fechado/indisponível em acesso aberto).', 'info');
          return;
        }
      }
      avisar(`Importado: ${item.titulo.slice(0, 55)}…`, 'ok');
    } catch (e) {
      avisar(e.message, 'erro');
    }
  };

  const categorias = ['todas', 'favoritos', ...new Set(catalogo.filter((b) => !b.oculto).map((b) => b.categoria))];
  const buscadoresVisiveis = catalogo.filter((b) => {
    if (b.oculto) return false;
    if (filtroCategoria === 'todas') return true;
    if (filtroCategoria === 'favoritos') return b.favorito;
    return b.categoria === filtroCategoria;
  });

  const totalContadores = Object.keys(contagens).length;
  const concluidosContadores = Object.values(contagens).filter((c) => c.status === 'ok' || c.status === 'erro').length;
  const emProgresso = totalContadores > 0 && concluidosContadores < totalContadores;
  const pctProgresso = totalContadores > 0 ? Math.round((concluidosContadores / totalContadores) * 100) : 0;

  return (
    <div className="central-buscadores">
      {/* Barra de busca unificada */}
      <div className="topo-buscadores">
        <div>
          <h2>{tr('Central de Buscas', 'Search Hub')}</h2>
          <p className="subtitulo">
            {tr(
              'Pesquise bases científicas em paralelo, importe artigos e acesse portais assinados.',
              'Query scientific databases in parallel, import articles, and manage portal accounts.'
            )}
          </p>
        </div>
        <div className="acoes-topo-buscadores">
          <button className="btn secundario" onClick={() => setModalNovoBuscador({ novo: true })}>
            <Icone nome="plus" tam={14} /> {tr('Adicionar Base', 'Add Provider')}
          </button>
        </div>
      </div>

      <form
        className="barra-busca-unificada"
        onSubmit={(e) => {
          e.preventDefault();
          dispararContagens();
        }}
      >
        <input
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          placeholder={tr('Digite sua estratégia (ex.: ("glycemic control" OR diabetes) AND ("resistance training" OR exercise))', 'Enter search strategy (e.g., ("glycemic control" OR diabetes) AND ("resistance training" OR exercise))')}
        />
        <button type="submit" className="btn primario" disabled={emProgresso}>
          <Icone nome="search" tam={15} /> {emProgresso ? tr('Consultando bases...', 'Querying databases...') : tr('Contar e comparar nas bases', 'Count & compare databases')}
        </button>
        <button type="button" className="btn secundario" onClick={() => buscarResultadosInline('pubmed')}>
          {tr('Ver artigos (PubMed)', 'Browse PubMed Results')}
        </button>
        <button
          type="button"
          className="btn fantasma"
          onClick={abrirFavoritos}
          title={tr('Abre todos os seus buscadores marcados com estrela no navegador', 'Open all starred providers in browser')}
        >
          <Icone nome="external" tam={14} /> {tr('Abrir favoritos', 'Open favorites')}
        </button>
      </form>

      {/* Barra de Progresso Visual de Consulta das Bases */}
      {emProgresso && (
        <div style={{ margin: '12px 0 16px 0', background: 'var(--card-fundo, #f8fafc)', border: '1px solid var(--borda, #e2e8f0)', borderRadius: 8, padding: '12px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, fontSize: 13, fontWeight: 600 }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--azul, #0284c7)' }}>
              ⏳ {tr('Consultando bases científicas em paralelo...', 'Querying scientific databases in parallel...')}
            </span>
            <span style={{ color: 'var(--texto-suave, #64748b)' }}>{concluidosContadores} / {totalContadores} ({pctProgresso}%)</span>
          </div>
          <div style={{ width: '100%', height: 8, background: 'var(--fundo-barra, #e2e8f0)', borderRadius: 4, overflow: 'hidden' }}>
            <div style={{ width: `${pctProgresso}%`, height: '100%', background: 'linear-gradient(90deg, #0284c7, #38bdf8)', transition: 'width 0.3s ease-in-out' }} />
          </div>
        </div>
      )}

      {/* Abas da Central */}
      <div className="abas-central">
        <button className={aba === 'painel' ? 'ativa' : ''} onClick={() => setAba('painel')}>
          <Icone nome="search" tam={14} /> {tr('Bases & Redirecionadores', 'Databases & Providers')} ({catalogo.filter((b) => !b.oculto).length})
        </button>
        <button className={aba === 'resultados' ? 'ativa' : ''} onClick={() => setAba('resultados')}>
          <Icone nome="list" tam={14} /> {tr('Importar Resultados Direto', 'Direct Results Import')}
        </button>
        <button className={aba === 'historico' ? 'ativa' : ''} onClick={() => setAba('historico')}>
          <Icone nome="history" tam={14} /> {tr('Histórico & Comparação PRISMA', 'Search History & PRISMA Log')} ({historico.length})
        </button>
        <button className={aba === 'contas' ? 'ativa' : ''} onClick={() => setAba('contas')}>
          <Icone nome="key" tam={14} /> {tr('Central de Contas & Proxy CAPES/CAFe', 'Accounts & Institutional Proxy')}
        </button>
      </div>

      {/* ABA 1: PAINEL DE BUSCADORES */}
      {aba === 'painel' && (
        <>
          <div className="barra-filtros-cat">
            <div className="chips-categorias">
              {categorias.map((c) => (
                <button
                  key={c}
                  className={`chip ${filtroCategoria === c ? 'ativo' : ''}`}
                  onClick={() => setFiltroCategoria(c)}
                >
                  {c === 'todas' ? tr('Todas', 'All') : c === 'favoritos' ? tr('★ Favoritos', '★ Favorites') : c}
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              {Object.keys(contagens).length > 0 && (
                <div className="salvar-busca-inline">
                  <input
                    value={notasBusca}
                    onChange={(e) => setNotasBusca(e.target.value)}
                    placeholder={tr('Nota da busca (ex.: Filtro 2019–2026)…', 'Search note…')}
                  />
                  <button className="btn pequeno primario" onClick={registrarNoHistorico}>
                    {tr('Salvar PRISMA', 'Save PRISMA')}
                  </button>
                </div>
              )}
              <div className="grupo-toggle-visual" role="group" aria-label={tr('Visualização das bases', 'Database layout')}>
                <button
                  type="button"
                  className={`btn pequeno ${modoVisual === 'grade' ? 'primario' : 'fantasma'}`}
                  onClick={() => setModoVisual('grade')}
                  title={tr('Grade compacta (todas as bases visíveis)', 'Compact grid view')}
                >
                  {tr('Grade', 'Grid')}
                </button>
                <button
                  type="button"
                  className={`btn pequeno ${modoVisual === 'lista' ? 'primario' : 'fantasma'}`}
                  onClick={() => setModoVisual('lista')}
                  title={tr('Tabela condensada em 1 linha por base', 'Dense table view')}
                >
                  {tr('Tabela', 'Table')}
                </button>
              </div>
            </div>
          </div>

          {modoVisual === 'lista' ? (
            <div className="tabela-buscadores-wrap">
              <table className="tabela-buscadores-compacta">
                <thead>
                  <tr>
                    <th>{tr('Base Científica', 'Database')}</th>
                    <th>{tr('Acesso', 'Access')}</th>
                    <th>{tr('Resultados', 'Hits')}</th>
                    <th style={{ textAlign: 'right' }}>{tr('Ações', 'Actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {buscadoresVisiveis.map((b) => {
                    const infoLogin = ROTULO_LOGIN[b.login] || ROTULO_LOGIN.livre;
                    const rotuloInfoLogin = ehEn ? (infoLogin.textoEn || infoLogin.texto) : infoLogin.texto;
                    const conta = contas[b.id];
                    const cont = contagens[b.id];
                    const temConsulta = Boolean(consulta.trim());
                    const semResultados = cont?.status === 'ok' && Number(cont.valor) === 0;
                    const temResultadosApi = cont?.status === 'ok' && Number(cont.valor) > 0;
                    const podeImportarAqui = ['pubmed', 'europepmc', 'openalex'].includes(b.contagem) && !semResultados;
                    return (
                      <tr key={b.id} title={`${b.categoria} — ${b.descricao}`}>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            <button
                              type="button"
                              className={`btn-icone ${b.favorito ? 'favorito-ativo' : ''}`}
                              onClick={() => alternarFavorito(b.id)}
                              title={tr('Favorito', 'Favorite')}
                            >
                              <Icone nome="star" cheio={b.favorito} tam={13} />
                            </button>
                            <strong>{b.nome}</strong>
                            <span className="cat-label-inline">{b.categoria}</span>
                          </div>
                        </td>
                        <td>
                          <span className={`badge-login ${infoLogin.classe}`}>{rotuloInfoLogin}</span>
                          {conta?.usuario && (
                            <span className="badge-conta" style={{ marginLeft: 4 }}>
                              <Icone nome="key" tam={10} /> {conta.usuario}
                            </span>
                          )}
                        </td>
                        <td>
                          {b.contagem ? (
                            <strong className="valor-contagem-inline">
                              {!cont
                                ? '—'
                                : cont.status === 'loading'
                                ? '…'
                                : cont.status === 'ok'
                                ? cont.valor.toLocaleString(ehEn ? 'en-US' : 'pt-BR')
                                : tr('erro', 'n/a')}
                            </strong>
                          ) : (
                            <input
                              type="number"
                              min="0"
                              placeholder="Qtd."
                              className="input-contagem-compacto"
                              title={tr('Anote quantos resultados encontrou no site para o PRISMA', 'Note result count from website for PRISMA')}
                              value={contagensManuais[b.id] ?? ''}
                              onChange={(e) =>
                                setContagensManuais((ant) => ({ ...ant, [b.id]: e.target.value }))
                              }
                            />
                          )}
                        </td>
                        <td style={{ textAlign: 'right' }}>
                          <div style={{ display: 'inline-flex', gap: 4, alignItems: 'center' }}>
                            <button
                              className="btn pequeno secundario"
                              onClick={() => abrirBuscador(b, false)}
                              title={temConsulta
                                ? tr(`Abrir o site de ${b.nome} já com sua busca preenchida`, `Search on ${b.nome} website`)
                                : tr(`Acessar o site oficial de ${b.nome}`, `Open ${b.nome} website`)}
                            >
                              <Icone nome="external" tam={12} /> {temConsulta ? tr('No site', 'On site') : tr('Site', 'Site')}
                            </button>
                            {podeImportarAqui && (
                              <button
                                className={`btn pequeno ${temResultadosApi ? 'primario' : 'secundario'}`}
                                onClick={() => buscarResultadosInline(b.contagem)}
                                title={tr('Ver lista e importar artigos direto no app', 'Import articles into library')}
                              >
                                {tr('Importar', 'Import')}
                              </button>
                            )}
                            <button className="btn-icone" onClick={() => setModalConta(b)} title={tr('Conta / Login', 'Account')}>
                              <Icone nome="key" tam={13} />
                            </button>
                            <button className="btn-icone" onClick={() => setModalNovoBuscador(b)} title={tr('Editar', 'Edit')}>
                              <Icone nome="edit" tam={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="grade-buscadores">
              {buscadoresVisiveis.map((b) => {
                const infoLogin = ROTULO_LOGIN[b.login] || ROTULO_LOGIN.livre;
                const rotuloInfoLogin = ehEn ? (infoLogin.textoEn || infoLogin.texto) : infoLogin.texto;
                const conta = contas[b.id];
                const cont = contagens[b.id];
                const temConsulta = Boolean(consulta.trim());
                const semResultados = cont?.status === 'ok' && Number(cont.valor) === 0;
                const temResultadosApi = cont?.status === 'ok' && Number(cont.valor) > 0;
                const podeImportarAqui = ['pubmed', 'europepmc', 'openalex'].includes(b.contagem) && !semResultados;
                return (
                  <div key={b.id} className="card-buscador" title={`${b.categoria} — ${b.descricao}`}>
                    <div className="card-buscador-topo">
                      <h4 title={b.nome}>{b.nome}</h4>
                      <div className="acoes-card-icone">
                        <button
                          className={`btn-icone ${b.favorito ? 'favorito-ativo' : ''}`}
                          onClick={() => alternarFavorito(b.id)}
                          title={tr('Marcar/desmarcar favorito', 'Toggle favorite')}
                        >
                          <Icone nome="star" cheio={b.favorito} tam={13} />
                        </button>
                        <button
                          className="btn-icone"
                          onClick={() => setModalNovoBuscador(b)}
                          title={tr('Editar URL ou categoria', 'Edit URL or category')}
                        >
                          <Icone nome="edit" tam={12} />
                        </button>
                      </div>
                    </div>

                    <div className="card-buscador-linha-status">
                      <div className="card-buscador-meta">
                        <span className={`badge-login ${infoLogin.classe}`}>{rotuloInfoLogin}</span>
                        {conta?.usuario && (
                          <span className="badge-conta" title={`${tr('Usuário salvo', 'Saved user')}: ${conta.usuario}`}>
                            <Icone nome="key" tam={10} />
                          </span>
                        )}
                      </div>

                      {b.contagem ? (
                        <span
                          className={`contagem-pill-compacta ${temResultadosApi ? 'com-hits' : ''}`}
                          title={tr('Total de resultados nesta base', 'Total hits in this database')}
                        >
                          {!cont
                            ? '—'
                            : cont.status === 'loading'
                            ? '…'
                            : cont.status === 'ok'
                            ? cont.valor.toLocaleString(ehEn ? 'en-US' : 'pt-BR')
                            : tr('indisp.', 'n/a')}
                        </span>
                      ) : (
                        <input
                          type="number"
                          min="0"
                          placeholder="Qtd."
                          className="input-contagem-compacto"
                          title={tr('Anote aqui o nº de resultados visto no site para o histórico PRISMA', 'Note hit count from the website for PRISMA')}
                          value={contagensManuais[b.id] ?? ''}
                          onChange={(e) =>
                            setContagensManuais((ant) => ({ ...ant, [b.id]: e.target.value }))
                          }
                        />
                      )}
                    </div>

                    <div className="card-buscador-rodape">
                      <button
                        className="btn pequeno secundario"
                        onClick={() => abrirBuscador(b, false)}
                        title={temConsulta
                          ? tr(`Acessar o site de ${b.nome} já pesquisando seus termos`, `Search "${consulta.trim()}" on ${b.nome} website`)
                          : tr(`Acessar o site externo de ${b.nome}`, `Open ${b.nome} website`)}
                      >
                        <Icone nome="external" tam={12} /> {temConsulta ? tr('Ir ao site', 'Search site') : tr('Acessar site', 'Website')}
                      </button>
                      {proxy && (b.login === 'cafe' || b.login === 'assinatura') && (
                        <button
                          className="btn pequeno secundario"
                          onClick={() => abrirBuscador(b, true)}
                          title={tr('Acessar site via proxy institucional', 'Open website via institutional proxy')}
                        >
                          Proxy
                        </button>
                      )}
                      {podeImportarAqui && (
                        <button
                          className={`btn pequeno ${temResultadosApi ? 'primario' : 'secundario'}`}
                          onClick={() => buscarResultadosInline(b.contagem)}
                          title={tr('Listar e importar artigos sem sair do programa', 'Browse & import articles inside the app')}
                        >
                          {tr('Importar', 'Import')}
                        </button>
                      )}
                      <button
                        className="btn pequeno fantasma"
                        onClick={() => setModalConta(b)}
                        title={tr('Configurar login/senha desta base', 'Configure credentials')}
                      >
                        <Icone nome="key" tam={12} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* ABA 2: RESULTADOS INLINE PARA IMPORTAÇÃO DIRETA */}
      {aba === 'resultados' && (
        <div className="painel-resultados-inline">
          <div className="barra-fontes-inline">
            <span>{tr('Fonte direta:', 'Direct source:')}</span>
            {[
              { id: 'pubmed', nome: 'PubMed / MEDLINE' },
              { id: 'europepmc', nome: tr('Europe PMC (texto aberto)', 'Europe PMC (Open Access)') },
              { id: 'openalex', nome: tr('OpenAlex (citações)', 'OpenAlex (Citations)') },
            ].map((f) => (
              <button
                key={f.id}
                className={`chip ${fonteResultados === f.id ? 'ativo' : ''}`}
                onClick={() => buscarResultadosInline(f.id)}
              >
                {f.nome}
              </button>
            ))}
          </div>

          {carregandoRes ? (
            <p className="dica-texto">Consultando {fonteResultados}…</p>
          ) : listaResultados.length === 0 ? (
            <p className="dica-texto">
              Digite sua busca acima e clique em uma das fontes para listar os artigos e importar com 1 clique.
            </p>
          ) : (
            <div className="lista-artigos-inline">
              {listaResultados.map((it, idx) => {
                const existe = jaNaBiblioteca(it);
                return (
                  <div key={it.pmid || it.doi || idx} className="item-artigo-inline">
                    <div className="item-artigo-info">
                      <h4>{it.titulo}</h4>
                      <div className="sub-meta">
                        {[
                          it.autores,
                          it.ano,
                          it.fonte,
                          it.pmid && `PMID: ${it.pmid}`,
                          it.doi && `DOI: ${it.doi}`,
                          it.citacoes != null && `${it.citacoes} citações`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </div>
                    </div>
                    <div className="item-artigo-acoes">
                      {existe ? (
                        <span className="badge-ja-existe">
                          <Icone nome="check" tam={13} /> Na biblioteca
                        </span>
                      ) : (
                        <>
                          <button
                            className="btn pequeno secundario"
                            onClick={() => importarItemResultado(it, 'a_ler', false)}
                          >
                            + A ler
                          </button>
                          <button
                            className="btn pequeno primario"
                            onClick={() => importarItemResultado(it, 'a_ler', true)}
                            title="Importa a referência e já tenta baixar o PDF gratuito (Open Access) direto para o OneDrive"
                          >
                            ⬇ Importar + PDF
                          </button>
                        </>
                      )}
                      {it.url && (
                        <button
                          className="btn-icone"
                          onClick={() => window.api.sistema.abrirLink(it.url)}
                          title="Abrir no navegador"
                        >
                          <Icone nome="external" tam={14} />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ABA 3: HISTÓRICO DE BUSCAS E COMPARAÇÃO ENTRE BASES (PRISMA) */}
      {aba === 'historico' && (
        <div className="painel-historico">
          <div className="historico-topo">
            <p className="dica-texto">
              Cada busca salva registra a data, a string utilizada e o número de resultados em cada base — ideal para documentar revisões de literatura e preencher o fluxograma PRISMA.
            </p>
          </div>
          {historico.length === 0 ? (
            <p className="dica-texto">Nenhuma busca salva ainda. Faça uma contagem na primeira aba e clique em "Salvar no Histórico".</p>
          ) : (
            <div className="lista-historico">
              {historico.map((h) => {
                const total = Object.values(h.resultados || {}).reduce((acc, v) => acc + (Number(v) || 0), 0);
                return (
                  <div key={h.id} className="card-historico">
                    <div className="card-historico-topo">
                      <div>
                        <code>{h.consulta}</code>
                        <span className="data-historico">
                          {new Date(h.data).toLocaleString('pt-BR')} · Total bruto: <strong>{total.toLocaleString('pt-BR')}</strong>
                        </span>
                      </div>
                      <div className="acoes-card-icone">
                        <button
                          className="btn pequeno secundario"
                          onClick={() => {
                            setConsulta(h.consulta);
                            setAba('painel');
                            dispararContagens(h.consulta);
                          }}
                        >
                          Repetir busca
                        </button>
                        <button
                          className="btn pequeno fantasma"
                          onClick={() => {
                            const linhas = Object.entries(h.resultados || {})
                              .map(([base, n]) => `${base}\t${n}`)
                              .join('\n');
                            window.api.sistema.copiarTexto(
                              `Estratégia: ${h.consulta}\nData: ${new Date(h.data).toLocaleDateString('pt-BR')}\nBase\tResultados\n${linhas}\nTotal\t${total}`
                            );
                            avisar('Tabela copiada! Cole no Word ou Excel.', 'ok');
                          }}
                        >
                          <Icone nome="copy" tam={13} /> Copiar tabela
                        </button>
                        <button
                          className="btn-icone perigo"
                          onClick={async () => {
                            await window.api.busc.excluirBusca(h.id);
                            setHistorico(historico.filter((x) => x.id !== h.id));
                          }}
                          title="Excluir registro"
                        >
                          <Icone nome="trash" tam={14} />
                        </button>
                      </div>
                    </div>
                    {h.notas && <p className="notas-historico">{h.notas}</p>}
                    <div className="pares-resultados">
                      {Object.entries(h.resultados || {}).map(([base, n]) => (
                        <span key={base} className="pill-contagem">
                          {base}: <strong>{Number(n).toLocaleString('pt-BR')}</strong>
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* ABA 4: CENTRAL DE CONTAS E PROXY */}
      {aba === 'contas' && (
        <div className="painel-contas">
          <div className="bloco-proxy">
            <h4>Acesso Institucional / Periódicos CAPES (CAFe) / Proxy EZProxy</h4>
            <p className="dica-texto">
              Para acessar bases restritas (Scopus, Web of Science, Embase, CINAHL), você pode entrar pelo{' '}
              <button
                className="link-inline"
                onClick={() => window.api.sistema.abrirLink('https://www.periodicos.capes.gov.br/')}
              >
                Portal de Periódicos CAPES (Acesso CAFe)
              </button>{' '}
              ou configurar abaixo o prefixo de proxy da biblioteca da sua instituição:
            </p>
            <div className="linha-form">
              <input
                value={proxy || ''}
                onChange={(e) => onMudarProxy(e.target.value)}
                placeholder="Ex.: https://ezproxy.suauniversidade.edu.br/login?url="
              />
            </div>
          </div>

          <div className="bloco-cofre">
            <h4>Cofre de Logins dos Buscadores (Criptografado pelo Windows neste notebook)</h4>
            <p className="dica-texto">
              Suas senhas são protegidas pela criptografia nativa do Windows (DPAPI) e <strong>nunca</strong> são enviadas para a pasta da nuvem. Ao clicar em "Abrir busca" num buscador que tenha senha salva, a senha é copiada automaticamente por 30 segundos.
            </p>

            <table className="tabela-contas">
              <thead>
                <tr>
                  <th>Buscador</th>
                  <th>Tipo de acesso</th>
                  <th>Usuário / E-mail salvo</th>
                  <th>Senha</th>
                  <th>Observações</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {catalogo
                  .filter((b) => !b.oculto)
                  .map((b) => {
                    const c = contas[b.id];
                    const info = ROTULO_LOGIN[b.login] || ROTULO_LOGIN.livre;
                    return (
                      <tr key={b.id}>
                        <td>
                          <strong>{b.nome}</strong>
                        </td>
                        <td>
                          <span className={`badge-login ${info.classe}`}>{info.texto}</span>
                        </td>
                        <td>{c?.usuario || '—'}</td>
                        <td>{c?.temSenha ? '••••••••' : '—'}</td>
                        <td>{c?.notas || '—'}</td>
                        <td className="acoes-celula">
                          {c?.usuario && (
                            <button
                              className="btn pequeno fantasma"
                              onClick={() => {
                                window.api.sistema.copiarTexto(c.usuario);
                                avisar('Usuário copiado!', 'ok');
                              }}
                            >
                              Copiar usuário
                            </button>
                          )}
                          {c?.temSenha && (
                            <button
                              className="btn pequeno secundario"
                              onClick={() =>
                                window.api.cofre
                                  .copiarSenha(b.id)
                                  .then(() => avisar('Senha copiada por 30s!', 'ok'))
                              }
                            >
                              Copiar senha
                            </button>
                          )}
                          <button className="btn pequeno primario" onClick={() => setModalConta(b)}>
                            {c ? 'Editar' : 'Cadastrar login'}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal de edição de conta no Cofre */}
      {modalConta && (
        <ModalEditarConta
          buscador={modalConta}
          contaAtual={contas[modalConta.id]}
          onFechar={() => setModalConta(null)}
          onSalvo={(novasContas) => {
            setContas(novasContas);
            setModalConta(null);
          }}
        />
      )}

      {/* Modal de criar/editar redirecionador de buscador */}
      {modalNovoBuscador && (
        <ModalEditarBuscador
          inicial={modalNovoBuscador}
          onFechar={() => setModalNovoBuscador(null)}
          onSalvar={async (dadosBuscador) => {
            const lista = [...catalogo];
            const idx = lista.findIndex((x) => x.id === dadosBuscador.id);
            if (idx >= 0) lista[idx] = { ...lista[idx], ...dadosBuscador };
            else lista.push(dadosBuscador);
            setCatalogo(await window.api.busc.salvarCatalogo({ buscadores: lista }));
            setModalNovoBuscador(null);
            avisar('Buscador salvo no catálogo!', 'ok');
          }}
          onExcluir={async (id) => {
            const lista = catalogo.map((x) => (x.id === id ? { ...x, oculto: true } : x));
            setCatalogo(await window.api.busc.salvarCatalogo({ buscadores: lista }));
            setModalNovoBuscador(null);
            avisar('Buscador ocultado do catálogo.', 'info');
          }}
        />
      )}
    </div>
  );
}

function ModalEditarConta({ buscador, contaAtual, onFechar, onSalvo }) {
  const avisar = useAviso();
  const [usuario, setUsuario] = useState(contaAtual?.usuario || '');
  const [senha, setSenha] = useState('');
  const [notas, setNotas] = useState(contaAtual?.notas || '');
  const [revelada, setRevelada] = useState(null);

  const salvar = async (e) => {
    e.preventDefault();
    try {
      const payload = { usuario: usuario.trim(), notas: notas.trim() };
      if (senha !== '') payload.senha = senha;
      const lista = await window.api.cofre.salvar(buscador.id, payload);
      avisar(`Credenciais de ${buscador.nome} salvas no cofre do Windows.`, 'ok');
      onSalvo(lista);
    } catch (err) {
      avisar(err.message, 'erro');
    }
  };

  const limpar = async () => {
    const lista = await window.api.cofre.remover(buscador.id);
    avisar('Credenciais removidas.', 'info');
    onSalvo(lista);
  };

  return (
    <Modal titulo={`Conta — ${buscador.nome}`} onFechar={onFechar} largura={460}>
      <form onSubmit={salvar} className="form-vertical">
        <label className="campo">
          <span className="campo-rotulo">Usuário / E-mail / CPF (CAFe)</span>
          <input value={usuario} onChange={(e) => setUsuario(e.target.value)} autoFocus />
        </label>
        <label className="campo">
          <span className="campo-rotulo">
            {contaAtual?.temSenha ? 'Nova senha (deixe em branco para manter a atual)' : 'Senha'}
          </span>
          <input
            type="password"
            value={senha}
            onChange={(e) => setSenha(e.target.value)}
            placeholder={contaAtual?.temSenha ? '••••••••' : ''}
          />
        </label>
        {contaAtual?.temSenha && (
          <div className="linha-revelar">
            <button
              type="button"
              className="btn pequeno fantasma"
              onClick={async () => setRevelada(revelada ? null : await window.api.cofre.revelar(buscador.id))}
            >
              <Icone nome="eye" tam={13} /> {revelada ? 'Ocultar senha atual' : 'Mostrar senha atual'}
            </button>
            {revelada && <code>{revelada}</code>}
          </div>
        )}
        <label className="campo">
          <span className="campo-rotulo">Observações (ex.: instituição CAFe, validade)</span>
          <input value={notas} onChange={(e) => setNotas(e.target.value)} />
        </label>
        <div className="modal-acoes">
          {contaAtual && (
            <button type="button" className="btn perigo" onClick={limpar}>
              Remover conta
            </button>
          )}
          <div className="acoes-direita">
            <button type="button" className="btn secundario" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn primario">
              Salvar no Cofre
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}

function ModalEditarBuscador({ inicial, onFechar, onSalvar, onExcluir }) {
  const ehNovo = !!inicial.novo;
  const [nome, setNome] = useState(inicial.nome || '');
  const [categoria, setCategoria] = useState(inicial.categoria || 'Saúde – bases principais');
  const [login, setLogin] = useState(inicial.login || 'livre');
  const [url, setUrl] = useState(inicial.url || 'https://');
  const [descricao, setDescricao] = useState(inicial.descricao || '');

  const submeter = (e) => {
    e.preventDefault();
    if (!nome.trim() || !url.trim()) return;
    const id =
      inicial.id ||
      nome
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-|-$/g, '') +
        '-' +
        Date.now().toString(36).slice(-3);
    onSalvar({
      ...inicial,
      novo: undefined,
      id,
      nome: nome.trim(),
      categoria: categoria.trim() || 'Personalizados',
      login,
      url: url.trim(),
      descricao: descricao.trim(),
      favorito: inicial.favorito ?? true,
    });
  };

  return (
    <Modal
      titulo={ehNovo ? 'Adicionar buscador / redirecionador' : `Editar ${inicial.nome}`}
      onFechar={onFechar}
      largura={520}
    >
      <form onSubmit={submeter} className="form-vertical">
        <label className="campo">
          <span className="campo-rotulo">Nome da base ou buscador</span>
          <input
            required
            autoFocus
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            placeholder="Ex.: Biblioteca Digital da USP"
          />
        </label>
        <div className="grade-2">
          <label className="campo">
            <span className="campo-rotulo">Categoria</span>
            <input
              value={categoria}
              onChange={(e) => setCategoria(e.target.value)}
              placeholder="Saúde – bases principais"
            />
          </label>
          <label className="campo">
            <span className="campo-rotulo">Tipo de acesso</span>
            <select value={login} onChange={(e) => setLogin(e.target.value)}>
              <option value="livre">Acesso livre</option>
              <option value="parcial">Parcialmente aberto</option>
              <option value="cadastro">Requer cadastro gratuito</option>
              <option value="cafe">CAPES / CAFe / Instituição</option>
              <option value="assinatura">Assinatura paga</option>
            </select>
          </label>
        </div>
        <label className="campo">
          <span className="campo-rotulo">URL de busca (use {'{q}'} onde entra o termo pesquisado)</span>
          <input
            required
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="Ex.: https://pubmed.ncbi.nlm.nih.gov/?term={q}"
          />
          <span className="campo-dica">
            Se a base não aceitar busca direta pela URL, coloque apenas o endereço inicial que ela abrirá normalmente.
          </span>
        </label>
        <label className="campo">
          <span className="campo-rotulo">Descrição curta</span>
          <input value={descricao} onChange={(e) => setDescricao(e.target.value)} />
        </label>
        <div className="modal-acoes">
          {!ehNovo && (
            <button type="button" className="btn perigo" onClick={() => onExcluir(inicial.id)}>
              Ocultar buscador
            </button>
          )}
          <div className="acoes-direita">
            <button type="button" className="btn secundario" onClick={onFechar}>
              Cancelar
            </button>
            <button type="submit" className="btn primario">
              Salvar
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
