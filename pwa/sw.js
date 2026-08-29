/* 408刷题 PWA - Service Worker
 * 预缓存拆分为两层，避免每次部署都强制重下 3.79MB：
 *   APP_PRECACHE  —— 应用外壳（页面/样式/脚本/图标/元数据），体积 ~380KB，
 *                    变化频率低；哈希注入 APP_VER。
 *   DATA_PRECACHE —— 数据文件（题库/笔记/导图/打卡表），体积大（~5MB），
 *                    安装时一并预取（失败不阻塞），但按 DATA_VER 隔离；
 *                    运行时按需缓存，离线可用。
 * 第三层（不进任何预缓存清单）：
 *   LAZY_DATA     —— 懒加载数据文件，只有打开对应页面才拉取（首屏零成本）。
 *                    它不能按 DATA_VER 归口：DATA_VER 只由 DATA_PRECACHE 内容算出，
 *                    改这些文件时 DATA_VER 不变，缓存优先就会一直命中旧数据；
 *                    按 APP_VER 归口同样失效（改数据不动外壳）。故单独算 LAZY_VER。
 * APP_VER / DATA_VER / LAZY_VER 由构建脚本 tools/build_sw.py 依据各自资源内容自动算哈希生成，
 * 单一真源是下方三个数组；手动编辑版本行会被下次构建覆盖。
 *
 * 关键收益：① 首页只依赖外壳 + 几百字节的 meta.json，不再因题库变化被迫重下；
 *          ② 只改数据不改外壳时，APP_VER 不变 → 外壳零重下；反之亦然；
 *          ③ 懒加载数据既不占首屏，改完也能凭 LAZY_VER 正确失效。
 */
const APP_VER = 'quiz408-app-995dcce8ff';
const DATA_VER = 'quiz408-data-f146f88c16';
const LAZY_VER = 'quiz408-lazy-32ab9cfdfe';

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
    'algo.html',
    'manifest.webmanifest',
    'css/style.css',
    'js/common.js',
    'js/background.js',
    'js/lightbox.js',
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
    'img/cn_fig_2_3.png',
    'img/os_fig_2_1_mem.png',
    'img/os_fig_2_2_state.png',
    'img/os_fig_3_8_paging.png',
    'img/os_fig_3_9_tlb.png',
    'img/os_fig_3_15_seg.png',
    'img/os_fig_3_18_segpaged.png',
    'img/os_fig_3_20_pagereq.png',
    'img/os_fig_4_1_fslevel.png',
    'img/os_fig_4_6_dir1.png',
    'img/os_fig_4_7_dir2.png',
    'img/os_fig_4_8_tree.png',
    'img/os_fig_4_9_dag.png',
    'img/os_fig_4_11_link.png',
    'img/os_fig_4_12_fat.png',
    'img/os_fig_5_15_spool.png',
    'img/os_fig_5_22_fcfs.png',
    'img/os_fig_5_23_sstf.png',
    'img/os_fig_5_24_scan.png',
    'img/os_fig_5_25_cscan.png',
    'img/os_fig_5_26_look.png',
    'img/os_fig_5_27_clook.png',
    'data/sub_all.txt',
    'data/sub_os.txt',
    'data/sub_os_full.txt',
    'data/sub_os_opts.txt',
    'data/co_map.json',
    'data/os_map.json'
];

// 懒加载资源：按前缀归口，不进任何预缓存清单（首屏零成本、按需拉取），
// 但必须有自己的版本命名空间——改了这些文件时 APP_VER/DATA_VER 都不变，
// 若沿用缓存优先就会一直命中旧图/旧数据。LAZY_VER 由构建脚本按这些目录实际内容算出。
const LAZY_PREFIXES = [
    'data/algo_notes.json',
    'data/daka_figs/',
    'data/ds_figs/',
    'data/os_figs/',
    'data/cn_figs/',
    'data/dati_figs/'
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
            (k.startsWith('quiz408-data-') && k !== DATA_VER) ||
            (k.startsWith('quiz408-lazy-') && k !== LAZY_VER)
        ).map(k => caches.delete(k)));
        await self.clients.claim();
    })());
});

// 缓存策略（分层）：
// - 页面/HTML、JS、CSS、manifest → 网络优先：保证线上更新后拿到最新页面与脚本，离线回退缓存
// - 数据/图片/图标 → 缓存优先（离线优先）：未命中走网络并回填对应版本缓存
//   其中 LAZY_PREFIXES 命中的资源回填到 LAZY_VER 命名空间（不进预缓存、首屏不下载）
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

    // 数据/图片/图标：按资源归属选择缓存命名空间（懒加载层 / 数据层 / 外壳层），缓存优先。
    // 三者必须互斥：懒加载前缀优先判定，避免被外壳层「吃掉」而长期命中旧内容。
    const inLazy = LAZY_PREFIXES.some(u => path.includes('/' + u));
    const inData = !inLazy && DATA_PRECACHE.some(u => path.endsWith('/' + u) || path === '/' + u);
    const cacheName = inLazy ? LAZY_VER : (inData ? DATA_VER : APP_VER);
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
