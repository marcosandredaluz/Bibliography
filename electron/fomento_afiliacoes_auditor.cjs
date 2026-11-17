/**
 * electron/fomento_afiliacoes_auditor.cjs
 * 
 * Auditor Forense de Declaração de Fomento, Bolsas e Afiliações Institucionais (ROR / CAPES / CNPq).
 * 
 * Diretrizes:
 * - Portaria CAPES nº 206/2018: Obrigatoriedade de citação do apoio e do "Código de Financiamento 001".
 * - Padrões CNPq e FAPESP: Identificação e formatação correta de números de processo de bolsa/auxílio.
 * - ICMJE / COPE: Exigência de declaração explícita de fontes de financiamento ou de recursos próprios.
 */

'use strict';

/**
 * Padrões de identificação de agências de fomento brasileiras e internacionais
 */
const AGENCIAS_FOMENTO = [
  {
    sigla: 'CAPES',
    padrao: /\b(?:CAPES|Coordena[çc][ãa]o\s+de\s+Aperfei[çc]oamento\s+de\s+Pessoal\s+de\s+N[íi]vel\s+Superior)\b/i,
    exigeCodigo001: true,
    nome: 'Coordenação de Aperfeiçoamento de Pessoal de Nível Superior'
  },
  {
    sigla: 'CNPq',
    padrao: /\b(?:CNPq|Conselho\s+Nacional\s+de\s+Desenvolvimento\s+Cient[íi]fico\s+e\s+Tecnol[óo]gico)\b/i,
    regexProcesso: /\b\d{6}\/\d{4}-\d\b/,
    nome: 'Conselho Nacional de Desenvolvimento Científico e Tecnológico'
  },
  {
    sigla: 'FAPESP',
    padrao: /\b(?:FAPESP|Funda[çc][ãa]o\s+de\s+Amparo\s+[àa]\s+Pesquisa\s+do\s+Estado\s+de\s+S[ãa]o\s+Paulo)\b/i,
    regexProcesso: /\b\d{2}\/\d{5}-\d\b/,
    nome: 'Fundação de Amparo à Pesquisa do Estado de São Paulo'
  },
  {
    sigla: 'FAPERJ',
    padrao: /\b(?:FAPERJ|Funda[çc][ãa]o\s+Carlos\s+Chagas\s+Filho)\b/i,
    nome: 'Fundação Carlos Chagas Filho de Amparo à Pesquisa do Estado do RJ'
  },
  {
    sigla: 'NIH',
    padrao: /\b(?:NIH|National\s+Institutes\s+of\s+Health)\b/i,
    regexProcesso: /\b[A-Z]\d{2}[A-Z]{2}\d{6}\b/i,
    nome: 'National Institutes of Health (EUA)'
  }
];

/**
 * Regex para detectar se há declaração explícita de ausência de financiamento externo (recursos próprios)
 */
const REGEX_RECURSOS_PROPRIOS = /\b(?:sem\s+financiamento(?:\s+externo)?|recursos\s+pr[óo]prios|financiamento\s+pr[óo]prio|não\s+recebeu\s+financiamento|no\s+funding|self-funded)\b/i;

/**
 * Regex para identificar seções típicas de fomento e agradecimentos
 */
const REGEX_SECAO_FOMENTO = /\b(?:Agradecimentos?|Financiamento|Apoio\s+Financeiro|Fontes\s+de\s+Financiamento|Funding|Financial\s+Support|Acknowledgments?)\b/i;

/**
 * Audita a declaração de fomento e conformidade das bolsas no manuscrito
 */
