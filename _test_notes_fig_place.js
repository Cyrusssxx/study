// 笔记配图落位回归（2026-11-04 二次修订）
//
// 用户要求变更：
//   旧约定「配图统一放小节末尾（★ 高频真题考点与陷阱之前）」→ 已废弃。
//   新约定「配图必须插在它所讲的那段知识点之后」，也就是图跟着正文走，
//   而不是全堆在节末当插图集。
//
// 因此本测试锁四件事：
//   一、逐张核对关键配图的锚点（前一段是讲它的正文、后一段是下一个知识点）；
//   二、全库不得有配图落在「★ 高频真题考点与陷阱」之后（那等于回到节末）；
//   三、每张配图前面必须紧跟块级正文（p/li/figure/table），不能直接吊在标题下；
//   四、图块（data-fig）不参与行号标注，避免行号整体后移让已存批注错位。
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_notes_fig_place.js
const fs = require('fs');
const path = require('path');

const ROOT = __dirname;
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const load = sub => JSON.parse(fs.readFileSync(path.join(ROOT, 'pwa/data/notes', `${sub}_notes.json`), 'utf8'));
const OS = load('os');
const CO = load('co');

function findHtml(doc, prefix) {
  for (const ch of doc.chapters) {
    for (const sec of ch.sections) {
      if ((sec.section || '').startsWith(prefix)) return sec.html || '';
      for (const s2 of sec.subsections || []) {
        if ((s2.section || '').startsWith(prefix)) return s2.html || '';
      }
    }
  }
  return null;
}

// 断言 order：parts 依次出现在 html 中（严格递增）
function inOrder(html, ...parts) {
  let at = -1;
  for (const p of parts) {
    const i = html.indexOf(p, at + 1);
    if (i < 0) return false;
    at = i;
  }
  return true;
}

console.log('--- 一、OS 4.2.6：两张图分别跟住「隐式链接」「显式链接」 ---');
{
  const h = findHtml(OS, '4.2.6');
  check('找到 4.2.6', !!h, true);
  check('图4.11 在「产生内部碎片。」之后、「（2）显式链接（FAT）」之前',
    inOrder(h, '产生内部碎片。', 'os_fig_4_11_link.png', '（2）显式链接（FAT）'), true);
  check('图4.12 在「隐式与显式的核心对比」之后、「九、索引分配」之前',
    inOrder(h, '隐式与显式的核心对比', 'os_fig_4_12_fat.png', '<h4>九、索引分配'), true);
  check('图4.11 在图4.12 之前（顺序不乱）',
    h.indexOf('os_fig_4_11_link.png') < h.indexOf('os_fig_4_12_fat.png'), true);
}

console.log('\n--- 二、OS 4.2.3：四种目录结构各自带图（图跟条目走） ---');
{
  const h = findHtml(OS, '4.2.3');
  check('图4.6 单级：在单级条目之后、两级之前',
    inOrder(h, '单级目录结构：整个文件系统仅维护一张全局目录表', 'os_fig_4_6_dir1.png', '两级目录结构：把目录划分为主文件目录'), true);
  check('图4.7 两级：在两级条目之后、树形之前',
    inOrder(h, '两级目录结构：把目录划分为主文件目录', 'os_fig_4_7_dir2.png', '树形目录结构（主流）'), true);
  check('图4.8 树形：在树形条目之后、无环图之前',
    inOrder(h, '树形目录结构（主流）', 'os_fig_4_8_tree.png', '无环图目录结构：为支持共享'), true);
  check('图4.9 无环图：在无环图条目之后、图目录结构之前',
    inOrder(h, '无环图目录结构：为支持共享', 'os_fig_4_9_dag.png', '图目录结构：若目录结构中允许出现环'), true);
}

console.log('\n--- 三、OS 5.3.3：六张磁盘调度图各自跟住对应算法 ---');
{
  const h = findHtml(OS, '5.3.3');
  const pairs = [
    ['FCFS', '平均寻道长度 = 498/9', 'os_fig_5_22_fcfs.png', '（2）最短寻道时间优先（SSTF）'],
    ['SSTF', '很多考生漏掉38', 'os_fig_5_23_sstf.png', '<h4>六、SCAN'],
    ['SCAN', '平均寻道长度 = 282/9', 'os_fig_5_24_scan.png', '（4）LOOK算法'],
    ['LOOK', '平均寻道长度 = 250/9', 'os_fig_5_26_look.png', '对比可知：LOOK比SCAN'],
    ['C-SCAN', '平均寻道长度 = 390/9', 'os_fig_5_25_cscan.png', '（6）C-LOOK算法'],
    ['C-LOOK', 'C-LOOK比C-SCAN少了', 'os_fig_5_27_clook.png', '方向变式例题'],
  ];
  for (const [name, before, img, after] of pairs) {
    check(`${name} 图在算法讲解之后、下一个知识点之前`, inOrder(h, before, img, after), true);
  }
}

