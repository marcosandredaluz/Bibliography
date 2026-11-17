/**
 * electron/corrupcao_biomedica_detector.cjs
 * 
 * Detector Forense de Corrupção Genômica e Erros de Planilha em Nomenclatura Científica.
 * Inspirado nas investigações de Ziemann et al. (Genome Biology 2016, 2021) e
 * nas diretrizes de padronização do HUGO Gene Nomenclature Committee (HGNC).
 * 
 * Funcionalidade:
 * - Detecta símbolos de genes convertidos indevidamente em datas pelo Microsoft Excel / planilhas
 *   (ex: SEPT2 -> 2-Sep / Set-02; MARCH1 -> 1-Mar; DEC1 -> 1-Dec).
 * - Identifica se a ocorrência está em contexto biológico/molecular ou tabelas de dados.
 * - Fornece a nomenclatura canônica oficial atualizada HGNC.
 */

'use strict';

/**
 * Mapeamento canônico de conversões errôneas conhecidas de símbolos gênicos
 */
const GENES_VULNERAVEIS_EXCEL = [
  {
    regex: /\b(?:1[-/]Mar|Mar[-/]01|01[-/]03|1[-/]Mar[çc]o)\b/gi,
    geneCorrompido: 'MARCH1',
    geneAtualHgnc: 'MARCHF1',
    nomeCompleto: 'Membrane Associated Ring-CH-Type Finger 1',
    motivo: 'O gene MARCH1 é frequentemente convertido na data "1-Mar" pelo software de planilhas.'
  },
  {
    regex: /\b(?:2[-/]Mar|Mar[-/]02|02[-/]03|2[-/]Mar[çc]o)\b/gi,
    geneCorrompido: 'MARCH2',
    geneAtualHgnc: 'MARCHF2',
    nomeCompleto: 'Membrane Associated Ring-CH-Type Finger 2',
    motivo: 'O gene MARCH2 é convertido na data "2-Mar".'
  },
  {
    regex: /\b(?:8[-/]Mar|Mar[-/]08|08[-/]03|8[-/]Mar[çc]o)\b/gi,
    geneCorrompido: 'MARCH8',
    geneAtualHgnc: 'MARCHF8',
    nomeCompleto: 'Membrane Associated Ring-CH-Type Finger 8',
    motivo: 'O gene MARCH8 é convertido na data "8-Mar".'
  },
  {
    regex: /\b(?:1[-/]Sep|Sep[-/]01|01[-/]09|1[-/]Set|Set[-/]01|1[-/]Setembro)\b/gi,
    geneCorrompido: 'SEPT1',
    geneAtualHgnc: 'SEPTIN1',
    nomeCompleto: 'Septin 1',
    motivo: 'O gene SEPT1 é convertido na data "1-Sep" pelo Excel.'
  },
  {
    regex: /\b(?:2[-/]Sep|Sep[-/]02|02[-/]09|2[-/]Set|Set[-/]02|2[-/]Setembro)\b/gi,
    geneCorrompido: 'SEPT2',
    geneAtualHgnc: 'SEPTIN2',
    nomeCompleto: 'Septin 2',
    motivo: 'O gene SEPT2 é convertido na data "2-Sep" pelo Excel.'
  },
  {
    regex: /\b(?:7[-/]Sep|Sep[-/]07|07[-/]09|7[-/]Set|Set[-/]07|7[-/]Setembro)\b/gi,
    geneCorrompido: 'SEPT7',
    geneAtualHgnc: 'SEPTIN7',
    nomeCompleto: 'Septin 7',
    motivo: 'O gene SEPT7 é convertido na data "7-Sep".'
  },
  {
    regex: /\b(?:1[-/]Dec|Dec[-/]01|01[-/]12|1[-/]Dez|Dez[-/]01|1[-/]Dezembro)\b/gi,
    geneCorrompido: 'DEC1',
    geneAtualHgnc: 'BHLHE40',
    nomeCompleto: 'Basic Helix-Loop-Helix Family Member E40 (antigo DEC1)',
    motivo: 'O gene DEC1 é convertido na data "1-Dec".'
  },
  {
    regex: /\b(?:4[-/]Oct|Oct[-/]04|04[-/]10|4[-/]Out|Out[-/]04|4[-/]Outubro)\b/gi,
    geneCorrompido: 'OCT4',
    geneAtualHgnc: 'POU5F1',
    nomeCompleto: 'POU Class 5 Homeobox 1 (OCT4)',
    motivo: 'O fator de transcrição OCT4 é convertido na data "4-Oct".'
  }
];

