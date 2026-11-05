from pathlib import Path

from fancaps_downloader.frame_selector import FrameSelector


folder = Path("downloads/teste")

selector = FrameSelector(threshold=4)

images = selector.get_images(folder)

result = selector.select(images, mode="best")

print(f"Imagens encontradas: {result.total}")
print(f"Frames selecionados: {result.selected_count}")
print(f"Frames descartados: {result.discarded_count}")

for image in result.selected:
    print(image.name)