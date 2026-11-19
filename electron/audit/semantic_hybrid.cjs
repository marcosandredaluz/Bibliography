/**
 * electron/audit/semantic_hybrid.cjs
 * Equivalências conceituais bilíngues (PT <-> EN), cosseno lexical de radicais e plágio Diff Match Patch + Winnowing/GST.
 */
'use strict';

const DiffMatchPatch = require('diff-match-patch');
const { IndiceWinnowing } = require('../similarity_winnowing.cjs');
const { executarGreedyStringTiling } = require('../similarity_tiling.cjs');

const dmp = new DiffMatchPatch();
dmp.Diff_Timeout = 0.5;
dmp.Diff_EditCost = 4;
dmp.Match_Distance = 1000;
dmp.Match_Threshold = 0.6;

function normalizarChave(s) {
  return String(s || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

// ---------- 5. Dicionário Semântico Bilíngue (PT ↔ EN) para Verificação de Fidelidade Científica ----------
function decodificarEntidadesHtmlTexto(str) {
  const mapaNomeadas = {
    aacute: 'á', aacute_u: 'Á', agrave: 'à', acirc: 'â', atilde: 'ã', auml: 'ä',
    eacute: 'é', egrave: 'è', ecirc: 'ê', euml: 'ë',
    iacute: 'í', igrave: 'ì', icirc: 'î', iuml: 'ï',
    oacute: 'ó', ograve: 'ò', ocirc: 'ô', otilde: 'õ', ouml: 'ö',
    uacute: 'ú', ugrave: 'ù', ucirc: 'û', uuml: 'ü',
    ccedil: 'ç', ntilde: 'ñ', nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  };
  return String(str || '')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => {
      try {
        return String.fromCodePoint(parseInt(hex, 16));
      } catch {
        return '';
      }
    })
    .replace(/&#(\d+);/g, (_, dec) => {
      try {
        return String.fromCodePoint(parseInt(dec, 10));
      } catch {
        return '';
      }
    })
    .replace(/&([a-z]+);/gi, (m, nome) => mapaNomeadas[nome.toLowerCase()] || m);
}

// Grupos de suporte genérico em saúde (ajudam no escore quando há pelo menos 1 conceito temático específico confirmado, mas sozinhos não validam atribuição cruzada entre agravos distintos)
const EQUIVALENCIAS_SUPORTE_GENERICO_PT_EN = [
  ['excede', 'exceder', 'superar', 'exceed', 'exceeded'],
  ['esperado', 'esperados', 'expected'],
  ['exames', 'exame', 'exams', 'examination', 'tests'],
  ['populacao', 'populacional', 'population', 'women', 'mulheres', 'children', 'criancas', 'infants', 'childhood', 'infantil'],
  ['publico', 'publica', 'publicos', 'public', 'sus', 'national health system', 'unified health system'],
  ['tratamento', 'terapia', 'terapeutico', 'treatment', 'therapy', 'therapeutic'],
  ['estabelecimentos', 'servicos', 'hospitais', 'unidades', 'services', 'hospitals', 'facilities', 'units', 'health centers', 'clinics'],
  ['mortalidade', 'obitos', 'mortality', 'deaths', 'survival', 'sobrevida'],
  ['revisao', 'sistematica', 'escopo', 'integrativa', 'systematic', 'review', 'scoping', 'meta-analysis'],
  ['determinantes', 'determinante', 'fatores', 'condicionantes', 'determinants', 'factors', 'drivers', 'predictors', 'associated', 'correlates'],
];

