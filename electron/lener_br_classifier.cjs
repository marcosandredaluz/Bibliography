/**
 * CAMADA 2 — Classificador de Entidades Jurídicas, Normativas e Governamentais (Baseado no LeNER-Br + LexML + BVS/MS)
 * -------------------------------------------------------------------------------------------------------------------
 * Integra as categorias de Reconhecimento de Entidades Nomeadas (NER) do corpus brasileiro LeNER-Br
 * (`peluz/lener-br` / `pierreguillou/ner-bert-large-cased-pt-lenerbr`):
 *   1. LEGISLACAO (Leis, Decretos, Portarias, Portarias de Consolidação, RDCs, Resoluções, Instruções Normativas, Notas Técnicas/Informativas)
 *   2. ORGANIZACAO (Ministério da Saúde, Secretarias Estaduais/Municipais, ANVISA, IBGE, FIOCRUZ, INCA, OMS/WHO, OPAS/PAHO, Institutos Federais, Universidades)
 *   3. LITERATURA_CINZENTA_E_REGIONAL (Boletins Epidemiológicos, Planos de Contingência, Guias de Vigilância, Manuais Técnicos, Periódicos Universitários sem DOI Crossref)
 *   4. CSL_TYPE_NATIVO (Integração direta com o campo `type` do Mendeley/Zotero: `report`, `legislation`, `bill`, `statute`, `webpage`, `book`, `thesis`)
 */

const TIPOS_CSL_NORMATIVOS_OU_INSTITUCIONAIS = new Set([
  'report',
  'legislation',
  'bill',
  'statute',
  'regulation',
  'legal_case',
  'treaty',
  'webpage',
  'post-weblog',
  'book',
  'chapter',
  'thesis',
  'pamphlet',
  'standard',
  'manuscript',
  'dataset',
]);

// Padrões canônicos da categoria LEGISLACAO do LeNER-Br + LexML + SUS
const REGEX_LENER_LEGISLACAO =
  /\b(lei\s+(?:federal|estadual|municipal|complementar|org[aâ]nica|n[º°o.]?\s*\d)|decreto(?:-lei)?\s+n?[º°o.]?|portaria(?:\s+de\s+consolida[cç][aã]o|\s+conjunta|\s+gm\/ms|\s+svsa|\s+saps|\s+saes|\s+n[º°o.]?)?|resolu[cç][aã]o\s+(?:rdc|cns|cit|cib|cfm|cofen|conanda|n[º°o.]?)|instru[cç][aã]o\s+normativa|medida\s+provis[oó]ria|emenda\s+constitucional|constitui[cç][aã]o\s+da\s+rep[uú]blica|constitui[cç][aã]o\s+federal|di[aá]rio\s+oficial\s+da\s+uni[aã]o|di[aá]rio\s+oficial\s+do\s+estado|estatuto\s+da\s+crian[cç]a\s+e\s+do\s+adolescente)\b/i;

// Padrões de Atos Normativos Secundários e Documentos Técnicos Oficiais de Saúde Pública (BVS / Ministério da Saúde / OMS)
const REGEX_DOCUMENTOS_TECNICOS_SAUDE =
  /\b(nota\s+t[eé]cnica|nota\s+informativa(?:\s+conjunta)?|parecer\s+t[eé]cnico(?:-cient[ií]fico)?|boletim\s+epidemiol[oó]gico|boletim\s+informativo|plano\s+de\s+conting[eê]ncia|plano\s+nacional|plano\s+estadual|plano\s+municipal|relat[oó]rio\s+(?:anual\s+)?de\s+gest[aã]o|manual\s+t[eé]cnico|manual\s+de\s+normas|guia\s+de\s+vigil[aâ]ncia|cadernos?\s+de\s+aten[cç][aã]o\s+b[aá]sica|protocolo\s+cl[ií]nico\s+e\s+diretrizes\s+terap[eê]uticas|protocolo\s+de\s+sa[uú]de|protocolo\s+de\s+preven[cç][aã]o|linha\s+de\s+cuidado|implementation\s+guide|technical\s+framework|iso\s+\d+|bi-rads\s+atlas|brencaminhamento|registro\s+de\s+atendimento\s+cl[ií]nico|simplifier\.net|rede\s+nacional\s+de\s+dados\s+em\s+sa[uú]de|estimativa\s+20\d\d:\s+incid[eê]ncia|diagn[oó]stico\s+de\s+maturidade|global\s+strategy\s+to\s+eliminate|position\s+paper|censo\s+demogr[aá]fico|pesquisa\s+nacional\s+por\s+amostra\s+de\s+domic[ií]lios|pesquisa\s+nacional\s+de\s+sa[uú]de)\b/i;

