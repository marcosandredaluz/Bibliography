/**
 * electron/periodicos_predatorios_detector.cjs
 * 
 * Módulo de Detecção Forense de Periódicos Predatórios, Hijacked Journals e Editoras Suspeitas.
 * Inspirado nos critérios internacionais de Jeffrey Beall (Beall's List Archive),
 * Directory of Open Access Journals (DOAJ) e The Retraction Watch Hijacked Journal Checker.
 * 
 * Funcionalidades:
 * 1. Detecção de editoras e periódicos predatórios conhecidos com histórico de falsificação de peer-review;
 * 2. Detecção de periódicos clonados (hijacked journals / websites espelhos falsificados);
 * 3. Identificação de padrões predatórios em URLs ou editoras de vaidade (vanity press);
 * 4. Verificação determinística e rápida sem necessidade de chaves de API pagas.
 */

'use strict';

/**
 * Catálogo Canônico Forense de Editoras e Periódicos Predatórios Notórios / Hijacked
 */
const CATALOGO_PREDATORIO_CONHECIDO = [
  // --- Editoras e Marcas Predatórias Notórias ---
  {
    padrao: /\b(?:OMICS\s+Publishing|OMICS\s+International|OMICS\s+Group)\b/i,
    tipo: 'editora_predatoria',
    nome: 'OMICS Publishing Group',
    motivo: 'Condenada pela FTC (EUA) por práticas predatórias enganosas e ausência de revisão por pares idônea.',
    gravidade: 'critica'
  },
  {
    padrao: /\b(?:Science\s*Publishing\s*Group|SciencePG)\b/i,
    tipo: 'editora_predatoria',
    nome: 'Science Publishing Group (SciencePG)',
    motivo: 'Listada em índices internacionais de editoras predatórias por envio massivo de spam e peer-review aparente.',
    gravidade: 'alta'
  },
  {
    padrao: /\b(?:Lambert\s+Academic\s+Publishing|LAP\s+Lambert|OmniScriptum)\b/i,
    tipo: 'editora_vaidade',
    nome: 'Lambert Academic Publishing (LAP)',
    motivo: 'Editora de vaidade (vanity press) que publica teses sem revisão científica crítica nem crivo editorial.',
    gravidade: 'moderada'
  },
  {
    padrao: /\b(?:SciTechnol)\b/i,
    tipo: 'editora_predatoria',
    nome: 'SciTechnol',
    motivo: 'Filial do grupo OMICS com práticas predatórias de cobrança indevida de APC.',
    gravidade: 'alta'
  },
  {
    padrao: /\b(?:David\s+Publishing|David\s+Publishing\s+Company)\b/i,
    tipo: 'editora_predatoria',
    nome: 'David Publishing Company',
    motivo: 'Editora com histórico documentado de spam editorial e métricas de impacto forjadas.',
    gravidade: 'alta'
  },
  {
    padrao: /\b(?:Academic\s+Journals(?:\s+Inc)?)\b/i,
    tipo: 'editora_predatoria',
    nome: 'Academic Journals',
    motivo: 'Editora internacional listada em Beall por falta de transparência e corpo editorial fictício.',
    gravidade: 'alta'
  },
  {
    padrao: /\b(?:International\s+Journal\s+of\s+Advanced\s+Research\s+and\s+Technology|IJART)\b/i,
    tipo: 'periodico_predatorio',
    nome: 'International Journal of Advanced Research and Technology',
    motivo: 'Periódico genérico sem controle editorial idôneo identificado em repositórios de integridade.',
    gravidade: 'alta'
  },
  {
    padrao: /\b(?:World\s+Journal\s+of\s+Engineering\s+Research\s+and\s+Technology|WJERT)\b/i,
    tipo: 'periodico_predatorio',
    nome: 'World Journal of Engineering Research and Technology',
    motivo: 'Periódico sinalizado em investigações bibliométricas por aceite expresso sem revisão cega por pares.',
    gravidade: 'alta'
  },
  {
    padrao: /\b(?:Wulfenia\s+Journal\s+Fake|Jokull\s+Journal\s+Fake)\b/i,
    tipo: 'periodico_clonado',
    nome: 'Revista Clonada (Hijacked Journal)',
    motivo: 'Caso notório de periódico sequestrado: website falso que clonou a identidade de periódico europeu idôneo.',
    gravidade: 'critica'
  }
];

