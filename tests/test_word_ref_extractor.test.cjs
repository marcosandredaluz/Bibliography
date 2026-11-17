/**
 * tests/test_word_ref_extractor.test.cjs
 *
 * Testes Unitários para o Extrator Reverso de Campos do Word (.DOCX)
 * (Zotero, Mendeley, EndNote e Content Controls/Campos Nativos do Bibliografia).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');
const {
  extrairReferenciasDeXml,
  extrairIdsNativosBibliografia,
  extrairReferenciasDeDocx,
} = require('../electron/word_ref_extractor.cjs');

console.log('--- TESTANDO EXTRATOR REVERSO DE CAMPOS DO WORD (REF-EXTRACTOR) ---');

async function executar() {
  // 1. Extração de blocos CSL (Zotero/Mendeley) + EndNote + IDs nativos em XML bruto
  const zoteroPayload = JSON.stringify({
    citationItems: [
      {
        itemData: {
          type: 'article-journal',
          title: 'Structured Clinical Registries in Primary Care',
          author: [{ family: 'Mendonça', given: 'Fernando' }],
          issued: { 'date-parts': [[2023]] },
          'container-title': 'Journal of Health Informatics',
          DOI: '10.1234/jhi.2023.001',
        },
      },
    ],
  });

  const endnoteXmlSnippet =
    'ADDIN EN.CITE <EndNote><Cite><Record><titles><title>Telemetry Follow-Up Models</title></titles>' +
    '<contributors><authors><author>Carvalho, Tiago</author></authors></contributors>' +
    '<dates><year>2022</year></dates><electronic-resource-num>10.5555/tlm.2022.09</electronic-resource-num>' +
    '</Record></Cite></EndNote>';

  const docXmlSimulado = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:r><w:instrText>ADDIN ZOTERO_ITEM CSL_CITATION ${zoteroPayload.slice(0, 60)}</w:instrText></w:r>
          <w:r><w:instrText>${zoteroPayload.slice(60).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')}</w:instrText></w:r>
        </w:p>
        <w:p>
          <w:r><w:instrText>${endnoteXmlSnippet.replace(/</g, '&lt;').replace(/>/g, '&gt;')}</w:instrText></w:r>
        </w:p>
        <w:p>
          <w:sdt><w:sdtPr><w:tag w:val="BIB_REF:mendonca-2023"/></w:sdtPr><w:sdtContent><w:r><w:t>(MENDONÇA, 2023)</w:t></w:r></w:sdtContent></w:sdt>
          <w:r><w:instrText>ADDIN BIBLIOGRAFIA_ITEM id=mendonca-2023</w:instrText></w:r>
        </w:p>
      </w:body>
    </w:document>`;

  const extracaoXml = extrairReferenciasDeXml(docXmlSimulado);
  assert.strictEqual(extracaoXml.zoteroCount, 1, 'Deve detectar 1 bloco Zotero');
  assert.strictEqual(extracaoXml.endnoteCount, 1, 'Deve detectar 1 registro EndNote');
  assert.strictEqual(extracaoXml.itens.length, 2, 'Deve extrair 2 obras distintas (Zotero + EndNote)');

  const idsNativos = extrairIdsNativosBibliografia(docXmlSimulado);
  assert.strictEqual(idsNativos.get('mendonca-2023'), 2, 'Deve contabilizar BIB_REF e BIBLIOGRAFIA_ITEM para o mesmo ID');
  console.log('✓ 1. Parsing de campos Zotero (fragmentados em instrText), EndNote e BIB_REF validado.');

  // 2. Empacotamento .DOCX real temporário e confronto com biblioteca simulada
  const tmpDocx = path.join(os.tmpdir(), `teste_ref_extractor_${Date.now()}.docx`);
  const zip = new JSZip();
  zip.file('word/document.xml', docXmlSimulado);
  await fs.promises.writeFile(tmpDocx, await zip.generateAsync({ type: 'nodebuffer' }));

  const bibSimulada = {
    refs: new Map([
      [
        'mendonca-2023',
        {
          id: 'mendonca-2023',
          status: 'consultada',
          csl: {
            type: 'article-journal',
            title: 'Structured Clinical Registries in Primary Care',
            author: [{ family: 'Mendonça' }],
            issued: { 'date-parts': [[2023]] },
            DOI: '10.1234/jhi.2023.001',
          },
        },
      ],
    ]),
  };

  try {
    const resDocx = await extrairReferenciasDeDocx(tmpDocx, bibSimulada);
    assert.strictEqual(resDocx.origemModo, 'campos_dinamicos');
    assert.strictEqual(resDocx.resumo.totalObrasUnicas, 2);
    assert.strictEqual(resDocx.resumo.jaNaBiblioteca, 1, 'Mendonça deve bater pelo DOI com a biblioteca');
    assert.strictEqual(resDocx.resumo.novasParaImportar, 1, 'Carvalho (EndNote) deve aparecer como nova para importar');
    console.log('✓ 2. Extração de .DOCX via JSZip e conciliação com biblioteca local validada.');
  } finally {
    await fs.promises.unlink(tmpDocx).catch(() => {});
  }

  console.log('\n🎉 TODOS OS TESTES DO REF-EXTRACTOR WORD PASSARAM COM 100% DE SUCESSO!\n');
}

executar().catch((err) => {
  console.error(err);
  process.exit(1);
});
