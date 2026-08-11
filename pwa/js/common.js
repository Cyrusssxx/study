// ============ 全局变量 ============
let isDarkOn = () => localStorage.getItem('darkMode') === '1';

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

// ============ 辅助函数 ============
// 从数组中随机选择n个项目（避免重复）
function getRandomItems(array, n) {
    if (n >= array.length) return [...array];
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, n);
}

// 从数组中随机选择n个项目（避免重复）
function getRandomItems(array, n) {
    if (n >= array.length) return [...array];
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, n);
}

// 从IndexedDB获取错题数据
function getWrongQuestionsFromDB() {
    return new Promise((resolve) => {
        const request = indexedDB.open('408QuizDB', 1);
        request.onerror = () => resolve([]);
        request.onsuccess = (event) => {
            const db = event.target.result;
            const transaction = db.transaction(['wrong'], 'readonly');
            const store = transaction.objectStore('wrong');
            const getAll = store.getAll();
            
            getAll.onsuccess = () => {
                const wrongQuestions = getAll.result.map(item => item.question);
                resolve(wrongQuestions);
            };
            
            getAll.onerror = () => resolve([]);
        };
    });
}