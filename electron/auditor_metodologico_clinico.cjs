/**
 * electron/auditor_metodologico_clinico.cjs
 * 
 * Módulo de Auditoria Forense Metodológica e Clínica (PICO / STROBE / CONSORT / RobotReviewer).
 * 
 * Funcionalidades:
 * 1. Identificação Automática do Desenho do Estudo:
 *    - Ensaio Clínico Randomizado (RCT), Coorte, Caso-Controle, Transversal,
 *      Ecológico, Revisão Sistemática / Metanálise, Relato de Caso.
 * 2. Auditoria Ética em Pesquisas com Seres Humanos (Resoluções CNS 466/12 e 510/16):
 *    - Identificação de Aprovação por Comitê de Ética em Pesquisa (CEP/CONEP).
 *    - Extração do número de parecer, protocolo e CAAE.
 *    - Verificação de menção ao TCLE (Termo de Consentimento Livre e Esclarecido)
 *      ou dispensa justificada de TCLE.
 * 3. Auditoria de Elegibilidade e Amostragem (Checklist STROBE / CONSORT):
 *    - Verificação de critérios explícitos de Inclusão e Exclusão.
 *    - Extração do tamanho amostral reportado (N) e cálculo amostral / poder estatístico.
 * 4. Auditoria de Registro Clínico e Transparência:
 *    - Verificação de Registro em Plataforma de Ensaios Clínicos (ReBEC, ClinicalTrials.gov / NCT).
 *    - Declaração explícita de Conflito de Interesses e Fontes de Financiamento.
 * 5. Auditoria de Descritores em Ciências da Saúde (DeCS / MeSH):
 *    - Extração de Palavras-chave / Descritores e verificação de conformidade de formato.
 */

'use strict';

/**
 * Identifica o desenho metodológico predominante do manuscrito.
 */
function identificarDesenhoEstudo(texto) {
  if (!texto || typeof texto !== 'string') return { tipo: 'nao_identificado', descricao: 'Não especificado' };

  // Verifica primeiro desenhos de intervenção técnica/serviço ou pesquisa documental que não configuram ensaio clínico medicamentoso
  if (/\b(?:projeto\s+de\s+interven[çc][ãa]o|plano\s+de\s+interven[çc][ãa]o|diagn[óo]stico\s+situacional|relato\s+de\s+experi[êe]ncia|modelagem\s+de\s+dados|desenvolvimento\s+de\s+sistema)\b/i.test(texto)) {
    return { tipo: 'projeto_intervencao', descricao: 'Projeto de Intervenção / Diagnóstico Situacional / Modelagem', checklist: 'TIDieR / SQUIRE' };
  }
  if (/(?:trata-se\s+de\s+(?:um\s+)?ensaio\s+cl[íi]nico|este\s+(?:estudo\s+[ée]\s+um\s+)?ensaio\s+cl[íi]nico|presente\s+ensaio\s+cl[íi]nico|realizou-se\s+(?:um\s+)?ensaio\s+cl[íi]nico|randomized\s+controlled\s+trial|ensaio\s+cl[íi]nico\s+randomizado\s+(?:duplo|triplo)[- ]cego)/i.test(texto)) {
    return { tipo: 'ensaio_clinico', descricao: 'Ensaio Clínico (Intervenção / RCT)', checklist: 'CONSORT' };
  }
  if (/\b(?:revis[ãa]o\s+sistem[áa]tica|systematic\s+review|meta[- ]an[áa]lise|metan[áa]lise|meta[- ]analysis)\b/i.test(texto)) {
    return { tipo: 'revisao_sistematica', descricao: 'Revisão Sistemática / Metanálise', checklist: 'PRISMA' };
  }
  if (/\b(?:estudo\s+de\s+coorte(?:\s+prospectiv[ao]|\s+retrospectiv[ao])?|cohort\s+study|estudo\s+longitudinal)\b/i.test(texto)) {
    return { tipo: 'coorte', descricao: 'Estudo Observacional de Coorte (Longitudinal)', checklist: 'STROBE' };
  }
  if (/\b(?:estudo\s+caso[- ]controle|case[- ]control\s+study)\b/i.test(texto)) {
    return { tipo: 'caso_controle', descricao: 'Estudo Caso-Controle', checklist: 'STROBE' };
  }
  if (/\b(?:estudo\s+transversal|corte\s+transversal|cross[- ]sectional\s+study|estudo\s+de\s+preval[êe]ncia)\b/i.test(texto)) {
    return { tipo: 'transversal', descricao: 'Estudo Observacional Transversal (Prevalência)', checklist: 'STROBE' };
  }
  if (/\b(?:estudo\s+ecol[óo]gico|ecological\s+study|an[áa]lise\s+espacial|s[ée]rie\s+temporal)\b/i.test(texto)) {
    return { tipo: 'ecologico', descricao: 'Estudo Ecológico / Análise Espacial / Série Temporal', checklist: 'STROBE' };
  }
  if (/\b(?:relato\s+de\s+caso|case\s+report)\b/i.test(texto)) {
    return { tipo: 'relato_caso', descricao: 'Relato de Caso Clínico', checklist: 'CARE' };
  }
  if (/\b(?:estudo\s+qualitativo|pesquisa\s+qualitativa|an[áa]lise\s+de\s+conte[úu]do|fenomenol[óo]gico)\b/i.test(texto)) {
    return { tipo: 'qualitativo', descricao: 'Pesquisa Qualitativa', checklist: 'COREQ' };
  }

  return { tipo: 'observacional_geral', descricao: 'Estudo Observacional / Descritivo Geral', checklist: 'STROBE' };
}

