#!/usr/bin/env python3
"""Download the whole study dataset to a local folder, over HTTPS.

Run this BEFORE backend/sql/purge_participants.sql. The purge is irreversible and
Render's free Postgres has no point-in-time restore, so this file is the only
copy of the deleted accounts you will ever have again.

It pulls from the read-only /export router, which needs the X-Export-Key secret
(the one set in the Render dashboard as STUDY_EXPORT_KEY — never the study key
that ships in web/frontend/config.js).

    # PowerShell
    $env:STUDY_EXPORT_KEY = "..."
    python backend/tools/study_backup.py

    # or put it in a gitignored file at the repo root, .env.study:
    #   STUDY_EXPORT_KEY=...
    #   STUDY_API_BASE=https://ixlab-study-api.onrender.com
    python backend/tools/study_backup.py

Writes to study-backup/<UTC timestamp>/ unless --out says otherwise. Stdlib only:
no pip install, and it works from the same networks the export router exists for.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_BASE = "https://ixlab-study-api.onrender.com"
REPO_ROOT = Path(__file__).resolve().parents[2]


def load_env_file(path: Path) -> None:
    """Read KEY=value lines into os.environ without overriding real env vars.

    Deliberately not python-dotenv: this script must run with a bare interpreter,
    and the format we need is three lines of KEY=value."""
    if not path.is_file():
        return
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip().strip("'\""))


def fetch(base: str, path: str, key: str, timeout: int) -> bytes:
    """GET one export endpoint and return the raw bytes."""
    req = urllib.request.Request(base.rstrip("/") + path, headers={"X-Export-Key": key})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            return resp.read()
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", "replace")[:300]
        raise SystemExit(
            f"HTTP {exc.code} on {path}: {detail}\n"
            "  401 -> wrong STUDY_EXPORT_KEY\n"
            "  503 -> STUDY_EXPORT_KEY is not set on the server (Render dashboard)"
        ) from exc
    except urllib.error.URLError as exc:
        raise SystemExit(f"cannot reach {base}{path}: {exc.reason}") from exc


def save(out_dir: Path, name: str, blob: bytes) -> None:
    (out_dir / name).write_bytes(blob)
    print(f"  {name:<34} {len(blob):>10,} bytes")


def main() -> int:
    load_env_file(REPO_ROOT / ".env.study")

    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", default=os.environ.get("STUDY_API_BASE", DEFAULT_BASE),
                        help="API root (default: the Render deployment)")
    parser.add_argument("--out", default=None, help="output directory")
    parser.add_argument("--timeout", type=int, default=120,
                        help="seconds per request; Render free tier cold-starts slowly")
    args = parser.parse_args()

    key = os.environ.get("STUDY_EXPORT_KEY", "")
    if not key:
        print("STUDY_EXPORT_KEY is not set - see the docstring at the top of this file",
              file=sys.stderr)
        return 2

    stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    out_dir = Path(args.out) if args.out else REPO_ROOT / "study-backup" / stamp
    out_dir.mkdir(parents=True, exist_ok=True)

    print(f"source : {args.base}")
    print(f"target : {out_dir}\n")

    # The summary first: it doubles as the human-readable record of exactly which
    # accounts and sessions existed at backup time — the thing you check against
    # after the purge.
    summary_raw = fetch(args.base, "/export/summary", key, args.timeout)
    save(out_dir, "summary.json", summary_raw)

    summary = json.loads(summary_raw)
    participants = summary.get("participants", [])
    print(f"\n{len(participants)} participant(s) in the database:")
    for p in participants:
        print(f"  id={p.get('id'):<4} code={str(p.get('code')):<12} "
              f"sessions={p.get('sessions'):<4} last_seen={p.get('last_seen')}")
    print()

    # GPS has three shapes and they are not interchangeable: csv for pandas,
    # points for QGIS, tracks for "the route actually walked".
    for path, name in (
        ("/export/gps.csv", "gps_points.csv"),
        ("/export/gps.geojson", "gps_points.geojson"),
        ("/export/tracks.geojson", "gps_tracks.geojson"),
    ):
        save(out_dir, name, fetch(args.base, path, key, args.timeout))

    # Then every table the export router is willing to hand over. Asking the API
    # which tables exist (rather than hardcoding a list) keeps the backup complete
    # when the schema grows.
    tables = json.loads(fetch(args.base, "/export/tables", key, args.timeout))["tables"]
    print()
    for table in tables:
        save(out_dir, f"{table}.csv",
             fetch(args.base, f"/export/table/{table}.csv", key, args.timeout))

    print(f"\ndone - {len(list(out_dir.iterdir()))} files in {out_dir}")
    print("Check summary.json lists the accounts you expect BEFORE running the purge.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
