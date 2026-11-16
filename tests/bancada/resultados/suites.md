# Suítes complementares

## Portão

| Critério | Situação |
|---|---|
| TCC ponta a ponta (v18, v19, v22) | REPROVADO |
| Segurança de caminhos | APROVADO |
| Referências reais: autor ≥ 0,95 e ano ≥ 0,98 | REPROVADO |

## tcc

| Versão | Referências lidas | D | E | Problemas reais achados | Alertas proibidos emitidos | Alertas críticos | Situação |
|---|---|---|---|---|---|---|---|
| tcc_v18.docx | 87/87 | 0 | 0 | 0/5 | nenhuma | 0 | REPROVADO |
| tcc_v19.docx | 87/87 | 0 | 0 | 0/3 | nenhuma | 0 | REPROVADO |
| tcc_v22.docx | 87/87 | 0 | 0 | 0/0 | nenhuma | 0 | APROVADO |

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
- Ano correto: 1393/1468 (0.949)
