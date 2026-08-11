import os
import sys

# PyInstaller打包后：只读资源（题库/模板/静态文件）在解压目录_MEIPASS，
# 可写数据（答题记录数据库）放在exe旁边，避免重启丢失
FROZEN = getattr(sys, 'frozen', False)
BASE_DIR = sys._MEIPASS if FROZEN else os.path.dirname(os.path.abspath(__file__))
APP_DIR = os.path.dirname(sys.executable) if FROZEN else BASE_DIR

DATA_DIR = os.path.join(BASE_DIR, 'data')
QUESTIONS_DIR = os.path.join(DATA_DIR, 'questions')
DB_PATH = os.path.join(APP_DIR, 'data', 'quiz.db')
PDF_DIR = os.path.join(os.path.dirname(BASE_DIR), '408习题库')

# Flask 配置
SECRET_KEY = 'quiz-408-local-app-secret'
DEBUG = False
HOST = '127.0.0.1'
PORT = 5000

# 科目映射
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
