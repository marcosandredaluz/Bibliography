# Bancada de testes do auditor de citações e referências

Bancada automatizada, independente do motor, para medir o auditor antes de qualquer mudança entrar no código principal. O motor é chamado por um adaptador de linha de comando e os resultados são comparados com gabaritos exatos.

## O que tem aqui

| Suíte | Conteúdo | Gabarito | Volume |
|---|---|---|---|
| Sintética, conjunto de treino | manuscritos gerados com o citeproc-js, 10 estilos (ABNT, APA, Vancouver, AMA, Chicago autor-data, Harvard, IEEE, MLA, ISO 690 autor-data e numérico) em 7 locales (pt-BR, pt-PT, es-ES, en-US, fr-FR, de-DE, it-IT) | exato, por construção | 192 documentos × 3 formatos (DOCX, ODT, PDF) |
| Sintética, conjunto reservado | mesma estrutura, outra semente e **outros nomes de autores entidade**; serve para detectar correção feita sob medida para os nomes vistos nos testes | exato | 192 × 3 |
| Artigos reais | 58 artigos da eLife (JATS, CC BY 4.0 ou CC0) convertidos para DOCX, ODT e PDF; variantes limpo, perturbado e com erros injetados | real: marcações `xref` da própria editora | 174 × 3 |
| TCC real | versões v18, v19 e v22 do TCC da Michele, com problemas reais conhecidos e alertas proibidos | revisão humana | 3 |
| Rede simulada | servidor local que imita Crossref, PubMed, OpenAlex e páginas web, com 429, 500, lentidão, JSON quebrado e 404 | estado esperado por obra e limite de requisições | 10 obras |
| Afirmações | pares afirmação e trecho da fonte (sustenta, contradiz, não trata), com troca de número, negação, escopo, atribuição | revisão humana com fontes conferidas | 36 pares |
| Plágio | cópia quase literal, citação direta com página, nomes próprios, títulos de normas, paráfrase | revisão humana | 14 pares |
| Segurança | contenção de caminhos no IPC do Electron (inclui o desvio por prefixo C:\Bib e C:\Bib2) | exato | 18 casos |
| Referências reais anotadas | 1.514 referências do conjunto do AnyStyle (BSD-2), muitos estilos e idiomas | autor principal e ano | 1.514 |

Em cada documento sintético há armadilhas que já derrubaram o auditor: autor entidade com jurisdição entre parênteses, mesmo autor e ano (2020a, 2020b), obra sem data, obra citada pelo título, sobrenomes compostos, partículas (de, van der, von), dois sobrenomes hispânicos, nomes chineses, coreanos e vietnamitas, acentos e ß, citação em célula de tabela, citação direta com página, legenda "Fonte: Elaborado pela autora (2026)" e apêndice depois das referências. A variante "perturbado" acrescenta espaço não separável, aspas curvas e quebra de linha manual dentro das referências. A variante "erros" retira obras da lista (ponto D) e acrescenta obras não citadas (ponto E).

## Como ligar o auditor

1. Copiar a pasta `bancada` para dentro do repositório, por exemplo em `tests/bancada`.
2. Copiar `adaptador_auditor.modelo.cjs` para `adaptador_auditor.cjs` e completar os `TODO`. O adaptador roda em Node puro, sem abrir o Electron.
3. Instalar o Python 3.10 ou mais novo e `pip install -r requirements.txt` (só o oráculo e o gerador usam bibliotecas; o executor usa apenas a biblioteca padrão).

## Como rodar

```bash
# suíte principal (sintética: treino e reservado), nos três formatos, 4 processos em paralelo
python rodar_bancada.py --adaptador "node adaptador_auditor.cjs documento {arquivo}" --formatos docx,odt,pdf --paralelo 4

# artigos reais (eLife)
python rodar_bancada.py --adaptador "node adaptador_auditor.cjs documento {arquivo}" --corpus corpus/reais --conjuntos reais --saida resultados/reais

# suítes complementares (TCC, rede, afirmações, plágio, segurança, referências)
python rodar_suites.py --config adaptadores.json

# acervo próprio, sem gabarito (testes metamórficos)
python rodar_acervo.py --adaptador "node adaptador_auditor.cjs documento {arquivo}" --pasta "C:/Users/.../Artigos" --pdf
```

