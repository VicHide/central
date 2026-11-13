# Quiz de anime em Remotion

## Rodar

```powershell
npm install
npm run dev            # abre o Remotion Studio (pré-visualização)
npm run render         # vídeo longo 1920x1080 -> out/quiz.mp4
npm run render:short   # Short 1080x1920 (1ª pergunta) -> out/short.mp4
```

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

```powershell
npm run gerar -- --modo zoom --n 10             # 10 animes, 1 imagem cada, cortes automáticos
npm run gerar -- --modo quatro --n 10 --render  # 4 imagens por anime e já renderiza
npm run gerar -- --modo zoom --n 10 --seed 42   # mesmo sorteio de novo
```

Lê `acervo/`, sorteia (priorizando o que foi menos usado, via `data/historico.json`), escreve `data/zoom.json` ou `data/perguntas.json` e um texto com capítulos em `out/`.

Os dev scripts agora apontam para `src/video/index.ts`.

## Modo zoom: um zoom só e depois a revelação

Por padrão o `gerar` cria **1 corte** por pergunta: a imagem aparece ampliada, depois zooma para fora até a imagem inteira e, por fim, entra o nome do anime. Para mais etapas: `--cortes 3`.

Tempos em `src/config.ts` (`SEG_POR_CORTE`, `SEG_REVELACAO`).

## Abertura com explicações em vários idiomas

Composição `Intro` (8 s): 5 linhas com bandeira (EN, ES, PT, FR, RU) entrando em sequência e uma faixa de imagens promocionais passando ao lado.

Coloque 3 a 6 imagens em `promos/`; o `gerar` prepara tudo e escolhe o texto do modo (zoom ou 4 imagens). Os vídeos completos (abertura + perguntas) são `ZoomCompleto` e `QuizCompleto`; `npm run gerar -- ... --render` já usa esses.

Duração da abertura: `INTRO_SEG` em `src/config.ts`.

## Painel (front)

```powershell
npm run painel     # abre em http://127.0.0.1:3000
```

Gera vídeos (modo, quantidade, cortes, seed, renderizar), mostra as tarefas com o log, o acervo, as saídas em `out/` e abre o Remotion Studio.

Roda só na sua máquina (127.0.0.1): ele executa comandos locais, não o hospede na internet.

## Status da renderização

O `gerar --render` agora renderiza por dentro (`@remotion/bundler` e `@remotion/renderer`) e informa etapa, porcentagem e tempo restante, que o painel mostra numa barra de progresso (e no título da aba).

Etapas: preparando imagens → empacotando o projeto → renderizando o vídeo → concluído.

Na primeira renderização o Remotion baixa o navegador interno (pode demorar).

## Roteiro por IA para vídeos de comparação

O painel tem o formato **Comparação** em Novo vídeo. Ao selecioná-lo, envie uma imagem ou vídeo para cada quadro, informe os nomes e o contexto e use **Gerar roteiro com IA**. A geração cria cinco cenas editáveis em português brasileiro.

Para ativar a geração:

1. Copie `.env.example` para `.env.local`.
2. Crie uma chave de API na plataforma da OpenAI e coloque-a em `OPENAI_API_KEY`.
3. Reinicie o painel com `npm run painel`.

A chave fica no servidor e não deve ser colocada no código do navegador nem enviada ao Git. O uso da API é cobrado separadamente da assinatura do ChatGPT. O modelo padrão é `gpt-6-luna`; você pode alterar `OPENAI_TEXT_MODEL` no `.env.local`.

Imagens podem ser analisadas visualmente. Para vídeos, preencha o contexto adicional de cada quadro; nesta primeira etapa, o vídeo enviado ainda não é analisado pela IA.

## Top 10 para Shorts (AniList)

```powershell
npm run top -- --genero acao --ordem score --n 10
npm run top -- --temporada FALL --ano 2026 --ordem popularidade
npm run top -- --genero romance --ordem tendencia --render
```

Consulta o AniList (sem scraping), baixa as capas dos itens, escreve `data/top.json` e `out/top-*.txt` (título, ranking e descrição) e, com `--render`, gera o Short (composição `TopShort`, 1080x1920).

