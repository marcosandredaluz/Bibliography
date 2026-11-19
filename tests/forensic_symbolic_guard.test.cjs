const assert = require('assert');
const {
  detectarPolaridadeNegativa,
  extrairAssinaturasNumericas,
  verificarDivergenciaNumerica,
  verificarApudOcultoNaIntroducao,
  auditarPareamentoSimbolico,
} = require('../electron/forensic_symbolic_guard.cjs');
const { extrairRetratacaoCrossref } = require('../electron/metadata.cjs');

// 1. Inversão de Polaridade (NegEx PT/EN com proteção à preposição portuguesa "no")
assert.strictEqual(
  detectarPolaridadeNegativa('No significant association was found between exposure and mortality.'),
  true
);
assert.strictEqual(detectarPolaridadeNegativa('Não houve diferença estatística entre os grupos.'), true);
assert.strictEqual(
  detectarPolaridadeNegativa('O telemonitoramento no ensaio multicêntrico elevou a adesão para 84,5%.'),
  false
);
assert.strictEqual(
  detectarPolaridadeNegativa('Vaccine hesitancy reflects a lack of confidence with or without hesitation.'),
  false
);

// 2. Divergência Numérica Exata (%, n=, OR/RR/HR)
const nums = extrairAssinaturasNumericas('Redução de 34,5% em n=450 pacientes (HR=0,72).');
assert.strictEqual(nums.length, 3);
const div = verificarDivergenciaNumerica(
  'A taxa de adesão foi de 34,5% em n=450 pacientes.',
  'Adherence improved to 84.5% (n = 450).'
);
assert(div && div.divergente && div.tipo === 'percentual');

// 3. Apud oculto nos primeiros 18% do PDF (Introdução)
assert.strictEqual(
  verificarApudOcultoNaIntroducao('Prior trials noted adverse events (Johnson et al., 2018).', 0.12),
  true
);
assert.strictEqual(
  verificarApudOcultoNaIntroducao('Prior trials noted adverse events (Johnson et al., 2018).', 0.55),
  false
);

const alertas = auditarPareamentoSimbolico({
  fraseManuscrito: 'O tratamento reduziu em 45,0% o desfecho primário (n=450).',
  blocoPdf: 'No significant difference was observed, with 12.0% reduction (n=450) citing (Doe, 2019).',
  posicaoRelativaNoTexto: 0.10,
});
const codigos = alertas.map((a) => a.codigo);
assert(codigos.includes('INVERSAO_POLARIDADE_NEGEX'));
assert(codigos.includes('DIVERGENCIA_NUMERICA_EXATA'));
assert(codigos.includes('POSSIVEL_APUD_INTRODUCAO'));

// 4. Detecção de Artigos Retratados (Crossref is-retracted / update-to / título)
const retCrossmark = extrairRetratacaoCrossref({
  'is-retracted': false,
  'update-to': [{ type: 'retraction', label: 'Retraction Notice', DOI: '10.1000/ret.1' }],
});
assert.strictEqual(retCrossmark.retratado, true);

const retFlag = extrairRetratacaoCrossref({ 'is-retracted': true });
assert.strictEqual(retFlag.retratado, true);

const ativoOk = extrairRetratacaoCrossref({ title: 'Valid trial outcomes', 'update-to': [] });
assert.strictEqual(ativoOk.retratado, false);

console.log('✅ FASE 1 GUARDIÃO SIMBÓLICO & RETRATAÇÕES PASSOU 100% (4 CENÁRIOS VALIDADOS)!');
