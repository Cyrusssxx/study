# -*- coding: utf-8 -*-
"""一次性脚本：把教材核心示意图以 ASCII/文字结构还原，补进 OS 笔记对应小节。
图内用纯 ASCII 保证对齐，中文说明在图外 <p> 中。
"""
import json, html

SRC = 'pwa/data/notes/os_notes.json'
notes = json.load(open(SRC, encoding='utf-8'))

def fig(caption, ascii_text):
    body = html.escape(ascii_text.strip('\n'), quote=False)
    return f'<p class="paragraph"><b>示意图（{caption}）</b>：</p><pre class="ascii-fig">{body}</pre>'

# ---- 图内容（ASCII 正文，脚本统一 escape）----
FIGS = {
'1.1.1 操作系统的概念': fig('教材图1.1 操作系统的地位', '''
      +---------+
      |   User  |   (users)
      +----+----+
           |
      +----v----+
      |   App   |   (application programs)
      +----+----+
           |
      +----v----+
      |   OS    |   <-- bridge between HW & user
      +----+----+
           |
      +----v----+
      |Hardware |
      +---------+
'''),

'2.1.3 进程的内存映像': fig('教材图2.1 进程内存映像', '''
High address
+---------------------+
|        Stack        |   (grows downward: locals/args/ret addr)
+---------------------+
|  Shared Libraries   |   (printf etc., dynamically mapped)
+---------------------+
|        Heap         |   (grows upward: malloc/free)
+---------------------+
|  Data  .data / .bss |   (global & static vars)
+---------------------+
|  Code .init/.text/  |   (.rodata, read-only)
|       .rodata       |
+---------------------+
Low address
'''),

'2.1.4 进程的状态与转换': fig('教材图2.2 五种进程状态的转换', '''
             create                 dispatch                   exit
   [ NEW ] -----------> [ READY ] ----------> [ RUNNING ] ----------> [ TERMINATED ]
                          ^  ^                  |     |
                          |  |  time-slice out  |     | I/O request
                          |  +------------------+     v
                          |                      [ BLOCKED ]
                          +----------------------------+
                              I/O complete: blocked -> ready
'''),

'3.1.5 段页式存储管理': fig('教材图3.17/3.18 段页式逻辑地址结构与三次访存', '''
logical address:  +----------+----------+--------------+
                  |  seg #S  |  page #P |  offset W    |
                  +----------+----------+--------------+

address translation (3 memory accesses without TLB):
   S                P                     W
   |                |                     |
   v                v                     v
[segment table] --> [page table] --> physical block# + W = physical addr
   (1st access)      (2nd access)         (3rd access)
'''),

'3.2.7 内存映射文件': fig('教材图3.27 采用内存映射I/O的共享内存', '''
   Process1 VA space       Process2 VA space
  +------------------+    +------------------+
  |  mapped region   |    |  mapped region   |
  +--------+---------+    +--------+---------+
           |                       |
           |    (page tables)      |
           +-----------+-----------+
                       v
             +---------------------+
             |  same physical      |
             |  memory (shared)    |
             +---------------------+
'''),

'4.1.2 文件系统结构': fig('教材图4.1 文件系统的层次结构', '''
+----------------------+
|     Application      |
+----------+-----------+
           |
+----------v-----------+
|  Logical File System |   (metadata, directory, FCB, protection)
+----------+-----------+
           |
+----------v-----------+
| File Organization    |   (logical->physical block map, free space)
+----------+-----------+
           |
+----------v-----------+
|   Basic File System  |   (generic cmds, buffer management)
+----------+-----------+
           |
+----------v-----------+
|     I/O Control      |   (device drivers, interrupt handlers)
+----------+-----------+
           |
+----------v-----------+
|        Device        |
+----------------------+
'''),

'4.2.7 文件的操作': fig('教材图4.16 内存中文件的系统结构（两级打开文件表）', '''
  User space                  Kernel space
+-------------------+   +--------------------------------+
|  fd (index)       |-->|  process open-file table       |
|  read(fd)/write() |   |  (private: rw ptr, access mode)|
+-------------------+   +---------------+----------------+
                                        | points to
                                        v
                               +------------------------+
                               |  system open-file table|
                               |  (global: disk pos,    |
                               |   size, open count)    |
                               +-----------+------------+
                                           |
                                           v
                                   +---------------+
                                   |  Disk (FCB)   |
                                   +---------------+
'''),

'4.2.8 文件共享': fig('教材图4.17/4.19 硬链接(基于索引节点)与软链接(符号链)', '''
hard link (by inode):                 soft link (symbolic link):
  Dir A          Dir B                 Dir A          Dir B
 +-------+      +-------+            +-------+      +----------------+
 | name -+      +- name |            | name -+      | name -> link   | (stores path "A/F")
 +---+---+      +---+---+            +---+---+      +-------+--------+
     |              |                    |                  | lookup by path
     +------+-------+                    v                  v
            v                        +---------+       +---------+
      +-----------+                  | inode F |<------|  file F |
      |   inode   |  count = 2       +---------+       +---------+
      | (phys addr)|
      +-----------+
'''),

'4.3.1 文件系统布局': fig('教材图4.20 一个可能的文件系统布局', '''
[ MBR ] [ partition table ] [ boot block ] [ super block ] [ free-space mgmt ] [ i-nodes ] [ root dir ] [ files & dirs ... ]
  |            |                 |                |               |                  |            |            |
  |sector 0    |start/end addr   |loads OS        |total blocks   |bitmap or         |per-file    |start of    |actual
  |loads MBR   |of each partition|in partition    |block size...  |free-list         |metadata    |dir tree    |data
'''),

'4.3.2 文件存储空间管理': fig('教材图4.21/4.22 位示图法 与 成组链接法', '''
bitmap (m x n bits, 1=allocated 0=free):
          col: 1 2 3 ... n
      row1    1 1 0 ... 0
      row2    0 1 0 ... 1
      ...     ...
      rowm    0 0 1 ... 0
      block#  b = n*(i-1) + j

group linking (UNIX, ~100 blocks/group):
   super block -> [201..300]   (stack, count=100)
       block 300 -> [301..400] (index block)
       block 400 -> [401..500]
       ...
       block 7900 -> [7901..7999] (count=99, first="0" => end of chain)
'''),

'4.3.3 虚拟文件系统（VFS）': fig('教材图4.23 虚拟文件系统示意图', '''
      User process
           |  POSIX (open/read/write)
           v
  +--------------------+
  |   VFS interface    |   (unified, object-oriented)
  +----+----+----+-----+
       |    |    |
       v    v    v
   [ext2/3][NTFS][FAT]  ...  (each FS implements VFS ops)
'''),

'5.2.6 I/O操作举例': fig('教材图5.16 系统调用的大致过程', '''
  user mode                     kernel mode
+--------------------+        +-----------------------+
| 1. pass args       |        |                       |
| 2. trap (int)  --->|------->| 3. system-call        |
|                    |        |    service routine     |
| 4. <-- return      |<-------|                       |
+--------------------+        +-----------------------+
'''),
}

# ---- 插入到对应小节末尾 ----
hit = 0
for ch in notes['chapters']:
    for s in ch['sections']:
        for ss in s.get('subsections', []):
            if ss['section'] in FIGS:
                ss['html'] += FIGS[ss['section']]
                hit += 1
missing = [k for k in FIGS if k not in sum([[ss['section'] for s in c['sections'] for ss in s.get('subsections',[])] for c in notes['chapters']], [])]
print(f'已插入 {hit} 张图', '| 未匹配:', missing if missing else '无')

with open(SRC, 'w', encoding='utf-8') as f:
    json.dump(notes, f, ensure_ascii=False, indent=2)
    f.write('\n')
