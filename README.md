# SoriBaro 화면 프로토타입 (Planner Prototype)

기획자가 **백엔드/DB 없이 모든 화면을 보고**, 나아가 **AI로 직접 화면 설계를
실험**할 수 있도록 만든 가벼운 프로토타입입니다. 원본 편집기 프로젝트를 복사한 뒤
API·인증·외부 서비스 연동을 전부 가짜(mock)로 대체했습니다.

> ⚠️ 이 프로젝트는 **화면 확인·설계 실험 전용**입니다. 실제 데이터 저장/처리/전송은
> 일어나지 않습니다. 비즈니스 로직이나 실제 API 연동을 추가하지 마세요.

이 문서 하나가 프로토타입의 유일한 가이드입니다. (사람 + AI 공용)

---

## 1. 빠른 시작

```bash
npm install      # 의존성 설치 (최초 1회)
npm run dev      # 개발 서버 실행 → 브라우저에서 http://localhost:5173 열기
npm run build    # (선택) 프로덕션 빌드
```

- 실행하면 **로그인 없이** 곧바로 관리자 화면으로 진입합니다(가짜 관리자 자동 로그인).
- 좌측 사이드바 맨 위 **"🧭 화면 목록 (프로토타입)"** 을 누르면 모든 화면을
  한눈에 보고 이동할 수 있습니다. (주소: `/screens`)

---

## 2. 무엇이 진짜이고 무엇이 가짜인가

| 항목 | 상태 |
|---|---|
| 모든 화면(페이지)·레이아웃·테마·다국어 | ✅ 원본 그대로 동작 |
| 목록/상세 데이터 | 🔁 `src/mocks/` 의 가짜 샘플 데이터 |
| 로그인/권한 | 🔁 항상 관리자(`기획 관리자`)로 자동 로그인 |
| 자막 편집기(WorkTool) | 🟡 레이아웃만 렌더(미디어/파형 없음, 정적 셸) |
| AI 번역 / 음성인식(STT) / FFmpeg | ❌ 동작하지 않음(버튼은 보이나 처리 안 됨) |

**동작 원리:** 모든 네트워크 요청은 `src/mocks/mockDispatcher.js` 가 가로채 표준 응답
`{ status:'SUCCESS', data }` 를 돌려줍니다. API 클라이언트(`src/api/**/client.js`)의
`apiRequest` 가 `mockRequest` 로 위임되어 있어, 어떤 화면이 어떤 API를 부르든
백엔드 없이 가짜 데이터가 채워집니다.

---

## 3. 폴더 구조 (핵심)

```
src/
├── mocks/                    # ★ 프로토타입의 핵심 — 가짜 데이터/응답
│   ├── mockDispatcher.js     #   모든 API 요청을 가로채 가짜 응답 반환
│   └── fixtures/index.js     #   화면을 채우는 샘플 데이터(+ 가짜 관리자 MOCK_USER)
├── pages/                    # 화면(페이지) — 새 화면을 여기 추가
│   └── _prototype/           #   프로토타입 전용 화면(화면 카탈로그 ScreenIndexPage)
├── components/               # 재사용 UI 컴포넌트
│   └── layout/Sidebar.jsx    #   좌측 메뉴 (여기에 메뉴 항목 추가)
├── stores/                   # Zustand 상태 관리
├── App.jsx                   # 라우팅 정의 (여기에 새 경로 추가)
└── i18n/                     # 다국어 텍스트 (ko/en/ja/zh/hi)
```

---

## 4. AI로 화면을 설계하는 방법 (기획자용)

이 프로젝트는 AI(예: Claude Code)에게 화면 작업을 맡기기 좋게 구성돼 있습니다.
AI에게 지시할 때 아래 패턴을 참고하세요.

**1) 기존 화면 수정**
> "`src/pages/soribaro/manage/ManageWorkerPage.jsx` 화면의 표에 '등급' 컬럼을 추가해줘."

**2) 새 화면 추가**
> "`src/pages/_prototype/` 에 '대시보드 v2' 라는 새 화면을 만들고,
> `App.jsx` 라우트(`/screens-v2`)와 화면 목록(`ScreenIndexPage.jsx`)에 등록해줘.
> 데이터는 `src/mocks/fixtures/` 에 가짜 샘플을 추가해서 채워줘."

**3) 화면에 보이는 가짜 데이터 바꾸기**
> "녹취록 목록에 보이는 샘플 데이터를 더 현실적으로 바꿔줘.
> `src/mocks/fixtures/index.js` 의 `recordRows` 를 수정하면 돼."

### 새 화면 추가 절차 (AI가 따를 순서)
1. `src/pages/` (프로토타입 전용은 `src/pages/_prototype/`) 에 컴포넌트 + 같은 폴더에 `.css` 작성.
2. `src/App.jsx` 의 `<Routes>` 안에 `<Route path="..." element={...} />` 추가.
3. `src/pages/_prototype/ScreenIndexPage.jsx` 의 `SECTIONS` 에 링크 한 줄 추가.
4. (선택) `src/components/layout/Sidebar.jsx` 의 `menuData` 에 메뉴 항목 추가
   — 빠른 라벨은 `label: '리터럴'` 로 i18n 없이 바로 표시할 수 있음.

---

## 5. AI/개발 규칙 (꼭 지킬 것)

- **실제 API/DB 연동, 비즈니스 로직을 추가하지 말 것.** 데이터는 항상 `src/mocks/` 에서 온다.
- 화면을 더 그럴듯하게 채우려면 `src/mocks/fixtures/index.js` 에 샘플을 추가하고,
  필요하면 `src/mocks/mockDispatcher.js` 의 `REGISTRY` 에 경로 핸들러를 연결한다.
- 순수 **JavaScript(JSX)** 프로젝트다. `.ts`/`.tsx` 파일을 만들지 않는다.
- 함수형 컴포넌트 + React hooks 만 사용. 전역 상태는 Zustand 스토어를 쓴다.
- 스타일은 컴포넌트와 같은 폴더에 `.css` 로 둔다(co-location). 색상은 테마 CSS 변수를 쓴다.
- 사용자 대면 텍스트는 가능하면 i18next 키를 쓰되, 프로토타입 화면은 한글 리터럴도 허용.

### 네이밍
- 컴포넌트 파일: PascalCase (`SubtitleList.jsx`)
- 유틸/스토어 파일: camelCase (`timeUtils.js`, `subtitleStore.js`)
- 스토어 훅: `use[Name]Store`
- 상수: UPPER_SNAKE_CASE · CSS 변수: `--kebab-case`

---

## 6. 기술 스택

React 19 + Vite 7 · Zustand 5 · MUI 7 · AG Grid · i18next(ko/en/ja/zh/hi) · Lucide Icons
