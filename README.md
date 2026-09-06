# 카메라 스펙 맞대결

미러리스·DSLR·컴팩트 카메라 두 대를 골라 스펙·출시가·중고 시세·출시연도·추정 사용자 수를 나란히 비교하는 웹 도구입니다. 국내에는 이런 한글 카메라 비교 사이트가 거의 없어서 직접 만들고 있습니다.

## 기능

- **브랜드별 선택 / 검색**: 소니·캐논·니콘·후지필름·파나소닉·OM System·라이카·시그마·펜탁스·리코, 모델명 검색
- **성격 구분**: 사진 중심 / 하이브리드 / 영상 중심 뱃지
- **비교 항목**: 유효화소, 센서 구조, 손떨림 보정, ISO, AF 측거, 연사(기계식·전자식), 최대 동영상, 뷰파인더, LCD, 카드 슬롯, 방진방적, 배터리(CIPA), 무게
- **가격**: 출시가 + 국내 중고 시세(근사치)
- **추정 사용자 수**: 기종별 대략적 추정치 (신뢰도 표기)
- 수치 비교가 가능한 항목은 유리한 쪽을 자동 강조
- 라이트/다크 테마, 모바일 대응
- 현재 **132종** 수록

## 실행

정적 사이트입니다. `data.js` 를 `fetch` 가 아니라 `<script>` 로 불러오므로 파일을 직접 열어도 동작합니다.

```bash
open index.html
# 또는 로컬 서버
python3 -m http.server 8000
```

## 데이터 검증 / 자동 갱신

```bash
node scripts/validate.mjs                                   # data.js·prices.js 무결성 검사 (CI 에서도 실행)
node scripts/refresh.mjs                                     # 환율만 갱신
NAVER_CLIENT_ID=xxx NAVER_CLIENT_SECRET=yyy node scripts/refresh.mjs   # 환율 + 네이버 쇼핑 가격
```

- `.github/workflows/ci.yml` — push·PR 마다 `validate.mjs` 실행
- `.github/workflows/refresh.yml` — 매주 월 20:17 UTC + 수동 실행. `refresh.mjs` → `validate.mjs` → 변경 시 자동 커밋

### 가격 자동 수집 (네이버 쇼핑 검색 API)

- `scripts/naver.mjs` 가 카메라별로 `GET https://openapi.naver.com/v1/search/shop.json` 호출
- 렌즈킷·액세서리 매물을 제외하고, `productType` 으로 신품/중고를 나눠 **매물가 중앙값**(극단값 제거)을 계산
- 결과는 `prices.js` 전체를 새로 써서 저장 → `index.html` 이 읽어 "신품 최저가 / 중고 시세" 로 표시
- `data.js` 의 수기 `used` 값은 네이버 매물이 없을 때 **폴백(추정)** 으로만 사용

**설정** — GitHub 저장소 `Settings → Secrets and variables → Actions → New repository secret` 에 두 개 추가:

| 이름 | 값 |
|---|---|
| `NAVER_CLIENT_ID` | 네이버 개발자센터 애플리케이션의 Client ID |
| `NAVER_CLIENT_SECRET` | 같은 애플리케이션의 Client Secret |

애플리케이션에 **검색 API** 가 추가돼 있어야 합니다. 시크릿이 없으면 가격 수집은 건너뛰고 환율만 갱신됩니다.

## 데이터에 대한 주의

- **스펙**: 공개 자료 기반 v1 근사치. 일부 값은 정확하지 않을 수 있음
- **중고 시세**: UA카메라(uacamera.co.kr) 등 중고 매장 시세 + 시장 관측 기반 근사치. 실제 거래가는 상태·구성·시점에 따라 크게 다름
- **추정 사용자 수**: 제조사가 기종별 판매량을 공식 공개하지 않아 대략적 추정치. 소니 α7 III·α6000, 후지 X100VI 등 일부만 '분기 최다 판매' 수준의 근거가 있음

## 구조

- `index.html` — 화면·스타일·비교 로직 (의존성 없는 vanilla JS)
- `data.js` — **카메라 데이터만** 분리. `window.CAMERA_DB = { meta, fields, cameras, used }`
  - `cameras` : 카메라 1대 = 배열 1줄. 순서는 `fields`에 정의
  - `used` : `{ id: 국내 중고 시세(원) }`
  - 데이터를 고칠 땐 이 파일만 수정. 나중에 자동 수집 스크립트가 이 파일을 생성하도록 설계함

## 화면 기능

- 브랜드 필터 · 모델명 검색
- 카메라 선택 시 요약 카드(성격·포맷·출시·가격) 표시
- **핵심 차이** 자동 요약 (출시연도·화소·연사·무게·중고가·사용자층 등에서 큰 차이만 뽑음)
- 비교표 **핵심 / 전체** 토글 — 기본은 핵심 항목만, 필요 시 전체 스펙
- 수치 비교 가능한 항목은 유리한 값에 ▲ 표시

## TODO

- [ ] 카메라 종류 추가
- [ ] 중고 시세 자동 수집 — 1차: GitHub Actions + `data.js` 갱신 (서버 없이)
- [ ] 스펙 데이터 정확도 검증
- [ ] 카메라 이미지 썸네일
- [ ] 3대 이상 비교
- [ ] GitHub Pages 배포
