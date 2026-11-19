'use strict';

/**
 * electron/bibliometric_xray.cjs
 *
 * Classificador de Piramide de Evidencia (7 niveis) e Raio-X Bibliometrico do Manuscrito.
 * Combina PublicationType (PubMed), conceitos/tipos (OpenAlex), classificador LeNER-Br e heuristicas de titulo/resumo.
 */

const NIVEIS_EVIDENCIA = [
  { nivel: 1, rotulo: 'Revisão Sistemática / Meta-análise' },
  { nivel: 2, rotulo: 'Ensaio Clínico Randomizado' },
  { nivel: 3, rotulo: 'Coorte / Caso-Controle' },
  { nivel: 4, rotulo: 'Estudo Transversal / Ecológico' },
  { nivel: 5, rotulo: 'Relato de Caso / Série' },
  { nivel: 6, rotulo: 'Documento Normativo / Portaria SUS / Legislação' },
  { nivel: 7, rotulo: 'Outros / Editorial' },
];

/**
 * Classifica uma referencia em um dos 7 niveis da Piramide de Evidencia.
 */
function classificarNivelEvidencia(refDoc = {}, refBib = null) {
  const csl = refBib?.csl || {};
  const pubTypes = [
    ...(Array.isArray(csl.publicationType) ? csl.publicationType : []),
    ...(Array.isArray(refDoc.publicationType) ? refDoc.publicationType : []),
    csl.genre || '',
    csl.type || '',
  ]
    .join(' ')
    .toLowerCase();

  const conceitosOa = Array.isArray(csl.concepts || refDoc.concepts)
    ? (csl.concepts || refDoc.concepts).map((c) => c?.display_name || c || '').join(' ').toLowerCase()
    : '';

  const textoBlob = `${refDoc.tituloOficial || refDoc.tituloBuscado || ''} ${csl.title || ''} ${csl.abstract || ''} ${refDoc.textoOriginal || ''} ${pubTypes} ${conceitosOa}`.toLowerCase();

  // Nivel 6: Norma Juridica / Portaria SUS / Documento Tecnico Oficial (precede revisoes narrativas)
  if (
    refDoc.natureza === 'norma_livro_institucional' ||
    refDoc.statusAutenticidade === 'institucional_tese' ||
    refDoc.statusAutenticidade === 'protocolo_controlado_aprovado' ||
    /\b(portaria|decreto|lei\s+n|resolu[cç][aã]o|conitec|anvisa|ans|cfm|minist[eé]rio\s+da\s+sa[uú]de|rnds|hl7\s+fhir|diretriz(?:es)?\s+nacionais|manual\s+t[eé]cnico)\b/i.test(
      textoBlob
    )
  ) {
    return { ...NIVEIS_EVIDENCIA[5] };
  }

  // Nivel 1: Revisao Sistematica / Meta-analise
  if (
    /\b(systematic\s+review|meta[- ]analysis|meta[- ]analise|metan[aá]lise|revis[aã]o\s+sistem[aá]tica|umbrella\s+review|scoping\s+review|revis[aã]o\s+de\s+escopo|cochrane\s+database\s+of\s+systematic\s+reviews|prisma)\b/i.test(
      textoBlob
    )
  ) {
    return { ...NIVEIS_EVIDENCIA[0] };
  }

  // Nivel 2: Ensaio Clinico Randomizado
  if (
    /\b(randomized\s+controlled\s+trial|randomised\s+controlled\s+trial|clinical\s+trial|ensaio\s+cl[ií]nico(?:\s+randomizado)?|duplo[- ]cego|double[- ]blind|placebo[- ]controlled|randomly\s+assigned)\b/i.test(
      textoBlob
    )
  ) {
    return { ...NIVEIS_EVIDENCIA[1] };
  }

  // Nivel 3: Coorte / Caso-Controle
  if (
    /\b(cohort|coorte|case[- ]control|caso[- ]controle|longitudinal\s+study|estudo\s+longitudinal|follow[- ]up\s+study|nested\s+case|retrospective\s+cohort|prospective\s+cohort)\b/i.test(
      textoBlob
    )
  ) {
    return { ...NIVEIS_EVIDENCIA[2] };
  }

  // Nivel 4: Estudo Transversal / Ecologico
  if (
    /\b(cross[- ]sectional|estudo\s+transversal|inqu[eé]rito|prevalence\s+study|estudo\s+ecológico|ecologico|ecological\s+study|survey)\b/i.test(
      textoBlob
    )
  ) {
    return { ...NIVEIS_EVIDENCIA[3] };
  }

  // Nivel 5: Relato de Caso / Serie
  if (
    /\b(case\s+report|case\s+reports|case\s+series|relato\s+de\s+caso|s[eé]rie\s+de\s+casos)\b/i.test(
      textoBlob
    )
  ) {
    return { ...NIVEIS_EVIDENCIA[4] };
  }

  // Nivel 7: Outros / Editorial
  return { ...NIVEIS_EVIDENCIA[6] };
}

