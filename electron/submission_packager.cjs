'use strict';

/**
 * electron/submission_packager.cjs
 *
 * Gerador de Pacote de Submissão (.zip) (Fase 4 - Aditivo):
 * 1. Gera cópia limpa do `.docx` para revisão cega (double-blind review):
 *    - Converte campos dinâmicos Word (`<w:fldChar>`, `<w:instrText>`, `<w:fldSimple>`) em texto plano;
 *    - Remove propriedades pessoais/autoria em `docProps/core.xml` e `docProps/app.xml`;
 *    - Remove arquivos de comentários/identidade (`word/comments*.xml`, `word/people.xml`).
 * 2. Gera diagramas vetoriais SVG de alta resolução: PRISMA 2020 e Risco de Viés (RoB 2 / ROBINS-I).
 * 3. Inclui resumo técnico de conformidade da auditoria em Markdown.
 * 4. Empacota tudo em `.zip` válido com escrita atômica (`atomicWrite.cjs`).
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { escreverArquivoAtomicoSync } = require('./atomicWrite.cjs');

function calcularCrc32(buf) {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * Lê todas as entradas de um buffer ZIP usando o Central Directory
 * (compatível com arquivos .docx reais com data descriptors).
 */
function lerEntradasZip(zipBuf) {
  const buf = Buffer.isBuffer(zipBuf) ? zipBuf : Buffer.from(zipBuf);
  // Localiza End of Central Directory (0x06054b50) a partir do fim do arquivo
  let eocdOffset = -1;
  const minOffset = Math.max(0, buf.length - 65557);
  for (let i = buf.length - 22; i >= minOffset; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocdOffset = i;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('Arquivo ZIP/DOCX inválido (assinatura EOCD não encontrada).');
  }

  const totalEntradas = buf.readUInt16LE(eocdOffset + 10);
  const cdOffset = buf.readUInt32LE(eocdOffset + 16);

  const entradas = [];
  let cursor = cdOffset;
  for (let i = 0; i < totalEntradas && cursor + 46 <= buf.length; i++) {
    if (buf.readUInt32LE(cursor) !== 0x02014b50) break;
    const metodo = buf.readUInt16LE(cursor + 10);
    const compSize = buf.readUInt32LE(cursor + 20);
    const nameLen = buf.readUInt16LE(cursor + 28);
    const extraLen = buf.readUInt16LE(cursor + 30);
    const commentLen = buf.readUInt16LE(cursor + 32);
    const localHeaderOffset = buf.readUInt32LE(cursor + 42);

    const nome = buf.slice(cursor + 46, cursor + 46 + nameLen).toString('utf8');
    cursor += 46 + nameLen + extraLen + commentLen;

    if (localHeaderOffset + 30 > buf.length) continue;
    const lNameLen = buf.readUInt16LE(localHeaderOffset + 26);
    const lExtraLen = buf.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
    const rawSlice = buf.slice(dataStart, dataStart + compSize);

    let conteudo;
    if (metodo === 0) {
      conteudo = Buffer.from(rawSlice);
    } else if (metodo === 8) {
      conteudo = zlib.inflateRawSync(rawSlice);
    } else {
      continue;
    }
    entradas.push({ nome, conteudo });
  }

  return entradas;
}

/**
 * Empacota uma lista de `{ nome, conteudo }` em um buffer ZIP padrão (Deflate).
 */
