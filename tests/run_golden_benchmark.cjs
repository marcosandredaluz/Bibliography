'use strict';

/**
 * tests/run_golden_benchmark.cjs
 *
 * Suíte Automatizada de Benchmark Ouro Multi-Domínio & Multi-Norma (v1.2.0)
 * Avalia `auditarManuscrito` em modo determinístico offline (`buscarEBaixar: false`, `somenteLeitura: true`)
 * sobre 4 cenários representativos:
 *   a) Artigo Internacional (Nature / Vancouver) com citações sobrescritas e revisão sistemática
 *   b) Artigo Brasileiro ABNT autor-data (Engenharia / Computação)
 *   c) Parecer / Artigo Jurídico PT-BR (Leis, Jurisprudência e Doutrina)
 *   d) Manuscrito Sabotado Multidomínio (5 falhas reais injetadas: Recall = 100%)
 */

const assert = require('assert');
const { auditarManuscrito } = require('../electron/auditor.cjs');

function contarTotalAlertasAtivos(res) {
  return (
    (res.citacoesSemReferencia?.length || 0) +
    (res.refsMapeadas?.filter((r) => !r.citadaNoTexto && !r.conflitoParsingNeutralizado).length || 0) +
    (res.alertasAtribuicaoFalsa?.length || 0) +
    (res.alertasPlagio?.length || 0) +
    (res.alertasPrecisao?.length || 0)
  );
}

function criarXmlTabelaDivergente() {
  return `<?xml version="1.0" encoding="UTF-8"?>
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
      <w:p><w:r><w:t>Tabela 1 – Adesão terapêutica ajustada na atenção primária</w:t></w:r></w:p>
      <w:tbl>
        <w:tr><w:tc><w:p><w:r><w:t>Desfecho</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Percentual</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Amostra</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>Adesão medicamentosa</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>43,5%</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>n=180</w:t></w:r></w:p></w:tc></w:tr>
      </w:tbl>
    </w:body>
  </w:document>`;
}

