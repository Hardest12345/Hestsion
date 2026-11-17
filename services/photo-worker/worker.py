"""Durable Supabase queue consumer. Run separately from the web/API processes."""
import os
import time
import uuid
from urllib.parse import quote
import requests
from image_pipeline import process_image

BUCKET = "wardrobe-images"


class Worker:
    def __init__(self, url, service_key, remove_background):
        self.url = url.rstrip("/")
        self.http = requests.Session()
        self.http.headers.update({"apikey": service_key})
        # New sb_secret_ keys belong in apikey, not the JWT Authorization header.
        if not service_key.startswith('sb_secret_'):
            self.http.headers.update({"Authorization": f"Bearer {service_key}"})
        self.remove_background = remove_background

    def rpc(self, name, payload):
        response = self.http.post(f"{self.url}/rest/v1/rpc/{name}", json=payload, timeout=30)
        response.raise_for_status()
        return response.json()

    def object_url(self, key):
        return f"{self.url}/storage/v1/object/{BUCKET}/{quote(key, safe='/')}"

    def put(self, key, value):
        response = self.http.post(self.object_url(key), data=value,
                                  headers={"Content-Type": "image/webp", "x-upsert": "false", "Cache-Control": "max-age=60"}, timeout=90)
        response.raise_for_status()

    def cleanup(self, keys):
        if not keys:
            return
        response = self.http.delete(f"{self.url}/storage/v1/object/{BUCKET}", json={"prefixes": keys}, timeout=30)
        response.raise_for_status()

    def process_one(self):
        jobs = self.rpc("claim_clothing_photo", {})
        if not jobs:
            return False
        job = jobs[0]
        # Validate keys from the DB rather than following arbitrary URLs or paths.
        owner, item, asset, lease = (str(uuid.UUID(job[k])) for k in ("user_id", "item_id", "id", "lease_token"))
        prefix = f"{owner}/{item}/{asset}"
        original_key = f"{prefix}/original.png"
        outputs = [f"{prefix}/runs/{lease}/cutout.webp", f"{prefix}/runs/{lease}/thumbnail.webp"]
        written = []
        completion_attempted = False
        try:
            if job["original_key"] != original_key:
                raise ValueError("invalid_object_key")
            with self.http.get(self.object_url(original_key), timeout=90, stream=True) as response:
                response.raise_for_status()
                chunks, count = [], 0
                for chunk in response.iter_content(65536):
                    count += len(chunk)
                    if count > 64 * 1024 * 1024:
                        raise ValueError("image_too_large")
                    chunks.append(chunk)
            result = process_image(b"".join(chunks), self.remove_background)
            for key, content in zip(outputs, (result["cutout"], result["thumbnail"])):
                written.append(key)
                self.put(key, content)
            completion_attempted = True
            accepted = self.rpc("complete_clothing_photo", {"p_asset_id": asset, "p_lease_token": lease,
                        "p_width": result["width"], "p_height": result["height"], "p_warning": result["warning"]})
            if not accepted:
                self.cleanup(written)  # Deleted item or old lease: never attach stale outputs.
            print(f"photo_job={asset} status={'ready' if accepted else 'stale'}", flush=True)
        except Exception as error:
            # No raw image, URL, user prompt, or credential in logs.
            print(f"photo_job={asset} status=failed error_type={type(error).__name__}", flush=True)
            try:
                if completion_attempted:
                    # The commit may have succeeded with a lost response. Keep its outputs;
                    # an unfinished lease expires and is retried with different output keys.
                    print(f"photo_job={asset} completion=unknown", flush=True)
                else:
                    self.cleanup(written)
                    self.rpc("fail_clothing_photo", {"p_asset_id": asset, "p_lease_token": lease})
            except Exception:
                print(f"photo_job={asset} cleanup_or_retry=deferred", flush=True)
        return True


def main():
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SECRET_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise SystemExit("Set SUPABASE_URL and SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) in the worker environment only.")
    # Lazy import: tests do not install/download a model or call an external provider.
    from segmenter import create_segmenter
    worker = Worker(url, key, create_segmenter())
    print("photo_worker=ready pipeline=birefnet-lite-alpha-lanczos-v1", flush=True)
    while True:
        try:
            if not worker.process_one():
                time.sleep(3)
        except KeyboardInterrupt:
            break
        except Exception as error:
            print(f"photo_worker=poll_failed error_type={type(error).__name__}", flush=True)
            time.sleep(5)


if __name__ == "__main__":
    main()
