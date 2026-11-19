// Cofre de contas dos buscadores. As senhas são criptografadas pelo Windows (DPAPI,
// via safeStorage do Electron) e ficam SÓ neste notebook (pasta de dados do app),
// nunca na pasta sincronizada com a nuvem.
const { app, safeStorage, clipboard } = require('electron');
const fs = require('fs');
const path = require('path');
const { escreverJsonAtomicoSync } = require('./atomicWrite.cjs');

const arquivo = () => path.join(app.getPath('userData'), 'cofre.json');

function ler() {
  try {
    return JSON.parse(fs.readFileSync(arquivo(), 'utf8'));
  } catch {
    return { contas: {} };
  }
}

function gravar(dados) {
  escreverJsonAtomicoSync(arquivo(), dados);
}

function disponivel() {
  return safeStorage.isEncryptionAvailable();
}

/** Lista as contas sem revelar as senhas. */
function listar() {
  const { contas } = ler();
  return Object.fromEntries(
    Object.entries(contas).map(([id, c]) => [id, { usuario: c.usuario || '', notas: c.notas || '', temSenha: !!c.senha }])
  );
}

function salvar(id, { usuario, senha, notas }) {
  const dados = ler();
  const atual = dados.contas[id] || {};
  const nova = { ...atual, usuario: usuario ?? atual.usuario, notas: notas ?? atual.notas };
  if (senha !== undefined) {
    if (senha === '') delete nova.senha;
    else {
      if (!disponivel()) throw new Error('Criptografia do Windows indisponível; a senha não foi salva.');
      nova.senha = safeStorage.encryptString(senha).toString('base64');
    }
  }
  dados.contas[id] = nova;
  gravar(dados);
  return listar();
}

function remover(id) {
  const dados = ler();
  delete dados.contas[id];
  gravar(dados);
  return listar();
}

function revelar(id) {
  const c = ler().contas[id];
  if (!c?.senha) return '';
  return safeStorage.decryptString(Buffer.from(c.senha, 'base64'));
}

let timerLimpeza = null;
/** Copia a senha e limpa a área de transferência após 30 s. */
function copiarSenha(id) {
  const senha = revelar(id);
  if (!senha) throw new Error('Nenhuma senha salva para este buscador.');
  clipboard.writeText(senha);
  clearTimeout(timerLimpeza);
  timerLimpeza = setTimeout(() => {
    if (clipboard.readText() === senha) clipboard.clear();
  }, 30000);
  return true;
}

module.exports = { disponivel, listar, salvar, remover, revelar, copiarSenha };
