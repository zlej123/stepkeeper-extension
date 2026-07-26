// 확장 전역 문구·언어 기본값. 콘텐츠 스크립트·옵션 페이지·서비스 워커가 함께 쓴다.
// (앱의 Localizable.xcstrings, 코어의 template.<lang>.md와 같은 역할 — 폴백은 영어)
const STEPKEEPER_STRINGS = {
  en: {
    optTitle: "stepkeeper settings", optKey: "Gemini API key",
    optKeyPlaceholder: "Free from AI Studio",
    optKeyHint: " — free, no card needed",
    optLanguage: "Output language", optModel: "Model",
    optServer: "stepkeeper-server URL (optional)",
    optServerPlaceholder: "Empty = call Gemini directly",
    optVault: "Obsidian vault name (optional)",
    optVaultPlaceholder: "Empty = last vault you opened",
    optVaultHint: "The vault the \"Open in Obsidian\" button writes the note into",
    optSave: "Save", optSaved: "Saved.",
    category: "Category", materials: "What you need", ingredients: "Ingredients",
    steps: "Steps", guide: (phrase) => `What '${phrase}' looks like:`,
    seeAt: (t) => `See it in the video at ${t}`,
    source: (title, url) => `*From [${title}](${url}) — kept with stepkeeper*`,
    unfit: "Doesn't<br>fit", analyzing: (d, p) => `Analyzing the video… (${d}, ${p})`,
    analyzeFailed: "Analysis failed", capturing: (i, n) => `Capturing frames… ${i} / ${n}`,
    captureFailed: (m) => `Capture failed: ${m}`,
    pickPrompt: "Pick the frame that shows what each phrase means.",
    makeDoc: "Make the document (.md + images)", openObsidian: "Open in Obsidian",
    copyNotion: "Copy for Notion",
    done: "Done — document.md and the frames you picked were downloaded.<br>Keep them in the same folder and the images show up in the markdown.",
    obsidianDone: (n) => `Created the note in Obsidian (stepkeeper folder).${n}`,
    obsidianImages: (n) => ` Save ${n} image(s) into the vault's stepkeeper folder yourself.`,
    copied: "Copied. Paste into a Notion page (Ctrl+V) and the formatting carries over.<br>Images are pasted separately.",
    noPlayer: "Couldn't find the player. Play the video once and try again.",
  },
  ko: {
    optTitle: "stepkeeper 설정", optKey: "Gemini API 키",
    optKeyPlaceholder: "AI Studio에서 무료 발급",
    optKeyHint: " — 카드 등록 없이 발급",
    optLanguage: "출력 언어", optModel: "모델",
    optServer: "stepkeeper-server URL (선택)",
    optServerPlaceholder: "비우면 Gemini 직접 호출",
    optVault: "Obsidian 보관함 이름 (선택)",
    optVaultPlaceholder: "비우면 마지막에 연 보관함 사용",
    optVaultHint: "\"Obsidian에서 열기\" 버튼이 노트를 만들 보관함",
    optSave: "저장", optSaved: "저장됐습니다.",
    category: "분류", materials: "준비물", ingredients: "준비 재료",
    steps: "순서", guide: (phrase) => `'${phrase}' 기준:`,
    seeAt: (t) => `영상 ${t}에서 직접 확인`,
    source: (title, url) => `*출처: [${title}](${url}) — stepkeeper로 생성*`,
    unfit: "부적합<br>링크 사용", analyzing: (d, p) => `영상 분석 중… (${d}, ${p})`,
    analyzeFailed: "분석 실패", capturing: (i, n) => `장면 캡처 중… ${i} / ${n}개`,
    captureFailed: (m) => `캡처 실패: ${m}`,
    pickPrompt: "가이드별로 의미가 가장 잘 보이는 장면을 고르세요.",
    makeDoc: "문서 만들기 (.md + 이미지)", openObsidian: "Obsidian에서 열기",
    copyNotion: "Notion용 복사",
    done: "완료! document.md와 선택한 이미지가 다운로드됐습니다.<br>같은 폴더에 두면 마크다운에서 이미지가 바로 보입니다.",
    obsidianDone: (n) => `Obsidian에 노트를 생성했습니다 (stepkeeper 폴더).${n}`,
    obsidianImages: (n) => ` 이미지 ${n}장은 볼트의 stepkeeper 폴더에 직접 저장하세요.`,
    copied: "복사됐습니다. Notion 페이지에서 붙여넣기(Ctrl+V)하면 서식이 그대로 변환됩니다.<br>이미지는 별도로 붙여넣으세요.",
    noPlayer: "플레이어를 찾지 못했습니다. 영상을 한 번 재생해 주세요.",
  },
}

/// 문서·UI 문구. 번역본이 없는 언어는 영어.
function stepkeeperStrings(language) {
  return STEPKEEPER_STRINGS[language] || STEPKEEPER_STRINGS.en;
}

/// 첫 실행 기본 출력 언어 — 브라우저 로케일을 따르고, 번역본이 없으면 영어.
/// (예전에는 "ko" 하드코딩이라 영어권 사용자가 설치 직후 한국어 문서를 받았다)
function stepkeeperDefaultLanguage() {
  const tag = (globalThis.navigator?.language || "en").split("-")[0];
  return tag in STEPKEEPER_STRINGS ? tag : "en";
}