// Padrões da categoria ORGANIZACAO (LeNER-Br + Administração Pública Direta/Indireta, todas as 27 UFs com ou sem qualificador "(Estado)" e Organismos Internacionais)
const REGEX_LENER_ORGANIZACAO =
  /^(?:\[\d+\]\s*|\d+\.\s*)?(?:Brasil\s+M\s+da\s+S\.|Brasil\.?\s*Minist[eé]rio\s+da\s+Sa[uú]de|Brasil\.\s+Presid[eê]ncia|Brasil\.\s+Congresso|Brasil\.\s+Senado|Brasil\.\s+Conselho|(?:Brasil|Minist[eé]rio\s+da\s+Sa[uú]de|Acre|Alagoas|Amap[aá]|Amazonas|Bahia|Cear[aá]|Distrito\s+Federal|Esp[ií]rito\s+Santo|Goi[aá]s|Maranh[aã]o|Mato\s+Grosso(?:\s+do\s+Sul)?|Minas\s+Gerais|Par[aá]|Para[ií]ba|Paran[aá]|Pernambuco|Piau[ií]|Rio\s+de\s+Janeiro|Rio\s+Grande\s+do\s+(?:Norte|Sul)|Rond[oô]nia|Roraima|Santa\s+Catarina|S[aã]o\s+Paulo|Sergipe|Tocantins|Curitiba|Goi[aâ]nia|S[aã]o\s+Lu[ií]s|Belo\s+Horizonte|Porto\s+Alegre|Recife|Salvador|Fortaleza|Manaus|Bel[eé]m|Florian[oó]polis|Vit[oó]ria|Natal|Macei[oó]|Jo[aã]o\s+Pessoa|Teresina|Aracaju|Campo\s+Grande|Cuiab[aá]|Palmas|Macap[aá]|Rio\s+Branco|Boa\s+Vista|Porto\s+Velho)(?:\s*\([^)]+\))?\.|Secretaria\s+(?:de\s+Estado|Estadual|Municipal|Especial)\s+d[ae]\s+Sa[uú]de|Prefeitura\s+Municipal|Instituto\s+Federal|Universidade\s+(?:Federal|Estadual)|Instituto\s+Brasileiro\s+de\s+Geografia\s+e\s+Estat[ií]stica|IBGE|Instituto\s+Nacional\s+de\s+C[aâ]ncer|INCA|Funda[cç][aã]o\s+Oswaldo\s+Cruz|FIOCRUZ|Ag[eê]ncia\s+Nacional\s+de\s+Vigil[aâ]ncia\s+Sanit[aá]ria|ANVISA|Comiss[aã]o\s+Nacional\s+de\s+Incorpora[cç][aã]o\s+de\s+Tecnologias|CONITEC|Instituto\s+de\s+Pesquisa\s+Econ[oô]mica\s+Aplicada|IPEA|Coordena[cç][aã]o\s+de\s+Aperfei[cç]oamento|CAPES|Conselho\s+Nacional\s+de\s+(?:Sa[uú]de|Desenvolvimento|Secret[aá]rios|Secretarias)|CNS|CNPq|CONASS|CONASEMS|Conselho\s+Federal\s+de\s+(?:Medicina|Enfermagem|Farm[aá]cia)|CFM|COFEN|CFF|Organiza[cç][aã]o\s+Mundial\s+da\s+Sa[uú]de|Organiza[cç][aã]o\s+Pan-Americana\s+da\s+Sa[uú]de|World\s+Health\s+Organization|Pan\s+American\s+Health\s+Organization|United\s+Nations|UNICEF|UNESCO|WHO\.|OPAS\.|PAHO\.|CDC\.|Centers\s+for\s+Disease\s+Control|HL7\s+International|IHE\s+International|International\s+Organization\s+for\s+Standardization|American\s+College\s+of\s+Radiology|Associa[cç][aã]o\s+Brasileira\s+de\s+Normas\s+T[eé]cnicas|ABNT\.)/i;

// Domínios Oficiais Governamentais, Educacionais e de Organismos Multilaterais
const REGEX_DOMINIOS_OFICIAIS =
  /(?:\.gov(?:\.[a-z]{2})?|\.edu(?:\.[a-z]{2})?|\.ac\.[a-z]{2}|\.leg\.br|\.jus\.br|\.mp\.br|\.mil\.br|\.def\.br|\.int\b|\b(?:who|iris\.who|paho|opas|unicef|cdc|nih|snomed|w3|hl7|ihe|iso|cancer|fapesp|capes|cnpq)\.org|\bbvsms\.saude\.gov\.br|\bin\.gov\.br|\bsaude\.gov\.br|\bibge\.gov\.br|\bfiocruz\.br)/i;

