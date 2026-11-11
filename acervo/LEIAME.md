# Acervo

Uma pasta por anime, com as imagens dentro. O nome da pasta vira a resposta:

    acervo/
      jujutsu-kaisen/    1.jpg 2.jpg 3.jpg ...
      one-piece/         ...

Opcional, para um nome bonito: `acervo/<pasta>/anime.json` com `{ "nome": "Jujutsu Kaisen" }`.
Formatos: jpg, png, webp. Modo "zoom" usa 1 imagem por anime; modo "quatro" usa 4 (idealmente 4 ou mais por pasta).

## Revelação do modo "4 imagens" (dados do AniList)
O `gerar` busca no AniList, pelo nome da pasta, a **capa**, a **nota**, os **gêneros**, o **ano**, o **formato** e o **estúdio**.
Opcional, por pasta de anime:
- `anime.json`: `{ "nome": "Dr. Stone", "anilistId": 105333, "nota": 8.7 }`. `nome` é o título mostrado; `anilistId` força o anime certo
  quando a busca por nome errar (o log mostra qual anime foi encontrado); `nota` (0 a 10) substitui a do AniList.
- `capa.jpg` (ou png/webp): usa a sua capa no lugar da do AniList. Esse arquivo não entra no sorteio das dicas.
- `--sem-anilist` na linha de comando desliga a busca (a revelação sai só com a imagem e o nome).
