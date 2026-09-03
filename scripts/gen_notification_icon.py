"""
Build white monochrome notification icons from the official Karins K asset.

Android status-bar small icons must be a white silhouette on transparent
background — colour is applied by the system. Source art lives in
assets/notification/karins-k-source.png (blue K on black).
"""
import os
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
RES = os.path.join(ROOT, "android", "app", "src", "main", "res")
SOURCE = os.path.join(ROOT, "assets", "notification", "karins-k-source.png")

SIZES = {
    "drawable-mdpi": 24,
    "drawable-hdpi": 36,
    "drawable-xhdpi": 48,
    "drawable-xxhdpi": 72,
    "drawable-xxxhdpi": 96,
}


def source_to_silhouette(source: Image.Image, size: int) -> Image.Image:
    """Convert coloured K art into a centred white alpha silhouette."""
    src = source.convert("RGBA")
    pixels = src.load()
    width, height = src.size

    # Black background → transparent; K body + outline → solid white.
    for y in range(height):
        for x in range(width):
            red, green, blue, alpha = pixels[x, y]
            if red < 24 and green < 24 and blue < 24:
                pixels[x, y] = (0, 0, 0, 0)
            else:
                pixels[x, y] = (255, 255, 255, 255)

    bbox = src.getbbox()
    if not bbox:
        raise ValueError("Source K image has no visible content.")

    cropped = src.crop(bbox)

    # Leave breathing room so OEM status bars do not clip the glyph.
    padding = max(2, int(size * 0.1))
    inner = max(1, size - padding * 2)
    cropped.thumbnail((inner, inner), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    offset_x = (size - cropped.width) // 2
    offset_y = (size - cropped.height) // 2
    canvas.paste(cropped, (offset_x, offset_y), cropped)
    return canvas


def main() -> None:
    if not os.path.isfile(SOURCE):
        raise FileNotFoundError(f"Missing source K asset: {SOURCE}")

    source = Image.open(SOURCE)

    for folder, pixel_size in SIZES.items():
        folder_path = os.path.join(RES, folder)
        os.makedirs(folder_path, exist_ok=True)
        output = os.path.join(folder_path, "ic_stat_notification.png")
        source_to_silhouette(source, pixel_size).save(output, "PNG")
        print("wrote", output, pixel_size)

    generic = os.path.join(RES, "drawable", "ic_stat_notification.png")
    os.makedirs(os.path.dirname(generic), exist_ok=True)
    source_to_silhouette(source, 48).save(generic, "PNG")
    print("wrote", generic, 48)

    xml_path = os.path.join(RES, "drawable", "ic_stat_notification.xml")
    if os.path.exists(xml_path):
        os.remove(xml_path)
        print("removed", xml_path)

    print("done")


if __name__ == "__main__":
    main()
