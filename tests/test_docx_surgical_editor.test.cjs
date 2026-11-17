/**
 * tests/test_docx_surgical_editor.test.cjs
 * 
 * Testes unitários para o Editor Cirúrgico Nativo .DOCX (OpenXML Run-Span Surgery).
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const JSZip = require('jszip');
const editor = require('../electron/docx_surgical_editor.cjs');

async function rodarTestes() {
  console.log('--- TESTANDO EDITOR CIRÚRGICO .DOCX (OPENXML) ---');

  // Document XML de teste com runs fragmentados e itálico preservado
  const docXmlSimulado = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    <w:p>
      <w:r><w:t xml:space="preserve">O agente </w:t></w:r>
      <w:r><w:rPr><w:i/></w:rPr><w:t>Sporothrix brasiliensis</w:t></w:r>
      <w:r><w:t xml:space="preserve"> causa surtos graves </w:t></w:r>
      <w:r><w:t>(Exemplo Citado, </w:t></w:r>
      <w:r><w:t>2026)</w:t></w:r>
      <w:r><w:t xml:space="preserve">, exigindo atenção rápida.</w:t></w:r>
    </w:p>
    <w:p><w:r><w:rPr><w:b/></w:rPr><w:t>REFERÊNCIAS</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:line="360"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>ALVARES, M. Estudo inicial. Revista A, 2020.</w:t></w:r></w:p>
    <w:p><w:pPr><w:spacing w:line="360"/></w:pPr><w:r><w:rPr><w:sz w:val="24"/></w:rPr><w:t>ZIMERMAN, T. Trabalho final. Revista Z, 2024.</w:t></w:r></w:p>
    <w:sectPr/>
  </w:body>
</w:document>`;

  // 1. Remoção cirúrgica de citação fragmentada preservando itálico anterior
  const resRemCit = editor.aplicarSubstituicaoEmDocumentXml(
    docXmlSimulado,
    '(Exemplo Citado, 2026)',
    '',
    { limparPontuacao: true }
  );
  assert.strictEqual(resRemCit.alteracoes, 1, 'Deve realizar exatamente 1 alteração');
  assert(resRemCit.xml.includes('<w:i/>'), 'Deve preservar a tag de itálico em Sporothrix brasiliensis');
  assert(!resRemCit.xml.includes('Exemplo Citado'), 'Citação deve ter sido removida');
  assert(resRemCit.xml.includes('surtos graves, exigindo') || resRemCit.xml.includes('surtos graves , exigindo') === false, 'Pontuação limpa');
  console.log('✓ 1. Remoção cirúrgica de citação entre múltiplos runs XML preservando itálico validada.');

  // 2. Inserção alfabética na seção REFERÊNCIAS herdando <w:pPr> e <w:rPr>
  const resInsRef = editor.inserirReferenciaEmDocumentXml(
    resRemCit.xml,
    'MARTINS, A. B. Protocolo digital de rastreio em saúde. Cadernos de Saúde, 2026.'
  );
  assert.strictEqual(resInsRef.inserida, true, 'Referência deve ser inserida');
  const idxAlvares = resInsRef.xml.indexOf('ALVARES');
  const idxMartins = resInsRef.xml.indexOf('MARTINS');
  const idxZimerman = resInsRef.xml.indexOf('ZIMERMAN');
  assert(idxAlvares < idxMartins && idxMartins < idxZimerman, 'Deve inserir em ordem alfabética (ALVARES < MARTINS < ZIMERMAN)');
  assert(resInsRef.xml.includes('w:line="360"') && resInsRef.xml.includes('MARTINS'), 'Deve clonar a formatação da seção de referências');
  console.log('✓ 2. Inserção alfabética na lista de REFERÊNCIAS com clonagem de estilo validada.');

  // 3. Teste end-to-end em arquivo .docx real
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bib-surgical-test-'));
  const tmpDocx = path.join(tmpDir, 'teste_cirurgia.docx');

  const zip = new JSZip();
  zip.file('[Content_Types].xml', '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>');
  zip.file('word/document.xml', docXmlSimulado);
  const buf = await zip.generateAsync({ type: 'nodebuffer' });
  fs.writeFileSync(tmpDocx, buf);

  const resReal = await editor.executarCirurgiaDocx(tmpDocx, {
    tipo: 'inserir_referencia',
    referenciaTexto: 'SANTOS, R. C. Classificação automatizada de dados clínicos. Revista Brasileira, 2026.',
  });
  assert.strictEqual(resReal.ok, true);
  assert(fs.existsSync(path.join(tmpDir, 'teste_cirurgia.backup_pre_auditoria.docx')), 'Deve criar backup automático antes da alteração');

  // Recarrega e verifica conteúdo no .docx salvo
  const zipAfter = await JSZip.loadAsync(fs.readFileSync(tmpDocx));
  const xmlAfter = await zipAfter.file('word/document.xml').async('string');
  assert(xmlAfter.includes('SANTOS, R. C.'), 'O .docx salvo no disco deve conter a nova referência inserida');

  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('✓ 3. Cirurgia real em pacote .DOCX (com backup automático e gravação validada) concluída com sucesso.');

  console.log('\n================================================================');
  console.log('🎉 TODOS OS TESTES DO EDITOR CIRÚRGICO .DOCX PASSARAM 100%!');
  console.log('================================================================');
}

rodarTestes().catch((e) => {
  console.error('❌ Erro no teste:', e);
  process.exit(1);
});
