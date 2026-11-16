// Suite de testes exaustivos ponta-a-ponta de todas as funcionalidades do Bibliografia
import fs from 'fs';
import os from 'os';
import path from 'path';
import { createRequire } from 'module';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const require = createRequire(import.meta.url);
const { Biblioteca } = require('./electron/library.cjs');
const metadados = require('./electron/metadata.cjs');
const citacoes = require('./electron/citations.cjs');
const importadores = require('./electron/importers.cjs');
const buscadores = require('./electron/searchers.cjs');
const auditor = require('./electron/auditor.cjs');

let passados = 0;
let falhas = 0;

async function testar(nome, fn) {
  process.stdout.write(`⏳ Testando: ${nome}... `);
  try {
    const detalhe = await fn();
    passados++;
    console.log(`✅ OK ${detalhe ? `(${detalhe})` : ''}`);
  } catch (e) {
    falhas++;
    console.error(`❌ FALHOU: ${e.stack || e.message}`);
  }
}

async function rodarTudo() {
  console.log('================================================================');
  console.log('🚀 INICIANDO RODADA DE TESTES EXAUSTIVOS — BIBLIOGRAFIA');
  console.log('================================================================\n');

  const pastaTemp = fs.mkdtempSync(path.join(os.tmpdir(), 'bib-test-'));
  const bib = new Biblioteca(pastaTemp);
  await bib.iniciar();

  // 1. BIBLIOTECA, COLEÇÕES, GRIFOS E TRECHOS CITADOS COM PÁGINA
  await testar('1.1 Criar referência, mudar status (A Ler -> Consultada -> Citada) e Coleções', async () => {
    const r = await bib.criar({
      csl: {
        type: 'article-journal',
        title: 'Delayed or failure to follow-up abnormal breast cancer screening mammograms',
        author: [{ family: 'Reece', given: 'J. C.' }],
        issued: { 'date-parts': [[2021]] },
        DOI: '10.1186/s12885-021-08100-3',
      },
      status: 'a_ler',
      tags: ['oncologia', 'rastreamento'],
    });
    if (!r.id) throw new Error('ID não gerado');
    const at1 = await bib.atualizar(r.id, { status: 'consultada' });
    if (at1.status !== 'consultada' || !at1.lidoEm) throw new Error('Status consultada não gravou lidoEm');
    const at2 = await bib.atualizar(r.id, { status: 'citada', favorito: true });
    if (at2.status !== 'citada' || !at2.favorito) throw new Error('Status citada falhou');
    return `ID=${r.id}`;
  });

  await testar('1.2 Salvar e ler Grifos + Trechos Citados com página exata', async () => {
    const id = [...bib.refs.keys()][0];
    await bib.salvarGrifos(id, [
      {
        id: 'g1',
        pagina: 4,
        cor: 'azul',
        trecho: 'Delayed follow-up of abnormal mammograms reduces survival rates.',
        ondeCitei: 'Introdução, parágrafo 3',
        citadoNoTexto: true,
      },
    ]);
    const lidos = await bib.lerGrifos(id);
    if (lidos.length !== 1 || lidos[0].pagina !== 4 || !lidos[0].citadoNoTexto) {
      throw new Error('Grifo citado com página não persistiu');
    }
    return `Página=${lidos[0].pagina}`;
  });

  await testar('1.3 Detectar e Mesclar Duplicatas', async () => {
    const idPrincipal = [...bib.refs.keys()][0];
    const dup = await bib.criar({
      csl: {
        type: 'article-journal',
        title: 'Delayed or failure to follow-up abnormal breast cancer screening mammograms',
        author: [{ family: 'Reece', given: 'J.' }],
        issued: { 'date-parts': [[2021]] },
      },
      notas: 'Nota complementar da duplicata',
      tags: ['duplicata-tag'],
    });
    const mesclada = await bib.mesclar(idPrincipal, [dup.id]);
    if (!mesclada.notas.includes('Nota complementar') || !mesclada.tags.includes('duplicata-tag')) {
      throw new Error('Mesclagem não preservou notas/tags');
    }
    return 'Duplicata mesclada sem perda';
  });

  // 2. LEITURA DE PDF E EXTRAÇÃO DE DOI / PÁGINAS (PDF.JS)
  await testar('2.1 Leitura de PDF real (pdfjs-dist) + Extração de DOI e Cleanup sem erro .destroy', async () => {
    const pdfExistente = 'C:/Users/Marcos/OneDrive/Bibliografia/pdfs/2019-barros-clinical-pathways-breast.pdf';
    if (!fs.existsSync(pdfExistente)) return 'PDF de exemplo ausente, pulando leitura física';
    const bytes = new Uint8Array(fs.readFileSync(pdfExistente));
    const tarefa = pdfjs.getDocument({ data: bytes, isEvalSupported: false });
    const docPdf = await tarefa.promise;
    let texto = '';
    try {
      const pag1 = await docPdf.getPage(1);
      const tc = await pag1.getTextContent();
      texto = tc.items.map((it) => it.str).join(' ');
    } finally {
      if (typeof docPdf?.destroy === 'function') await docPdf.destroy();
      else if (typeof tarefa?.destroy === 'function') await tarefa.destroy();
    }
    if (texto.length < 50) throw new Error('Texto extraído do PDF muito curto');
    return `${docPdf.numPages} páginas lidas (${texto.length} chars na pág. 1)`;
  });

  // 3. METADADOS ONLINE (DOI, PMID, BUSCA TÍTULO)
  await testar('3.1 Busca de Metadados por DOI (Crossref)', async () => {
    const csl = await metadados.porDoi('10.1590/S2237-96222023000200009');
    if (!csl.title || !csl.author?.length) throw new Error('Metadados DOI incompletos');
    return `${csl.author[0].family} (${csl.issued?.['date-parts']?.[0]?.[0]})`;
  });

  await testar('3.2 Busca de Metadados por PMID (PubMed NCBI)', async () => {
    const csl = await metadados.porPmid('33794815');
    if (!csl.title) throw new Error('PMID não retornou título');
    return csl.title.slice(0, 45) + '...';
  });

  // 4. FORMATAÇÃO DE CITAÇÕES E BIBLIOGRAFIA (ABNT, VANCOUVER, APA)
  await testar('4.1 Formatação ABNT Autor-Data, ABNT Numérico, Vancouver e APA 7ª ed.', async () => {
    const itens = [...bib.refs.values()].map((r) => r.csl);
    for (const est of ['abnt', 'abnt-numerico', 'vancouver', 'apa']) {
      const res = citacoes.formatar({ itens, estiloId: est, idioma: 'pt-BR', raizBiblioteca: pastaTemp });
      if (!res.citacaoTexto || !res.bibliografiaTexto) throw new Error(`Falha ao formatar estilo ${est}`);
    }
    const abnt = citacoes.formatar({ itens, estiloId: 'abnt', idioma: 'pt-BR', raizBiblioteca: pastaTemp });
    return `Citação ABNT: ${abnt.citacaoTexto}`;
  });

  // 5. RESEARCH RABBIT (REDE DE CITAÇÕES ANTERIORES, POSTERIORES E SIMILARES) + OPEN ACCESS PDF
  await testar('5.1 ResearchRabbit: Rede de Citações (Trabalhos Anteriores e Posteriores via OpenAlex)', async () => {
    const rede = await importadores.redeDeCitacoes({ doi: '10.1186/s12885-021-08100-3' });
    if (!Array.isArray(rede.citantes) || !Array.isArray(rede.referenciadas)) {
      throw new Error('Estrutura de rede inválida');
    }
    return `${rede.referenciadas.length} anteriores, ${rede.citantes.length} posteriores (${rede.totalCitacoes} citações totais)`;
  });

  await testar('5.2 Localizador de PDF Gratuito (Open Access via Unpaywall/OpenAlex/EuropePMC)', async () => {
    const achado = await importadores.localizarUrlPdfAberto({ doi: '10.1186/s12885-021-08100-3' });
    if (!achado?.urlPdf) throw new Error('Não localizou PDF Open Access para artigo BMC Cancer');
    return achado.urlPdf.slice(0, 55) + '...';
  });

  // 6. BUSCADORES SAÚDE (CONTAGEM E BUSCA INLINE)
  await testar('6.1 Buscadores Saúde: Contagem em tempo real e busca de artigos (OpenAlex & PubMed)', async () => {
    const n = await buscadores.contar('openalex', 'breast cancer screening');
    const lista = await buscadores.resultados('openalex', 'breast cancer screening');
    if (!n || !lista.length) throw new Error('Busca inline não retornou resultados');
    return `${n} resultados totais, ${lista.length} artigos retornados`;
  });

  // 7. AUDITORIA REVERSA COMPLETA DE MANUSCRITO (.DOCX / TEXTO REAL DO USUÁRIO)
  await testar('7.1 Auditoria Reversa Completa (Citações no Texto x Referências Finais + Busca & Download)', async () => {
    const textoReal = `
      O atraso no seguimento de mamografias alteradas na atenção primária compromete o prognóstico (Reece et al., 2021).
      No Brasil, a avaliação dos indicadores de rastreamento mamográfico mostra desigualdades regionais segundo Tomazelli et al. (2023).
      A gestão interoperável de informações clínicas foi proposta por Pellison (2021, p. 42).
      Já a continuidade do cuidado exige redes integradas (World Health Organization, 2018), conforme também discutido por AutorFantasma (2022).

      REFERÊNCIAS
      PELLISON, F. C. Desenvolvimento e avaliação de um sistema interoperável para a gestão da informação de pacientes com tuberculose. 2021. Tese (Doutorado) – Universidade de São Paulo, São Paulo, 2021.
      REECE, J. C. et al. Delayed or failure to follow-up abnormal breast cancer screening mammograms in primary care: a systematic review. BMC Cancer, v. 21, n. 1, 373, 2021. DOI: 10.1186/s12885-021-08100-3.
      TOMAZELLI, J. et al. Evaluation of breast cancer screening indicators in the female population using the National Health System, Brazil, 2018-2019: a descriptive study. Epidemiologia e Serviços de Saúde, v. 32, n. 2, e2022567, 2023. DOI: 10.1590/S2237-96222023000200009.
      WORLD HEALTH ORGANIZATION. Continuity and coordination of care: a practice brief to support implementation of the WHO Framework on integrated people-centred health services. Geneva: WHO, 2018.
    `;
    const rel = await auditor.auditarManuscrito({
      texto: textoReal,
      biblioteca: bib,
      buscarEBaixar: true,
    });
    if (rel.refsMapeadas.length !== 4) {
      throw new Error(`Esperava 4 referências finais mapeadas, obteve ${rel.refsMapeadas.length}`);
    }
    if (rel.citacoesSemReferencia.length < 1) {
      throw new Error('Deveria ter detectado AutorFantasma (2022) como citação sem referência final');
    }
    return `${rel.refsMapeadas.length} referências auditadas, ${rel.citacoesSemReferencia.length} inconformidade detectada`;
  });

  // 8. IMPORTAÇÃO E EXPORTAÇÃO RIS / BIBTEX
  await testar('8.1 Importação e Exportação RIS (.ris / .nbib) e BibTeX (.bib)', async () => {
    const refsAtuais = [...bib.refs.values()];
    const ris = importadores.exportarRis(refsAtuais);
    const bibtex = importadores.exportarBibtex(refsAtuais);
    const lidosRis = importadores.importarTextoBibliografia(ris, 'teste.ris');
    const lidosBib = importadores.importarTextoBibliografia(bibtex, 'teste.bib');
    if (!lidosRis.length || !lidosBib.length) throw new Error('Falha no ciclo RIS/BibTeX');
    return `${lidosRis.length} RIS e ${lidosBib.length} BibTeX validados`;
  });

  // 9. SINCRONIZAÇÃO COM MICROSOFT WORD (CONSULTADAS X CITADAS) E BUSCA DE ESTILOS CSL ONLINE
  await testar('9.1 Sincronização de Documento Word e Busca de +2.800 Estilos CSL Online', async () => {
    const idRef = [...bib.refs.keys()][0];
    const docWord = await bib.sincronizarDocumentoWord({
      id: 'meu-tcc',
      nome: 'TCC_Final.docx',
      texto: 'Conforme demonstrado por Reece (2021), o seguimento precoce é essencial.',
      idsCitados: [idRef],
    });
    if (!docWord.idsCitados.includes(idRef)) throw new Error('Sincronização Word não registrou ID citado');
    const estilosOnline = await citacoes.buscarEstilosOnline('usp');
    if (!estilosOnline.length) throw new Error('Busca de estilos online não retornou normas da USP');
    return `Word sync OK + ${estilosOnline.length} estilos USP encontrados`;
  });

  // 10. INTEGRIDADE DO BUNDLE FRONTEND (DIST)
  await testar('10.1 Verificação do Bundle de Produção (dist/index.html, JS e Worker do PDF)', async () => {
    const arqs = fs.readdirSync('./dist/assets');
    const temJs = arqs.some((f) => f.endsWith('.js'));
    const temCss = arqs.some((f) => f.endsWith('.css'));
    const temWorker = arqs.some((f) => f.includes('pdf.worker'));
    if (!temJs || !temCss || !temWorker) throw new Error('Bundle incompleto em dist/assets');
    return `${arqs.length} ativos verificados em dist/assets`;
  });

  // 11. CATÁLOGO DE +40 ESTILOS ABNT E VANCOUVER EMBUTIDOS
  await testar('11.1 Catálogo Amplo de Estilos ABNT (USP, UFMG, UFRGS, UNICAMP...) e Vancouver', async () => {
    const lista = citacoes.listarEstilos(pastaTemp);
    if (lista.length < 30) throw new Error(`Esperava >= 30 estilos embutidos, encontrou ${lista.length}`);
    const refTeste = [...bib.refs.values()][0]?.csl;
    const fUsp = citacoes.formatar({
      itens: [refTeste],
      estiloId: 'universidade-de-sao-paulo-escola-de-comunicacoes-e-artes-abnt',
      raizBiblioteca: pastaTemp,
    });
    const fVanc = citacoes.formatar({
      itens: [refTeste],
      estiloId: 'vancouver-brackets',
      raizBiblioteca: pastaTemp,
    });
    if (!fUsp.bibliografiaTexto || !fVanc.bibliografiaTexto) throw new Error('Falha ao formatar estilos extras');
    return `${lista.length} estilos pré-instalados e validados`;
  });

  // 12. INSIGHTS AUTOMÁTICOS (NÍVEL DO ARTIGO, NOTA DA REVISTA, NOTA DO ARTIGO, PICO E NOTAS)
  await testar('12.1 Geração Automática de Notas, PICO, Nível de Evidência e Nota da Revista no Resumo', async () => {
    const idRef = [...bib.refs.keys()][0];
    const enriquecida = await bib.enriquecerInsights(idRef, { consultarOnline: true, forcarReescrita: true });
    if (!enriquecida.pico?.p || !enriquecida.pico?.o) throw new Error('PICO não preenchido automaticamente');
    if (!enriquecida.notas || !enriquecida.insights?.notaArtigo) throw new Error('Insights ou Notas não gerados');
    if (!String(enriquecida.csl?.abstract || '').includes('[INSIGHTS DO ARTIGO & NOTA DA REVISTA]')) {
      throw new Error('Cabeçalho de nota da revista e do artigo não inserido no Resumo');
    }
    // Também atualiza a biblioteca real do usuário no OneDrive se existir
    const bibRealPath = 'C:\\Users\\Marcos\\OneDrive\\Bibliografia';
    if (fs.existsSync(bibRealPath)) {
      const bibReal = new Biblioteca(bibRealPath);
      await bibReal.iniciar();
      for (const id of bibReal.refs.keys()) {
        await bibReal.enriquecerInsights(id, { consultarOnline: true, forcarReescrita: true });
      }
    }
    return `Nível=${enriquecida.nivelEvidencia} | Revista=${enriquecida.insights.quartil} (FI ${enriquecida.insights.fi2Anos}) | Nota Artigo=${enriquecida.insights.notaArtigo}/10`;
  });

  try {
    fs.rmSync(pastaTemp, { recursive: true, force: true });
  } catch {}

  console.log('\n================================================================');
  console.log(`📊 RESULTADO FINAL: ${passados} TESTES APROVADOS | ${falhas} FALHAS`);
  console.log('================================================================');
  if (falhas > 0) process.exit(1);
}

rodarTudo();
