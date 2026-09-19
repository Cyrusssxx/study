// cn_graph.html 计网分层考点图谱 回归测试
//
// 覆盖点：
//   1) 页面加载无脚本错误；7 个层区块（概述/应用/传输/网络/链路/物理/跨层）齐全
//   2) 顶部层跳转链接的 href 目标元素都存在（不会点了没反应）
//   3) 点层标题可折叠/展开，箭头文案同步翻转
//   4) 「折叠全部 / 展开全部」按钮批量生效且文案切换
//   5) 首部长度标注（TCP 20B / IP 20B / MAC 14B / FCS 4B / 前导码 8B）在封装图中齐全
//   6) 全篇考点关键词覆盖（防止后续编辑误删核心考点）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_cn_graph.js
const fs = require('fs');
const path = require('path');

let JSDOM = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }

if (!JSDOM) {
  console.log('跳过：需要 jsdom（NODE_PATH=<workspace>/node_modules）');
  process.exit(0);
}

const ROOT = __dirname;
const SRC = fs.readFileSync(path.resolve(ROOT, 'pwa/cn_graph.html'), 'utf8');

let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const errors = [];
  const vc = new VirtualConsole();
  vc.on('jsdomError', e => errors.push(e.message));

  const dom = new JSDOM(SRC, {
    url: 'http://localhost/cn_graph.html',   // 有 origin 才启用 localStorage（页面头部用它判夜间模式）
    runScripts: 'dangerously',
    virtualConsole: vc,
    beforeParse(w) {
      w.scrollTo = () => { };
    }
  });
  const w = dom.window;
  const doc = w.document;
  await sleep(60);

  console.log('--- 场景 1：结构与脚本 ---');
  check('页面加载无脚本错误', errors.length, 0);
  if (errors.length) errors.slice(0, 3).forEach(e => console.log('     ', e));
  check('层区块共 7 个', doc.querySelectorAll('.cg-layer').length, 7);
  check('主标题含「分层考点图谱」', /分层考点图谱/.test(doc.title), true);
  check('cgToggle 已定义', typeof w.cgToggle, 'function');
  check('cgToggleAll 已定义', typeof w.cgToggleAll, 'function');

  console.log('\n--- 场景 2：层跳转链接指向有效目标 ---');
  const links = [...doc.querySelectorAll('.cg-jump a')];
  check('跳转链接 7 个', links.length, 7);
  const badHref = links.filter(a => !doc.querySelector(a.getAttribute('href')));
  check('全部指向存在的元素', badHref.map(a => a.getAttribute('href')), []);
  const ids = links.map(a => a.getAttribute('href').slice(1));
  check('覆盖 L0/L5/L4/L3/L2/L1/LX', ids.sort().join(','), 'L0,L1,L2,L3,L4,L5,LX');

  console.log('\n--- 场景 3：单层折叠 / 展开 ---');
  const sec5 = doc.getElementById('L5');
  const head5 = sec5.querySelector('.cg-layer-head');
  check('默认展开', sec5.classList.contains('collapsed'), false);
  check('箭头初始为「▾ 折叠」', head5.querySelector('.cg-layer-arrow').textContent, '▾ 折叠');
  w.cgToggle(head5);
  await sleep(20);
  check('点击后折叠', sec5.classList.contains('collapsed'), true);
  check('箭头变为「▸ 展开」', head5.querySelector('.cg-layer-arrow').textContent, '▸ 展开');
  w.cgToggle(head5);
  await sleep(20);
  check('再点恢复展开', sec5.classList.contains('collapsed'), false);

  console.log('\n--- 场景 4：折叠全部 / 展开全部 ---');
  const btn = doc.getElementById('cgFoldBtn');
  btn.click();
  await sleep(20);
  check('全部折叠', [...doc.querySelectorAll('.cg-layer')].every(s => s.classList.contains('collapsed')), true);
  check('按钮文案变「展开全部」', btn.textContent, '展开全部');
  btn.click();
  await sleep(20);
  check('全部展开', [...doc.querySelectorAll('.cg-layer')].every(s => !s.classList.contains('collapsed')), true);
  check('按钮文案变回「折叠全部」', btn.textContent, '折叠全部');

  console.log('\n--- 场景 5：封装图结构 ---');
  const encRows = doc.querySelectorAll('.cg-enc-row');
  check('封装图 4 层（TCP→IP→MAC→物理）', encRows.length, 4);
  const encTags = [...encRows].map(r => r.querySelector('.cg-enc-tag').textContent.replace(/\s+/g, ''));
  check('四层标签顺序正确', encTags.map(t => t.slice(0, 3)), ['传输层', '网络层', '链路层', '物理层']);
  const encText = doc.querySelector('.cg-enc').textContent;
  ['20B', '14B', '4B', '8B', '前导码', 'FCS'].forEach(tok => {
    check(`封装图含标注「${tok}」`, encText.includes(tok), true);
  });

  console.log('\n--- 场景 6：考点关键词覆盖 ---');
  const body = doc.body.textContent;
  const KEYWORDS = [
    'CSMA/CD', '最短帧长', '截断二进制指数退避', 'CSMA/CA', '隐蔽站',
    '三次握手', '四次挥手', 'TIME_WAIT', '2MSL', 'SYN', 'FIN',
    '慢开始', '拥塞避免', '快重传', '快恢复', '接收窗口', '拥塞窗口',
    '海明码', 'CRC', '零比特填充', '字节填充',
    '后退 N 帧', '选择重传', '停止等待', '信道利用率',
    '子网掩码', 'CIDR', '路由聚合', '最长前缀匹配', '片偏移',
    'ARP', 'ICMP', 'traceroute', 'DHCP', 'NAT', 'IPv6',
    'OSPF', 'RIP', 'BGP', '自治系统',
    '奈奎斯特', '香农', '曼彻斯特', 'PCM', 'CDMA',
    'VLAN', '冲突域', '广播域', 'PPP', 'HDLC',
    '端口', '私有地址', '域名服务器', 'HTTP', 'SMTP', 'POP3', 'FTP'
  ];
  const missing = KEYWORDS.filter(k => !body.includes(k));
  check(`考点关键词 ${KEYWORDS.length} 个全部覆盖`, missing, []);

  console.log('\n--- 场景 7：表格与考点条目 ---');
  check('对比表格 ≥ 19 张', doc.querySelectorAll('.cg-tb').length >= 19, true);
  check('考点条目 ≥ 130 条', doc.querySelectorAll('.cg-pts > li').length >= 130, true);
  check('协议字段盒存在（≥ 8 组）', doc.querySelectorAll('.cg-fields').length >= 8, true);
  check('cwnd 曲线 SVG 存在', doc.querySelectorAll('.cg-chart svg').length, 1);

  console.log(`\nPASS ${pass} / FAIL ${fail}`);
  process.exit(fail ? 1 : 0);
})();