O painel tem a seção "Top 10 para Shorts". Resultados ficam em cache por 12 h em `data/cache/`.

Leia os termos de uso do AniList antes de monetizar. A capa é arte promocional com dono: teste como não listado.

## Áudio e música

- **Efeitos** (`public/sfx`, gerados por síntese própria com `npm run sons`): entrada, pop das dicas, **tic-tac que acelera nos últimos 2 s antes da revelação** (quiz e zoom), som de revelação. O Top usa whoosh e pop.
- **Música de fundo**: baixe as faixas no site da NCS, coloque em `public/musica/` e descreva cada uma em `data/musicas.json` (campo `credito` = texto oficial da faixa, que está na descrição do vídeo dela no canal da NCS). O `gerar` e o `top` sorteiam uma faixa ativa, mixam em volume baixo com entrada/saída suaves e **colocam o crédito no `.txt` de publicação**.

Use `--sem-musica` para desligar. As faixas não vêm no projeto (você precisa baixá-las e seguir a política de uso).

Confira sempre a política atual da NCS e suba o primeiro vídeo como não listado para ver se há claim.

## Top 10: mais filtros

`--tag isekai`, `--formato tv|filme|ova-ona`, `--situacao finalizado|lancando`, `--pais jp|cn|kr`, `--duracao curto|medio|longo`, `--de 2015 --ate 2020`, `--nota-min 75`, além de gênero, temporada/ano e critério.

O Short agora dura cerca de 56 s (abertura 3 s, 5 s por item, fechamento 3 s) e mostra nota, gêneros, ano, formato, episódios, estúdio e popularidade.

## Gerador de thumbnails

O painel possui um gerador de thumbnails com duas modalidades: **tradicional** e **Top 10 para Shorts**.

### Thumbnail tradicional

Em Painel > Gerador de thumbnails, cada geração produz duas opções:

- **Centro:** quatro cartões nos cantos e o personagem no meio, com interrogação fixa e seta opcional.
- **Lateral:** grade 2x2 à esquerda e personagem grande na lateral, ultrapassando a borda da imagem. É uma boa opção para recortes PNG com o cabelo cortado no topo.

O título é desenhado como vetor com a fonte Luckiest Guy (em `src/assets/fonts`, licença Apache 2.0), garantindo o mesmo resultado em qualquer computador.

O campo **Tema** adiciona uma segunda linha em roxo (ex.: `200 ANIMES` + `OLHOS`). O contorno branco e escuro do personagem, a sombra, as medalhas numeradas e a seta são gerados automaticamente.

Coloque os recortes dos personagens em `acervo/pngs/`. Os arquivos precisam ser PNG com transparência.

A seta pode ser configurada para:

- **Automática:** identifica a posição do personagem e escolhe o quadro adequado.
- **Desligada:** não exibe seta.
- **Quadro específico:** aponta para um dos quatro cartões.

### Thumbnail Top 10 para Shorts

Gera uma thumbnail vertical de **1080x1920**, voltada para vídeos curtos.

- Permite usar uma imagem de fundo enviada pelo usuário ou selecionar automaticamente uma capa do ranking.
- A seleção automática pode usar uma posição específica do ranking ou escolher uma capa aleatória.
- Possui três faixas de texto editáveis, preenchidas inicialmente com informações do ranking.
- A composição utiliza a fonte Montserrat Black Italic, incluída em `src/assets/fonts`, com sua licença correspondente.

A geração utiliza os dados de `data/top.json`, criado pelo comando `npm run top`.

## Narração dos vídeos de comparação (Edge TTS)

A comparação usa a voz **Antonio (pt-BR-AntonioNeural)** do Edge TTS, com velocidade levemente acelerada. A geração é gratuita e não exige chave da ElevenLabs.

Instale a dependência Python uma única vez:

```powershell
py -m pip install -r requirements-tts.txt
```

Depois reinicie o painel com `npm run painel`. O botão **Gerar voz e renderizar vídeo** gera os áudios por cena e inicia o render do Remotion. É necessária conexão com a internet para sintetizar a voz.

Se o comando `py` não existir, use `python -m pip install -r requirements-tts.txt` e confirme que `python` está disponível no PATH.
