# 인터넷 DB 설정 (Aiven MySQL + Vercel)

배포 사이트(Vercel)가 인터넷의 MySQL(Aiven 무료)을 쓰도록 하는 방법이다. 누가 접속해도 같은 DB의 가입·예약·후기를 공유한다.

## 구조

```
브라우저 ── Vercel(화면 + /api 서버 기능) ── Aiven MySQL(무료)
                                              ↑ 5분마다 GitHub Actions 가 꺼졌는지 확인하고 켠다
```

- Vercel 은 MySQL 을 호스팅하지 못하므로 DB 는 Aiven 에 둔다.
- 서버 코드(`server/`)는 Vercel 서버 기능(`index.js`)으로 그대로 동작한다. 로그인 상태는 서버에 저장하지 않고 서명된 토큰을 쓴다.
- **Aiven 무료 MySQL 은 쓰지 않으면 꺼진다(`POWEROFF`).** 그래서 `.github/workflows/aiven-mysql-watchdog.yml` 이 5분마다 확인해 켠다. 서버도 DB 가 깨어나는 동안 짧게 재시도하고, 그래도 안 되면 "DB가 깨어나는 중이에요"(503)를 돌려준다.
- 무료 플랜은 서비스 유형별 1개(1 CPU, 1GB 메모리, 1GB 디스크, 동시 접속 76개)다. 다른 프로젝트와 같은 서비스를 나눠 쓰면 안 된다.

## 1. Aiven DB 만들기

1. aiven.io 에 가입한다 (무료 플랜은 카드 불필요).
2. Create service → MySQL → Free 플랜을 만든다.
3. Overview 에서 **Service URI**(`mysql://avnadmin:비밀번호@호스트:포트/defaultdb?ssl-mode=REQUIRED`)와 **CA 인증서**(`ca.pem`)를 받는다.
4. `ca.pem` 은 `data/aiven-ca.pem` 에 저장한다. (`data/` 는 git 에 올라가지 않는다)
5. 프로젝트 폴더에 `.env.hosted` 를 만든다. (`.env.*` 는 git 에 올라가지 않는다)

```
DATABASE_URL=mysql://avnadmin:비밀번호@호스트:포트/defaultdb?ssl-mode=REQUIRED
DB_SSL_CA_FILE=data/aiven-ca.pem
DB_SKIP_CREATE=true
```

## 2. 구조와 데이터 넣기

```
ENV_FILE=.env.hosted npm run db:init -- --force
ENV_FILE=.env.hosted npm run db:import -- data/cafes-nationwide.jsonl
```

- `DB_SKIP_CREATE=true` 이면 DB 자체는 만들지 않고 기존 DB 안에서 테이블만 만든다.
- **이 프로젝트의 것이 아닌 테이블이 있으면 아무것도 지우지 않고 멈춘다.** (다른 프로젝트의 DB 를 지우는 사고를 막는다)

## 3. 꺼짐 방지 (GitHub Actions)

저장소 Settings → Secrets and variables → Actions 에 등록한다.

| 종류 | 이름 | 값 |
|---|---|---|
| Secret | `AIVEN_TOKEN` | Aiven 콘솔 → User information → Tokens 에서 만든 토큰 |
| Variable | `AIVEN_PROJECT` | `studycafe-db` |
| Variable | `AIVEN_SERVICE` | `mysql-1901e520` |

등록한 뒤 Actions → Aiven MySQL watchdog → Run workflow 를 한 번 눌러 확인한다. 토큰이나 변수가 없으면 작업이 실패하므로 세 값을 모두 등록해야 한다.

주의: 공개 저장소는 60일 동안 활동이 없으면 GitHub 가 예약 실행을 멈춘다.

## 4. Vercel 환경 변수

Vercel 프로젝트 Settings → Environment Variables (Production, Preview 모두):

| 이름 | 값 |
|---|---|
| `DATABASE_URL` | Aiven Service URI |
| `DB_SSL_CA_BASE64` | `ca.pem` 의 base64 (PowerShell: `[Convert]::ToBase64String([IO.File]::ReadAllBytes("data/aiven-ca.pem"))`) |
| `DB_POOL` | `2` (서버 기능 인스턴스당 접속 수. Aiven 무료는 동시 접속 76개) |
| `AUTH_SECRET` | 임의의 긴 문자열 (로그인 토큰 서명용. 바꾸면 모두 로그아웃된다) |

선택: `KAKAO_REST_KEY`, `NAVER_CLIENT_ID`, `NAVER_CLIENT_SECRET`(소셜 로그인), `PUBLIC_BASE_URL`(사이트 주소).

## 알아둘 점

- 인증번호는 문자가 아니라 화면에 "모의 발송"으로 표시된다. 공개 사이트에서는 누구나 아무 번호로 가입할 수 있다.
- 카카오 장소 정보(카페 이름·주소·좌표)가 공개 API 로 나간다.
- 요청 횟수 제한은 서버 기능 인스턴스별로 세는 방식이라 완벽하지 않다.

## 자동 복구 동작과 검증

- 참고: https://github.com/sm1118sm/ai-commerce-platform/blob/main/.github/workflows/aiven-mysql-watchdog.yml
- 참고 저장소처럼 5분 간격의 예약 실행을 요청하며, 한 실행에서 30초 간격으로 10번 상태를 확인한다. 실제 시작 시각은 GitHub의 실행 대기 상태에 따라 달라진다.
- POWEROFF이면 전원을 켜고 RUNNING이 될 때까지 기다린다. 작업 제한 시간은 참고 코드와 같은 15분이다.
- 서비스 상태를 확인하는 작업이며, 카페 데이터를 재수집하거나 기존 DB를 초기화하지 않는다.
- GitHub 예약 실행은 기본 브랜치에서 작동하며, 실행이 지연될 수 있어 정확한 5분 간격이나 무중단을 보장하지 않는다.
- 비밀 토큰은 코드나 문서에 적지 않고 AIVEN_TOKEN Actions secret에 저장한다. DB 접속 URI는 이 작업에 필요하지 않다.
- 수동 실행 로그에서 Check 1/10부터 Final state: RUNNING까지 확인하고, 이후 예약 실행 기록도 확인한다.
