/**
 * electron/docx_surgical_editor.cjs
 * 
 * Editor Cirúrgico Nativo em OpenXML (.DOCX) para Resolução Direta de Inconformidades.
 * Permite:
 * 1. Substituir/editar trechos de texto ou remover citações mantendo a formatação dos demais runs (<w:rPr>).
 * 2. Remover frases completas com limpeza automática de pontuação e espaços residuais.
 * 3. Inserir novas referências bibliográficas diretamente na seção REFERÊNCIAS do Word em ordem alfabética.
 * 4. Remover referências excedentes da lista final ou inserir declarações ao final do corpo do texto.
 * 5. Extrair o texto atualizado após a cirurgia para atualização instantânea da auditoria.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { injetarComentariosNoDocx } = require('./docx_comentarios_injector.cjs');
const { escreverArquivoAtomico, copiarArquivoAtomico } = require('./atomicWrite.cjs');

/**
 * Decodifica entidades XML básicas
 */
function decodificarXml(str = '') {
  return String(str)
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

/**
 * Escapa caracteres especiais para XML seguro
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
 * Encontra todos os elementos <w:p>...</w:p> com início, fim e profundidade correta
 */
function extrairParagrafosXml(documentXml) {
  const resultado = [];
  const regexTag = /<\/?w:p(?:\s[^>]*)?>/g;
  const pilha = [];
  let m;

  while ((m = regexTag.exec(documentXml)) !== null) {
    const tag = m[0];
    if (tag.startsWith('</w:p')) {
      if (pilha.length > 0) {
        const inicio = pilha.pop();
        if (pilha.length === 0) {
          // Apenas parágrafos raiz ou folha; guarda ambos tratando aninhamento depois
          resultado.push({
            inicio,
            fim: m.index + tag.length,
            xml: documentXml.slice(inicio, m.index + tag.length),
          });
        }
      }
    } else if (!tag.endsWith('/>')) {
      pilha.push(m.index);
    }
  }
  return resultado;
}

/**
 * Extrai runs <w:r> e seus <w:t> dentro de um parágrafo XML
 */
function analisarRunsParagrafo(pXml) {
  const runs = [];
  const regexT = /<w:t(?:\s+[^>]*)?>([\s\S]*?)<\/w:t>/g;
  let textoCompleto = '';
  let m;

  while ((m = regexT.exec(pXml)) !== null) {
    const textoDecodificado = decodificarXml(m[1]);
    const tagCompleta = m[0];
    const aberturaFim = tagCompleta.indexOf('>') + 1;
    const inicioConteudo = m.index + aberturaFim;
    const fimConteudo = m.index + tagCompleta.length - '</w:t>'.length;

    runs.push({
      tagInicio: m.index,
      tagFim: m.index + tagCompleta.length,
      inicioConteudo,
      fimConteudo,
      texto: textoDecodificado,
      offsetInicio: textoCompleto.length,
      offsetFim: textoCompleto.length + textoDecodificado.length,
    });
    textoCompleto += textoDecodificado;
  }

  return { runs, textoCompleto };
}

/**
 * Normaliza aspas e espaços múltiplos para busca tolerante entre extração de texto e XML bruto
 */
function normalizarParaBusca(str = '') {
  return String(str)
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/\u00A0/g, ' ')
    .replace(/\s+/g, ' ');
}

/**
 * Limpa pontuação duplicada e espaços extras deixados após remoção de citação ou frase
 */
function limparPontuacaoResidual(texto) {
  return texto
    .replace(/\s+([.,;:!?])/g, '$1')
    .replace(/,\s*,+/g, ',')
    .replace(/,\s*\./g, '.')
    .replace(/;\s*\./g, '.')
    .replace(/\(\s*\)/g, '')
    .replace(/\s{2,}/g, ' ')
    .replace(/^\s+/, '');
}

/**
 * Substitui uma substring exata dentro do XML de um parágrafo preservando a formatação dos demais runs
 */
