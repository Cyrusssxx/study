/* CO 4.3.4 的「caller 调 add 运行栈」栈帧图。
 *
 * 为什么画：4.3.4 整节零图（1183 字），是 2019-45 大题的主锚点；
 *   栈帧靠纯文字讲「[ebp-12] 是局部变量、[ebp+8] 是实参」最难记，
 *   一张竖向栈布局图能同时讲清「谁在上面」「为什么是 +8 不是 +4」。
 *
 * 同源：图内所有偏移、数值、指令都取自本节正文的 add 例子
 *   （sub esp,24 / temp1=125 / temp2=80 / [ebp-12][ebp-8][ebp-4] /
 *    [esp]、[esp+4] / mov eax,[ebp+12]（y）、mov edx,[ebp+8]（x））。
 *   图里多出来的 [ebp-20]~[ebp-32] 是推导值，用数学断言锁死。
 * 基线：CO jsdom .anno-line = 1962。
 */
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;
const read = p => fs.readFileSync(path.join(ROOT, p), 'utf8');
let fail = 0, pass = 0;
function check(name, got, want) {
  const ok = typeof want === 'function' ? want(got) : JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else { fail++; console.log('FAIL ' + name + ' => ' + JSON.stringify(got)); }
}

const SVG = 'pwa/img/co_fig_stack_frame.svg';
const svg = read(SVG);
const coRaw = read('pwa/data/notes/co_notes.json');
const co = JSON.parse(coRaw);
const sw = read('pwa/sw.js');

// ---------- 1. SVG 自身 ----------
check('SVG 以 </svg> 收尾', svg.trim().startsWith('<svg') && svg.trim().endsWith('</svg>'), true);
check('SVG viewBox 800 宽', /viewBox="0 0 800 \d+"/.test(svg), true);
check('SVG 有白底', svg.includes('<rect width="800"') && svg.includes('fill="#fbfcfe"'), true);
check('SVG 无 HTML 标签', ['<b>', '</b>', '<i>', '</i>', '<br>', '<p>'].every(t => !svg.includes(t)), true);
check('SVG 不在 <g> 上写 stroke（会让文字继承描边）', !/<g[^>]*stroke=/.test(svg), true);

// ---------- 2. 图落位 ----------
function secHtml(num) {
  for (const ch of co.chapters) {
    for (const s of ch.sections || []) {
      for (const x of [s].concat(s.subsections || [])) {
        if ((x.section || '').split(' ')[0] === num) return x.html || '';
      }
    }
  }
  return '';
}
const h = secHtml('4.3.4');
check('4.3.4 含本图', h.includes('img/co_fig_stack_frame.svg'), true);
check('4.3.4 图引用唯一 1 处', (h.match(/co_fig_stack_frame/g) || []).length, 1);
const starAt = h.indexOf('<h4>★ 高频真题考点与陷阱</h4>');
check('★ 锚点存在', starAt > 0, true);
check('图在 ★ 之前', h.indexOf('co_fig_stack_frame.svg') < starAt, true);
check('图题与 img 是紧邻两段 data-fig',
  /<p class="paragraph" data-fig="1"><b>图：caller 调 add[\s\S]*?<\/p>\r?\n<p class="paragraph" data-fig="1"><img class="fig-img" src="img\/co_fig_stack_frame\.svg"/.test(h), true);
const at = h.indexOf('<p class="paragraph" data-fig="1"><b>图：caller 调 add');
check('图块前缀是闭合标签（不塞进 <p>/<li> 正文）', at > 0 && /[>\r\n]/.test(h[at - 1]), true);
check('图块前面紧跟的是 </p>', h.slice(0, at).trim().endsWith('</p>'), true);

// ---------- 3. SW 预缓存 ----------
check('SW DATA_PRECACHE 含本图', sw.includes("'img/co_fig_stack_frame.svg'"), true);

// ---------- 4. 与正文同源 ----------
const SAME = ['sub esp,24', '125', '80', '[ebp-4]', '[ebp-8]', '[ebp-12]', '[esp]', '[esp+4]', 'push ebp', 'mov ebp,esp', 'pop ebp', 'ret'];
check('正文提到的偏移/数值/指令图里全有',
  SAME.every(t => h.includes(t) && svg.includes(t)), true);
check('正文的 x / y 对应关系与图一致（[ebp+8]=x=125、[ebp+12]=y=80）',
  /\[ebp\+12\]（y）、mov edx,\[ebp\+8\]（x）/.test(h), true);
