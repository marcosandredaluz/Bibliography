/**
 * electron/laudo_pericial_generator.cjs
 * 
 * Gerador de Laudo Pericial de Auditoria Bibliográfica e Integridade Científica.
 * Produz relatório técnico formal em formato HTML imprimível / PDF com visual
 * acadêmico sóbrio, sumarização executiva, matriz forense de 18 dimensões,
 * rol de obras autenticadas e apontamentos detalhados de inconformidades.
 */

'use strict';

const crypto = require('crypto');

/**
 * Escapa strings para HTML seguro
 */
function escaparHtml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * Calcula o hash SHA-256 do laudo para atestação de integridade
 */
function calcularHashIntegridade(conteudo = '') {
  return crypto.createHash('sha256').update(conteudo, 'utf8').digest('hex');
}

/**
 * Formata data e hora no padrão brasileiro
 */
function formatarDataHora(data = new Date()) {
  if (typeof data === 'string' && data.trim()) {
    const tentativa = new Date(data);
    if (!Number.isNaN(tentativa.getTime())) {
      return tentativa.toLocaleString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    }
    // Se já veio formatada em pt-BR (ex.: "18/11, 22:39"), preserva sem gerar "Invalid Date"
    if (/\d{1,2}\/\d{1,2}/.test(data)) return data.trim();
  }
  const d = data instanceof Date && !Number.isNaN(data.getTime()) ? data : new Date();
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Gera o documento HTML do Laudo Pericial
 * 
 * @param {Object} resultado - Resultado consolidado de auditarManuscrito
 * @param {Object} opcoes - Opções como nomeArquivo, dataHora, inconformidadesResolvidas
 * @returns {string} Código HTML completo com estilos e diretivas de impressão
 */
function gerarHtmlLaudoPericial(resultado = {}, opcoes = {}) {
  const nomeArquivo = opcoes.nomeArquivo || 'Manuscrito_Submetido.docx';
  const dataHora = formatarDataHora(opcoes.dataHora || new Date());
  const resolvidosSet = new Set(opcoes.inconformidadesResolvidas || []);

  const totalCitacoes = resultado.totalCitacoesOcorrencias || 0;
  const totalObras = resultado.totalAutoresCitadosUnicos || (resultado.refsMapeadas ? resultado.refsMapeadas.length : 0);
  const refsMapeadas = resultado.refsMapeadas || [];
  const totalAutenticadas = refsMapeadas.filter((r) => r.encontradoNasBases || r.doi || r.doiOficial || r.pdfBaixado).length;

  const alertasPrecisao = resultado.alertasPrecisao || [];
  const alertasAtribuicaoFalsa = resultado.alertasAtribuicaoFalsa || [];
  const alertasPlagio = resultado.alertasPlagio || [];
  const alertasEstatisticos = resultado.alertasEstatisticos || resultado.resumoEstatistico?.alertasEstatisticos || [];
  const alertasRede = resultado.alertasRede || resultado.resumoRede?.alertasRede || [];
  const alertasMetodologiaClinica = resultado.alertasMetodologiaClinica || resultado.resumoMetodologiaClinica?.alertas || [];
  const alertasFrasesTorturadas = resultado.alertasFrasesTorturadas || resultado.resumoFrasesTorturadas?.alertas || [];
  const alertasEstilometricos = resultado.alertasEstilometricos || resultado.resumoEstilometria?.alertasEstilometricos || [];
  const alertasPredatorios = resultado.alertasPredatorios || resultado.resumoPredatorias?.alertas || [];
  const alertasAbnt6023 = resultado.alertasAbnt6023 || resultado.resumoAbnt6023?.alertas || [];
  const alertasCorrupcaoGene = resultado.alertasCorrupcaoGene || resultado.resumoCorrupcaoGene?.alertas || [];
  const alertasFomento = resultado.alertasFomento || resultado.resumoFomento?.alertas || [];
  const alertasDesvioTematico = resultado.alertasDesvioTematico || resultado.resumoClaimSupport?.alertas || [];
  const alertasFigurasTabelas = resultado.alertasFigurasTabelas || [];
  const citacoesSemReferencia = resultado.citacoesSemReferencia || [];
  const refsNaoCitadas =
    resultado.refsNaoCitadasNoTexto ||
    refsMapeadas.filter((r) => r.citadaNoTexto === false && !r.conflitoParsingNeutralizado);

  const estaResolvido = (chaves = []) => chaves.some((k) => k && resolvidosSet.has(k));

  const obterIdMeta = (ap) => {
    const sufixoUnico =
      ap.tipo === 'citacao_multipla_intruso' ||
      String(ap.tipo || '').startsWith('intra_') ||
      String(ap.tipo || '').startsWith('guardiao_')
        ? `_${ap.autorCitado || ''}`
        : '';
    return `meta_${ap.numParagrafo}_${ap.numLinha}_${ap.tipo}${sufixoUnico}`;
  };

  // Filtra estritamente apenas itens ATIVOS (tudo marcado como resolvido/ignorado fica fora do laudo)
  const refsSuspeitasIaAtivas = refsMapeadas.filter(
    (r) =>
      (r.suspeitaAlucinacaoIa ||
        ['ia_doi_trocado', 'ia_doi_inexistente', 'ia_autor_adulterado', 'suspeita_ia_fantasma', 'artigo_retratado'].includes(
          r.statusAutenticidade
        )) &&
      !estaResolvido([`ia_${r.refBibId || r.id || r.primeiroSobrenome}`, r.id, r.chave])
  );
  const atribuicaoFalsaAtivos = alertasAtribuicaoFalsa.filter(
    (a) => !estaResolvido([`atrib_${a.numParagrafo}_${a.numLinha}`, a.id, a.mensagem])
  );
  const plagioAtivos = alertasPlagio.filter(
    (p) => !estaResolvido([`plagio_${p.numParagrafo}_${p.numLinha}`, p.id, p.mensagem])
  );
  const estatisticosAtivos = alertasEstatisticos.filter(
    (e) => !estaResolvido([`estat_${e.numParagrafo}_${e.numLinha}`, e.id, e.mensagem])
  );
  const redeAtivos = alertasRede.filter(
    (r) => !estaResolvido([`rede_${r.autor || r.periodico}`, r.id, r.mensagem])
  );
  const metodologiaAtivos = alertasMetodologiaClinica.filter(
    (m) => !estaResolvido([`metod_${m.tipo}`, m.id, m.mensagem])
  );
  const torturadasAtivos = alertasFrasesTorturadas.filter(
    (f, i) => !estaResolvido([`tort_${f.numParagrafo}_${f.termoDetectado || i}`, f.id, f.mensagem])
  );
  const estilometriaAtivos = alertasEstilometricos.filter(
    (e) => !estaResolvido([`estilo_${e.numParagrafo}_${e.tipo}`, e.id, e.mensagem])
  );
  const predatoriosAtivos = alertasPredatorios.filter(
    (p) => !estaResolvido([`pred_${p.refBibId || p.chaveAutorAno}`, p.id, p.mensagem])
  );
  const abnt6023Ativos = alertasAbnt6023.filter(
    (a) => !estaResolvido([`abnt6023_${a.idxRef}_${a.tipo}`, a.id, a.mensagem])
  );
  const geneAtivos = alertasCorrupcaoGene.filter(
    (c, i) => !estaResolvido([`gene_${c.numParagrafo}_${c.termoDetectado || i}`, c.id, c.mensagem])
  );
  const fomentoAtivos = alertasFomento.filter(
    (f) => !estaResolvido([`fom_${f.tipo}`, f.id, f.mensagem])
  );
  const desvioAtivos = alertasDesvioTematico.filter(
    (d) => !estaResolvido([`desvio_${d.numParagrafo}_${d.refBibId}`, d.id, d.mensagem])
  );
  const figTabAtivos = alertasFigurasTabelas.filter(
    (ft, i) => !estaResolvido([`figtab_${ft.numParagrafo}_${ft.tipo}_${ft.numero || i}`, ft.id, ft.mensagem])
  );
  const orfasAtivas = citacoesSemReferencia.filter(
    (c) => !estaResolvido([`orfa_${c.chave}`, `orfa-${c.autor}-${c.ano}`, c.chave])
  );
  const naoCitadasAtivas = refsNaoCitadas.filter(
    (r) => !estaResolvido([`sobr_${r.refBibId || r.textoOriginal}`, `sobrando-${r.id || r.chave}`, r.id, r.chave])
  );

  // Alertas de precisão exclusivos (evita duplicação com os blocos específicos acima)
  const tiposJaEmBlocosEspecificos = new Set([
    'inconsistencia_estatistica_grave', 'inconsistencia_estatistica_numerica',
    'alta_concentracao_autoria', 'concentracao_periodico',
    'ausencia_aprovacao_etica', 'ausencia_mencao_tcle', 'ausencia_criterios_elegibilidade',
    'ensaio_sem_registro_icmje', 'ausencia_declaracao_conflitos', 'poucos_descritores',
    'frase_torturada', 'monotonia_sintatica_estilometrica', 'pobreza_lexical_anomala', 'repeticao_trigramas_mecanica',
    'periodico_predatorio_suspeito', 'abnt_formula_disponivel_em', 'abnt_data_acesso_ausente',
    'abnt_mes_acesso_fora_padrao', 'abnt_livro_sem_local_editora', 'abnt_artigo_sem_volume_paginas',
    'corrupcao_gene_excel', 'capes_falta_codigo_001', 'fomento_sem_numero_processo', 'ausencia_declaracao_fomento',
    'desvio_tematico_citacao', 'ilustracao_sem_fonte', 'ilustracao_sem_chamada', 'chamada_ilustracao_orfa',
    'ilustracao_salto_numeracao', 'tabela_vs_quadro_ibge', 'estilo_redacao_ia',
  ]);
  const precisaoAtivos = alertasPrecisao.filter((ap) => {
    if (tiposJaEmBlocosEspecificos.has(ap.tipo)) return false;
    return !estaResolvido([
      obterIdMeta(ap),
      `metodologico_${ap.numParagrafo}_${ap.tipo}`,
      ap.id,
      ap.mensagem,
    ]);
  });

  // Categorias organizadas para exibição assertiva na Seção 3 (apenas categorias com itens ativos)
  const categoriasInconformidades = [
    {
      titulo: '1. Integridade & Autenticidade de Fontes',
      cor: '#dc2626',
      itens: [
        ...refsSuspeitasIaAtivas.map((r) => ({
          tipo: r.statusAutenticidade || 'fonte_nao_autenticada',
          numParagrafo: r.ocorrenciasNoTexto?.[0]?.numParagrafo,
          numLinha: r.ocorrenciasNoTexto?.[0]?.numLinha,
          secao: r.ocorrenciasNoTexto?.[0]?.secao || 'Referências',
          autorCitado: `${r.primeiroSobrenome || 'Fonte'} (${r.ano || 's.d.'})`,
          fraseWord: r.textoOriginal,
          mensagem: r.alertaAutenticidade || 'Fonte não confirmada nas bases indexadas.',
        })),
        ...predatoriosAtivos.map((p) => ({
          tipo: 'periodico_predatorio_suspeito',
          secao: 'Referências',
          autorCitado: p.chaveAutorAno,
          fraseWord: p.textoReferencia,
          mensagem: p.mensagem,
        })),
      ],
    },
    {
      titulo: '2. Fidelidade Semântica, Lógica (NLI / Guardião) & Plágio',
      cor: '#b91c1c',
      itens: [
        ...atribuicaoFalsaAtivos.map((a) => ({ ...a, tipo: a.tipo || 'atribuicao_falsa' })),
        ...plagioAtivos.map((p) => ({ ...p, tipo: p.tipo || 'plagio_literal', fraseWord: p.fraseNoWord || p.fraseWord })),
        ...desvioAtivos.map((d) => ({ ...d, tipo: d.tipo || 'desvio_tematico_citacao' })),
        ...precisaoAtivos.filter(
          (a) =>
            a.tipo === 'atribuicao_falsa' ||
            a.tipo === 'mismatch_conteudo' ||
            a.tipo === 'contradicao_logica_nli' ||
            a.tipo === 'citacao_multipla_intruso' ||
            a.tipo === 'afirmacao_parcialmente_sustentada' ||
            String(a.tipo || '').startsWith('guardiao_')
        ),
      ],
    },
    {
      titulo: '3. Consistência Intra-Documento, Estatística & Metodologia',
      cor: '#d97706',
      itens: [
        ...estatisticosAtivos,
        ...precisaoAtivos.filter((a) => String(a.tipo || '').startsWith('intra_')),
        ...metodologiaAtivos,
        ...geneAtivos,
        ...fomentoAtivos,
        ...redeAtivos,
      ],
    },
    {
      titulo: '4. Rastreabilidade Bidirecional (Texto ↔ Referências)',
      cor: '#ea580c',
      itens: [
        ...orfasAtivas.map((c) => ({
          tipo: 'citacao_sem_referencia',
          numParagrafo: c.ocorrencias?.[0]?.numParagrafo,
          numLinha: c.ocorrencias?.[0]?.numLinha,
          autorCitado: `${c.autor} (${c.ano})`,
          fraseWord: c.ocorrencias?.[0]?.fraseContexto || '',
          mensagem: `Citada ${c.ocorrencias?.length || 1}x no corpo do texto sem entrada correspondente nas Referências finais.`,
        })),
        ...naoCitadasAtivas.map((r) => ({
          tipo: 'referencia_nao_citada',
          secao: 'Referências',
          autorCitado: `${r.primeiroSobrenome || 'Obra'} (${r.ano || 's.d.'})`,
          fraseWord: r.textoOriginal,
          mensagem: 'Entrada listada nas Referências finais sem chamada identificada no corpo do texto.',
        })),
      ],
    },
    {
      titulo: '5. Normas Bibliográficas, Ilustrações & Redação',
      cor: '#2563eb',
      itens: [
        ...abnt6023Ativos.map((a) => ({ ...a, secao: 'Referências', autorCitado: a.chaveRef, fraseWord: a.textoReferencia })),
        ...figTabAtivos,
        ...torturadasAtivos,
        ...estilometriaAtivos,
        ...precisaoAtivos.filter(
          (a) =>
            a.tipo !== 'atribuicao_falsa' &&
            a.tipo !== 'mismatch_conteudo' &&
            a.tipo !== 'contradicao_logica_nli' &&
            a.tipo !== 'citacao_multipla_intruso' &&
            a.tipo !== 'afirmacao_parcialmente_sustentada' &&
            !String(a.tipo || '').startsWith('guardiao_') &&
            !String(a.tipo || '').startsWith('intra_')
        ),
      ],
    },
  ].filter((cat) => cat.itens.length > 0);

  const inconformidadesAtivas = categoriasInconformidades.flatMap((c) => c.itens);
  const totalInconformidades = inconformidadesAtivas.length;

  // Cálculo do Índice de Integridade
  let indiceIntegridade = 100;
  if (totalObras > 0) {
    const penalidade = Math.min(100, Math.round((totalInconformidades / (totalObras * 1.5)) * 100));
    indiceIntegridade = Math.max(0, 100 - penalidade);
  }

  let statusGeral = 'Pronto para submissão (sem pendências ativas)';
  let corStatus = '#15803d';
  if (totalInconformidades > 5 || indiceIntegridade < 70) {
    statusGeral = 'Revisão recomendada antes da submissão';
    corStatus = '#b45309';
  } else if (totalInconformidades > 0) {
    statusGeral = `Pequenos ajustes sugeridos (${totalInconformidades} ponto${totalInconformidades > 1 ? 's' : ''})`;
    corStatus = '#0369a1';
  }

  // Métricas informativas reais para enriquecer cada dimensão do relatório do autor
  const totalComPdf = refsMapeadas.filter((r) => r.temPdf || r.pdfBaixado || r.nomeArquivoPdf).length;
  const totalInstitucionais = refsMapeadas.filter(
    (r) =>
      r.natureza === 'norma_livro_institucional' ||
      r.statusAutenticidade === 'institucional_tese' ||
      r.statusAutenticidade === 'protocolo_controlado_aprovado'
  ).length;
  const totalComDoi = refsMapeadas.filter((r) => r.doiOficial || r.doi).length;
  const estiloLabel =
    resultado.estiloBibliograficoDetectado === 'vancouver_nature'
      ? 'Vancouver / Nature (Numérico)'
      : 'ABNT (Autor-Data)';
  const rvc = resultado.resumoVerificacaoConteudo || {};
  const rx = resultado.raioXBibliometrico || null;
  const intra = resultado.resumoIntraDocumento || null;
  const clin = resultado.resumoMetodologiaClinica || {};
  const est = resultado.resumoEstatistico || {};
  const figTabRes = resultado.resumoFigurasTabelas || {};
  const totalResolvidosOmitidos = resolvidosSet.size;
  const mapaEvidenciaPorChave = new Map(
    (rx?.classificacoesPorRef || []).map((c) => [c.chave || `${c.autor}:${c.ano}`, c])
  );

  // Panorama Informativo por Dimensão (traz dados concretos do manuscrito + pendências ativas)
  const dimensoes = [
    {
      nome: 'Autenticidade & Fontes Primárias',
      norma: 'Crossref, OpenAlex, PubMed, Handles',
      alertas: refsSuspeitasIaAtivas.length,
      detalhe: `${totalAutenticadas} de ${totalObras} obras confirmadas em bases (${totalComDoi} com DOI; ${totalComPdf} com PDF; ${totalInstitucionais} institucionais/normas).`,
    },
    {
      nome: 'Fidelidade Semântica, NLI & Guardião',
      norma: 'Bi/Cross-Encoder ONNX + NegEx',
      alertas:
        atribuicaoFalsaAtivos.length +
        precisaoAtivos.filter(
          (a) =>
            a.tipo === 'atribuicao_falsa' ||
            a.tipo === 'mismatch_conteudo' ||
            a.tipo === 'contradicao_logica_nli' ||
            a.tipo === 'citacao_multipla_intruso' ||
            String(a.tipo || '').startsWith('guardiao_')
        ).length,
      detalhe: `${rvc.totalObrasVerificadas ?? totalAutenticadas} de ${rvc.totalObrasCitadas ?? totalObras} obras citadas com conteúdo auditado; ${(resultado.alertasNliContradicao || []).length} contradição(ões) NLI e ${(resultado.alertasCitacoesMultiplas || []).length} intruso(s) em citações múltiplas.`,
    },
    {
      nome: 'Consistência Interna (Tabelas, Resumo & Siglas)',
      norma: 'Reconciliação XML <w:tbl> & Acrônimos',
      alertas: precisaoAtivos.filter((a) => String(a.tipo || '').startsWith('intra_')).length,
      detalhe: `${intra?.tabelasDetectadas ?? 0} tabela(s) XML extraída(s); confronto Resumo × Resultados e rastreio de siglas na 1ª menção aplicados.`,
    },
    {
      nome: 'Originalidade & Cópia Literal',
      norma: 'Diff Match Patch & NBR 10520',
      alertas: plagioAtivos.length,
      detalhe:
        plagioAtivos.length === 0
          ? 'Nenhum bloco literal extenso sem aspas detectado frente aos textos completos disponíveis.'
          : `${plagioAtivos.length} trecho(s) com sobreposição literal sem aspas para revisão de paráfrase.`,
    },
    {
      nome: 'Estatística & Matemática (StatCheck)',
      norma: 'GRIM / Distribuições Exatas',
      alertas: estatisticosAtivos.length,
      detalhe: `${est.totalTestesAnalisados ?? 0} teste(s) estatístico(s) verificado(s) no corpo do texto.`,
    },
    {
      nome: 'Metodologia, Desenho & Ética',
      norma: clin.desenhoEstudo?.checklist || 'STROBE / CONSORT / PRISMA',
      alertas: metodologiaAtivos.length,
      detalhe: `Desenho identificado: ${clin.desenhoEstudo?.descricao || 'Não especificado'}${clin.etica?.caae ? ` · CAAE ${clin.etica.caae}` : ''}${clin.descritores?.descritoresEncontrados?.length ? ` · ${clin.descritores.descritoresEncontrados.length} descritor(es)` : ''}.`,
    },
    {
      nome: 'Rastreabilidade (Texto ↔ Referências)',
      norma: estiloLabel,
      alertas: orfasAtivas.length + naoCitadasAtivas.length,
      detalhe: `${totalCitacoes} chamadas no corpo cruzadas com ${resultado.totalReferenciasListaFinal || refsMapeadas.length} referências finais (${orfasAtivas.length} órfã(s), ${naoCitadasAtivas.length} não citada(s)).`,
    },
    {
      nome: 'Normas Bibliográficas & Ilustrações',
      norma: resultado.estiloBibliograficoDetectado === 'vancouver_nature' ? 'Vancouver / Nature' : 'ABNT NBR 6023 & 14724 / IBGE',
      alertas: abnt6023Ativos.length + figTabAtivos.length,
      detalhe:
        resultado.estiloBibliograficoDetectado === 'vancouver_nature'
          ? `Estilo internacional Vancouver/Nature detectado (regras estritas ABNT 6023 isentas); ${figTabRes.totalElementos ?? 0} figura(s)/tabela(s) auditada(s).`
          : `${refsMapeadas.length} referência(s) conferida(s) na NBR 6023 e ${figTabRes.totalElementos ?? 0} figura(s)/tabela(s) verificada(s).`,
    },
    {
      nome: 'Qualidade Editorial, Rede & Redação',
      norma: 'COPE, Beall, Cabanac, Estilometria & Fomento',
      alertas:
        redeAtivos.length +
        predatoriosAtivos.length +
        torturadasAtivos.length +
        estilometriaAtivos.length +
        geneAtivos.length +
        fomentoAtivos.length +
        desvioAtivos.length,
      detalhe: `Verificação de periódicos predatórios (${predatoriosAtivos.length}), concentração de rede (${redeAtivos.length}), frases torturadas (${torturadasAtivos.length}), estilometria (${estilometriaAtivos.length}) e fomento (${fomentoAtivos.length}).`,
    },
  ];

  const htmlConteudo = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Laudo Pericial de Auditoria Bibliográfica — ${escaparHtml(nomeArquivo)}</title>
  <style>
    @page {
      size: A4;
      margin: 20mm 15mm 20mm 15mm;
    }
    * {
      box-sizing: border-box;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      font-size: 11pt;
      line-height: 1.5;
      color: #1e293b;
      background: #ffffff;
      margin: 0;
      padding: 24px;
    }
    .cabecalho-laudo {
      border-bottom: 2px solid #0f172a;
      padding-bottom: 16px;
      margin-bottom: 20px;
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .titulo-principal {
      font-size: 16pt;
      font-weight: 800;
      color: #0f172a;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin: 0 0 4px 0;
    }
    .subtitulo-laudo {
      font-size: 10pt;
      color: #475569;
      font-weight: 500;
      margin: 0;
    }
    .metadados-laudo {
      text-align: right;
      font-size: 9pt;
      color: #475569;
      line-height: 1.4;
    }
    .painel-resumo {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 12px;
      margin-bottom: 24px;
    }
    .card-kpi {
      border: 1px solid #cbd5e1;
      border-radius: 8px;
      padding: 12px;
      background: #f8fafc;
      text-align: center;
    }
    .card-kpi .valor {
      font-size: 20pt;
      font-weight: 800;
      color: #0f172a;
      line-height: 1;
      margin: 6px 0 2px 0;
    }
    .card-kpi .rotulo {
      font-size: 8.5pt;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    .banner-parecer {
      border: 1.5px solid ${corStatus};
      background: ${corStatus === '#16a34a' ? 'rgba(22, 163, 74, 0.08)' : corStatus === '#d97706' ? 'rgba(217, 119, 6, 0.08)' : 'rgba(220, 38, 38, 0.08)'};
      border-radius: 8px;
      padding: 14px 18px;
      margin-bottom: 24px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .banner-parecer .titulo-parecer {
      font-size: 12pt;
      font-weight: 800;
      color: ${corStatus};
      margin: 0 0 4px 0;
      text-transform: uppercase;
    }
    .banner-parecer .desc-parecer {
      font-size: 9.5pt;
      color: #334155;
      margin: 0;
    }
    .secao-titulo {
      font-size: 12pt;
      font-weight: 700;
      color: #0f172a;
      border-bottom: 1px solid #e2e8f0;
      padding-bottom: 6px;
      margin: 24px 0 12px 0;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }
    table.tabela-laudo {
      width: 100%;
      border-collapse: collapse;
      font-size: 9pt;
      margin-bottom: 20px;
    }
    table.tabela-laudo th {
      background: #0f172a;
      color: #ffffff;
      text-align: left;
      padding: 8px 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      font-size: 8pt;
    }
    table.tabela-laudo td {
      border-bottom: 1px solid #e2e8f0;
      padding: 7px 10px;
      vertical-align: top;
    }
    table.tabela-laudo tr:nth-child(even) td {
      background: #f8fafc;
    }
    .badge-conforme {
      color: #16a34a;
      font-weight: 700;
      font-size: 8pt;
      background: #dcfce7;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
    }
    .badge-alerta {
      color: #dc2626;
      font-weight: 700;
      font-size: 8pt;
      background: #fee2e2;
      padding: 2px 6px;
      border-radius: 4px;
      display: inline-block;
    }
    .item-inconformidade {
      border: 1px solid #e2e8f0;
      border-left: 4px solid #dc2626;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 10px;
      background: #ffffff;
      page-break-inside: avoid;
    }
    .item-inconformidade.aviso {
      border-left-color: #d97706;
    }
    .item-inconformidade .topo {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .item-inconformidade .rotulo-tipo {
      font-weight: 700;
      font-size: 9pt;
      color: #0f172a;
      text-transform: uppercase;
    }
    .item-inconformidade .local {
      font-size: 8.5pt;
      color: #64748b;
    }
    .item-inconformidade .trecho-citado {
      font-style: italic;
      color: #334155;
      font-size: 9pt;
      background: #f1f5f9;
      padding: 6px 10px;
      border-radius: 4px;
      margin: 6px 0;
    }
    .item-inconformidade .diagnostico {
      font-size: 9pt;
      color: #0f172a;
      margin: 4px 0 0 0;
    }
    .rodape-pericial {
      margin-top: 36px;
      border-top: 1px solid #cbd5e1;
      padding-top: 16px;
      display: flex;
      justify-content: space-between;
      align-items: flex-end;
      page-break-inside: avoid;
    }
    .assinatura-box {
      border-top: 1px solid #0f172a;
      width: 280px;
      text-align: center;
      padding-top: 6px;
      font-size: 8.5pt;
      color: #334155;
    }
    .assinatura-box strong {
      display: block;
      color: #0f172a;
      font-size: 9pt;
    }
    .hash-integridade {
      font-family: monospace;
      font-size: 7.5pt;
      color: #64748b;
      word-break: break-all;
      max-width: 320px;
    }
    @media print {
      body {
        padding: 0;
      }
      .no-print {
        display: none !important;
      }
    }
    .barra-acoes-topo {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 10px;
    }
    .btn-imprimir {
      background: #0f172a;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 6px 14px;
      font-size: 9pt;
      font-weight: 600;
      cursor: pointer;
    }
    .btn-imprimir:hover {
      background: #1e293b;
    }
    .faixa-resumo {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 8px 16px;
      padding: 10px 14px;
      border-radius: 7px;
      background: #f8fafc;
      border: 1px solid #cbd5e1;
      margin-bottom: 12px;
      font-size: 9pt;
      color: #1e293b;
    }
    .faixa-resumo .metrica-inline strong {
      color: #0f172a;
    }
    .faixa-status-suave {
      border-left: 3.5px solid ${corStatus};
      background: #f8fafc;
      border-top: 1px solid #e2e8f0;
      border-right: 1px solid #e2e8f0;
      border-bottom: 1px solid #e2e8f0;
      border-radius: 6px;
      padding: 10px 14px;
      margin-bottom: 16px;
      font-size: 9pt;
      color: #334155;
    }
  </style>
</head>
<body>
  <div class="barra-acoes-topo no-print">
    <button class="btn-imprimir" onclick="window.print()">🖨️ Imprimir / Salvar como PDF</button>
  </div>

  <header class="cabecalho-laudo" style="padding-bottom: 10px; margin-bottom: 12px;">
    <div>
      <h1 class="titulo-principal" style="font-size: 14pt; text-transform: none; letter-spacing: 0;">Relatório de Revisão Bibliográfica</h1>
      <p class="subtitulo-laudo" style="font-size: 9pt;">Síntese informativa de referências, consistência textual e pontos de melhoria para o autor</p>
    </div>
    <div class="metadados-laudo" style="font-size: 8.5pt;">
      <strong>Arquivo:</strong> ${escaparHtml(nomeArquivo)}<br>
      <strong>Gerado em:</strong> ${escaparHtml(dataHora)}<br>
      <strong>Estilo detectado:</strong> ${escaparHtml(estiloLabel)}
    </div>
  </header>

  <!-- FAIXA COMPACTA DE RESUMO -->
  <div class="faixa-resumo">
    <span class="metrica-inline"><strong>Citações no texto:</strong> ${totalCitacoes}</span>
    <span class="metrica-inline"><strong>Obras mapeadas:</strong> ${totalObras}</span>
    <span class="metrica-inline"><strong>Confirmadas em bases:</strong> ${totalAutenticadas}/${totalObras} (${totalComPdf} com PDF)</span>
    <span class="metrica-inline"><strong>Pendências ativas:</strong> <span style="color: ${corStatus}; font-weight: 700;">${totalInconformidades}</span></span>
    ${rx && rx.totalReferencias > 0 ? `<span class="metrica-inline"><strong>Recentes (≤5 anos):</strong> ${rx.percentualRecentes5Anos}%</span>` : ''}
    ${totalResolvidosOmitidos > 0 ? `<span class="metrica-inline" style="color: #64748b;"><em>(${totalResolvidosOmitidos} resolvido(s)/ignorado(s) omitido(s))</em></span>` : ''}
  </div>

  <!-- RESUMO INTERPRETATIVO PARA O AUTOR -->
  <div class="faixa-status-suave">
    <strong style="color: ${corStatus};">${escaparHtml(statusGeral)}</strong> —
    ${totalInconformidades === 0
      ? 'Todas as referências, citações e verificações ativas estão alinhadas.'
      : `Foram encontrados ${totalInconformidades} ponto(s) ativo(s) detalhados na Seção 3 abaixo para revisão pontual antes da entrega ou submissão.`}
    ${rx && (rx.distribuicaoEvidencia || []).some((e) => e.quantidade > 0)
      ? `<div style="margin-top: 5px; font-size: 8.3pt; color: #475569;"><strong>Perfil das fontes (Pirâmide de Evidência):</strong> ${(rx.distribuicaoEvidencia || []).filter((e) => e.quantidade > 0).map((e) => `${escaparHtml(e.rotulo)}: ${e.quantidade}`).join(' · ')}</div>`
      : ''}
  </div>

  <!-- PANORAMA DAS DIMENSÕES ANALISADAS -->
  <h2 class="secao-titulo" style="font-size: 10.5pt; margin: 14px 0 8px 0;">1. Panorama Detalhado por Dimensão Analisada</h2>
  <table class="tabela-laudo">
    <thead>
      <tr>
        <th style="width: 24%;">Dimensão</th>
        <th style="width: 20%;">Referência / Motor</th>
        <th style="width: 14%; text-align: center;">Situação</th>
        <th style="width: 42%;">Resumo Informativo do Manuscrito</th>
      </tr>
    </thead>
    <tbody>
      ${dimensoes.map((d) => `
        <tr>
          <td><strong>${escaparHtml(d.nome)}</strong></td>
          <td style="color: #475569; font-size: 8.3pt;">${escaparHtml(d.norma)}</td>
          <td style="text-align: center;">
            ${d.alertas === 0
              ? '<span class="badge-conforme">✓ Sem pendências</span>'
              : `<span class="badge-alerta">${d.alertas} ponto(s)</span>`}
          </td>
          <td style="font-size: 8.5pt; color: #334155;">${escaparHtml(d.detalhe)}</td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- ROL DE OBRAS MAPEADAS -->
  <h2 class="secao-titulo" style="font-size: 10.5pt; margin: 16px 0 8px 0;">2. Mapeamento das Referências do Manuscrito (${refsMapeadas.length})</h2>
  <table class="tabela-laudo">
    <thead>
      <tr>
        <th style="width: 18%;">Autor / Ano</th>
        <th style="width: 38%;">Título &amp; Identificador</th>
        <th style="width: 14%; text-align: center;">Citações no Texto</th>
        <th style="width: 18%;">Categoria / Evidência</th>
        <th style="width: 12%; text-align: center;">Acervo</th>
      </tr>
    </thead>
    <tbody>
      ${refsMapeadas.length === 0 ? `
        <tr><td colspan="5" style="text-align: center; color: #64748b;">Nenhuma referência mapeada.</td></tr>
      ` : refsMapeadas.map((r) => {
        const aut = r.primeiroSobrenome || r.autorCitado || 'Autor';
        const a = r.anoBase || r.ano || 's.d.';
        const tit = r.tituloOficial || r.tituloBuscado || r.textoOriginal || 'Título não identificado';
        const doi = r.doiOficial || r.doi || '';
        const autenticada = r.encontradoNasBases || !!doi;
        const ocs = r.ocorrenciasNoTexto || [];
        const parsResumo = ocs.length
          ? `${ocs.length}x (${[...new Set(ocs.map((o) => `§${o.numParagrafo}`))].slice(0, 4).join(', ')})`
          : 'Lista final';
        const evInfo = mapaEvidenciaPorChave.get(r.chave || `${aut}:${a}`);
        const catEv = evInfo ? `N${evInfo.nivel} · ${evInfo.categoria.split('/')[0].trim()}` : (r.natureza === 'norma_livro_institucional' ? 'Normativo / Oficial' : 'Artigo / Obra');
        const temPdf = Boolean(r.temPdf || r.pdfBaixado || r.nomeArquivoPdf);
        return `
          <tr>
            <td><strong>${escaparHtml(aut.toUpperCase())}</strong><br><span style="color:#64748b;font-size:8pt;">${escaparHtml(a)}</span></td>
            <td style="font-size: 8.4pt;">
              ${escaparHtml(tit.slice(0, 125))}${tit.length > 125 ? '…' : ''}
              ${doi ? `<br><a href="https://doi.org/${escaparHtml(doi)}" target="_blank" style="color: #2563eb; text-decoration: none; font-family: monospace; font-size: 7.8pt;">DOI: ${escaparHtml(doi)}</a>` : ''}
            </td>
            <td style="text-align: center; font-size: 8.2pt; color: #334155;">${escaparHtml(parsResumo)}</td>
            <td style="font-size: 8.1pt; color: #475569;">${escaparHtml(catEv)}</td>
            <td style="text-align: center; font-size: 8pt;">
              ${temPdf
                ? '<span class="badge-conforme">PDF local</span>'
                : autenticada
                ? '<span class="badge-conforme">Indexada</span>'
                : '<span style="color: #64748b;">Referência local</span>'}
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <!-- APONTAMENTOS DE INCONFORMIDADES CATEGORIZADOS (APENAS PENDÊNCIAS ATIVAS) -->
  <h2 class="secao-titulo">3. Relatório Circunstanciado de Inconformidades Ativas por Categoria (${totalInconformidades})</h2>
  ${totalInconformidades === 0 ? `
    <div style="padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; color: #166534; font-size: 9.5pt;">
      <strong>✓ Nenhuma pendência ativa.</strong> Todos os critérios auditados encontram-se em conformidade (itens previamente sanados ou justificados não acompanham este relatório).
    </div>
  ` : `
    <div>
      ${categoriasInconformidades.map((cat) => `
        <div style="margin-bottom: 14px;">
          <h3 style="font-size: 10pt; font-weight: 700; color: ${cat.cor}; margin: 10px 0 6px 0; padding-bottom: 3px; border-bottom: 1px solid #e2e8f0;">
            ${escaparHtml(cat.titulo)} (${cat.itens.length})
          </h3>
          ${cat.itens.map((inc, idx) => {
            const tipoRotulo = inc.tipo || 'INCONFORMIDADE NORMATIVA';
            const parLinha = inc.numParagrafo ? `§${inc.numParagrafo}${inc.numLinha ? `, Linha ${inc.numLinha}` : ''}` : '';
            const secao = inc.secao ? `${parLinha ? ' · ' : ''}${inc.secao}` : '';
            const autor = inc.autorCitado ? `${parLinha || secao ? ' · ' : ''}${inc.autorCitado}` : '';
            const trecho = inc.fraseWord || inc.textoOriginal || '';
            const msg = inc.mensagem || inc.diagnostico || 'Recomenda-se revisão e ajuste da redação.';
            return `
              <div class="item-inconformidade ${tipoRotulo.includes('aviso') ? 'aviso' : ''}" style="border-left-color: ${cat.cor};">
                <div class="topo">
                  <span class="rotulo-tipo">#${idx + 1} — ${escaparHtml(tipoRotulo.toUpperCase().replace(/_/g, ' '))}</span>
                  <span class="local">${escaparHtml(parLinha)}${escaparHtml(secao)}${escaparHtml(autor)}</span>
                </div>
                ${trecho ? `<div class="trecho-citado">"${escaparHtml(trecho.slice(0, 280))}${trecho.length > 280 ? '…' : ''}"</div>` : ''}
                <div class="diagnostico"><strong>Ação / Diagnóstico:</strong> ${escaparHtml(msg)}</div>
              </div>
            `;
          }).join('')}
        </div>
      `).join('')}
    </div>
  `}

  <!-- RODAPÉ DISCRETO DE RASTREABILIDADE -->
  <footer class="rodape-pericial" style="margin-top: 24px; padding-top: 10px;">
    <div style="font-size: 7.8pt; color: #64748b;">
      Gerado pelo Bibliografia v1.2.0 · Relatório de apoio à revisão autoral
    </div>
    <div class="hash-integridade" style="text-align: right;">SHA-256: ${calcularHashIntegridade(JSON.stringify(resultado))}</div>
  </footer>
</body>
</html>`;

  return htmlConteudo;
}

module.exports = {
  gerarHtmlLaudoPericial,
  calcularHashIntegridade,
  escaparHtml,
};
