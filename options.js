const FIELDS = ["apiKey", "language", "model", "serverUrl", "vault"];
const DEFAULTS = {
  apiKey: "", language: stepkeeperDefaultLanguage(),
  model: "gemini-flash-lite-latest", serverUrl: "", vault: "",
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

chrome.storage.sync.get(FIELDS).then((saved) => {
  for (const field of FIELDS) {
    document.getElementById(field).value = saved[field] ?? DEFAULTS[field];
  }
  applyStrings(document.getElementById("language").value);
});

// 언어를 바꾸면 저장 전에 화면이 먼저 바뀐다 — 무엇이 바뀌는지 눈으로 확인하고 저장하도록
document.getElementById("language").onchange = (event) => applyStrings(event.target.value);

document.getElementById("save").onclick = async () => {
  const values = {};
  for (const field of FIELDS) values[field] = document.getElementById(field).value.trim();
  if (!values.model) values.model = DEFAULTS.model;
  await chrome.storage.sync.set(values);
  document.getElementById("saved").style.display = "block";
  setTimeout(() => (document.getElementById("saved").style.display = "none"), 1500);
};
