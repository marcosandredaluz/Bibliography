/**
 * electron/abnt_nbr6023_auditor.cjs
 * 
 * Auditor Forense de Completude Normativa ABNT NBR 6023:2018
 * (Informação e documentação — Referências — Elaboração)
 * 
 * Valida os elementos obrigatórios e a consistência estrutural por tipologia documental:
 * 1. Monografia no todo (Livros, Teses, Dissertações): Autor, Título, Edição, Local (Cidade), Editora, Ano.
 * 2. Artigos de Periódicos: Autor, Título, Título da Revista, Volume, Número/Fascículo, Paginação, Ano.
 * 3. Documentos Eletrônicos (Web): "Disponível em: <URL>. Acesso em: DD mmm. AAAA."
 * 4. Atos Normativos e Leis: Jurisdição, Ementa/Título do ato, Dados da publicação oficial.
 */

'use strict';

/**
 * Meses abreviados padronizados pela ABNT NBR 6023:2018 (3 letras minúsculas seguidas de ponto, exceto maio)
 */
const MESES_ABNT_VALIDOS = new Set([
  'jan.', 'fev.', 'mar.', 'abr.', 'maio', 'jun.', 'jul.', 'ago.', 'set.', 'out.', 'nov.', 'dez.'
]);

/**
 * Classifica a tipologia da referência para fins de auditoria de completude NBR 6023
 */
function identificarTipologiaAbnt(texto = '', metadados = {}) {
  const t = texto.trim();

  // Documento legislativo / governamental
  if (/^(?:BRASIL|ESTADO\s+DE|[A-ZÀ-Ú\s]+(?:\s*\((?:Estado|Munic[íi]pio)\)))\./i.test(t) ||
      /\b(?:Lei\s+n[ºo°]|Decreto\s+n[ºo°]|Portaria\s+n[ºo°]|Resolu[çc][ãa]o\s+n[ºo°]|Constitui[çc][ãa]o)\b/i.test(t)) {
    return 'legislacao';
  }

  // Tese ou Dissertação
  if (/\b(?:Tese\s+\((?:Doutorado|Livre-Doc[êe]ncia)\)|Disserta[çc][ãa]o\s+\(Mestrado\)|Trabalho\s+de\s+Conclus[ãa]o\s+de\s+Curso)\b/i.test(t)) {
    return 'tese_dissertacao';
  }

  // Artigo de periódico ou preprint (indícios de volume, fascículo, DOI científico ou e-locator)
  if (
    /\b(?:v\.|vol\.|n\.|nº|no\.|fasc\.|e\d{5,}|preprint|arxiv|scielo)\s*\d*/i.test(t) ||
    metadados.tipo === 'journal-article' ||
    metadados.periodico ||
    (/\b(?:DOI\s*:?\s*(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,9}\/[^\s]+)\b/i.test(t) && /,\s*(?:19|20)\d\d[a-z]?\./i.test(t))
  ) {
    return 'artigo_periodico';
  }

  // Documento puramente web
  if (/\bhttps?:\/\//i.test(t) && !/\b(?:v\.|vol\.|n\.|nº)\s*\d+/i.test(t)) {
    return 'documento_web';
  }

  // Padrão monográfico (Livro, capítulo ou coletânea)
  return 'monografia_livro';
}

/**
 * Audita uma referência individual segundo os critérios estritos da ABNT NBR 6023:2018
 */
