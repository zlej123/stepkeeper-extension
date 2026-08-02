#!/usr/bin/env python3
"""Build the Chrome Web Store upload zip (extension runtime files only)."""
import json
import sys
import zipfile
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8")
HERE = Path(__file__).parent

# 런타임 파일 전부 — 하나라도 빠지면 로드 시점에 깨진다 (i18n.js는 content/bg/options 공용)
INCLUDE = [
    "manifest.json", "i18n.js", "zip.js", "doc.js", "bg.js",
    "candidate-times.js", "content.js", "content.css",
    "options.html", "options.js",
]
INCLUDE_DIRS = ["icons", "assets"]

version = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))["version"]
dist = HERE / "dist"
dist.mkdir(exist_ok=True)
target = dist / f"stepkeeper-extension-{version}.zip"

manifest = json.loads((HERE / "manifest.json").read_text(encoding="utf-8"))
# manifest가 참조하는 스크립트가 INCLUDE에 다 있는지 확인 — 목록 갱신을 잊는 실수 차단
referenced = {manifest["background"]["service_worker"], manifest["options_page"]}
for entry in manifest.get("content_scripts", []):
    referenced.update(entry.get("js", []) + entry.get("css", []))
missing = sorted(referenced - set(INCLUDE))
if missing:
    sys.exit(f"manifest가 참조하는 파일이 INCLUDE에 없습니다: {missing}")

with zipfile.ZipFile(target, "w", zipfile.ZIP_DEFLATED) as bundle:
    for name in INCLUDE:
        bundle.write(HERE / name, name)
    for directory in INCLUDE_DIRS:
        for path in sorted((HERE / directory).rglob("*")):
            if path.is_file():
                bundle.write(path, path.relative_to(HERE).as_posix())

print(f"{target} ({target.stat().st_size // 1024} KB)")
