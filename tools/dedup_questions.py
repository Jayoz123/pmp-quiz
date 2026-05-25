# -*- coding: utf-8 -*-
"""
Faza C (krok C.4) planu 13: deduplikacja semantyczno-leksykalna.

Porownuje pytania:
  (a) MIEDZY nowymi - usuwa bliskie powtorki w obrebie nowej partii,
  (b) WZGLEDEM starych 990 (pmp-quiz-app/questions.json) - by NIE odtworzyc przypadkiem
      pytania chronionego prawem autorskim.

Bez zaleznosci od API/embeddingow: uzywa podobienstwa leksykalnego (cosinus na zbiorach
tokenow z question + question_en, znormalizowanych). To solidny proxy do wylapywania
parafraz i niemal-duplikatow. (Embeddingi mozna podlaczyc pozniej w miejsce sim()).

Wejscie : out/validated.jsonl (lub --input)
Wyjscie : out/deduped.jsonl (zachowane) + out/dedup_flags.csv (usuniete/oznaczone)

Uruchomienie: python tools/dedup_questions.py [--threshold 0.82]
"""
import argparse
import csv
import json
import math
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "out"
OLD = REPO / "pmp-quiz-app" / "questions.json"
THRESHOLD = 0.82


def toks(*texts):
    s = set()
    for t in texts:
        s |= set(re.findall(r"[a-z0-9]+", (t or "").lower()))
    return s


def sim(a, b):
    if not a or not b:
        return 0.0
    inter = len(a & b)
    return inter / math.sqrt(len(a) * len(b))


def q_tokens(q):
    # Dedup oparty na TRESCI PYTANIA (stem) PL+EN, nie na odpowiedziach: odpowiedzi moga
    # sie roznic przy tym samym pytaniu i rozcienczalyby sygnal podobienstwa (jak embeddingi
    # pytania w planie C.4). Odpowiedzi pomijamy celowo.
    return toks(q.get("question", ""), q.get("question_en", ""))


def main():
    ap = argparse.ArgumentParser(description="Faza C.4 - deduplikacja")
    ap.add_argument("--input", default=str(OUT / "validated.jsonl"))
    ap.add_argument("--threshold", type=float, default=THRESHOLD)
    args = ap.parse_args()

    src = Path(args.input)
    if not src.exists():
        raise SystemExit(f"Brak {src} - najpierw validate_questions.py")
    new = [json.loads(l) for l in src.read_text(encoding="utf-8").splitlines() if l.strip()]
    new_tok = [q_tokens(q) for q in new]

    old_tok = []
    if OLD.exists():
        for q in json.load(OLD.open(encoding="utf-8")):
            old_tok.append(q_tokens(q))
    print(f"[C.4] Nowe: {len(new)} | stare (baza 990): {len(old_tok)} | prog: {args.threshold}")

    kept, flags = [], []
    kept_tok = []
    for i, q in enumerate(new):
        t = new_tok[i]
        # (b) vs stare 990
        best_old = max((sim(t, ot) for ot in old_tok), default=0.0)
        if best_old >= args.threshold:
            flags.append((i, q, "near-old", round(best_old, 3)))
            continue
        # (a) vs juz zachowane nowe
        best_new = max((sim(t, kt) for kt in kept_tok), default=0.0)
        if best_new >= args.threshold:
            flags.append((i, q, "dup-new", round(best_new, 3)))
            continue
        q["review_status"] = "auto_ok"
        kept.append(q)
        kept_tok.append(t)

    (OUT / "deduped.jsonl").write_text(
        "\n".join(json.dumps(q, ensure_ascii=False) for q in kept) + ("\n" if kept else ""),
        encoding="utf-8")
    with (OUT / "dedup_flags.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["idx", "kind", "similarity", "source_concept", "question"])
        for i, q, kind, s in flags:
            w.writerow([i, kind, s, q.get("source_concept", ""), q.get("question", "")[:120]])

    print(f"[C.4] Zachowano {len(kept)} | usunieto {len(flags)} "
          f"(vs-stare: {sum(1 for x in flags if x[2]=='near-old')}, "
          f"vs-nowe: {sum(1 for x in flags if x[2]=='dup-new')})")
    print(f"[C.4] -> {(OUT/'deduped.jsonl').relative_to(REPO)} , {(OUT/'dedup_flags.csv').relative_to(REPO)}")


if __name__ == "__main__":
    main()
