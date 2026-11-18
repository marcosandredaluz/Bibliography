/**
 * tests/test_novos_modulos_clean_room.test.cjs
 *
 * Valida os Módulos Clean-Room implementados:
 * - Módulo 2: Web Clipper POST /api/v1/clip (token local timingSafeEqual, sanitização HTML, deduplicação 6-critérios)
 * - Módulo 3: RoB 2 / ROBINS-I (status inicial pending_human_review obrigatório, exigência de reviewer_id, cadeia SHA-256 append-only)
 * - Módulo 4: Citations Resolve / Bibliography (/api/v1/citations/resolve e /bibliography, falhas explícitas e trava Quarto >= 1.4.0 MIT)
 */
'use strict';

const assert = require('assert');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { iniciarServidorWord } = require('../electron/wordServer.cjs');
const { sanitizarHtmlBasico } = require('../electron/clipperRoute.cjs');
const { verificarQuartoCliCompatibilidade } = require('../electron/citationsApiRoute.cjs');
const {
  criarSugestaoAvaliacaoRob,
  confirmarAvaliacaoRobHumana,
  lerAuditTrailRob,
} = require('../electron/rob_assessor.cjs');

function reqJson(porta, rota, payload, headers = {}) {
  return new Promise((resolve, reject) => {
    const corpo = JSON.stringify(payload);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: porta,
        path: rota,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(corpo),
          ...headers,
        },
      },
      (res) => {
        let chunks = '';
        res.on('data', (c) => (chunks += c));
        res.on('end', () => {
          try {
            resolve({ status: res.statusCode, json: JSON.parse(chunks || '{}') });
          } catch {
            resolve({ status: res.statusCode, raw: chunks });
          }
        });
      }
    );
    req.on('error', reject);
    req.write(corpo);
    req.end();
  });
}

