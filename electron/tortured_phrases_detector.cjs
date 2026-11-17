/**
 * electron/tortured_phrases_detector.cjs
 * 
 * Módulo de Detecção Forense de Frases Torturadas e Parafraseamento Robótico.
 * Inspirado no projeto internacional 'Problematic Paper Screener' (Guillaume Cabanac et al., Nature 2021)
 * e investigações de integridade científica do PubPeer.
 * 
 * Funcionalidades:
 * 1. Identificação de "Frases Torturadas" (Tortured Phrases):
 *    - Detecta sinônimos anômalos gerados por ferramentas automáticas de "spin",
 *      parafraseadores comerciais ou tradução reversa de IA para burlar detectores de plágio.
 * 2. Catálogo Bilíngue Forense (Português e Inglês) abrangendo:
 *    - Saúde, Epidemiologia e Medicina (ex: "doença metabólica de glicose" -> Diabetes Mellitus)
 *    - Metodologia Científica e Estatística (ex: "desvio regular" -> Desvio Padrão)
 *    - Inteligência Artificial e Computação (ex: "consciência contrafeita" -> Inteligência Artificial)
 * 3. Classificação de Severidade e Sugestão Canônica:
 *    - Aponta o termo autêntico que deveria ter sido empregado e a evidência de manipulação textual.
 */

'use strict';

/**
 * Catálogo Canônico de Frases Torturadas Forenses
 */
