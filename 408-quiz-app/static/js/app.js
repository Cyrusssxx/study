/* 408刷题应用 - 前端通用JS：顶栏计时器 + 答对自动跳题开关 */

// ============ 今日刷题计时器（按天累计，存localStorage，页面不可见时暂停） ============
(function () {
    const el = document.getElementById('navTimer');
    if (!el) return;

    const today = new Date().toISOString().slice(0, 10);
    if (localStorage.getItem('studyTimerDate') !== today) {
        localStorage.setItem('studyTimerDate', today);
        localStorage.setItem('studyTimerSec', '0');
    }

    function fmt(sec) {
        const h = String(Math.floor(sec / 3600)).padStart(2, '0');
        const m = String(Math.floor(sec % 3600 / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    function render() {
        el.textContent = '⏱ ' + fmt(parseInt(localStorage.getItem('studyTimerSec') || '0', 10));
    }

    render();
    setInterval(() => {
        if (document.hidden) return;  // 切走标签页/窗口时暂停计时
        const sec = parseInt(localStorage.getItem('studyTimerSec') || '0', 10) + 1;
        localStorage.setItem('studyTimerSec', String(sec));
        render();
    }, 1000);
})();

// ============ 答对自动跳题开关（quiz页答题逻辑读取 isAutoNextOn()） ============
function isAutoNextOn() {
    return localStorage.getItem('autoNext') === '1';
}

function renderAutoNextSwitch() {
    const btn = document.getElementById('autoNextSwitch');
    const state = document.getElementById('autoNextState');
    if (!btn || !state) return;
    const on = isAutoNextOn();
    btn.classList.toggle('on', on);
    state.textContent = on ? '开' : '关';
}

function toggleAutoNext() {
    localStorage.setItem('autoNext', isAutoNextOn() ? '0' : '1');
    renderAutoNextSwitch();
}

renderAutoNextSwitch();

// ============ 背题模式开关（quiz页读取 isReciteOn()，开启后直接显示答案解析） ============
function isReciteOn() {
    return localStorage.getItem('reciteMode') === '1';
}

function renderReciteSwitch() {
    const btn = document.getElementById('reciteSwitch');
    const state = document.getElementById('reciteState');
    if (!btn || !state) return;
    const on = isReciteOn();
    btn.classList.toggle('on', on);
    state.textContent = on ? '开' : '关';
}

function toggleRecite() {
    localStorage.setItem('reciteMode', isReciteOn() ? '0' : '1');
    renderReciteSwitch();
    // quiz页定义此钩子：切换后即时重渲染当前题
    if (typeof onReciteModeChange === 'function') onReciteModeChange();
}

renderReciteSwitch();
