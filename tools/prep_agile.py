# -*- coding: utf-8 -*-
"""
Faza A (rozszerzenie planu 13, korekta M2): przygotowanie Agile Practice Guide
do pracy z AI - blizniacze do prep_pmbok.py, ale dla zrodla zwinnego.

Z 184-stronicowego (NIEzaszyfrowanego) PDF robi ostrukturyzowany korpus pojec:
  A.1  ekstrakcja tekstu per strona (PyMuPDF)
  A.2  czyszczenie szumu (naglowki/stopki, numery stron, znak wodny "PMI Member
       benefit licensed to: ...", ciagi kropek, dehyfenacja)
  A.3  chunking sterowany realnym TOC (~800-1500 tokenow, lekka nakladka)

Wejscie : AgilePracticeGuide.pdf  (w korzeniu repo)
Wyjscie : corpus/agile_raw.jsonl     {page, text}
          corpus/agile_chunks.jsonl  {chunk_id, part, chapter, section,
                                       perf_domain, ka_tag, pages, text, n_tokens}

Format rekordu chunku jest IDENTYCZNY z corpus/pmbok_chunks.jsonl, dzieki czemu
generate_questions.py moze laczyc oba korpusy bez zmian w logice wstrzykiwania
kontekstu. chunk_id ma prefiks "agile-" (PMBOK uzywa "pmbok-"), wiec id nie koliduja.

UWAGA praw autorskich: katalog corpus/ jest w .gitignore - tekst Agile Guide nie
trafia do repo. Uczymy sie pojec, nie cytujemy (patrz par. 1 planu).

Uruchomienie:  python tools/prep_agile.py
Zaleznosci  :  PyMuPDF  (patrz tools/requirements.txt)
"""
import json
import re
import sys
from pathlib import Path
from collections import Counter

import fitz  # PyMuPDF

# --- Sciezki -----------------------------------------------------------------
REPO = Path(__file__).resolve().parent.parent
SRC_PDF = REPO / "AgilePracticeGuide.pdf"
CORPUS = REPO / "corpus"
RAW_OUT = CORPUS / "agile_raw.jsonl"
CHUNKS_OUT = CORPUS / "agile_chunks.jsonl"

# --- Parametry chunkingu (identyczne z prep_pmbok.py) ------------------------
TARGET_TOKENS = 1200
MAX_TOKENS = 1500
OVERLAP_TOKENS = 120
WORDS_PER_TOKEN = 1.0 / 1.3

# --- Mapa stron PDF -> rozdzial / ka_tag (wg realnego TOC, 1-based) ----------
# ka_tag dobrany do hybrydy planu: rdzen zwinny dostaje nowy podtag "Zwinne",
# a rozdzialy o ludziach/zespolach/srodowisku mapuja na istniejace podtagi,
# zeby 200 pytan Agile rozkladalo sie sensownie na osi ECO People/Process.
# (start, end_inclusive, chapter, perf_domain, ka_tag)
SECTION_RANGES = [
    (16, 21, "1. Introduction", "Agile: Introduction", "Zwinne"),
    (22, 31, "2. An Introduction to Agile", "Agile: Mindset & Manifesto", "Zwinne"),
    (32, 47, "3. Life Cycle Selection", "Agile: Life Cycle Selection", "Zwinne"),
    (48, 63, "4. Creating an Agile Environment", "Agile: Team & Servant Leadership", "Ludzie"),
    (64, 85, "5. Delivering in an Agile Environment", "Agile: Delivery & Measurement", "Zwinne"),
    (86, 101, "6. Organizational Considerations", "Agile: Org Agility & Change", "Srodowisko biznesowe"),
    (102, 103, "7. A Call to Action", "Agile: Call to Action", "Zwinne"),
    (104, 113, "Annex A1/A2: Mappings", "Agile: PMBOK/Manifesto Mapping", "Zwinne"),
    (114, 129, "Annex A3: Frameworks", "Agile: Frameworks (Scrum/Kanban/XP/SAFe...)", "Zwinne"),
    (134, 153, "Appendix X2/X3: Tailoring & Suitability", "Agile: Tailoring & Suitability", "Proces"),
]

