"""Bancada de testes do auditor de citações.

Roda um adaptador (qualquer comando que receba o arquivo e imprima o JSON do contrato) sobre o
corpus, compara com os gabaritos e gera métricas por categoria, estilo, idioma, formato, conjunto e
variante.

Exemplos:
  python3 rodar_bancada.py --adaptador "python3 oraculo/validador_cruzado.py {arquivo}" --formatos docx
  python3 rodar_bancada.py --adaptador "node C:/caminho/auditor_cli.cjs {arquivo}" --formatos docx,odt,pdf --paralelo 4

Contrato de saída do adaptador (stdout, JSON):
  {"referencias": [{"indice": 0, "texto": "..."}],
   "citacoes":    [{"texto": "(Silva, 2020)", "contexto": "paragrafo|tabela|legenda|direta", "referencias": [0, null]}],
   "alertas":     [{"ponto": "D", "citacao": "..."}, {"ponto": "E", "referencia": 3}, {"ponto": "C", "trecho": "..."}, ...]}
"""
import argparse, collections, concurrent.futures as cf, glob, hashlib, json, os, re, shlex, subprocess, sys, time, unicodedata

RAIZ = os.path.dirname(os.path.abspath(__file__))


def nz(s):
    s = unicodedata.normalize('NFKC', s or '').replace('\u00a0', ' ').replace('\u201c', '"').replace('\u201d', '"')
    return re.sub(r'\s+', ' ', s).strip().lower()


def prf(tp, fp, fn):
    p = tp / (tp + fp) if tp + fp else 1.0
    r = tp / (tp + fn) if tp + fn else 1.0
    f = 2 * p * r / (p + r) if p + r else 0.0
    return round(p, 4), round(r, 4), round(f, 4)


def rodar_adaptador(cmd, arquivo, timeout):
    partes = [x.replace('{arquivo}', arquivo) for x in shlex.split(cmd)]
    t0 = time.time()
    try:
        r = subprocess.run(partes, capture_output=True, text=True, timeout=timeout)
        dt = time.time() - t0
        if r.returncode != 0:
            return None, dt, f'codigo {r.returncode}: {r.stderr[-400:]}'
        return json.loads(r.stdout), dt, None
    except subprocess.TimeoutExpired:
        return None, timeout, 'tempo esgotado'
    except json.JSONDecodeError as e:
        return None, time.time() - t0, f'JSON inválido: {e}'


