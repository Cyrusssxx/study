# -*- coding: utf-8 -*-
"""生成 pwa/data/ds_code.json —— 「数据结构代码真题」专栏（2009-2023 共15道408代码题）。
内容 (content/answer) 直接复用 ds_daka.json 中已核对过的王道官方答案，避免手抄出错；
本脚本只负责：① 按年份+关键词定位代码题条目；② 补全正确 real(第42题)/kaodian/
analysis(易错点)/weblink(知乎原文)；③ 输出为 PWA 可直接加载的非选择题专栏 JSON。
"""
import json

# year -> (定位关键词, 考点分类, 知乎子文章ID, 易错点)
META = {
    2009: ("倒数第k", "链表", "715401637", "快指针先走k步；表长<k返回失败；空表与k<=0需特判。"),
    2010: ("循环左移", "顺序表", "715616143", "p可能≥n，先p%=n；三段逆置边界[l=p-1, r=n-1]。"),
    2011: ("中位数", "顺序表", "718557723", "合并后中位数下标是n-1不是n；等长两序列中位=第n小(1基)。"),
    2012: ("后缀", "链表", "720226035", "先让长表头指针走|len1-len2|步再同步比较；栈法需额外空间。"),
    2013: ("主元素", "顺序表", "718848457", "摩尔投票只是候选，必须二次验证是否>n/2；伪散列要求值范围[0,n-1]。"),
    2014: ("WPL", "二叉树", "717071345", "递归深度定义一致(根深度0或1)；度为1结点传空指针在408不扣分，严谨代码应判空。"),
    2015: ("绝对值", "链表", "720389291", "标记数组大小n+1(绝对值0..n)；p->next删除后p不动。"),
    2016: ("划分为两个不相交", "顺序表", "722256405", "用快排partition思想将n个整数按枢轴分成两半，较小一半归A₁、较大一半归A₂，使个数差最小且和差最大；枢轴定位到k-1(n/2)即停；平均O(n)/O(1)。"),
    2017: ("中缀表达式", "二叉树", "720860549", "最外层不加括号；deep>1才加括号；优先级判断用当前结点运算符。"),
    2018: ("最小正整数", "顺序表", "720283487", "值范围[0,n]，用n长标记数组；置换法原地归位空间O(1)。"),
    2019: ("重新排列", "链表", "720397271", "先找中点断开、再逆置后半段、最后前插交叉重排时p移到下一段头。"),
    2020: ("三元组", "顺序表", "720312808", "每次让当前最小值所在指针前进一步逼近相等；暴力O(n³)会超时。"),
    2021: ("EL路径", "图", "721791028", "奇度顶点0(回路)或2(路径)是必要非充分，还需图连通(排除孤立点)。"),
    2022: ("二叉搜索树", "二叉树", "720983629", "顺序存储下标i的左右孩子2i+1/2i+2，-1空；递归范围约束或中序升序。"),
    2023: ("K顶点", "图", "721975150", "有向图出度看行、入度看列，别反；INF/0判边。"),
}

with open('pwa/data/ds_daka.json', encoding='utf-8') as f:
    daka = json.load(f)

questions = []
for year in sorted(META):
    kw, kaodian, zhihu, analysis = META[year]
    cand = [q for q in daka['questions']
            if q.get('sheet') == '算法题' and kw in q.get('content', '')]
    if not cand:
        raise SystemExit(f"[!] 未找到 {year} 代码题 (keyword={kw})")
    if len(cand) > 1:
        print(f"[!] {year} 命中多个候选，取首个：{[c.get('id') for c in cand]}")
    q = cand[0]
    questions.append({
        "id": f"ds_code_{year}",
        "year": year,
        "real": f"{year}年408真题第42题",
        "kaodian": kaodian,
        "module": "408代码真题",
        "source": q.get('source', ''),
        "content": q.get('content', ''),
        "answer": q.get('answer', ''),
        "analysis": analysis,
        "weblink": f"https://zhuanlan.zhihu.com/p/{zhihu}",
    })

out = {
    "subject": "数据结构代码题",
    "subject_key": "ds_code",
    "name": "数据结构代码真题(2009-2023)",
    "total": len(questions),
    "questions": questions,
}
with open('pwa/data/ds_code.json', 'w', encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=2)
print(f"[ok] 写入 pwa/data/ds_code.json，共 {len(questions)} 道")
for q in questions:
    print(f"  - {q['id']:14s} {q['real']:18s} {q['kaodian']}")
