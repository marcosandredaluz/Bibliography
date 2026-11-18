/**
 * electron/rob_assessor.cjs
 *
 * Módulo de Avaliação de Risco de Viés (RoB 2 / ROBINS-I) com Revisão Humana Obrigatória.
 * Conformidade:
 * - Paletas e domínios baseados na especificação aberta Cochrane RoB 2 / ROBINS-I (robvis MIT).
 * - Nunca emite decisão final automática: toda sugestão nasce em status `pending_human_review`.
 * - Exige `reviewer_id` explícito e registra cada alteração em log append-only encadeado por SHA-256.
 */
'use strict';

const fs = require('fs');
const fsp = fs.promises;
const path = require('path');
const crypto = require('crypto');

const ROB_DOMAINS = {
  ROB2: [
    { domain_id: 'D1', domain_label: 'Processo de randomização', domain_label_en: 'Randomization process' },
    { domain_id: 'D2', domain_label: 'Desvios das intervenções pretendidas', domain_label_en: 'Deviations from intended interventions' },
    { domain_id: 'D3', domain_label: 'Dados de desfecho ausentes', domain_label_en: 'Missing outcome data' },
    { domain_id: 'D4', domain_label: 'Mensuração do desfecho', domain_label_en: 'Measurement of the outcome' },
    { domain_id: 'D5', domain_label: 'Seleção do resultado relatado', domain_label_en: 'Selection of the reported result' },
  ],
  'ROBINS-I': [
    { domain_id: 'D1', domain_label: 'Viés de confundimento', domain_label_en: 'Confounding' },
    { domain_id: 'D2', domain_label: 'Seleção dos participantes', domain_label_en: 'Selection of participants' },
    { domain_id: 'D3', domain_label: 'Classificação das intervenções', domain_label_en: 'Classification of interventions' },
    { domain_id: 'D4', domain_label: 'Desvios das intervenções pretendidas', domain_label_en: 'Deviations from intended interventions' },
    { domain_id: 'D5', domain_label: 'Dados ausentes', domain_label_en: 'Missing data' },
    { domain_id: 'D6', domain_label: 'Mensuração dos desfechos', domain_label_en: 'Measurement of outcomes' },
    { domain_id: 'D7', domain_label: 'Seleção do resultado relatado', domain_label_en: 'Selection of the reported result' },
  ],
};

const KEYWORDS_SUGESTAO = {
  D1: [
    { re: /\b(?:randomiz\w+|aleatoriz\w+|concealment|sigilo\s+de\s+aloca[cç][aã]o|computer[- ]generated)\b/i, level: 'low', conf: 0.72, why: 'Menção explícita a aleatorização/sigilo de alocação.' },
    { re: /\b(?:ajuste\s+multivariado|propensity\s+score|confounding|confundimento)\b/i, level: 'moderate', conf: 0.65, why: 'Menção a controle de confundimento; requer inspeção manual dos covariáveis.' },
  ],
  D2: [
    { re: /\b(?:duplo[- ]cego|double[- ]blind|placebo[- ]controlled|intention[- ]to[- ]treat|inten[cç][aã]o\s+de\s+tratar)\b/i, level: 'low', conf: 0.74, why: 'Relato de cegamento ou análise por intenção de tratar.' },
  ],
  D3: [
    { re: /\b(?:perdas?\s+de\s+seguimento|loss\s+to\s+follow[- ]up|imputa[cç][aã]o|attrition|missing\s+data)\b/i, level: 'some_concerns', conf: 0.62, why: 'Menção a perdas/dados faltantes; verificar proporção e impacto no desfecho.' },
  ],
  D4: [
    { re: /\b(?:avaliadores?\s+cegos?|blinded\s+outcome\s+assessor|mascaramento\s+da\s+avalia[cç][aã]o)\b/i, level: 'low', conf: 0.70, why: 'Menção a cegamento na aferição do desfecho.' },
  ],
  D5: [
    { re: /\b(?:NCT\d{6,}|ReBEC|PROSPERO|registro\s+pr[eé]vio|protocolo\s+registrado)\b/i, level: 'low', conf: 0.75, why: 'Identificado número de registro prévio de protocolo para checar seletividade.' },
  ],
};

function sha256Hex(texto = '') {
  return crypto.createHash('sha256').update(String(texto || ''), 'utf8').digest('hex');
}

function extrairEvidenciaAncorada(texto = '', domainId = 'D1', modelVersion = 'rob-heuristic-1.0') {
  const regras = KEYWORDS_SUGESTAO[domainId] || KEYWORDS_SUGESTAO.D1;
  const sentencas = String(texto || '')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 20);

  for (const r of regras) {
    for (const s of sentencas) {
      if (r.re.test(s)) {
        const quote = s.slice(0, 320);
        return {
          suggested_judgment: r.level,
          confidence: r.conf,
          rationale: r.why,
          evidence_anchors: [
            {
              anchor_id: `${domainId}_${sha256Hex(quote).slice(0, 10)}`,
              page: 1,
              literal_quote: quote,
              excerpt_sha256: sha256Hex(quote),
              bbox: [0, 0, 0, 0],
              model_version: modelVersion,
            },
          ],
        };
      }
    }
  }

  return {
    suggested_judgment: 'no_information',
    confidence: 0.25,
    rationale: 'Nenhuma âncora literal inequívoca detectada automaticamente no texto extraído; revisão integral do PDF necessária.',
    evidence_anchors: [],
  };
}