async function executarCenarioNatureVancouver() {
  const bib = {
    raiz: '',
    refs: new Map([
      [
        'nature-smith-2024',
        {
          id: 'nature-smith-2024',
          status: 'citada',
          pdf: 'smith2024.pdf',
          textoExtraido:
            'In a global systematic review of genomic pathogen surveillance across primary healthcare networks, standardized sequencing protocols accelerated outbreak detection by 38% and lowered diagnostic turnaround delays across regional laboratories.',
          csl: {
            id: 'nature-smith-2024',
            type: 'article-journal',
            title: 'Genomic surveillance of respiratory pathogens in primary healthcare clinics',
            author: [
              { family: 'Smith', given: 'Robert' },
              { family: 'Jones', given: 'Alice' },
            ],
            issued: { 'date-parts': [[2024]] },
            'container-title': 'Nature',
            DOI: '10.1038/s41586-024-0001-x',
          },
        },
      ],
      [
        'lancet-patel-2023',
        {
          id: 'lancet-patel-2023',
          status: 'citada',
          pdf: 'patel2023.pdf',
          textoExtraido:
            'A pooled synthesis of electronic immunization registries demonstrated that automated cold-chain telemetry reduced vaccine spoilage by 22% across rural and urban healthcare facilities.',
          csl: {
            id: 'lancet-patel-2023',
            type: 'article-journal',
            title: 'Electronic immunization registries and cold-chain compliance in healthcare facilities',
            author: [
              { family: 'Patel', given: 'Kiran' },
              { family: 'Liu', given: 'Yan' },
            ],
            issued: { 'date-parts': [[2023]] },
            'container-title': 'Lancet Digit Health',
            DOI: '10.1016/S2589-7500(23)00010-1',
          },
        },
      ],
    ]),
  };

  const texto = [
    'ABSTRACT',
    'Background: This systematic review evaluates genomic pathogen surveillance and digital immunization registries in primary healthcare facilities. Inclusion criteria encompassed peer-reviewed observational cohorts evaluating laboratory turnaround time or cold-chain wastage rates. Exclusion criteria removed commentaries, duplicate cohorts, and editorials without empirical measurements.',
    '',
    'METHODS AND RESULTS',
    'Keywords: Systematic review; Genomic surveillance; Immunization registries; Public health.',
    'Across regional primary care laboratories evaluated in the literature, standardized genomic sequencing protocols accelerated outbreak recognition by 38% and reduced diagnostic delays¹.',
    'Evidence from multicenter immunization programs similarly shows that electronic registries equipped with automated cold-chain telemetry lowered vaccine wastage by 22% across participating clinics².',
    'Competing interests: The authors declare no conflicts of interest or competing interests. Funding: No external funding was received (self-funded study).',
    '',
    'REFERENCES',
    '1. Smith R, Jones A. Genomic surveillance of respiratory pathogens in primary healthcare clinics. Nature. 2024;625(7994):112-119. doi:10.1038/s41586-024-0001-x.',
    '2. Patel K, Liu Y. Electronic immunization registries and cold-chain compliance in healthcare facilities. Lancet Digit Health. 2023;5(4):e190-e202. doi:10.1016/S2589-7500(23)00010-1.',
  ].join('\n');

  const res = await auditarManuscrito({
    texto,
    biblioteca: bib,
    buscarEBaixar: false,
    somenteLeitura: true,
    modulo: 'todos',
  });

  const alertasCepTcle = (res.alertasMetodologiaClinica || []).filter((a) =>
    ['ausencia_aprovacao_etica', 'ausencia_mencao_tcle'].includes(a.tipo)
  );
  assert.strictEqual(
    res.estiloBibliograficoDetectado,
    'vancouver_nature',
    `Cenário A deve detectar estilo vancouver_nature, recebido: ${res.estiloBibliograficoDetectado}`
  );
  assert.strictEqual(
    res.alertasAbnt6023?.length || 0,
    0,
    `Cenário A não deve emitir alertas ABNT 6023, recebido: ${JSON.stringify(res.alertasAbnt6023)}`
  );
  assert.strictEqual(
    alertasCepTcle.length,
    0,
    `Cenário A (revisão sistemática) não deve emitir alertas CEP/TCLE, recebido: ${JSON.stringify(alertasCepTcle)}`
  );

  const totalAlertas = contarTotalAlertasAtivos(res);
  assert.strictEqual(
    totalAlertas,
    0,
    `Cenário A deve ter 0 falsos positivos. Alertas: ${JSON.stringify({
      semRef: res.citacoesSemReferencia,
      atrib: res.alertasAtribuicaoFalsa,
      prec: res.alertasPrecisao,
    })}`
  );

  return {
    cenario: 'a) Nature / Vancouver (Rev. Sistemática)',
    estiloDetectado: res.estiloBibliograficoDetectado,
    totalAlertas,
    falsosPositivos: totalAlertas,
    recall: 'N/A (0 falhas injetadas)',
  };
}

