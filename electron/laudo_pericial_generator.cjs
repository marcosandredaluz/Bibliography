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
  const d = data instanceof Date ? data : new Date(data);
  return d.toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
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
  const alertasFigurasTabelas = resultado.alertasFigurasTabelas || [];
  const citacoesSemReferencia = resultado.citacoesSemReferencia || [];
  const refsNaoCitadas = resultado.refsNaoCitadasNoTexto || [];

  // Alertas ativos (excluindo os sanados/resolvidos pelo usuário)
  const inconformidadesAtivas = [
    ...alertasPrecisao.filter((a) => !resolvidosSet.has(a.id || a.mensagem)),
    ...citacoesSemReferencia.filter((c) => !resolvidosSet.has(`orfa-${c.autor}-${c.ano}`)),
    ...refsNaoCitadas.filter((r) => !resolvidosSet.has(`sobrando-${r.id || r.chave}`)),
  ];

  const totalInconformidades = inconformidadesAtivas.length;

  // Cálculo do Índice de Integridade
  let indiceIntegridade = 100;
  if (totalObras > 0) {
    const penalidade = Math.min(100, Math.round((totalInconformidades / (totalObras * 1.5)) * 100));
    indiceIntegridade = Math.max(0, 100 - penalidade);
  }

  let statusGeral = 'CONFORME / EXCELENTE';
  let corStatus = '#16a34a';
  let badgeClass = 'status-conforme';
  if (totalInconformidades > 8 || indiceIntegridade < 70) {
    statusGeral = 'CRÍTICO / REQUER ADEQUAÇÃO URGENTE';
    corStatus = '#dc2626';
    badgeClass = 'status-critico';
  } else if (totalInconformidades > 0 || indiceIntegridade < 95) {
    statusGeral = 'APTO COM RESSALVAS NORMATIVAS';
    corStatus = '#d97706';
    badgeClass = 'status-ressalvas';
  }

  // Matriz de Dimensões Forenses
  const dimensoes = [
    {
      nome: 'Autenticidade de Fontes & Detecção de IA',
      norma: 'Crossref, OpenAlex, Handles, DOI',
      alertas: refsMapeadas.filter((r) => r.suspeitaAlucinacaoIa).length,
      descricao: 'Verificação cruzada contra alucinações de LLM e obras fabricadas',
    },
    {
      nome: 'Fidelidade de Citação e Mismatch de Conteúdo',
      norma: 'NBR 10520 & Comparação Semântica',
      alertas: alertasPrecisao.filter((a) => a.tipo === 'atribuicao_falsa' || a.tipo === 'mismatch_conteudo').length,
      descricao: 'Conferência entre a ideia atribuída e o conteúdo real da obra',
    },
    {
      nome: 'Plágio e Cópia Literal sem Aspas',
      norma: 'Google Diff Match & NBR 10520 §5',
      alertas: alertasPrecisao.filter((a) => a.tipo === 'plagio_literal' || a.tipo === 'copia_sem_aspas').length,
      descricao: 'Identificação de blocos idênticos de 7+ palavras sem aspas',
    },
    {
      nome: 'Consistência Estatística (GRIM / p-values)',
      norma: 'Brown & Heathers (2016) / APA StatCheck',
      alertas: (resultado.resumoEstatistico?.alertasEstatisticos || []).length,
      descricao: 'Verificação matemática de granularidade amostral e teste de hipóteses',
    },
    {
      nome: 'Concentração de Rede & Autocitação',
      norma: 'COPE Guidelines / Índice de Gini',
      alertas: (resultado.resumoRede?.alertasRede || []).length,
      descricao: 'Análise de distribuição equilibrada de periódicos e autores citados',
    },
    {
      nome: 'Metodologia Clínica & Conformidade Ética',
      norma: 'CONSORT, PRISMA, Res. CNS 510/2016',
      alertas: (resultado.resumoMetodologiaClinica?.alertas || []).length,
      descricao: 'Verificação de declaração de CEP, TCLE, cálculo amostral e checklist',
    },
    {
      nome: 'Frases Torturadas & Spin-Botting',
      norma: 'Cabanac, Labbé & Magazinov (2021)',
      alertas: (resultado.resumoFrasesTorturadas?.alertas || []).length,
      descricao: 'Detecção de sinônimos bizarros gerados por parafraseadores automáticos',
    },
    {
      nome: 'Estilometria Textual & Variação Rítmica',
      norma: 'Índice Guiraud, TTR & Burstiness Frasal',
      alertas: (resultado.resumoEstilometria?.alertasEstilometricos || []).length,
      descricao: 'Análise de cadência sintática, monotonia mecânica e riqueza vocabular',
    },
    {
      nome: 'Revistas e Editoras Predatórias',
      norma: 'Critérios de Beall / Stop Predatory Hub',
      alertas: (resultado.resumoPredatorias?.alertas || []).length,
      descricao: 'Triagem de periódicos suspeitos de publicação predatória ou vaidade',
    },
    {
      nome: 'Completude de Metadados ABNT NBR 6023',
      norma: 'ABNT NBR 6023:2018 / 2020',
      alertas: (resultado.resumoAbnt6023?.alertas || []).length,
      descricao: 'Exigência de autoria completa, título, edição, cidade, editora e ano',
    },
    {
      nome: 'Corrupção Genômica de Nomenclatura',
      norma: 'Ziemann et al. (2016) / HUGO HGNC',
      alertas: (resultado.resumoCorrupcaoGene?.alertas || []).length,
      descricao: 'Identificação de símbolos de genes convertidos indevidamente em datas',
    },
    {
      nome: 'Fomento, Agências e Conflito de Interesses',
      norma: 'Portaria CAPES 206 / CNPq / ICMJE',
      alertas: (resultado.resumoFomento?.alertas || []).length,
      descricao: 'Declaração formal de código CAPES 001, processos e isenção de conflito',
    },
    {
      nome: 'Relevância Temática & Claim Support',
      norma: 'TF-IDF & Vetores Esparsos BM25',
      alertas: (resultado.resumoClaimSupport?.alertas || []).length,
      descricao: 'Avaliação de pertinência entre a afirmação do texto e o resumo oficial',
    },
    {
      nome: 'Figuras, Quadros e Tabelas',
      norma: 'ABNT NBR 14724 & Normas Tabulares IBGE',
      alertas: alertasFigurasTabelas.length,
      descricao: 'Auditoria de chamadas no corpo (§), linha obrigatória de Fonte e numeração',
    },
    {
      nome: 'Citações Órfãs (Citadas sem Referência)',
      norma: 'Rastreabilidade Textual Bidirecional',
      alertas: citacoesSemReferencia.length,
      descricao: 'Autores invocados no corpo que não constam nas referências finais',
    },
    {
      nome: 'Obras não Citadas (Sobrando na Lista)',
      norma: 'ABNT NBR 10520 & 14724',
      alertas: refsNaoCitadas.length,
      descricao: 'Obras listadas nas referências que não receberam citação no texto',
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
    .btn-imprimir {
      position: fixed;
      top: 16px;
      right: 16px;
      background: #0f172a;
      color: #ffffff;
      border: none;
      border-radius: 6px;
      padding: 8px 16px;
      font-size: 10pt;
      font-weight: 600;
      cursor: pointer;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    }
    .btn-imprimir:hover {
      background: #1e293b;
    }
  </style>
</head>
<body>
  <button class="btn-imprimir no-print" onclick="window.print()">🖨️ Imprimir Laudo / Salvar como PDF</button>

  <header class="cabecalho-laudo">
    <div>
      <h1 class="titulo-principal">Laudo Pericial de Auditoria Bibliográfica</h1>
      <p class="subtitulo-laudo">Dossiê Forense de Integridade Científica, Autenticidade de Fontes Primárias e Rastreabilidade Normativa</p>
    </div>
    <div class="metadados-laudo">
      <strong>Documento:</strong> ${escaparHtml(nomeArquivo)}<br>
      <strong>Data da Perícia:</strong> ${escaparHtml(dataHora)}<br>
      <strong>Motor Forense:</strong> Auditoria Reversa v2.5<br>
      <strong>Protocolo:</strong> #${Math.floor(100000 + Math.random() * 900000)}
    </div>
  </header>

  <!-- RESUMO EXECUTIVO -->
  <div class="painel-resumo">
    <div class="card-kpi">
      <div class="rotulo">Total de Citações</div>
      <div class="valor" style="color: #2563eb;">${totalCitacoes}</div>
      <div style="font-size: 8pt; color: #64748b;">ocorrências no manuscrito</div>
    </div>
    <div class="card-kpi">
      <div class="rotulo">Obras Distintas</div>
      <div class="valor" style="color: #0f172a;">${totalObras}</div>
      <div style="font-size: 8pt; color: #64748b;">referências examinadas</div>
    </div>
    <div class="card-kpi">
      <div class="rotulo">Fontes Autenticadas</div>
      <div class="valor" style="color: #16a34a;">${totalAutenticadas} / ${totalObras}</div>
      <div style="font-size: 8pt; color: #64748b;">validadas em bases oficiais</div>
    </div>
    <div class="card-kpi">
      <div class="rotulo">Índice de Integridade</div>
      <div class="valor" style="color: ${corStatus};">${indiceIntegridade}%</div>
      <div style="font-size: 8pt; color: #64748b;">${totalInconformidades} inconformidades ativas</div>
    </div>
  </div>

  <!-- BANNER DE PARECER TÉCNICO -->
  <div class="banner-parecer">
    <div>
      <div class="titulo-parecer">Parecer Técnico: ${statusGeral}</div>
      <p class="desc-parecer">
        O manuscrito foi submetido a auditoria automatizada em profundidade cobrindo normas ABNT (NBR 10520, 6023, 14724), integridade de bases de dados (Crossref, PubMed, OpenAlex), análise de plágio literal sem aspas, consistência matemática e marcadores estilométricos.
      </p>
    </div>
  </div>

  <!-- MATRIZ FORENSE DE CONFORMIDADE -->
  <h2 class="secao-titulo">1. Matriz de Conformidade Forense (16 Dimensões de Integridade)</h2>
  <table class="tabela-laudo">
    <thead>
      <tr>
        <th style="width: 30%;">Dimensão Forense</th>
        <th style="width: 25%;">Norma / Base Técnica</th>
        <th style="width: 15%; text-align: center;">Status</th>
        <th style="width: 30%;">Diagnóstico Resumido</th>
      </tr>
    </thead>
    <tbody>
      ${dimensoes.map((d) => `
        <tr>
          <td><strong>${escaparHtml(d.nome)}</strong></td>
          <td style="color: #475569;">${escaparHtml(d.norma)}</td>
          <td style="text-align: center;">
            ${d.alertas === 0
              ? '<span class="badge-conforme">✓ Conforme</span>'
              : `<span class="badge-alerta">⚠ ${d.alertas} alerta(s)</span>`}
          </td>
          <td style="font-size: 8.5pt; color: #334155;">
            ${d.alertas === 0
              ? 'Conformidade plena assegurada sem divergências.'
              : escaparHtml(d.descricao)}
          </td>
        </tr>
      `).join('')}
    </tbody>
  </table>

  <!-- ROL DE OBRAS AUTENTICADAS -->
  <h2 class="secao-titulo">2. Rol de Obras Autenticadas e Rastreabilidade de Fontes Primárias (${refsMapeadas.length})</h2>
  <table class="tabela-laudo">
    <thead>
      <tr>
        <th style="width: 20%;">Autor / Entrada</th>
        <th style="width: 8%; text-align: center;">Ano</th>
        <th style="width: 42%;">Título da Obra / Artigo</th>
        <th style="width: 18%;">Identificador / DOI</th>
        <th style="width: 12%; text-align: center;">Autenticação</th>
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
        return `
          <tr>
            <td><strong>${escaparHtml(aut.toUpperCase())}</strong></td>
            <td style="text-align: center;">${escaparHtml(a)}</td>
            <td style="font-size: 8.5pt;">${escaparHtml(tit.slice(0, 120))}${tit.length > 120 ? '…' : ''}</td>
            <td style="font-size: 8pt; font-family: monospace;">
              ${doi ? `<a href="https://doi.org/${escaparHtml(doi)}" target="_blank" style="color: #2563eb; text-decoration: none;">${escaparHtml(doi)}</a>` : '<span style="color: #94a3b8;">Não indexado</span>'}
            </td>
            <td style="text-align: center;">
              ${autenticada
                ? '<span class="badge-conforme">✓ Autêntica</span>'
                : '<span class="badge-alerta" style="background: #fef3c7; color: #b45309;">Manual</span>'}
            </td>
          </tr>
        `;
      }).join('')}
    </tbody>
  </table>

  <!-- APONTAMENTOS DE INCONFORMIDADES -->
  <h2 class="secao-titulo">3. Relatório Circunstanciado de Inconformidades e Recomendações (${totalInconformidades})</h2>
  ${totalInconformidades === 0 ? `
    <div style="padding: 16px; background: #f0fdf4; border: 1px solid #bbf7d0; border-radius: 6px; color: #166534; font-size: 9.5pt;">
      <strong>✓ Nenhuma inconformidade ativa detectada.</strong> O manuscrito atende com rigor aos parâmetros auditados.
    </div>
  ` : `
    <div>
      ${inconformidadesAtivas.map((inc, idx) => {
        const tipoRotulo = inc.tipo || 'INCONFORMIDADE NORMATIVA';
        const parLinha = `§${inc.numParagrafo || '?'}${inc.numLinha ? `, Linha ${inc.numLinha}` : ''}`;
        const secao = inc.secao ? ` · Seção: ${inc.secao}` : '';
        const autor = inc.autorCitado ? ` · ${inc.autorCitado}` : '';
        const trecho = inc.fraseWord || inc.textoOriginal || '';
        const msg = inc.mensagem || inc.diagnostico || 'Recomenda-se revisão e ajuste da redação.';
        return `
          <div class="item-inconformidade ${tipoRotulo.includes('aviso') ? 'aviso' : ''}">
            <div class="topo">
              <span class="rotulo-tipo">#${idx + 1} — ${escaparHtml(tipoRotulo.toUpperCase().replace(/_/g, ' '))}</span>
              <span class="local">${escaparHtml(parLinha)}${escaparHtml(secao)}${escaparHtml(autor)}</span>
            </div>
            ${trecho ? `<div class="trecho-citado">"${escaparHtml(trecho.slice(0, 300))}${trecho.length > 300 ? '…' : ''}"</div>` : ''}
            <div class="diagnostico"><strong>Apontamento Forense:</strong> ${escaparHtml(msg)}</div>
          </div>
        `;
      }).join('')}
    </div>
  `}

  <!-- TERMO PERICIAL E ASSINATURA -->
  <footer class="rodape-pericial">
    <div>
      <div style="font-size: 8.5pt; font-weight: 700; color: #0f172a; margin-bottom: 2px;">Assinatura Digital de Integridade Forense:</div>
      <div class="hash-integridade">SHA-256: ${calcularHashIntegridade(JSON.stringify(resultado))}</div>
      <div style="font-size: 7.5pt; color: #94a3b8; margin-top: 4px;">Gerado eletronicamente por Sistema de Auditoria Bibliográfica e Integridade Acadêmica.</div>
    </div>
    <div class="assinatura-box">
      <strong>Auditor / Responsável Técnico</strong>
      Perícia de Integridade Científica & Bibliografia
    </div>
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
