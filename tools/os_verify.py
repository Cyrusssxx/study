import sys, re, glob, json, difflib
sys.path.insert(0, r"C:/Users/cjx/.workbuddy/binaries/python/envs/default/Lib/site-packages")
import fitz

PDF = glob.glob(r"d:/ai code/408教材/2027王道*操作*.pdf")[0]
OS_JSON = r"pwa/data/os.json"
BODY_START = 15  # page 0-based: first BODY '本节习题精选' is 1.1.4 (pages 0-14 are TOC)

def norm(s):
    s = s.replace(" ", "").replace("　", "").replace("\n", "")
    s = s.replace("（）","()").replace("．",".").replace("：",":").replace("？","?")
    s = s.replace("，",",").replace("；",";").replace("（","(").replace("）",")")
    return s.lower().strip()

ART = re.compile(r'^\s*(?:\d+|[IVXLCDM]+|第.+章|.*考研复习指导.*|单项选择题|二、综合应用题|综合应用题|一、单项选择题)\s*$')
def clean(block):
    return "\n".join(l for l in block.split("\n") if not ART.match(l))

COMP = re.compile(r'综合应用题')
def single_region(raw):
    m = COMP.search(raw)
    return raw[:m.start()] if m else raw

doc = fitz.open(PDF)
full = "\n".join(doc[i].get_text() for i in range(BODY_START, doc.page_count))

ans_hdr = re.compile(r'(\d+)\.(\d+)\.(\d+)\s*答案与解析')
ans_mark = re.compile(r'\d+\.\d+\.\d+\s*答案与解析')
q_hdr = re.compile(r'(\d+)\.(\d+)\.\d+\s*本节习题精选')

# ans_blocks[key] = dict {num: letter} for 单选 only
ans_blocks = {}
for m in ans_hdr.finditer(full):
    ch, sec = m.group(1), m.group(2)
    s = m.end(); nxt = ans_hdr.search(full, s)
    raw = full[s: nxt.start() if nxt else len(full)]
    region = clean(single_region(raw))
    pairs = re.findall(r'(?m)^\s*(\d{1,2})\s*\.\s*([A-E])\b', region)
    d = {int(n): L for n, L in pairs}
    if d:
        ans_blocks[(ch, sec)] = d

# stem_blocks[key] = dict {num: (stem_norm, opts_norm)} for 单选 only
stem_blocks = {}
for m in q_hdr.finditer(full):
    ch, sec = m.group(1), m.group(2)
    s = m.end(); nxt = q_hdr.search(full, s)
    end = nxt.start() if nxt else len(full)
    am = ans_mark.search(full, s)
    if am:
        end = min(end, am.start())
    raw = full[s:end]
    region = clean(single_region(raw))
    chunks = [(int(cm.group(1)), cm.start(), cm.end()) for cm in re.finditer(r'(?m)^\s*(\d{1,2})\s*\.\s*', region)]
    d = {}
    for i, (num, st, en) in enumerate(chunks):
        e2 = chunks[i+1][1] if i+1 < len(chunks) else len(region)
        chunk = region[en:e2]
        smo = re.search(r'(?m)^\s*A[\.．]', chunk)
        stem = chunk[:smo.start()] if smo else chunk
        stem_n = norm(stem)
        opts = {}
        for om in re.finditer(r'(?m)^\s*([A-E])\s*[\.．]\s*([^\n]*)', chunk):
            opts[om.group(1)] = norm(om.group(2))
        if stem_n and opts:
            d[num] = (stem_n, opts)
    if d:
        stem_blocks[(ch, sec)] = d

