'use strict';

const assert = require('assert');
const os = require('os');
const path = require('path');

const {
  localizarModeloNliNosCaminhos,
  avaliarSustentacaoNliTop3,
} = require('../electron/semantic_onnx.cjs');
const { auditarManuscrito } = require('../electron/auditor.cjs');

async function runTests() {
  console.log('=== Fase 3 Tests: Cross-Encoder NLI (2nd Stage Cascade & Safe Fallback) ===');

  // 1. Fallback silencioso e deterministico quando o diretorio do modelo opcional nao existe
  const dirInexistente = path.join(os.tmpdir(), 'bib-nli-inexistente-99999');
  const resFallback1 = await avaliarSustentacaoNliTop3(
    'A vacinação reduziu significativamente a mortalidade infantil.',
    ['Estudo mostrou que a vacinação reduziu a mortalidade infantil em 40%.'],
    { raizesBusca: [dirInexistente] }
  );
  const resFallback2 = await avaliarSustentacaoNliTop3(
    'A vacinação reduziu significativamente a mortalidade infantil.',
    ['Estudo mostrou que a vacinação reduziu a mortalidade infantil em 40%.'],
    { raizesBusca: [dirInexistente] }
  );
  assert.strictEqual(resFallback1.disponivel, false);
  assert.strictEqual(resFallback1.veredito, 'indisponivel');
  assert.strictEqual(resFallback1.contradicaoDetectada, false);
  assert.deepStrictEqual(resFallback1, resFallback2, 'Fallback deve ser 100% determinístico');
  console.log('✓ Fallback silencioso e determinístico sem modelo NLI passed');

  // 2. Ordenacao deterministica e deteccao de contradicao com classificador injetado (Top-3)
  const mockPipe = async (entrada) => {
    const text = typeof entrada === 'string' ? entrada : entrada?.text || '';
    if (text.includes('no reduction')) {
      return [
        { label: 'contradiction', score: 0.91 },
        { label: 'neutral', score: 0.06 },
        { label: 'entailment', score: 0.03 },
      ];
    }
    return [
      { label: 'neutral', score: 0.85 },
      { label: 'entailment', score: 0.10 },
      { label: 'contradiction', score: 0.05 },
    ];
  };
  const resMock = await avaliarSustentacaoNliTop3(
    'The drug significantly reduced mortality.',
    [
      'Background methods described patient enrollment in primary care.',
      'The trial showed no reduction in mortality among treated patients.',
      'Follow-up visits occurred at week 12 and week 24.',
    ],
    { classificadorCustom: mockPipe }
  );
  assert.strictEqual(resMock.disponivel, true);
  assert.strictEqual(resMock.veredito, 'contradiction');
  assert.strictEqual(resMock.contradicaoDetectada, true);
  assert(resMock.melhorBloco.probabilidades.contradiction >= 0.72);
  console.log('✓ Triagem determinística Top-3 e limiar >= 0.72 passed');

  // 3. Inferencia real com o modelo quantizado custom-forensic-nli-int8 (quando presente)
  const nliLocal = localizarModeloNliNosCaminhos();
  assert(nliLocal, 'Modelo custom-forensic-nli-int8 deve ser detectado em calibration_gate');

  const resRealEntail = await avaliarSustentacaoNliTop3(
    'The multicenter clinical trial demonstrated that telemonitoring reduced systolic blood pressure.',
    [
      'In this multicenter clinical trial, structured telemonitoring significantly reduced systolic blood pressure by 11.4 mmHg compared with usual care.',
      'Baseline demographic characteristics were balanced across participating clinics.',
    ]
  );
  assert.strictEqual(resRealEntail.disponivel, true);
  assert.strictEqual(resRealEntail.contradicaoDetectada, false);
  assert(
    resRealEntail.melhorBloco.probabilidades.entailment > resRealEntail.melhorBloco.probabilidades.contradiction,
    `Esperado entailment > contradiction, obtido: ${JSON.stringify(resRealEntail.melhorBloco.probabilidades)}`
  );

  const resRealContra1 = await avaliarSustentacaoNliTop3(
    'The treatment significantly reduced patient mortality by half.',
    [
      'The clinical trial found no reduction in patient mortality and showed higher death rates in the treatment group compared with placebo.',
      'Patients were recruited between January and December across ten hospitals.',
    ]
  );
  const resRealContra2 = await avaliarSustentacaoNliTop3(
    'The treatment significantly reduced patient mortality by half.',
    [
      'The clinical trial found no reduction in patient mortality and showed higher death rates in the treatment group compared with placebo.',
      'Patients were recruited between January and December across ten hospitals.',
    ]
  );
  assert.strictEqual(resRealContra1.disponivel, true);
  assert.deepStrictEqual(resRealContra1, resRealContra2, 'Inferência real NLI deve ser 100% determinística');
  assert.strictEqual(
    resRealContra1.contradicaoDetectada,
    true,
    `Esperado contradiction >= 0.72 no modelo real, obtido: ${JSON.stringify(resRealContra1.melhorBloco?.probabilidades)}`
  );
  console.log(
    `✓ Inferência real custom-forensic-nli-int8 passed (entail=${resRealEntail.melhorBloco.probabilidades.entailment}, contra=${resRealContra1.melhorBloco.probabilidades.contradiction})`
  );

  // 4. Integração aditiva em auditarManuscrito()
  const bib = {
    refs: new Map([
      [
        'ref-nli-2024',
        {
          id: 'ref-nli-2024',
          status: 'citada',
          textoExtraido:
            'In this randomized multicenter study of antihypertensive telemonitoring, the intervention failed to reduce patient mortality and showed no reduction in mortality compared with placebo (p=0.84).',
          csl: {
            id: 'ref-nli-2024',
            type: 'article-journal',
            title: 'Multicenter randomized trial of antihypertensive telemonitoring and mortality outcomes',
            author: [{ family: 'Nunes', given: 'Rafael' }],
            issued: { 'date-parts': [[2024]] },
            DOI: '10.1001/nli.2024.001',
          },
        },
      ],
    ]),
  };

  const textoManuscrito = [
    'Resultados',
    'O acompanhamento remoto reduziu drasticamente a mortalidade dos pacientes hipertensos em comparação ao grupo controle (NUNES, 2024).',
    '',
    'Referências',
    'NUNES, Rafael. Multicenter randomized trial of antihypertensive telemonitoring and mortality outcomes. Journal of Clinical Trials, 2024. DOI: 10.1001/nli.2024.001.',
  ].join('\n');

  const resAudit = await auditarManuscrito({
    texto: textoManuscrito,
    biblioteca: bib,
    buscarEBaixar: false,
    somenteLeitura: true,
  });

  assert(
    Array.isArray(resAudit.alertasNliContradicao) && resAudit.alertasNliContradicao.length >= 1,
    `auditarManuscrito deve emitir alerta CONTRADICAO_LOGICA_NLI, recebido: ${JSON.stringify(resAudit.alertasNliContradicao)}`
  );
  assert(
    resAudit.alertasPrecisao.some((a) => a.tipo === 'contradicao_logica_nli' && a.codigo === 'CONTRADICAO_LOGICA_NLI'),
    'Alerta CONTRADICAO_LOGICA_NLI deve constar em alertasPrecisao'
  );
  console.log('✓ Integração aditiva em auditarManuscrito (CONTRADICAO_LOGICA_NLI) passed');
  console.log('ALL FASE 3 TESTS PASSED');
}

runTests().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
