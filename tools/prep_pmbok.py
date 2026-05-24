# -*- coding: utf-8 -*-
"""
Faza A (kroki A.1-A.3) planu 13: przygotowanie PMBOK 8th ed. do pracy z AI.

Z zaszyfrowanego, 401-stronicowego PDF robi ostrukturyzowany korpus pojec:
  A.1  decrypt (pikepdf, w pamieci) + ekstrakcja tekstu per strona (PyMuPDF)
  A.2  czyszczenie szumu (naglowki/stopki, numery stron, ciagi kropek, dehyfenacja)
  A.3  chunking sterowany realnym TOC (~800-1500 tokenow, lekka nakladka)

Wejscie : pmbokguide_eighthed_eng.pdf  (w korzeniu repo)
Wyjscie : corpus/pmbok_raw.jsonl     {page, text}
          corpus/pmbok_chunks.jsonl  {chunk_id, part, chapter, section,
                                       perf_domain, ka_tag, pages, text, n_tokens}

UWAGA praw autorskich: rozszyfrowany PDF NIE jest zapisywany na dysk (operacja
w pamieci), a katalog corpus/ jest w .gitignore - tekst PMBOK nie trafia do repo.

Uruchomienie:  python tools/prep_pmbok.py
Zaleznosci  :  pikepdf, PyMuPDF  (patrz tools/requirements.txt)
"""
import io
import json
import re
import sys
from pathlib import Path

import pikepdf
import fitz  # PyMuPDF

# --- Sciezki -----------------------------------------------------------------
REPO = Path(__file__).resolve().parent.parent
SRC_PDF = REPO / "pmbokguide_eighthed_eng.pdf"
CORPUS = REPO / "corpus"
RAW_OUT = CORPUS / "pmbok_raw.jsonl"
CHUNKS_OUT = CORPUS / "pmbok_chunks.jsonl"

# --- Parametry chunkingu -----------------------------------------------------
# Tokeny przyblizamy jako liczba slow * 1.3 (bez zewn. tokenizera).
TARGET_TOKENS = 1200      # docelowy rozmiar chunku
MAX_TOKENS = 1500         # twardy gorny limit
OVERLAP_TOKENS = 120      # nakladka miedzy chunkami tej samej sekcji
WORDS_PER_TOKEN = 1.0 / 1.3

# --- Mapa stron -> Performance Domain / obszar wiedzy (ka_tag) ---------------
# Zakresy stron wg realnego TOC rozszyfrowanego PDF (numeracja stron PDF, 1-based).
# (start, end_inclusive, perf_domain, ka_tag)
DOMAIN_RANGES = [
    # --- The Standard for Project Management ---
    (26, 35, "Standard: Introduction", "Ogolny"),
    (36, 57, "Standard: System for Value Delivery", "Srodowisko biznesowe"),
    (58, 65, "Standard: Principles", "Ogolny"),
    (66, 68, "Standard: Principle - Embed Quality", "Jakosc"),
    (69, 79, "Standard: Principles - Leadership/Culture", "Ludzie"),
    (80, 97, "Standard: Project Life Cycles", "Proces"),
    # --- The Guide ---
    (108, 114, "Guide: Introduction", "Ogolny"),
    (115, 139, "Governance Performance Domain", "Integracja"),
    (140, 151, "Scope Performance Domain", "Zakres"),
    (152, 162, "Schedule Performance Domain", "Harmonogram"),
    (163, 171, "Finance Performance Domain", "Koszt"),
    (172, 183, "Stakeholders Performance Domain", "Interesariusz"),
    (184, 196, "Resources Performance Domain", "Zasoby"),
    (197, 207, "Risk Performance Domain", "Ryzyko"),
    (208, 217, "Guide: Tailoring", "Proces"),
    (218, 249, "Guide: Inputs and Outputs", "Proces"),
    (250, 321, "Guide: Tools and Techniques", "Proces"),
    (342, 349, "Appendix: Artificial Intelligence", "Srodowisko biznesowe"),
    (350, 359, "Appendix: Procurement", "Nabywanie"),
]

# Sekcje/strony do pominiecia (spisy, indeksy, front matter, listy nazwisk).
# Wykrywane przez tytul aktywnego wpisu TOC (case-insensitive, substring).
DROP_TITLE_KEYS = (
    "table of contents",
    "list of figures",
    "index",
    "references",
    "bibliography",
    "contributors and reviewers",
    "pmi team members",
    "library of congress",
    "copyright",
    "notice",
)


