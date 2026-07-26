#!/usr/bin/env python3
"""스토어 스크린샷 생성 — 실제 content.css + 실제 파이프라인 후보 프레임으로 패널을 조립한다.

라이브 캡처가 아니라 조립본이지만 UI·프레임·문구는 전부 진짜다:
- 패널 스타일: ../../content.css 를 그대로 읽어 인라인
- 후보 썸네일: stepkeeper 코어가 실제로 뽑은 before/center/after 프레임
- 가이드 문구: 같은 실행의 분석 결과 문구

사용:
    python3 docs/store/make_screenshot.py <frames-dir> <analysis.json> [--lang en|ko]
    # frames-dir 예: work/frames/<video-id>/recipe.en
"""
import argparse
import base64
import json
import pathlib
import subprocess
import sys

HERE = pathlib.Path(__file__).resolve().parent
REPO = HERE.parent.parent
CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"

TEXT = {
    "en": {
        "pick": "— pick the frame that shows what each phrase means.",
        "unfit": "Doesn't&nbsp;fit<br>use a link",
        "make": "Make the document (.md + images)",
        "obsidian": "Open in Obsidian",
        "notion": "Copy for Notion",
        "tagline": "Turn videos into documents, recipes, and user manuals.",
        "sub": "The ambiguous moments get the actual frame — no download, your own Gemini key.",
        "caption": 'The video only says <b>"golden brown crust"</b> and <b>"medium-rare."</b><br>'
                   "stepkeeper finds where that state is visible, shows you candidates, "
                   "and puts the one you pick into the document.",
    },
    "ko": {
        "pick": "— 가이드별로 의미가 가장 잘 보이는 장면을 고르세요.",
        "unfit": "부적합<br>링크 사용",
        "make": "문서 만들기 (.md + 이미지)",
        "obsidian": "Obsidian에서 열기",
        "notion": "Notion용 복사",
        "tagline": "영상을 문서로, 레시피로, 사용매뉴얼로.",
        "sub": "애매한 말은 실제 장면으로 — 다운로드 없이, 내 Gemini 키로.",
        "caption": "영상은 <b>\"golden brown crust\"</b>, <b>\"medium-rare\"</b> 라고만 말합니다.<br>"
                   "stepkeeper는 그 상태가 실제로 보이는 프레임을 찾아 후보를 보여주고, "
                   "당신이 고른 장면을 문서에 넣습니다.",
    },
}


def data_uri(path: pathlib.Path) -> str:
    return "data:image/jpeg;base64," + base64.b64encode(path.read_bytes()).decode()


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("frames")
    parser.add_argument("analysis")
    parser.add_argument("--lang", default="en", choices=sorted(TEXT))
    parser.add_argument("--guides", type=int, default=2, help="패널에 넣을 가이드 수")
    args = parser.parse_args()

    frames = pathlib.Path(args.frames)
    analysis = json.loads(pathlib.Path(args.analysis).read_text(encoding="utf-8"))
    text = TEXT[args.lang]
    guides = [g for g in analysis["visual_guides"]
              if (frames / f"{g['id']}_center.jpg").exists()][-args.guides:]
    if not guides:
        sys.exit(f"후보 프레임을 찾지 못했습니다: {frames}")

    cards = []
    for guide in guides:
        thumbs = "".join(
            f'<label><input type="radio" {"checked" if slot == "center" else ""}>'
            f'<img src="{data_uri(frames / f"{guide["id"]}_{slot}.jpg")}"></label>'
            for slot in ("before", "center", "after"))
        cards.append(f'''
      <section class="cn-card">
        <p><b>{guide["id"]}</b> · {guide["phrase"]}<br><small>{guide["guide_text"]}</small></p>
        <div class="cn-row">{thumbs}
          <label class="cn-none"><input type="radio"><span>{text["unfit"]}</span></label>
        </div>
      </section>''')

    player = data_uri(frames / f"{guides[-1]['id']}_center.jpg")
    panel_css = (REPO / "content.css").read_text(encoding="utf-8")
    html = f'''<!doctype html><meta charset="utf-8"><style>
* {{ margin:0; padding:0; box-sizing:border-box; }}
body {{ width:1280px; height:800px; overflow:hidden;
       font-family:-apple-system,'Helvetica Neue',sans-serif; }}
.stage {{ position:relative; width:1280px; height:800px; background:#111318; }}
.vtitle {{ position:absolute; left:40px; top:34px; color:#fff; font-size:18px; font-weight:600; }}
.player {{ position:absolute; left:40px; top:70px; width:760px; height:490px; border-radius:10px;
          background:url('{player}') center/cover; }}
.caption {{ position:absolute; left:40px; top:580px; width:760px; color:#cfd3da;
           font-size:15px; line-height:1.6; }}
.caption b {{ color:#fff; }}
.footer {{ position:absolute; left:0; bottom:0; width:1280px; height:150px; background:#e5484d;
          color:#fff; display:flex; align-items:center; gap:28px; padding:0 40px; }}
.footer .mark {{ font-size:34px; font-weight:700; letter-spacing:-.5px; }}
.footer .lines {{ font-size:17px; line-height:1.6; }}
/* 실제 확장 패널 스타일 (content.css 그대로) */
{panel_css}
#stepkeeper-panel {{ position:absolute; top:70px; right:24px; max-height:none; }}
</style>
<div class="stage">
  <div class="vtitle">{analysis["title"]}</div>
  <div class="player"></div>
  <div class="caption">{text["caption"]}</div>
  <div id="stepkeeper-panel">
    <div class="cn-head"><b>stepkeeper</b><button>✕</button></div>
    <p><b>{analysis["title"]}</b> {text["pick"]}</p>
    {"".join(cards)}
    <div class="cn-actions">
      <button class="cn-primary">{text["make"]}</button>
      <button class="cn-secondary">{text["obsidian"]}</button>
      <button class="cn-secondary">{text["notion"]}</button>
    </div>
  </div>
  <div class="footer">
    <div class="mark">stepkeeper</div>
    <div class="lines">{text["tagline"]}<br>{text["sub"]}</div>
  </div>
</div>'''

    page = HERE / f"screenshot.{args.lang}.html"
    page.write_text(html, encoding="utf-8")
    shot = HERE / f"screenshot-1280x800{'' if args.lang == 'en' else '.' + args.lang}.png"
    subprocess.run([CHROME, "--headless", "--disable-gpu", "--force-device-scale-factor=1",
                    "--window-size=1280,800", f"--screenshot={shot}", f"file://{page}"],
                   check=True, capture_output=True)
    print(f"{shot} ({shot.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