# Sekcje/strony do pominiecia (front matter, spisy, indeksy, listy nazwisk).
DROP_TITLE_KEYS = (
    "table of contents",
    "list of tables",
    "list of figures",
    "index",
    "references",
    "bibliography",
    "glossary",
    "contributors and reviewers",
    "copyright",
    "notice",
    "preface",
)

MAX_PAGE = 184  # nadpisywane w main()


def section_for_page(page: int):
    """Zwraca (chapter, perf_domain, ka_tag) dla strony PDF, lub (None,None,None)."""
    for start, end, chap, dom, ka in SECTION_RANGES:
        if start <= page <= end:
            return chap, dom, ka
    return None, None, None


def build_section_map(toc):
    """Mapa strona -> aktywny tytul TOC (do grupowania i wykrywania sekcji-spisow)."""
    entries = [(lvl, title.strip(), page) for lvl, title, page in toc]
    section_of = {}
    for p in range(1, MAX_PAGE + 1):
        active = None
        for lvl, title, page in entries:
            if page <= p:
                active = (lvl, title, page)
            else:
                break
        section_of[p] = active[1] if active else "Front Matter"
    return section_of


# --- A.2 czyszczenie szumu ----------------------------------------------------
RE_DOTTED = re.compile(r"\.{4,}")
RE_PAGENUM_LINE = re.compile(r"^\s*\d{1,3}\s*$")
RE_MULTISPACE = re.compile(r"[ \t]+")
RE_HYPHEN_BREAK = re.compile(r"(\w)-\n(\w)")
# Naglowki/stopki/znaki wodne powtarzane na stronach Agile Practice Guide.
RE_HEADER = re.compile(
    r"^\s*(Agile Practice Guide.*"
    r"|Section\s+\d+\s*$"                  # biezacy naglowek "Section N"
    r"|Annex\s+A\d+\s*$"                   # "Annex A3"
    r"|Appendix\s+X\d+\s*$"                # "Appendix X2"
    r"|PMI Member benefit licensed to:.*"  # spersonalizowany znak wodny (stopka)
    r"|Not for distribution.*"
    r"|Licensed To:.*)$",
    re.IGNORECASE,
)
RE_BULLET_ONLY = re.compile(r"^[•▪●⚫∙·‣uü\*\-\s]+$")  # 'u'/'ü' = artefakt glifu listy
RE_LEAD_BULLET = re.compile(r"^[•▪●⚫∙·‣]+\s*")


def clean_page_text(text: str) -> str:
    if not text:
        return ""
    text = RE_HYPHEN_BREAK.sub(r"\1\2", text)
    lines = []
    for line in text.split("\n"):
        line = line.replace("\t", " ")
        if RE_PAGENUM_LINE.match(line):
            continue
        if RE_HEADER.match(line):
            continue
        if RE_BULLET_ONLY.match(line):
            continue
        if RE_DOTTED.search(line) and len(RE_DOTTED.sub("", line).strip()) < 4:
            continue
        line = RE_DOTTED.sub(" ", line)
        line = RE_LEAD_BULLET.sub("", line)
        line = RE_MULTISPACE.sub(" ", line).strip()
        if line:
            lines.append(line)
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def is_drop_section(section_title: str) -> bool:
    t = (section_title or "").lower()
    return any(k in t for k in DROP_TITLE_KEYS)


# --- A.3 chunking (identyczne z prep_pmbok.py) --------------------------------
def est_tokens(text: str) -> int:
    return int(round(len(text.split()) / WORDS_PER_TOKEN))