const CATALOGO_FRASES_TORTURADAS = [
  // --- SAÚDE, MEDICINA E EPIDEMIOLOGIA ---
  {
    regex: /\b(?:doen[çc]a\s+metab[óo]lica\s+de\s+glicose|dist[úu]rbio\s+metab[óo]lico\s+de\s+glicose|glucose\s+metabolic\s+disease|glucose\s+metabolic\s+disorder)\b/gi,
    termoCanonica: 'Diabetes Mellitus',
    categoria: 'Saúde e Medicina',
    gravidade: 'alta',
    motivo: 'Sinônimo bizarro típico de ferramenta de spin para mascarar Diabetes Mellitus.',
  },
  {
    regex: /\b(?:desordem\s+maligna\s+de\s+mama|enfermidade\s+maligna\s+mam[áa]ria|perigo\s+maligno\s+de\s+mama|breast\s+disease\s+malignancy)\b/gi,
    termoCanonica: 'Câncer de Mama (Neoplasia Mamária)',
    categoria: 'Saúde e Medicina',
    gravidade: 'alta',
    motivo: 'Parafraseamento robótico da expressão consagrada Câncer de Mama / Breast Cancer.',
  },
  {
    regex: /\b(?:organiza[çc][ãa]o\s+b[áa]sica\s+irregular|teste\s+controlado\s+n[ãa]o\s+ordenado|irregular\s+basic\s+organization|non-ordered\s+controlled\s+trial)\b/gi,
    termoCanonica: 'Ensaio Clínico Randomizado (Randomized Controlled Trial - RCT)',
    categoria: 'Saúde e Medicina',
    gravidade: 'alta',
    motivo: 'Corrupção do termo metodológico canônico Ensaio Clínico Randomizado.',
  },
  {
    regex: /\b(?:tens[ãa]o\s+circulat[óo]ria\s+alta|press[ãa]o\s+circulat[óo]ria\s+arterial|high\s+circulatory\s+pressure|blood\s+strain)\b/gi,
    termoCanonica: 'Hipertensão Arterial Sistêmica (HAS)',
    categoria: 'Saúde e Medicina',
    gravidade: 'alta',
    motivo: 'Substituição artificial do termo médico Hipertensão Arterial.',
  },
  {
    regex: /\b(?:for[çc]a\s+de\s+transmiss[ãa]o\s+viral|press[ãa]o\s+de\s+infec[çc][ãa]o|viral\s+transmission\s+force)\b/gi,
    termoCanonica: 'Taxa de Transmissão Viral / Força de Infecção',
    categoria: 'Saúde e Medicina',
    gravidade: 'moderada',
    motivo: 'Expressão parafraseada em epidemiologia para burlar similaridade.',
  },
  {
    regex: /\b(?:mortalidade\s+de\s+passagem|taxa\s+de\s+perecimento|passing\s+rate|rate\s+of\s+perishing)\b/gi,
    termoCanonica: 'Taxa de Mortalidade / Coeficiente de Mortalidade',
    categoria: 'Saúde e Medicina',
    gravidade: 'alta',
    motivo: 'Tradução reversa bizarra de Death Rate / Mortality Rate.',
  },
  {
    regex: /\b(?:resposta\s+imunol[óo]gica\s+segura|quadro\s+imune\s+invulner[áa]vel|safe\s+immune\s+response)\b/gi,
    termoCanonica: 'Imunidade / Resposta Imune Efetiva',
    categoria: 'Saúde e Medicina',
    gravidade: 'moderada',
    motivo: 'Parafraseamento artificial de Immune Response.',
  },
  {
    regex: /\b(?:infec[çc][ãa]o\s+por\s+micr[óo]bio\s+f[úu]ngico|doen[çc]a\s+de\s+bolor\s+cl[íi]nico)\b/gi,
    termoCanonica: 'Micose / Infecção Fúngica',
    categoria: 'Saúde e Medicina',
    gravidade: 'alta',
    motivo: 'Sinônimo forçado de infecção fúngica.',
  },

  // --- METODOLOGIA E ESTATÍSTICA ---
  {
    regex: /\b(?:desvio\s+regular|afastamento\s+ordin[áa]rio|regular\s+deviation|customary\s+deviation)\b/gi,
    termoCanonica: 'Desvio Padrão (Standard Deviation - SD)',
    categoria: 'Metodologia e Estatística',
    gravidade: 'alta',
    motivo: 'Corrupção evidente do termo estatístico fundamental Desvio Padrão.',
  },
  {
    regex: /\b(?:amostragem\s+fortuita|coleta\s+arbitr[áa]ria\s+de\s+casos|fortuitous\s+sampling|arbitrary\s+sampling)\b/gi,
    termoCanonica: 'Amostragem Aleatória / Randomizada (Random Sampling)',
    categoria: 'Metodologia e Estatística',
    gravidade: 'alta',
    motivo: 'Substituição inadequada de Amostragem Aleatória.',
  },
  {
    regex: /\b(?:pesquisa\s+de\s+auditoria\s+de\s+escrita|auditoria\s+de\s+escritos|audit\s+of\s+writing|inspection\s+of\s+writings)\b/gi,
    termoCanonica: 'Revisão de Literatura (Literature Review)',
    categoria: 'Metodologia e Estatística',
    gravidade: 'alta',
    motivo: 'Tradução reversa ou parafraseamento robótico de Literature Review.',
  },
  {
    regex: /\b(?:graus\s+de\s+liberdade\s+frouxos|graus\s+de\s+autonomia\s+num[ée]rica|slack\s+degrees\s+of\s+freedom)\b/gi,
    termoCanonica: 'Graus de Liberdade (Degrees of Freedom - df)',
    categoria: 'Metodologia e Estatística',
    gravidade: 'alta',
    motivo: 'Corrupção de jargão estatístico Degrees of Freedom.',
  },

  // --- INTELIGÊNCIA ARTIFICIAL E COMPUTAÇÃO ---
  {
    regex: /\b(?:consci[êe]ncia\s+contrafeita|consci[êe]ncia\s+falsificada|counterfeit\s+consciousness)\b/gi,
    termoCanonica: 'Inteligência Artificial (Artificial Intelligence - AI)',
    categoria: 'Inteligência Artificial',
    gravidade: 'alta',
    motivo: 'Caso mais emblemático de frase torturada documentado pelo Problematic Paper Screener.',
  },
  {
    regex: /\b(?:aprendizad[oa]\s+profund[oa]|aprendizagem\s+intensa|profound\s+learning)\b/gi,
    termoCanonica: 'Aprendizado Profundo (Deep Learning)',
    categoria: 'Inteligência Artificial',
    gravidade: 'alta',
    motivo: 'Parafraseamento robótico de Deep Learning.',
  },
  {
    regex: /\b(?:informa[çc][ãa]o\s+colossal|dados\s+colossais|colossal\s+information)\b/gi,
    termoCanonica: 'Big Data / Macrodados',
    categoria: 'Inteligência Artificial',
    gravidade: 'alta',
    motivo: 'Substituição clássica de Big Data por ferramentas de spin.',
  },
  {
    regex: /\b(?:floresta\s+arbitr[áa]ria|bosque\s+aleat[óo]rio|arbitrary\s+forest)\b/gi,
    termoCanonica: 'Random Forest (Floresta Aleatória)',
    categoria: 'Inteligência Artificial',
    gravidade: 'alta',
    motivo: 'Parafraseamento artificial do algoritmo Random Forest.',
  },
  {
    regex: /\b(?:apoio\s+ao\s+vetor\s+de\s+m[áa]quina|suporte\s+a\s+vetores\s+mec[âa]nicos|support\s+vector\s+of\s+machine)\b/gi,
    termoCanonica: 'Support Vector Machine (SVM / Máquinas de Vetores de Suporte)',
    categoria: 'Inteligência Artificial',
    gravidade: 'alta',
    motivo: 'Corrupção de algoritmo Support Vector Machine.',
  },
];

