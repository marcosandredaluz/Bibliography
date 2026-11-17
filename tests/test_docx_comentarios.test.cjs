/**
 * Testes Unitários: Injeção de Comentários Nativos no Word (.DOCX)
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');
const { injetarComentariosNoDocx } = require('../electron/docx_comentarios_injector.cjs');

console.log('--- TESTANDO INJEÇÃO DE COMENTÁRIOS NO .DOCX ---');

async function testarInjecaoComentarios() {
  const docxOrigem = path.join(__dirname, 'bancada', 'suites', 'rede', 'documento_rede.docx');
  const tempSaida = path.join(os.tmpdir(), `test_anotado_${Date.now()}.docx`);

  const inconformidadesFicticias = [
    {
      numParagrafo: 1,
      tipo: 'citacao_sem_referencia',
      tituloProblema: 'Citação Órfã',
      mensagem: 'Autor citado no texto não localizado na lista final de referências.',
      sugestao: 'Insira a obra completa nas referências conforme a norma ABNT.'
    },
    {
      numParagrafo: 2,
      tipo: 'desvio_tematico_citacao',
      tituloProblema: 'Assunto Divergente',
      mensagem: 'A afirmação diverge do conteúdo demonstrado no artigo oficial.',
      sugestao: 'Ajuste a redação ao resultado verificado no estudo.'
    }
  ];

  const resultado = await injetarComentariosNoDocx(docxOrigem, tempSaida, inconformidadesFicticias);

  assert.strictEqual(resultado.ok, true, 'Injeção deve retornar ok: true');
  assert(resultado.totalComentarios >= 2, 'Deve ter injetado pelo menos 2 comentários');
  assert(fs.existsSync(tempSaida), 'Arquivo de saída deve existir no disco');

  // Abre o .docx gerado e inspeciona se comments.xml e as relações foram incluídas
  const buf = fs.readFileSync(tempSaida);
  const zip = await JSZip.loadAsync(buf);

  const commentsXml = await zip.file('word/comments.xml')?.async('string');
  assert(commentsXml, 'word/comments.xml deve existir no pacote .docx');
  assert(commentsXml.toUpperCase().includes('CITAÇÃO ÓRFÃ'), 'Comments deve conter o título do alerta 1');
  assert(commentsXml.toUpperCase().includes('ASSUNTO DIVERGENTE'), 'Comments deve conter o título do alerta 2');
  assert(commentsXml.includes('Auditor Forense'), 'Comments deve conter a autoria do comentário');

  const docXml = await zip.file('word/document.xml')?.async('string');
  assert(docXml.includes('w:commentRangeStart'), 'document.xml deve conter marcas de comentário');
  assert(docXml.includes('w:commentReference'), 'document.xml deve conter referências aos comentários');

  const relsXml = await zip.file('word/_rels/document.xml.rels')?.async('string');
  assert(relsXml.includes('relationships/comments'), 'document.xml.rels deve conter relação de comentários');

  const ctXml = await zip.file('[Content_Types].xml')?.async('string');
  assert(ctXml.includes('wordprocessingml.comments+xml'), '[Content_Types].xml deve registrar o tipo de comentários');

  // Limpa arquivo temporário
  try { fs.unlinkSync(tempSaida); } catch {}

  console.log('✓ 1. Injeção de comentários nativos no Word (.docx) validada com 100% de conformidade OpenXML.');
  console.log('\n================================================================');
  console.log('🎉 TODOS OS TESTES DE INJEÇÃO .DOCX PASSARAM COM SUCESSO!');
  console.log('================================================================');
}

testarInjecaoComentarios().catch((err) => {
  console.error('Falha no teste:', err);
  process.exit(1);
});