/**
 * Audita os aspectos éticos da pesquisa com dados ou seres humanos.
 */
function auditarAspectosEticos(texto) {
  const resultado = {
    aprovadoCep: false,
    mencaoCep: false,
    mencaoTcle: false,
    dispensaTcle: false,
    caae: null,
    numeroParecer: null,
    alertas: [],
  };

  if (!texto || typeof texto !== 'string') return resultado;

  // 1. Menção a CEP / CONEP / Comitê de Ética
  if (/\b(?:comit[êe]\s+de\s+[ée]tica(?:\s+em\s+pesquisa)?|cep\s*\/\s*conep|ethics\s+committee|institutional\s+review\s+board|irb)\b/i.test(texto)) {
    resultado.mencaoCep = true;
    if (/\b(?:aprovad[ao]|parecer\s+favor[áa]vel|conforme\s+aprova[çc][ãa]o|approved\s+by)\b/i.test(texto)) {
      resultado.aprovadoCep = true;
    }
  }

  // 2. Extração de CAAE (Certificado de Apresentação para Apreciação Ética)
  const mCaae = /\b(?:CAAE|caae)\s*[:.]?\s*(\d{14,16}|\d{5,8}[./-]\d{1,4}[./-]\d{1,4}[./-]\d{1,2})/i.exec(texto);
  if (mCaae) {
    resultado.caae = mCaae[1].replace(/[^\d]/g, '');
    resultado.aprovadoCep = true;
  }

  // 3. Extração de Parecer / Protocolo
  const mPar = /(?:parecer|protocolo|aprova[çc][ãa]o)\s*(?:conep|cep)?\s*(?:n[°ºo]?\s*)?[:.]?\s*(\d+[\d./-]*)/i.exec(texto);
  if (mPar) {
    resultado.numeroParecer = mPar[1].trim();
  }

  // 4. TCLE (Termo de Consentimento Livre e Esclarecido)
  if (/\b(?:tcle|termo\s+de\s+consentimento\s+livre\s+e\s+esclarecido|consentimento\s+informado|informed\s+consent)\b/i.test(texto)) {
    resultado.mencaoTcle = true;
  }
  if (/\b(?:dispensa|dispensado|isen[çc][ãa]o)\s+(?:d[oe]\s+)?(?:tcle|termo\s+de\s+consentimento|consentimento)\b/i.test(texto)) {
    resultado.dispensaTcle = true;
  }

  // Alertas éticos aplicáveis exclusivamente à redação do próprio manuscrito
  const estudaHumanos = /\b(?:pacientes|participantes|indiv[íi]duos|volunt[áa]rios|prontu[áa]rios|dados\s+secund[áa]rios|human\s+subjects|patients)\b/i.test(texto);
  const estudaBancosPublicosAnonimos = /\b(?:dados\s+secund[áa]rios\s+de\s+dom[íi]nio\s+p[úu]blico|sinan|datasus|sim\s*\/\s*datasus|sinasc|censo\s+demogr[áa]fico|banco\s+de\s+dados\s+p[úu]blico|dados\s+agregados\s+sem\s+identifica[çc][ãa]o|projeto\s+de\s+interven[çc][ãa]o|diagn[óo]stico\s+situacional)\b/i.test(texto);

  if (estudaHumanos && !estudaBancosPublicosAnonimos) {
    if (!resultado.mencaoCep && !resultado.caae) {
      resultado.alertas.push({
        tipo: 'ausencia_aprovacao_etica',
        mensagem: '⚠️ ASPECTO ÉTICO (SEU MANUSCRITO): O texto do seu manuscrito menciona estudo com pacientes/prontuários, mas NÃO relata aprovação por Comitê de Ética (CEP/CONEP) nem número de CAAE (Res. CNS 466/12 ou 510/16). Caso seja estudo de intervenção técnica/dados agregados, informe a isenção ou clique em Ignorar.',
      });
    }
    if (!resultado.mencaoTcle && !resultado.dispensaTcle && !resultado.aprovadoCep) {
      resultado.alertas.push({
        tipo: 'ausencia_mencao_tcle',
        mensagem: '⚠️ TCLE NÃO MENCIONADO (SEU MANUSCRITO): Não foi identificada no seu manuscrito menção ao Termo de Consentimento Livre e Esclarecido (TCLE) ou justificativa de dispensa pelo CEP.',
      });
    }
  }

  return resultado;
}