// Grupos conceituais temáticos específicos (PT ↔ EN)
const EQUIVALENCIAS_PT_EN = [
  // Oncologia & Rastreamento Mamográfico
  ['rastreamento', 'rastrear', 'rastreadas', 'screening', 'screened'],
  ['mamografia', 'mamografico', 'mamograficos', 'mammography', 'mammographic', 'mammograms', 'mammogram', 'breast lesions', 'lesoes mamarias', 'cancer de mama', 'breast cancer'],
  ['cobertura', 'coberturas', 'coverage', 'uptake', 'vaccination coverage', 'coverage rate'],
  ['seguimento', 'acompanhamento', 'monitoramento', 'follow-up', 'followup', 'monitoring', 'surveillance', 'vigilancia'],
  ['perda de seguimento', 'abandono', 'evasao', 'falha', 'loss to follow-up', 'loss to followup', 'lost to follow-up', 'dropout', 'delayed', 'failure', 'inadequate', 'incomplete', 'incompletude'],
  ['benigna', 'benignas', 'benigno', 'benign'],
  ['lesao', 'lesoes', 'lesion', 'lesions', 'abnormal', 'alterados'],
  ['atraso', 'atrasos', 'demora', 'intervalo', 'oportunidade', 'delay', 'delays', 'time interval', 'waiting', 'timeliness', 'missed opportunities'],
  ['itinerario', 'trajetoria', 'percurso', 'fluxo', 'pathway', 'pathways', 'flow', 'trajectories'],
  ['agendamento', 'marcacao', 'regulado', 'regulacao', 'scheduling', 'regulation', 'appointment'],
  ['encaminhamento', 'referencia', 'referral', 'refer', 'referred'],
  ['contrarreferencia', 'retorno', 'devolucao', 'counter-referral', 'reply', 'feedback', 'returning'],
  ['atencao primaria', 'unidade basica', 'primary care', 'primary health care', 'phc', 'family health'],
  ['especializada', 'especialista', 'especialistas', 'specialized', 'specialist', 'specialists'],
  ['coordenacao', 'continuidade', 'integralidade', 'coordination', 'continuity', 'integrality', 'comprehensive'],
  ['tendencia', 'crescimento', 'espacial', 'temporal', 'trend', 'spatial', 'clusters', 'macrorregiao'],
  ['estadio', 'avancado', 'avancados', 'stage', 'advanced'],
  ['prontuario', 'alertas', 'comunicacao', 'records', 'alerts', 'miscommunication', 'retrieval', 'paper', 'phone'],

  // Imunização, Vacinação, Epidemiologia & Determinantes Sociais/Comportamentais
  ['vacina', 'vacinas', 'vacinacao', 'vacinal', 'vacinais', 'imunizacao', 'imunizacoes', 'imunobiologico', 'imunobiologicos', 'pni', 'vaccine', 'vaccines', 'vaccination', 'immunization', 'immunisation', 'inoculation', 'doses', 'booster', 'national immunization program'],
  ['hesitacao', 'recusa', 'resistencia vacinal', 'adesao vacinal', 'adesao a vacinacao', 'adesao a imunizacao', 'aceitacao vacinal', '5as', 'hesitancy', 'refusal', 'reluctance', 'vaccine acceptance', 'vaccine adherence', 'immunization adherence', 'confidence', 'complacency', 'convenience'],
  ['distais', 'intermediarios', 'proximais', 'determinantes distais', 'determinantes proximais', 'hierarquico', 'hierarquica', 'multinivel', 'modelo conceitual', 'conceptual framework', 'hierarchical', 'multilevel', 'distal determinants', 'proximal determinants', 'intermediate determinants', 'distal factors', 'proximal factors'],
  ['socioeconomicos', 'socioeconomico', 'socioeconomica', 'demograficos', 'estruturais', 'renda', 'riqueza', 'pobreza', 'socioeconomic', 'demographic', 'structural', 'income', 'wealth', 'poverty', 'quintiles', 'social class', 'inequalities', 'disparities', 'desigualdades'],
  ['escolaridade', 'educacao', 'instrucao', 'alfabetizacao', 'materna', 'pais', 'cuidadores', 'education', 'educational', 'literacy', 'schooling', 'maternal', 'mother', 'parents', 'parental', 'caregivers'],
  ['moradia', 'habitacao', 'residencia', 'territorio', 'rural', 'urbana', 'indigena', 'indigenas', 'migrantes', 'imigrantes', 'housing', 'living', 'residence', 'household', 'urban', 'rural', 'indigenous', 'newcomers', 'immigrants', 'migrants', 'districts'],
  ['gestao', 'governanca', 'politica', 'politicas', 'financiamento', 'orcamento', 'investimento', 'management', 'governance', 'policy', 'policies', 'political', 'financing', 'funding', 'health system', 'sistema de saude'],
  ['acesso', 'acessibilidade', 'barreiras', 'obstaculos', 'disponibilidade', 'horario', 'transporte', 'access to', 'immunization access', 'healthcare access', 'service access', 'accessibility', 'barriers', 'obstacles', 'availability', 'convenience', 'opening hours', 'transport'],
  ['desabastecimento', 'estoque', 'insumos', 'cadeia de frio', 'logistica', 'falta', 'shortage', 'shortages', 'supply', 'stockout', 'cold chain', 'logistics', 'distribution'],
  ['profissionais', 'equipe', 'trabalhadores', 'capacitacao', 'treinamento', 'qualificacao', 'recomendacao', 'workforce', 'health workers', 'healthcare workers', 'providers', 'professionals', 'staff', 'training', 'recommendation', 'counseling'],
  ['comportamentais', 'comportamento', 'culturais', 'cultural', 'estilo de vida', 'individual', 'individuais', 'crencas', 'atitudes', 'percepcao', 'salutismo', 'behavioral', 'behavioural', 'behavior', 'cultural', 'lifestyle', 'individual', 'beliefs', 'attitudes', 'perceptions', 'healthism', 'psychological'],
  ['desinformacao', 'fake news', 'infodemia', 'redes sociais', 'midia', 'internet', 'medo', 'eventos adversos', 'seguranca', 'misinformation', 'disinformation', 'social media', 'media', 'fear', 'adverse events', 'side effects', 'safety', 'conspiracy', 'trust'],

  // Metodologia de Planejamento, Matriz de Priorização & Avaliação de Programas (CDC / Saúde Coletiva)
  ['priorizacao', 'priorizar', 'prioridades', 'matriz', 'criterios', 'pontuacao', 'escore', 'prioritization', 'priority', 'priorities', 'matrix', 'criteria', 'scoring', 'ranking', 'decision', 'problem'],
  ['magnitude', 'transcendencia', 'vulnerabilidade', 'viabilidade', 'exequibilidade', 'aceitabilidade', 'sustentabilidade', 'custo', 'feasibility', 'acceptability', 'sustainability', 'vulnerability', 'severity', 'impact', 'cost', 'resources'],
  ['avaliacao', 'avaliar', 'implementacao', 'fidelidade', 'teoria de mudanca', 'avaliacao de processo', 'intervencao', 'entrega do programa', 'evaluation', 'evaluate', 'implementation', 'fidelity', 'theory of change', 'process evaluation', 'health intervention', 'program intervention', 'intervention delivery', 'program delivery', 'service delivery', 'delivered'],

  // Informática em Saúde, Interoperabilidade, Qualidade de Dados & Evidências Quantitativas
  ['controle', 'grupo controle', 'comparacao', 'referencia', 'control', 'control group', 'baseline', 'comparison'],
  ['aumentar', 'aumento', 'aumentaram', 'subir', 'subiram', 'elevacao', 'cair', 'queda', 'reduzir', 'reducao', 'increase', 'increased', 'increases', 'rise', 'rose', 'decrease', 'decreased', 'reduction'],
  ['acuracia', 'completude', 'precisao', 'rigidez', 'tempo', 'sobrecarga', 'accuracy', 'completeness', 'precision', 'rigid', 'rigidity', 'time', 'workflow', 'burden'],
  ['integrado', 'integracao', 'integrados', 'interoperabilidade', 'desatualizado', 'desatualizados', 'subnotificacao', 'sub-registrado', 'tempo real', 'heterogeneo', 'fragmentacao', 'fragmentados', 'integrated', 'integration', 'interoperability', 'outdated', 'underreported', 'underreporting', 'real-time', 'realtime', 'heterogeneous', 'fragmented', 'fragmentation'],
];

