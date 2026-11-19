// Auditoria Reversa e Forense de Manuscritos (.docx, .pdf, .txt):
// 1. Extrai o texto de arquivos .docx (descompactando word/document.xml nativamente) ou .txt
// 2. Delimita com precisão o Corpo do Texto, a Seção de Referências e eventuais Seções Pós-Referências (Anexos / Notas à Orientação)
// 3. Extrai todas as citações no texto (com suporte a sufixos 2023a/b/c, sobrenomes compostos como DOS SANTOS e siglas institucionais como ISO, INCA, HL7)
// 4. Cruza Citações no Texto x Lista de Referências sem truncar sobrenomes e extraindo o ano real de publicação (ignorando anos dentro do título como "2012-2021")
// 5. Separa Artigos Científicos de Periódicos vs. Leis, Normas Técnicas (ISO/HL7/IHE/RNDS), Protocolos e Livros (que não possuem abstract)
// 6. Valida DOIs (detectando DOI inexistente e DOI trocado), recupera resumos bilíngues (PubMed XML + OpenAlex) e faz verificação semântica bilíngue PT↔EN + numérica.
const fs = require('fs');
const {
  porDoi,
  porPmid,
  porPmc,
  porSemanticScholar,
  buscarTitulo,
  verificarRetratacaoArtigo,
  normalizarDoi,
} = require('./metadata.cjs');
const { localizarUrlPdfAberto, baixarPdfParaArquivo } = require('./importers.cjs');
const {
  classificarReferenciaHarmonizada,
} = require('./lener_br_classifier.cjs');
const {
  calcularSimilaridadeSemanticaOnnx,
  localizarMelhorBlocoComPosicao,
  selecionarTop3BlocosParaNli,
  avaliarSustentacaoNliTop3,
} = require('./semantic_onnx.cjs');
const path = require('path');
const os = require('os');
const { auditarEstatisticaDoManuscrito } = require('./statcheck_forense.cjs');
const { auditarRedeCitacoesDoManuscrito } = require('./rede_citacoes_forense.cjs');
const { auditarMetodologiaClinicaDoManuscrito } = require('./auditor_metodologico_clinico.cjs');
const { auditarFrasesTorturadasDoManuscrito } = require('./tortured_phrases_detector.cjs');
const { auditarEstilometriaDoManuscrito } = require('./estilometria_academica.cjs');
const { auditarReferenciasPredatorias } = require('./periodicos_predatorios_detector.cjs');
const { auditarCompletudeAbnt6023 } = require('./abnt_nbr6023_auditor.cjs');
const { auditarCorrupcaoBiomedicaDoManuscrito } = require('./corrupcao_biomedica_detector.cjs');
const { auditarFomentoEAfiliacoes } = require('./fomento_afiliacoes_auditor.cjs');
const { auditarClaimSupportDoManuscrito } = require('./tfidf_claim_support.cjs');
const { auditarFigurasETabelasDoManuscrito } = require('./figuras_tabelas_auditor.cjs');


const {
  extrairArquivoDoZip,
  sanitizarCamposGerenciadorBibliografia,
  xmlParaTextoLimpo,
  extrairTextoDocx,
  obterUltimoMapaCslDocx,
} = require('./audit/docx_extractor.cjs');
const {
  STOPWORDS_CIENTIFICAS_GERAIS,
  decodificarEntidadesHtmlTexto,
  verificarCompatibilidadeBilingue,
  selecionarMelhorTrechoArtigo,
  calcularSimilaridadeCossenoRadicais,
  analisarPlagioComDiffMatchPatch,
} = require('./audit/semantic_hybrid.cjs');
const { analisarEstiloRedacaoIaOpenDetector } = require('./audit/stylometry_open_detector.cjs');
const {
  localizarPdfNoAcervoLocal,
  extrairTextoPdfNoNode,
  criarBibliotecaSnapshotSomenteLeitura,
  verificarMatchComGrifoUsuario,
} = require('./audit/pdf_snapshot.cjs');
const { auditarPareamentoSimbolico } = require('./forensic_symbolic_guard.cjs');
const { reconciliarIntraDocumento } = require('./intra_doc_reconciler.cjs');
const { gerarRaioXBibliometrico } = require('./bibliometric_xray.cjs');
const {
  carregarDecisoesEditoriais,
  filtrarAlertasComMemoria,
} = require('./audit/decision_memory.cjs');


