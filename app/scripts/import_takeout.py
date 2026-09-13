#!/usr/bin/env python3
"""Import Google Takeout saved lists into the Supabase staging tables.

Usage:
  python3 app/scripts/import_takeout.py            # dry run: parse + report only
  python3 app/scripts/import_takeout.py --load     # also insert into Supabase

--load reads SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY from .env at the repo
root. It refuses to run against non-empty staging tables (no silent re-import).
"""

import csv
import io
import json
import re
import sys
import urllib.parse
import urllib.request
from collections import Counter
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]
SAVED_DIR = REPO_ROOT / "meterials" / "Takeout" / "Saved"
HEADER = ["Title", "Note", "URL", "Tags", "Comment"]
FTID_RE = re.compile(r"!1s(0x[0-9a-fA-F]+):(0x[0-9a-fA-F]+)")
BATCH = 500


def parse_list_file(path):
    """Return (description, rows). Rows are dicts with source_file/row_num/
    title/note/url/ftid/cid. Raises on files that don't contain the header."""
    text = path.read_text(encoding="utf-8-sig")
    lines = text.splitlines()
    header_idx = None
    for i, line in enumerate(lines):
        if [c.strip() for c in line.split(",")] == HEADER:
            header_idx = i
            break
    if header_idx is None:
        raise ValueError(f"{path.name}: no Takeout header row found")

    description = "\n".join(l for l in lines[:header_idx] if l.strip()) or None
    reader = csv.DictReader(io.StringIO("\n".join(lines[header_idx:])))
    rows = []
    for n, rec in enumerate(reader, start=1):
        title = (rec.get("Title") or "").strip()
        note = (rec.get("Note") or "").strip()
        url = (rec.get("URL") or "").strip()
        if not (title or note or url):
            continue  # fully blank row (Takeout emits these)
        ftid = cid = None
        m = FTID_RE.search(urllib.parse.unquote(url))
        if m:
            ftid = f"{m.group(1)}:{m.group(2)}"
            cid = int(m.group(2), 16)
        rows.append({
            "source_file": path.name,
            "row_num": n,
            "title": title or None,
            "note": note or None,
            "url": url or None,
            "ftid": ftid,
            "cid": cid,
        })
    return description, rows


def load_env():
    env = {}
    for line in (REPO_ROOT / ".env").read_text().splitlines():
        line = line.strip()
        if line and not line.startswith("#") and "=" in line:
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip()
    url = env["SUPABASE_URL"].rstrip("/")
    key = env["SUPABASE_SERVICE_ROLE_KEY"]
    if not url or not key:
        raise ValueError(".env is missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY")
    return url, key


def rest(base, key, method, path, payload=None, prefer=None):
    req = urllib.request.Request(
        f"{base}/rest/v1/{path}",
        method=method,
        data=json.dumps(payload).encode() if payload is not None else None,
        headers={
            "apikey": key,
            "Authorization": f"Bearer {key}",
            "Content-Type": "application/json",
            **({"Prefer": prefer} if prefer else {}),
        },
    )
    with urllib.request.urlopen(req) as resp:
        body = resp.read()
        return json.loads(body) if body else None


def main():
    do_load = "--load" in sys.argv

    files = sorted(p for p in SAVED_DIR.iterdir() if p.is_file())
    lists, all_rows = [], []
    for path in files:
        description, rows = parse_list_file(path)
        lists.append({
            "name": path.stem if path.suffix == ".csv" else path.name,
            "description": description,
            "source_file": path.name,
        })
        all_rows.extend(rows)
        no_cid = sum(1 for r in rows if r["cid"] is None)
        flag = f"  ({no_cid} without CID)" if no_cid else ""
        print(f"{len(rows):4d} rows  {path.name}{flag}")

    cids = Counter(r["cid"] for r in all_rows if r["cid"] is not None)
    dupes = {c: n for c, n in cids.items() if n > 1}
    no_cid_total = sum(1 for r in all_rows if r["cid"] is None)
    print("-" * 60)
    print(f"files: {len(files)}   rows: {len(all_rows)}   "
          f"distinct places (by CID): {len(cids)}")
    print(f"rows without CID: {no_cid_total}   "
          f"CIDs appearing in >1 row: {len(dupes)} "
          f"({sum(dupes.values())} rows collapse into them)")

    if not do_load:
        print("\ndry run only — rerun with --load to insert into Supabase")
        return

    base, key = load_env()
    existing = rest(base, key, "GET", "import_rows?select=id&limit=1")
    if existing:
        raise SystemExit("import_rows is not empty — refusing to re-import. "
                         "Truncate staging tables first if a re-run is intended.")

    rest(base, key, "POST", "lists", lists)
    for i in range(0, len(all_rows), BATCH):
        rest(base, key, "POST", "import_rows", all_rows[i:i + BATCH])
        print(f"inserted {min(i + BATCH, len(all_rows))}/{len(all_rows)}")

    n_lists = rest(base, key, "GET", "lists?select=count", prefer="count=exact")
    n_rows = rest(base, key, "GET", "import_rows?select=count", prefer="count=exact")
    print(f"loaded: lists={n_lists[0]['count']}  import_rows={n_rows[0]['count']}")
    if n_lists[0]["count"] != len(lists) or n_rows[0]["count"] != len(all_rows):
        raise SystemExit("row-count mismatch after load — investigate before proceeding")


if __name__ == "__main__":
    main()