data = json.load(open(OS_JSON, encoding="utf-8"))
qs = data["questions"]
sec_json = {}
multi_letter = []  # questions whose answer is a multi-letter combo (组合选择题)
# known JSON section-label artifacts: '71.3 文件系统' is really PDF chapter 4.3
SEC_REMAP = {("71", "3"): ("4", "3")}
for q in qs:
    sk = re.match(r'(\d+)\.(\d+)', q.get("section", ""))
    if not sk:
        continue
    key = (sk.group(1), sk.group(2))
    key = SEC_REMAP.get(key, key)
    ans = (q.get("answer") or "").upper()
    onorm = {k: norm(v) for k, v in (q.get("options") or {}).items()}
    if not (len(ans) == 1 and ans in "ABCDE"):
        multi_letter.append((q["id"], key, ans, norm(q["content"]), onorm))
        continue
    sec_json.setdefault(key, []).append((q["id"], q["number"], norm(q["content"]), ans, onorm))

def option_score(json_opts, pdf_opts):
    joined = " ".join(pdf_opts.values())
    return sum(1 for v in json_opts.values() if v and v in joined)

def lcp_len(a, b):
    n = min(len(a), len(b)); i = 0
    while i < n and a[i] == b[i]:
        i += 1
    return i

def fuzzy_lcp(a, b):
    n, m = len(a), len(b)
    i = 0
    while i < min(n, m) and a[i] == b[i]:
        i += 1
    best = i
    if i < min(n, m):
        j = i; k = i + 1
        while j < n and k < m and a[j] == b[k]:
            j += 1; k += 1
        best = max(best, j)
        j = i + 1; k = i
        while j < n and k < m and a[j] == b[k]:
            j += 1; k += 1
        best = max(best, j)
    return best

def best_match(cnorm, json_opts, stem_dict, debug=False):
    L = len(cnorm)
    if L == 0:
        return None
    cands = []
    closest = (0.0, 0, None)
    for num, (ns, opts) in stem_dict.items():
        s = difflib.SequenceMatcher(None, cnorm, ns).ratio()
        if s > closest[0]:
            closest = (s, option_score(json_opts, opts), num)
        # accept if high character similarity (tolerates 1-2 char swaps like
        # 以下<->下列, 分时系统<->分时操作系统, 段页式<->段式) OR a long shared prefix.
        if s >= 0.80 or lcp_len(cnorm, ns) >= 22:
            cands.append((s, option_score(json_opts, opts), num))
    if not cands:
        if debug:
            print("      NO CANDIDATE. closest stem #%s sim=%.2f os=%d" % (closest[2], closest[0], closest[1]))
        return None
    cands.sort(key=lambda x: (x[0], x[1]), reverse=True)
    return cands[0][2]

content_candidates = []
matched_agree = 0
matched_total = 0
unmatched = []
sec_stats = []
matched_stems = {}
for key, items in sec_json.items():
    stems = stem_blocks.get(key, {})
    answers = ans_blocks.get(key, {})
    matched_nums = set()
    sec_stats.append((key, len(items), len(stems), len(answers)))
    for qid, num, cnorm, jans, onorm in items:
        mnum = best_match(cnorm, onorm, stems, debug=True)
        if mnum is None:
            unmatched.append((qid, key, jans, cnorm))
            continue
        pans = answers.get(mnum)
        if pans is None:
            unmatched.append((qid, key, jans, cnorm[:26] + " [no pdf ans]"))
            continue
        matched_total += 1
        matched_nums.add(mnum)
        if pans == jans:
            matched_agree += 1
        else:
            content_candidates.append((qid, jans, pans, mnum, stems[mnum][0], stems[mnum][1]))
    matched_stems[key] = matched_nums

def nw_align(J, P, gap=6, min_lcp=10):
    n, m = len(J), len(P)
    score = [[0]*(m+1) for _ in range(n+1)]
    for i in range(1, n+1):
        score[i][0] = score[i-1][0] - gap
    for j in range(1, m+1):
        score[0][j] = score[0][j-1] - gap
    for i in range(1, n+1):
        for j in range(1, m+1):
            lc = fuzzy_lcp(J[i-1][2], P[j-1][1])
            s = lc if lc >= min_lcp else -lc
            diag = score[i-1][j-1] + s
            up = score[i-1][j] - gap
            left = score[i][j-1] - gap
            score[i][j] = max(diag, up, left)
    pairs = []
    i, j = n, m
    while i > 0 or j > 0:
        if i > 0 and j > 0:
            lc = fuzzy_lcp(J[i-1][2], P[j-1][1])
            s = lc if lc >= min_lcp else -lc
            if score[i][j] == score[i-1][j-1] + s:
                if lc >= min_lcp:
                    pairs.append((J[i-1][0], J[i-1][1], P[j-1][0], P[j-1][2]))
                i -= 1; j -= 1
                continue
        if i > 0 and (j == 0 or score[i][j] == score[i-1][j] - gap):
            i -= 1
        else:
            j -= 1
    pairs.reverse()
    return pairs

