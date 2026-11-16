# Resultado da bancada

Adaptador: `node adaptador_auditor.cjs documento {arquivo}`  
Execuções: 522  
Falhas de execução: 0

## Portão de integração

| Critério | Situação |
|---|---|
| Segmentação F1 = 1,000 | REPROVADO |
| Pareamento F1 ≥ 0,99 | REPROVADO |
| Ponto D precisão ≥ 0,99 | REPROVADO |
| Ponto E precisão ≥ 0,99 | REPROVADO |
| Nenhuma violação (citação direta, apêndice, "Elaborado pela autora") | APROVADO |
| Nenhuma falha de execução | APROVADO |
| Determinismo (mesma saída em duas execuções) | APROVADO |

Resultado: **NÃO INTEGRAR**

## Métricas gerais

- Segmentação de referências: P=0.9107 R=0.9031 F1=0.9069
- Pareamento citação e referência: P=0.9338 R=0.8437 F1=0.8865
- Ocorrências de citação (obra citada): gabarito 38529, motor 37502
- Ponto D (citada sem referência): P=0.1749 R=1.0
- Ponto E (referência sem citação): P=0.3264 R=0.8508
- Divergências de ano já existentes nos artigos publicados (alertar é aceitável): 117
- Violações: citação direta acusada como plágio 0; apêndice acusado 0; "Elaborado pela autora" tratado como citação 0

## Por conjunto

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| reais | 522 | 0 | 0.907 | 0.886 | 0.175 / 1.000 | 0.326 / 0.851 | 0 |

## Por formato

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| docx | 174 | 0 | 1.000 | 0.961 | 0.264 / 1.000 | 0.364 / 0.987 | 0 |
| odt | 174 | 0 | 0.976 | 0.938 | 0.260 / 1.000 | 0.362 / 0.987 | 0 |
| pdf | 174 | 0 | 0.742 | 0.754 | 0.105 / 1.000 | 0.242 / 0.577 | 0 |

## Por variante

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| erros | 174 | 0 | 0.921 | 0.891 | 0.447 / 1.000 | 0.337 / 0.857 | 0 |
| limpo | 174 | 0 | 0.921 | 0.891 | 0.000 / 1.000 | 0.327 / 0.854 | 0 |
| perturbado | 174 | 0 | 0.879 | 0.877 | 0.000 / 1.000 | 0.316 / 0.842 | 0 |

## Por estilo

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| jats-eLife | 477 | 0 | 0.908 | 0.887 | 0.174 / 1.000 | 0.331 / 0.850 | 0 |
| jats-elife | 45 | 0 | 0.896 | 0.880 | 0.183 / 1.000 | 0.287 / 0.857 | 0 |

## Por locale

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| en | 522 | 0 | 0.907 | 0.886 | 0.175 / 1.000 | 0.326 / 0.851 | 0 |

## Arquivos com mais erros

| Arquivo | Segm. FN | Paream. FN | Paream. FP | Exemplos de citação não reconhecida pelo gabarito |
|---|---|---|---|---|
| elife-00178_perturbado.pdf | 26 | 70 | 28 | (Licatalosi and Darnell, 2006; Cooper et al., 2009; Poulos et al., 2011); (Darnell, 1996, 2004; Darnell and Posner, 2006 |
| elife-00178_erros.pdf | 20 | 51 | 35 | (Licatalosi and Darnell, 2006; Cooper et al., 2009; Poulos et al., 2011); (Darnell, 1996, 2004; Darnell and Posner, 2006 |
| elife-00178_limpo.pdf | 20 | 51 | 35 | (Licatalosi and Darnell, 2006; Cooper et al., 2009; Poulos et al., 2011); (Darnell, 1996, 2004; Darnell and Posner, 2006 |
| elife-00013_perturbado.pdf | 51 | 39 | 14 | (McFall-Ngai 1999; Koropatnick et al. 2004; Mazmanian et al. 2005; Falkow 2006; Hughes and Sperandio 2008; Desbrosses an |
| elife-00291_perturbado.pdf | 19 | 57 | 23 | (Barbalat et al., 2011); (Marshak-Rothstein, 2006; Christensen and Shlomchik, 2007); (Barton and Kagan, 2009); (Barton a |
| elife-00036_perturbado.pdf | 34 | 41 | 20 | (Badylak et al., 2012); (Arendt, 2008); (Langer and Vacanti, 1999; Rosselló et al., 2009); (Colman and Dreesen, 2009); ( |
| elife-00013_limpo.pdf | 46 | 34 | 14 | (McFall-Ngai 1999; Koropatnick et al. 2004; Mazmanian et al. 2005; Falkow 2006; Hughes and Sperandio 2008; Desbrosses an |
| elife-00220_perturbado.pdf | 21 | 51 | 22 | (Corder et al., 1993; Schmechel et al., 1993); (Weeber et al., 2002; Beffert et al., 2005; Herz and Chen, 2006); (Weathe |
| elife-00013_erros.pdf | 45 | 31 | 14 | (McFall-Ngai 1999; Koropatnick et al. 2004; Mazmanian et al. 2005; Falkow 2006; Hughes and Sperandio 2008; Desbrosses an |
| elife-00007_perturbado.pdf | 21 | 41 | 24 | (Price et al., 1980); (Turlings and Wäckers, 2004); (Heil, 2008); (Kessler and Baldwin, 2001; Rasmann et al., 2005; Hali |
| elife-00109_perturbado.pdf | 28 | 44 | 13 | (Rothman, 1994; Jahn et al., 2003; Jahn and Scheller, 2006; Harrison, 2008; Rizo and Rosenmund, 2008; Moreau et al., 201 |
| elife-00036_erros.pdf | 26 | 33 | 23 | (Badylak et al., 2012); (Arendt, 2008); (Langer and Vacanti, 1999; Rosselló et al., 2009); (Colman and Dreesen, 2009); ( |
| elife-00036_limpo.pdf | 26 | 33 | 23 | (Badylak et al., 2012); (Arendt, 2008); (Langer and Vacanti, 1999; Rosselló et al., 2009); (Colman and Dreesen, 2009); ( |
| elife-00278_limpo.odt | 13 | 40 | 29 | (Hedglin et al., in press; Yao and O&apos;Donnell, 2012); (Yao et al., 1996; Schurtenberger et al., 1998; Matsumiya et a |
| elife-00278_perturbado.odt | 13 | 40 | 29 | (Hedglin et al., in press; Yao and O&apos;Donnell, 2012); (Yao et al., 1996; Schurtenberger et al., 1998; Matsumiya et a |