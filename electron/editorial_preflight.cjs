'use strict';

/**
 * electron/editorial_preflight.cjs
 *
 * Perfil de Periódico Alvo / Pre-Flight Editorial (Fase 4 - Aditivo):
 * Valida prontidão para submissão segundo perfis configuráveis:
 * - Padrão ICMJE / Vancouver
 * - Saúde Coletiva Brasil (CSP / RSP / C&SC)
 * - Personalizado
 *
 * Verifica:
 * 1. Contagem de palavras do Resumo/Abstract e do corpo do manuscrito;
 * 2. Limite máximo de referências e de tabelas/figuras;
 * 3. Presença obrigatória de declarações éticas (CAAE/CEP, conflito de interesses,
 *    financiamento e disponibilidade de dados), reutilizando `auditor_metodologico_clinico.cjs`.
 */

const { auditarMetodologiaClinicaDoManuscrito } = require('./auditor_metodologico_clinico.cjs');

const PERFIS_EDITORIAIS = {
  icmje_vancouver: {
    id: 'icmje_vancouver',
    nome: 'Padrão ICMJE / Vancouver',
    descricao: 'Artigos originais biomédicos internacionais (estilo Vancouver / ICMJE).',
    maxPalavrasResumo: 250,
    maxPalavrasCorpo: 3500,
    maxReferencias: 40,
    maxTabelasFiguras: 5,
    exigeCepCaae: true,
    exigeConflitoInteresses: true,
    exigeFinanciamento: true,
    exigeDisponibilidadeDados: true,
  },
  saude_coletiva_br: {
    id: 'saude_coletiva_br',
    nome: 'Saúde Coletiva Brasil (CSP / RSP / C&SC)',
    descricao: 'Cadernos de Saúde Pública, Revista de Saúde Pública e Ciência & Saúde Coletiva.',
    maxPalavrasResumo: 300,
    maxPalavrasCorpo: 6000,
    maxReferencias: 50,
    maxTabelasFiguras: 5,
    exigeCepCaae: true,
    exigeConflitoInteresses: true,
    exigeFinanciamento: true,
    exigeDisponibilidadeDados: true,
  },
  personalizado: {
    id: 'personalizado',
    nome: 'Perfil Personalizado',
    descricao: 'Limites configuráveis pelo pesquisador para o periódico alvo.',
    maxPalavrasResumo: 300,
    maxPalavrasCorpo: 5000,
    maxReferencias: 50,
    maxTabelasFiguras: 6,
    exigeCepCaae: true,
    exigeConflitoInteresses: true,
    exigeFinanciamento: true,
    exigeDisponibilidadeDados: true,
  },
};

function contarPalavras(txt = '') {
  const limpo = String(txt || '').trim();
  if (!limpo) return 0;
  return limpo.split(/\s+/).filter((t) => /[a-zA-ZÀ-ÿ0-9]/.test(t)).length;
}

function separarSecoesParaPreflight(texto = '') {
  const linhas = String(texto || '').split(/\r?\n/);
  const linhasResumo = [];
  const linhasCorpo = [];
  const linhasReferencias = [];

  let estado = 'pre';
  for (const linha of linhas) {
    const t = linha.trim();
    if (!t) continue;

    if (/^(?:\d+\.?\s*)?(?:refer[êe]ncias(?:\s+bibliogr[áa]ficas)?|bibliografia|references)\s*$/i.test(t)) {
      estado = 'referencias';
      continue;
    }
    if (estado === 'referencias') {
      linhasReferencias.push(t);
      continue;
    }

    if (/^(?:\d+\.?\s*)?(?:resumo|abstract)\s*:?$/i.test(t)) {
      estado = 'resumo';
      continue;
    }
    if (/^(?:\d+\.?\s*)?(?:introdu[çc][ãa]o|introduction|m[ée]todos?|metodologia|methods?|resultados?|results?|discuss[ãa]o|discussion|conclus[ãa]o|conclusions?|considera[çc][õo]es\s+finais)\b/i.test(t)) {
      estado = 'corpo';
      linhasCorpo.push(t);
      continue;
    }

    if (estado === 'resumo') {
      if (/^(?:palavras[- ]chave|descritores|keywords?)\s*[:–—-]/i.test(t)) {
        continue;
      }
      linhasResumo.push(t);
    } else {
      linhasCorpo.push(t);
    }
  }

  return {
    textoResumo: linhasResumo.join(' '),
    textoCorpo: linhasCorpo.join('\n'),
    linhasReferencias,
  };
}

function contarTabelasEFigurasUnicas(texto = '') {
  const encontradas = new Set();
  const re = /\b(tabela|table|quadro|figura|figure|gr[áa]fico)\s+(\d{1,3})\b/gi;
  let m;
  while ((m = re.exec(String(texto || ''))) !== null) {
    const tipo = m[1]
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    const chaveTipo = tipo.startsWith('tab') ? 'tabela' : tipo.startsWith('fig') ? 'figura' : tipo;
    encontradas.add(`${chaveTipo}:${m[2]}`);
  }
  return encontradas.size;
}

