# VoIP Phonebook Server

Google Contacts를 IP 폰용 전화번호부로 서빙하는 Express 서버입니다.

- **XML 다운로드** (`:3000`) — Grandstream/Yealink용 XML 전화번호부 생성
- **LDAP 서버** (`:3890`) — GRP2624 등 검색 기반 조회를 지원하는 폰용. 연락처가 많아 XML 다운로드 한도(2,000개)를 넘는 경우 사용

연락처는 Google People API에서 가져와 30분 캐싱합니다.

## 준비물

`src/` 아래에 Google OAuth 크리덴셜 파일이 필요합니다 (git에는 포함되지 않음):

- `src/credentials.json` — Google Cloud Console에서 발급받은 OAuth 클라이언트 정보
- `src/token.json` — 최초 실행 시 인증 후 자동 생성됨

## 로컬 실행

```bash
npm install
npm start
```

## Docker로 실행

```bash
docker compose up -d --build
```

재배포도 동일한 명령 한 줄이면 됩니다.

## Windows 서버 실행

`start-server.bat`을 `D:\voip-phonebook`에 두고 더블클릭 (또는 바탕화면 숏컷). `node_modules`가 없으면 자동으로 `npm install` 후 서버를 기동합니다.

## 엔드포인트

| URL | 설명 |
|---|---|
| `GET /generate-phonebook/phonebook.xml` | Grandstream용 XML 전화번호부 |
| `GET /generate-phonebook/remote-phonebook.xml` | Yealink Remote Phonebook용 XML |
| LDAP `ldap://<host>:3890`, base DN `dc=contacts,dc=local` | 검색 기반 조회 (anonymous bind) |

## 실시간 조회 화면 (`/live`)

폰이 LDAP으로 조회할 때마다 서버 PC 브라우저에 실시간으로 표시됩니다. 서버 PC에서 `http://localhost:3000/live`를 열어 두세요 (`start-server.bat`은 서버 시작 시 자동으로 엽니다).

- 번호 조회(수신 전화)는 큰 카드로, 이름 검색은 목록에 표시됩니다. 연락처에 없는 번호는 주황색으로 표시됩니다.
- 같은 번호가 여러 폰에서 15초 안에 조회되면 한 건으로 합쳐집니다.
- **알림 켜기**를 누르면 새 번호 조회 때 소리가 나고, 브라우저가 백그라운드일 때는 데스크톱 알림이 뜹니다. 소리는 브라우저 정책상 페이지를 새로고침한 뒤 한 번 클릭해야 다시 활성화됩니다.
- 기본적으로 서버 PC(localhost)에서만 열립니다. 다른 기기에서 보려면 `LIVE_ALLOW_LAN=1`을 설정하세요. 이름과 번호가 노출되므로 신뢰할 수 있는 네트워크에서만 사용하세요.
- 터미널 로그도 한 줄 요약으로 출력됩니다. 원본 LDAP 필터를 보려면 `LDAP_DEBUG=1`.

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | HTTP 서버 포트 |
| `LDAP_PORT` | `3890` | LDAP 서버 포트 |
| `LIVE_ALLOW_LAN` | (꺼짐) | `1`이면 `/live`를 다른 기기에서도 열 수 있음 |
| `PHONE_LABELS` | (없음) | 폰 IP에 이름 붙이기. 예: `192.168.0.101=접수,192.168.0.103=원장실` |
| `LDAP_DEBUG` | (꺼짐) | `1`이면 원본 LDAP 필터를 로그에 출력 |
