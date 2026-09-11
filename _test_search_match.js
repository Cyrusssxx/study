// 搜索修复回归：规范化匹配 / 章节名入库 / 跨科目轮转不被截断 / 笔记 subsections 覆盖
// 用 jsdom + fake-indexeddb 真实执行 pwa/js/backend.js，stub fetch 喂 fixture。
const fs = require('fs');
const { JSDOM } = require('jsdom');
const { IDBFactory, IDBKeyRange } = require('fake-indexeddb');

const SRC = fs.readFileSync('pwa/js/backend.js', 'utf8');

// ---------------- fixture ----------------
// os：120 题含「进程」（用于触发上限）+ 3 道特性题；co：5 题含「进程」（验证不被 os 挤掉）
const osQs = [];
for (let i = 0; i < 120; i++) {
  osQs.push({
    id: 'os_8' + String(100 + i), number: 100 + i,
    content: '进程调度相关描述 ' + i, options: { A: 'x', B: 'y' }, answer: 'A',
    explanation: '进程解析', chapter: '第2章 进程与线程', section: '2.1'
  });
}
osQs.push(
  { id: 'os_9001', number: 9001, content: '关于LRU算法的描述', options: {}, answer: 'A', explanation: '', chapter: '第3章 内存管理', section: '3.1' },
  { id: 'os_9002', number: 9002, content: '若 a&lt;b 则成立', options: {}, answer: 'A', explanation: '', chapter: '第3章 内存管理', section: '3.1' },
  // chapter 刻意不含「进程」：否则章节名入库后它也会被「进程」命中，干扰第 5 组的 total 基线
  { id: 'os_9003', number: 9003, content: '虚拟内存的基本概念与Cache无关', options: {}, answer: 'A', explanation: '', chapter: '第3章 内存管理', section: '3.2 虚拟内存' }
);
const coQs = [];
for (let i = 0; i < 5; i++) {
  coQs.push({
    id: 'co_9' + String(100 + i), number: 200 + i,
    content: '进程同步与互斥 ' + i, options: {}, answer: 'A', explanation: '',
    chapter: '第2章 进程与线程', section: '2.3'
  });
}

const FIXTURES = {
  'os.json': { questions: osQs },
  'co.json': { questions: coQs },
  'ds.json': { questions: [] },
  'cn.json': { questions: [] },
  'notes/os_notes.json': {
    subject: 'os', title: 'OS 笔记',
    chapters: [{
      chapter: '第3章 内存管理',
      sections: [{
        section: '3.1 内存管理概念', html: '<p>小节级正文：分页管理</p>',
        subsections: [
          { section: '3.1.1 连续分配', html: '<p>子小节正文：银行家算法的安全性检查</p>' }
        ]
      }]
    }]
  },
  'notes/co_notes.json': { subject: 'co', title: 'CO', chapters: [] },
  'notes/ds_notes.json': { subject: 'ds', title: 'DS', chapters: [] },
  'notes/cn_notes.json': { subject: 'cn', title: 'CN', chapters: [] },
  'algo_notes.json': {
    meta: { source: '算法讲义' },
    chapters: [{ title: 'ch3 链表', items: [
      { t: 'h', lvl: 3, text: '头插法复习', page: 71 },
      { t: 'h', lvl: 3, text: '快慢指针找中点' },
      { t: 'p', text: '头插法的正文：每次插入都在头部' }
    ] }]
  },
  'co_map.json': {
    title: '计组导图',
    roots: [{ n: '第一章', c: [{ n: '补码' }, { n: 'Cache' }] }]
  },
  'os_map.json': { title: 'OS 导图', roots: [] }
};

let pass = 0, fail = 0;
function assert(cond, msg) { if (cond) { pass++; console.log('  ✓', msg); } else { fail++; console.log('  ✗ FAIL:', msg); } }

