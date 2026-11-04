# Seletor de imagens do Central

Esta pasta contém a versão integrada do Anime Screenshot Picker.

## Acesso

Com o painel do Central em execução, abra `/picker` ou use o link na navegação lateral.

## Arquivos do componente

- `index.html`: interface original isolada em iframe.
- `central.css`: ajustes visuais para combinar com o Central.
- `mosaic.js` e `manual-mosaic-workshop.js`: composição local de mosaicos.
- `manual-mosaic.html`: oficina manual.

## Integrações

- Bangumi: atendido pela rota restrita `/bangumi` do Next.js.
- FanCaps: a busca remota foi desativada nesta integração. O domínio retornou bloqueio/rate limit durante o uso anterior; não há proxy alternativo nem tentativa de contornar essa restrição.
- Imagens locais: o modo manual permite carregar arquivos do próprio computador e exportar os resultados no navegador.

## Dados locais

Os catálogos grandes do projeto original não foram incorporados nesta primeira versão. Se forem necessários, os arquivos devem ser adicionados nesta pasta com os nomes esperados pelo Picker:

- `anime_map.json`
- `fancaps_anime_images.jsonl`
- `bangumi_anime_subjects.jsonl`
- `anime-titles.xml` (opcional)

Não substitua esses arquivos por catálogos incompletos: o modo automático depende da estrutura e dos identificadores originais.
