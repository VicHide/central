# FanCaps Downloader

Serviço de downloads em Python integrado ao painel Canal (Next.js). O painel controla o catálogo e a fila pela API local; o Python executa os downloads e registra o histórico no SQLite.

## Requisitos
- Windows 10/11
- Python 3.10 ou superior
- Node.js e dependências do projeto Central

## Preparar o Python
1. Coloque `anime_data.json` em `FanCaps-Downloader/data/`.
2. Abra um terminal nesta pasta e execute:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   pip install -r requirements.txt
   ```

## Usar pelo painel
1. Na raiz do repositório Central, execute `npm run painel`.
2. Abra `http://127.0.0.1:3000/fancaps`.
3. Pesquise um anime, selecione os episódios e adicione-os à fila.
4. Use Iniciar, Pausar, Retomar e Limpar para controlar a fila.

A API Python é iniciada automaticamente pelo servidor Next.js na primeira chamada e escuta somente em `127.0.0.1:8765`. O Next.js encaminha as chamadas pelo endpoint local `/api/fancaps`. A interface do painel atualiza o estado da fila periodicamente.

Se o ambiente virtual não existir, o painel tenta iniciar o Python pelo launcher do Windows (`py -3`) ou por `python3` nos outros sistemas. Para indicar outro executável, defina a variável de ambiente `FANCAPS_PYTHON` antes de iniciar o painel.

## API local
- `GET /health`: estado do serviço.
- `GET /catalog?q=termo&page=0`: catálogo paginado.
- `GET /episodes?anime_id=123`: episódios de um anime.
- `GET /queue`: estado e progresso da fila.
- `POST /queue`: adiciona um episódio (`anime_id`, `episode_number`).
- `POST /start`, `POST /pause`, `POST /resume`, `POST /clear`: controles da fila.

A API não habilita CORS e fica vinculada ao loopback. Não exponha essa porta na rede.

## Funcionamento dos downloads
- O catálogo é lido do JSON local.
- Episódios com IDs individuais e intervalos válidos podem ser adicionados à fila.
- Os downloads são sequenciais.
- Arquivos já existentes são ignorados.
- O estado dos arquivos fica em `data/downloads.db`.
- Os arquivos são salvos em `downloads/<Anime>/<Episode>/`.
- Um HTTP 429, 403 ou resposta de bloqueio interrompe a fila. O programa não tenta contornar bloqueios. Aguarde e respeite as restrições do servidor.

## Aplicativo desktop
A interface CustomTkinter continua disponível para uso independente:

```powershell
python main.py
```

Ela e o painel usam o mesmo catálogo, banco SQLite e diretório de downloads. Evite executar filas simultaneamente nas duas interfaces para não disputar os mesmos arquivos.