function substituirSpanEmParagrafoXml(pXml, matchStart, matchEnd, novoTrecho) {
  const { runs } = analisarRunsParagrafo(pXml);
  if (runs.length === 0) return pXml;

  let novoPXml = '';
  let cursor = 0;
  let inseriuSubstituicao = false;

  for (const r of runs) {
    // Run totalmente fora do trecho substituído
    if (r.offsetFim <= matchStart || r.offsetInicio >= matchEnd) {
      continue;
    }

    // Há sobreposição com [matchStart, matchEnd)
    const parteAntes = r.offsetInicio < matchStart
      ? r.texto.slice(0, matchStart - r.offsetInicio)
      : '';
    const parteDepois = r.offsetFim > matchEnd
      ? r.texto.slice(matchEnd - r.offsetInicio)
      : '';

    let novoTextoRun = '';
    if (!inseriuSubstituicao) {
      novoTextoRun = parteAntes + novoTrecho + parteDepois;
      inseriuSubstituicao = true;
    } else {
      novoTextoRun = parteAntes + parteDepois;
    }

    // Garante xml:space="preserve" se houver espaços nas pontas
    const tagAbertura = pXml.slice(r.tagInicio, r.inicioConteudo);
    const novaTagAbertura = tagAbertura.includes('xml:space')
      ? tagAbertura
      : tagAbertura.replace('<w:t', '<w:t xml:space="preserve"');

    novoPXml += pXml.slice(cursor, r.tagInicio) + novaTagAbertura + escaparXml(novoTextoRun) + '</w:t>';
    cursor = r.tagFim;
  }

  novoPXml += pXml.slice(cursor);
  return novoPXml;
}

/**
 * Localiza o parágrafo correspondente a `textoAlvo` em documentXml e realiza substituição cirúrgica.
 * 
 * @param {string} documentXml
 * @param {string} textoAlvo - Frase, citação ou trecho exato a ser substituído/removido
 * @param {string} novoTexto - Novo texto (use '' para remover)
 * @param {Object} opcoes - { todasOcorrencias: boolean, limparPontuacao: boolean }
 */
function aplicarSubstituicaoEmDocumentXml(documentXml, textoAlvo, novoTexto, opcoes = {}) {
  if (!textoAlvo) return { xml: documentXml, alteracoes: 0 };
  const paragrafos = extrairParagrafosXml(documentXml);
  const alvoNorm = normalizarParaBusca(textoAlvo).trim();
  if (!alvoNorm) return { xml: documentXml, alteracoes: 0 };

  let alteracoes = 0;
  let partes = [];
  let cursor = 0;

  for (const p of paragrafos) {
    const { textoCompleto } = analisarRunsParagrafo(p.xml);
    const pNorm = normalizarParaBusca(textoCompleto);

    // Tenta match exato primeiro; se falhar, tenta via versão normalizada mapeando índices
    let idx = textoCompleto.indexOf(textoAlvo);
    let lenMatch = textoAlvo.length;

    if (idx === -1) {
      const idxNorm = pNorm.indexOf(alvoNorm);
      if (idxNorm !== -1) {
        // Reconstrói posição aproximada no texto original
        idx = textoCompleto.toLowerCase().indexOf(textoAlvo.toLowerCase());
        if (idx === -1) {
          // Substitui parágrafo normalizado limpando apenas via match por prefixo/palavras-chave
          const primeiroTermo = textoAlvo.trim().slice(0, 20);
          const ultimoTermo = textoAlvo.trim().slice(-15);
          const pIni = textoCompleto.indexOf(primeiroTermo);
          const pFim = ultimoTermo ? textoCompleto.indexOf(ultimoTermo, Math.max(0, pIni)) : -1;
          if (pIni !== -1 && pFim !== -1) {
            idx = pIni;
            lenMatch = (pFim + ultimoTermo.length) - pIni;
          }
        }
      }
    }

    if (idx !== -1) {
      let textoAntes = textoCompleto.slice(0, idx);
      let textoDepois = textoCompleto.slice(idx + lenMatch);
      let subst = novoTexto;

      // Se estamos removendo uma citação ou frase, limpa espaços e vírgulas extras nas bordas
      if (opcoes.limparPontuacao && subst === '') {
        let startAdj = idx;
        let endAdj = idx + lenMatch;
        if (startAdj > 0 && textoCompleto[startAdj - 1] === ' ' && (endAdj >= textoCompleto.length || /[.,;:!?)]/.test(textoCompleto[endAdj]))) {
          startAdj -= 1;
        } else if (endAdj < textoCompleto.length && textoCompleto[endAdj] === ' ' && (startAdj === 0 || textoCompleto[startAdj - 1] === ' ')) {
          endAdj += 1;
        }
        idx = startAdj;
        lenMatch = endAdj - startAdj;
      }

      let pModificado = substituirSpanEmParagrafoXml(p.xml, idx, idx + lenMatch, subst);

      // Se limpou frase inteira ou deixou vírgula órfã antes de ponto, limpa pontuação residual
      if (opcoes.limparPontuacao && subst === '') {
        const { textoCompleto: posTexto } = analisarRunsParagrafo(pModificado);
        const limpo = limparPontuacaoResidual(posTexto);
        if (limpo !== posTexto && posTexto.trim().length > 0) {
          pModificado = substituirSpanEmParagrafoXml(pModificado, 0, posTexto.length, limpo);
        }
      }

      partes.push(documentXml.slice(cursor, p.inicio) + pModificado);
      cursor = p.fim;
      alteracoes++;

      if (!opcoes.todasOcorrencias) break;
    }
  }

  partes.push(documentXml.slice(cursor));
  return { xml: partes.join(''), alteracoes };
}