async function executarCenarioAbntEngenharia() {
  const bib = {
    raiz: '',
    refs: new Map([
      [
        'eng-silva-2023',
        {
          id: 'eng-silva-2023',
          status: 'citada',
          pdf: 'eng_silva2023.pdf',
          textoExtraido:
            'Experiments on distributed microservices architectures demonstrated that asynchronous message queues paired with service-oriented parsers reduced inference tail latency by 41% under concurrent load.',
          csl: {
            id: 'eng-silva-2023',
            type: 'article-journal',
            title: 'Arquitetura orientada a serviços e processamento distribuído em larga escala',
            author: [
              { family: 'Silva', given: 'Marcos' },
              { family: 'Oliveira', given: 'Renato' },
            ],
            issued: { 'date-parts': [[2023]] },
            'container-title': 'Revista Brasileira de Computação Aplicada',
            DOI: '10.5335/rbca.v15i2.14210',
          },
        },
      ],
      [
        'eng-pereira-2022',
        {
          id: 'eng-pereira-2022',
          status: 'citada',
          pdf: 'eng_pereira2022.pdf',
          textoExtraido:
            'Relational schema normalization combined with columnar indexing improved analytical throughput by 3,4 vezes during real-time telemetry ingestion across edge gateways.',
          csl: {
            id: 'eng-pereira-2022',
            type: 'article-journal',
            title: 'Modelagem de dados e indexação colunar em sistemas distribuídos resilientes',
            author: [{ family: 'Pereira', given: 'Camila' }],
            issued: { 'date-parts': [[2022]] },
            'container-title': 'Engenharia de Sistemas',
            DOI: '10.1000/eng.2022.010',
          },
        },
      ],
    ]),
  };

  const texto = [
    'RESUMO',
    'Este trabalho apresenta o desenvolvimento de sistema e a modelagem de dados aplicada a plataformas computacionais de alta disponibilidade. Foram integrados pipelines de Processamento de Linguagem Natural (PLN) e Arquitetura Orientada a Serviços (SOA) para indexação técnica.',
    'Palavras-chave: Engenharia de Software; Processamento de Linguagem Natural; Modelagem de Dados; Sistemas Distribuídos.',
    '',
    '1 INTRODUÇÃO',
    'Na concepção de infraestruturas modulares em SOA, o uso de filas assíncronas acopladas a analisadores sintáticos reduziu em 41% a latência de cauda das requisições concorrentes em microsserviços (SILVA; OLIVEIRA, 2023).',
    'Complementarmente, a aplicação prática de modelos em PLN depende de esquemas relacionais bem estruturados, visto que a indexação colunar elevou em 3,4 vezes a vazão analítica de telemetria em gateways distribuídos (PEREIRA, 2022).',
    'Declaração de conflito de interesses: Os autores declaram ausência de conflito de interesses. Financiamento: Pesquisa conduzida com recursos próprios.',
    '',
    'REFERÊNCIAS',
    'PEREIRA, C. Modelagem de dados e indexação colunar em sistemas distribuídos resilientes. Engenharia de Sistemas, v. 12, n. 1, p. 10-28, 2022. DOI: 10.1000/eng.2022.010.',
    'SILVA, M.; OLIVEIRA, R. Arquitetura orientada a serviços e processamento distribuído em larga escala. Revista Brasileira de Computação Aplicada, v. 15, n. 2, p. 45-60, 2023. DOI: 10.5335/rbca.v15i2.14210.',
  ].join('\n');

  const res = await auditarManuscrito({
    texto,
    biblioteca: bib,
    buscarEBaixar: false,
    somenteLeitura: true,
    modulo: 'todos',
  });

  const alertasCepTcle = (res.alertasMetodologiaClinica || []).filter((a) =>
    ['ausencia_aprovacao_etica', 'ausencia_mencao_tcle'].includes(a.tipo)
  );
  const alertasSiglas = (res.alertasIntraDocumento || []).filter((a) => a.codigo === 'SIGLA_SEM_DEFINICAO');

  assert.strictEqual(res.estiloBibliograficoDetectado, 'abnt', 'Cenário B deve detectar estilo ABNT');
  assert.strictEqual(alertasCepTcle.length, 0, 'Cenário B (Engenharia/Computação) deve ter 0 alertas CEP/TCLE');
  assert.strictEqual(
    alertasSiglas.length,
    0,
    `Siglas PLN e SOA foram definidas na primeira menção; recebido: ${JSON.stringify(alertasSiglas)}`
  );

  const totalAlertas = contarTotalAlertasAtivos(res);
  assert.strictEqual(
    totalAlertas,
    0,
    `Cenário B deve ter 0 falsos positivos. Alertas: ${JSON.stringify(res.alertasPrecisao)}`
  );

  return {
    cenario: 'b) ABNT Engenharia / Computação',
    estiloDetectado: res.estiloBibliograficoDetectado,
    totalAlertas,
    falsosPositivos: totalAlertas,
    recall: 'N/A (0 falhas injetadas)',
  };
}

