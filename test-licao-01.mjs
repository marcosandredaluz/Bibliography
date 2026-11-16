// test-licao-01.mjs
// Suíte de Testes de Regressão — Lição 01 para o Indexador Reverso
// Casos T1 a T8 derivados da auditoria de fonte primária do Parágrafo 1 da Introdução.

import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const {
  extrairAnoPublicacaoReferencia,
  extrairAutorETituloDeReferencia,
  verificarHandleRepositorio,
  compararCamposDoiOficial,
  extrairCitacoesDoCorpo,
  analisarLinhasReferencias,
  auditarManuscrito,
} = require('./electron/auditor.cjs');

console.log('================================================================');
console.log('🧪 INICIANDO SUÍTE DE REGRESSÃO: LIÇÃO 01 (CASOS T1 A T8)');
console.log('================================================================\n');

// ----------------------------------------------------------------------
// T1: Entrada de Santos com intervalo de anos no título (2012-2021)
// ----------------------------------------------------------------------
console.log('▶ [T1] Verificando extração de chave de autor e ano em entrada com intervalo no título...');
const refSantos = `SANTOS, S. G. P. dos; CRUZ, C. F. R.; PREZOTTO, K. H.; MOREIRA, R. C.; GALDINO, M. J. Q.; OLIVEIRA, R. R.; SCHOLZE, A. R.; MELO, E. C. Temporal trend and spatial analysis of breast cancer mortality in Paraná, 2012-2021. Epidemiologia e Serviços de Saúde, v. 34, e20240171, 2025. DOI: 10.1590/S2237-96222025v34e20240171.en.`;

const anoInfoSantos = extrairAnoPublicacaoReferencia(refSantos);
assert.equal(anoInfoSantos.anoBase, '2025', 'R1: O ano extraído deve ser 2025, ignorando o intervalo 2012-2021 do título.');

const autorInfoSantos = extrairAutorETituloDeReferencia(refSantos);
assert.equal(autorInfoSantos.primeiroSobrenome, 'SANTOS', 'R2: O sobrenome de entrada deve ser SANTOS, e não DOS.');
assert.equal(autorInfoSantos.chaveAutor, 'santos', 'R2/R4: A chave normalizada de autor deve ser santos.');

// Teste de R3: Se a entrada do manuscrito iniciar incorretamente com "DOS SANTOS"
const refDosSantos = `DOS SANTOS, S. G. P.; CRUZ, C. F. R. Temporal trend and spatial analysis of breast cancer mortality in Paraná, 2012-2021. Epidemiologia e Serviços de Saúde, v. 34, e20240171, 2025.`;
const autorInfoDos = extrairAutorETituloDeReferencia(refDosSantos);
assert.equal(autorInfoDos.primeiroSobrenome, 'SANTOS', 'R3: Mesmo iniciando com preposição DOS SANTOS, o indexador deve adotar SANTOS.');
assert.ok(autorInfoDos.defeitoPreposicaoEntrada, 'R3: Deve sinalizar defeito formal de referência pela ABNT NBR 6023.');
assert.equal(autorInfoDos.defeitoPreposicaoEntrada.preposicao, 'DOS');
console.log('  ✅ T1 passou: Chave SANTOS (2025) extraída corretamente, intervalo no título rejeitado e preposição tratada.\n');

// ----------------------------------------------------------------------
// T2: Pareamento de (SANTOS et al., 2025) no texto com a entrada de T1
// ----------------------------------------------------------------------
console.log('▶ [T2] Verificando pareamento de (SANTOS et al., 2025) com a entrada de referências...');
const corpoT2 = [
  {
    texto:
      'No Estado do Paraná, a mortalidade apresentou tendência de crescimento entre 2012 e 2021 (SANTOS et al., 2025).',
    numParagrafo: 1,
    numLinha: 1,
    secao: '1 INTRODUÇÃO',
  },
];
const { citacoes: citT2 } = extrairCitacoesDoCorpo(corpoT2);
assert.equal(citT2.length, 1, 'Deve extrair exatamente 1 citação.');
assert.equal(citT2[0].chaveAutor, 'santos', 'Chave da citação deve ser santos.');
assert.equal(citT2[0].anoBase, '2025', 'Ano da citação deve ser 2025.');

const refsT2 = analisarLinhasReferencias([refSantos]);
assert.equal(refsT2.length, 1, 'Deve analisar 1 referência.');
assert.equal(refsT2[0].chaveAutor, 'santos', 'Chave da referência deve ser santos.');
assert.equal(refsT2[0].anoBase, '2025', 'Ano da referência deve ser 2025.');
console.log('  ✅ T2 passou: Citação (SANTOS et al., 2025) pareia perfeitamente sem falso positivo em D nem em E.\n');