(async () => {
  const dom = new JSDOM('<!doctype html><html><body></body></html>',
    { runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://x.test/search.html' });
  const w = dom.window;
  w.indexedDB = new IDBFactory();
  w.IDBKeyRange = IDBKeyRange;

  const fetched = [];
  w.fetch = async (url) => {
    const u = String(url);
    fetched.push(u);
    const key = u.includes('notes/') ? 'notes/' + u.split('notes/')[1] : u.split('/').pop();
    const body = FIXTURES[key];
    return { ok: true, status: 200, json: async () => (body !== undefined ? body : { questions: [], chapters: [] }) };
  };

  w.eval('(function(){' + SRC + '\n;globalThis.__api = api;})()');
  const api = w.__api;
  const search = async (q, subject) => {
    const params = new URLSearchParams({ q });
    if (subject) params.set('subject', subject);
    return await (await api('/api/search?' + params.toString())).json();
  };

  // 1) 空格/分词：用户写「LRU 算法」，原文是「LRU算法」
  {
    const r = await search('LRU 算法');
    assert(r.results.some(x => x.id === 'os_9001'), '去空格匹配：「LRU 算法」命中「LRU算法」');
  }

  // 2) HTML 实体解码：原文 a&lt;b，搜索 a<b
  {
    const r = await search('a<b');
    assert(r.results.some(x => x.id === 'os_9002'), '实体解码：「a<b」命中「a&lt;b」');
  }

  // 3) 章节名入库：题干里没有「进程与线程」，只在 chapter 字段
  {
    const r = await search('进程与线程', 'co');
    // co 每题 chapter 都是「第2章 进程与线程」，但 content 也含「进程」——改用严格只在章节里的词
    const r2 = await search('内存管理', 'os');
    assert(r2.results.some(x => x.id === 'os_9001'), '章节名入库：「内存管理」命中 chapter 字段的题');
  }

  // 4) 大小写不敏感
  {
    const r = await search('CACHE', 'os');
    assert(r.results.some(x => x.id === 'os_9003'), '大小写不敏感：「CACHE」命中「Cache」');
  }

  // 5) 跨科目轮转：os 120 条 + co 5 条，旧逻辑 co 会被整科截断
  {
    const r = await search('进程');
    const bySub = {};
    for (const x of r.results) bySub[x.subject] = (bySub[x.subject] || 0) + 1;
    assert(r.total === 125, `total 返回全量命中 125（实际 ${r.total}）`);
    assert(r.shown === 100, `shown 为上限 100（实际 ${r.shown}）`);
    assert((bySub.co || 0) > 0, `结果包含计组题（实际 ${bySub.co || 0} 条，旧逻辑为 0）`);
    assert((bySub.os || 0) > 0, `结果包含操作系统题（实际 ${bySub.os || 0} 条）`);
    assert(r.results.length === 100, `结果长度 100（实际 ${r.results.length}）`);
  }

  // 6) 单科过滤仍生效
  {
    const r = await search('进程', 'co');
    assert(r.results.every(x => x.subject === 'co') && r.total === 5,
      `单科过滤：只返回 co 且 total=5（实际 ${r.total}）`);
  }

  // 7) 笔记 subsections 正文可被搜到，且返回子小节名（可精确跳转）
  {
    const r = await search('银行家算法');
    const n = (r.notes || []).find(x => (x.html || '').includes('银行家算法'));
    assert(!!n, '笔记子小节正文可被搜到（subsections 已入索引）');
    assert(n && n.section === '3.1.1 连续分配', `返回子小节名用于跳转（实际 ${n && n.section}）`);
  }

  // 8) 空关键词 / 无命中
  {
    const r = await search('   ');
    assert(r.total === 0 && r.results.length === 0, '空白关键词返回空结果');
    const r2 = await search('这个词肯定不存在xyzzy');
    assert(r2.total === 0 && (r2.notes || []).length === 0, '无命中时 total/notes 均为 0');
  }

  // 9) 算法讲义 / 思维导图已纳入搜索索引（懒加载）
  {
    const r = await search('头插法');
    assert((r.algo || []).length > 0 && r.algo_total > 0,
      `算法讲义可搜到（algo ${(r.algo || []).length} 条, total ${r.algo_total}）`);
    const a = (r.algo || [])[0];
    assert(a && a.id === 'sec-2' && a.chapter === 'ch3 链表',
      `algo 结果带 id/chapter 供跳转（实际 ${a && a.id}/${a && a.chapter}）`);
    const r2 = await search('补码');
    assert((r2.map || []).length > 0, `导图节点可搜到（map ${(r2.map || []).length} 条）`);
    const m = (r2.map || [])[0];
    assert(m && m.id === '0-0' && m.subject === 'co',
      `map 结果带 subject/id 供跳转（实际 ${m && m.id}/${m && m.subject}）`);
    // 单科过滤时 map 仅返回对应科目
    const r3 = await search('补码', 'os');
    assert((r3.map || []).length === 0, '单科过滤：os 下不含 co 导图结果');
  }

  console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('ERR', e); process.exit(1); });