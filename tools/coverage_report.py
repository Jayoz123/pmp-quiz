# -*- coding: utf-8 -*-
"""
Faza C (krok C.5) planu 13: raport balansu i pokrycia -> reports/coverage.md

Po kazdej rundzie raportuje rozklad pytan wg:
  - eco_domain (cel: People 42% / Process 50% / Business Environment 8%)
  - ka_tag (obszar wiedzy / podtag 'domain')
  - difficulty (cel ~30/50/20 easy/medium/hard) i qtype
  - pozycji poprawnej odpowiedzi (correct 0-3 powinno byc rownomierne)
  - pokrycia konceptow z concept_map.csv (kwota vs faktycznie wygenerowane)

Wejscie : out/deduped.jsonl (lub --input; fallback out/validated.jsonl)
Wyjscie : reports/coverage.md

Uruchomienie: python tools/coverage_report.py
"""
import argparse
import csv
import json
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "out"
CORPUS = REPO / "corpus"
REPORTS = REPO / "reports"
ECO_TARGET = {"People": 42, "Process": 50, "Business Environment": 8}


def _rel(p):
    try:
        return p.relative_to(REPO)
    except ValueError:
        return p


def bar(pct, width=24):
    n = int(round(pct / 100 * width))
    return "#" * n + "." * (width - n)


def dist_table(title, counter, total, targets=None):
    lines = [f"### {title}", "", "| Kategoria | N | % | " + ("Cel % | " if targets else "") + "Rozklad |",
             "|---|---|---|" + ("---|" if targets else "") + "---|"]
    for k, v in sorted(counter.items(), key=lambda x: -x[1]):
        pct = 100 * v / total if total else 0
        tgt = f" {targets.get(k,'-')} |" if targets else ""
        lines.append(f"| {k} | {v} | {pct:.0f}% |{tgt} `{bar(pct)}` |")
    lines.append("")
    return "\n".join(lines)


def main():
    ap = argparse.ArgumentParser(description="Faza C.5 - raport pokrycia")
    ap.add_argument("--input", default=None)
    args = ap.parse_args()

    src = (Path(args.input).resolve() if args.input else (
        OUT / "deduped.jsonl" if (OUT / "deduped.jsonl").exists() else OUT / "validated.jsonl"))
    if not src.exists():
        raise SystemExit(f"Brak {src}")
    qs = [json.loads(l) for l in src.read_text(encoding="utf-8").splitlines() if l.strip()]
    n = len(qs)

    eco = Counter(q.get("eco_domain", "?") for q in qs)
    ka = Counter(q.get("domain", "?") for q in qs)
    diff = Counter(q.get("difficulty", "?") for q in qs)
    qtype = Counter(q.get("qtype", "?") for q in qs)
    corr = Counter(str(q.get("correct", "?")) for q in qs)
    concept = Counter(q.get("source_concept", "?") for q in qs)

    # pokrycie konceptow vs blueprint
    cm = {}
    cmp_path = CORPUS / "concept_map.csv"
    if cmp_path.exists():
        for r in csv.DictReader(cmp_path.open(encoding="utf-8-sig")):
            cm[r["concept_id"]] = int(r["n_pytan_docelowo"])

    md = [f"# Raport pokrycia (C.5)", "",
          f"Zrodlo: `{_rel(src)}` | pytan: **{n}**", "",
          dist_table("ECO domena (cel: People 42 / Process 50 / BizEnv 8)", eco, n, ECO_TARGET),
          dist_table("Obszar wiedzy (ka_tag / domain)", ka, n),
          dist_table("Trudnosc (cel ~30/50/20)", diff, n,
                     {"easy": 30, "medium": 50, "hard": 20}),
          dist_table("Typ pytania", qtype, n),
          dist_table("Pozycja poprawnej odpowiedzi (powinno byc rownomierne)", corr, n)]

    md.append("### Pokrycie konceptow (wygenerowane vs kwota blueprintu)\n")
    md.append("| concept_id | wygenerowane | kwota | status |")
    md.append("|---|---|---|---|")
    rel = set(concept) | set(c for c in cm if concept.get(c))
    for cid in sorted(rel):
        made = concept.get(cid, 0)
        quota = cm.get(cid, "-")
        if quota == "-":
            status = "spoza blueprintu"
        elif made >= quota:
            status = "OK"
        elif made == 0:
            status = "BRAK"
        else:
            status = f"niedobor ({quota-made})"
        md.append(f"| {cid} | {made} | {quota} | {status} |")
    md.append("")

    REPORTS.mkdir(exist_ok=True)
    (REPORTS / "coverage.md").write_text("\n".join(md), encoding="utf-8")
    print(f"[C.5] Zapisano {(REPORTS/'coverage.md').relative_to(REPO)} (pytan: {n})")
    print(f"[C.5] ECO: {dict(eco)} | trudnosc: {dict(diff)} | correct: {dict(corr)}")


if __name__ == "__main__":
    main()
