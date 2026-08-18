/* 408刷题 PWA - Service Worker
 * 预缓存全部页面/样式/脚本/题库/图标，安装后完全离线可用。
 * CACHE_VER 由构建脚本 tools/build_sw.py 依据 PRECACHE 资源内容自动算哈希生成，
 * 预缓存资源（页面/样式/题库/图标）任意改动后重新构建即可让客户端自动换新缓存，
 * 无需手动改版本号。手动编辑本行会被下次构建覆盖。
 */
const CACHE_VER = 'quiz408-3022e87a36';

const PRECACHE = [
    'index.html',
    'quiz.html',
    'wrong.html',
    'favorites.html',
    'search.html',
    'stats.html',
    'exam.html',
    'daka.html',
    'dati.html',
    'notes.html',
    'map.html',
    'manifest.webmanifest',
    'css/style.css',
    'js/common.js',
    'js/backend.js',
    'data/os.json',
    'data/co.json',
    'data/ds.json',
    'data/cn.json',
    'data/ds_daka.json',
    'data/ds_code.json',
    'data/dati.json',
    'data/notes/co_notes.json',
    'data/notes/os_notes.json',
    'data/notes/ds_notes.json',
    'data/notes/cn_notes.json',
    'data/sub_all.txt',
    'data/sub_os.txt',
    'data/sub_os_full.txt',
    'data/sub_os_opts.txt',
    'data/co_map.json',
    'icons/icon-192.png',
    'icons/icon-512.png'
];

self.addEventListener('install', (e) => {
    e.waitUntil(
        caches.open(CACHE_VER)
            // Request(reload)：预缓存绕过浏览器HTTP缓存，确保升版本后拿到的是服务器最新文件
            .then(cache => cache.addAll(PRECACHE.map(u => new Request(u, { cache: 'reload' }))))
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