// Detecta se a linha tem estrutura típica de artigo de periódico científico (ex.: "2020;38(2):482-488" ou periódicos científicos consagrados)
const REGEX_ASSINATURA_PERIODICO_CIENTIFICO =
  /(?:\b(?:19|20)\d\d\s*;\s*\d{1,4}\s*(?:\([^)]+\))?\s*:\s*[eE]?\d+|\b(?:Cad\.?\s*Sa[uú]de\s*P[uú]blica|Rev\.?\s*Sa[uú]de\s*P[uú]blica|Ci[eê]nc\.?\s*Sa[uú]de\s*Colet|Epidemiol\.?\s*Serv\.?\s*Sa[uú]de|Rev\.?\s*Bras\.?\s*Epidemiol|Sa[uú]de\s*Debate|Interface\s*\(Botucatu\)|Lancet|N\s*Engl\s*J\s*Med|NEJM|JAMA|BMJ|Vaccine|PLoS\s*One|BMC\s*Public\s*Health|BMC\s*Health\s*Serv\s*Res|Int\s*J\s*Epidemiol|Nat\s*Hum\s*Behav|Nature|Science|Pan\s*Am\s*J\s*Public\s*Health|Rev\s*Panam\s*Salud\s*Publica|MMWR\s*Recomm\s*Rep|Am\s*J\s*Public\s*Health)\b)/i;

