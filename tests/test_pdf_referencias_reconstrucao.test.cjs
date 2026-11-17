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
const lener = require('../electron/lener_br_classifier.cjs');

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

// 4. Classificação LeNER-Br: Site Institucional com [2026] e Material Digital / Apostila de Curso (19 p.)
{
  const clsSite = lener.classificarReferenciaHarmonizada(
    'INSTITUTO DAS AÇÕES DIGITAIS. Institucional. Florianópolis: IAD, [2026]. Disponível em: https://exemplo.org.br/sobre/institucional. Acesso em: 17 nov. 2026.',
    null
  );
  assert.strictEqual(
    clsSite.natureza,
    'norma_livro_institucional',
    `Site institucional /sobre/institucional deve ser classificado como norma_livro_institucional (obtido: ${clsSite.natureza})`
  );

  const clsApostila = lener.classificarReferenciaHarmonizada(
    'ALMEIDA, R. T. de. Modelos analíticos aplicados à gestão. São Luís, MA: UFMA; SEIDIGI/MS, 2026. 19 p. Material digital elaborado para o Curso de Especialização em Saúde Digital.',
    null
  );
  assert.strictEqual(
    clsApostila.natureza,
    'norma_livro_institucional',
    `Apostila / Material digital com 19 p. e ', UF:' deve ser classificado como norma_livro_institucional (obtido: ${clsApostila.natureza})`
  );
  console.log('✓ 4. LeNER-Br classifica sites institucionais (/sobre/institucional) e apostilas de curso sem alucinação.');
}

// 5. Descritores DeCS/MeSH: Não confundir menção à palavra "palavras-chave" no texto do Resumo com a linha "Palavras-chave: ..."
{
  const textoResumoMaisPalavras = `
    RESUMO
    O presente estudo analisa a interoperabilidade clínica com base em descritores e palavras-chave representativas do tema. As bases foram consultadas entre 2020 e 2026.
    Palavras-chave: Registros Eletrônicos de Saúde; Atenção Primária à Saúde; Sistemas de Informação em Saúde; Interoperabilidade; Câncer de Mama.
  `;
  const resClinDesc = clin.auditarMetodologiaClinicaDoManuscrito(
    [{ texto: textoResumoMaisPalavras, numParagrafo: 1 }],
    textoResumoMaisPalavras
  );
  assert(
    !resClinDesc.alertasMetodologicos.some((a) => a.tipo === 'poucos_descritores'),
    `Não deve acusar poucos_descritores quando existem 5 descritores após 'Palavras-chave:' (alertas: ${resClinDesc.alertasMetodologicos.map((a) => a.tipo).join(', ')})`
  );
  console.log('✓ 5. Extração de descritores DeCS/MeSH ignora ocorrências proseadas antes de "Palavras-chave:".');
}

