// stepkeeper content script: 유튜브 watch 페이지에서 분석 → 프레임 캡처 → 선택 → 문서 생성.
(() => {
  "use strict";

  const SLOTS = ["before", "center", "after"];
  let panel = null;

  // ---- 유틸 ----------------------------------------------------------------
  const hms = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

  function currentVideoId() {
    return new URLSearchParams(location.search).get("v");
  }

  function getPlayer() {
    const video = document.querySelector("video.html5-main-video") || document.querySelector("video");
    if (!video || !video.videoWidth) throw new Error("플레이어를 찾지 못했습니다. 영상을 한 번 재생해 주세요.");
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
    if (analysis.category) lines.push(`**분류:** ${analysis.category}`, "");
    lines.push("**■ 준비물**" + (analysis.servings ? ` (${analysis.servings})` : ""));
    for (const m of analysis.materials || []) lines.push(`- ${m.name} ${m.amount}`);
    lines.push("", "**■ 순서**");
    const byStep = {};
    for (const g of analysis.visual_guides || []) (byStep[g.step_id] ||= []).push(g);
    for (const step of analysis.steps || []) {
      lines.push(`${step.id}. **${step.summary}**`, `   - ${step.detail}`);
      for (const guide of byStep[step.id] || []) {
        lines.push(`   - 💡 *'${guide.phrase}' 기준:* ${guide.guide_text}`);
        const pick = picks[guide.id];
        if (pick && pick !== "none") {
          lines.push(`   ![${guide.phrase}](${guide.id}.jpg)`);
        } else if (guide.best_visual_timestamp !== null) {
          lines.push(`   ▶ [영상 ${hms(guide.best_visual_timestamp)}에서 직접 확인](https://youtu.be/${vid}?t=${guide.best_visual_timestamp})`);
        }
      }
    }
    lines.push("", "---", `*출처: [${analysis.title}](https://youtu.be/${vid}) — stepkeeper로 생성*`, "");
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

    ui(`<p>영상 분석 중… (${hms(duration)}, ${profile})</p>`);
    const reply = await chrome.runtime.sendMessage({
      type: "stepkeeper:analyze",
      payload: { url: `https://www.youtube.com/watch?v=${vid}`, duration, profile },
    });
    if (!reply?.ok) { ui(`<p class="cn-err">${reply?.error || "분석 실패"}</p>`); return; }
    const analysis = reply.analysis;
    analysis._profile ||= profile;

    // 후보 프레임 캡처 (음소거·일시정지 후 원위치 복원)
    const wasPaused = video.paused, wasMuted = video.muted, t0 = video.currentTime;
    video.muted = true; video.pause();
    const steps = Object.fromEntries((analysis.steps || []).map((s) => [s.id, s]));
    const guides = (analysis.visual_guides || []).filter((g) => g.best_visual_timestamp !== null);
    const shots = {};
    try {
      for (const guide of guides) {
        ui(`<p>장면 캡처 중… ${guide.id} / ${guides.length}개</p>`);
        shots[guide.id] = {};
        const times = candidateTimes(steps[guide.step_id], guide, duration);
        for (const slot of SLOTS) shots[guide.id][slot] = await captureFrame(video, times[slot]);
      }
    } catch (error) {
      ui(`<p class="cn-err">캡처 실패: ${error.message}</p>`);
      return;
    } finally {
      video.currentTime = t0; video.muted = wasMuted;
      if (!wasPaused) video.play();
    }

    // 선택 UI
    const cards = guides.map((guide) => `
      <section class="cn-card" data-guide="${guide.id}">
        <p><b>${guide.id}</b> · ${guide.phrase}<br><small>${guide.guide_text}</small></p>
        <div class="cn-row">
          ${SLOTS.map((slot) => `
            <label><input type="radio" name="${guide.id}" value="${slot}" ${slot === "center" ? "checked" : ""}>
            <img src="${shots[guide.id][slot]}"></label>`).join("")}
          <label class="cn-none"><input type="radio" name="${guide.id}" value="none"><span>부적합<br>링크 사용</span></label>
        </div>
      </section>`).join("");
    ui(`
      <p><b>${analysis.title}</b> — 가이드별로 의미가 가장 잘 보이는 장면을 고르세요.</p>
      ${cards}
      <div class="cn-actions">
        <button id="cn-make" class="cn-primary">문서 만들기 (.md + 이미지)</button>
        <button id="cn-obsidian" class="cn-secondary">Obsidian에서 열기</button>
        <button id="cn-copy" class="cn-secondary">Notion용 복사</button>
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
      ui(`<p>완료! document.md와 선택한 이미지가 다운로드됐습니다.<br>
          같은 폴더에 두면 마크다운에서 이미지가 바로 보입니다.</p>`);
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
      ui(`<p>Obsidian에 노트를 생성했습니다 (stepkeeper 폴더).${nImages
          ? `<br>이미지 ${nImages}장은 다운로드됐습니다 — 노트가 있는 폴더로 옮기면 표시됩니다.` : ""}</p>`);
    };

    // Notion: 마크다운을 클립보드로 복사 → Notion에 붙여넣으면 서식 자동 변환.
    // 이미지는 붙여넣기로 전달되지 않으므로 모든 가이드를 타임스탬프 링크로 대체한다.
    panel.querySelector("#cn-copy").onclick = async () => {
      await navigator.clipboard.writeText(buildMarkdown(vid, analysis, {}));
      ui(`<p>복사됐습니다. Notion 페이지에서 붙여넣기(Ctrl+V)하면 서식이 그대로 변환됩니다.<br>
          장면은 유튜브 타임스탬프 링크로 들어갑니다.</p>`);
    };
  }

  // 진입 버튼
  function mountButton() {
    if (document.getElementById("stepkeeper-btn")) return;
    const button = document.createElement("button");
    button.id = "stepkeeper-btn";
    button.textContent = "📋 stepkeeper";
    button.onclick = () => run().catch((error) => ui(`<p class="cn-err">${error.message}</p>`));
    document.body.appendChild(button);
  }

  mountButton();
  // SPA 네비게이션 대응
  document.addEventListener("yt-navigate-finish", mountButton);
})();
