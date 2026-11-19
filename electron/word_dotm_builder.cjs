/**
 * electron/word_dotm_builder.cjs
 *
 * Construtor e Instalador da Extensão Nativa para Microsoft Word (.DOTM),
 * inspirado na arquitetura `zotero/zotero-word-for-windows-integration`:
 * - Injeta `customUI/customUI14.xml` (aba Ribbon "Bibliografia Forense") em pacotes OOXML `.dotm` via JSZip.
 * - Verifica e gerencia a instalação automática em `%APPDATA%\Microsoft\Word\STARTUP\Bibliografia.dotm`.
 * - Compila o `.dotm` via automação Word.Application COM quando o usuário autoriza acesso ao VBA no Word
 *   (sem contornar ou alterar chaves de segurança/registro da Central de Confiabilidade).
 */

'use strict';

const fs = require('fs');
const path = require('path');
const { execFile } = require('child_process');
const JSZip = require('jszip');
const { escreverArquivoAtomico } = require('./atomicWrite.cjs');

const REL_TYPE_CUSTOM_UI_14 = 'http://schemas.microsoft.com/office/2007/relationships/ui/extensibility';

function obterCaminhoStartupWord() {
  if (process.platform === 'win32' && process.env.APPDATA) {
    return path.join(process.env.APPDATA, 'Microsoft', 'Word', 'STARTUP');
  }
  return null;
}

/**
 * Diagnostica o estado atual da extensão `.dotm` no projeto e na pasta STARTUP do Microsoft Word.
 */
function diagnosticarExtensaoWord(dirRecursosVba) {
  const pastaStartup = obterCaminhoStartupWord();
  const caminhoStartupDotm = pastaStartup ? path.join(pastaStartup, 'Bibliografia.dotm') : null;
  const caminhoDotmNoApp = path.join(dirRecursosVba, 'Bibliografia.dotm');
  const caminhoBas = path.join(dirRecursosVba, 'Bibliografia.bas');
  const caminhoCustomUi = path.join(dirRecursosVba, 'customUI14.xml');

  const statStartup = caminhoStartupDotm && fs.existsSync(caminhoStartupDotm)
    ? fs.statSync(caminhoStartupDotm)
    : null;
  const statApp = fs.existsSync(caminhoDotmNoApp) ? fs.statSync(caminhoDotmNoApp) : null;

  return {
    plataformaSuportada: process.platform === 'win32',
    pastaStartup,
    caminhoStartupDotm,
    instaladoNoWord: Boolean(statStartup),
    tamanhoStartupBytes: statStartup ? statStartup.size : 0,
    atualizadoEmStartup: statStartup ? statStartup.mtime.toISOString() : null,
    temDotmCompiladoNoApp: Boolean(statApp),
    caminhoDotmNoApp,
    caminhoBas,
    caminhoCustomUi,
  };
}

/**
 * Injeta `customUI/customUI14.xml` dentro de um pacote OOXML `.dotm` existente,
 * atualizando `_rels/.rels` e `[Content_Types].xml`.
 */
async function injetarRibbonCustomUiEmDotm(caminhoEntradaDotm, caminhoSaidaDotm, caminhoCustomUiXml) {
  if (!fs.existsSync(caminhoEntradaDotm)) {
    throw new Error(`Template .dotm não encontrado: ${caminhoEntradaDotm}`);
  }
  if (!fs.existsSync(caminhoCustomUiXml)) {
    throw new Error(`Arquivo Ribbon XML não encontrado: ${caminhoCustomUiXml}`);
  }

  const buf = await fs.promises.readFile(caminhoEntradaDotm);
  const customUiXml = await fs.promises.readFile(caminhoCustomUiXml, 'utf8');
  const zip = await JSZip.loadAsync(buf);

  // 1. Grava customUI/customUI14.xml
  zip.file('customUI/customUI14.xml', customUiXml);

  // 2. Garante relacionamento ui/extensibility em _rels/.rels
  const relsFile = zip.file('_rels/.rels');
  let relsXml = relsFile
    ? await relsFile.async('string')
    : '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>';

  if (!relsXml.includes(REL_TYPE_CUSTOM_UI_14)) {
    const novoRel = `<Relationship Id="rIdBibRibbon14" Type="${REL_TYPE_CUSTOM_UI_14}" Target="customUI/customUI14.xml"/>`;
    relsXml = relsXml.replace('</Relationships>', `${novoRel}</Relationships>`);
    zip.file('_rels/.rels', relsXml);
  }

  // 3. Garante Content-Type para extensão .xml em [Content_Types].xml
  const ctFile = zip.file('[Content_Types].xml');
  if (ctFile) {
    let ctXml = await ctFile.async('string');
    if (!/Extension="xml"/i.test(ctXml)) {
      ctXml = ctXml.replace('</Types>', '<Default Extension="xml" ContentType="application/xml"/></Types>');
      zip.file('[Content_Types].xml', ctXml);
    }
  }

  const outBuf = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
  await escreverArquivoAtomico(caminhoSaidaDotm, outBuf);
  return { caminhoSaidaDotm, tamanhoBytes: outBuf.length };
}

/**
 * Copia um `.dotm` compilado pronto para `%APPDATA%\Microsoft\Word\STARTUP\Bibliografia.dotm`.
 */
async function instalarDotmEmStartup(caminhoOrigemDotm) {
  if (!fs.existsSync(caminhoOrigemDotm)) {
    throw new Error('Arquivo Bibliografia.dotm não encontrado.');
  }
  const pastaStartup = obterCaminhoStartupWord();
  if (!pastaStartup) {
    throw new Error('Instalação automática na pasta STARTUP disponível no Windows.');
  }
  await fs.promises.mkdir(pastaStartup, { recursive: true });
  const destino = path.join(pastaStartup, 'Bibliografia.dotm');
  await fs.promises.copyFile(caminhoOrigemDotm, destino);
  return { destino, pastaStartup };
}

