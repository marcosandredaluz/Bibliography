# Suítes complementares

## Portão

| Critério | Situação |
|---|---|
| TCC ponta a ponta (v18, v19, v22) | REPROVADO |
| Rede simulada (429, 500, tempo, JSON inválido) | REPROVADO |
| Afirmações: acurácia ≥ 0,90 | REPROVADO |
| Plágio: acurácia = 1,00 | REPROVADO |
| Segurança de caminhos | REPROVADO |
| Referências reais: autor ≥ 0,95 e ano ≥ 0,98 | REPROVADO |

## tcc

| Versão | Referências lidas | D | E | Problemas reais achados | Alertas proibidos emitidos | Alertas críticos | Situação |
|---|---|---|---|---|---|---|---|
| tcc_v18.docx | 86/87 | 16 | 0 | 0/5 | D:* | 16 | REPROVADO |
| tcc_v19.docx | 86/87 | 16 | 0 | 0/3 | D:* | 16 | REPROVADO |
| tcc_v22.docx | 87/87 | 16 | 0 | 0/0 | D:* | 16 | REPROVADO |

## rede

| Obra | Esperado | Obtido | Resultado | Motivo |
|---|---|---|---|---|
| ALVES, F. Obra com resposta co | consulta_falhou | nao_localizada | ERRO | JSON inválido é falha de consulta |
| COSTA, D. Obra após erro do se | existe | consulta_falhou | ERRO | 500 duas vezes e depois 200 |
| GERMAN, R. R. et al. Updated g | existe | existe | ok | sem DOI; Crossref não acha pelo título, PubMed acha (PMID 18634202) |
| INSTITUTO EXEMPLO. Página inst | existe | existe | ok | página web: conferir pela URL, não por base de artigos |
| INSTITUTO SUMIDO. Página remov | nao_localizada | existe | ERRO | URL responde 404 |
| LIMA, C. Obra sob limite perma | consulta_falhou | consulta_falhou | ok | 429 em todas as tentativas: falha de consulta, nunca "não localizada" ou "alucinação" |
| PEREIRA, G. Obra inexistente.  | nao_localizada | nao_localizada | ok | 404 em todas as bases e nenhuma busca por título encontra: uso correto de "não localizada" |
| ROCHA, E. Obra lenta. Revista  | consulta_falhou | nao_localizada | ERRO | resposta só após 30 s: tempo esgotado é falha de consulta |
| SILVA, A. Obra disponível. Rev | existe | nao_localizada | ERRO | DOI responde 200 |
| SOUZA, B. Obra após limite de  | existe | consulta_falhou | ERRO | 429 com Retry-After na primeira tentativa: o motor deve esperar e repetir |
| requisições ao cenário 429-sempre | entre 2 e 6 | 0 | ERRO | repetição com espera, sem martelar a API |
| requisições ao cenário 429-uma-vez | entre 2 e 3 | 0 | ERRO | repetição com espera, sem martelar a API |
| requisições ao cenário 500-duas-vezes | entre 3 e 5 | 0 | ERRO | repetição com espera, sem martelar a API |

## afirmacoes

Acurácia: 0.222

| Esperado \ Obtido | contradiz | nao_trata | sustenta | outro |
|---|---|---|---|---|
| contradiz | 0 | 15 | 0 | 0 |
| nao_trata | 0 | 8 | 0 | 0 |
| sustenta | 0 | 13 | 0 | 0 |

| Categoria | Acertos |
|---|---|
| afirmacao_historica_sem_suporte | 1/1 |
| atribuicao_trocada | 0/1 |
| cardinalidade_atribuida_a_lei | 1/1 |
| causalidade_inferida | 2/2 |
| detalhe_inventado | 1/1 |
| escopo_ampliado | 0/1 |
| escopo_e_unidade | 0/1 |
| especie_trocada | 0/1 |
| extrapolacao | 1/1 |
| fonte_que_nao_sustenta | 1/1 |
| identificador_trocado | 0/1 |
| inversao_de_direcao | 0/1 |
| literal | 0/4 |
| negacao | 0/5 |
| numero_de_outra_grandeza | 0/1 |
| numero_igual | 0/4 |
| numero_trocado | 0/1 |
| objetivo_trocado | 0/1 |
| parafrase | 0/1 |
| parafrase_entre_linguas | 0/4 |
| periodo_trocado | 0/1 |
| regra_atribuida_a_lei | 1/1 |