(async () => {
  console.log('--- TESTANDO MÓDULOS CLEAN-ROOM (2: CLIPPER, 3: ROB 2/ROBINS-I, 4: PANDOC/QUARTO) ---');

  const tmpRaiz = fs.mkdtempSync(path.join(os.tmpdir(), 'bib-cleanroom-'));
  fs.mkdirSync(path.join(tmpRaiz, 'referencias'), { recursive: true });
  fs.mkdirSync(path.join(tmpRaiz, 'documentos'), { recursive: true });

  const refsMap = new Map([
    [
      '2021-silva-vigilancia',
      {
        id: '2021-silva-vigilancia',
        status: 'a_ler',
        csl: {
          id: '2021-silva-vigilancia',
          type: 'article-journal',
          title: 'Avaliação do Sistema de Vigilância do PNI',
          author: [{ family: 'Silva', given: 'Aline Almeida da' }],
          issued: { 'date-parts': [[2021]] },
          DOI: '10.1590/S1679-49742021000100015',
          abstract: 'Randomized concealed allocation with blinded outcome assessor and intention-to-treat analysis (NCT04123456).',
        },
      },
    ],
  ]);

  const fakeBib = {
    raiz: tmpRaiz,
    refs: refsMap,
    async adicionar(dados) {
      const id = `clip-${refsMap.size + 1}`;
      const reg = { ...dados, id, csl: { ...(dados.csl || {}), id } };
      refsMap.set(id, reg);
      fs.writeFileSync(path.join(tmpRaiz, 'referencias', `${id}.json`), JSON.stringify(reg, null, 2));
      return reg;
    },
    async atualizar(id, patch) {
      const atual = refsMap.get(id);
      if (!atual) throw new Error('Referência não encontrada');
      const novo = { ...atual, ...patch, id };
      refsMap.set(id, novo);
      return novo;
    },
  };

  const TOKEN_SECRETO = 'tok-forense-teste-9988776655';
  const portaTeste = 24119;
  const { srv } = iniciarServidorWord({
    obterBiblioteca: () => fakeBib,
    obterConfig: () => ({
      estilo: 'associacao-brasileira-de-normas-tecnicas',
      idioma: 'pt-BR',
      localApiToken: TOKEN_SECRETO,
    }),
    porta: portaTeste,
  });

  await new Promise((r) => srv.once('listening', r));

  try {
    // 1. MÓDULO 2: Web Clipper POST /api/v1/clip
    const xssLimpo = sanitizarHtmlBasico('<p onclick="alert(1)">Ok</p><script>evil()</script>');
    assert.ok(!xssLimpo.includes('<script') && !xssLimpo.includes('onclick'), 'HTML XSS deve ser sanitizado');

    const semToken = await reqJson(portaTeste, '/api/v1/clip', { source_url: 'https://x.org', title: 'Teste' });
    assert.strictEqual(semToken.status, 403, 'Clipper sem token deve retornar 403');

    const tokenErrado = await reqJson(
      portaTeste,
      '/api/v1/clip',
      { source_url: 'https://x.org', title: 'Teste' },
      { 'X-Bibliography-Local-Token': 'errado' }
    );
    assert.strictEqual(tokenErrado.status, 403, 'Clipper com token inválido deve retornar 403');

    const clipNovo = await reqJson(
      portaTeste,
      '/api/v1/clip',
      {
        source_url: 'https://scielo.br/artigo',
        detected_type: 'article-journal',
        doi: '10.1590/novo-estudo-2026',
        title: 'Estudo Novo sobre Cobertura Vacinal',
        authors: [{ family: 'Luz', given: 'Marcos' }],
        html: '<p>Resumo capturado</p><script>hack()</script>',
        captured_at: '2026-11-18T12:00:00Z',
        extension_version: '1.0.0',
      },
      {
        Origin: 'chrome-extension://abcdefghijklmnopabcdefghijklmnop',
        'X-Bibliography-Local-Token': TOKEN_SECRETO,
      }
    );
    assert.strictEqual(clipNovo.status, 200);
    assert.strictEqual(clipNovo.json.dedupe_status, 'created');
    assert.strictEqual(clipNovo.json.created_files.length, 1);

    const clipDup = await reqJson(
      portaTeste,
      '/api/v1/clip',
      {
        source_url: 'https://scielo.br/artigo?copy=2',
        doi: '10.1590/novo-estudo-2026',
        title: 'Estudo Novo sobre Cobertura Vacinal',
        captured_at: '2026-11-18T12:05:00Z',
        extension_version: '1.0.0',
      },
      { 'X-Bibliography-Local-Token': TOKEN_SECRETO }
    );
    assert.strictEqual(clipDup.status, 200);
    assert.strictEqual(clipDup.json.dedupe_status, 'duplicate_skipped', 'Segundo envio com mesmo DOI deve deduplicar');
    console.log('✓ 1. Módulo 2 (/api/v1/clip + token + XSS strip + deduplicação) validado.');

    // 2. MÓDULO 3: Risco de Viés (RoB 2 / ROBINS-I + Revisão Humana Obrigatória + SHA-256 Trail)
    const sug = criarSugestaoAvaliacaoRob(fakeBib.refs.get('2021-silva-vigilancia'), 'ROB2');
    assert.strictEqual(sug.status, 'pending_human_review', 'Sugestão automática NUNCA nasce confirmada');
    assert.strictEqual(sug.final_human_overall, null, 'Decisão final humana deve iniciar null');
    assert.strictEqual(sug.domains.length, 5, 'RoB 2 deve ter 5 domínios');

    let erroSemRevisor = false;
    try {
      await confirmarAvaliacaoRobHumana({
        bib: fakeBib,
        refId: '2021-silva-vigilancia',
        reviewerId: '   ',
        domainJudgments: { D1: 'low' },
      });
    } catch {
      erroSemRevisor = true;
    }
    assert.strictEqual(erroSemRevisor, true, 'Confirmação sem reviewer_id deve falhar explicitamente');

    const conf = await confirmarAvaliacaoRobHumana({
      bib: fakeBib,
      refId: '2021-silva-vigilancia',
      reviewerId: 'M. Luz (Revisor 1)',
      domainJudgments: { D1: 'low', D2: 'some_concerns', D3: 'low', D4: 'low', D5: 'low' },
    });
    assert.strictEqual(conf.assessment.final_human_overall, 'some_concerns');
    const trilha = await lerAuditTrailRob(tmpRaiz);
    assert.strictEqual(trilha.length, 1);
    assert.strictEqual(trilha[0].prev_entry_sha256, '0'.repeat(64));
    console.log('✓ 2. Módulo 3 (RoB 2/ROBINS-I pending_human_review + trilha SHA-256 append-only) validado.');

    // 3. MÓDULO 4: Pandoc / Quarto API + Trava >= 1.4.0 MIT
    const q13 = verificarQuartoCliCompatibilidade('1.3.45');
    assert.strictEqual(q13.compativel, false, 'Quarto 1.3.x (GPL-2.0) deve ser bloqueado');
    const q14 = verificarQuartoCliCompatibilidade('1.4.55');
    assert.strictEqual(q14.compativel, true, 'Quarto >= 1.4.0 (MIT) deve ser aceito');

    const resKey = await reqJson(
      portaTeste,
      '/api/v1/citations/resolve',
      { keys: ['2021-silva-vigilancia'], page: '45' },
      { 'X-Bibliography-Local-Token': TOKEN_SECRETO }
    );
    assert.strictEqual(resKey.status, 200);
    assert.ok(resKey.json.resolved['2021-silva-vigilancia'].bibtex.includes('@article{2021-silva-vigilancia'));

    const resMissing = await reqJson(
      portaTeste,
      '/api/v1/citations/resolve',
      { keys: ['chave-que-nao-existe'] },
      { 'X-Bibliography-Local-Token': TOKEN_SECRETO }
    );
    assert.strictEqual(resMissing.status, 404, 'Chave inexistente deve falhar explicitamente com 404');

    const resBib = await reqJson(
      portaTeste,
      '/api/v1/citations/bibliography',
      { keys: ['2021-silva-vigilancia'] },
      { 'X-Bibliography-Local-Token': TOKEN_SECRETO }
    );
    assert.strictEqual(resBib.status, 200);
    assert.strictEqual(resBib.json.total_cited, 1);
    assert.ok(fs.existsSync(resBib.json.bib_file_path), 'cited-only.bib deve ser gravado');
    console.log('✓ 3. Módulo 4 (/api/v1/citations/resolve & /bibliography + Quarto >= 1.4 MIT) validado.');

    console.log('\n🎉 TODOS OS TESTES DOS MÓDULOS CLEAN-ROOM 2, 3 E 4 PASSARAM COM 100%!');
  } finally {
    srv.close();
    fs.rmSync(tmpRaiz, { recursive: true, force: true });
  }
})();