// 6. Mesmo autor + mesmo ano com coautores distintos + colisão cidade vs entrada pelo título + cláusula geográfica antes de vírgula
{
  const linhasRefs = [
    'PORTO ALEGRE (Município). Protocolo municipal de atenção primária. Porto Alegre: SMS, 2026.',
    'PORTO ALEGRE lança nova linha de cuidado digital para reduzir atrasos diagnósticos. Porto Alegre: SMS, 2026.',
    'PEREIRA NETO, G. C.; ANDRADE, R.; CASTRO, A. Integration among national systems. Rev Saúde Pública, v. 55, 2021.',
    'PEREIRA NETO, G. C.; CASTRO, A. Afinal, quantos sistemas existem na rede pública? Cadernos, v. 37, 2021.',
    'RODRIGUES, M. S. et al. Desempenho diagnóstico regional. Rev Epidemiol, 2021.',
    'OLIVEIRA, L.; SILVA, P.; SOUZA, R. Fluxos assistenciais na rede pública. Interface, 2024.',
  ];
  const refsFinais = auditor.analisarLinhasReferencias(linhasRefs);
  const parags = [
    { texto: 'Em uma microrregião de Minas Gerais, Rodrigues et al. (2021) apontaram barreiras locais.', numParagrafo: 1, numLinha: 1, secao: 'Introdução' },
    { texto: 'Na Bahia, Oliveira, Silva e Souza (2024) analisaram o acesso.', numParagrafo: 2, numLinha: 2, secao: 'Revisão' },
    { texto: 'Segundo Pereira Neto e Castro (2021), há dezenas de sistemas isolados.', numParagrafo: 3, numLinha: 3, secao: 'Resultados' },
    { texto: 'A integração ainda é incompleta (Pereira Neto; Andrade; Castro, 2021).', numParagrafo: 4, numLinha: 4, secao: 'Resultados' },
    { texto: 'O protocolo padronizou a coleta (Porto Alegre, 2026).', numParagrafo: 5, numLinha: 5, secao: 'Discussão' },
    { texto: 'A iniciativa ampliou o acesso regional (Porto Alegre lança..., 2026).', numParagrafo: 6, numLinha: 6, secao: 'Discussão' },
  ];
  const { citacoes } = auditor.extrairCitacoesDoCorpo(parags, refsFinais);

  assert.strictEqual(refsFinais[2].chaveAutor, 'pereiraneto', 'Sobrenome composto em CAIXA ALTA não deve perder a segunda palavra');
  assert.notStrictEqual(refsFinais[2].chave, refsFinais[3].chave, 'Duas obras do mesmo autor e ano devem receber chaves disambiguadas');
  assert.notStrictEqual(refsFinais[0].chave, refsFinais[1].chave, 'Cidade corporativa e manchete homônima devem receber chaves distintas');

  const chavesCitadas = new Set(citacoes.map((c) => c.chave));
  for (const r of refsFinais) {
    assert(chavesCitadas.has(r.chave), `Referência "${r.textoOriginal.slice(0, 45)}..." deveria ser pareada sem virar órfã ou sobrar!`);
  }
  assert(
    !citacoes.some((c) => /minas\s*gerais|bahia/i.test(c.autor)),
    `Topônimos pré-vírgula não devem permanecer capturados no nome do autor (autores: ${citacoes.map((c) => c.autor).join(' | ')})`
  );
  console.log('✓ 6. Mesmo autor+ano, cidade vs manchete e pré-vírgula geográfica pareados sem órfãs ou colisões.');
}

// 7. Estilometria: nomes próprios compostos em Caixa Alta/Mista e parágrafos curtos (3 frases) não geram falsos positivos
{
  const paragrafosEst = [
    {
      numParagrafo: 1,
      secao: 'Referencial',
      texto: 'A Rede Nacional de Dados em Saúde estabelece padrões. Atualmente, o Índice Nacional de Maturidade em Saúde Digital orienta continuamente as secretarias municipais de saúde na consolidação interoperável. Com isso, a Rede Nacional de Dados em Saúde e o Índice Nacional de Maturidade em Saúde Digital integram prontuários clínicos com governança tripartite permanente em todo território nacional.',
    },
    {
      numParagrafo: 2,
      secao: 'Arquitetura',
      texto: 'O primeiro endpoint recebe os dados estruturados do identificador do paciente após autenticação segura na camada local. O segundo módulo valida todos os atributos clínicos obrigatórios conforme o esquema JSON especificado pelo protocolo técnico. O terceiro serviço persiste imediatamente o registro normalizado na base relacional auditável sem bloquear outras requisições.',
    },
  ];
  const resEst = est.auditarEstilometriaDoManuscrito(paragrafosEst);
  assert(
    !resEst.alertasEstilometricos.some((a) => a.tipo === 'repeticao_trigramas_mecanica'),
    'Nomes oficiais de programas/redes em Title Case não devem acionar repeticao_trigramas_mecanica'
  );
  assert(
    !resEst.alertasEstilometricos.some((a) => a.tipo === 'monotonia_sintatica_estilometrica'),
    'Parágrafo técnico com apenas 3 frases uniformes (>= 40 palavras) não deve acionar monotonia sintática'
  );
  console.log('✓ 7. Estilometria ignora nomes oficiais Title Case e parágrafos curtos (< 4 frases).');
}

// 8. Verificação Semântica Bilíngue & Decomposição Atômica (termos de informática em saúde & controle)
{
  const artigoEn = 'Results demonstrated increased follow-up rates in the control group compared to outdated fragmented systems with underreporting and low accuracy.';
  assert(
    auditor.verificarCompatibilidadeBilingue(
      'Em razão da baixa acurácia e de dados desatualizados, as taxas de seguimento subiram no grupo controle em sistemas pouco integrados.',
      artigoEn
    ).compativel,
    'Equivalências PT↔EN de controle, acurácia e sistemas integrados/desatualizados devem validar compatibilidade'
  );
  console.log('✓ 8. Equivalências PT↔EN e guarda atômica validadas.');
}

console.log('\n🎉 TODOS OS TESTES DE CALIBRAÇÃO GERAL PDF & ABNT PASSARAM COM 100% DE SUCESSO!\n');