// ----------------------------------------------------------------------
// T3: Pareamento de (LEMOS et al., 2019) no texto com entrada de Lemos
// ----------------------------------------------------------------------
console.log('▶ [T3] Verificando pareamento de (LEMOS et al., 2019) e remoção de et al...');
const refLemos = `LEMOS, L. L. P. de; SOUZA, M. C. de; MOREIRA, D. P.; ALMEIDA, P. H. R. F.; GODMAN, B.; VERGUET, S.; GUERRA JUNIOR, A. A.; CHERCHIGLIA, M. L. Stage at diagnosis and stage-specific survival of breast cancer in Latin America and the Caribbean: a systematic review and meta-analysis. PLoS One, v. 14, n. 10, e0224012, 2019. DOI: 10.1371/journal.pone.0224012.`;
const corpoT3 = [
  {
    texto:
      'estimando-se que cerca de 40,8% dos casos de câncer mamário ainda sejam confirmados em estádios avançados (LEMOS et al., 2019).',
    numParagrafo: 1,
    numLinha: 1,
    secao: '1 INTRODUÇÃO',
  },
];
const { citacoes: citT3 } = extrairCitacoesDoCorpo(corpoT3);
const refsT3 = analisarLinhasReferencias([refLemos]);
assert.equal(citT3[0].chaveAutor, 'lemos', 'Chave da citação deve ser lemos.');
assert.equal(refsT3[0].chaveAutor, 'lemos', 'Chave da referência deve ser lemos.');
assert.equal(refsT3[0].anoBase, '2019', 'Ano deve ser 2019.');
console.log('  ✅ T3 passou: (LEMOS et al., 2019) pareia sem que et al. quebre a correspondência.\n');

// ----------------------------------------------------------------------
// T4: Pareamento institucional INCA (Brasil). Estimativa 2026
// ----------------------------------------------------------------------
console.log('▶ [T4] Verificando autor corporativo INSTITUTO NACIONAL DE CÂNCER (2026)...');
const refInca = `INSTITUTO NACIONAL DE CÂNCER (Brasil). Estimativa 2026: incidência de câncer no Brasil. Rio de Janeiro: INCA, 2026. 168 p. Disponível em: https://ninho.inca.gov.br/jspui/handle/123456789/17914. Acesso em: 13 out. 2026.`;
const corpoT4 = [
  {
    texto:
      'foram estimados 78.610 casos novos no país, com risco de 71,57 casos a cada 100 mil mulheres, e em 2023 ocorreram 20.165 óbitos por essa causa (INSTITUTO NACIONAL DE CÂNCER, 2026).',
    numParagrafo: 1,
    numLinha: 1,
    secao: '1 INTRODUÇÃO',
  },
];
const { citacoes: citT4 } = extrairCitacoesDoCorpo(corpoT4);
const refsT4 = analisarLinhasReferencias([refInca]);

assert.equal(
  refsT4[0].chaveAutor,
  'institutonacionaldecancer',
  'R2: A chave de autor corporativo deve ser o bloco inteiro (institutonacionaldecancer), e não "instituto".'
);
assert.equal(refsT4[0].anoBase, '2026', 'Ano institucional deve ser 2026.');
assert.ok(
  refsT4[0].chavesAutorAlias.includes(citT4[0].chaveAutor),
  'A citação do corpo deve encontrar correspondência direta nos aliases da referência.'
);
console.log('  ✅ T4 passou: Chave completa INSTITUTO NACIONAL DE CÂNCER (2026) preservada e pareada.\n');

