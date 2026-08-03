#!/usr/bin/env node
const assert = require("assert");
const fs = require("fs");
const path = require("path");

eval(fs.readFileSync(path.join(__dirname, "..", "candidate-times.js"), "utf8"));

assert.deepStrictEqual(
  stepkeeperCandidateTimes(
    { t_start: 6, t_end: 15 },
    { best_visual_timestamp: 7, type: "action" },
    30,
  ),
  { before: 6, center: 7, after: 8 },
);
assert.deepStrictEqual(
  stepkeeperCandidateTimes(
    { t_start: 19, t_end: 38 },
    { best_visual_timestamp: 31, type: "state" },
    82,
  ),
  { before: 29, center: 31, after: 33 },
);
assert.deepStrictEqual(
  stepkeeperCandidateTimes(
    null,
    { best_visual_timestamp: 2, type: "state" },
    30,
  ),
  { before: 0, center: 2, after: 4 },
);

// 스텝 경계 클램프 (외부 리뷰 P2-3): 스텝이 10초에 시작하고 center=10이면
// before=9는 이전 단계의 장면이다
assert.deepStrictEqual(
  stepkeeperCandidateTimes(
    { t_start: 10, t_end: 30 },
    { best_visual_timestamp: 10, type: "state" },
    100,
  ),
  { before: 10, center: 10, after: 12 },
);
assert.deepStrictEqual(
  stepkeeperCandidateTimes(
    { t_start: 0, t_end: 20 },
    { best_visual_timestamp: 20, type: "state" },
    100,
  ),
  { before: 18, center: 20, after: 20 },
);
// center가 스텝 밖이면 스텝 정보를 불신한다 — 경계로 끌어오지 않는다
assert.deepStrictEqual(
  stepkeeperCandidateTimes(
    { t_start: 10, t_end: 20 },
    { best_visual_timestamp: 40, type: "state" },
    100,
  ),
  { before: 38, center: 40, after: 42 },
);

console.log("PASS candidate timing window");