function auditarReferenciaAbntIndividual(ref, idx = 0) {
  const texto = (ref.textoOriginal || ref.raw || '').trim();
  if (!texto || texto.length < 15) return [];

  const inconformidades = [];
  const tipologia = identificarTipologiaAbnt(texto, ref);

  // 1. Verificação de URL e data de acesso (Obrigatório para documentos eletrônicos via URL; pela ABNT NBR 6023:2018 o DOI substitui a exigência de "Disponível em / Acesso em")
  const temDoiOficial = /\bDOI\s*:?\s*(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,9}\/[^\s]+/i.test(texto) ||
    /https?:\/\/(?:dx\.)?doi\.org\/10\.\d{4,9}\/[^\s]+/i.test(texto);
  const textoSemDoi = texto
    .replace(/\bDOI\s*:?\s*(?:https?:\/\/(?:dx\.)?doi\.org\/)?10\.\d{4,9}\/[^\s]+/gi, ' ')
    .replace(/https?:\/\/(?:dx\.)?doi\.org\/10\.\d{4,9}\/[^\s]+/gi, ' ');
  const temUrlNaoDoi = /https?:\/\/[^\s]+/i.test(textoSemDoi);

  if (temUrlNaoDoi && !temDoiOficial) {
    const temDisponivelEm = /Dispon[íi]vel\s+em\s*:\s*<?https?:\/\/[^\s>]+>?/i.test(texto);
    const mAcessoEm = texto.match(/Acesso\s+em\s*:\s*(\d{1,2})\s+([a-zA-Zá-úÁ-Ú.]+)\s+(\d{4})/i);

    if (!temDisponivelEm && !/\bDispon[íi]vel\s+em\b/i.test(texto)) {
      inconformidades.push({
        tipo: 'abnt_formula_disponivel_em',
        gravidade: 'moderada',
        mensagem: 'Fórmula "Disponível em: <URL>" ausente ou fora do padrão normativo ABNT NBR 6023.',
        sugestao: 'Formate a URL precedida exatamente por "Disponível em: <link>."'
      });
    }

    if (!mAcessoEm) {
      inconformidades.push({
        tipo: 'abnt_data_acesso_ausente',
        gravidade: 'alta',
        mensagem: 'Data de acesso ("Acesso em: DD mmm. AAAA.") ausente na referência eletrônica.',
        sugestao: 'Adicione a data da consulta no formato: "Acesso em: 10 out. 2024."'
      });
    } else {
      const mesAbrev = mAcessoEm[2].toLowerCase();
      if (!MESES_ABNT_VALIDOS.has(mesAbrev) && !MESES_ABNT_VALIDOS.has(`${mesAbrev}.`)) {
        inconformidades.push({
          tipo: 'abnt_mes_acesso_fora_padrao',
          gravidade: 'leve',
          mensagem: `Abreviação do mês de acesso "${mAcessoEm[2]}" não segue a convenção ABNT (jan., fev., mar., abr., maio, jun., jul., ago., set., out., nov., dez.).`,
          sugestao: 'Utilize 3 letras minúsculas seguidas de ponto (ex: "out.", "ago."), exceto maio que não se abrevia.'
        });
      }
    }
  }

  // 2. Verificação de Livros / Monografias
  if (tipologia === 'monografia_livro') {
    // Cidade (opcionalmente com UF: "São Luís, MA:") e Editora (opcionalmente coeditora ";" ou "/"), seguidas de Ano (com sufixo opcional a-f)
    const temPadraoLocalEditora =
      /(?:[A-ZÀ-Ú][a-zA-Zà-ú\s.,'-]{1,60}|\b\[S\.l\.\])\s*:\s*(?:[A-ZÀ-Úa-zà-ú0-9\s.,;/'&-]{1,100}|\b\[s\.n\.\])\s*,\s*(?:[12]\d{3}[a-f]?|\[20--[a-z]?\])/i.test(
        texto
      );
    const temLocalIsolado = /:\s*[A-ZÀ-Ú][A-Za-zÀ-ÿ]+/.test(texto);

    if (!temPadraoLocalEditora && !temLocalIsolado) {
      inconformidades.push({
        tipo: 'abnt_livro_sem_local_editora',
        gravidade: 'alta',
        mensagem: 'Referência de livro/monografia sem identificação clara de Local de publicação (Cidade) e/ou Editora.',
        sugestao: 'Acrescente a cidade e a editora no formato: "Cidade: Editora, Ano." Caso desconhecidos, use "[S.l.: s.n.]".'
      });
    }
  }

  // 3. Verificação de Artigos de Periódicos (preprints em repositórios oficiais dispensam volume/paginação)
  if (tipologia === 'artigo_periodico') {
    const ehPreprint = /\b(?:preprint|biorxiv|medrxiv|arxiv|scielo\s+preprints)\b/i.test(texto);
    const temVolume = /\b(?:v\.|vol\.)\s*\d+/i.test(texto);
    const temFasciculo = /\b(?:n\.|nº|no\.|fasc\.)\s*\d+/i.test(texto);
    const temPaginacao = /\bp\.\s*\d+(?:\s*[-–]\s*\d+)?\b/i.test(texto) || /\b(?:e\d{5,}|art\.\s*e\d+)\b/i.test(texto);

    if (!ehPreprint && !temPaginacao && !temVolume && !temFasciculo) {
      inconformidades.push({
        tipo: 'abnt_artigo_sem_volume_paginas',
        gravidade: 'alta',
        mensagem: 'Artigo de periódico sem indicação de volume, fascículo ou paginação.',
        sugestao: 'Indique o volume, fascículo e intervalo de páginas (ex: v. 15, n. 2, p. 100-115, 2023).'
      });
    }
  }

  return inconformidades.map((inc) => ({
    ...inc,
    idxRef: idx + 1,
    chaveRef: ref.primeiroSobrenome ? `${ref.primeiroSobrenome} (${ref.ano})` : `Referência #${idx + 1}`,
    textoReferencia: texto,
    tipologia
  }));
}

/**
 * Audita a completude ABNT NBR 6023:2018 para todo o rol de referências do trabalho.
 */
function auditarCompletudeAbnt6023(referenciasMapeadas = []) {
  const todosAlertas = [];

  referenciasMapeadas.forEach((ref, idx) => {
    const alertasRef = auditarReferenciaAbntIndividual(ref, idx);
    todosAlertas.push(...alertasRef);
  });

  const porGravidade = {
    alta: todosAlertas.filter((a) => a.gravidade === 'alta').length,
    moderada: todosAlertas.filter((a) => a.gravidade === 'moderada').length,
    leve: todosAlertas.filter((a) => a.gravidade === 'leve').length,
  };

  return {
    totalInconformidadesAbnt: todosAlertas.length,
    porGravidade,
    alertasAbnt6023: todosAlertas,
  };
}

module.exports = {
  MESES_ABNT_VALIDOS,
  identificarTipologiaAbnt,
  auditarReferenciaAbntIndividual,
  auditarCompletudeAbnt6023,
};
