# 스터디모아 (스터디카페 통합 예약·비교)

데이터베이스설계 팀 프로젝트. 시·구 평균 요금과 비교하며 스터디카페를 찾고 좌석을 예약하는 웹사이트입니다.

배포 주소: https://studycafe-tan.vercel.app (이 저장소의 `main`에 머지하면 Vercel이 자동으로 다시 배포합니다)

## 구조

| 경로 | 설명 |
|---|---|
| `public/` | 프런트엔드 (정적 사이트). `index.html`, `style.css`, `app.js`, `data.js` |
| `public/data.js` | 샘플 카페 18곳 (가상 데이터) |
| `server/index.js` | Express API (MySQL 연동, 현재 프런트는 사용하지 않음) |
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

- 현재 화면은 샘플 데이터와 브라우저 저장소로 동작합니다. 데모 계정: `demo@example.com` / `demo1234`
- `.env`(DB 비밀번호, 카카오 키)는 저장소에 올리지 마세요. `.gitignore`에 포함돼 있습니다.
- 카페 정보와 사진은 모두 가상의 샘플입니다.
