// stepkeeper background: Gemini 호출(직접) 또는 stepkeeper-server 경유.
// 페이지 CORS를 피하려고 service worker에서 fetch한다.
importScripts("i18n.js");   // 언어 기본값·문구 공용 모듈

const GEMINI = "https://generativelanguage.googleapis.com/v1beta/models";

async function loadAsset(path) {
  const response = await fetch(chrome.runtime.getURL(path));
  return response.text();
}

function hms(sec) {
  return `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;
}

async function buildPrompt(profile, duration, language, maxGuides) {
  const rules = await loadAsset("assets/skill-core/engine/rules.md");
  const prompt = await loadAsset(`assets/skill-core/profiles/${profile}/prompt.md`);
  return prompt
    .replaceAll("{{RULES}}", rules)
    .replaceAll("{DURATION}", hms(duration))
    .replaceAll("{OUTPUT_LANGUAGE}", language)
    .replaceAll("{MAX_VISUAL_GUIDES}", String(maxGuides));
}

async function loadSchema(profile) {
  const raw = JSON.parse(await loadAsset(`assets/skill-core/profiles/${profile}/schema.json`));
  delete raw["$schema"]; delete raw["$comment"]; delete raw["title"];
  return raw;
}

function mmssToSec(value) {
  if (value === null || typeof value === "number") return value;
  return String(value).split(":").reduce((acc, part) => acc * 60 + parseInt(part, 10), 0);
}

function normalize(analysis) {
  for (const step of analysis.steps || []) {
    step.t_start = mmssToSec(step.t_start);
    step.t_end = mmssToSec(step.t_end);
  }
  for (const guide of analysis.visual_guides || []) {
    guide.best_visual_timestamp = mmssToSec(guide.best_visual_timestamp);
  }
  return analysis;
}

/// 코어 analyze.asset_digest와 동일 — rules+prompt+schema 바이트의 sha256 앞 12자 (리뷰 #6).
/// 직접 Gemini 경로 전용: 서버 경로는 서버가 스탬프한다. 실패 시 빈 문자열(분석은 막지 않음).
async function assetDigest(profile) {
  try {
    const text = (await loadAsset("assets/skill-core/engine/rules.md"))
      + (await loadAsset(`assets/skill-core/profiles/${profile}/prompt.md`))
      + (await loadAsset(`assets/skill-core/profiles/${profile}/schema.json`));
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0"))
      .join("").slice(0, 12);
  } catch {
    return "";
  }
}

async function analyzeDirect(payload, settings) {
  const prompt = await buildPrompt(
    payload.profile, payload.duration, settings.language, settings.maxGuides);
  const schema = await loadSchema(payload.profile);
  const response = await fetch(`${GEMINI}/${settings.model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": settings.apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ file_data: { file_uri: payload.url } }, { text: prompt }] }],
      generationConfig: {
        response_mime_type: "application/json",
        response_json_schema: schema,
        temperature: 0.2,
      },
    }),
  });
  const analysis = normalize(await readGeminiJSON(response, settings.language));
  const digest = await assetDigest(payload.profile);
  if (digest) analysis._asset_digest = digest;
  return analysis;
}

