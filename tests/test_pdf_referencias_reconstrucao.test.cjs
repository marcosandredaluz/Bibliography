/**
 * tests/test_pdf_referencias_reconstrucao.test.cjs
 *
 * Bateria de Testes Unitários (Calibração Geral Anti-Overfitting):
 * Valida reconstrução de texto PDF (DOIs hifenizados quebrados, números de página isolados,
 * anos com sufixo a/b), extração narrativa sem captura de orações anteriores,
 * múltiplas datas entre parênteses, títulos com reticências ABNT NBR 10520,
 * isenção de DOI/preprint/coeditora na NBR 6023, tabelas multipágina e estilometria.
 */
'use strict';

const assert = require('assert');
const auditor = require('../electron/auditor.cjs');
const abnt = require('../electron/abnt_nbr6023_auditor.cjs');
const ft = require('../electron/figuras_tabelas_auditor.cjs');
const est = require('../electron/estilometria_academica.cjs');
const clin = require('../electron/auditor_metodologico_clinico.cjs');

console.log('--- TESTANDO CALIBRAÇÃO GERAL DE RECONSTRUÇÃO PDF & REGRAS ABNT ---');

// 1. DOIs hifenizados quebrados, anos como início de linha e entradas com sufixo 2026a/2026b
{
  const manuscritoPdfSimulado = [
    '1 INTRODUÇÃO',
    '',
    'Na revisão sistemática de Carvalho et al. (2021), observaram-se ganhos expressivos.',
    'Em inquérito multicêntrico realizado nos Países Baixos, Mendonça et al. (2023) confirmaram a hipótese (Oliveira; Lima, 2024, 2025b).',
    'Conforme reportagem regional (Porto Alegre lança..., 2026), os registros avançaram.',
    'Os indicadores constam no Quadro 1 e na Figura 1.',
    '',
    '12',
    'Quadro 1: Indicadores operacionais de acompanhamento',
    'Indicador   Fórmula   Meta',
    'Resultados com',
    'laudo   Total de laudos ÷ exames × 100   90%',
    'Fonte: elaborado pelos autores (2026).',
    '',
    'Figura 1: Fluxo integrado do processo Fonte: elaborado pelos autores (2026).',
    '',
    'REFERÊNCIAS',
    '',
    '13',
    'CARVALHO, T. R. et al. Diagnostic workflows in primary care. Journal of Primary Diagnostics, v. 14,',
    '2021. DOI: https://doi.org/10.1186/s12880-',
    '021-00917-5.',
    '14',
    'MENDONÇA, F. L. et al. Patient access portals in clinical practice. International Medical Review, v. 8, n. 2,',
    'e223419, 2023. DOI: https://doi.org/10.1515/dx-',
    '2023-0044.',
    'OLIVEIRA, A. P.; LIMA, R. G. Guia prático de sistemas clínicos: parte I. Porto Alegre, RS: UFCSPA; ESP/RS, 2024. 20 p.',
    'OLIVEIRA, A. P.; LIMA, R. G. Guia prático de sistemas clínicos: parte II. Belo Horizonte, MG: UFMG; SES/MG, 2025b. 24 p.',
    'PORTO ALEGRE lança sistema digital de regulação ambulatorial. Correio Metropolitano, Porto Alegre, 5 nov. 2026. Disponível em: https://exemplo.org/noticias/portaria-gm/ms-n-',
    '99.101-de-2026. Acesso em: 10 nov. 2026.',
  ].join('\n');

  const seg = auditor.dividirCorpoEReferencias(manuscritoPdfSimulado);
  const refs = auditor.analisarLinhasReferencias(seg.linhasReferencias);
  const { citacoes } = auditor.extrairCitacoesDoCorpo(seg.paragrafosCorpo, refs);

  // Deve reconstruir exatamente 5 referências íntegras (sem fragmentos 2021., 021-00917-5., 99.101-de-2026)
  assert.strictEqual(refs.length, 5, `Esperadas 5 referências reconstruídas, obtidas: ${refs.length} (${refs.map(r => r.chave).join(', ')})`);

  const refCarvalho = refs.find((r) => r.chaveAutor === 'carvalho');
  assert(refCarvalho, 'Carvalho deve ser extraído com sucesso');
  assert.strictEqual(refCarvalho.doi, '10.1186/s12880-021-00917-5', 'DOI hifenizado quebrado deve ser recombinado');
  assert.strictEqual(refCarvalho.ano, '2021');

  const refMendonca = refs.find((r) => r.chaveAutor === 'mendonca');
  assert(refMendonca && refMendonca.doi === '10.1515/dx-2023-0044', 'DOI com espaço após hífen deve ser recombinado');

  const refOliveira24 = refs.find((r) => r.ano === '2024');
  const refOliveira25b = refs.find((r) => r.ano === '2025b');
  assert(refOliveira24 && refOliveira25b, 'Referências consecutivas do mesmo autor com sufixo 2025b devem permanecer separadas');

  const refTitulo = refs.find((r) => r.ano === '2026');
  assert(refTitulo && refTitulo.textoOriginal.includes('99.101-de-2026'), 'URL longa quebrada após hífen deve ser preservada');

  // Nenhuma citação deve capturar preposição narrativa anterior ("Na revisão sistemática de...", "Países Baixos,")
  const orfas = citacoes.filter(
    (c) => !refs.some((r) => r.chave === c.chave || ((r.ano === c.ano || r.anoBase === c.anoBase) && r.chavesAutorAlias.some((al) => c.chavesAutorAlias.includes(al))))
  );
  assert.strictEqual(orfas.length, 0, `Citações órfãs inesperadas: ${orfas.map((o) => `${o.chave} (${o.bruto})`).join(', ')}`);

  // Múltiplos anos (Oliveira; Lima, 2024, 2025b) devem gerar ambas as ocorrências
  assert(citacoes.some((c) => c.chave === 'oliveira:2024' || (c.ano === '2024' && c.chavesAutorAlias.includes('oliveira'))));
  assert(citacoes.some((c) => c.chave === 'oliveira:2025b' || (c.ano === '2025b' && c.chavesAutorAlias.includes('oliveira'))));

  // Figuras e Quadros (inclusive inline e com célula começando por "Resultados com")
  const resFt = ft.auditarFigurasETabelasDoManuscrito(seg.paragrafosCorpo);
  assert.strictEqual(resFt.totalElementos, 2, `Esperados Quadro 1 e Figura 1, obtidos ${resFt.totalElementos}`);
  assert.strictEqual(resFt.alertasFigurasTabelas.length, 0, 'Quadro 1 e Figura 1 com chamadas e fontes não devem gerar alertas');

  // Estilometria deve ignorar linhas tabulares e fórmulas
  const resEst = est.auditarEstilometriaDoManuscrito(seg.paragrafosCorpo);
  assert.strictEqual(resEst.totalAlertasEstilometricos, 0, 'Tabelas/fórmulas não devem disparar falso alerta estilométrico');

  console.log('✓ 1. Reconstrução de DOIs quebrados, anos isolados, sufixos a/b, narrativas e quadros validada.');
}

