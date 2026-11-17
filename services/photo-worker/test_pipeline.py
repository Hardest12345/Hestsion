import unittest
from io import BytesIO
from PIL import Image, ImageDraw
from image_pipeline import enhance_cutout, process_image
from worker import Worker
from segmenter import matte_mask


def original(size=(80, 96), transparent=False):
    image = Image.new("RGBA", size, (190, 180, 160, 255))
    if transparent:
        image.putpixel((0, 0), (0, 0, 0, 0))
    value = BytesIO()
    image.save(value, format="PNG")
    return value.getvalue()


def synthetic_mask(image):
    result = image.copy()
    mask = Image.new("L", image.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((12, 12, image.width-12, image.height-12), radius=8, fill=220)
    result.putalpha(mask)
    return result


class PipelineTests(unittest.TestCase):
    def test_native_resolution_matting_is_tiled_with_bounded_context(self):
        image = Image.new('RGB', (1500, 1600), 'navy')
        mask = Image.new('L', image.size, 0)
        ImageDraw.Draw(mask).rectangle((200, 200, 1300, 1400), fill=255)
        patches = []
        def fake_matting(picture, alpha, *_):
            patches.append(picture.size)
            picture = picture.convert('RGBA'); picture.putalpha(alpha); return picture
        result = matte_mask(image, mask, fake_matting)
        self.assertEqual(result.size, image.size)
        self.assertTrue(patches)
        self.assertTrue(all(max(size) <= 640 for size in patches))
        self.assertEqual(result.getchannel('A').tobytes(), mask.tobytes())

    def test_secret_key_is_not_sent_as_a_jwt(self):
        worker = Worker('https://test.invalid', 'sb_secret_test_placeholder', synthetic_mask)
        self.assertEqual(worker.http.headers['apikey'], 'sb_secret_test_placeholder')
        self.assertNotIn('Authorization', worker.http.headers)

    def test_lossless_transparency_upscale_and_source_warning(self):
        result = process_image(original(), synthetic_mask)
        with Image.open(BytesIO(result["cutout"])) as cutout:
            self.assertEqual(cutout.size, (160, 192))
            self.assertEqual(cutout.mode, "RGBA")
            self.assertEqual(cutout.getpixel((0, 0))[3], 0)
            self.assertGreater(cutout.getpixel((80, 96))[3], 0)
        self.assertEqual(result["warning"], "low_resolution")

    def test_existing_alpha_is_not_filled_back_in(self):
        result = process_image(original(transparent=True), lambda image: image.convert("RGB").convert("RGBA"))
        with Image.open(BytesIO(result["cutout"])) as cutout:
            self.assertEqual(cutout.getpixel((0, 0))[3], 0)

    def test_empty_mask_and_wrong_mask_dimensions_fail(self):
        with self.assertRaisesRegex(ValueError, "empty_mask"):
            process_image(original(), lambda image: Image.new("RGBA", image.size, (0, 0, 0, 0)))
        with self.assertRaisesRegex(ValueError, "mask_size_mismatch"):
            process_image(original(), lambda _: Image.new("RGBA", (10, 10)))

    def test_upscale_is_bounded_and_thumbnail_preserves_aspect(self):
        cutout, thumb, width, height = enhance_cutout(Image.new("RGBA", (2200, 100), (70, 80, 90, 180)))
        self.assertEqual(width, 4096)
        self.assertLessEqual(height, 200)
        with Image.open(BytesIO(thumb)) as image:
            self.assertLessEqual(max(image.size), 512)
            self.assertEqual(image.mode, "RGBA")
        self.assertTrue(cutout)

    def test_non_png_and_oversized_images_fail(self):
        with self.assertRaises(Exception):
            process_image(b"not an image", synthetic_mask)
        value = BytesIO()
        Image.new("RGB", (48, 48)).save(value, format="JPEG")
        with self.assertRaisesRegex(ValueError, "invalid_normalized_original"):
            process_image(value.getvalue(), synthetic_mask)


OWNER = "11111111-1111-4111-8111-111111111111"
ITEM = "22222222-2222-4222-8222-222222222222"
ASSET = "33333333-3333-4333-8333-333333333333"
LEASE = "44444444-4444-4444-8444-444444444444"


class FakeResponse:
    def __enter__(self): return self
    def __exit__(self, *args): return False
    def raise_for_status(self): pass
    def iter_content(self, _size): yield original()


class FakeHTTP:
    def get(self, *args, **kwargs): return FakeResponse()


class TestWorker(Worker):
    def __init__(self, accepted=True):
        super().__init__("https://test.invalid", "test-worker-key", synthetic_mask)
        self.http = FakeHTTP()
        self.accepted = accepted
        self.calls, self.written, self.removed = [], [], []
        self.job = {"user_id": OWNER, "item_id": ITEM, "id": ASSET, "lease_token": LEASE,
                    "original_key": f"{OWNER}/{ITEM}/{ASSET}/original.png"}

    def rpc(self, name, payload):
        self.calls.append((name, payload))
        if name == "claim_clothing_photo": return [self.job]
        if name == "complete_clothing_photo":
            if isinstance(self.accepted, Exception): raise self.accepted
            return self.accepted
        return True

    def put(self, key, value): self.written.append(key)
    def cleanup(self, keys): self.removed.extend(keys)


class QueueTests(unittest.TestCase):
    def test_ready_uses_lease_specific_paths_and_no_public_urls(self):
        worker = TestWorker()
        self.assertTrue(worker.process_one())
        self.assertEqual(len(worker.written), 2)
        self.assertTrue(all(f"/runs/{LEASE}/" in key for key in worker.written))
        self.assertEqual(worker.removed, [])

    def test_stale_lease_cleans_only_its_own_outputs(self):
        worker = TestWorker(accepted=False)
        worker.process_one()
        self.assertEqual(worker.removed, worker.written)

    def test_unknown_completion_preserves_possibly_committed_outputs(self):
        worker = TestWorker(accepted=TimeoutError())
        worker.process_one()
        self.assertEqual(worker.removed, [])
        self.assertFalse(any(name == "fail_clothing_photo" for name, _ in worker.calls))

    def test_arbitrary_original_key_rejected_and_job_retried(self):
        worker = TestWorker()
        worker.job["original_key"] = "https://untrusted.invalid/image"
        worker.process_one()
        self.assertEqual(worker.written, [])
        self.assertTrue(any(name == "fail_clothing_photo" for name, _ in worker.calls))


if __name__ == "__main__":
    unittest.main()
