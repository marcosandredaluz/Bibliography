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
| Nenhuma violação (citação direta, apêndice, "Elaborado pela autora") | REPROVADO |
| Nenhuma falha de execução | APROVADO |
| Determinismo (mesma saída em duas execuções) | APROVADO |
| Sem sobreajuste (pareamento no reservado ≥ treino − 0,01) | APROVADO |

Resultado: **NÃO INTEGRAR**

## Métricas gerais

- Segmentação de referências: P=0.8661 R=0.2324 F1=0.3665
- Pareamento citação e referência: P=0.9402 R=0.0938 F1=0.1706
- Ocorrências de citação (obra citada): gabarito 65052, motor 33125
- Ponto D (citada sem referência): P=0.052 R=0.8233
- Ponto E (referência sem citação): P=0.0358 R=0.1979
- Divergências de ano já existentes nos artigos publicados (alertar é aceitável): 0
- Violações: citação direta acusada como plágio 0; apêndice acusado 0; "Elaborado pela autora" tratado como citação 1972

## Por conjunto

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| reservado | 576 | 0 | 0.354 | 0.175 | 0.051 / 0.838 | 0.039 / 0.203 | 988 |
| treino | 576 | 0 | 0.379 | 0.166 | 0.053 / 0.810 | 0.033 / 0.193 | 984 |

## Por formato

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| docx | 384 | 0 | 0.394 | 0.246 | 0.051 / 0.876 | 0.050 / 0.211 | 660 |
| odt | 384 | 0 | 0.394 | 0.146 | 0.052 / 0.793 | 0.031 / 0.211 | 660 |
| pdf | 384 | 0 | 0.312 | 0.115 | 0.053 / 0.801 | 0.030 / 0.172 | 652 |

## Por variante

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| erros | 384 | 0 | 0.362 | 0.172 | 0.151 / 0.823 | 0.107 / 0.198 | 658 |
| limpo | 384 | 0 | 0.372 | 0.171 | 0.000 / 1.000 | 0.000 / 1.000 | 656 |
| perturbado | 384 | 0 | 0.365 | 0.168 | 0.000 / 1.000 | 0.000 / 1.000 | 658 |

## Por estilo

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| abnt | 18 | 0 | 0.762 | 0.743 | 0.120 / 1.000 | 0.194 / 1.000 | 36 |
| ama | 126 | 0 | 0.644 | 0.311 | 0.075 / 0.486 | 0.029 / 0.417 | 216 |
| apa | 126 | 0 | 0.000 | 0.000 | 0.030 / 1.000 | 0.000 / 0.000 | 214 |
| chicago-ad | 126 | 0 | 0.000 | 0.000 | 0.227 / 1.000 | 0.000 / 0.000 | 216 |
| harvard | 126 | 0 | 0.000 | 0.000 | 0.027 / 1.000 | 0.000 / 0.000 | 216 |
| ieee | 126 | 0 | 0.195 | 0.205 | 0.023 / 1.000 | 1.000 / 0.000 | 212 |
| iso690-ad | 126 | 0 | 0.493 | 0.082 | 0.270 / 0.774 | 0.032 / 0.441 | 216 |
| iso690-num | 126 | 0 | 0.628 | 0.347 | 0.135 / 0.958 | 0.042 / 0.417 | 216 |
| mla | 126 | 0 | 0.000 | 0.000 | 0.333 / 0.230 | 1.000 / 0.000 | 216 |
| vancouver | 126 | 0 | 0.660 | 0.353 | 0.120 / 0.917 | 0.035 / 0.393 | 214 |

## Por locale

