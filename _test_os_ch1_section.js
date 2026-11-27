// OS 第1章 0065-0086 分节回归（2026-11-27）
//
// 背景：用户报「1.6 虚拟机 · 2022 统考真题（OS 初始化创建中断向量表）知识点映射全错」。
// 根因：os_0065~os_0086 共 22 题全部被标成 section=1.6 虚拟机、subsection=1.6.1，
// 实际混了三类内容：操作系统结构（分层/模块化/宏微内核/外核）、操作系统引导
// （BIOS/MBR/PBR/内核初始化）、虚拟机（VMM/虚拟化）。笔记里 1.4/1.5/1.6 三节都在，
// 但题库里 1.4/1.5 是 0 题，题卡「知识点」和 📖 跳转全落到 1.6 虚拟机。
//
// 本测试守住：
//   ① 22 题按考点分析重分到 1.4（11 题）/1.5（7 题）/1.6（4 题）
//   ② 无子节的题不能留 subsection（否则 📖 跳到不存在的 1.6.1）
//   ③ section 必须是笔记里真实存在的节名（题卡链接目标不落空）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_os_ch1_section.js
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const ROOT = __dirname;
const bank = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/os.json'), 'utf8'));
const notes = JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/notes/os_notes.json'), 'utf8'));
const byId = new Map(bank.questions.map(q => [q.id, q]));
const secOf = id => (byId.get(id) || {}).section;
const subOf = id => (byId.get(id) || {}).subsection || '';

console.log('--- 一、22 题分节归属 ---');
// 1.4 操作系统结构：分层式 / 模块化 / 宏内核 / 微内核 / 外核
const STRUCT = [65, 66, 67, 68, 69, 70, 71, 72, 73, 74, 85].map(n => `os_${String(n).padStart(4, '0')}`);
// 1.5 操作系统引导：ROM 自举 / 引导扇区 / MBR / 开机加载 / 内核初始化创建中断向量表
const BOOT = [75, 76, 77, 78, 79, 83, 84].map(n => `os_${String(n).padStart(4, '0')}`);
// 1.6 虚拟机：虚拟机概念 / VMware / VMM / 2025 虚拟化技术
const VM = [80, 81, 82, 86].map(n => `os_${String(n).padStart(4, '0')}`);

check('1.4 结构共 11 题', STRUCT.map(secOf).filter(s => s === '1.4 操作系统结构').length, 11);
check('1.5 引导共 7 题', BOOT.map(secOf).filter(s => s === '1.5 操作系统引导').length, 7);
check('1.6 虚拟机共 4 题', VM.map(secOf).filter(s => s === '1.6 虚拟机').length, 4);
check('os_0065 分层式结构不再是 1.6', secOf('os_0065'), '1.4 操作系统结构');
check('os_0084 2022 真题创建中断向量表归 1.5 引导', secOf('os_0084'), '1.5 操作系统引导');
check('os_0083 2013 真题开机加载 OS 归 1.5 引导', secOf('os_0083'), '1.5 操作系统引导');
check('os_0085 2023 真题微内核归 1.4 结构', secOf('os_0085'), '1.4 操作系统结构');
check('os_0086 2025 真题虚拟化保留 1.6', secOf('os_0086'), '1.6 虚拟机');

console.log('--- 二、subsection 自洽 ---');
const noSub = [...STRUCT, ...BOOT];
check('1.4/1.5 的 18 题均无 subsection', noSub.map(subOf).filter(Boolean), []);
check('1.6 的 4 题 subsection 正确', VM.map(subOf),
  VM.map(() => '1.6.1 虚拟机的基本概念'));

console.log('--- 三、section 必须是笔记真实节名 ---');
const noteSecs = new Set((notes.chapters[0].sections || []).map(s => s.section));
for (const qid of [...STRUCT, ...BOOT, ...VM]) {
  check(`${qid} 的 section 在笔记中存在`, noteSecs.has(secOf(qid)), true);
}
check('笔记 1.4 节存在', noteSecs.has('1.4 操作系统结构'), true);
check('笔记 1.5 节存在', noteSecs.has('1.5 操作系统引导'), true);
check('笔记 1.6 节存在', noteSecs.has('1.6 虚拟机'), true);

console.log('--- 四、题库完整性 ---');
check('OS 题库总数仍是 652', bank.questions.length, 652);
const ids = bank.questions.map(q => q.id);
check('题号无重复', new Set(ids).size, ids.length);
check('题号连续 0001..0652', ids.every((id, i) => id === `os_${String(i + 1).padStart(4, '0')}`), true);

console.log(`\n结果: ${pass} / ${pass + fail}，${fail ? `${fail} 失败` : '全部通过'}`);
process.exit(fail ? 1 : 0);