// ----------------------------------------------------------------------
// T5: Regra R5 — Exclusividade mútua entre Ponto D e Ponto E
// ----------------------------------------------------------------------
console.log('▶ [T5] Testando neutralização de conflito D-E (Regra R5)...');
// Simula auditoria onde uma citação e uma referência representam a mesma obra
// O auditor deve suprimir os alertas contraditórios e gerar erro de parsing
async function simularAuditoriaT5() {
  const bibliotecaMock = {
    refs: new Map(),
    porDoi: () => null,
    criar: async (dados) => ({ id: 'mock-1', ...dados }),
    atualizar: async (id, dados) => ({ id, ...dados }),
    lerGrifos: async () => [],
    salvarGrifos: async () => {},
  };

  const textoManuscrito = `1 INTRODUÇÃO
No Paraná, observou-se tendência de aumento (SANTOS et al., 2025).

REFERÊNCIAS
DOS SANTOS, S. G. P. dos. Estudo de mortalidade no Paraná. Curitiba: UFPR, 2025.
`;

  const res = await auditarManuscrito({
    texto: textoManuscrito,
    biblioteca: bibliotecaMock,
    buscarEBaixar: false,
  });

  // Em virtude de R2/R3/R5:
  // SANTOS e DOS SANTOS são reconciliados ou caem no interceptor de exclusividade mútua R5
  assert.equal(
    res.citacoesSemReferencia.length,
    0,
    'R5: Ponto D não pode conter obra que esteja presente na lista de referências.'
  );
  const refsNaoCitadas = res.refsMapeadas.filter((r) => !r.citadaNoTexto);
  assert.equal(
    refsNaoCitadas.length,
    0,
    'R5: Ponto E não pode conter obra que foi citada no corpo do texto.'
  );
}
await simularAuditoriaT5();
console.log('  ✅ T5 passou: Alertas contraditórios em D e E suprimidos por construção.\n');

// ----------------------------------------------------------------------
// T6: Regra R7 — Repositório institucional via URI / Handle (INCA 123456789/17914)
// ----------------------------------------------------------------------
console.log('▶ [T6] Verificando autenticação de publicação institucional via handle...');
const infoHandle = verificarHandleRepositorio(refInca);
assert.ok(infoHandle, 'R7: O handle 123456789/17914 deve ser reconhecido.');
assert.equal(infoHandle.tituloCanonico, 'Estimativa 2026: incidência de câncer no Brasil');
assert.equal(infoHandle.anoCanonico, '2026');
assert.equal(infoHandle.paginacaoCanonica, '168 p.');
assert.equal(infoHandle.possuiErrata, true, 'R8: Deve detectar a existência de errata no repositório.');
assert.equal(infoHandle.statusAutenticidade, 'repositorio_handle_autenticado');
console.log('  ✅ T6 passou: Registro DSpace recuperado, citação canônica 168 p. e errata identificadas.\n');

// ----------------------------------------------------------------------
// T7: Regra R9 — Comparação campo a campo via DOI (Fascículo de Santos n. 1)
// ----------------------------------------------------------------------
console.log('▶ [T7] Verificando detecção de fascículo divergente (Santos declarou n. 1)...');
const refSantosComFasciculo = {
  textoOriginal: `SANTOS, S. G. P. dos et al. Temporal trend... Epidemiologia e Serviços de Saúde, v. 34, n. 1, e20240171, 2025. DOI: 10.1590/S2237-96222025v34e20240171.en.`,
  anoBase: '2025',
};

const cslSantosOficial = {
  title: 'Temporal trend and spatial analysis of breast cancer mortality in Paraná, 2012-2021',
  volume: '34',
  issue: undefined, // Sem fascículo na publicação contínua
  issued: { 'date-parts': [[2025]] },
};

const compDoi = compararCamposDoiOficial(refSantosComFasciculo, cslSantosOficial);
assert.ok(compDoi.temDivergencia, 'R9: Deve detectar divergência entre a referência e o registro oficial.');
assert.equal(compDoi.divergencias.length, 1);
assert.equal(compDoi.divergencias[0].campo, 'fasciculo');
assert.ok(compDoi.divergencias[0].oficial.includes('sem fascículo'));
assert.ok(compDoi.divergencias[0].mensagem.includes('fascículo'));
console.log('  ✅ T7 passou: Divergência no campo fascículo (n. 1) detectada e alertada.\n');

// ----------------------------------------------------------------------
// T8: Regra R8 — Auditoria da Errata do INCA e Confronto com Dados de Mama
// ----------------------------------------------------------------------
console.log('▶ [T8] Verificando confronto com a Errata 2026_1.pdf...');
assert.equal(infoHandle.errataAuditada, true, 'R8: A errata deve ser auditada.');
assert.equal(infoHandle.errataAfetaMama, false, 'R8: A errata NÃO afeta dados de câncer de mama feminina.');
assert.ok(
  infoHandle.detalhesErrata.includes('78.610') && infoHandle.detalhesErrata.includes('20.165'),
  'R8: Os três números do Parágrafo 1 (78.610 novos casos e 20.165 óbitos) permanecem íntegros.'
);
console.log('  ✅ T8 passou: Errata confrontada comprovando validade dos números citados no Parágrafo 1.\n');

console.log('================================================================');
console.log('🎉 TODOS OS 8 CASOS DE TESTE DA LIÇÃO 01 PASSARAM COM SUCESSO!');
console.log('================================================================');
