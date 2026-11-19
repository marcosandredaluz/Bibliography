'use strict';

const assert = require('assert');
const { auditarManuscrito } = require('../electron/auditor.cjs');
const { reconciliarIntraDocumento } = require('../electron/intra_doc_reconciler.cjs');
const {
  NIVEIS_EVIDENCIA,
  classificarNivelEvidencia,
  gerarRaioXBibliometrico,
} = require('../electron/bibliometric_xray.cjs');

/**
 * Constroi um arquivo ZIP/OOXML valido em memoria (Stored / metodo 0)
 * para testar extracao real de <w:tbl> em word/document.xml.
 */
function calcularCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function criarDocxZipEmMemoria(entradas = []) {
  const partesLocais = [];
  const partesCentrais = [];
  let offset = 0;

  for (const { nome, conteudo } of entradas) {
    const nomeBuf = Buffer.from(nome, 'utf8');
    const dataBuf = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(String(conteudo), 'utf8');
    const crc = calcularCrc32(dataBuf);

    const local = Buffer.alloc(30 + nomeBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0, 6);
    local.writeUInt16LE(0, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(dataBuf.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nomeBuf.copy(local, 30);

    partesLocais.push(local, dataBuf);

    const central = Buffer.alloc(46 + nomeBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0, 8);
    central.writeUInt16LE(0, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(dataBuf.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nomeBuf.copy(central, 46);
    partesCentrais.push(central);

    offset += local.length + dataBuf.length;
  }

  const centralDir = Buffer.concat(partesCentrais);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entradas.length, 8);
  eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...partesLocais, centralDir, eocd]);
}

async function runTests() {
  console.log('=== Fase 2 Tests: Intra-Doc Reconciler, Multiple Citations & Bibliometric X-Ray ===');

  // 1. Teste XML <w:tbl> vs Texto + Resumo vs Resultados + Siglas sem definicao
  const xmlDocDivergente = `<?xml version="1.0" encoding="UTF-8"?>
  <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
    <w:body>
      <w:p><w:r><w:t>Tabela 1 – Cobertura vacinal ajustada na atenção primária</w:t></w:r></w:p>
      <w:tbl>
        <w:tr><w:tc><w:p><w:r><w:t>Desfecho</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Percentual</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Amostra</w:t></w:r></w:p></w:tc></w:tr>
        <w:tr><w:tc><w:p><w:r><w:t>Adesão vacinal</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>43,5%</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>n=180</w:t></w:r></w:p></w:tc></w:tr>
      </w:tbl>
    </w:body>
  </w:document>`;

  const docxBuffer = criarDocxZipEmMemoria([{ nome: 'word/document.xml', conteudo: xmlDocDivergente }]);

  const paragrafosTeste = [
    {
      numParagrafo: 1,
      numLinha: 1,
      secao: 'Resumo',
      texto:
        'Objetivo: avaliar a interoperabilidade via HL7, FHIR e RNDS no SUS e OMS. Participaram n=180 gestantes com cobertura vacinal de 38,2% segundo o protocolo NPAV.',
    },
    {
      numParagrafo: 2,
      numLinha: 5,
      secao: 'Metodologia',
      texto:
        'Foram acompanhados pacientes com Doença Pulmonar Obstrutiva Crônica (DPOC) conforme diretrizes da OMS e MS, avaliando TCLE e DPOC ao longo do seguimento.',
    },
    {
      numParagrafo: 3,
      numLinha: 9,
      secao: 'Resultados',
      texto:
        'Na amostra final (n=180), conforme observado na Tabela 1, a adesão vacinal atingiu 34,5%, contrastando com a linha de base de 43,5% esperada no período.',
    },
  ];

  // Nota: no paragrafo 3 "34,5%" diverge da celula da Tabela 1 ("43,5%"), e no Resumo "38,2%" nao consta em Resultados ("43,5%").
  const resIntra = reconciliarIntraDocumento({
    bufferDocx: docxBuffer,
    paragrafosCorpo: paragrafosTeste,
  });

  assert.strictEqual(resIntra.tabelasDetectadas, 1, 'Deve extrair 1 tabela XML do ZIP OOXML');
  assert(
    resIntra.alertasTabelas.some(
      (a) => a.codigo === 'DIVERGENCIA_TABELA_XML' && a.mensagem.includes('34,5%') && a.mensagem.includes('43,5%')
    ),
    `Deve apontar divergencia Tabela 1 (34,5% vs 43,5%), recebido: ${JSON.stringify(resIntra.alertasTabelas)}`
  );
  assert(
    resIntra.alertasResumo.some((a) => a.codigo === 'DIVERGENCIA_RESUMO_RESULTADOS' && a.mensagem.includes('38,2%')),
    `Deve apontar divergencia Resumo x Resultados para 38,2%, recebido: ${JSON.stringify(resIntra.alertasResumo)}`
  );

  const siglasFlagradas = resIntra.alertasSiglas.map((a) => a.sigla);
  assert(siglasFlagradas.includes('NPAV'), 'Deve flagrar NPAV sem definicao na primeira mencao');
  assert(siglasFlagradas.includes('TCLE'), 'Deve flagrar TCLE sem definicao na primeira mencao');
  assert(!siglasFlagradas.includes('DPOC'), 'Nao deve flagrar DPOC porque foi definida entre parenteses antes de reutilizada');
  for (const univ of ['HL7', 'FHIR', 'RNDS', 'SUS', 'OMS']) {
    assert(!siglasFlagradas.includes(univ), `Nao deve flagrar sigla universal ${univ}`);
  }
  console.log('✓ Reconciliador Intra-Documento (ZIP XML Table + Resumo x Resultados + Siglas) passed');

  // 2. Teste Piramide de Evidencia (7 niveis) & Raio-X Bibliometrico
  assert.strictEqual(NIVEIS_EVIDENCIA.length, 7);
  assert.strictEqual(
    classificarNivelEvidencia({ tituloOficial: 'A systematic review and meta-analysis of FHIR vaccination' }).nivel,
    1
  );
  assert.strictEqual(
    classificarNivelEvidencia({ tituloOficial: 'Randomized controlled trial of active immunization recall' }).nivel,
    2
  );
  assert.strictEqual(
    classificarNivelEvidencia({ tituloOficial: 'Prospective cohort study of primary care adherence' }).nivel,
    3
  );
  assert.strictEqual(
    classificarNivelEvidencia({ tituloOficial: 'Estudo transversal de prevalência vacinal em UBS' }).nivel,
    4
  );
  assert.strictEqual(
    classificarNivelEvidencia({ tituloOficial: 'Case series of adverse events after immunization' }).nivel,
    5
  );
  assert.strictEqual(
    classificarNivelEvidencia({ tituloOficial: 'Portaria MS nº 1.434 - Rede Nacional de Dados em Saúde (RNDS)' }).nivel,
    6
  );
  assert.strictEqual(
    classificarNivelEvidencia({ tituloOficial: 'Editorial perspective on public health informatics' }).nivel,
    7
  );

  const raioXUnit = gerarRaioXBibliometrico({
    refsMapeadas: [
      { chave: 'a:2024', primeiroSobrenome: 'Silva', anoBase: '2024', tituloOficial: 'Systematic review on HL7 FHIR', retratado: false },
      { chave: 'b:2022', primeiroSobrenome: 'Oliveira', anoBase: '2022', tituloOficial: 'Randomized controlled trial in PHC', retratado: true },
      { chave: 'c:2015', primeiroSobrenome: 'Costa', anoBase: '2015', tituloOficial: 'Cohort analysis of childhood vaccines', retratado: false },
      { chave: 'd:2023', primeiroSobrenome: 'Pereira', anoBase: '2023', tituloOficial: 'Portaria CONITEC sobre imunização', retratado: false },
    ],
    autoresManuscrito: ['Joao Silva', 'Ana Santos'],
    anoReferencia: 2026,
  });
  assert.strictEqual(raioXUnit.totalReferencias, 4);
  assert.strictEqual(raioXUnit.recentes5Anos, 3);
  assert.strictEqual(raioXUnit.percentualRecentes5Anos, 75);
  assert.strictEqual(raioXUnit.autocitacoes, 1);
  assert.strictEqual(raioXUnit.taxaAutocitacaoPct, 25);
  assert.strictEqual(raioXUnit.retratacoes, 1);
  console.log('✓ Classificador Piramide de Evidencia (7 niveis) & Raio-X Bibliometrico passed');

  // 3. Teste Integrado em auditarManuscrito(): Citacao Multipla com Intruso + Raio-X + XML Table
  const bibIntegrada = {
    refs: new Map([
      [
        'ref-silva-2023',
        {
          id: 'ref-silva-2023',
          status: 'citada',
          textoExtraido:
            'A systematic review and meta-analysis showed that standardized HL7 FHIR electronic immunization registries reduced vaccine dose loss by 25% and improved cold-chain traceability in primary care.',
          csl: {
            id: 'ref-silva-2023',
            type: 'article-journal',
            title: 'Systematic review on HL7 FHIR electronic immunization registries',
            author: [{ family: 'Silva', given: 'Maria' }],
            issued: { 'date-parts': [[2023]] },
            'container-title': 'Revista de Saúde Pública',
            DOI: '10.1590/rsp.2023.001',
          },
        },
      ],
      [
        'ref-intruso-2024',
        {
          id: 'ref-intruso-2024',
          status: 'citada',
          textoExtraido:
            'Titanium alloy corrosion resistance and microstructural fatigue performance in supersonic aerospace gas turbines under extreme thermal stress.',
          csl: {
            id: 'ref-intruso-2024',
            type: 'article-journal',
            title: 'Metallurgical fatigue of titanium alloys in aerospace turbines',
            author: [{ family: 'Intruso', given: 'Carlos' }],
            issued: { 'date-parts': [[2024]] },
            'container-title': 'Aerospace Materials Journal',
            DOI: '10.1016/j.aero.2024.099',
          },
        },
      ],
    ]),
  };

  const textoManuscrito = [
    'Resumo',
    'A interoperabilidade digital via registros eletrônicos padronizados reduziu perdas de doses vacinais na atenção primária.',
    '',
    'Resultados',
    'De acordo com a Tabela 1, a implantação de registros eletrônicos padronizados reduziu em 25% a perda de doses vacinais na atenção primária (SILVA, 2023; INTRUSO, 2024). Neste mesmo segmento, o indicador XPTZ apresentou elevação expressiva sem base prévia, totalizando 34,5% de ganho operacional.',
    '',
    'Referências',
    'SILVA, Maria. Systematic review on HL7 FHIR electronic immunization registries. Revista de Saúde Pública, 2023. DOI: 10.1590/rsp.2023.001.',
    'INTRUSO, Carlos. Metallurgical fatigue of titanium alloys in aerospace turbines. Aerospace Materials Journal, 2024. DOI: 10.1016/j.aero.2024.099.',
  ].join('\n');

  const resAudit = await auditarManuscrito({
    texto: textoManuscrito,
    biblioteca: bibIntegrada,
    buscarEBaixar: false,
    somenteLeitura: true,
    xmlDocument: xmlDocDivergente,
    autoresManuscrito: ['Maria Silva'],
    anoReferencia: 2026,
  });

  assert(
    Array.isArray(resAudit.alertasCitacoesMultiplas) && resAudit.alertasCitacoesMultiplas.length === 1,
    `Deve detectar exatamente 1 alerta de citacao multipla com intruso, recebido: ${JSON.stringify(resAudit.alertasCitacoesMultiplas)}`
  );
  const alMulti = resAudit.alertasCitacoesMultiplas[0];
  assert(alMulti.obrasIntrusas.some((x) => /INTRUSO/i.test(x)), 'Intruso deve ser explicitamente identificado');
  assert(alMulti.obrasSustentam.some((x) => /SILVA/i.test(x)), 'Silva (2023) deve ser reconhecido como obra que sustenta');

  assert(resAudit.resumoIntraDocumento?.tabelasDetectadas === 1, 'auditarManuscrito deve expor resumoIntraDocumento com 1 tabela XML');
  assert(
    resAudit.alertasIntraDocumento.some((a) => a.codigo === 'DIVERGENCIA_TABELA_XML'),
    'auditarManuscrito deve expor divergencia da Tabela 1 XML em alertasIntraDocumento'
  );
  assert(
    resAudit.alertasIntraDocumento.some((a) => a.codigo === 'SIGLA_SEM_DEFINICAO' && a.sigla === 'XPTZ'),
    'auditarManuscrito deve detectar sigla XPTZ sem definicao'
  );
  assert(resAudit.raioXBibliometrico?.totalReferencias === 2, 'auditarManuscrito deve retornar raioXBibliometrico consolidado');
  assert.strictEqual(resAudit.raioXBibliometrico.percentualRecentes5Anos, 100);
  assert.strictEqual(resAudit.raioXBibliometrico.taxaAutocitacaoPct, 50);

  console.log('✓ auditarManuscrito Fase 2 integration (Multiple Citations + XML Table + Acronyms + Bibliometric X-Ray) passed');
  console.log('ALL FASE 2 TESTS PASSED');
}

runTests().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
