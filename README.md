# Quiz de anime em Remotion

## Rodar
    npm install
    npm run dev            # abre o Remotion Studio (pré-visualização)
    npm run render         # vídeo longo 1920x1080 -> out/quiz.mp4
    npm run render:short   # Short 1080x1920 (1ª pergunta) -> out/short.mp4

## Editar o conteúdo
- `data/perguntas.json`: número, nome do anime e 4 imagens (da mais difícil para a mais fácil).
- Coloque as imagens em `public/imagens/` e use o caminho no JSON, ex.: `"imagens/q1_1.jpg"`.
  Com `null`, aparece um placeholder.
- Tempos e nome do canal: `defaultProps` em `src/Root.tsx`.
- Cores e fonte: topo de `src/Quiz.tsx`.

## Ainda não tem
Áudio (contagem, acerto) e seu mascote/logo. Use só som próprio ou licenciado.

## Modo zoom (adivinhe pelo vilão)
Composições `ZoomLongo` e `ZoomShort`. Dados em `data/zoom.json`:
- `imagem`: caminho dentro de `public/` (ou `null` para placeholder).
- `cortes`: lista de etapas `{x, y, zoom}`. x e y são % da imagem (o ponto que vai para o centro); zoom 4 = 4x. A imagem inteira entra sozinha no final.
- `transicao` em `src/Root.tsx`: `"suave"` (zoom animado entre etapas) ou `"corte"` (corte seco).
Rodar: `npm run render:zoom` ou `npm run render:zoom-short`.

## Gerar vídeos a partir do acervo
    npm run gerar -- --modo zoom --n 10             # 10 animes, 1 imagem cada, cortes automáticos
    npm run gerar -- --modo quatro --n 10 --render  # 4 imagens por anime e já renderiza
    npm run gerar -- --modo zoom --n 10 --seed 42   # mesmo sorteio de novo
Lê `acervo/`, sorteia (priorizando o que foi menos usado, via `data/historico.json`),
escreve `data/zoom.json` ou `data/perguntas.json` e um texto com capítulos em `out/`.
Os dev scripts agora apontam para `src/video/index.ts`.

## Modo zoom: um zoom só e depois a revelação
Por padrão o `gerar` cria **1 corte** por pergunta: a imagem aparece ampliada, depois zooma para fora
até a imagem inteira e, por fim, entra o nome do anime. Para mais etapas: `--cortes 3`.
Tempos em `src/config.ts` (`SEG_POR_CORTE`, `SEG_REVELACAO`).

## Abertura com explicações em vários idiomas
Composição `Intro` (8 s): 5 linhas com bandeira (EN, ES, PT, FR, RU) entrando em sequência e uma faixa de imagens
promocionais passando ao lado. Coloque 3 a 6 imagens em `promos/`; o `gerar` prepara tudo e escolhe o texto do modo
(zoom ou 4 imagens). Os vídeos completos (abertura + perguntas) são `ZoomCompleto` e `QuizCompleto`;
`npm run gerar -- ... --render` já usa esses. Duração da abertura: `INTRO_SEG` em `src/config.ts`.

## Painel (front)
    npm run painel     # abre em http://127.0.0.1:3000
Gera vídeos (modo, quantidade, cortes, seed, renderizar), mostra as tarefas com o log, o acervo, as saídas em `out/`
e abre o Remotion Studio. Roda só na sua máquina (127.0.0.1): ele executa comandos locais, não o hospede na internet.

## Status da renderização
O `gerar --render` agora renderiza por dentro (`@remotion/bundler` e `@remotion/renderer`) e informa etapa,
porcentagem e tempo restante, que o painel mostra numa barra de progresso (e no título da aba).
Etapas: preparando imagens → empacotando o projeto → renderizando o vídeo → concluído.
Na primeira renderização o Remotion baixa o navegador interno (pode demorar).

## Top 10 para Shorts (AniList)
    npm run top -- --genero acao --ordem score --n 10            # melhores notas de ação
    npm run top -- --temporada FALL --ano 2026 --ordem popularidade
    npm run top -- --genero romance --ordem tendencia --render
Consulta o AniList (sem scraping), baixa as capas dos itens, escreve `data/top.json` e `out/top-*.txt`
(título, ranking e descrição) e, com `--render`, gera o Short (composição `TopShort`, 1080x1920).
O painel tem a seção "Top 10 para Shorts". Resultados ficam em cache por 12 h em `data/cache/`.
Leia os termos de uso do AniList antes de monetizar. A capa é arte promocional com dono: teste como não listado.
