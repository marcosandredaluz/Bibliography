# Resultado da bancada

Adaptador: `python3 oraculo/validador_cruzado.py {arquivo}`  
Execuções: 384  
Falhas de execução: 0

## Portão de integração

| Critério | Situação |
|---|---|
| Segmentação F1 = 1,000 | APROVADO |
| Pareamento F1 ≥ 0,99 | APROVADO |
| Ponto D precisão ≥ 0,99 | REPROVADO |
| Ponto E precisão ≥ 0,99 | REPROVADO |
| Nenhuma violação (citação direta, apêndice, "Elaborado pela autora") | APROVADO |
| Nenhuma falha de execução | APROVADO |
| Determinismo (mesma saída em duas execuções) | APROVADO |
| Sem sobreajuste (pareamento no reservado ≥ treino − 0,01) | APROVADO |

Resultado: **NÃO INTEGRAR**

## Métricas gerais

- Segmentação de referências: P=1.0 R=1.0 F1=1.0
- Pareamento citação e referência: P=0.9929 R=0.9901 F1=0.9915
- Ocorrências de citação (obra citada): gabarito 21684, motor 21568
- Ponto D (citada sem referência): P=0.9627 R=0.8688
- Ponto E (referência sem citação): P=0.8828 R=1.0
- Violações: citação direta acusada como plágio 0; apêndice acusado 0; "Elaborado pela autora" tratado como citação 0

## Por conjunto

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| reservado | 192 | 0 | 1.000 | 0.991 | 0.938 / 0.876 | 0.831 / 1.000 | 0 |
| treino | 192 | 0 | 1.000 | 0.992 | 0.988 / 0.862 | 0.941 / 1.000 | 0 |

## Por formato

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| docx | 384 | 0 | 1.000 | 0.992 | 0.963 / 0.869 | 0.883 / 1.000 | 0 |

## Por variante

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| erros | 128 | 0 | 1.000 | 0.992 | 0.986 / 0.869 | 0.970 / 1.000 | 0 |
| limpo | 128 | 0 | 1.000 | 0.991 | 0.000 / 1.000 | 0.000 / 1.000 | 0 |
| perturbado | 128 | 0 | 1.000 | 0.991 | 0.000 / 1.000 | 0.000 / 1.000 | 0 |

## Por estilo

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| abnt | 6 | 0 | 1.000 | 0.983 | 0.818 / 1.000 | 0.667 / 1.000 | 0 |
| ama | 42 | 0 | 1.000 | 0.991 | 1.000 / 1.000 | 1.000 / 1.000 | 0 |
| apa | 42 | 0 | 1.000 | 0.994 | 0.984 / 0.870 | 1.000 / 1.000 | 0 |
| chicago-ad | 42 | 0 | 1.000 | 0.994 | 0.844 / 0.982 | 0.824 / 1.000 | 0 |
| harvard | 42 | 0 | 1.000 | 0.990 | 0.924 / 0.968 | 0.903 / 1.000 | 0 |
| ieee | 42 | 0 | 1.000 | 0.991 | 1.000 / 0.964 | 1.000 / 1.000 | 0 |
| iso690-ad | 42 | 0 | 1.000 | 0.994 | 0.983 / 1.000 | 1.000 / 1.000 | 0 |
| iso690-num | 42 | 0 | 1.000 | 0.991 | 1.000 / 1.000 | 1.000 / 1.000 | 0 |
| mla | 42 | 0 | 1.000 | 0.979 | 1.000 / 0.016 | 0.549 / 1.000 | 0 |
| vancouver | 42 | 0 | 1.000 | 1.000 | 1.000 / 1.000 | 1.000 / 1.000 | 0 |

## Por locale

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| de-DE | 54 | 0 | 1.000 | 0.990 | 0.831 / 0.842 | 0.818 / 1.000 | 0 |
| en-US | 54 | 0 | 1.000 | 0.992 | 0.974 / 0.916 | 0.857 / 1.000 | 0 |
| es-ES | 54 | 0 | 1.000 | 0.993 | 1.000 / 0.930 | 0.947 / 1.000 | 0 |
| fr-FR | 54 | 0 | 1.000 | 0.995 | 0.987 / 0.843 | 1.000 / 1.000 | 0 |
| it-IT | 54 | 0 | 1.000 | 0.994 | 1.000 / 0.735 | 0.973 / 1.000 | 0 |
| pt-BR | 60 | 0 | 1.000 | 0.985 | 0.963 / 0.929 | 0.755 / 1.000 | 0 |
| pt-PT | 54 | 0 | 1.000 | 0.993 | 1.000 / 0.896 | 0.900 / 1.000 | 0 |

## Arquivos com mais erros

| Arquivo | Segm. FN | Paream. FN | Paream. FP | Exemplos de citação não reconhecida pelo gabarito |
|---|---|---|---|---|
| treino_mla_pt-BR_limpo.docx | 0 | 6 | 6 |  |
| treino_mla_pt-BR_perturbado.docx | 0 | 6 | 6 |  |
| reservado_mla_pt-BR_limpo.docx | 0 | 5 | 5 |  |
| reservado_mla_pt-BR_perturbado.docx | 0 | 5 | 5 |  |
| reservado_mla_pt-PT_erros.docx | 0 | 5 | 5 |  |
| reservado_mla_en-US_limpo.docx | 0 | 4 | 4 |  |
| reservado_mla_en-US_perturbado.docx | 0 | 4 | 4 |  |
| reservado_mla_de-DE_limpo.docx | 0 | 3 | 3 |  |
| reservado_mla_de-DE_perturbado.docx | 0 | 3 | 3 |  |
| reservado_chicago-ad_de-DE_limpo.docx | 0 | 5 | 0 | a (2014); a (1990) |
| reservado_chicago-ad_de-DE_perturbado.docx | 0 | 5 | 0 | a (2014); a (1990) |
| treino_abnt_pt-BR_erros.docx | 0 | 1 | 3 | Estado (2013); Estado (1999); al (1999); al (1998) |
| treino_harvard_de-DE_limpo.docx | 0 | 2 | 2 | Brasil (2009); a (1980) |
| treino_harvard_de-DE_perturbado.docx | 0 | 2 | 2 | Brasil (2009); a (1980) |
| treino_harvard_es-ES_limpo.docx | 0 | 1 | 3 | Brasil (1987); al (1976); Brasil (1987); Brasil (1987); al (2015) |