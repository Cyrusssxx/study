/* 408刷题 PWA - Service Worker
 * 预缓存拆分为两层，避免每次部署都强制重下 3.79MB：
 *   APP_PRECACHE  —— 应用外壳（页面/样式/脚本/图标/元数据），体积 ~380KB，
 *                    变化频率低；哈希注入 APP_VER。
 *   DATA_PRECACHE —— 数据文件（题库/笔记/导图/打卡表），体积大（~3.4MB），
 *                    安装时一并预取（失败不阻塞），但按 DATA_VER 隔离；
 *                    运行时按需缓存，离线可用。
 * APP_VER / DATA_VER 由构建脚本 tools/build_sw.py 依据各自资源内容自动算哈希生成，
 * 单一真源是下方两个数组；手动编辑版本行会被下次构建覆盖。
 *
 * 关键收益：① 首页只依赖外壳 + 几百字节的 meta.json，不再因题库变化被迫重下；
 *          ② 只改数据不改外壳时，APP_VER 不变 → 外壳零重下；反之亦然。
 */
const APP_VER = 'quiz408-app-0ab01d65b9';
const DATA_VER = 'quiz408-data-c8ad50df25';

// 应用外壳：保证离线骨架与最新脚本。meta.json 仅几百字节，随外壳一起预缓存。
const APP_PRECACHE = [
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
    'code.html',
    'manifest.webmanifest',
    'css/style.css',
    'js/common.js',
    'js/backend.js',
    'data/meta.json',
    'icons/icon-192.png',
    'icons/icon-512.png',
    'vendor/highlight/highlight.min.js',
    'vendor/highlight/github.min.css',
    'vendor/highlight/github-dark.min.css'
];

// 数据文件：体积大，按需/预取缓存，与外壳版本解耦。
const DATA_PRECACHE = [
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
    'data/os_map.json'
];

self.addEventListener('install', (e) => {
    e.waitUntil((async () => {
        // 外壳必缓存（保证离线骨架）。若同名缓存已存在（本层版本未变），跳过重下，省流量。
        const appCache = await caches.open(APP_VER);
        if ((await appCache.keys()).length === 0) {
            await Promise.allSettled(
                APP_PRECACHE.map(u => appCache.add(new Request(u, { cache: 'reload' })))
            );
        }
        // 数据预取：个别失败不阻塞（运行时仍会按需补缓存）。版本未变则跳过重下。
        const dataCache = await caches.open(DATA_VER);
        if ((await dataCache.keys()).length === 0) {
            await Promise.allSettled(
                DATA_PRECACHE.map(u => dataCache.add(new Request(u, { cache: 'reload' })))
            );
        }
        await self.skipWaiting();
    })());
});

self.addEventListener('activate', (e) => {
    e.waitUntil((async () => {
        const keys = await caches.keys();
        await Promise.all(keys.filter(k =>
            (k.startsWith('quiz408-app-') && k !== APP_VER) ||
            (k.startsWith('quiz408-data-') && k !== DATA_VER)
        ).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

// 缓存策略（分层）：
// - 页面/HTML、JS、CSS、manifest → 网络优先：保证线上更新后拿到最新页面与脚本，离线回退缓存
// - 数据/图片/图标 → 缓存优先（离线优先）：未命中走网络并回填对应版本缓存
self.addEventListener('fetch', (e) => {
    if (e.request.method !== 'GET') return;

    const url = new URL(e.request.url);
    const isSameOrigin = url.origin === location.origin;
    const path = url.pathname;
    const isDocOrCode = e.request.mode === 'navigate'
        || path.endsWith('.html')
        || path.endsWith('.js')
        || path.endsWith('.css')
        || path.endsWith('.webmanifest')
        || path.endsWith('/');

    if (isDocOrCode) {
        e.respondWith(
            fetch(e.request).then(resp => {
                if (resp && resp.ok && isSameOrigin) {
                    caches.open(APP_VER).then(c => c.put(e.request, resp.clone()));
                }
                return resp;
            }).catch(() => caches.match(e.request, { ignoreSearch: true }))
        );
        return;
    }

    // 数据/图片/图标：按资源归属选择缓存命名空间（数据版本 / 外壳版本），缓存优先
    const inData = DATA_PRECACHE.some(u => path.endsWith('/' + u) || path === '/' + u);
    const cacheName = inData ? DATA_VER : APP_VER;
    e.respondWith((async () => {
        const hit = await caches.match(e.request, { ignoreSearch: true });
        if (hit) return hit;
        const resp = await fetch(e.request);
        if (resp.ok && isSameOrigin) {
            const c = await caches.open(cacheName);
            c.put(e.request, resp.clone());
        }
        return resp;
    })());
});
