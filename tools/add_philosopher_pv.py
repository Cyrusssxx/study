# -*- coding: utf-8 -*-
"""
add_philosopher_pv.py — 在 os_notes.json 2.4 PV操作大题总结 的「三、补充注意」之前
插入新小节「三、哲学家进餐：多资源一次取得解法（防死锁）」，原「三」顺延为「四」。
含代码块(pre.code-block) + SVG 草图。插入后自动重跑 build_os_pv_map.py 同步 os_map.json。
"""
import json
import re
import subprocess
import sys

NOTES = 'pwa/data/notes/os_notes.json'

new_block = '''
<h4>三、哲学家进餐：多资源一次取得解法（防死锁）</h4><p class="paragraph">哲学家问题中，每个进程需要<b>同时占用多种资源</b>才能运行（哲学家要拿到左右两根筷子才能进餐）。这类"多资源需求"模型是死锁高发区——若各进程各占一种资源互相等待，就会死锁。一个通用且<b>推荐使用</b>的解法：<b>让进程一口气取得所有需要的资源，再开始运行</b>（检查与获取在同一临界区内完成，杜绝"占着一个等另一个"）。优点：并发度高、不会死锁。</p><p class="paragraph">核心思想用伪代码表示如下（以三类资源 a、b、c 为例）：</p><pre class="code-block">semaphore Lock = 1;      // 大锁（互斥信号量）：保护"检查 + 获取"临界区

// 定义三类资源，初始数量分别为 9、8、5
int a = 9;               // a 的剩余数量
int b = 8;               // b 的剩余数量
int c = 5;               // c 的剩余数量

Process() {
    while (1) {
        P(Lock);                                  // ① 申请锁，进入临界区
        if (a &gt;= 需要量A &amp;&amp; b &gt;= 需要量B &amp;&amp; c &gt;= 需要量C) {
            a -= 需要量A;                         // ② 所有资源都够吗？
            b -= 需要量B;                         // ③ 够则资源值减少
            c -= 需要量C;
            // 取走 xxx 资源
            V(Lock);                              // ④ 解锁
            break;                                // ⑤ 退出 while 循环
        } else {
            V(Lock);                              // ⑥ 资源不够，解锁，再循环尝试一次
        }
    }

    // ⑦ 继续该做的事情（如：哲学家进餐）——用中文说明即可

    P(Lock);                                      // ⑧ 申请锁，准备归还资源
    a += 需要量A;                                 // ⑨ 归还所有资源，资源值增加
    b += 需要量B;
    c += 需要量C;
    V(Lock);                                      // ⑩ 解锁

    // ⑪ End
}</pre><p class="paragraph">要点：<b>① "检查 + 获取"必须原子</b>——P(Lock) 保护 if 判断与资源扣减，期间其他进程无法插队，避免"检查通过但资源已被抢光"；<b>② 资源不够时先 V(Lock) 解锁再重试</b>，不占着锁忙等，互斥信号量上不会死锁；<b>③ 用完统一归还</b>——使用结束后一次 P(Lock)、全部归还、一次 V(Lock)；<b>④ 资源计数初值 = 资源总量</b>（a/b/c 为普通计数变量），Lock 为互斥信号量初值 1。</p><svg viewBox="0 0 680 300" xmlns="http://www.w3.org/2000/svg" style="max-width:100%;background:#f8fafc;border-radius:8px;display:block;margin:10px 0"><defs><marker id="arp1" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><polygon points="0,0 8,3 0,6" fill="#475569"/></marker><marker id="arp2" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><polygon points="0,0 8,3 0,6" fill="#ef4444"/></marker><marker id="arp3" markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto"><polygon points="0,0 8,3 0,6" fill="#16a34a"/></marker></defs><text x="340" y="24" text-anchor="middle" font-size="13" fill="#6366f1" font-weight="bold">哲学家进餐 · 多资源一次取得（大锁保证检查+获取原子）</text><text x="70" y="52" text-anchor="middle" font-size="13" fill="#1e293b">哲学家</text><circle cx="70" cy="80" r="26" fill="#e0e7ff" stroke="#6366f1" stroke-width="2"/><text x="70" y="85" text-anchor="middle" font-size="14" fill="#1e293b">🍽</text><text x="70" y="132" text-anchor="middle" font-size="11" fill="#64748b">需 A+B+C 同时有</text><line x1="96" y1="80" x2="172" y2="62" stroke="#475569" stroke-width="2" marker-end="url(#arp1)"/><rect x="174" y="42" width="130" height="40" rx="6" fill="#fef3c7" stroke="#d97706" stroke-width="2"/><text x="239" y="58" text-anchor="middle" font-size="12" fill="#1e293b">① P(Lock)</text><text x="239" y="73" text-anchor="middle" font-size="10" fill="#64748b">申请锁</text><line x1="304" y1="62" x2="378" y2="62" stroke="#475569" stroke-width="2" marker-end="url(#arp1)"/><rect x="380" y="42" width="230" height="40" rx="6" fill="#dbeafe" stroke="#2563eb" stroke-width="2"/><text x="495" y="58" text-anchor="middle" font-size="12" fill="#1e293b">② 检查 a≥A ∧ b≥B ∧ c≥C</text><text x="495" y="73" text-anchor="middle" font-size="10" fill="#64748b">所有资源都够吗？</text><line x1="610" y1="62" x2="650" y2="62" stroke="#475569" stroke-width="2" marker-end="url(#arp1)"/><text x="632" y="50" text-anchor="middle" font-size="11" fill="#16a34a" font-weight="bold">够</text><line x1="495" y1="82" x2="495" y2="110" stroke="#16a34a" stroke-width="2" marker-end="url(#arp3)"/><text x="510" y="100" text-anchor="middle" font-size="11" fill="#16a34a" font-weight="bold">不够 ↓</text><rect x="380" y="112" width="230" height="40" rx="6" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/><text x="495" y="128" text-anchor="middle" font-size="12" fill="#1e293b">③ 扣减 a-=A b-=B c-=C</text><text x="495" y="143" text-anchor="middle" font-size="10" fill="#64748b">④ V(Lock) 解锁 · ⑤ break</text><line x1="495" y1="152" x2="495" y2="180" stroke="#475569" stroke-width="2" marker-end="url(#arp1)"/><rect x="380" y="182" width="230" height="40" rx="6" fill="#f1f5f9" stroke="#64748b" stroke-width="2"/><text x="495" y="198" text-anchor="middle" font-size="12" fill="#1e293b">⑦ 使用资源（哲学家进餐）</text><text x="495" y="213" text-anchor="middle" font-size="10" fill="#64748b">用完归还 ↓</text><line x1="380" y1="82" x2="200" y2="82" stroke="#ef4444" stroke-width="2" stroke-dasharray="5,4" marker-end="url(#arp2)"/><path d="M200 82 Q150 82 150 132 L150 158" fill="none" stroke="#ef4444" stroke-width="2" stroke-dasharray="5,4"/><line x1="150" y1="162" x2="150" y2="198" stroke="#ef4444" stroke-width="2" marker-end="url(#arp2)"/><rect x="40" y="170" width="130" height="40" rx="6" fill="#fee2e2" stroke="#ef4444" stroke-width="2"/><text x="105" y="186" text-anchor="middle" font-size="12" fill="#1e293b">⑥ 不够→V(Lock)</text><text x="105" y="201" text-anchor="middle" font-size="10" fill="#64748b">解锁后再试 while(1)</text><line x1="174" y1="190" x2="380" y2="190" stroke="#475569" stroke-width="2" marker-end="url(#arp1)"/><rect x="240" y="252" width="170" height="36" rx="6" fill="#dcfce7" stroke="#16a34a" stroke-width="2"/><text x="325" y="275" text-anchor="middle" font-size="12" fill="#1e293b">⑧⑨⑩ 归还 a/b/c + V(Lock)</text><text x="590" y="88" text-anchor="middle" font-size="11" fill="#64748b">资源池</text><rect x="540" y="100" width="100" height="24" rx="4" fill="#f1f5f9" stroke="#64748b"/><text x="590" y="116" text-anchor="middle" font-size="11" fill="#1e293b">a = 9</text><rect x="540" y="128" width="100" height="24" rx="4" fill="#f1f5f9" stroke="#64748b"/><text x="590" y="144" text-anchor="middle" font-size="11" fill="#1e293b">b = 8</text><rect x="540" y="156" width="100" height="24" rx="4" fill="#f1f5f9" stroke="#64748b"/><text x="590" y="172" text-anchor="middle" font-size="11" fill="#1e293b">c = 5</text><text x="590" y="206" text-anchor="middle" font-size="10" fill="#64748b">扣减→取走</text><text x="590" y="222" text-anchor="middle" font-size="10" fill="#64748b">归还→加回</text></svg><h4>四、补充注意</h4>'''


def main():
    with open(NOTES, encoding='utf-8') as f:
        d = json.load(f)
    sec = d['chapters'][1]['sections'][3]
    html = sec['html']
    assert sec['section'].startswith('2.4'), sec['section']
    # 把旧的「三、补充注意」h4 替换为 新块(以四、补充注意结尾)
    old = '<h4>三、补充注意</h4>'
    assert html.count(old) == 1, f'期望1处, 实际{html.count(old)}处'
    html = html.replace(old, new_block.strip())
    sec['html'] = html
    with open(NOTES, 'w', encoding='utf-8') as f:
        json.dump(d, f, ensure_ascii=False, indent=2)
    print('OK: os_notes.json 已插入「三、哲学家进餐」小节, 原三→四')
    print('  新节含 h4:', html.count('<h4>'), '| svg:', html.count('<svg'), '| pre:', html.count('<pre'))
    # 同步 os_map.json
    r = subprocess.run([sys.executable, 'tools/build_os_pv_map.py'])
    print('build_os_pv_map 退出码:', r.returncode)


if __name__ == '__main__':
    main()