async function analyzeViaServer(payload, settings) {
  const response = await fetch(`${settings.serverUrl.replace(/\/$/, "")}/v1/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Gemini-Key": settings.apiKey },
    body: JSON.stringify({
      url: payload.url,
      profile: payload.profile,
      language: settings.language,
      max_guides: settings.maxGuides,
      duration: payload.duration,
    }),
  });
  if (!response.ok) {
    const detail = await response.text();
    throw new Error(stepkeeperStrings(settings.language)
      .errServer(response.status, detail.slice(0, 200)));
  }
  return (await response.json()).analysis;
}

/// Gemini 구조화 출력 응답 해석 (analyze·autoPick 공용, 에러 문구는 출력 언어를 따른다)
async function readGeminiJSON(response, language) {
  const L = stepkeeperStrings(language);
  if (response.status === 429) throw new Error(L.errRateLimited);
  if (!response.ok) throw new Error(L.errGemini(response.status));
  const body = await response.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error(L.errBadResponse);
  return JSON.parse(text);
}

/// 코어 autopick.py 포팅 — 가이드별 후보 3장을 Gemini vision이 보고 하나(또는 none)를 고른다.
/// 앱과 같은 안전 계약: 빠뜨린 가이드·스키마 밖 슬롯·묻지 않은 가이드는 전부 none(링크 폴백).
async function autoPickDirect(guides, settings) {
  const parts = [{ text: `${STEPKEEPER_AUTOPICK_PROMPT}\nreason은 ${settings.language} 언어로 작성하세요.` }];
  const asked = [];
  for (const guide of guides) {
    if ((guide.candidates || []).length !== 3) continue;   // 부분 실패 가이드는 사람이 고른다
    asked.push(guide.id);
    parts.push({ text: `[${guide.id}] 표현: ${guide.phrase}\n보여야 할 것: ${guide.what_to_show}\n가이드: ${guide.guide_text}` });
    for (const candidate of guide.candidates) {
      parts.push({ text: `${guide.id} 후보 ${candidate.slot}:` });
      parts.push({ inline_data: { mime_type: "image/jpeg", data: candidate.data } });
    }
  }
  if (!asked.length) return {};

  const response = await fetch(`${GEMINI}/${settings.model}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": settings.apiKey },
    body: JSON.stringify({
      contents: [{ parts }],
      generationConfig: {
        response_mime_type: "application/json",
        response_json_schema: STEPKEEPER_AUTOPICK_SCHEMA,
        temperature: 0.2,
      },
    }),
  });
  const object = await readGeminiJSON(response, settings.language);
  const valid = new Set(["before", "center", "after", "none"]);
  const picks = {};
  for (const item of object.picks || []) {
    if (!asked.includes(item.guide_id) || !valid.has(item.slot)) continue;
    picks[item.guide_id] = { slot: item.slot, reason: item.reason || "" };
  }
  for (const id of asked) picks[id] ||= { slot: "none", reason: "" };
  return picks;
}

async function loadKey() {
  // 옛 버전이 sync에 남긴 키는 local로 옮긴다 — 키는 절대 sync에 두지 않는다 (리뷰 #3)
  const legacy = await chrome.storage.sync.get("apiKey");
  if (legacy.apiKey) {
    await chrome.storage.local.set({ apiKey: legacy.apiKey });
    await chrome.storage.sync.remove("apiKey");
  }
  const session = await chrome.storage.session.get("apiKey");
  if (session.apiKey) return session.apiKey;
  return (await chrome.storage.local.get("apiKey")).apiKey || "";
}

/// 고위험 도메인 감지 — 코어 contract.py와 같은 자산(highrisk.json)으로 같은 판정 (리뷰 3차 P1-3).
/// 직접 Gemini 경로는 계약 검증을 거치지 않으므로 여기서 로컬로 감지한다.
async function detectHighRisk(analysis) {
  try {
    const asset = JSON.parse(await loadAsset("assets/skill-core/engine/highrisk.json"));
    const blob = [analysis.title, analysis.category, analysis.summary]
      .filter(Boolean).join(" ").toLowerCase();
    return asset.keywords.filter((kw) => blob.includes(kw.toLowerCase()));
  } catch {
    return [];   // 자산 문제로 고지가 빠질 수는 있어도 분석을 막지는 않는다
  }
}

async function loadSettings() {
  const settings = Object.assign(
    { language: stepkeeperDefaultLanguage(), model: "gemini-flash-lite-latest",
      maxGuides: 5, serverUrl: "", autoPick: false },
    await chrome.storage.sync.get(
      ["language", "model", "maxGuides", "serverUrl", "autoPick"]));
  settings.apiKey = await loadKey();
  // 서버 origin 권한이 회수됐으면 직접 모드로 폴백 — 권한 없는 fetch는 어차피 거부된다 (리뷰 #2)
  if (settings.serverUrl) {
    let origin;
    try { origin = new URL(settings.serverUrl).origin; } catch { origin = null; }
    const allowed = origin
      && await chrome.permissions.contains({ origins: [`${origin}/*`] });
    if (!allowed) settings.serverUrl = "";
  }
  return settings;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "stepkeeper:analyze" && message.type !== "stepkeeper:autopick") return false;
  (async () => {
    const settings = await loadSettings();
    if (!settings.apiKey) throw new Error(stepkeeperStrings(settings.language).errNoKey);
    if (message.type === "stepkeeper:autopick") {
      // 자동 선택은 항상 Gemini 직접 호출 — 서버 경로에는 대응 엔드포인트가 없다
      sendResponse({ ok: true, picks: await autoPickDirect(message.guides, settings) });
      return;
    }
    const analysis = settings.serverUrl
      ? await analyzeViaServer(message.payload, settings)
      : await analyzeDirect(message.payload, settings);
    sendResponse({ ok: true, analysis, language: settings.language,
                   autoPick: settings.autoPick,
                   highRisk: await detectHighRisk(analysis) });
  })().catch((error) => sendResponse({ ok: false, error: error.message }));
  return true; // async sendResponse
});
