/**
 * tests/test_word_extension_builder.test.cjs
 *
 * Testes Unitários da Extensão Nativa Word (.DOTM Ribbon OOXML Builder, Códigos de Campo Zotero-style
 * e Ponte HTTP Interativa /api/word/seletor-citacao-interativo + /api/word/atualizar-lote-campos).
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const JSZip = require('jszip');

const {
  REL_TYPE_CUSTOM_UI_14,
  diagnosticarExtensaoWord,
  injetarRibbonCustomUiEmDotm,
} = require('../electron/word_dotm_builder.cjs');

const {
  iniciarServidorWord,
  resolverSeletorPendente,
  gerarCodigoCampoBibliografia,
  parsearCodigoCampoBibliografia,
} = require('../electron/wordServer.cjs');

console.log('--- TESTANDO EXTENSÃO WORD (.DOTM RIBBON + QUICK FORMAT BRIDGE) ---');

async function executar() {
  // 1. Diagnóstico dos artefatos VBA/Ribbon na pasta resources/word-vba-integration
  const pastaVba = path.join(__dirname, '..', 'resources', 'word-vba-integration');
  const diag = diagnosticarExtensaoWord(pastaVba);
  assert(fs.existsSync(diag.caminhoBas), 'Bibliografia.bas deve existir nos recursos');
  assert(fs.existsSync(diag.caminhoCustomUi), 'customUI14.xml deve existir nos recursos');
  console.log('✓ 1. Diagnóstico de extensão VBA/Ribbon validado.');

  // 2. Injeção OOXML de customUI/customUI14.xml em um pacote .dotm sintético
  const tmpDir = await fs.promises.mkdtemp(path.join(os.tmpdir(), 'bib_dotm_test_'));
  const entradaDotm = path.join(tmpDir, 'base.dotm');
  const saidaDotm = path.join(tmpDir, 'Bibliografia.dotm');

  try {
    const zipBase = new JSZip();
    zipBase.file(
      '[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"></Types>'
    );
    zipBase.file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>'
    );
    zipBase.file('word/document.xml', '<w:document/>');
    await fs.promises.writeFile(entradaDotm, await zipBase.generateAsync({ type: 'nodebuffer' }));

    const resInjecao = await injetarRibbonCustomUiEmDotm(entradaDotm, saidaDotm, diag.caminhoCustomUi);
    assert(resInjecao.tamanhoBytes > 500, 'Arquivo .dotm gerado deve ter conteúdo válido');

    const zipOut = await JSZip.loadAsync(await fs.promises.readFile(saidaDotm));
    const uiXml = await zipOut.file('customUI/customUI14.xml')?.async('string');
    const relsXml = await zipOut.file('_rels/.rels')?.async('string');
    const ctXml = await zipOut.file('[Content_Types].xml')?.async('string');

    assert(uiXml && uiXml.includes('Ribbon_InserirCitacao') && uiXml.includes('Ribbon_AtualizarCampos'), 'Ribbon XML deve conter callbacks Ribbon_InserirCitacao e Ribbon_AtualizarCampos');
    assert(relsXml && relsXml.includes(REL_TYPE_CUSTOM_UI_14), '_rels/.rels deve registrar relacionamento extensibility');
    assert(ctXml && ctXml.includes('Extension="xml"'), '[Content_Types].xml deve registrar tipo xml');
    console.log('✓ 2. Empacotador OOXML customUI14.xml em .dotm validado.');

    // 3. Serialização e parsing dos códigos de campo wdFieldAddin
    const code = gerarCodigoCampoBibliografia(['mendonca-2023', 'carvalho-2021'], '45-48');
    assert.strictEqual(code, 'BIBLIOGRAFIA_ITEM id=mendonca-2023,carvalho-2021|p=45-48');
    const parsed = parsearCodigoCampoBibliografia(` ADDIN ${code} `);
    assert.deepStrictEqual(parsed.ids, ['mendonca-2023', 'carvalho-2021']);
    assert.strictEqual(parsed.pagina, '45-48');
    console.log('✓ 3. Codificação/decodificação de campo composto wdFieldAddin validada.');

    // 4. Ponte HTTP (Quick Format Interativo + Atualização em Lote de Campos) em porta efêmera
    const refsMap = new Map([
      [
        'carvalho-2021',
        {
          id: 'carvalho-2021',
          status: 'a_ler',
          csl: {
            id: 'carvalho-2021',
            type: 'article-journal',
            title: 'Structured Workflows in Primary Care',
            author: [{ family: 'Carvalho', given: 'Tiago R.' }],
            issued: { 'date-parts': [[2021]] },
            'container-title': 'Journal of Clinical Care',
          },
        },
      ],
    ]);
    const fakeBib = {
      raiz: path.join(__dirname, '..'),
      refs: refsMap,
      async atualizar(id, patch) {
        const cur = refsMap.get(id);
        if (cur) refsMap.set(id, { ...cur, ...patch });
      },
    };
    const fakeCfg = { estilo: 'abnt', idioma: 'pt-BR' };

    const bridge = iniciarServidorWord({
      obterBiblioteca: () => fakeBib,
      obterConfig: () => fakeCfg,
      porta: 0,
      aoSolicitarSeletorCitacao: () => {
        setTimeout(() => {
          resolverSeletorPendente({ cancelado: false, ids: ['carvalho-2021'], pagina: '12', estilo: 'abnt' });
        }, 25);
      },
    });

    await new Promise((r) => bridge.srv.once('listening', r));
    const portReal = bridge.srv.address().port;

    try {
      const rPing = await fetch(`http://127.0.0.1:${portReal}/api/word/ping`).then((r) => r.json());
      assert.strictEqual(rPing.ok, true);

      const rSel = await fetch(`http://127.0.0.1:${portReal}/api/word/seletor-citacao-interativo`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ termo: 'Carvalho', modo: 'campos' }),
      }).then((r) => r.json());

      assert.strictEqual(rSel.ok, true);
      assert(rSel.citacaoTexto.includes('2021') && rSel.citacaoTexto.includes('p. 12'), `Esperada citação com ano e p. 12, obtido: ${rSel.citacaoTexto}`);
      assert.strictEqual(rSel.codigoCampo, 'BIBLIOGRAFIA_ITEM id=carvalho-2021|p=12');
      assert.strictEqual(refsMap.get('carvalho-2021').status, 'citada', 'Status deve ser promovido automaticamente para citada');

      // Troca para APA e recalcula lote
      fakeCfg.estilo = 'apa';
      const rLote = await fetch(`http://127.0.0.1:${portReal}/api/word/atualizar-lote-campos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ campos: [{ idx: 1, codigo: rSel.codigoCampo }] }),
      }).then((r) => r.json());

      assert.strictEqual(rLote.ok, true);
      assert.strictEqual(rLote.atualizados.length, 1);
      assert(rLote.atualizados[0].citacaoTexto.includes('Carvalho') && rLote.atualizados[0].citacaoTexto.includes('2021'));
      console.log('✓ 4. Ponte HTTP interativa (/seletor-citacao-interativo + /atualizar-lote-campos) validada.');
    } finally {
      bridge.srv.close();
    }
  } finally {
    await fs.promises.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  }

  console.log('\n🎉 TODOS OS TESTES DA EXTENSÃO NATIVA WORD PASSARAM COM 100% DE SUCESSO!\n');
}

executar().catch((err) => {
  console.error(err);
  process.exit(1);
});