| Grupo | Exec. | Falhas | Segm. F1 | Paream. F1 | D P / R | E P / R | Violações |
|---|---|---|---|---|---|---|---|
| de-DE | 162 | 0 | 0.000 | 0.000 | 0.040 / 0.877 | 1.000 / 0.000 | 324 |
| en-US | 162 | 0 | 0.547 | 0.269 | 0.080 / 0.759 | 0.026 / 0.241 | 324 |
| es-ES | 162 | 0 | 0.539 | 0.242 | 0.066 / 0.798 | 0.023 / 0.241 | 324 |
| fr-FR | 162 | 0 | 0.000 | 0.000 | 0.043 / 0.861 | 1.000 / 0.000 | 0 |
| it-IT | 162 | 0 | 0.000 | 0.000 | 0.036 / 0.831 | 1.000 / 0.000 | 324 |
| pt-BR | 180 | 0 | 0.568 | 0.321 | 0.073 / 0.828 | 0.051 / 0.467 | 356 |
| pt-PT | 162 | 0 | 0.558 | 0.255 | 0.061 / 0.805 | 0.043 / 0.407 | 320 |

## Arquivos com mais erros

| Arquivo | Segm. FN | Paream. FN | Paream. FP | Exemplos de citação não reconhecida pelo gabarito |
|---|---|---|---|---|
| reservado_harvard_pt-PT_limpo.docx | 30 | 82 | 0 | (Park, 1977); (dos Assunção et al., 1984); (Branco e Neves, 2004); (Branco e Neves, 2004); (Silva e Nogueira, 2025b) |
| reservado_harvard_pt-PT_limpo.odt | 30 | 82 | 0 | (Park, 1977); (dos Assunção et al., 1984); (Branco e Neves, 2004); (Branco e Neves, 2004); (Silva e Nogueira, 2025b) |
| reservado_harvard_pt-PT_limpo.pdf | 30 | 82 | 0 | (Park, 1977); (dos Assunção et al., 1984); (Branco e Neves, 2004); (Branco e Neves, 2004); (Silva e Nogueira, 2025b) |
| reservado_harvard_pt-PT_perturbado.docx | 30 | 82 | 0 | (Park, 1977); (dos Assunção et al., 1984); (Branco e Neves, 2004); (Branco e Neves, 2004); (Silva e Nogueira, 2025b) |
| reservado_harvard_pt-PT_perturbado.odt | 30 | 82 | 0 | (Park, 1977); (dos Assunção et al., 1984); (Branco e Neves, 2004); (Branco e Neves, 2004); (Silva e Nogueira, 2025b) |
| reservado_harvard_pt-PT_perturbado.pdf | 30 | 82 | 0 | (Park, 1977); (dos Assunção et al., 1984); (Branco e Neves, 2004); (Branco e Neves, 2004); (Silva e Nogueira, 2025b) |
| reservado_chicago-ad_en-US_limpo.docx | 33 | 77 | 0 | Prepared by the author (2026); based on dos Butler et al. (2008) |
| reservado_chicago-ad_en-US_limpo.odt | 33 | 77 | 0 | Prepared by the author (2026); based on dos Butler et al. (2008) |
| reservado_chicago-ad_en-US_limpo.pdf | 33 | 77 | 0 | Prepared by the author (2026); based on dos Butler et al. (2008) |
| reservado_chicago-ad_en-US_perturbado.docx | 33 | 77 | 0 | Prepared by the author (2026); based on dos Butler et al. (2008) |
| reservado_chicago-ad_en-US_perturbado.odt | 33 | 77 | 0 | Prepared by the author (2026); based on dos Butler et al. (2008) |
| reservado_chicago-ad_en-US_perturbado.pdf | 33 | 77 | 0 | Prepared by the author (2026); based on dos Butler et al. (2008) |
| treino_ama_fr-FR_erros.docx | 32 | 71 | 0 | [1]; [2]; [3]; [4]; [5] |
| treino_ama_fr-FR_erros.odt | 32 | 71 | 0 | laboré par l'autrice (2026) |
| treino_ama_fr-FR_erros.pdf | 32 | 71 | 0 | laboré par l'autrice (2026) |