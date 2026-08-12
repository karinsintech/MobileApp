"""Generate white monochrome notification icons for Android status bar."""
from PIL import Image, ImageDraw
import os

base = r"E:\karins\Backup Mobile\android\app\src\main\res"
sizes = {
    "drawable-mdpi": 24,
    "drawable-hdpi": 36,
    "drawable-xhdpi": 48,
    "drawable-xxhdpi": 72,
    "drawable-xxxhdpi": 96,
}


def make_bell(size: int) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    s = size / 24.0
    d.ellipse([6 * s, 4 * s, 18 * s, 16 * s], fill=(255, 255, 255, 255))
    d.rectangle([6 * s, 10 * s, 18 * s, 16 * s], fill=(255, 255, 255, 255))
    d.ellipse([10 * s, 16 * s, 14 * s, 20 * s], fill=(255, 255, 255, 255))
    d.ellipse([10.5 * s, 2.5 * s, 13.5 * s, 5.5 * s], fill=(255, 255, 255, 255))
    return img


for folder, size in sizes.items():
    path = os.path.join(base, folder)
    os.makedirs(path, exist_ok=True)
    out = os.path.join(path, "ic_stat_notification.png")
    make_bell(size).save(out, "PNG")
    print("wrote", out, size)

xml = os.path.join(base, "drawable", "ic_stat_notification.xml")
if os.path.exists(xml):
    os.remove(xml)
    print("removed", xml)

print("done")
