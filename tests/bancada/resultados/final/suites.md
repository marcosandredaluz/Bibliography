# Suítes complementares

## Portão

| Critério | Situação |
|---|---|
| TCC ponta a ponta (v18, v19, v22) | APROVADO |
| Rede simulada (429, 500, tempo, JSON inválido) | APROVADO |
| Afirmações: acurácia ≥ 0,90 | APROVADO |
| Plágio: acurácia = 1,00 | APROVADO |
| Segurança de caminhos | APROVADO |
| Referências reais: autor ≥ 0,95 e ano ≥ 0,98 | APROVADO |

## tcc

| Versão | Referências lidas | D | E | Problemas reais achados | Alertas proibidos emitidos | Alertas críticos | Situação |
|---|---|---|---|---|---|---|---|
| tcc_v18.docx | 87/87 | 0 | 0 | 5/5 | nenhuma | 5 | APROVADO |
| tcc_v19.docx | 87/87 | 0 | 0 | 3/3 | nenhuma | 3 | APROVADO |
| tcc_v22.docx | 87/87 | 0 | 0 | 0/0 | nenhuma | 0 | APROVADO |

## rede

| Obra | Esperado | Obtido | Resultado | Motivo |
|---|---|---|---|---|
| ALVES, F. Obra com resposta co | consulta_falhou | consulta_falhou | ok | JSON inválido é falha de consulta |
| COSTA, D. Obra após erro do se | existe | existe | ok | 500 duas vezes e depois 200 |
| GERMAN, R. R. et al. Updated g | existe | existe | ok | sem DOI; Crossref não acha pelo título, PubMed acha (PMID 18634202) |
| INSTITUTO EXEMPLO. Página inst | existe | existe | ok | página web: conferir pela URL, não por base de artigos |
| INSTITUTO SUMIDO. Página remov | nao_localizada | nao_localizada | ok | URL responde 404 |
| LIMA, C. Obra sob limite perma | consulta_falhou | consulta_falhou | ok | 429 em todas as tentativas: falha de consulta, nunca "não localizada" ou "alucinação" |
| PEREIRA, G. Obra inexistente.  | nao_localizada | nao_localizada | ok | 404 em todas as bases e nenhuma busca por título encontra: uso correto de "não localizada" |
| ROCHA, E. Obra lenta. Revista  | consulta_falhou | consulta_falhou | ok | resposta só após 30 s: tempo esgotado é falha de consulta |
| SILVA, A. Obra disponível. Rev | existe | existe | ok | DOI responde 200 |
| SOUZA, B. Obra após limite de  | existe | existe | ok | 429 com Retry-After na primeira tentativa: o motor deve esperar e repetir |
| requisições ao cenário 429-sempre | entre 2 e 6 | 4 | ok | repetição com espera, sem martelar a API |
| requisições ao cenário 429-uma-vez | entre 2 e 3 | 2 | ok | repetição com espera, sem martelar a API |
| requisições ao cenário 500-duas-vezes | entre 3 e 5 | 3 | ok | repetição com espera, sem martelar a API |

## afirmacoes

Acurácia: 1.000

| Esperado \ Obtido | contradiz | nao_trata | sustenta | outro |
|---|---|---|---|---|
| contradiz | 15 | 0 | 0 | 0 |
| nao_trata | 0 | 8 | 0 | 0 |
| sustenta | 0 | 0 | 13 | 0 |

| Categoria | Acertos |
|---|---|
| afirmacao_historica_sem_suporte | 1/1 |
| atribuicao_trocada | 1/1 |
| cardinalidade_atribuida_a_lei | 1/1 |
| causalidade_inferida | 2/2 |
| detalhe_inventado | 1/1 |
| escopo_ampliado | 1/1 |
| escopo_e_unidade | 1/1 |
| especie_trocada | 1/1 |
| extrapolacao | 1/1 |
| fonte_que_nao_sustenta | 1/1 |
| identificador_trocado | 1/1 |
| inversao_de_direcao | 1/1 |
| literal | 4/4 |
| negacao | 5/5 |
| numero_de_outra_grandeza | 1/1 |
| numero_igual | 4/4 |
| numero_trocado | 1/1 |
| objetivo_trocado | 1/1 |
| parafrase | 1/1 |
| parafrase_entre_linguas | 4/4 |
| periodo_trocado | 1/1 |
| regra_atribuida_a_lei | 1/1 |

## plagio

Acurácia: 1.000

| Esperado \ Obtido | copia | nao_copia | outro |
|---|---|---|---|
| copia | 4 | 0 | 0 |
| nao_copia | 0 | 10 | 0 |

| Categoria | Acertos |
|---|---|
| citacao_direta_com_localizador | 1/1 |
| citacao_direta_com_pagina | 1/1 |
| nome_de_sistema | 1/1 |
| nome_proprio_de_entidade | 1/1 |
| parafrase_entre_linguas | 1/1 |
| parafrase_legitima | 1/1 |
| quase_literal_en_sem_aspas | 1/1 |
| quase_literal_pt_sem_aspas | 3/3 |
| termos_tecnicos_comuns | 1/1 |
| titulo_de_norma | 1/1 |
| trecho_curto_de_norma_citada | 2/2 |

## seguranca

| Caso | Plataforma | Raiz | Subcaminho | Esperado | Obtido | Resultado |
|---|---|---|---|---|---|---|
| S01 | win32 | `C:\Bib` | `pdfs` | permitir | permitir | ok |
| S02 | win32 | `C:\Bib` | `` | permitir | permitir | ok |
| S03 | win32 | `C:\Bib` | `..\\Windows` | negar | negar | ok |
| S04 | win32 | `C:\Bib` | `pdfs\\..\\..\\Windows` | negar | negar | ok |
| S05 | win32 | `C:\Bib` | `pdfs\\..\\notas` | permitir | permitir | ok |
| S06 | win32 | `C:\Bib` | `C:\\Windows\\System32` | negar | negar | ok |
| S07 | win32 | `C:\Bib` | `\\\\servidor\\compartilhado` | negar | negar | ok |
| S08 | win32 | `C:\Bib` | `..\\Bib2\\segredo` | negar | negar | ok |
| S09 | win32 | `C:\Bib` | `c:\\bib\\pdfs` | permitir | permitir | ok |
| S10 | win32 | `C:\Bib` | `pdfs/../../Bib/pdfs` | permitir | permitir | ok |
| S11 | win32 | `C:\Bib` | `D:\\Bib` | negar | negar | ok |
| S12 | win32 | `C:\Bib` | `pdfs\x00..\\..\\x` | negar | negar | ok |
| S13 | posix | `/home/u/bib` | `pdfs` | permitir | permitir | ok |
| S14 | posix | `/home/u/bib` | `../../../etc/passwd` | negar | negar | ok |
| S15 | posix | `/home/u/bib` | `../bib2/x` | negar | negar | ok |
| S16 | posix | `/home/u/bib` | `/etc` | negar | negar | ok |
| S17 | posix | `/home/u/bib` | `pdfs/./../notas` | permitir | permitir | ok |
| S18 | win32 | `C:\Bib\` | `pdfs` | permitir | permitir | ok |

## referencias

- Autor principal correto: 1222/1233 (0.991)
- Ano correto: 1444/1468 (0.984)
