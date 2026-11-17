/**
 * electron/figuras_tabelas_auditor.cjs
 * 
 * Auditoria Forense e Normativa de Figuras, Quadros e Tabelas.
 * Padrões: ABNT NBR 14724:2011 (itens 5.8 e 5.9), Normas de Apresentação Tabular do IBGE e Vancouver.
 * 
 * Regras Auditadas:
 * 1. Chamada Obrigatória no Texto (§): Toda ilustração/tabela deve ser citada no corpo do texto.
 * 2. Fonte Obrigatória: Toda ilustração/tabela deve indicar sua fonte ("Fonte: Elaborado pelo autor", "Fonte: BRASIL, 2022").
 * 3. Chamada Órfã: Menção no texto a ilustrações/tabelas que não existem no manuscrito (ex: "ver Tabela 4" sem Tabela 4).
 * 4. Sequência Numérica: Verificação de saltos ou duplicação de numeração (ex: Figura 1, Figura 3 saltando a 2).
 * 5. Distinção Tabela vs. Quadro: Recomendações conceituais conforme normas do IBGE.
 */

'use strict';

const TIPOS_ILUSTRACAO = [
  'figura',
  'tabela',
  'quadro',
  'grafico',
  'mapa',
  'diagrama',
  'fluxograma',
  'fotografia',
  'organograma',
  'esquema'
];

// Regex para detectar títulos/legendas de ilustrações e tabelas (tolera número de página residual de PDF antes do rótulo)
// Ex: "Figura 1 – Distribuição geográfica", "Tabela 2: Casos notificados", "27 Quadro 3: Indicadores"
const REGEX_TITULO_ELEMENTO = /^(?:\d{1,3}\s+)?(figura|tabela|quadro|gr[aá]fico|mapa|diagrama|fluxograma|fotografia|organograma|esquema)\s+(\d+)[\s.:–—-]+(.+)$/i;

