import json

with open("data/anime_data.json", encoding="utf-8") as f:
    data = json.load(f)

anime = next(
    (a for a in data if "86" in a.get("title", "").lower()
     or "eighty-six" in a.get("alternative_title", "").lower()),
    None
)

if not anime:
    print("Anime não encontrado.")
else:
    print(f"\nAnime: {anime['title']}")
    print(f"ID: {anime['id']}")
    print(f"Total de episódios: {len(anime.get('episodes', []))}\n")

    for ep in anime.get("episodes", []):
        ids = ep.get("valid_images_ids", [])
        print(
            f"Episódio {ep.get('episode')} | "
            f"Página: {ep.get('id')} | "
            f"IDs válidos: {len(ids) if isinstance(ids, list) else 0} | "
            f"Primeiro ID: {ep.get('first_image_id')} | "
            f"Último ID: {ep.get('last_image_id')}"
        )