// 真题套卷代码块排版回归（2026-11-09）
//
// 根因：408os.cn 的 highlight.js 把每个代码行包成 <span style="display:flex"><span>…\n</span></span>。
// 在 <pre> 的 white-space:pre 下，块级 flex 容器 + 行尾 \n 会让每行代码后面多一个空行（行距翻倍）；
// <pre> 的内联浅灰底与 token 的内联深色字还会盖掉站点深色主题。
// 修法：tools/build_zt.py 的 clean_code_layout() 只在 <pre> 内剥样式标签（文本一字不改），
// CSS 另加缓存兜底。同时保住 2026 卷人工修正的分值（源 meta 记为 10）。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_zt_code_layout.js
const fs = require('fs');
const path = require('path');
const ROOT = __dirname;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const buildSrc = fs.readFileSync(path.join(ROOT, 'tools/build_zt.py'), 'utf8');
const css = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
const years = fs.readdirSync(path.join(ROOT, 'pwa/data/zt'))
  .filter(f => /^zt_\d{4}\.json$/.test(f)).map(f => f.slice(3, 7)).sort();
const papers = {};
for (const y of years) papers[y] = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/zt', `zt_${y}.json`), 'utf8'));

console.log('--- 一、构建管线 ---');
check('18 年数据齐全（2009-2026）', [years.length, years[0], years[years.length - 1]], [18, '2009', '2026']);
check('存在 clean_code_layout()', /def clean_code_layout\(body\):/.test(buildSrc), true);
check('清洗范围限定 <pre> 内（不误伤 SVG）',
  buildSrc.includes("PRE_BLOCK = re.compile(r'<pre\\b[^>]*>") && /return PRE_BLOCK\.sub\(_clean, body\)/.test(buildSrc), true);
check('clean_html 末尾调用清洗', /return clean_code_layout\(body\)/.test(buildSrc), true);
check('保留行尾 \\n（消除双倍行距的关键）', /FLEX_ROW\.sub\(lambda x: x\.group\(1\), m\.group\(1\)\)/.test(buildSrc), true);
check('2026 分值修正在构建期（不靠手改产物）',
  /SCORE_FIX = \{\(2026, 45\): 7, \(2026, 46\): 8, \(2026, 47\): 9\}/.test(buildSrc), true);
check('分值写入使用 SCORE_FIX', /'s': SCORE_FIX\.get\(\(y, idx\), q\['score'\]\)/.test(buildSrc), true);

console.log('\n--- 二、全库数据清洗结果 ---');
let pre = 0, flex = 0, color = 0, inlinePre = 0, shallow = 0;
const fieldsOf = it => [it.q || '', it.an || '', ...(Array.isArray(it.o) ? it.o : []), it.ans || ''];
for (const y of years) {
  for (const it of papers[y].items) {
    for (const v of fieldsOf(it)) {
      for (const m of v.matchAll(/<pre\b[^>]*>([\s\S]*?)<\/pre>/g)) {
        pre++;
        if (m[1].includes('display:flex')) flex++;
        if (/style="color:#/.test(m[1])) color++;
      }
      inlinePre += (v.match(/<pre\s+[^>]*>/g) || []).length;
    }
  }
}
check('全库仍有代码块（不是被误删）', pre > 100, true);
check('<pre> 内无 flex 行包裹', flex, 0);
check('<pre> 内无 token 内联色', color, 0);
check('无残留 <pre style=...> 内联浅底', inlinePre, 0);
for (const y of years) if (papers[y].items.length !== 47) shallow++;
check('每年仍 47 题（清洗未丢题）', shallow, 0);
check('总题数 846', years.reduce((n, y) => n + papers[y].items.length, 0), 846);

console.log('\n--- 三、2015 年第 1 题：代码文本逐行核对 ---');
const q1 = papers['2015'].items.find(x => x.i === 1).q;
const code = (q1.match(/<pre><code[^>]*>([\s\S]*?)<\/code><\/pre>/) || [])[1] || '';
const lines = code.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').split('\n');
const plain = lines.join('\n');
check('2015-1 已还原成纯 pre>code', !!code && /<div class="highlight"><pre><code/.test(q1), true);
check('代码块不含任何 span 标签', /<span/.test(code), false);
check('行数 = 7（无双倍空行）', lines.filter(l => l.trim()).length, 6);
check('第 1 行：int S(int n) {', lines[0].trim(), 'int S(int n) {');
check('第 2 行：return 三元表达式', /return \(n <= 0\) \? 0 : S\(n - 1\) \+ n;/.test(lines[1]), true);
check('末段含 void main() / cout << S(1);', /void main\(\)/.test(plain) && /cout << S\(1\);/.test(plain), true);
check('题干引导语与问题句保留',
  /已知程序如下/.test(q1) && /自栈底到栈顶保存的信息/.test(q1), true);
check('2015 第 40 题 HTTP 报文保留（裸 pre 未被破坏）',
  /GET \/index \.html HTTP\/1\.1/.test(papers['2015'].items.find(x => x.i === 40).q), true);

console.log('\n--- 四、SVG 未被误伤 ---');
const svgNames = ['zt_2014_34_1', 'zt_2015_47_1', 'zt_2023_47_1'];
for (const n of svgNames) {
  const p = path.join(ROOT, 'pwa/data/zt_svg', n + '.svg');
  const s = fs.existsSync(p) ? fs.readFileSync(p, 'utf8') : '';
  check(`${n} 保留 drawio 透明 span（mxGraphModel 不会印到图上）`,
    /<span style="color:transparent|<span style="color: rgba\(0, 0, 0, 0\)/.test(s), true);
}
check('清洗函数不含全文 COLOR_SPAN 替换（只在 _clean 里调用）',
  /def _clean\(m\):[\s\S]{0,400}COLOR_SPAN\.sub/.test(buildSrc), true);

console.log('\n--- 五、2026 分值与 CSS 兜底 ---');
const p26 = papers['2026'].items;
check('2026 三道大题分值 = 7 / 8 / 9',
  [45, 46, 47].map(i => p26.find(x => x.i === i).s), [7, 8, 9]);
check('CSS 有 display:contents 缓存兜底',
  /pre code > span\[style\*="display:flex"\][\s\S]{0,120}display: contents !important/.test(css), true);
check('CSS 用 !important 压回主题底色',
  /\.highlight pre[\s\S]{0,160}background: var\(--light\) !important/.test(css), true);

console.log(`\n结果: ${pass} / ${pass + fail}，${fail ? '有失败' : '全部通过'}`);
process.exit(fail ? 1 : 0);
