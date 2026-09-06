/* 자동 갱신 스크립트 — .github/workflows/refresh.yml 에서 주기 실행
 *
 *  1) 환율(USD/JPY→KRW) : 무료·인증 불필요 API. data.js 의 meta.rates 갱신.
 *  2) 네이버 쇼핑 가격    : 환경변수 NAVER_CLIENT_ID / NAVER_CLIENT_SECRET 가 있을 때만.
 *                          카메라별 신품/중고 대표가를 모아 prices.js 전체를 새로 씀.
 *
 *  로컬에서 가격까지 테스트하려면:
 *    NAVER_CLIENT_ID=xxx NAVER_CLIENT_SECRET=yyy node scripts/refresh.mjs
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { fetchPrice, ping } from "./naver.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DATA_PATH = path.join(ROOT, "data.js");
const PRICES_PATH = path.join(ROOT, "prices.js");

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const today = () => new Date().toISOString().slice(0, 10);

function loadDataObject(text) {
  const shim = {};
  new Function("window", "globalThis", text)(shim, shim);
  return shim.CAMERA_DB;
}

/* ── 1. 환율 ─────────────────────────────────────────────── */
async function refreshRates(text) {
  try {
    const res = await fetch("https://open.er-api.com/v6/latest/USD", {
      headers: { "user-agent": "camera-compare-refresh" },
    });
    if (!res.ok) throw new Error("API " + res.status);
    const j = await res.json();
    if (j.result !== "success" || !j.rates?.KRW) throw new Error("형식 오류");
    const rates = {
      usdKrw: Math.round(j.rates.KRW),
      jpyKrw: j.rates.JPY ? Number((j.rates.KRW / j.rates.JPY).toFixed(2)) : null,
      asOf: (j.time_last_update_utc || new Date().toUTCString()).slice(0, 16),
      src: "open.er-api.com",
    };
    const re = /rates:\s*\{[^}]*\}/;
    if (!re.test(text)) throw new Error("data.js 에서 meta.rates 미발견");
    console.log(`환율: $1=₩${rates.usdKrw.toLocaleString()} / ¥1=₩${rates.jpyKrw}`);
    return text.replace(re, "rates: " + JSON.stringify(rates));
  } catch (e) {
    console.error("환율 갱신 실패:", e.message);
    process.exitCode = 1;
    return text;
  }
}

/* ── 2. 네이버 쇼핑 가격 ─────────────────────────────────── */
async function refreshPrices(cameras) {
  const id = process.env.NAVER_CLIENT_ID;
  const secret = process.env.NAVER_CLIENT_SECRET;
  if (!id || !secret) {
    console.log("네이버 자격증명 없음 → 가격 수집 건너뜀 (NAVER_CLIENT_ID/SECRET)");
    return null;
  }
  console.log(`네이버 자격증명 감지: ID ${id.length}자 / SECRET ${secret.length}자`);

  // 자격증명 사전 점검 — 여기서 실패하면 원인이 바로 보임
  try {
    const t = await ping({ id, secret });
    console.log(`네이버 API 연결 OK (검색 결과 ${t.total ?? "?"}건)`);
  } catch (e) {
    console.error("네이버 API 연결 실패 →", e.message);
    console.error("체크: (1) 개발자센터 developers.naver.com 에서 발급한 '검색' API 자격증명인지");
    console.error("      (2) 애플리케이션에 '검색' API 가 추가돼 있는지");
    console.error("      (3) Secret 이름/값 오타 (NAVER_CLIENT_ID / NAVER_CLIENT_SECRET)");
    process.exitCode = 1;
    return null;
  }

  const out = {};
  let ok = 0, fail = 0, nNoMatch = 0;
  for (const cam of cameras) {
    const r = await fetchPrice(cam, { id, secret });
    if (r.error) {
      fail++;
      if (fail <= 5) console.error(`  실패 ${cam.id}: ${r.error}`);
      if (/429|rate-limited/.test(r.error)) { console.error("한도 초과 — 중단"); break; }
    } else if (r.new || r.used) {
      out[cam.id] = { new: r.new, used: r.used, nNew: r.nNew, nUsed: r.nUsed };
      ok++;
    } else {
      nNoMatch++;
      if (nNoMatch <= 5) console.log(`  매칭 0 ${cam.id} (검색어: "${r.query || ""}")`);
    }
    await sleep(120); // 초당 ~8회
  }
  console.log(`네이버 가격: 수집 ${ok}종 / 매칭0 ${nNoMatch}종 / 오류 ${fail}종`);
  if (ok < cameras.length * 0.3) {
    console.error("수집률이 너무 낮음 — prices.js 갱신 생략");
    return null;
  }

  const body =
    `/* 네이버 쇼핑 검색 API 기반 자동 수집 가격. scripts/refresh.mjs 가 생성. 수동 편집 금지.\n` +
    ` * CAMERA_PRICES[id] = { new, used, nNew, nUsed }  (원, 매물 중앙값)\n */\n` +
    `(typeof window !== "undefined" ? window : globalThis).CAMERA_PRICES = ` +
    JSON.stringify(
      { _meta: { asOf: today(), source: "openapi.naver.com/v1/search/shop", note: "네이버 쇼핑 매물가 중앙값 (신품/중고)" }, ...out },
      null, 0
    ).replace(/","/g, '",\n  "') +
    ";\n";
  return body;
}

/* ── main ───────────────────────────────────────────────── */
async function main() {
  const before = await readFile(DATA_PATH, "utf8");
  const DB = loadDataObject(before);

  const after = await refreshRates(before);
  if (after !== before) await writeFile(DATA_PATH, after);

  const pricesBody = await refreshPrices(DB.cameras.map((r) => {
    const o = {}; DB.fields.forEach((k, i) => (o[k] = r[i])); return o;
  }));
  if (pricesBody) {
    await writeFile(PRICES_PATH, pricesBody);
    console.log("prices.js 갱신됨");
  }

  console.log((after !== before || pricesBody) ? "::notice::data changed" : "변경 없음");
}

main();