/**
 * Analisa uma sentença ou parágrafo em busca de frases torturadas catalogadas.
 */
function analisarFrasesTorturadas(texto, meta = {}) {
  const encontradas = [];
  if (!texto || typeof texto !== 'string') return encontradas;

  for (const item of CATALOGO_FRASES_TORTURADAS) {
    // Reset da regex global
    item.regex.lastIndex = 0;
    let m;
    while ((m = item.regex.exec(texto)) !== null) {
      encontradas.push({
        tipo: 'frase_torturada',
        termoDetectado: m[0],
        termoCanonica: item.termoCanonica,
        categoria: item.categoria,
        gravidade: item.gravidade,
        motivo: item.motivo,
        mensagem: `🧟 FRASE TORTURADA IDENTIFICADA: O trecho utiliza "${m[0]}" em vez do termo científico canônico "${item.termoCanonica}". Evidência típica de parafraseamento robótico (spin bot) ou tradução automática artificial (Problematic Paper Screener / Cabanac).`,
        indice: m.index,
        ...meta,
      });
    }
  }

  return encontradas;
}

/**
 * Audita todos os parágrafos do manuscrito em busca de frases torturadas.
 */
function auditarFrasesTorturadasDoManuscrito(paragrafos = []) {
  const todasOcorrencias = [];

  for (const p of paragrafos) {
    const texto = typeof p === 'string' ? p : p.texto || '';
    const meta = typeof p === 'object' ? {
      numParagrafo: p.numParagrafo || 0,
      numLinha: p.numLinha || 0,
      secao: p.secao || 'Corpo do Texto',
      fraseWord: texto
    } : { fraseWord: texto };

    const encontrados = analisarFrasesTorturadas(texto, meta);
    todasOcorrencias.push(...encontrados);
  }

  const porCategoria = {};
  for (const oc of todasOcorrencias) {
    porCategoria[oc.categoria] = (porCategoria[oc.categoria] || 0) + 1;
  }

  return {
    totalFrasesTorturadas: todasOcorrencias.length,
    porCategoria,
    alertasFrasesTorturadas: todasOcorrencias,
  };
}

module.exports = {
  CATALOGO_FRASES_TORTURADAS,
  analisarFrasesTorturadas,
  auditarFrasesTorturadasDoManuscrito,
};