/**
 * Constroi um elemento <w:p> clonando formatação de um parágrafo modelo de Referências (ou básico)
 */
function criarParagrafoReferenciaXml(textoReferencia, xmlModelo = null) {
  const textoEscapado = escaparXml(textoReferencia.trim());
  if (xmlModelo) {
    // Preserva <w:pPr> do parágrafo modelo e o primeiro <w:rPr>
    const mPpr = /<w:pPr>[\s\S]*?<\/w:pPr>/.exec(xmlModelo);
    const pPr = mPpr ? mPpr[0] : '';
    const mRpr = /<w:rPr>[\s\S]*?<\/w:rPr>/.exec(xmlModelo);
    const rPr = mRpr ? mRpr[0] : '';
    return `<w:p>${pPr}<w:r>${rPr}<w:t xml:space="preserve">${textoEscapado}</w:t></w:r></w:p>`;
  }
  return `<w:p><w:r><w:t xml:space="preserve">${textoEscapado}</w:t></w:r></w:p>`;
}

/**
 * Extrai chave simples de ordenação alfabética (ex: "SANTOS, A." -> "santos a")
 */
function chaveOrdenacaoRef(texto = '') {
  return String(texto)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, ' ')
    .trim();
}

/**
 * Insere uma referência formatada na seção REFERÊNCIAS de word/document.xml em ordem alfabética.
 */