def split_to_chunks(text: str):
    words = text.split()
    max_words = int(MAX_TOKENS * WORDS_PER_TOKEN)
    tgt_words = int(TARGET_TOKENS * WORDS_PER_TOKEN)
    ov_words = int(OVERLAP_TOKENS * WORDS_PER_TOKEN)
    if len(words) <= max_words:
        return [" ".join(words)] if words else []
    chunks = []
    i = 0
    while i < len(words):
        piece = words[i : i + tgt_words]
        chunks.append(" ".join(piece))
        if i + tgt_words >= len(words):
            break
        i += tgt_words - ov_words
    return chunks


def main():
    if not SRC_PDF.exists():
        sys.exit(f"Brak pliku zrodlowego: {SRC_PDF}")
    CORPUS.mkdir(exist_ok=True)

    print(f"[A.1] Otwieranie (niezaszyfrowany): {SRC_PDF.name}")
    doc = fitz.open(str(SRC_PDF))
    global MAX_PAGE
    MAX_PAGE = doc.page_count
    print(f"      stron: {MAX_PAGE}")

    toc = doc.get_toc()
    print(f"[A.1] TOC: {len(toc)} wpisow")
    section_of = build_section_map(toc)

    # --- A.1 ekstrakcja + zapis raw ---
    raw_records = []
    for pno in range(MAX_PAGE):
        text = doc.load_page(pno).get_text("text")
        raw_records.append({"page": pno + 1, "text": text})
    with RAW_OUT.open("w", encoding="utf-8") as f:
        for rec in raw_records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"[A.1] Zapisano {RAW_OUT.relative_to(REPO)} ({len(raw_records)} stron)")

    # --- A.2 czyszczenie + metadane per strona (tylko strony w SECTION_RANGES) ---
    pages = []
    dropped = 0
    for rec in raw_records:
        p = rec["page"]
        chap, dom, ka = section_for_page(p)
        section = section_of.get(p, "Front Matter")
        if ka is None or is_drop_section(section):
            dropped += 1
            continue
        cleaned = clean_page_text(rec["text"])
        if est_tokens(cleaned) < 30:
            dropped += 1
            continue
        pages.append({
            "page": p, "part": "Agile", "chapter": chap,
            "section": section, "perf_domain": dom, "ka_tag": ka, "text": cleaned,
        })
    print(f"[A.2] Strony tresciowe: {len(pages)}  (odrzucono: {dropped})")

    # --- A.3 grupowanie po rozdziale + chunking ---
    groups = []
    cur_key, cur = None, []
    for pd in pages:
        key = (pd["chapter"], pd["perf_domain"], pd["ka_tag"])
        if key != cur_key and cur:
            groups.append((cur_key, cur))
            cur = []
        cur_key = key
        cur.append(pd)
    if cur:
        groups.append((cur_key, cur))

    chunk_records = []
    cid = 0
    for (chapter, perf_domain, ka_tag), pgs in groups:
        text = "\n".join(p["text"] for p in pgs).strip()
        if not text:
            continue
        page_lo, page_hi = pgs[0]["page"], pgs[-1]["page"]
        section = pgs[0]["section"]
        for piece in split_to_chunks(text):
            cid += 1
            chunk_records.append({
                "chunk_id": f"agile-{cid:04d}",
                "part": "Agile",
                "chapter": chapter,
                "section": section,
                "perf_domain": perf_domain,
                "ka_tag": ka_tag,
                "pages": [page_lo, page_hi],
                "n_tokens": est_tokens(piece),
                "text": piece,
            })
    with CHUNKS_OUT.open("w", encoding="utf-8") as f:
        for rec in chunk_records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"[A.3] Zapisano {CHUNKS_OUT.relative_to(REPO)} ({len(chunk_records)} chunkow)")

    by_ka = Counter(r["ka_tag"] for r in chunk_records)
    print("[A.3] Chunki wg ka_tag:", dict(sorted(by_ka.items(), key=lambda x: -x[1])))
    tok = [r["n_tokens"] for r in chunk_records]
    if tok:
        print(f"[A.3] Tokeny/chunk: min={min(tok)} mediana~{sorted(tok)[len(tok)//2]} max={max(tok)}")


if __name__ == "__main__":
    main()
