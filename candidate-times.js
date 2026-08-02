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
  return {
    before: Math.max(0, center - spread),
    center,
    after: Math.min(last, center + spread),
  };
}