function criarZipBuffer(entradas = []) {
  const partesLocais = [];
  const partesCentrais = [];
  let offset = 0;

  for (const { nome, conteudo } of entradas) {
    const nomeNorm = String(nome || '').replace(/\\/g, '/');
    const nomeBuf = Buffer.from(nomeNorm, 'utf8');
    const plainBuf = Buffer.isBuffer(conteudo) ? conteudo : Buffer.from(String(conteudo || ''), 'utf8');
    const crc = calcularCrc32(plainBuf);
    const compressed = zlib.deflateRawSync(plainBuf);
    const usarDeflate = compressed.length < plainBuf.length;
    const dataBuf = usarDeflate ? compressed : plainBuf;
    const metodo = usarDeflate ? 8 : 0;

    const local = Buffer.alloc(30 + nomeBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 filename flag
    local.writeUInt16LE(metodo, 8);
    local.writeUInt16LE(0, 10);
    local.writeUInt16LE(0, 12);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(dataBuf.length, 18);
    local.writeUInt32LE(plainBuf.length, 22);
    local.writeUInt16LE(nomeBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nomeBuf.copy(local, 30);

    partesLocais.push(local, dataBuf);

    const central = Buffer.alloc(46 + nomeBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt16LE(0x0800, 8);
    central.writeUInt16LE(metodo, 10);
    central.writeUInt16LE(0, 12);
    central.writeUInt16LE(0, 14);
    central.writeUInt32LE(crc, 16);
    central.writeUInt32LE(dataBuf.length, 20);
    central.writeUInt32LE(plainBuf.length, 24);
    central.writeUInt16LE(nomeBuf.length, 28);
    central.writeUInt16LE(0, 30);
    central.writeUInt16LE(0, 32);
    central.writeUInt16LE(0, 34);
    central.writeUInt16LE(0, 36);
    central.writeUInt32LE(0, 38);
    central.writeUInt32LE(offset, 42);
    nomeBuf.copy(central, 46);
    partesCentrais.push(central);

    offset += local.length + dataBuf.length;
  }

  const centralDir = Buffer.concat(partesCentrais);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entradas.length, 8);
  eocd.writeUInt16LE(entradas.length, 10);
  eocd.writeUInt32LE(centralDir.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...partesLocais, centralDir, eocd]);
}

/**
 * Converte campos dinâmicos Word em texto plano em `word/document.xml`,
 * preservando apenas o texto renderizado visível.
 */
function converterCamposDinamicosParaTextoPlano(documentXml = '') {
  let xml = String(documentXml || '');
  let camposConvertidos = 0;

  // 1. <w:fldSimple ...>inner</w:fldSimple> -> inner
  xml = xml.replace(/<w:fldSimple\b[^>]*>([\s\S]*?)<\/w:fldSimple>/g, (_m, inner) => {
    camposConvertidos++;
    return inner;
  });

  // 2. Remove runs contendo exclusivamente <w:fldChar .../> ou <w:instrText>...</w:instrText>
  xml = xml.replace(/<w:r\b[^>]*>(?:\s*<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:fldChar\b[^>]*\/>\s*<\/w:r>/g, () => {
    camposConvertidos++;
    return '';
  });
  xml = xml.replace(/<w:r\b[^>]*>(?:\s*<w:rPr>[\s\S]*?<\/w:rPr>)?\s*<w:(?:del)?instrText\b[^>]*>[\s\S]*?<\/w:(?:del)?instrText>\s*<\/w:r>/g, () => {
    camposConvertidos++;
    return '';
  });

  // 3. Remove qualquer <w:fldChar> ou <w:instrText> residual dentro de runs mistos
  xml = xml.replace(/<w:fldChar\b[^>]*\/>/g, () => {
    camposConvertidos++;
    return '';
  });
  xml = xml.replace(/<w:(?:del)?instrText\b[^>]*>[\s\S]*?<\/w:(?:del)?instrText>/g, () => {
    camposConvertidos++;
    return '';
  });

  return { xml, camposConvertidos };
}

/**
 * Remove propriedades pessoais e de autoria de `docProps/core.xml` e `docProps/app.xml`.
 */
function anonimizarPropriedadesXml(xml = '', tipo = 'core') {
  let limpo = String(xml || '');
  let camposRemovidos = 0;

  const tagsAlvo =
    tipo === 'core'
      ? ['dc:creator', 'cp:lastModifiedBy', 'dc:description', 'cp:keywords', 'dc:subject']
      : ['Company', 'Manager', 'HyperlinkBase'];

  for (const tag of tagsAlvo) {
    const re = new RegExp(`<${tag}\\b[^>]*>[\\s\\S]*?<\\/${tag}>`, 'gi');
    limpo = limpo.replace(re, () => {
      camposRemovidos++;
      return `<${tag}></${tag}>`;
    });
  }
  return { xml: limpo, camposRemovidos };
}

/**
 * Gera uma cópia limpa do `.docx` para revisão cega (double-blind review).
 */
function limparDocxParaRevisaoCega(docxBuffer) {
  const entradasOriginais = lerEntradasZip(docxBuffer);
  const entradasLimpas = [];
  const detalhes = {
    camposDinamicosConvertidos: 0,
    metadadosAutorRemovidos: 0,
    arquivosComentariosRemovidos: 0,
  };

  for (const ent of entradasOriginais) {
    const nomeLower = ent.nome.toLowerCase();
    // Remove comentários e metadados de pessoas para revisão cega
    if (
      nomeLower === 'word/comments.xml' ||
      nomeLower === 'word/commentsextended.xml' ||
      nomeLower === 'word/commentsids.xml' ||
      nomeLower === 'word/people.xml'
    ) {
      detalhes.arquivosComentariosRemovidos++;
      continue;
    }

    if (nomeLower === 'word/document.xml') {
      const { xml, camposConvertidos } = converterCamposDinamicosParaTextoPlano(ent.conteudo.toString('utf8'));
      detalhes.camposDinamicosConvertidos += camposConvertidos;
      entradasLimpas.push({ nome: ent.nome, conteudo: Buffer.from(xml, 'utf8') });
      continue;
    }

    if (nomeLower === 'docprops/core.xml') {
      const { xml, camposRemovidos } = anonimizarPropriedadesXml(ent.conteudo.toString('utf8'), 'core');
      detalhes.metadadosAutorRemovidos += camposRemovidos;
      entradasLimpas.push({ nome: ent.nome, conteudo: Buffer.from(xml, 'utf8') });
      continue;
    }

    if (nomeLower === 'docprops/app.xml') {
      const { xml, camposRemovidos } = anonimizarPropriedadesXml(ent.conteudo.toString('utf8'), 'app');
      detalhes.metadadosAutorRemovidos += camposRemovidos;
      entradasLimpas.push({ nome: ent.nome, conteudo: Buffer.from(xml, 'utf8') });
      continue;
    }

    entradasLimpas.push(ent);
  }

  return {
    bufferDocxLimpo: criarZipBuffer(entradasLimpas),
    detalhes,
  };
}

function escaparSvg(str = '') {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Gera diagrama PRISMA 2020 em SVG vetorial de alta resolução (1200x820).
 */
function gerarSvgPrisma2020(metricas = {}) {
  const identificados = Number(metricas.identificados ?? metricas.total ?? 0);
  const duplicatas = Number(metricas.duplicatasRemovidas ?? 0);
  const triados = Number(metricas.triados ?? Math.max(0, identificados - duplicatas));
  const excluidos = Number(metricas.excluidos ?? 0);
  const incluidos = Number(metricas.incluidos ?? Math.max(0, triados - excluidos));

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 820" width="1200" height="820">
  <defs>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
      <path d="M 0 1 L 10 5 L 0 9 z" fill="#334155"/>
    </marker>
    <style>
      .title { font: 700 22px "Segoe UI", Arial, sans-serif; fill: #0f172a; }
      .phase { font: 700 14px "Segoe UI", Arial, sans-serif; fill: #ffffff; }
      .box-title { font: 700 16px "Segoe UI", Arial, sans-serif; fill: #0f172a; }
      .box-text { font: 400 15px "Segoe UI", Arial, sans-serif; fill: #334155; }
    </style>
  </defs>
  <rect width="1200" height="820" fill="#ffffff"/>
  <text x="600" y="48" text-anchor="middle" class="title">Fluxograma PRISMA 2020 — Seleção de Estudos</text>

  <!-- Faixas laterais de fase -->
  <rect x="40" y="90" width="150" height="150" rx="8" fill="#a81c24"/>
  <text x="115" y="170" text-anchor="middle" class="phase">IDENTIFICAÇÃO</text>

  <rect x="40" y="290" width="150" height="220" rx="8" fill="#1e40af"/>
  <text x="115" y="405" text-anchor="middle" class="phase">TRIAGEM</text>

  <rect x="40" y="560" width="150" height="170" rx="8" fill="#15803d"/>
  <text x="115" y="650" text-anchor="middle" class="phase">INCLUÍDOS</text>

  <!-- Caixas principais -->
  <rect x="230" y="90" width="420" height="150" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
  <text x="255" y="130" class="box-title">Registros identificados em bases</text>
  <text x="255" y="168" class="box-text">Total identificado: n = ${identificados}</text>

  <rect x="720" y="90" width="430" height="150" rx="8" fill="#fef2f2" stroke="#fca5a5" stroke-width="2"/>
  <text x="745" y="130" class="box-title">Registros removidos antes da triagem</text>
  <text x="745" y="168" class="box-text">Duplicatas mescladas/removidas: n = ${duplicatas}</text>

  <rect x="230" y="290" width="420" height="220" rx="8" fill="#f8fafc" stroke="#cbd5e1" stroke-width="2"/>
  <text x="255" y="335" class="box-title">Registros triados (títulos e resumos)</text>
  <text x="255" y="375" class="box-text">Avaliados na triagem: n = ${triados}</text>

  <rect x="720" y="290" width="430" height="220" rx="8" fill="#fffbeb" stroke="#fcd34d" stroke-width="2"/>
  <text x="745" y="335" class="box-title">Registros excluídos na triagem</text>
  <text x="745" y="375" class="box-text">Descartados por critérios PICO: n = ${excluidos}</text>

  <rect x="230" y="560" width="420" height="170" rx="8" fill="#f0fdf4" stroke="#86efac" stroke-width="2.5"/>
  <text x="255" y="610" class="box-title">Estudos incluídos na síntese</text>
  <text x="255" y="650" class="box-text">Total de estudos incluídos: n = ${incluidos}</text>

  <!-- Setas -->
  <line x1="650" y1="165" x2="718" y2="165" stroke="#334155" stroke-width="2.5" marker-end="url(#arrow)"/>
  <line x1="440" y1="240" x2="440" y2="288" stroke="#334155" stroke-width="2.5" marker-end="url(#arrow)"/>
  <line x1="650" y1="400" x2="718" y2="400" stroke="#334155" stroke-width="2.5" marker-end="url(#arrow)"/>
  <line x1="440" y1="510" x2="440" y2="558" stroke="#334155" stroke-width="2.5" marker-end="url(#arrow)"/>
</svg>`;
}

/**
 * Gera gráfico vetorial SVG de Risco de Viés (RoB 2 / ROBINS-I).
 */
function gerarSvgRiscoDeVies(avaliacoesRob = []) {
  const lista = Array.isArray(avaliacoesRob) ? avaliacoesRob : [];
  let baixo = 0;
  let moderado = 0;
  let alto = 0;

  for (const av of lista) {
    const julg = String(av?.julgamentoGeral || av?.riscoGeral || av?.status || '').toLowerCase();
    if (/alto|high|crit|s[ée]rio/.test(julg)) alto++;
    else if (/alguma|moderate|moderado|some|unclear/.test(julg)) moderado++;
    else baixo++;
  }

  const total = Math.max(1, baixo + moderado + alto);
  const wTotal = 860;
  const wBaixo = Math.round((baixo / total) * wTotal);
  const wMod = Math.round((moderado / total) * wTotal);
  const wAlto = Math.max(0, wTotal - wBaixo - wMod);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1100 380" width="1100" height="380">
  <style>
    .title { font: 700 20px "Segoe UI", Arial, sans-serif; fill: #0f172a; }
    .sub { font: 400 14px "Segoe UI", Arial, sans-serif; fill: #475569; }
    .lbl { font: 600 14px "Segoe UI", Arial, sans-serif; fill: #1e293b; }
  </style>
  <rect width="1100" height="380" fill="#ffffff"/>
  <text x="550" y="48" text-anchor="middle" class="title">Resumo de Risco de Viés (RoB 2 / ROBINS-I)</text>
  <text x="550" y="76" text-anchor="middle" class="sub">Total de estudos avaliados: ${lista.length}</text>

  <rect x="120" y="130" width="${wTotal}" height="64" rx="8" fill="#e2e8f0"/>
  ${lista.length > 0 ? `
  <rect x="120" y="130" width="${wBaixo}" height="64" fill="#16a34a"/>
  <rect x="${120 + wBaixo}" y="130" width="${wMod}" height="64" fill="#eab308"/>
  <rect x="${120 + wBaixo + wMod}" y="130" width="${wAlto}" height="64" fill="#dc2626"/>
  ` : ''}

  <rect x="120" y="235" width="20" height="20" rx="4" fill="#16a34a"/>
  <text x="150" y="250" class="lbl">Baixo risco: ${baixo} (${lista.length ? Math.round((baixo / lista.length) * 100) : 0}%)</text>

  <rect x="430" y="235" width="20" height="20" rx="4" fill="#eab308"/>
  <text x="460" y="250" class="lbl">Algumas preocupações / Moderado: ${moderado} (${lista.length ? Math.round((moderado / lista.length) * 100) : 0}%)</text>

  <rect x="120" y="285" width="20" height="20" rx="4" fill="#dc2626"/>
  <text x="150" y="300" class="lbl">Alto risco / Crítico: ${alto} (${lista.length ? Math.round((alto / lista.length) * 100) : 0}%)</text>
</svg>`;
}

/**
 * Gera resumo técnico de conformidade da auditoria em Markdown.
 */
function gerarResumoConformidadeMd(resumoAuditoria = {}) {
  const linhas = [
    '# Resumo Técnico de Conformidade — Pacote de Submissão',
    '',
    `- **Gerado em:** ${new Date().toISOString()}`,
    `- **Referências mapeadas:** ${resumoAuditoria.totalReferencias ?? 'N/D'}`,
    `- **Citações verificadas:** ${resumoAuditoria.totalCitacoes ?? 'N/D'}`,
    `- **Inconformidades ativas:** ${resumoAuditoria.totalInconformidades ?? 0}`,
    `- **Alertas suprimidos por decisão editorial:** ${resumoAuditoria.totalSuprimidos ?? 0}`,
  ];
  if (resumoAuditoria.perfilEditorial) {
    linhas.push(`- **Perfil Editorial Pre-Flight:** ${escaparSvg(resumoAuditoria.perfilEditorial)}`);
  }
  if (resumoAuditoria.observacoes) {
    linhas.push('', '## Observações', '', String(resumoAuditoria.observacoes));
  }
  linhas.push('', '---', 'Gerado automaticamente pelo módulo de Submissão Editorial (v1.2.0).');
  return linhas.join('\n');
}

/**
 * Gera o pacote de submissão `.zip` consolidado.
 */
function gerarPacoteSubmissaoZip({
  caminhoDocx = null,
  bufferDocx = null,
  caminhoSaidaZip = null,
  limparDocxCego = true,
  incluirPrismaRobSvg = true,
  incluirResumoAuditoria = true,
  metricasPrisma = {},
  avaliacoesRob = [],
  resumoAuditoria = {},
  nomeBase = 'Manuscrito',
} = {}) {
  const arquivos = [];
  let detalhesLimpeza = null;
  const nomeSeguro = String(nomeBase || 'Manuscrito')
    .replace(/[<>:"/\\|?*]+/g, '_')
    .trim() || 'Manuscrito';

  const bufDocxEfetivo = Buffer.isBuffer(bufferDocx)
    ? bufferDocx
    : typeof caminhoDocx === 'string' && fs.existsSync(caminhoDocx)
    ? fs.readFileSync(caminhoDocx)
    : null;

  if (bufDocxEfetivo) {
    if (limparDocxCego) {
      const resLimpeza = limparDocxParaRevisaoCega(bufDocxEfetivo);
      detalhesLimpeza = resLimpeza.detalhes;
      arquivos.push({
        nome: `${nomeSeguro}_Revisao_Cega.docx`,
        conteudo: resLimpeza.bufferDocxLimpo,
      });
    } else {
      arquivos.push({
        nome: `${nomeSeguro}.docx`,
        conteudo: bufDocxEfetivo,
      });
    }
  }

  if (incluirPrismaRobSvg) {
    arquivos.push({
      nome: 'Figuras/PRISMA_2020_Fluxograma.svg',
      conteudo: Buffer.from(gerarSvgPrisma2020(metricasPrisma), 'utf8'),
    });
    arquivos.push({
      nome: 'Figuras/Risco_de_Vies_RoB2_ROBINSI.svg',
      conteudo: Buffer.from(gerarSvgRiscoDeVies(avaliacoesRob), 'utf8'),
    });
  }

  if (incluirResumoAuditoria) {
    arquivos.push({
      nome: 'Resumo_Conformidade_Auditoria.md',
      conteudo: Buffer.from(gerarResumoConformidadeMd(resumoAuditoria), 'utf8'),
    });
  }

  if (arquivos.length === 0) {
    throw new Error('Nenhum componente selecionado para compor o pacote de submissão (.zip).');
  }

  const bufferZip = criarZipBuffer(arquivos);
  if (caminhoSaidaZip) {
    escreverArquivoAtomicoSync(caminhoSaidaZip, bufferZip);
  }

  return {
    ok: true,
    caminhoSaidaZip,
    arquivosIncluidos: arquivos.map((a) => a.nome),
    tamanhoBytes: bufferZip.length,
    detalhesLimpeza,
    bufferZip,
  };
}

module.exports = {
  lerEntradasZip,
  criarZipBuffer,
  converterCamposDinamicosParaTextoPlano,
  anonimizarPropriedadesXml,
  limparDocxParaRevisaoCega,
  gerarSvgPrisma2020,
  gerarSvgRiscoDeVies,
  gerarResumoConformidadeMd,
  gerarPacoteSubmissaoZip,
};