def pontuar(gab, out):
    m = collections.Counter()
    # 1. segmentação: textos das entradas
    g_txt = [nz(r['texto']) for r in gab['referencias']]
    o_txt = [nz(r['texto']) for r in out.get('referencias', [])]
    livres = collections.Counter(g_txt)
    mapa = {}  # índice do motor -> índice do gabarito
    for i, t in enumerate(o_txt):
        if livres[t] > 0:
            livres[t] -= 1; m['seg_tp'] += 1
            mapa[i] = g_txt.index(t) if g_txt.count(t) == 1 else next(j for j, x in enumerate(g_txt) if x == t and j not in mapa.values())
        else:
            m['seg_fp'] += 1
    m['seg_fn'] += sum(livres.values())
    # 2. pareamento: vetor de contagem de citações por referência do gabarito (independe de como
    #    o motor recorta os aglomerados e de onde ele localiza cada citação)
    cg, ce = collections.Counter(), collections.Counter()
    for g in gab['citacoes']:
        for x in g['referencias']:
            if x is not None:
                cg[x] += 1
    nulos_motor = 0
    for c in out.get('citacoes', []):
        for x in (c.get('referencias') or []):
            if x is None:
                nulos_motor += 1
            elif mapa.get(x) is not None:
                ce[mapa[x]] += 1
            else:
                m['par_fp'] += 1  # aponta para entrada que nem existe no gabarito
    for k in set(cg) | set(ce):
        m['par_tp'] += min(cg[k], ce[k]); m['par_fp'] += max(0, ce[k] - cg[k]); m['par_fn'] += max(0, cg[k] - ce[k])
    m['cit_ocorrencias_gab'] += sum(len(g['referencias']) for g in gab['citacoes'])
    m['cit_ocorrencias_motor'] += sum(len(c.get('referencias') or []) for c in out.get('citacoes', []))
    nao_casadas_motor = []
    gtx = {nz(g['texto']) for g in gab['citacoes']}
    for c in out.get('citacoes', []):
        if nz(c.get('texto')) not in gtx and not any(nz(c.get('texto')) in t for t in gtx):
            nao_casadas_motor.append(c.get('texto'))
    # 3. ponto D: ocorrências de obra citada sem referência (contagem) ; ponto E por referência
    al = out.get('alertas', [])
    gD = sum(1 for a in gab['alertas_esperados'] if a['ponto'] == 'D')
    gANO = sum(1 for a in gab['alertas_esperados'] if a['ponto'] == 'ANO')  # divergência real do artigo publicado: alertar é aceitável
    oD = max(nulos_motor, sum(1 for a in al if a.get('ponto') == 'D'))
    m['D_tp'] += min(gD, oD); m['D_fp'] += max(0, oD - gD - gANO); m['D_fn'] += max(0, gD - oD)
    m['divergencias_reais_de_ano'] += gANO
    gE = {a['referencia'] for a in gab['alertas_esperados'] if a['ponto'] == 'E'}
    oE = {mapa.get(a.get('referencia')) for a in al if a.get('ponto') == 'E'}
    m['E_tp'] += len(gE & oE); m['E_fp'] += len(oE - gE); m['E_fn'] += len(gE - oE)
    # 4. proibições
    for a in al:
        txt = nz(json.dumps(a, ensure_ascii=False))
        if a.get('ponto') == 'C' and any(nz(p['trecho'])[:40] in txt for p in gab['alertas_proibidos'] if p['ponto'] == 'C'):
            m['viol_plagio_citacao_direta'] += 1
        if a.get('ponto') == 'F' and re.search(r'ap[eê]ndice|appendix|anexo|annex|anhang|appendice', txt):
            m['viol_apendice'] += 1
        if any(nz(n)[:20] in txt for n in gab.get('nao_citacoes', [])):
            m['viol_nao_citacao'] += 1
    for c in out.get('citacoes', []):
        if any(nz(n)[:20] in nz(c.get('texto')) for n in gab.get('nao_citacoes', [])):
            m['viol_nao_citacao'] += 1
    return m, nao_casadas_motor


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--adaptador', required=True)
    ap.add_argument('--corpus', default=os.path.join(RAIZ, 'corpus', 'sintetico'))
    ap.add_argument('--conjuntos', default='treino,reservado')
    ap.add_argument('--formatos', default='docx,odt,pdf')
    ap.add_argument('--paralelo', type=int, default=4)
    ap.add_argument('--timeout', type=int, default=180)
    ap.add_argument('--limite', type=int, default=0)
    ap.add_argument('--determinismo', type=int, default=10, help='quantos arquivos rodar duas vezes')
    ap.add_argument('--saida', default=os.path.join(RAIZ, 'resultados'))
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    tarefas = []
    for cj in a.conjuntos.split(','):
        for gp in sorted(glob.glob(os.path.join(a.corpus, cj, '*.gabarito.json'))):
            base = gp[:-len('.gabarito.json')]
            for fm in a.formatos.split(','):
                if os.path.exists(base + '.' + fm):
                    tarefas.append((gp, base + '.' + fm, fm))
    if a.limite:
        tarefas = tarefas[:a.limite]
    print(f'{len(tarefas)} execuções', file=sys.stderr)
    linhas = []

    def um(t):
        gp, arq, fm = t
        out, dt, err = rodar_adaptador(a.adaptador, arq, a.timeout)
        gab = json.load(open(gp))
        reg = {'arquivo': os.path.basename(arq), 'formato': fm, 'estilo': gab['estilo'], 'locale': gab['locale'],
               'conjunto': gab['conjunto'], 'variante': gab['variante'], 'segundos': round(dt, 2), 'erro': err}
        if out is not None:
            m, nc = pontuar(gab, out)
            reg['m'] = dict(m); reg['citacoes_nao_casadas'] = nc[:5]
            reg['hash'] = hashlib.sha256(json.dumps(out, sort_keys=True, ensure_ascii=False).encode()).hexdigest()
        return reg

    with cf.ThreadPoolExecutor(a.paralelo) as ex:
        for i, reg in enumerate(ex.map(um, tarefas)):
            linhas.append(reg)
            if i % 50 == 0:
                print(f'  {i}/{len(tarefas)}', file=sys.stderr)
    # determinismo
    det = []
    for reg, t in list(zip(linhas, tarefas))[:a.determinismo]:
        if 'hash' in reg:
            out2, _, _ = rodar_adaptador(a.adaptador, t[1], a.timeout)
            h2 = hashlib.sha256(json.dumps(out2, sort_keys=True, ensure_ascii=False).encode()).hexdigest() if out2 else None
            det.append(h2 == reg['hash'])
    json.dump(linhas, open(os.path.join(a.saida, 'execucoes.json'), 'w'), ensure_ascii=False, indent=1)
    relatorio(linhas, det, a)


def agrega(linhas):
    m = collections.Counter()
    for l in linhas:
        m.update(l.get('m', {}))
    return m


def linha_tab(nome, ls):
    m = agrega(ls)
    falhas = sum(1 for l in ls if l.get('erro'))
    seg = prf(m['seg_tp'], m['seg_fp'], m['seg_fn'])
    par = prf(m['par_tp'], m['par_fp'], m['par_fn'])
    d = prf(m['D_tp'], m['D_fp'], m['D_fn'])
    e = prf(m['E_tp'], m['E_fp'], m['E_fn'])
    viol = m['viol_plagio_citacao_direta'] + m['viol_apendice'] + m['viol_nao_citacao']
    return f"| {nome} | {len(ls)} | {falhas} | {seg[2]:.3f} | {par[2]:.3f} | {d[0]:.3f} / {d[1]:.3f} | {e[0]:.3f} / {e[1]:.3f} | {viol} |"


