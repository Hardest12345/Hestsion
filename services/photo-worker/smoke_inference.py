"""Optional real pretrained-model smoke test on an original synthetic garment.

Not part of unit tests: first run downloads the MIT-licensed BiRefNet weights.
No personal photos or Supabase credentials are used.
"""
import json
import os
import sys
import time
from io import BytesIO
from pathlib import Path
from PIL import Image, ImageDraw
from image_pipeline import process_image
from segmenter import create_segmenter


def main():
    output = Path(os.environ.get("SMOKE_OUTPUT", "work/photo-smoke"))
    output.mkdir(parents=True, exist_ok=True)
    image = Image.new("RGB", (768, 896), (224, 213, 191))
    draw = ImageDraw.Draw(image)
    # Original vector garment fixture, no external dataset or third-party photo.
    draw.ellipse((150, 750, 640, 815), fill=(201, 190, 170))
    outline = [(270, 160), (195, 198), (100, 385), (205, 438), (250, 335), (235, 745), (535, 745), (520, 335), (565, 438), (670, 385), (575, 198), (500, 160), (450, 190), (320, 190)]
    draw.polygon(outline, fill=(68, 91, 124), outline=(43, 61, 88), width=4)
    draw.line((385, 195, 385, 738), fill=(48, 65, 91), width=4)
    draw.polygon([(270, 160), (385, 202), (320, 267)], fill=(83, 107, 140))
    draw.polygon([(500, 160), (385, 202), (450, 267)], fill=(83, 107, 140))
    for y in range(290, 710, 65): draw.ellipse((390, y, 398, y+8), fill=(188, 186, 166))
    scale = int(os.environ.get('SMOKE_SCALE', '1'))
    if scale != 1:
        image = image.resize((image.width*scale, image.height*scale), Image.Resampling.LANCZOS)
    source = BytesIO()
    image.save(source, format="PNG")
    (output / "source.png").write_bytes(source.getvalue())
    started = time.monotonic()
    segment = create_segmenter()
    loaded = time.monotonic()

    result = process_image(source.getvalue(), segment)
    for name in ("cutout", "thumbnail"): (output / f"{name}.webp").write_bytes(result[name])
    with Image.open(BytesIO(result["cutout"])) as cutout:
        alpha = cutout.getchannel("A")
        assert alpha.getextrema()[0] == 0 and alpha.getextrema()[1] > 200
        assert alpha.getpixel((0, 0)) == 0
        assert alpha.getpixel((cutout.width // 2, cutout.height // 2)) > 200
        histogram = alpha.histogram()
    report = {"status": "passed", "model": "birefnet-general-lite", "pipeline": "birefnet-lite-alpha-lanczos-v1",
              "input": list(image.size), "output": [result["width"], result["height"]],
              "alpha_min": 0, "alpha_max": alpha.getextrema()[1],
              "fraction_fully_transparent": histogram[0] / sum(histogram),
              "fraction_partial_alpha": sum(histogram[1:255]) / sum(histogram),
              "load_seconds": round(loaded-started, 3), "inference_pipeline_seconds": round(time.monotonic()-loaded, 3),
              "scope": "One original synthetic garment only; not an evaluation on real wardrobe photos."}
    if sys.platform != 'win32':
        import resource
        peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss
        report['peak_rss_mib'] = round(peak / (1024 * 1024 if sys.platform == 'darwin' else 1024), 2)
    (output / "report.json").write_text(json.dumps(report, indent=2)+"\n")
    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
