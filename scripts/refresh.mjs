/* data.js 자동 갱신 스크립트 — .github/workflows/refresh.yml 에서 주기 실행
 *
 * 현재 갱신 대상: 환율(USD→KRW, JPY→KRW). 무료·인증 불필요 API(open.er-api.com).
 * data.js 의 meta.rates 한 줄만 안전하게 문자열 치환한다. (파일 포맷/주석 유지)
 *
 * ── 나중에 여기에 가격 수집 provider 를 추가 ──────────────────────────
 *  아래 providers 배열에 { name, run: async () => patchObject } 를 넣으면
 *  main() 이 순서대로 실행하고 결과를 data.js 에 반영한다.
 *  단, 스크래핑 대상 사이트의 이용약관·robots.txt·봇 차단 정책을 반드시 먼저 확인할 것.
 *  (중고나라·번개장터·다나와 등은 스크래핑이 약관 위반이므로 이 저장소에서는 다루지 않음)
 */
import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const DATA_PATH = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), "data.js");

async function fetchRates() {
  const res = await fetch("https://open.er-api.com/v6/latest/USD", { headers: { "user-agent": "camera-compare-refresh" } });
  if (!res.ok) throw new Error("환율 API 응답 " + res.status);
  const j = await res.json();
  if (j.result !== "success" || !j.rates || !j.rates.KRW) throw new Error("환율 API 형식 오류");
  const usdKrw = Math.round(j.rates.KRW);
  const jpyKrw = j.rates.JPY ? Number((j.rates.KRW / j.rates.JPY).toFixed(2)) : null;
  const asOf = (j.time_last_update_utc || new Date().toUTCString()).slice(0, 16); // "Wed, 03 Sep 2026"
  return { usdKrw, jpyKrw, asOf, src: "open.er-api.com" };
}

function replaceRates(text, rates) {
  const json = JSON.stringify(rates);
  // meta.rates 는 중첩 중괄호가 없는 한 줄 객체 → [^}]* 로 안전하게 매칭
  const re = /rates:\s*\{[^}]*\}/;
  if (!re.test(text)) throw new Error("data.js 에서 meta.rates 를 찾지 못함");
  return text.replace(re, "rates: " + json);
}

async function main() {
  const before = await readFile(DATA_PATH, "utf8");
  let after = before;
  const log = [];

  try {
    const rates = await fetchRates();
    after = replaceRates(after, rates);
    log.push(`환율: USD ₩${rates.usdKrw.toLocaleString()} / JPY ₩${rates.jpyKrw} (${rates.asOf})`);
  } catch (e) {
    console.error("환율 갱신 실패:", e.message);
    process.exitCode = 1;
  }

  // 향후 provider 추가 지점:
  // for (const p of providers) { try { after = applyPatch(after, await p.run()); } catch (e) { ... } }

  if (after !== before) {
    await writeFile(DATA_PATH, after);
    console.log("data.js 갱신됨\n  " + log.join("\n  "));
    console.log("::notice::data.js changed");
  } else {
    console.log("변경 없음");
  }
}

main();
