const assert = require('assert');
const { auditarManuscrito } = require('../electron/auditor.cjs');

/**
 * Teste de Idempotência & Determinismo Estrito (v1.1.0):
 * - Roda o pipeline completo (`modulo: 'todos'`) 2 vezes consecutivas no mesmo manuscrito.
 * - Verifica que 100% do JSON de saída é idêntico (`deepStrictEqual`).
 * - Cobre referências mistas PT/EN, normas SUS (Portaria MS / CONITEC / HL7 FHIR RNDS),
 *   Ground Truth via "Trecho Citado" em grifos/ e evidência posicionada após o caractere 15.000.
 */
async function main() {
  const textoRuidoInicial =
    'Methodology and background cohort procedures enrolled adults with hypertension and standard clinical follow-up across primary care centers without quantitative subgroup breakdown. '.repeat(
      95
    );
  // Evidência clínica exata posicionada intencionalmente após o caractere 16.000
  assert(textoRuidoInicial.length > 15500, 'Filler deve exceder 15.000 caracteres');
  const evidenciaTardiaEn =
    'In the adjusted multicenter trial at week 24, structured telemonitoring lowered systolic blood pressure by 11.4 mmHg (95% CI 8.2 to 14.6; n=412; p<0.001) and raised therapeutic adherence to 84.5%.';
  const textoCompletoArtigoEn = `${textoRuidoInicial}\n\nRESULTS AND DISCUSSION\n${evidenciaTardiaEn}`;

  const textoArtigoPt =
    'Estudo observacional na atenção primária brasileira analisou o impacto de lembretes ativos e estratificação de risco cardiovascular. ' +
    'Nos pacientes acompanhados pela equipe multiprofissional, a adesão medicamentosa atingiu 79,2% em seis meses (p=0,004).';

  const refsMap = new Map([
    [
      'ref-silva-2023',
      {
        id: 'ref-silva-2023',
        status: 'citada',
        tags: [],
        pdf: 'silva2023.pdf',
        textoExtraido: textoArtigoPt,
        csl: {
          id: 'ref-silva-2023',
          type: 'article-journal',
          title: 'Adesão terapêutica e telemonitoramento na atenção primária',
          author: [{ family: 'Silva', given: 'Joao' }],
          issued: { 'date-parts': [[2023]] },
          'container-title': 'Cadernos de Saúde Coletiva',
          DOI: '10.1590/cad-2023-001',
        },
      },
    ],
    [
      'ref-smith-2024',
      {
        id: 'ref-smith-2024',
        status: 'citada',
        tags: [],
        pdf: 'smith2024.pdf',
        textoExtraido: textoCompletoArtigoEn,
        csl: {
          id: 'ref-smith-2024',
          type: 'article-journal',
          title: 'Multicenter structured telemonitoring in arterial hypertension management',
          author: [{ family: 'Smith', given: 'Robert' }],
          issued: { 'date-parts': [[2024]] },
          'container-title': 'Journal of Clinical Telehealth',
          DOI: '10.1001/jct.2024.099',
        },
      },
    ],
    [
      'ref-brasil-2020',
      {
        id: 'ref-brasil-2020',
        status: 'citada',
        tags: [],
        pdf: null,
        textoExtraido: '',
        csl: {
          id: 'ref-brasil-2020',
          type: 'report',
          title: 'Portaria GM/MS nº 1.434, de 28 de maio de 2020 — Rede Nacional de Dados em Saúde (RNDS) e perfil HL7 FHIR R4',
          author: [{ literal: 'BRASIL. Ministério da Saúde' }],
          issued: { 'date-parts': [[2020]] },
        },
      },
    ],
  ]);

  const grifosMock = {
    'ref-silva-2023': [
      {
        id: 'g1',
        pagina: 4,
        cor: 'azul',
        citadoNoTexto: true,
        trecho: 'Nos pacientes acompanhados pela equipe multiprofissional, a adesão medicamentosa atingiu 79,2% em seis meses (p=0,004).',
      },
    ],
  };

  let chamadasMutacao = 0;
  const bibliotecaMock = {
    raiz: process.cwd(),
    refs: refsMap,
    async criar(dados) {
      chamadasMutacao++;
      return dados;
    },
    async atualizar(id, patch) {
      const atual = refsMap.get(id);
      if (!atual) return null;
      return { ...atual, ...patch };
    },
    async lerGrifos(id) {
      return [...(grifosMock[id] || [])];
    },
    async salvarGrifos() {
      chamadasMutacao++;
    },
    async anexarPdf(id) {
      return refsMap.get(id);
    },
  };

  const manuscrito = `
1. Introdução

O telemonitoramento estruturado na hipertensão reduziu a pressão arterial sistólica em 11,4 mmHg e elevou a adesão terapêutica para 84,5% em ensaio multicêntrico (SMITH, 2024).

Em coortes brasileiras da atenção primária, o acompanhamento multiprofissional alcançou 79,2% de adesão medicamentosa em seis meses (SILVA, 2023).

O padrão de interoperabilidade clínica adotado no SUS baseia-se na Rede Nacional de Dados em Saúde e no modelo HL7 FHIR regulamentados normativamente (BRASIL, 2020; CONITEC, 2022).

REFERÊNCIAS

BRASIL. Ministério da Saúde. Portaria GM/MS nº 1.434, de 28 de maio de 2020. Institui o Programa Conecte SUS e a Rede Nacional de Dados em Saúde (RNDS) em padrão HL7 FHIR. Brasília: MS, 2020.

CONITEC. Comissão Nacional de Incorporação de Tecnologias no Sistema Único de Saúde. Diretrizes Metodológicas de Telemonitoramento no SUS. Brasília: Ministério da Saúde, 2022.

SILVA, Joao. Adesão terapêutica e telemonitoramento na atenção primária. Cadernos de Saúde Coletiva, 2023. DOI: 10.1590/cad-2023-001.

SMITH, Robert. Multicenter structured telemonitoring in arterial hypertension management. Journal of Clinical Telehealth, 2024. DOI: 10.1001/jct.2024.099.
`;

  const res1 = await auditarManuscrito({
    texto: manuscrito,
    biblioteca: bibliotecaMock,
    buscarEBaixar: false,
    modulo: 'todos',
    somenteLeitura: true,
  });

  const res2 = await auditarManuscrito({
    texto: manuscrito,
    biblioteca: bibliotecaMock,
    buscarEBaixar: false,
    modulo: 'todos',
    somenteLeitura: true,
  });

  // 1. Determinismo estrito 100% entre 1ª e 2ª execução consecutiva
  assert.deepStrictEqual(
    res1,
    res2,
    'Saída JSON completa da 1ª e 2ª execução da auditoria deve ser 100% idêntica (determinismo estrito)!'
  );

  // 2. Nenhuma escrita em disco ocorreu em modo somenteLeitura
  assert.strictEqual(chamadasMutacao, 0, 'Modo somenteLeitura não pode acionar mutações em disco.');

  // 3. Normas do SUS / Portaria / CONITEC classificadas como válidas, nunca fantasma de IA
  const refBrasil = res1.refsMapeadas.find((r) => /brasil/i.test(r.primeiroSobrenome || ''));
  const refConitec = res1.refsMapeadas.find((r) => /conitec/i.test(r.textoOriginal || ''));
  assert(refBrasil && refBrasil.statusAutenticidade !== 'suspeita_ia_fantasma', 'Portaria MS / RNDS HL7 FHIR não deve virar fantasma.');
  assert(refConitec && refConitec.statusAutenticidade === 'institucional_tese', 'CONITEC deve ser classificada como norma institucional válida.');

  // 4. Obra Smith (2024) com evidência >15.000 chars deve estar mapeada e sem falso desvio
  const refSmith = res1.refsMapeadas.find((r) => /smith/i.test(r.primeiroSobrenome || ''));
  assert(refSmith && refSmith.citadaNoTexto === true, 'Smith (2024) deve constar como citada.');
  const desviosSmith = (res1.alertasDesvioTematico || []).filter((d) => /smith/i.test(d.autorCitado || ''));
  assert.strictEqual(
    desviosSmith.length,
    0,
    `BM25 + ONNX deve recuperar evidência após o caractere 15.000 sem falso alerta temático. Obtido: ${JSON.stringify(desviosSmith)}`
  );

  console.log('✅ TESTE DE IDEMPOTÊNCIA & DETERMINISMO ESTRITO v1.1.0 PASSOU 100% (deepStrictEqual OK)!');
}

main().catch((err) => {
  console.error('❌ Falha no teste de idempotência:', err);
  process.exit(1);
});
