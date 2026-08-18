// ============ 全局变量 ============
let isDarkOn = () => localStorage.getItem('darkMode') === '1';

// ============ 公式排版：LaTeX 风格 _{} ^{} 与 _x 转 HTML 上下标（保护代码块） ============
function fmtFormula(html) {
    if (!html || typeof html !== 'string') return html;
    const blocks = [];
    const NO = '\u0000';
    // 先取出 <pre> 代码块，避免代码里的下划线/尖括号被误转
    html = html.replace(/<pre[\s\S]*?<\/pre>/g, (m) => {
        blocks.push(m);
        return NO + 'B' + (blocks.length - 1) + NO;
    });
    html = html.replace(/_\{([^{}]+)\}/g, '<sub>$1</sub>');          // X_{n-2} → X<sub>n-2</sub>
    html = html.replace(/\^\{([^{}]+)\}/g, '<sup>$1</sup>');         // x^{-1} → x<sup>-1</sup>
    html = html.replace(/([A-Za-z0-9₀₁₂₃₄₅₆₇₈₉]|\))_([A-Za-z0-9])(?!\w)/g, '$1<sub>$2</sub>'); // X_0 → X<sub>0</sub>
    return html.replace(/\u0000B(\d+)\u0000/g, (m, i) => blocks[i]);
}

// ============ 答案排版：公式 + 步骤①②③前自动换行 ============
function fmtAnswer(html) {
    if (!html || typeof html !== 'string') return html;
    html = fmtFormula(html);
    return html.replace(/([①-⑩])/g, (m, i, src) => {
        const prev = src.slice(Math.max(0, i - 5), i).toLowerCase();
        if (prev.endsWith('<br>') || prev.endsWith('<br/>')) return m;
        return '<br>' + m;
    });
}

// ============ 题干排版：判断组合题（I. II. III. IV. 陈述挤在一行）自动分行 ============
function fmtContent(html) {
    if (!html || typeof html !== 'string') return html;
    html = fmtFormula(html);
    return html.replace(/<[^>]*>|(I{1,3}|IV|V)\./g, (m, num, off, src) => {
        if (!num) return m;  // HTML 标签原样保留（如图片/代码块，不误插）
        if (off === 0) return m;  // 题干首字符就是编号时不加
        // 前面紧邻 <br>（已分行）不再重复插入
        const prev = src.slice(Math.max(0, off - 6), off).toLowerCase();
        if (prev.endsWith('<br>') || prev.endsWith('<br/>')) return m;
        return '<br>' + m;
    });
}

// ============ 离线图片预热：daka/dati 等图片密集型页面调用 ============
// 通过触发 fetch 让 SW 的 fetch 处理程序把图片拉入缓存（首次在线查看后离线即可用），
// 避免 daka/dati 在离线时图片裂开。预热失败不影响页面显示（用户查看时 SW 仍会缓存）。
function warmFigureCache(urls) {
    if (!urls || !urls.length) return;
    for (const u of urls) {
        try { fetch(u); } catch (e) { /* 忽略单个预热失败 */ }
    }
}

function applyDark() {
    if (isDarkOn()) {
        document.documentElement.classList.add('dark');
    } else {
        document.documentElement.classList.remove('dark');
    }
}
applyDark();

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
        const m = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
        const s = String(sec % 60).padStart(2, '0');
        return `${h}:${m}:${s}`;
    }

    function render() {
        const sec = parseInt(localStorage.getItem('studyTimerSec') || '0', 10);
        el.textContent = `⏱ ${fmt(sec)}`;
    }

    function startTimer() {
        if (timerInterval) return;
        timerInterval = setInterval(() => {
            if (document.hidden || isPaused) return;
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

    let timerInterval = null;
    let isPaused = false;

    // 初始化
    render();
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

// ============ 背题模式开关（quiz页读取 isReciteOn()，直接显示答案与解析） ============
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

// ============ 跳题模式开关（quiz页读取 isAutoNextOn()，答对自动进入下一题） ============
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
    // quiz页定义此钩子：切换后即时显隐提交按钮
    if (typeof onAutoNextModeChange === 'function') onAutoNextModeChange();
}

renderAutoNextSwitch();
