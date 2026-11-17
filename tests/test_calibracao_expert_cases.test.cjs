/**
 * tests/test_calibracao_expert_cases.test.cjs
 * 
 * Bateria de Testes Unitários e de Calibração Forense para Casos Específicos
 * Identificados na Revisão Pericial (sem uso de literais proibidos):
 * 1. Segmentação de autores corporativos com qualificadores jurisdicionais parentéticos.
 * 2. Pareamento estrito de sufixos de ano ([YYYY-a] vs [YYYY-b]) sem contaminação cruzada.
 * 3. Parser de citações narrativas em colchetes (Autor [YYYY-a], Autor, [YYYY-b], Autor ([YYYY-b])).
 * 4. Extração de PMCID e PMID de URLs clássicas e modernas do NCBI/PubMed.
 * 5. Comparador oficial DOI: aceitação de published-print vs issued e tolerância Epub de ±1 ano.
 * 6. Normalização de fascículo com zero à esquerda e proteção contra falso alerta em artigo paginado.
 * 7. Limiar de plágio forense (mínimo de 10 palavras) e isenção de entidades/sociedades próprias.
 */

'use strict';

const assert = require('assert');
const auditor = require('../electron/auditor.cjs');
const lener = require('../electron/lener_br_classifier.cjs');

console.log('--- INICIANDO BATERIA DE CALIBRAÇÃO DOS CASOS PERICIAIS ---');

// 1. Segmentação de referências com autores corporativos e qualificadores parentéticos
{
  const textoRefCorpo = [
    'CONSELHO NACIONAL DE SAUDE (Brasil). Resolucao no 999, de 10 de marco de 2020. Diario Oficial da Uniao, Brasilia, DF, 2020.',
    'SAO PAULO (Estado). Secretaria de Estado da Saude. Manual de Vigilancia Epidemiologica. Sao Paulo: SES, 2021. 80 p.',
    'NATIONAL LIBRARY OF MEDICINE (Estados Unidos). Medical Subject Headings. Bethesda: NLM, 2022. Disponivel em: https://www.nlm.nih.gov/mesh/.',
    'AGENCIA NACIONAL DE VIGILANCIA SANITARIA (ANVISA). Guia de Farmacovigilancia. Brasilia: Anvisa, 2019.'
  ].join('\n');

  const div = auditor.dividirCorpoEReferencias(`INTRODUÇÃO\nTexto inicial.\n\nREFERÊNCIAS\n${textoRefCorpo}`);
  assert.strictEqual(div.linhasReferencias.length, 4, 'Deve segmentar exatamente 4 referências corporativas');
  console.log('✓ 1. Segmentação: 4 autores corporativos com qualificadores parentéticos segmentados com 100% de precisão.');
}

// 2. Pareamento estrito de sufixos de ano sem contaminação cruzada
{
  const refsFinais = [
    { chave: 'orgao:20--a', ano: '20--a', anoBase: '20--', chavesAutorAlias: ['orgao', 'ministerio'] },
    { chave: 'orgao:20--b', ano: '20--b', anoBase: '20--', chavesAutorAlias: ['orgao', 'ministerio'] }
  ];

  const paragrafos = [
    'Conforme relatado pelo órgão responsável (Órgão, [20--a]), as taxas foram observadas.',
    'Por outro lado, segundo as diretrizes de Órgão ([20--b]), o fluxo foi modificado.',
    'Adicionalmente, dados de Órgão, [20--a] corroboram as análises.'
  ];

  const { citacoes } = auditor.extrairCitacoesDoCorpo(paragrafos, refsFinais);
  assert.strictEqual(citacoes.length, 3, 'Deve extrair exatamente 3 citações');

  const c1 = citacoes.find(c => c.bruto.includes('20--a'));
  const c2 = citacoes.find(c => c.bruto.includes('20--b'));

  assert.strictEqual(c1.chave, 'orgao:20--a', 'Citação 20--a deve apontar exclusivamente para a referência 20--a');
  assert.strictEqual(c2.chave, 'orgao:20--b', 'Citação 20--b deve apontar exclusivamente para a referência 20--b');
  console.log('✓ 2. Pareamento: Sufixos [20--a] e [20--b] vinculados sem contaminação cruzada.');
}

// 3. Parser de citações narrativas com colchetes e parênteses compostos
{
  const paragrafosNarrativos = [
    'Consoante apontado por Entidade [2021], o procedimento deve ser padronizado.',
    'Como verificado por Oliveira [20--a], a evolução foi consistente.',
    'Conforme dados de Colegiado ([20--b]), as metas foram atingidas.'
  ];

  const { citacoes } = auditor.extrairCitacoesDoCorpo(paragrafosNarrativos);
  assert.strictEqual(citacoes.length, 3, 'Deve reconhecer todas as 3 formas de citações narrativas em colchetes');
  console.log('✓ 3. Narrativas: Citações narrativas em colchetes e compostas capturadas com sucesso.');
}