function auditarFomentoEAfiliacoes(paragrafos = [], meta = {}) {
  const alertasFomento = [];
  let textoAgradecimentos = '';
  let encontrouMencaoAgencia = false;
  let agenciasDetectadas = [];

  // 1. Busca por seções de agradecimento ou menções ao longo do texto
  for (const p of paragrafos) {
    const texto = typeof p === 'string' ? p : p.texto || '';
    const secao = typeof p === 'object' ? p.secao || '' : '';

    if (REGEX_SECAO_FOMENTO.test(secao) || REGEX_SECAO_FOMENTO.test(texto)) {
      textoAgradecimentos += ` ${texto}`;
    }

    for (const ag of AGENCIAS_FOMENTO) {
      if (ag.padrao.test(texto)) {
        encontrouMencaoAgencia = true;
        if (!agenciasDetectadas.includes(ag.sigla)) {
          agenciasDetectadas.push(ag.sigla);
        }

        // Caso CAPES: verificar conformidade com a Portaria 206/2018 (Código de Financiamento 001)
        if (ag.sigla === 'CAPES') {
          const temCodigo001 = /\b(?:C[óo]digo\s+de\s+Financiamento\s+001|Finance\s+Code\s+001|C[óo]digo\s+001)\b/i.test(texto) ||
                               /\b(?:C[óo]digo\s+de\s+Financiamento\s+001|Finance\s+Code\s+001)\b/i.test(textoAgradecimentos);
          if (!temCodigo001) {
            alertasFomento.push({
              tipo: 'capes_falta_codigo_001',
              agencia: 'CAPES',
              gravidade: 'alta',
              mensagem: '🏛️ EXIGÊNCIA LEGAL CAPES (Portaria nº 206/2018): O manuscrito menciona apoio da CAPES mas não inclui a fórmula obrigatória "Código de Financiamento 001" (ou "Finance Code 001").',
              sugestao: 'Acrescente a fórmula canônica: "O presente trabalho foi realizado com apoio da Coordenação de Aperfeiçoamento de Pessoal de Nível Superior - Brasil (CAPES) - Código de Financiamento 001".'
            });
          }
        }

        // Caso CNPq ou FAPESP: verificar se há menção ao número de processo/bolsa
        if (ag.regexProcesso && !ag.regexProcesso.test(texto) && !ag.regexProcesso.test(textoAgradecimentos)) {
          alertasFomento.push({
            tipo: 'fomento_sem_numero_processo',
            agencia: ag.sigla,
            gravidade: 'moderada',
            mensagem: `🏛️ PROCESSO DE FOMENTO AUSENTE (${ag.sigla}): Menção à agência ${ag.sigla} sem especificação do número de processo ou bolsa no formato regulamentar.`,
            sugestao: `Adicione o número do processo oficial (ex: CNPq ######/AAAA-# ou FAPESP AA/#####-#).`
          });
        }
      }
    }
  }

  // 2. Se o trabalho tem dados empíricos/método e não mencionou nenhuma agência nem declarou recursos próprios
  const declarouRecursosProprios = REGEX_RECURSOS_PROPRIOS.test(textoAgradecimentos) ||
                                  paragrafos.some((p) => REGEX_RECURSOS_PROPRIOS.test(typeof p === 'string' ? p : p.texto || ''));

  if (!encontrouMencaoAgencia && !declarouRecursosProprios && paragrafos.length > 10) {
    alertasFomento.push({
      tipo: 'ausencia_declaracao_fomento',
      gravidade: 'moderada',
      mensagem: '🏛️ AUSÊNCIA DE DECLARAÇÃO DE FINANCIAMENTO (ICMJE / COPE): O manuscrito não declara fontes de financiamento, bolsas nem explicita a realização com recursos próprios.',
      sugestao: 'Inclua no final do manuscrito uma seção declarando o suporte financeiro recebido ou declare expressamente que a pesquisa foi realizada com recursos próprios.'
    });
  }

  return {
    totalAlertasFomento: alertasFomento.length,
    agenciasDetectadas,
    declarouRecursosProprios,
    alertasFomento,
  };
}

module.exports = {
  AGENCIAS_FOMENTO,
  REGEX_RECURSOS_PROPRIOS,
  REGEX_SECAO_FOMENTO,
  auditarFomentoEAfiliacoes,
};
