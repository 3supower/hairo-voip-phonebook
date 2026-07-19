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

## 환경 변수

| 변수 | 기본값 | 설명 |
|---|---|---|
| `PORT` | `3000` | HTTP 서버 포트 |
| `LDAP_PORT` | `3890` | LDAP 서버 포트 |