/**
 * Audita critérios de elegibilidade, inclusão/exclusão e tamanho amostral.
 */
function auditarElegibilidadeEAmostra(texto, desenho = null) {
  const resultado = {
    temCriteriosInclusao: false,
    temCriteriosExclusao: false,
    tamanhoAmostral: null,
    temCalculoAmostral: false,
    alertas: [],
  };

  if (!texto || typeof texto !== 'string') return resultado;

  // 1. Critérios de Inclusão / Exclusão
  if (/\b(?:crit[ée]rios?\s+de\s+inclus[ãa]o|crit[ée]rios?\s+de\s+elegibilidade|inclusion\s+criteria)\b/i.test(texto)) {
    resultado.temCriteriosInclusao = true;
  }
  if (/\b(?:crit[ée]rios?\s+de\s+exclus[ãa]o|exclusion\s+criteria)\b/i.test(texto)) {
    resultado.temCriteriosExclusao = true;
  }

  // 2. Tamanho Amostral N
  const mN = /\b(?:amostra\s+(?:foi\s+)?composta\s+por|totalizando|avaliados?|inclu[íi]dos?|sample\s+of|total\s+of)\s*(\d{1,3}(?:\.\d{3})*|\d+)\s*(?:pacientes|participantes|indiv[íi]duos|sujeitos|casos|prontu[áa]rios|registros|registros\s+de\s+notifica[çc][ãa]o|patients|participants)\b/i.exec(texto);
  if (mN) {
    resultado.tamanhoAmostral = parseInt(mN[1].replace(/\./g, ''), 10);
  } else {
    const mN2 = /\b[nN]\s*=\s*(\d+)\b/.exec(texto);
    if (mN2) {
      resultado.tamanhoAmostral = parseInt(mN2[1], 10);
    }
  }

  // 3. Cálculo Amostral ou Poder Estatístico
  if (/\b(?:c[áa]lculo\s+(?:do\s+tamanho\s+)?amostral|poder\s+estat[íi]stico|sample\s+size\s+calculation|power\s+analysis|n[íi]vel\s+de\s+confian[çc]a\s+de\s+95%)\b/i.test(texto)) {
    resultado.temCalculoAmostral = true;
  }

  // Alertas Metodológicos (projetos de intervenção / modelagem de dados / pesquisa qualitativa não seguem checklist de amostragem STROBE/CONSORT)
  const desenhoSemAmostraClinica = desenho && ['projeto_intervencao', 'qualitativo'].includes(desenho.tipo);
  if (!desenhoSemAmostraClinica && !resultado.temCriteriosInclusao && !resultado.temCriteriosExclusao) {
    resultado.alertas.push({
      tipo: 'ausencia_criterios_elegibilidade',
      mensagem: '📌 CRITÉRIOS DE ELEGIBILIDADE AUSENTES: O manuscrito não detalha expressamente os "Critérios de Inclusão" ou "Critérios de Exclusão" da amostra estudada (Requisito essencial STROBE/CONSORT).',
    });
  }

  return resultado;
}

/**
 * Audita transparência, registro de ensaios e declaração de conflitos.
 */
