/* data.js 무결성 검사 — CI(.github/workflows/ci.yml) 와 로컬에서 실행
 *   node scripts/validate.mjs
 * 오류가 하나라도 있으면 exit 1.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shim = {};
new Function("window", "globalThis", readFileSync(path.join(root, "data.js"), "utf8"))(shim, shim);
const DB = shim.CAMERA_DB;

const errors = [];
const warns = [];
const E = (m) => errors.push(m);
const W = (m) => warns.push(m);

const BRANDS = ["소니","캐논","니콘","후지필름","파나소닉","OM System","라이카","시그마","펜탁스","리코"];
const TYPES = ["사진","영상","하이브리드"];
const NOW_YEAR = new Date().getFullYear();

if (!DB) {
  E("CAMERA_DB 가 정의되지 않음");
} else {
  const { fields, cameras, used, meta } = DB;

  if (!Array.isArray(fields) || fields.length !== 26) E(`fields 길이가 26이 아님 (${fields && fields.length})`);
  if (!Array.isArray(cameras)) E("cameras 가 배열이 아님");
  if (!used || typeof used !== "object") E("used 가 객체가 아님");

  const idx = Object.fromEntries(fields.map((k, i) => [k, i]));
  const ids = new Set();

  cameras.forEach((row, i) => {
    const at = (k) => row[idx[k]];
    const id = at("id");
    const tag = `[${i}] ${id || "(id 없음)"}`;

    if (row.length !== fields.length) E(`${tag}: 항목 수 ${row.length}, 기대값 ${fields.length}`);
    if (!id || !/^[a-z0-9-]+$/.test(id)) E(`${tag}: id 형식 오류`);
    if (ids.has(id)) E(`${tag}: id 중복`);
    ids.add(id);

    if (!at("name")) E(`${tag}: name 비어 있음`);
    if (!BRANDS.includes(at("brand"))) E(`${tag}: 알 수 없는 brand "${at("brand")}"`);
    if (!TYPES.includes(at("type"))) E(`${tag}: 알 수 없는 type "${at("type")}"`);

    const year = at("year"), mon = at("mon");
    if (!(year >= 2005 && year <= NOW_YEAR + 1)) E(`${tag}: year 범위 밖 (${year})`);
    if (!(mon >= 1 && mon <= 12)) E(`${tag}: mon 범위 밖 (${mon})`);

    for (const k of ["price", "mp", "iso", "batt", "weight"]) {
      const v = at(k);
      if (typeof v !== "number" || !(v > 0)) E(`${tag}: ${k} 가 양수가 아님 (${v})`);
    }
    for (const k of ["burstM", "burstE"]) {
      const v = at(k);
      if (typeof v !== "number" || v < 0) E(`${tag}: ${k} 가 음수/숫자 아님 (${v})`);
    }
    if (at("weight") > 4000) W(`${tag}: weight ${at("weight")}g — 확인 필요`);
    if (at("mp") > 110) W(`${tag}: mp ${at("mp")} — 확인 필요`);

    if (!(id in used)) W(`${tag}: 중고 시세(used) 미기입`);
  });

  Object.keys(used).forEach((k) => {
    if (!ids.has(k)) E(`used["${k}"]: 대응하는 카메라 id 없음`);
    const v = used[k];
    if (typeof v !== "number" || !(v > 0)) E(`used["${k}"]: 금액이 양수가 아님 (${v})`);
  });

  if (!meta || !/^\d{4}-\d{2}-\d{2}$/.test(meta.updated || "")) E("meta.updated 가 YYYY-MM-DD 형식이 아님");
  if (!meta || !("rates" in meta)) E("meta.rates 키가 없음 (refresh.mjs 대상)");

  // prices.js (네이버 자동 수집 가격) — 있으면 가볍게 검사
  try {
    const pShim = {};
    new Function("window", "globalThis", readFileSync(path.join(root, "prices.js"), "utf8"))(pShim, pShim);
    const P = pShim.CAMERA_PRICES || {};
    let priced = 0;
    for (const [k, v] of Object.entries(P)) {
      if (k === "_meta") continue;
      if (!ids.has(k)) E(`prices["${k}"]: 대응하는 카메라 id 없음`);
      for (const f of ["new", "used"]) {
        if (v[f] != null && !(typeof v[f] === "number" && v[f] > 0)) E(`prices["${k}"].${f} 가 양수/​null 이 아님 (${v[f]})`);
      }
      if (v.new || v.used) priced++;
    }
    console.log(`네이버 가격 ${priced}종`);
  } catch { /* prices.js 없음 — 무시 */ }

  console.log(`카메라 ${cameras.length}종 · 중고 시세 ${Object.keys(used).length}건 검사`);
}

if (warns.length) {
  console.log(`\n경고 ${warns.length}건:`);
  warns.forEach((w) => console.log("  ⚠ " + w));
}
if (errors.length) {
  console.error(`\n오류 ${errors.length}건:`);
  errors.forEach((e) => console.error("  ✗ " + e));
  process.exit(1);
}
console.log("\n✓ 이상 없음");
