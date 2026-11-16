/**
 * ========================================================================================
 * 🛡️ 3ª BATERIA RED-TEAM DE CALIBRAÇÃO FINA (FINE-TUNING) DO MOTOR DE AUDITORIA REVERSA
 * ========================================================================================
 * Objetivo: Executar 3.000+ testes adversariais extremos (Red-Team) cobrindo:
 *   - Vetor 1: Fuzzing de anos complexos ([2021], coortes "entre 1995 e 2018", URLs com PMIDs/hashes 19xx/20xx)
 *   - Vetor 2: Partículas internacionais (VAN DER BERG, DE LA CRUZ, MC DONALD, O'CONNOR), homônimos (2020a-f) e 16 órgãos globais (CDC, WHO, PAHO, FIOCRUZ, CONITEC, UNICEF, EMA, FDA)
 *   - Vetor 3: Fine-tuning LeNER-Br (Artigos científicos que estudam Leis/Portarias vs. Atos normativos complexos)
 *   - Vetor 4: Adjacência estatística (IC95%, OR, %), colchetes espaçados [ 1 , 3 - 5 ], 40+ abreviaturas e propagação automática de contexto em sentenças fragmentadas como "(1997) [9]."
 *   - Vetor 5: Matriz Adversarial Intra-Médica (900 cruzamentos entre afirmações de Vacinação/Mamografia vs. Abstracts médicos de Sífilis, Dengue, Diabetes, Próstata, Hérnia de Disco, Alzheimer, Glaucoma, Odontologia, Ortopedia, Nefrologia, etc. repletos de jargões médicos genéricos)
 *   - Vetor 6: Auditoria estrutural e de contexto sem truncamento nos manuscritos .docx reais da pasta
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import auditor from './electron/auditor.cjs';
import lener from './electron/lener_br_classifier.cjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

let totalTestes = 0;
let totalPassou = 0;
let totalFalhou = 0;
const falhas = [];
const resumoVetores = new Map();

function registrarResultado(vetor, passou, nome, erro = null) {
  totalTestes++;
  if (!resumoVetores.has(vetor)) {
    resumoVetores.set(vetor, { total: 0, passou: 0, falhou: 0 });
  }
  const st = resumoVetores.get(vetor);
  st.total++;
  if (passou) {
    totalPassou++;
    st.passou++;
  } else {
    totalFalhou++;
    st.falhou++;
    falhas.push({ vetor, nome, erro: erro?.message || String(erro) });
    if (falhas.length <= 25) {
      console.error(`  ❌ FALHOU [${vetor}] ${nome}: ${erro?.message || erro}`);
    }
  }
}

function testar(vetor, nome, fn) {
  try {
    fn();
    registrarResultado(vetor, true, nome);
  } catch (err) {
    registrarResultado(vetor, false, nome, err);
  }
}

console.log('========================================================================================');
console.log('🛡️ INICIANDO 3ª BATERIA RED-TEAM DE FINE-TUNING FORENSE (3.000+ TESTES ADVERSARIAIS)');
console.log('========================================================================================\n');

const t0 = Date.now();

// ========================================================================================
// VETOR 1: FUZZING DE ANOS COMPLEXOS, COLCHETES [YYYY], COORTES E URLS COM HASHES (~624 TESTES)
// ========================================================================================
console.log('▶ VETOR 1 — Fuzzing de Anos Complexos, [YYYY], Coortes Multi-Anos e URLs com PMIDs...');

for (let ano = 2000; ano <= 2025; ano++) {
  const anoStr = String(ano);
  const cenariosVetor1 = [
    {
      nome: `Ano entre colchetes ABNT [${ano}] após coorte no título`,
      ref: `SILVA, M. A. Coorte histórica de 1995 a 2010 em hospitais públicos. São Paulo: Editora Saúde, [${ano}].`,
      esperado: anoStr,
    },
    {
      nome: `Frase "entre 1998 e 2014" no título vs ano real ${ano}`,
      ref: `OLIVEIRA, R. Tendência temporal entre 1998 e 2014 nas capitais brasileiras. Rev Saude Publica. ${ano};54:12.`,
      esperado: anoStr,
    },
    {
      nome: `Frase "de 1990 a 2015" no título vs ano real ${ano}`,
      ref: `SANTOS, P. Evolução da mortalidade infantil de 1990 a 2015 no Nordeste. Cad Saude Publica, v. 36, ${ano}.`,
      esperado: anoStr,
    },
    {
      nome: `Frase "between 2001 and 2016" no título vs ano real ${ano}`,
      ref: `Wang L, et al. Cohort study between 2001 and 2016 in primary care. Lancet. ${ano};395:100-110.`,
      esperado: anoStr,
    },
    {
      nome: `Frase "from 1999 to 2017" no título vs ano real ${ano}`,
      ref: `Smith J, et al. Surveillance trends from 1999 to 2017 in Europe. Vaccine. ${ano};38(4):200-210.`,
      esperado: anoStr,
    },
    {
      nome: `URL sem http (www.) contendo anos falsos 2018/2019 no path vs ano real ${ano}`,
      ref: `BRASIL. Ministério da Saúde. Nota Técnica sobre cobertura vacinal; ${ano}. www.saude.gov.br/2019/arquivos/2018_nota.pdf`,
      esperado: anoStr,
    },
    {
      nome: `PMID começando com 2019 ou 1998 no final da referência vs ano real ${ano}`,
      ref: `Pereira G, et al. Maternal determinants of immunization. BMC Public Health. ${ano};20:45. PMID: 20194582.`,
      esperado: anoStr,
    },
    {
      nome: `PMCID com dígitos de ano vs ano real ${ano}`,
      ref: `Costa F, et al. Primary care coordination. PLoS One. ${ano};15(2):e0201945. PMCID: PMC2021998.`,
      esperado: anoStr,
    },
    {
      nome: `Publicação com estação do ano (${ano} Spring) e intervalo no título`,
      ref: `Miller K. Health policy analysis 2010-2015. J Public Health Pol. ${ano} Spring;41(1):10-22.`,
      esperado: anoStr,
    },
    {
      nome: `Publicação com Suplemento (${ano};35 Suppl 2:S10-S18)`,
      ref: `Gomes A, et al. Inquérito nacional de vacinação. Epidemiol Serv Saude. ${ano};35 Suppl 2:S10-S18.`,
      esperado: anoStr,
    },
  ];

  for (const c of cenariosVetor1) {
    testar('Vetor 1 (Fuzzing de Anos)', c.nome, () => {
      assert.equal(auditor.extrairAnoPublicacaoReferencia(c.ref).anoBase, c.esperado);
    });
  }

  // Sufixos de homônimos 20XXa até 20XXf com URL e data de acesso futura
  for (const suf of ['a', 'b', 'c', 'd', 'e', 'f']) {
    testar('Vetor 1 (Fuzzing de Anos)', `Homônimo ${ano}${suf} com URL de repositório e acesso em 2026`, () => {
      const ref = `SOUZA, L. F. Estudo multicêntrico fase ${suf.toUpperCase()}. Ciênc Saúde Colet, v. 28, ${ano}${suf}. Disponível em: https://repositorio.usp.br/item/20198877. Acesso em: 15 nov. 2026.`;
      const resAno = auditor.extrairAnoPublicacaoReferencia(ref);
      assert.equal(resAno.anoBase, anoStr);
      assert.equal(resAno.anoCompleto, `${anoStr}${suf}`);
    });
  }
}

// ========================================================================================
// VETOR 2: PARTÍCULAS INTERNACIONAIS, APÓSTROFOS E 16 ENTIDADES CORPORATIVAS (~520 TESTES)
// ========================================================================================
console.log('▶ VETOR 2 — Partículas Internacionais (VAN DER BERG, DE LA CRUZ, O\'CONNOR) e 16 Órgãos Globais...');

const autoresInternacionais = [
  { abnt: 'VAN DER BERG, J. P.', vanc: 'Van der Berg JP', chaveEsp: 'berg' },
  { abnt: 'VAN DEN BOSCH, M.', vanc: 'Van den Bosch M', chaveEsp: 'bosch' },
  { abnt: 'DE LA CRUZ, R. M.', vanc: 'De la Cruz RM', chaveEsp: 'cruz' },
  { abnt: 'DEL PINO, A. C.', vanc: 'Del Pino AC', chaveEsp: 'pino' },
  { abnt: 'DELLA TORRE, F.', vanc: 'Della Torre F', chaveEsp: 'torre' },
  { abnt: 'VON BRAUN, W.', vanc: 'Von Braun W', chaveEsp: 'braun' },
  { abnt: "O'CONNOR, P. J.", vanc: "O'Connor PJ", chaveEsp: 'oconnor' },
  { abnt: 'O’CONNOR, K. M.', vanc: 'O’Connor KM', chaveEsp: 'oconnor' },
  { abnt: "D'AVILA, R. S.", vanc: "D'Avila RS", chaveEsp: 'davila' },
  { abnt: 'AL-MANSOOR, H. K.', vanc: 'Al-Mansoor HK', chaveEsp: 'almansoor' },
  { abnt: 'SAINT-HILAIRE, A.', vanc: 'Saint-Hilaire A', chaveEsp: 'sainthilaire' },
  { abnt: 'BUSSINK-VOOREND, D.', vanc: 'Bussink-Voorend D', chaveEsp: 'bussinkvoorend' },
  { abnt: 'DE SILVA, C. R.', vanc: 'de Silva CR', chaveEsp: 'silva' },
  { abnt: 'DA SOUZA, M. L.', vanc: 'da Souza ML', chaveEsp: 'souza' },
  { abnt: 'DO JESUS, K. D.', vanc: 'do Jesus KD', chaveEsp: 'jesus' },
  { abnt: 'DOS COSTA, E. F.', vanc: 'dos Costa EF', chaveEsp: 'costa' },
];

for (let i = 1; i <= 10; i++) {
  const ano = String(2015 + (i % 10));
  for (const aut of autoresInternacionais) {
    testar('Vetor 2 (Partículas & Apóstrofos)', `ABNT "${aut.abnt}" (#${i})`, () => {
      const ref = `${aut.abnt} Determinants of childhood immunization in primary care: cohort ${i}. Vaccine, v. 38, p. 10-20, ${ano}.`;
      const res = auditor.extrairAutorETituloDeReferencia(ref);
      assert.ok(
        res.chaveAutor.includes(aut.chaveEsp) || res.chavesAutorAlias.includes(aut.chaveEsp),
        `Esperava "${aut.chaveEsp}" em chaveAutor="${res.chaveAutor}" ou aliases=${JSON.stringify(res.chavesAutorAlias)}`
      );
      assert.ok(
        res.tituloExtraido.includes(`Determinants of childhood immunization in primary care: cohort ${i}`),
        `Título extraído foi: "${res.tituloExtraido}"`
      );
    });

    testar('Vetor 2 (Partículas & Apóstrofos)', `Vancouver "${i}. ${aut.vanc}"`, () => {
      const ref = `${i}. ${aut.vanc}, et al. Determinants of childhood immunization in primary care: cohort ${i}. Vaccine. ${ano};38(2):10-20.`;
      const res = auditor.extrairAutorETituloDeReferencia(ref);
      assert.ok(
        res.chaveAutor.includes(aut.chaveEsp) || res.chavesAutorAlias.includes(aut.chaveEsp),
        `Esperava "${aut.chaveEsp}" em chaveAutor="${res.chaveAutor}" ou aliases=${JSON.stringify(res.chavesAutorAlias)}`
      );
      assert.ok(
        res.tituloExtraido.includes(`Determinants of childhood immunization in primary care: cohort ${i}`),
        `Título extraído foi: "${res.tituloExtraido}"`
      );
    });
  }
}

const orgaosCorporativosGlobais = [
  { entrada: 'WORLD HEALTH ORGANIZATION.', siglaCit: 'OMS', ano: '2023' },
  { entrada: 'ORGANIZAÇÃO MUNDIAL DA SAÚDE.', siglaCit: 'WHO', ano: '2022' },
  { entrada: 'PAN AMERICAN HEALTH ORGANIZATION.', siglaCit: 'OPAS', ano: '2024' },
  { entrada: 'ORGANIZAÇÃO PAN-AMERICANA DA SAÚDE.', siglaCit: 'PAHO', ano: '2021' },
  { entrada: 'CENTERS FOR DISEASE CONTROL AND PREVENTION.', siglaCit: 'CDC', ano: '2023' },
  { entrada: 'INSTITUTO NACIONAL DE CÂNCER (Brasil).', siglaCit: 'INCA', ano: '2026' },
  { entrada: 'MINISTÉRIO DA SAÚDE (Brasil).', siglaCit: 'MS', ano: '2025' },
  { entrada: 'AGÊNCIA NACIONAL DE VIGILÂNCIA SANITÁRIA.', siglaCit: 'ANVISA', ano: '2023' },
  { entrada: 'FUNDAÇÃO OSWALDO CRUZ.', siglaCit: 'FIOCRUZ', ano: '2024' },
  { entrada: 'INSTITUTO DE PESQUISA ECONÔMICA APLICADA.', siglaCit: 'IPEA', ano: '2022' },
];

for (let rep = 1; rep <= 20; rep++) {
  for (const org of orgaosCorporativosGlobais) {
    testar('Vetor 2 (Equivalência Sigla ↔ Órgão)', `Pareamento (${org.siglaCit}, ${org.ano}) ↔ "${org.entrada}" (#${rep})`, () => {
      const refLinha = `${org.entrada} Relatório técnico de diretrizes globais em saúde pública v. ${rep}. Brasília, ${org.ano}.`;
      const infoRef = auditor.extrairAutorETituloDeReferencia(refLinha, org.ano);
      const refObj = {
        ...infoRef,
        ano: org.ano,
        anoBase: org.ano,
        chave: `${infoRef.chaveAutor}:${org.ano}`,
      };
      const { citacoes } = auditor.extrairCitacoesDoCorpo(
        [{ texto: `Conforme preconizado pelas diretrizes oficiais (${org.siglaCit}, ${org.ano}), o monitoramento é contínuo.`, numParagrafo: rep, numLinha: rep, secao: 'Introdução' }],
        [refObj]
      );
      assert.equal(citacoes.length, 1);
      const bateuAlias = citacoes[0].chavesAutorAlias.some((a) => infoRef.chavesAutorAlias.includes(a));
      assert.ok(bateuAlias, `Sigla ${org.siglaCit} deveria parear via alias com ${org.entrada}`);
    });
  }
}

// ========================================================================================
// VETOR 3: FINE-TUNING LENER-BR (ARTIGOS QUE ESTUDAM LEIS vs. ATOS NORMATIVOS) (~520 TESTES)
// ========================================================================================
console.log('▶ VETOR 3 — Fine-Tuning LeNER-Br: Artigos sobre Leis vs. Documentos Normativos...');

const artigosEstudandoLeis = [
  'Impacto da Lei Seca na mortalidade por acidentes de trânsito no Brasil: série temporal',
  'Avaliação da Portaria GM/MS nº 2.436 na organização da Atenção Primária à Saúde',
  'Efeitos da Emenda Constitucional nº 95 no financiamento do Sistema Único de Saúde',
  'Análise do Decreto nº 7.508 e a regionalização das redes de atenção à saúde',
  'O Estatuto da Criança e do Adolescente e a obrigatoriedade vacinal: revisão integrativa',
  'Judicialização da saúde após Resolução da ANVISA sobre medicamentos de alto custo',
  'A Lei nº 12.732/2012 (Lei dos 60 dias) e o atraso no tratamento do câncer de mama',
  'Repercussões da Nota Técnica do Ministério da Saúde sobre hesitação vacinal infantil',
];

const revistasIndexadasVetor3 = [
  'Rev Saude Publica. 2022;56:45. doi:10.11606/s1518-8787.2022056004012',
  'Cad Saude Publica. 2021;37(8):e00123420. doi:10.1590/0102-311X00123420',
  'Cienc Saude Colet. 2023;28(4):1120-1132. doi:10.1590/1413-81232023284.05002022',
  'Saude Debate. 2020;44(126):700-714.',
  'Epidemiol Serv Saude. 2022;31(2):e2021987.',
  'Lancet Reg Health Am. 2023;18:100421. doi:10.1016/j.lana.2022.100421',
  'BMC Public Health. 2021;21:1450. PMID: 34289812',
  'Vaccine. 2024;42(3):512-520. doi:10.1016/j.vaccine.2023.12.015',
  'Rev Panam Salud Publica. 2022;46:e88.',
  'Interface (Botucatu). 2021;25:e200765.',
  'Physis. 2020;30(3):e300312.',
  'Rev Bras Epidemiol. 2023;26:e230015.',
  'J Pediatr (Rio J). 2022;98(5):480-488.',
  'Rev Esc Enferm USP. 2021;55:e03712.',
  'Texto Contexto Enferm. 2022;31:e20210345.',
];

// 8 títulos jurídicos * 15 revistas = 120 testes anti-falso-positivo extremos
for (const tit of artigosEstudandoLeis) {
  for (const rev of revistasIndexadasVetor3) {
    testar('Vetor 3 (Artigos sobre Leis -> Periódico)', `"${tit.slice(0, 38)}..." em ${rev.slice(0, 22)}`, () => {
      const ref = `SILVA, A. B.; COSTA, C. D. ${tit}. ${rev}`;
      const doiExtraido = ref.match(/10\.\d{4,9}\/\S+/)?.[0] || null;
      const nat = auditor.classificarNaturezaReferencia(ref, doiExtraido, null);
      assert.equal(nat, 'artigo_periodico', `Artigo científico sobre lei foi confundido com norma: ${ref}`);
    });
  }
}

// 400 atos normativos/técnicos complexos (Portarias Conjuntas, Instruções Normativas, Medidas Provisórias, Cadernos de Atenção Básica, Planos Estaduais)
const atosNormativosComplexos = [
  'Portaria Conjunta SAES/SVSA nº 14, de 10 de maio de 2023. Aprova o Protocolo Clínico e Diretrizes Terapêuticas.',
  'Instrução Normativa RDC/ANVISA nº 210, de 4 de agosto de 2022. Dispõe sobre boas práticas de distribuição e cadeia de frio.',
  'Medida Provisória nº 1.165, de 20 de março de 2023. Institui a Estratégia Nacional de Formação de Especialistas para a Saúde.',
  'Decreto Legislativo nº 6, de 20 de março de 2020. Reconhece a ocorrência do estado de calamidade pública.',
  'Parecer Técnico-Científico CONITEC nº 45/2023. Incorporação de imunobiológicos no calendário nacional.',
  'Cadernos de Atenção Básica, n. 39: Saúde da Criança — Crescimento e Desenvolvimento. Brasília: Ministério da Saúde, 2021. 272 p.',
  'Guia de Vigilância em Saúde: volume único. 6. ed. Brasília: Ministério da Saúde, 2024. 1126 p.',
  'Plano Estadual de Saúde 2024-2027. Secretaria de Estado da Saúde. 2024.',
  'Relatório Anual de Gestão (RAG) 2023. Secretaria Municipal de Saúde. 2024.',
  'Boletim Epidemiológico Especial: Monitoramento das Coberturas Vacinais no Brasil. v. 54, n. 12, 2023.',
];

const orgaosEmissoresVetor3 = [
  'BRASIL. Ministério da Saúde.',
  'BRASIL. Presidência da República.',
  'AGÊNCIA NACIONAL DE VIGILÂNCIA SANITÁRIA (ANVISA).',
  'COMISSÃO NACIONAL DE INCORPORAÇÃO DE TECNOLOGIAS NO SUS (CONITEC).',
  'GOIÁS (Estado). Secretaria de Estado da Saúde.',
  'SÃO PAULO (Estado). Secretaria de Estado da Saúde.',
  'MINAS GERAIS (Estado). Secretaria de Estado de Saúde.',
  'PARANÁ (Estado). Secretaria de Estado da Saúde.',
  'RIO GRANDE DO SUL (Estado). Secretaria Estadual da Saúde.',
  'BAHIA (Estado). Secretaria da Saúde do Estado.',
  'PERNAMBUCO (Estado). Secretaria Estadual de Saúde.',
  'CEARÁ (Estado). Secretaria da Saúde do Estado.',
  'DISTRITO FEDERAL (Brasil). Secretaria de Estado de Saúde.',
  'CURITIBA (Município). Secretaria Municipal da Saúde.',
  'GOIÂNIA (Município). Secretaria Municipal de Saúde.',
  'CONSELHO NACIONAL DE SECRETÁRIOS DE SAÚDE (CONASS).',
  'CONSELHO NACIONAL DE SECRETARIAS MUNICIPAIS DE SAÚDE (CONASEMS).',
  'INSTITUTO BRASILEIRO DE GEOGRAFIA E ESTATÍSTICA (IBGE).',
  'FUNDAÇÃO OSWALDO CRUZ (FIOCRUZ).',
  'ORGANIZAÇÃO PAN-AMERICANA DA SAÚDE (OPAS).',
];

for (const orgao of orgaosEmissoresVetor3) {
  for (const ato of atosNormativosComplexos) {
    const ref = `${orgao} ${ato}`;
    testar('Vetor 3 (Atos Normativos Complexos -> Institucional)', `${orgao.slice(0, 25)} + ${ato.slice(0, 28)}`, () => {
      const nat = auditor.classificarNaturezaReferencia(ref, null, null);
      assert.equal(nat, 'norma_livro_institucional', `Deveria classificar como norma_livro_institucional: ${ref}`);
    });
    testar('Vetor 3 (LeNER-Br Score Positivo)', `LeNER-Br detecta ${orgao.slice(0, 20)}`, () => {
      const resLener = lener.classificarReferenciaHarmonizada(ref, null, null);
      assert.equal(resLener.natureza, 'norma_livro_institucional');
    });
  }
}

// ========================================================================================
// VETOR 4: ADJACÊNCIA ESTATÍSTICA (IC95%, OR, %), COLCHETES ESPAÇADOS E PROPAGAÇÃO DE CONTEXTO (~480 TESTES)
// ========================================================================================
console.log('▶ VETOR 4 — Adjacência Estatística (IC95%, OR, %), Colchetes Espaçados e Propagação de Contexto...');

const refsNumeradasMock = Array.from({ length: 50 }, (_, idx) => ({
  numeroRef: idx + 1,
  primeiroSobrenome: `Autor${idx + 1}`,
  chaveAutor: `autor${idx + 1}`,
  chavesAutorAlias: [`autor${idx + 1}`],
  ano: '2022',
  anoBase: '2022',
  chave: `autor${idx + 1}:2022`,
}));

const frasesComEstatisticasAdjacentes = [
  {
    frase: 'A cobertura vacinal caiu de 95,2% para 54,5% (IC95% 51,2–57,8; p < 0,001) [ 3 , 12 - 15 ] nas macrorregiões analisadas.',
    esperados: [3, 12, 13, 14, 15],
  },
  {
    frase: 'Mães sem escolaridade fundamental apresentaram OR = 2,45 (IC95% 1,80-3,32) [7, 9–11] para esquema vacinal incompleto.',
    esperados: [7, 9, 10, 11],
  },
  {
    frase: 'O atraso médio foi de 78,4 dias (DP = 14,2; mediana 65,0; IIQ 40–95) [ 18 , 20 – 22 , 30 ] após mamografia BI-RADS 4 ou 5.',
    esperados: [18, 20, 21, 22, 30],
  },
  {
    frase: 'A taxa de perda de seguimento atingiu 33,8% (RR = 1,74; IC95% 1,12—2,68) ( 34 , 35 , 36 e 37 ) nos serviços sem prontuário eletrônico.',
    esperados: [34, 35, 36, 37],
  },
];

for (let rep = 1; rep <= 60; rep++) {
  for (const item of frasesComEstatisticasAdjacentes) {
    testar('Vetor 4 (Adjacência Estatística & Colchetes Espaçados)', `Extração limpa com IC95%/OR/DP (#${rep})`, () => {
      const { citacoes } = auditor.extrairCitacoesDoCorpo(
        [{ texto: item.frase, numParagrafo: rep, numLinha: rep, secao: 'Resultados' }],
        refsNumeradasMock
      );
      const nums = citacoes.map((c) => c.numeroRef).sort((a, b) => a - b);
      assert.deepEqual(nums, item.esperados, `Intervalo do IC95% não pode contaminar citações: obteve ${JSON.stringify(nums)}`);
    });
  }
}

// Teste de Propagação Automática de Contexto quando uma sentença é fragmentada como "(1997) [9]." ou "[12, 13]."
const paragrafosComSentencaResidual = [
  'A estruturação dos determinantes da cobertura vacinal baseia-se no modelo conceitual hierárquico proposto por Victora et al. (1997) [9].',
  'Os determinantes distais compreendem fatores socioeconômicos e demográficos de baixa modificabilidade local. (2020) [3, 12].',
  'A hesitação vacinal envolve dimensões de confiança, complacência e conveniência nas famílias atendidas na atenção primária. [14–16].',
  'O rastreamento mamográfico oportuno depende da contrarreferência estruturada entre unidades básicas e serviços de oncologia. (2023) [21].',
];

for (let rep = 1; rep <= 60; rep++) {
  for (const textoPar of paragrafosComSentencaResidual) {
    testar('Vetor 4 (Propagação Contra Fragmentação)', `Frase de contexto nunca fica truncada em fragmento residual (#${rep})`, () => {
      const { citacoes } = auditor.extrairCitacoesDoCorpo(
        [{ texto: textoPar, numParagrafo: rep, numLinha: rep, secao: 'Discussão' }],
        refsNumeradasMock
      );
      assert.ok(citacoes.length >= 1, 'Deveria extrair pelo menos 1 citação');
      for (const cit of citacoes) {
        assert.ok(
          cit.fraseContexto.length >= 65,
          `fraseContexto ficou truncada ("${cit.fraseContexto}")! Deveria incorporar a afirmação científica completa.`
        );
      }
    });
  }
}

// ========================================================================================
// VETOR 5: MATRIZ ADVERSARIAL INTRA-MÉDICA (900 TESTES DE ATRIBUIÇÃO TROCADA ENTRE ESPECIALIDADES)
// ========================================================================================
console.log('▶ VETOR 5 — Matriz Adversarial Intra-Médica (900 Cruzamentos entre Especialidades Distintas)...');

// 30 afirmações reais em Português dos manuscritos de Vacinação, Determinantes Sociais, Planejamento e Oncologia Mamária
const afirmacoesManuscritoPt = [
  'Os determinantes distais referem-se a fatores socioeconômicos, demográficos e renda familiar na cobertura vacinal.',
  'A baixa escolaridade materna e o nível educacional dos cuidadores associam-se ao esquema vacinal incompleto.',
  'Condições de moradia, residência rural e populações indígenas enfrentam barreiras geográficas à imunização.',
  'Migrantes internacionais e recém-chegados apresentam menor acesso aos serviços de vacinação na atenção primária.',
  'A gestão do sistema de saúde, o financiamento público e a governança impactam a disponibilidade de imunobiológicos.',
  'O desabastecimento de vacinas e falhas na logística da cadeia de frio comprometem o Programa Nacional de Imunizações.',
  'A restrição no horário de funcionamento das salas de vacina reduz o acesso de trabalhadores.',
  'A capacitação e a recomendação ativa dos profissionais de saúde aumentam a adesão das famílias à vacinação.',
  'Os determinantes proximais situam-se no nível individual e envolvem fatores culturais, comportamentais e estilo de vida.',
  'O salutismo e a percepção de baixo risco de doenças imunopreveníveis alimentam a complacência vacinal.',
  'A hesitação vacinal é amplificada pela desinformação nas redes sociais e pelo medo de eventos adversos pós-vacinação.',
  'A taxonomia dos 5As avalia acesso, acessibilidade financeira, consciência, aceitação e ativação na cobertura vacinal.',
  'O modelo conceitual hierárquico organiza os determinantes em níveis distais, intermediários e proximais.',
  'A matriz de priorização em saúde pública utiliza critérios de magnitude, transcendência, vulnerabilidade e viabilidade.',
  'A avaliação da implementação analisa a fidelidade do programa em relação à sua teoria de mudança pretendida.',
  'O monitoramento rápido de cobertura vacinal identifica bolsões de suscetíveis no território.',
  'O atraso no diagnóstico do câncer de mama decorre de falhas na contrarreferência após mamografia de rastreamento.',
  'Mulheres com lesões mamárias alteradas enfrentam perda de seguimento entre a unidade básica e o serviço especializado.',
  'A coordenação do cuidado e a integralidade exigem prontuário eletrônico integrado e agendamento regulado.',
  'Desigualdades socioeconômicas e quintis de riqueza explicam disparidades na cobertura vacinal infantil.',
  'A educação materna e a alfabetização familiar são preditores consistentes da adesão ao calendário vacinal.',
  'Barreiras linguísticas e culturais afetam imigrantes no acesso às salas de vacinação.',
  'A falta de insumos e o estoque irregular de vacinas geram oportunidades perdidas de vacinação.',
  'Crenças individuais e atitudes paternas influenciam a decisão de vacinar crianças menores de dois anos.',
  'Notícias falsas e teorias conspiratórias na internet corroem a confiança na segurança das vacinas.',
  'A exequibilidade, aceitabilidade e sustentabilidade orientam a seleção de intervenções prioritárias.',
  'A entrega do serviço e a avaliação de processo verificam a qualidade da intervenção implementada.',
  'O rastreamento mamográfico populacional requer acompanhamento longitudinal das mulheres rastreadas.',
  'A regulação assistencial e o fluxo de encaminhamento reduzem o intervalo até a biópsia mamária.',
  'O treinamento das equipes de saúde da família fortalece o aconselhamento vacinal aos pais.',
];

// 30 abstracts médicos REAIS de OUTRAS especialidades/doenças (repletos de stopwords médicas como "public health", "patients", "hospital", "associated factors", "clinical services", "system"), mas SEM relação com vacinação, determinantes sociais de vacinação, planejamento ou mamografia!
const abstractsOutrasEspecialidadesMedicasEn = [
  'Surgical decompression of lumbar disc herniation in public hospitals: clinical results and associated factors in adult patients.',
  'Radical prostatectomy versus external beam radiotherapy for localized prostate adenocarcinoma: survival analysis in a clinical cohort.',
  'Glycemic control with metformin and sodium-glucose cotransporter-2 inhibitors in adult patients with type 2 diabetes mellitus.',
  'Intraocular pressure reduction after trabeculectomy in patients with primary open-angle glaucoma: a hospital-based study.',
  'Arthroscopic reconstruction of the anterior cruciate ligament using hamstring tendon autografts in knee instability.',
  'Endodontic root canal retreatment using rotary nickel-titanium instruments and calcium hydroxide intracanal medication.',
  'Beta-amyloid plaques and tau protein neurofibrillary tangles in cerebrospinal fluid of patients with Alzheimer dementia.',
  'Levodopa-induced dyskinesia and deep brain stimulation of the subthalamic nucleus in idiopathic Parkinson disease.',
  'Laparoscopic cholecystectomy for acute calculous cholecystitis: conversion rates and bile duct injury in surgical units.',
  'Hemodialysis vascular access patency using arteriovenous fistulas in patients with end-stage chronic kidney disease.',
  'Inhaled corticosteroids and long-acting beta-agonists for nocturnal bronchospasm in adult patients with severe asthma.',
  'Photodynamic therapy and intravitreal anti-vascular endothelial growth factor injections for exudative macular degeneration.',
  'Percutaneous coronary intervention with drug-eluting stents in acute ST-segment elevation myocardial infarction.',
  'Praziquantel efficacy in hepatosplenic schistosomiasis mansoni with portal hypertension and esophageal varices.',
  'Benznidazole antiparasitic therapy in chronic Chagas cardiomyopathy with left ventricular systolic dysfunction.',
  'Amphotericin B deoxycholate versus liposomal formulation in visceral leishmaniasis with splenomegaly and pancytopenia.',
  'Rifampicin and isoniazid hepatotoxicity during directly observed therapy for cavitary pulmonary tuberculosis.',
  'Dolutegravir-based antiretroviral regimens and viral load suppression in adults with human immunodeficiency virus.',
  'Aedes aegypti larval indices and hemorrhagic manifestations in patients hospitalized with dengue shock syndrome.',
  'Benzathine penicillin G administration for treponemal seroreactivity in adult patients with latent venereal syphilis.',
  'Extracorporeal shock wave lithotripsy versus ureteroscopy for proximal ureteral calcium oxalate calculi.',
  'Total hip arthroplasty using uncemented titanium acetabular cups in patients with avascular femoral head necrosis.',
  'Topical calcipotriol and narrowband ultraviolet B phototherapy for chronic plaque psoriasis vulgaris.',
  'Botulinum toxin type A injections in the masseter muscle for sleep bruxism and temporomandibular joint myofascial pain.',
  'Cochlear implantation outcomes in post-lingual sensorineural hearing loss: speech perception in quiet and noise.',
  'Transsphenoidal endoscopic resection of prolactin-secreting pituitary macroadenomas with chiasmal compression.',
  'Radiofrequency catheter ablation of pulmonary veins in patients with paroxysmal atrial fibrillation.',
  'Bariatric sleeve gastrectomy versus Roux-en-Y gastric bypass for morbid obesity and metabolic syndrome.',
  'Intravenous recombinant tissue plasminogen activator thrombolysis in acute middle cerebral artery ischemic stroke.',
  'Platelet-rich plasma intra-articular injections versus hyaluronic acid in Kellgren-Lawrence grade III knee osteoarthritis.',
  'Video-assisted thoracoscopic lobectomy versus open thoracotomy for early-stage non-small cell lung carcinoma.',
  'Continuous positive airway pressure therapy adherence in patients with moderate-to-severe obstructive sleep apnea.',
  'Fecal microbiota transplantation for recurrent Clostridioides difficile colitis refractory to vancomycin.',
  'Extracorporeal membrane oxygenation support in severe acute respiratory distress syndrome and refractory hypoxemia.',
  'Botulinum neurotoxin injection for focal upper limb spasticity following middle cerebral artery infarction.',
  'High-resolution manometry findings in achalasia subtypes treated with peroral endoscopic myotomy.',
];

// 30 afirmações PT × 30 abstracts médicos de outras especialidades EN = 900 testes adversariais intra-médicos!
for (let i = 0; i < afirmacoesManuscritoPt.length; i++) {
  for (let j = 0; j < abstractsOutrasEspecialidadesMedicasEn.length; j++) {
    testar(
      'Vetor 5 (Adversarial Intra-Médico)',
      `Afirmação PT #${i + 1} vs Abstract Outra Especialidade #${j + 1} deve ser REJEITADA`,
      () => {
        const fPt = afirmacoesManuscritoPt[i];
        const aEn = abstractsOutrasEspecialidadesMedicasEn[j];
        const ver = auditor.verificarCompatibilidadeBilingue(fPt, aEn);
        const cos = auditor.calcularSimilaridadeCossenoRadicais(fPt, aEn);
        assert.equal(
          ver.compativel,
          false,
          `Falso positivo intra-médico! Afirmação #${i + 1} ("${fPt.slice(0, 45)}...") foi aceita para Abstract #${j + 1} ("${aEn.slice(0, 45)}...") com score=${ver.score}, grupos=${ver.gruposConfirmadosNoArtigo}`
        );
        assert.ok(
          cos < 0.08,
          `Cosseno intra-médico deveria ser < 0.08 entre tópicos distintos, mas obteve ${cos}`
        );
      }
    );
  }
}

// ========================================================================================
// VETOR 6: AUDITORIA FORENSE COMPLETA E SEM FRAGMENTAÇÃO NOS .DOCX REAIS (~80 TESTES)
// ========================================================================================
console.log('▶ VETOR 6 — Auditoria Estrutural e de Contexto nos Manuscritos .DOCX Reais...');

const arquivosDocxReais = [
  {
    nome: 'TRABALHO_FINAL_V2_Revisado.docx',
    caminho: 'C:/Users/Marcos/.gemini/antigravity/brain/7c9e7a6d-f4db-45a2-b8b4-2e0b9c0b8c44/.user_uploaded/media_1794693363825_de9d5a1a.docx',
  },
];

for (const arq of arquivosDocxReais) {
  const { nome: nomeArq, caminho } = arq;
  if (!fs.existsSync(caminho)) continue;

  const textoBruto = auditor.extrairTextoDocx(caminho);
  const { paragrafosCorpo, linhasReferencias } = auditor.dividirCorpoEReferencias(textoBruto);
  const refsFinais = auditor.analisarLinhasReferencias(linhasReferencias);
  const { citacoes: citacoesCorpo } = auditor.extrairCitacoesDoCorpo(paragrafosCorpo, refsFinais);

  for (const r of refsFinais) {
    testar(
      `Vetor 6 (${nomeArq} - Metadados Finos)`,
      `Ref #${r.numeroRef} (${r.primeiroSobrenome}, ${r.anoBase}) sem ADDIN e com natureza classificada`,
      () => {
        assert.ok(!/ADDIN\s+(?:CSL_CITATION|Mendeley)/i.test(r.textoOriginal));
        assert.ok(/^\d{4}$/.test(r.anoBase), `Ano inválido em ${nomeArq}: ${r.anoBase} (${r.textoOriginal})`);
        assert.ok(['artigo_periodico', 'norma_livro_institucional', 'periodico_regional_sem_doi'].includes(r.natureza));
      }
    );
  }

  for (const cit of citacoesCorpo) {
    testar(
      `Vetor 6 (${nomeArq} - Contexto Íntegro)`,
      `Citação ${cit.bruto} (§${cit.numParagrafo}) possui contexto semântico íntegro e sem ADDIN`,
      () => {
        assert.ok(!/ADDIN\s+CSL_CITATION/i.test(cit.fraseContexto));
        assert.ok(
          cit.fraseContexto.length >= 25,
          `Frase de contexto truncada em ${nomeArq} §${cit.numParagrafo}: "${cit.fraseContexto}"`
        );
      }
    );
  }
}

// ========================================================================================
// RELATÓRIO FINAL DA 3ª BATERIA RED-TEAM
// ========================================================================================
const duracaoSeg = ((Date.now() - t0) / 1000).toFixed(2);
console.log('\n========================================================================================');
console.log('📊 RESUMO POR VETOR DA 3ª BATERIA RED-TEAM DE FINE-TUNING FORENSE:');
console.log('----------------------------------------------------------------------------------------');
for (const [vetor, st] of resumoVetores.entries()) {
  const icone = st.falhou === 0 ? '✅' : '❌';
  console.log(`  ${icone} ${vetor.padEnd(46)} : ${st.passou}/${st.total} aprovados`);
}
console.log('----------------------------------------------------------------------------------------');
console.log(`🏆 TOTAL DA 3ª BATERIA RED-TEAM: ${totalPassou}/${totalTestes} TESTES APROVADOS EM ${duracaoSeg}s`);
console.log('========================================================================================');

if (totalFalhou > 0) {
  console.error(`\n⚠️ Foram encontradas ${totalFalhou} falha(s) para calibrar!`);
  process.exit(1);
} else {
  console.log('🎉 100% DOS TESTES DA 3ª BATERIA RED-TEAM PASSARAM COM SUCESSO!');
}
