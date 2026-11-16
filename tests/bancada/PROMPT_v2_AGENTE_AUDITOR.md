# PROMPT v2: correção do auditor guiada pela bancada de testes

Substitui a v1 (`PROMPT_SUITE_TESTES_AUDITOR_CITACOES.md`). A v1 continua valendo como especificação do comportamento esperado (algoritmo do validador cruzado, estados das obras, regras invioláveis). Ela foi superada em três pontos:

- a stack agora é conhecida (Electron, Node 24, `electron/auditor.cjs`, `metadata.cjs`, `main.cjs`, `csl_mendeley_parser.cjs`, `lener_br_classifier.cjs`);
- a bancada de testes já existe e não precisa ser construída;
- a rodada anterior testou só o manuscrito disponível, o que não basta.

## 1. Papel

Você é engenheiro de software do auditor. Sua tarefa é corrigir o motor até ele passar no portão da bancada (`tests/bancada`), trabalhando em ramo e ambiente isolados. **O critério de sucesso é o relatório da bancada, não a sua avaliação.** É proibido afirmar ganho de precisão, como "de 8% para 96%", sem o relatório que o comprova.

## 2. O que a rodada anterior acertou e onde errou

Acertos, que devem ser mantidos como diagnóstico:

- V-01, segmentação: a função `ehInicioNovaReferencia` funde entradas;
- V-02, rede: falta repetir a consulta com espera (backoff) e falta o `mailto`;
- V-03, `pontuarArquivo`: pareia PDFs só por autor e ano;
- V-05: "Elaborado pela autora" é lido como citação;
- V-06: o IPC aceita caminhos sem contenção;
- V-07: o motor usa o campo `issued` em vez do ano do fascículo.

Erros, que não podem ser repetidos:

1. **Correções sob medida para o caso de teste.** Listas fixas com "SNOMED INTERNATIONAL", "SÃO PAULO", "International Society for Human and Animal Mycology" e similares só fazem passar o documento que já foi visto. O conjunto reservado da bancada usa outros nomes de entidades justamente para pegar isso. A regra tem que ser estrutural: uma entrada por parágrafo e autor entidade reconhecido pelo padrão, não pelo nome.
2. **Tolerância de ±1 ano.** Ela esconde erro real de digitação no ano. O certo é aceitar o ano exato de qualquer um destes campos do Crossref: `published-print`, `journal-issue` ou `published-online`.
3. **`startsWith` na contenção de caminhos.** Esse teste aceita `C:\Bib2` como se estivesse dentro de `C:\Bib` e recusa `c:\bib` no Windows. A bancada demonstra os dois defeitos (casos S08 e S09). Use `path.relative`, como na implementação de referência em `suites/seguranca/caminho_contido.cjs`.
4. **`mailto` inventado** (`pesquisa@bibliografia.local`). O endereço precisa ser real e configurável pela variável `AUDITOR_CONTATO_EMAIL`.
5. **Repetir consulta que deu 404.** Só se repete a consulta depois de 429, 5xx ou tempo esgotado. Depois de esgotar as tentativas, o estado é `consulta_falhou`, nunca "não localizada" ou "alucinação".
6. **Embeddings para conferir conteúdo.** Similaridade de vetores não distingue "sustenta" de "contradiz" (número trocado, negação, direção invertida). A suíte de afirmações mede isso. Use um julgamento de sustentação com três saídas e confira os números de forma explícita.
7. **Fatos errados no relatório.** O relatório anterior atribuiu ao §142 o problema do Programa SUS Digital, que estava em outro parágrafo, e repetiu achados que já tinham sido corrigidos. Todo achado precisa citar arquivo, versão e trecho.
8. **Teste só com um arquivo.** Toda mudança agora roda contra cerca de 1.700 arquivos da bancada.

## 3. Sequência de trabalho

1. Criar o ramo `bancada/AAAA-MM-DD`. Copiar `tests/bancada` e instalar o Python e `requirements.txt`.
2. Separar o núcleo do auditor do Electron, de forma que ele rode em Node puro, e completar `adaptador_auditor.cjs` a partir do modelo. Esse é o primeiro entregável.
3. **Rodar a linha de base sem mudar nada no motor** e guardar os relatórios em `tests/bancada/resultados/linha_de_base/`:
   - `rodar_bancada.py` com os três formatos;
   - `rodar_bancada.py` com os artigos reais;
   - `rodar_suites.py`.
4. Corrigir em ciclos curtos: um defeito, um teste que falha, a correção e a bancada inteira de novo. A ordem é:
   1. segmentação;
   2. extração e pareamento (inclui tabelas, colchetes dentro de parênteses e "(e.g., ...; Autor, ano)");
   3. classificação do tipo de fonte e estados das obras;
   4. rede (repetição com espera, `consulta_falhou`, URLs configuráveis);
   5. regra de ano e fascículo;
   6. pareamento de PDFs locais (número do ato ou título, nunca só autor e ano);
   7. plágio (janela mínima, exclusão de nomes próprios e de trechos entre aspas);
   8. conferência de conteúdo;
   9. contenção de caminhos.
5. Em cada ciclo, conferir no relatório se nenhuma categoria piorou e se o conjunto reservado acompanha o de treino.
6. Ao final, rodar `rodar_acervo.py` sobre a pasta de artigos do usuário (pedir o caminho) e anexar o relatório.

## 4. Regras

- É proibido alterar gabarito, corpus ou limiares da bancada para passar. Se um gabarito estiver errado, abrir uma nota com a evidência e parar para o usuário decidir.
- É proibido abrir os arquivos do conjunto reservado para depurar. Os defeitos devem ser estudados no conjunto de treino e nos artigos reais; o reservado só serve para medir.
- Nenhum nome próprio de entidade, periódico ou autor pode aparecer em lista fixa no código, exceto termos normativos genéricos (como "Fonte:" e "Elaborado pela"), e esses precisam ser cobertos pela suíte em vários idiomas.
- Toda correção vem com o teste unitário que a motivou, no repositório do motor.
- Determinismo: a mesma entrada precisa gerar a mesma saída. Ordenar coleções e fixar sementes.

## 5. Portão de integração

Pode integrar ao motor principal somente quando:

1. `rodar_bancada.py` disser **PODE INTEGRAR** no corpus sintético (treino e reservado, nos três formatos);
2. nos artigos reais, o pareamento tiver F1 de pelo menos 0,98 e os pontos D e E tiverem precisão de pelo menos 0,95, descontadas as divergências de ano que já existem nos artigos publicados;
3. `rodar_suites.py` aprovar todas as suítes, com zero alerta crítico na v22 do TCC e os problemas reais da v18 e da v19 encontrados;
4. `rodar_acervo.py` não mostrar mudança só por formatação nem por conversão para PDF;
5. existir o comparativo entre a linha de base e a versão final, com cada métrica, e a instrução de reversão.

Depois de integrar, o motor novo roda **em sombra** ao lado do antigo nos próximos manuscritos. Cada diferença entre os dois vira caso de teste novo na bancada.

## 6. Entregáveis

1. Ramo com o núcleo separado e o adaptador.
2. `resultados/linha_de_base/` e `resultados/final/` com todos os relatórios.
3. `COMPARATIVO.md`, com uma tabela de antes e depois por suíte e por métrica.
4. Lista dos defeitos corrigidos, cada um com o teste correspondente.
5. Lista do que ficou abaixo do limiar e por quê.

Comece pelo passo 2 e mostre a linha de base antes de corrigir qualquer coisa.
