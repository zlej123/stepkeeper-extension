// stepkeeper content script: 유튜브 watch 페이지에서 분석 → 프레임 캡처 → 선택 → 문서 생성.
(() => {
  "use strict";

  const SLOTS = ["before", "center", "after"];
  let panel = null;
  let running = false;   // 실행 중 중복 클릭 차단 (같은 영상을 두 번 분석하면 사용량만 두 배)

  // ---- 문구 (문서·패널 모두 출력 언어를 따른다) -----------------------------
  // 코어 skill-core/profiles/<p>/template[.<lang>].md와 같은 규칙: 번역본이 있으면 그것을,
  // 없으면 영어. 문서 뼈대만 영어로 남고 UI는 한국어인 상태를 없애려고 한 표에 모았다.
  let L = stepkeeperStrings();            // 분석 응답의 language로 교체된다

  // ---- 유틸 ----------------------------------------------------------------
  const hms = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  function currentVideoId() {
    return new URLSearchParams(location.search).get("v");
  }

  function getPlayer() {
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    if (!video || !video.videoWidth) throw new Error(L.noPlayer);
    return video;
  }

  function candidateTimes(step, guide, duration) {
    const center = guide.best_visual_timestamp;
    let before, after;
    if (step) {
      before = Math.max(0, (step.t_start ?? center) - 1);
      after = Math.min(Math.max(0, duration - 1), (step.t_end ?? center) + 1);
    } else {
      before = Math.max(0, center - 4);
      after = Math.min(Math.max(0, duration - 1), center + 4);
    }
    return { before, center, after };
  }

  function seek(video, t) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`seek 시간 초과 (${t}s)`)), 8000);
      const done = () => { clearTimeout(timer); video.removeEventListener("seeked", done); resolve(); };
      video.addEventListener("seeked", done);
      video.currentTime = t;
    });
  }

  async function captureFrame(video, t) {
    await seek(video, t);
    await new Promise((r) => setTimeout(r, 150)); // 렌더 안정화
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.85);
  }

  function download(name, content, mime) {
    const anchor = document.createElement("a");
    anchor.href = content.startsWith("data:") ? content
      : URL.createObjectURL(new Blob([content], { type: mime || "text/markdown" }));
    anchor.download = name;
    anchor.click();
  }

  // ---- 마크다운 조립 (skill-core template.md와 동일한 출력 형태) ------------
  function buildMarkdown(vid, analysis, picks) {
    const lines = [];
    const icon = analysis._profile === "recipe" ? "🍳" : "📋";
    lines.push(`## ${icon} ${analysis.title}`, "", analysis.summary || "", "");
    if (analysis.category) lines.push(`**${L.category}:** ${analysis.category}`, "");
    lines.push(`**■ ${analysis._profile === "recipe" ? L.ingredients : L.materials}**`
      + (analysis.servings ? ` (${analysis.servings})` : ""));
    for (const m of analysis.materials || []) lines.push(`- ${m.name} ${m.amount}`);
    lines.push("", `**■ ${L.steps}**`);
    const byStep = {};
    for (const g of analysis.visual_guides || []) (byStep[g.step_id] ||= []).push(g);
    for (const step of analysis.steps || []) {
      lines.push(`${step.id}. **${step.summary}**`, `   - ${step.detail}`);
      for (const guide of byStep[step.id] || []) {
        lines.push(`   - 💡 *${L.guide(guide.phrase)}* ${guide.guide_text}`);
        const pick = picks[guide.id];
        if (pick && pick !== "none") {
          lines.push(`   ![${guide.phrase}](${guide.id}.jpg)`);
        } else if (guide.best_visual_timestamp !== null) {
          lines.push(`   ▶ [${L.seeAt(hms(guide.best_visual_timestamp))}](https://youtu.be/${vid}?t=${guide.best_visual_timestamp})`);
        }
      }
    }
    lines.push("", "---", L.source(analysis.title, `https://youtu.be/${vid}`), "");
    return lines.join("\n");
  }

  // ---- UI -------------------------------------------------------------------
  function ui(html) {
    if (!panel) {
      panel = document.createElement("div");
      panel.id = "stepkeeper-panel";
      document.body.appendChild(panel);
    }
    panel.innerHTML = `<div class="cn-head"><b>stepkeeper</b><button id="cn-close">✕</button></div>${html}`;
    panel.querySelector("#cn-close").onclick = () => panel.remove() || (panel = null);
  }

  async function run() {
    const vid = currentVideoId();
    if (!vid) return;
    let video;
    try { video = getPlayer(); } catch (error) { ui(`<p class="cn-err">${error.message}</p>`); return; }
    const duration = Math.floor(video.duration);
    const profile = /레시피|요리|recipe|cook/i.test(document.title) ? "recipe" : "generic";

    ui(`<p>${L.analyzing(hms(duration), profile)}</p>`);
    const reply = await chrome.runtime.sendMessage({
      type: "stepkeeper:analyze",
      payload: { url: `https://www.youtube.com/watch?v=${vid}`, duration, profile },
    });
    if (!reply?.ok) { ui(`<p class="cn-err">${reply?.error || L.analyzeFailed}</p>`); return; }
    const analysis = reply.analysis;
    analysis._profile ||= profile;
    // 분석 응답이 알려준 출력 언어로 패널·문서 문구를 맞춘다 (설정의 language)
    L = stepkeeperStrings(reply.language || analysis._output_language);

    // 후보 프레임 캡처 (음소거·일시정지 후 원위치 복원)
    const wasPaused = video.paused, wasMuted = video.muted, t0 = video.currentTime;
    video.muted = true; video.pause();
    const steps = Object.fromEntries((analysis.steps || []).map((s) => [s.id, s]));
    const guides = (analysis.visual_guides || []).filter((g) => g.best_visual_timestamp !== null);
    const shots = {};
    try {
      for (const guide of guides) {
        ui(`<p>${L.capturing(guide.id, guides.length)}</p>`);
        shots[guide.id] = {};
        const times = candidateTimes(steps[guide.step_id], guide, duration);
        for (const slot of SLOTS) shots[guide.id][slot] = await captureFrame(video, times[slot]);
      }
    } catch (error) {
      ui(`<p class="cn-err">${L.captureFailed(error.message)}</p>`);
      return;
    } finally {
      video.currentTime = t0; video.muted = wasMuted;
      if (!wasPaused) video.play();
    }

    // AI 자동 선택 (옵션 켬) — 픽커를 건너뛰지 않고 "미리 선택"만 한다 (코어·앱과 동일)
    let aiPicks = {}, aiNotice = null;
    if (reply.autoPick) {
      ui(`<p>${L.autoPicking}</p>`);
      const answer = await chrome.runtime.sendMessage({
        type: "stepkeeper:autopick",
        guides: guides.map((guide) => ({
          id: guide.id, phrase: guide.phrase, what_to_show: guide.what_to_show,
          guide_text: guide.guide_text,
          candidates: SLOTS.map((slot) => ({
            slot, data: shots[guide.id][slot].split(",")[1],   // dataURL → base64 본문
          })),
        })),
      });
      if (answer?.ok) aiPicks = answer.picks || {};
      else aiNotice = answer?.error || L.autoPickFailed;
    }
    const checkedSlot = (guideId) => aiPicks[guideId]?.slot || "center";

    // 선택 UI
    const cards = guides.map((guide) => `
      <section class="cn-card" data-guide="${guide.id}">
        <p><b>${guide.id}</b> · ${guide.phrase}<br><small>${guide.guide_text}</small>${
          aiPicks[guide.id]?.reason ? `<br><small class="cn-ai">✨ ${aiPicks[guide.id].reason}</small>` : ""}</p>
        <div class="cn-row">
          ${SLOTS.map((slot) => `
            <label><input type="radio" name="${guide.id}" value="${slot}" ${slot === checkedSlot(guide.id) ? "checked" : ""}>
            <img src="${shots[guide.id][slot]}"></label>`).join("")}
          <label class="cn-none"><input type="radio" name="${guide.id}" value="none" ${checkedSlot(guide.id) === "none" ? "checked" : ""}><span>${L.unfit}</span></label>
        </div>
      </section>`).join("");
    ui(`
      <p><b>${analysis.title}</b> — ${L.pickPrompt}</p>
      ${Object.keys(aiPicks).length ? `<p class="cn-ai">✨ ${L.autoPicked}</p>` : ""}
      ${aiNotice ? `<p class="cn-err">${aiNotice}</p>` : ""}
      ${cards}
      <div class="cn-actions">
        <button id="cn-make" class="cn-primary">${L.makeDoc}</button>
        <button id="cn-obsidian" class="cn-secondary">${L.openObsidian}</button>
        <button id="cn-copy" class="cn-secondary">${L.copyNotion}</button>
      </div>`);

    const collectPicks = () => {
      const picks = {};
      for (const guide of guides) {
        picks[guide.id] = panel.querySelector(`input[name="${guide.id}"]:checked`)?.value || "none";
      }
      return picks;
    };
    const downloadImages = (picks) => {
      for (const [guideId, slot] of Object.entries(picks)) {
        if (slot !== "none") download(`${guideId}.jpg`, shots[guideId][slot]);
      }
    };

    panel.querySelector("#cn-make").onclick = () => {
      const picks = collectPicks();
      download("document.md", buildMarkdown(vid, analysis, picks));
      downloadImages(picks);
      ui(`<p>${L.done}</p>`);
    };

    // Obsidian: obsidian://new URI로 노트 즉시 생성 (API 키 불필요).
    // 이미지는 URI로 전달할 수 없어 함께 다운로드하고, 노트 폴더에 넣으면 표시된다.
    panel.querySelector("#cn-obsidian").onclick = async () => {
      const picks = collectPicks();
      const { vault } = await chrome.storage.sync.get("vault");
      const name = "stepkeeper/" + analysis.title.replace(/[\\/:*?"<>|#^\[\]]/g, " ").trim();
      const uri = "obsidian://new?" +
        (vault ? `vault=${encodeURIComponent(vault)}&` : "") +
        `file=${encodeURIComponent(name)}&content=${encodeURIComponent(buildMarkdown(vid, analysis, picks))}`;
      const anchor = document.createElement("a");
      anchor.href = uri;
      anchor.click();
      const nImages = Object.values(picks).filter((s) => s !== "none").length;
      downloadImages(picks);
      ui(`<p>${L.obsidianDone(nImages ? L.obsidianImages(nImages) : "")}</p>`);
    };

    // Notion: 마크다운을 클립보드로 복사 → Notion에 붙여넣으면 서식 자동 변환.
    // 이미지는 붙여넣기로 전달되지 않으므로 모든 가이드를 타임스탬프 링크로 대체한다.
    panel.querySelector("#cn-copy").onclick = async () => {
      await navigator.clipboard.writeText(buildMarkdown(vid, analysis, {}));
      ui(`<p>${L.copied}</p>`);
    };
  }

  /// 버튼 상태 — 클릭 즉시 눈에 보이게 바꾼다. 피드백이 없으면 사용자가 다시 누르고,
  /// 그때마다 분석이 한 번 더 돌아 무료 티어 사용량만 배로 나간다.
  function setButtonBusy(busy) {
    const button = document.getElementById("stepkeeper-btn");
    if (!button) return;
    button.disabled = busy;
    button.textContent = busy ? `⏳ ${L.working}` : "📋 stepkeeper";
  }

  // 진입 버튼
  function mountButton() {
    if (document.getElementById("stepkeeper-btn")) return;
    const button = document.createElement("button");
    button.id = "stepkeeper-btn";
    button.textContent = "📋 stepkeeper";
    button.onclick = async () => {
      if (running) return;
      running = true;
      setButtonBusy(true);
      ui(`<p>${L.starting}</p>`);   // await 이전에 패널부터 띄운다 (클릭이 먹혔다는 신호)
      try {
        await run();
      } catch (error) {
        ui(`<p class="cn-err">${error.message}</p>`);
      } finally {
        running = false;
        setButtonBusy(false);
      }
    };
    document.body.appendChild(button);
  }

  mountButton();
  // SPA 네비게이션 대응
  document.addEventListener("yt-navigate-finish", mountButton);
})();
