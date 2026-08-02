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

console.log("PASS candidate timing window");
