# Resultado da bancada

Adaptador: `node adaptador_auditor.cjs documento {arquivo}`  
Execuções: 1152  
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
| Sem sobreajuste (pareamento no reservado ≥ treino − 0,01) | APROVADO |

Resultado: **NÃO INTEGRAR**

## Métricas gerais

- Segmentação de referências: P=0.9056 R=0.7547 F1=0.8233
- Pareamento citação e referência: P=0.9455 R=0.6085 F1=0.7405
- Ocorrências de citação (obra citada): gabarito 65052, motor 54611
- Ponto D (citada sem referência): P=0.0972 R=0.7943
- Ponto E (referência sem citação): P=0.1167 R=0.7448
- Divergências de ano já existentes nos artigos publicados (alertar é aceitável): 0
- Violações: citação direta acusada como plágio 0; apêndice acusado 0; "Elaborado pela autora" tratado como citação 0

## Por conjunto

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| reservado | 576 | 0 | 0.822 | 0.738 | 0.090 / 0.804 | 0.114 / 0.740 | 0 |
| treino | 576 | 0 | 0.825 | 0.743 | 0.105 / 0.785 | 0.119 / 0.750 | 0 |

## Por formato

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| docx | 384 | 0 | 1.000 | 0.934 | 0.419 / 0.858 | 0.192 / 1.000 | 0 |
| odt | 384 | 0 | 1.000 | 0.867 | 0.386 / 0.750 | 0.101 / 1.000 | 0 |
| pdf | 384 | 0 | 0.352 | 0.286 | 0.038 / 0.775 | 0.058 / 0.234 | 0 |

## Por variante

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| erros | 384 | 0 | 0.828 | 0.742 | 0.258 / 0.794 | 0.290 / 0.745 | 0 |
| limpo | 384 | 0 | 0.825 | 0.743 | 0.000 / 1.000 | 0.000 / 1.000 | 0 |
| perturbado | 384 | 0 | 0.817 | 0.736 | 0.000 / 1.000 | 0.000 / 1.000 | 0 |

## Por estilo

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| abnt | 18 | 0 | 0.800 | 0.792 | 0.082 / 1.000 | 1.000 / 0.667 | 0 |
| ama | 126 | 0 | 0.859 | 0.493 | 1.000 / 0.333 | 0.032 / 0.809 | 0 |
| apa | 126 | 0 | 0.800 | 0.788 | 0.054 / 0.836 | 0.651 / 0.667 | 0 |
| chicago-ad | 126 | 0 | 0.800 | 0.789 | 0.072 / 0.988 | 0.757 / 0.667 | 0 |
| harvard | 126 | 0 | 0.800 | 0.747 | 0.048 / 1.000 | 0.250 / 0.667 | 0 |
| ieee | 126 | 0 | 0.879 | 0.886 | 0.988 / 0.964 | 0.641 / 0.893 | 0 |
| iso690-ad | 126 | 0 | 0.800 | 0.721 | 0.059 / 1.000 | 0.167 / 0.667 | 0 |
| iso690-num | 126 | 0 | 0.793 | 0.824 | 0.328 / 0.986 | 0.576 / 0.809 | 0 |
| mla | 126 | 0 | 0.800 | 0.259 | 1.000 / 0.011 | 0.033 / 0.667 | 0 |
| vancouver | 126 | 0 | 0.859 | 0.889 | 0.759 / 1.000 | 0.635 / 0.869 | 0 |

## Por locale

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| de-DE | 162 | 0 | 0.829 | 0.742 | 0.090 / 0.798 | 0.111 / 0.750 | 0 |
| en-US | 162 | 0 | 0.839 | 0.755 | 0.099 / 0.779 | 0.128 / 0.759 | 0 |
| es-ES | 162 | 0 | 0.840 | 0.745 | 0.093 / 0.803 | 0.102 / 0.750 | 0 |
| fr-FR | 162 | 0 | 0.761 | 0.694 | 0.111 / 0.786 | 0.120 / 0.685 | 0 |
| it-IT | 162 | 0 | 0.831 | 0.742 | 0.096 / 0.727 | 0.114 / 0.759 | 0 |
| pt-BR | 180 | 0 | 0.829 | 0.747 | 0.096 / 0.875 | 0.129 / 0.758 | 0 |
| pt-PT | 162 | 0 | 0.836 | 0.758 | 0.096 / 0.792 | 0.117 / 0.750 | 0 |

## Arquivos com mais erros

| Arquivo | Segm. FN | Paream. FN | Paream. FP | Exemplos de citação não reconhecida pelo gabarito |
|---|---|---|---|---|
| treino_iso690-num_fr-FR_erros.pdf | 26 | 49 | 48 |  |
| treino_vancouver_fr-FR_perturbado.pdf | 23 | 48 | 48 |  |
| reservado_iso690-num_fr-FR_erros.pdf | 22 | 48 | 47 |  |
| treino_vancouver_fr-FR_limpo.pdf | 23 | 45 | 45 |  |
| reservado_harvard_pt-PT_limpo.pdf | 30 | 82 | 0 | Almeida, B. (sem data); S. et al. (1984); Branco, B. e Neves, P. (2004); Domingues, H. (2016); Gaspar, F. et al. (2001) |
| reservado_harvard_pt-PT_perturbado.pdf | 30 | 82 | 0 | Almeida, B. (sem data); S. et al. (1984); Branco, B. e Neves, P. (2004); Domingues, H. (2016); Gaspar, F. et al. (2001) |
| reservado_chicago-ad_en-US_limpo.pdf | 33 | 77 | 0 | Introduction Price and Horn (1984); 13150 (2001); 7364 (1990); 13158 (2003); 10991 (2018) |
| reservado_chicago-ad_en-US_perturbado.pdf | 33 | 77 | 0 | Introduction Price and Horn (1984); 13150 (2001); 7364 (1990); 13158 (2003); 10991 (2018) |
| reservado_ieee_fr-FR_limpo.pdf | 23 | 44 | 43 |  |
| reservado_ieee_fr-FR_perturbado.pdf | 23 | 44 | 43 |  |
| reservado_iso690-num_fr-FR_perturbado.pdf | 26 | 45 | 38 |  |
| treino_iso690-num_fr-FR_perturbado.pdf | 28 | 40 | 37 |  |
| treino_ieee_fr-FR_perturbado.pdf | 19 | 42 | 41 |  |
| reservado_mla_pt-BR_limpo.pdf | 23 | 79 | 0 |  |
| reservado_mla_pt-BR_perturbado.pdf | 23 | 79 | 0 |  |