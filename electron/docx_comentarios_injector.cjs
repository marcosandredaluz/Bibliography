/**
 * electron/docx_comentarios_injector.cjs
 * 
 * Injetor Nativo de Comentários e Balões de Revisão no Microsoft Word (.DOCX).
 * Adiciona anotações forenses nativas do Word (OpenXML) para cada inconformidade
 * detectada pela auditoria reversa, permitindo revisão direta no Microsoft Word / LibreOffice.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { escreverArquivoAtomicoSync } = require('./atomicWrite.cjs');

/**
 * Escapa caracteres especiais para XML
 */
function escaparXml(str = '') {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Injeta comentários nativos do Word no arquivo .docx a partir dos alertas da auditoria
 * 
 * @param {string|Buffer} docxEntrada - Caminho do arquivo .docx original ou Buffer
 * @param {string} docxSaida - Caminho onde salvar o arquivo anotado
 * @param {Array} inconformidades - Lista de alertas da auditoria reversa
 * @returns {Promise<{ ok: boolean, totalComentarios: number, caminhoSaida: string }>}
 */
async function injetarComentariosNoDocx(docxEntrada, docxSaida, inconformidades = []) {
  if (!docxEntrada) throw new Error('Documento .docx de entrada não especificado.');
  if (!docxSaida) throw new Error('Caminho de saída para o .docx não especificado.');

  const bufferEntrada = Buffer.isBuffer(docxEntrada)
    ? docxEntrada
    : fs.readFileSync(docxEntrada);

  const zip = await JSZip.loadAsync(bufferEntrada);

  // 1. Carrega word/document.xml
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) {
    throw new Error('Arquivo word/document.xml não encontrado no pacote .docx.');
  }
  let documentXml = await docXmlFile.async('string');

  // Filtra apenas alertas ativos válidos
  const alertasValidos = inconformidades.filter(
    (a) => a && (a.mensagem || a.diagnostico || a.fraseWord)
  );

  if (alertasValidos.length === 0) {
    // Se não há inconformidades, apenas salva cópia
    escreverArquivoAtomicoSync(docxSaida, bufferEntrada);
    return { ok: true, totalComentarios: 0, caminhoSaida: docxSaida };
  }

  // 2. Carrega ou cria word/comments.xml
  let commentsXml = '';
  let maxCommentId = 0;
  const commentsFile = zip.file('word/comments.xml');
  if (commentsFile) {
    commentsXml = await commentsFile.async('string');
    const matchesId = commentsXml.match(/w:id="(\d+)"/g) || [];
    for (const m of matchesId) {
      const idNum = parseInt(m.replace(/\D/g, ''), 10);
      if (idNum > maxCommentId) maxCommentId = idNum;
    }
  } else {
    commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml">\n</w:comments>`;
  }

  const novosComentariosXml = [];
  let contadorId = maxCommentId + 1;

  // Mapeia alertas por número de parágrafo e por trecho
  const alertasPorParagrafo = new Map();
  for (const alerta of alertasValidos) {
    const numP = alerta.numParagrafo || 0;
    if (!alertasPorParagrafo.has(numP)) alertasPorParagrafo.set(numP, []);
    alertasPorParagrafo.get(numP).push(alerta);
  }

  // 3. Itera sobre parágrafos <w:p> no document.xml
  // Regex para capturar tags <w:p ...>...</w:p>
  let paragrafoAtualIdx = 0;
  documentXml = documentXml.replace(/(<w:p(?:\s[^>]*)?>)([\s\S]*?)(<\/w:p>)/g, (match, tagAbertura, corpoParagrafo, tagFechamento) => {
    paragrafoAtualIdx++;
    const alertasDoP = alertasPorParagrafo.get(paragrafoAtualIdx) || [];

    // Também verifica se o texto do parágrafo casa com frases de outros alertas
    for (const alerta of alertasValidos) {
      if (alerta.numParagrafo === 0 && alerta.fraseWord && corpoParagrafo.includes(alerta.fraseWord)) {
        if (!alertasDoP.includes(alerta)) alertasDoP.push(alerta);
      }
    }

    if (alertasDoP.length === 0) {
      return match;
    }

    let pModificado = corpoParagrafo;

    for (const al of alertasDoP) {
      const cId = contadorId++;
      const dataIso = new Date().toISOString();
      const autorAnotacao = 'Auditor Forense (Bibliografia)';
      const tituloProblema = al.tituloProblema || al.tipo || 'INCONFORMIDADE';
      const mensagemProblema = al.mensagem || al.diagnostico || '';
      const sugestao = al.sugestao ? `\n💡 Sugestão de Correção: ${al.sugestao}` : '';

      // Constrói o bloco de comentário no word/comments.xml
      const xmlComentario = `  <w:comment w:id="${cId}" w:author="${escaparXml(autorAnotacao)}" w:date="${dataIso}" w:initials="AF">
    <w:p>
      <w:pPr><w:pStyle w:val="CommentText"/></w:pPr>
      <w:r>
        <w:rPr><w:rStyle w:val="CommentReference"/></w:rPr>
        <w:annotationRef/>
      </w:r>
      <w:r>
        <w:rPr><w:b/></w:rPr>
        <w:t>[${escaparXml(tituloProblema.toUpperCase())}]: </w:t>
      </w:r>
      <w:r>
        <w:t>${escaparXml(mensagemProblema + sugestao)}</w:t>
      </w:r>
    </w:p>
  </w:comment>`;
      novosComentariosXml.push(xmlComentario);

      // Injeta marcas de comentário no corpo do parágrafo
      const marcaInicio = `<w:commentRangeStart w:id="${cId}"/>`;
      const marcaFim = `<w:commentRangeEnd w:id="${cId}"/><w:r><w:rPr><w:rStyle w:val="CommentReference"/></w:rPr><w:commentReference w:id="${cId}"/></w:r>`;

      pModificado = `${marcaInicio}${pModificado}${marcaFim}`;
    }

    return `${tagAbertura}${pModificado}${tagFechamento}`;
  });

  // Se nenhum parágrafo específico foi casado por índice, anexa ao primeiro parágrafo
  if (novosComentariosXml.length === 0 && alertasValidos.length > 0) {
    const al = alertasValidos[0];
    const cId = contadorId++;
    const dataIso = new Date().toISOString();
    novosComentariosXml.push(`  <w:comment w:id="${cId}" w:author="Auditor Forense" w:date="${dataIso}" w:initials="AF">
    <w:p><w:r><w:t>[AUDITORIA]: ${escaparXml(al.mensagem || 'Ressalva identificada')}</w:t></w:r></w:p>
  </w:comment>`);
    const marcaInicio = `<w:commentRangeStart w:id="${cId}"/>`;
    const marcaFim = `<w:commentRangeEnd w:id="${cId}"/><w:r><w:commentReference w:id="${cId}"/></w:r>`;
    documentXml = documentXml.replace(/(<w:p(?:\s[^>]*)?>)/, `$1${marcaInicio}`);
    documentXml = documentXml.replace(/(<\/w:p>)/, `${marcaFim}$1`);
  }

  // 4. Salva word/document.xml atualizado
  zip.file('word/document.xml', documentXml);

  // 5. Atualiza word/comments.xml
  if (commentsXml.includes('</w:comments>')) {
    commentsXml = commentsXml.replace(
      '</w:comments>',
      `${novosComentariosXml.join('\n')}\n</w:comments>`
    );
  } else {
    commentsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:comments xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">\n${novosComentariosXml.join('\n')}\n</w:comments>`;
  }
  zip.file('word/comments.xml', commentsXml);

  // 6. Atualiza word/_rels/document.xml.rels
  const relsFile = zip.file('word/_rels/document.xml.rels');
  if (relsFile) {
    let relsXml = await relsFile.async('string');
    if (!relsXml.includes('relationships/comments')) {
      const relComments = `<Relationship Id="rIdCommentsAuditoria" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/comments" Target="comments.xml"/>`;
      relsXml = relsXml.replace('</Relationships>', `  ${relComments}\n</Relationships>`);
      zip.file('word/_rels/document.xml.rels', relsXml);
    }
  }

  // 7. Atualiza [Content_Types].xml
  const contentTypesFile = zip.file('[Content_Types].xml');
  if (contentTypesFile) {
    let ctXml = await contentTypesFile.async('string');
    if (!ctXml.includes('wordprocessingml.comments+xml')) {
      const overrideComments = `<Override PartName="/word/comments.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.comments+xml"/>`;
      ctXml = ctXml.replace('</Types>', `  ${overrideComments}\n</Types>`);
      zip.file('[Content_Types].xml', ctXml);
    }
  }

  // 8. Gera o novo arquivo compactado
  const bufferSaida = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  escreverArquivoAtomicoSync(docxSaida, bufferSaida);

  return {
    ok: true,
    totalComentarios: novosComentariosXml.length,
    caminhoSaida: docxSaida,
  };
}

module.exports = {
  escaparXml,
  injetarComentariosNoDocx,
};