// Regex para detectar menções/chamadas no texto
// Ex: "conforme a Figura 1", "(Tabela 2)", "no Quadro 3", "ver Gráfico 4"
const REGEX_CHAMADA_TEXTO = /\b(?:conforme|consoante|segundo|como\s+(?:mostra|ilustra|demonstra|apresenta|se\s+observa\s+n[ao])|ver|vide|\()?\s*(figura|tabela|quadro|gr[aá]fico|mapa|diagrama|fluxograma|fotografia|organograma|esquema)\s+(\d+)\b/gi;

// Regex para linha de Fonte (inclusive quando colada ao fim de um bloco de tabela/figura em PDF)
const REGEX_FONTE = /^\s*fonte\s*[:–—-]\s*(.+)$/i;
const REGEX_FONTE_EMBUTIDA = /\bfonte\s*[:–—-]\s*(.+)$/i;

/**
 * Normaliza o tipo de ilustração para chave canônica
 */
function normalizarTipo(tipo = '') {
  const t = String(tipo).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  if (t.startsWith('fig')) return 'figura';
  if (t.startsWith('tab')) return 'tabela';
  if (t.startsWith('qua')) return 'quadro';
  if (t.startsWith('graf')) return 'grafico';
  if (t.startsWith('map')) return 'mapa';
  if (t.startsWith('diag')) return 'diagrama';
  if (t.startsWith('flux')) return 'fluxograma';
  if (t.startsWith('foto')) return 'fotografia';
  if (t.startsWith('organ')) return 'organograma';
  if (t.startsWith('esq')) return 'esquema';
  return t;
}

/**
 * Realiza a auditoria de figuras, quadros e tabelas no corpus de parágrafos
 */
function auditarFigurasETabelasDoManuscrito(paragrafosCorpo = []) {
  const elementosIdentificados = [];
  const chamadasNoTexto = [];
  const alertasFigurasTabelas = [];

  // 1. PRIMEIRA PASSAGEM: Identificar legendas/títulos de figuras e linhas de fonte
  for (let i = 0; i < paragrafosCorpo.length; i++) {
    const p = paragrafosCorpo[i];
    const textoLimpo = (p.texto || '').trim();
    if (!textoLimpo) continue;

    const mTitulo = textoLimpo.match(REGEX_TITULO_ELEMENTO);
    if (mTitulo) {
      const tipoRaw = mTitulo[1];
      const tipoCanonica = normalizarTipo(tipoRaw);
      const numero = parseInt(mTitulo[2], 10);
      const descricao = mTitulo[3].trim();

      // Procura a linha de "Fonte:" primeiro no próprio bloco (comum em PDF) e depois nos próximos 20 parágrafos (suporta quadros/tabelas multipágina)
      let fonteEncontrada = null;
      let linhaFonte = 0;
      const mFonteMesmo = textoLimpo.match(REGEX_FONTE_EMBUTIDA);
      if (mFonteMesmo) {
        fonteEncontrada = mFonteMesmo[1].trim();
        linhaFonte = p.numLinha || 0;
      }
      if (!fonteEncontrada) {
        for (let j = i + 1; j < Math.min(i + 22, paragrafosCorpo.length); j++) {
          const proxTexto = (paragrafosCorpo[j].texto || '').trim();
          if (!proxTexto) continue;
          // Se iniciou outra legenda ou nova seção numerada, interrompe a busca deste elemento
          if (REGEX_TITULO_ELEMENTO.test(proxTexto) || /^\d+(?:\.\d+)*\s+[A-ZÀ-Ú]/.test(proxTexto)) break;
          const mFonte = proxTexto.match(REGEX_FONTE) || proxTexto.match(REGEX_FONTE_EMBUTIDA);
          if (mFonte) {
            fonteEncontrada = mFonte[1].trim();
            linhaFonte = paragrafosCorpo[j].numLinha || 0;
            break;
          }
        }
      }

      elementosIdentificados.push({
        tipo: tipoCanonica,
        tipoRaw,
        numero,
        descricao,
        numParagrafo: p.numParagrafo || i + 1,
        numLinha: p.numLinha || 0,
        secao: p.secao || 'Corpo',
        fonte: fonteEncontrada,
        linhaFonte,
        textoLegenda: textoLimpo,
      });
    }

    // Identificar chamadas a figuras/tabelas no meio do texto
    // (Apenas se o parágrafo NÃO for a própria linha de legenda da figura nem linha de Fonte)
    if (!mTitulo && !REGEX_FONTE.test(textoLimpo)) {
      let mChamada;
      const regexChamadaCopy = new RegExp(REGEX_CHAMADA_TEXTO.source, 'gi');
      while ((mChamada = regexChamadaCopy.exec(textoLimpo)) !== null) {
        const tipoCanonica = normalizarTipo(mChamada[1]);
        const numero = parseInt(mChamada[2], 10);
        chamadasNoTexto.push({
          tipo: tipoCanonica,
          tipoRaw: mChamada[1],
          numero,
          numParagrafo: p.numParagrafo || i + 1,
          numLinha: p.numLinha || 0,
          secao: p.secao || 'Corpo',
          fraseWord: textoLimpo,
          trechoExato: mChamada[0],
        });
      }
    }
  }

  // Agrupa elementos e chamadas por tipo para verificação sequencial
  const elementosPorTipo = new Map();
  for (const el of elementosIdentificados) {
    if (!elementosPorTipo.has(el.tipo)) elementosPorTipo.set(el.tipo, []);
    elementosPorTipo.get(el.tipo).push(el);
  }

  const chamadasPorTipo = new Map();
  for (const ch of chamadasNoTexto) {
    const chave = `${ch.tipo}_${ch.numero}`;
    if (!chamadasPorTipo.has(chave)) chamadasPorTipo.set(chave, []);
    chamadasPorTipo.get(chave).push(ch);
  }

  // 2. REGRA 1: Verificar se cada elemento identificado possui chamada no texto
  for (const el of elementosIdentificados) {
    const chave = `${el.tipo}_${el.numero}`;
    const chamadas = chamadasPorTipo.get(chave) || [];

    if (chamadas.length === 0) {
      alertasFigurasTabelas.push({
        tipo: 'figura_tabela_sem_chamada',
        gravidade: 'alerta',
        elementoTipo: el.tipo,
        numero: el.numero,
        numParagrafo: el.numParagrafo,
        numLinha: el.numLinha,
        secao: el.secao,
        fraseWord: el.textoLegenda,
        mensagem: `⚠️ ${el.tipo.toUpperCase()} ${el.numero} SEM CHAMADA NO TEXTO: Segundo a ABNT NBR 14724 (item 5.8), toda ilustração ou tabela deve ser obrigatoriamente mencionada no texto ("como ilustrado na ${el.tipoRaw} ${el.numero}").`,
        sugestao: `Insira uma menção explicativa a esta ${el.tipoRaw} no parágrafo antecedente correspondente.`,
      });
    }

    // 3. REGRA 2: Verificar presença de Fonte obrigatória
    if (!el.fonte) {
      alertasFigurasTabelas.push({
        tipo: 'ausencia_fonte_ilustracao',
        gravidade: 'alerta',
        elementoTipo: el.tipo,
        numero: el.numero,
        numParagrafo: el.numParagrafo,
        numLinha: el.numLinha,
        secao: el.secao,
        fraseWord: el.textoLegenda,
        mensagem: `❌ AUSÊNCIA DE FONTE EM ${el.tipo.toUpperCase()} ${el.numero}: A ABNT NBR 14724 e as normas do IBGE exigem a indicação da fonte logo abaixo de qualquer ilustração ou tabela, mesmo quando elaborada pelo próprio autor.`,
        sugestao: `Adicione abaixo do elemento: "Fonte: Elaborado pelo autor (${new Date().getFullYear()})" ou cite a autoria original correspondente.`,
      });
    }
  }

  // 4. REGRA 3: Chamadas no texto para elementos inexistentes (chamada órfã)
  for (const ch of chamadasNoTexto) {
    const lista = elementosPorTipo.get(ch.tipo) || [];
    const existe = lista.some((el) => el.numero === ch.numero);
    if (!existe) {
      alertasFigurasTabelas.push({
        tipo: 'chamada_tabela_inexistente',
        gravidade: 'erro_critico',
        elementoTipo: ch.tipo,
        numero: ch.numero,
        numParagrafo: ch.numParagrafo,
        numLinha: ch.numLinha,
        secao: ch.secao,
        fraseWord: ch.fraseWord,
        mensagem: `🚨 MENÇÃO A ${ch.tipo.toUpperCase()} ${ch.numero} INEXISTENTE: O parágrafo cita "${ch.trechoExato}", porém nenhuma legenda de "${ch.tipoRaw} ${ch.numero}" foi localizada no manuscrito.`,
        sugestao: `Verifique se o número da ${ch.tipoRaw} foi alterado ou se o elemento foi removido do trabalho.`,
      });
    }
  }

  // 5. REGRA 4: Salto na numeração sequencial
  for (const [tipo, lista] of elementosPorTipo.entries()) {
    const numeros = lista.map((x) => x.numero).sort((a, b) => a - b);
    for (let k = 0; k < numeros.length; k++) {
      const esperado = k + 1;
      if (numeros[k] !== esperado) {
        alertasFigurasTabelas.push({
          tipo: 'salto_numeracao_ilustracao',
          gravidade: 'aviso',
          elementoTipo: tipo,
          numero: numeros[k],
          numParagrafo: lista[k]?.numParagrafo || 0,
          numLinha: lista[k]?.numLinha || 0,
          secao: lista[k]?.secao || 'Corpo',
          fraseWord: lista[k]?.textoLegenda || '',
          mensagem: `📐 QUEBRA DE SEQUÊNCIA EM ${tipo.toUpperCase()}: Esperava-se o elemento número ${esperado}, mas foi identificado o número ${numeros[k]}.`,
          sugestao: `Renumere as ocorrências de ${tipo} em ordem crescente sequencial (1, 2, 3...).`,
        });
        break; // Evita inundar com múltiplos erros consequentes
      }
    }
  }

  return {
    totalElementos: elementosIdentificados.length,
    totalChamadas: chamadasNoTexto.length,
    elementosIdentificados,
    alertasFigurasTabelas,
  };
}

module.exports = {
  TIPOS_ILUSTRACAO,
  REGEX_TITULO_ELEMENTO,
  REGEX_CHAMADA_TEXTO,
  REGEX_FONTE,
  normalizarTipo,
  auditarFigurasETabelasDoManuscrito,
};
