import React, { useEffect, useMemo, useState } from 'react';
import { autoresResumo, ano, semHtml } from '../lib/csl.js';
import { useI18n } from '../i18n.jsx';

/**
 * Badge visual explícito indicando o ALVO exato da inconformidade
 * (Seu Manuscrito vs. Citação/Obra Externa vs. Cruzamento entre ambos).
 */
export function BadgeAlvoAlerta({ alvo = 'manuscrito', estiloCompacto = false }) {
  const { tr } = useI18n();
  const configs = {
    manuscrito: {
      rotulo: `📝 ${tr('ALVO: SEU MANUSCRITO (Texto em Redação)', 'TARGET: YOUR MANUSCRIPT (Writing Text)')}`,
      curto: `📝 ${tr('Seu Manuscrito', 'Your Manuscript')}`,
      bg: 'rgba(37, 99, 235, 0.1)',
      cor: '#1d4ed8',
      borda: 'rgba(37, 99, 235, 0.35)',
      dica: tr('Este alerta avalia a redação, estilo, metodologia ou formatação do SEU documento.', 'This alert evaluates the writing, style, methodology, or formatting of YOUR document.'),
    },
    citacao: {
      rotulo: `📚 ${tr('ALVO: CITAÇÃO / OBRA EXTERNA', 'TARGET: CITATION / EXTERNAL WORK')}`,
      curto: `📚 ${tr('Obra Citada', 'Cited Work')}`,
      bg: 'rgba(217, 119, 6, 0.1)',
      cor: '#b45309',
      borda: 'rgba(217, 119, 6, 0.35)',
      dica: tr('Este alerta avalia os metadados, autenticidade ou periódico de uma REFERÊNCIA citada por você.', 'This alert evaluates metadata, authenticity, or journal of a REFERENCE cited by you.'),
    },
    cruzamento: {
      rotulo: `🔗 ${tr('ALVO: CRUZAMENTO (Seu Texto ↔ Obra Citada)', 'TARGET: CROSS-CHECK (Your Text ↔ Cited Work)')}`,
      curto: `🔗 ${tr('Seu Texto ↔ Obra', 'Your Text ↔ Work')}`,
      bg: 'rgba(13, 148, 136, 0.1)',
      cor: '#0f766e',
      borda: 'rgba(13, 148, 136, 0.35)',
      dica: tr('Este alerta compara o que VOCÊ escreveu no parágrafo com a lista final de Referências ou conteúdo do PDF.', 'This alert compares what YOU wrote in the paragraph against your References list or PDF content.'),
    },
  };
  const cfg = configs[alvo] || configs.manuscrito;
  return (
    <span
      className="tag-mini"
      title={cfg.dica}
      style={{
        background: cfg.bg,
        color: cfg.cor,
        border: `1px solid ${cfg.borda}`,
        fontWeight: 700,
        fontSize: 10.8,
        padding: '2px 7px',
        borderRadius: 4,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
      }}
    >
      {estiloCompacto ? cfg.curto : cfg.rotulo}
    </span>
  );
}

/**
 * Componente padronizado para ações de resolução vs descarte (Resolver / Já Corrigi / Ignorar)
 */
