'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { auditarManuscrito } = require('../electron/auditor.cjs');
const {
  NOME_ARQUIVO_DECISOES,
  gerarAssinaturaDecisao,
  carregarDecisoesEditoriais,
  salvarDecisaoEditorial,
} = require('../electron/audit/decision_memory.cjs');
const { PERFIS_EDITORIAIS, executarPreflightEditorial } = require('../electron/editorial_preflight.cjs');
const {
  criarZipBuffer,
  lerEntradasZip,
  gerarPacoteSubmissaoZip,
} = require('../electron/submission_packager.cjs');

async function runTests() {
  console.log('=== Fase 4 Tests: Editorial Decision Memory, Pre-Flight & Submission Packager ===');
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bib-fase4-'));

  try {
    // ------------------------------------------------------------------
    // 1. Memória de Decisão Editorial (SHA-256) + Reativação ao editar 1 palavra
    // ------------------------------------------------------------------
    const fraseOriginal =
      'Na amostra final, o indicador XPTZ apresentou elevação expressiva sem base prévia (SILVA, 2023).';
    const fraseAlterada1Palavra =
      'Na amostra revisada, o indicador XPTZ apresentou elevação expressiva sem base prévia (SILVA, 2023).';

    const h1 = gerarAssinaturaDecisao({
      fraseManuscrito: fraseOriginal,
      referenciaId: 'XPTZ',
      codigoAlerta: 'SIGLA_SEM_DEFINICAO',
    });
    const h1Repetido = gerarAssinaturaDecisao({
      fraseManuscrito: `  ${fraseOriginal}  `,
      referenciaId: 'xptz',
      codigoAlerta: 'sigla_sem_definicao',
    });
    const h2 = gerarAssinaturaDecisao({
      fraseManuscrito: fraseAlterada1Palavra,
      referenciaId: 'XPTZ',
      codigoAlerta: 'SIGLA_SEM_DEFINICAO',
    });

    assert.strictEqual(h1.length, 64, 'Assinatura deve ser SHA-256 hexadecimal de 64 caracteres');
    assert.strictEqual(h1, h1Repetido, 'Assinatura SHA-256 deve ser determinística após normalização');
    assert.notStrictEqual(h1, h2, 'Alterar 1 palavra da frase deve alterar imediatamente o hash SHA-256');

    const bibSimples = {
      refs: new Map([
        [
          'ref-silva-2023',
          {
            id: 'ref-silva-2023',
            status: 'citada',
            textoExtraido: 'Estudo sobre indicadores assistenciais na atenção primária à saúde.',
            csl: {
              id: 'ref-silva-2023',
              type: 'article-journal',
              title: 'Indicadores assistenciais na atenção primária',
              author: [{ family: 'Silva', given: 'Maria' }],
              issued: { 'date-parts': [[2023]] },
              DOI: '10.1590/teste.2023.001',
            },
          },
        ],
      ]),
    };

    const montarManuscrito = (frase) =>
      [
        'Resumo',
        'Objetivo: avaliar indicadores assistenciais.',
        '',
        'Resultados',
        frase,
        '',
        'Referências',
        'SILVA, Maria. Indicadores assistenciais na atenção primária. Revista Teste, 2023. DOI: 10.1590/teste.2023.001.',
      ].join('\n');

    // Execução 1 (sem decisão salva): alerta de sigla XPTZ deve estar ativo
    const resSemDecisao = await auditarManuscrito({
      texto: montarManuscrito(fraseOriginal),
      biblioteca: bibSimples,
      buscarEBaixar: false,
      somenteLeitura: true,
      pastaProjeto: tmpDir,
    });
    const alertaXptz = resSemDecisao.alertasIntraDocumento.find((a) => a.sigla === 'XPTZ');
    assert(alertaXptz, 'Alerta XPTZ deve estar ativo antes de salvar decisão editorial');
    assert.strictEqual(resSemDecisao.totalAlertasSuprimidosEditorial, 0);

    // Salva decisão atômica em auditoria_decisoes.json
    const salvo = salvarDecisaoEditorial(tmpDir, {
      fraseManuscrito: alertaXptz.fraseWord,
      referenciaId: 'XPTZ',
      codigoAlerta: alertaXptz.codigo,
      justificativa: 'Sigla operacional interna mantida intencionalmente para relatório.',
    });
    assert.strictEqual(salvo.ok, true);
    assert(fs.existsSync(path.join(tmpDir, NOME_ARQUIVO_DECISOES)), 'auditoria_decisoes.json deve ser gravado na pasta do projeto');
    const recarregado = carregarDecisoesEditoriais(tmpDir);
    assert(recarregado.decisoes[salvo.hash], 'Decisão salva deve ser recarregada do disco');

    // Execução 2 (mesma frase): alerta XPTZ deve ser suprimido automaticamente
    const resComDecisao = await auditarManuscrito({
      texto: montarManuscrito(fraseOriginal),
      biblioteca: bibSimples,
      buscarEBaixar: false,
      somenteLeitura: true,
      pastaProjeto: tmpDir,
    });
    assert(
      !resComDecisao.alertasIntraDocumento.some((a) => a.sigla === 'XPTZ'),
      'Alerta XPTZ deve ser suprimido quando assinatura SHA-256 consta em auditoria_decisoes.json'
    );
    assert.strictEqual(resComDecisao.totalAlertasSuprimidosEditorial, 1, 'Deve contabilizar exatamente 1 alerta suprimido');

    // Execução 3 (1 palavra alterada na frase): alerta XPTZ deve ser REATIVADO automaticamente
    const resFraseEditada = await auditarManuscrito({
      texto: montarManuscrito(fraseAlterada1Palavra),
      biblioteca: bibSimples,
      buscarEBaixar: false,
      somenteLeitura: true,
      pastaProjeto: tmpDir,
    });
    assert(
      resFraseEditada.alertasIntraDocumento.some((a) => a.sigla === 'XPTZ'),
      'Alterar 1 palavra da frase deve reativar imediatamente o alerta XPTZ'
    );
    assert.strictEqual(resFraseEditada.totalAlertasSuprimidosEditorial, 0);
    console.log('✓ Memória de Decisão Editorial (SHA-256 + supressão + reativação ao editar 1 palavra) passed');

    // ------------------------------------------------------------------
    // 2. Perfil de Periódico Alvo / Pre-Flight Editorial
    // ------------------------------------------------------------------
    assert(PERFIS_EDITORIAIS.icmje_vancouver && PERFIS_EDITORIAIS.saude_coletiva_br && PERFIS_EDITORIAIS.personalizado);

    const textoExcedido = [
      'Resumo',
      'palavra '.repeat(280),
      'Introdução',
      'texto '.repeat(120) + ' Conforme Tabela 1, Tabela 2, Tabela 3, Figura 1, Figura 2 e Quadro 1.',
      'Referências',
      ...Array.from({ length: 45 }, (_, i) => `AUTOR${i + 1}, A. Artigo ${i + 1}. 2024.`),
    ].join('\n');

    const preIcmje = executarPreflightEditorial({
      texto: textoExcedido,
      perfilId: 'icmje_vancouver',
    });
    assert.strictEqual(preIcmje.resumo.aprovado, false, 'Manuscrito excedendo limites e sem ética deve reprovar no ICMJE');
    assert.strictEqual(preIcmje.itens.find((i) => i.id === 'palavras_resumo').status, 'excedido');
    assert.strictEqual(preIcmje.itens.find((i) => i.id === 'max_referencias').status, 'excedido');
    assert.strictEqual(preIcmje.itens.find((i) => i.id === 'max_tabelas_figuras').status, 'excedido');
    assert.strictEqual(preIcmje.itens.find((i) => i.id === 'declaracao_cep_caae').status, 'excedido');
    assert.strictEqual(preIcmje.itens.find((i) => i.id === 'declaracao_conflito').status, 'excedido');
    assert.strictEqual(preIcmje.itens.find((i) => i.id === 'disponibilidade_dados').status, 'excedido');

    const textoConforme = [
      'Resumo',
      'Objetivo: avaliar a interoperabilidade em saúde pública na atenção primária brasileira com foco em cobertura vacinal.',
      'Métodos',
      'Estudo observacional transversal aprovado pelo Comitê de Ética em Pesquisa (CEP/CONEP), CAAE 1234567890123456. Os resultados estão sintetizados na Tabela 1 e Figura 1.',
      'Resultados',
      'A cobertura atingiu 92,4% com redução significativa de perdas.',
      'Declarações',
      'Conflito de interesses: Os autores declaram não haver conflitos de interesse. Financiamento: Apoio financeiro CAPES. Disponibilidade de dados: Os dados da pesquisa estão disponíveis em repositório público SciELO Data.',
      'Referências',
      'SILVA, M. Interoperabilidade no SUS. 2024.',
      'SOUZA, J. Cobertura vacinal. 2023.',
    ].join('\n');

    const preCsp = executarPreflightEditorial({
      texto: textoConforme,
      perfilId: 'saude_coletiva_br',
    });
    assert.strictEqual(preCsp.resumo.aprovado, true, `Manuscrito conforme deve aprovar no perfil Saúde Coletiva Brasil: ${JSON.stringify(preCsp.itens)}`);
    assert.strictEqual(preCsp.metricas.caae, '1234567890123456');
    console.log('✓ Pre-Flight Editorial (ICMJE/Vancouver + Saúde Coletiva Brasil + limites + declarações éticas) passed');

    // ------------------------------------------------------------------
    // 3. Gerador de Pacote de Submissão (.zip) com Limpeza Double-Blind do .docx
    // ------------------------------------------------------------------
    const docXmlComCampos = `<?xml version="1.0" encoding="UTF-8"?>
    <w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
      <w:body>
        <w:p>
          <w:r><w:t>Resultado validado </w:t></w:r>
          <w:r><w:fldChar w:fldCharType="begin"/></w:r>
          <w:r><w:instrText xml:space="preserve"> ADDIN BIBLIOGRAFIA_CSL {"id":"ref-1"} </w:instrText></w:r>
          <w:r><w:fldChar w:fldCharType="separate"/></w:r>
          <w:r><w:t>(SILVA, 2023)</w:t></w:r>
          <w:r><w:fldChar w:fldCharType="end"/></w:r>
          <w:fldSimple w:instr=" PAGE "><w:r><w:t>1</w:t></w:r></w:fldSimple>
        </w:p>
      </w:body>
    </w:document>`;

    const coreXmlComAutor = `<?xml version="1.0" encoding="UTF-8"?>
    <cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/">
      <dc:title>Artigo Original</dc:title>
      <dc:creator>Dr. Fulano de Tal</dc:creator>
      <cp:lastModifiedBy>Dra. Sicrana Pesquisadora</cp:lastModifiedBy>
      <cp:keywords>sigiloso</cp:keywords>
    </cp:coreProperties>`;

    const appXmlComInstituicao = `<?xml version="1.0" encoding="UTF-8"?>
    <Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties">
      <Company>Universidade Secreta de Exemplo</Company>
      <Manager>Chefe de Departamento</Manager>
    </Properties>`;

    const docxOriginalBuf = criarZipBuffer([
      { nome: 'word/document.xml', conteudo: docXmlComCampos },
      { nome: 'docProps/core.xml', conteudo: coreXmlComAutor },
      { nome: 'docProps/app.xml', conteudo: appXmlComInstituicao },
      { nome: 'word/comments.xml', conteudo: '<w:comments><w:comment w:author="Dr. Fulano"/></w:comments>' },
    ]);

    const caminhoZipSaida = path.join(tmpDir, 'Pacote_Submissao_Teste.zip');
    const resPacote = gerarPacoteSubmissaoZip({
      bufferDocx: docxOriginalBuf,
      caminhoSaidaZip: caminhoZipSaida,
      limparDocxCego: true,
      incluirPrismaRobSvg: true,
      incluirResumoAuditoria: true,
      metricasPrisma: { identificados: 120, duplicatasRemovidas: 20, triados: 100, excluidos: 65, incluidos: 35 },
      avaliacoesRob: [
        { julgamentoGeral: 'Baixo risco' },
        { julgamentoGeral: 'Algumas preocupações' },
        { julgamentoGeral: 'Alto risco' },
      ],
      resumoAuditoria: {
        totalReferencias: 35,
        totalCitacoes: 72,
        totalInconformidades: 0,
        totalSuprimidos: 1,
        perfilEditorial: 'Saúde Coletiva Brasil (CSP / RSP / C&SC)',
      },
      nomeBase: 'Manuscrito_Teste',
    });

    assert.strictEqual(resPacote.ok, true);
    assert(fs.existsSync(caminhoZipSaida), 'Arquivo .zip deve ser gravado em disco');

    const entradasZip = lerEntradasZip(fs.readFileSync(caminhoZipSaida));
    const nomesNoZip = entradasZip.map((e) => e.nome);
    assert(nomesNoZip.includes('Manuscrito_Teste_Revisao_Cega.docx'), 'Pacote deve conter cópia limpa do .docx');
    assert(nomesNoZip.includes('Figuras/PRISMA_2020_Fluxograma.svg'), 'Pacote deve conter PRISMA 2020 em SVG');
    assert(nomesNoZip.includes('Figuras/Risco_de_Vies_RoB2_ROBINSI.svg'), 'Pacote deve conter gráfico RoB em SVG');
    assert(nomesNoZip.includes('Resumo_Conformidade_Auditoria.md'), 'Pacote deve conter resumo técnico de conformidade');

    // Inspeciona o .docx interno limpo para revisão cega
    const docxLimpoEntry = entradasZip.find((e) => e.nome === 'Manuscrito_Teste_Revisao_Cega.docx');
    const entradasDocxLimpo = lerEntradasZip(docxLimpoEntry.conteudo);
    const docXmlLimpo = entradasDocxLimpo.find((e) => e.nome === 'word/document.xml').conteudo.toString('utf8');
    const coreXmlLimpo = entradasDocxLimpo.find((e) => e.nome === 'docProps/core.xml').conteudo.toString('utf8');
    const appXmlLimpo = entradasDocxLimpo.find((e) => e.nome === 'docProps/app.xml').conteudo.toString('utf8');

    assert(!docXmlLimpo.includes('<w:fldChar'), 'Campos dinâmicos <w:fldChar> devem ser removidos');
    assert(!docXmlLimpo.includes('<w:instrText'), 'Instruções <w:instrText> devem ser removidas');
    assert(!docXmlLimpo.includes('<w:fldSimple'), 'Campos <w:fldSimple> devem ser convertidos em texto plano');
    assert(docXmlLimpo.includes('(SILVA, 2023)'), 'Texto visível da citação deve ser preservado');

    assert(!coreXmlLimpo.includes('Dr. Fulano de Tal'), 'Nome do autor (dc:creator) deve ser removido');
    assert(!coreXmlLimpo.includes('Dra. Sicrana Pesquisadora'), 'Último editor (cp:lastModifiedBy) deve ser removido');
    assert(!appXmlLimpo.includes('Universidade Secreta'), 'Empresa/instituição (Company) deve ser removida');
    assert(!entradasDocxLimpo.some((e) => e.nome === 'word/comments.xml'), 'word/comments.xml deve ser removido para revisão cega');

    const prismaSvg = entradasZip.find((e) => e.nome === 'Figuras/PRISMA_2020_Fluxograma.svg').conteudo.toString('utf8');
    assert(prismaSvg.includes('<svg') && prismaSvg.includes('n = 120') && prismaSvg.includes('n = 35'), 'SVG PRISMA deve refletir métricas reais');

    console.log('✓ Gerador de Pacote de Submissão (.zip + limpeza double-blind .docx + SVGs PRISMA/RoB + resumo) passed');
    console.log('ALL FASE 4 TESTS PASSED');
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
}

runTests().catch((err) => {
  console.error('FAILED:', err);
  process.exit(1);
});
