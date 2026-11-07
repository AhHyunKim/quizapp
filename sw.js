// sw.js
// 오프라인 학습용 서비스워커.
// - 앱 셸(HTML/CSS/JS/아이콘)과 CDN 자산(KaTeX/DOMPurify/폰트)은 cache-first.
// - 문제 데이터(시트 CSV, data/*.csv)는 network-first → 실패하면 마지막으로 받은 응답.
// 앱 파일을 수정해 배포할 때는 CACHE_VERSION 을 올려야 사용자에게 새 파일이 반영된다.

const CACHE_VERSION = 'v2';
const SHELL_CACHE = `quiz-shell-${CACHE_VERSION}`;
const DATA_CACHE = `quiz-data-${CACHE_VERSION}`;

const SHELL_FILES = [
  './',
  'index.html',
  'manifest.webmanifest',
  'css/style.css',
  'img/icon-192.png',
  'img/icon-512.png',
  'js/app.js',
  'js/state.js',
  'js/dataLoader.js',
  'js/dataLoading.js',
  'js/questionNormalizer.js',
  'js/menuBuilder.js',
  'js/quizEngine.js',
  'js/statsManager.js',
  'js/storageManager.js',
  'js/reviewScheduler.js',
  'js/ui/dom.js',
  'js/ui/icons.js',
  'js/ui/quizView.js',
  'js/ui/sidebarView.js',
  'js/ui/statsView.js',
  'js/ui/settingsView.js',
  'js/ui/mockView.js',
];

// 미리 받아 두면 좋은 외부 자산 (하나가 실패해도 설치는 계속한다)
const CDN_FILES = [
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.css',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/katex.min.js',
  'https://cdn.jsdelivr.net/npm/katex@0.16.11/dist/contrib/auto-render.min.js',
  'https://cdn.jsdelivr.net/npm/dompurify@3.1.6/dist/purify.min.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(SHELL_CACHE);
    await cache.addAll(SHELL_FILES);
    await Promise.all(CDN_FILES.map((url) => cache.add(new Request(url, { mode: 'cors', credentials: 'omit' })).catch(() => {})));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const keep = new Set([SHELL_CACHE, DATA_CACHE]);
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith('quiz-') && !keep.has(n)).map((n) => caches.delete(n)));
    await self.clients.claim();
  })());
});

/** 문제 데이터 요청인가 (시트 CSV 또는 data/*.csv) */
function isDataRequest(url) {
  return url.hostname.endsWith('google.com') || url.hostname.endsWith('googleusercontent.com') || url.pathname.endsWith('.csv');
}

/** 동기화(Apps Script) 요청은 서비스워커가 건드리지 않는다. */
function isSyncRequest(url) {
  return url.hostname === 'script.google.com' || url.hostname.endsWith('script.googleusercontent.com');
}

async function networkFirst(request) {
  const cache = await caches.open(DATA_CACHE);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (err) {
    const cached = await cache.match(request, { ignoreVary: true });
    if (cached) return cached;
    throw err;
  }
}

async function cacheFirst(request) {
  const cache = await caches.open(SHELL_CACHE);
  const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
  if (cached) return cached;
  const response = await fetch(request);
  if (response && (response.ok || response.type === 'opaque')) cache.put(request, response.clone());
  return response;
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!/^https?:$/.test(url.protocol) || isSyncRequest(url)) return;

  if (isDataRequest(url)) {
    event.respondWith(networkFirst(request));
  } else if (request.mode === 'navigate') {
    event.respondWith(cacheFirst(new Request(new URL('index.html', self.location.href).href)).catch(() => fetch(request)));
  } else {
    event.respondWith(cacheFirst(request));
  }
});
