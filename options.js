// 키를 제외한 설정은 sync에 산다. 키는 절대 sync에 넣지 않는다 (리뷰 #3):
// storage.sync는 Chrome Sync를 타고 계정의 모든 기기로 퍼지고, 암호화 보관소가 아니다.
// 기본은 storage.session(브라우저 종료 시 소멸), "이 기기에 저장" 옵트인 시 storage.local.
const FIELDS = ["language", "model", "serverUrl", "vault"];
const CHECKBOXES = ["autoPick"];   // value가 아니라 checked로 읽고 쓴다
const DEFAULTS = {
  language: stepkeeperDefaultLanguage(),
  model: "gemini-flash-lite-latest", serverUrl: "", vault: "",
  autoPick: false,   // 기본 꺼짐 — 틀린 프레임이 조용히 문서에 들어가는 게 가장 나쁜 실패다
};

/// 저장된 출력 언어(없으면 브라우저 로케일)로 화면 문구를 채운다.
function applyStrings(language) {
  const L = stepkeeperStrings(language);
  document.title = L.optTitle;
  for (const node of document.querySelectorAll("[data-i18n]")) {
    node.textContent = L[node.dataset.i18n] ?? "";
  }
  for (const node of document.querySelectorAll("[data-i18n-placeholder]")) {
    node.placeholder = L[node.dataset.i18nPlaceholder] ?? "";
  }
}

async function loadKey() {
  // sync에 남은 옛 키는 local로 옮기고 sync에서 지운다 (마이그레이션 1회)
  const legacy = await chrome.storage.sync.get("apiKey");
  if (legacy.apiKey) {
    await chrome.storage.local.set({ apiKey: legacy.apiKey });
    await chrome.storage.sync.remove("apiKey");
  }
  const session = await chrome.storage.session.get("apiKey");
  if (session.apiKey) return { apiKey: session.apiKey, remembered: false };
  const local = await chrome.storage.local.get("apiKey");
  return { apiKey: local.apiKey || "", remembered: Boolean(local.apiKey) };
}

async function saveKey(apiKey, remember) {
  if (remember) {
    await chrome.storage.local.set({ apiKey });
    await chrome.storage.session.remove("apiKey");
  } else {
    await chrome.storage.session.set({ apiKey });
    await chrome.storage.local.remove("apiKey");
  }
}

Promise.all([chrome.storage.sync.get(FIELDS.concat(CHECKBOXES)), loadKey()])
  .then(([saved, key]) => {
    for (const field of FIELDS) {
      document.getElementById(field).value = saved[field] ?? DEFAULTS[field];
    }
    for (const field of CHECKBOXES) {
      document.getElementById(field).checked = saved[field] ?? DEFAULTS[field];
    }
    document.getElementById("apiKey").value = key.apiKey;
    document.getElementById("rememberKey").checked = key.remembered;
    applyStrings(document.getElementById("language").value);
  });

// 언어를 바꾸면 저장 전에 화면이 먼저 바뀐다 — 무엇이 바뀌는지 눈으로 확인하고 저장하도록
document.getElementById("language").onchange = (event) => applyStrings(event.target.value);

document.getElementById("save").onclick = async () => {
  const L = stepkeeperStrings(document.getElementById("language").value);
  const values = {};
  for (const field of FIELDS) values[field] = document.getElementById(field).value.trim();
  for (const field of CHECKBOXES) values[field] = document.getElementById(field).checked;
  if (!values.model) values.model = DEFAULTS.model;

  // 서버 모드는 해당 origin의 host permission이 있어야 동작한다 (리뷰 #2) —
  // manifest에는 Gemini만 선언돼 있으므로 사용자가 넣은 서버는 여기서 명시적으로 요청한다.
  if (values.serverUrl) {
    let origin;
    try { origin = new URL(values.serverUrl).origin; } catch { origin = null; }
    const granted = origin
      && await chrome.permissions.request({ origins: [`${origin}/*`] });
    if (!granted) {
      values.serverUrl = "";
      document.getElementById("serverUrl").value = "";
      alert(L.optServerDenied);
    }
  }

  await chrome.storage.sync.set(values);
  await saveKey(document.getElementById("apiKey").value.trim(),
                document.getElementById("rememberKey").checked);
  document.getElementById("saved").style.display = "block";
  setTimeout(() => (document.getElementById("saved").style.display = "none"), 1500);
};
