# 스터디모아 (스터디카페 통합 예약·비교)

데이터베이스설계 팀 프로젝트. 시·구 평균 요금과 비교하며 스터디카페를 찾고 좌석을 예약하는 웹사이트입니다.

배포 주소: https://studycafe-tan.vercel.app (이 저장소의 `main`에 머지하면 Vercel이 자동으로 다시 배포합니다)

## 구조

| 경로 | 설명 |
|---|---|
| `public/` | 프런트엔드 (정적 사이트). `index.html`, `style.css`, `app.js`, `data.js` |
| `public/data.js` | 샘플 카페 18곳 (가상 데이터) |
| `server/index.js` | 운영 화면의 가입·로그인·예약·좌석 조회를 처리하는 Express/MySQL API |
| `index.js`, `vercel.json` | Vercel Express 진입점과 배포 설정 |
| `test/` | 예약 충돌·장애 복구·목록 좌석 조회 회귀 테스트 (`npm test`) |
| `db/schema.sql`, `db/seed.sql` | MySQL 스키마와 더미 데이터 |
| `scripts/` | DB 초기화, 카카오 장소 수집 |

## 실행

프런트만 보기 (DB 불필요):

```
npx serve public
```

서버 + DB 포함 (MySQL 필요):

```
npm install
cp .env.example .env   # DB 접속 정보 입력
npm run db:init
npm start              # http://localhost:3000
```

## 참고

- 운영 사이트는 Vercel API와 Aiven MySQL을 사용합니다. DB 연결·환경 변수·감시 구성은 [인터넷 DB 설정](docs/HOSTED_DB.md)을 참고하세요.
- 정적 프런트만 실행하면 샘플 데이터와 브라우저 저장소 모드로 동작합니다.
- `.env`(DB 비밀번호, 카카오 키)는 저장소에 올리지 마세요. `.gitignore`에 포함돼 있습니다.
- 실제 카페의 이름·주소·위치는 카카오 장소 정보입니다. 가격·좌석 수·사진은 예시이며, 잔여석은 이 사이트에 저장된 예약을 기준으로 계산합니다.
- 운영 DB에서 `db:init -- --force`를 실행하면 기존 프로젝트 데이터가 삭제됩니다. 일반 실행·배포·복구 과정에서 초기화하지 마세요.
- 스터디카페 선별 기준과 누락 22개 지역의 확인 결과는 [카페 데이터 점검](docs/CAFE_AUDIT_20261103.md)에 기록했습니다.
- `npm test`는 DB 자격 증명 없이 실행되며, PR과 main 변경 시 GitHub Actions에서도 실행합니다. 줄바꿈은 `.gitattributes`로 LF(Windows 실행 파일은 CRLF)를 유지합니다.

## 설계 모델과 ERD

- 브라우저 뷰어: `/erd/` (개념적 ERD, 개체별 속성, 논리적 릴레이션)
- 현재 구성: 개체 13개, 관계 17개, 테이블 15개, 속성 92개, 외래키 19개, 뷰 1개
- `npm run check:model`: SQL 스키마와 ERD 문서·뷰어의 이름·타입·NULL·키 및 모델 구성을 대조합니다. 운영 DB에 접속하지 않습니다.
- 전체 관계도는 키 속성만 또는 전체 속성으로 전환하고 SVG·PNG로 저장할 수 있습니다.
