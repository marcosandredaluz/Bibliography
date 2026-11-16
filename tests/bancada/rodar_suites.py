"""Suítes complementares da bancada: TCC real (ponta a ponta), rede simulada, afirmações, plágio,
segurança de caminhos e referências reais anotadas.

Uso: python3 rodar_suites.py --config adaptadores.json [--suites tcc,rede,afirmacoes,plagio,seguranca,referencias]

adaptadores.json indica, para cada modo, o comando do motor (use {arquivo} no lugar do arquivo de entrada).
Um modo com valor null é marcado como "não implementado" no relatório, o que reprova o portão.
"""
import argparse, collections, json, os, re, shlex, subprocess, sys, time, unicodedata

RAIZ = os.path.dirname(os.path.abspath(__file__))
S = os.path.join(RAIZ, 'suites')


def nz(s):
    s = unicodedata.normalize('NFKD', s or '')
    return re.sub(r'\s+', ' ', ''.join(c for c in s if not unicodedata.combining(c))).lower().strip()


def roda(cmd, arquivo, env=None, timeout=600):
    partes = [x.replace('{arquivo}', arquivo) for x in shlex.split(cmd)]
    r = subprocess.run(partes, capture_output=True, text=True, timeout=timeout, env={**os.environ, **(env or {})}, cwd=RAIZ)
    if r.returncode != 0:
        raise RuntimeError(r.stderr[-500:])
    return json.loads(r.stdout)


def suite_tcc(cfg):
    g = json.load(open(os.path.join(S, 'tcc', 'gabarito_tcc.json')))
    linhas, ok = [], True
    for arq, esp in g['versoes'].items():
        out = roda(cfg['documento'], os.path.join(S, 'tcc', arq))
        al = out.get('alertas', [])
        txt = [(a.get('ponto'), nz(json.dumps(a, ensure_ascii=False))) for a in al]
        nref = len(out.get('referencias', []))
        nD = sum(1 for p, _ in txt if p == 'D'); nE = sum(1 for p, _ in txt if p == 'E')
        achados = [r for r in esp['alertas_reais'] if any(p == r['ponto'] and nz(r['ancora']) in t for p, t in txt)]
        viol = []
        for pr in g['alertas_proibidos']:
            if pr.get('so_versao') and pr['so_versao'] != arq:
                continue
            for p, t in txt:
                if p == pr['ponto'] and (not pr['ancora'] or nz(pr['ancora']) in t):
                    viol.append(f"{pr['ponto']}:{pr['ancora'] or '*'}"); break
        criticos = sum(1 for p, _ in txt if p in ('A', 'C', 'D', 'E', 'G'))
        passou = nref == esp['n_referencias'] and nD == 0 and nE == 0 and not viol and len(achados) == len(esp['alertas_reais'])
        if arq == 'tcc_v22.docx':
            passou = passou and criticos == 0
        ok &= passou
        linhas.append(f"| {arq} | {nref}/{esp['n_referencias']} | {nD} | {nE} | {len(achados)}/{len(esp['alertas_reais'])} | {', '.join(viol) or 'nenhuma'} | {criticos} | {'APROVADO' if passou else 'REPROVADO'} |")
    cab = '| Versão | Referências lidas | D | E | Problemas reais achados | Alertas proibidos emitidos | Alertas críticos | Situação |\n|---|---|---|---|---|---|---|---|'
    return ok, cab + '\n' + '\n'.join(linhas)


def suite_rede(cfg):
    import socket
    g = json.load(open(os.path.join(S, 'rede', 'gabarito_rede.json')))
    srv = subprocess.Popen([sys.executable, os.path.join(S, 'rede', 'servidor_simulado.py'), '8765'])
    try:
        for _ in range(50):
            try:
                socket.create_connection(('127.0.0.1', 8765), 0.2).close(); break
            except OSError:
                time.sleep(0.1)
        env = {'AUDITOR_CROSSREF_URL': 'http://127.0.0.1:8765/crossref', 'AUDITOR_PUBMED_URL': 'http://127.0.0.1:8765/pubmed',
               'AUDITOR_OPENALEX_URL': 'http://127.0.0.1:8765/openalex', 'AUDITOR_HTTP_TIMEOUT_MS': '5000', 'AUDITOR_SEM_REDE_EXTERNA': '1'}
        out = roda(cfg['documento'], os.path.join(S, 'rede', g['documento']), env)
        import urllib.request
        est = json.loads(urllib.request.urlopen('http://127.0.0.1:8765/__estatisticas').read())
    finally:
        srv.terminate()
    obt = {e['referencia']: e['estado'] for e in out.get('estados_obras', [])}
    linhas, ok = [], True
    for e in g['estados_esperados']:
        o = obt.get(e['referencia'], 'ausente')
        bom = o == e['estado']; ok &= bom
        linhas.append(f"| {e['inicio']} | {e['estado']} | {o} | {'ok' if bom else 'ERRO'} | {e['motivo']} |")
    for cen, (mi, ma) in g['limites_requisicoes'].items():
        n = est.get(cen, 0); bom = mi <= n <= ma; ok &= bom
        linhas.append(f"| requisições ao cenário {cen} | entre {mi} e {ma} | {n} | {'ok' if bom else 'ERRO'} | repetição com espera, sem martelar a API |")
    return ok, '| Obra | Esperado | Obtido | Resultado | Motivo |\n|---|---|---|---|---|\n' + '\n'.join(linhas)