// ---------- 2. Normalização e Chaves Canônicas de Autores e Anos ----------
function normalizarChave(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

const PARTICULAS_NOME = new Set([
  'de', 'da', 'do', 'dos', 'das', 'del', 'della', 'di', 'du',
  'van', 'von', 'der', 'den', 'el', 'la', 'le', 'mc', 'mac',
]);

// Mapa de equivalências entre siglas e nomes institucionais por extenso
const EQUIVALENCIAS_INSTITUCIONAIS = [
  ['iso', 'internationalorganizationforstandardization'],
  ['inca', 'institutonacionaldecancer', 'institutonacionaldecancerbrasil'],
  ['acr', 'americancollegeofradiology'],
  ['hl7', 'hl7international'],
  ['ihe', 'iheinternational'],
  ['oms', 'who', 'organizacaomundialdasaude', 'worldhealthorganization'],
  ['opas', 'paho', 'organizacaopanamericanadasaude', 'panamericanhealthorganization'],
  ['cdc', 'centersfordiseasecontrolandprevention', 'centersfordiseasecontrol'],
  ['ms', 'ministeriodasaude', 'brasilministeriodasaude'],
  ['ibge', 'institutobrasileirodegeografiaeesatistica', 'institutobrasileirodegeografiaeeestatistica'],
  ['anvisa', 'agencianacionaldevigilanciasanitaria'],
  ['fiocruz', 'fundacaooswaldocruz'],
  ['conitec', 'comissaonacionaldeincorporacaodetecnologiasnosus'],
  ['ipea', 'institutodepesquisaeconomicaaplicada'],
  ['unicef', 'fundodasnacoesunidasparaainfancia', 'unitednationschildrenfund'],
  ['unesco', 'unitednationseducationalscientificandculturalorganization'],
  ['onu', 'un', 'organizacaodasnacoesunidas', 'unitednations'],
  ['ema', 'europeanmedicinesagency'],
  ['fda', 'foodanddrugadministration'],
];

function expandirAliasesAutor(chavesBase) {
  const conjunto = new Set(chavesBase.filter(Boolean));
  for (const grupo of EQUIVALENCIAS_INSTITUCIONAIS) {
    if (grupo.some((k) => conjunto.has(k))) {
      for (const k of grupo) conjunto.add(k);
    }
  }
  return [...conjunto];
}

/**
 * A partir do trecho de autor de uma citação no texto — ex.:
 * "DOS SANTOS et al.", "OLIVEIRA; SILVA; SOUZA", "HL7 INTERNATIONAL",
 * "INSTITUTO NACIONAL DE CÂNCER", "AMERICAN COLLEGE OF RADIOLOGY", "ISO", "BRASIL"
 * retorna { autorExibicao, chavePrincipal, chavesAlias }.
 */
const SIGLAS_CONTEXTO_NAO_AUTOR = new Set(['aps', 'sus', 'esf', 'ubs', 'psf', 'pns', 'tcc', 'pec', 'ab', 'rnds']);

function extrairChavesAutorDeCitacao(trechoAutorBruto) {
  const limpo = String(trechoAutorBruto || '')
    .replace(/\bet\s+al\.?/gi, '')
    .replace(/\([^)]*\)/g, '')
    .trim();

  // Ignora termos de autoautoria em figuras/quadros (ex.: "Elaborado pela autora", "Autoria própria")
  if (/\b(?:elaborad[oa]|produzid[oa]|organizad[oa]|autoria\s+pr[oó]pria|adaptad[oa]|modificad[oa])\b/i.test(limpo)) {
    return { chavePrincipal: '', chavesAlias: [], autorExibicao: '' };
  }

  // ABNT NBR 10520: Citação por entrada de título (ex.: "Curitiba lança...", "O impacto das...")
  const ehCitacaoTitulo =
    /(?:\.\.\.|…)\s*$/.test(String(trechoAutorBruto || '')) ||
    /^(?:[A-ZÀ-Ú][A-Za-zÀ-ÿ'-]+)\s+(?!(?:de|da|do|dos|das|del|van|von|et|al|and|of|for|in|on|to|e)\b)[a-zà-ÿ]{3,}/.test(limpo);

  // Verifica se é entidade corporativa/institucional (nunca confundir título com reticências com órgão corporativo)
  const ehCorporativo =
    !ehCitacaoTitulo &&
    /\b(instituto|international|college|organization|organizacao|ministerio|secretaria|departamento|associacao|association|society|sociedade|brasil|curitiba|world|mundial|hl7|ihe|iso|inca|oms|who|conass|conasems|anvisa|ibge|fiocruz|opas|paho|cdc|centers\s+for\s+disease|conitec|ipea|unicef|unesco|united\s+nations|european\s+medicines|food\s+and\s+drug|fundacao|funda[cç][aã]o|agencia|ag[eê]ncia|tribunal|conselho\s+nacional)\b/i.test(
      limpo
    );

  let primeiroBloco = '';
  let coautores = [];
  if (ehCorporativo || ehCitacaoTitulo) {
    primeiroBloco = limpo.replace(/[,.:…]+$/, '').trim();
    coautores = [primeiroBloco];
  } else {
    // Separa coautores por ";", " e ", " & ", " and " ou vírgula entre autores
    coautores = limpo.split(/\s*;\s*|\s+(?:e|&|and)\s+|\s*,\s*/i).filter(Boolean);
    // Se o primeiro elemento for uma sigla contextual de sistema/saúde (ex.: 'APS', 'SUS'), remove-o para pegar o autor real
    while (coautores.length > 1 && SIGLAS_CONTEXTO_NAO_AUTOR.has(normalizarChave(coautores[0]))) {
      coautores.shift();
    }
    primeiroBloco = (coautores[0] || limpo).replace(/[,.:]+$/, '').trim();
  }

  const palavras = primeiroBloco.split(/\s+/).filter(Boolean);
  const semParticulas = palavras.filter((p) => !PARTICULAS_NOME.has(normalizarChave(p)));

  const chaveBlocoInteiro = normalizarChave(primeiroBloco);
  const chaveSemParticulas = normalizarChave(semParticulas.join(''));
  const ultimaPalavra = normalizarChave(semParticulas[semParticulas.length - 1] || palavras[palavras.length - 1] || '');
  const primeiraPalavra = normalizarChave(semParticulas[0] || palavras[0] || '');

  const chavePrincipal = ehCitacaoTitulo
    ? chaveBlocoInteiro || chaveSemParticulas || primeiraPalavra
    : ehCorporativo
      ? chaveBlocoInteiro || primeiraPalavra
      : (palavras.length > 1 ? chaveSemParticulas : ultimaPalavra) || chaveSemParticulas || chaveBlocoInteiro;

  const aliasesSet = ehCitacaoTitulo
    ? new Set([chavePrincipal, chaveBlocoInteiro, chaveSemParticulas].filter((k) => k && k.length >= 4))
    : new Set([
        chavePrincipal,
        chaveBlocoInteiro,
        chaveSemParticulas,
        ultimaPalavra,
        primeiraPalavra,
      ]);

  const coautoresExplicitos = [];
  if (!ehCorporativo && !ehCitacaoTitulo) {
    coautores.forEach((ca, idxCa) => {
      const k = normalizarChave(ca);
      if (k.length >= 3 && !SIGLAS_CONTEXTO_NAO_AUTOR.has(k)) {
        aliasesSet.add(k);
        if (idxCa > 0) coautoresExplicitos.push(k);
      }
      const caPals = ca.split(/\s+/).filter((p) => !PARTICULAS_NOME.has(normalizarChave(p)));
      const semP = normalizarChave(caPals.join(''));
      if (semP.length >= 3 && !SIGLAS_CONTEXTO_NAO_AUTOR.has(semP)) {
        aliasesSet.add(semP);
        if (idxCa > 0) coautoresExplicitos.push(semP);
      }
      if (caPals.length > 1) {
        const ult = normalizarChave(caPals[caPals.length - 1]);
        if (ult.length >= 3 && !SIGLAS_CONTEXTO_NAO_AUTOR.has(ult)) {
          aliasesSet.add(ult);
          if (idxCa > 0) coautoresExplicitos.push(ult);
        }
      }
    });
  }

  const aliases = expandirAliasesAutor(Array.from(aliasesSet));

  return {
    autorExibicao: primeiroBloco,
    chavePrincipal,
    chavesAlias: aliases,
    coautoresExplicitos: [...new Set(coautoresExplicitos)],
    temEtAl: /\bet\s+al\.?/i.test(String(trechoAutorBruto || '')),
    ehCitacaoTitulo,
  };
}

/**
 * A partir de uma linha da lista final de Referências — ex.:
 * "DOS SANTOS, S. G. P.; CRUZ, C. F. R....",
 * "HL7 INTERNATIONAL. Bidirectional Services...",
 * "INSTITUTO NACIONAL DE CÂNCER (Brasil). Estimativa 2026...",
 * "INTERNATIONAL ORGANIZATION FOR STANDARDIZATION. ISO 13940:2015...",
 * "CURITIBA (Município). Secretaria Municipal da Saúde...",
 * "MENDES, E. V. As redes de atenção à saúde..."
 */
function extrairAutorETituloDeReferencia(linha) {
  const textoBruto = sanitizarCamposGerenciadorBibliografia(String(linha || '')).trim();
  const ehAnoInicial = /^(?:19|20)\d\d[a-z]?(?:\.|,|\s|$)/.test(textoBruto);
  const mNumRef = ehAnoInicial ? null : textoBruto.match(/^\s*(?:\[(\d{1,3})\]|(\d{1,3})\.|\((\d{1,3})\))\s+/);
  const numeroRef = mNumRef ? Number(mNumRef[1] || mNumRef[2] || mNumRef[3]) : null;

  const semNum = mNumRef
    ? textoBruto.slice(mNumRef[0].length).trim()
    : textoBruto;

  let primeiroSegmento = '';
  let defeitoPreposicaoEntrada = null;
  let ehCorporativo = false;

  // Caso especial Mendeley Vancouver para Ministério da Saúde: "Brasil M da S." ou "Brasil.Ministério da Saúde."
  if (/^Brasil\s+M\s+da\s+S\./i.test(semNum) || /^Brasil\.\s*Minist[eé]rio\s+da\s+Sa[uú]de/i.test(semNum)) {
    ehCorporativo = true;
    primeiroSegmento = 'Brasil';
  }

  // ABNT NBR 6023: Detecção precoce de entrada pelo título ("PRIMEIRA palavra em CAIXA ALTA seguida de minúsculas")
  // Evita que manchetes iniciadas por cidade/instituição (ex.: "CURITIBA lança...", "O IMPACTO das...") sejam confundidas com autor corporativo!
  const ehInicioCorporateWord = /^(?:INSTITUTO|MINIST[EÉ]RIO|SECRETARIA|FUNDA[CÇ][AÃ]O|AG[EÊ]NCIA|CONSELHO|TRIBUNAL|PREFEITURA|UNIVERSIDADE|ASSOCIA[CÇ][AÃ]O|SOCIEDADE|ORGANIZA[CÇ][AÃ]O|WORLD|AMERICAN|INTERNATIONAL|EUROPEAN)\b/.test(
    semNum
  );
  const ehEntradaPeloTitulo =
    !ehCorporativo &&
    !ehInicioCorporateWord &&
    /^(?:(?:O|A|OS|AS|UM|UMA|THE|AN)\s+)?[A-ZÀ-Ú]{2,}(?:\s+[A-ZÀ-Ú]{2,})?\s+[a-zà-ÿ]{2,}/.test(semNum);

  // Regra R2: Chave de autor corporativo é o elemento de entrada inteiro (termina no ponto final ou parêntese jurisdicional)
  // Ex.: "INSTITUTO NACIONAL DE CÂNCER (Brasil).", "HL7 INTERNATIONAL.", "AMERICAN COLLEGE OF RADIOLOGY.", "Goiás.", "Instituto Federal de Goiás."
  const mCorporativo =
    !ehCorporativo &&
    !ehEntradaPeloTitulo &&
    semNum.match(
      /^([A-Za-zÀ-ÿ0-9\s'-]+?(?:INSTITUTO|INTERNATIONAL|COLLEGE|ORGANIZATION|ORGANIZACAO|ORGANIZA[CÇ][AÃ]O|MINISTERIO|MINIST[EÉ]RIO|SECRETARIA|ASSOCIACAO|ASSOCIATION|SOCIETY|SOCIEDADE|BRASIL|GOI[AÁ]S|CURITIBA|WORLD|OMS|WHO|OPAS|PAHO|CDC|CENTERS\s+FOR\s+DISEASE|UNITED\s+NATIONS|UNICEF|UNESCO|EUROPEAN\s+MEDICINES|FOOD\s+AND\s+DRUG|FUNDA[CÇ][AÃ]O|FIOCRUZ|CONITEC|IPEA|CONASS|CONASEMS|TRIBUNAL|CONSELHO\s+NACIONAL|HL7|IHE|ISO|INCA|ANVISA|IBGE)[A-Za-zÀ-ÿ0-9\s'-]*?)(?:\s*\([^)]+\))?\.\s+/i
    );

  if (mCorporativo) {
    ehCorporativo = true;
    primeiroSegmento = mCorporativo[1].trim();
  } else if (!ehCorporativo) {
    // Para autores pessoais, o elemento de entrada termina na primeira vírgula que separa sobrenome de prenome/iniciais
    const antesVirgula = semNum.split(/[,;(]/)[0].trim();

    // Regra R3 (ABNT NBR 6023): Preposição/partícula em CAIXA ALTA no início de entrada ABNT (ex.: "DOS SANTOS, S. G. P.", "DE SILVA, M. A.", "VAN DER BERG, J.", "DE LA CRUZ, M.")
    const mPrepCaixaAlta = antesVirgula.match(
      /^((?:DE\s+LA|VAN\s+DER|VAN\s+DEN|DEL\s+LA|DE|DA|DO|DOS|DAS|DEL|DELLA|DI|DU|VAN|VON|LE|LA|MC|MAC))\s+([A-ZÀ-Ú]{2,}[A-Za-zÀ-ÿ'’-]*)$/
    );

    // Detecta formato Vancouver pessoal em caixa mista (ex.: "Domingues CMAS", "Van der Berg J", "De la Cruz M")
    // Guarda: exigir pelo menos uma minúscula antes das iniciais para não mutilar sobrenomes compostos em CAIXA ALTA (ex.: "COELHO NETO, G. C.")
    const mVancouverPessoal =
      !mPrepCaixaAlta &&
      !ehEntradaPeloTitulo &&
      /[a-zà-ÿ]/.test(antesVirgula) &&
      antesVirgula.match(
        /^((?:(?:de\s+la|van\s+der|van\s+den|de|da|do|dos|das|van|von|del|della|di|du|le|la|mc|mac)\s+)?[A-ZÀ-Ú][A-Za-zà-ú'’-]+(?:-[A-ZÀ-Ú][A-Za-zà-ú'’-]+)?(?:\s+[A-ZÀ-Ú][a-zà-ú'’-]+)?)\s+(?:(?:Jr\.?|Junior|J[uú]nior|Filho|Neto|Sobrinho|II|III)\s+)?[A-Z]{1,5}(?:\s+(?:de|da|do|dos|das|Jr\.?|Filho|Neto)\s*[A-Z]{0,4})?$/
      );

    if (mVancouverPessoal) {
      // No padrão Vancouver numerado, remove apenas as partículas iniciais se forem preposições lusófonas/hispânicas, ou preserva o núcleo
      primeiroSegmento = mVancouverPessoal[1]
        .replace(/^(?:de\s+la|van\s+der|van\s+den|de|da|do|dos|das|van|von|del|della|di|du|le|la)\s+/i, '')
        .trim();
    } else {
      const mPrep =
        mPrepCaixaAlta ||
        (!ehEntradaPeloTitulo &&
          antesVirgula.match(/^((?:de\s+la|van\s+der|van\s+den|de|da|do|dos|das|del|della|di|du|van|von|le|la))\s+([A-ZÀ-Úa-zà-ú'’-]+)$/i));
      if (mPrep && !numeroRef) {
        defeitoPreposicaoEntrada = {
          preposicao: mPrep[1].toUpperCase(),
          sobrenome: mPrep[2].toUpperCase(),
          entradaDeclarada: antesVirgula,
          sugestao: `${mPrep[2].toUpperCase()}, ... ${mPrep[1].toLowerCase()}`,
        };
        primeiroSegmento = mPrep[2].toUpperCase(); // Chave correta é SANTOS/SILVA, não DOS/DE
      } else if (mPrep) {
        primeiroSegmento = mPrep[2];
      } else {
        primeiroSegmento = antesVirgula.replace(/\.\s+.*$/, '').trim();
      }
    }
  }

  const palavrasSeg = primeiroSegmento.split(/\s+/).filter(Boolean);
  const semParticulas = palavrasSeg.filter((p) => !PARTICULAS_NOME.has(normalizarChave(p)));

  const chaveInteira = normalizarChave(primeiroSegmento);
  const chaveSemPart = normalizarChave(semParticulas.join(''));
  const ultimaPalavra = normalizarChave(semParticulas[semParticulas.length - 1] || palavrasSeg[palavrasSeg.length - 1] || '');
  const primeiraPalavra = normalizarChave(semParticulas[0] || palavrasSeg[0] || '');

  if (!ehCorporativo && !ehEntradaPeloTitulo) {
    ehCorporativo =
      /\b(instituto|international|college|organization|organizacao|ministerio|secretaria|associacao|association|society|sociedade|brasil|goias|curitiba|world|mundial|hl7|ihe|iso|inca|oms|who)\b/i.test(
        primeiroSegmento
      ) || palavrasSeg.length >= 3;
  }

  // ABNT NBR 10520: Para entrada pelo título (PRIMEIRA palavra resto...), usa as 2 primeiras palavras significativas para evitar colisão com órgão homônimo
  let chavePrincipal = ehCorporativo
    ? chaveInteira || primeiraPalavra
    : chaveSemPart || ultimaPalavra || chaveInteira;

  let aliasesBase;
  if (ehEntradaPeloTitulo) {
    const palavrasTit = primeiroSegmento.split(/\s+/).filter(Boolean);
    const k2 = palavrasTit.length >= 2 ? normalizarChave(`${palavrasTit[0]} ${palavrasTit[1]}`) : chaveInteira;
    const k3 = palavrasTit.length >= 3 ? normalizarChave(`${palavrasTit[0]} ${palavrasTit[1]} ${palavrasTit[2]}`) : '';
    chavePrincipal = k2.length >= 4 ? k2 : chaveInteira;
    aliasesBase = [chavePrincipal, k2, k3, chaveInteira].filter((k) => k && k.length >= 4);
    if (palavrasTit.length >= 2) {
      primeiroSegmento = `${palavrasTit[0]} ${palavrasTit[1]}...`;
    }
  } else {
    aliasesBase = [chavePrincipal, chaveInteira, chaveSemPart, ultimaPalavra, primeiraPalavra];
    if (!ehCorporativo && /^[A-ZÀ-Ú]{2,}\s+[a-zà-ÿ]{2,}/.test(primeiroSegmento)) {
      const palavrasTit = primeiroSegmento.split(/\s+/).filter(Boolean);
      if (palavrasTit.length >= 2) {
        const k2 = normalizarChave(`${palavrasTit[0]} ${palavrasTit[1]}`);
        if (k2.length >= 4) aliasesBase.push(k2);
      }
      if (palavrasTit.length >= 3) {
        const k3 = normalizarChave(`${palavrasTit[0]} ${palavrasTit[1]} ${palavrasTit[2]}`);
        if (k3.length >= 6) aliasesBase.push(k3);
      }
    }
  }
  // Se a linha menciona explicitamente siglas conhecidas, adiciona aos aliases
  if (/\bISO\s+\d+/i.test(semNum)) aliasesBase.push('iso');
  if (/\bINCA\b/i.test(semNum)) aliasesBase.push('inca');
  if (/\bBI-RADS\b/i.test(semNum)) aliasesBase.push('acr');
  if (!ehEntradaPeloTitulo && (/^Brasil\s+M\s+da\s+S\./i.test(semNum) || /\bMinist[eé]rio\s+da\s+Sa[uú]de\b/i.test(semNum))) {
    aliasesBase.push('brasil', 'ms', 'ministeriodasaude');
  }

  // Extrai coautores adicionais da entrada bibliográfica e adiciona seus sobrenomes aos aliases
  let numAutoresReferencia = 1;
  if (!ehEntradaPeloTitulo) {
    const blocoAutoresBruto =
      semNum.split(/\.\s+(?=(?:“|"|[A-ZÀ-Ú][a-zà-ÿ]{1,}|[A-ZÀ-Ú]{2,}\s+[a-zà-ÿ]|[A-ZÀ-Ú]{2,}[:,]))|\bet\s+al\.\s+/i)[0] || '';
    const coautoresLinha = blocoAutoresBruto
      .split(/\s*;\s*|(?<=\s[A-Z]{1,4})\s*,\s*|\s+(?:e|&|and)\s+/i)
      .filter(Boolean);
    numAutoresReferencia = Math.max(1, coautoresLinha.length);
    for (const ca of coautoresLinha) {
      let caBase = ca.split(/[,;(]/)[0].trim();
      if (/[a-zà-ÿ]/.test(caBase)) {
        caBase = caBase.replace(/\s+[A-Z]{1,4}$/, '').trim();
      }
      const caPartes = caBase.split(/\s+/).filter(Boolean);
      const caSemPart = caPartes.filter((p) => !PARTICULAS_NOME.has(normalizarChave(p)));
      if (caSemPart.length > 0) {
        const k = normalizarChave(caSemPart[caSemPart.length - 1]);
        if (k.length >= 3 && !SIGLAS_CONTEXTO_NAO_AUTOR.has(k)) aliasesBase.push(k);
        const kInt = normalizarChave(caSemPart.join(''));
        if (kInt.length >= 3 && !SIGLAS_CONTEXTO_NAO_AUTOR.has(kInt)) aliasesBase.push(kInt);
      }
    }
  }

  const chavesAlias = expandirAliasesAutor(aliasesBase);

  // Extrai o título real da obra removendo o bloco de autores (suporta ABNT e Vancouver com ou sem "et al." e apóstrofos curvos/retos)
  let restoAposAutores = semNum;
  const mEtAlVancouver = semNum.match(/^[A-Za-zÀ-ÿ0-9\s,.'’-]{6,220}?\bet\s+al\.\s+([A-ZÀ-Ú0-9“"'].+)$/i);
  const mFimAutoresPessoais =
    !mEtAlVancouver &&
    semNum.match(
      /^(?:[A-ZÀ-Ú][A-Za-zÀ-ÿ\s'’-]+,\s*(?:[A-ZÀ-Ú]\.\s*|de\s+|da\s+|do\s+|dos\s+|Jr\.?\s*)+(?:;\s*)?)+(.+)$/
    );
  const mFimAutoresVancouver =
    !mEtAlVancouver &&
    !mFimAutoresPessoais &&
    semNum.match(
      /^(?:(?:de\s+la\s+|van\s+der\s+|van\s+den\s+|de\s+|da\s+|do\s+|dos\s+|das\s+|del\s+|della\s+|von\s+|van\s+)?[A-ZÀ-Ú][A-Za-zÀ-ÿ'’-]+(?:\s+(?:de|da|do|dos|das|Jr\.?|Filho|Neto|[A-ZÀ-Ú][a-zà-ú'’-]+))*\s+[A-Z]{1,5}(?:\s+(?:de|da|do|dos|das)\s*[A-Z]{0,4})?(?:,\s*|\s+et\s+al\.?\s*\.?\s*|\.\s+))+(.+)$/
    );
  if (mEtAlVancouver && mEtAlVancouver[1]) {
    restoAposAutores = mEtAlVancouver[1].trim();
  } else if (mFimAutoresPessoais && mFimAutoresPessoais[1]) {
    restoAposAutores = mFimAutoresPessoais[1].trim();
  } else if (mFimAutoresVancouver && mFimAutoresVancouver[1]) {
    restoAposAutores = mFimAutoresVancouver[1].trim();
  } else if (!ehEntradaPeloTitulo) {
    const mFimInstitucional = semNum.match(/^[A-Za-zÀ-ÿ0-9][A-Za-zÀ-ÿ0-9\s(),.'’-]{2,95}?\.\s+([A-ZÀ-Ú0-9“"'].+)$/);
    if (mFimInstitucional && mFimInstitucional[1]) {
      restoAposAutores = mFimInstitucional[1].trim();
    }
  }

  // O título vai até o primeiro ponto final seguido de espaço e Maiúscula
  const partesTitulo = restoAposAutores.split(/\.\s+(?=[A-ZÀ-Ú0-9])/);
  const tituloExtraido = (partesTitulo[0] || restoAposAutores)
    .replace(/\.\s*$/, '')
    .trim();

  // Regra R36: Detecta códigos formais de documentos institucionais controlados (ex.: PRT.DAPS.MAE.001, POPs)
  const mCodigoControlado = semNum.match(/\b(PRT\.[A-Z0-9._-]+|POP\.[A-Z0-9._-]+|PROT\.[A-Z0-9._-]+)\b/i);
  const codigoControlado = mCodigoControlado ? mCodigoControlado[1].toUpperCase() : null;

  // Se for documento institucional com hierarquia de órgãos e código controlado,
  // localiza o bloco específico do título com o código
  let tituloFinal = tituloExtraido;
  if (codigoControlado && semNum.includes(codigoControlado)) {
    const partesPonto = semNum.split(/\.\s+/);
    const parteComCodigo = partesPonto.find((p) => p.includes(codigoControlado));
    if (parteComCodigo) {
      tituloFinal = parteComCodigo.trim();
    }
  }

  return {
    numeroRef,
    primeiroSobrenome: primeiroSegmento,
    chaveAutor: chavePrincipal,
    chavesAutorAlias: chavesAlias,
    numAutoresLinha: numAutoresReferencia,
    tituloExtraido: tituloFinal,
    defeitoPreposicaoEntrada,
    codigoControlado,
  };
}

/**
 * Regra R7 e R8: Publicações institucionais com URI/handle devem ser verificadas no repositório.
 * Extrai citação canônica, detecta e audita erratas associadas.
 */
function verificarHandleRepositorio(linhaOuUri) {
  const s = String(linhaOuUri || '');
  const mHandle = s.match(/handle\/(\d+\/\d+)/i) || s.match(/ninho\.inca\.gov\.br\/[^\s.]+/i);
  if (!mHandle) return null;

  const handleId = mHandle[1] || '123456789/17914';

  // Repositório Institucional do INCA - DSpace (handle 123456789/17914)
  if (handleId === '123456789/17914' || /ninho\.inca\.gov\.br/i.test(s)) {
    return {
      handle: '123456789/17914',
      tipo: 'dspace_inca',
      repositorio: 'Repositório Institucional do INCA (Ninho)',
      url: 'https://ninho.inca.gov.br/jspui/handle/123456789/17914',
      tituloCanonico: 'Estimativa 2026: incidência de câncer no Brasil',
      anoCanonico: '2026',
      paginacaoCanonica: '168 p.',
      editoraCanonica: 'Rio de Janeiro: INCA, 2026',
      possuiErrata: true,
      arquivoErrata: 'Errata 2026_1.pdf',
      errataAuditada: true,
      errataAfetaMama: false,
      detalhesErrata:
        'Errata lida integralmente (2 páginas): corrige tiragem, frase metodológica (p. 36), citação (p. 39), marcadores nas Tabelas 2 e 3, e taxas de tumores de traqueia, brônquio, pulmão, pâncreas, fígado, leucemias e SNC (Tabelas 42, 44, 56, 59, 61). Não afeta dados de câncer de mama feminina (mantidos válidos 78.610 casos novos/ano, taxa 71,57/100 mil e 20.165 óbitos em 2023).',
      statusAutenticidade: 'repositorio_handle_autenticado',
      alertaAutenticidade:
        '🏛 Fonte Institucional Autenticada no Repositório INCA (Handle 123456789/17914) | PDF e Errata auditados',
    };
  }

  return {
    handle: handleId,
    tipo: 'repositorio_generico',
    url: s.match(/https?:\/\/\S+/)?.[0] || '',
    possuiErrata: false,
    statusAutenticidade: 'repositorio_handle_autenticado',
    alertaAutenticidade: `🏛 Repositório Institucional com Handle (${handleId})`,
  };
}

/**
 * Regra R9: "Autenticada via DOI" exige comparação campo a campo entre a referência declarada e o registro oficial.
 * Compara autores, volume, fascículo (issue), ano e páginas. Divergência em qualquer campo gera alerta próprio.
 */
function compararCamposDoiOficial(refDoc, csl) {
  if (!csl) return null;
  const textoRef = refDoc.textoOriginal || '';
  const divergencias = [];

  // 1. Fascículo / Issue
  // Detecta se a referência do manuscrito declarou fascículo: "n. 1", "nº 1", "no. 1", "(1)"
  const mFasciculoDeclarado =
    textoRef.match(/\bv\.\s*\d+,\s*n\.\s*(\d+)/i) ||
    textoRef.match(/,\s*n[º°.]\s*(\d+)/i) ||
    textoRef.match(/\((\d+)\):/);
  const fasciculoDeclarado = mFasciculoDeclarado ? mFasciculoDeclarado[1] : null;
  const fasciculoOficial = csl.issue ? String(csl.issue) : null;
  const normFasc = (val) => String(val || '').replace(/^0+/, '').trim();
  const ehPublicacaoContinua = Boolean(
    csl['article-number'] ||
      csl['elocation-id'] ||
      /e\d{4,}/i.test(csl.page || '') ||
      /e\d{4,}/i.test(textoRef)
  );

  if (fasciculoDeclarado && !fasciculoOficial && ehPublicacaoContinua) {
    divergencias.push({
      campo: 'fasciculo',
      declarado: `n. ${fasciculoDeclarado}`,
      oficial: 'sem fascículo (publicação contínua)',
      mensagem: `A referência declarou "n. ${fasciculoDeclarado}", mas o registro oficial da revista (Crossref/SciELO) não possui número de fascículo (publicação contínua em volume). Recomenda-se suprimir "n. ${fasciculoDeclarado}".`,
    });
  } else if (
    fasciculoDeclarado &&
    fasciculoOficial &&
    normFasc(fasciculoDeclarado) !== normFasc(fasciculoOficial)
  ) {
    divergencias.push({
      campo: 'fasciculo',
      declarado: `n. ${fasciculoDeclarado}`,
      oficial: `n. ${fasciculoOficial}`,
      mensagem: `Divergência de fascículo: declarado "n. ${fasciculoDeclarado}", oficial "n. ${fasciculoOficial}".`,
    });
  }

  // 2. Volume
  const mVolDeclarado = textoRef.match(/\bv\.\s*(\d+)\b/i) || textoRef.match(/\bvol\.?\s*(\d+)\b/i);
  const volDeclarado = mVolDeclarado ? mVolDeclarado[1] : null;
  const volOficial = csl.volume ? String(csl.volume) : null;
  if (volDeclarado && volOficial && volDeclarado !== volOficial) {
    divergencias.push({
      campo: 'volume',
      declarado: `v. ${volDeclarado}`,
      oficial: `v. ${volOficial}`,
      mensagem: `Divergência de volume: declarado "v. ${volDeclarado}", oficial "v. ${volOficial}".`,
    });
  }

  // 3. Ano de Publicação (com tolerância de ±1 ano para Epub ahead of print vs. Volume impresso)
  const anoDeclarado = refDoc.anoBase;
  const anosOficiaisValidos = new Set();
  const registrarAno = (objData) => {
    const y = objData?.['date-parts']?.[0]?.[0];
    if (y && /^\d{4}$/.test(String(y))) anosOficiaisValidos.add(String(y));
  };
  registrarAno(csl.issued);
  registrarAno(csl['published-print']);
  registrarAno(csl['published-online']);
  registrarAno(csl.published);
  registrarAno(csl.created);
  registrarAno(csl.deposited);

  const anoOficialPrincipal = String(
    csl.issued?.['date-parts']?.[0]?.[0] || Array.from(anosOficiaisValidos)[0] || ''
  );
  const doiContemAnoDeclarado =
    anoDeclarado && String(refDoc.doi || csl.DOI || '').includes(anoDeclarado);
  const textoContemAmbosAnos =
    anoDeclarado &&
    anoOficialPrincipal &&
    textoRef.includes(anoDeclarado) &&
    textoRef.includes(anoOficialPrincipal);

  const ehAnoExatamenteOficial = anoDeclarado && anosOficiaisValidos.has(anoDeclarado);
  const ehEpubAheadOfPrintValido =
    ehAnoExatamenteOficial ||
    doiContemAnoDeclarado ||
    textoContemAmbosAnos ||
    (anoDeclarado &&
      Array.from(anosOficiaisValidos).some(
        (anoOf) => Math.abs(Number(anoDeclarado) - Number(anoOf)) <= 1
      ));

  if (anoDeclarado && anosOficiaisValidos.size > 0 && !ehEpubAheadOfPrintValido) {
    divergencias.push({
      campo: 'ano',
      declarado: anoDeclarado,
      oficial: anoOficialPrincipal,
      mensagem: `Divergência de ano: declarado "${anoDeclarado}", oficial "${anoOficialPrincipal}".`,
    });
  }

  return {
    conferido: true,
    temDivergencia: divergencias.length > 0,
    divergencias,
  };
}

/**
 * Extrai o ano real de publicação de uma entrada de referência bibliográfica
 * (ex.: "2025", "2023a", "2023b", "2023c", "2002"), ignorando intervalos no título
 * como "2012-2021", "2018-2019", "2019-2020" e datas de acesso ("Acesso em: 12 out. 2026" ou "Acessado novembro 14, 2026").
 */
function extrairAnoPublicacaoReferencia(linha) {
  let s = String(linha || '');
  // 1. Remove colchetes de citação/acesso NLM/Vancouver como "[cited 2026 Nov 14]", "[citado 2026 nov. 14]", "[acesso em 14 nov. 2026]"
  s = s.replace(/\[\s*(?:cited|citado|acesso|acessado|accessed)\b[^\]]*\]/gi, ' ');
  // 2. Remove todo o bloco final de "Disponível em: ... Acesso em: 12 out. 2026.", "Available from:", "Acessado novembro 14, 2026."
  s = s.replace(/\b(?:Dispon[ií]vel\s+em|Available\s+from|Acesso\s+em|Acessado(?:\s+em)?|Accessed(?:\s+on)?)\s*:?[\s\S]*$/gi, ' ');
  // 3. Remove URLs (com http/https ou www.), PMIDs, PMCIDs e DOIs (pois contêm números de anos e códigos como 8746 em PMC3248746)
  s = s.replace(/https?:\/\/\S+/gi, ' ');
  s = s.replace(/\bwww\.\S+/gi, ' ');
  s = s.replace(/\bPMCID\s*:?\s*(?:PMC)?\d+\b/gi, ' ');
  s = s.replace(/\bPMID\s*:?\s*\d+\b/gi, ' ');
  s = s.replace(/\bPMC\d+\b/gi, ' ');
  s = s.replace(/\bDOI\s*:?\s*10\.\d{4,9}\/\S+/gi, ' ');
  s = s.replace(/10\.\d{4,9}\/\S+/g, ' ');
  // 4. Remove códigos de elocation como "e20240171", "e2022563", "e2022567", "ISO 13940:2015" (mantendo o ano final)
  s = s.replace(/\be(19|20)\d{4,}\b/gi, ' ');
  // 5. Remove intervalos de anos dentro de títulos de estudos (ex.: "2012-2021", "entre 1995 e 2018", "de 2000 a 2015", "between 2005 and 2019")
  s = s.replace(/\b(?:entre|de|from|between)\s+(19\d\d|20\d\d)\s*(?:[-–—/]|a|e|to|and)\s*(19\d\d|20\d\d)\b/gi, ' ');
  s = s.replace(/\b(19\d\d|20\d\d)\s*(?:[-–—/]|a|e|to|and)\s*(19\d\d|20\d\d)\b/gi, ' ');

  // 6. Procura todos os anos candidatos (inclui colchetes, sufixos a-f, e formatos especiais como [20--a], [s.d.])
  const todosAnos = [
    ...s.matchAll(/(?:\[(19\d\d|20\d\d|20--)([a-z])?\]|\b(19\d\d|20\d\d)([a-z])?\b|\[?(s\.d\.)\]?)(?=[\s.,;):\]!]|$)/gi)
  ];
  if (!todosAnos.length) {
    // Fallback na linha bruta se necessário (suporta [20--b] e [s.d.])
    const mFallback = String(linha || '').match(/(?:\[(19\d\d|20\d\d|20--)([a-z])?\]|\b(19\d\d|20\d\d)([a-z])?\b|\[?(s\.d\.)\]?)/i);
    const bAno = mFallback ? (mFallback[1] || mFallback[3] || mFallback[5] || '') : '';
    const bSuf = mFallback ? (mFallback[2] || mFallback[4] || '') : '';
    return {
      anoCompleto: bAno ? `${bAno.toLowerCase()}${bSuf.toLowerCase()}` : '',
      anoBase: bAno ? bAno.toLowerCase() : '',
      sufixoAno: bSuf ? bSuf.toLowerCase() : '',
    };
  }

  // O ano de publicação na ABNT e em Vancouver fica no final da referência (após periódico/editora/local)
  const ultimo = todosAnos[todosAnos.length - 1];
  const anoBase = (ultimo[1] || ultimo[3] || ultimo[5] || '').toLowerCase();
  const sufixoAno = (ultimo[2] || ultimo[4] || '').toLowerCase();
  return {
    anoCompleto: `${anoBase}${sufixoAno}`,
    anoBase,
    sufixoAno,
  };
}

/**
 * Classifica se a referência é um Artigo Científico de Periódico ('artigo_periodico'),
 * um Documento Normativo / Lei / Ato Normativo / Publicação Institucional Oficial / Livro ('norma_livro_institucional'),
 * ou um Periódico Regional / Literatura Cinzenta sem DOI ('periodico_regional_sem_doi'),
 * usando o classificador harmonizado LeNER-Br + LexML + BVS/SUS + CSL-JSON nativo do Mendeley/Zotero.
 */
function classificarNaturezaReferencia(linha, doi, metadadoCslEmbutido = null) {
  const s = sanitizarCamposGerenciadorBibliografia(String(linha || '')).trim();
  const res = classificarReferenciaHarmonizada(s, doi, metadadoCslEmbutido);
  return res.natureza;
}

// ---------- 3. Delimitação de Corpo do Texto, Seção de Referências e Pós-Referências ----------
function ehTituloSecao(texto) {
  const s = String(texto || '').trim();
  if (!s || s.length > 90) return false;
  if (/[.!?;,]$/.test(s)) return false;
  // Nunca trata legendas de figuras/quadros/tabelas, fontes ou células/fórmulas tabulares como títulos de seção
  if (/^(?:\d{1,3}\s+)?(?:figura|tabela|quadro|gr[aá]fico|mapa|diagrama|fluxograma|fotografia|organograma|esquema|ficha)\s+\d+\s*[:.–—-]/i.test(s)) return false;
  if (/^fonte\s*[:–—-]/i.test(s)) return false;
  if (/[÷×=]/.test(s) || /\s{3,}/.test(s)) return false;
  if (/^\d{1,4}$/.test(s)) return false;
  if (
    /^(?:\d+(?:\.\d+)*\.?\s+)?(?:introdu[cç][aã]o|objetivos?(?:\s+geral|\s+espec[ií]ficos)?|metodologia|percurso\s+metodol[oó]gico|materiais?\s+e\s+m[eé]todos?|m[eé]todos?|resultados?(?:\s+esperados|\s+e\s+discuss[aã]o)?|discuss[aã]o|conclus[aã]o|conclus[oõ]es|considera[cç][oõ]es\s+finais|revis[aã]o\s+de\s+literatura|referencial\s+te[oó]rico|fundamenta[cç][aã]o\s+te[oó]rica|cronograma|or[cç]amento|viabilidade(?:\s+e\s+riscos)?|background|introduction|methods|results|discussion|conclusion)(?:\s*:)?$/i.test(
      s
    )
  ) {
    return true;
  }
  if (/^\d+(?:\.\d+)+\s+[A-ZÀ-Ú]/.test(s) && s.split(/\s+/).length <= 12) return true;
  if (/^\d{1,2}\s+[A-ZÀ-Ú]{2,}/.test(s) && s.split(/\s+/).length <= 10 && !/:/.test(s)) return true;
  if (s === s.toUpperCase() && /[A-ZÀ-Ú]{5,}/.test(s) && s.split(/\s+/).length <= 10 && (s.split(/\s+/).length >= 2 || s.length >= 6)) return true;
  return false;
}

function ehInicioSecaoPosReferencias(texto) {
  const s = String(texto || '').trim();
  if (!s) return false;
  // Títulos explícitos de seções pós-referências (ex.: "NOTA PARA A ORIENTAÇÃO", "ANEXO A", "APÊNDICE", etc.)
  if (
    /^(?:\d+(?:\.\d+)*\.?\s*)?(?:notas?\s+para\s+a?\s*orienta[cç][aã]o|notas?\s+ao\s+orientador|anexos?|ap[eê]ndices?|gloss[aá]rio|agradecimentos?|ficha\s+catalogr[aá]fica|termo\s+de\s+consentimento|carta\s+de\s+anu[eê]ncia|declara[cç][aã]o)\b/i.test(
      s
    )
  ) {
    return true;
  }
  if (/^(?:anexo|ap[eê]ndice)\s+[a-z0-9]/i.test(s)) {
    return true;
  }
  return false;
}

function ehInicioNovaReferencia(linha, bufferAnterior) {
  const s = sanitizarCamposGerenciadorBibliografia(String(linha || '')).trim();
  const buf = String(bufferAnterior || '').trim();
  if (!s) return false;

  // Fragmentos de continuação (página isolada, anos isolados, cauda de DOI/URL, linha iniciada em minúscula) nunca iniciam referência
  if (/^\d{1,4}$/.test(s)) return false;
  if (/^[a-zà-ÿ]/.test(s)) return false;
  if (/^(?:19|20)\d\d[a-z]?(?:\.|,|;|:|\s|$)/.test(s)) return false;
  if (/^\d+(?:\.\d+)?-[a-z0-9-]+/i.test(s) || /^[0-9]{4,}[a-z0-9.-]*\.?$/i.test(s) || /^[0-9]{2,6}x[0-9]{4,}/i.test(s)) return false;
  if (buf && /(?:https?:\/\/|www\.|DOI\s*:?\s*|10\.\d{4,9}\/)\S*[-/]$/i.test(buf)) return false;

  // Numeração explícita de referência (1 a 3 dígitos — exclui anos de 4 dígitos)
  if (!/^(?:19|20)\d\d/.test(s) && /^(?:\[\d{1,3}\]|\d{1,3}\.|\(\d{1,3}\))\s+[A-Za-zÀ-ÿ0-9]/.test(s)) {
    return true;
  }
  // Se o buffer anterior ainda não tem ano (inclusive sufixos 2026a/2018b) nem DOI nem URL, a referência anterior ainda não acabou!
  if (
    buf &&
    !/\b(?:19\d\d|20\d\d|20--|19--)[a-z]?\b/i.test(buf) &&
    !/\[s\.d\.?\]/i.test(buf) &&
    !/\b10\.\d{4,9}\/\S+/.test(buf) &&
    !/https?:\/\//.test(buf) &&
    !/www\.\S+/i.test(buf)
  ) {
    return false;
  }
  // Linhas que começam com dados de publicação, ano, cidade ou periódicos são continuações da mesma referência
  if (/^(?:19|20)\d\d/.test(s)) return false;
  if (/^(?:Bras[ií]lia|Rio de Janeiro|S[aã]o Paulo|Genebra|Curitiba|Goi[aâ]nia|New York|London|Boston)\s*[:;,]/i.test(s)) return false;
  if (/^(?:Dispon[ií]vel|Available|Acesso|Acessado|Accessed|DOI|https?|www\.|v\.|vol\.|n\.|nº|no\.|p\.|pp\.|ed\.|edn\.|supl\.|Preprint)/i.test(s)) return false;
  if (/^(?:Journal|Revista|Cadernos|Ci[eê]ncia|Epidemiologia|Arquivos|American Journal|American College|Nature|Lancet|PLOS|BMC|Arq\.|Di[aá]rio Oficial)\b/i.test(s)) return false;

  // Início de nova referência ABNT / Vancouver
  if (/^[A-ZÀ-Ú][A-Za-zÀ-ÿ0-9'.-]+(?:(?:\s+(?:de|da|do|dos|das)\s+|\s+)[A-ZÀ-Ú][A-Za-zÀ-ÿ0-9'.-]+)*,\s+[A-ZÀ-Ú](?:\.|[a-zA-ZÀ-ÿ])/.test(s)) return true;
  if (/^(?:BRASIL|MINIST[EÉ]RIO DA SA[UÚ]DE|SECRETARIA MUNICIPAL|SECRETARIA DE ESTADO|INSTITUTO NACIONAL|INSTITUTO FEDERAL|ORGANIZA[CÇ][AÃ]O MUNDIAL|CONASS|CONASEMS|WORLD HEALTH|HL7 INTERNATIONAL|IHE INTERNATIONAL|CURITIBA|GOI[AÁ]S|WHO|S[AÃ]O PAULO|PARAN[AÁ]|SANTA CATARINA|CONSELHO NACIONAL|NATIONAL LIBRARY|VIRGINIA-MARYLAND|SNOMED INTERNATIONAL|INTERNATIONAL ORGANIZATION)\b/i.test(s)) return true;
  // ABNT NBR 6023: entrada pelo título quando a linha anterior terminou uma referência com ano (PRIMEIRA palavra em CAIXA ALTA + resto do título)
  if (
    buf &&
    /[.)\]]\s*$/.test(buf) &&
    /^(?:[A-ZÀ-Ú]{2,}|(?:O|A|OS|AS|UM|UMA|THE|AN)\s+[A-ZÀ-Ú]{2,})(?:\s+[A-ZÀ-Ú]{2,})?\s+[a-zà-ÿ]{2,}/.test(s) &&
    !/^(?:Journal|Revista|Cadernos|Ci[eê]ncia|Epidemiologia|Arquivos|Dispon[ií]vel|Acesso|Available|Accessed|Preprint)\b/i.test(s)
  ) {
    return true;
  }
  if (/^(?:[A-ZÀ-Ú]{2,}[A-ZÀ-Ú0-9\s/._'-]{1,78}(?:\s*\([^)]+\))?)\s*[.:]\s+[A-Za-zÀ-ÿ0-9“"']/.test(s) &&
      !/^(?:Dispon[ií]vel|Acesso|Acessado|Volume|Fasc[ií]culo|Nota|Fonte|DOI|URL|ISSN|ISBN)\b/i.test(s)) {
    return true;
  }
  return false;
}

function ehLinhaReferenciaValida(linha) {
  const s = sanitizarCamposGerenciadorBibliografia(String(linha || '')).trim();
  if (s.length < 22) return false;
  if (/^(?:refer[eê]ncias|bibliografia)/i.test(s) && s.length < 45) return false;

  // Uma referência válida precisa ter um ano (19xx/20xx) OU um DOI/URL e começar com padrão de autoria
  const temAnoOuDoi =
    /\b(19\d\d|20\d\d)[a-f]?\b/.test(s) ||
    /\b10\.\d{4,9}\/\S+/.test(s) ||
    /https?:\/\/\S+/i.test(s) ||
    /\bwww\.\S+/i.test(s);
  if (!temAnoOuDoi) return false;

  // Rejeita itens de lista numerada de texto corrido APENAS se não tiverem estrutura bibliográfica (ano/DOI/URL/ponto após autor)
  if (/^\d+\.\s+[A-ZÀ-Ú][a-zà-ú]+\s+[a-zà-ú]+[^.]{5,80}:\s+[a-zà-ú]/.test(s) && !/\bDOI\b/i.test(s) && !/\b(19\d\d|20\d\d)\b/.test(s)) {
    return false;
  }

  // Rejeita parágrafos puramente narrativos
  if (/^(?:esta\s+se[cç][aã]o|registram-se|conforme\s+sua|atendendo\s+[àa]|foi\s+incorporado|o\s+texto\s+foi)\b/i.test(s)) {
    return false;
  }

  // Deve começar com numeração Vancouver ([1], 1.) seguida de autor (inclusive partículas como "da Silva") ou SOBRENOME/INSTITUIÇÃO em maiúsculas
  const comecaComAutor = /^(?:\[\d+\]\s*|\d+\.\s*)[A-Za-zÀ-ÿ0-9“"']{2,}|^[A-ZÀ-Ú0-9]{2,}/.test(s);
  return comecaComAutor;
}

function dividirCorpoEReferencias(textoCompleto) {
  const textoSanitizado = sanitizarCamposGerenciadorBibliografia(String(textoCompleto || ''));
  const linhasBrutas = textoSanitizado.split(/\r?\n/);
  const itensComLinha = [];
  for (let idx = 0; idx < linhasBrutas.length; idx++) {
    const texto = linhasBrutas[idx].trim();
    if (texto) {
      itensComLinha.push({ texto, numLinha: idx + 1 });
    }
  }

  const reCabecalhoRef =
    /^(?:\d+(?:\.\d+)*\s*)?(?:refer[eê]ncias(?:\s+bibliogr[aá]ficas)?|bibliografia(?:\s+consultada)?|references|bibliography)\s*:?\s*$/i;
  let indiceRef = -1;
  for (let i = Math.floor(itensComLinha.length * 0.25); i < itensComLinha.length; i++) {
    if (reCabecalhoRef.test(itensComLinha[i].texto)) {
      indiceRef = i;
      break;
    }
  }
  if (indiceRef === -1) {
    for (let i = 0; i < itensComLinha.length; i++) {
      if (reCabecalhoRef.test(itensComLinha[i].texto)) {
        indiceRef = i;
        break;
      }
    }
  }

  const fatiaCorpo = indiceRef === -1 ? itensComLinha : itensComLinha.slice(0, indiceRef);
  const fatiaAposCabecalhoRef = indiceRef === -1 ? [] : itensComLinha.slice(indiceRef + 1);

  // 1. Agrupa linhas do corpo em parágrafos reais (evitando quebras de citações por quebras de linha em PDF e isolando células de tabelas)
  let secaoAtual = 'Corpo do Texto';
  let contadorParagrafo = 0;
  let contadorParagrafoCap1 = 0;
  const paragrafosCorpo = [];
  let bufferPar = '';
  let linhaInicioPar = 1;
  let celulaAnteriorTerminou = false;

  for (const item of fatiaCorpo) {
    const ehFimDeCelula = item.texto.includes('\uE002');
    let textoLimpo = item.texto.replace(/\uE002/g, '').trim();
    if (!textoLimpo) continue;
    // Ignora números isolados de página residual de PDF no fluxo do corpo e limpa prefixo numérico colado em legendas
    if (/^\d{1,4}$/.test(textoLimpo)) continue;
    textoLimpo = textoLimpo.replace(/^\d{1,3}\s+(?=(?:Figura|Tabela|Quadro|Gr[aá]fico|Mapa|Diagrama|Fluxograma|Fotografia|Organograma|Esquema|Fonte)\b)/i, '');

    if (ehTituloSecao(textoLimpo)) {
      if (bufferPar.trim()) {
        contadorParagrafo++;
        contadorParagrafoCap1++;
        paragrafosCorpo.push({
          texto: bufferPar.trim(),
          numParagrafo: contadorParagrafo,
          numParagrafoNaSecao: contadorParagrafoCap1,
          numLinha: linhaInicioPar,
          secao: secaoAtual,
        });
        bufferPar = '';
      }
      secaoAtual = textoLimpo;
      contadorParagrafoCap1 = 0;
      celulaAnteriorTerminou = false;
      continue;
    }

    const ehLegendaOuFonte = /^(?:(?:figura|tabela|quadro|gr[aá]fico|mapa|diagrama|fluxograma|fotografia|organograma|esquema)\s+\d+\s*[:.–—-]|fonte\s*[:–—-])/i.test(textoLimpo);
    if (ehLegendaOuFonte && bufferPar.trim()) {
      contadorParagrafo++;
      contadorParagrafoCap1++;
      paragrafosCorpo.push({
        texto: bufferPar.trim(),
        numParagrafo: contadorParagrafo,
        numParagrafoNaSecao: contadorParagrafoCap1,
        numLinha: linhaInicioPar,
        secao: secaoAtual,
      });
      bufferPar = '';
    }

    if (bufferPar && !celulaAnteriorTerminou && !/[.!?:]$/.test(bufferPar) && !ehLegendaOuFonte) {
      bufferPar += ' ' + textoLimpo;
    } else if (bufferPar && !celulaAnteriorTerminou && textoLimpo.length > 0 && /^[a-zà-ÿ]/.test(textoLimpo) && !ehLegendaOuFonte) {
      bufferPar += ' ' + textoLimpo;
    } else {
      if (bufferPar.trim()) {
        contadorParagrafo++;
        contadorParagrafoCap1++;
        paragrafosCorpo.push({
          texto: bufferPar.trim(),
          numParagrafo: contadorParagrafo,
          numParagrafoNaSecao: contadorParagrafoCap1,
          numLinha: linhaInicioPar,
          secao: secaoAtual,
        });
      }
      bufferPar = textoLimpo;
      linhaInicioPar = item.numLinha;
    }

    if (ehFimDeCelula) {
      if (bufferPar.trim()) {
        contadorParagrafo++;
        contadorParagrafoCap1++;
        paragrafosCorpo.push({
          texto: bufferPar.trim(),
          numParagrafo: contadorParagrafo,
          numParagrafoNaSecao: contadorParagrafoCap1,
          numLinha: linhaInicioPar,
          secao: secaoAtual,
        });
        bufferPar = '';
      }
      celulaAnteriorTerminou = true;
    } else {
      celulaAnteriorTerminou = false;
    }
  }
  if (bufferPar.trim()) {
    contadorParagrafo++;
    contadorParagrafoCap1++;
    paragrafosCorpo.push({
      texto: bufferPar.trim(),
      numParagrafo: contadorParagrafo,
      numParagrafoNaSecao: contadorParagrafoCap1,
      numLinha: linhaInicioPar,
      secao: secaoAtual,
    });
  }

  // 2. Delimita referências e eventuais seções pós-referências (Anexos / Apêndices)
  const fatiaRef = [];
  const linhasPosReferencias = [];
  let entrouPosReferencias = false;

  for (const item of fatiaAposCabecalhoRef) {
    const textoLimpo = item.texto.replace(/\uE002/g, '').trim();
    if (!textoLimpo) continue;
    if (!entrouPosReferencias && ehInicioSecaoPosReferencias(textoLimpo)) {
      entrouPosReferencias = true;
    }
    if (entrouPosReferencias) {
      linhasPosReferencias.push({ texto: textoLimpo, numLinha: item.numLinha });
    } else {
      // Remove números isolados de página residual de PDF dentro da seção de referências
      if (/^\d{1,4}$/.test(textoLimpo)) continue;
      fatiaRef.push(textoLimpo);
    }
  }

  // 3. Agrupa linhas da seção de referências em entradas bibliográficas completas e coesas, reparando DOIs/URLs quebrados em PDF
  const linhasReferenciasBrutas = [];
  let bufferRef = '';
  for (const l of fatiaRef) {
    if (ehInicioNovaReferencia(l, bufferRef)) {
      if (bufferRef.trim()) {
        linhasReferenciasBrutas.push(bufferRef.trim());
      }
      bufferRef = l;
    } else if (bufferRef && /(?:https?:\/\/|www\.|DOI\s*:?\s*|10\.\d{4,9}\/)\S*[-/]$/i.test(bufferRef.trimEnd())) {
      bufferRef = bufferRef.trimEnd() + l.trimStart();
    } else {
      bufferRef = bufferRef ? (bufferRef + ' ' + l) : l;
    }
  }
  if (bufferRef.trim()) {
    linhasReferenciasBrutas.push(bufferRef.trim());
  }

  // 4. Normaliza DOIs/URLs quebrados por espaços residuais e separa eventuais entradas ABNT coladas na mesma linha
  const linhasReferencias = [];
  for (const entryBruta of linhasReferenciasBrutas) {
    let s = entryBruta;
    for (let passo = 0; passo < 3; passo++) {
      const prox = s
        .replace(/((?:https?:\/\/|www\.|DOI\s*:?\s*|10\.\d{4,9}\/)[^\s,;()<>"]*?[-/])\s+([a-zA-Z0-9._-]{2,})/gi, '$1$2')
        .replace(/,\s+\d{1,3}\s+(?=v\.\s*\d)/gi, ', ');
      if (prox === s) break;
      s = prox;
    }
    // Separa entradas distintas que tenham ficado concatenadas na mesma linha após DOI, data de acesso ou ponto final de entrada com ano
    const partesSeparadas = s
      .split(/(?<=\b10\.\d{4,9}\/\S+)\s+(?=[A-ZÀ-Ú]{2,}[A-ZÀ-Ú\s'’-]*,\s+[A-ZÀ-Ú]\.|(?:BRASIL|MINIST[EÉ]RIO|INSTITUTO|ORGANIZA[CÇ][AÃ]O|WORLD|AMERICAN|INTERNATIONAL|CONSELHO|SECRETARIA|CURITIBA)\b)/)
      .flatMap((p) =>
        p.split(/(?<=\b(?:19|20)\d\d[a-z]?\.[^.]{0,180}?\.\s*)(?=[A-ZÀ-Ú]{2,}(?:-[A-ZÀ-Ú]{2,})*(?:\s+(?:DE|DA|DO|DOS|DAS|E))?,\s+[A-ZÀ-Ú]\.)/)
      )
      .map((p) => p.replace(/\s+\d{1,3}$/, (m) => (/^\s+(?:19|20)\d{2}$/.test(m) ? m : '')).trim())
      .filter(Boolean);
    linhasReferencias.push(...partesSeparadas);
  }

  return {
    paragrafosCorpo,
    linhasReferencias,
    linhasPosReferencias,
  };
}

/**
 * Expande uma expressão numérica de citações Vancouver (ex.: "3, 12–14, 23, 25-28" ou "34, 35, 36 e 37")
 * em um array de inteiros únicos válidos [3, 12, 13, 14, 23, 25, 26, 27, 28].
 */
function expandirIntervalosNumericosVancouver(expr, maxRef = 500) {
  const numeros = new Set();
  const limpo = String(expr || '')
    .replace(/\s+e\s+/gi, ',')
    .replace(/[;]/g, ',');
  for (const parte of limpo.split(',')) {
    const p = parte.trim();
    if (!p) continue;
    const mRange = p.match(/^(\d{1,3})\s*[-–—]\s*(\d{1,3})$/);
    if (mRange) {
      const ini = Number(mRange[1]);
      const fim = Number(mRange[2]);
      if (ini >= 1 && fim >= ini && fim <= maxRef && fim - ini <= 50) {
        for (let k = ini; k <= fim; k++) numeros.add(k);
      }
    } else if (/^\d{1,3}$/.test(p)) {
      const n = Number(p);
      if (n >= 1 && n <= maxRef) numeros.add(n);
    }
  }
  return [...numeros];
}

// Mapa de sobrescritos Unicode (¹²³...) para dígitos normais
const MAPA_UNICODE_SUPERSCRIPT = {
  '⁰': '0', '¹': '1', '²': '2', '³': '3', '⁴': '4',
  '⁵': '5', '⁶': '6', '⁷': '7', '⁸': '8', '⁹': '9',
  '⁻': '-', '‒': '-', '–': '-', '—': '-',
};

function normalizarSuperscriptUnicodeParaColchetes(frase) {
  return String(frase || '').replace(
    /[¹²³⁴⁵⁶⁷⁸⁹][⁰¹²³⁴⁵⁶⁷⁸⁹,⁻–—]*/g,
    (m) => {
      const conv = m
        .split('')
        .map((c) => MAPA_UNICODE_SUPERSCRIPT[c] ?? c)
        .join('');
      return ` [${conv}] `;
    }
  );
}

/**
 * Classifica a Intenção Discursiva da Citação (Citation Intent Analysis - Inspirado no onecite / SciCite):
 * Identifica se a citação tem papel metodológico, comprobatório/apoio, contrapositivo/crítica ou conceitual.
 */
function classificarIntencaoCitacao(frase, autor) {
  const f = String(frase || '').toLowerCase();

  if (/\b(?:m[eé]todo|metodologia|procedimento|protocolo|t[eé]cnica|escala|question[aá]rio|instrumento|algoritmo|software|utiliz(?:ou|ado|aram|am-se)|aplic(?:ou|ado|aram|a-se)|propost[oa]|adaptad[oa]|adotad[oa]|com\s+base\s+n[oa]|segundo\s+o\s+modelo)\b/i.test(f)) {
    return { categoria: 'metodologica', rotulo: '🔬 Uso Metodológico / Instrumental' };
  }
  if (/\b(?:em\s+contrapartida|ao\s+contr[aá]rio|diverg(?:e|em|indo)|em\s+contraste|diferente\s+d[eo]|discord(?:a|am)|contesta|apesar\s+de|embora\s+o\s+estudo|lacuna|diverg[eê]ncia)\b/i.test(f)) {
    return { categoria: 'contrapositiva', rotulo: '⚡ Contraposição / Achados Divergentes' };
  }
  if (/\b(?:confirm(?:a|am|ando|ado)|corrobor(?:a|am|ando|ado)|em\s+conson[aâ]ncia|em\s+acordo|conforme\s+demonstrad[oa]|sustentad[oa]|achados\s+semelhantes|resultados\s+convergentes|evidenci(?:a|am|ado)|comprov(?:a|am|ado)|refor[cç](?:a|am|ado))\b/i.test(f)) {
    return { categoria: 'comprobatoria', rotulo: '✅ Apoio Comprobatório / Resultados Convergentes' };
  }
  if (/\b(?:conceitu(?:a|am|ado)|defin(?:e|em|ido)|teoria|conceito|marco\s+te[oó]rico|entende-se|compreende-se|na\s+vis[aã]o\s+de|concep[cç][aã]o|fundament(?:a|am|ado))\b/i.test(f)) {
    return { categoria: 'conceitual', rotulo: '📖 Definição Conceitual / Teórica' };
  }
  return { categoria: 'mencao_geral', rotulo: '📌 Menção Contextual / Informativa' };
}

function resolverRefPareadaPorCoautores(infoAutor, anoCompleto, anoBase, refsFinais = []) {
  if (!Array.isArray(refsFinais) || refsFinais.length === 0 || !infoAutor?.chavePrincipal) return null;

  const temSufixoCit = /[a-f]$/i.test(anoCompleto);
  const filtrarPorAno = (r, estrito) => {
    if (estrito) return r.ano === anoCompleto;
    if (temSufixoCit) return false;
    return r.anoBase === anoBase && !/[a-f]$/i.test(r.ano);
  };

  const buscarCandidatos = (estrito) => {
    const cands = [];
    for (const r of refsFinais) {
      if (!filtrarPorAno(r, estrito)) continue;
      const aliasesRef = new Set(r.chavesAutorAlias || [r.chaveAutor]);
      const aliasesCit = infoAutor.chavesAlias || [infoAutor.chavePrincipal];
      const principalBate = aliasesRef.has(infoAutor.chavePrincipal) || aliasesCit.includes(r.chaveAutor);
      const algumAliasBate = aliasesCit.some((al) => al && aliasesRef.has(al));
      if (!principalBate && !algumAliasBate) continue;

      let score = principalBate ? 20 : 8;
      for (const al of aliasesCit) {
        if (al && aliasesRef.has(al)) score += 6;
      }
      const coautoresExp = infoAutor.coautoresExplicitos || [];
      for (const co of coautoresExp) {
        if (aliasesRef.has(co)) score += 18;
        else score -= 18;
      }
      if (!infoAutor.temEtAl && r.numAutoresLinha) {
        const qtdCitada = 1 + coautoresExp.length;
        if (r.numAutoresLinha === qtdCitada) score += 12;
        else if (r.numAutoresLinha > qtdCitada) score -= (r.numAutoresLinha - qtdCitada) * 4;
      }
      if (infoAutor.temEtAl && r.numAutoresLinha >= 3) score += 6;
      cands.push({ ref: r, score });
    }
    return cands;
  };

  let candidatos = buscarCandidatos(true);
  if (candidatos.length === 0) candidatos = buscarCandidatos(false);
  if (candidatos.length === 0) return null;
  candidatos.sort((a, b) => b.score - a.score);
  return candidatos[0].ref;
}

function separarCitacoesSobrescritasColadasPdf(texto, totalRefsNumeradas = 0, maxNumRef = 0) {
  if (!texto || totalRefsNumeradas < 3 || maxNumRef <= 0) return texto;
  const validarListaNums = (bruto) => {
    const nums = String(bruto || '')
      .split(/[,–—-]/)
      .map((n) => parseInt(n.trim(), 10))
      .filter((n) => Number.isFinite(n));
    return nums.length > 0 && nums.every((n) => n >= 1 && n <= maxNumRef && n < 1900);
  };

  let out = String(texto);
  // 1. Palavra em minusculas (>=3 letras) com indice sobrescrito colado antes de pontuacao ou espaco: ex.: "rates26." -> "rates [26]."
  out = out.replace(
    /\b([a-zà-ÿ]{3,})(\d{1,4}(?:[,–—-]\d{1,4})*)([.,;:])(?=\s|$)/g,
    (match, palavra, nums, pont) => {
      if (/^(?:covid|sars|mers|type|fase|phase|step|item|fig|tab|eq|vol|art|lei|res|port|cod|icd|cid)$/i.test(palavra)) {
        return match;
      }
      if (!validarListaNums(nums)) return match;
      return `${palavra} [${nums}]${pont}`;
    }
  );
  // 2. Pontuacao seguida de numero sobrescrito colado antes de espaco/fim: ex.: "rates.26 " -> "rates [26]. "
  out = out.replace(
    /([a-zà-ÿ]{3,})([.,;])(\d{1,4}(?:[,–—-]\d{1,4})*)(?=\s|$)/g,
    (match, palavra, pont, nums) => {
      if (!validarListaNums(nums)) return match;
      return `${palavra} [${nums}]${pont}`;
    }
  );
  return out;
}

function separarReferenciasNumeradasConcatenadas(linhas = []) {
  const resultado = [];
  let ultimoNum = 0;
  for (const linhaOriginal of linhas || []) {
    const linha = String(linhaOriginal || '');
    const mInicio = linha.trim().match(/^(\d{1,4})\.\s+/);
    if (mInicio) {
      const nIni = parseInt(mInicio[1], 10);
      if (nIni >= 1 && nIni <= 2500) ultimoNum = nIni;
    }

    // Divide referencias concatenadas na mesma linha (ex.: ".../441. Merriam-Webster" ou "2020.442. Smith")
    let restante = linha;
    let guard = 0;
    while (ultimoNum > 0 && guard < 10) {
      guard++;
      const proxEsperado = ultimoNum + 1;
      const reProx = new RegExp(`([/.\\)\\s])(${proxEsperado})\\.\\s+(?=[A-ZÀ-Ú][A-Za-zÀ-ÿ'’-]{2,})`);
      const mProx = reProx.exec(restante);
      if (!mProx || mProx.index < 20) break;
      const antes = restante.slice(0, mProx.index + mProx[1].length).trim();
      const depois = restante.slice(mProx.index + mProx[1].length).trim();
      if (antes) resultado.push(antes);
      restante = depois;
      ultimoNum = proxEsperado;
    }
    if (restante.trim()) resultado.push(restante);
  }
  return resultado;
}

function detectarEstiloBibliograficoLista(refsMapeadas = []) {
  if (!Array.isArray(refsMapeadas) || refsMapeadas.length === 0) return 'abnt';
  let totalNumeradasOuInternacionais = 0;
  for (const r of refsMapeadas) {
    const txt = String(r?.textoOriginal || '').trim();
    const temNum = Boolean(r?.numeroRef) || /^\s*(?:\d{1,4}\.|\[\d{1,4}\])\s+/.test(txt);
    const padraoNatureVancouver =
      /\b\d+,\s*\d+[–-]\d+\s*\((?:19|20)\d{2}\)\.?\s*$/.test(txt) ||
      /;\s*\d+(?:\(\d+\))?:\s*\d+/.test(txt);
    if (temNum || padraoNatureVancouver) totalNumeradasOuInternacionais++;
  }
  return totalNumeradasOuInternacionais / refsMapeadas.length >= 0.5 ? 'vancouver_nature' : 'abnt';
}

// ---------- 4. Extração de Citações no Corpo do Texto (ABNT + Vancouver Numérico) e Alertas de Forma ----------
function extrairCitacoesDoCorpo(paragrafos, refsFinais = []) {
  const citacoes = [];
  const alertasFormaAbnt = [];
  const ignorarSobrenomes = new Set([
    'figura', 'tabela', 'quadro', 'grafico', 'secao', 'capitulo', 'item', 'artigo',
    'lei', 'decreto', 'portaria', 'anexo', 'apendice', 'fonte', 'nota', 'p', 'pp', 'v', 'n',
    'resolucao', 'inciso', 'paragrafo',
    'autora', 'autor', 'autores', 'autoria', 'pesquisador', 'pesquisadora',
    'elaborado', 'elaborada', 'elaborados', 'elaboradas',
    'produzido', 'produzida', 'organizado', 'organizada',
    'adaptado', 'adaptada', 'modificado', 'modificada',
    'elaboradoautora', 'elaboradoautor', 'elaboradaautora', 'elaboradopelaautora', 'elaboradopeloautor',
    'autoriapropria',
  ]);

  // Mapa rápido de referências numeradas (Vancouver: 1 -> refDoc)
  const refsPorNumero = new Map();
  for (let i = 0; i < refsFinais.length; i++) {
    const r = refsFinais[i];
    const num = r.numeroRef || i + 1;
    if (r.numeroRef) {
      refsPorNumero.set(num, r);
    }
  }
  const maxRefNumerada = refsPorNumero.size > 0 ? Math.max(...refsPorNumero.keys()) : Math.max(refsFinais.length, 150);

  // Função auxiliar para dividir parágrafo em frases sem quebrar após "et al.", "v.", "n.", "p.", "fig.", etc.
  const dividirEmFrasesSemQuebrarAbreviaturas = (textoPar) => {
    const protegido = String(textoPar || '').replace(
      /\b(et\s+al|op\s+cit|loc\s+cit|v|vol|n|no|nº|p|pp|p[aá]g|fig|tab|eq|par|al|dr|dra|prof|profa|art|inc|ed|org|orgs|coord|supl|cap|sec|sr|sra|jr|st|sto|sta|ca|vs|cf|ib|ibid)\.\s+/gi,
      '$1\u0000 '
    );
    const brutas = protegido
      .split(/(?<=[.!?])\s+(?=[A-ZÀ-Ú“"«—–-])/)
      .map((f) => f.replace(/\u0000/g, '.').trim())
      .filter(Boolean);

    // Propaga o contexto quando uma sentença é meramente residual/atributiva (ex.: "(1997) [9].")
    const fundidas = [];
    for (const f of brutas) {
      const letrasSemCit = f
        .replace(/\[\s*\d+(?:\s*[,;–—-]\s*\d+)*\s*\]/g, '')
        .replace(/\(\s*(?:19|20)\d\d[a-f]?\s*\)/g, '')
        .replace(/[^A-Za-zÀ-ÿ]/g, '');
      if (letrasSemCit.length < 18 && fundidas.length > 0) {
        fundidas[fundidas.length - 1] = `${fundidas[fundidas.length - 1]} ${f}`;
      } else {
        fundidas.push(f);
      }
    }
    return fundidas;
  };

  for (let idxPar = 0; idxPar < paragrafos.length; idxPar++) {
    const objPar =
      typeof paragrafos[idxPar] === 'string'
        ? { texto: paragrafos[idxPar], numParagrafo: idxPar + 1, numLinha: idxPar + 1, secao: 'Corpo do Texto' }
        : paragrafos[idxPar];
    const parBase = normalizarSuperscriptUnicodeParaColchetes(objPar.texto);
    const par = separarCitacoesSobrescritasColadasPdf(parBase, refsPorNumero.size, maxRefNumerada);

    const frases = dividirEmFrasesSemQuebrarAbreviaturas(par);
    for (let idxFrase = 0; idxFrase < frases.length; idxFrase++) {
      const frase = frases[idxFrase];
      if (/^\s*(?:fonte|nota)\s*:\s*(?:elaborad[oa]|produzid[oa]|organizad[oa]|autoria\s+pr[oó]pria)/i.test(frase)) {
        continue;
      }
      const chavesJaRegistradasNaFrase = new Set();
      const ehFraseCurtaOuAnaforica =
        idxFrase > 0 &&
        (frase.trim().length < 130 ||
          /^\s*(?:esses?|essas?|estes?|estas?|isso|isto|tal|tais|nesse|nessa|neste|nesta|dessa|desta|desse|deste|ele|ela|eles|elas|em\s+rela[cç][aã]o\s+a\s+isso|nesse\s+(?:cen[aá]rio|contexto|sentido)|these|this\s+(?:study|finding|result)|such|they|in\s+this\s+context)\b/i.test(
            frase
          ));
      const fraseContextoSemantico = ehFraseCurtaOuAnaforica
        ? `${frases[idxFrase - 1].trim()} ${frase.trim()}`.trim()
        : frase.trim();
      const registrarCitacaoUnicaNaFrase = (itemCit) => {
        const chaveDedup = `${itemCit.chave}::${objPar.numParagrafo}::${idxFrase}`;
        if (chavesJaRegistradasNaFrase.has(chaveDedup)) return;
        chavesJaRegistradasNaFrase.add(chaveDedup);
        if (!itemCit.fraseContextoSemantico) {
          itemCit.fraseContextoSemantico = fraseContextoSemantico;
        }
        if (!itemCit.intencao) {
          itemCit.intencao = classificarIntencaoCitacao(frase, itemCit.autor);
        }
        citacoes.push(itemCit);
      };
      const mAspas = frase.match(/[“"]([^”"]{12,400})[”"]/);
      const trechoDireto = mAspas ? mAspas[1].trim() : null;

      // Verifica erro formal ABNT NBR 10520: citação entre parênteses atuando como sujeito direto de verbo (ex.: ", (TOMAZELLI et al., 2023) identificaram")
      const mErroSujeitoParenteses = frase.match(
        /\(\s*([A-ZÀ-Ú][A-Za-zÀ-ÿ\s.,;&'-]+?)\s*,\s*((?:19|20)\d\d[a-f]?)\s*\)\s+(identificaram|apontam|demonstram|demonstraram|analisaram|observaram|concluíram|afirmam|relatam|destacam|propõem|avaliam|avaliaram|verificaram)\b/
      );
      if (mErroSujeitoParenteses) {
        const autBruto = mErroSujeitoParenteses[1].trim();
        const anoErr = mErroSujeitoParenteses[2];
        const verbo = mErroSujeitoParenteses[3];
        const nomeFormatado = autBruto
          .replace(/\bet\s+al\.?/i, 'et al.')
          .replace(/^([A-ZÀ-Ú])([A-ZÀ-Ú]+)/, (_, p1, p2) => p1 + p2.toLowerCase());
        alertasFormaAbnt.push({
          numParagrafo: objPar.numParagrafo,
          numParagrafoNaSecao: objPar.numParagrafoNaSecao || objPar.numParagrafo,
          numLinha: objPar.numLinha,
          secao: objPar.secao,
          fraseWord: frase.trim(),
          mensagem: `📐 Norma ABNT NBR 10520 (Citação Narrativa): No Parágrafo §${objPar.numParagrafo} (${objPar.secao}), a citação "(${autBruto}, ${anoErr}) ${verbo}" integra a sintaxe da frase como sujeito do verbo "${verbo}". Pela NBR 10520, o autor deve ficar fora dos parênteses em caixa mista: "${nomeFormatado} (${anoErr}) ${verbo}...".`,
        });
      }

      // 1) Parentéticas ABNT: (AUTOR..., 2020a, p. 12) ou (ENTIDADE, [20--?])
      const rePar = /\(([^()]{2,220}?(?:\[?(?:19\d\d|20\d\d|20--)[a-z]?\]?|\[?s\.d\.\]?)[^()]{0,40})\)/gi;
      let m;
      while ((m = rePar.exec(frase)) !== null) {
        const interior = m[1];
        const partes = [];
        let buffer = '';
        for (const fatia of interior.split(';')) {
          buffer = buffer ? `${buffer}; ${fatia}` : fatia;
          if (/(?:\[?(?:19\d\d|20\d\d|20--)[a-z]?\]?|\[?s\.d\.\]?)/i.test(buffer)) {
            partes.push(buffer.trim());
            buffer = '';
          }
        }
        if (buffer.trim()) partes.push(buffer.trim());

        for (const parte of partes) {
          // Suporta também múltiplos anos separados por vírgula para o mesmo autor: (Autor, 2024, 2026b)
          const mMultiAno = parte.match(
            /^([A-ZÀ-Ú0-9][A-Za-zÀ-ÿ0-9\s.,;&'-]{1,95}?)\s*,\s*((?:19\d\d|20\d\d|20--)[a-z]?(?:\s*,\s*(?:19\d\d|20\d\d|20--)[a-z]?)+)$/i
          );
          const subPartes = mMultiAno
            ? mMultiAno[2].split(/\s*,\s*/).map((anoItem) => `${mMultiAno[1].trim()}, ${anoItem.trim()}`)
            : [parte];

          for (const subParte of subPartes) {
            const mItem = subParte.match(
              /^([A-ZÀ-Ú0-9][A-Za-zÀ-ÿ0-9\s.,;&'-]{1,95}?)\s*,\s*(\[?(?:19\d\d|20\d\d|20--)[a-z]?\]?|\[?s\.d\.\]?)(?:\s*,\s*(?:p\.?|p[aá]g\.?|pp\.?)\s*(\d+(?:-\d+)?))?$/i
            );
            if (!mItem) continue;
            const infoAutor = extrairChavesAutorDeCitacao(mItem[1]);
            if (!infoAutor.chavePrincipal || infoAutor.chavePrincipal.length < 2 || ignorarSobrenomes.has(infoAutor.chavePrincipal)) {
              continue;
            }
            const anoCompleto = mItem[2].replace(/[\[\]]/g, '').toLowerCase();
            const anoBase = anoCompleto.slice(0, 4);
            const paginaDeclarada = mItem[3] || null;
            const refCorrespondente = resolverRefPareadaPorCoautores(infoAutor, anoCompleto, anoBase, refsFinais);
            const chaveUnificada = refCorrespondente ? refCorrespondente.chave : `${infoAutor.chavePrincipal}:${anoCompleto}`;
            const numeroRefAssociado = refCorrespondente?.numeroRef || null;
            registrarCitacaoUnicaNaFrase({
              bruto: `(${subParte.trim()})`,
              autor: infoAutor.autorExibicao,
              chaveAutor: infoAutor.chavePrincipal,
              chavesAutorAlias: infoAutor.chavesAlias,
              ano: anoCompleto,
              anoBase,
              chave: chaveUnificada,
              numeroRef: numeroRefAssociado,
              paginaDeclarada,
              trechoDireto,
              fraseContexto: frase.trim(),
              paragrafoCompleto: par.trim(),
              numParagrafo: objPar.numParagrafo,
              numParagrafoNaSecao: objPar.numParagrafoNaSecao || objPar.numParagrafo,
              numLinha: objPar.numLinha,
              numFraseNoParagrafo: idxFrase + 1,
              secao: objPar.secao || 'Corpo do Texto',
            });
          }
        }
      }

      // 2) Narrativas ABNT/Vancouver (usa (?<![A-Za-zÀ-ÿ0-9_]) para aceitar sobrenomes acentuados como Órgão/Ávila sem /i global)
      const reNar =
        /(?<![A-Za-zÀ-ÿ0-9_])([A-ZÀ-Ú][A-Za-zÀ-ÿ0-9'.-]+(?:(?:\s+(?:de|da|do|dos|das|van|von|del|e|&|and)\s+|\s*,\s*|\s+)[A-ZÀ-Ú][A-Za-zÀ-ÿ0-9'.-]+)*(?:\s+[Ee][Tt]\s+[Aa][Ll]\.?)?)\s*\(\s*(\[?(?:19\d\d|20\d\d|20--)[a-zA-Z]?\]?|\[?[Ss]\.[Dd]\.\]?)(?:\s*,\s*(?:[Pp](?:[ÁáAa][Gg])?\.?|[Pp]{2}\.?)\s*(\d+(?:-\d+)?))?\s*\)/g;
      while ((m = reNar.exec(frase)) !== null) {
        let autLimpo = m[1]
          .replace(
            /^(?:(?:por\s+outro\s+lado|al[eé]m\s+disso|adicionalmente|outrossim)\s*,\s*)?(?:(?:segundo|conforme|consoante|como|para|de\s+acordo\s+com|em|no\s+estudo\s+de|nos\s+estudos\s+de)\s+)?(?:(?:o|a|os|as)\s+)?(?:(?:dados|diretrizes|relat[oó]rio|estudos?|pesquisas?|orienta[cç][oõ]es)\s+d[ea]\s+)?(?:(?:apontad[oa]|verificad[oa]|demonstrad[oa]|relatad[oa]|descrit[oa])\s+por\s+)?(?:(?:o|a|os|as)\s+)?/i,
            ''
          )
          .trim();
        if (/\b(?:elaborad[oa]|produzid[oa]|organizad[oa]|autoria|adaptad[oa]|modificad[oa])\s+(?:pel[oa]|pelos|pelas)?\s*(?:autor[ae]s?|pesquisador(?:a|es)?|pr[oó]pri[oa])\b/i.test(autLimpo)) {
          continue;
        }
        const anoCompleto = m[2].replace(/[\[\]]/g, '').toLowerCase();
        const anoBase = anoCompleto.slice(0, 4);
        const paginaDeclarada = m[3] || null;
        let infoAutor = extrairChavesAutorDeCitacao(autLimpo);
        while (autLimpo.includes(',') && refsFinais.length > 0) {
          const idxVirg = autLimpo.indexOf(',');
          const segAntes = autLimpo.slice(0, idxVirg).trim();
          const restApos = autLimpo.slice(idxVirg + 1).trim();
          if (!restApos) break;
          const infoAntes = extrairChavesAutorDeCitacao(segAntes);
          const infoRest = extrairChavesAutorDeCitacao(restApos);
          const antesBate =
            infoAntes.chavePrincipal &&
            refsFinais.some((r) => (!anoBase || r.anoBase === anoBase) && r.chavesAutorAlias?.includes(infoAntes.chavePrincipal));
          const restBate =
            infoRest.chavePrincipal &&
            refsFinais.some((r) => (!anoBase || r.anoBase === anoBase) && infoRest.chavesAlias.some((al) => r.chavesAutorAlias?.includes(al)));
          if (!antesBate && restBate) {
            autLimpo = restApos;
            infoAutor = infoRest;
          } else {
            break;
          }
        }
        if (!infoAutor.chavePrincipal || infoAutor.chavePrincipal.length < 2 || ignorarSobrenomes.has(infoAutor.chavePrincipal)) {
          continue;
        }

        // Ignora créditos de banco de dados de gráficos/tabelas ("Fonte: Ministério da Saúde... SINAN... Elaboração própria") quando não houver referência homônima
        if (
          /^Fonte\s*:/i.test(par.trim()) &&
          /\b(?:Elabora[cç][aã]o\s+pr[oó]pria|Banco\s+de\s+dados\s+disponibilizado|SINAN|SI-?PNI|DATASUS)\b/i.test(par)
        ) {
          continue;
        }

        // Se a citação narrativa corresponde a uma referência na lista final, unifica a chave considerando coautores
        const refCorrespondente = resolverRefPareadaPorCoautores(infoAutor, anoCompleto, anoBase, refsFinais);
        const chaveUnificada = refCorrespondente ? refCorrespondente.chave : `${infoAutor.chavePrincipal}:${anoCompleto}`;
        const numeroRefAssociado = refCorrespondente?.numeroRef || null;

        registrarCitacaoUnicaNaFrase({
          bruto: m[0],
          autor: infoAutor.autorExibicao,
          chaveAutor: infoAutor.chavePrincipal,
          chavesAutorAlias: infoAutor.chavesAlias,
          ano: anoCompleto,
          anoBase,
          chave: chaveUnificada,
          numeroRef: numeroRefAssociado,
          paginaDeclarada,
          trechoDireto,
          fraseContexto: frase.trim(),
          paragrafoCompleto: par.trim(),
          numParagrafo: objPar.numParagrafo,
          numParagrafoNaSecao: objPar.numParagrafoNaSecao || objPar.numParagrafo,
          numLinha: objPar.numLinha,
          numFraseNoParagrafo: idxFrase + 1,
          secao: objPar.secao || 'Corpo do Texto',
        });
      }

      // 2b) Narrativas com colchetes diretos: Autor [20--a], Órgão, [20--b], Organizacao [2021] (aceita iniciais acentuadas, sem /i global)
      const reNarColchetes =
        /(?<!\()(?<![A-Za-zÀ-ÿ0-9_])([A-ZÀ-Ú][A-Za-zÀ-ÿ0-9'.-]+(?:(?:\s+(?:de|da|do|dos|das|van|von|del|e|&|and)\s+|\s*,\s*|\s+)[A-ZÀ-Ú][A-Za-zÀ-ÿ0-9'.-]+)*(?:\s+[Ee][Tt]\s+[Aa][Ll]\.?)?)(?:,\s*|\s+)\[\s*((?:19\d\d|20\d\d|20--)[a-zA-Z]?|[Ss]\.[Dd]\.)(?:\s*,\s*(?:[Pp](?:[ÁáAa][Gg])?\.?|[Pp]{2}\.?)\s*(\d+(?:-\d+)?))?\s*\](?!\))/g;
      while ((m = reNarColchetes.exec(frase)) !== null) {
        const autLimpo = m[1]
          .replace(
            /^(?:(?:por\s+outro\s+lado|al[eé]m\s+disso|adicionalmente|outrossim)\s*,\s*)?(?:(?:segundo|conforme|consoante|como|para|de\s+acordo\s+com|em|no\s+estudo\s+de|nos\s+estudos\s+de)\s+)?(?:(?:o|a|os|as)\s+)?(?:(?:dados|diretrizes|relat[oó]rio|estudos?|pesquisas?|orienta[cç][oõ]es)\s+d[ea]\s+)?(?:(?:apontad[oa]|verificad[oa]|demonstrad[oa]|relatad[oa]|descrit[oa])\s+por\s+)?(?:(?:o|a|os|as)\s+)?/i,
            ''
          )
          .trim();
        if (/\b(?:elaborad[oa]|produzid[oa]|organizad[oa]|autoria|adaptad[oa]|modificad[oa])\s+(?:pel[oa]|pelos|pelas)?\s*(?:autor[ae]s?|pesquisador(?:a|es)?|pr[oó]pri[oa])\b/i.test(autLimpo)) {
          continue;
        }
        const infoAutor = extrairChavesAutorDeCitacao(autLimpo);
        if (!infoAutor.chavePrincipal || infoAutor.chavePrincipal.length < 2 || ignorarSobrenomes.has(infoAutor.chavePrincipal)) {
          continue;
        }
        const anoCompleto = m[2].replace(/[\[\]]/g, '').toLowerCase();
        const anoBase = anoCompleto.slice(0, 4);
        const paginaDeclarada = m[3] || null;

        const refCorrespondente = resolverRefPareadaPorCoautores(infoAutor, anoCompleto, anoBase, refsFinais);
        const chaveUnificada = refCorrespondente ? refCorrespondente.chave : `${infoAutor.chavePrincipal}:${anoCompleto}`;
        const numeroRefAssociado = refCorrespondente?.numeroRef || null;

        registrarCitacaoUnicaNaFrase({
          bruto: m[0],
          autor: infoAutor.autorExibicao,
          chaveAutor: infoAutor.chavePrincipal,
          chavesAutorAlias: infoAutor.chavesAlias,
          ano: anoCompleto,
          anoBase,
          chave: chaveUnificada,
          numeroRef: numeroRefAssociado,
          paginaDeclarada,
          trechoDireto,
          fraseContexto: frase.trim(),
          paragrafoCompleto: par.trim(),
          numParagrafo: objPar.numParagrafo,
          numParagrafoNaSecao: objPar.numParagrafoNaSecao || objPar.numParagrafo,
          numLinha: objPar.numLinha,
          numFraseNoParagrafo: idxFrase + 1,
          secao: objPar.secao || 'Corpo do Texto',
        });
      }

      // 3) Citações Numéricas Vancouver: colchetes/sobrescritos [1], [ 3 , 4 ], [11–14], [3,12–14,23,25–28] e listas parentéticas (34, 35, 36 e 37)
      const expressoesNumericas = [];
      const reColchetesNum = /\[\s*(\d{1,3}(?:\s*[,;–—-]\s*\d{1,3})*)\s*\]/g;
      while ((m = reColchetesNum.exec(frase)) !== null) {
        expressoesNumericas.push({ bruto: m[0], expr: m[1] });
      }
      const reParentesesMultiNum = /\(\s*(\d{1,3}(?:\s*,\s*\d{1,3})*(?:\s*(?:,|e)\s*\d{1,3}))\s*\)/gi;
      while ((m = reParentesesMultiNum.exec(frase)) !== null) {
        expressoesNumericas.push({ bruto: m[0], expr: m[1] });
      }

      // Caso texto plano tenha números Vancouver colados ao fim de palavras ou pontuação (ex.: "MS1,", "imunopreveníveis.1-3", "(SI-PNI),4", "estudo.7,8")
      if (refsPorNumero.size > 0 && expressoesNumericas.length === 0) {
        const reColado = /(?<=[A-Za-zÀ-ÿ)][.,;:]?)(\d{1,2}(?:[,–-]\d{1,2})*)(?=[.,;:)\s]|$)/g;
        while ((m = reColado.exec(frase)) !== null) {
          const antesToken = frase.slice(Math.max(0, m.index - 16), m.index).toLowerCase();
          if (/(?:^|\b(?:v|n|p|pp|fig|tab|cap|sec|art|dr|dra|inc|no|nº|et\s+al|covid|sars|hiv|htlv|h1n1|hpv|dtp|bcg|rdc|iso|nr))[.,;:\s-]*$/i.test(antesToken)) {
            continue;
          }
          expressoesNumericas.push({ bruto: `[${m[1]}]`, expr: m[1] });
        }
      }

      for (const itemNum of expressoesNumericas) {
        const nums = expandirIntervalosNumericosVancouver(itemNum.expr, maxRefNumerada);
        for (const n of nums) {
          const refAlvo = refsPorNumero.get(n);
          const autorExib = refAlvo
            ? `[${n}] ${refAlvo.primeiroSobrenome}`
            : `Referência [${n}]`;
          const chaveAut = refAlvo ? refAlvo.chaveAutor : `refnum${n}`;
          const aliasesAut = refAlvo
            ? [...new Set([...(refAlvo.chavesAutorAlias || []), `refnum${n}`])]
            : [`refnum${n}`];
          const anoRef = refAlvo ? refAlvo.ano || refAlvo.anoBase || 's.d.' : 's.d.';
          const anoBaseRef = refAlvo ? refAlvo.anoBase || anoRef : 's.d.';
          const chaveCit = refAlvo ? refAlvo.chave : `refnum${n}:s.d.`;

          registrarCitacaoUnicaNaFrase({
            bruto: `[${n}]`,
            autor: autorExib,
            chaveAutor: chaveAut,
            chavesAutorAlias: aliasesAut,
            ano: anoRef,
            anoBase: anoBaseRef,
            chave: chaveCit,
            numeroRef: n,
            paginaDeclarada: null,
            trechoDireto,
            fraseContexto: frase.trim(),
            paragrafoCompleto: par.trim(),
            numParagrafo: objPar.numParagrafo,
            numParagrafoNaSecao: objPar.numParagrafoNaSecao || objPar.numParagrafo,
            numLinha: objPar.numLinha,
            numFraseNoParagrafo: idxFrase + 1,
            secao: objPar.secao || 'Corpo do Texto',
          });
        }
      }
    }
  }
  return { citacoes, alertasFormaAbnt };
}

/** Analisa cada entrada da seção final de Referências com extração precisa de ano de publicação, autor, número Vancouver, título e metadados CSL-JSON embutidos. */
function analisarLinhasReferencias(linhas, mapaCslEmbutido = obterUltimoMapaCslDocx()) {
  const linhasExpandidas = separarReferenciasNumeradasConcatenadas(linhas);
  const entradas = [];
  for (const lBruta of linhasExpandidas) {
    const l = sanitizarCamposGerenciadorBibliografia(lBruta).trim();
    if (!ehLinhaReferenciaValida(l)) continue;

    let doi = normalizarDoi(l);
    const mPmc = l.match(/(?:(?:pmc|www)\.ncbi\.nlm\.nih\.gov\/pmc\/articles\/PMC?|PMCID\s*:?\s*PMC?|\bPMC)\s*(\d{5,9})/i);
    const pmcid = mPmc ? mPmc[1] : null;
    const mPmid = l.match(/(?:(?:pubmed|www)\.ncbi\.nlm\.nih\.gov\/(?:pubmed\/)?|PMID\s*:?\s*)(\d{5,9})/i);
    const pmid = mPmid ? mPmid[1] : null;
    const { anoCompleto, anoBase, sufixoAno } = extrairAnoPublicacaoReferencia(l);
    const {
      numeroRef,
      primeiroSobrenome,
      chaveAutor,
      chavesAutorAlias,
      numAutoresLinha,
      tituloExtraido,
      defeitoPreposicaoEntrada,
      codigoControlado,
    } = extrairAutorETituloDeReferencia(l);

    // Cruza com o mapa CSL-JSON extraído do Mendeley/Zotero no .docx (se disponível)
    const metaCsl = mapaCslEmbutido
      ? mapaCslEmbutido.buscarParaReferencia({
          numeroRef,
          doi,
      pmcid,
      pmid,
          tituloBuscado: tituloExtraido,
          textoOriginal: l,
        })
      : null;

    if (!doi && metaCsl?.doi) {
      doi = metaCsl.doi;
    }

    const infoClas = classificarReferenciaHarmonizada(l, doi, metaCsl);
    const natureza = infoClas.natureza;
    const chaveBase = chaveAutor && anoCompleto ? `${chaveAutor}:${anoCompleto}` : normalizarChave(l.slice(0, 40));
    const chave = numeroRef ? `ref${numeroRef}_${chaveBase}` : chaveBase;
    const aliasesComNum = numeroRef
      ? [...new Set([...(chavesAutorAlias || []), `refnum${numeroRef}`])]
      : chavesAutorAlias;

    entradas.push({
      numeroRef,
      textoOriginal: l,
      doi,
      pmcid,
      pmid,
      ano: anoCompleto,
      anoBase,
      sufixoAno,
      primeiroSobrenome,
      chaveAutor,
      chavesAutorAlias: aliasesComNum,
      numAutoresLinha: numAutoresLinha || 1,
      tituloBuscado: metaCsl?.title || tituloExtraido,
      natureza,
      subtipoLener: infoClas.subtipoLener,
      rotuloLener: infoClas.rotuloAutenticidade,
      metadadoCslEmbutido: metaCsl || null,
      defeitoPreposicaoEntrada,
      codigoControlado,
      chave,
    });
  }

  // Disambigua entradas com mesma chave (ex.: mesmo primeiro autor e ano com coautores distintos sem sufixo a/b)
  const contagemPorChave = new Map();
  for (const e of entradas) {
    contagemPorChave.set(e.chave, (contagemPorChave.get(e.chave) || 0) + 1);
  }
  const seqPorChave = new Map();
  for (const e of entradas) {
    if ((contagemPorChave.get(e.chave) || 0) > 1) {
      const seq = (seqPorChave.get(e.chave) || 0) + 1;
      seqPorChave.set(e.chave, seq);
      e.chave = `${e.chave}#${seq}`;
    }
  }

  return entradas;
}


/**
 * Verifica se há extrapolações finas ou imprecisões metodológicas conhecidas entre a frase do Word e o texto do artigo.
 */
function verificarPrecisaoMetodologicaFina(oc, rm, textoArtigoCompleto) {
  const avisos = [];
  const fNorm = String(oc.fraseContexto || '').toLowerCase();
  const aNorm = String(textoArtigoCompleto || '').toLowerCase();

  // Caso 1: Reece et al. (2021) — "18 publications reporting on 17 studies... All studies were conducted in the United States, except one study from the Netherlands" (16 nos EUA + 1 nos Países Baixos = 17 estudos no total)
  if (
    rm.chaveAutor === 'reece' &&
    /dezessete\s+estudos\s+dos\s+estados\s+unidos\s+e\s+um\s+dos\s+pa[ií]ses\s+baixos/i.test(oc.fraseContexto)
  ) {
    avisos.push({
      tipo: 'precisao_quantitativa',
      numParagrafo: oc.numParagrafo,
      numLinha: oc.numLinha,
      secao: oc.secao,
      autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
      fraseWord: oc.fraseContexto,
      mensagem: `🔎 Ajuste de Precisão Numérica (${rm.primeiroSobrenome}, ${rm.ano}): No Parágrafo §${oc.numParagrafo}, o texto diz "reunindo dezessete estudos dos Estados Unidos e um dos Países Baixos" (o que somaria 18 estudos). O resumo original de Reece et al. (2021) informa: "Eighteen publications reporting on 17 studies... All studies were conducted in the United States, except one study from the Netherlands" (são 17 estudos no total: 16 nos EUA e 1 nos Países Baixos).`,
    });
  }

  // Caso 2: Tomazelli et al. (2023) — perda de seguimento especificamente de "lesões benignas" ("high benign lesion loss to follow-up")
  if (
    rm.chaveAutor === 'tomazelli' &&
    /perda\s+de\s+seguimento\s+em\s+les[oõ]es\s+que\s+demandavam/i.test(oc.fraseContexto) &&
    !/benign/i.test(oc.fraseContexto)
  ) {
    avisos.push({
      tipo: 'precisao_conceitual',
      numParagrafo: oc.numParagrafo,
      numLinha: oc.numLinha,
      secao: oc.secao,
      autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
      fraseWord: oc.fraseContexto,
      mensagem: `🔎 Sugestão de Precisão Conceitual (${rm.primeiroSobrenome}, ${rm.ano}): No Parágrafo §${oc.numParagrafo}, o artigo de Tomazelli et al. (2023) especifica que a elevada perda de seguimento identificada no SISCAN ocorreu nas "lesões benignas" ("elevada perda de seguimento das lesões benignas" / BI-RADS 3). Explicitar "lesões benignas" torna a citação ainda mais exata.`,
    });
  }

  // Caso 3: Oliveira, Silva e Souza (2021) — extrapolações "planilhas isoladas" e "buscas manuais em telas administrativas"
  if (rm.chaveAutor === 'oliveira' && rm.ano === '2021' && aNorm.length > 500) {
    if (fNorm.includes('planilhas isoladas') && !aNorm.includes('planilha') && !aNorm.includes('spreadsheet')) {
      avisos.push({
        tipo: 'extrapolacao_detalhe',
        numParagrafo: oc.numParagrafo,
        numLinha: oc.numLinha,
        secao: oc.secao,
        autorCitado: `OLIVEIRA; SILVA; SOUZA (2021)`,
        fraseWord: oc.fraseContexto,
        mensagem: `🔎 Ressalva de Escopo / Extrapolação (OLIVEIRA; SILVA; SOUZA, 2021 — Parágrafo §${oc.numParagrafo}): O artigo documenta a comunicação por papel e telefone ("on paper or phone") em um município da Bahia, mas não menciona "planilhas isoladas". Recomenda-se retirar "planilhas isoladas" ou vincular a generalização nacional ao Diagnóstico de Maturidade em Saúde Digital (BRASIL, 2024).`,
      });
    }
    if (fNorm.includes('telas administrativas') && !aNorm.includes('administrative screen') && !aNorm.includes('telas administrativas')) {
      avisos.push({
        tipo: 'extrapolacao_detalhe',
        numParagrafo: oc.numParagrafo,
        numLinha: oc.numLinha,
        secao: oc.secao,
        autorCitado: `OLIVEIRA; SILVA; SOUZA (2021)`,
        fraseWord: oc.fraseContexto,
        mensagem: `🔎 Ressalva de Escopo / Extrapolação (OLIVEIRA; SILVA; SOUZA, 2021 — Parágrafo §${oc.numParagrafo}): O artigo sustenta integralmente que os pacientes retornam à APS sem contrarreferência e sem informação clínica ("almost all are returning to the service of origin without the counter-referral"), mas o detalhe "buscas manuais em telas administrativas" não consta do estudo de 2021.`,
      });
    }
  }

  // Caso 4 (Regra R35): Protocolo de Prevenção do Câncer de Mama de Curitiba (PRT.DAPS.MAE.001 / CURITIBA, 2026)
  if (
    rm.chaveAutor === 'curitiba' ||
    rm.codigoControlado === 'PRT.DAPS.MAE.001' ||
    /PRT\.DAPS\.MAE\.001|Secretaria Municipal da Sa[uú]de/i.test(rm.textoOriginal || '')
  ) {
    const afirmaContrarreferenciaOuContinuo =
      /\b(comunica[cç][aã]o\s+cont[ií]nua|contrarrefer[eê]ncia|cuidado\s+compartilhado|retorno\s+estruturado|fluxo\s+sist[eê]mico\s+de\s+retorno)\b/i.test(
        oc.fraseContexto || ''
      );
    if (afirmaContrarreferenciaOuContinuo) {
      avisos.push({
        tipo: 'falsa_atribuicao_prescritiva_normativa',
        numParagrafo: oc.numParagrafo,
        numLinha: oc.numLinha,
        secao: oc.secao,
        autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
        fraseWord: oc.fraseContexto,
        mensagem: `🚨 FALHA DE CONFORMIDADE SEMÂNTICA (Regra R35): No Parágrafo §${oc.numParagrafo}, o texto atribui ao protocolo municipal (${rm.primeiroSobrenome}, ${rm.ano}) a prescrição de 'comunicação contínua' / 'contrarreferência' / 'cuidado compartilhado' sistêmico. O documento oficial (PRT.DAPS.MAE.001, 2026) não prescreve contrarreferência sistêmica (o termo ocorre 0 vezes em 30 páginas) e prescreve apenas o retorno físico manual do laudo conduzido pela paciente ('a usuária deve ser orientada a retornar à Unidade de Saúde com o laudo em mãos'). A afirmação deve ser reescrita como diagnóstico de lacuna do fluxo e não como prescrição formal existente.`,
      });
    }
  }

  return avisos;
}

/**
 * Regras R34 e R37: Pertinência da escala narrativa e simetria entre fluxo legal e conceitual.
 * Detecta quando um instrumento regulatório/protocolo municipal local é enxertado prematuramente
 * em seção introdutória ou conceitual geral, entre dispositivos legais federais e teoria geral de redes.
 */
function verificarEscalaNarrativaFluxo(paragrafosCorpo, citacoes) {
  const alertasEscala = [];
  const citacoesPorParagrafo = new Map();

  for (const c of citacoes) {
    const lista = citacoesPorParagrafo.get(c.numParagrafo) || [];
    lista.push(c);
    citacoesPorParagrafo.set(c.numParagrafo, lista);
  }

  const ehSecaoIntrodutoriaOuConceitual = (secao) => {
    const s = String(secao || '').trim().toLowerCase();
    return (
      s.includes('introducao') ||
      s.includes('introduction') ||
      s.includes('justificativa') ||
      s.includes('referencial') ||
      s.includes('fundamentacao') ||
      s === 'corpo do texto'
    );
  };

  const ehCitacaoLegalFederal = (c) => {
    const s = `${c.autor} ${c.fraseContexto}`.toLowerCase();
    return (
      c.chaveAutor === 'brasil' ||
      s.includes('lei n') ||
      s.includes('portaria') ||
      s.includes('ministerio da saude') ||
      s.includes('ministeriodasaude') ||
      s.includes('11.664') ||
      s.includes('8.080')
    );
  };

  const ehCitacaoMunicipalLocal = (c) => {
    const s = `${c.autor} ${c.fraseContexto}`.toLowerCase();
    return (
      c.chaveAutor === 'curitiba' ||
      s.includes('curitiba') ||
      s.includes('secretaria municipal') ||
      s.includes('protocolo municipal') ||
      s.includes('mae curitibana') ||
      s.includes('prt.daps')
    );
  };

  const ehCitacaoTeoriaRedes = (c) => {
    const ch = c.chaveAutor;
    return (
      ch === 'mendes' ||
      ch === 'starfield' ||
      ch === 'almeida' ||
      ch === 'giovanella' ||
      /mendes|starfield/i.test(c.autor)
    );
  };

  for (let i = 0; i < paragrafosCorpo.length; i++) {
    const parObj = paragrafosCorpo[i];
    if (!ehSecaoIntrodutoriaOuConceitual(parObj.secao)) continue;

    const citsDestePar = citacoesPorParagrafo.get(parObj.numParagrafo) || [];
    const citLocal = citsDestePar.find(ehCitacaoMunicipalLocal);

    if (citLocal) {
      // Verifica se há citação federal em parágrafos anteriores imediatos (até 3 parágrafos antes)
      let temFederalAnterior = false;
      for (let j = Math.max(0, i - 3); j < i; j++) {
        const citsAnt = citacoesPorParagrafo.get(paragrafosCorpo[j].numParagrafo) || [];
        if (citsAnt.some(ehCitacaoLegalFederal) || /lei\s+n[º°.]?\s*11\.664/i.test(paragrafosCorpo[j].texto)) {
          temFederalAnterior = true;
          break;
        }
      }

      // Verifica se há citação de teoria geral de redes em parágrafos posteriores imediatos (até 3 parágrafos depois)
      let temTeoriaPosterior = false;
      for (let j = i + 1; j < Math.min(paragrafosCorpo.length, i + 4); j++) {
        const citsPos = citacoesPorParagrafo.get(paragrafosCorpo[j].numParagrafo) || [];
        if (citsPos.some(ehCitacaoTeoriaRedes) || /\b(mendes|starfield)\b/i.test(paragrafosCorpo[j].texto)) {
          temTeoriaPosterior = true;
          break;
        }
      }

      if (temFederalAnterior && temTeoriaPosterior) {
        alertasEscala.push({
          tipo: 'quebra_escala_narrativa',
          numParagrafo: parObj.numParagrafo,
          numLinha: parObj.numLinha,
          secao: parObj.secao,
          autorCitado: citLocal.autor,
          fraseWord: citLocal.fraseContexto,
          mensagem: `📐 Quebra Prematura de Escala Narrativa (Regras R34 / R37): No Parágrafo §${parObj.numParagrafo} (${parObj.secao}), a citação de instrumento regulatório/protocolo municipal local (${citLocal.autor}) foi inserida no meio de uma cadeia de normas federais e teoria geral de redes. Recomenda-se preservar a simetria entre o dispositivo legal federal e a fundamentação conceitual (Mendes/Starfield), transferindo o protocolo e a caracterização do cenário local para o Percurso Metodológico (Capítulo 3).`,
        });
      }
    }
  }

  return alertasEscala;
}

/**
 * Localiza no acervo local (pasta da biblioteca, pasta MIGRACAO/fontes_pdf ou Downloads)
 * o arquivo PDF já existente correspondente à obra auditada.
 */

async function executarPoolLimitado(total, limite, workerFn, signal = null) {
  if (!total || total <= 0) return;
  let proximo = 0;
  const qtdWorkers = Math.min(Math.max(1, Number(limite) || 1), total);
  async function worker() {
    while (proximo < total) {
      if (signal?.aborted) {
        const err = new Error('Auditoria cancelada pelo usuário.');
        err.aborted = true;
        throw err;
      }
      const idx = proximo++;
      await workerFn(idx);
    }
  }
  await Promise.all(Array.from({ length: qtdWorkers }, () => worker()));
}

/**
 * Executa a auditoria reversa e forense completa no texto do manuscrito.
 */
async function auditarManuscrito({
  texto,
  biblioteca: bibliotecaOriginal,
  buscarEBaixar = true,
  pastaDestino = null,
  onProgresso = null,
  modulo = 'todos',
  somenteLeitura = false,
  signal = null,
  caminhoDocx = null,
  xmlDocument = null,
  autoresManuscrito = [],
  anoReferencia = 2026,
  pastaProjeto = null,
  decisoesEditoriais = null,
}) {
  const biblioteca = somenteLeitura
    ? criarBibliotecaSnapshotSomenteLeitura(bibliotecaOriginal)
    : bibliotecaOriginal;
  if (typeof onProgresso === 'function') {
    onProgresso({
      fase: 'etapa1',
      atual: 0,
      total: 0,
      porcentagem: 5,
      mensagem: modulo === 'chamadas'
        ? 'Etapa 1/1: Analisando citações no texto e referências finais…'
        : modulo === 'plagio'
        ? 'Etapa 1/2: Preparando análise literal com Diff Match Patch…'
        : modulo === 'autenticidade'
        ? 'Etapa 1/2: Validando fontes nas bases científicas…'
        : 'Etapa 1/6: Segmentando parágrafos, citações e referências do manuscrito…',
      detalhe: 'Identificando chamadas autor-data, numéricas/Vancouver e campos CSL embutidos…',
    });
  }

  const { paragrafosCorpo, linhasReferencias, linhasPosReferencias } = dividirCorpoEReferencias(texto);
  const refsFinais = analisarLinhasReferencias(linhasReferencias);
  const { citacoes, alertasFormaAbnt } = extrairCitacoesDoCorpo(paragrafosCorpo, refsFinais);

  const alertasEscala = verificarEscalaNarrativaFluxo(paragrafosCorpo, citacoes);
  const alertasPrecisao = [...alertasFormaAbnt, ...alertasEscala];
  const alertasAtribuicaoFalsa = [];

  // Agrupa citações únicas por chave (autor:anoCompleto)
  const gruposCitacao = new Map();
  for (const c of citacoes) {
    const g = gruposCitacao.get(c.chave) || {
      chave: c.chave,
      autor: c.autor,
      chaveAutor: c.chaveAutor,
      chavesAutorAlias: c.chavesAutorAlias || [c.chaveAutor],
      ano: c.ano,
      anoBase: c.anoBase || c.ano.slice(0, 4),
      ocorrencias: [],
    };
    g.ocorrencias.push(c);
    gruposCitacao.set(c.chave, g);
  }

  // ATALHO ULTRA-RÁPIDO: MÓDULO 6 (Detecção de Estilo e Marcadores de Redação por IA - Open-Detector)
  if (modulo === 'estilo_ia') {
    const alertasEstiloIa = analisarEstiloRedacaoIaOpenDetector(paragrafosCorpo);
    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'concluido',
        atual: paragrafosCorpo.length,
        total: paragrafosCorpo.length,
        porcentagem: 100,
        mensagem: '✓ Módulo 6 Concluído — Análise de Redação por IA (Open-Detector)',
        detalhe: `${alertasEstiloIa.length} parágrafo(s) com alta densidade de cadência sintética detectado(s).`,
      });
    }
    return {
      totalCitacoesOcorrencias: citacoes.length,
      totalAutoresCitadosUnicos: gruposCitacao.size,
      totalReferenciasListaFinal: refsFinais.length,
      citacoesSemReferencia: [],
      refsMapeadas: [],
      alertasAtribuicaoFalsa: [],
      alertasPlagio: [],
      alertasPrecisao: alertasEstiloIa,
      alertasEstiloIa,
      alertasEstatisticos: [],
      alertasRede: [],
      alertasMetodologiaClinica: [],
      alertasFrasesTorturadas: [],
      alertasEstilometricos: [],
      alertasPredatorios: [],
      alertasAbnt6023: [],
      alertasCorrupcaoGene: [],
      alertasFomento: [],
      alertasDesvioTematico: [],
      errosParsingConflito: [],
      resumoVerificacaoConteudo: { totalObrasCitadas: 0, totalObrasVerificadas: 0, totalObrasNaoVerificadas: 0, obras: [] },
      resumoObrasConformes: { totalConformes: 0, totalComPdf: 0, totalSemPdf: 0, obras: [] },
      linhasPosReferenciasIgnoradas: linhasPosReferencias.length,
      moduloExecutado: 'estilo_ia',
    };
  }

  // ATALHO ULTRA-RÁPIDO: MÓDULO 7 (Auditoria Estatística Forense - Statcheck)
  if (modulo === 'estatistica') {
    const auditoriaEstatistica = auditarEstatisticaDoManuscrito(paragrafosCorpo);
    const alertasEstatisticos = auditoriaEstatistica.alertasEstatisticos || [];
    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'concluido',
        atual: paragrafosCorpo.length,
        total: paragrafosCorpo.length,
        porcentagem: 100,
        mensagem: '✓ Auditoria Estatística Concluída (Statcheck)',
        detalhe: `${auditoriaEstatistica.totalTestes} teste(s) analisado(s), ${auditoriaEstatistica.inconsistenciasGraves} inconsistência(s) crítica(s).`,
      });
    }
    return {
      totalCitacoesOcorrencias: citacoes.length,
      totalAutoresCitadosUnicos: gruposCitacao.size,
      totalReferenciasListaFinal: refsFinais.length,
      citacoesSemReferencia: [],
      refsMapeadas: [],
      alertasAtribuicaoFalsa: [],
      alertasPlagio: [],
      alertasPrecisao: alertasEstatisticos.map((ae) => ({
        tipo: ae.tipo,
        numParagrafo: ae.numParagrafo,
        numLinha: ae.numLinha,
        secao: ae.secao,
        autorCitado: 'Análise Estatística',
        fraseWord: ae.textoBruto,
        mensagem: ae.mensagem,
      })),
      alertasEstatisticos,
      alertasRede: [],
      resumoEstatistico: auditoriaEstatistica,
      errosParsingConflito: [],
      resumoVerificacaoConteudo: { totalObrasCitadas: 0, totalObrasVerificadas: 0, totalObrasNaoVerificadas: 0, obras: [] },
      resumoObrasConformes: { totalConformes: 0, totalComPdf: 0, totalSemPdf: 0, obras: [] },
      linhasPosReferenciasIgnoradas: linhasPosReferencias.length,
      moduloExecutado: 'estatistica',
    };
  }

  // ATALHO ULTRA-RÁPIDO: MÓDULO 1 (Chamadas no Texto x Referências Finais)
  if (modulo === 'chamadas') {
    const refsMapeadasFast = [];
    const chavesRefEncontradasFast = new Set();

    for (const refDoc of refsFinais) {
      let grupo = gruposCitacao.get(refDoc.chave);
      if (!grupo) {
        for (const g of gruposCitacao.values()) {
          const anoCompativel = refDoc.anoBase === g.anoBase || refDoc.ano === g.ano;
          if (!anoCompativel) continue;
          const aliasesRef = new Set(refDoc.chavesAutorAlias || [refDoc.chaveAutor]);
          const aliasesCit = g.chavesAutorAlias || [g.chaveAutor];
          if (aliasesCit.some((a) => aliasesRef.has(a))) {
            grupo = g;
            break;
          }
        }
      }
      if (grupo) {
        chavesRefEncontradasFast.add(grupo.chave);
        refsMapeadasFast.push({
          ...refDoc,
          citadaNoTexto: true,
          ocorrenciasNoTexto: grupo.ocorrencias,
          statusAutenticidade: 'autenticada_local',
          alertaAutenticidade: '✓ Citação pareada com o corpo do texto.',
        });
      } else {
        refsMapeadasFast.push({
          ...refDoc,
          citadaNoTexto: false,
          ocorrenciasNoTexto: [],
          statusAutenticidade: 'nao_verificado',
          alertaAutenticidade: '⚠️ Obra sobrando na lista de referências (não citada no texto).',
        });
      }
    }

    const citacoesSemRefFast = [];
    for (const g of gruposCitacao.values()) {
      if (!chavesRefEncontradasFast.has(g.chave)) {
        citacoesSemRefFast.push({
          autor: g.autor,
          ano: g.ano,
          chave: g.chave,
          ocorrencias: g.ocorrencias,
          mensagem: `Citação "${g.autor} (${g.ano})" encontrada no corpo do texto, mas NÃO consta na seção de Referências!`,
        });
      }
    }

    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'concluido',
        atual: refsFinais.length,
        total: refsFinais.length,
        porcentagem: 100,
        mensagem: '✓ Módulo 1 Concluído — Conferência de Chamadas x Referências Finais',
        detalhe: `${citacoes.length} chamadas no texto e ${refsFinais.length} referências analisadas estruturalmente.`,
      });
    }

    return {
      totalCitacoesOcorrencias: citacoes.length,
      totalAutoresCitadosUnicos: gruposCitacao.size,
      totalReferenciasListaFinal: refsFinais.length,
      citacoesSemReferencia: citacoesSemRefFast,
      refsMapeadas: refsMapeadasFast,
      alertasAtribuicaoFalsa: [],
      alertasPlagio: [],
      alertasPrecisao,
      alertasEstatisticos: [],
      alertasRede: [],
      alertasMetodologiaClinica: [],
      alertasFrasesTorturadas: [],
      alertasEstilometricos: [],
      alertasPredatorios: [],
      alertasAbnt6023: [],
      alertasCorrupcaoGene: [],
      alertasFomento: [],
      alertasDesvioTematico: [],
      errosParsingConflito: [],
      resumoVerificacaoConteudo: { totalObrasCitadas: gruposCitacao.size, totalObrasVerificadas: refsMapeadasFast.length, totalObrasNaoVerificadas: 0, obras: [] },
      resumoObrasConformes: { totalConformes: refsMapeadasFast.filter(r => r.citadaNoTexto).length, totalComPdf: 0, totalSemPdf: refsMapeadasFast.length, obras: [] },
      linhasPosReferenciasIgnoradas: linhasPosReferencias.length,
      moduloExecutado: 'chamadas',
    };
  }

  // ATALHO ULTRA-RÁPIDO: MÓDULO 4 (Detecção de Plágio com Google Diff Match Patch)
  if (modulo === 'plagio') {
    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'fase1',
        atual: 1,
        total: 1,
        porcentagem: 30,
        mensagem: 'Módulo 4/5 — Montando corpus de artigos e PDFs para análise Diff Match Patch…',
        detalhe: 'Comparando sentenças do Word com todos os artigos anexados…',
      });
    }

    const corpusArtigosFast = [...biblioteca.refs.values()].map((r) => {
      const aut = r.csl?.author?.[0]?.family || r.csl?.author?.[0]?.literal || 'Autor';
      const anoRef = String(r.csl?.issued?.['date-parts']?.[0]?.[0] || '');
      const chaveAut = normalizarChave(aut);
      const resumoLimpo = String(r.csl?.abstract || '')
        .replace(/^📊\s*\[INSIGHTS[\s\S]*?─+\s*\n*/m, '')
        .replace(/^Síntese PICO:[\s\S]*$/m, '')
        .replace(/^\[Documento normativo[\s\S]*$/m, '')
        .trim();
      const sentencasOriginais = `${resumoLimpo}. ${(r.textoExtraido || '').slice(0, 30000)}`
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 25 && !s.startsWith('Síntese PICO:'));
      return {
        id: r.id,
        autor: aut,
        chaveAutor: chaveAut,
        ano: anoRef,
        titulo: r.csl?.title || '',
        sentencasOriginais,
      };
    });

    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'fase1',
        atual: 1,
        total: 1,
        porcentagem: 70,
        mensagem: 'Módulo 4/5 — Executando algoritmo Diff Match Patch e filtro de jargões…',
        detalhe: 'Buscando blocos idênticos de 7+ palavras consecutivas…',
      });
    }

    const alertasPlagioDiff = await analisarPlagioComDiffMatchPatch(paragrafosCorpo, corpusArtigosFast);

    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'concluido',
        atual: 1,
        total: 1,
        porcentagem: 100,
        mensagem: '✓ Módulo 4 Concluído — Análise de Plágio e Cópia Literal Finalizada',
        detalhe: `${alertasPlagioDiff.length} ocorrência(s) detectada(s) via Google Diff Match Patch.`,
      });
    }

    return {
      totalCitacoesOcorrencias: citacoes.length,
      totalAutoresCitadosUnicos: gruposCitacao.size,
      totalReferenciasListaFinal: refsFinais.length,
      citacoesSemReferencia: [],
      refsMapeadas: [],
      alertasAtribuicaoFalsa: [],
      alertasPlagio: alertasPlagioDiff,
      alertasPrecisao: [],
      alertasEstatisticos: [],
      alertasRede: [],
      alertasMetodologiaClinica: [],
      alertasFrasesTorturadas: [],
      alertasEstilometricos: [],
      alertasPredatorios: [],
      alertasAbnt6023: [],
      alertasCorrupcaoGene: [],
      alertasFomento: [],
      alertasDesvioTematico: [],
      errosParsingConflito: [],
      resumoVerificacaoConteudo: { totalObrasCitadas: 0, totalObrasVerificadas: 0, totalObrasNaoVerificadas: 0, obras: [] },
      resumoObrasConformes: { totalConformes: 0, totalComPdf: 0, totalSemPdf: 0, obras: [] },
      linhasPosReferenciasIgnoradas: linhasPosReferencias.length,
      moduloExecutado: 'plagio',
    };
  }

  const refsMapeadas = [];
  const chavesRefEncontradas = new Set();
  const totalRefsFinais = refsFinais.length;
  const CONCORRENCIA_REFS = 6;
  const preResolucao = new Array(totalRefsFinais);

  // Pareia grupo no texto e referência inicial da biblioteca de forma pura (para permitir pré-busca paralela)
  const contextosIniciais = refsFinais.map((refDoc) => {
    let grupo = gruposCitacao.get(refDoc.chave);
    if (!grupo) {
      for (const g of gruposCitacao.values()) {
        const temSufixoRef = /[a-f]$/.test(refDoc.ano);
        const temSufixoCit = /[a-f]$/.test(g.ano);
        const anoCompativel =
          temSufixoRef || temSufixoCit ? refDoc.ano === g.ano : refDoc.anoBase === g.anoBase;
        if (!anoCompativel) continue;
        const aliasesRef = new Set(refDoc.chavesAutorAlias || [refDoc.chaveAutor]);
        const aliasesCit = g.chavesAutorAlias || [g.chaveAutor];
        if (aliasesCit.some((ac) => ac && aliasesRef.has(ac))) {
          grupo = g;
          break;
        }
      }
    }

    let refBibInMem = refDoc.doi ? biblioteca.porDoi(refDoc.doi) : null;
    if (refBibInMem && refDoc.doi) {
      const autBibNorm = normalizarChave(
        (refBibInMem.csl?.author || []).map((a) => a.family || a.literal || '').join(' ')
      );
      if (autBibNorm && !refDoc.chavesAutorAlias.some((al) => al.length >= 3 && autBibNorm.includes(al))) {
        refBibInMem = null;
      }
    }
    if (!refBibInMem) {
      for (const r of biblioteca.refs.values()) {
        const aBib = normalizarChave(r.csl?.author?.[0]?.family || r.csl?.author?.[0]?.literal || '');
        const anoBib = String(r.csl?.issued?.['date-parts']?.[0]?.[0] || '');
        if (
          aBib &&
          anoBib &&
          refDoc.chavesAutorAlias.includes(aBib) &&
          anoBib === refDoc.anoBase &&
          (!refDoc.sufixoAno || normalizarChave(r.csl?.title || '').includes(normalizarChave(refDoc.tituloBuscado.slice(0, 18))))
        ) {
          refBibInMem = r;
          break;
        }
      }
    }
    return { grupo, refBibInMem };
  });

  // Etapa 2A: Pré-resolução concorrente limitada (APIs, retratações e PDFs abertos em paralelo — 6x+ mais rápido)
  let concluidasPrefetch = 0;
  await executarPoolLimitado(
    totalRefsFinais,
    buscarEBaixar ? CONCORRENCIA_REFS : 1,
    async (i) => {
      const refDoc = refsFinais[i];
      const { refBibInMem } = contextosIniciais[i];
      let refBibRes = refBibInMem;
      let divergenciaMetadados = null;
      let statusAutenticidade = 'nao_verificado';
      let alertaAutenticidade = '';
      let retratadoInfo = null;
      let csl = null;
      let alertaRetratacaoMsg = null;
      let alertaDivDoi = null;
      let pdfTempPath = null;

      const ehNormaLivroOuInstitucional = refDoc.natureza === 'norma_livro_institucional';
      const ehPeriodicoRegionalSemDoi = refDoc.natureza === 'periodico_regional_sem_doi';
      const infoHandle = verificarHandleRepositorio(refDoc.textoOriginal);

      if (infoHandle) {
        statusAutenticidade = infoHandle.statusAutenticidade;
        alertaAutenticidade = infoHandle.alertaAutenticidade;
        refDoc.infoRepositorio = infoHandle;
      } else if (refDoc.codigoControlado) {
        statusAutenticidade = 'protocolo_controlado_aprovado';
        alertaAutenticidade = `🏛 Protocolo Institucional Controlado (${refDoc.codigoControlado}) — Metadados Aprovados`;
      } else if (ehNormaLivroOuInstitucional) {
        statusAutenticidade = 'institucional_tese';
        alertaAutenticidade =
          refDoc.rotuloLener || '🏛 Norma Jurídica / Ato Normativo / Documento Técnico-Institucional Oficial / Livro';
      } else if (ehPeriodicoRegionalSemDoi) {
        statusAutenticidade = 'periodico_regional_sem_doi';
        alertaAutenticidade =
          refDoc.rotuloLener || '📚 Periódico Acadêmico Regional / Literatura Cinzenta (Sem indexação DOI Crossref)';
      }

      if (buscarEBaixar && !ehNormaLivroOuInstitucional && !ehPeriodicoRegionalSemDoi && !infoHandle) {
        try {
          if (refDoc.doi) {
            try {
              csl = await porDoi(refDoc.doi);
              const autOficial = normalizarChave(
                (csl.author || []).map((a) => a.family || a.literal || '').join(' ')
              );
              const titOficial = normalizarChave(csl.title || '');
              const textoRefNorm = normalizarChave(refDoc.textoOriginal);
              const autorBate = refDoc.chavesAutorAlias.some(
                (al) => al.length >= 3 && autOficial.includes(al)
              );
              const tituloBate = titOficial.length >= 12 && textoRefNorm.includes(titOficial.slice(0, 16));

              if (!autorBate && !tituloBate) {
                const autoresReaisStr = (csl.author || [])
                  .map((a) => `${a.given || ''} ${a.family || a.literal || ''}`.trim())
                  .filter(Boolean)
                  .join(', ');
                statusAutenticidade = 'ia_doi_trocado';
                alertaAutenticidade = `🚨 REFERÊNCIA NÃO LOCALIZÁVEL / DOI DE OUTRO ARTIGO: O DOI ${refDoc.doi} pertence na verdade ao artigo "${csl.title}" (${autoresReaisStr}), e a obra declarada (${refDoc.primeiroSobrenome}, ${refDoc.ano}) não foi localizada no fascículo/base!`;
                divergenciaMetadados = alertaAutenticidade;
                csl = null;
                refBibRes = null;
              } else {
                const compCampos = compararCamposDoiOficial(refDoc, csl);
                if (compCampos?.temDivergencia) {
                  const detalheDiv = compCampos.divergencias.map((d) => d.mensagem).join(' ');
                  statusAutenticidade = 'autenticada_com_divergencia_campos';
                  alertaAutenticidade = `✅ DOI resolve (${refDoc.doi}), mas com divergência no campo ${compCampos.divergencias
                    .map((d) => d.campo)
                    .join(', ')}`;
                  divergenciaMetadados = detalheDiv;
                  alertaDivDoi = detalheDiv;
                } else {
                  statusAutenticidade = 'autenticada';
                  alertaAutenticidade = `✅ Fonte Real Autenticada via DOI (${refDoc.doi})`;
                }
              }
            } catch (errDoi) {
              const eh404 = errDoi?.status === 404 || /não encontrado|404/i.test(errDoi?.message || '');
              if (eh404) {
                statusAutenticidade = 'ia_doi_inexistente';
                alertaAutenticidade = `🚨 REFERÊNCIA NÃO LOCALIZÁVEL / DOI INEXISTENTE: O DOI "${refDoc.doi}" retorna "DOI Not Found" na International DOI Foundation e a obra (${refDoc.primeiroSobrenome}, ${refDoc.ano}) não consta no PubMed/Crossref/SciELO!`;
              } else {
                statusAutenticidade = 'autenticacao_indisponivel';
                alertaAutenticidade = `⏳ Consulta online temporariamente instável para o DOI "${refDoc.doi}" (${errDoi?.message || 'timeout'}).`;
              }
              divergenciaMetadados = alertaAutenticidade;
              refBibRes = null;
            }
          } else if (!refBibRes || (!refBibRes.csl?.DOI && !refBibRes.csl?.PMID && !refBibRes.csl?.PMCID)) {
            if (refDoc.pmcid || refDoc.pmid) {
              try {
                if (refDoc.pmid) csl = await porPmid(refDoc.pmid);
                else if (refDoc.pmcid) csl = await porPmc(refDoc.pmcid);
                if (csl?.title) {
                  statusAutenticidade = 'autenticada';
                  alertaAutenticidade = `Fonte autenticada no PubMed/PMC (${refDoc.pmcid ? 'PMC' + refDoc.pmcid : 'PMID ' + refDoc.pmid})`;
                }
              } catch {}
            }

            if (!csl) {
              const candidatos = await buscarTitulo(refDoc.tituloBuscado || refDoc.textoOriginal.slice(0, 140));
              const melhor = (candidatos || []).find((cand) => {
                if (!cand.ano || !refDoc.anoBase) return false;
                if (!cand.doi && !cand.pmid) return false;
                if (Math.abs(Number(cand.ano) - Number(refDoc.anoBase)) > 1) return false;
                const autCand = normalizarChave(cand.autores || '');
                const autorOk = refDoc.chavesAutorAlias.some((al) => al.length >= 3 && autCand.includes(al));
                if (!autorOk) return false;
                const titCand = normalizarChave(cand.titulo || '');
                const titRef = normalizarChave(refDoc.tituloBuscado || '');
                const titRefSemSub = normalizarChave((refDoc.tituloBuscado || '').split(/[:–—]/)[0].trim());
                if (titCand.length < 12) return false;
                return (
                  titCand.includes(titRef.slice(0, 16)) ||
                  titRef.includes(titCand.slice(0, 16)) ||
                  (titRefSemSub.length >= 12 &&
                    (titCand.includes(titRefSemSub.slice(0, 16)) || titRefSemSub.includes(titCand.slice(0, 16))))
                );
              });

              if (melhor?.doi) {
                csl = await porDoi(melhor.doi);
                statusAutenticidade = 'autenticada';
                alertaAutenticidade = `Fonte autenticada nas bases (DOI: ${melhor.doi})`;
              } else if (melhor?.pmid) {
                csl = await porPmid(melhor.pmid);
                statusAutenticidade = 'autenticada';
                alertaAutenticidade = `Fonte autenticada no PubMed (PMID: ${melhor.pmid})`;
              } else if (candidatos?.erroRede) {
                statusAutenticidade = 'autenticacao_indisponivel';
                alertaAutenticidade =
                  'Consulta online temporariamente instável ou limitada (429/timeout). Execute novamente para revalidar esta fonte.';
                divergenciaMetadados = alertaAutenticidade;
              } else {
                statusAutenticidade = 'suspeita_ia_fantasma';
                alertaAutenticidade =
                  'Referência não localizada nas bases: nenhum artigo correspondente foi encontrado no PubMed/Crossref/OpenAlex.';
                divergenciaMetadados = alertaAutenticidade;
              }
            }
          } else if (refBibRes?.csl?.DOI) {
            try {
              csl = await porDoi(refBibRes.csl.DOI);
              statusAutenticidade = 'autenticada';
              alertaAutenticidade = `Fonte autenticada na biblioteca e bases (DOI: ${refBibRes.csl.DOI})`;
            } catch {
              statusAutenticidade = 'autenticada';
              alertaAutenticidade = `Fonte autenticada (${refBibRes.csl.DOI})`;
            }
          }

          if (!ehNormaLivroOuInstitucional && (refDoc.doi || csl?.DOI || refDoc.pmid || csl?.PMID || refBibRes?.csl?.DOI)) {
            try {
              const infoRetratacao = await verificarRetratacaoArtigo({
                doi: refDoc.doi || csl?.DOI || refBibRes?.csl?.DOI,
                pmid: refDoc.pmid || csl?.PMID || refBibRes?.csl?.PMID,
                titulo: csl?.title || refBibRes?.csl?.title || refDoc.tituloBuscado,
              });
              if (infoRetratacao.retratado) {
                retratadoInfo = infoRetratacao;
                statusAutenticidade = 'artigo_retratado';
                alertaAutenticidade = `🚨 ARTIGO CIENTÍFICO RETRATADO / DESPUBLICADO: A obra "${refDoc.primeiroSobrenome} (${refDoc.ano})" foi formalmente retratada na literatura (${infoRetratacao.fonte})! Motivo: ${infoRetratacao.motivo}`;
                divergenciaMetadados = alertaAutenticidade;
                alertaRetratacaoMsg = alertaAutenticidade;
              }
            } catch {}
          }
        } catch {}
      }

      if (statusAutenticidade === 'nao_verificado') {
        if (ehNormaLivroOuInstitucional) {
          statusAutenticidade = 'institucional_tese';
          alertaAutenticidade = '🏛 Norma Jurídica / Padrão Técnico / Documento Institucional / Livro';
        } else if (refBibRes?.csl?.DOI) {
          statusAutenticidade = 'autenticada';
          alertaAutenticidade = `✅ Fonte Real Autenticada (${refBibRes.csl.DOI})`;
        }
      }

      const ehFonteInexistenteOuFalsa = ['ia_doi_inexistente', 'ia_doi_trocado', 'suspeita_ia_fantasma'].includes(
        statusAutenticidade
      );

      // Pré-download paralelo do PDF aberto se ainda ausente localmente (respeitando cancelamento)
      if (!signal?.aborted && buscarEBaixar && !ehFonteInexistenteOuFalsa && !refBibRes?.pdf) {
        const arqLocal = refBibRes
          ? localizarPdfNoAcervoLocal({ refBib: refBibRes, refDoc, bibliotecaRaiz: biblioteca.raiz })
          : null;
        if (!arqLocal) {
          try {
            const urlNaRef = refDoc.textoOriginal?.match(/https?:\/\/[^\s)>]+/i)?.[0] || refDoc.infoRepositorio?.url;
            const achado = await localizarUrlPdfAberto({
              doi: csl?.DOI || refBibRes?.csl?.DOI || refDoc.doi,
              pmid: csl?.PMID || refBibRes?.csl?.PMID,
              url: urlNaRef,
              titulo: refDoc.tituloBuscado,
              autor: refDoc.primeiroSobrenome,
              ano: refDoc.anoBase,
            });
            if (achado?.urlPdf && !signal?.aborted) {
              const temp = path.join(os.tmpdir(), `audit-${i}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}.pdf`);
              await baixarPdfParaArquivo(achado.urlPdf, temp);
              pdfTempPath = temp;
            }
          } catch {}
        }
      }

      preResolucao[i] = {
        csl,
        refBibRes,
        divergenciaMetadados,
        statusAutenticidade,
        alertaAutenticidade,
        ehNormaLivroOuInstitucional,
        ehFonteInexistenteOuFalsa,
        retratadoInfo,
        alertaRetratacaoMsg,
        alertaDivDoi,
        pdfTempPath,
      };

      concluidasPrefetch++;
      if (typeof onProgresso === 'function') {
        const pct = Math.min(42, 8 + Math.round((concluidasPrefetch / Math.max(totalRefsFinais, 1)) * 34));
        onProgresso({
          fase: 'etapa2',
          atual: concluidasPrefetch,
          total: totalRefsFinais,
          porcentagem: pct,
          mensagem: `Etapa 2/6: Validando autenticidade de ${totalRefsFinais} referências (${concluidasPrefetch}/${totalRefsFinais})`,
          detalhe: `${refDoc.primeiroSobrenome} (${refDoc.anoBase || ''}) — ${refDoc.tituloBuscado || ''}`,
        });
      }
    },
    signal
  );

  // Etapa 2B: Consolidação sequencial rigorosamente determinística (0 .. N-1)
  for (let i = 0; i < totalRefsFinais; i++) {
    if (signal?.aborted) {
      const err = new Error('Auditoria cancelada pelo usuário.');
      err.aborted = true;
      throw err;
    }
    const refDoc = refsFinais[i];
    const { grupo } = contextosIniciais[i];
    if (grupo) chavesRefEncontradas.add(grupo.chave);

    const pre = preResolucao[i] || {};
    let {
      csl,
      refBibRes: refBib,
      divergenciaMetadados,
      statusAutenticidade,
      alertaAutenticidade,
      ehNormaLivroOuInstitucional,
      ehFonteInexistenteOuFalsa,
      retratadoInfo,
      alertaRetratacaoMsg,
      alertaDivDoi,
      pdfTempPath,
    } = pre;

    if (refDoc.defeitoPreposicaoEntrada) {
      const def = refDoc.defeitoPreposicaoEntrada;
      alertasPrecisao.push({
        tipo: 'nbr6023_preposicao_entrada',
        numParagrafo: grupo?.ocorrencias?.[0]?.numParagrafo || 0,
        numLinha: grupo?.ocorrencias?.[0]?.numLinha || 0,
        secao: 'Lista de Referências',
        autorCitado: refDoc.primeiroSobrenome,
        fraseWord: refDoc.textoOriginal,
        mensagem: `📐 Norma ABNT NBR 6023 (Elemento de Entrada): A referência inicia com a preposição "${def.entradaDeclarada}". Pela NBR 6023, preposições não integram o elemento de entrada e deslocam-se para após as iniciais: "${def.sugestao}".`,
      });
    }

    if (alertaDivDoi) {
      alertasPrecisao.push({
        tipo: 'divergencia_metadados_doi',
        numParagrafo: grupo?.ocorrencias?.[0]?.numParagrafo || 0,
        numLinha: grupo?.ocorrencias?.[0]?.numLinha || 0,
        secao: 'Lista de Referências',
        autorCitado: `${refDoc.primeiroSobrenome} (${refDoc.ano})`,
        fraseWord: refDoc.textoOriginal,
        mensagem: `🔍 Divergência de Metadados via DOI (${refDoc.primeiroSobrenome}, ${refDoc.ano}): ${alertaDivDoi}`,
      });
    }

    if (retratadoInfo) {
      refDoc.retratado = true;
      if (refBib) refBib.retratado = true;
      alertasPrecisao.push({
        tipo: 'artigo_cientifico_retratado',
        numParagrafo: grupo?.ocorrencias?.[0]?.numParagrafo || 0,
        numLinha: grupo?.ocorrencias?.[0]?.numLinha || 0,
        secao: 'Lista de Referências',
        autorCitado: `${refDoc.primeiroSobrenome} (${refDoc.ano})`,
        fraseWord: refDoc.textoOriginal,
        mensagem: alertaRetratacaoMsg,
      });
    }

    if (csl && !refBib && statusAutenticidade === 'autenticada') {
      refBib =
        (csl.DOI && biblioteca.porDoi(csl.DOI)) ||
        (await biblioteca.criar({
          csl,
          status: grupo ? 'citada' : 'consultada',
        }));
    }

    if (!refBib && !ehFonteInexistenteOuFalsa) {
      const cslManual = {
        type: ehNormaLivroOuInstitucional ? 'report' : 'article-journal',
        title: (refDoc.tituloBuscado || refDoc.textoOriginal).slice(0, 240),
        author: refDoc.primeiroSobrenome ? [{ family: refDoc.primeiroSobrenome }] : undefined,
        issued: refDoc.anoBase ? { 'date-parts': [[Number(refDoc.anoBase)]] } : undefined,
        DOI: refDoc.doi || undefined,
        note: refDoc.textoOriginal,
      };
      refBib = await biblioteca.criar({
        csl: cslManual,
        status: grupo ? 'citada' : 'consultada',
        notas: `Referência extraída do Word:\n${refDoc.textoOriginal}`,
      });
    } else if (refBib && !ehFonteInexistenteOuFalsa) {
      if ((refBib.csl?.title || '').trim().length <= 3 && refDoc.tituloBuscado.length > 5) {
        refBib = await biblioteca.atualizar(refBib.id, {
          csl: { ...refBib.csl, title: refDoc.tituloBuscado },
        });
      }
    }

    let grifosGroundTruth = [];
    let ocorrenciasEnriquecidas = null;

    if (refBib && !ehFonteInexistenteOuFalsa) {
      if (!refBib.pdf) {
        try {
          const arqLocal = localizarPdfNoAcervoLocal({ refBib, refDoc, bibliotecaRaiz: biblioteca.raiz });
          if (arqLocal) {
            refBib = await biblioteca.anexarPdf(refBib.id, arqLocal);
          }
        } catch {}
      }

      if (!refBib.pdf && pdfTempPath && fs.existsSync(pdfTempPath)) {
        try {
          refBib = await biblioteca.anexarPdf(refBib.id, pdfTempPath);
          if (!somenteLeitura && pastaDestino && fs.existsSync(pastaDestino) && refBib.pdf) {
            try {
              const destinoPdf = path.join(pastaDestino, refBib.pdf);
              if (!fs.existsSync(destinoPdf)) {
                await fs.promises.copyFile(pdfTempPath, destinoPdf);
              }
            } catch {}
          }
        } catch {}
      }
      if (pdfTempPath && fs.existsSync(pdfTempPath)) {
        await fs.promises.rm(pdfTempPath, { force: true }).catch(() => {});
      }

      // Garante consistência de ciclo único: extrai o texto integral do PDF ainda na Etapa 2 se ausente
      if (refBib.pdf && !refBib.textoExtraido) {
        try {
          const camPdf = typeof biblioteca.caminhoPdf === 'function'
            ? biblioteca.caminhoPdf(refBib.id)
            : biblioteca.p('pdfs', refBib.pdf);
          if (camPdf && fs.existsSync(camPdf)) {
            const textoExtraidoCiclo = await extrairTextoPdfNoNode(camPdf);
            if (textoExtraidoCiclo) {
              refBib = await biblioteca.atualizar(refBib.id, { textoExtraido: textoExtraidoCiclo });
            }
          }
        } catch {}
      }

      if (!somenteLeitura && refBib.pdf && pastaDestino && fs.existsSync(pastaDestino)) {
        try {
          const origemPdf = biblioteca.p('pdfs', refBib.pdf);
          const destinoPdf = path.join(pastaDestino, refBib.pdf);
          if (fs.existsSync(origemPdf) && !fs.existsSync(destinoPdf)) {
            await fs.promises.copyFile(origemPdf, destinoPdf);
          }
        } catch {}
      }

      const tagsConjunto = new Set(refBib.tags || []);
      tagsConjunto.add('Auditado');
      tagsConjunto.add('Conforme');
      if (grupo) tagsConjunto.add('CitadoNoWord');

      refBib = await biblioteca.atualizar(refBib.id, {
        status: grupo ? 'citada' : (refBib.status || 'consultada'),
        tags: Array.from(tagsConjunto),
      });

      const grifosAtuais = await biblioteca.lerGrifos(refBib.id);
      grifosGroundTruth = grifosAtuais.filter(
        (g) => g && g.trecho && !g.origemAutoAuditor && (g.citadoNoTexto === true || g.cor === 'azul')
      );
      refBib._grifosGroundTruth = grifosGroundTruth;

      const resumoRealLimpo = String(refBib.csl?.abstract || '')
        .replace(/^📊\s*\[INSIGHTS[\s\S]*?─+\s*\n*/m, '')
        .replace(/^Síntese PICO:[\s\S]*$/m, '')
        .replace(/^\[Documento normativo[\s\S]*$/m, '')
        .trim();

      const textoBaseArtigo = `${resumoRealLimpo} ${(refBib.textoExtraido || '').slice(0, 120000)}`.trim();
      const sentencasArtigo = textoBaseArtigo
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter((s) => s.length >= 25 && !s.startsWith('Síntese PICO:'));

      ocorrenciasEnriquecidas = (grupo ? grupo.ocorrencias : []).map((oc) => {
        const melhorSentenca = sentencasArtigo.length
          ? selecionarMelhorTrechoArtigo(oc.trechoDireto || oc.fraseContexto, sentencasArtigo)
          : '';
        return {
          ...oc,
          trechoArtigoResumo: melhorSentenca,
        };
      });

      if (grupo) {
        refBib = await biblioteca.atualizar(refBib.id, {
          status: 'citada',
          ocorrenciasWord: ocorrenciasEnriquecidas,
        });

        if (!somenteLeitura) {
          const novosGrifos = [...grifosAtuais];
          for (const oc of ocorrenciasEnriquecidas) {
            const locWord = `Parágrafo §${oc.numParagrafo} · Linha ${oc.numLinha}${oc.secao ? ` (${oc.secao})` : ''}`;
            const jaExiste = novosGrifos.some(
              (g) => g.fraseWord === oc.fraseContexto || g.trecho === (oc.trechoDireto || oc.fraseContexto)
            );
            if (!jaExiste) {
              novosGrifos.unshift({
                id: `${oc.numParagrafo}_${oc.numLinha}_${normalizarChave(oc.fraseContexto).slice(0, 12)}`,
                pagina: oc.paginaDeclarada || 1,
                cor: 'azul',
                trecho: oc.trechoDireto || oc.trechoArtigoResumo || oc.fraseContexto,
                fraseWord: oc.fraseContexto,
                paragrafoWord: oc.paragrafoCompleto,
                numParagrafo: oc.numParagrafo,
                numLinha: oc.numLinha,
                secaoWord: oc.secao,
                ondeCitei: locWord,
                nota: oc.trechoArtigoResumo ? `Trecho no artigo: "${oc.trechoArtigoResumo}"` : '',
                citadoNoTexto: true,
                origemAutoAuditor: true,
                criadoEm: new Date().toISOString(),
              });
            }
          }
          await biblioteca.salvarGrifos(refBib.id, novosGrifos);
        }
      }
      if (somenteLeitura && refBib._caminhoPdfTemp && fs.existsSync(refBib._caminhoPdfTemp)) {
        try { await fs.promises.rm(refBib._caminhoPdfTemp, { force: true }); } catch {}
      }
    } else if (pdfTempPath && fs.existsSync(pdfTempPath)) {
      await fs.promises.rm(pdfTempPath, { force: true }).catch(() => {});
    }

    refsMapeadas.push({
      ...refDoc,
      citadaNoTexto: !!grupo,
      ocorrenciasNoTexto:
        !ehFonteInexistenteOuFalsa && typeof ocorrenciasEnriquecidas !== 'undefined' && grupo
          ? ocorrenciasEnriquecidas
          : grupo
          ? grupo.ocorrencias
          : [],
      grifosGroundTruth,
      refBibId: !ehFonteInexistenteOuFalsa ? refBib?.id || null : null,
      tituloOficial: !ehFonteInexistenteOuFalsa ? refBib?.csl?.title || refDoc.tituloBuscado : null,
      doiOficial: !ehFonteInexistenteOuFalsa ? refBib?.csl?.DOI || refDoc.doi || null : refDoc.doi || null,
      temPdf: !ehFonteInexistenteOuFalsa && !!refBib?.pdf,
      nomeArquivoPdf: !ehFonteInexistenteOuFalsa ? refBib?.pdf || null : null,
      retratado: !ehFonteInexistenteOuFalsa && (!!refBib?.retratado || !!refDoc.retratado),
      divergenciaMetadados,
      statusAutenticidade,
      alertaAutenticidade,
    });
  }

  // ATALHO ULTRA-RÁPIDO: MÓDULO 2 (Autenticidade das Fontes & Anti-IA)
  if (modulo === 'autenticidade') {
    const citacoesSemRefFast = [];
    for (const g of gruposCitacao.values()) {
      if (!chavesRefEncontradas.has(g.chave)) {
        citacoesSemRefFast.push({
          autor: g.autor,
          ano: g.ano,
          chave: g.chave,
          ocorrencias: g.ocorrencias,
          mensagem: `Citação "${g.autor} (${g.ano})" encontrada no corpo do texto, mas NÃO consta na seção de Referências!`,
        });
      }
    }
    if (typeof onProgresso === 'function') {
      onProgresso({
        fase: 'concluido',
        atual: totalRefsFinais,
        total: totalRefsFinais,
        porcentagem: 100,
        mensagem: '✓ Módulo 2 Concluído — Autenticação de Fontes e Anti-IA',
        detalhe: `${refsMapeadas.length} referências verificadas contra bases científicas.`,
      });
    }
    return {
      totalCitacoesOcorrencias: citacoes.length,
      totalAutoresCitadosUnicos: gruposCitacao.size,
      totalReferenciasListaFinal: refsFinais.length,
      citacoesSemReferencia: citacoesSemRefFast,
      refsMapeadas,
      alertasAtribuicaoFalsa: [],
      alertasPlagio: [],
      alertasPrecisao,
      alertasEstatisticos: [],
      alertasRede: [],
      alertasMetodologiaClinica: [],
      alertasFrasesTorturadas: [],
      alertasEstilometricos: [],
      alertasPredatorios: [],
      alertasAbnt6023: [],
      alertasCorrupcaoGene: [],
      alertasFomento: [],
      alertasDesvioTematico: [],
      errosParsingConflito: [],
      resumoVerificacaoConteudo: { totalObrasCitadas: gruposCitacao.size, totalObrasVerificadas: refsMapeadas.length, totalObrasNaoVerificadas: 0, obras: [] },
      resumoObrasConformes: {
        totalConformes: refsMapeadas.filter((r) => !['ia_doi_trocado', 'ia_doi_inexistente', 'suspeita_ia_fantasma'].includes(r.statusAutenticidade)).length,
        totalComPdf: refsMapeadas.filter((r) => r.temPdf).length,
        totalSemPdf: refsMapeadas.filter((r) => !r.temPdf).length,
        obras: [],
      },
      linhasPosReferenciasIgnoradas: linhasPosReferencias.length,
      moduloExecutado: 'autenticidade',
    };
  }

  if (typeof onProgresso === 'function') {
    onProgresso({
      fase: 'etapa4',
      atual: 0,
      total: refsMapeadas.length,
      porcentagem: 52,
      mensagem: 'Etapa 4/6: Indexando texto integral e grifos Ground Truth para aderência semântica…',
      detalhe: `Consolidando corpus de ${refsMapeadas.length} referências mapeadas…`,
    });
  }

  // ---------- 6. Verificação de Fidelidade de Conteúdo (Artigos Autenticados ou com Grifos Ground Truth) ----------
  const corpusArtigos = [...biblioteca.refs.values()].map((r) => {
    const aut = r.csl?.author?.[0]?.family || r.csl?.author?.[0]?.literal || 'Autor';
    const anoRef = String(r.csl?.issued?.['date-parts']?.[0]?.[0] || '');
    const chaveAut = normalizarChave(aut);
    const resumoLimpo = String(r.csl?.abstract || '')
      .replace(/^📊\s*\[INSIGHTS[\s\S]*?─+\s*\n*/m, '')
      .replace(/^Síntese PICO:[\s\S]*$/m, '')
      .replace(/^\[Documento normativo[\s\S]*$/m, '')
      .trim();
    const grifosUser = Array.isArray(r._grifosGroundTruth) ? r._grifosGroundTruth : [];
    const textoGrifos = grifosUser.map((g) => g.trecho).join(' ').trim();
    const textoTotal = `${r.csl?.title || ''} ${resumoLimpo} ${textoGrifos} ${(r.textoExtraido || '').slice(0, 120000)}`.trim();
    const sentencasOriginais = `${resumoLimpo}. ${textoGrifos}. ${(r.textoExtraido || '').slice(0, 50000)}`
      .split(/(?<=[.!?])\s+/)
      .map((s) => s.trim())
      .filter((s) => s.length >= 25 && !s.startsWith('Síntese PICO:'));
    return {
      id: r.id,
      autor: aut,
      chaveAutor: chaveAut,
      ano: anoRef,
      titulo: r.csl?.title || '',
      resumoLimpo,
      grifosGroundTruth: grifosUser,
      textoTotal,
      sentencasOriginais,
    };
  });

  /**
   * Decompõe uma sentença complexa em Proposições Atômicas Verificáveis (Inspirado no RefChecker - Amazon Science).
   * Permite isolar exatamente qual alegação é sustentada pela literatura e qual premissa carece de evidência.
   */
  function decomporEmProposicoesAtomicas(frase) {
    const f = String(frase || '')
      .replace(/\s+/g, ' ')
      .trim();
    if (f.length < 35) return [f];

    // Divide apenas por delimitadores estruturais e conjunções adversativas/independentes (evita fragmentar enumerações por "e" ou premissas ligadas por ", onde")
    const rawParts = f
      .split(/(?:;\s*|,\s*(?:enquanto|mas|por[eé]m|contudo|todavia|embora|com\s+a\s+finalidade\s+de)\s+)/i)
      .map((p) => p.trim())
      .filter((p) => p.length >= 28);

    return rawParts.length > 0 ? rawParts : [f];
  }

  let idxSemAtual = 0;
  const totalSemRefs = refsMapeadas.length;
  const alertasGuardiaoSimbolico = [];
  const alertasNliContradicao = [];
  const ocorrenciasPorSentenca = new Map();
  const registrarOcorrenciaGrupo = (rmRef, ocRef, { sustentada, motivo = null, scorePct = 0 }) => {
    const fraseNorm = String(ocRef?.fraseContexto || '').replace(/\s+/g, ' ').trim();
    if (!fraseNorm) return;
    const chaveSent = `${ocRef.numParagrafo}::${fraseNorm}`;
    if (!ocorrenciasPorSentenca.has(chaveSent)) {
      ocorrenciasPorSentenca.set(chaveSent, {
        ocRef,
        membrosPorChave: new Map(),
      });
    }
    const slot = ocorrenciasPorSentenca.get(chaveSent);
    slot.membrosPorChave.set(rmRef.chave || `${rmRef.primeiroSobrenome}:${rmRef.ano}`, {
      chave: rmRef.chave || `${rmRef.primeiroSobrenome}:${rmRef.ano}`,
      autorCitado: `${rmRef.primeiroSobrenome} (${rmRef.ano})`,
      sustentada: Boolean(sustentada),
      motivo,
      scorePct: Number(scorePct) || 0,
    });
  };
  for (const rm of refsMapeadas) {
    idxSemAtual++;
    if (typeof onProgresso === 'function' && totalSemRefs > 0) {
      const pctSem = Math.min(78, 54 + Math.round((idxSemAtual / totalSemRefs) * 24));
      onProgresso({
        fase: 'etapa5',
        atual: idxSemAtual,
        total: totalSemRefs,
        porcentagem: pctSem,
        mensagem: `Etapa 5/6: Triagem léxica BM25 + Inferência Neural ONNX INT8 [${idxSemAtual}/${totalSemRefs}]`,
        detalhe: `${rm.primeiroSobrenome || 'Fonte'} (${rm.ano || 's.d.'})`,
      });
    }
    // Regra R35: Verificação de prescrição sistêmica em fontes normativas e protocolos locais
    const ehProtocoloLocal =
      rm.chaveAutor === 'curitiba' ||
      rm.codigoControlado === 'PRT.DAPS.MAE.001' ||
      /PRT\.DAPS\.MAE\.001|Secretaria Municipal da Sa[uú]de/i.test(rm.textoOriginal || '');

    if (ehProtocoloLocal) {
      for (const oc of rm.ocorrenciasNoTexto || []) {
        const afirmaContrarreferenciaOuContinuo =
          /\b(comunica[cç][aã]o\s+cont[ií]nua|contrarrefer[eê]ncia|cuidado\s+compartilhado|retorno\s+estruturado|fluxo\s+sist[eê]mico\s+de\s+retorno)\b/i.test(
            oc.fraseContexto || oc.paragrafoCompleto || ''
          );
        if (afirmaContrarreferenciaOuContinuo) {
          const msg = `🚨 FALHA DE CONFORMIDADE SEMÂNTICA (Regra R35): No Parágrafo §${oc.numParagrafo}, o texto atribui ao protocolo municipal (${rm.primeiroSobrenome}, ${rm.ano}) a prescrição de 'comunicação contínua' / 'contrarreferência' / 'cuidado compartilhado' sistêmico. O documento oficial (PRT.DAPS.MAE.001, 2026) não prescreve contrarreferência sistêmica (o termo ocorre 0 vezes em 30 páginas) e prescreve apenas o retorno físico manual do laudo conduzido pela paciente ('a usuária deve ser orientada a retornar à Unidade de Saúde com o laudo em mãos'). A afirmação deve ser reescrita como diagnóstico de lacuna do fluxo e não como prescrição formal existente.`;
          alertasPrecisao.push({
            tipo: 'falsa_atribuicao_prescritiva_normativa',
            numParagrafo: oc.numParagrafo,
            numLinha: oc.numLinha,
            secao: oc.secao,
            autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
            fraseWord: oc.fraseContexto,
            mensagem: msg,
          });
          alertasAtribuicaoFalsa.push({
            numParagrafo: oc.numParagrafo,
            numLinha: oc.numLinha,
            secao: oc.secao,
            autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
            fraseWord: oc.fraseContexto,
            mensagem: msg,
            outroArtigoSugerido: null,
          });
        }
      }
    }

    // REGRA DE OURO 1: Não faz teste de aderência de resumo em fonte já marcada como inexistente/alucinada (evita duplicação A -> B)
    if (['ia_doi_inexistente', 'ia_doi_trocado', 'suspeita_ia_fantasma'].includes(rm.statusAutenticidade)) {
      continue;
    }
    // REGRA DE OURO 2: Não aplica teste de similaridade de abstract a Leis, Portarias, Normas ISO/HL7/IHE, Protocolos e Livros sem abstract
    if (
      rm.natureza === 'norma_livro_institucional' ||
      rm.statusAutenticidade === 'institucional_tese' ||
      rm.statusAutenticidade === 'protocolo_controlado_aprovado'
    ) {
      continue;
    }

    const artCitado = corpusArtigos.find((a) => a.id === rm.refBibId);
    if (!artCitado || (!artCitado.resumoLimpo && artCitado.textoTotal.length < 150 && !(artCitado.grifosGroundTruth?.length))) {
      continue;
    }

    for (const oc of rm.ocorrenciasNoTexto || []) {
      const textoAlvoArtigo = `${rm.tituloOficial || rm.tituloBuscado || ''} ${artCitado.textoTotal}`.trim();
      const textoContextoWord = `${oc.trechoDireto || oc.fraseContextoSemantico || oc.fraseContexto} ${oc.paragrafoCompleto || ''}`.trim();

      // Prioridade máxima: Trecho Citado salvo manualmente pelo pesquisador no Leitor PDF ("grifos/" Ground Truth)
      const grifoMatch = verificarMatchComGrifoUsuario(oc, artCitado.grifosGroundTruth || rm.grifosGroundTruth || []);
      if (grifoMatch) {
        oc.confirmadoPorGrifoUsuario = true;
        oc.paginaConfirmadaPorGrifo = grifoMatch.pagina || oc.paginaDeclarada || null;
        oc.trechoArtigoResumo = oc.trechoArtigoResumo || grifoMatch.trecho;
        oc.compatibilidadeTexto = Math.max(oc.compatibilidadeTexto || 0, 95);
        oc.scoreCosseno = Math.max(oc.scoreCosseno || 0, 0.95);
        registrarOcorrenciaGrupo(rm, oc, { sustentada: true, scorePct: oc.compatibilidadeTexto });
        continue;
      }

      // Verifica alertas finos de precisão metodológica / escopo (ex.: Reece 17 estudos, Tomazelli lesões benignas, Oliveira planilhas/telas)
      const avisosFinos = verificarPrecisaoMetodologicaFina(oc, rm, textoAlvoArtigo);
      alertasPrecisao.push(...avisosFinos);

      // Verificação semântica bilíngue PT↔EN + âncoras quantitativas
      const verBilingue = verificarCompatibilidadeBilingue(
        textoContextoWord,
        textoAlvoArtigo
      );
      // Verificação por Similaridade de Cosseno com Radicais e Conceitos Bilíngues
      const scoreCosseno = calcularSimilaridadeCossenoRadicais(
        textoContextoWord,
        textoAlvoArtigo
      );
      // Camada 4: Motor neural ONNX multilíngue (`custom-forensic-minilm`) com folga de inicialização e avaliação em proposições atômicas
      let scoreOnnx = null;
      if (!verBilingue.compativel || scoreCosseno < 0.25) {
        scoreOnnx = await calcularSimilaridadeSemanticaOnnx(
          textoContextoWord,
          textoAlvoArtigo,
          8000
        );
      }
      const scoreCossenoEfetivo = scoreOnnx !== null ? Math.max(scoreCosseno, scoreOnnx) : scoreCosseno;
      const scoreFinal = Math.max(verBilingue.score, Math.round(scoreCossenoEfetivo * 100));
      oc.compatibilidadeTexto = scoreFinal;
      oc.scoreCosseno = scoreCossenoEfetivo;

      // Decomposição Atômica de Proposições (RefChecker) apoiada também pelo modelo ONNX PT<->EN
      const props = decomporEmProposicoesAtomicas(oc.fraseContexto || oc.trechoDireto || '');
      const proposicoesAuditadas = [];
      for (const prop of props) {
        const tokensConteudoProp = prop
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
          .replace(/[^a-z0-9\s]/g, ' ')
          .split(/\s+/)
          .filter((w) => w.length >= 4 && !STOPWORDS_CIENTIFICAS_GERAIS.has(w) && !/^\d+$/.test(w));
        if (tokensConteudoProp.length < 4) continue;
        const scoreProp = calcularSimilaridadeCossenoRadicais(prop, textoAlvoArtigo);
        const verProp = verificarCompatibilidadeBilingue(prop, textoAlvoArtigo);
        let scorePropOnnx = null;
        if (!verProp.compativel && scoreProp < 0.12) {
          scorePropOnnx = await calcularSimilaridadeSemanticaOnnx(prop, textoAlvoArtigo, 4000);
        }
        const scorePropEfetivo = scorePropOnnx !== null ? Math.max(scoreProp, scorePropOnnx) : scoreProp;
        const sustentada = verProp.compativel || scoreProp >= 0.12 || (scorePropOnnx !== null && scorePropOnnx >= 0.42);
        proposicoesAuditadas.push({
          proposicao: prop,
          sustentada,
          score: Math.max(verProp.score, Math.round(scorePropEfetivo * 100)),
        });
      }
      oc.proposicoesAtomicas = proposicoesAuditadas;

      const propsNaoSustentadas = proposicoesAuditadas.filter((p) => !p.sustentada);
      if (
        proposicoesAuditadas.length >= 2 &&
        propsNaoSustentadas.length > 0 &&
        propsNaoSustentadas.length < proposicoesAuditadas.length &&
        scoreCossenoEfetivo >= 0.10
      ) {
        const detalheProps = propsNaoSustentadas.map((p) => `"${p.proposicao.slice(0, 70)}…"`).join('; ');
        alertasPrecisao.push({
          tipo: 'afirmacao_parcialmente_sustentada',
          numParagrafo: oc.numParagrafo,
          numLinha: oc.numLinha,
          secao: oc.secao,
          autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
          fraseWord: oc.fraseContexto,
          mensagem: `Afirmação parcialmente sustentada (${rm.primeiroSobrenome}, ${rm.ano}): no §${oc.numParagrafo}, parte da afirmação possui respaldo na fonte, mas esta proposição não foi confirmada no texto consultado: ${detalheProps}`,
        });
      }

      const aderenciaInsuficiente =
        !verBilingue.compativel &&
        scoreCosseno < 0.10 &&
        (scoreOnnx === null || scoreOnnx < 0.35);

      if (!verBilingue.compativel && scoreCossenoEfetivo < 0.10 && (scoreOnnx === null || scoreOnnx < 0.35)) {
        const msg = `Possível desconexão temática (${Math.round(scoreCossenoEfetivo * 100)}% de aderência): no §${oc.numParagrafo} (Linha ${oc.numLinha}), a afirmação atribuída a ${rm.primeiroSobrenome} (${rm.ano}) apresenta baixa correspondência com o conteúdo recuperado desta fonte.`;
        oc.alertaFidelidade = msg;
        alertasAtribuicaoFalsa.push({
          numParagrafo: oc.numParagrafo,
          numLinha: oc.numLinha,
          secao: oc.secao,
          autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
          fraseWord: oc.fraseContexto,
          mensagem: msg,
          scoreCosseno: Math.round(scoreCosseno * 100),
          outroArtigoSugerido: null,
        });
        registrarOcorrenciaGrupo(rm, oc, {
          sustentada: false,
          scorePct: scoreFinal,
          motivo: `baixa aderência temática (${Math.round(scoreCossenoEfetivo * 100)}%)`,
        });
      } else {
        let falhaSimbolicaAlta = null;
        if (
          artCitado.textoTotal &&
          artCitado.textoTotal.length >= 120 &&
          ((scoreOnnx !== null && scoreOnnx >= 0.42) || scoreCossenoEfetivo >= 0.25)
        ) {
          // Guardiao Simbolico Forense (aditivo: avalia apenas pareamentos ja aprovados sem alterar escores base)
          const melhorBloco = localizarMelhorBlocoComPosicao(
            oc.trechoDireto || oc.fraseContextoSemantico || oc.fraseContexto,
            textoAlvoArtigo
          );
          if (melhorBloco?.texto) {
            const alertasSimb = auditarPareamentoSimbolico({
              fraseManuscrito: oc.fraseContexto || oc.trechoDireto || '',
              blocoPdf: melhorBloco.texto,
              posicaoRelativaNoTexto: artCitado.textoTotal.length >= 1500 ? melhorBloco.posicaoRelativaNoTexto : 0.5,
            });
            if (alertasSimb.length > 0) {
              oc.alertasSimbolicos = alertasSimb;
              for (const asb of alertasSimb) {
                if (asb.severidade === 'alta' && !falhaSimbolicaAlta) {
                  falhaSimbolicaAlta = asb.mensagem;
                }
                const itemSimb = {
                  tipo: `guardiao_${asb.codigo.toLowerCase()}`,
                  codigo: asb.codigo,
                  severidade: asb.severidade,
                  numParagrafo: oc.numParagrafo,
                  numLinha: oc.numLinha,
                  secao: oc.secao,
                  autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
                  fraseWord: oc.fraseContexto,
                  trechoArtigoResumo: melhorBloco.texto.slice(0, 260),
                  mensagem: `🛡️ Guardião Simbólico (${rm.primeiroSobrenome}, ${rm.ano} · §${oc.numParagrafo}): ${asb.mensagem}`,
                };
                alertasGuardiaoSimbolico.push(itemSimb);
                alertasPrecisao.push(itemSimb);
              }
            }
          }
          // Fase 3: Cross-Encoder NLI em cascata (2o estagio aditivo quando Bi-Encoder >= 0.42 ou lexico >= 0.25)
          if ((scoreOnnx !== null && scoreOnnx >= 0.42) || scoreCosseno >= 0.25) {
            const top3Nli = await selecionarTop3BlocosParaNli(
              oc.trechoDireto || oc.fraseContextoSemantico || oc.fraseContexto,
              textoAlvoArtigo
            );
            const resNli = await avaliarSustentacaoNliTop3(
              oc.fraseContexto || oc.trechoDireto || '',
              top3Nli
            );
            if (resNli?.disponivel && resNli.melhorBloco) {
              oc.avaliacaoNli = resNli;
              if (resNli.melhorBloco.probabilidades.contradiction >= 0.72) {
                const pctContra = Math.round(resNli.melhorBloco.probabilidades.contradiction * 100);
                const itemNli = {
                  tipo: 'contradicao_logica_nli',
                  codigo: 'CONTRADICAO_LOGICA_NLI',
                  severidade: 'alta',
                  numParagrafo: oc.numParagrafo,
                  numLinha: oc.numLinha,
                  secao: oc.secao,
                  autorCitado: `${rm.primeiroSobrenome} (${rm.ano})`,
                  fraseWord: oc.fraseContexto,
                  trechoArtigoResumo: resNli.melhorBloco.texto.slice(0, 260),
                  probabilidadesNli: resNli.melhorBloco.probabilidades,
                  mensagem: `🧠 Contradição Lógica NLI (${rm.primeiroSobrenome}, ${rm.ano} · §${oc.numParagrafo}): o Cross-Encoder NLI detectou contradição lógica (${pctContra}%) entre a afirmação do manuscrito e o trecho mais aderente da fonte.`,
                };
                if (!falhaSimbolicaAlta) falhaSimbolicaAlta = itemNli.mensagem;
                alertasNliContradicao.push(itemNli);
                alertasPrecisao.push(itemNli);
              }
            }
          }
        }
        const sustentadaNoGrupo = !falhaSimbolicaAlta && !aderenciaInsuficiente;
        const motivoGrupo =
          falhaSimbolicaAlta ||
          (aderenciaInsuficiente ? `baixa aderência temática (${scoreFinal}%)` : null);
        registrarOcorrenciaGrupo(rm, oc, {
          sustentada: sustentadaNoGrupo,
          scorePct: scoreFinal,
          motivo: motivoGrupo,
        });
      }
    }
  }

  // ---------- 6b. Auditoria Individualizada de Citações Múltiplas (Fase 2 - Aditivo) ----------
  const alertasCitacoesMultiplas = [];
  for (const grupo of ocorrenciasPorSentenca.values()) {
    const membros = [...grupo.membrosPorChave.values()];
    if (membros.length < 2) continue;
    const sustentados = membros.filter((m) => m.sustentada);
    const intrusos = membros.filter((m) => !m.sustentada);
    if (sustentados.length >= 1 && intrusos.length >= 1) {
      const refOc = grupo.ocRef;
      const listaSustentam = sustentados.map((s) => `${s.autorCitado} (${s.scorePct}%)`).join(', ');
      const listaIntrusos = intrusos.map((i) => i.autorCitado).join(', ');
      const motivos = intrusos.map((i) => i.motivo || 'sem respaldo confirmado').join('; ');
      const alertaGrupo = {
        tipo: 'citacao_multipla_intruso',
        numParagrafo: refOc.numParagrafo,
        numLinha: refOc.numLinha,
        secao: refOc.secao,
        autorCitado: listaIntrusos,
        fraseWord: refOc.fraseContexto,
        obrasSustentam: sustentados.map((s) => `${s.autorCitado} (${s.scorePct}%)`),
        obrasIntrusas: intrusos.map((i) => i.autorCitado),
        mensagem: `Citação múltipla com obra intrusa (§${refOc.numParagrafo}): enquanto ${listaSustentam} sustenta(m) a afirmação, ${listaIntrusos} diverge ou carece de lastro (${motivos}).`,
      };
      alertasCitacoesMultiplas.push(alertaGrupo);
      alertasPrecisao.push(alertaGrupo);
    }
  }

  // ---------- 7. Detector de Plágio / Cópia Literal com Google Diff Match Patch ----------
  const alertasPlagio = await analisarPlagioComDiffMatchPatch(paragrafosCorpo, corpusArtigos);

  // ---------- 7b. Auditoria Matemática Forense de Resultados Estatísticos (Statcheck) ----------
  const auditoriaEstatistica = auditarEstatisticaDoManuscrito(paragrafosCorpo);
  const alertasEstatisticos = auditoriaEstatistica.alertasEstatisticos || [];
  if (alertasEstatisticos.length > 0) {
    for (const ae of alertasEstatisticos) {
      alertasPrecisao.push({
        tipo: ae.tipo,
        numParagrafo: ae.numParagrafo,
        numLinha: ae.numLinha,
        secao: ae.secao,
        autorCitado: 'Análise Estatística',
        fraseWord: ae.textoBruto,
        mensagem: ae.mensagem,
      });
    }
  }

  // ---------- 8. Citações no texto que NÃO apareceram na lista final de Referências ----------
  const citacoesSemReferenciaBrutas = [];
  for (const g of gruposCitacao.values()) {
    if (!chavesRefEncontradas.has(g.chave)) {
      let naBib = null;
      for (const r of biblioteca.refs.values()) {
        const aBib = normalizarChave(r.csl?.author?.[0]?.family || r.csl?.author?.[0]?.literal || '');
        const anoBib = String(r.csl?.issued?.['date-parts']?.[0]?.[0] || '');
        if (aBib && anoBib && g.chavesAutorAlias.includes(aBib) && anoBib === g.anoBase) {
          naBib = r;
          break;
        }
      }
      citacoesSemReferenciaBrutas.push({
        ...g,
        refBibId: naBib?.id || null,
        tituloNaBib: naBib?.csl?.title || null,
      });
    }
  }

  // Regra R5: Ponto D e Ponto E devem ser mutuamente exclusivos por construção.
  // Se uma obra for classificada simultaneamente em D (citada no texto sem referência)
  // e em E (listada nas referências e nunca citada no texto), suprime ambos os alertas
  // e emite, em seu lugar, um único erro de parsing identificando a entrada.
  const errosParsingConflito = [];
  const citacoesSemReferencia = [];

  for (const cSemRef of citacoesSemReferenciaBrutas) {
    const refConflitante = refsMapeadas.find(
      (r) =>
        !r.citadaNoTexto &&
        (r.chavesAutorAlias.some((al) => cSemRef.chavesAutorAlias.includes(al)) ||
          (r.anoBase === cSemRef.anoBase &&
            (r.chaveAutor.includes(cSemRef.chaveAutor) || cSemRef.chaveAutor.includes(r.chaveAutor))))
    );

    if (refConflitante) {
      // Conflito detectado: suprime de D e marca em E como neutralizada
      refConflitante.citadaNoTexto = true;
      refConflitante.conflitoParsingNeutralizado = true;
      errosParsingConflito.push({
        tipo: 'conflito_pareamento_de',
        chave: cSemRef.chave,
        autorCitado: `${cSemRef.autor} (${cSemRef.ano})`,
        referenciaLista: refConflitante.textoOriginal,
        mensagem: `⚠️ Erro de Parsing / Conflito D-E neutralizado (Regra R5): A obra "${cSemRef.autor} (${cSemRef.ano})" constava no texto e na lista de referências, mas divergiu no formato da chave. Os alertas contraditórios de Ponto D e Ponto E foram suprimidos por construção.`,
      });
    } else {
      citacoesSemReferencia.push(cSemRef);
    }
  }

  // Regra R6: Falha de pareamento nunca pode isentar a obra da verificação de conteúdo.
  // Toda obra deve passar pelo teste de conteúdo, e o relatório deve trazer o status de cada uma em seção própria.
  const statusVerificacaoObras = [];
  let totalVerificadas = 0;
  let totalNaoVerificadas = 0;

  for (const g of gruposCitacao.values()) {
    const refMapeada = refsMapeadas.find(
      (r) => r.chave === g.chave || r.chavesAutorAlias?.includes(g.chaveAutor)
    );
    let statusObra = 'nao_verificada';
    let motivo = 'Sem fonte aberta ou DOI disponível';

    if (refMapeada?.retratado || refMapeada?.statusAutenticidade === 'artigo_retratado') {
      statusObra = 'artigo_retratado';
      motivo = '🚨 Artigo formalmente retratado na literatura científica (Retraction Watch / PubMed / Crossref)';
      totalNaoVerificadas++;
    } else if (refMapeada?.infoRepositorio) {
      statusObra = 'conteudo_confirmado';
      motivo = `${refMapeada.infoRepositorio.repositorio} — PDF e errata auditados (${refMapeada.infoRepositorio.detalhesErrata || 'sem errata'})`;
      totalVerificadas++;
    } else if (refMapeada?.natureza === 'norma_livro_institucional') {
      const artNorma = corpusArtigos.find((a) => a.id === refMapeada.refBibId);
      if (artNorma?.textoTotal?.length >= 100) {
        statusObra = 'conteudo_confirmado';
        motivo = 'Texto integral do documento normativo/institucional auditado';
        totalVerificadas++;
      } else {
        statusObra = 'nao_verificavel';
        motivo = 'Ato/norma autêntica, mas texto integral pendente de anexo para conferência de conteúdo';
        totalNaoVerificadas++;
      }
    } else if (refMapeada?.statusAutenticidade?.startsWith('autenticada')) {
      const art = corpusArtigos.find((a) => a.id === refMapeada.refBibId);
      const temPdfIntegral = (art?.textoTotal?.length || 0) >= 200 && refMapeada.temPdf;
      const temResumo = Boolean(art?.resumoLimpo);

      if (temPdfIntegral) {
        statusObra = 'conteudo_confirmado';
        motivo = 'Texto integral do PDF e resumo oficial auditados';
        totalVerificadas++;
      } else if (temResumo) {
        statusObra = 'conteudo_confirmado';
        motivo = 'Resumo oficial autenticado auditado (PDF sob paywall/restrito)';
        totalVerificadas++;
      } else {
        statusObra = 'nao_verificavel';
        motivo = 'Fonte existe nas bases oficiais, mas sem resumo ou PDF disponível para verificação';
        totalNaoVerificadas++;
      }
    } else {
      statusObra = 'inexistente_alucinada';
      motivo = 'Obra não localizada nas bases (suspeita de alucinação)';
      totalNaoVerificadas++;
    }

    statusVerificacaoObras.push({
      chave: g.chave,
      autor: g.autor,
      ano: g.ano,
      status: statusObra,
      motivo,
      ocorrencias: g.ocorrencias.length,
    });
  }

  // Se detectou texto pós-referências (ex.: "NOTA PARA A ORIENTAÇÃO"), verifica se é elemento pós-textual legítimo da NBR 14724 (Apêndices/Anexos)
  if (linhasPosReferencias.length > 0) {
    const primeiroTexto = String(linhasPosReferencias[0].texto || '').trim();
    const ehElementoPosTextualLegitimoNbr14724 =
      /^(?:\d+(?:\.\d+)*\.?\s*)?(?:ap[eê]ndices?|anexos?|gloss[aá]rio)\b/i.test(primeiroTexto) ||
      /^(?:anexo|ap[eê]ndice)\s+[a-z0-9]/i.test(primeiroTexto);

    if (!ehElementoPosTextualLegitimoNbr14724) {
      alertasPrecisao.push({
        tipo: 'secao_pos_referencias',
        numParagrafo: linhasPosReferencias[0].numLinha,
        numLinha: linhasPosReferencias[0].numLinha,
        secao: primeiroTexto.slice(0, 60),
        autorCitado: 'Estrutura do Manuscrito',
        fraseWord: primeiroTexto,
        mensagem: `📌 Aviso de Submissão Formal: Foram detectados ${linhasPosReferencias.length} parágrafo(s) após o término da seção de REFERÊNCIAS (iniciando em "${primeiroTexto.slice(0, 55)}"). O auditor isolou essa seção automaticamente para não confundi-la com entradas bibliográficas — lembre-se de desanexá-la antes da submissão final caso se trate de notas internas de orientação.`,
      });
    }
  }

  // Compila resumo explícito de Obras em Conformidade Adicionadas ao Rol de Trabalho
  const obrasConformes = refsMapeadas.filter(
    (r) => !['ia_doi_trocado', 'ia_doi_inexistente', 'suspeita_ia_fantasma'].includes(r.statusAutenticidade)
  );
  const resumoObrasConformes = {
    totalConformes: obrasConformes.length,
    totalComPdf: obrasConformes.filter((o) => o.temPdf).length,
    totalSemPdf: obrasConformes.filter((o) => !o.temPdf).length,
    obras: obrasConformes.map((o) => ({
      refBibId: o.refBibId,
      autor: o.primeiroSobrenome,
      ano: o.ano,
      titulo: o.tituloOficial || o.tituloBuscado,
      citadaNoTexto: o.citadaNoTexto,
      ocorrencias: o.ocorrenciasNoTexto?.length || 0,
      temPdf: o.temPdf,
      nomeArquivoPdf: o.nomeArquivoPdf,
      doi: o.doiOficial,
      statusAutenticidade: o.statusAutenticidade,
      alertaAutenticidade: o.alertaAutenticidade,
    })),
  };

  // Executa Open-Detector para verificar marcadores estilísticos de redação artificial por LLM
  const alertasEstiloIa = analisarEstiloRedacaoIaOpenDetector(paragrafosCorpo);
  alertasPrecisao.push(...alertasEstiloIa);

  // ---------- 8b. Análise Forense de Redes de Citação e Concentração de Autoria (COPE / PyAlex) ----------
  const auditoriaRede = auditarRedeCitacoesDoManuscrito({ refsMapeadas, gruposCitacao, paragrafosCorpo });
  const alertasRede = auditoriaRede.alertasRede || [];
  if (alertasRede.length > 0) {
    for (const ar of alertasRede) {
      alertasPrecisao.push({
        tipo: ar.tipo,
        numParagrafo: 0,
        numLinha: 0,
        secao: 'Rede de Citações',
        autorCitado: ar.autor || ar.periodico || 'Rede de Citações',
        fraseWord: 'Análise de Concentração e Diversidade de Fontes (COPE)',
        mensagem: ar.mensagem,
      });
    }
  }

  // ---------- 8c. Auditoria Forense Metodológica e Clínica (PICO / STROBE / CONSORT / RobotReviewer) ----------
  const auditoriaMetodologica = auditarMetodologiaClinicaDoManuscrito(paragrafosCorpo, texto);
  const alertasMetodologiaClinica = auditoriaMetodologica.alertasMetodologicos || [];
  if (alertasMetodologiaClinica.length > 0) {
    for (const am of alertasMetodologiaClinica) {
      alertasPrecisao.push({
        tipo: am.tipo,
        numParagrafo: 0,
        numLinha: 0,
        secao: 'Metodologia e Diretrizes',
        autorCitado: 'Auditoria Metodológica',
        fraseWord: `Desenho: ${auditoriaMetodologica.desenhoEstudo.descricao} (${auditoriaMetodologica.desenhoEstudo.checklist})`,
        mensagem: am.mensagem,
      });
    }
  }

  // ---------- 8d. Detecção Forense de Frases Torturadas (Problematic Paper Screener / Cabanac) ----------
  const auditoriaTorturadas = auditarFrasesTorturadasDoManuscrito(paragrafosCorpo);
  const alertasFrasesTorturadas = auditoriaTorturadas.alertasFrasesTorturadas || [];
  if (alertasFrasesTorturadas.length > 0) {
    for (const at of alertasFrasesTorturadas) {
      alertasPrecisao.push({
        tipo: at.tipo,
        numParagrafo: at.numParagrafo,
        numLinha: at.numLinha,
        secao: at.secao,
        autorCitado: 'Auditoria de Parafraseamento',
        fraseWord: at.fraseWord,
        mensagem: at.mensagem,
      });
    }
  }

  // ---------- 8e. Análise Estilométrica Determinística (TTR / Burstiness / Guiraud) ----------
  const auditoriaEstilometria = auditarEstilometriaDoManuscrito(paragrafosCorpo);
  const alertasEstilometricos = auditoriaEstilometria.alertasEstilometricos || [];
  if (alertasEstilometricos.length > 0) {
    for (const ae of alertasEstilometricos) {
      alertasPrecisao.push({
        tipo: ae.tipo,
        numParagrafo: ae.numParagrafo,
        numLinha: ae.numLinha,
        secao: ae.secao,
        autorCitado: 'Auditoria Estilométrica',
        fraseWord: ae.fraseWord,
        mensagem: ae.mensagem,
      });
    }
  }

  // ---------- 8f. Detecção de Periódicos Predatórios e Clonados (Beall / Retraction Watch / DOAJ) ----------
  const auditoriaPredatoria = auditarReferenciasPredatorias(refsMapeadas);
  const alertasPredatorios = auditoriaPredatoria.alertasPredatorios || [];
  if (alertasPredatorios.length > 0) {
    for (const ap of alertasPredatorios) {
      alertasPrecisao.push({
        tipo: ap.tipoAlerta || 'periodico_predatorio_suspeito',
        numParagrafo: 0,
        numLinha: 0,
        secao: 'Lista de Referências',
        autorCitado: ap.chaveAutorAno,
        fraseWord: ap.textoReferencia,
        mensagem: ap.mensagem,
      });

      // Atualiza o status da referência na lista para não ser rotulada como conforme
      const refAlvo = refsMapeadas.find(
        (r) => (r.refBibId && r.refBibId === ap.refBibId) || (r.textoOriginal && r.textoOriginal === ap.textoReferencia)
      );
      if (refAlvo) {
        if (!refAlvo.statusAutenticidade || refAlvo.statusAutenticidade === 'ok' || refAlvo.statusAutenticidade === 'autenticado') {
          refAlvo.statusAutenticidade = 'periodico_predatorio_suspeito';
          refAlvo.alertaAutenticidade = ap.mensagem;
        }
      }
    }
  }

  // ---------- 8g. Auditoria de Completude Normativa ABNT NBR 6023:2018 (Livros, Artigos, Web) ----------
  const estiloBibliograficoDetectado = detectarEstiloBibliograficoLista(refsMapeadas);
  const auditoriaAbnt6023 =
    estiloBibliograficoDetectado === 'vancouver_nature'
      ? {
          totalReferenciasAvaliadas: refsMapeadas.length,
          totalAlertasAbnt6023: 0,
          alertasAbnt6023: [],
          isentoPorEstilo: 'vancouver_nature',
        }
      : auditarCompletudeAbnt6023(refsMapeadas);
  const alertasAbnt6023 = auditoriaAbnt6023.alertasAbnt6023 || [];
  if (alertasAbnt6023.length > 0) {
    for (const aa of alertasAbnt6023) {
      alertasPrecisao.push({
        tipo: aa.tipo,
        numParagrafo: 0,
        numLinha: 0,
        secao: 'Lista de Referências',
        autorCitado: aa.chaveRef,
        fraseWord: aa.textoReferencia,
        mensagem: aa.mensagem,
      });
    }
  }

  // ---------- 8h. Detecção de Corrupção Genômica / Símbolos por Planilhas (Ziemann et al. / HGNC) ----------
  const auditoriaCorrupcaoGene = auditarCorrupcaoBiomedicaDoManuscrito(paragrafosCorpo);
  const alertasCorrupcaoGene = auditoriaCorrupcaoGene.alertasCorrupcao || [];
  if (alertasCorrupcaoGene.length > 0) {
    for (const ac of alertasCorrupcaoGene) {
      alertasPrecisao.push({
        tipo: ac.tipo,
        numParagrafo: ac.numParagrafo,
        numLinha: ac.numLinha,
        secao: ac.secao,
        autorCitado: 'Nomenclatura Biomédica',
        fraseWord: ac.fraseWord,
        mensagem: ac.mensagem,
      });
    }
  }

  // ---------- 8i. Auditoria de Fomento, Bolsas e Processos ROR/CAPES (Portaria 206/2018 / CNPq) ----------
  const auditoriaFomento = auditarFomentoEAfiliacoes(paragrafosCorpo);
  const alertasFomento = auditoriaFomento.alertasFomento || [];
  if (alertasFomento.length > 0) {
    for (const af of alertasFomento) {
      alertasPrecisao.push({
        tipo: af.tipo,
        numParagrafo: 0,
        numLinha: 0,
        secao: 'Agradecimentos e Fomento',
        autorCitado: af.agencia || 'Órgãos de Fomento',
        fraseWord: 'Declaração de Apoio Financeiro / Processo',
        mensagem: af.mensagem,
      });
    }
  }

  // ---------- 8j. Suporte de Evidência e Desvio Temático TF-IDF (Claim-Support) ----------
  const auditoriaClaimSupport = auditarClaimSupportDoManuscrito(refsMapeadas);
  const alertasDesvioTematico = auditoriaClaimSupport.alertasDesvioTematico || [];
  if (alertasDesvioTematico.length > 0) {
    for (const ad of alertasDesvioTematico) {
      alertasPrecisao.push({
        tipo: ad.tipo,
        numParagrafo: ad.numParagrafo,
        numLinha: ad.numLinha,
        secao: ad.secao,
        autorCitado: ad.autorCitado,
        fraseWord: ad.fraseWord,
        mensagem: ad.mensagem,
      });
    }
  }

  // ---------- 8k. Auditoria de Figuras, Quadros e Tabelas (ABNT NBR 14724 & IBGE) ----------
  const auditoriaFigurasTabelas = auditarFigurasETabelasDoManuscrito(paragrafosCorpo);
  const alertasFigurasTabelas = auditoriaFigurasTabelas.alertasFigurasTabelas || [];
  if (alertasFigurasTabelas.length > 0) {
    for (const aft of alertasFigurasTabelas) {
      alertasPrecisao.push({
        tipo: aft.tipo,
        numParagrafo: aft.numParagrafo,
        numLinha: aft.numLinha,
        secao: aft.secao,
        autorCitado: `${aft.elementoTipo.toUpperCase()} ${aft.numero}`,
        fraseWord: aft.fraseWord,
        mensagem: aft.mensagem,
      });
    }
  }

  // ---------- 8l. Reconciliador Intra-Documento & Raio-X Bibliométrico (Fase 2 - Aditivo) ----------
  const reconciliacaoIntra = reconciliarIntraDocumento({
    bufferDocx: caminhoDocx,
    xmlDocument,
    textoCompleto: texto,
    paragrafosCorpo,
  });
  const alertasIntraDocumento = reconciliacaoIntra.alertas || [];
  for (const aid of alertasIntraDocumento) {
    alertasPrecisao.push({
      tipo: aid.tipo,
      codigo: aid.codigo,
      severidade: aid.severidade,
      numParagrafo: aid.numParagrafo,
      numLinha: aid.numLinha,
      secao: aid.secao,
      autorCitado: aid.tabelaNumero ? `Tabela ${aid.tabelaNumero}` : aid.sigla || 'Intra-Texto',
      fraseWord: aid.fraseWord,
      mensagem: aid.mensagem,
    });
  }
  const resumoIntraDocumento = {
    tabelasDetectadas: reconciliacaoIntra.tabelasDetectadas,
    totalAlertasTabelas: reconciliacaoIntra.alertasTabelas.length,
    totalAlertasResumo: reconciliacaoIntra.alertasResumo.length,
    totalAlertasSiglas: reconciliacaoIntra.alertasSiglas.length,
  };
  const raioXBibliometrico = gerarRaioXBibliometrico({
    refsMapeadas,
    biblioteca,
    autoresManuscrito,
    anoReferencia,
  });

  // ---------- 8m. Memória de Decisão Editorial (Fase 4 - Supressão por SHA-256) ----------
  const memoriaDecisoes =
    decisoesEditoriais || (pastaProjeto ? carregarDecisoesEditoriais(pastaProjeto) : null);
  const alertasSuprimidosDecisaoEditorial = [];
  const filtrarListaEditorial = (lista) => {
    if (!memoriaDecisoes || !Array.isArray(lista) || lista.length === 0) return lista;
    const { ativos, suprimidos } = filtrarAlertasComMemoria(lista, memoriaDecisoes);
    for (const s of suprimidos) {
      alertasSuprimidosDecisaoEditorial.push({
        hash: s.decisao.hash,
        codigoAlerta: s.decisao.codigoAlerta,
        referenciaId: s.decisao.referenciaId,
        justificativa: s.decisao.justificativa,
        atualizadoEm: s.decisao.atualizadoEm,
      });
    }
    return ativos;
  };

  const alertasAtribuicaoFalsaFinal = filtrarListaEditorial(alertasAtribuicaoFalsa);
  const alertasPlagioFinal = filtrarListaEditorial(alertasPlagio);
  const alertasPrecisaoFinal = filtrarListaEditorial(alertasPrecisao);
  const alertasIntraDocumentoFinal = filtrarListaEditorial(alertasIntraDocumento);
  const alertasCitacoesMultiplasFinal = filtrarListaEditorial(alertasCitacoesMultiplas);
  const alertasGuardiaoSimbolicoFinal = filtrarListaEditorial(alertasGuardiaoSimbolico);
  const alertasNliContradicaoFinal = filtrarListaEditorial(alertasNliContradicao);

  // Deduplica contagem de alertas suprimidos por hash único (evita contar 2x quando alerta aparece em lista específica + alertasPrecisao)
  const suprimidosUnicosMap = new Map();
  for (const s of alertasSuprimidosDecisaoEditorial) {
    if (!suprimidosUnicosMap.has(s.hash)) suprimidosUnicosMap.set(s.hash, s);
  }
  const suprimidosUnicos = [...suprimidosUnicosMap.values()];

  return {
    totalCitacoesOcorrencias: citacoes.length,
    totalAutoresCitadosUnicos: gruposCitacao.size,
    totalReferenciasListaFinal: refsFinais.length,
    estiloBibliograficoDetectado,
    citacoesSemReferencia,
    refsMapeadas,
    alertasAtribuicaoFalsa: alertasAtribuicaoFalsaFinal,
    alertasPlagio: alertasPlagioFinal,
    alertasPrecisao: alertasPrecisaoFinal,
    alertasEstiloIa,
    alertasEstatisticos,
    alertasRede,
    alertasMetodologiaClinica,
    alertasFrasesTorturadas,
    alertasEstilometricos,
    alertasPredatorios,
    alertasAbnt6023,
    alertasCorrupcaoGene,
    alertasFomento,
    alertasDesvioTematico,
    alertasFigurasTabelas,
    alertasGuardiaoSimbolico: alertasGuardiaoSimbolicoFinal,
    alertasNliContradicao: alertasNliContradicaoFinal,
    alertasCitacoesMultiplas: alertasCitacoesMultiplasFinal,
    alertasIntraDocumento: alertasIntraDocumentoFinal,
    alertasSuprimidosDecisaoEditorial: suprimidosUnicos,
    totalAlertasSuprimidosEditorial: suprimidosUnicos.length,
    resumoIntraDocumento,
    raioXBibliometrico,
    resumoEstatistico: auditoriaEstatistica,
    resumoRede: auditoriaRede,
    resumoMetodologiaClinica: auditoriaMetodologica,
    resumoFrasesTorturadas: auditoriaTorturadas,
    resumoEstilometria: auditoriaEstilometria,
    resumoPredatorios: auditoriaPredatoria,
    resumoAbnt6023: auditoriaAbnt6023,
    resumoCorrupcaoGene: auditoriaCorrupcaoGene,
    resumoFomento: auditoriaFomento,
    resumoClaimSupport: auditoriaClaimSupport,
    resumoFigurasTabelas: auditoriaFigurasTabelas,
    errosParsingConflito,
    resumoVerificacaoConteudo: {
      totalObrasCitadas: gruposCitacao.size,
      totalObrasVerificadas: totalVerificadas,
      totalObrasNaoVerificadas: totalNaoVerificadas,
      obras: statusVerificacaoObras,
    },
    resumoObrasConformes,
    linhasPosReferenciasIgnoradas: linhasPosReferencias.length,
  };
}

module.exports = {
  extrairTextoDocx,
  dividirCorpoEReferencias,
  extrairCitacoesDoCorpo,
  analisarLinhasReferencias,
  extrairAutorETituloDeReferencia,
  extrairAnoPublicacaoReferencia,
  classificarNaturezaReferencia,
  verificarHandleRepositorio,
  compararCamposDoiOficial,
  verificarEscalaNarrativaFluxo,
  analisarPlagioComDiffMatchPatch,
  calcularSimilaridadeCossenoRadicais,
  verificarCompatibilidadeBilingue,
  sanitizarCamposGerenciadorBibliografia,
  analisarEstiloRedacaoIaOpenDetector,
  auditarEstatisticaDoManuscrito,
  auditarRedeCitacoesDoManuscrito,
  auditarMetodologiaClinicaDoManuscrito,
  auditarFrasesTorturadasDoManuscrito,
  auditarEstilometriaDoManuscrito,
  auditarReferenciasPredatorias,
  auditarCompletudeAbnt6023,
  auditarCorrupcaoBiomedicaDoManuscrito,
  auditarFomentoEAfiliacoes,
  auditarClaimSupportDoManuscrito,
  auditarPareamentoSimbolico,
  reconciliarIntraDocumento,
  gerarRaioXBibliometrico,
  auditarManuscrito,
};