`adaptadores.json` usa o mesmo formato de `adaptadores_oraculo.json`, com um comando por modo.

Cada execução grava `resultados/relatorio.md`, com o portão de integração e as métricas por conjunto, formato, variante, estilo e idioma, e `resultados/execucoes.json`, com o detalhe de cada arquivo.

## Portão de integração

Nada entra no motor principal sem passar em todos os critérios:

- segmentação das referências com F1 = 1,000;
- pareamento citação e referência com F1 de pelo menos 0,99;
- precisão de pelo menos 0,99 nos pontos D e E;
- nenhuma violação (citação direta acusada de plágio, apêndice acusado, "Elaborado pela autora" lido como citação);
- nenhuma falha de execução e mesma saída em duas execuções;
- conjunto reservado no mínimo igual ao de treino, com tolerância de 0,01 no pareamento;
- suítes complementares aprovadas, com zero alerta crítico na v22 do TCC.

## Linha de base: o oráculo

O `oraculo/validador_cruzado.py` implementa o algoritmo do validador cruzado:

- uma referência por parágrafo;
- autor entidade reconhecido;
- anos entre colchetes;
- autor repetido "———";
- tabelas lidas célula por célula;
- legenda de autoria ignorada;
- pareamento nos dois sentidos.

Ele serve para validar a bancada e como referência de comportamento. Resultados dele hoje:

| Suíte | Segmentação F1 | Pareamento F1 | D precisão / revocação | E precisão / revocação |
|---|---|---|---|---|
| Sintética, treino (DOCX) | 1,000 | 0,992 | 0,988 / 0,862 | 0,941 / 1,000 |
| Sintética, reservado (DOCX) | 1,000 | 0,991 | 0,938 / 0,876 | 0,831 / 1,000 |
| Artigos reais eLife (DOCX) | 1,000 | 0,974 | 0,509 / 0,972 | 0,492 / 0,987 |
| TCC v22 | 87 de 87 referências | sem nenhum alerta | | |

Três leituras importantes:

1. **O reservado pega sobreajuste.** O oráculo foi ajustado olhando o conjunto de treino, e a precisão do ponto D cai de 0,988 para 0,938 no reservado.
2. **Artigos reais são bem mais difíceis.** Nos artigos reais a precisão de D e E cai pela metade, por causa de padrões como "(e.g., X; Autor, 2009)", "(reviewed in Autor, 2011)", colchetes dentro de parênteses e notações numéricas entre parênteses. Um motor testado só com documentos sintéticos ou com um único manuscrito não vê esses casos.
3. **Artigos publicados também erram.** A conversão encontrou 39 divergências de ano já existentes nos artigos publicados, como James-Clark 1868 no texto e 1867 na referência. O gabarito marca essas divergências como alertas aceitáveis.

O oráculo não faz consulta de rede, conferência de conteúdo nem plágio. Essas suítes medem apenas o motor.

## Ampliar o corpus

- Mais artigos com gabarito real: colocar arquivos JATS XML (eLife, PMC Open Access, SciELO) numa pasta e rodar `python gerador/jats_para_docx.py <pasta_xml> corpus/reais/reais --erros`. Em seguida, converter para ODT e PDF com `soffice --headless --convert-to pdf *.docx`. Os artigos da SciELO trazem português e espanhol com gabarito real.
- Mais documentos sintéticos: `python gerador/gen_planos.py --semente N --saida planos/novo --conjunto treino` e depois `python gerador/montar_docx.py planos/novo corpus/sintetico/novo`. Para isso é preciso o Node com `npm install citeproc` e os estilos e locales da pasta `src`, baixados de github.com/citation-style-language.
- Acervo pessoal sem gabarito: `rodar_acervo.py` (seção acima).

## Cuidados

- `suites/tcc` contém o TCC da Michele, que não foi publicado. Se a bancada for para o GitHub, use repositório privado ou retire essa pasta.
- Os DOIs sintéticos usam o prefixo reservado `10.99999`, e nenhuma referência sintética deve ser procurada na internet.
- Fontes de terceiros: artigos eLife (CC BY 4.0 ou CC0), dados do AnyStyle (BSD-2-Clause), estilos e locales CSL (CC BY-SA 3.0).
