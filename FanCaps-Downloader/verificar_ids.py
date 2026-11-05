import json

with open("data/anime_data.json", encoding="utf-8") as f:
    data = json.load(f)

anime = next(a for a in data if a.get("id") == 22468)

for ep in anime["episodes"]:
    ids = ep.get("valid_images_ids", [])

    if ids:
        primeiro = int(ep["first_image_id"])
        ultimo = int(ep["last_image_id"])

        print(f"\nEpisódio {ep['episode']}")
        print(f"Quantidade na lista: {len(ids)}")
        print(f"Intervalo registrado: {primeiro} - {ultimo}")
        print(f"Primeiro ID da lista: {ids[0]}")
        print(f"Último ID da lista: {ids[-1]}")
        print(f"Intervalo completo: {ultimo - primeiro + 1}")