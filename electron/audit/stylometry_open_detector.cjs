/**
 * electron/audit/stylometry_open_detector.cjs
 * Detecção determinística de marcadores de cadência sintética (Open-Detector).
 */
'use strict';

// ---------- Marcadores de Redação Estilística de IA (Inspirado no Imalwayshere/Open-Detector) ----------
const MARCADORES_ESTILISTICOS_IA = [
  { termo: 'imperativo ressaltar', peso: 2 },
  { termo: 'desempenha um papel crucial', peso: 2 },
  { termo: 'desempenham um papel crucial', peso: 2 },
  { termo: 'papel fundamental', peso: 1 },
  { termo: 'em última análise', peso: 2 },
  { termo: 'navegar pelas complexidades', peso: 3 },
  { termo: 'navegar pelas nuances', peso: 3 },
  { termo: 'tapeçaria multifacetada', peso: 3 },
  { termo: 'tapeçaria rica', peso: 3 },
  { termo: 'mergulhar nas nuances', peso: 3 },
  { termo: 'mergulhar a fundo', peso: 2 },
  { termo: 'no cenário contemporâneo', peso: 2 },
  { termo: 'no panorama contemporâneo', peso: 2 },
  { termo: 'serve como um testemunho', peso: 3 },
  { termo: 'um testemunho de', peso: 2 },
  { termo: 'lançar luz sobre', peso: 2 },
  { termo: 'intrincada teia', peso: 3 },
  { termo: 'ecossistema dinâmico', peso: 2 },
  { termo: 'vital ressaltar', peso: 2 },
  { termo: 'crucial destacar', peso: 2 },
  { termo: 'em suma', peso: 1 },
];

function analisarEstiloRedacaoIaOpenDetector(paragrafosCorpo) {
  const alertas = [];
  for (const p of paragrafosCorpo) {
    const textoLimpo = (p.texto || '').toLowerCase();
    if (textoLimpo.length < 80) continue;

    const achados = [];
    let pontuacaoTotal = 0;

    for (const m of MARCADORES_ESTILISTICOS_IA) {
      if (textoLimpo.includes(m.termo)) {
        achados.push(m.termo);
        pontuacaoTotal += m.peso;
      }
    }

    if (pontuacaoTotal >= 3) {
      alertas.push({
        tipo: 'estilo_redacao_ia',
        numParagrafo: p.numLinha || 0,
        numLinha: p.numLinha || 0,
        secao: p.secao || 'Corpo do Trabalho',
        autorCitado: 'Estilo de Redação',
        fraseWord: p.texto.slice(0, 240) + (p.texto.length > 240 ? '…' : ''),
        marcadores: achados,
        pontuacaoIa: pontuacaoTotal,
        mensagem: `🤖 Alerta de Redação Sintética de IA (Open-Detector): Parágrafo com alta densidade de clichês e cadência típica de LLMs (${achados.map((a) => `"${a}"`).join(', ')}). Recomenda-se reescrever com termos acadêmicos técnicos diretos ou incluir dados empíricos específicos.`,
      });
    }
  }
  return alertas;
}

module.exports = {
  MARCADORES_ESTILISTICOS_IA,
  analisarEstiloRedacaoIaOpenDetector,
};
