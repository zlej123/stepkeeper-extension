#!/usr/bin/env python3
"""Build the Chrome Web Store upload zip (extension runtime files only)."""
import json
import sys
import zipfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent

INCLUDE = [
    "manifest.json", "bg.js", "content.js", "content.css",
    "options.html", "options.js",
]
INCLUDE_DIRS = ["icons", "assets"]

version = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))["version"]
dist = HERE / "dist"
dist.mkdir(exist_ok=True)
target = dist / f"stepkeeper-extension-{version}.zip"

with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as bundle:
    for name in INCLUDE:
        bundle.write(HERE / name, name)
    for directory in INCLUDE_DIRS:
        for path in sorted((HERE / directory).rglob("*")):
            if path.is_file():
                bundle.write(path, path.relative_to(HERE).as_posix())

print(f"{target} ({target.stat().st_size // 1024} KB)")
