"""Modo "referencias" do oráculo: lê um .txt (uma referência por linha) e devolve autor principal e ano."""
import json, re, sys
sys.path.insert(0, __import__('os').path.dirname(__file__))
import validador_cruzado as v

out = []
for i, l in enumerate(open(sys.argv[1], encoding='utf-8').read().splitlines()):
    e = v.chave_entrada(l)
    autor = e['autor'].strip()
    autor = re.split(r'\s+(?:[A-Z]\.\s?)+$|\s[A-Z]{1,3}$', autor)[0]          # "Heidegger M." -> "Heidegger"
    m = re.match(r'^(?:[A-Z]\.\s?)+(.+)$', autor)                               # "A. B. Silva" -> "Silva"
    if m:
        autor = m.group(1)
    anos = sorted(a for a in e['anos'] if a[:1].isdigit())
    out.append({'linha': i, 'autor_principal': autor or None, 'ano': anos[0][:4] if anos else None})
print(json.dumps(out, ensure_ascii=False))
