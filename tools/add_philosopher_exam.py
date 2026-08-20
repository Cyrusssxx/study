# -*- coding: utf-8 -*-
"""
add_philosopher_exam.py — 在 os_notes.json 2.4 PV操作大题总结 的
「三、哲学家进餐」小节末尾（四、补充注意之前）附加 2019 统考真题例题。
含题目 + 答案代码(pre.code-block) + 信号量含义说明 + SVG 圆桌草图。
插入后自动重跑 build_os_pv_map.py 同步 os_map.json。
"""
import json
import subprocess
import sys

NOTES = 'pwa/data/notes/os_notes.json'

new_block = '''
<p class="paragraph"><b>📝 例题（2019 统考真题 · 哲学家进餐 · 多碗多筷变体）</b>有 n (n ≥ 3) 名哲学家围坐在一张圆桌边，每名哲学家交替地就餐和思考。在圆桌中心有 m (m ≥ 1) 个碗，每两名哲学家之间有一根筷子。每名哲学家必须取到一个碗和两侧的筷子后，才能就餐，进餐完毕，将碗和筷子放回原位，并继续思考。为使尽可能多的哲学家同时就餐，且防止出现死锁现象，请使用信号量的 P、V 操作 [wait()、signal() 操作] 描述上述过程中的互斥与同步，并说明所用信号量及初值的含义。</p><p class="paragraph">分析：这是哲学家进餐的多资源变体——每名哲学家要<b>同时取得"1 个碗 + 左右两根筷子"3 种资源</b>才能就餐。沿用上一小节的<b>大锁一次取得</b>思路：P(Lock) 保护"检查 + 获取"临界区，资源不够就解锁重试，用完统一归还，可保证不出现"占着一个等另一个"的死锁。同时，<b>碗数 m 还起到限制同时就餐人数的作用</b>（最多 min(m, n/2) 人可同时进餐），m 较小时天然降低死锁风险。</p><pre class="code-block">Semaphore Lock = 1;                  // 互斥信号量（大锁）：保护"检查+获取/归还"临界区
int bowl = m;                        // 共 m 个碗（碗计数，初值 = 碗数 m）
int chopstick[n] = {1, 1, 1, ...};   // 每根筷子 1 表示空闲（n 根，初值全为 1）

Process_i() {                        // 第 i 名哲学家，两侧筷子为 chopstick[i] 与 chopstick[(i+1)%n]
    while (1) {
        P(Lock);                     // ① 申请锁，进入临界区
        if (bowl &gt;= 1 &amp;&amp; chopstick[i] == 1 &amp;&amp; chopstick[(i + 1) % n] == 1) {
                                     // ② 碗 + 两侧筷子都满足吗？
            bowl--;                  // ③ 取走一个碗
            chopstick[i]--;          //    取走左侧筷子
            chopstick[(i + 1) % n]--;//    取走右侧筷子
            V(Lock);                 // ④ 解锁
            break;                   // ⑤ 退出 while 循环
        } else {
            V(Lock);                 // ⑥ 资源不够，解锁，再循环尝试
        }
    }

    哲学家进餐;                      // ⑦ 就餐（用中文说明即可）

    P(Lock);                         // ⑧ 申请锁，准备归还
    bowl++;                          // ⑨ 归还碗
    chopstick[i]++;                  //    归还左侧筷子
    chopstick[(i + 1) % n]++;        //    归还右侧筷子
    V(Lock);                         // ⑩ 解锁

    // ⑪ End
}</pre><p class="paragraph">信号量及初值含义：<b>Lock = 1</b>（互斥信号量，保护对碗和筷子的检查/获取/归还，保证原子性）；<b>bowl = m</b>（碗的计数，初值为碗总数 m，取走 -1、归还 +1）；<b>chopstick[i] = 1</b>（第 i 根筷子空闲标志，共 n 根，初值全 1）。要点：所有资源在<b>同一临界区</b>内检查并获取，资源不够时<b>先解锁再重试</b>，使用结束后<b>统一归还</b>——与上一小节的多资源一次取得法完全一致。</p><svg viewBox="0 0 680 260" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;background:#f8fafc;border-radius:8px;display:block;margin:10px 0"><defs><marker id="arpb1" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><polygon points="0,0 8,3 0,6" fill="#475569"/></marker></defs><text x="340" y="22" text-anchor="middle" font-size="13" fill="#6366f1" font-weight="bold">2019 统考真题 · n 哲学家 / m 碗 / n 筷子（大锁一次取得碗+两侧筷）</text><ellipse cx="340" cy="150" rx="210" ry="95" fill="#fef9ec" stroke="#d97706" stroke-width="2"/><text x="340" y="150" text-anchor="middle" font-size="12" fill="#b45309">圆桌</text><text x="340" y="168" text-anchor="middle" font-size="11" fill="#b45309">中心 m 个碗</text><circle cx="320" cy="128" r="12" fill="#e0e7ff" stroke="#6366f1" stroke-width="1.5"/><text x="320" y="132" text-anchor="middle" font-size="11" fill="#1e293b">碗</text><circle cx="355" cy="150" r="12" fill="#e0e7ff" stroke="#6366f1" stroke-width="1.5"/><text x="355" y="154" text-anchor="middle" font-size="11" fill="#1e293b">碗</text><g font-size="13" fill="#1e293b" text-anchor="middle"><circle cx="340" cy="62" r="16" fill="#e0e7ff" stroke="#6366f1" stroke-width="2"/><text x="340" y="67" font-size="11">P0</text><circle cx="500" cy="110" r="16" fill="#e0e7ff" stroke="#6366f1" stroke-width="2"/><text x="500" y="115" font-size="11">P1</text><circle cx="445" cy="222" r="16" fill="#e0e7ff" stroke="#6366f1" stroke-width="2"/><text x="445" y="227" font-size="11">P2</text><circle cx="235" cy="222" r="16" fill="#e0e7ff" stroke="#6366f1" stroke-width="2"/><text x="235" y="227" font-size="11">P3</text><circle cx="180" cy="110" r="16" fill="#e0e7ff" stroke="#6366f1" stroke-width="2"/><text x="180" y="115" font-size="11">P4</text></g><g stroke="#94a3b8" stroke-width="3" stroke-linecap="round"><line x1="412" y1="72" x2="468" y2="92"/><line x1="492" y1="142" x2="470" y2="192"/><line x1="380" y1="220" x2="300" y2="220"/><line x1="208" y1="192" x2="188" y2="142"/><line x1="268" y1="92" x2="325" y2="66"/></g><text x="470" y="80" text-anchor="middle" font-size="10" fill="#64748b">筷子</text><text x="488" y="168" text-anchor="middle" font-size="10" fill="#64748b">筷子</text><text x="340" y="240" text-anchor="middle" font-size="10" fill="#64748b">筷子</text><text x="168" y="168" text-anchor="middle" font-size="10" fill="#64748b">筷子</text><text x="255" y="80" text-anchor="middle" font-size="10" fill="#64748b">筷子</text><rect x="40" y="40" width="190" height="26" rx="4" fill="#fef3c7" stroke="#d97706"/><text x="48" y="57" font-size="11" fill="#1e293b">Lock=1 大锁：取碗+两侧筷原子</text><rect x="40" y="72" width="190" height="26" rx="4" fill="#fef3c7" stroke="#d97706"/><text x="48" y="89" font-size="11" fill="#1e293b">bowl=m：限制同时就餐人数</text><rect x="40" y="104" width="190" height="26" rx="4" fill="#fef3c7" stroke="#d97706"/><text x="48" y="121" font-size="11" fill="#1e293b">chopstick[i]=1：筷子空闲标志</text><rect x="40" y="142" width="190" height="30" rx="4" fill="#dcfce7" stroke="#16a34a"/><text x="48" y="153" font-size="10" fill="#1e293b">取得条件：bowl≥1 ∧ 左筷 ∧ 右筷</text><text x="48" y="166" font-size="10" fill="#64748b">不够→V(Lock)重试；用完统一归还</text></svg><h4>四、补充注意</h4>'''


def main():
    with open(NOTES, encoding='utf-8') as f:
        d = json.load(f)
    sec = d['chapters'][1]['sections'][3]
    html = sec['html']
    assert sec['section'].startswith('2.4'), sec['section']
    old = '<h4>四、补充注意</h4>'
    assert html.count(old) == 1, f'期望1处, 实际{html.count(old)}处'
    html = html.replace(old, new_block.strip())
    sec['html'] = html
    with open(NOTES, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print('OK: 哲学家小节已附加 2019 真题例题')
    print('  h4:', html.count('<h4>'), '| svg:', html.count('<svg'), '| pre:', html.count('<pre'))
    r = subprocess.run([sys.executable, 'tools/build_os_pv_map.py'])
    print('build_os_pv_map 退出码:', r.returncode)


if __name__ == '__main__':
    main()