check('图用 ebp′+8 标 x', /ebp′\+8<\/text>[\s\S]{0,160}→ x = 125/.test(svg), true);
check('图用 ebp′+12 标 y', /ebp′\+12<\/text>[\s\S]{0,160}→ y = 80/.test(svg), true);
check('图用 ebp′+4 标返回地址', /ebp′\+4<\/text>[\s\S]{0,200}返回地址/.test(svg), true);
check('leave 的定义与正文一致（mov esp,ebp + pop ebp）',
  h.includes('leave 等价于 mov esp,ebp + pop ebp') && svg.includes('mov esp,ebp'), true);

// ---------- 5. 栈布局数学自洽（图里的偏移是推导值，必须算得住） ----------
const esp0 = 0;                       // caller 执行 mov ebp,esp 后 esp = ebp = 0
const espSub = esp0 - 24;             // sub esp,24
const slotTemp1 = espSub;             // caller 的 [esp]   ← temp1
const slotTemp2 = espSub + 4;         // caller 的 [esp+4] ← temp2
const slotRet = espSub - 4;           // call 压返回地址
const ebpAdd = slotRet - 4;           // add 里 push ebp，ebp′ = 这里
check('add 的 ebp′ = caller ebp − 32', ebpAdd, -32);
check('ebp′ 落在图里标注的 [ebp-32] 槽', ebpAdd === -32, true);
check('ebp′+8 正好是实参 temp1（=x）', ebpAdd + 8 === slotTemp1, true);
check('ebp′+12 正好是实参 temp2（=y）', ebpAdd + 12 === slotTemp2, true);
check('ebp′+4 正好是返回地址（跳过了旧 EBP）', ebpAdd + 4 === slotRet, true);
check('图里画出了 [ebp-16] 未使用槽（sub esp,24 共 6 槽只用到 5 个）',
  svg.includes('[ebp-16]') && svg.includes('未使用'), true);
check('图里没有凭空多画槽（[ebp-36] 之类不该出现）', !/\[ebp-(36|40)\]/.test(svg), true);

// ---------- 6. 顺带修的那句矛盾表述 ----------
check('旧的「16 字节倍数 → 实际用 28 分配 32」矛盾句已删',
  h.includes('实际用 28 字节 → 分配 32 字节') === false, true);
check('新表述保留 16 字节对齐知识点', h.includes('16 字节') && h.includes('4 字节对齐'), true);
check('新表述不再与 sub esp,24 冲突（明说本例只做 4 字节对齐）',
  /本例 sub esp,24 只保证 4 字节对齐/.test(h), true);

// ---------- 7. 数据文件不带 SVG 专有标签 ----------
check('笔记 JSON 里没有 tspan', coRaw.includes('tspan'), false);
check('4.3.4 没有内联 <svg>（图走 img 外链，不占行号）', h.includes('<svg'), false);

// ---------- 8. jsdom 真实渲染：行号零漂移 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_co_stack_frame: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  (async () => {
    const pageHtml = read('pwa/notes.html')
      .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
        try { return '<script>' + read('pwa/' + s) + '</script>'; } catch (e) { return ''; }
      }).replace(/<link\b[^>]*>/gi, '');
    const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
    const dom = new JSDOM(pageHtml, {
      runScripts: 'dangerously', pretendToBeVisual: true,
      url: 'https://x.test/notes.html?subject=co', virtualConsole: vc,
      beforeParse(w) {
        w.indexedDB = new IDBFactory(); w.IDBKeyRange = IDBKeyRange;
        w.alert = () => { }; w.confirm = () => true; w.scrollTo = () => { };
        w.CSS = { escape: s => String(s).replace(/[^a-zA-Z0-9_-]/g, c => '\\' + c) };
        w.Element.prototype.scrollIntoView = function () { };
        w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(coRaw) });
      }
    });
    await new Promise(r => setTimeout(r, 4000));
    const d = dom.window.document;
    check('真实渲染 .anno-line = 1962（插图零漂移）', d.querySelectorAll('.anno-line').length, 1962);
    check('图块没被算进行号',
      [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length, 0);
    const img = [...d.querySelectorAll('img.fig-img')]
      .find(el => (el.getAttribute('src') || '').includes('co_fig_stack_frame'));
    check('本图在真实 DOM 里渲染出来了', !!img, true);
    check('本图不在 <li> 内部（img 本来就该在 p.paragraph 里）', !!img && !img.closest('li'), true);
    console.log('_test_co_stack_frame: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
