"""Testes metamórficos sobre um acervo próprio de artigos (sem gabarito).

Ideia: artigos publicados por periódicos sérios têm, quase sempre, todas as citações com referência e
todas as referências citadas. Então, num acervo de artigos publicados:
  1. alertas D, E e A ("não localizada") são, na grande maioria, falsos positivos do motor;
  2. o resultado não pode mudar quando só a formatação muda (espaço não separável, aspas curvas,
     quebra de linha manual numa referência) nem quando o DOCX é convertido para PDF.
Nada disso exige gabarito: as relações entre execuções são o teste.

Uso:
  python3 rodar_acervo.py --adaptador "node C:/caminho/auditor_cli.cjs {arquivo}" --pasta "C:/Users/eu/Artigos" [--pdf]
Os arquivos originais não são alterados; as variações vão para uma pasta temporária.
"""
import argparse, collections, copy, csv, json, os, re, shutil, subprocess, sys, tempfile
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from rodar_bancada import rodar_adaptador, nz

NBSP = '\u00a0'


def perturbar_docx(src, dst):
    import docx
    from docx.enum.text import WD_BREAK
    d = docx.Document(src)
    em_refs, k = False, 0
    for p in d.paragraphs:
        t = nz(p.text)
        if re.match(r'^(\d+\s*)?(refer[eê]ncias|references|bibliografia|bibliography|literatur)', t):
            em_refs = True; continue
        for r in p.runs:
            if r.text:
                r.text = r.text.replace(', ', ',' + NBSP).replace('"', '\u201c')
        if em_refs and p.runs and len(p.text) > 60:
            k += 1
            if k % 5 == 2:
                r0 = p.runs[0]
                if ' ' in r0.text[15:]:
                    i = r0.text.index(' ', 15)
                    resto = r0.text[i + 1:]; r0.text = r0.text[:i]
                    r0.add_break(WD_BREAK.LINE); r0.add_text(resto)
    d.save(dst)


def assinatura(out):
    """Pareamento em forma comparável: quantas vezes cada referência (pelo texto) foi citada."""
    refs = {r['indice']: nz(r['texto'])[:80] for r in out.get('referencias', [])}
    c = collections.Counter()
    for ci in out.get('citacoes', []):
        for x in ci.get('referencias') or []:
            c[refs.get(x, 'NULO') if x is not None else 'NULO'] += 1
    return c


def conta(out, ponto):
    return sum(1 for a in out.get('alertas', []) if a.get('ponto') == ponto)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--adaptador', required=True)
    ap.add_argument('--pasta', required=True)
    ap.add_argument('--pdf', action='store_true', help='também converte cada DOCX para PDF (precisa do LibreOffice)')
    ap.add_argument('--timeout', type=int, default=300)
    ap.add_argument('--saida', default=os.path.join(os.path.dirname(os.path.abspath(__file__)), 'resultados', 'acervo'))
    a = ap.parse_args()
    os.makedirs(a.saida, exist_ok=True)
    tmp = tempfile.mkdtemp(prefix='acervo_')
    arqs = [os.path.join(r, f) for r, _, fs in os.walk(a.pasta) for f in fs if f.lower().endswith(('.docx', '.pdf', '.odt'))]
    linhas, suspeitos = [], []
    for arq in sorted(arqs):
        base = os.path.basename(arq)
        out, dt, err = rodar_adaptador(a.adaptador, arq, a.timeout)
        reg = {'arquivo': base, 'segundos': round(dt, 1), 'erro': err or ''}
        if out is None:
            linhas.append(reg); continue
        reg.update(referencias=len(out.get('referencias', [])), citacoes=len(out.get('citacoes', [])),
                   D=conta(out, 'D'), E=conta(out, 'E'), A=conta(out, 'A'), C=conta(out, 'C'), F=conta(out, 'F'), G=conta(out, 'G'))
        for al in out.get('alertas', []):
            if al.get('ponto') in ('A', 'D', 'E'):
                suspeitos.append((base, al))
        if arq.lower().endswith('.docx'):
            p2 = os.path.join(tmp, 'pert_' + base)
            try:
                perturbar_docx(arq, p2)
                o2, _, e2 = rodar_adaptador(a.adaptador, p2, a.timeout)
                reg['invariante_formatacao'] = 'ok' if o2 and assinatura(o2) == assinatura(out) and conta(o2, 'D') == reg['D'] else 'MUDOU'
            except Exception as e:
                reg['invariante_formatacao'] = f'erro: {e}'
            if a.pdf and shutil.which('soffice'):
                subprocess.run(['soffice', '--headless', '--convert-to', 'pdf', '--outdir', tmp, arq], capture_output=True)
                p3 = os.path.join(tmp, base[:-5] + '.pdf')
                if os.path.exists(p3):
                    o3, _, _ = rodar_adaptador(a.adaptador, p3, a.timeout)
                    reg['invariante_pdf'] = 'falhou' if o3 is None else 'ok' if len(o3.get('referencias', [])) == reg['referencias'] and conta(o3, 'D') == reg['D'] else 'MUDOU'
        o4, _, _ = rodar_adaptador(a.adaptador, arq, a.timeout)
        reg['determinismo'] = 'ok' if o4 == out else 'MUDOU'
        linhas.append(reg)
        print(f"{base}: refs={reg['referencias']} D={reg['D']} E={reg['E']} A={reg['A']} formatação={reg.get('invariante_formatacao', '-')}", file=sys.stderr)
    campos = ['arquivo', 'referencias', 'citacoes', 'D', 'E', 'A', 'C', 'F', 'G', 'invariante_formatacao', 'invariante_pdf', 'determinismo', 'segundos', 'erro']
    with open(os.path.join(a.saida, 'acervo.csv'), 'w', newline='', encoding='utf-8') as f:
        w = csv.DictWriter(f, campos, extrasaction='ignore'); w.writeheader(); w.writerows(linhas)
    ok = [l for l in linhas if not l.get('erro')]
    tot = lambda k: sum(l.get(k, 0) for l in ok)
    L = ['# Acervo próprio: testes metamórficos\n', f'Arquivos: {len(linhas)} (falhas de execução: {len(linhas) - len(ok)})', '',
         '| Indicador | Valor | Leitura |', '|---|---|---|',
         f"| Alertas D (citada sem referência) | {tot('D')} | em artigos publicados, quase todos são falsos positivos |",
         f"| Alertas E (referência sem citação) | {tot('E')} | idem |",
         f"| Alertas A (fonte não localizada) | {tot('A')} | conferir um a um: são candidatos a falso alarme |",
         f"| Mudou só com formatação | {sum(1 for l in ok if l.get('invariante_formatacao') == 'MUDOU')} | deve ser 0 |",
         f"| Mudou ao converter para PDF | {sum(1 for l in ok if l.get('invariante_pdf') == 'MUDOU')} | deve ser 0 |",
         f"| Resultado diferente na segunda execução | {sum(1 for l in ok if l.get('determinismo') == 'MUDOU')} | deve ser 0 |", '',
         '## Alertas para conferência manual (amostra)\n']
    L += [f"- {b}: {json.dumps(al, ensure_ascii=False)[:200]}" for b, al in suspeitos[:80]]
    open(os.path.join(a.saida, 'acervo.md'), 'w').write('\n'.join(L))
    print('\n'.join(L[:12]))
    shutil.rmtree(tmp, ignore_errors=True)


if __name__ == '__main__':
    main()