export function AcoesResolucaoAlerta({
  idItem,
  statusAtual, // null | 'resolvido' | 'ignorado'
  onDefinirStatus,
  onAbrirResolver,
  onAbrirWord,
  onAbrirSplitView,
  rotuloResolver,
}) {
  const { tr } = useI18n();
  const labelResolver = rotuloResolver || tr('🛠️ Resolver / Editar', '🛠️ Resolve / Edit');
  if (statusAtual === 'resolvido') {
    return (
      <button
        type="button"
        className="btn pequeno"
        onClick={() => onDefinirStatus(idItem, null)}
        title={tr('Marcado como resolvido/corrigido. Clique para reabrir.', 'Marked as resolved/fixed. Click to reopen.')}
        style={{
          background: '#dcfce7',
          color: '#15803d',
          borderColor: '#86efac',
          fontWeight: 700,
          fontSize: 11.3,
          padding: '3px 8px',
        }}
      >
        ✓ {tr('Resolvido (Desfazer)', 'Resolved (Undo)')}
      </button>
    );
  }

  if (statusAtual === 'ignorado') {
    return (
      <button
        type="button"
        className="btn pequeno"
        onClick={() => onDefinirStatus(idItem, null)}
        title={tr('Você optou por ignorar este alerta. Clique para restaurar.', 'You chose to ignore this alert. Click to restore.')}
        style={{
          background: '#f1f5f9',
          color: '#475569',
          borderColor: '#cbd5e1',
          fontWeight: 700,
          fontSize: 11.3,
          padding: '3px 8px',
        }}
      >
        🚫 {tr('Ignorado (Desfazer)', 'Ignored (Undo)')}
      </button>
    );
  }

  return (
    <div style={{ display: 'inline-flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
      {onAbrirResolver && (
        <button
          type="button"
          className="btn pequeno primario"
          onClick={onAbrirResolver}
          title={tr('Abrir estúdio de resolução (editar texto, remover citação, inserir referência no Word ou pular para o Word)', 'Open resolution studio (edit text, remove citation, insert reference in Word, or jump to Word)')}
          style={{ fontSize: 11.3, padding: '3px 8px', fontWeight: 600 }}
        >
          {labelResolver}
        </button>
      )}
      {onAbrirSplitView && (
        <button
          type="button"
          className="btn pequeno secundario"
          onClick={onAbrirSplitView}
          title={tr('Comparar lado a lado o texto do Word com a página do PDF original', 'Compare Word text side by side with original PDF page')}
          style={{ fontSize: 11.3, padding: '3px 8px' }}
        >
          ⚖️ Word ↔ PDF
        </button>
      )}
      {onAbrirWord && (
        <button
          type="button"
          className="btn pequeno fantasma"
          onClick={onAbrirWord}
          title={tr('Abrir o arquivo no Microsoft Word e ir direto para este trecho', 'Open file in Microsoft Word and jump directly to this passage')}
          style={{ fontSize: 11.3, padding: '3px 7px', borderColor: 'rgba(37,99,235,0.3)', color: '#1d4ed8' }}
        >
          📂 {tr('Ir ao Word', 'Go to Word')}
        </button>
      )}
      <button
        type="button"
        className="btn pequeno fantasma"
        onClick={() => onDefinirStatus(idItem, 'resolvido')}
        title={tr('Já corrigi este problema no meu texto', 'I already fixed this issue in my text')}
        style={{ color: '#15803d', borderColor: 'rgba(22, 163, 74, 0.35)', fontSize: 11.2, padding: '3px 7px' }}
      >
        ✓ {tr('Resolvido', 'Resolved')}
      </button>
      <button
        type="button"
        className="btn pequeno fantasma"
        onClick={() => onDefinirStatus(idItem, 'ignorado')}
        title={tr('Ignorar / Não se aplica ao meu estudo (não vou alterar)', 'Ignore / Not applicable to my study')}
        style={{ color: '#64748b', borderColor: 'rgba(100, 116, 139, 0.35)', fontSize: 11.2, padding: '3px 7px' }}
      >
        🚫 {tr('Ignorar', 'Ignore')}
      </button>
    </div>
  );
}

/**
 * Estúdio Interativo de Resolução Assistida (Editor Interno + Cirurgia Word .DOCX + Inserção de Referências)
 */
export default function AuditResolutionModal({
  itemResolucao,
  refsBiblioteca = [],
  estilo = 'abnt',
  idioma = 'pt-BR',
  caminhoDocx = '',
  textoManuscrito = '',
  somenteLeitura = false,
  onAplicarCirurgiaNoDocx,
  onAtualizarTextoLocal,
  onDefinirStatus,
  onImportarCsl,
  onAbrirNoWord,
  onAbrirSplitView,
  onAbrirPdfLeitor,
  onSalvarTrechoCitado,
  onCopiarPromptIa,
  onFechar,
  avisar,
}) {
  const { tr } = useI18n();
  const cat = itemResolucao?.categoria || 'geral';
  const abaInicial = ['orfa', 'ia'].includes(cat) ? 'referencia' : cat === 'sobrando' ? 'lista_sob' : 'texto';

  const [abaAtiva, setAbaAtiva] = useState(abaInicial);
  const textoBaseOriginal = itemResolucao?.fraseWord || itemResolucao?.paragrafoCompleto || itemResolucao?.textoOriginal || '';
  const [textoEditado, setTextoEditado] = useState(textoBaseOriginal);
  const [modoExclusaoCompleta, setModoExclusaoCompleta] = useState(false);

  // Estado da Aba de Busca e Inserção de Referência
  const [buscaRef, setBuscaRef] = useState(() => {
    const k = itemResolucao?.chaveCitacao || itemResolucao?.autorCitado || '';
    return k.replace(/[(),]/g, ' ').trim();
  });
  const [fonteOnline, setFonteOnline] = useState('openalex');
  const [resultadosOnline, setResultadosOnline] = useState([]);
  const [carregandoOnline, setCarregandoOnline] = useState(false);
  const [refSelecionada, setRefSelecionada] = useState(itemResolucao?.refBibItem || null);
  const [textoRefFormatada, setTextoRefFormatada] = useState('');
  const [atualizarChamadaTexto, setAtualizarChamadaTexto] = useState(false);
  const [novaChamadaTexto, setNovaChamadaTexto] = useState('');
  const [declaracaoTexto, setDeclaracaoTexto] = useState('');
  const [salvando, setSalvando] = useState(false);
  const [salvandoTrecho, setSalvandoTrecho] = useState(false);
  const [trechoSalvoOk, setTrechoSalvoOk] = useState(false);
  const [justificativaEditorial, setJustificativaEditorial] = useState('');
  const [salvandoDecisao, setSalvandoDecisao] = useState(false);

  const salvarFalsoPositivoJustificado = async () => {
    setSalvandoDecisao(true);
    try {
      const fraseAlvo = itemResolucao?.fraseWord || itemResolucao?.paragrafoCompleto || itemResolucao?.textoReferencia || '';
      const referenciaAlvo = itemResolucao?.refBibItem?.id || itemResolucao?.chaveCitacao || itemResolucao?.autorCitado || '';
      const codigoAlvo = itemResolucao?.codigoAlerta || itemResolucao?.tipoAlerta || itemResolucao?.categoria || 'alerta';
      if (typeof window.api?.audit?.salvarDecisaoEditorial === 'function') {
        await window.api.audit.salvarDecisaoEditorial({
          fraseManuscrito: fraseAlvo,
          referenciaId: referenciaAlvo,
          codigoAlerta: codigoAlvo,
          justificativa: justificativaEditorial.trim() || 'Falso positivo justificado pelo pesquisador.',
          idItem: itemResolucao?.idItem || '',
          diagnostico: itemResolucao?.diagnostico || '',
        });
      }
      onDefinirStatus?.(itemResolucao.idItem, 'ignorado');
      avisar?.('Decisão editorial salva (SHA-256). Este alerta ficará suprimido enquanto a frase não for alterada.', 'ok');
      onFechar?.();
    } catch (e) {
      avisar?.(e.message || 'Erro ao salvar decisão editorial.', 'erro');
    } finally {
      setSalvandoDecisao(false);
    }
  };

  // Carrega template sugerido de declaração quando for alerta metodológico / fomento / ética
  useEffect(() => {
    const tipo = itemResolucao?.tipoAlerta || '';
    if (tipo === 'ausencia_declaracao_conflitos') {
      setDeclaracaoTexto('Conflito de interesses: Os autores declaram não possuir conflitos de interesse relacionados ao conteúdo deste estudo.');
    } else if (tipo === 'capes_falta_codigo_001' || tipo === 'ausencia_declaracao_fomento') {
      setDeclaracaoTexto('Financiamento: O presente trabalho foi realizado com apoio da Coordenação de Aperfeiçoamento de Pessoal de Nível Superior - Brasil (CAPES) - Código de Financiamento 001.');
    } else if (tipo === 'ausencia_aprovacao_etica' || tipo === 'ausencia_mencao_tcle') {
      setDeclaracaoTexto('Aspectos éticos: O presente trabalho configura projeto de intervenção técnica e modelagem informacional utilizando dados públicos agregados sem identificação individual, estando dispensado de apreciação pelo Comitê de Ética em Pesquisa nos termos da Resolução CNS nº 510/2016.');
    } else if (tipo === 'ausencia_criterios_elegibilidade') {
      setDeclaracaoTexto('Critérios de elegibilidade: Foram considerados elegíveis os registros completos e válidos no período definido para a intervenção, excluindo-se registros duplicados ou inconsistentes.');
    }
  }, [itemResolucao]);

  // Filtra obras na biblioteca local do usuário
  const matchesBiblioteca = useMemo(() => {
    const q = buscaRef.toLowerCase().trim();
    if (!q) return refsBiblioteca.slice(0, 12);
    const tokens = q.split(/\s+/).filter((t) => t.length >= 2);
    return refsBiblioteca
      .filter((r) => {
        const blob = `${semHtml(r.csl?.title || '')} ${autoresResumo(r.csl || {})} ${ano(r.csl || {})} ${r.csl?.['container-title'] || ''}`.toLowerCase();
        return tokens.some((tk) => blob.includes(tk));
      })
      .slice(0, 15);
  }, [buscaRef, refsBiblioteca]);

  // Ao selecionar uma referência da biblioteca, gera prévia ABNT via IPC
  const selecionarRefBiblioteca = async (ref) => {
    setRefSelecionada(ref);
    const autor = (autoresResumo(ref.csl || {}) || 'AUTOR').split(/[,;]/)[0].trim().toUpperCase();
    const a = ano(ref.csl || {}) || 's.d.';
    setNovaChamadaTexto(`(${autor}, ${a})`);
    try {
      const f = await window.api.cit.formatar({ ids: [ref.id], estilo, idioma });
      const htmlLimpo = semHtml(f?.bibliografiaHtml || f?.bibliografiaTexto || '');
      if (htmlLimpo) {
        setTextoRefFormatada(htmlLimpo.trim());
        return;
      }
    } catch {}
    const fallbackTit = semHtml(ref.csl?.title || 'Sem título');
    const rev = ref.csl?.['container-title'] || ref.csl?.publisher || '';
    setTextoRefFormatada(`${autor}. ${fallbackTit}. ${rev ? `${rev}, ` : ''}${a}.`);
  };

  // Selecionar artigo retornado de base online (importa na biblioteca + formata!)
  const selecionarArtigoOnline = async (itemOnline) => {
    try {
      setSalvando(true);
      const criado = await onImportarCsl(itemOnline.csl || itemOnline, 'citada');
      if (criado) {
        await selecionarRefBiblioteca(criado);
        avisar?.('Obra importada na Biblioteca e formatada!', 'ok');
      }
    } catch (e) {
      avisar?.('Erro ao importar obra: ' + e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  const buscarOnline = async (e) => {
    e?.preventDefault();
    if (!buscaRef.trim()) return;
    setCarregandoOnline(true);
    try {
      const res = await window.api.busc.resultados(fonteOnline, buscaRef.trim());
      setResultadosOnline(res || []);
    } catch (err) {
      avisar?.('Falha ao buscar online: ' + err.message, 'erro');
    } finally {
      setCarregandoOnline(false);
    }
  };

  // Auto-seleciona referência sugerida caso o auditor já tenha detectado correspondência na biblioteca
  useEffect(() => {
    if (itemResolucao?.refBibItem) {
      selecionarRefBiblioteca(itemResolucao.refBibItem);
    }
  }, [itemResolucao?.refBibItem?.id]);

  // Ação rápida 1: Remover apenas a citação do trecho (ex: tira "(Curitiba lança..., 2026)" ou "(Brasil, 2019)")
  const aplicarRemocaoCitacaoNaCaixa = () => {
    let novo = textoEditado;
    const chave = itemResolucao?.chaveCitacao || '';
    let removeu = false;

    if (chave) {
      // Tenta construir padrão tolerante para (Autor, 2026) ou Autor (2026)
      const autorParte = chave.split(/\(\d{4}/)[0].replace(/[.\s]+$/g, '').trim();
      const anoParte = (chave.match(/(\d{4}[a-z]?)/i) || [])[1] || '';
      if (autorParte && anoParte) {
        const regexParen = new RegExp(`\\s*\\([^)]*${autorParte.slice(0, 12).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[^)]*${anoParte}[^)]*\\)`, 'gi');
        if (regexParen.test(novo)) {
          novo = novo.replace(regexParen, '');
          removeu = true;
        }
      }
    }

    if (!removeu) {
      // Fallback: remove qualquer citação parentética (Autor..., 20XX) na frase
      novo = novo.replace(/\s*\([A-ZÀ-Ú][^()]{2,55},?\s*(?:19|20)\d{2}[a-z]?(?:,\s*p\.\s*\d+(?:-\d+)?)?\)/g, '');
    }

    // Limpa espaços antes de pontuação
    novo = novo.replace(/\s+([.,;:!?])/g, '$1').replace(/,\s*\./g, '.').replace(/\s{2,}/g, ' ').trim();
    setTextoEditado(novo);
    setModoExclusaoCompleta(false);
  };

  // Ação rápida 2: Excluir todo o trecho / frase
  const prepararExclusaoCompleta = () => {
    setTextoEditado('');
    setModoExclusaoCompleta(true);
  };

  // Ação rápida 3: Trocar termo torturado ou gene corrompido
  const aplicarSubstituicaoTermo = () => {
    if (!itemResolucao?.termoDetectado || !itemResolucao?.termoCanonica) return;
    const reg = new RegExp(itemResolucao.termoDetectado.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    setTextoEditado((prev) => prev.replace(reg, itemResolucao.termoCanonica));
  };

  // Ação rápida 4: Envolver trecho coincidente com aspas e página (para plágio sem aspas)
  const aplicarAspasCitacaoDireta = () => {
    const alvo = itemResolucao?.trechoCoincidente;
    if (!alvo) return;
    const autor = itemResolucao?.autorFonte || 'AUTOR';
    const pag = itemResolucao?.paginaPdf ? `, p. ${itemResolucao.paginaPdf}` : '';
    setTextoEditado((prev) => {
      if (prev.includes(`"${alvo}"`)) return prev;
      return prev.includes(alvo)
        ? prev.replace(alvo, `"${alvo}" (${autor}${pag})`)
        : `"${prev}" (${autor}${pag})`;
    });
  };

  // Salvar Edição de Texto no Manuscrito + .DOCX
  const salvarEdicaoTexto = async () => {
    const alvoOriginal = textoBaseOriginal;
    if (!alvoOriginal) {
      avisar?.('Trecho original não identificado para substituição automática.', 'erro');
      return;
    }
    setSalvando(true);
    try {
      if (caminhoDocx) {
        const res = await onAplicarCirurgiaNoDocx({
          tipo: modoExclusaoCompleta ? 'excluir_trecho' : textoEditado === '' ? 'excluir_trecho' : 'substituir_trecho',
          textoAlvo: alvoOriginal,
          novoTexto: textoEditado,
          todasOcorrencias: false,
        });
        if (res?.cancelado) return;
        if (res?.ok) {
          onDefinirStatus(itemResolucao.idItem, 'resolvido');
          avisar?.(res.mensagem || 'Correção salva no arquivo Word (.docx) e marcada como Resolvida!', 'ok');
          onFechar();
          return;
        }
      }
      // Fallback: atualiza no texto em memória na tela de Auditoria
      onAtualizarTextoLocal(alvoOriginal, textoEditado);
      onDefinirStatus(itemResolucao.idItem, 'resolvido');
      avisar?.('Alteração aplicada no texto do manuscrito e marcada como Resolvida!', 'ok');
      onFechar();
    } catch (e) {
      avisar?.('Erro ao salvar alteração: ' + e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  // Inserir Referência na lista final REFERÊNCIAS do Word (.DOCX) + atualizar texto
  const salvarInsercaoReferenciaNoWord = async () => {
    if (!textoRefFormatada.trim()) {
      avisar?.('Selecione ou digite o texto da referência formatada antes de inserir.', 'erro');
      return;
    }
    setSalvando(true);
    try {
      const chaveOrig = itemResolucao?.chaveCitacao || '';
      const operacao = {
        tipo: 'inserir_referencia',
        referenciaTexto: textoRefFormatada.trim(),
        substituirChamadaDe: atualizarChamadaTexto && chaveOrig ? chaveOrig : null,
        substituirChamadaPara: atualizarChamadaTexto && novaChamadaTexto ? novaChamadaTexto : null,
      };

      if (caminhoDocx) {
        const res = await onAplicarCirurgiaNoDocx(operacao);
        if (res?.cancelado) return;
        if (res?.ok) {
          onDefinirStatus(itemResolucao.idItem, 'resolvido');
          avisar?.('Referência inserida em ordem alfabética direto nas REFERÊNCIAS do Word!', 'ok');
          onFechar();
          return;
        }
      }

      // Fallback para texto em memória
      let novoTxt = textoManuscrito;
      if (atualizarChamadaTexto && chaveOrig && novaChamadaTexto) {
        novoTxt = novoTxt.replaceAll(chaveOrig, novaChamadaTexto);
      }
      novoTxt = `${novoTxt.trimEnd()}\n\n${textoRefFormatada.trim()}`;
      onAtualizarTextoLocal(textoManuscrito, novoTxt, true);
      onDefinirStatus(itemResolucao.idItem, 'resolvido');
      avisar?.('Referência inserida no final do texto da auditoria e marcada como Resolvida!', 'ok');
      onFechar();
    } catch (e) {
      avisar?.('Erro ao inserir referência: ' + e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  // Remover Referência sobrando da lista final
  const removerReferenciaSobrando = async () => {
    const alvo = itemResolucao?.textoReferencia || textoBaseOriginal;
    if (!alvo) return;
    setSalvando(true);
    try {
      if (caminhoDocx) {
        const res = await onAplicarCirurgiaNoDocx({
          tipo: 'remover_referencia',
          textoAlvo: alvo,
        });
        if (res?.cancelado) return;
        if (res?.ok) {
          onDefinirStatus(itemResolucao.idItem, 'resolvido');
          avisar?.('Referência não citada removida da lista final do Word!', 'ok');
          onFechar();
          return;
        }
      }
      onAtualizarTextoLocal(alvo, '');
      onDefinirStatus(itemResolucao.idItem, 'resolvido');
      avisar?.('Referência removida da lista e marcada como Resolvida!', 'ok');
      onFechar();
    } catch (e) {
      avisar?.('Erro ao remover referência: ' + e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  // Inserir Declaração Padrão (Fomento / Ética / Conflito)
  const inserirDeclaracaoPadrao = async () => {
    if (!declaracaoTexto.trim()) return;
    setSalvando(true);
    try {
      const mRef = /\n\s*REFER[ÊE]NCIAS\b/i.exec(textoManuscrito);
      const novoTxt = mRef
        ? `${textoManuscrito.slice(0, mRef.index).trimEnd()}\n\n${declaracaoTexto.trim()}\n${textoManuscrito.slice(mRef.index)}`
        : `${textoManuscrito.trimEnd()}\n\n${declaracaoTexto.trim()}`;
      onAtualizarTextoLocal(textoManuscrito, novoTxt, true);
      await navigator.clipboard?.writeText(declaracaoTexto.trim()).catch(() => {});
      onDefinirStatus(itemResolucao.idItem, 'resolvido');
      avisar?.('Declaração adicionada ao manuscrito (e copiada no Ctrl+V caso queira colar direto no Word)!', 'ok');
      onFechar();
    } catch (e) {
      avisar?.(e.message, 'erro');
    } finally {
      setSalvando(false);
    }
  };

  if (!itemResolucao) return null;

  return (
    <div
      className="overlay-modal"
      style={{ zIndex: 420, background: 'rgba(15, 23, 42, 0.72)', padding: 16 }}
      onClick={onFechar}
    >
      <div
        className="caixa-modal"
        onClick={(e) => e.stopPropagation()}
        style={{
          width: '94vw',
          maxWidth: 960,
          maxHeight: '92vh',
          display: 'flex',
          flexDirection: 'column',
          padding: 0,
          overflow: 'hidden',
          borderRadius: 10,
        }}
      >
        {/* CABEÇALHO DO ESTÚDIO DE RESOLUÇÃO */}
        <header
          style={{
            padding: '12px 18px',
            background: 'var(--painel)',
            borderBottom: '1px solid var(--borda)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', marginBottom: 4 }}>
              <strong style={{ fontSize: 15, color: 'var(--texto)' }}>
                🛠️ {tr('Estúdio de Resolução Direta', 'Direct Resolution Studio')}
              </strong>
              <BadgeAlvoAlerta alvo={itemResolucao.alvo} />
              {itemResolucao.locWord && (
                <span className="tag-mini" style={{ fontWeight: 600 }}>
                  📍 {itemResolucao.locWord}
                </span>
              )}
            </div>
            <div style={{ fontSize: 12.5, color: '#b91c1c', fontWeight: 600 }}>
              {itemResolucao.diagnostico}
            </div>
          </div>

          <button
            type="button"
            className="btn pequeno fantasma"
            onClick={onFechar}
            style={{ fontSize: 16, fontWeight: 700, padding: '4px 10px' }}
          >
            ✕
          </button>
        </header>

        {/* BARRA DE ATALHOS EXTERNOS & CONTROLE */}
        <div
          style={{
            padding: '8px 18px',
            background: 'var(--fundo)',
            borderBottom: '1px solid var(--borda)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 8,
            flexWrap: 'wrap',
          }}
        >
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`btn pequeno ${abaAtiva === 'texto' ? 'primario' : 'secundario'}`}
              onClick={() => setAbaAtiva('texto')}
            >
              ✏️ {tr('Editar / Remover Citação ou Frase', 'Edit / Remove Citation or Sentence')}
            </button>
            <button
              type="button"
              className={`btn pequeno ${abaAtiva === 'referencia' ? 'primario' : 'secundario'}`}
              onClick={() => setAbaAtiva('referencia')}
            >
              📥 {tr('Localizar Obra & Inserir nas Referências do Word', 'Find Work & Insert into Word References')}
            </button>
            {(cat === 'metodologia' || cat === 'fomento') && (
              <button
                type="button"
                className={`btn pequeno ${abaAtiva === 'declaracao' ? 'primario' : 'secundario'}`}
                onClick={() => setAbaAtiva('declaracao')}
              >
                ⚡ {tr('Inserir Declaração Padrão', 'Insert Standard Statement')}
              </button>
            )}
            {cat === 'sobrando' && (
              <button
                type="button"
                className={`btn pequeno ${abaAtiva === 'lista_sob' ? 'primario' : 'secundario'}`}
                onClick={() => setAbaAtiva('lista_sob')}
              >
                🗑️ Remover das Referências
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {onAbrirPdfLeitor && itemResolucao?.refBibItem?.pdf && (
              <button
                type="button"
                className="btn pequeno secundario"
                onClick={() => {
                  onFechar();
                  onAbrirPdfLeitor(itemResolucao.refBibItem, itemResolucao.paginaPdf || 1);
                }}
                title={tr('Abrir PDF completo no leitor interno nesta página', 'Open PDF in internal reader at this page')}
              >
                📄 Abrir PDF (Pág. {itemResolucao.paginaPdf || 1})
              </button>
            )}
            {onSalvarTrechoCitado && itemResolucao?.refBibItem?.id && (itemResolucao?.trechoOriginalArtigo || textoBaseOriginal) && (
              <button
                type="button"
                className="btn pequeno secundario"
                disabled={salvandoTrecho || somenteLeitura}
                style={{
                  borderColor: 'rgba(37, 99, 235, 0.35)',
                  color: '#1d4ed8',
                  background: trechoSalvoOk ? '#dbeafe' : undefined,
                  fontWeight: 600,
                }}
                title={
                  somenteLeitura
                    ? tr('Desative Somente Leitura para salvar grifos na Biblioteca', 'Disable Read-Only mode to save highlights')
                    : tr('Salvar passagem como Trecho Citado (Ground Truth) na Biblioteca', 'Save passage as Cited Excerpt Ground Truth in Library')
                }
                onClick={async () => {
                  const txt = itemResolucao?.trechoOriginalArtigo || textoBaseOriginal;
                  if (!txt.trim()) return;
                  setSalvandoTrecho(true);
                  try {
                    const ok = await onSalvarTrechoCitado({
                      refItem: itemResolucao.refBibItem,
                      pagina: itemResolucao.paginaPdf || 1,
                      trecho: txt,
                      ondeCitei: itemResolucao.locWord || '',
                    });
                    if (ok) setTrechoSalvoOk(true);
                  } finally {
                    setSalvandoTrecho(false);
                  }
                }}
              >
                {trechoSalvoOk ? '✓ Trecho Citado Salvo' : salvandoTrecho ? 'Salvando…' : '📌 Salvar Trecho Citado'}
              </button>
            )}
            {onAbrirSplitView && itemResolucao?.refBibItem?.pdf && (
              <button
                type="button"
                className="btn pequeno secundario"
                onClick={() => { onFechar(); onAbrirSplitView(); }}
              >
                ⚖️ Comparar Word ↔ PDF
              </button>
            )}
            <button
              type="button"
              className="btn pequeno secundario"
              onClick={() => onAbrirNoWord(textoBaseOriginal || itemResolucao?.chaveCitacao || '')}
              title="Abre o .DOCX no Microsoft Word e salta automaticamente para este trecho (e copia para Ctrl+V)"
            >
              📂 Abrir e Saltar no Word
            </button>
          </div>
        </div>

        {/* CONTEÚDO DA ABA ATIVA */}
        <div style={{ padding: 18, overflowY: 'auto', flex: 1, display: 'flex', flexDirection: 'column', gap: 12 }}>
          {/* ABA 1: EDITOR DE TEXTO INTERNO COM ATALHOS CIRÚRGICOS */}
          {abaAtiva === 'texto' && (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--texto)' }}>
                  ⚡ Atalhos Rápidos de Correção (1 Clique):
                </span>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    className="btn pequeno secundario"
                    onClick={aplicarRemocaoCitacaoNaCaixa}
                    title="Retira apenas a chamada da citação (Autor, Ano) mantendo o restante da sua frase"
                  >
                    ✂️ Tirar Apenas a Citação
                  </button>
                  <button
                    type="button"
                    className="btn pequeno perigo"
                    onClick={prepararExclusaoCompleta}
                    title="Apaga completamente esta frase/trecho do manuscrito"
                  >
                    🗑️ Excluir Todo o Trecho
                  </button>
                  {itemResolucao?.termoDetectado && itemResolucao?.termoCanonica && (
                    <button
                      type="button"
                      className="btn pequeno primario"
                      onClick={aplicarSubstituicaoTermo}
                    >
                      ✨ Trocar para "{itemResolucao.termoCanonica}"
                    </button>
                  )}
                  {itemResolucao?.trechoCoincidente && (
                    <button
                      type="button"
                      className="btn pequeno primario"
                      onClick={aplicarAspasCitacaoDireta}
                    >
                      💬 Colocar Aspas & Citação Direta
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn pequeno fantasma"
                    onClick={() => setTextoEditado(textoBaseOriginal) || setModoExclusaoCompleta(false)}
                  >
                    ↺ Restaurar Original
                  </button>
                  {onCopiarPromptIa && (
                    <button
                      type="button"
                      className="btn pequeno fantasma"
                      onClick={onCopiarPromptIa}
                    >
                      🤖 Copiar p/ IA Reescrever
                    </button>
                  )}
                </div>
              </div>

              {itemResolucao?.trechoOriginalArtigo && (
                <div style={{ padding: '8px 12px', background: 'rgba(22, 163, 74, 0.06)', border: '1px solid rgba(22, 163, 74, 0.25)', borderRadius: 6, fontSize: 12 }}>
                  <strong style={{ color: '#15803d' }}>📄 O que diz o Artigo/PDF Original{itemResolucao.paginaPdf ? ` (pág. ${itemResolucao.paginaPdf})` : ''}:</strong>{' '}
                  <em>"{itemResolucao.trechoOriginalArtigo}"</em>
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: 11.8, fontWeight: 700, color: 'var(--texto-suave)', marginBottom: 4 }}>
                  {modoExclusaoCompleta
                    ? '⚠️ Modo Exclusão Ativo: este trecho será REMOVIDO do documento ao salvar abaixo!'
                    : 'Edite abaixo como este trecho deve ficar no seu Word:'}
                </label>
                <textarea
                  rows={5}
                  value={textoEditado}
                  onChange={(e) => {
                    setTextoEditado(e.target.value);
                    setModoExclusaoCompleta(e.target.value.trim() === '');
                  }}
                  placeholder="(Trecho será excluído do manuscrito ao salvar)"
                  style={{
                    width: '100%',
                    padding: 12,
                    fontSize: 13.5,
                    lineHeight: 1.6,
                    borderRadius: 8,
                    border: modoExclusaoCompleta ? '2px solid #dc2626' : '1.5px solid var(--primaria)',
                    background: modoExclusaoCompleta ? 'rgba(220, 38, 38, 0.04)' : 'var(--painel)',
                    color: 'var(--texto)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 6, flexWrap: 'wrap', gap: 8 }}>
                <span style={{ fontSize: 11.5, color: 'var(--texto-suave)' }}>
                  {caminhoDocx
                    ? `💾 Arquivo vinculado: ${caminhoDocx.split(/[\\/]/).pop()} (backup automático criado antes da cirurgia)`
                    : '💡 Dica: carrega a alteração no texto da auditoria. Se quiser gravar direto no .docx, selecione o arquivo ao salvar.'}
                </span>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button
                    type="button"
                    className="btn pequeno fantasma"
                    onClick={() => { onDefinirStatus(itemResolucao.idItem, 'ignorado'); onFechar(); }}
                  >
                    🚫 Ignorar (Não Alterar)
                  </button>
                  <button
                    type="button"
                    className="btn primario"
                    onClick={salvarEdicaoTexto}
                    disabled={salvando || (!modoExclusaoCompleta && textoEditado === textoBaseOriginal)}
                  >
                    {salvando ? 'Gravando…' : modoExclusaoCompleta ? '🗑️ Confirmar Exclusão do Trecho & Resolver' : '💾 Salvar Correção no Word & Resolver'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ABA 2: LOCALIZAR ARTIGO & INSERIR DIRETO NAS REFERÊNCIAS DO WORD */}
          {abaAtiva === 'referencia' && (
            <>
              <form onSubmit={buscarOnline} style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={buscaRef}
                  onChange={(e) => setBuscaRef(e.target.value)}
                  placeholder="Digite autor, ano, título ou DOI para localizar a obra correta…"
                  style={{ flex: 1, minWidth: 220, padding: '6px 10px', borderRadius: 6, border: '1px solid var(--borda)', fontSize: 13 }}
                />
                <select
                  value={fonteOnline}
                  onChange={(e) => setFonteOnline(e.target.value)}
                  style={{ padding: '6px 8px', borderRadius: 6, border: '1px solid var(--borda)', fontSize: 12.5 }}
                >
                  <option value="openalex">OpenAlex (Global)</option>
                  <option value="pubmed">PubMed (Saúde)</option>
                  <option value="europepmc">Europe PMC</option>
                  <option value="crossref">Crossref (DOI)</option>
                </select>
                <button type="submit" className="btn pequeno primario" disabled={carregandoOnline}>
                  {carregandoOnline ? 'Buscando…' : '🌐 Buscar Online'}
                </button>
              </form>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                {/* Coluna Esquerda: Sua Biblioteca + Resultados Online */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 280, overflowY: 'auto', border: '1px solid var(--borda)', borderRadius: 8, padding: 10, background: 'var(--fundo)' }}>
                  <strong style={{ fontSize: 11.8, color: '#15803d', textTransform: 'uppercase' }}>
                    📚 Obras Compatíveis na Sua Biblioteca ({matchesBiblioteca.length}):
                  </strong>
                  {matchesBiblioteca.length === 0 ? (
                    <div style={{ fontSize: 12, color: 'var(--texto-suave)' }}>Nenhuma obra parecida com "{buscaRef}" na biblioteca local. Tente buscar online ao lado.</div>
                  ) : matchesBiblioteca.map((r) => (
                    <div
                      key={r.id}
                      onClick={() => selecionarRefBiblioteca(r)}
                      style={{
                        padding: '7px 9px',
                        borderRadius: 6,
                        border: refSelecionada?.id === r.id ? '1.5px solid var(--primaria)' : '1px solid var(--borda)',
                        background: refSelecionada?.id === r.id ? 'rgba(37,99,235,0.08)' : 'var(--painel)',
                        cursor: 'pointer',
                        fontSize: 12,
                      }}
                    >
                      <div style={{ fontWeight: 700 }}>{autoresResumo(r.csl || {})} ({ano(r.csl || {})})</div>
                      <div style={{ color: 'var(--texto-suave)', fontSize: 11.5 }}>{semHtml(r.csl?.title || '')}</div>
                    </div>
                  ))}

                  {resultadosOnline.length > 0 && (
                    <>
                      <strong style={{ fontSize: 11.8, color: '#1d4ed8', textTransform: 'uppercase', marginTop: 8 }}>
                        🌐 Resultados Online ({resultadosOnline.length}):
                      </strong>
                      {resultadosOnline.slice(0, 8).map((it, idx) => (
                        <div
                          key={idx}
                          style={{ padding: '7px 9px', borderRadius: 6, border: '1px solid var(--borda)', background: 'var(--painel)', fontSize: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 6 }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 700 }}>{it.autores || 'Autor'} ({it.ano || 's.d.'})</div>
                            <div style={{ fontSize: 11.3, color: 'var(--texto-suave)' }}>{it.titulo}</div>
                          </div>
                          <button
                            type="button"
                            className="btn pequeno primario"
                            onClick={() => selecionarArtigoOnline(it)}
                            disabled={salvando}
                          >
                            + Selecionar
                          </button>
                        </div>
                      ))}
                    </>
                  )}
                </div>

                {/* Coluna Direita: Confirmação e Inserção Direta nas Referências do Word */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8, border: '1px solid var(--borda)', borderRadius: 8, padding: 12, background: 'var(--painel)' }}>
                  <strong style={{ fontSize: 12, color: 'var(--texto)' }}>
                    2. Confirme a Referência Formatada ({estilo.toUpperCase()}) para Inserir no Word:
                  </strong>
                  <textarea
                    rows={4}
                    value={textoRefFormatada}
                    onChange={(e) => setTextoRefFormatada(e.target.value)}
                    placeholder="Clique em uma obra à esquerda ou digite/cole aqui a referência completa formatada..."
                    style={{ width: '100%', padding: 8, borderRadius: 6, border: '1px solid var(--borda)', fontSize: 12.2, lineHeight: 1.5 }}
                  />

                  {itemResolucao?.chaveCitacao && (
                    <div style={{ padding: '8px 10px', background: 'var(--fundo)', borderRadius: 6, border: '1px solid var(--borda)', fontSize: 12 }}>
                      <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontWeight: 600 }}>
                        <input
                          type="checkbox"
                          checked={atualizarChamadaTexto}
                          onChange={(e) => setAtualizarChamadaTexto(e.target.checked)}
                        />
                        <span>Corrigir também a citação no texto de <code>{itemResolucao.chaveCitacao}</code> para:</span>
                      </label>
                      {atualizarChamadaTexto && (
                        <input
                          value={novaChamadaTexto}
                          onChange={(e) => setNovaChamadaTexto(e.target.value)}
                          style={{ marginTop: 6, width: '100%', padding: '4px 8px', borderRadius: 4, border: '1px solid var(--borda)', fontSize: 12 }}
                        />
                      )}
                    </div>
                  )}

                  <button
                    type="button"
                    className="btn primario"
                    style={{ marginTop: 'auto' }}
                    onClick={salvarInsercaoReferenciaNoWord}
                    disabled={salvando || !textoRefFormatada.trim()}
                  >
                    {salvando ? 'Inserindo no .DOCX…' : '📥 Inserir nas REFERÊNCIAS Direto no Word (.DOCX)'}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* ABA 3: INSERIR DECLARAÇÃO PADRÃO */}
          {abaAtiva === 'declaracao' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <strong style={{ fontSize: 12.5, color: 'var(--texto)' }}>
                ⚡ Declaração Acadêmica / Normativa Sugerida (edite se necessário e insira antes das Referências):
              </strong>
              <textarea
                rows={4}
                value={declaracaoTexto}
                onChange={(e) => setDeclaracaoTexto(e.target.value)}
                style={{ width: '100%', padding: 10, borderRadius: 6, border: '1.5px solid var(--primaria)', fontSize: 13, lineHeight: 1.55 }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
                <button
                  type="button"
                  className="btn primario"
                  onClick={inserirDeclaracaoPadrao}
                  disabled={salvando || !declaracaoTexto.trim()}
                >
                  ⚡ Inserir Declaração no Final do Texto & Resolver
                </button>
              </div>
            </div>
          )}

          {/* ABA 4: REMOVER REFERÊNCIA SOBRANDO */}
          {abaAtiva === 'lista_sob' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ padding: 12, background: 'var(--fundo)', borderRadius: 6, border: '1px solid var(--borda)', fontSize: 12.5 }}>
                <strong>Referência sobrando na lista final (sem chamada no texto):</strong>
                <div style={{ marginTop: 6, fontStyle: 'italic' }}>{itemResolucao?.textoReferencia}</div>
              </div>
              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', flexWrap: 'wrap' }}>
                <button
                  type="button"
                  className="btn fantasma"
                  onClick={() => { onDefinirStatus(itemResolucao.idItem, 'ignorado'); onFechar(); }}
                >
                  🚫 Manter como Bibliografia Consultada (Ignorar)
                </button>
                <button
                  type="button"
                  className="btn perigo"
                  onClick={removerReferenciaSobrando}
                  disabled={salvando}
                >
                  🗑️ Remover Entrada da Lista Final no Word (.DOCX)
                </button>
              </div>
            </div>
          )}

          {/* MEMÓRIA DE DECISÃO EDITORIAL (SHA-256) */}
          <div className="barra-decisao-editorial">
            <div style={{ flex: 1, minWidth: 220 }}>
              <label style={{ display: 'block', fontSize: 11.5, fontWeight: 700, color: 'var(--texto-suave)', marginBottom: 4 }}>
                {tr('Memória de Decisão Editorial (justificativa opcional — reativa se a frase mudar):', 'Editorial Decision Memory (optional justification — reactivates if sentence changes):')}
              </label>
              <input
                type="text"
                value={justificativaEditorial}
                onChange={(e) => setJustificativaEditorial(e.target.value)}
                placeholder={tr('Ex.: Termo técnico consagrado na área ou citação contextual intencional...', 'E.g., Established domain term or intentional contextual citation...')}
                style={{ width: '100%', padding: '5px 8px', borderRadius: 5, border: '1px solid var(--borda)', fontSize: 12 }}
              />
            </div>
            <button
              type="button"
              className="btn pequeno secundario"
              onClick={salvarFalsoPositivoJustificado}
              disabled={salvandoDecisao}
              title={tr('Salva assinatura SHA-256 em auditoria_decisoes.json e suprime nas próximas auditorias', 'Saves SHA-256 signature to auditoria_decisoes.json and suppresses in future audits')}
            >
              {salvandoDecisao
                ? tr('Salvando…', 'Saving…')
                : `🛡️ ${tr('Ignorar / Falso Positivo Justificado', 'Ignore / Justified False Positive')}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
