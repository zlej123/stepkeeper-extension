#!/usr/bin/env python3
"""Copy skill-core assets from the stepkeeper core repo into extension assets.

Usage: python sync_assets.py [path-to-stepkeeper]   (default: ../stepkeeper)
Run whenever prompts/schemas change in the core; commit the synced copies.
"""
import shutil
import sys
from pathlib import Path
sys.stdout.reconfigure(encoding="utf-8")

HERE = Path(__file__).parent
source = Path(sys.argv[1] if len(sys.argv) > 1 else HERE.parent / "stepkeeper") / "src" / "stepkeeper" / "skill-core"
if not source.exists():
    sys.exit(f"skill-core 없음: {source}")
destination = HERE / "assets" / "skill-core"
if destination.exists():
    shutil.rmtree(destination)
shutil.copytree(source, destination)
files = sorted(p.relative_to(destination) for p in destination.rglob("*") if p.is_file())
print(f"동기화 완료: {len(files)}개 파일")
for f in files:
    print(f"  assets/skill-core/{f}")
