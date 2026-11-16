# Motor de Auditoria Forense e Anti-Alucinação

O motor local de auditoria implementa os mais avançados conceitos de verificação referencial inspirados no `markrussinovich/refchecker` e `amazon-science/RefChecker`.

---

## 🔍 Regras de Auditoria Forense

### 1. Detecção Anti-Frankenstein (DOIs Sequestrados)
- LLMs costumam inventar citações atribuindo um DOI real a um autor e título completamente diferentes.
- O motor consulta o Crossref e compara o título declarado com o título oficial via distância de Levenshtein. Se a similaridade for inferior a 55% e o autor declarado não constar nos registros da editora, o sistema dispara alerta crítico de **Citação Frankenstein**.

### 2. Inferência Semântica Multilíngue e Âncoras Numéricas
- Artigos redigidos em português que citam originais em inglês são validados através de cálculo de similaridade de cosseno de embeddings vetoriais.
- Antes da busca semântica, o sistema extrai **entidades estatísticas invariantes** (ex: `14,5%`, `p < 0.05`, `IC 95%`) para confirmar que os dados citados realmente existem no artigo original.

### 3. Escalação em Dois Estágios (Abstract $\rightarrow$ Texto Integral)
- Se a validação no resumo (Abstract) for insatisfatória, o motor escala para o texto integral do PDF ou XML, varrendo tabelas tabulares e a seção de Discussão.

### 4. Tolerância Cronológica (Epub vs Print)
- Tolera até 1 ano de diferença quando o manuscrito cita a data de depósito eletrônico (*Online Ahead of Print*) e o registro indexado aponta o fascículo impresso posterior.
