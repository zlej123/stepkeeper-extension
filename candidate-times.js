// Candidate-frame timing shared with the core and Apple app.
// Action guides stay within ±1 second; other guide types use at most ±2 seconds.
function stepkeeperCandidateTimes(step, guide, duration) {
  const center = guide.best_visual_timestamp;
  const last = Math.max(0, duration - 1);
  const limit = guide.type === "action" ? 1 : 2;
  const length = step
    ? Math.max(0, (step.t_end ?? center) - (step.t_start ?? center)) : null;
  const spread = length === null
    ? limit
    : Math.max(1, Math.min(limit, Math.floor(length / 4)));
  let before = Math.max(0, center - spread);
  let after = Math.min(last, center + spread);
  // 후보가 스텝 경계를 넘으면 이전/다음 단계의 장면이 들어온다 (외부 리뷰 P2-3).
  // 단 center가 스텝 밖이면 스텝 정보를 불신하고 클램프하지 않는다 — 코어와 동일.
  if (step && step.t_start != null && step.t_end != null
      && step.t_start <= center && center <= step.t_end) {
    before = Math.max(before, step.t_start);
    after = Math.min(after, step.t_end);
  }
  return { before, center, after };
}