async function executarCenarioJuridicoPtBr() {
  const bib = {
    raiz: '',
    refs: new Map([
      [
        'jur-cf-1988',
        {
          id: 'jur-cf-1988',
          status: 'citada',
          pdf: null,
          textoExtraido: '',
          csl: {
            id: 'jur-cf-1988',
            type: 'legislation',
            title: 'Constituição da República Federativa do Brasil de 1988',
            author: [{ literal: 'BRASIL' }],
            issued: { 'date-parts': [[1988]] },
          },
        },
      ],
      [
        'jur-lgpd-2018',
        {
          id: 'jur-lgpd-2018',
          status: 'citada',
          pdf: null,
          textoExtraido: '',
          csl: {
            id: 'jur-lgpd-2018',
            type: 'legislation',
            title: 'Lei nº 13.709, de 14 de agosto de 2018. Lei Geral de Proteção de Dados Pessoais (LGPD)',
            author: [{ literal: 'BRASIL' }],
            issued: { 'date-parts': [[2018]] },
          },
        },
      ],
      [
        'jur-stf-2021',
        {
          id: 'jur-stf-2021',
          status: 'citada',
          pdf: null,
          textoExtraido: '',
          csl: {
            id: 'jur-stf-2021',
            type: 'legal_case',
            title: 'Supremo Tribunal Federal. Ação Direta de Inconstitucionalidade nº 6.387',
            author: [{ literal: 'BRASIL' }],
            issued: { 'date-parts': [[2021]] },
          },
        },
      ],
      [
        'jur-barroso-2020',
        {
          id: 'jur-barroso-2020',
          status: 'citada',
          pdf: null,
          textoExtraido: '',
          csl: {
            id: 'jur-barroso-2020',
            type: 'book',
            title: 'Curso de direito constitucional contemporâneo',
            author: [{ family: 'Barroso', given: 'Luís Roberto' }],
            issued: { 'date-parts': [[2020]] },
          },
        },
      ],
    ]),
  };

  const texto = [
    'RESUMO',
    'Este parecer analisa, por meio de pesquisa qualitativa documental, a tutela constitucional da autodeterminação informativa na Constituição Federal (CF), na Lei Geral de Proteção de Dados Pessoais (LGPD) e na jurisprudência do Supremo Tribunal Federal (STF).',
    'Palavras-chave: Direito Constitucional; Autodeterminação Informativa; Proteção de Dados; Jurisprudência.',
    '',
    '1 FUNDAMENTAÇÃO JURÍDICA',
    'A ordem jurídica inaugurada pela CF consagra a inviolabilidade da intimidade e da vida privada como garantias fundamentais oponíveis ao Estado e a particulares (BRASIL, 1988).',
    'Sob a perspectiva hermenêutica, a ponderação entre interesses públicos e direitos fundamentais exige observância estrita ao princípio da proporcionalidade (BARROSO, 2020).',
    'Com o advento da LGPD, consolidou-se o regime jurídico de governança, finalidade legítima e segurança no tratamento de dados pessoais em território nacional (BRASIL, 2018).',
    'Em consonância jurisprudencial, o STF reconheceu expressamente o direito fundamental autônomo à proteção de dados pessoais e ao sigilo informacional (BRASIL, 2021).',
    'Conflito de interesses: O autor declara não possuir conflito de interesses. Financiamento: Pesquisa elaborada com recursos próprios.',
    '',
    'REFERÊNCIAS',
    'BARROSO, L. R. Curso de direito constitucional contemporâneo. 9. ed. São Paulo: Saraiva, 2020. 560 p.',
    'BRASIL. Constituição da República Federativa do Brasil de 1988. Diário Oficial da União, Brasília, DF, 1988.',
    'BRASIL. Lei nº 13.709, de 14 de agosto de 2018. Lei Geral de Proteção de Dados Pessoais (LGPD). Diário Oficial da União, Brasília, DF, 2018.',
    'BRASIL. Supremo Tribunal Federal. Ação Direta de Inconstitucionalidade nº 6.387. Brasília: STF, 2021.',
  ].join('\n');

  const res = await auditarManuscrito({
    texto,
    biblioteca: bib,
    buscarEBaixar: false,
    somenteLeitura: true,
    modulo: 'todos',
  });

  assert.strictEqual(res.estiloBibliograficoDetectado, 'abnt', 'Cenário C deve detectar estilo ABNT');
  const todasInstitucionaisOuNormas = (res.refsMapeadas || []).every(
    (r) => r.natureza === 'norma_livro_institucional' && r.statusAutenticidade === 'institucional_tese'
  );
  assert.strictEqual(
    todasInstitucionaisOuNormas,
    true,
    `Leis, jurisprudência e doutrina devem ser classificadas como norma_livro_institucional/institucional_tese: ${JSON.stringify(
      res.refsMapeadas.map((r) => ({ k: r.chave, nat: r.natureza, st: r.statusAutenticidade }))
    )}`
  );

  const totalAlertas = contarTotalAlertasAtivos(res);
  assert.strictEqual(
    totalAlertas,
    0,
    `Cenário C (Jurídico PT-BR) deve ter 0 falsos positivos. Alertas: ${JSON.stringify(res.alertasPrecisao)}`
  );

  return {
    cenario: 'c) Jurídico PT-BR (Leis e Jurisprudência)',
    estiloDetectado: res.estiloBibliograficoDetectado,
    totalAlertas,
    falsosPositivos: totalAlertas,
    recall: 'N/A (0 falhas injetadas)',
  };
}

