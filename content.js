// stepkeeper content script: 유튜브 watch 페이지에서 분석 → 프레임 캡처 → 선택 → 문서 생성.
(() => {
  "use strict";

  const SLOTS = ["before", "center", "after"];
  let panel = null;

  // ---- 문구 (문서·패널 모두 출력 언어를 따른다) -----------------------------
  // 코어 skill-core/profiles/<p>/template[.<lang>].md와 같은 규칙: 번역본이 있으면 그것을,
  // 없으면 영어. 문서 뼈대만 영어로 남고 UI는 한국어인 상태를 없애려고 한 표에 모았다.
  const STRINGS = {
    en: {
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
  };
  let L = STRINGS.en;                       // 분석 응답의 language로 교체된다
  const strings = (language) => STRINGS[language] || STRINGS.en;

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
    L = strings(reply.language || analysis._output_language);

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

    // 선택 UI
    const cards = guides.map((guide) => `
      <section class="cn-card" data-guide="${guide.id}">
        <p><b>${guide.id}</b> · ${guide.phrase}<br><small>${guide.guide_text}</small></p>
        <div class="cn-row">
          ${SLOTS.map((slot) => `
            <label><input type="radio" name="${guide.id}" value="${slot}" ${slot === "center" ? "checked" : ""}>
            <img src="${shots[guide.id][slot]}"></label>`).join("")}
          <label class="cn-none"><input type="radio" name="${guide.id}" value="none"><span>${L.unfit}</span></label>
        </div>
      </section>`).join("");
    ui(`
      <p><b>${analysis.title}</b> — ${L.pickPrompt}</p>
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