/**
 * Padrões de jargão de impacto inflado ou métricas fajutas típicas de sites predatórios
 */
const PADROES_METRICAS_FORJADAS = [
  /\bUniversal\s+Impact\s+Factor\b/i,
  /\bGlobal\s+Impact\s+Factor\b/i,
  /\bGeneral\s+Impact\s+Factor\b/i,
  /\bCiteFactor\b/i,
  /\bJournal\s+Impact\s+Factor\s+\(?JIF\)?\s*:\s*[7-9]\d(?:\.\d+)?\b/i, // JIFs absurdamente inflados em periódicos novos
];

/**
 * Avalia se o nome do periódico, editora ou URL apresenta características predatórias ou de revista clonada.
 */
function verificarPeriodicoPredatorio({ nomePeriodico = '', editora = '', url = '', textoReferencia = '' }) {
  const textoParaAnalise = `${nomePeriodico} ${editora} ${url} ${textoReferencia}`.trim();
  if (!textoParaAnalise) return null;

  for (const item of CATALOGO_PREDATORIO_CONHECIDO) {
    if (item.padrao.test(textoParaAnalise)) {
      return {
        tipoAlerta: 'periodico_predatorio_suspeito',
        subtipo: item.tipo,
        nomeDetectado: item.nome,
        motivo: item.motivo,
        gravidade: item.gravidade,
        mensagem: `🚨 FONTE SUSPEITA (Predatória / Clonada): A referência cita "${item.nome}", entidade apontada em registros de integridade científica (Beall's List / Retraction Watch). Motivo: ${item.motivo}`
      };
    }
  }

  for (const padraoMetrica of PADROES_METRICAS_FORJADAS) {
    if (padraoMetrica.test(textoParaAnalise)) {
      return {
        tipoAlerta: 'periodico_predatorio_suspeito',
        subtipo: 'metrica_forjada',
        nomeDetectado: 'Métrica de Impacto Fictícia',
        motivo: 'Uso de indicador de impacto não reconhecido pela Clarivate (JCR) / Scopus, frequente em revistas predatórias.',
        gravidade: 'moderada',
        mensagem: '⚠️ MÉTRICA NÃO OFICIAL DETECTADA: A fonte ou referência faz alusão a índices alternativos comumente utilizados por periódicos predatórios para simular fator de impacto.'
      };
    }
  }

  return null;
}

/**
 * Realiza a varredura de todas as referências mapeadas do manuscrito.
 */
function auditarReferenciasPredatorias(refsMapeadas = []) {
  const alertasPredatorios = [];

  for (const ref of refsMapeadas) {
    const dados = {
      nomePeriodico: ref.periodico || ref.nomePeriodico || '',
      editora: ref.editora || '',
      url: ref.url || ref.link || '',
      textoReferencia: ref.textoOriginal || ref.raw || '',
    };

    const diagnostico = verificarPeriodicoPredatorio(dados);
    if (diagnostico) {
      alertasPredatorios.push({
        refBibId: ref.refBibId || ref.id,
        chaveAutorAno: ref.primeiroSobrenome ? `${ref.primeiroSobrenome} (${ref.ano})` : 'Referência',
        textoReferencia: ref.textoOriginal || '',
        ...diagnostico
      });
    }
  }

  return {
    totalAlertasPredatorios: alertasPredatorios.length,
    alertasPredatorios,
  };
}

module.exports = {
  CATALOGO_PREDATORIO_CONHECIDO,
  PADROES_METRICAS_FORJADAS,
  verificarPeriodicoPredatorio,
  auditarReferenciasPredatorias,
};
