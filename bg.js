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
  if (response.status === 429) throw new Error("Gemini 무료 티어 한도에 도달했습니다. 잠시 후 다시 시도하세요.");
  if (!response.ok) throw new Error(`Gemini 오류 (HTTP ${response.status})`);
  const body = await response.json();
  const text = body?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Gemini 응답을 해석하지 못했습니다.");
  return normalize(JSON.parse(text));
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
    throw new Error(`stepkeeper-server 오류 (HTTP ${response.status}): ${detail.slice(0, 200)}`);
  }
  return (await response.json()).analysis;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type !== "stepkeeper:analyze") return false;
  (async () => {
    const settings = Object.assign(
      { apiKey: "", language: stepkeeperDefaultLanguage(),
        model: "gemini-flash-lite-latest", maxGuides: 5, serverUrl: "" },
      await chrome.storage.sync.get(["apiKey", "language", "model", "maxGuides", "serverUrl"]));
    if (!settings.apiKey) throw new Error("확장 설정에서 Gemini API 키를 먼저 입력하세요.");
    const analysis = settings.serverUrl
      ? await analyzeViaServer(message.payload, settings)
      : await analyzeDirect(message.payload, settings);
    sendResponse({ ok: true, analysis, language: settings.language });
  })().catch((error) => sendResponse({ ok: false, error: error.message }));
  return true; // async sendResponse
});
