// 提取 algo.html 主 <script>，用 stub DOM 跑真实渲染逻辑并断言。
// 校验：章节卡、标题层级、表格规则（左补 / 干净 / 原文降级）、真题·例题卡片、目录。
const fs = require('fs');
const os = require('os');
const path = require('path');
const NODE_ROOT = __dirname;

const html = fs.readFileSync(path.join(NODE_ROOT, 'pwa/algo.html'), 'utf8');
const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(m => m[1]);
const main = scripts[scripts.length - 1];

const store = {};
const localStorage = {
  getItem: k => (k in store ? store[k] : null),
  setItem: (k, v) => { store[k] = String(v); },
};
function mk(id) {
  return {
    id, _html: '', _text: '',
    classList: {
      _s: new Set(),
      add(c) { this._s.add(c); }, remove(c) { this._s.delete(c); },
      toggle(c, f) { f ? this._s.add(c) : this._s.delete(c); },
      contains(c) { return this._s.has(c); },
    },
    style: {}, offsetTop: 0, offsetHeight: 20, clientHeight: 400, scrollTop: 0,
    scrollTo() {},
    get innerHTML() { return this._html; }, set innerHTML(v) { this._html = v; },
    get textContent() { return this._text; }, set textContent(v) { this._text = String(v); },
    hidden: false, getAttribute() { return null; },
  };
}
const els = {};
const document = {
  getElementById: id => (els[id] || (els[id] = mk(id))),
  querySelectorAll: () => [], querySelector: () => null,
  documentElement: { classList: { add() {}, contains() { return false; } } },
};
const window = { addEventListener() {}, scrollTo() {}, scrollY: 0 };
const dataUrl = path.join(NODE_ROOT, 'pwa/data/algo_notes.json');
const fetch = async () => ({ ok: true, json: async () => JSON.parse(fs.readFileSync(dataUrl, 'utf8')) });
const IntersectionObserver = function () { this.observe = () => {}; };

eval(main.replace(/loadAlgo\(\);\s*$/, 'globalThis.__p = loadAlgo();'));
globalThis.__p.catch(e => console.log('loadAlgo 抛错:', e.stack));
globalThis.__p.then(() => run());

let failed = 0;
function check(name, ok, extra) {
  if (!ok) failed++;
  console.log(`  ${ok ? '✅' : '❌'} ${name}${extra ? '  ' + extra : ''}`);
}
const cnt = (s, re) => (s.match(re) || []).length;