function criarSugestaoAvaliacaoRob(refItem, tool = 'ROB2') {
  const ferramenta = tool === 'ROBINS-I' ? 'ROBINS-I' : 'ROB2';
  const textoFonte = [refItem?.csl?.abstract, refItem?.textoExtraido, refItem?.notas]
    .filter(Boolean)
    .join('\n\n');

  const domains = ROB_DOMAINS[ferramenta].map((dom) => {
    const achado = extrairEvidenciaAncorada(textoFonte, dom.domain_id);
    return {
      domain_id: dom.domain_id,
      domain_label: dom.domain_label,
      domain_label_en: dom.domain_label_en,
      suggested_judgment: achado.suggested_judgment,
      confidence: achado.confidence,
      final_human_judgment: null,
      rationale: achado.rationale,
      evidence_anchors: achado.evidence_anchors,
    };
  });

  const ordRisco = ['low', 'some_concerns', 'moderate', 'high', 'serious', 'critical'];
  let maxIdx = -1;
  for (const d of domains) {
    const idx = ordRisco.indexOf(d.suggested_judgment);
    if (idx > maxIdx) maxIdx = idx;
  }

  return {
    assessment_id: `rob_${refItem.id}_${Date.now().toString(36)}`,
    ref_id: refItem.id,
    tool: ferramenta,
    status: 'pending_human_review',
    domains,
    suggested_overall: maxIdx >= 0 ? ordRisco[maxIdx] : 'no_information',
    final_human_overall: null,
    reviewer_id: null,
    reviewed_at: null,
  };
}

function calcularJulgamentoGlobalHumano(domains = []) {
  const prioridades = { critical: 6, high: 5, serious: 4, moderate: 3, some_concerns: 2, low: 1, no_information: 0 };
  let melhor = null;
  let scoreMax = -1;
  for (const d of domains) {
    const j = d.final_human_judgment;
    if (!j) return null;
    const sc = prioridades[j] ?? 0;
    if (sc > scoreMax) {
      scoreMax = sc;
      melhor = j;
    }
  }
  return melhor;
}

async function registrarAuditTrailRob(bibliotecaRaiz, entry) {
  const logFile = path.join(bibliotecaRaiz, 'documentos', 'auditoria_rob.jsonl');
  await fsp.mkdir(path.dirname(logFile), { recursive: true });

  let prevHash = '0'.repeat(64);
  if (fs.existsSync(logFile)) {
    const linhas = (await fsp.readFile(logFile, 'utf8')).trim().split(/\r?\n/).filter(Boolean);
    if (linhas.length > 0) {
      prevHash = sha256Hex(linhas[linhas.length - 1]);
    }
  }

  const completo = {
    entry_id: `audit_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    timestamp: new Date().toISOString(),
    ...entry,
    prev_entry_sha256: prevHash,
  };
  await fsp.appendFile(logFile, JSON.stringify(completo) + '\n', 'utf8');
  return completo;
}

async function confirmarAvaliacaoRobHumana({
  bib,
  refId,
  reviewerId,
  domainJudgments = {},
  overallJudgment = null,
}) {
  if (!bib) throw new Error('Nenhuma biblioteca aberta.');
  const revLimpo = String(reviewerId || '').trim();
  if (!revLimpo) {
    throw new Error('Identificação do revisor humano (reviewer_id) é obrigatória para confirmar RoB 2 / ROBINS-I.');
  }
  const ref = bib.refs.get(refId);
  if (!ref) throw new Error('Referência não encontrada.');
  const base = ref.robAssessment || criarSugestaoAvaliacaoRob(ref, 'ROB2');

  const prevSnapshot = JSON.stringify({ status: base.status, overall: base.final_human_overall });
  let houveOverride = false;

  const novosDominios = base.domains.map((d) => {
    const novoJulg = domainJudgments[d.domain_id] || d.final_human_judgment || d.suggested_judgment;
    if (novoJulg && d.suggested_judgment && novoJulg !== d.suggested_judgment) {
      houveOverride = true;
    }
    return {
      ...d,
      final_human_judgment: novoJulg,
    };
  });

  const overallFinal = overallJudgment || calcularJulgamentoGlobalHumano(novosDominios);
  const atualizado = {
    ...base,
    domains: novosDominios,
    final_human_overall: overallFinal,
    status: houveOverride ? 'human_overridden' : 'human_confirmed',
    reviewer_id: revLimpo,
    reviewed_at: new Date().toISOString(),
  };

  const refsHashes = novosDominios.flatMap((d) => (d.evidence_anchors || []).map((a) => a.excerpt_sha256));
  const entry = await registrarAuditTrailRob(bib.raiz, {
    ref_id: refId,
    reviewer_id: revLimpo,
    action: houveOverride ? 'override_judgment' : 'confirm_overall',
    previous_value: prevSnapshot,
    new_value: JSON.stringify({ status: atualizado.status, overall: overallFinal, domainJudgments }),
    evidence_sha256_refs: refsHashes,
  });

  await bib.atualizar(refId, { robAssessment: atualizado });
  return { assessment: atualizado, auditEntry: entry };
}

async function lerAuditTrailRob(bibliotecaRaiz) {
  if (!bibliotecaRaiz) return [];
  const logFile = path.join(bibliotecaRaiz, 'documentos', 'auditoria_rob.jsonl');
  if (!fs.existsSync(logFile)) return [];
  const linhas = (await fsp.readFile(logFile, 'utf8')).trim().split(/\r?\n/).filter(Boolean);
  return linhas.map((l) => JSON.parse(l)).reverse();
}

module.exports = {
  ROB_DOMAINS,
  criarSugestaoAvaliacaoRob,
  confirmarAvaliacaoRobHumana,
  registrarAuditTrailRob,
  lerAuditTrailRob,
  calcularJulgamentoGlobalHumano,
};
