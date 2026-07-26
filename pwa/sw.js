/* 408刷题 PWA - Service Worker
 * 预缓存全部页面/样式/脚本/题库/图标，安装后完全离线可用。
 * 升级题库或代码后：改 CACHE_VER 版本号即可让客户端自动换新缓存。
 */
const CACHE_VER = 'quiz408-v1';

const PRECACHE = [
    'index.html',
    'quiz.html',
    'wrong.html',
    'favorites.html',
    'search.html',
    'stats.html',
    'exam.html',
    'manifest.webmanifest',
    'css/style.css',
    'js/common.js',
    'js/backend.js',
    'data/os.json',
    'data/co.json',
    'data/ds.json',
    'data/cn.json',
    'icons/icon-192.png',
    'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_VER)
            .then(cache => cache.addAll(PRECACHE))
            .then(() => self.skipWaiting())
    );
});

self.addEventListener('activate', (e) => {
    e.waitUntil(
        caches.keys()
            .then(keys => Promise.all(keys.filter(k => k !== CACHE_VER).map(k => caches.delete(k))))
            .then(() => self.clients.claim())
    );
});

// cache-first：离线优先；缓存未命中再走网络并回填
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;
    e.respondWith(
        caches.match(e.request, { ignoreSearch: true }).then(hit => {
            if (hit) return hit;
            return fetch(e.request).then(resp => {
                if (resp.ok && new URL(e.request.url).origin === location.origin) {
                    const clone = resp.clone();
                    caches.open(CACHE_VER).then(cache => cache.put(e.request, clone));
                }
                return resp;
            });
        })
    );
});