align_candidates = []
align_pairs = 0
for key in sorted(stem_blocks):
    stems = stem_blocks[key]
    answers = ans_blocks.get(key, {})
    J = [(qid, jans, cnorm) for (qid, k, jans, cnorm) in unmatched if k == key]
    P = [(pn, stems[pn][0], answers.get(pn)) for pn in sorted(stems)]
    pairs = nw_align(J, P)
    for (qid, jans, pn, pans) in pairs:
        align_pairs += 1
        if pans is not None and pans != jans:
            align_candidates.append((qid, jans, pans, pn, key))

print("PDF ans sections:", len(ans_blocks), "| PDF stem sections:", len(stem_blocks), "| JSON single-letter sections:", len(sec_json))
print("Matched 单选:", matched_total, "| agree:", matched_agree, "| candidates:", len(content_candidates))
print("Multi-letter combo questions (excluded from single-letter check):", len(multi_letter))
print("\n-- per-section (json_n, pdf_单选_stems, pdf_单选_answers, matched) --")
for st in sec_stats:
    key = st[0]
    mn = len(matched_stems.get(key, set()))
    flag = "" if st[2] == st[3] else "  <-- stem/ans count MISMATCH"
    print("  ", st, "matched=%d" % mn, flag)
print("\nCANDIDATES (json vs pdf answer letter):")
for c in content_candidates:
    qid, jans, pans, num, snorm, sopts = c
    q = next(x for x in qs if x["id"] == qid)
    print("  %s  json=%s pdf=%s (单选#%d)" % (qid, jans, pans, num))
    print("    JSON : %s" % q["content"])
    print("    PDF  : %s" % snorm)
    print("    JSONopts: %s" % json.dumps({k: v for k, v in (q.get("options") or {}).items()}, ensure_ascii=False))
    print("    PDFopts : %s" % json.dumps(sopts, ensure_ascii=False))
print("\n=== PDF 单选 stems NOT matched (possible MISSING from JSON) ===")
total_missing = 0
for key in sorted(stem_blocks):
    stems = stem_blocks[key]
    ans = ans_blocks.get(key, {})
    matched = matched_stems.get(key, set())
    miss = sorted(set(stems) - matched)
    if miss:
        total_missing += len(miss)
        print("  section %s.%s missing pdf#:" % key, miss)
        for n in miss:
            print("      #%02d : %s  (ans=%s)" % (n, stems[n][0][:40], ans.get(n, "?")))
print("  TOTAL missing 单选 stems:", total_missing)
print("\nUNMATCHED JSON questions (residual, %d):" % len(unmatched))
for u in unmatched:
    print("  ", u)
print("\n=== SEQUENCE-ALIGNMENT of residual (NW) ===")
print("  aligned pairs: %d | answer-mismatch candidates: %d" % (align_pairs, len(align_candidates)))
for pc in align_candidates:
    qid, jans, pans, pn, key = pc
    q = next(x for x in qs if x["id"] == qid)
    print("  %s  json=%s pdf=%s (aligned pdf#%d, sec %s.%s)" % (qid, jans, pans, pn, key[0], key[1]))
    print("    JSON : %s" % q["content"][:80])
    print("    PDF  : %s" % stems.get(pn, ("?",))[0][:80])
print("\n=== MULTI-LETTER combo questions (need manual check) ===")
for qid, key, ans, cnorm, onorm in multi_letter:
    print("  %s sec=%s.%s ans=%s" % (qid, key[0], key[1], ans))
    print("    %s" % cnorm[:60])