def domain_for_page(page: int):
    """Zwraca (perf_domain, ka_tag) dla strony PDF, lub (None, None) jesli poza mapa."""
    for start, end, dom, ka in DOMAIN_RANGES:
        if start <= page <= end:
            return dom, ka
    return None, None


def load_decrypted_doc(src: Path) -> fitz.Document:
    """A.1 - rozszyfruj PDF w pamieci (pikepdf) i otworz w PyMuPDF. Nic nie ladujemy na dysk."""
    pdf = pikepdf.open(str(src))
    buf = io.BytesIO()
    pdf.save(buf)
    pdf.close()
    buf.seek(0)
    return fitz.open(stream=buf.read(), filetype="pdf")


def build_section_map(toc):
    """
    Buduje mape strona -> (part, chapter, section) z realnego TOC.
    'Aktywny' wpis dla strony p = ostatni wpis w kolejnosci czytania ze start <= p.
    chapter = najblizszy przodek poziomu <=3 (Section/Standard-Guide), section = aktywny tytul.
    """
    # Posortuj wg numeru strony, zachowujac kolejnosc TOC (juz jest w kolejnosci).
    entries = [(lvl, title.strip(), page) for lvl, title, page in toc]
    section_of = {}
    chapter_of = {}
    part_of = {}
    # Granica Standard / Guide: drugie wystapienie "Section 1: Introduction" (p108).
    for p in range(1, MAX_PAGE + 1):
        active = None
        chapter = None
        for lvl, title, page in entries:
            if page <= p:
                active = (lvl, title, page)
                if lvl <= 3:
                    chapter = title
            else:
                break
        section_of[p] = active[1] if active else "Front Matter"
        chapter_of[p] = chapter or "Front Matter"
        part_of[p] = "Standard" if p < 108 else "Guide"
    return part_of, chapter_of, section_of


# --- A.2 czyszczenie szumu ----------------------------------------------------
RE_DOTTED = re.compile(r"\.{4,}")                      # ciagi kropek (spisy)
RE_PAGENUM_LINE = re.compile(r"^\s*\d{1,3}\s*$")        # linia = sam numer strony
RE_MULTISPACE = re.compile(r"[ \t]+")
RE_HYPHEN_BREAK = re.compile(r"(\w)-\n(\w)")             # przeniesienie wyrazu
# Naglowki/stopki/znaki wodne powtarzane na kazdej stronie (do usuniecia w calosci).
RE_HEADER = re.compile(
    r"^\s*(PMBOK\xae?\s*Guide.*"
    r"|The Standard for Project Management.*"
    r"|A Guide to the Project Management Body of Knowledge.*"
    r"|Section\s+\d+\s*[–—-]\s*.*"          # biezacy naglowek "Section N - Tytul"
    r"|Licensed To:.*"                                  # spersonalizowany znak wodny
    r"|This copy is a PMI Member benefit.*"             # stopka znaku wodnego
    r"|.*PMI MemberID.*"
    r"|Order Number:.*)$",
    re.IGNORECASE,
)
# Glify wypunktowan stojace samodzielnie w linii (artefakty ekstrakcji).
RE_BULLET_ONLY = re.compile(r"^[•▪●⚫∙·‣\*\-\s]+$")
RE_LEAD_BULLET = re.compile(r"^[•▪●⚫∙·‣]+\s*")


def clean_page_text(text: str) -> str:
    """Usuwa naglowki/stopki/znaki wodne, numery stron, ciagi kropek, samotne glify
    wypunktowan; laczy przeniesienia wyrazow i normalizuje biale znaki."""
    if not text:
        return ""
    text = RE_HYPHEN_BREAK.sub(r"\1\2", text)
    lines = []
    for line in text.split("\n"):
        if RE_PAGENUM_LINE.match(line):
            continue
        if RE_HEADER.match(line):
            continue
        if RE_BULLET_ONLY.match(line):          # linia to sam glif wypunktowania/myslnik
            continue
        # linie zlozone glownie z kropek/cyfr (resztki spisow) -> pomijamy
        if RE_DOTTED.search(line) and len(RE_DOTTED.sub("", line).strip()) < 4:
            continue
        line = RE_DOTTED.sub(" ", line)
        line = RE_LEAD_BULLET.sub("", line)     # wiodacy glif na poczatku tresci
        line = RE_MULTISPACE.sub(" ", line).strip()
        if line:
            lines.append(line)
    cleaned = "\n".join(lines)
    cleaned = re.sub(r"\n{3,}", "\n\n", cleaned)
    return cleaned.strip()