async function executarCenarioSabotadoMultidominio() {
  const bib = {
    raiz: '',
    refs: new Map([
      [
        'sab-martins-2024',
        {
          id: 'sab-martins-2024',
          status: 'citada',
          pdf: 'martins2024.pdf',
          textoExtraido:
            'In this primary care observational evaluation of immunization adherence among pregnant patients, structured recall scheduling achieved 22.0% vaccination improvement across participating outpatient clinics (n=320).',
          csl: {
            id: 'sab-martins-2024',
            type: 'article-journal',
            title: 'Structured recall scheduling and immunization adherence in outpatient clinics',
            author: [{ family: 'Martins', given: 'Helena' }],
            issued: { 'date-parts': [[2024]] },
            'container-title': 'Revista de Atenção Primária',
            DOI: '10.1000/rap.2024.201',
          },
        },
      ],
      [
        'sab-nunes-2024',
        {
          id: 'sab-nunes-2024',
          status: 'citada',
          pdf: 'nunes2024.pdf',
          textoExtraido:
            'In this randomized multicenter study of antihypertensive telemonitoring, the clinical intervention failed to reduce patient mortality and showed no reduction in mortality compared with usual placebo care.',
          csl: {
            id: 'sab-nunes-2024',
            type: 'article-journal',
            title: 'Multicenter randomized trial of antihypertensive telemonitoring and mortality outcomes',
            author: [{ family: 'Nunes', given: 'Rafael' }],
            issued: { 'date-parts': [[2024]] },
            'container-title': 'Journal of Clinical Trials',
            DOI: '10.1001/nli.2024.001',
          },
        },
      ],
      [
        'sab-silva-2023',
        {
          id: 'sab-silva-2023',
          status: 'citada',
          pdf: 'silva2023.pdf',
          textoExtraido:
            'A systematic review demonstrated that electronic immunization registries integrated across primary care facilities reduced vaccine dose wastage by 25% and improved cold-chain traceability.',
          csl: {
            id: 'sab-silva-2023',
            type: 'article-journal',
            title: 'Electronic immunization registries and vaccine cold-chain traceability in primary care',
            author: [{ family: 'Silva', given: 'Maria' }],
            issued: { 'date-parts': [[2023]] },
            'container-title': 'Revista de Saúde Pública',
            DOI: '10.1590/rsp.2023.001',
          },
        },
      ],
      [
        'sab-intruso-2024',
        {
          id: 'sab-intruso-2024',
          status: 'citada',
          pdf: 'intruso2024.pdf',
          textoExtraido:
            'Titanium alloy corrosion fatigue and microstructural grain degradation in supersonic aerospace turbine blades operating at extreme thermal loads.',
          csl: {
            id: 'sab-intruso-2024',
            type: 'article-journal',
            title: 'Metallurgical fatigue of titanium alloys in supersonic aerospace turbines',
            author: [{ family: 'Intruso', given: 'Carlos' }],
            issued: { 'date-parts': [[2024]] },
            'container-title': 'Aerospace Materials Journal',
            DOI: '10.1016/j.aero.2024.099',
          },
        },
      ],
    ]),
  };

  const texto = [
    'RESUMO',
    'Esta revisão sistemática avaliou o desempenho de estratégias digitais na rede assistencial (n=180), identificando adesão medicamentosa de 38,2% sob monitoramento contínuo via protocolo ZQWT.',
    'Palavras-chave: Telemonitoramento; Adesão Vacinal; Auditoria Forense; Atenção Primária.',
    '',
    'RESULTADOS',
    'Em coortes ambulatoriais de atenção primária, o agendamento estruturado elevou em 68,0% a adesão vacinal entre pacientes atendidas nas clínicas (n=320), demonstrando amplo impacto assistencial (MARTINS, 2024).',
    'O telemonitoramento anti-hipertensivo remoto reduziu drasticamente a mortalidade dos pacientes hipertensos em comparação ao grupo controle (NUNES, 2024).',
    'A implantação de registros eletrônicos padronizados reduziu em 25% a perda de doses vacinais na atenção primária (SILVA, 2023; INTRUSO, 2024).',
    'Conforme os dados consolidados na Tabela 1 (n=180), a adesão medicamentosa observada alcançou 34,5% no encerramento do seguimento clínico.',
    'Tabela 1 – Adesão terapêutica ajustada na atenção primária',
    'Fonte: Dados consolidados do estudo.',
    'Critérios de inclusão: estudos observacionais e ensaios clínicos indexados. Critérios de exclusão: relatos isolados. Conflito de interesses: Os autores declaram ausência de conflito de interesses. Financiamento: Recursos próprios.',
    '',
    'REFERÊNCIAS',
    'INTRUSO, C. Metallurgical fatigue of titanium alloys in supersonic aerospace turbines. Aerospace Materials Journal, v. 9, n. 2, p. 80-92, 2024. DOI: 10.1016/j.aero.2024.099.',
    'MARTINS, H. Structured recall scheduling and immunization adherence in outpatient clinics. Revista de Atenção Primária, v. 14, n. 1, p. 12-20, 2024. DOI: 10.1000/rap.2024.201.',
    'NUNES, R. Multicenter randomized trial of antihypertensive telemonitoring and mortality outcomes. Journal of Clinical Trials, v. 18, n. 3, p. 101-112, 2024. DOI: 10.1001/nli.2024.001.',
    'SILVA, M. Electronic immunization registries and vaccine cold-chain traceability in primary care. Revista de Saúde Pública, v. 57, n. 4, p. 200-210, 2023. DOI: 10.1590/rsp.2023.001.',
  ].join('\n');

  const res = await auditarManuscrito({
    texto,
    biblioteca: bib,
    buscarEBaixar: false,
    somenteLeitura: true,
    modulo: 'todos',
    xmlDocument: criarXmlTabelaDivergente(),
  });

  const capturouDivergenciaPercentual = (res.alertasGuardiaoSimbolico || []).some(
    (a) => a.codigo === 'DIVERGENCIA_NUMERICA_EXATA'
  );
  const capturouPolaridadeOuNli =
    (res.alertasGuardiaoSimbolico || []).some((a) => a.codigo === 'INVERSAO_POLARIDADE_NEGEX') ||
    (res.alertasNliContradicao || []).some((a) => a.codigo === 'CONTRADICAO_LOGICA_NLI');
  const capturouCitacaoMultiplaIntruso = (res.alertasCitacoesMultiplas || []).some(
    (a) => a.tipo === 'citacao_multipla_intruso' && a.obrasIntrusas?.some((x) => /INTRUSO/i.test(x))
  );
  const capturouSiglaSemDefinicao = (res.alertasIntraDocumento || []).some(
    (a) => a.codigo === 'SIGLA_SEM_DEFINICAO' && a.sigla === 'ZQWT'
  );
  const capturouDivergenciaTabelaXml = (res.alertasIntraDocumento || []).some(
    (a) => a.codigo === 'DIVERGENCIA_TABELA_XML'
  );
  const capturouDivergenciaResumo = (res.alertasIntraDocumento || []).some(
    (a) => a.codigo === 'DIVERGENCIA_RESUMO_RESULTADOS'
  );

  const checks = [
    { nome: 'Percentual alterado (DIVERGENCIA_NUMERICA_EXATA)', ok: capturouDivergenciaPercentual },
    { nome: 'Inversão de polaridade (NegEx / NLI)', ok: capturouPolaridadeOuNli },
    { nome: 'Citação múltipla com obra intrusa', ok: capturouCitacaoMultiplaIntruso },
    { nome: 'Sigla sem definição (ZQWT)', ok: capturouSiglaSemDefinicao },
    {
      nome: 'Divergência Resumo x Resultados & Tabela XML',
      ok: capturouDivergenciaTabelaXml && capturouDivergenciaResumo,
    },
  ];

  const falhasNaoCapturadas = checks.filter((c) => !c.ok);
  const capturadas = checks.length - falhasNaoCapturadas.length;
  const recallPct = Math.round((capturadas / checks.length) * 100);

  assert.strictEqual(
    falhasNaoCapturadas.length,
    0,
    `Recall esperado de 100% no Cenário Sabotado. Falhas não capturadas: ${JSON.stringify(falhasNaoCapturadas)} | Alertas recebidos: ${JSON.stringify(
      {
        guardiao: res.alertasGuardiaoSimbolico,
        nli: res.alertasNliContradicao,
        multi: res.alertasCitacoesMultiplas,
        intra: res.alertasIntraDocumento,
      },
      null,
      2
    )}`
  );

  // Qualquer alerta fora das 5 famílias esperadas (ex.: erro de citação/estilo espúrio) seria falso positivo
  const codigosConhecidos = new Set([
    'DIVERGENCIA_NUMERICA_EXATA',
    'INVERSAO_POLARIDADE_NEGEX',
    'CONTRADICAO_LOGICA_NLI',
    'SIGLA_SEM_DEFINICAO',
    'DIVERGENCIA_TABELA_XML',
    'DIVERGENCIA_RESUMO_RESULTADOS',
  ]);
  const falsosPositivos = (res.alertasPrecisao || []).filter(
    (a) =>
      a.tipo !== 'citacao_multipla_intruso' &&
      !codigosConhecidos.has(a.codigo)
  ).length;
  assert.strictEqual(
    falsosPositivos,
    0,
    `Cenário D não deve gerar falsos positivos fora das 5 sabotagens: ${JSON.stringify(res.alertasPrecisao)}`
  );

  return {
    cenario: 'd) Sabotado Multidomínio (5 falhas)',
    estiloDetectado: res.estiloBibliograficoDetectado,
    totalAlertas: contarTotalAlertasAtivos(res),
    falsosPositivos,
    recall: `${recallPct}% (${capturadas}/${checks.length})`,
  };
}

function imprimirTabelaBenchmark(resultados) {
  console.log('\n=========================================================================================================');
  console.log('🏆 BENCHMARK OURO MULTIDOMÍNIO — BIBLIOGRAFIA v1.2.0');
  console.log('=========================================================================================================');
  const rows = resultados.map((r) => ({
    Cenário: r.cenario,
    'Estilo Detectado': r.estiloDetectado,
    'Total de Alertas': r.totalAlertas,
    'Falsos Positivos': r.falsosPositivos,
    'Taxa de Detecção Real (Recall)': r.recall,
  }));
  console.table(rows);
}

async function main() {
  const resultados = [];
  resultados.push(await executarCenarioNatureVancouver());
  resultados.push(await executarCenarioAbntEngenharia());
  resultados.push(await executarCenarioJuridicoPtBr());
  resultados.push(await executarCenarioSabotadoMultidominio());
  imprimirTabelaBenchmark(resultados);
  console.log('✅ GOLDEN BENCHMARK CONCLUÍDO COM 100% DE PRECISÃO E RECALL!');
}

main().catch((err) => {
  console.error('❌ FALHA NO BENCHMARK OURO:', err);
  process.exit(1);
});
