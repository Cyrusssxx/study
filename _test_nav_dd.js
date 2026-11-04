// 顶栏「知识点笔记」下拉交互回归（2026-11-04）
//
// 需求：logo「408刷题」已可跳首页，原「首页」按钮改为下拉，展开后是四科知识点笔记。
//
// 设计约束（本测试锁定）：
//   ① <details> 放在 .nav-links **之外** —— 后者有 overflow-x:auto，浮层放里面会被裁掉
//   ② 四科 href = notes.html?subject={ds,co,os,cn}，顺序与 408 卷面一致
//   ③ common.js 统一处理「点外部 / Esc 收起」（details 原生不自动收起）
//   ④ 点 summary 本身不误关（common.js 靠 contains(target) 让位给原生 toggle）
//
// 用法：NODE_PATH=<workspace>/node_modules node _test_nav_dd.js
const fs = require('fs');
const path = require('path');

let JSDOM = null, VirtualConsole = null;
try { ({ JSDOM, VirtualConsole } = require('jsdom')); } catch (e) { }
if (!JSDOM) { console.log('跳过：需要 jsdom'); process.exit(0); }

const ROOT = __dirname;
let pass = 0, fail = 0;
function check(name, got, want) {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  console.log((ok ? 'PASS' : 'FAIL').padEnd(5), name, ok ? '' : `→ 实际 ${JSON.stringify(got)} 期望 ${JSON.stringify(want)}`);
  ok ? pass++ : fail++;
}

const RAW = fs.readFileSync(path.join(ROOT, 'pwa/index.html'), 'utf8');
const COMMON = fs.readFileSync(path.join(ROOT, 'pwa/js/common.js'), 'utf8');
// 只内联 common.js（下拉逻辑所在），其余外部脚本不加载，避免 jsdom 拉不到资源
const html = RAW.replace(/<script src="([^"]+)"[^>]*><\/script>/g, (m, src) =>
  /common\.js/.test(src) ? '<script>' + COMMON + '</script>' : '');

(async () => {
  const vc = new VirtualConsole();
  vc.on('jsdomError', () => { });
  const dom = new JSDOM(html, {
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    url: 'https://x.test/index.html',
    virtualConsole: vc,
    beforeParse(w) {
      w.alert = () => { };
      w.confirm = () => true;
      w.scrollTo = () => { };
      w.fetch = async () => ({ ok: true, status: 200, json: async () => ({ total: 0, subjects: {} }) });
    }
  });
  const w = dom.window, doc = w.document;

  console.log('--- 一、结构与位置 ---');
  const dd = doc.querySelector('.nav-dd');
  check('顶栏存在 .nav-dd 下拉', !!dd, true);
  check('下拉在 .nav-links 之外（浮层不被 overflow-x:auto 裁剪）',
    dd ? dd.parentElement.classList.contains('nav-container') : false, true);
  const brand = doc.querySelector('.nav-brand');
  check('logo 仍指向首页', brand && brand.getAttribute('href'), 'index.html');
  check('顶栏已无「首页」链接',
    [...doc.querySelectorAll('.nav-links .nav-link')].some(a => /首页/.test(a.textContent)), false);
  check('触发项文案为「知识点」', /知识点 <span class="nav-dd-arrow">/.test(RAW), true);

  console.log('\n--- 一·半、裁剪：展开态不能把浮层裁掉 ---');
  const CSS = fs.readFileSync(path.join(ROOT, 'pwa/css/style.css'), 'utf8');
  // 折叠动画曾在 .nav-container 上长期挂着 overflow:hidden，导致下拉面板一点都看不见
  check('展开态 .nav-container 无 overflow:hidden',
    /\.navbar \.nav-container \{[^}]*overflow:\s*hidden/.test(CSS), false);
  check('折叠态才裁剪（is-collapsed 内 overflow:hidden）',
    /\.navbar\.is-collapsed \.nav-container \{[^}]*overflow:\s*hidden/.test(CSS), true);
  check('下拉浮层 z-index 高于顶栏基线', /\.nav-dd-menu \{[^}]*z-index:\s*1[0-9]{2}/.test(CSS), true);

  console.log('\n--- 二、四科入口 ---');
  const links = [...doc.querySelectorAll('.nav-dd-menu a')];
  check('菜单共 4 项', links.length, 4);
  check('href 与顺序（DS→CO→OS→CN）',
    links.map(a => a.getAttribute('href')),
    ['notes.html?subject=ds', 'notes.html?subject=co', 'notes.html?subject=os', 'notes.html?subject=cn']);
  check('文案为中文科目全名',
    links.map(a => a.textContent.trim()),
    ['数据结构', '计算机组成原理', '操作系统', '计算机网络']);
  check('触发项为 summary（原生展开，无 JS 依赖）',
    dd ? dd.querySelector('summary').tagName.toLowerCase() : '', 'summary');

  console.log('\n--- 三、点外部收起（common.js 事件委托） ---');
  dd.setAttribute('open', '');
  check('初始已展开', dd.hasAttribute('open'), true);
  doc.body.dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('点页面空白处后收起', dd.hasAttribute('open'), false);

  console.log('\n--- 四、Esc 收起 ---');
  dd.setAttribute('open', '');
  doc.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  check('按 Esc 后收起', dd.hasAttribute('open'), false);

  console.log('\n--- 五、点击 details 内部不误关（点 summary 由原生 toggle 收起） ---');
  dd.setAttribute('open', '');
  dd.querySelector('.nav-dd-menu').dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }));
  check('点菜单容器（details 内部）不收起', dd.hasAttribute('open'), true);
  check('监听器用 contains(target) 让位给 details 内部点击',
    /open\.contains\(e\.target\)/.test(COMMON), true);
  dd.querySelector('summary').dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  check('点触发项由原生 toggle 收起（不残留 open）', dd.hasAttribute('open'), false);

  dom.window.close();
  console.log(`\n结果: ${pass} / ${pass + fail}` + (fail ? `，${fail} 项失败` : '，全部通过'));
  process.exit(fail ? 1 : 0);
})();
