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
  return normalize(await readGeminiJSON(response, settings.language));
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

async function loadSettings() {
  return Object.assign(
    { apiKey: "", language: stepkeeperDefaultLanguage(), model: "gemini-flash-lite-latest",
      maxGuides: 5, serverUrl: "", autoPick: false },
    await chrome.storage.sync.get(
      ["apiKey", "language", "model", "maxGuides", "serverUrl", "autoPick"]));
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
    sendResponse({ ok: true, analysis, language: settings.language, autoPick: settings.autoPick });
  })().catch((error) => sendResponse({ ok: false, error: error.message }));
  return true; // async sendResponse
});