def is_drop_section(section_title: str) -> bool:
    t = (section_title or "").lower()
    return any(k in t for k in DROP_TITLE_KEYS)


# --- A.3 chunking -------------------------------------------------------------
def est_tokens(text: str) -> int:
    return int(round(len(text.split()) / WORDS_PER_TOKEN))


def split_to_chunks(text: str):
    """Dzieli dlugi tekst sekcji na chunki ~TARGET_TOKENS slow z nakladka OVERLAP_TOKENS."""
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

    print(f"[A.1] Rozszyfrowywanie i otwieranie: {SRC_PDF.name}")
    doc = load_decrypted_doc(SRC_PDF)
    global MAX_PAGE
    MAX_PAGE = doc.page_count
    print(f"      stron: {MAX_PAGE}")

    toc = doc.get_toc()
    print(f"[A.1] TOC: {len(toc)} wpisow")
    part_of, chapter_of, section_of = build_section_map(toc)

    # --- A.1 ekstrakcja + zapis raw ---
    raw_records = []
    for pno in range(MAX_PAGE):
        page = doc.load_page(pno)
        text = page.get_text("text")
        raw_records.append({"page": pno + 1, "text": text})
    with RAW_OUT.open("w", encoding="utf-8") as f:
        for rec in raw_records:
            f.write(json.dumps(rec, ensure_ascii=False) + "\n")
    print(f"[A.1] Zapisano {RAW_OUT.relative_to(REPO)} ({len(raw_records)} stron)")

    # --- A.2 czyszczenie + przypisanie metadanych per strona ---
    pages = []  # {page, part, chapter, section, perf_domain, ka_tag, text}
    dropped = 0
    for rec in raw_records:
        p = rec["page"]
        section = section_of.get(p, "Front Matter")
        if is_drop_section(section) or p < 26:
            dropped += 1
            continue
        cleaned = clean_page_text(rec["text"])
        if est_tokens(cleaned) < 30:   # pomijamy strony niemal puste (tytulowe, rysunki)
            dropped += 1
            continue
        dom, ka = domain_for_page(p)
        pages.append({
            "page": p,
            "part": part_of.get(p, "Guide"),
            "chapter": chapter_of.get(p, ""),
            "section": section,
            "perf_domain": dom or section,
            "ka_tag": ka or "Ogolny",
            "text": cleaned,
        })
    print(f"[A.2] Strony tresciowe: {len(pages)}  (odrzucono spisow/indeksow/pustych: {dropped})")

    # --- A.3 grupowanie po sekcji (ciagle strony tej samej sekcji) + chunking ---
    groups = []  # (section_key, [page_dicts])
    cur_key = None
    cur = []
    for pd in pages:
        key = (pd["part"], pd["section"])
        if key != cur_key and cur:
            groups.append((cur_key, cur))
            cur = []
        cur_key = key
        cur.append(pd)
    if cur:
        groups.append((cur_key, cur))

    chunk_records = []
    cid = 0
    for (part, section), pgs in groups:
        text = "\n".join(p["text"] for p in pgs).strip()
        if not text:
            continue
        page_lo, page_hi = pgs[0]["page"], pgs[-1]["page"]
        chapter = pgs[0]["chapter"]
        perf_domain = pgs[0]["perf_domain"]
        ka_tag = pgs[0]["ka_tag"]
        for piece in split_to_chunks(text):
            cid += 1
            chunk_records.append({
                "chunk_id": f"pmbok-{cid:04d}",
                "part": part,
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

    # --- krotkie podsumowanie pokrycia ---
    from collections import Counter
    by_ka = Counter(r["ka_tag"] for r in chunk_records)
    print("[A.3] Chunki wg ka_tag:", dict(sorted(by_ka.items(), key=lambda x: -x[1])))
    tok = [r["n_tokens"] for r in chunk_records]
    if tok:
        print(f"[A.3] Tokeny/chunk: min={min(tok)} mediana~{sorted(tok)[len(tok)//2]} max={max(tok)}")


MAX_PAGE = 401  # nadpisywane w main() po otwarciu dokumentu

if __name__ == "__main__":
    main()
