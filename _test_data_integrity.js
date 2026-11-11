// 题库数据完整性回归（2026-11-01）
//
// 背景：用户发现收藏题的解析里幂次全丢了 —— `2^32` 变成 `232`、`3^4` 变成 `34`、
// `3^0` 变成 `3°`、`3^1` 变成 `3&#x27；`，还有整段表格被压平成乱码。
//
// 这类损坏来自一次数据导入（上标/表格转换），不是渲染问题。本测试守住两件事：
//   ① 已知的损坏标记不再出现（&#x27 实体、被当成上标 0 的度数符号）
//   ② 修复过的 13 道题，关键公式必须带 <sup>/<sub>
//
// 用法：node _test_data_integrity.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const BANKS = ['ds', 'co', 'os', 'cn'];

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const bank = {};
for (const k of BANKS) {
  bank[k] = JSON.parse(fs.readFileSync(path.join(ROOT, `pwa/data/${k}.json`), 'utf8'));
}
const qOf = (qid) => {
  const subj = qid.split('_')[0];
  return (bank[subj].questions || []).find(q => q.id === qid);
};
const blobOf = q => [q.content, q.explanation, q.kp_analysis, JSON.stringify(q.options)].join(' ');

console.log('--- 一、损坏标记必须清零 ---');
// &#x27 是转义单引号，但它出现在公式里（如 3&#x27；）就是上标 1 被压坏了
const entityHits = [];
for (const k of BANKS) {
  for (const q of bank[k].questions) {
    if (/&#x27/.test(blobOf(q))) entityHits.push(q.id);
  }
}
check('没有 &#x27 实体残留', entityHits, []);

// ° 只在真角度里合法（ds_0272 的「向右上旋转 45°」），其余都是上标 0 被压坏
const DEGREE_OK = new Set(['ds_0272']);
const degreeHits = [];
for (const k of BANKS) {
  for (const q of bank[k].questions) {
    if (/°/.test(blobOf(q)) && !DEGREE_OK.has(q.id)) degreeHits.push(q.id);
  }
}
check('度数符号只出现在真角度题里', degreeHits, []);

console.log('\n--- 二、修复过的题：公式必须带上标/下标 ---');
const MUST_HAVE_SUP = {
  ds_0211: ['3<sup>h</sup>', 'log<sub>3</sub>'],
  ds_0218: ['3<sup>5</sup>', '3<sup>0</sup>'],
  ds_0471: ['log<sub>3</sub>', 'log<sub>2</sub>'],
  ds_0629: ['n<sub>0</sub>'],
  co_0100: ['2<sup>32</sup>'],
  co_0101: ['2<sup>15</sup>'],
  co_0209: ['2<sup>13</sup>', '16<sup>3</sup>'],
  cn_0078: ['log<sub>10</sub>', '2<sup>10</sup>'],
};
for (const [qid, needles] of Object.entries(MUST_HAVE_SUP)) {
  const q = qOf(qid);
  check(`${qid} 存在`, !!q, true);
  if (!q) continue;
  const miss = needles.filter(n => !(q.explanation || '').includes(n));
  check(`${qid} 解析含 ${needles.join(' / ')}`, miss, []);
}

console.log('\n--- 三、选项层面的幂不能丢 ---');
const q519 = qOf('os_0519');
check('os_0519 存在', !!q519, true);
if (q519) {
  const opts = Object.values(q519.options || {});
  check('os_0519 四个选项都是 2 的幂（带 sup）', opts.every(v => /^2<sup>\d+<\/sup>$/.test(v)), true);
  check('os_0519 选项值', opts, ['2<sup>26</sup>', '2<sup>32</sup>', '2<sup>60</sup>', '2<sup>64</sup>']);
  check('os_0519 解析不再出现「23个」这种压平写法', /最多存储\s*23\s*个/.test(q519.explanation || ''), false);
}

console.log('\n--- 四、解析开头不能残留答案字母 / 标点 ---');
// 数据导入时把答案字母拼到了解析前面：「、D尽管…」「、A、C、A深度优先…」「，A在带头结点…」
const strayStart = [];
const strayCirc = [];
for (const k of BANKS) {
  for (const q of bank[k].questions) {
    const e = String(q.explanation || '').replace(/<[^>]+>/g, '').trim();
    if (e && '、，,；;。'.includes(e[0])) strayStart.push(q.id);
    // 圈码后又跟一个右括号：①）关中断
    if (/[①-⑳]）/.test(q.explanation || '')) strayCirc.push(q.id);
  }
}
check('解析不以标点/答案字母开头', strayStart, []);
check('圈码后没有多余的右括号', strayCirc, []);
check('co_0590 解析的序号已修正', /中断隐指令完成的工作有：①关中断/.test(qOf('co_0590').explanation), true);
check('os_0108 不再以「A」开头', /^<p>C语言编写的程序/.test(qOf('os_0108').explanation), true);

console.log('\n--- 五、笔记插图必须落在小节内 ---');
// 渲染顺序是「小节在前、节级 html 在后」，图放节级会被推到整节末尾，
// 与正文隔着好几屏（2026-11-03 修过：OS 21 张图原本全在节级）。
{
  const notesDir = path.join(ROOT, 'pwa/data/notes');
  const figCount = {};
  for (const k of BANKS) {
    const p = path.join(notesDir, `${k}_notes.json`);
    if (!fs.existsSync(p)) { check(`${k} 笔记文件存在`, false, true); continue; }
    const d = JSON.parse(fs.readFileSync(p, 'utf8'));
    const bad = [];
    let inSub = 0;
    for (const ch of d.chapters || []) {
      for (const sec of ch.sections || []) {
        // 只有「节里还有小节」时，节级 html 才会被排到小节之后、把图推远；
        // 没有小节的整块节（如 2.4 PV 大题总结）其节级 html 本身就是正文，允许放图。
        if (/<img/i.test(sec.html || '') && (sec.subsections || []).length) bad.push(sec.section);
        for (const sub of sec.subsections || []) inSub += ((sub.html || '').match(/<img/gi) || []).length;
      }
    }
    figCount[k] = inSub;
    check(`${k} 节级 html 不含插图`, bad, []);
  }
  check('OS 配图不少于 21 张（精确值见 _test_os_fig_p1）', figCount.os >= 21, true);
  // SPOOLing 那张图必须落在「九、SPOOLing技术」小节
  const osd = JSON.parse(fs.readFileSync(path.join(notesDir, 'os_notes.json'), 'utf8'));
  let hit = null;
  for (const ch of osd.chapters || []) for (const sec of ch.sections || [])
    for (const sub of sec.subsections || []) {
      const h = sub.html || '';
      if (!/<img/i.test(h) || !/spool/i.test(h)) continue;   // 只认"图在这块里"的小节
      hit = h.slice(0, 40).replace(/<[^>]+>/g, '');
    }
  check('SPOOLing 图在 SPOOLing 小节里', /SPOOLing/.test(hit || ''), true);
}

console.log('\n--- 六、笔记引用的图片都存在（防死链） ---');
{
  const missing = [];
  for (const k of BANKS) {
    const p2 = path.join(ROOT, `pwa/data/notes/${k}_notes.json`);
    const d = JSON.parse(fs.readFileSync(p2, 'utf8'));
    for (const ch of d.chapters || []) for (const sec of ch.sections || []) {
      const blobs = [sec.html || '', ...(sec.subsections || []).map(s => s.html || '')];
      for (const h of blobs) {
        for (const m of h.matchAll(/src="(img\/[^"]+)"/g)) {
          if (!fs.existsSync(path.join(ROOT, 'pwa', m[1]))) missing.push(`${k}:${m[1]}`);
        }
      }
    }
  }
  check('笔记图片无死链', missing, []);
  const coFigs = ['co_fig_von_neumann.svg', 'co_fig_mem_hierarchy.svg', 'co_fig_cache_map.svg', 'co_fig_pipeline.svg'];
  check('组成原理四张自绘图已就位', coFigs.filter(f => !fs.existsSync(path.join(ROOT, 'pwa/img', f))), []);
  check('四张图都被笔记引用', coFigs.filter(f =>
    !['os', 'co', 'ds', 'cn'].some(k => fs.readFileSync(path.join(ROOT, `pwa/data/notes/${k}_notes.json`), 'utf8').includes(f))
  ), []);
}

console.log('\n--- 七、基础完整性 ---');
for (const k of BANKS) {
  const qs = bank[k].questions || [];
  const noAnswer = qs.filter(q => !q.answer).map(q => q.id);
  const noContent = qs.filter(q => !q.content).map(q => q.id);
  check(`${k} 每题都有答案`, noAnswer, []);
  check(`${k} 每题都有题干`, noContent, []);
  const emptyOpt = qs.filter(q => {
    const vals = Object.values(q.options || {});
    return vals.length && vals.some(v => !String(v).trim());
  }).map(q => q.id);
  check(`${k} 选项无空值`, emptyOpt, []);
}

console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
process.exit(fail ? 1 : 0);
