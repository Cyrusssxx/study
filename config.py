"""
408刷题应用 - 共享路径与科目配置

说明：项目已废弃 exe / Flask 路径，PWA（pwa/）为唯一前端。
本文件仅被一次性数据生成脚本（parse_pdf.py / add_chapters.py /
generate_answers.py 等）复用，提供题库/PDF 路径与科目映射。
"""
import os

BASE_DIR = os.path.dirname(os.path.abspath(__file__))

DATA_DIR = os.path.join(BASE_DIR, 'data')
# 题库真源已统一为 pwa/data（PWA 只读取此处，也是上游管线 parse_pdf/add_chapters/
# generate_answers/fmt_code_questions --apply 的写入目标）。data/questions 改为构建期生成，
# 由 tools/sync_questions.py 从真源复制规范化得到，不再手工维护（见 .gitignore）。
QUESTIONS_DIR = os.path.join(BASE_DIR, 'pwa', 'data')
PDF_DIR = os.path.join(os.path.dirname(BASE_DIR), '408习题库')

# 科目映射：pdf = 题库源文件，json = 解析后题库
SUBJECTS = {
    'os': {
        'name': '操作系统',
        'pdf': '【A4无间隙】操作系统选择题做题本.pdf',
        'json': 'os.json'
    },
    'co': {
        'name': '计算机组成原理',
        'pdf': '【A4无间隙】计算机组成原理选择题做题本.pdf',
        'json': 'co.json'
    },
    'ds': {
        'name': '数据结构',
        'pdf': '【A4紧凑】27王道《数据结构》 - 选择部分.pdf',
        'json': 'ds.json'
    },
    'cn': {
        'name': '计算机网络',
        'pdf': '【A4紧凑】王道计算机网络选择题.pdf',
        'json': 'cn.json'
    }
}