/**
 * Remove `Bibliografia.dotm` da pasta STARTUP do Word.
 */
async function removerDotmDoStartup() {
  const pastaStartup = obterCaminhoStartupWord();
  if (!pastaStartup) return { removido: false };
  const destino = path.join(pastaStartup, 'Bibliografia.dotm');
  if (fs.existsSync(destino)) {
    await fs.promises.unlink(destino);
    return { removido: true, destino };
  }
  return { removido: false, destino };
}

function validarCaminhoSeguroPs(caminho, extensoesPermitidas = [], exigirExistencia = false) {
  if (typeof caminho !== 'string' || !caminho.trim()) {
    throw new Error('Caminho inválido ou vazio para automação Word.');
  }
  if (/[\0\r\n]/.test(caminho)) {
    throw new Error('Caminho contém caracteres de controle não permitidos.');
  }
  const resolvido = path.resolve(caminho);
  if (!path.isAbsolute(resolvido)) {
    throw new Error('Caminho deve ser absoluto.');
  }
  if (extensoesPermitidas.length > 0 && !extensoesPermitidas.includes(path.extname(resolvido).toLowerCase())) {
    throw new Error(`Extensão de arquivo não permitida: ${path.extname(resolvido)}`);
  }
  if (exigirExistencia && !fs.existsSync(resolvido)) {
    throw new Error(`Arquivo não encontrado: ${resolvido}`);
  }
  return resolvido;
}

/**
 * Compila `Bibliografia.bas` + `customUI14.xml` em um `.dotm` usando Microsoft Word COM legítimo.
 * Não altera chaves de registro nem contorna permissões da Central de Confiabilidade:
 * caso o acesso programático ao projeto VBA esteja desabilitado nas opções do Word,
 * retorna `{ ok: false, precisaConfiarVba: true }` com orientação transparente ao usuário.
 */
async function compilarDotmViaWordCom({ caminhoBas, caminhoCustomUi, caminhoSaidaDotm }) {
  if (process.platform !== 'win32') {
    return { ok: false, mensagem: 'Compilação COM do Word disponível apenas no Windows.' };
  }
  const basSeguro = validarCaminhoSeguroPs(caminhoBas, ['.bas'], true);
  const dotmSeguro = validarCaminhoSeguroPs(caminhoSaidaDotm, ['.dotm'], false);
  const tmpDotm = `${dotmSeguro}.tmp.dotm`;
  if (fs.existsSync(tmpDotm)) await fs.promises.unlink(tmpDotm).catch(() => {});

  const psScript = `
    $ErrorActionPreference = "Stop"
    $word = $null
    $doc = $null
    try {
      $basPath = [System.IO.Path]::GetFullPath($env:BIB_BAS_PATH)
      $outPath = [System.IO.Path]::GetFullPath($env:BIB_OUT_PATH)
      $word = New-Object -ComObject Word.Application
      $word.Visible = $false
      $word.DisplayAlerts = 0
      $doc = $word.Documents.Add()
      try {
        $vbProj = $doc.VBProject
      } catch {
        Write-Output ("ERR_TRUST_VBA:" + $_.Exception.Message)
        exit 0
      }
      $vbProj.Name = "BibliografiaForenseProject"
      $vbProj.VBComponents.Import($basPath) | Out-Null
      $doc.SaveAs2($outPath, 15)
      $doc.Close($false)
      $doc = $null
      Write-Output "OK_DOTM"
    } catch {
      Write-Output ("ERR_COM:" + $_.Exception.Message)
    } finally {
      if ($doc) { try { $doc.Close($false) } catch {} }
      if ($word) { try { $word.Quit($false) } catch {} }
    }
  `;

  const stdout = await new Promise((resolve, reject) => {
    execFile(
      'powershell',
      ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psScript],
      { timeout: 25000, env: { ...process.env, BIB_BAS_PATH: basSeguro, BIB_OUT_PATH: tmpDotm } },
      (err, out) => {
        if (err && !out) return reject(err);
        resolve(String(out || '').trim());
      }
    );
  });

  if (stdout.includes('ERR_TRUST_VBA:')) {
    return {
      ok: false,
      precisaConfiarVba: true,
      mensagem:
        'O Microsoft Word bloqueou a criação automática da macro porque a opção "Confiar no acesso ao modelo de objeto do projeto do VBA" está desmarcada na Central de Confiabilidade do Word.',
    };
  }
  if (!stdout.includes('OK_DOTM') || !fs.existsSync(tmpDotm)) {
    return {
      ok: false,
      precisaConfiarVba: false,
      mensagem: `Não foi possível gerar o .dotm automaticamente (${stdout || 'Word COM indisponível'}).`,
    };
  }

  try {
    await injetarRibbonCustomUiEmDotm(tmpDotm, dotmSeguro, caminhoCustomUi);
  } finally {
    if (fs.existsSync(tmpDotm)) await fs.promises.unlink(tmpDotm).catch(() => {});
  }

  return { ok: true, caminhoDotm: dotmSeguro };
}

module.exports = {
  REL_TYPE_CUSTOM_UI_14,
  obterCaminhoStartupWord,
  diagnosticarExtensaoWord,
  injetarRibbonCustomUiEmDotm,
  instalarDotmEmStartup,
  removerDotmDoStartup,
  compilarDotmViaWordCom,
};