def suite_rotulos(cfg, modo, arq, chave_rot='rotulo'):
    itens = [json.loads(l) for l in open(arq)]
    out = {x['id']: x.get('rotulo') or x.get('veredito') for x in roda(cfg[modo], arq)}
    conf = collections.Counter(); por_cat = collections.defaultdict(lambda: [0, 0])
    erros = []
    for it in itens:
        o = out.get(it['id'], 'ausente'); conf[(it[chave_rot], o)] += 1
        por_cat[it['categoria']][1] += 1
        if o == it[chave_rot]:
            por_cat[it['categoria']][0] += 1
        else:
            erros.append(f"{it['id']} ({it['categoria']}): esperado {it[chave_rot]}, obtido {o}")
    acc = sum(v for (a, b), v in conf.items() if a == b) / len(itens)
    rot = sorted({it[chave_rot] for it in itens})
    tab = '| Esperado \\ Obtido | ' + ' | '.join(rot + ['outro']) + ' |\n|' + '---|' * (len(rot) + 2) + '\n'
    for a in rot:
        tab += f'| {a} | ' + ' | '.join(str(conf[(a, b)]) for b in rot) + f" | {sum(v for (x, y), v in conf.items() if x == a and y not in rot)} |\n"
    tab += '\n| Categoria | Acertos |\n|---|---|\n' + '\n'.join(f'| {c} | {a}/{n} |' for c, (a, n) in sorted(por_cat.items()))
    if erros:
        tab += '\n\nErros:\n' + '\n'.join('- ' + e for e in erros)
    return acc, tab


def suite_seguranca(cfg):
    casos = json.load(open(os.path.join(S, 'seguranca', 'casos.json')))
    out = {x['id']: x['veredito'] for x in roda(cfg['caminho'], os.path.join(S, 'seguranca', 'casos.json'))}
    linhas, ok = [], True
    for c in casos:
        o = out.get(c['id'], 'ausente'); bom = o == c['esperado']; ok &= bom
        linhas.append(f"| {c['id']} | {c['plataforma']} | `{c['raiz']}` | `{c['sub'].encode('unicode_escape').decode()}` | {c['esperado']} | {o} | {'ok' if bom else 'ERRO'} |")
    return ok, '| Caso | Plataforma | Raiz | Subcaminho | Esperado | Obtido | Resultado |\n|---|---|---|---|---|---|---|\n' + '\n'.join(linhas)


def suite_referencias(cfg):
    g = json.load(open(os.path.join(S, 'referencias', 'gabarito_referencias.json')))['itens']
    out = {x['linha']: x for x in roda(cfg['referencias'], os.path.join(S, 'referencias', 'referencias_anystyle.txt'))}
    na = ca = ny = cy = 0
    for it in g:
        o = out.get(it['linha'], {})
        if it['ano']:
            ny += 1; cy += (str(o.get('ano') or '')[:4] == it['ano'][:4])
        if it['autor_principal']:
            na += 1; ca += (nz(o.get('autor_principal') or '').split(' ')[0:1] == nz(it['autor_principal']).split(' ')[0:1])
    return (ca / na, cy / ny), f'- Autor principal correto: {ca}/{na} ({ca / na:.3f})\n- Ano correto: {cy}/{ny} ({cy / ny:.3f})'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--config', required=True)
    ap.add_argument('--suites', default='tcc,rede,afirmacoes,plagio,seguranca,referencias')
    ap.add_argument('--saida', default=os.path.join(RAIZ, 'resultados', 'suites.md'))
    a = ap.parse_args()
    cfg = json.load(open(a.config))
    L, portao = ['# Suítes complementares\n'], {}
    for s in a.suites.split(','):
        modo = {'tcc': 'documento', 'rede': 'documento', 'afirmacoes': 'afirmacoes', 'plagio': 'plagio', 'seguranca': 'caminho', 'referencias': 'referencias'}[s]
        if not cfg.get(modo):
            L += [f'## {s}\n', f'Modo "{modo}" não implementado no adaptador.\n']; portao[s] = False; continue
        try:
            if s == 'tcc':
                ok, t = suite_tcc(cfg); portao['TCC ponta a ponta (v18, v19, v22)'] = ok
            elif s == 'rede':
                ok, t = suite_rede(cfg); portao['Rede simulada (429, 500, tempo, JSON inválido)'] = ok
            elif s == 'afirmacoes':
                acc, t = suite_rotulos(cfg, 'afirmacoes', os.path.join(S, 'afirmacoes', 'pares.jsonl'))
                portao['Afirmações: acurácia ≥ 0,90'] = acc >= 0.9; t = f'Acurácia: {acc:.3f}\n\n' + t
            elif s == 'plagio':
                acc, t = suite_rotulos(cfg, 'plagio', os.path.join(S, 'plagio', 'pares.jsonl'))
                portao['Plágio: acurácia = 1,00'] = acc == 1.0; t = f'Acurácia: {acc:.3f}\n\n' + t
            elif s == 'seguranca':
                ok, t = suite_seguranca(cfg); portao['Segurança de caminhos'] = ok
            elif s == 'referencias':
                (pa, py), t = suite_referencias(cfg); portao['Referências reais: autor ≥ 0,95 e ano ≥ 0,98'] = pa >= 0.95 and py >= 0.98
        except Exception as e:
            t = f'Falha ao executar: {e}'; portao[s] = False
        L += [f'## {s}\n', t, '']
    L[1:1] = ['## Portão\n', '| Critério | Situação |', '|---|---|'] + [f"| {k} | {'APROVADO' if v else 'REPROVADO'} |" for k, v in portao.items()] + ['']
    open(a.saida, 'w').write('\n'.join(L))
    print('\n'.join(L[:len(portao) + 5]))


if __name__ == '__main__':
    main()
