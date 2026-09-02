"""修复 1.2 节 28/29 题干写反 + 补齐 2 道缺失解析（教材原文）"""
import json

ROOT = r'D:/ai code/408-quiz'
d = json.load(open(f'{ROOT}/pwa/data/cn.json', encoding='utf-8'))
qs = d['questions']

# ---- 1) 交换 1.2 节 slot 45/46 的题干内容（_pdf_qno 对槽位本就正确，是内容被写反） ----
A = next(q for q in qs if '各层都有差错控制过程' in (q.get('content') or ''))   # 教材 Q28
B = next(q for q in qs if '自下而上第一个提供端到端' in (q.get('content') or ''))  # 教材 Q29
assert A['number'] == 46 and B['number'] == 45, (A['number'], B['number'])
print(f"交换前: {A['id']}(num={A['number']},qno={A['_pdf_qno']}) = 各层都有差错控制")
print(f"        {B['id']}(num={B['number']},qno={B['_pdf_qno']}) = 自下而上第一个提供端到端")

KEEP = {'id', 'number', '_pdf_qno'}   # 槽位属性不动，其余随题干走
# 只取各自真实存在的键（blank_opts 仅多空题有，不能按并集取）
swapA = {k: A[k] for k in list(A) if k not in KEEP}
swapB = {k: B[k] for k in list(B) if k not in KEEP}
for k in list(A):
    if k not in KEEP:
        del A[k]
for k in list(B):
    if k not in KEEP:
        del B[k]
A.update(swapB)   # slot46 装入「自下而上」
B.update(swapA)   # slot45 装入「各层都有差错控制」

assert '各层都有差错控制过程' in B['content'] and B['_pdf_qno'] == 28
assert '自下而上第一个提供端到端' in A['content'] and A['_pdf_qno'] == 29
print(f"交换后: {B['id']}(num={B['number']},qno={B['_pdf_qno']}) = 各层都有差错控制")
print(f"        {A['id']}(num={A['number']},qno={A['_pdf_qno']}) = 自下而上第一个提供端到端")

# ---- 2) 补解析（教材原文） ----
# 教材 1.2.5 答案与解析 第28条：28. A、C、C
B['explanation'] = (
    '<p>①物理层。物理层负责正确、透明地传输比特流(0,1)。</p>'
    '<p>②数据链路层。数据链路层的PDU称为帧，帧的差错检测是数据链路层的功能。</p>'
    '<p>③应用层。打印机是向用户提供服务的，运行的是应用层的程序。</p>'
)
print(f"\n补解析 -> {B['id']} (教材Q28, 答案{B['answer']})")

# 教材 3.6 答案与解析 第11条：11. A
q183 = next(q for q in qs if q['number'] == 183)
q183['explanation'] = '<p>CSMA/CD协议中定义的争用期是指信号在最远两个端点之间往返传输的时间。</p>'
print(f"补解析 -> {q183['id']} (教材3.6 Q11, 答案{q183['answer']})")

json.dump(d, open(f'{ROOT}/pwa/data/cn.json', 'w', encoding='utf-8'),
         ensure_ascii=False, separators=(',', ': '), indent=2)

# ---- 3) 校验 ----
empty = [q for q in qs if not (q.get('explanation') or '').strip()]
print(f"\n校验: 无解析题数 = {len(empty)}")
print("1.2 节 28/29 复核:")
s12 = sorted([q for q in qs if (q.get('section') or '').startswith('1.2')], key=lambda x: x['_pdf_qno'])
for q in s12:
    if q['_pdf_qno'] in (28, 29):
        print(f"  qno={q['_pdf_qno']} num={q['number']} {q['id']} multi={q.get('multi_blank')} "
              f"ans={q['answer']} {(q.get('content') or '')[:22]}")
