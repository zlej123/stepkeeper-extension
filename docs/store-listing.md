# Chrome Web Store 등록 문안 (대시보드에 붙여넣기용)

## 기본 정보

- **이름**: stepkeeper
- **요약(짧은 설명, 132자 이내)**:
  Turn videos into documents, recipes, and user manuals. Ambiguous spoken steps get the actual video frame.
- **카테고리**: Productivity → Tools
- **언어**: English (한국어 설명 추가 가능)

## 자세한 설명 (Description)

```
stepkeeper turns a YouTube how-to video into a follow-along document.

Spoken instructions like "cut it bite-sized" or "simmer until the sauce
reduces" don't mean much as text. stepkeeper finds the moment where that state
is actually visible, captures candidate frames directly from the player, lets
you pick the right one, and builds a markdown document with the frames
embedded.

- Works on cooking, repair, crafts, beauty, fitness, software tutorials
- Three candidate frames (before / center / after) per ambiguous step; you pick
- Nothing is downloaded from YouTube — frames come from the player you're watching
- Bring your own Gemini API key (free tier works); no account, no tracking
- Output: document.md + images, ready for Obsidian or any markdown app

How to use:
1. Enter your Gemini API key in the extension options
   (free at aistudio.google.com/apikey)
2. Open a YouTube how-to video, play it for a moment
3. Click the stepkeeper button (bottom right) → pick frames → download document
```

## 개인정보 (Privacy practices 탭)

- **Single purpose**: Convert the YouTube how-to video the user is watching into a downloadable document with user-selected video frames.
- **권한 사유**:
  - `storage`: 사용자의 API 키·언어 설정 저장
  - `host_permission (generativelanguage.googleapis.com)`: 사용자 본인 키로 Gemini API 호출
  - `content script (youtube.com/watch)`: 버튼/패널 UI 표시 및 시청 중인 플레이어에서 프레임 캡처
- **원격 코드 사용**: 없음 (No)
- **데이터 수집**: 없음 — 개발자는 어떤 데이터도 수신하지 않음. 분석 요청은 사용자 키로 Google Gemini에 직접 전송.
- **개인정보처리방침 URL**: https://github.com/zlej123/stepkeeper-extension/blob/main/PRIVACY.md

## 그래픽 자산

- 스토어 아이콘 128×128: `icons/icon128.png` 그대로 업로드
- 스크린샷 1280×800 최소 1장 (필수): 유튜브 페이지에서 선택 패널이 떠 있는 화면을 캡처해 사용
  - 추천 장면: 매듭 영상(Q9NqGd7464U)에서 가이드 3개 + 썸네일 3장씩 보이는 패널

## 업로드 파일

`python pack.py` 실행 → `dist/stepkeeper-extension-<버전>.zip` 업로드