function verificarDisponibilidadeDados(texto = '') {
  return /\b(?:disponibilidade\s+de\s+dados|dados\s+(?:dispon[íi]veis|abertos|da\s+pesquisa)|data\s+availability|open\s+data|reposit[óo]rio\s+(?:p[úu]blico|institucional|scielo\s+data|zenodo|osf|figshare|dryad)|mediante\s+solicita[çc][ãa]o\s+razo[áa]vel|upon\s+reasonable\s+request)\b/i.test(
    String(texto || '')
  );
}

/**
 * Executa a validação Pre-Flight Editorial completa.
 */
function executarPreflightEditorial({
  texto = '',
  paragrafosCorpo = null,
  totalReferencias = null,
  totalTabelasFiguras = null,
  perfilId = 'saude_coletiva_br',
  limitesPersonalizados = {},
} = {}) {
  const base = PERFIS_EDITORIAIS[perfilId] || PERFIS_EDITORIAIS.saude_coletiva_br;
  const perfil = {
    ...base,
    ...Object.fromEntries(
      Object.entries(limitesPersonalizados || {}).filter(([, v]) => v !== undefined && v !== null && v !== '')
    ),
  };

  const { textoResumo, textoCorpo, linhasReferencias } = separarSecoesParaPreflight(texto);
  const palavrasResumo = contarPalavras(textoResumo);
  const palavrasCorpo = contarPalavras(textoCorpo);
  const qtdReferencias =
    typeof totalReferencias === 'number' && Number.isFinite(totalReferencias)
      ? totalReferencias
      : linhasReferencias.length;
  const qtdTabelasFiguras =
    typeof totalTabelasFiguras === 'number' && Number.isFinite(totalTabelasFiguras)
      ? totalTabelasFiguras
      : contarTabelasEFigurasUnicas(textoCorpo || texto);

  const textoParaEtica = `${textoResumo}\n\n${textoCorpo || texto}`;
  const audClinica = auditarMetodologiaClinicaDoManuscrito(
    Array.isArray(paragrafosCorpo) ? paragrafosCorpo : [],
    textoParaEtica
  );

  const temCepOuCaae = Boolean(audClinica.etica?.mencaoCep || audClinica.etica?.caae || audClinica.etica?.aprovadoCep);
  const temConflito = Boolean(audClinica.transparencia?.temConflitoInteresse);
  const temFinanciamento = Boolean(audClinica.transparencia?.temFinanciamento);
  const temDisponibilidadeDados = verificarDisponibilidadeDados(textoParaEtica);

  const itens = [
    {
      id: 'palavras_resumo',
      categoria: 'extensao',
      rotulo: 'Palavras no Resumo / Abstract',
      valorAtual: palavrasResumo,
      limite: Number(perfil.maxPalavrasResumo),
      status: palavrasResumo === 0 ? 'alerta' : palavrasResumo <= Number(perfil.maxPalavrasResumo) ? 'ok' : 'excedido',
      mensagem:
        palavrasResumo === 0
          ? 'Seção Resumo/Abstract não detectada isoladamente no texto.'
          : palavrasResumo <= Number(perfil.maxPalavrasResumo)
          ? `${palavrasResumo} / ${perfil.maxPalavrasResumo} palavras (dentro do limite).`
          : `Resumo excede o teto do perfil (${palavrasResumo} palavras; limite: ${perfil.maxPalavrasResumo}).`,
    },
    {
      id: 'palavras_corpo',
      categoria: 'extensao',
      rotulo: 'Palavras no Corpo do Manuscrito',
      valorAtual: palavrasCorpo,
      limite: Number(perfil.maxPalavrasCorpo),
      status: palavrasCorpo <= Number(perfil.maxPalavrasCorpo) ? 'ok' : 'excedido',
      mensagem:
        palavrasCorpo <= Number(perfil.maxPalavrasCorpo)
          ? `${palavrasCorpo} / ${perfil.maxPalavrasCorpo} palavras (dentro do limite).`
          : `Corpo do texto excede o teto editorial (${palavrasCorpo} palavras; limite: ${perfil.maxPalavrasCorpo}).`,
    },
    {
      id: 'max_referencias',
      categoria: 'limites',
      rotulo: 'Total de Referências',
      valorAtual: qtdReferencias,
      limite: Number(perfil.maxReferencias),
      status: qtdReferencias <= Number(perfil.maxReferencias) ? 'ok' : 'excedido',
      mensagem:
        qtdReferencias <= Number(perfil.maxReferencias)
          ? `${qtdReferencias} / ${perfil.maxReferencias} referências (dentro do limite).`
          : `Número de referências excede o máximo do periódico (${qtdReferencias}; limite: ${perfil.maxReferencias}).`,
    },
    {
      id: 'max_tabelas_figuras',
      categoria: 'limites',
      rotulo: 'Tabelas, Quadros e Figuras',
      valorAtual: qtdTabelasFiguras,
      limite: Number(perfil.maxTabelasFiguras),
      status: qtdTabelasFiguras <= Number(perfil.maxTabelasFiguras) ? 'ok' : 'excedido',
      mensagem:
        qtdTabelasFiguras <= Number(perfil.maxTabelasFiguras)
          ? `${qtdTabelasFiguras} / ${perfil.maxTabelasFiguras} ilustrações/tabelas (dentro do limite).`
          : `Quantidade de tabelas/figuras excede o teto editorial (${qtdTabelasFiguras}; limite: ${perfil.maxTabelasFiguras}).`,
    },
  ];

  if (perfil.exigeCepCaae) {
    itens.push({
      id: 'declaracao_cep_caae',
      categoria: 'etica',
      rotulo: 'Aprovação Ética (CEP / CAAE)',
      valorAtual: audClinica.etica?.caae || (temCepOuCaae ? 'Mencionado' : 'Ausente'),
      limite: 'Obrigatório',
      status: temCepOuCaae ? 'ok' : 'excedido',
      mensagem: temCepOuCaae
        ? `Aprovação ética/CEP identificada${audClinica.etica?.caae ? ` (CAAE ${audClinica.etica.caae})` : ''}.`
        : 'Menção a Comitê de Ética (CEP/CONEP) ou número CAAE não localizada no manuscrito.',
    });
  }

  if (perfil.exigeConflitoInteresses) {
    itens.push({
      id: 'declaracao_conflito',
      categoria: 'etica',
      rotulo: 'Declaração de Conflito de Interesses',
      valorAtual: temConflito ? 'Presente' : 'Ausente',
      limite: 'Obrigatório',
      status: temConflito ? 'ok' : 'excedido',
      mensagem: temConflito
        ? 'Declaração de conflito de interesses localizada.'
        : 'Declaração de conflito de interesses ausente (requisito ICMJE/SciELO).',
    });
  }

  if (perfil.exigeFinanciamento) {
    itens.push({
      id: 'declaracao_financiamento',
      categoria: 'etica',
      rotulo: 'Declaração de Financiamento / Fomento',
      valorAtual: temFinanciamento ? 'Presente' : 'Ausente',
      limite: 'Obrigatório',
      status: temFinanciamento ? 'ok' : 'excedido',
      mensagem: temFinanciamento
        ? 'Informação de financiamento/fomento localizada.'
        : 'Declaração de financiamento ou ausência de fomento não localizada.',
    });
  }

  if (perfil.exigeDisponibilidadeDados) {
    itens.push({
      id: 'disponibilidade_dados',
      categoria: 'etica',
      rotulo: 'Declaração de Disponibilidade de Dados',
      valorAtual: temDisponibilidadeDados ? 'Presente' : 'Ausente',
      limite: 'Obrigatório',
      status: temDisponibilidadeDados ? 'ok' : 'excedido',
      mensagem: temDisponibilidadeDados
        ? 'Declaração de disponibilidade/compartilhamento de dados localizada.'
        : 'Declaração de disponibilidade de dados ausente (Ciência Aberta / SciELO / ICMJE).',
    });
  }

  const totalChecks = itens.length;
  const totalAprovados = itens.filter((i) => i.status === 'ok').length;
  const totalPendencias = itens.filter((i) => i.status === 'excedido').length;
  const totalAlertas = itens.filter((i) => i.status === 'alerta').length;

  return {
    perfil: {
      id: perfil.id,
      nome: perfil.nome,
      maxPalavrasResumo: Number(perfil.maxPalavrasResumo),
      maxPalavrasCorpo: Number(perfil.maxPalavrasCorpo),
      maxReferencias: Number(perfil.maxReferencias),
      maxTabelasFiguras: Number(perfil.maxTabelasFiguras),
    },
    metricas: {
      palavrasResumo,
      palavrasCorpo,
      totalReferencias: qtdReferencias,
      totalTabelasFiguras: qtdTabelasFiguras,
      caae: audClinica.etica?.caae || null,
      temCepOuCaae,
      temConflito,
      temFinanciamento,
      temDisponibilidadeDados,
    },
    itens,
    resumo: {
      aprovado: totalPendencias === 0,
      totalChecks,
      totalAprovados,
      totalPendencias,
      totalAlertas,
    },
  };
}

module.exports = {
  PERFIS_EDITORIAIS,
  contarPalavras,
  executarPreflightEditorial,
};
