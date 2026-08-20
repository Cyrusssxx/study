# -*- coding: utf-8 -*-
"""在 os_notes.json 第2章 2.3 之后插入新节 '2.4 PV操作大题总结（生产者-消费者六步骤解题法）'，
原 2.4 死锁顺延为 2.5。每步配 SVG 草图。"""
import json, io, os

P = 'pwa/data/notes/os_notes.json'
d = json.load(io.open(P, encoding='utf-8'))
ch2 = d['chapters'][1]

# 构造新节 HTML（六步骤 + 6 张 SVG 草图）
HTML = (
'<h4>一、经典同步问题总览</h4>'
'<p class="paragraph">PV 操作应用题（大题）是 408 操作系统的核心高频考点，几乎每年必考（2009、2011、2013、2014、2015、2017、2019、2025 年均考查）。常见的五大经典同步问题如下表，掌握其模型与信号量设置是解题基础。</p>'
'<table>'
'<tr><th>问题</th><th>核心模型</th><th>关键信号量</th></tr>'
'<tr><td><b>生产者-消费者</b></td><td>生产者放数据、消费者取数据，共享缓冲区</td><td>empty（空位同步）、full（数据同步）、mutex（缓冲区互斥）</td></tr>'
'<tr><td><b>读者-写者</b></td><td>多读者可并发读、写者独占写</td><td>readcount 计数、rmutex（计数互斥）、wmutex（读写互斥）</td></tr>'
'<tr><td><b>哲学家进餐</b></td><td>五人围坐，需左右两根筷子才能进餐</td><td>五根筷子各一信号量，避免死锁（限制人数/对称取放）</td></tr>'
'<tr><td><b>理发师问题</b></td><td>理发师等顾客、顾客等理发椅</td><td>customers（待理发数）、barbers（空闲理发师）、mutex（椅子互斥）</td></tr>'
'<tr><td><b>单纯同步</b></td><td>两进程前后序约束（如先算后输出）</td><td>单一同步信号量初值 0，前序 V、后序 P</td></tr>'
'</table>'

'<h4>二、生产者-消费者六步骤解题法（通用模板）</h4>'
'<p class="paragraph">下面以生产者-消费者为典型，归纳一套可迁移到所有 PV 大题的六步骤解题法。每一步配草图，按顺序执行即可形成完整解答。</p>'

'<h4>步骤一：确定进程类别</h4>'
'<p class="paragraph">题目中有几类进程，就对应几个函数（如生产者函数 producer()、消费者函数 consumer()）。每类进程的行为模式一致，写一个函数代表该类的所有实例。</p>'
'<svg viewBox="0 0 680 180" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;background:#f8fafc;border-radius:8px;display:block;margin:10px 0">'
'<defs><marker id="ar1" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><polygon points="0,0 8,3 0,6" fill="#475569"/></marker></defs>'
'<text x="340" y="28" text-anchor="middle" font-size="13" fill="#6366f1" font-weight="bold">两类进程 = 两个函数</text>'
'<rect x="40" y="60" width="120" height="60" rx="8" fill="#e0e7ff" stroke="#6366f1" stroke-width="2"/>'
'<text x="100" y="95" text-anchor="middle" font-size="16" fill="#1e293b">生产者</text>'
'<text x="100" y="142" text-anchor="middle" font-size="12" fill="#64748b">producer()</text>'
'<line x1="160" y1="90" x2="238" y2="90" stroke="#475569" stroke-width="2" marker-end="url(#ar1)"/>'
'<rect x="240" y="50" width="200" height="80" rx="6" fill="#f1f5f9" stroke="#64748b" stroke-width="2"/>'
'<line x1="280" y1="50" x2="280" y2="130" stroke="#cbd5e1"/><line x1="320" y1="50" x2="320" y2="130" stroke="#cbd5e1"/>'
'<line x1="360" y1="50" x2="360" y2="130" stroke="#cbd5e1"/><line x1="400" y1="50" x2="400" y2="130" stroke="#cbd5e1"/>'
'<text x="340" y="155" text-anchor="middle" font-size="12" fill="#64748b">缓冲区（n 个格子）</text>'
'<line x1="440" y1="90" x2="518" y2="90" stroke="#475569" stroke-width="2" marker-end="url(#ar1)"/>'
'<rect x="520" y="60" width="120" height="60" rx="8" fill="#e0e7ff" stroke="#6366f1" stroke-width="2"/>'
'<text x="580" y="95" text-anchor="middle" font-size="16" fill="#1e293b">消费者</text>'
'<text x="580" y="142" text-anchor="middle" font-size="12" fill="#64748b">consumer()</text>'
'</svg>'

'<h4>步骤二：描述进程动作</h4>'
'<p class="paragraph">在每个函数内，先用中文描述进程要执行的动作（生产物品、放入缓冲区、取走数据、消费等）。若动作需不断重复，用 while(1) 包裹。</p>'
'<svg viewBox="0 0 680 200" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;background:#f8fafc;border-radius:8px;display:block;margin:10px 0">'
'<defs><marker id="ar2" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><polygon points="0,0 8,3 0,6" fill="#475569"/></marker></defs>'
'<rect x="30" y="80" width="90" height="40" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2"/>'
'<text x="75" y="105" text-anchor="middle" font-size="13" fill="#1e293b">while(1)</text>'
'<line x1="120" y1="100" x2="168" y2="100" stroke="#475569" stroke-width="2" marker-end="url(#ar2)"/>'
'<rect x="170" y="80" width="110" height="40" rx="6" fill="#f1f5f9" stroke="#64748b" stroke-width="2"/>'
'<text x="225" y="105" text-anchor="middle" font-size="12" fill="#1e293b">生产物品</text>'
'<line x1="280" y1="100" x2="328" y2="100" stroke="#475569" stroke-width="2" marker-end="url(#ar2)"/>'
'<rect x="330" y="80" width="120" height="40" rx="6" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/>'
'<text x="390" y="105" text-anchor="middle" font-size="12" fill="#1e293b">放入缓冲区</text>'
'<line x1="450" y1="100" x2="498" y2="100" stroke="#475569" stroke-width="2" marker-end="url(#ar2)"/>'
'<rect x="500" y="80" width="150" height="40" rx="6" fill="#f1f5f9" stroke="#64748b" stroke-width="2"/>'
'<text x="575" y="105" text-anchor="middle" font-size="12" fill="#1e293b">（P/V 待填）</text>'
'<path d="M575 80 Q575 40 75 40 L75 78" fill="none" stroke="#d97706" stroke-width="2" stroke-dasharray="4,3" marker-end="url(#ar2)"/>'
'<text x="325" y="32" text-anchor="middle" font-size="12" fill="#d97706">循环回到 while(1)</text>'
'<text x="340" y="170" text-anchor="middle" font-size="12" fill="#64748b">先用中文写动作骨架，PV 留到步骤三再填</text>'
'</svg>'

'<h4>步骤三：确定 PV 操作位置</h4>'
'<p class="paragraph">分析每个动作前是否需要 P 操作（等待资源），动作后是否需要 V 操作（释放资源）。<b>原则：只要有 P，必有对应的 V（成对出现）</b>。先写 P，再写 V，确保同步与互斥都覆盖。</p>'
'<svg viewBox="0 0 680 220" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;background:#f8fafc;border-radius:8px;display:block;margin:10px 0">'
'<text x="180" y="25" text-anchor="middle" font-size="13" fill="#6366f1" font-weight="bold">producer()</text>'
'<text x="500" y="25" text-anchor="middle" font-size="13" fill="#6366f1" font-weight="bold">consumer()</text>'
'<rect x="40" y="40" width="280" height="30" rx="4" fill="#dbeafe" stroke="#2563eb"/><text x="60" y="60" font-size="12" fill="#1e293b">P(empty)   等空位</text>'
'<rect x="40" y="78" width="280" height="30" rx="4" fill="#fef3c7" stroke="#d97706"/><text x="60" y="98" font-size="12" fill="#1e293b">P(mutex)   锁缓冲区</text>'
'<rect x="40" y="116" width="280" height="30" rx="4" fill="#f1f5f9" stroke="#64748b"/><text x="60" y="136" font-size="12" fill="#1e293b">放入数据</text>'
'<rect x="40" y="154" width="280" height="30" rx="4" fill="#dcfce7" stroke="#16a34a"/><text x="60" y="174" font-size="12" fill="#1e293b">V(mutex)  解锁</text>'
'<rect x="40" y="192" width="280" height="22" rx="4" fill="#dcfce7" stroke="#16a34a"/><text x="60" y="208" font-size="12" fill="#1e293b">V(full)    发数据</text>'
'<rect x="360" y="40" width="280" height="30" rx="4" fill="#dbeafe" stroke="#2563eb"/><text x="380" y="60" font-size="12" fill="#1e293b">P(full)    等数据</text>'
'<rect x="360" y="78" width="280" height="30" rx="4" fill="#fef3c7" stroke="#d97706"/><text x="380" y="98" font-size="12" fill="#1e293b">P(mutex)   锁缓冲区</text>'
'<rect x="360" y="116" width="280" height="30" rx="4" fill="#f1f5f9" stroke="#64748b"/><text x="380" y="136" font-size="12" fill="#1e293b">取走数据</text>'
'<rect x="360" y="154" width="280" height="30" rx="4" fill="#dcfce7" stroke="#16a34a"/><text x="380" y="174" font-size="12" fill="#1e293b">V(mutex)  解锁</text>'
'<rect x="360" y="192" width="280" height="22" rx="4" fill="#dcfce7" stroke="#16a34a"/><text x="380" y="208" font-size="12" fill="#1e293b">V(empty)   发空位</text>'
'<line x1="320" y1="55" x2="640" y2="203" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3,3"/>'
'<line x1="320" y1="203" x2="640" y2="55" stroke="#ef4444" stroke-width="1.5" stroke-dasharray="3,3"/>'
'<text x="480" y="130" text-anchor="middle" font-size="11" fill="#ef4444">P/V 成对（红线对应）</text>'
'</svg>'

'<h4>步骤四：定义信号量并初始化</h4>'
'<p class="paragraph">所有 PV 操作写完后，再统一定义信号量并确定初值：<b>互斥信号量初值为 1，同步信号量初值为 0 或缓冲区大小 n</b>。</p>'
'<svg viewBox="0 0 680 170" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;background:#f8fafc;border-radius:8px;display:block;margin:10px 0">'
'<rect x="40" y="20" width="160" height="32" fill="#e0e7ff" stroke="#6366f1"/><text x="120" y="42" text-anchor="middle" font-size="13" fill="#1e293b" font-weight="bold">信号量</text>'
'<rect x="200" y="20" width="280" height="32" fill="#e0e7ff" stroke="#6366f1"/><text x="340" y="42" text-anchor="middle" font-size="13" fill="#1e293b" font-weight="bold">含义</text>'
'<rect x="480" y="20" width="160" height="32" fill="#e0e7ff" stroke="#6366f1"/><text x="560" y="42" text-anchor="middle" font-size="13" fill="#1e293b" font-weight="bold">初值</text>'
'<rect x="40" y="52" width="160" height="32" fill="#f1f5f9" stroke="#64748b"/><text x="120" y="74" text-anchor="middle" font-size="12" fill="#1e293b">mutex</text>'
'<rect x="200" y="52" width="280" height="32" fill="#f1f5f9" stroke="#64748b"/><text x="340" y="74" text-anchor="middle" font-size="12" fill="#1e293b">缓冲区互斥</text>'
'<rect x="480" y="52" width="160" height="32" fill="#fef3c7" stroke="#d97706"/><text x="560" y="74" text-anchor="middle" font-size="14" fill="#1e293b" font-weight="bold">1</text>'
'<rect x="40" y="84" width="160" height="32" fill="#f1f5f9" stroke="#64748b"/><text x="120" y="106" text-anchor="middle" font-size="12" fill="#1e293b">empty</text>'
'<rect x="200" y="84" width="280" height="32" fill="#f1f5f9" stroke="#64748b"/><text x="340" y="106" text-anchor="middle" font-size="12" fill="#1e293b">空位数（同步）</text>'
'<rect x="480" y="84" width="160" height="32" fill="#dcfce7" stroke="#16a34a"/><text x="560" y="106" text-anchor="middle" font-size="14" fill="#1e293b" font-weight="bold">n</text>'
'<rect x="40" y="116" width="160" height="32" fill="#f1f5f9" stroke="#64748b"/><text x="120" y="138" text-anchor="middle" font-size="12" fill="#1e293b">full</text>'
'<rect x="200" y="116" width="280" height="32" fill="#f1f5f9" stroke="#64748b"/><text x="340" y="138" text-anchor="middle" font-size="12" fill="#1e293b">数据数（同步）</text>'
'<rect x="480" y="116" width="160" height="32" fill="#dcfce7" stroke="#16a34a"/><text x="560" y="138" text-anchor="middle" font-size="14" fill="#1e293b" font-weight="bold">0</text>'
'</svg>'

'<h4>步骤五：检查死锁（重点！）</h4>'
'<p class="paragraph">检查多个 P 操作连续出现的位置——这是死锁高发区。判断是否可能互相等待（如生产者等空位、消费者等数据时互相阻塞）。若存在死锁风险，<b>调整多个 P 的顺序</b>（通常是先 P 同步信号量、再 P 互斥信号量）来避免。</p>'
'<svg viewBox="0 0 680 220" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;background:#f8fafc;border-radius:8px;display:block;margin:10px 0">'
'<text x="170" y="22" text-anchor="middle" font-size="13" fill="#ef4444" font-weight="bold">错误（死锁）</text>'
'<text x="510" y="22" text-anchor="middle" font-size="13" fill="#16a34a" font-weight="bold">正确</text>'
'<rect x="40" y="32" width="260" height="28" rx="4" fill="#fee2e2" stroke="#ef4444"/><text x="55" y="51" font-size="11" fill="#1e293b">producer: P(mutex) → P(empty)</text>'
'<rect x="40" y="64" width="260" height="28" rx="4" fill="#fee2e2" stroke="#ef4444"/><text x="55" y="83" font-size="11" fill="#1e293b">consumer: P(mutex) → P(full)</text>'
'<text x="170" y="112" text-anchor="middle" font-size="11" fill="#ef4444">都占 mutex 后互相等同步量 → 死锁</text>'
'<rect x="380" y="32" width="260" height="28" rx="4" fill="#dcfce7" stroke="#16a34a"/><text x="395" y="51" font-size="11" fill="#1e293b">producer: P(empty) → P(mutex)</text>'
'<rect x="380" y="64" width="260" height="28" rx="4" fill="#dcfce7" stroke="#16a34a"/><text x="395" y="83" font-size="11" fill="#1e293b">consumer: P(full) → P(mutex)</text>'
'<text x="510" y="112" text-anchor="middle" font-size="11" fill="#16a34a">先等同步量再锁 → 无死锁</text>'
'<line x1="40" y1="140" x2="640" y2="140" stroke="#cbd5e1" stroke-width="1"/>'
'<text x="340" y="168" text-anchor="middle" font-size="12" fill="#1e293b" font-weight="bold">口诀：先 P 同步，后 P 互斥</text>'
'<text x="340" y="195" text-anchor="middle" font-size="11" fill="#64748b">（V 操作顺序一般不影响死锁，可先 V 互斥再 V 同步）</text>'
'</svg>'

'<h4>步骤六：读题检查</h4>'
'<p class="paragraph">重新阅读题目，逐条核对要求是否全部满足：</p>'
'<svg viewBox="0 0 680 200" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;background:#f8fafc;border-radius:8px;display:block;margin:10px 0">'
'<rect x="60" y="20" width="560" height="36" rx="6" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5"/>'
'<text x="80" y="43" font-size="14" fill="#16a34a" font-weight="bold">✓</text><text x="110" y="43" font-size="13" fill="#1e293b">缓冲区大小 n 是否体现在 empty 初值</text>'
'<rect x="60" y="62" width="560" height="36" rx="6" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5"/>'
'<text x="80" y="85" font-size="14" fill="#16a34a" font-weight="bold">✓</text><text x="110" y="85" font-size="13" fill="#1e293b">临界区（缓冲区）访问是否互斥（mutex 成对 P/V）</text>'
'<rect x="60" y="104" width="560" height="36" rx="6" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5"/>'
'<text x="80" y="127" font-size="14" fill="#16a34a" font-weight="bold">✓</text><text x="110" y="127" font-size="13" fill="#1e293b">同步关系是否齐全（生产→full、消费→empty）</text>'
'<rect x="60" y="146" width="560" height="36" rx="6" fill="#dcfce7" stroke="#16a34a" stroke-width="1.5"/>'
'<text x="80" y="169" font-size="14" fill="#16a34a" font-weight="bold">✓</text><text x="110" y="169" font-size="13" fill="#1e293b">多 P 连续处是否先同步后互斥（无死锁）</text>'
'</svg>'

'<h4>三、补充注意</h4>'
'<ul>'
'<li><b>隐含的互斥</b>：对临界区（如缓冲区）的访问必须互斥，即使题目未明说也要加 mutex。</li>'
'<li><b>多个 P 连续出现时要格外小心</b>：连续 P 容易造成死锁，重点检查顺序（同步 P 在前、互斥 P 在后）。</li>'
'<li><b>V 操作顺序一般不影响死锁</b>：通常先 V 互斥、再 V 同步，但调换一般不会死锁。</li>'
'<li><b>信号量初值的含义</b>：初值 = 初始可用资源数。互斥资源初值 1；空位同步初值 = 缓冲区容量 n；数据同步初值 = 0（初始无数据）。</li>'
'<li><b>解题迁移</b>：六步骤法同样适用于读者-写者、哲学家、理发师等，只需在步骤一调整进程类别、步骤三调整同步关系。</li>'
'</ul>'
)

# 构造新 section
new_sec = {
    "section": "2.4 PV操作大题总结（生产者-消费者六步骤解题法）",
    "html": HTML
}

# 在 2.3（index 2）之后插入新节；原 2.4 死锁 → 2.5
secs = ch2['sections']
# 原 2.4 死锁的 section 字段改为 2.5
secs[3]['section'] = '2.5 死锁'
# 插入新节到 index 3
secs.insert(3, new_sec)

with io.open(P, 'w', encoding='utf-8') as f:
    json.dump(d, f, ensure_ascii=False, indent=2)

# 校验
d2 = json.load(io.open(P, encoding='utf-8'))
ch2b = d2['chapters'][1]
print('插入后第2章节数:', len(ch2b['sections']))
for s in ch2b['sections']:
    print('  ', s['section'], '|', len(s['html']), '字')
assert any('PV操作' in s['section'] for s in ch2b['sections'])
print('OK: 新节已插入，原死锁顺延为 2.5')