// 2. ABNT NBR 6023:2018 — DOI substitui "Disponível em / Acesso em", preprint dispensa paginação, coeditoras aceitas
{
  const refsAbntValidas = [
    {
      textoOriginal: 'CARVALHO, T. R. et al. Study of electronic records. BMC Health Research, v. 12, n. 3, p. 45-52, 2023. DOI: https://doi.org/10.1186/s12913-023-09123-1.',
      primeiroSobrenome: 'CARVALHO',
      ano: '2023',
    },
    {
      textoOriginal: 'FREITAS, M. A. et al. Ferramenta aberta de gestão em saúde. SciELO Preprints, 2026. Preprint. DOI: https://doi.org/10.1590/SciELOPreprints.99999.',
      primeiroSobrenome: 'FREITAS',
      ano: '2026',
    },
    {
      textoOriginal: 'OLIVEIRA, A. P. Guia prático de sistemas clínicos. Porto Alegre, RS: UFCSPA; ESP/RS, 2026a. 20 p.',
      primeiroSobrenome: 'OLIVEIRA',
      ano: '2026a',
    },
  ];
  const resAbnt = abnt.auditarCompletudeAbnt6023(refsAbntValidas);
  assert.strictEqual(
    resAbnt.totalInconformidadesAbnt,
    0,
    `Referências com DOI oficial, preprint ou coeditoras UF não devem gerar inconformidades ABNT 6023 (obtidos: ${resAbnt.alertasAbnt6023.map((a) => a.tipo).join(', ')})`
  );
  console.log('✓ 2. ABNT NBR 6023:2018 (isenção DOI, Preprint e Cidade, UF: Coeditora) validada.');
}

// 3. Metodologia Clínica: Projeto de Intervenção não deve disparar ausência de critérios de inclusão/exclusão STROBE/CONSORT
{
  const textoProjeto = `
    Trata-se de um projeto de intervenção e modelagem de dados aplicado à rede de atenção primária.
    Diagnóstico situacional identificou falhas de registro no prontuário eletrônico municipal.
    Conflito de interesses: os autores declaram não haver conflitos.
  `;
  const resClin = clin.auditarMetodologiaClinicaDoManuscrito([{ texto: textoProjeto, numParagrafo: 1 }], textoProjeto);
  assert.strictEqual(resClin.desenhoEstudo.tipo, 'projeto_intervencao');
  assert(
    !resClin.alertasMetodologicos.some((a) => a.tipo === 'ausencia_criterios_elegibilidade'),
    'Projeto de intervenção sem amostragem clínica não deve exigir critérios STROBE/CONSORT'
  );
  console.log('✓ 3. Auditoria metodológica isenta projeto de intervenção de critérios amostrais STROBE/CONSORT.');
}

console.log('\n🎉 TODOS OS TESTES DE CALIBRAÇÃO GERAL PDF & ABNT PASSARAM COM 100% DE SUCESSO!\n');