/**
 * Termos biológicos que confirmam que o parágrafo ou sentença trata de biologia celular, genética ou medicina
 */
const CONTEXTO_BIOLOGICO_REGEX = /\b(?:gene|genes|express[ãa]o|prote[íi]na|prote[íi]nas|ensaio|pcr|rt-pcr|transcri[çc][ãa]o|muta[çc][ãa]o|oncogene|marcador|biomarcador|alelo|locus|sequenciamento|amostra|amostras|tumoral|c[âa]ncer|rna|mrna|dna|microarray|fold[- ]change|upregul|downregul)\b/i;

/**
 * Verifica se uma data legítima está acompanhada de ano (ex: "1-Mar-2021" ou "em 1 de março de 2022")
 */
const DATA_CRONOLOGICA_LEGITIMA_REGEX = /\b(?:1|2|4|7|8)[-/ ](?:Mar|Sep|Set|Dec|Dez|Oct|Out)[-/ ]\d{4}\b/i;

/**
 * Analisa um texto em busca de corrupção de genes por planilhas
 */
function analisarCorrupcaoGeneTexto(texto = '', meta = {}) {
  const encontradas = [];
  if (!texto || typeof texto !== 'string') return encontradas;

  // Se o texto não possui nenhum contexto biológico nem termos de bancada, ignora para evitar falsos positivos
  if (!CONTEXTO_BIOLOGICO_REGEX.test(texto)) {
    return encontradas;
  }

  for (const item of GENES_VULNERAVEIS_EXCEL) {
    item.regex.lastIndex = 0;
    let m;
    while ((m = item.regex.exec(texto)) !== null) {
      const matchStr = m[0];

      // Proteção: se for parte de uma data cronológica completa com ano, não alerta
      const trechoAoRedor = texto.slice(Math.max(0, m.index - 5), Math.min(texto.length, m.index + matchStr.length + 10));
      if (DATA_CRONOLOGICA_LEGITIMA_REGEX.test(trechoAoRedor)) {
        continue;
      }

      encontradas.push({
        tipo: 'corrupcao_gene_excel',
        termoDetectado: matchStr,
        geneCorrompido: item.geneCorrompido,
        geneAtualHgnc: item.geneAtualHgnc,
        nomeCompleto: item.nomeCompleto,
        motivo: item.motivo,
        mensagem: `🧬 CORRUPÇÃO DE SÍMBOLO GÊNICO POR PLANILHA (Ziemann et al.): O termo "${matchStr}" aparece em contexto molecular e corresponde à auto-conversão indevida do gene "${item.geneCorrompido}" (HGNC: "${item.geneAtualHgnc}").`,
        sugestao: `Substitua "${matchStr}" pela nomenclatura oficial HGNC "${item.geneAtualHgnc}".`,
        indice: m.index,
        ...meta
      });
    }
  }

  return encontradas;
}

/**
 * Audita todos os parágrafos do manuscrito em busca de corrupção de genes
 */
function auditarCorrupcaoBiomedicaDoManuscrito(paragrafos = []) {
  const alertasCorrupcao = [];

  for (const p of paragrafos) {
    const texto = typeof p === 'string' ? p : p.texto || '';
    const meta = typeof p === 'object' ? {
      numParagrafo: p.numParagrafo || 0,
      numLinha: p.numLinha || 0,
      secao: p.secao || 'Corpo do Texto',
      fraseWord: texto
    } : { fraseWord: texto };

    const achados = analisarCorrupcaoGeneTexto(texto, meta);
    alertasCorrupcao.push(...achados);
  }

  return {
    totalCorrupcoesGene: alertasCorrupcao.length,
    alertasCorrupcao,
  };
}

module.exports = {
  GENES_VULNERAVEIS_EXCEL,
  CONTEXTO_BIOLOGICO_REGEX,
  analisarCorrupcaoGeneTexto,
  auditarCorrupcaoBiomedicaDoManuscrito,
};
