/* 408刷题应用 - 前端通用JS：顶栏计时器 + 导航栏各开关（跳题/背题/快刷/夜间） */

// ============ 题干排版：判断组合题（I. II. III. IV. 陈述挤在一行）自动分行 ============
function fmtContent(html) {
    if (!html || typeof html !== 'string') return html;
    return html.replace(/<[^>]*>|(I{1,3}|IV|V)\./g, (m, num, off, src) => {
        if (!num) return m;  // HTML 标签原样保留（如图片/代码块，不误插）
        if (off === 0) return m;  // 题干首字符就是编号时不加
        // 前面紧邻 <br>（已分行）不再重复插入
        const prev = src.slice(Math.max(0, off - 6), off).toLowerCase();
        if (prev.endsWith('<br>') || prev.endsWith('<br/>')) return m;
        return '<br>' + m;
    });
}

// ============ 夜间模式：尽早给 <html> 加 .dark，减少闪白 ============
function isDarkOn() {
    return localStorage.getItem('darkMode') === '1';
}

function applyDark() {
    document.documentElement.classList.toggle('dark', isDarkOn());
}

applyDark();

// ============ 今日刷题计时器（按天累计，存localStorage，页面不可见时暂停） ============
(function () {
    const el = document.getElementById('navTimer');
    const pauseBtn = document.getElementById('timerPauseBtn');
    let isPaused = false;
    let timerInterval;
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

    function updatePauseButton() {
        if (!pauseBtn) return;
        if (isPaused) {
            pauseBtn.textContent = '▶️ 继续';
            pauseBtn.title = '继续计时';
        } else {
            pauseBtn.textContent = '⏸️ 暂停';
            pauseBtn.title = '暂停计时';
        }
    }

    function startTimer() {
        if (timerInterval) return;
        timerInterval = setInterval(() => {
            if (document.hidden) return;  // 切走标签页/窗口时暂停计时
            if (isPaused) return;
            const sec = parseInt(localStorage.getItem('studyTimerSec') || '0', 10) + 1;
            localStorage.setItem('studyTimerSec', String(sec));
            render();
        }, 1000);
    }

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
    }

    // 初始化
    render();
    updatePauseButton();
    startTimer();

    // 页面可见性变化处理
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopTimer();
        } else {
            startTimer();
        }
    });

    // 导出全局函数供按钮调用
    window.toggleTimer = function() {
        isPaused = !isPaused;
        updatePauseButton();
    };

    window.resetTimer = function() {
        if (confirm('确定要重置计时器吗？当前时长将被清零。')) {
            localStorage.setItem('studyTimerSec', '0');
            render();
            // 添加重置动画效果
            el.style.animation = 'none';
            el.offsetHeight; // 触发重排
            el.style.animation = 'pulse 0.5s ease-in-out';
        }
    };
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

// ============ 快刷模式开关（quiz页读取 isQuickOn()，点选项直接判对错） ============
function isQuickOn() {
    return localStorage.getItem('quickMode') === '1';
}

function renderQuickSwitch() {
    const btn = document.getElementById('quickSwitch');
    const state = document.getElementById('quickState');
    if (!btn || !state) return;
    const on = isQuickOn();
    btn.classList.toggle('on', on);
    state.textContent = on ? '开' : '关';
}

function toggleQuick() {
    localStorage.setItem('quickMode', isQuickOn() ? '0' : '1');
    renderQuickSwitch();
    // quiz页定义此钩子：切换后即时显隐提交按钮
    if (typeof onQuickModeChange === 'function') onQuickModeChange();
}

renderQuickSwitch();

// ============ 夜间模式开关（样式全部由 CSS .dark 接管） ============
function renderDarkSwitch() {
    const btn = document.getElementById('darkSwitch');
    const state = document.getElementById('darkState');
    if (!btn || !state) return;
    const on = isDarkOn();
    btn.classList.toggle('on', on);
    state.textContent = on ? '开' : '关';
}

function toggleDark() {
    localStorage.setItem('darkMode', isDarkOn() ? '0' : '1');
    applyDark();
    renderDarkSwitch();
}

renderDarkSwitch();
