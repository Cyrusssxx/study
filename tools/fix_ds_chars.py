# -*- coding: utf-8 -*-
"""修复 ds_daka.json 中 15 道 408 代码真题的 OCR/转写残损字符。
残损类型：下标数字(₁₂→?)、上标 ⁻¹(→?1)、⌊⌋(→L/」)、百分号 %(→8)、
link(→1ink)、%d(→8d)、O(1)(→0(1))、%2(→82)、m1(→ml) 等。
修完 ds_daka 后由 build_ds_code.py 重新生成 ds_code.json。
"""
import json

PATH = 'pwa/data/ds_daka.json'
d = json.load(open(PATH, encoding='utf-8'))

# 全文件安全替换（这些残损在语料里不会误伤）
GLOBAL = [
    ('1ink', 'link'),
    ('8d', '%d'),
    ('0(1)', 'O(1)'),
    ('O(nlog?n)', 'O(nlog₂n)'),
    ('log?n', 'log₂n'),
    ('82==0', '%2==0'),
    ('IE|', '|E|'),
    ('Ln/2」', '⌊n/2⌋'),
    ('Ln/2]', '⌊n/2⌋'),
    ('/I之后', '//之后'),
]

# 按 source 字段精准修复（避免歧义）
PER_ENTRY = {
    '王道书 2.2.3_大题_10': [  # 2010 循环左移
        ('X?,X?,⋯,Xn-1', 'X₀,X₁,⋯,X_{n-1}'),
        ('Xo,X?,⋯,Xp-1', 'X_0,X_1,⋯,X_{p-1}'),
        ('a?1b', 'a⁻¹b'),
        ('a?1b1', 'a⁻¹b⁻¹'),
        ('a?b?1', 'a⁻¹b⁻¹'),
        ('(a?1b\')-1=ba', '(a⁻¹b\')⁻¹=ba'),
    ],
    '王道书 2.2.3_大题_11': [  # 2011 中位数
        ('第[L/27个', '第⌊L/2⌋个'),
        ('S?=(11,13,15,17,19)', 'S₁=(11,13,15,17,19)'),
        ('则S?的中位数是15', '则S₁的中位数是15'),
        ('若序列S?=(2,4,6,8,20)', '若序列S₂=(2,4,6,8,20)'),
        ('若S?=(2,4,6,8,20)', '若S₂=(2,4,6,8,20)'),
        ('则S?和S?的中位数是11', '则S₂和S₁的中位数是11'),
        ('(s1+d1)82==0', '(s1+d1)%2==0'),
        ('s1=ml', 's1=m1'),
        ('dl=ml', 'd1=m1'),
    ],
    '王道书 8.3.3_大题_4': [  # 2016 集合均分
        ('A={alO≤k&lt;n}', 'A={a_k | 0≤k&lt;n}'),
        ('将最小的⌊n/2⌋个元素放在A?中，其余的元素放在A?中',
         '将最小的⌊n/2⌋个元素放在A₁中，其余的元素放在A₂中'),
        ('子集A?和A?', '子集A₁和A₂'),
        ('n和n?', 'n₁和n₂'),
        ('A和A?中的元素之和分别为S?和S?', 'A₁和A₂中的元素之和分别为S₁和S₂'),
        ('n?-n2|最小', '|n₁-n₂|最小'),
        ('|S?-S?|最大', '|S₁-S₂|最大'),
        ('则枢轴及之前的所有元素均属于A?,继续对i之后的元素进行划分',
         '则枢轴及之前的所有元素均属于A₁,继续对i之后的元素进行划分'),
        ('则枢轴及之后的所有元素均属于A?,继续对i之前的元素进行划分',
         '则枢轴及之后的所有元素均属于A₂,继续对i之前的元素进行划分'),
    ],
    '王道书 2.2.3_大题_12': [  # 2013 主元素
        ('A=(ao,ai,⋯,an-1),其中O≤a?&lt;n', 'A=(a₀,a₁,⋯,a_{n-1}),其中0≤a_i&lt;n'),
        ('ap?=ap?=⋯=apm=x', 'a_{p₁}=a_{p₂}=⋯=a_{p_m}=x'),
        ('if(count&gt;0)\n        for(i=count=0;i&lt;n;i++)',
         '}\n    for(i=0;i&lt;n;i++)'),
    ],
    '王道书 2.3.7_大题_19': [  # 2015 绝对值去重
        ('q[Idatal]', 'q[|data|]'),
    ],
    '王道书 2.3.7_大题_20': [  # 2019 重新排列
        ('L=(a,a?,a?,⋯,a-2,a?|,a)', 'L=(a₁,a₂,a₃,⋯,a_{n-2},a_{n-1},a_n)'),
        ('L=(a,a?,a?,⋯,a?-2,a?,a)', 'L=(a₁,a₂,a₃,⋯,a_{n-2},a_{n-1},a_n)'),
        ("L'=(a,a,a?,am?1,a?,a??2,⋯)", "L'=(a₁,a_n,a₂,a_{n-1},a₃,a_{n-2},⋯)"),
        ("L'=(a,a,a?,a?1,a?,am?2,⋯)", "L'=(a₁,a_n,a₂,a_{n-1},a₃,a_{n-2},⋯)"),
        ('1/q走两步', '//q走两步'),
        ('1/p所指结点为中间结点', '//p所指结点为中间结点'),
    ],
    '王道书 2.2.3_大题_14': [  # 2020 三元组
        ('S、S?和S?', 'S₁、S₂、S₃'),
        ('a∈S?,b∈S?,c∈S?', 'a∈S₁,b∈S₂,c∈S₃'),
        ('例如 S?={-1,0,9},S?={-25,-10,10,11},S?={2,9,17,30,41}',
         '例如 S₁={-1,0,9},S₂={-25,-10,10,11},S₃={2,9,17,30,41}'),
        ('集合S、S?和S?分别保存在数组A、B、C中', '集合S₁、S₂、S₃分别保存在数组A、B、C中'),
        ('i&lt;Si', 'i&lt;|S₁|'),
        ('j&lt;|S?|', 'j&lt;|S₂|'),
        ('k&lt;|S?|', 'k&lt;|S₃|'),
        ('将A[1]、B[小C[k]中的最小值', '将A[i]、B[j]、C[k]中的最小值'),
        ('(4[],B[j],C[k])', '(A[i],B[j],C[k])'),
        ('A[1]、B[小C[k]', 'A[i]、B[j]、C[k]'),
        ('n=(ISI+IS?I+|S?)', 'n=|S₁|+|S₂|+|S₃|'),
        ('观察下面的数轴：L?L?a b L? c L?=|a-b|,L?=|b-c|,L?=|c-al',
         '观察下面的数轴：L₁=|a-b|,L₂=|b-c|,L₃=|c-a|'),
        ('L?=|c-a|', 'L₃=|c-a|'),
        ('|c-a||a-b|', '|c-a|'),
        ('k&lt;|S?时', 'k&lt;|S₃|时'),
        ('=L?+L?+L?=2L?', '=L₁+L₂+L₃=2L₃'),
    ],
    '王道书 6.2.6_大题_8': [  # 2023 K顶点
        ('要求：@⑥O', '要求：'),
    ],
}


def apply_all(text, reps):
    for old, new in reps:
        if old in text:
            text = text.replace(old, new)
    return text


changed = 0
for q in d['questions']:
    src = q.get('source', '')
    reps = list(GLOBAL)
    if src in PER_ENTRY:
        reps += PER_ENTRY[src]
    before = (q.get('content', ''), q.get('answer', ''))
    if 'content' in q:
        q['content'] = apply_all(q['content'], reps)
    if 'answer' in q:
        q['answer'] = apply_all(q['answer'], reps)
    after = (q.get('content', ''), q.get('answer', ''))
    if before != after:
        changed += 1
        print('fixed:', src)

json.dump(d, open(PATH, 'w', encoding='utf-8'), ensure_ascii=False, indent=2)
print('total questions fixed:', changed)
