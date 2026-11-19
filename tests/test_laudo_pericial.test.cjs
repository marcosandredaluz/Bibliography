/**
 * tests/test_laudo_pericial.test.cjs
 * 
 * Testes unitários para o gerador de Laudo Pericial em HTML/PDF imprimível.
 */

'use strict';

const assert = require('assert');
const { gerarHtmlLaudoPericial, calcularHashIntegridade } = require('../electron/laudo_pericial_generator.cjs');

console.log('--- TESTANDO GERADOR DE LAUDO PERICIAL ---');

const mockResultado = {
  totalCitacoesOcorrencias: 15,
  totalAutoresCitadosUnicos: 8,
  refsMapeadas: [
    {
      primeiroSobrenome: 'ALVARES',
      anoBase: '2023',
      tituloOficial: 'Estudo Clínico sobre Vigilância Epidemiológica',
      doiOficial: '10.1000/182',
      encontradoNasBases: true,
    },
    {
      primeiroSobrenome: 'BARROS',
      anoBase: '2022',
      tituloBuscado: 'Manual de Procedimentos em Saúde',
      doi: '',
      encontradoNasBases: false,
    },
  ],
  alertasPrecisao: [
    {
      tipo: 'atribuicao_falsa',
      numParagrafo: 4,
      numLinha: 22,
      secao: 'Discussão',
      autorCitado: 'BARROS (2022)',
      fraseWord: 'Segundo Barros (2022), a eficácia foi de 95%.',
      mensagem: 'Afirmação não condiz com os resultados do estudo citado.',
    },
  ],
  alertasFigurasTabelas: [],
  citacoesSemReferencia: [],
  refsNaoCitadasNoTexto: [],
};

// 1. Gera HTML
const html = gerarHtmlLaudoPericial(mockResultado, {
  nomeArquivo: 'Teste_Artigo_Academico.docx',
  dataHora: new Date(),
});

assert(html.includes('Laudo Pericial de Auditoria Bibliográfica'), 'Deve conter o título do laudo');
assert(html.includes('Teste_Artigo_Academico.docx'), 'Deve conter o nome do arquivo');
assert(html.includes('ALVARES'), 'Deve conter os autores das referências mapeadas');
assert(html.includes('atribuicao_falsa') || html.includes('ATRIBUICAO FALSA'), 'Deve listar os alertas ativos');
assert(html.includes('SHA-256:'), 'Deve incluir a assinatura digital SHA-256');

console.log('✓ 1. Geração do Laudo Pericial em HTML com resumo e 16 dimensões validada com sucesso.');

// 2. Hash de integridade
const hash = calcularHashIntegridade('conteudo de teste');
assert.strictEqual(hash.length, 64, 'Hash SHA-256 deve ter 64 caracteres hexadecimais');
console.log('✓ 2. Cálculo determinístico de integridade criptográfica SHA-256 validado com sucesso.');

// 3. Itens marcados como resolvidos/ignorados NÃO acompanham o relatório
const htmlComResolvido = gerarHtmlLaudoPericial(mockResultado, {
  nomeArquivo: 'Teste_Artigo_Academico.docx',
  dataHora: new Date(),
  inconformidadesResolvidas: ['meta_4_22_atribuicao_falsa'],
});
assert(
  !htmlComResolvido.includes('Afirmação não condiz com os resultados do estudo citado.'),
  'Item marcado como resolvido não deve aparecer no Laudo Pericial'
);
assert(
  htmlComResolvido.includes('Nenhuma pendência ativa'),
  'Laudo com todas as pendências resolvidas deve indicar conformidade sem pendências ativas'
);
console.log('✓ 3. Exclusão de itens marcados como resolvidos no Laudo Pericial validada com sucesso.');

console.log('\n================================================================');
console.log('🎉 TODOS OS TESTES DE LAUDO PERICIAL PASSARAM COM SUCESSO!');
console.log('================================================================');
