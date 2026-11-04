# FanCaps Downloader

Aplicação desktop em Python com CustomTkinter para navegar pelo dataset local `anime_data.json` e organizar downloads retomáveis.

## Requisitos
- Windows 10/11
- Python 3.10 ou superior

## Instalação
1. Extraia o projeto.
2. Coloque `anime_data.json` na pasta `data/`.
   - Use o arquivo JSON local obtido do projeto `Maximax67/fancaps-parser`.
3. Abra o PowerShell na pasta do projeto.
4. Crie e ative um ambiente virtual:

   ```powershell
   py -m venv .venv
   .\.venv\Scripts\Activate.ps1
   ```

5. Instale as dependências:

   ```powershell
   pip install -r requirements.txt
   ```

6. Inicie:

   ```powershell
   python main.py
   ```

## Funcionamento
- O catálogo é lido exclusivamente do JSON local.
- Episódios sem `valid_images_ids` são marcados como incompletos e não entram na fila.
- Os downloads são sequenciais nesta primeira versão.
- Os arquivos já existentes são ignorados.
- Um HTTP 429, 403 ou resposta Cloudflare interrompe a fila. O programa não tenta contornar bloqueios.
- O estado é guardado em `data/downloads.db`.
- Os arquivos são salvos em `downloads/<Anime>/<Episode>/`.

## Observações importantes
O dataset contém IDs, não uma garantia de que cada imagem ainda esteja disponível. O servidor pode limitar ou negar o acesso. Respeite os termos e limites do site e não reexecute a fila enquanto houver um bloqueio ativo.