function inserirReferenciaEmDocumentXml(documentXml, referenciaTexto) {
  if (!referenciaTexto || !referenciaTexto.trim()) {
    throw new Error('Texto da referência não pode ser vazio.');
  }

  const paragrafos = extrairParagrafosXml(documentXml);
  let idxSecaoRef = -1;

  for (let i = 0; i < paragrafos.length; i++) {
    const { textoCompleto } = analisarRunsParagrafo(paragrafos[i].xml);
    const limpo = textoCompleto.trim().toUpperCase().replace(/[:.\d\s-]+$/g, '').replace(/^\d+[\s.)-]*/, '');
    if (/^REFER[ÊE]NCIAS(?:\s+BIBLIOGR[ÁA]FICAS)?$/.test(limpo)) {
      idxSecaoRef = i;
      break;
    }
  }

  // Coleta parágrafos existentes na seção de Referências
  const refsExistentes = [];
  if (idxSecaoRef !== -1) {
    for (let i = idxSecaoRef + 1; i < paragrafos.length; i++) {
      const { textoCompleto } = analisarRunsParagrafo(paragrafos[i].xml);
      const tTrim = textoCompleto.trim();
      if (/^(?:AP[ÊE]NDICE|ANEXO|GLOSS[ÁA]RIO)/i.test(tTrim)) break;
      if (tTrim.length > 15) {
        refsExistentes.push({ idx: i, p: paragrafos[i], texto: tTrim });
      }
    }
  }

  const novaChave = chaveOrdenacaoRef(referenciaTexto);

  // Evita duplicação exata se a referência já estiver lá
  const jaExiste = refsExistentes.some((re) => {
    const cExist = chaveOrdenacaoRef(re.texto);
    return cExist.slice(0, 45) === novaChave.slice(0, 45);
  });
  if (jaExiste) {
    return { xml: documentXml, inserida: false, motivo: 'Referência semelhante já presente na lista final.' };
  }

  const xmlModelo = refsExistentes.length > 0 ? refsExistentes[0].p.xml : null;
  const novoParagrafoXml = criarParagrafoReferenciaXml(referenciaTexto, xmlModelo);

  // Encontra posição alfabética correta
  let posInsercao = -1;
  if (refsExistentes.length > 0) {
    for (const re of refsExistentes) {
      if (chaveOrdenacaoRef(re.texto).localeCompare(novaChave, 'pt-BR') > 0) {
        posInsercao = re.p.inicio;
        break;
      }
    }
    if (posInsercao === -1) {
      // Insere logo após a última referência
      posInsercao = refsExistentes[refsExistentes.length - 1].p.fim;
    }
  } else if (idxSecaoRef !== -1) {
    // Se existe o título REFERÊNCIAS mas lista vazia, insere logo após o título
    posInsercao = paragrafos[idxSecaoRef].fim;
  } else {
    // Cria a seção REFERÊNCIAS antes do </w:body> (ou antes de <w:sectPr>)
    const matchSect = /<w:sectPr\b/.exec(documentXml);
    const matchBodyFim = /<\/w:body>/.exec(documentXml);
    posInsercao = matchSect ? matchSect.index : (matchBodyFim ? matchBodyFim.index : documentXml.length);
    const blocoTituloERef = `<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>REFERÊNCIAS</w:t></w:r></w:p>${novoParagrafoXml}`;
    return {
      xml: documentXml.slice(0, posInsercao) + blocoTituloERef + documentXml.slice(posInsercao),
      inserida: true,
    };
  }

  return {
    xml: documentXml.slice(0, posInsercao) + novoParagrafoXml + documentXml.slice(posInsercao),
    inserida: true,
  };
}

/**
 * Remove uma referência da seção REFERÊNCIAS de word/document.xml
 */
function removerReferenciaEmDocumentXml(documentXml, textoReferencia) {
  const paragrafos = extrairParagrafosXml(documentXml);
  const alvoNorm = chaveOrdenacaoRef(textoReferencia).slice(0, 50);
  if (!alvoNorm) return { xml: documentXml, removida: false };

  for (const p of paragrafos) {
    const { textoCompleto } = analisarRunsParagrafo(p.xml);
    const pNorm = chaveOrdenacaoRef(textoCompleto);
    if (pNorm.includes(alvoNorm) || (textoReferencia.length > 20 && textoCompleto.includes(textoReferencia.slice(0, 40)))) {
      return {
        xml: documentXml.slice(0, p.inicio) + documentXml.slice(p.fim),
        removida: true,
      };
    }
  }
  return { xml: documentXml, removida: false };
}

/**
 * Executa uma operação cirúrgica completa no arquivo .docx e salva no disco
 * (com proteção contra arquivo aberto/bloqueado no Word e backup automático .bak).
 */
