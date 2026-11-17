"""Run migration/RLS checks in an ephemeral local PostgreSQL container."""
from pathlib import Path
import subprocess
import time
import uuid

root = Path(__file__).resolve().parents[1]
name = f"outfit-puzzle-sql-{uuid.uuid4().hex[:10]}"
started = False
try:
    subprocess.run(["docker", "run", "--rm", "-d", "--name", name, "--network", "none",
                    "-e", "POSTGRES_HOST_AUTH_METHOD=trust", "postgres:17-alpine"], check=True)
    started = True
    for _ in range(40):
        result = subprocess.run(["docker", "exec", name, "pg_isready", "-U", "postgres"], capture_output=True)
        if result.returncode == 0:
            break
        time.sleep(0.25)
    else:
        raise RuntimeError("Test PostgreSQL did not become ready")
    for relative in ("supabase/tests/bootstrap.sql", "supabase/migrations/202611170001_private_wardrobe_photos.sql", "supabase/tests/isolation.sql"):
        print(f"Running {relative}", flush=True)
        subprocess.run(["docker", "exec", "-i", name, "psql", "-U", "postgres", "-v", "ON_ERROR_STOP=1"],
                       input=(root / relative).read_text(), text=True, check=True)
finally:
    if started:
        subprocess.run(["docker", "stop", "-t", "2", name], check=False)
