// Utilitários de escrita atômica resiliente a travamentos temporários do Windows / OneDrive / Google Drive.
const fs = require('fs');
const fsp = fs.promises;
const path = require('path');

const CODIGOS_LOCK_TRANSITORIO = new Set(['EPERM', 'EBUSY', 'EACCES']);
const espera = (ms) => new Promise((r) => setTimeout(r, ms));

function dormirSync(ms) {
  try {
    const sab = new SharedArrayBuffer(4);
    Atomics.wait(new Int32Array(sab), 0, 0, ms);
  } catch {
    const fim = Date.now() + ms;
    while (Date.now() < fim) {
      /* aguarda bloqueio breve de antivirus/OneDrive */
    }
  }
}

async function renomearComRetry(tmp, destino, maxTentativas = 8) {
  for (let i = 0; ; i++) {
    try {
      await fsp.rename(tmp, destino);
      return;
    } catch (e) {
      if (i >= maxTentativas || !CODIGOS_LOCK_TRANSITORIO.has(e.code)) {
        await fsp.rm(tmp, { force: true }).catch(() => {});
        throw e;
      }
      await espera(150 * (i + 1));
    }
  }
}

function criarNomeTemp(destino) {
  return `${destino}.${process.pid}.${Date.now()}.tmp`;
}

/** Escreve texto ou Buffer em arquivo temporário no mesmo diretório e renomeia atomicamente. */
async function escreverArquivoAtomico(destino, conteudo, encoding = 'utf8', maxTentativas = 8) {
  await fsp.mkdir(path.dirname(destino), { recursive: true });
  const tmp = criarNomeTemp(destino);
  const encFinal = Buffer.isBuffer(conteudo) ? null : encoding;
  await fsp.writeFile(tmp, conteudo, encFinal);
  await renomearComRetry(tmp, destino, maxTentativas);
}

/** Serializa JSON formatado e grava atomicamente com retry para locks de nuvem. */
async function escreverJsonAtomico(arquivo, dados) {
  await escreverArquivoAtomico(arquivo, JSON.stringify(dados, null, 2), 'utf8');
}

/** Versão síncrona atômica (.tmp + renameSync com retry) para arquivos locais e buffers binários. */
function escreverArquivoAtomicoSync(destino, conteudo, encoding = 'utf8', maxTentativas = 5) {
  fs.mkdirSync(path.dirname(destino), { recursive: true });
  const tmp = criarNomeTemp(destino);
  const encFinal = Buffer.isBuffer(conteudo) ? null : encoding;
  fs.writeFileSync(tmp, conteudo, encFinal);
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, destino);
      return;
    } catch (e) {
      if (i >= maxTentativas || !CODIGOS_LOCK_TRANSITORIO.has(e.code)) {
        try {
          fs.rmSync(tmp, { force: true });
        } catch {}
        throw e;
      }
      dormirSync(80 * (i + 1));
    }
  }
}

/** Versão síncrona atômica dedicada para objetos JSON formatados. */
function escreverJsonAtomicoSync(arquivo, dados) {
  escreverArquivoAtomicoSync(arquivo, JSON.stringify(dados, null, 2), 'utf8');
}

/** Copia arquivo de origem para temp no diretório de destino e promove atomicamente. */
async function copiarArquivoAtomico(origem, destino) {
  await fsp.mkdir(path.dirname(destino), { recursive: true });
  const tmp = criarNomeTemp(destino);
  try {
    await fsp.copyFile(origem, tmp);
    await renomearComRetry(tmp, destino);
  } catch (e) {
    await fsp.rm(tmp, { force: true }).catch(() => {});
    throw e;
  }
}

module.exports = {
  escreverArquivoAtomico,
  escreverJsonAtomico,
  escreverArquivoAtomicoSync,
  escreverJsonAtomicoSync,
  copiarArquivoAtomico,
};
