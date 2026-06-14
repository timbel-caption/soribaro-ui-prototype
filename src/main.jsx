import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './i18n'
import './index.css'
import App from './App.jsx'

// [프로토타입] 백엔드 없는 화면 프로토타입 — 항상 목 관리자 계정으로 자동 로그인된다.
// 이전 세션의 로그아웃 플래그가 남아 있으면 인증 흐름이 막히므로 시작 시 제거한다.
localStorage.removeItem('loggedOut')

// 환경변수 로드 확인 (최초 실행 시 1회)
const logEnvVariables = () => {
  const mode = import.meta.env.MODE
  const maskKey = (key) => key ? `${key.slice(0, 8)}...${key.slice(-4)}` : '(not set)'
  
  console.info(`🔧 Environment: ${mode.toUpperCase()}`)
  console.info('API URLs:')
  console.info('  VITE_API_URL:', import.meta.env.VITE_API_URL || '(not set)')
  console.info('  VITE_V8_API_URL:', import.meta.env.VITE_V8_API_URL || '(not set)')
  console.info('  VITE_V9_API_URL:', import.meta.env.VITE_V9_API_URL || '(not set)')
  console.info('API Keys (masked):')
  console.info('  VITE_CLAUDE_API_KEY:', maskKey(import.meta.env.VITE_CLAUDE_API_KEY))
  console.info('  VITE_GEMINI_API_KEY:', maskKey(import.meta.env.VITE_GEMINI_API_KEY))
  console.info('  VITE_OPENAI_API_KEY:', maskKey(import.meta.env.VITE_OPENAI_API_KEY))
  console.info('  VITE_CLOVA_SECRET_KEY:', maskKey(import.meta.env.VITE_CLOVA_SECRET_KEY))
  console.info('  VITE_ELEVENLABS_API_KEY:', maskKey(import.meta.env.VITE_ELEVENLABS_API_KEY))
  console.info('Auth: cookie-based')
}

logEnvVariables()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