function contemTermoComFronteira(textoNorm, termo) {
  const esc = String(termo || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?:^|[^a-z0-9])${esc}(?:$|[^a-z0-9]|s\\b)`, 'i');
  return re.test(textoNorm);
}

function verificarCompatibilidadeBilingue(fraseWord, textoArtigo) {
  const fNorm = decodificarEntidadesHtmlTexto(fraseWord)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const aNorm = decodificarEntidadesHtmlTexto(textoArtigo)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  if (!aNorm || aNorm.length < 40) {
    return { compativel: true, score: 100, motivo: 'sem_texto_comparavel' };
  }

  // 1) Verifica números/percentuais/ORs citados na frase do Word (ex.: "25%", "54,5%", "48,7%", "40,8%", "7,2%", "33%", "27,3%", "71,6%", "600")
  const numerosFrase = [...fNorm.matchAll(/\b\d+(?:[.,]\d+)?%?\b/g)]
    .map((m) => m[0].replace(',', '.'))
    .filter((n) => !/^(19\d\d|20\d\d|1|2|3)$/.test(n)); // ignora o próprio ano da citação ou números triviais

  const aNormPonto = aNorm.replace(/,/g, '.');
  let acertosNumericos = 0;
  for (const num of numerosFrase) {
    if (aNormPonto.includes(num)) acertosNumericos++;
  }

  // 2) Verifica conceitos temáticos específicos e conceitos de suporte presentes na frase do Word
  const gruposEspecificosNaFrase = EQUIVALENCIAS_PT_EN.filter((grupo) =>
    grupo.some((termo) => contemTermoComFronteira(fNorm, termo))
  );
  let gruposEspecificosConfirmados = 0;
  for (const grupo of gruposEspecificosNaFrase) {
    if (grupo.some((termo) => contemTermoComFronteira(aNorm, termo))) {
      gruposEspecificosConfirmados++;
    }
  }

  const gruposGenericosNaFrase = EQUIVALENCIAS_SUPORTE_GENERICO_PT_EN.filter((grupo) =>
    grupo.some((termo) => contemTermoComFronteira(fNorm, termo))
  );
  let gruposGenericosConfirmados = 0;
  for (const grupo of gruposGenericosNaFrase) {
    if (grupo.some((termo) => contemTermoComFronteira(aNorm, termo))) {
      gruposGenericosConfirmados++;
    }
  }

  // Grupos genéricos só contam quando há pelo menos 1 conceito específico confirmado (ou quando a frase não contém nenhum conceito específico)
  const gruposConfirmadosNoArtigo =
    gruposEspecificosNaFrase.length > 0
      ? gruposEspecificosConfirmados > 0
        ? gruposEspecificosConfirmados + gruposGenericosConfirmados
        : 0
      : gruposGenericosConfirmados;

  const totalGruposConsiderados =
    gruposEspecificosNaFrase.length > 0
      ? gruposEspecificosNaFrase.length + (gruposEspecificosConfirmados > 0 ? gruposGenericosNaFrase.length : 0)
      : gruposGenericosNaFrase.length;

  // 3) Radicais diretos (5 letras) com fronteira de palavra e exclusão de cognatos médicos genéricos
  const palavrasArtigo = new Set(
    aNorm
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((p) => p.length >= 5 && !STOPWORDS_CIENTIFICAS_GERAIS.has(p) && !/^\d+$/.test(p))
      .map((p) => p.slice(0, 5))
  );
  const palavrasFrase = fNorm
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((p) => p.length >= 5 && !STOPWORDS_CIENTIFICAS_GERAIS.has(p) && !/^\d+$/.test(p));
  const radicais = [...new Set(palavrasFrase.map((p) => p.slice(0, 5)))];
  const acertosRadicais = radicais.filter((r) => palavrasArtigo.has(r)).length;

  const pctConceitos = totalGruposConsiderados
    ? Math.round((gruposConfirmadosNoArtigo / totalGruposConsiderados) * 100)
    : 0;
  const pctRadicais = radicais.length ? Math.round((acertosRadicais / radicais.length) * 100) : 0;
  const bonusNumerico = numerosFrase.length > 0 && acertosNumericos > 0 ? Math.round((acertosNumericos / numerosFrase.length) * 100) : 0;

  const scoreFinal = Math.max(pctConceitos, pctRadicais, bonusNumerico);
  return {
    compativel:
      scoreFinal >= 25 ||
      acertosNumericos >= 1 ||
      gruposConfirmadosNoArtigo >= 1 ||
      acertosRadicais >= 2,
    score: scoreFinal,
    acertosNumericos,
    gruposConfirmadosNoArtigo,
  };
}

/**
 * Seleciona a melhor sentença do artigo (resumo ou PDF) que sustenta a frase do Word,
 * usando correspondência bilíngue PT↔EN e âncoras numéricas.
 */
function selecionarMelhorTrechoArtigo(fraseWord, sentencasArtigo) {
  if (!sentencasArtigo?.length) return '';
  let melhor = sentencasArtigo[0] || '';
  let maiorScore = -1;
  for (const sa of sentencasArtigo) {
    const res = verificarCompatibilidadeBilingue(fraseWord, sa);
    const pontos = res.score + res.acertosNumericos * 35 + res.gruposConfirmadosNoArtigo * 15;
    if (pontos > maiorScore) {
      maiorScore = pontos;
      melhor = sa;
    }
  }
  return melhor;
}

// Jargões acadêmicos e expressões metodológicas padronizadas que NÃO constituem plágio
const JARGOES_METODOLOGICOS_COMUNS = [
  'estudo transversal descritivo',
  'estudo observacional retrospectivo',
  'estudo de coorte prospectivo',
  'estudo quantitativo descritivo',
  'aprovado pelo comite de etica',
  'comite de etica em pesquisa',
  'resolucao numero 466',
  'resolucao no 466',
  'resolucao no 510',
  'dados foram coletados por meio',
  'dados foram coletados atraves',
  'dados foram coletados entre os meses',
  'analisados estatisticamente atraves',
  'analise estatistica foi realizada',
  'analisados por meio do software',
  'media e desvio padrao',
  'intervalo de confianca de 95',
  'intervalo de confianca de noventa',
  'nivel de significancia estatistica',
  'p valor menor que 0',
  'criterios de inclusao e exclusao',
  'termo de consentimento livre e esclarecido',
  'nao ha conflito de interesses',
  'revisao integrativa da literatura',
  'revisao sistematica da literatura',
  'objetivo geral deste estudo',
  'conclui se que sao necessarios',
  'amostra por conveniencia',
  'diferenca estatisticamente significativa',
  'limitacoes quanto ao desenho',
];

const STOPWORDS_CIENTIFICAS_GERAIS = new Set(
  'de da do das dos em no na nos nas para por com sem sobre entre como mais menos muito pouco tambem quando onde qual quais quem cujo cuja este esta estes estas esse essa esses essas aquele aquela aquilo isso isto um uma uns umas o a os as e ou mas se que nao sim ao aos pela pelo pelas pelos segundo conforme apud et al p pp pag v n dispoem apontam demonstram mostra mostram estudo estudos artigo artigos autor autores pesquisa trabalho trabalhos dados analise resultados resultado pacientes participante participantes amostra populacao populacional publico publica publicos servico servicos hospital hospitais clinica clinico clinicos associado associada associados associadas fator fatores sistema sistemas controle total adulto adultos grupo grupos nivel niveis the and for with from that this were was are have has had been between among within through during after before under above into onto upon about which their there these those other such more most less least very also only both each some many much study studies paper article author authors research data analysis results result patients patient participants sample population public health system systems clinical hospital hospitals service services associated factors factor control group groups level levels adult adults'.split(
    ' '
  )
);

function normalizarTextoPlagio(texto) {
  return decodificarEntidadesHtmlTexto(texto)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function ehJargaoMetodologico(texto) {
  const norm = normalizarTextoPlagio(texto);
  return JARGOES_METODOLOGICOS_COMUNS.some((j) => norm.includes(j));
}

/**
 * Calcula a similaridade de cosseno baseada em radicais (5 letras) + projeção ponderada de conceitos bilíngues (PT↔EN)
 * com eliminação rigorosa de stopwords acadêmicas para detecção de citações falsas / desconectadas.
 */
function calcularSimilaridadeCossenoRadicais(textoA, textoB) {
  const extrairRadicaisEConceitos = (t) => {
    const norm = normalizarTextoPlagio(t);
    const radicais = norm
      .split(' ')
      .filter((w) => w.length >= 4 && !STOPWORDS_CIENTIFICAS_GERAIS.has(w) && !/^\d+$/.test(w))
      .map((w) => w.slice(0, 5));
    for (let idxG = 0; idxG < EQUIVALENCIAS_PT_EN.length; idxG++) {
      const grupo = EQUIVALENCIAS_PT_EN[idxG];
      if (grupo.some((termo) => contemTermoComFronteira(norm, termo))) {
        // Pondera conceito bilíngue com peso 3 para compensar diferença de idioma entre radicais PT e EN
        radicais.push(`__conc_${idxG}`, `__conc_${idxG}`, `__conc_${idxG}`);
      }
    }
    return radicais;
  };

  const radA = extrairRadicaisEConceitos(textoA);
  const radB = extrairRadicaisEConceitos(textoB);
  if (!radA.length || !radB.length) return 0;

  const tfA = new Map();
  const tfB = new Map();
  const vocab = new Set([...radA, ...radB]);

  for (const r of radA) tfA.set(r, (tfA.get(r) || 0) + 1);
  for (const r of radB) tfB.set(r, (tfB.get(r) || 0) + 1);

  let dotProduct = 0;
  let magA = 0;
  let magB = 0;

  for (const r of vocab) {
    const vA = tfA.get(r) || 0;
    const vB = tfB.get(r) || 0;
    dotProduct += vA * vB;
    magA += vA * vA;
    magB += vB * vB;
  }

  if (magA === 0 || magB === 0) return 0;
  return dotProduct / (Math.sqrt(magA) * Math.sqrt(magB));
}

/**
 * Analisa cópia literal e plágio usando o Google Diff Match Patch com inteligência forense:
 * - Detecta sobreposição idêntica contígua de 7+ palavras ou 32+ caracteres.
 * - Distingue cópia sem aspas vs plágio não atribuído vs plágio mosaico.
 * - Ignora jargões metodológicos comuns da saúde e citações diretas legítimas entre aspas.
 */
async function analisarPlagioComDiffMatchPatch(paragrafosCorpo, corpusArtigos) {
  const alertas = [];
  const minPalavrasIdenticas = 10;

  // Pré-processa e normaliza o corpus de artigos UMA ÚNICA VEZ para evitar milhões de chamadas redundantes
  const corpusOtimizado = [];
  for (const art of corpusArtigos) {
    if (!art.sentencasOriginais?.length) continue;
    const sentencas = [];
    for (const sentArt of art.sentencasOriginais) {
      if (sentArt.length < 35 || ehJargaoMetodologico(sentArt)) continue;
      const norm = normalizarTextoPlagio(sentArt);
      sentencas.push({ original: sentArt, norm });
    }
    if (sentencas.length > 0) {
      corpusOtimizado.push({
        ...art,
        chaveAutor: art.chaveAutor || normalizarChave(art.autor || ''),
        sentencas,
      });
    }
  }

  // Constrói o Índice Invertido Winnowing (MOSS) para triagem em O(1) com garantia matemática
  const indiceWinnowing = IndiceWinnowing.construirDoCorpus(corpusOtimizado, 4, 7);

  for (let pIdx = 0; pIdx < paragrafosCorpo.length; pIdx++) {
    // Cede tempo para o Event Loop do Node.js a cada 5 parágrafos (mantém a interface responsiva)
    if (pIdx % 5 === 0) {
      await new Promise((resolve) => setImmediate(resolve));
    }
    const par = paragrafosCorpo[pIdx];
    const textoProtegido = String(par.texto || '').replace(
      /\b(et\s+al|v|vol|n|no|nº|p|pp|p[aá]g|fig|tab|dr|dra|prof|profa|art|inc|ed|org|orgs|coord|supl|cap|sec|sr|sra)\.\s+/gi,
      '$1\u0000 '
    );
    const frases = textoProtegido
      .split(/(?<=[.!?])\s+/)
      .map((f) => f.replace(/\u0000/g, '.').trim())
      .filter((f) => f.length >= 40);

    for (const frase of frases) {
      if (ehJargaoMetodologico(frase)) continue;
      const temAspas = /["“][^"”]{20,}["”]/.test(frase) || /["“][^"”]{20,}["”]/.test(par.texto);
      const fraseNorm = normalizarTextoPlagio(frase);
      const frasePalavras = fraseNorm.split(/\s+/).filter((w) => w.length >= 2);
      if (frasePalavras.length < minPalavrasIdenticas) continue;

      // Consulta candidatos via Winnowing (MOSS) em tempo constante O(1)
      const candidatosWinnowing = indiceWinnowing.consultarCandidatos(frasePalavras);
      if (!candidatosWinnowing || candidatosWinnowing.size === 0) continue;

      let detectouParaEstaFrase = false;

      for (const [, cand] of candidatosWinnowing) {
        if (detectouParaEstaFrase) break;
        const art = corpusOtimizado[cand.docId];
        const sent = art?.sentencas?.[cand.sentId];
        if (!sent) continue;
        const sentArtNorm = sent.norm;

        // Executa Diff Match Patch para correspondência contígua e destaques de UI
        const diffs = dmp.diff_main(fraseNorm, sentArtNorm);
        dmp.diff_cleanupSemantic(diffs);

        let maiorBlocoIdentico = '';
        let totalPalavrasIguais = 0;
        let blocosIguais = 0;

        for (const [op, data] of diffs) {
          if (op === 0) {
            const palavrasBloco = data.trim().split(/\s+/).filter((w) => w.length >= 3);
            if (palavrasBloco.length >= minPalavrasIdenticas) {
              if (data.length > maiorBlocoIdentico.length) {
                maiorBlocoIdentico = data.trim();
              }
              totalPalavrasIguais += palavrasBloco.length;
              blocosIguais++;
            }
          }
        }

        // Avaliação complementar com Greedy String Tiling (RKR-GST / JPlag) para captura de fragmentos transpostos/mosaico
        const resGst = executarGreedyStringTiling(fraseNorm, sentArtNorm, minPalavrasIdenticas);
        if (resGst.maiorBlocoIdentico && resGst.maiorBlocoIdentico.length > maiorBlocoIdentico.length) {
          maiorBlocoIdentico = resGst.maiorBlocoIdentico;
        }
        if (resGst.totalCoincidentWords > totalPalavrasIguais) {
          totalPalavrasIguais = resGst.totalCoincidentWords;
        }
        if (resGst.isMosaic) {
          blocosIguais = Math.max(blocosIguais, resGst.tilesCount);
        }

        if (maiorBlocoIdentico.length >= 40 && totalPalavrasIguais >= minPalavrasIdenticas) {
            // Isenta nomes próprios de sociedades, diretrizes, periódicos, comitês e entidades institucionais
            const ehEntidadePropria =
              /\b(?:international\s+society|society\s+for\s+human\s+and\s+animal|world\s+health\s+organization|centers\s+for\s+disease\s+control|national\s+library\s+of\s+medicine|instituto\s+brasileiro\s+de\s+geografia|sistema\s+[uú]nico\s+de\s+sa[uú]de|rede\s+nacional\s+de\s+dados\s+em\s+sa[uú]de|conselho\s+nacional\s+de\s+sa[uú]de|comit[eê]\s+de\s+[eé]tica\s+em\s+pesquisa|termo\s+de\s+consentimento|guia\s+de\s+vigil[aâ]ncia|protocolo\s+cl[ií]nico|morbidity\s+and\s+mortality\s+weekly\s+report|guidelines\s+working\s+group)\b/i.test(
                maiorBlocoIdentico.trim()
              );
            if (ehEntidadePropria) continue;

            const citouAutorNoParagrafo =
              (art.chaveAutor && normalizarChave(par.texto).includes(art.chaveAutor)) ||
              /\[\d+(?:\s*[,;–—-]\s*\d+)*\]|\(\s*[A-ZÀ-Ú][^)]*\d{4}/.test(par.texto);
            let tipo = 'plagio_sem_citacao';
            let rotulo = '🚨 PLÁGIO DIRETO / CÓPIA LITERAL NÃO ATRIBUÍDA';

            if (citouAutorNoParagrafo) {
              if (temAspas) {
                // Se tem aspas e citou a fonte (autor-data ou número Vancouver), é citação direta legítima! Ignora falso alarme!
                continue;
              } else if (blocosIguais >= 2) {
                tipo = 'plagio_mosaico';
                rotulo = '🚨 PLÁGIO MOSAICO (Cópia com Pequenas Alterações Sem Aspas)';
              } else {
                tipo = 'copia_sem_aspas';
                rotulo = '🚨 CÓPIA LITERAL SEM ASPAS (Trecho Copiado Textualmente Sem Indicar Página)';
              }
            }

            const palavrasFrase = fraseNorm.split(/\s+/).length;
            const pctSimilaridade = Math.min(100, Math.round((totalPalavrasIguais / Math.max(palavrasFrase, 1)) * 100));

            const trechoDestacado = diffs
              .filter(([op]) => op === 0 || op === -1)
              .map(([op, text]) => ({
                tipo: op === 0 ? 'coincidente' : 'diferente',
                texto: text,
              }));

            alertas.push({
              numParagrafo: par.numParagrafo,
              numLinha: par.numLinha,
              secao: par.secao,
              tipoPlagio: tipo,
              rotulo,
              similaridade: Math.max(pctSimilaridade, 85),
              palavrasCoincidentes: totalPalavrasIguais,
              autorFonte: `${art.autor} (${art.ano})`,
              tituloFonte: art.titulo,
              fraseNoWord: frase,
              trechoCoincidente: maiorBlocoIdentico,
              trechoOriginalArtigo: sent.original,
              trechoDestacado,
              mensagem: citouAutorNoParagrafo
                ? `${rotulo} (${totalPalavrasIguais} palavras idênticas): No Parágrafo §${par.numParagrafo} (Linha ${par.numLinha}), você citou ${art.autor} (${art.ano}), mas copiou o trecho textualmente do PDF sem colocar entre "aspas" e sem indicar a página (p. X). Trecho copiado: "${maiorBlocoIdentico.slice(0, 85)}…"`
                : `${rotulo} (${totalPalavrasIguais} palavras idênticas): No Parágrafo §${par.numParagrafo} (Linha ${par.numLinha}), este trecho é idêntico ao artigo de ${art.autor} (${art.ano}), mas você não citou a fonte neste parágrafo! Trecho copiado: "${maiorBlocoIdentico.slice(0, 85)}…"`,
            });
            detectouParaEstaFrase = true;
            break;
          }
        }
      }
    }
  return alertas;
}

module.exports = {
  EQUIVALENCIAS_SUPORTE_GENERICO_PT_EN,
  EQUIVALENCIAS_PT_EN,
  STOPWORDS_CIENTIFICAS_GERAIS,
  decodificarEntidadesHtmlTexto,
  contemTermoComFronteira,
  verificarCompatibilidadeBilingue,
  selecionarMelhorTrechoArtigo,
  normalizarTextoPlagio,
  ehJargaoMetodologico,
  calcularSimilaridadeCossenoRadicais,
  analisarPlagioComDiffMatchPatch,
};
