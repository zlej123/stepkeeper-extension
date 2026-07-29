#!/usr/bin/env node
// cross-client 골든 파리티 (외부 리뷰 #6): doc.js의 마크다운 조립이 코어 render.py 출력과
// 바이트 단위로 같은지 검사한다. 골든은 stepkeeper-apple/Tests/Fixtures/golden/ —
// scripts/make-golden.py가 코어로 생성한 기대 출력을 그대로 재사용한다.
//
// 사용: node tests/parity.js [골든 디렉토리]
const fs = require("fs");
const path = require("path");

global.TextEncoder = require("util").TextEncoder;
eval(fs.readFileSync(path.join(__dirname, "..", "i18n.js"), "utf8"));
eval(fs.readFileSync(path.join(__dirname, "..", "doc.js"), "utf8"));

const goldenRoot = process.argv[2]
  || path.join(__dirname, "..", "..", "stepkeeper-apple", "Tests", "Fixtures", "golden");
if (!fs.existsSync(goldenRoot)) {
  console.error("골든 디렉토리 없음:", goldenRoot);
  process.exit(2);
}

let failed = 0;
const cases = fs.readdirSync(goldenRoot).filter((name) =>
  fs.existsSync(path.join(goldenRoot, name, "expected.md")));
if (!cases.length) {
  console.error("골든 케이스 0개 — 아무것도 검증되지 않았으므로 실패");   // fail-closed
  process.exit(1);
}
for (const name of cases) {
  const dir = path.join(goldenRoot, name);
  const analysis = JSON.parse(fs.readFileSync(path.join(dir, "analysis.json"), "utf8"));
  const caseSpec = JSON.parse(fs.readFileSync(path.join(dir, "case.json"), "utf8"));
  const expected = fs.readFileSync(path.join(dir, "expected.md"), "utf8");
  // 코어의 image_refs(guide→파일명)를 확장의 picks(guide→슬롯)로 — 값은 아무 비-none이면 된다
  const picks = {};
  for (const guideId of Object.keys(caseSpec.image_refs || {})) picks[guideId] = "center";
  const L = stepkeeperStrings(analysis._output_language);
  // 고위험 감지도 파리티 대상 — bg.js와 같은 자산으로 같은 판정
  const riskAsset = JSON.parse(fs.readFileSync(
    path.join(__dirname, "..", "assets", "skill-core", "engine", "highrisk.json"), "utf8"));
  const blob = [analysis.title, analysis.category, analysis.summary]
    .filter(Boolean).join(" ").toLowerCase();
  const highRisk = riskAsset.keywords.some((kw) => blob.includes(kw.toLowerCase()));
  const actual = stepkeeperBuildMarkdown(caseSpec.video_id, analysis, picks, L, highRisk);
  if (actual === expected) {
    console.log("PASS", name);
  } else {
    failed++;
    console.log("FAIL", name);
    const a = actual.split("\n"), e = expected.split("\n");
    for (let i = 0; i < Math.max(a.length, e.length); i++) {
      if (a[i] !== e[i]) {
        console.log(`  줄 ${i + 1} 기대: ${JSON.stringify(e[i])}`);
        console.log(`  줄 ${i + 1} 실제: ${JSON.stringify(a[i])}`);
      }
    }
  }
}
process.exit(failed ? 1 : 0);