function auditarTransparenciaERegistro(texto, desenho = {}) {
  const resultado = {
    temRegistroClinico: false,
    identificadorRegistro: null,
    temConflitoInteresse: false,
    temFinanciamento: false,
    alertas: [],
  };

  if (!texto || typeof texto !== 'string') return resultado;

  // 1. Registro Clínico (ReBEC / ClinicalTrials.gov / NCT)
  const mCodigo = /\b(NCT\d{8}|RBR-[a-z0-9]+|ISRCTN\d{8})\b/i.exec(texto);
  const mPlataforma = /\b(ReBEC|ClinicalTrials\.gov)\b/i.exec(texto);
  if (mCodigo || mPlataforma) {
    resultado.temRegistroClinico = true;
    resultado.identificadorRegistro = mCodigo ? mCodigo[1] : mPlataforma[1];
  }

  // 2. Conflito de Interesses
  if (/\b(?:conflito\s+de\s+interesses?|declara[çc][ãa]o\s+de\s+interesses?|conflicts?\s+of\s+interest|competing\s+interests)\b/i.test(texto)) {
    resultado.temConflitoInteresse = true;
  }

  // 3. Financiamento / Fomento
  if (/\b(?:financiamento|apoio\s+financeiro|fomento|funding|financial\s+support|agradecimentos|cnpq|capes|fapesp|faperj|fapemig|minist[ée]rio\s+da\s+sa[úu]de)\b/i.test(texto)) {
    resultado.temFinanciamento = true;
  }

  // Se for ensaio clínico, o registro em plataforma pública é obrigatório pelo ICMJE
  if (desenho.tipo === 'ensaio_clinico' && !resultado.temRegistroClinico) {
    resultado.alertas.push({
      tipo: 'ensaio_sem_registro_icmje',
      mensagem: '🚨 ENSAIO CLÍNICO SEM REGISTRO PROSPECTIVO: Ensaios clínicos de intervenção exigem número de registro em plataforma internacional (ex: ReBEC ou ClinicalTrials.gov NCT) conforme diretrizes obrigatórias do ICMJE e OMS.',
    });
  }

  if (!resultado.temConflitoInteresse) {
    resultado.alertas.push({
      tipo: 'ausencia_declaracao_conflitos',
      mensagem: '📌 CONFLITO DE INTERESSES: Não foi identificada declaração explícita sobre a presença ou ausência de conflitos de interesse ao final do artigo (Requisito editorial de submissão).',
    });
  }

  return resultado;
}

/**
 * Audita as palavras-chave / descritores em relação aos padrões DeCS/MeSH.
 */
function auditarDescritoresDecsMesh(texto) {
  const resultado = {
    descritoresEncontrados: [],
    conformidadeFormato: true,
    alertas: [],
  };

  if (!texto || typeof texto !== 'string') return resultado;

  const mKw = /(?:palavras[- ]chave|descritores|keywords?)\s*[:.]?\s*([^\n\r]+)/i.exec(texto);
  if (!mKw) return resultado;

  const linhaBruta = mKw[1].trim();
  const termos = linhaBruta
    .split(/[;•·,.]/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 3 && !/^(?:e|and|or)\b/i.test(t));

  resultado.descritoresEncontrados = termos;

  if (termos.length < 3) {
    resultado.alertas.push({
      tipo: 'poucos_descritores',
      mensagem: `⚠️ POUCOS DESCRITORES: Foram identificados apenas ${termos.length} descritor(es). A maioria dos periódicos de saúde e a SciELO exigem entre 3 e 6 descritores padronizados no DeCS/MeSH.`,
    });
  }

  return resultado;
}

/**
 * Auditoria Metodológica e Clínica Global do Manuscrito.
 */
function auditarMetodologiaClinicaDoManuscrito(paragrafosCorpo = [], textoCompleto = '') {
  // Analisa preferencialmente o corpo do manuscrito (excluindo títulos de obras na lista final de Referências)
  const textoCorpo = Array.isArray(paragrafosCorpo) && paragrafosCorpo.length > 0
    ? paragrafosCorpo.map((p) => (typeof p === 'string' ? p : p.texto || '')).join('\n\n')
    : '';
  const textoTotal = textoCorpo || textoCompleto;

  const desenho = identificarDesenhoEstudo(textoTotal);
  const etica = auditarAspectosEticos(textoTotal);
  const amostra = auditarElegibilidadeEAmostra(textoTotal, desenho);
  const transparencia = auditarTransparenciaERegistro(textoTotal, desenho);
  const descritores = auditarDescritoresDecsMesh(textoTotal);

  const todosAlertas = [
    ...etica.alertas,
    ...amostra.alertas,
    ...transparencia.alertas,
    ...descritores.alertas,
  ];

  return {
    desenhoEstudo: desenho,
    etica,
    amostra,
    transparencia,
    descritores,
    totalAlertasMetodologicos: todosAlertas.length,
    alertasMetodologicos: todosAlertas,
  };
}

module.exports = {
  identificarDesenhoEstudo,
  auditarAspectosEticos,
  auditarElegibilidadeEAmostra,
  auditarTransparenciaERegistro,
  auditarDescritoresDecsMesh,
  auditarMetodologiaClinicaDoManuscrito,
};