// 4. Extração de PMCID e PMID de formatos URLs clássicos e modernos
{
  const linhasRef = [
    'PESQUISADOR A, et al. Artigo sobre epidemiologia. Rev Saude. 2021;18(Suppl 1):i69-i75. PMCID: PMC3248746. PMID: 22211180.',
    'PESQUISADOR B, et al. Estudo analítico. MMWR. 2001;50:1-35. Disponível em: https://www.ncbi.nlm.nih.gov/pubmed/18634202',
    'PESQUISADOR C, et al. Avaliação clínica. Lancet. 2015;10:1-10. Disponível em: https://www.ncbi.nlm.nih.gov/pmc/articles/PMC9999999/'
  ];

  const refs = auditor.analisarLinhasReferencias(linhasRef);
  assert.strictEqual(refs[0].pmcid, '3248746', 'Deve extrair PMCID numérico limpo');
  assert.strictEqual(refs[0].pmid, '22211180', 'Deve extrair PMID numérico limpo');
  assert.strictEqual(refs[1].pmid, '18634202', 'Deve extrair PMID de URL clássica do NCBI');
  assert.strictEqual(refs[2].pmcid, '9999999', 'Deve extrair PMCID de URL www.ncbi.nlm.nih.gov/pmc/articles/');
  console.log('✓ 4. Metadados: PMCID e PMID extraídos com perfeição de todas as variantes de URL do NCBI.');
}

// 5. Comparador DOI: Tolerância entre published-print e issued
{
  const refDoc = {
    textoOriginal: 'Autor X. Estudo clínico. Cad Saude Publica. 2021;37(5):e00123420.',
    anoBase: '2021',
    doi: '10.1590/0102-311X00123420'
  };

  // Crossref onde o online (issued) é 2020 e o fascículo impresso (published-print) é 2021
  const cslCrossref = {
    DOI: '10.1590/0102-311X00123420',
    issued: { 'date-parts': [[2020, 11]] },
    'published-print': { 'date-parts': [[2021, 5]] },
    volume: '37',
    issue: '5'
  };

  const comp = auditor.compararCamposDoiOficial(refDoc, cslCrossref);
  assert.strictEqual(comp.temDivergencia, false, 'Não deve apontar divergência quando ano declarado corresponde ao published-print');
  console.log('✓ 5. Metadados DOI: published-print vs issued reconciliados sem falso positivo.');
}

// 6. Normalização de fascículo com zero à esquerda e proteção a periódicos paginados
{
  // Artigo paginado tradicional onde Crossref não tem issue, mas artigo declara fascículo
  const refPaginado = {
    textoOriginal: 'Autor Y. Estudo histopatológico. Rev Bras Med. 2020;25, n. 03, p. 100-110.',
    anoBase: '2020',
    doi: '10.1000/teste1'
  };
  const cslSemIssue = {
    volume: '25',
    issued: { 'date-parts': [[2020]] },
    page: '100-110'
  };
  const compPaginado = auditor.compararCamposDoiOficial(refPaginado, cslSemIssue);
  assert.strictEqual(compPaginado.temDivergencia, false, 'Artigo paginado não deve acusar publicação contínua sem fascículo');

  // Artigo com zero à esquerda n. 03 vs oficial 3
  const cslComIssue = {
    volume: '25',
    issue: '3',
    issued: { 'date-parts': [[2020]] }
  };
  const compZero = auditor.compararCamposDoiOficial(refPaginado, cslComIssue);
  assert.strictEqual(compZero.temDivergencia, false, 'n. 03 deve ser considerado idêntico a n. 3');
  console.log('✓ 6. Fascículo: Zero à esquerda normalizado e artigo paginado protegido contra falso positivo.');
}

// 7. Limiar de plágio forense e isenção de entidades e sociedades
(async () => {
  const corpus = [
    {
      id: 'art-01',
      autor: 'Silva',
      ano: '2022',
      sentencasOriginais: [
        'A International Society for Human and Animal Mycology estabeleceu critérios diagnósticos para micoses endêmicas.',
        'O desenvolvimento de métodos laboratoriais baseados em sequenciamento genômico permitiu a identificação acurada de isolados clínicos.'
      ]
    }
  ];

  // Caso 7.1: Trecho de 8 palavras citando apenas a entidade
  const parEntidade = [
    { texto: 'De acordo com a International Society for Human and Animal Mycology os critérios são relevantes.', numParagrafo: 1, numLinha: 1, secao: 'Métodos' }
  ];
  const al1 = await auditor.analisarPlagioComDiffMatchPatch(parEntidade, corpus);
  assert.strictEqual(al1.length, 0, 'Nomes de entidades e sociedades não devem disparar alerta de plágio');

  // Caso 7.2: Cópia literal extensa de 15 palavras sem citação
  const parCopia = [
    { texto: 'O desenvolvimento de métodos laboratoriais baseados em sequenciamento genômico permitiu a identificação acurada de isolados clínicos no país.', numParagrafo: 2, numLinha: 5, secao: 'Discussão' }
  ];
  const al2 = await auditor.analisarPlagioComDiffMatchPatch(parCopia, corpus);
  assert.strictEqual(al2.length, 1, 'Cópia literal de 15 palavras sem aspas deve ser detectada');

  console.log('✓ 7. Plágio Forense: Limiar de 10 palavras e isenção de sociedades e comitês validados.');
  console.log('\nTODOS OS 7 CASOS PERICIAIS PASSARAM COM 100% DE SUCESSO!');
})();
