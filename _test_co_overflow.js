/* CO 2.2.4 乘除法溢出判据纠错 + 「有符号/无符号」对照图。
 *
 * 被纠正的错误（旧版原文）：
 *   ① 黄框「n 次后高 n 位 P 非 0 即溢出（OF/CF 置 1）」—— 把无符号判据套到有符号上，
 *      且 OF 与 CF 并列。正确：无符号看高 n 位是否全 0（CF），有符号看是否等于低半
 *      的符号扩展（OF）。
 *   ② 「用 2n 位寄存器」—— 2n 位是乘积 [P:Y] 的宽度，不是单个寄存器。
 *   ③ 「三种乘法实现：迭代式 / 阵列式 / 移位-加减」—— 迭代式就是移位-加减，实为两种。
 *   ④ 「被除数 64 位放 [R:Q]」—— 应为 2n 位（n=32 时才是 64 位）。
 *   ⑤ 补码除法「R 中做全符号位扩展」表述含糊，且未说明溢出置 OF。
 *
 * 本测试锁三件事：错误表述不得回潮、正确判据必须在位、图里的二进制例子数学自洽。
 * 行号基线：co .anno-line = 1962（新图两段 data-fig 不进 行号）。
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

const co = JSON.parse(read('pwa/data/notes/co_notes.json'));
const svg = read('pwa/img/co_fig_muldiv_overflow.svg');
const sw = read('pwa/sw.js');

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
const h = secHtml('2.2.4');
const txt = h.replace(/<[^>]+>/g, '');

// ---------- 1. 旧错误不得回潮 ----------
for (const bad of ['OF/CF 置 1', 'OF / CF 置 1', '非 0 即溢出', '三种乘法实现', '64 位放 [R:Q]', '用 2n 位寄存器']) {
  check('旧错误已清除：' + bad, txt.includes(bad), false);
}

// ---------- 2. 正确判据必须在位 ----------
check('正文明确「无符号 → CF」', /无符号[^。；]{0,40}CF/.test(txt) || /CF=1[^。]*无符号/.test(txt), true);
check('正文明确「有符号 → OF」', /有符号[^。；]{0,40}OF/.test(txt) || /OF=1[^。]*有符号/.test(txt), true);
check('无符号判据写成「高 n 位全 0」', txt.includes('高 n 位') && txt.includes('全 0'), true);
check('有符号判据写成「低 n 位的符号扩展」', txt.includes('符号扩展'), true);
check('明确指出两个判据不同', txt.includes('判据不同') || txt.includes('判据不能互换'), true);
check('补码除法溢出只有 −2ⁿ⁻¹ ÷ (−1)', txt.includes('-2ⁿ⁻¹ ÷ (-1)') || txt.includes('−2ⁿ⁻¹'), true);
check('补码除法溢出置 OF', /OF=1/.test(txt), true);
check('除法被除数补成 2n 位', txt.includes('2n 位') && txt.includes('[R:Q]'), true);
check('原码乘「逻辑右移」与 Booth「算术右移」对照', txt.includes('逻辑右移') && txt.includes('算术右移'), true);
check('实现方式改为两种', txt.includes('实现方式两种') || /两种/.test(txt), true);

// 关键：CF 不能出现在讲有符号的句子里，OF 不能出现在讲无符号的句子里（避免再次混淆）
const sentences = txt.split(/[。；\n]/).map(s => s.trim()).filter(Boolean);
// 只排查「单边句」：同时讲两边做对比的句子不算错配（黄框里那句就是对照句）
check('没有单讲无符号却落到 OF=1 的错配句',
  sentences.some(s => /无符号/.test(s) && /OF=1/.test(s) && !/有符号/.test(s)), false);
check('没有单讲有符号却落到 CF=1 的错配句',
  sentences.some(s => /有符号/.test(s) && /CF=1/.test(s) && !/无符号/.test(s)), false);

// ---------- 3. 图的落位与自检 ----------
check('SVG 存在且完整', svg.trim().startsWith('<svg') && svg.trim().endsWith('</svg>'), true);
check('SVG viewBox 780', /viewBox="0 0 780 \d+"/.test(svg), true);
check('SVG 无 HTML 标签', ['<b>', '</b>', '<i>', '<br>'].every(t => !svg.includes(t)), true);
check('SVG 不用 <g stroke>', !svg.includes('<g stroke'), true);
check('2.2.4 含本图', h.includes('img/co_fig_muldiv_overflow.svg'), true);
check('图块是两段紧邻 data-fig',
  /<p class="paragraph" data-fig="1"><b>图：乘法溢出只看高 n 位[\s\S]*?<\/p>\r?\n<p class="paragraph" data-fig="1"><img class="fig-img" src="img\/co_fig_muldiv_overflow\.svg"/.test(h), true);
check('图在 ★ 之前', h.indexOf('co_fig_muldiv_overflow.svg') < h.indexOf('<h4>★ 高频真题考点与陷阱</h4>'), true);
check('原码乘流程图仍在', h.includes('img/co_fig_mul_flow.svg'), true);
check('SW 预缓存含本图', sw.includes("'img/co_fig_muldiv_overflow.svg'"), true);

// ---------- 4. 图里的二进制例子必须数学自洽 ----------
const bits = (s) => parseInt(s.replace(/\s/g, ''), 2);
const BYTE = (b) => (b >= 128 ? b - 256 : b);
check('3×5=15 的 0000 1111', bits('0000 1111'), 15);
check('3×6=18 的 0001 0010', bits('0001 0010'), 18);
check('(−2)×3=−6 的 1111 1010 按补码解读', BYTE(bits('1111 1010')), -6);
check('(−3)×5=−15 的 1111 0001 按补码解读', BYTE(bits('1111 0001')), -15);
check('图中四个位模式都出现', ['0000','1111','0001','0010','1010'].every(t => svg.includes(t)), true);
// 判据与例子必须一致
const hi4 = s => parseInt(s.replace(/\s/g,'').slice(0, 4), 2);
const lo4 = s => parseInt(s.replace(/\s/g,'').slice(4), 2);
const signedOk = s => hi4(s) === (lo4(s) >= 8 ? 15 : 0);
check('无符号例子 15：高半全 0 → 不溢出', hi4('0000 1111'), 0);
check('无符号例子 18：高半非 0 → 溢出', hi4('0001 0010') !== 0, true);
check('有符号例子 −6：高半 = 低半符号扩展 → 不溢出', signedOk('1111 1010'), true);
check('有符号例子 −15：高半 ≠ 低半符号扩展 → 溢出', signedOk('1111 0001'), false);
// 总结区「判据不能互换」那组例子
check('0000 1001 = 无符号 9（合法）/ 有符号 9（超 7 溢出）', [bits('0000 1001'), BYTE(bits('0000 1001'))], [9, 9]);
check('1111 1001 = 无符号 249（溢出）/ 有符号 −7（合法）', [bits('1111 1001'), BYTE(bits('1111 1001'))], [249, -7]);
check('总结区两组位模式都写进图里', svg.includes('0000 1001') && svg.includes('1111 1001'), true);

// ---------- 5. jsdom：行号零漂移 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_co_overflow: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  (async () => {
    const raw = read('pwa/data/notes/co_notes.json');
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
        w.fetch = async () => ({ ok: true, status: 200, json: async () => JSON.parse(raw) });
      }
    });
    await new Promise(r => setTimeout(r, 4000));
    const d = dom.window.document;
    check('真实渲染 .anno-line = 1962（改写不动段数、新图不进行号）', d.querySelectorAll('.anno-line').length, 1962);
    const img = [...d.querySelectorAll('img.fig-img')]
      .find(el => (el.getAttribute('src') || '').includes('co_fig_muldiv_overflow'));
    check('本图渲染出来了', !!img, true);
    check('本图不在 <li> 内部', !!img && !img.closest('li'), true);
    console.log('_test_co_overflow: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