console.log('\n--- 四、OS 其余关键图：跟着各自知识点走 ---');
{
  check('3.1.3 图3.8 跟住「无快表时两次访存」',
    inOrder(findHtml(OS, '3.1.3'), '这显著降低系统性能。', 'os_fig_3_8_paging.png', '页表项大小'), true);
  check('3.1.3 图3.9 跟住「快表未命中」',
    inOrder(findHtml(OS, '3.1.3'), '同时将该页表项', 'os_fig_3_9_tlb.png', '有效访问时间EAT'), true);
  check('3.1.4 图3.15 跟住「分段地址变换过程」',
    inOrder(findHtml(OS, '3.1.4'), '据此访存', 'os_fig_3_15_seg.png', '段的共享与保护'), true);
  check('3.1.4 图3.18 跟住「段页式地址变换」',
    inOrder(findHtml(OS, '3.1.4'), '引入快表后，其表项包含关键字', 'os_fig_3_18_segpaged.png', '★ 高频真题考点与陷阱'), true);
  check('3.2.2 图3.20 跟住「访存次数小结」',
    inOrder(findHtml(OS, '3.2.2'), '访存次数小结', 'os_fig_3_20_pagereq.png', '快表命中则页必在内存'), true);
  check('4.1.1 图4.1 跟住「文件系统的组织方式（三个层次）」',
    inOrder(findHtml(OS, '4.1.1'), '文件系统的内部组织', 'os_fig_4_1_fslevel.png', '二、文件的属性与分类'), true);
  check('5.2.4 图5.15 跟住「SPOOLing 的组成四部分」',
    inOrder(findHtml(OS, '5.2.4'), '井管理程序', 'os_fig_5_15_spool.png', 'SPOOLing的工作原理'), true);
  check('2.1.3 图2.1 紧跟自绘示意图（figure 之后）',
    inOrder(findHtml(OS, '2.1.3'), '</figure>', 'os_fig_2_1_mem.png', '★ 高频真题考点与陷阱'), true);
  check('2.1.4 图2.2 紧跟自绘示意图（figure 之后）',
    inOrder(findHtml(OS, '2.1.4'), '</figure>', 'os_fig_2_2_state.png', '★ 高频真题考点与陷阱'), true);
}

console.log('\n--- 五、CO 四张图：跟着各自知识点走 ---');
{
  check('1.2.2 冯诺依曼图跟住「五大部件」',
    inOrder(findHtml(CO, '1.2.2'), '五大部件组成。', 'co_fig_von_neumann.svg', '现代计算机的功能部件'), true);
  check('3.1.3 存储层次图跟住「多级存储结构」首段',
    inOrder(findHtml(CO, '3.1.3'), '多级存储结构：寄存器', 'co_fig_mem_hierarchy.svg', 'Cache-主存层'), true);
  check('3.5.3 Cache 映射图跟住「三种映射对比」',
    inOrder(findHtml(CO, '3.5.3'), '标记存储开销', 'co_fig_cache_map.svg', 'Cache 行数远少于主存块数'), true);
  check('5.6.1 流水线时空图跟住「五段流水线」',
    inOrder(findHtml(CO, '5.6.1'), '第 k 条指令译码时可启动第 k+1 条取指。', 'co_fig_pipeline.svg', '流水线对指令集的要求'), true);
}

console.log('\n--- 六、全库体检：没有图落在「★ 高频真题考点与陷阱」之后 ---');
{
  const bad = [], dangling = [];
  for (const [sub, doc] of [['os', OS], ['co', CO]]) {
    for (const ch of doc.chapters) {
      const cells = [];
      for (const sec of ch.sections) {
        cells.push([sec.section, sec.html || '']);
        for (const s2 of sec.subsections || []) cells.push([s2.section, s2.html || '']);
      }
      for (const [label, html] of cells) {
        const star = html.lastIndexOf('★ 高频真题考点与陷阱');
        for (const m of html.matchAll(/<img[^>]*src="([^"]+)"/g)) {
          const name = sub + ':' + label + ':' + m[1].split('/').pop();
          if (star > -1 && m.index > star) bad.push(name);
          // 图前 400 字内必须出现块级内容的收尾标签，不能直接挂在标题下
          const before = html.slice(Math.max(0, m.index - 400), m.index);
          if (!/<\/(p|li|figure|table|td)>\s*(<p[^>]*>\s*)*$/.test(before)) dangling.push(name);
        }
      }
    }
  }
  check('没有配图落在 ★ 高频考点段之后（= 不再堆到节末）', bad, []);
  check('每张配图都紧跟在正文块之后（不直接吊在标题下）', dangling, []);
}

console.log('\n--- 七、图块不参与行号 / 样式兜底 ---');
{
  const notes = fs.readFileSync(path.join(ROOT, 'pwa/notes.html'), 'utf8');
  check('indexSection 跳过 data-fig 图块',
    /if \(el\.hasAttribute\('data-fig'\) \|\| el\.closest\('\[data-fig\]'\)\) return;/.test(notes), true);
  const css = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
  check('CSS 有 li 内图块的缩进兜底', /\.notes-body li > p\[data-fig\]\s*\{[^}]*margin-left:\s*-24px/.test(css), true);
  // 图题与图必须成对：每个 <img class="fig-img"> 前面都紧邻一个 <b>…</b> 图题
  const paired = [];
  for (const [sub, doc] of [['os', OS], ['co', CO]]) {
    for (const ch of doc.chapters) {
      for (const sec of ch.sections) {
        for (const cell of [sec, ...(sec.subsections || [])]) {
          const h = cell.html || '';
          if (!/<img[^>]*class="fig-img"/.test(h)) continue;
          const imgs = (h.match(/<img[^>]*class="fig-img"/g) || []).length;
          const caps = (h.match(/<b>[^<]{0,160}<\/b><\/p>\s*(?:<p[^>]*>\s*)?<img[^>]*class="fig-img"/g) || []).length;
          if (caps !== imgs) paired.push(`${sub}:${cell.section} 图题${caps}/图${imgs}`);
        }
      }
    }
  }
  check('每个图块都有配套图题（图题数 = 图片数）', paired, []);
}

console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
process.exit(fail ? 1 : 0);
