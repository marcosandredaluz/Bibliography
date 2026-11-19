'use strict';

/**
 * electron/audit/decision_memory.cjs
 *
 * Memória de Decisão Editorial (Fase 4 - Aditivo):
 * - Gera assinatura SHA-256 determinística combinando frase normalizada + ID da referência + código do alerta.
 * - Persiste decisões e justificativas de forma atômica em `auditoria_decisoes.json` na pasta do projeto ativo.
 * - Suprime automaticamente alertas já justificados enquanto o texto da frase permanecer intacto;
 *   qualquer alteração na frase invalida o hash e reativa o alerta imediatamente.
 */

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { escreverJsonAtomicoSync } = require('../atomicWrite.cjs');

const NOME_ARQUIVO_DECISOES = 'auditoria_decisoes.json';

function normalizarComponenteHash(texto = '') {
  return String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Gera assinatura SHA-256 determinística da tríade (frase + referência + código do alerta).
 */
function gerarAssinaturaDecisao({ fraseManuscrito = '', referenciaId = '', codigoAlerta = '' } = {}) {
  const f = normalizarComponenteHash(fraseManuscrito);
  const r = normalizarComponenteHash(referenciaId);
  const c = normalizarComponenteHash(codigoAlerta);
  const payload = `${f}||${r}||${c}`;
  return crypto.createHash('sha256').update(payload, 'utf8').digest('hex');
}

function obterCaminhoArquivoDecisoes(pastaProjeto) {
  if (!pastaProjeto || typeof pastaProjeto !== 'string') {
    throw new Error('Pasta do projeto ativo não informada para memória de decisão editorial.');
  }
  return path.join(pastaProjeto, NOME_ARQUIVO_DECISOES);
}

/**
 * Carrega o arquivo `auditoria_decisoes.json` da pasta do projeto ativo.
 */
function carregarDecisoesEditoriais(pastaProjeto) {
  if (!pastaProjeto || typeof pastaProjeto !== 'string') {
    return { versao: 1, decisoes: {} };
  }
  const caminho = path.join(pastaProjeto, NOME_ARQUIVO_DECISOES);
  if (!fs.existsSync(caminho)) {
    return { versao: 1, decisoes: {} };
  }
  try {
    const bruto = fs.readFileSync(caminho, 'utf8');
    const parsed = JSON.parse(bruto);
    if (!parsed || typeof parsed !== 'object' || typeof parsed.decisoes !== 'object' || !parsed.decisoes) {
      return { versao: 1, decisoes: {} };
    }
    return {
      versao: Number(parsed.versao) || 1,
      decisoes: parsed.decisoes,
    };
  } catch {
    return { versao: 1, decisoes: {} };
  }
}

/**
 * Salva uma decisão de "Ignorar / Falso Positivo Justificado" de forma atômica.
 */
function salvarDecisaoEditorial(
  pastaProjeto,
  {
    fraseManuscrito = '',
    referenciaId = '',
    codigoAlerta = '',
    justificativa = '',
    idItem = '',
    diagnostico = '',
  } = {}
) {
  const caminho = obterCaminhoArquivoDecisoes(pastaProjeto);
  const atual = carregarDecisoesEditoriais(pastaProjeto);
  const hash = gerarAssinaturaDecisao({ fraseManuscrito, referenciaId, codigoAlerta });

  const registro = {
    hash,
    fraseManuscrito: String(fraseManuscrito || ''),
    referenciaId: String(referenciaId || ''),
    codigoAlerta: String(codigoAlerta || ''),
    justificativa: String(justificativa || '').trim() || 'Falso positivo justificado pelo pesquisador.',
    idItem: String(idItem || ''),
    diagnostico: String(diagnostico || '').slice(0, 320),
    atualizadoEm: new Date().toISOString(),
  };

  atual.decisoes[hash] = registro;
  escreverJsonAtomicoSync(caminho, atual);

  return {
    ok: true,
    hash,
    caminho,
    registro,
    totalDecisoes: Object.keys(atual.decisoes).length,
  };
}

/**
 * Remove uma decisão editorial salva pelo hash (reativando o alerta correspondente).
 */
function removerDecisaoEditorial(pastaProjeto, hash) {
  const caminho = obterCaminhoArquivoDecisoes(pastaProjeto);
  const atual = carregarDecisoesEditoriais(pastaProjeto);
  if (hash && Object.prototype.hasOwnProperty.call(atual.decisoes, hash)) {
    delete atual.decisoes[hash];
    escreverJsonAtomicoSync(caminho, atual);
  }
  return {
    ok: true,
    totalDecisoes: Object.keys(atual.decisoes).length,
  };
}

/**
 * Verifica se uma ocorrência específica consta na memória de decisões.
 */
function verificarDecisaoSuprimida(decisoesContainer, { fraseManuscrito = '', referenciaId = '', codigoAlerta = '' } = {}) {
  const mapa = decisoesContainer?.decisoes && typeof decisoesContainer.decisoes === 'object'
    ? decisoesContainer.decisoes
    : decisoesContainer && typeof decisoesContainer === 'object'
    ? decisoesContainer
    : {};
  const hash = gerarAssinaturaDecisao({ fraseManuscrito, referenciaId, codigoAlerta });
  return mapa[hash] || null;
}

/**
 * Filtra uma lista de alertas separando ativos vs. suprimidos por decisão editorial.
 */
function filtrarAlertasComMemoria(alertas = [], decisoesContainer = {}) {
  const ativos = [];
  const suprimidos = [];
  for (const a of alertas || []) {
    const fraseManuscrito = a.fraseWord || a.textoBruto || a.fraseContexto || a.mensagem || '';
    const referenciaId =
      a.refBibId ||
      a.chaveCitacao ||
      a.autorCitado ||
      a.sigla ||
      (a.tabelaNumero ? `Tabela ${a.tabelaNumero}` : '') ||
      a.chave ||
      '';
    const codigoAlerta = a.codigo || a.tipo || a.categoria || 'alerta';
    const decisao = verificarDecisaoSuprimida(decisoesContainer, {
      fraseManuscrito,
      referenciaId,
      codigoAlerta,
    });
    if (decisao) {
      suprimidos.push({ alerta: a, decisao });
    } else {
      ativos.push(a);
    }
  }
  return {
    ativos,
    suprimidos,
    totalSuprimidos: suprimidos.length,
  };
}

module.exports = {
  NOME_ARQUIVO_DECISOES,
  normalizarComponenteHash,
  gerarAssinaturaDecisao,
  obterCaminhoArquivoDecisoes,
  carregarDecisoesEditoriais,
  salvarDecisaoEditorial,
  removerDecisaoEditorial,
  verificarDecisaoSuprimida,
  filtrarAlertasComMemoria,
};
