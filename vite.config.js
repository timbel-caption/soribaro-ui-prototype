import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import pkg from './package.json' with { type: 'json' }

// Health check 미들웨어 플러그인
function healthCheckPlugin() {
  return {
    name: 'health-check',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/health' || req.url === '/health/check') {
          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ status: 'ok' }))
          return
        }
        next()
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  plugins: [react(), healthCheckPlugin()],
  
  // 성능 최적화 설정
  build: {
    // 청크 분할 최적화
    rollupOptions: {
      output: {
        manualChunks: {
          // 대용량 라이브러리 분리 (병렬 로딩)
          'peaks': ['peaks.js'],
          'konva': ['konva'],
          'waveform': ['waveform-data'],
          'react-vendor': ['react', 'react-dom'],
          'grid': ['react-grid-layout'],
        },
      },
    },
    // 소스맵 비활성화 (프로덕션 빌드 속도 향상)
    sourcemap: false,
    // 청크 크기 경고 임계값
    chunkSizeWarningLimit: 1000,
    // minify 최적화
    minify: 'terser',
    terserOptions: {
      compress: {
        pure_funcs: ['console.log'], // console.log만 제거 (console.info는 유지)
        drop_debugger: true,
      },
    },
  },
  
  // 개발 서버 최적화
  server: {
    // HMR 최적화
    hmr: {
      overlay: true,
    },
    // 파일 감시 최적화
    watch: {
      usePolling: false,
    },
    // Cross-Origin Isolation 헤더 (FFmpeg.wasm SharedArrayBuffer 지원)
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
    // API 프록시 설정 (CORS 우회)
    proxy: {
      // 네이버 클라우드 STT API (단문 인식 - 더 이상 사용 안 함)
      '/api/naver-stt': {
        target: 'https://naveropenapi.apigw.ntruss.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/naver-stt/, '/recog/v1/stt'),
        headers: {
          'Origin': 'https://naveropenapi.apigw.ntruss.com',
        },
      },
      // CLOVA Speech 장문 인식 API
      '/api/clova-speech': {
        target: 'https://clovaspeech-gw.ncloud.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api\/clova-speech/, ''),
        headers: {
          'Origin': 'https://clovaspeech-gw.ncloud.com',
        },
        // 대용량 파일 업로드를 위한 타임아웃 설정 (10분)
        timeout: 600000,
        proxyTimeout: 600000,
      },
    },
  },
  
  // 의존성 사전 번들링 최적화
  optimizeDeps: {
    include: [
      'react', 
      'react-dom', 
      'peaks.js', 
      'konva', 
      'zustand',
      'react-grid-layout',
      'react-window',
      'waveform-data',
    ],
    // FFmpeg.wasm은 Web Worker를 사용하므로 사전 번들링에서 제외
    exclude: [
      '@ffmpeg/ffmpeg',
      '@ffmpeg/util',
    ],
    // esbuild 최적화
    esbuildOptions: {
      target: 'esnext',
    },
  },
  
  // Worker 지원
  worker: {
    format: 'es',
  },
})
