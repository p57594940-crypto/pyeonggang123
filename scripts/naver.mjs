/* 네이버 검색 API(쇼핑) 기반 가격 수집
 *   문서: https://developers.naver.com/docs/serviceapi/search/shopping/shopping.md
 *   - 엔드포인트: GET https://openapi.naver.com/v1/search/shop.json
 *   - 인증 헤더: X-Naver-Client-Id / X-Naver-Client-Secret  (검색 API 애플리케이션에서 발급)
 *   - 일일 한도: 25,000회. (이 스크립트는 카메라 1종당 1회 → 주 1회 실행 시 여유)
 *
 * productType (신품/중고 구분):
 *   1,2,3   = 일반(신품) 상품
 *   4,5,6   = 중고 상품
 *   7,8,9   = 단종 상품 (신품가로 간주하되 참고용)
 *   10~12   = 판매예정
 *   ※ 코드 의미는 네이버 공식 문서 기준. 응답이 예상과 다르면 위 문서로 재확인할 것.
 */

const ENDPOINT = "https://openapi.naver.com/v1/search/shop.json";

// 바디가 아닌 매물(렌즈킷·액세서리·수리 등) 걸러내기
const EXCLUDE = /(렌즈\s*킷|렌즈킷|kit|번들|세트상품|악세|액세서리|배터리|충전기|어댑터|스트랩|가방|케이스|파우치|보호필름|스킨|그립|삼각대|짐벌|리그|케이지|셔터막|as비용|수리|정비|호환|더미|모형)/i;
const STRIP_TAGS = /<\/?b>/g;

function clean(s) { return String(s || "").replace(STRIP_TAGS, "").trim(); }

// 카메라 → 검색어. α(알파) 표기는 네이버에서 잘 안 걸리므로 A 로 치환.
export function queryFor(cam) {
  let q = cam.name.replace(/α/g, "A").replace(/\s+/g, " ").trim();
  const ilc = !/고정/.test(cam.mount) && cam.body !== "컴팩트" && cam.body !== "레인지파인더";
  return ilc ? q + " 바디" : q;
}

// 중앙값
function median(nums) {
  if (!nums.length) return null;
  const s = [...nums].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
}

// 극단값 제거 후 중앙값 (중앙값의 40%~220% 범위만 채택)
function robustMedian(prices) {
  if (prices.length < 2) return prices.length ? prices[0] : null;
  const m0 = median(prices);
  const kept = prices.filter((p) => p >= m0 * 0.4 && p <= m0 * 2.2);
  return median(kept.length ? kept : prices);
}

async function callApi(query, { id, secret }) {
  const url = `${ENDPOINT}?query=${encodeURIComponent(query)}&display=100&sort=sim`;
  const res = await fetch(url, {
    headers: { "X-Naver-Client-Id": id, "X-Naver-Client-Secret": secret },
  });
  if (res.status === 429) throw new Error("rate-limited (429)");
  if (!res.ok) {
    let body = "";
    try { body = (await res.text()).slice(0, 300); } catch { /* ignore */ }
    throw new Error(`HTTP ${res.status} — ${body}`);
  }
  return res.json();
}

// 자격증명 점검용 단발 호출 (진단)
export async function ping(creds) {
  return callApi("소니 A7", creds);
}

/** 카메라 1종의 신품/중고 대표가를 반환. 실패 시 null 필드. */
export async function fetchPrice(cam, creds) {
  const query = queryFor(cam);
  let j;
  try {
    j = await callApi(query, creds);
  } catch (e) {
    return { id: cam.id, query, error: e.message, new: null, used: null, nNew: 0, nUsed: 0 };
  }
  const items = Array.isArray(j.items) ? j.items : [];
  const newP = [], usedP = [];
  for (const it of items) {
    const title = clean(it.title);
    if (EXCLUDE.test(title)) continue;
    const price = Number(it.lprice);
    if (!(price > 100000)) continue;               // 카메라 바디 하한 (액세서리·오류 제거)
    if (price > 30000000) continue;                 // 상한 (중형·라이카 최고가 고려)
    const t = Number(it.productType);
    if (t >= 4 && t <= 6) usedP.push(price);
    else if (t >= 1 && t <= 3) newP.push(price);
    else if (t >= 7 && t <= 9) newP.push(price);    // 단종 상품도 신품가에 포함
  }
  return {
    id: cam.id,
    query,
    new: robustMedian(newP),
    used: robustMedian(usedP),
    nNew: newP.length,
    nUsed: usedP.length,
    nItems: items.length,
  };
}
