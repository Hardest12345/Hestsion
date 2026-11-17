"""Original image processing pipeline. No generative reconstruction or training."""
from io import BytesIO
from PIL import Image, ImageFilter, ImageOps, ImageChops

MAX_INPUT_PIXELS = 24_000_000
MAX_EDGE = 4096
PIPELINE_VERSION = "birefnet-lite-alpha-lanczos-v1"
Image.MAX_IMAGE_PIXELS = MAX_INPUT_PIXELS


def enhance_cutout(cutout: Image.Image) -> tuple[bytes, bytes, int, int]:
    """Bounded 2x Lanczos enlargement + restrained RGB sharpening, preserve alpha."""
    rgba = cutout.convert("RGBA")
    if rgba.getchannel("A").getbbox() is None:
        raise ValueError("empty_mask")
    scale = min(2.0, MAX_EDGE / max(rgba.size))
    size = tuple(max(1, round(n * scale)) for n in rgba.size)
    # Pillow resamples RGBA in premultiplied alpha, avoiding dark color fringes.
    rgba = rgba.resize(size, Image.Resampling.LANCZOS)
    alpha = rgba.getchannel("A")
    rgb = rgba.convert("RGB").filter(ImageFilter.UnsharpMask(radius=1, percent=90, threshold=3))
    rgb.putalpha(alpha)
    thumb = rgb.copy()
    thumb.thumbnail((512, 512), Image.Resampling.LANCZOS)
    output, thumbnail = BytesIO(), BytesIO()
    rgb.save(output, format="WEBP", lossless=True, method=6)
    thumb.save(thumbnail, format="WEBP", lossless=True, method=6)
    return output.getvalue(), thumbnail.getvalue(), rgb.width, rgb.height


def process_image(original: bytes, remove_background) -> dict:
    if len(original) > 64 * 1024 * 1024:
        raise ValueError("image_too_large")
    with Image.open(BytesIO(original)) as opened:
        if opened.format != "PNG" or getattr(opened, "n_frames", 1) != 1:
            raise ValueError("invalid_normalized_original")
        if opened.width * opened.height > MAX_INPUT_PIXELS:
            raise ValueError("image_too_large")
        low_resolution = min(opened.size) < 512
        image = ImageOps.exif_transpose(opened).convert("RGBA")
        image.thumbnail((MAX_EDGE, MAX_EDGE), Image.Resampling.LANCZOS)
        input_alpha = image.getchannel("A")
        if input_alpha.getbbox() is None:
            raise ValueError("empty_mask")
        cutout = remove_background(image).convert("RGBA")
        if cutout.size != image.size:
            raise ValueError("mask_size_mismatch")
        cutout.putalpha(ImageChops.multiply(input_alpha, cutout.getchannel("A")))
        result, thumb, width, height = enhance_cutout(cutout)
        return {"cutout": result, "thumbnail": thumb, "width": width, "height": height,
                "warning": "low_resolution" if low_resolution else None}