function normalizarNomeAutorSimples(s = '') {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function verificarAutocitacao(refDoc, refBib, autoresManuscrito = []) {
  if (!Array.isArray(autoresManuscrito) || !autoresManuscrito.length) return false;
  const alvos = autoresManuscrito
    .map((a) => normalizarNomeAutorSimples(a).split(' ').pop())
    .filter((s) => s && s.length >= 3);
  if (!alvos.length) return false;

  const sobrenomesRef = new Set();
  if (refDoc.primeiroSobrenome) {
    const s1 = normalizarNomeAutorSimples(refDoc.primeiroSobrenome).split(' ')[0];
    if (s1) sobrenomesRef.add(s1);
  }
  for (const a of refBib?.csl?.author || []) {
    const fam = normalizarNomeAutorSimples(a.family || a.literal || '');
    if (fam) fam.split(' ').forEach((tok) => tok.length >= 3 && sobrenomesRef.add(tok));
  }

  return alvos.some((al) => sobrenomesRef.has(al));
}

/**
 * Gera o Raio-X Bibliometrico consolidado da Auditoria.
 */
function gerarRaioXBibliometrico({
  refsMapeadas = [],
  biblioteca = null,
  autoresManuscrito = [],
  anoReferencia = 2026,
} = {}) {
  const anoRefNum = Number(anoReferencia) || 2026;
  const totalReferencias = refsMapeadas.length;

  const contagemPorNivel = NIVEIS_EVIDENCIA.map((n) => ({ ...n, quantidade: 0, percentual: 0 }));
  let recentes5Anos = 0;
  let autocitacoes = 0;
  let retratacoes = 0;
  let erratas = 0;

  const classificacoesPorRef = [];

  for (const rm of refsMapeadas) {
    const refBib = rm.refBibId && biblioteca?.refs?.get ? biblioteca.refs.get(rm.refBibId) : null;
    const ev = classificarNivelEvidencia(rm, refBib);

    const slot = contagemPorNivel.find((x) => x.nivel === ev.nivel);
    if (slot) slot.quantidade++;

    const anoObra = Number(rm.anoBase || String(rm.ano || '').match(/\d{4}/)?.[0] || 0);
    const recente5Anos = anoObra > 0 && anoObra >= anoRefNum - 5 && anoObra <= anoRefNum + 1;
    if (recente5Anos) recentes5Anos++;

    const ehAutocitacao = verificarAutocitacao(rm, refBib, autoresManuscrito);
    if (ehAutocitacao) autocitacoes++;

    const ehRetratada = Boolean(rm.retratado || rm.statusAutenticidade === 'artigo_retratado' || refBib?.retratado);
    if (ehRetratada) retratacoes++;

    const temErrata = Boolean(rm.infoRepositorio?.temErrata);
    if (temErrata) erratas++;

    classificacoesPorRef.push({
      chave: rm.chave || '',
      autor: rm.primeiroSobrenome || '',
      ano: anoObra || rm.ano || '',
      titulo: rm.tituloOficial || rm.tituloBuscado || '',
      nivel: ev.nivel,
      categoria: ev.rotulo,
      recente5Anos,
      autocitacao: ehAutocitacao,
      retratada: ehRetratada,
    });
  }

  for (const slot of contagemPorNivel) {
    slot.percentual = totalReferencias > 0 ? Math.round((slot.quantidade / totalReferencias) * 1000) / 10 : 0;
  }

  const percentualRecentes5Anos =
    totalReferencias > 0 ? Math.round((recentes5Anos / totalReferencias) * 1000) / 10 : 0;
  const taxaAutocitacaoPct =
    totalReferencias > 0 ? Math.round((autocitacoes / totalReferencias) * 1000) / 10 : 0;

  return {
    anoReferencia: anoRefNum,
    totalReferencias,
    recentes5Anos,
    percentualRecentes5Anos,
    autocitacoes,
    taxaAutocitacaoPct,
    retratacoes,
    erratas,
    distribuicaoEvidencia: contagemPorNivel,
    classificacoesPorRef,
  };
}

module.exports = {
  NIVEIS_EVIDENCIA,
  classificarNivelEvidencia,
  gerarRaioXBibliometrico,
};
