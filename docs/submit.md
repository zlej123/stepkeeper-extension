# Chrome Web Store 제출 가이드

대시보드 앞에서 그대로 따라 하는 절차. 등록 문안은 [store-listing.md](store-listing.md)에 있으니
이 문서는 "무엇을 어디에 넣는가"만 다룬다.

준비물 요약: **① $5 등록비 ② 스크린샷 1장 ③ zip** — 이 셋만 있으면 제출된다.
(①②는 네가, ③은 `python pack.py`로 이미 생성됨.)

---

## 0. 제출 전 최종 확인 (터미널)

```bash
cd ~/dev/stepkeeper-extension

# 번들 자산이 코어와 최신인지 (프롬프트/스키마가 낡으면 분석 품질 저하)
python sync_assets.py          # 코어에서 skill-core 재복사
git status --short             # 변경 있으면 커밋

# 업로드 zip 재생성
python pack.py                 # → dist/stepkeeper-extension-0.2.0.zip
```

버전을 올려 재제출할 때는 `manifest.json`의 `"version"`을 먼저 올리고 `pack.py`를 다시 돌린다
(스토어는 같은 버전 재업로드를 거부한다).

---

## 1. 개발자 등록 (최초 1회, $5)

1. [chrome.google.com/webstore/devconsole](https://chrome.google.com/webstore/devconsole) 접속 (구글 계정)
2. 개발자 등록 → **일회성 $5 결제**. 이 계정으로 올리는 모든 확장에 유효.

---

## 2. 새 항목 만들기 + zip 업로드

1. 대시보드 → **New Item** → `dist/stepkeeper-extension-0.2.0.zip` 드래그
2. 업로드되면 아래 탭들이 열린다. store-listing.md 내용을 붙여넣는다:

| 탭 | 넣을 것 (출처: store-listing.md) |
|----|------|
| Store listing → 이름 | `stepkeeper` |
| Store listing → 요약 | "Turn how-to YouTube videos into documents…" (132자 이내 문안) |
| Store listing → 설명 | "자세한 설명" 코드블록 전체 |
| Store listing → 카테고리 | Productivity |
| Store listing → 언어 | English |
| Store listing → 아이콘 | 자동(zip의 icon128) — 별도 업로드 불필요 |
| Store listing → 스크린샷 | **3절에서 만든 1280×800 이미지** (최소 1장, 필수) |

---

## 3. 스크린샷

**바로 쓸 수 있는 스크린샷이 준비돼 있다: [`docs/store/screenshot-1280x800.png`](store/screenshot-1280x800.png)**

실제 패널 CSS(`content.css`) + 코어의 실제 캡처 프레임(`stepkeeper/docs/demo/`)으로 만든 충실한
홍보용 합성 이미지다(라이브 캡처가 아니라 조립본 — UI·프레임·문구는 전부 진짜). 그대로 업로드해도 되고,
소스는 `docs/store/screenshot.html`이라 문구를 바꿔 재생성할 수 있다:

```bash
"/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" --headless --disable-gpu \
  --force-device-scale-factor=1 --window-size=1280,800 \
  --screenshot=docs/store/screenshot-1280x800.png "file://$PWD/docs/store/screenshot.html"
```

### 라이브 캡처로 바꾸고 싶다면 (선택)

최대한 진짜에 가깝게 하려면 확장을 로컬 크롬에 로드해서 실제 화면을 찍는다.

1. `chrome://extensions` → 우상단 **개발자 모드** 켜기
2. **압축해제된 확장 프로그램을 로드** → `~/dev/stepkeeper-extension` 폴더 선택
3. 확장 옵션에서 Gemini 키 입력 (aistudio.google.com/apikey, 무료)
4. 유튜브 how-to 영상 열기 (store-listing.md 추천: 매듭 영상 `Q9NqGd7464U`) → 잠깐 재생
5. 우하단 **stepkeeper 버튼** 클릭 → 분석 → **가이드별 3후보 썸네일 패널이 뜬 상태**에서 스크린샷
6. **1280×800**으로 크기 맞추기 (macOS: 미리보기 앱에서 도구 → 크기 조정, 또는 그 해상도로 크롭)

좋은 스크린샷 = 패널에 가이드 문구 + 후보 3장이 또렷이 보이는 화면. 이게 제품 가치를 한눈에 보여준다.

---

## 4. 개인정보 탭 (Privacy practices)

store-listing.md의 "개인정보" 절 그대로:

- **Single purpose**: store-listing.md 문장 붙여넣기
- **권한별 사유**: storage / host_permission / content script 각각 (store-listing.md에 있음)
- **원격 코드 사용**: **No**
- **데이터 수집**: 수집 항목 전부 **체크 안 함** (개발자는 아무 데이터도 안 받음)
- **개인정보처리방침 URL**: `https://github.com/zlej123/stepkeeper-extension/blob/main/PRIVACY.md`

이 확장은 "사용자 본인 키로 Google에 직접 호출, 개발자 서버 없음"이라 데이터 수집 신고가 전부 "없음"이다 —
심사에서 유리한 지점.

---

## 5. 제출

- **Save draft** → 각 탭 왼쪽에 경고(⚠️)가 없는지 확인
- **Submit for review** → 심사 대기 (보통 며칠, MV3·단일 목적이라 대체로 순조로움)

## 심사에서 나올 수 있는 지적과 대비

- **host_permissions 최소성**: `generativelanguage.googleapis.com`만 요청 — 문제 소지 낮음.
- **content script가 youtube.com/watch에만**: manifest의 matches가 이미 한정적.
- **"유튜브 콘텐츠 사용"**: 다운로드 없이 사용자가 보고 있는 플레이어의 프레임만 캡처 — PRIVACY.md와 설명에 명시돼 있음.
  리젝되면 "no download, frames from the user's own playback" 근거로 회신.

## 승인 후

- 스토어 URL을 README와 stepkeeper 코어 README의 확장 링크 옆에 추가.
- 이후 업데이트: manifest version 올리고 → pack.py → 대시보드 → Package 탭에서 새 zip 업로드 → 재심사.
