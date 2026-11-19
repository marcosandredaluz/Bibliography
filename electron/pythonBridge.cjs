/**
 * electron/pythonBridge.cjs
 *
 * Gerencia o ciclo de vida silencioso do backend auxiliar Python (`uvicorn app.main:app` na porta 23120)
 * e fornece ponte segura para extração geométrica de PDFs multi-coluna/tabelas via `pdf_layout_pipeline.py`
 * (`pdfplumber` MIT + `pypdf` BSD-3-Clause), com fallback automático para PDF.js quando Python estiver ausente.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { spawn, execFile } = require('child_process');

const PYTHON_PORT = Number(process.env.BIBLIOGRAPHY_PY_PORT || 23120);
const BASE_URL = `http://127.0.0.1:${PYTHON_PORT}`;
const BACKEND_DIR = path.join(__dirname, '..', 'backend');

let processoPython = null;
let backendDisponivel = false;
let inicializacaoPromise = null;

function tentarComandoPython() {
  return process.platform === 'win32' ? ['python', 'py'] : ['python3', 'python'];
}

async function verificarHealthPython(timeoutMs = 1500) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(`${BASE_URL}/health`, { signal: ctrl.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

async function iniciarBackendPythonSilencioso() {
  if (inicializacaoPromise) return inicializacaoPromise;
  inicializacaoPromise = (async () => {
    if (!fs.existsSync(path.join(BACKEND_DIR, 'app', 'main.py'))) {
      return false;
    }
    if (await verificarHealthPython(800)) {
      backendDisponivel = true;
      return true;
    }

    for (const cmd of tentarComandoPython()) {
      try {
        const proc = spawn(
          cmd,
          ['-m', 'uvicorn', 'app.main:app', '--host', '127.0.0.1', '--port', String(PYTHON_PORT), '--log-level', 'warning'],
          {
            cwd: BACKEND_DIR,
            env: {
              ...process.env,
              APP_HOST: '127.0.0.1',
              APP_PORT: String(PYTHON_PORT),
              PYTHONUNBUFFERED: '1',
            },
            windowsHide: true,
            stdio: 'ignore',
          }
        );

        let falhou = false;
        proc.on('error', () => {
          falhou = true;
        });
        proc.on('exit', () => {
          backendDisponivel = false;
          if (processoPython === proc) processoPython = null;
        });

        for (let tentativa = 0; tentativa < 8; tentativa++) {
          if (falhou || proc.exitCode !== null) break;
          await new Promise((r) => setTimeout(r, 350));
          if (await verificarHealthPython(700)) {
            processoPython = proc;
            backendDisponivel = true;
            return true;
          }
        }
        try {
          proc.kill();
        } catch {}
      } catch {
        /* tenta próximo binário Python */
      }
    }
    backendDisponivel = false;
    return false;
  })();
  return inicializacaoPromise;
}

function encerrarBackendPython() {
  backendDisponivel = false;
  inicializacaoPromise = null;
  if (processoPython) {
    try {
      processoPython.kill();
    } catch {}
    processoPython = null;
  }
}

function validarCaminhoPdfSeguro(caminhoPdf) {
  if (!caminhoPdf || typeof caminhoPdf !== 'string') return null;
  const abs = path.resolve(caminhoPdf);
  if (path.extname(abs).toLowerCase() !== '.pdf') return null;
  if (!fs.existsSync(abs)) return null;
  const st = fs.statSync(abs);
  if (!st.isFile()) return null;
  return abs;
}

async function extrairLayoutViaBridgeDireto(caminhoPdfAbs, timeoutMs = 15000) {
  const scriptPy = [
    'import json, os, sys',
    `sys.path.insert(0, os.environ["BIB_BACKEND_DIR"])`,
    'from app.core.pdf_layout_pipeline import extrair_layout_e_tabelas_pdf',
    'res = extrair_layout_e_tabelas_pdf(os.environ["BIB_PDF_PATH"])',
    'print(json.dumps(res, ensure_ascii=False))',
  ].join('; ');

  for (const cmd of tentarComandoPython()) {
    const res = await new Promise((resolve) => {
      execFile(
        cmd,
        ['-c', scriptPy],
        {
          timeout: timeoutMs,
          maxBuffer: 16 * 1024 * 1024,
          windowsHide: true,
          env: {
            ...process.env,
            BIB_BACKEND_DIR: BACKEND_DIR,
            BIB_PDF_PATH: caminhoPdfAbs,
            PYTHONIOENCODING: 'utf-8',
          },
        },
        (err, stdout) => {
          if (err || !stdout) return resolve(null);
          try {
            const parsed = JSON.parse(stdout.trim());
            if (parsed && parsed.sucesso) return resolve(parsed);
          } catch {}
          resolve(null);
        }
      );
    });
    if (res) return res;
  }
  return null;
}

/**
 * Extrai layout multi-coluna e tabelas de um PDF usando o serviço Python FastAPI (se ativo)
 * ou fallback bridge direto para `pdf_layout_pipeline.py`. Retorna null caso Python não esteja disponível.
 */
async function extrairLayoutPdfComBackend(caminhoPdf) {
  const abs = validarCaminhoPdfSeguro(caminhoPdf);
  if (!abs) return null;

  if (backendDisponivel || (await verificarHealthPython(500))) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 12000);
    try {
      const res = await fetch(`${BASE_URL}/api/word/extrair-layout-pdf`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ caminho_pdf: abs, usar_docling: false }),
        signal: ctrl.signal,
      });
      if (res.ok) {
        const dados = await res.json();
        if (dados?.sucesso) return dados;
      }
    } catch {
      /* fallback direto abaixo */
    } finally {
      clearTimeout(timer);
    }
  }

  return extrairLayoutViaBridgeDireto(abs);
}

module.exports = {
  PYTHON_PORT,
  iniciarBackendPythonSilencioso,
  encerrarBackendPython,
  extrairLayoutPdfComBackend,
  estaAtivo: () => backendDisponivel,
};
