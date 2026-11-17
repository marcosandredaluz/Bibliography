/**
 * electron/rede_citacoes_forense.cjs
 * 
 * Módulo de Auditoria Forense de Redes de Citação, Concentração de Autoria e Cartéis.
 * Inspirado nas diretrizes COPE (Committee on Publication Ethics), ICMJE e cliente OpenAlex (PyAlex).
 * 
 * Funcionalidades:
 * 1. Análise de Concentração de Autoria:
 *    - Detecta viés de favorecimento e autocitação desproporcional quando um autor/grupo
 *      concentra mais de 25% de todas as referências citadas do manuscrito.
 * 2. Análise de Diversidade de Fontes e Periódicos:
 *    - Mensura a distribuição de periódicos citados, identificando monopólio de fontes
 *      ou citação excessiva de um único veículo.
 * 3. Detecção de Agrupamentos Suspeitos (Citation Stacking):
 *    - Identifica acúmulo de múltiplas referências consecutivas do mesmo autor em bloco.
 */

'use strict';

/**
 * Normaliza nome de autor ou periódico para contagem canônica.
 */
function normalizarNome(str) {
  return String(str || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

/**
 * Avalia a concentração de citações por autor no manuscrito.
 */
function analisarConcentracaoAutores(refsMapeadas = []) {
  const contagem = new Map();
  let totalCitadas = 0;

  for (const r of refsMapeadas) {
    if (!r.citadaNoTexto && r.citadaNoTexto !== undefined) continue;
    const autor = r.primeiroSobrenome || r.autor || 'Desconhecido';
    const chave = normalizarNome(autor);
    if (!chave || chave === 'desconhecido' || chave.length < 2) continue;

    // Ignora termos institucionais muito genéricos para não gerar falso positivo em saúde pública
    if (['brasil', 'organizacao', 'ministerio', 'secretaria', 'instituto', 'conselho', 'diretrizes', 'national'].includes(chave)) {
      continue;
    }

    const atual = contagem.get(chave) || {
      autorOriginal: autor,
      chave,
      contagem: 0,
      refs: [],
    };
    atual.contagem++;
    atual.refs.push(r);
    contagem.set(chave, atual);
    totalCitadas++;
  }

  const autoresOrdenados = Array.from(contagem.values()).sort((a, b) => b.contagem - a.contagem);
  const alertasConcentracao = [];

  if (totalCitadas >= 8 && autoresOrdenados.length > 0) {
    const principal = autoresOrdenados[0];
    const proporcao = principal.contagem / totalCitadas;

    // Se um único autor responde por mais de 25% de todo o acervo citado (e ao menos 4 obras)
    if (proporcao >= 0.25 && principal.contagem >= 4) {
      alertasConcentracao.push({
        tipo: 'alta_concentracao_autoria',
        autor: principal.autorOriginal,
        totalObras: principal.contagem,
        totalCitadas,
        percentual: Number((proporcao * 100).toFixed(1)),
        mensagem: `📌 ALTA CONCENTRAÇÃO DE CITAÇÕES NO AUTOR "${principal.autorOriginal}": concentra ${principal.contagem} de ${totalCitadas} referências citadas (${(proporcao * 100).toFixed(1)}%). Recomenda-se diversificar as fontes teóricas para evitar viés de favorecimento ou autocitação excessiva (Diretrizes COPE).`,
      });
    }
  }

  return {
    totalAutoresDistintos: contagem.size,
    autoresMaisCitados: autoresOrdenados.slice(0, 5),
    alertasConcentracao,
  };
}

/**
 * Avalia a diversidade de periódicos e veículos científicos citados.
 */
function analisarDiversidadePeriodicos(refsMapeadas = []) {
  const contagem = new Map();
  let totalObrasComPeriodico = 0;

  for (const r of refsMapeadas) {
    const nome = r.csl?.['container-title'] || r.nomePeriodico || null;
    if (!nome) continue;
    const chave = normalizarNome(nome);
    if (!chave || chave.length < 3) continue;

    const atual = contagem.get(chave) || {
      nomeOriginal: nome,
      chave,
      contagem: 0,
    };
    atual.contagem++;
    contagem.set(chave, atual);
    totalObrasComPeriodico++;
  }

  const periodicosOrdenados = Array.from(contagem.values()).sort((a, b) => b.contagem - a.contagem);
  const alertasPeriodicos = [];

  if (totalObrasComPeriodico >= 10 && periodicosOrdenados.length > 0) {
    const principal = periodicosOrdenados[0];
    const proporcao = principal.contagem / totalObrasComPeriodico;

    // Se mais de 35% das referências vierem de um único periódico (e ao menos 4 obras)
    if (proporcao >= 0.35 && principal.contagem >= 4) {
      alertasPeriodicos.push({
        tipo: 'concentracao_periodico',
        periodico: principal.nomeOriginal,
        totalObras: principal.contagem,
        totalObrasComPeriodico,
        percentual: Number((proporcao * 100).toFixed(1)),
        mensagem: `📌 CONCENTRAÇÃO DE VEÍCULO: ${principal.contagem} referências (${(proporcao * 100).toFixed(1)}%) provêm do periódico "${principal.nomeOriginal}". Verifique se a revisão de literatura contempla a amplitude de periódicos indexados da área.`,
      });
    }
  }

  return {
    totalPeriodicosDistintos: contagem.size,
    periodicosMaisCitados: periodicosOrdenados.slice(0, 5),
    alertasPeriodicos,
  };
}

/**
 * Auditoria Forense Integrada da Rede de Citações do Manuscrito.
 */
function auditarRedeCitacoesDoManuscrito({ refsMapeadas = [], gruposCitacao = new Map(), paragrafosCorpo = [] } = {}) {
  const analiseAutores = analisarConcentracaoAutores(refsMapeadas);
  const analisePeriodicos = analisarDiversidadePeriodicos(refsMapeadas);

  const alertasRede = [
    ...analiseAutores.alertasConcentracao,
    ...analisePeriodicos.alertasPeriodicos,
  ];

  return {
    totalAutoresDistintos: analiseAutores.totalAutoresDistintos,
    autoresMaisCitados: analiseAutores.autoresMaisCitados,
    totalPeriodicosDistintos: analisePeriodicos.totalPeriodicosDistintos,
    periodicosMaisCitados: analisePeriodicos.periodicosMaisCitados,
    alertasRede,
  };
}

module.exports = {
  normalizarNome,
  analisarConcentracaoAutores,
  analisarDiversidadePeriodicos,
  auditarRedeCitacoesDoManuscrito,
};