function run() {
  const algoBody = els.algoBody._html;
  const algoToc = els.algoToc._html;
  const algoMeta = els.algoMeta._text;
  // 调试用：把渲染结果落到系统临时目录，不污染仓库根
  fs.writeFileSync(path.join(os.tmpdir(), 'quiz408_algo_out.html'), algoBody);

  console.log('meta:', algoMeta.slice(0, 70), '\n');

  console.log('--- 结构 ---');
  check('章节卡片 = 6', cnt(algoBody, /class="algo-card"/g) === 6, String(cnt(algoBody, /class="algo-card"/g)));
  check('章标题 = 6', cnt(algoBody, /class="algo-ch-title"/g) === 6);
  check('h3/h4/h5 = 23/50/31',
    [cnt(algoBody, /<h3 class="algo-h"/g), cnt(algoBody, /<h4 class="algo-h"/g), cnt(algoBody, /<h5 class="algo-h"/g)]
      .join('/') === '23/50/31',
    [cnt(algoBody, /<h3 class="algo-h"/g), cnt(algoBody, /<h4 class="algo-h"/g), cnt(algoBody, /<h5 class="algo-h"/g)].join('/'));
  /* 111 → 103：修复抽取损坏时删除了 8 个被误标成 code 的碎片 item
     （折半查找模板表 3 个 + 5 处被切开的散文续句） */
  check('代码块 = 103', cnt(algoBody, /class="code-block algo-code"/g) === 103, String(cnt(algoBody, /class="code-block algo-code"/g)));
  check('目录链接 ≥ 104', (algoToc.match(/<a /g) || []).length >= 104, String((algoToc.match(/<a /g) || []).length));
  check('目录三级缩进 = 31', cnt(algoToc, /algo-toc-l5/g) === 31, String(cnt(algoToc, /algo-toc-l5/g)));

  console.log('--- 表格规则 ---');
  const nTbl = cnt(algoBody, /class="algo-tbl"/g);
  const nRaw = cnt(algoBody, /class="algo-raw/g);
  /* 10 → 11：新增折半查找「两种经典模板」表（原碎片化在 7 个 item 上，已重建） */
  check('表格渲染成功 = 11', nTbl === 11, String(nTbl));
  /* 讲义 PDF（E:/夸克/.../【一休】算法课程讲义.pdf）到手后，
     原 3 段列序错乱已按 PDF 文字层+视觉双重核对修复 → 降级段归零。 */
  check('原文降级段 = 0 (全部表格已可正常渲染)', nRaw === 0, String(nRaw));
  check('多行 pipe 段全覆盖 (表+降级 = 11)', nTbl + nRaw === 11, nTbl + '+' + nRaw);
  /* 左补恢复的关键表：首行必须有 1 个空 th（408题型/得分表/子序列表x2/图存储表） */
  const padHead = [...algoBody.matchAll(/<table class="algo-tbl"><tr><th>\s*<\/th>/g)].length;
  check('左补空表头表 = 5', padHead === 5, String(padHead));

  const tables = [...algoBody.matchAll(/<table class="algo-tbl">([\s\S]*?)<\/table>/g)].map(m => m[1]);
  const findTbl = kw => tables.find(s => s.includes(kw));
  const cols = s => (s.split('</tr>')[0].match(/<(?:th|td)>/g) || []).length;

  const tScore = findTbl('暴力解法');
  check('得分表: 3列 + 空表头 + 所花时间/得分', !!tScore && cols(tScore) === 3
    && /<th>\s*<\/th><th>所花时间<\/th><th>得分<\/th>/.test(tScore)
    && /优化解法/.test(tScore));
  const tType = findTbl('选择题 40 题');
  check('408题型表: 4列 + 空表头 + 分值/推荐时间行', !!tType && cols(tType) === 4
    && /<th>\s*<\/th><th>选择题 40 题<\/th>/.test(tType)
    && /分值/.test(tType) && /推荐时间/.test(tType));
  const tGraph = findTbl('邻接多重表');
  check('图存储表: 5列 + 空表头 + 有向图/无向图行', !!tGraph && cols(tGraph) === 5
    && /<th>\s*<\/th><th>邻接矩阵<\/th>/.test(tGraph)
    && /有向图/.test(tGraph) && /无向图/.test(tGraph));
  const tSub = findTbl('元素和最大值');
  check('子序列表: 3列 + 空表头 + i=0~i=3', !!tSub && cols(tSub) === 3
    && /<th>\s*<\/th><th>连续子序列<\/th><th>元素和最大值<\/th>/.test(tSub));

  /* 以下 2 张表由讲义 PDF 原文核实修复（原为列序错乱的降级段） */
  const tCmpl = findTbl('空间复杂度要求');
  check('复杂度要求表: 4列 + 题目描述/时间/空间/备注', !!tCmpl && cols(tCmpl) === 4
    && /<th>题目描述<\/th><th>时间复杂度要求<\/th><th>空间复杂度要求<\/th><th>备注<\/th>/.test(tCmpl)
    && /"时间上尽可能高效" |/.test(tCmpl.replace(/<\/td>/g, ' |')));
  check('复杂度要求表: 5 行数据完整（含 O(1) 与"无明确描述"行）', !!tCmpl
    && (tCmpl.match(/<tr>/g) || []).length === 6
    && /"空间复杂度为O\(1\)且时间上尽可能高效"/.test(tCmpl)
    && /严格限制空间，通常要求原地修改/.test(tCmpl)
    && /能实现即可/.test(tCmpl) && /重点考察逻辑实现/.test(tCmpl));
  const tVisit = findTbl('核心问题');
  check('例题遍历表: 4列 + 例题/核心问题/最佳遍历方式/核心操作', !!tVisit && cols(tVisit) === 4
    && /<th>例题<\/th><th>核心问题<\/th><th>最佳遍历方式<\/th>/.test(tVisit));
  check('例题遍历表: 4-1~4-6 六题齐全且遍历方式正确', !!tVisit
    && (tVisit.match(/<tr>/g) || []).length === 7
    && /4-1: 求叶子数/.test(tVisit) && /4-6: 是否平衡二叉树/.test(tVisit)
    && /先序\/中序\/后序遍历/.test(tVisit)
    && /层次结构\/无间隙/.test(tVisit)
    && /结点值的有序性/.test(tVisit)
    && /先根\/后根遍历/.test(tVisit));
  const tTpl = findTbl('模板二');
  check('模板对比表: 3列 + 对比项/模板一/模板二', !!tTpl && cols(tTpl) === 3
    && /<th>对比项<\/th><th>模板一：『等值判断』模板（优先使用）<\/th><th>模板二：『区间收敛』模板<\/th>/.test(tTpl));
  check('模板对比表: 6 行(表头+5 数据行) 标签齐全且各单元格归位（原碎片化已合并）', !!tTpl
    && (tTpl.match(/<tr>/g) || []).length === 6
    && ['适用场景', '查找成功', '查找失败', '循环条件', '边界更新']
      .every(k => new RegExp('<td>' + k + '<\\/td>').test(tTpl))
    && /查找一个确切的值，通常适合元素不重复。<\/td><td>查找满足条件的第一个或最后一个元素，元素可以重复。/.test(tTpl)
    && /while \(L &lt;= R\) \(区间没有元素时退出循环\)/.test(tTpl)
    && /while \(L &lt; R\) \(区间收敛为一个元素时退出循环\)/.test(tTpl)
    && /R = mid - 1 或 L = mid \+ 1 \(直接排除 mid \)/.test(tTpl)
    && /R = mid 或 L = mid \+ 1 \(可能不能排除 mid \)/.test(tTpl));
  /* 碎片拼回后不应再出现孤立的半句代码块 */
  check('无「j 向左）」孤立代码块', !/class="code-block algo-code">[^<]*j 向左/.test(algoBody));
  check('无「path 用于记录前驱结点」孤立代码块', !/class="code-block algo-code">[^<]*path 用于记录前驱结点/.test(algoBody));
  check('「i 向右或 j 向左」两句完整', (algoBody.match(/i 向右或/g) || []).length >= 2
    && (algoBody.match(/j 向左）/g) || []).length >= 2);
  check('「初始化路径数组 path 用于记录前驱结点」完整', (algoBody.match(/初始化路径数组 path 用于记录前驱结点。/g) || []).length === 2);

  console.log('--- 真题 / 例题卡片 ---');
  const nReal = cnt(algoBody, /class="algo-qa algo-qa-real"/g);
  const nEx = cnt(algoBody, /class="algo-qa algo-qa-eg"/g);
  check('真题卡 > 0', nReal > 0, String(nReal));
  check('例题卡 > 0', nEx > 0, String(nEx));
  check('「例：【2011年真题】」被识别', /algo-qa-real"><span class="algo-qa-badge">【2011年真题】/.test(algoBody));
  check('例题 2-1 被识别', /algo-qa-eg"><span class="algo-qa-badge">例题 2-1<\/span>/.test(algoBody));
  check('例题 2-6 被识别', /algo-qa-eg"><span class="algo-qa-badge">例题 2-6<\/span>/.test(algoBody));
  check('「例题 2-1」在 6 分钟内段落里被单独成卡',
    /<div class="algo-para">练习：请在 6 分钟内想出以下例题的直观做法（不考虑复杂度）<\/div>/.test(algoBody)
    && /例题 2-1/.test(algoBody));

  console.log('--- 裸露 | 泄漏 ---');
  const paraTexts = [...algoBody.matchAll(/<div class="algo-para">([\s\S]*?)<\/div>/g)].map(m => m[1]);
  /* 不变量：多行 | 段绝不能漏进普通段落（会被当表格/原文块处理） */
  const multiRowLeak = paraTexts.filter(t => t.split('\n').filter(l => /\|/.test(l)).length > 1);
  check('无多行 | 段漏进段落', multiRowLeak.length === 0, String(multiRowLeak.length));
  /* 单行 | 行：多为 |A[i]| 绝对值记号 / data|link 结构体 / 残缺表行，保留原文是正确降级 */
  const singleLeak = paraTexts.filter(t => /\|/.test(t));
  console.log(`     ℹ️ 单行 | 段落 ${singleLeak.length} 处（绝对值记号、结构体字段、残缺表行，按原文保留）`);

  console.log(`\n=== 汇总：表格 ${nTbl} / 原文降级 ${nRaw} / 真题卡 ${nReal} / 例题卡 ${nEx} / 段落 ${cnt(algoBody, /class="algo-para"/g)} ===`);
  console.log(failed ? `\n❌ ${failed} 项失败` : '\n✅ 全部通过');
  process.exit(failed ? 1 : 0);
}
