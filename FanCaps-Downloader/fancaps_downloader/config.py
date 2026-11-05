from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
DOWNLOAD_DIR = BASE_DIR.parent / "Acervo"
DATASET_PATH = DATA_DIR / "anime_data.json"
DATABASE_PATH = DATA_DIR / "downloads.db"

IMAGE_BASE_URL = "https://cdni.fancaps.net/file/fancaps-animeimages"

DATA_DIR.mkdir(parents=True, exist_ok=True)
DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