// Periódicos Acadêmicos Regionais / Universitários Brasileiros sem DOI Crossref ou Literatura Acadêmica (Teses/Dissertações/Anais)
const REGEX_PERIODICOS_REGIONAIS_E_TESES =
  /\b(rev\s+vozes\s+dos\s+val|revista\s+vozes\s+dos\s+vales|ufvjm\.edu\.br|disserta[cç][aã]o\s*\[|disserta[cç][aã]o\s*\(|tese\s*\[|tese\s*\(|monografia\s*\(|trabalho\s+de\s+conclus[aã]o\s+de\s+curso|anais\s+d[eo]\s+congresso)/i;

/**
 * Classifica uma entrada de referência harmonizando:
 *   1. Se possui DOI de periódico ou assinatura inequívoca de artigo de revista científica, preserva como `artigo_periodico`
 *      (exceto códigos de protocolo controlado PRT/POP ou normas técnicas ISO/HL7/BI-RADS).
 *   2. Entidades LeNER-Br (`LEGISLACAO`, `ORGANIZACAO`) e Taxonomia BVS/SUS
 *   3. Metadado nativo `type` do CSL-JSON do Mendeley/Zotero (quando presente no `.docx`)
 *   4. Domínios oficiais `.gov.br` / `.edu.br` / `who.int`
 *   5. Periódicos regionais sem DOI Crossref
 */
function classificarReferenciaHarmonizada(linha, doi, metadadoCslEmbutido = null) {
  const s = String(linha || '').trim();

  // 1. Códigos formais de documentos institucionais controlados (POPs, Protocolos, ISO, BI-RADS)
  if (/\b(PRT\.[A-Z0-9._-]+|POP\.[A-Z0-9._-]+|PROT\.[A-Z0-9._-]+|ISO\s+\d{4,5}|BI-RADS\s+Atlas)\b/i.test(s)) {
    return {
      natureza: 'norma_livro_institucional',
      subtipoLener: 'PROTOCOLO_CONTROLADO',
      rotuloAutenticidade: '🏛 Protocolo Institucional Controlado / Norma Técnica',
    };
  }

  // Guarda Anti-Falso-Positivo: Se a entrada tem DOI oficial de artigo científico OU assinatura inequívoca de periódico científico
  // E NÃO começa com autor corporativo governamental/normativo, é um ARTIGO CIENTÍFICO (mesmo que o título mencione "Lei", "Portaria" ou "SUS")!
  const comecaComOrgaoPublico = REGEX_LENER_ORGANIZACAO.test(s);
  const temAssinaturaPeriodico = REGEX_ASSINATURA_PERIODICO_CIENTIFICO.test(s);
  if ((doi || temAssinaturaPeriodico) && !comecaComOrgaoPublico) {
    return {
      natureza: 'artigo_periodico',
      subtipoLener: 'ARTIGO_CIENTIFICO',
      rotuloAutenticidade: null,
    };
  }

  // 2. Categoria LEGISLACAO (LeNER-Br)
  if (REGEX_LENER_LEGISLACAO.test(s)) {
    return {
      natureza: 'norma_livro_institucional',
      subtipoLener: 'LEGISLACAO',
      rotuloAutenticidade: '🏛 Legislação / Ato Normativo Oficial (Reconhecido via LeNER-Br)',
    };
  }

  // 3. Documentos Técnicos e Normativos de Saúde Pública (Notas Informativas, Boletins, Planos, Manuais)
  if (REGEX_DOCUMENTOS_TECNICOS_SAUDE.test(s)) {
    return {
      natureza: 'norma_livro_institucional',
      subtipoLener: 'NORMATIVA_TECNICA_SAUDE',
      rotuloAutenticidade: '🏛 Nota Informativa / Boletim Epidemiológico / Documento Técnico Oficial',
    };
  }

  // 4. Se não possui DOI de artigo científico e pertence a Domínio Oficial (.gov, .edu, .org, .int) ou ORGANIZACAO LeNER-Br
  const ehUrlOficialOuInstitucional =
    !doi &&
    !temAssinaturaPeriodico &&
    (/\bDispon[ií]vel\s+em:\s*https?:\/\/[^\s]+/i.test(s) &&
      (/(?:\.gov|\.edu|\.org|\.int|\.ac\.[a-z]{2})\b/i.test(s) ||
       /\b(?:members|about|licensing|portal|standards|normas|documentos|relatorios)\b/i.test(s)));

  if (!doi && (REGEX_DOMINIOS_OFICIAIS.test(s) || REGEX_LENER_ORGANIZACAO.test(s) || ehUrlOficialOuInstitucional)) {
    return {
      natureza: 'norma_livro_institucional',
      subtipoLener: 'ORGANIZACAO_PUBLICA',
      rotuloAutenticidade: '🏛 Publicação Institucional / Documento Oficial (.gov / .edu / .org / OMS)',
    };
  }

  // 5. Se o próprio Mendeley/Zotero declarou o item como report, legislation, webpage, book ou thesis (e não tem DOI de periódico)
  if (!doi && metadadoCslEmbutido?.type && TIPOS_CSL_NORMATIVOS_OU_INSTITUCIONAIS.has(metadadoCslEmbutido.type)) {
    return {
      natureza: 'norma_livro_institucional',
      subtipoLener: `CSL_${metadadoCslEmbutido.type.toUpperCase()}`,
      rotuloAutenticidade: `🏛 Fonte Institucional / Relatório Técnico (Metadado Mendeley/CSL: ${metadadoCslEmbutido.type})`,
    };
  }

  // 6. Livros e monografias com paginação total ("168 p.") ou edição declarada ("2o ed.", "5. ed.")
  if (
    /\b\d{2,4}\s*p\.\s*$/i.test(s) ||
    /\b\d+[º°o.]?\s*ed\b/i.test(s) ||
    (!doi && /\b(bras[ií]lia|rio\s+de\s+janeiro|s[aã]o\s+paulo|genebra|geneva|reston|ann\s+arbor|oak\s+brook|curitiba|goi[aâ]nia)\s*:\s*[^,]+,\s*(19|20)\d\d/i.test(s))
  ) {
    return {
      natureza: 'norma_livro_institucional',
      subtipoLener: 'LIVRO_MONOGRAFIA',
      rotuloAutenticidade: '🏛 Livro / Manual Técnico / Monografia Institucional',
    };
  }

  // 7. Periódicos acadêmicos regionais / universitários sem DOI Crossref
  if (!doi && REGEX_PERIODICOS_REGIONAIS_E_TESES.test(s)) {
    return {
      natureza: 'periodico_regional_sem_doi',
      subtipoLener: 'PERIODICO_UNIVERSITARIO_SEM_DOI',
      rotuloAutenticidade: '📚 Periódico Acadêmico Regional / Literatura Cinzenta (Sem indexação DOI Crossref)',
    };
  }

  return {
    natureza: 'artigo_periodico',
    subtipoLener: 'ARTIGO_CIENTIFICO',
    rotuloAutenticidade: null,
  };
}

module.exports = {
  classificarReferenciaHarmonizada,
  REGEX_LENER_LEGISLACAO,
  REGEX_DOCUMENTOS_TECNICOS_SAUDE,
  REGEX_LENER_ORGANIZACAO,
  REGEX_DOMINIOS_OFICIAIS,
};
