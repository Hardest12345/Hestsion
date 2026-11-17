"""Process at most one queued asset, then exit (operations/live smoke testing)."""
import os
from worker import Worker
from segmenter import create_segmenter

if __name__ == '__main__':
    url = os.environ.get('SUPABASE_URL')
    key = os.environ.get('SUPABASE_SECRET_KEY') or os.environ.get('SUPABASE_SERVICE_ROLE_KEY')
    if not url or not key:
        raise SystemExit('Worker connection is not configured.')
    worker = Worker(url, key, create_segmenter())
    print(f'processed_one={worker.process_one()}', flush=True)
