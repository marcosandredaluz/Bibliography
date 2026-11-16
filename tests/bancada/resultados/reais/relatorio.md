# Resultado da bancada

Adaptador: `python3 oraculo/validador_cruzado.py {arquivo}`  
Execuções: 174  
Falhas de execução: 0

## Portão de integração

| Critério | Situação |
|---|---|
| Segmentação F1 = 1,000 | APROVADO |
| Pareamento F1 ≥ 0,99 | REPROVADO |
| Ponto D precisão ≥ 0,99 | REPROVADO |
| Ponto E precisão ≥ 0,99 | REPROVADO |
| Nenhuma violação (citação direta, apêndice, "Elaborado pela autora") | APROVADO |
| Nenhuma falha de execução | APROVADO |
| Determinismo (mesma saída em duas execuções) | APROVADO |

Resultado: **NÃO INTEGRAR**

## Métricas gerais

- Segmentação de referências: P=1.0 R=1.0 F1=1.0
- Pareamento citação e referência: P=0.9896 R=0.9585 F1=0.9738
- Ocorrências de citação (obra citada): gabarito 12843, motor 12636
- Ponto D (citada sem referência): P=0.5088 R=0.9721
- Ponto E (referência sem citação): P=0.4917 R=0.9874
- Divergências de ano já existentes nos artigos publicados (alertar é aceitável): 39
- Violações: citação direta acusada como plágio 0; apêndice acusado 0; "Elaborado pela autora" tratado como citação 0

## Por conjunto

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| reais | 174 | 0 | 1.000 | 0.974 | 0.509 / 0.972 | 0.492 / 0.987 | 0 |

## Por formato

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| docx | 174 | 0 | 1.000 | 0.974 | 0.509 / 0.972 | 0.492 / 0.987 | 0 |

## Por variante

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| erros | 58 | 0 | 1.000 | 0.974 | 0.763 / 0.972 | 0.500 / 0.987 | 0 |
| limpo | 58 | 0 | 1.000 | 0.974 | 0.000 / 1.000 | 0.488 / 0.988 | 0 |
| perturbado | 58 | 0 | 1.000 | 0.974 | 0.000 / 1.000 | 0.488 / 0.988 | 0 |

## Por estilo

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| jats-eLife | 159 | 0 | 1.000 | 0.975 | 0.502 / 0.988 | 0.506 / 0.986 | 0 |
| jats-elife | 15 | 0 | 1.000 | 0.960 | 0.619 / 0.812 | 0.382 / 1.000 | 0 |

## Por locale

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| en | 174 | 0 | 1.000 | 0.974 | 0.509 / 0.972 | 0.492 / 0.987 | 0 |

## Arquivos com mais erros

| Arquivo | Segm. FN | Paream. FN | Paream. FP | Exemplos de citação não reconhecida pelo gabarito |
|---|---|---|---|---|
| elife-00007_erros.docx | 0 | 11 | 11 | (Price et al., 1980); (Turlings and Wäckers, 2004); (Heil, 2008); (Kessler and Baldwin, 2001; Rasmann et al., 2005; Hali |
| elife-00007_limpo.docx | 0 | 11 | 11 | (Price et al., 1980); (Turlings and Wäckers, 2004); (Heil, 2008); (Kessler and Baldwin, 2001; Rasmann et al., 2005; Hali |
| elife-00007_perturbado.docx | 0 | 11 | 11 | (Price et al., 1980); (Turlings and Wäckers, 2004); (Heil, 2008); (Kessler and Baldwin, 2001; Rasmann et al., 2005; Hali |
| elife-00288_erros.docx | 0 | 16 | 0 | (Perelson et al., 1996); (Sylwester et al., 2005); (Wald et al., 1995, 1997, 2000; Crespi et al., 2007; Mark et al., 200 |
| elife-00288_limpo.docx | 0 | 16 | 0 | (Perelson et al., 1996); (Sylwester et al., 2005); (Wald et al., 1995, 1997, 2000; Crespi et al., 2007; Mark et al., 200 |
| elife-00288_perturbado.docx | 0 | 16 | 0 | (Perelson et al., 1996); (Sylwester et al., 2005); (Wald et al., 1995, 1997, 2000; Crespi et al., 2007; Mark et al., 200 |
| elife-00051_erros.docx | 0 | 7 | 7 | (Oeppen, 2002; Vallin and Meslé, 2009); (Jha, 2009); (Beaglehole et al., 2011b); (UN); (Beaglehole et al., 2011a) |
| elife-00051_limpo.docx | 0 | 7 | 7 | (Oeppen, 2002; Vallin and Meslé, 2009); (Jha, 2009); (Beaglehole et al., 2011b); (UN); (Beaglehole et al., 2011a) |
| elife-00051_perturbado.docx | 0 | 7 | 7 | (Oeppen, 2002; Vallin and Meslé, 2009); (Jha, 2009); (Beaglehole et al., 2011b); (UN); (Beaglehole et al., 2011a) |
| elife-00178_erros.docx | 0 | 13 | 1 | (Licatalosi and Darnell, 2006; Cooper et al., 2009; Poulos et al., 2011); (Darnell, 1996, 2004; Darnell and Posner, 2006 |
| elife-00178_limpo.docx | 0 | 13 | 1 | (Licatalosi and Darnell, 2006; Cooper et al., 2009; Poulos et al., 2011); (Darnell, 1996, 2004; Darnell and Posner, 2006 |
| elife-00178_perturbado.docx | 0 | 13 | 1 | (Licatalosi and Darnell, 2006; Cooper et al., 2009; Poulos et al., 2011); (Darnell, 1996, 2004; Darnell and Posner, 2006 |
| elife-00291_limpo.docx | 0 | 9 | 1 | (Barbalat et al., 2011); (Marshak-Rothstein, 2006; Christensen and Shlomchik, 2007); (Barton and Kagan, 2009); (Barton a |
| elife-00291_perturbado.docx | 0 | 9 | 1 | (Barbalat et al., 2011); (Marshak-Rothstein, 2006; Christensen and Shlomchik, 2007); (Barton and Kagan, 2009); (Barton a |
| elife-00093_erros.docx | 0 | 9 | 0 | (Tibayrenc et al., 1990; Gupta et al., 1994; Tibayrenc and Ayala, 2002); (Selander et al., 1987; Tibayrenc et al., 1990; |