import React, { useEffect, useMemo, useState } from 'react';
import { Icone, useAviso } from './ui.jsx';
import { autoresResumo, ano, semHtml, normalizar } from '../lib/csl.js';

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

  useEffect(() => {
    window.api.word.info().then(setInfoWord).catch(() => {});
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

  const citadasCount = refs.filter((r) => r.status === 'citada').length;
  const consultadasCount = refs.filter((r) => r.status === 'consultada').length;

  return (
    <div className="central-buscadores">
      <div className="topo-buscadores">
        <div>
          <h2>Integração Nativa com o Microsoft Word (ABNT, APA 7ª ed., Vancouver)</h2>
          <p className="subtitulo">
            Injete citações direto no cursor do Word como <strong>Campos dinâmicos (estilo Zotero/Mendeley)</strong> ou copie via ponte local na porta <code>{infoWord?.porta || 23119}</code>.
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
            title={infoWord?.telemetria?.ultimaAtividadeEm ? `Última comunicação Word: ${infoWord.telemetria.ultimaAtividadeEm}` : 'Servidor HTTP local pronto'}
          >
            ● Ponte Word :{infoWord?.porta || 23119} Ativa
          </span>
          <button className="btn fantasma" onClick={() => setMostrarPlugIns((v) => !v)}>
            🔌 {mostrarPlugIns ? 'Ocultar Plugins Office.js / VBA' : 'Instalar Plugin Word (Office.js / VBA)'}
          </button>
          <button className={`btn ${sempreNoTopo ? 'primario' : 'secundario'}`} onClick={alternarTopo}>
            <Icone nome="external" tam={14} />{' '}
            {sempreNoTopo ? 'Fixado no Topo (Ativo)' : 'Fixar janela ao lado do Word'}
          </button>
        </div>
      </div>

      {mostrarPlugIns && infoWord && (
        <div className="bloco-proxy" style={{ borderLeft: '4px solid #2563eb', background: '#f8fafc' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <div>
              <strong>Modos Nativos dentro da Faixa de Opções do Microsoft Word (estilo Zotero / Mendeley / Paperlib)</strong>
              <div style={{ fontSize: 12.5, color: '#475569', marginTop: 4 }}>
                • <strong>Opção 1 — Suplemento Moderno (Office.js):</strong> usa Content Controls <code>BIB_REF:id</code> conectados em <code>{infoWord.urlPainel}</code>.<br />
                • <strong>Opção 2 — Macro Ribbon VBA (<code>Bibliografia.bas</code> + <code>customUI14.xml</code>):</strong> alterna entre Campos Nativos (<code>wdFieldAddin</code>) e Bookmarks (<code>BIB_BREF_...</code>) + grifos/comentários direto no Word.
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="btn pequeno secundario" onClick={() => window.api.word.mostrarManifesto()}>
                <Icone nome="folder" tam={13} /> Ver manifest.xml (Office.js)
              </button>
              <button className="btn pequeno primario" onClick={() => window.api.word.abrirPastaVba()}>
                <Icone nome="folder" tam={13} /> Abrir Pasta Macro VBA (.bas / customUI)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Barra de configuração do documento e exportação/injeção em 1 clique */}
      <div className="bloco-proxy">
        <div className="grade-3">
          <label className="campo">
            <span className="campo-rotulo">Documento / Manuscrito ativo</span>
            <input
              value={nomeDoc}
              onChange={(e) => setNomeDoc(e.target.value)}
              placeholder="Ex.: Dissertação - Cap. 2"
            />
          </label>
          <label className="campo">
            <span className="campo-rotulo">Norma de formatação do documento</span>
            <select value={estilo} onChange={(e) => onMudarEstilo(e.target.value)}>
              {estilos.map((e) => (
                <option key={e.id} value={e.id}>
                  {e.nome}
                </option>
              ))}
            </select>
          </label>
          <label className="campo">
            <span className="campo-rotulo">Página p/ citação direta (opcional)</span>
            <input
              value={pagina}
              onChange={(e) => setPagina(e.target.value)}
              placeholder="Ex.: 45 (gera SILVA, 2023, p. 45)"
            />
          </label>
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginTop: 8 }}>
          <div className="barra-pdf">
            <button className="btn primario" onClick={() => inserirOuCopiarListaWord('citadas')}>
              <Icone nome="copy" tam={14} /> 1. Inserir/Copiar REFERÊNCIAS ({citadasCount} Citadas)
            </button>
            <button className="btn secundario" onClick={() => inserirOuCopiarListaWord('consultadas')}>
              <Icone nome="copy" tam={14} /> 2. Inserir/Copiar CONSULTADAS ({consultadasCount})
            </button>
            <button className="btn fantasma" onClick={abrirExtratorDocx} disabled={extraindoDocx} style={{ border: '1px solid #cbd5e1' }}>
              🔍 {extraindoDocx ? 'Extraindo XML do Word…' : 'Extrair Citações / Campos de .DOCX (Ref-Extractor)'}
            </button>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: '#334155', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={usarCampoNativo}
              onChange={(e) => setUsarCampoNativo(e.target.checked)}
            />
            Inserir como Campo protegido no Word aberto (<code>wdFieldAddin</code>)
          </label>
        </div>
      </div>

      {/* Resultado do Ref-Extractor (Zotero / Mendeley / EndNote / ABNT de qualquer .DOCX) */}
      {extracaoDocx && (
        <div className="bloco-cofre" style={{ borderLeft: '4px solid #0d9488' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 10 }}>
            <div>
              <strong>🔍 Extrator Reverso de Citações ({extracaoDocx.nomeArquivo})</strong>
              <div style={{ fontSize: 12, color: '#475569', marginTop: 2 }}>
                Modo: <strong>{extracaoDocx.origemModo === 'campos_dinamicos' ? 'Campos Dinâmicos XML (Zotero / Mendeley / EndNote / Bibliografia)' : 'Referências Estáticas (ABNT/Vancouver)'}</strong> ·{' '}
                Total: <strong>{extracaoDocx.resumo.totalObrasUnicas}</strong> obra(s) · Já na biblioteca: <strong>{extracaoDocx.resumo.jaNaBiblioteca}</strong> · Novas: <strong>{extracaoDocx.resumo.novasParaImportar}</strong>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                className="btn pequeno primario"
                onClick={importarExtraidasParaBiblioteca}
                disabled={importandoExtracao || !extracaoDocx.itens.length}
              >
                {importandoExtracao ? 'Importando…' : `📥 Importar / Sincronizar (${extracaoDocx.resumo.totalObrasUnicas}) como Citadas`}
              </button>
              <button className="btn pequeno fantasma" onClick={() => setExtracaoDocx(null)}>
                Fechar
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
                    {it.csl?.author?.[0]?.family || it.csl?.author?.[0]?.literal || 'Autor n/d'} ·{' '}
                    {it.csl?.issued?.['date-parts']?.[0]?.[0] || 's.d.'} ·{' '}
                    {it.csl?.DOI ? `DOI: ${it.csl.DOI} · ` : ''}
                    Citada {it.ocorrencias}x ({it.origens.join(', ')})
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
                  {it.naBiblioteca ? '✓ Na Biblioteca' : '+ Nova p/ Importar'}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Lista rápida para citar em 1 clique (com suporte a multi-citação composta) */}
      <div className="bloco-cofre">
        <div className="barra-lista" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
          <strong>Clique em "⚡ Citar no Word" para injetar no cursor / copiar e já marcar como Citada:</strong>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {selecionadasComposta.size >= 2 && (
              <button
                className="btn pequeno primario"
                onClick={() => citarIdsNoWord([...selecionadasComposta])}
              >
                ⚡ Citar {selecionadasComposta.size} juntas no Word
              </button>
            )}
            <input
              style={{ width: 320, padding: '5px 10px', borderRadius: 6, border: '1px solid #cbd5e1' }}
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Buscar por autor, título ou ano…"
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
                  {r.status === 'citada' ? '✓ Citada' : r.status === 'consultada' ? 'Consultada' : 'A ler'}
                </span>
                <button className="btn pequeno primario" onClick={() => citarIdsNoWord([r.id])}>
                  <Icone nome="copy" tam={13} /> ⚡ Citar no Word
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
          <h2>Triagem Sistemática em Duplo-Cego, Deduplicação Segura &amp; Fluxograma PRISMA 2020</h2>
          <p className="subtitulo">
            Gestão metodológica completa da sua revisão: remova duplicatas sem perder notas e PDFs, faça a triagem rápida de resumos e gere o fluxograma oficial para publicação.
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn primario" onClick={copiarRelatorioPrisma}>
            <Icone nome="copy" tam={14} /> Copiar Relatório (.DOCX)
          </button>
          <button className="btn secundario" onClick={copiarTabelaMarkdown}>
            <Icone nome="copy" tam={14} /> Copiar Tabela Markdown
          </button>
        </div>
      </div>

      {/* Stepper visual do fluxo PRISMA */}
      <div className="prisma-passos-banner">
        <div
          className={`prisma-passo-card ${aba === 'duplicatas' ? 'ativo' : ''}`}
          onClick={() => setAba('duplicatas')}
        >
          <strong>1. Desduplicação Segura</strong>
          <span>Une cópias sem perder PDFs, anotações ou tags</span>
          <div
            className="prisma-passo-badge"
            style={{
              background: gruposDuplicados.length > 0 ? '#fef3c7' : '#dcfce7',
              color: gruposDuplicados.length > 0 ? '#92400e' : '#166534',
            }}
          >
            {gruposDuplicados.length > 0 ? `${gruposDuplicados.length} grupos duplicados` : '✓ 0 duplicatas'}
          </div>
        </div>

        <div
          className={`prisma-passo-card ${aba === 'triagem' ? 'ativo' : ''}`}
          onClick={() => setAba('triagem')}
        >
          <strong>2. Triagem de Títulos e Resumos (Duplo-Cego)</strong>
          <span>Avalie títulos e resumos: inclua ou exclua com motivo</span>
          <div
            className="prisma-passo-badge"
            style={{
              background: pendentesTriagem.length > 0 ? '#dbeafe' : '#f1f5f9',
              color: pendentesTriagem.length > 0 ? '#1e40af' : '#64748b',
            }}
          >
            {pendentesTriagem.length} pendentes na fila
          </div>
        </div>

        <div
          className={`prisma-passo-card ${aba === 'prisma' ? 'ativo' : ''}`}
          onClick={() => setAba('prisma')}
        >
          <strong>3. Fluxograma PRISMA 2020</strong>
          <span>Diagrama oficial com números consolidados para o artigo</span>
          <div
            className="prisma-passo-badge"
            style={{
              background: '#dcfce7',
              color: '#166534',
            }}
          >
            {citadas.length} incluídas · {consultadas.length} lidas
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
                🛡️ Como funciona a Deduplicação e o que acontece ao Mesclar?
              </h4>
              <button
                className="btn fantasma pequeno"
                onClick={() => setMostrarExplicacaoSeguranca((v) => !v)}
                style={{ padding: '2px 8px', fontSize: 11 }}
              >
                {mostrarExplicacaoSeguranca ? 'Recolher explicação' : 'Entender o que acontece'}
              </button>
            </div>

            {mostrarExplicacaoSeguranca && (
              <div style={{ marginTop: 8 }}>
                <p style={{ margin: '0 0 6px' }}>
                  <strong>Por que o sistema sugere mesclar?</strong> Artigos importados de diferentes bases (ex.: PubMed, SciELO, Crossref) frequentemente possuem o mesmo identificador digital (DOI), código PubMed (PMID) ou título idêntico. O sistema detecta essas repetições automaticamente.
                </p>
                <strong>O que acontece ao clicar em "Mesclar":</strong>
                <ul>
                  <li><strong>Zero perda de PDFs:</strong> Se qualquer um dos registros possuir PDF anexo, ele é preservado e associado à obra definitiva mantida.</li>
                  <li><strong>Unificação de Notas e Etiquetas:</strong> Suas anotações de leitura e tags de ambos os registros são unidas e concatenadas, nunca apagadas.</li>
                  <li><strong>Preservação do Status Mais Avançado:</strong> Se uma cópia estava como "A ler" e a outra já foi marcada como "Consultada" ou "Citada", o status ativo é mantido.</li>
                  <li><strong>Enriquecimento de Metadados:</strong> Campos vazios em um registro (resumo, volume, páginas, periódico) são completados a partir do outro.</li>
                  <li><strong>Exclusão limpa:</strong> Apenas o arquivo JSON redundante é removido do disco, mantendo seu catálogo limpo e exato.</li>
                </ul>
              </div>
            )}
          </div>

          {gruposDuplicados.length === 0 ? (
            <div className="bloco-painel" style={{ textAlign: 'center', padding: '36px 20px' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}>🎉</div>
              <h3 style={{ margin: '0 0 6px', color: '#166534' }}>Nenhuma Duplicata Detectada!</h3>
              <p style={{ color: 'var(--texto-suave)', maxWidth: 520, margin: '0 auto', fontSize: 13 }}>
                Todos os registros da sua biblioteca possuem DOIs, PMIDs e títulos únicos. Você pode prosseguir com segurança para a fase de <strong>Triagem Rápida</strong> ou consultar o <strong>Fluxograma PRISMA 2020</strong>.
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
                    placeholder="Filtrar duplicatas por título, autor ou DOI…"
                  />
                  <span style={{ fontSize: 12.5, color: 'var(--texto-suave)' }}>
                    Exibindo {gruposFiltrados.length} de {gruposDuplicados.length} grupos
                  </span>
                </div>

                <button
                  className="btn primario"
                  onClick={mesclarTodasDuplicatas}
                  disabled={processandoMescla}
                >
                  ⚡ {processandoMescla ? 'Mesclando...' : `Mesclar Todos os ${gruposDuplicados.length} Grupos com Segurança`}
                </button>
              </div>

              {gruposFiltrados.map((g, i) => {
                const principal = g.principalSugerido;
                const criterioBadge =
                  g.criterioTipo === 'doi'
                    ? `🎯 DOI Idêntico: ${g.criterioValor}`
                    : g.criterioTipo === 'pmid'
                    ? `🧬 PMID Idêntico: ${g.criterioValor}`
                    : `🔤 Título Praticamente Idêntico`;

                return (
                  <div key={g.id} className="card-duplicata-grupo">
                    <div className="card-duplicata-cabecalho">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                        <span className="badge-criterio">{criterioBadge}</span>
                        <strong style={{ fontSize: 13.5 }}>Grupo #{i + 1}: {semHtml(principal.csl?.title)}</strong>
                      </div>
                      <button
                        className="btn pequeno primario"
                        onClick={() => mesclarGrupo(g, principal)}
                        disabled={processandoMescla}
                      >
                        ✓ Mesclar {g.itens.length} cópias (Manter o mais completo)
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
                                  {ehPrincipal ? '⭐ Principal Recomendado (Mais Completo)' : `Cópia redundante #${idx}`}
                                </span>
                                <code style={{ fontSize: 11, color: '#64748b' }}>{r.id}.json</code>
                                <span
                                  className="pill-contagem"
                                  style={{
                                    background: r.status === 'citada' ? '#dcfce7' : r.status === 'consultada' ? '#dbeafe' : '#f1f5f9',
                                    color: r.status === 'citada' ? '#166534' : r.status === 'consultada' ? '#1e40af' : '#475569',
                                  }}
                                >
                                  Status: {r.status === 'citada' ? '✓ Citada' : r.status === 'consultada' ? 'Consultada' : 'A ler'}
                                </span>
                                {r.pdf ? (
                                  <span className="pill-contagem" style={{ background: '#e0f2fe', color: '#0369a1' }}>
                                    📄 PDF Anexo
                                  </span>
                                ) : (
                                  <span className="pill-contagem" style={{ background: '#f8fafc', color: '#94a3b8' }}>
                                    Sem PDF
                                  </span>
                                )}
                                {r.notas && (
                                  <span className="pill-contagem" style={{ background: '#fef3c7', color: '#92400e' }}>
                                    📝 Com Anotações
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
                                title="Define este registro como o principal a ser mantido em vez do sugerido automaticamente"
                                style={{ fontSize: 11, whiteSpace: 'nowrap' }}
                              >
                                Manter este em vez do outro
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
            <h4 style={{ margin: '0 0 4px' }}>📋 Como operar a Triagem Rápida de Título e Resumo</h4>
            <p style={{ margin: 0 }}>
              Avalie cada estudo importado. Clique em <strong>"✓ Incluir (Consultada)"</strong> para aprovar para leitura integral, <strong>"★ Incluir e Citar"</strong> se já for usar diretamente na escrita, ou <strong>"✕ Excluir"</strong> selecionando o motivo para o diagrama PRISMA.
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
                placeholder="Buscar por termo no título, autor ou resumo…"
              />
              <span style={{ fontSize: 12.5, color: 'var(--texto-suave)' }}>
                {pendentesTriagem.length} artigos aguardando triagem
              </span>
            </div>

            <label className="campo-inline" style={{ margin: 0 }}>
              <span style={{ fontSize: 12, fontWeight: 600 }}>Motivo padrão ao Excluir:</span>
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
              <h3 style={{ margin: '0 0 6px', color: '#166534' }}>Fila de Triagem Vazia!</h3>
              <p style={{ color: 'var(--texto-suave)', maxWidth: 500, margin: '0 auto', fontSize: 13 }}>
                Todos os artigos da biblioteca já foram triados (como Consultados, Citados ou Descartados com justificativa).
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
                            avisar(`Artigo incluído como "Consultada" (para leitura integral)!`, 'ok');
                          }}
                        >
                          ✓ Incluir (Consultada)
                        </button>
                        <button
                          className="btn pequeno secundario"
                          onClick={() => {
                            onAtualizarRef(r.id, { status: 'citada' });
                            avisar(`Artigo marcado para citação direta!`, 'ok');
                          }}
                        >
                          ★ Incluir e Citar
                        </button>
                        <button
                          className="btn pequeno perigo"
                          onClick={() => {
                            onAtualizarRef(r.id, { status: 'descartada', motivoExclusao: motivoPadrao });
                            avisar(`Artigo excluído: "${motivoPadrao}"`, 'info');
                          }}
                          title={`Exclui registrando o motivo: "${motivoPadrao}"`}
                        >
                          ✕ Excluir ({motivoPadrao.split(' ')[0]}…)
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
                          {aberto ? '▲ Recolher Resumo' : '▼ Ler Resumo Completo'}
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
            <h4 style={{ margin: '0 0 4px' }}>📊 Fluxograma Oficial PRISMA 2020 (Page et al., 2021)</h4>
            <p style={{ margin: 0 }}>
              Este diagrama reflete com exatidão as 4 etapas da sua revisão sistemática. Use os botões no topo para copiar o relatório quantitativo e colá-lo pronto no Word ou Markdown.
            </p>
          </div>

          <div className="prisma-diagrama">
            {/* ETAPA 1: IDENTIFICAÇÃO */}
            <div style={{ width: '100%', textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5 }}>
              1. Fase de Identificação
            </div>
            <div className="prisma-etapa-linha">
              <div className="prisma-caixa">
                <h5>Registros identificados nas buscas em bases de dados</h5>
                <div className="prisma-numero">{(totalIdentificadosBases || refs.length).toLocaleString('pt-BR')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 4 }}>
                  Histórico de buscas em bases (PubMed, Scopus, SciELO, etc.)
                </div>
              </div>

              <div className="prisma-seta-lado">➔</div>

              <div className="prisma-caixa exclusao">
                <h5>Duplicatas removidas antes da triagem</h5>
                <div className="prisma-numero">{gruposDuplicados.length} grupos detectados</div>
                <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 4 }}>
                  {gruposDuplicados.length === 0 ? '✓ Biblioteca 100% deduplicada' : 'Aguardando mescla segura na Aba 1'}
                </div>
              </div>
            </div>

            <div className="prisma-seta-baixo">↓</div>

            {/* ETAPA 2: TRIAGEM */}
            <div style={{ width: '100%', textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#1e40af', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 }}>
              2. Fase de Triagem (Screening)
            </div>
            <div className="prisma-etapa-linha">
              <div className="prisma-caixa">
                <h5>Registros triados por título e resumo</h5>
                <div className="prisma-numero">{refs.length.toLocaleString('pt-BR')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 4 }}>
                  {pendentesTriagem.length > 0 ? `(${pendentesTriagem.length} pendentes na fila de triagem)` : '✓ Triagem de resumos concluída'}
                </div>
              </div>

              <div className="prisma-seta-lado">➔</div>

              <div className="prisma-caixa exclusao">
                <h5>Registros excluídos na triagem</h5>
                <div className="prisma-numero">{descartadas.length} artigos</div>
                <div style={{ marginTop: 6, fontSize: 11.5 }}>
                  {Object.entries(motivosContagem).length === 0 ? (
                    <span style={{ color: 'var(--texto-suave)' }}>Nenhuma exclusão registrada ainda</span>
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
              3. Fase de Elegibilidade (Texto Completo)
            </div>
            <div className="prisma-etapa-linha">
              <div className="prisma-caixa">
                <h5>Artigos em texto completo avaliados para elegibilidade</h5>
                <div className="prisma-numero">{(consultadas.length + citadas.length).toLocaleString('pt-BR')}</div>
                <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 4 }}>
                  Leitura na íntegra do PDF do artigo
                </div>
              </div>

              <div className="prisma-seta-lado">➔</div>

              <div className="prisma-caixa">
                <h5>Bibliografia Consultada (Leitura Integral)</h5>
                <div className="prisma-numero" style={{ color: '#2563eb' }}>{consultadas.length} artigos</div>
                <div style={{ fontSize: 11.5, color: 'var(--texto-suave)', marginTop: 4 }}>
                  Lidos como suporte teórico, sem citação direta no texto
                </div>
              </div>
            </div>

            <div className="prisma-seta-baixo">↓</div>

            {/* ETAPA 4: INCLUSÃO FINAL */}
            <div style={{ width: '100%', textAlign: 'center', fontWeight: 700, fontSize: 13, color: '#059669', textTransform: 'uppercase', letterSpacing: 0.5, marginTop: 10 }}>
              4. Fase de Inclusão Final
            </div>
            <div className="prisma-caixa inclusao" style={{ width: '100%', maxWidth: 520 }}>
              <h5 style={{ color: '#065f46', fontSize: 14 }}>
                🏆 Estudos incluídos na síntese qualitativa / Citados no manuscrito
              </h5>
              <div className="prisma-numero">{citadas.length} estudos finais</div>
              <p style={{ margin: '6px 0 0', fontSize: 12, color: '#047857' }}>
                Estes são os artigos com status <strong>Citada</strong>, exportados automaticamente para a seção de Referências no seu Word.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
