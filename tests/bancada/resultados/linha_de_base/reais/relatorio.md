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

- Segmentação de referências: P=0.023 R=0.0004 F1=0.0007
- Pareamento citação e referência: P=1.0 R=0.0002 F1=0.0005
- Ocorrências de citação (obra citada): gabarito 38529, motor 37038
- Ponto D (citada sem referência): P=0.0145 R=1.0
- Ponto E (referência sem citação): P=0.0 R=0.0
- Divergências de ano já existentes nos artigos publicados (alertar é aceitável): 117
- Violações: citação direta acusada como plágio 0; apêndice acusado 0; "Elaborado pela autora" tratado como citação 0

## Por conjunto

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| reais | 522 | 0 | 0.001 | 0.001 | 0.015 / 1.000 | 0.000 / 0.000 | 0 |

## Por formato

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| docx | 174 | 0 | 0.001 | 0.001 | 0.015 / 1.000 | 0.000 / 0.000 | 0 |
| odt | 174 | 0 | 0.001 | 0.001 | 0.015 / 1.000 | 0.000 / 0.000 | 0 |
| pdf | 174 | 0 | 0.001 | 0.001 | 0.014 / 1.000 | 0.000 / 0.000 | 0 |

## Por variante

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| erros | 174 | 0 | 0.001 | 0.001 | 0.044 / 1.000 | 0.000 / 0.000 | 0 |
| limpo | 174 | 0 | 0.001 | 0.001 | 0.000 / 1.000 | 0.000 / 0.000 | 0 |
| perturbado | 174 | 0 | 0.001 | 0.001 | 0.000 / 1.000 | 0.000 / 0.000 | 0 |

## Por estilo

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| jats-eLife | 477 | 0 | 0.001 | 0.001 | 0.015 / 1.000 | 0.000 / 0.000 | 0 |
| jats-elife | 45 | 0 | 0.000 | 0.000 | 0.013 / 1.000 | 0.000 / 0.000 | 0 |

## Por locale

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| en | 522 | 0 | 0.001 | 0.001 | 0.015 / 1.000 | 0.000 / 0.000 | 0 |

## Arquivos com mais erros

| Arquivo | Segm. FN | Paream. FN | Paream. FP | Exemplos de citação não reconhecida pelo gabarito |
|---|---|---|---|---|
| elife-00178_limpo.docx | 91 | 141 | 0 | (Licatalosi and Darnell, 2006); (Cooper et al., 2009); (Poulos et al., 2011); (Darnell, 1996, 2004); (Darnell and Posner |
| elife-00178_limpo.odt | 91 | 141 | 0 | (Licatalosi and Darnell, 2006); (Cooper et al., 2009); (Poulos et al., 2011); (Darnell, 1996, 2004); (Darnell and Posner |
| elife-00178_limpo.pdf | 91 | 141 | 0 | (Licatalosi and Darnell, 2006); (Cooper et al., 2009); (Poulos et al., 2011); (Darnell, 1996, 2004); (Darnell and Posner |
| elife-00178_perturbado.docx | 91 | 141 | 0 | (Licatalosi and Darnell, 2006); (Cooper et al., 2009); (Poulos et al., 2011); (Darnell, 1996, 2004); (Darnell and Posner |
| elife-00178_perturbado.odt | 91 | 141 | 0 | (Licatalosi and Darnell, 2006); (Cooper et al., 2009); (Poulos et al., 2011); (Darnell, 1996, 2004); (Darnell and Posner |
| elife-00178_perturbado.pdf | 91 | 141 | 0 | (Licatalosi and Darnell, 2006); (Cooper et al., 2009); (Poulos et al., 2011); (Darnell, 1996, 2004); (Darnell and Posner |
| elife-00178_erros.docx | 89 | 139 | 0 | (Licatalosi and Darnell, 2006); (Cooper et al., 2009); (Poulos et al., 2011); (Darnell, 1996, 2004); (Darnell and Posner |
| elife-00178_erros.odt | 89 | 139 | 0 | (Licatalosi and Darnell, 2006); (Cooper et al., 2009); (Poulos et al., 2011); (Darnell, 1996, 2004); (Darnell and Posner |
| elife-00178_erros.pdf | 89 | 139 | 0 | (Licatalosi and Darnell, 2006); (Cooper et al., 2009); (Poulos et al., 2011); (Darnell, 1996, 2004); (Darnell and Posner |
| elife-00205_limpo.docx | 85 | 134 | 0 | (Kouzarides, 2007); (Greer and Shi, 2012); (Butler et al., 2012); (Klose and Bird, 2006); (Bird, 2002) |
| elife-00205_limpo.odt | 85 | 134 | 0 | (Kouzarides, 2007); (Greer and Shi, 2012); (Butler et al., 2012); (Klose and Bird, 2006); (Bird, 2002) |
| elife-00205_limpo.pdf | 85 | 134 | 0 | (Kouzarides, 2007); (Greer and Shi, 2012); (Butler et al., 2012); (Klose and Bird, 2006); (Bird, 2002) |
| elife-00205_perturbado.docx | 85 | 134 | 0 | (Kouzarides, 2007); (Greer and Shi, 2012); (Butler et al., 2012); (Klose and Bird, 2006); (Bird, 2002) |
| elife-00205_perturbado.odt | 85 | 134 | 0 | (Kouzarides, 2007); (Greer and Shi, 2012); (Butler et al., 2012); (Klose and Bird, 2006); (Bird, 2002) |
| elife-00205_perturbado.pdf | 85 | 134 | 0 | (Kouzarides, 2007); (Greer and Shi, 2012); (Butler et al., 2012); (Klose and Bird, 2006); (Bird, 2002) |