LIMIARES = {'seg_f1': 1.0, 'par_f1': 0.99, 'D_p': 0.99, 'E_p': 0.99, 'violacoes': 0, 'falhas': 0}


def relatorio(linhas, det, a):
    m = agrega(linhas)
    seg, par, d, e = prf(m['seg_tp'], m['seg_fp'], m['seg_fn']), prf(m['par_tp'], m['par_fp'], m['par_fn']), prf(m['D_tp'], m['D_fp'], m['D_fn']), prf(m['E_tp'], m['E_fp'], m['E_fn'])
    viol = m['viol_plagio_citacao_direta'] + m['viol_apendice'] + m['viol_nao_citacao']
    falhas = sum(1 for l in linhas if l.get('erro'))
    portao = {
        'Segmentação F1 = 1,000': seg[2] >= LIMIARES['seg_f1'],
        'Pareamento F1 ≥ 0,99': par[2] >= LIMIARES['par_f1'],
        'Ponto D precisão ≥ 0,99': d[0] >= LIMIARES['D_p'],
        'Ponto E precisão ≥ 0,99': e[0] >= LIMIARES['E_p'],
        'Nenhuma violação (citação direta, apêndice, "Elaborado pela autora")': viol == 0,
        'Nenhuma falha de execução': falhas == 0,
        'Determinismo (mesma saída em duas execuções)': all(det) if det else False,
    }
    reservado = [l for l in linhas if l['conjunto'] == 'reservado']
    treino = [l for l in linhas if l['conjunto'] == 'treino']
    if reservado and treino:
        ft = prf(*[agrega(treino)[k] for k in ('par_tp', 'par_fp', 'par_fn')])[2]
        fr = prf(*[agrega(reservado)[k] for k in ('par_tp', 'par_fp', 'par_fn')])[2]
        portao['Sem sobreajuste (pareamento no reservado ≥ treino − 0,01)'] = fr >= ft - 0.01
    L = [f"# Resultado da bancada\n\nAdaptador: `{a.adaptador}`  \nExecuções: {len(linhas)}  \nFalhas de execução: {falhas}\n",
         '## Portão de integração\n', '| Critério | Situação |', '|---|---|']
    L += [f"| {k} | {'APROVADO' if v else 'REPROVADO'} |" for k, v in portao.items()]
    L += ['', f"Resultado: **{'PODE INTEGRAR' if all(portao.values()) else 'NÃO INTEGRAR'}**", '',
          '## Métricas gerais\n', f'- Segmentação de referências: P={seg[0]} R={seg[1]} F1={seg[2]}',
          f'- Pareamento citação e referência: P={par[0]} R={par[1]} F1={par[2]}',
          f"- Ocorrências de citação (obra citada): gabarito {m['cit_ocorrencias_gab']}, motor {m['cit_ocorrencias_motor']}",
          f'- Ponto D (citada sem referência): P={d[0]} R={d[1]}', f'- Ponto E (referência sem citação): P={e[0]} R={e[1]}',
          f"- Divergências de ano já existentes nos artigos publicados (alertar é aceitável): {m['divergencias_reais_de_ano']}",
          f"- Violações: citação direta acusada como plágio {m['viol_plagio_citacao_direta']}; apêndice acusado {m['viol_apendice']}; \"Elaborado pela autora\" tratado como citação {m['viol_nao_citacao']}", '']
    cab = '| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |\n|---|---|---|---|---|---|---|---|'
    for dim in ('conjunto', 'formato', 'variante', 'estilo', 'locale'):
        L += [f'## Por {dim}\n', cab]
        for v in sorted({l[dim] for l in linhas}):
            L.append(linha_tab(v, [l for l in linhas if l[dim] == v]))
        L.append('')
    piores = sorted([l for l in linhas if 'm' in l], key=lambda l: -(l['m'].get('par_fn', 0) + l['m'].get('par_fp', 0) + l['m'].get('seg_fn', 0)))[:15]
    L += ['## Arquivos com mais erros\n', '| Arquivo | Segm. FN | Paream. FN | Paream. FP | Exemplos de citação não reconhecida pelo gabarito |', '|---|---|---|---|---|']
    for l in piores:
        L.append(f"| {l['arquivo']} | {l['m'].get('seg_fn', 0)} | {l['m'].get('par_fn', 0)} | {l['m'].get('par_fp', 0)} | {'; '.join(map(str, l.get('citacoes_nao_casadas', [])))[:120]} |")
    open(os.path.join(a.saida, 'relatorio.md'), 'w').write('\n'.join(L))
    print('\n'.join(L[:16]))


if __name__ == '__main__':
    main()
