// 计网题库数据完整性回归：
//  1) number 全局 1..N 连续唯一，id 与 number 一一对应
//  2) 5 个补齐节的 _pdf_qno 按节连续（1.1=17 1.2=38 4.2=72 5.3=61 6.5=19）
//  3) 6 道新增多空题：answer 字母数 == blank_opts 数 == 题干 (①..) 空数
//  4) 题干/答案引用的所有图片文件存在
// 用法：node _test_cn_numbering.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
const data = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/cn.json'), 'utf8'));
const qs = data.questions;

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

// 1) number 连续唯一
check('总数 564', data.total, 564);
check('questions 长度', qs.length, 564);
check('number 1..564 连续', qs.map(q => q.number), Array.from({ length: 564 }, (_, i) => i + 1));
check('number 无重复', new Set(qs.map(q => q.number)).size, 564);
check('id 与 number 对应', qs.every(q => q.id === 'cn_' + String(q.number).padStart(4, '0')), true);

// 2) 全部节 _pdf_qno 按节连续 1..N（教材题号）
const secCount = {};
for (const q of qs) secCount[q.section] = (secCount[q.section] || 0) + 1;
const allSecs = Object.keys(secCount);
check('共 28 个节', allSecs.length, 28);
let qnoOK = true;
for (const sec of allSecs) {
  const qnos = qs.filter(q => q.section === sec).map(q => q._pdf_qno);
  const want = Array.from({ length: secCount[sec] }, (_, i) => i + 1);
  if (JSON.stringify(qnos) !== JSON.stringify(want)) { qnoOK = false; console.log('  ✗', sec, '题号不连续'); }
}
check('全部节 _pdf_qno 按节 1..N 连续', qnoOK, true);

// 3) 多空题结构
const multi = qs.filter(q => q.multi_blank);
check('多空题共 6 道', multi.length, 6);
for (const q of multi) {
  const blankN = (q.content.match(/\([①-⑩]\)|\(\s*\)/g) || []).length;
  const optN = (q.blank_opts || []).length;
  const ansN = (q.answer || '').length;
  check(`${q.id} 空数=${blankN} 选项组=${optN} 答案字母=${ansN}`, [blankN, optN, ansN], [optN, optN, optN]);
  check(`${q.id} 答案字母均有效`, /^[A-D]+$/.test(q.answer || ''), true);
}

// 4) 图片引用存在
const imgs = new Set();
for (const q of qs) {
  for (const m of (q.content + ' ' + (q.explanation || '')).matchAll(/src="([^"]+)"/g)) imgs.add(m[1]);
}
let missing = [];
for (const p of imgs) if (!fs.existsSync(path.join(ROOT, 'pwa', p))) missing.push(p);
check('引用的图片全部存在', missing, []);
if (missing.length) console.log('  缺失:', missing);

console.log(`\n结果：${pass} 通过 / ${fail} 失败`);
process.exit(fail ? 1 : 0);
