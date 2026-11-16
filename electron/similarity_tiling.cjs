/**
 * similarity_tiling.cjs
 * 
 * Implementação do algoritmo RKR-GST (Running Karp-Rabin Greedy String Tiling),
 * a técnica central empregada pelo JPlag (Prechelt, Malpohl & Philippsen, 2002).
 * 
 * Propósito:
 * Detecção de plágio estrutural e mosaico independente da ordem linear das orações.
 * Enquanto algoritmos de diff linear (como Diff Match Patch) tratam inversão de orações
 * ou fragmentos intercalados como exclusão e inserção, o Greedy String Tiling identifica
 * todas as maiores fatias (tiles) coincidentes, mesmo que tenham sido transpostas ou
 * recortadas de diferentes partes do documento fonte.
 */

'use strict';

/**
 * Executa o algoritmo Greedy String Tiling entre duas sequências de palavras/tokens.
 * 
 * @param {string[]|string} entradaA Texto ou array de tokens do documento A (ex: manuscrito)
 * @param {string[]|string} entradaB Texto ou array de tokens do documento B (ex: artigo científico)
 * @param {number} minTileLength Comprimento mínimo de um bloco/tile (padrão: 7 palavras)
 * @returns {Object} Resultado detalhado com os tiles encontrados, cobertura e classificação
 */
function executarGreedyStringTiling(entradaA, entradaB, minTileLength = 7) {
  const tokensA = Array.isArray(entradaA)
    ? entradaA
    : String(entradaA || '').trim().split(/\s+/).filter(Boolean);
  const tokensB = Array.isArray(entradaB)
    ? entradaB
    : String(entradaB || '').trim().split(/\s+/).filter(Boolean);

  const lenA = tokensA.length;
  const lenB = tokensB.length;

  if (lenA < minTileLength || lenB < minTileLength) {
    return {
      tiles: [],
      totalCoincidentWords: 0,
      coverageA: 0,
      coverageB: 0,
      tilesCount: 0,
      isMosaic: false,
      maiorBlocoIdentico: '',
    };
  }

  // Máscaras de booleanos (Uint8Array) para marcar tokens já absorvidos por tiles anteriores
  const markedA = new Uint8Array(lenA);
  const markedB = new Uint8Array(lenB);

  const tiles = [];
  let maxMatchLength = Infinity;

  // Laço iterativo ganancioso: em cada rodada encontra os maiores casamentos contíguos possíveis
  while (maxMatchLength >= minTileLength) {
    maxMatchLength = minTileLength - 1;
    let matchesOfMaxLen = [];

    for (let i = 0; i < lenA; i++) {
      if (markedA[i]) continue;

      for (let j = 0; j < lenB; j++) {
        if (markedB[j]) continue;

        let k = 0;
        while (
          i + k < lenA &&
          j + k < lenB &&
          !markedA[i + k] &&
          !markedB[j + k] &&
          tokensA[i + k] === tokensB[j + k]
        ) {
          k++;
        }

        if (k > maxMatchLength) {
          maxMatchLength = k;
          matchesOfMaxLen = [{ aStart: i, bStart: j, length: k }];
        } else if (k === maxMatchLength && k >= minTileLength) {
          matchesOfMaxLen.push({ aStart: i, bStart: j, length: k });
        }
      }
    }

    if (maxMatchLength < minTileLength) {
      break;
    }

    // Marca os casamentos encontrados de maior comprimento que não sobrepõem os já marcados nesta iteração
    for (let m = 0; m < matchesOfMaxLen.length; m++) {
      const match = matchesOfMaxLen[m];
      let sobrepoe = false;

      for (let offset = 0; offset < match.length; offset++) {
        if (markedA[match.aStart + offset] || markedB[match.bStart + offset]) {
          sobrepoe = true;
          break;
        }
      }

      if (!sobrepoe) {
        for (let offset = 0; offset < match.length; offset++) {
          markedA[match.aStart + offset] = 1;
          markedB[match.bStart + offset] = 1;
        }

        const textoTile = tokensA.slice(match.aStart, match.aStart + match.length).join(' ');
        tiles.push({
          aStart: match.aStart,
          bStart: match.bStart,
          length: match.length,
          texto: textoTile,
        });
      }
    }
  }

  // Ordena os tiles pela ordem de aparição no documento A
  tiles.sort((t1, t2) => t1.aStart - t2.aStart);

  let totalCoincidentWords = 0;
  let maiorBlocoIdentico = '';

  for (let i = 0; i < tiles.length; i++) {
    const t = tiles[i];
    totalCoincidentWords += t.length;
    if (t.texto.length > maiorBlocoIdentico.length) {
      maiorBlocoIdentico = t.texto;
    }
  }

  const coverageA = Math.min(100, Math.round((totalCoincidentWords / Math.max(lenA, 1)) * 100));
  const coverageB = Math.min(100, Math.round((totalCoincidentWords / Math.max(lenB, 1)) * 100));

  // Detecta se é mosaico: múltiplos blocos ou inversão da ordem relativa de B em A
  let temInversaoDeOrdem = false;
  for (let i = 1; i < tiles.length; i++) {
    if (tiles[i].bStart < tiles[i - 1].bStart) {
      temInversaoDeOrdem = true;
      break;
    }
  }
  const isMosaic = tiles.length >= 2 || temInversaoDeOrdem;

  return {
    tiles,
    totalCoincidentWords,
    coverageA,
    coverageB,
    tilesCount: tiles.length,
    isMosaic,
    maiorBlocoIdentico,
  };
}

module.exports = {
  executarGreedyStringTiling,
};
