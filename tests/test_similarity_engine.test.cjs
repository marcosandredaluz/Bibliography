/**
 * tests/test_similarity_engine.test.cjs
 * 
 * Bateria de testes unitários para os novos módulos de similaridade:
 * - Winnowing (MOSS - Stanford)
 * - Greedy String Tiling / RKR-GST (JPlag - KIT)
 */

'use strict';

const assert = require('assert');
const {
  hashString32,
  calcularHashesKGramas,
  extrairFingerprintsWinnowing,
  IndiceWinnowing,
} = require('../electron/similarity_winnowing.cjs');
const { executarGreedyStringTiling } = require('../electron/similarity_tiling.cjs');

console.log('--- TESTANDO MOTOR DE SIMILARIDADE AVANÇADO (WINNOWING + TILING) ---');

// 1. Testes de Winnowing
{
  const textoOrig = 'o desenvolvimento de metodos epidemiologicos para controle da esporotricose humana e animal no brasil';
  const palavras = textoOrig.split(' ');

  const fps = extrairFingerprintsWinnowing(palavras, 4, 7);
  assert(fps.length > 0, 'Winnowing deve gerar fingerprints para texto longo');

  // Constrói índice com 2 artigos
  const corpus = [
    {
      sentencas: [
        { norm: 'o desenvolvimento de metodos epidemiologicos para controle da esporotricose humana e animal no brasil' },
        { norm: 'analise retrospectiva dos casos notificados no sistema de informacao de agravos de notificacao' },
      ],
    },
    {
      sentencas: [
        { norm: 'investigacao molecular das cepas isoladas de felinos domesticos na regiao metropolitana de curitiba' },
      ],
    },
  ];

  const indice = IndiceWinnowing.construirDoCorpus(corpus, 4, 7);
  assert.strictEqual(indice.totalDocumentos, 2, 'Total de documentos indexados correto');

  // Consulta com frase idêntica
  const candidatosExatos = indice.consultarCandidatos('o desenvolvimento de metodos epidemiologicos para controle da esporotricose'.split(' '));
  assert(candidatosExatos.has('0:0'), 'Deve encontrar o documento 0, sentença 0 como candidato com alta prioridade');

  // Consulta com frase completamente distinta
  const candidatosSemMatch = indice.consultarCandidatos('fisica quantica e supercondutividade em baixas temperaturas absolutas'.split(' '));
  assert.strictEqual(candidatosSemMatch.size, 0, 'Não deve encontrar candidatos para texto sem sobreposição');

  console.log('✓ 1. Winnowing (MOSS): Extração e indexação em O(1) validadas com sucesso.');
}

// 2. Testes de Greedy String Tiling (JPlag)
{
  // Teste 2.1: Cópia contígua
  const textoA = 'o desenvolvimento de metodos epidemiologicos para controle da esporotricose humana no contexto de saude publica';
  const textoB = 'o desenvolvimento de metodos epidemiologicos para controle da esporotricose humana foi discutido amplamente';

  const resContiguo = executarGreedyStringTiling(textoA, textoB, 7);
  assert(resContiguo.tiles.length >= 1, 'Deve detectar o bloco contíguo');
  assert.strictEqual(resContiguo.tiles[0].texto, 'o desenvolvimento de metodos epidemiologicos para controle da esporotricose humana');
  assert.strictEqual(resContiguo.isMosaic, false, 'Cópia contígua de bloco único não deve ser classificada como mosaico');
  console.log('✓ 2. Greedy String Tiling (JPlag): Cópia contígua detectada com precisão.');

  // Teste 2.2: Plágio Mosaico (frases invertidas e intercaladas)
  // No artigo original: Bloco1 ... Bloco2
  // No manuscrito plagiado: Bloco2 ... Bloco1 (ordem trocada)
  const bloco1 = 'o desenvolvimento de metodos epidemiologicos para controle da infeccao';
  const bloco2 = 'analise retrospectiva dos casos notificados no sistema de informacao';
  
  const artigoFonte = `${bloco1} em centros urbanos. Adicionalmente realizou-se uma ${bloco2} durante o periodo.`;
  const manuscritoPlagiado = `De acordo com nossa investigacao a ${bloco2} foi fundamental. Portanto ${bloco1} deve continuar.`;

  const resMosaico = executarGreedyStringTiling(manuscritoPlagiado, artigoFonte, 7);
  assert.strictEqual(resMosaico.tiles.length, 2, 'Deve identificar exatamente os 2 blocos transplantados');
  assert.strictEqual(resMosaico.isMosaic, true, 'Deve classificar como mosaico devido à inversão/descontinuidade');
  console.log('✓ 3. Greedy String Tiling (JPlag): Plágio Mosaico com inversão de ordem detectado com perfeição.');

  // Teste 2.3: Ausência de plágio
  const resSemPlagio = executarGreedyStringTiling(
    'os pacientes foram submetidos a protocolo cirurgico convencional',
    'a distribuicao de frequencia das variaveis continuas foi expressa em media e desvio padrao',
    7
  );
  assert.strictEqual(resSemPlagio.tiles.length, 0, 'Zero tiles quando não há plágio');
  console.log('✓ 4. Greedy String Tiling: Descarte limpo para ausência de sobreposição.');
}

console.log('TODOS OS TESTES DO NOVO MOTOR PASSARAM COM 100% DE SUCESSO!');
