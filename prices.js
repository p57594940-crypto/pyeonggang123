/* 네이버 쇼핑 검색 API 기반 자동 수집 가격.
 * scripts/refresh.mjs 가 실행될 때마다 이 파일 전체를 새로 씁니다. 수동 편집 금지.
 *
 *   CAMERA_PRICES[id] = {
 *     new  : 신품 최저가 매물의 중앙값 (원) | null,
 *     used : 중고 매물의 중앙값 (원) | null,
 *     nNew, nUsed : 집계에 쓴 매물 수,
 *   }
 *   _meta.asOf : 수집 시각 (UTC 날짜)
 *
 * 아직 한 번도 수집되지 않았으면 빈 상태입니다. (GitHub Actions "데이터 자동 갱신" 실행 필요)
 */
(typeof window !== "undefined" ? window : globalThis).CAMERA_PRICES = {
  _meta: { asOf: null, source: "openapi.naver.com/v1/search/shop", note: "네이버 쇼핑 매물가 중앙값 (신품/중고)" }
};
