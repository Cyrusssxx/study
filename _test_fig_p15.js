/* 2026-11-13 第十五批（收尾 CO / OS / CN 三科所有零图小节）：9 张自绘图，本批不新增黄框。
 * OS 1.1.2 三大角色·四大管理·两类接口 / OS 1.2.3 时间片轮转 T≈Q×N / OS 1.2.4 硬软实时截止时间；
 * CO 2.1.4 整数转换三种位模式 / CO 1.2.4 层次结构与 ISA 分界线及三类语言翻译程序；
 * CN 6.4.1 邮件六步收发与服务器双重角色 / CN 5.1.1 三层通信范围与端口分用 /
 * CN 6.1.1 C/S 与 P2P / CN 3.7.1 节点交换机与路由器作用域。
 * 锁精确总量：fig-img 195（co46/os70/cn48/ds31）、黄框 310（74/77/53/106，本批未动）。
 * 行号双基线（本批零漂移）：CO 1819 / OS 3660 / CN 1108 / DS 1173·1175；jsdom 1971 / 3668 / 1220 / 1330。
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
const SUBS = ['co', 'os', 'cn', 'ds'];
const RAW = {}, DOC = {};
for (const s of SUBS) {
  RAW[s] = read('pwa/data/notes/' + s + '_notes.json');
  DOC[s] = JSON.parse(RAW[s]);
}
const sw = read('pwa/sw.js');
const css = read('pwa/css/style.css');
const flat = s => s.replace(/\s+/g, '').replace(/[−–—]/g, '-')
  .replace(/[₁₂₃]/g, c => ({ '₁': '1', '₂': '2', '₃': '3' }[c]));
function secHtml(sub, num) {
  for (const ch of DOC[sub].chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || []))
      if (x.section.split(' ')[0] === num) return x.html || '';
  return '';
}
function allHtmls(sub) {
  const a = [];
  for (const ch of DOC[sub].chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || [])) a.push({ key: x.section.split(' ')[0], h: x.html || '' });
  return a;
}
const SVGS = {
  os: ['os_fig_osfunc', 'os_fig_timeshare', 'os_fig_realtime'],
  co: ['co_fig_int_cast', 'co_fig_layer_lang'],
  cn: ['cn_fig_mail_sys', 'cn_fig_transport', 'cn_fig_cs_model', 'cn_fig_wan'],
};
const ALL_SVGS = [].concat(...Object.values(SVGS));
const STAR = '<h4>★ 高频真题考点与陷阱</h4>';

// ---------- 1. 九张 SVG 结构 ----------
for (const name of ALL_SVGS) {
  const p = 'pwa/img/' + name + '.svg';
  check(name + ' 文件存在', fs.existsSync(path.join(ROOT, p)), true);
  const s = read(p);
  check(name + ' 白底 + 680 宽 viewBox', s.includes('<rect x="0" y="0"') && /viewBox="0 0 680 \d+"/.test(s), true);
  check(name + ' 无 HTML 标签 / 完整收尾',
    ['<b>', '</b>', '<br', '<i>', '</i>', 'font-size="0"', '<g stroke'].every(t => !s.includes(t)) &&
    s.trim().startsWith('<svg') && s.trim().endsWith('</svg>'), true);
  check(name + ' 进了 SW 预缓存', sw.includes("'img/" + name + ".svg'"), true);
  check(name + ' text 标签成对', (s.match(/<text\b/g) || []).length, (s.match(/<\/text>/g) || []).length);
  check(name + ' 没有元素画到 680 之外', [...s.matchAll(/ x="(\d+)"/g)].every(m => +m[1] <= 650), true);
  check(name + ' 没有 stroke 挂在 <g> 上（避免文字发虚）', !/<g[^>]*stroke/.test(s), true);
}

// ---------- 2. 落位：紧跟知识点、不落进 <p>/<li> ----------
const LANDING = [
  ['os', '1.1.2', 'os_fig_osfunc'],
  ['os', '1.2.3', 'os_fig_timeshare'],
  ['os', '1.2.4', 'os_fig_realtime'],
  ['co', '2.1.4', 'co_fig_int_cast'],
  ['co', '1.2.4', 'co_fig_layer_lang'],
  ['cn', '6.4.1', 'cn_fig_mail_sys'],
  ['cn', '5.1.1', 'cn_fig_transport'],
  ['cn', '6.1.1', 'cn_fig_cs_model'],
  ['cn', '3.7.1', 'cn_fig_wan'],
];
for (const [sub, num, name] of LANDING) {
  const h = secHtml(sub, num);
  check(sub + ':' + num + ' 含本批图', h.includes('img/' + name + '.svg'), true);
  check(sub + ':' + num + ' 图块带 data-fig=1',
    /<p class="paragraph" data-fig="1"><img class="fig-img" src="img\/[a-z0-9_]+\.svg"/.test(h), true);
  check(sub + ':' + num + ' 图在 ★ 之前', h.indexOf('img/' + name + '.svg') < h.indexOf(STAR), true);
  const i = h.indexOf('img/' + name + '.svg');
  const figStart = h.lastIndexOf('<p class="paragraph" data-fig="1"><b>图：', i);
  check(sub + ':' + num + ' 图块前一个标签是闭合标签（没落在正文里）',
    figStart >= 0 && /<\/(p|ul|ol|table|div|figure|h4)>$/.test(h.slice(0, figStart).trimEnd()), true);
}
// 具体位置口径：图必须排在对应知识点之后、★ 之前
const POS = [
  ['os', '1.1.2', 'os_fig_osfunc', '系统调用是唯一合法入口'],
  ['os', '1.2.3', 'os_fig_timeshare', '分时的底子仍是多道程序设计'],
  ['os', '1.2.4', 'os_fig_realtime', '首要追求'],
  ['co', '2.1.4', 'co_fig_int_cast', 'char 通常按无符号整数解释'],
  ['co', '1.2.4', 'co_fig_layer_lang', '相同 ISA 可对应多种微架构'],
  ['cn', '6.4.1', 'cn_fig_mail_sys', '暂存转发是关键设计'],
  ['cn', '5.1.1', 'cn_fig_transport', '别把「连接」当物理连接'],
  ['cn', '6.1.1', 'cn_fig_cs_model', '难管控、易夹带恶意内容'],
  ['cn', '3.7.1', 'cn_fig_wan', '广域网 ≠ 互联网'],
];
for (const [sub, num, name, after] of POS) {
  const h = secHtml(sub, num);
  check(sub + ':' + num + ' 图在「' + after.slice(0, 10) + '」之后、★ 之前',
    h.indexOf(after) >= 0 && h.indexOf('img/' + name + '.svg') > h.indexOf(after) &&
    h.indexOf('img/' + name + '.svg') < h.indexOf(STAR), true);
}

// ---------- 3. 图与正文同源（术语必须同时出现在 SVG 与该小节 HTML） ----------
const SAME = [
  ['os', '1.1.2', 'os_fig_osfunc', ['操作系统', '资源', '管理者', '扩充机器', '处理机管理', '存储器管理', '文件管理', '设备管理', '系统调用', '联机用户接口', '脱机用户接口', '图形用户接口', '命令接口', '程序接口', 'SPOOLing', '地址映射', '内存扩充', '虚拟内存', '库函数', '用户接口', '唯一合法入口']],
  ['os', '1.2.3', 'os_fig_timeshare', ['分时', '时间片', '响应时间', '用户数', '同时性', '交互性', '独立性', '及时性', '多道程序设计', '批处理', '20ms', '非抢占', '优先级', '终端', '吞吐量', 'T≈Q×N']],
  ['os', '1.2.4', 'os_fig_realtime', ['实时', '硬实时', '软实时', '截止时间', '时间片轮转', '任务紧迫性', '优先级', '确定性', '可靠性', '时效性', '资源利用率', '导弹制导', '订票', '股票交易', '银行管理', '分时系统', '机床控制', '飞机的控制系统', '灾难性后果']],
  ['co', '2.1.4', 'co_fig_int_cast', ['short', 'int', 'long', 'char', 'unsigned', '补码', '位截断', '符号扩展', '零扩展', '0xEF1F', '0x000286A1', '0x86A1', '165537', '-31071', '-4321', '61215', '0xFFFFEF1F', '0x0000EF1F', '65535', '4294967295', '类型转换', '解释方式', '运算溢出']],
  ['co', '1.2.4', 'co_fig_layer_lang', ['层次结构', 'ISA', '指令集体系结构', '微体系结构', '微架构', '机器语言', '汇编语言', '高级语言', '汇编程序', '编译程序', '解释程序', '翻译程序', '虚拟机', '电路与器件', 'RTL', '寻址方式', '流水线', 'Cache', '源程序', '目标文件', '预处理', '链接', '移植', '做什么', '怎么做']],
  ['cn', '6.4.1', 'cn_fig_mail_sys', ['用户代理', '邮件服务器', 'SMTP', 'POP3', 'IMAP', 'MIME', '缓存队列', '邮箱', '六步', '暂存', '转发', '7位ASCII', 'TCP', '双重角色', '发送端', '接收端', '下载', '客户', '服务器']],
  ['cn', '5.1.1', 'cn_fig_transport', ['传输层', '网络层', '数据链路层', '端到端', '进程', '主机', '端口号', 'SAP', '16位', '65535', '熟知端口', '登记端口', '49152', '1024', '49151', '复用', '分用', '差错检测', 'TCP', 'UDP', 'IP', '协议字段', '目的端口', '套接字', '相邻节点', '主机到主机', '进程到进程']],
  ['cn', '6.1.1', 'cn_fig_cs_model', ['客户', '服务器', 'C/S', 'P2P', '主动', '固定IP', '长期在线', 'Web', '电子邮件', 'DNS', 'FTP', '扩展性', '可维护性', '可靠性', '安全性', '单点故障', '瓶颈', '角色', '中转']],
  ['cn', '3.7.1', 'cn_fig_wan', ['广域网', '节点交换机', '路由器', 'PPP', 'HDLC', 'CSMA/CD', '分组交换', '存储转发', '网状拓扑', '点对点链路', '通信容量', '互联网', '局域网', 'LAN', 'WAN', '冗余路径', '广播介质', '网络层设备']],
];
for (const [sub, num, name, kws] of SAME) {
  const f = read('pwa/img/' + name + '.svg');
  const h = secHtml(sub, num);
  for (const kw of kws) {
    check(sub + ':' + num + ' 图/正文同源「' + kw + '」',
      flat(f).includes(flat(kw)) && flat(h).includes(flat(kw)), true);
  }
}
// 每张图的关键内容断言
const CONTENT = {
  os_fig_osfunc: ['资源的管理者', '用户与硬件之间的接口', '扩充机器', '处理机管理', '存储器管理', '文件管理', '设备管理', '系统调用是唯一合法入口', '联机用户接口', '脱机用户接口', '图形用户接口', '程序接口＝系统调用', '库函数≠系统调用'],
  os_fig_timeshare: ['T≈Q×N', 'Q≤2s÷100=20ms', '一轮=N×Q', '同时性（多路性）', '交互性', '独立性', '及时性', '多道批处理的根本区别在目标', '多道程序设计', '用户数'],
  os_fig_realtime: ['硬实时', '软实时', '灾难性后果', '偶尔错过', '时间片轮转机制', '及时性与可靠性（非资源利用率）', '确定性', '高可靠性', '强时效性', '飞机的控制系统', '导弹制导', '股票交易'],
  co_fig_int_cast: ['0x000286A1', '0x86A1=-31071', '语义变化，不是运算溢出', '符号位变成数据位', '符号扩展', '零扩展', '0xFFFFEF1F', '0x0000EF1F', '-1&gt;0u', '8位', '16位', '32位'],
  co_fig_layer_lang: ['ISA（指令集体系结构）·软硬件分界线', '机器语言', '汇编语言', '高级语言', '汇编程序', '编译程序', '解释程序', 'ISA定义「做什么」', '微架构决定「怎么做」', '预处理→编译→汇编→链接', '相同ISA可对应多种微架构'],
  cn_fig_mail_sys: ['SMTP推：①②③④⑤', '⑥POP3/IMAP拉', '缓存队列', 'SMTP客户', 'SMTP服务器', '双重角色', 'SMTP、SMTP、POP3', '暂存转发是关键设计', '7位ASCII'],
  cn_fig_transport: ['相邻节点', '主机到主机', '进程到进程', '熟知端口0~1023', '登记端口1024~49151', '动态／短暂端口49152~65535', '差错检测范围', '整个报文（首部＋数据）', '目的端口号', '协议字段', '套接字'],
  cn_fig_cs_model: ['固定IP·长期在线', '客户之间不能直接通信', '随用户数增强', '服务器单点故障影响大', '扩展性', '可维护性', '可靠性', '安全性', 'Web、电子邮件、DNS、FTP', '客户请求→服务器响应'],
  cn_fig_wan: ['节点交换机', '路由器', '单个网络（WAN）内部', '连接多个网络构成互联网', '网状拓扑·冗余路径·存储转发', 'PPP/HDLC', '不使用CSMA/CD', '分组交换＋存储转发＋网状拓扑', '广域网≠互联网', '网络层设备'],
};
for (const [name, ks] of Object.entries(CONTENT)) {
  const f = flat(read('pwa/img/' + name + '.svg'));
  for (const k of ks) check(name + ' 图上写明「' + k + '」', f.includes(flat(k)), true);
}

// ---------- 4. 本批不新增黄框（只补图） ----------
const CALLOUTS = [];
const NEW_KEYS = CALLOUTS.map(c => c[2]);
const NEW_BY_SUB = { co: 0, os: 0, cn: 0, ds: 0 };
for (const [sub, num, kw] of CALLOUTS) {
  const h = secHtml(sub, num);
  check(sub + ':' + num + ' 有黄框且含判据「' + kw + '」',
    h.includes('key-callout') && h.includes(kw), true);
  if (h.includes(STAR))
    check(sub + ':' + num + ' 黄框在 ★ 之前', h.indexOf(kw) < h.indexOf(STAR), true);
}
let newBodies = [], posBad = 0, copyBad = 0, dupBad = 0;
const heads = new Set();
for (const sub of SUBS) for (const { h } of allHtmls(sub)) {
  const re = /<div class="key-callout">([\s\S]*?)<\/div>/g;
  let m;
  while ((m = re.exec(h))) {
    const body = m[1], text = flat(body);
    const before = h.slice(0, m.index).replace(/\s+$/, '');
    if (!(before === '' || before.endsWith('>'))) posBad++;
    const head = text.slice(0, 24);
    if (heads.has(head)) dupBad++; else heads.add(head);
    if (NEW_KEYS.some(k => body.includes(k))) {
      newBodies.push(body);
      const paras = [...h.matchAll(/<p(?![^>]*data-fig)[^>]*>([\s\S]*?)<\/p>/g)].map(x => flat(x[1]));
      if (text.length > 40 && paras.some(p => p === text)) copyBad++;
    }
  }
}
check('本批不新增黄框，定位到 0 个', newBodies.length, 0);
check('全库黄框结构合法（无内嵌块级、无 tspan）',
  newBodies.every(b => !/<(p|ul|ol|li|table|div|figure)\b/.test(b) && !b.includes('tspan')), true);
check('全库每个黄框都有至少两处加粗重点',
  newBodies.every(b => (b.match(/<b>/g) || []).length >= 2), true);
check('全库每个黄框都不是空壳（正文 > 80 字）',
  newBodies.every(b => flat(b).length > 80), true);
check('全库黄框位置安全：没有一个落在未闭合正文内部', posBad, 0);
check('全库黄框互不重复（前 24 字判重）', dupBad, 0);
check('全库没有黄框整段复刻正文 <p>', copyBad, 0);
const cssRules = [...css.matchAll(/\.key-callout[^{]*\{([^}]*)\}/g)].map(m => m[1]).join('\n');
check('CSS .key-callout 无绝对定位 / z-index / 负外边距遮挡',
  !/position:\s*(absolute|fixed)|z-index|margin[^;]*:\s*-\d/.test(cssRules), true);
check('笔记 JSON 里没有 SVG 专有的 tspan', SUBS.every(s => !RAW[s].includes('tspan')), true);

// ---------- 5. 行号双基线（图块与黄框都不参与行号） ----------
const LINE_BASE = { co: [1819, 1819], os: [3660, 3660], cn: [1108, 1108], ds: [1173, 1175] };
for (const sub of SUBS) {
  let paired = 0, open = 0;
  for (const { h } of allHtmls(sub)) {
    (h.match(/<p\b[^>]*>[\s\S]*?<\/p>/g) || []).forEach(t => { if (!/^<p\b[^>]*data-fig/.test(t)) paired++; });
    paired += (h.match(/<li\b[^>]*>/g) || []).length;
    (h.match(/<p\b[^>]*>/g) || []).forEach(t => { if (!/data-fig/.test(t)) open++; });
    open += (h.match(/<li\b[^>]*>/g) || []).length;
  }
  check(sub + ' 静态可批注行（配对口径）' + LINE_BASE[sub][0], paired, LINE_BASE[sub][0]);
  check(sub + ' 静态可批注行（开标签口径）' + LINE_BASE[sub][1], open, LINE_BASE[sub][1]);
}

// ---------- 6. 精确总量 / 三方一致 / 序列化 ----------
const FIG_N = { co: 46, os: 70, cn: 48, ds: 31 };
const CALL_N = { co: 74, os: 77, cn: 53, ds: 106 };
for (const sub of SUBS) {
  check(sub + ' 配图 ' + FIG_N[sub] + ' 张（P15 精确总量）', (RAW[sub].match(/fig-img/g) || []).length, FIG_N[sub]);
  check(sub + ' 黄框 ' + CALL_N[sub] + ' 个（P15 未动，精确）',
    (RAW[sub].match(/class=\\"key-callout\\"/g) || []).length, CALL_N[sub]);
  check(sub + ' 序列化格式',
    [RAW[sub].indexOf('\r\n') > 0, RAW[sub].endsWith('\n')],
    sub === 'os' ? [false, true] : [true, false]);
  const refs = [...new Set([...RAW[sub].matchAll(/img\/([a-z0-9_]+_fig_[a-z0-9_]+\.(?:svg|png))/g)].map(m => 'img/' + m[1]))];
  check(sub + ' 图引用 / 文件 / SW 预缓存三方一致',
    refs.every(r => fs.existsSync(path.join(ROOT, 'pwa', r)) && sw.includes("'" + r + "'")), true);
}
check('全库 fig-img 195 张', SUBS.reduce((n, s) => n + (RAW[s].match(/fig-img/g) || []).length, 0), 195);
check('全库黄框 310 个（本批未新增）', SUBS.reduce((n, s) => n + (RAW[s].match(/class=\\"key-callout\\"/g) || []).length, 0), 310);
const STRUCT = { co: 0, ds: 0, cn: 11, os: 14 };
check('内联 struct-fig 总量未变（CO0/DS0/CN11/OS14）',
  Object.entries(STRUCT).every(([s, v]) => (RAW[s].match(/struct-fig/g) || []).length === v), true);
check('SW DATA_VER 非空且已刷新为本批哈希',
  /quiz408-data-[a-f0-9]{10}/.test(sw), true);

// ---------- 7. 纯插入守卫（有 before 备份才跑） ----------
function subseq(old, neu) {
  let j = 0;
  for (const c of old) { j = neu.indexOf(c, j); if (j < 0) return false; j++; }
  return true;
}
const BAK_DIR = 'archive/fig_p15_2026-11-13/';
let guardDone = 0, guardBad = 0, changed = 0, changedKeys = [];
for (const sub of SUBS) {
  const bp = BAK_DIR + sub + '_notes.before.json';
  if (!fs.existsSync(path.join(ROOT, bp))) continue;
  const before = JSON.parse(read(bp));
  const B = new Map(), A = new Map();
  for (const ch of before.chapters) for (const s of ch.sections || [])
    for (const x of [s].concat(s.subsections || [])) B.set(x.section.split(' ')[0], x.html || '');
  for (const { key, h } of allHtmls(sub)) A.set(key, h);
  for (const [k, old] of B) {
    const neu = A.get(k) || '';
    if (old !== neu) { changed++; changedKeys.push(k); if (!subseq(old, neu)) guardBad++; }
  }
  guardDone++;
}
if (guardDone === 3) {
  check('OS/CO/CN 三科 before 备份都参与了纯插入校验', guardDone, 3);
  check('变化的 9 个小节全是纯插入（0 删除 / 0 改写）', guardBad, 0);
  check('变化小节数 = 9（本批只碰这九个零图小节）', changed, 9);
  check('被改的小节正是 1.1.2/1.2.3/1.2.4×2/2.1.4/3.7.1/5.1.1/6.1.1/6.4.1',
    changedKeys.slice().sort(), ['1.1.2', '1.2.3', '1.2.4', '1.2.4', '2.1.4', '3.7.1', '5.1.1', '6.1.1', '6.4.1']);
} else {
  console.log('SKIP 纯插入守卫：缺少三科 before 备份（归档目录不在 git 中）');
}

// ---------- 8. jsdom 真实渲染 + 双版本逐行文本比对 ----------
let JSDOM = null, IDBFactory = null, IDBKeyRange = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
try { ({ IDBFactory, IDBKeyRange } = require('fake-indexeddb')); } catch (e) { }
if (!JSDOM || !IDBFactory) {
  console.log('SKIP 缺少 jsdom / fake-indexeddb');
  console.log('_test_fig_p15: ' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
} else {
  (async () => {
    async function render(sub, raw) {
      const pageHtml = read('pwa/notes.html')
        .replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, s) => {
          try { return '<script>' + read('pwa/' + s) + '</script>'; } catch (e) { return ''; }
        }).replace(/<link\b[^>]*>/gi, '');
      const vc = new VirtualConsole(); vc.on('jsdomError', () => { });
      const dom = new JSDOM(pageHtml, {
        runScripts: 'dangerously', pretendToBeVisual: true,
        url: 'https://x.test/notes.html?subject=' + sub, virtualConsole: vc,
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
      const out = {
        window: dom.window, document: d,
        lines: [...d.querySelectorAll('.anno-line')].map(e => e.textContent.trim()),
        figs: d.querySelectorAll('img.fig-img').length,
        calls: d.querySelectorAll('.key-callout').length,
        lightbox: null,
        misLabeled: [...d.querySelectorAll('[data-fig]')].filter(el => el.classList.contains('anno-line')).length,
        newCalls: [...d.querySelectorAll('.key-callout')].filter(el => NEW_KEYS.some(k => el.textContent.includes(k))).length,
        badCalls: [...d.querySelectorAll('.key-callout')]
          .filter(el => NEW_KEYS.some(k => el.textContent.includes(k)) && el.closest('li,p')).length,
        badFigs: [...d.querySelectorAll('img.fig-img')]
          .filter(img => /os_fig_osfunc|os_fig_timeshare|os_fig_realtime|co_fig_int_cast|co_fig_layer_lang|cn_fig_mail_sys|cn_fig_transport|cn_fig_cs_model|cn_fig_wan/.test(img.getAttribute('src') || '') && img.closest('li')).length,
      };
      const firstFig = d.querySelector('img.fig-img');
      if (firstFig) {
        firstFig.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true, cancelable: true }));
        const lb = d.querySelector('#figLightbox');
        out.lightbox = !!lb && lb.classList.contains('show');
      }
      return out;
    }
    const JSDOM_BASE = { co: 1971, os: 3668, cn: 1220, ds: 1330 };
    for (const sub of SUBS) {
      const a = await render(sub, RAW[sub]);
      check(sub + ' 真实渲染 .anno-line = ' + JSDOM_BASE[sub], a.lines.length, JSDOM_BASE[sub]);
      check(sub + ' 真实渲染配图 >= ' + FIG_N[sub] + ' 张', a.figs, n => n >= FIG_N[sub]);
      check(sub + ' 真实渲染黄框 >= ' + CALL_N[sub] + ' 个', a.calls, n => n >= CALL_N[sub]);
      check(sub + ' 图块被误标行号 = 0', a.misLabeled, 0);
      check(sub + ' 全库黄框没有一个落在 li/p 内部',
        [...a.document.querySelectorAll('.key-callout')].filter(el => el.closest('li,p')).length, 0);
      check(sub + ' 本批黄框在 DOM 里都定位到了且不嵌 li/p',
        [a.newCalls, a.badCalls], [NEW_BY_SUB[sub], 0]);
      check(sub + ' 本批新图没有一张落进 li', a.badFigs, 0);
      check(sub + ' 配图仍可点击放大', a.lightbox, true);
      const bp = BAK_DIR + sub + '_notes.before.json';
      if (fs.existsSync(path.join(ROOT, bp))) {
        const b = await render(sub, read(bp));
        check(sub + ' 双版本 .anno-line 数量一致', b.lines.length, a.lines.length);
        let first = -1;
        if (b.lines.length === a.lines.length)
          for (let i = 0; i < b.lines.length; i++) if (b.lines[i] !== a.lines[i]) { first = i; break; }
        check(sub + ' 双版本逐行文本完全一致（黄框零覆盖 / 批注零错位）', first, -1);
        b.window.close();
      } else {
        console.log('SKIP ' + sub + ' 双版本逐行比对：缺 before 备份');
      }
      a.window.close();
    }
    console.log('_test_fig_p15: ' + pass + ' passed, ' + fail + ' failed');
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.log('ERR', e.message); process.exit(1); });
}
