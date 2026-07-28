// 문서 마크다운 조립 — 코어 skill-core template[.<lang>].md와 같은 출력 형태.
// tests/parity.js가 코어가 생성한 골든(expected.md)과 바이트 대조한다 (외부 리뷰 #6):
// 세 클라이언트가 알고리즘을 손으로 복사하는 대신, 코어를 canonical로 두고 드리프트를 잡는다.

const stepkeeperHms = (sec) => `${Math.floor(sec / 60)}:${String(sec % 60).padStart(2, "0")}`;

function stepkeeperBuildMarkdown(vid, analysis, picks, L) {
  const lines = [];
  const icon = analysis._profile === "recipe" ? "🍳" : "📋";
  lines.push(`## ${icon} ${analysis.title}`, "", analysis.summary || "", "");
  // 코어 파리티: category 블록은 generic 템플릿에만 있고, falsy여도 빈 줄로 남는다
  // (템플릿의 인라인 섹션 렌더 결과 — recipe 템플릿에는 이 줄 자체가 없다)
  if (analysis._profile !== "recipe") {
    lines.push(analysis.category ? `**${L.category}:** ${analysis.category}` : "", "");
  }
  lines.push(`**■ ${analysis._profile === "recipe" ? L.ingredients : L.materials}**`
    + (analysis.servings ? ` (${analysis.servings})` : ""));
  for (const m of analysis.materials || []) lines.push(`- ${m.name} ${m.amount}`);
  // 코어 파리티: 요리 프로파일의 순서 제목은 ko("조리 순서")·ja("作り方") 템플릿에서만 다르다
  lines.push("", `**■ ${analysis._profile === "recipe" ? L.stepsRecipe : L.steps}**`);
  const byStep = {};
  for (const g of analysis.visual_guides || []) (byStep[g.step_id] ||= []).push(g);
  for (const step of analysis.steps || []) {
    lines.push(`${step.id}. **${step.summary}**`, `   - ${step.detail}`);
    for (const guide of byStep[step.id] || []) {
      lines.push(`   - 💡 *${L.guide(guide.phrase)}* ${guide.guide_text}`);
      const pick = picks[guide.id];
      if (pick && pick !== "none") {
        lines.push(`   ![${guide.phrase}](${guide.id}.jpg)`);
      } else {
        // 코어 파리티: timestamp가 null이어도 링크 줄은 낸다 (시각 없는 영상 링크 폴백)
        const ts = guide.best_visual_timestamp;
        const label = L.seeAt(ts !== null && ts !== undefined ? stepkeeperHms(ts) : "");
        const url = ts !== null && ts !== undefined
          ? `https://youtu.be/${vid}?t=${ts}` : `https://youtu.be/${vid}`;
        lines.push(`   ▶ [${label}](${url})`);
      }
    }
  }
  lines.push("", "---", L.source(analysis.title, `https://youtu.be/${vid}`), "");
  return lines.join("\n");
}

