// 将 21 张王道原图插入 os_notes.json 对应小节
// 用法: node tools/insert_os_figs.js            # 预览插入位置
//       node tools/insert_os_figs.js --apply    # 写回
const fs = require('fs');
const path = require('path');
const FILE = path.resolve(__dirname, '..', 'pwa', 'data', 'notes', 'os_notes.json');

const IMG = f => `<img class="fig-img" src="img/${f}.png" style="max-width:100%;border:1px solid var(--border);border-radius:var(--radius);display:block;margin:8px auto;"/>`;
const cap = t => `<p class="paragraph"><b>${t}</b></p>`;

// 每个目标小节：标题行 + [图文件, 说明文字]
const PLAN = [
  {
    section: '2.1 进程与线程简介',
    title: '📌 必看图 · 王道原图',
    figs: [
      ['os_fig_2_1_mem', '图2.1 一个典型进程在内存中的映像——堆/栈增长方向、各段存放内容，常考概念题'],
      ['os_fig_2_2_state', '图2.2 五种进程状态的转换——转换方向、主动/被动、触发事件，年年必考'],
    ],
  },
  {
    section: '3.1 内存管理概念',
    title: '📌 必看图 · 地址变换四连图（王道原图）',
    figs: [
      ['os_fig_3_8_paging', '图3.8 分页系统的地址变换机构——基本分页查表流程与越界检查位置'],
      ['os_fig_3_9_tlb', '图3.9 具有快表(TLB)的地址变换机构——快表命中/未命中的访问次数差异，综合题必考'],
      ['os_fig_3_15_seg', '图3.15 分段系统的地址变换过程——与分页对比：按段号查段表、越界检查位置不同'],
      ['os_fig_3_18_segpaged', '图3.18 段页式系统的地址变换机构——先查段表再查页表，三次访存来源'],
    ],
  },
  {
    section: '3.2 虚拟内存管理',
    title: '📌 必看图 · 缺页处理全流程（王道原图）',
    figs: [
      ['os_fig_3_20_pagereq', '图3.20 请求分页中的地址变换过程——TLB→页表→缺页中断→调入主存的完整链路，缺页中断处理流程尽在此图'],
    ],
  },
  {
    section: '4.1 文件系统基础',
    title: '📌 必看图 · 王道原图',
    figs: [
      ['os_fig_4_1_fslevel', '图4.1 文件系统层次结构——从 I/O 控制到应用接口的分层职责，常考选择题'],
    ],
  },
  {
    section: '4.2 目录与文件',
    title: '📌 必看图 · 目录演进与 FAT（王道原图）',
    figs: [
      ['os_fig_4_6_dir1', '图4.6 单级目录结构——目录结构演进的起点'],
      ['os_fig_4_7_dir2', '图4.7 两级目录结构——主文件目录+用户文件目录'],
      ['os_fig_4_8_tree', '图4.8 树形目录结构——绝对/相对路径的基础'],
      ['os_fig_4_9_dag', '图4.9 无环图目录结构——共享节点与共享计数器，理解删除语义'],
      ['os_fig_4_11_link', '图4.11 隐式链接方式——指针藏在每个盘块里，访问只能顺序追链'],
      ['os_fig_4_12_fat', '图4.12 磁盘的文件分配表(FAT)——显式链接：FAT 整表常驻内存，指针位置与隐式链接的区别直接影响计算题'],
    ],
  },
  {
    section: '5.2 设备独立性软件',
    intro: '<p class="paragraph">本节要点图：SPOOLing（假脱机技术）的结构组成。</p>',
    title: '📌 必看图 · 王道原图',
    figs: [
      ['os_fig_5_15_spool', '图5.15 SPOOLing系统的组成——输入井/输出井与输入/输出缓冲区的数据流向，井和缓冲区的位置最易混'],
    ],
  },
  {
    section: '5.3 磁盘和固态硬盘',
    intro: '<p class="paragraph">本节要点图：六种磁盘调度算法的磁头移动轨迹对比（同一请求队列）。</p>',
    title: '📌 必看图 · 六种磁盘调度算法轨迹（王道原图）',
    figs: [
      ['os_fig_5_22_fcfs', '图5.22 FCFS——按到达顺序服务，轨迹最乱'],
      ['os_fig_5_23_sstf', '图5.23 SSTF——每次选最近请求，可能饥饿'],
      ['os_fig_5_24_scan', '图5.24 SCAN（电梯）——沿一个方向扫到底才回头'],
      ['os_fig_5_25_cscan', '图5.25 C-SCAN——单方向扫描，回到端点直达另一端'],
      ['os_fig_5_26_look', '图5.26 LOOK——SCAN 但不到端点即回头'],
      ['os_fig_5_27_clook', '图5.27 C-LOOK——C-SCAN 但不到端点即折返'],
    ],
  },
];

const data = JSON.parse(fs.readFileSync(FILE, 'utf8'));
let preview = [];
for (const ch of data.chapters) {
  for (const sec of ch.sections) {
    const p = PLAN.find(x => x.section === sec.section);
    if (!p) continue;
    let block = `\n<h4>${p.title}</h4>\n` + (p.intro ? p.intro + '\n' : '');
    for (const [f, desc] of p.figs) {
      block += cap(desc) + '\n' + IMG(f) + '\n';
    }
    preview.push(`${sec.section}: ${sec.html.length} -> ${sec.html.length + block.length} (+${p.figs.length}图)`);
    if (process.argv.includes('--apply')) {
      sec.html = (sec.html + '\n' + block).trim();
    }
  }
}
console.log(preview.join('\n'));
if (process.argv.includes('--apply')) {
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2) + '\n');
  console.log('WRITTEN');
} else {
  console.log('(预览模式，未写入)');
}