async function executarCirurgiaDocx(caminhoDocx, operacao) {
  if (!caminhoDocx || !fs.existsSync(caminhoDocx)) {
    throw new Error('Arquivo .docx original não localizado no disco.');
  }

  const bufferEntrada = await fs.promises.readFile(caminhoDocx);
  const zip = await JSZip.loadAsync(bufferEntrada);
  const docFile = zip.file('word/document.xml');
  if (!docFile) throw new Error('Estrutura word/document.xml inválida no .docx.');

  let docXml = await docFile.async('string');
  let alteracoes = 0;

  if (operacao.tipo === 'substituir_trecho' || operacao.tipo === 'remover_citacao' || operacao.tipo === 'excluir_trecho') {
    const res = aplicarSubstituicaoEmDocumentXml(
      docXml,
      operacao.textoAlvo,
      operacao.novoTexto ?? '',
      {
        todasOcorrencias: !!operacao.todasOcorrencias,
        limparPontuacao: operacao.tipo === 'remover_citacao' || operacao.tipo === 'excluir_trecho',
      }
    );
    docXml = res.xml;
    alteracoes = res.alteracoes;
  } else if (operacao.tipo === 'inserir_referencia') {
    // Opcionalmente também corrige a chamada no texto antes se especificado
    if (operacao.substituirChamadaDe && operacao.substituirChamadaPara) {
      const resCham = aplicarSubstituicaoEmDocumentXml(
        docXml,
        operacao.substituirChamadaDe,
        operacao.substituirChamadaPara,
        { todasOcorrencias: true }
      );
      docXml = resCham.xml;
      alteracoes += resCham.alteracoes;
    }
    const resRef = inserirReferenciaEmDocumentXml(docXml, operacao.referenciaTexto);
    docXml = resRef.xml;
    if (resRef.inserida) alteracoes++;
  } else if (operacao.tipo === 'remover_referencia') {
    const resRem = removerReferenciaEmDocumentXml(docXml, operacao.textoAlvo);
    docXml = resRem.xml;
    if (resRem.removida) alteracoes++;
  }

  if (alteracoes === 0) {
    return {
      ok: false,
      alteracoes: 0,
      caminhoSalvo: caminhoDocx,
      mensagem: 'O trecho exato não foi localizado na estrutura XML do .docx (pode haver alterações prévias no arquivo).',
    };
  }

  zip.file('word/document.xml', docXml);
  const novoBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });

  // Tenta salvar uma cópia de segurança única antes de gravar no arquivo
  const dir = path.dirname(caminhoDocx);
  const base = path.basename(caminhoDocx, '.docx');
  const caminhoBackup = path.join(dir, `${base}.backup_pre_auditoria.docx`);
  if (!fs.existsSync(caminhoBackup)) {
    try {
      await copiarArquivoAtomico(caminhoDocx, caminhoBackup);
    } catch { /* ignora erro de backup se permissão falhar */ }
  }

  let caminhoSalvo = caminhoDocx;
  let salvoEmCopia = false;
  try {
    await escreverArquivoAtomico(caminhoDocx, novoBuffer, 'utf8', 2);
  } catch (err) {
    // EBUSY / EPERM se o documento estiver aberto no Microsoft Word
    if (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES') {
      caminhoSalvo = path.join(dir, `${base}_revisado.docx`);
      await escreverArquivoAtomico(caminhoSalvo, novoBuffer, 'utf8', 3);
      salvoEmCopia = true;
    } else {
      throw err;
    }
  }

  return {
    ok: true,
    alteracoes,
    caminhoSalvo,
    salvoEmCopia,
    mensagem: salvoEmCopia
      ? `O arquivo original está aberto no Microsoft Word! As correções foram salvas com segurança em: ${path.basename(caminhoSalvo)}`
      : `Alteração aplicada e salva diretamente no arquivo Word (${path.basename(caminhoSalvo)})!`,
  };
}

/**
 * Motor unificado de anotação de comentários OpenXML em .docx (independe do Word estar aberto).
 * Garante backup prévio e cópia segura se o arquivo estiver bloqueado pelo Word (EBUSY/EPERM).
 */
async function injetarComentariosCirurgicosDocx(caminhoDocx, caminhoSaida, inconformidades = []) {
  if (!caminhoDocx || !fs.existsSync(caminhoDocx)) {
    throw new Error('Arquivo .docx original não localizado no disco.');
  }
  const dir = path.dirname(caminhoDocx);
  const base = path.basename(caminhoDocx, '.docx');
  const caminhoBackup = path.join(dir, `${base}.backup_pre_auditoria.docx`);
  if (!fs.existsSync(caminhoBackup)) {
    try {
      await fs.promises.copyFile(caminhoDocx, caminhoBackup);
    } catch {}
  }
  try {
    return await injetarComentariosNoDocx(caminhoDocx, caminhoSaida, inconformidades);
  } catch (err) {
    if (err && ['EBUSY', 'EPERM', 'EACCES'].includes(err.code)) {
      const copiaFallback = path.join(path.dirname(caminhoSaida), `${path.basename(caminhoSaida, '.docx')}_copia.docx`);
      return await injetarComentariosNoDocx(caminhoDocx, copiaFallback, inconformidades);
    }
    throw err;
  }
}

module.exports = {
  extrairParagrafosXml,
  analisarRunsParagrafo,
  aplicarSubstituicaoEmDocumentXml,
  inserirReferenciaEmDocumentXml,
  removerReferenciaEmDocumentXml,
  limparPontuacaoResidual,
  executarCirurgiaDocx,
  injetarComentariosCirurgicosDocx,
};