Erros:
- V01 (parafrase_entre_linguas): esperado sustenta, obtido nao_trata
- V02 (inversao_de_direcao): esperado contradiz, obtido nao_trata
- V03 (numero_trocado): esperado contradiz, obtido nao_trata
- V04 (periodo_trocado): esperado contradiz, obtido nao_trata
- V05 (escopo_e_unidade): esperado contradiz, obtido nao_trata
- V06 (numero_igual): esperado sustenta, obtido nao_trata
- V07 (numero_igual): esperado sustenta, obtido nao_trata
- V08 (negacao): esperado contradiz, obtido nao_trata
- V09 (especie_trocada): esperado contradiz, obtido nao_trata
- V10 (numero_igual): esperado sustenta, obtido nao_trata
- V11 (numero_de_outra_grandeza): esperado contradiz, obtido nao_trata
- V13 (literal): esperado sustenta, obtido nao_trata
- V14 (literal): esperado sustenta, obtido nao_trata
- V16 (objetivo_trocado): esperado contradiz, obtido nao_trata
- V17 (parafrase_entre_linguas): esperado sustenta, obtido nao_trata
- V18 (negacao): esperado contradiz, obtido nao_trata
- V19 (atribuicao_trocada): esperado contradiz, obtido nao_trata
- V20 (parafrase_entre_linguas): esperado sustenta, obtido nao_trata
- V21 (negacao): esperado contradiz, obtido nao_trata
- V23 (literal): esperado sustenta, obtido nao_trata
- V26 (identificador_trocado): esperado contradiz, obtido nao_trata
- V27 (literal): esperado sustenta, obtido nao_trata
- V28 (negacao): esperado contradiz, obtido nao_trata
- V29 (parafrase_entre_linguas): esperado sustenta, obtido nao_trata
- V30 (negacao): esperado contradiz, obtido nao_trata
- V33 (numero_igual): esperado sustenta, obtido nao_trata
- V35 (escopo_ampliado): esperado contradiz, obtido nao_trata
- V36 (parafrase): esperado sustenta, obtido nao_trata

## plagio

Acurácia: 0.714

| Esperado \ Obtido | copia | nao_copia | outro |
|---|---|---|---|
| copia | 0 | 4 | 0 |
| nao_copia | 0 | 10 | 0 |

| Categoria | Acertos |
|---|---|
| citacao_direta_com_localizador | 1/1 |
| citacao_direta_com_pagina | 1/1 |
| nome_de_sistema | 1/1 |
| nome_proprio_de_entidade | 1/1 |
| parafrase_entre_linguas | 1/1 |
| parafrase_legitima | 1/1 |
| quase_literal_en_sem_aspas | 0/1 |
| quase_literal_pt_sem_aspas | 0/3 |
| termos_tecnicos_comuns | 1/1 |
| titulo_de_norma | 1/1 |
| trecho_curto_de_norma_citada | 2/2 |

Erros:
- P01 (quase_literal_pt_sem_aspas): esperado copia, obtido nao_copia
- P04 (quase_literal_pt_sem_aspas): esperado copia, obtido nao_copia
- P10 (quase_literal_en_sem_aspas): esperado copia, obtido nao_copia
- P12 (quase_literal_pt_sem_aspas): esperado copia, obtido nao_copia

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
| S08 | win32 | `C:\Bib` | `..\\Bib2\\segredo` | negar | permitir | ERRO |
| S09 | win32 | `C:\Bib` | `c:\\bib\\pdfs` | permitir | permitir | ok |
| S10 | win32 | `C:\Bib` | `pdfs/../../Bib/pdfs` | permitir | permitir | ok |
| S11 | win32 | `C:\Bib` | `D:\\Bib` | negar | negar | ok |
| S12 | win32 | `C:\Bib` | `pdfs\x00..\\..\\x` | negar | negar | ok |
| S13 | posix | `/home/u/bib` | `pdfs` | permitir | permitir | ok |
| S14 | posix | `/home/u/bib` | `../../../etc/passwd` | negar | negar | ok |
| S15 | posix | `/home/u/bib` | `../bib2/x` | negar | permitir | ERRO |
| S16 | posix | `/home/u/bib` | `/etc` | negar | negar | ok |
| S17 | posix | `/home/u/bib` | `pdfs/./../notas` | permitir | permitir | ok |
| S18 | win32 | `C:\Bib\` | `pdfs` | permitir | permitir | ok |

## referencias

- Autor principal correto: 932/1233 (0.756)
- Ano correto: 1404/1468 (0.956)
