const assert = require('assert');
const {
  detectarPolaridadeNegativa,
  extrairAssinaturasNumericas,
  verificarDivergenciaNumerica,
  verificarApudOcultoNaIntroducao,
  auditarPareamentoSimbolico,
} = require('../electron/audit/symbolic_guardian.cjs');

// 1. NegEx bilingue com protecao da preposicao portuguesa "no"
assert.strictEqual(detectarPolaridadeNegativa('No significant association was found between exposure and mortality.'), true);
assert.strictEqual(detectarPolaridadeNegativa('Nao houve diferenca estatistica entre os grupos.'), true);
assert.strictEqual(
  detectarPolaridadeNegativa('O telemonitoramento no ensaio multicentrico elevou a adesao para 84,5%.'),
  false,
  'Preposicao portuguesa "no" nao pode disparar negacao inglesa'
);

// 2. Assinaturas numericas tipadas e divergencia exata
const nums = extrairAssinaturasNumericas('A taxa foi de 34,5% em n=450 pacientes com OR=2,1.');
assert.strictEqual(nums.length, 3);
const div = verificarDivergenciaNumerica(
  'A taxa de adesao foi de 34,5% em n=450 participantes.',
  'Overall therapeutic adherence reached 84.5% across 120 participants.'
);
assert(div && div.divergente && div.tipo === 'percentual', 'Deve detectar divergencia exata de percentual');

const igual = verificarDivergenciaNumerica(
  'Adesao de 84,5% (n=412).',
  'Adherence improved to 84.5% (n = 412; p<0.001).'
);
assert.strictEqual(igual, null, 'Valores equivalentes com virgula/ponto nao devem gerar falso positivo');

// 3. Apud oculto na Introducao (<= 18% com citacao interna) vs Resultados (> 18%)
assert.strictEqual(
  verificarApudOcultoNaIntroducao('Previous studies showed high mortality rates (Johnson et al., 2018).', 0.08),
  true
);
assert.strictEqual(
  verificarApudOcultoNaIntroducao('Previous studies showed high mortality rates (Johnson et al., 2018).', 0.45),
  false
);

// 4. Pipeline completo do guardiao aditivo
const alertas = auditarPareamentoSimbolico({
  fraseManuscrito: 'O tratamento reduziu em 45,0% o desfecho primario (n=450).',
  blocoPdf: 'No significant difference was observed, with 12.0% reduction (n=450) citing (Doe, 2019).',
  posicaoRelativaNoTexto: 0.1,
});
const codigos = alertas.map((a) => a.codigo);
assert(codigos.includes('INVERSAO_POLARIDADE_NEGEX'));
assert(codigos.includes('DIVERGENCIA_NUMERICA_EXATA'));
assert(codigos.includes('POSSIVEL_APUD_INTRODUCAO'));

console.log('✅ TESTES DO GUARDIAO SIMBOLICO FORENSE (NEGEX / NUMERICO / APUD) PASSARAM 100%!');
