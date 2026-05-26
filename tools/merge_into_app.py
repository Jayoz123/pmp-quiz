# -*- coding: utf-8 -*-
"""
M4 (plan 13) - finalne scalenie autorskich pul do formatu aplikacji.

Scala dwie finalne pule JSONL:
  - PMBOK : out/balanced.jsonl       (cel ~1044)
  - Agile : out/balanced_agile.jsonl (cel ~189)

i produkuje pojedynczy plik tablicy JSON `questions_v2.json` w formacie aplikacji:
  - renumeracja `id` od 1001 (najpierw cala pula PMBOK, potem Agile) - id ciagle i unikalne,
  - zachowanie wszystkich pol rekordu (aplikacja ignoruje nieznane pola: eco_domain,
    eco_task, difficulty, qtype, source_concept, generated_by, review_status...),
  - usuniecie pol czysto wewnetrznych pipeline'u (`_chunk_ids`) - nie sa potrzebne w aplikacji,
  - format zgodny z istniejacym questions.json: tablica obiektow, wciecie 2 spacje, UTF-8
    (ensure_ascii=False, polskie znaki zachowane).

ZABEZPIECZENIE PRZED OBCIETYM WEJSCIEM (pulapka OneDrive Files-On-Demand):
  Mount/sandbox bywa serwowany jako czesciowo zhydratowany placeholder => plik krotszy
  niz w rzeczywistosci. Dlatego merge WYMAGA jawnej liczby oczekiwanych rekordow
  (--expect-pmbok / --expect-agile) i ODMAWIA zapisu, gdy realna liczba sie nie zgadza.
  To gwarantuje, ze nie scalimy po cichu obcietej puli. Mozna wylaczyc --no-expect-check
  (NIEZALECANE).

Walidacja strukturalna kazdego rekordu (twarda, jak C.1):
  - dokladnie 4 odpowiedzi w answers i answers_en,
  - correct in {0,1,2,3},
  - question / question_en / explanation / explanation_en NIEPUSTE,
  - brak duplikatow odpowiedzi w obrebie pytania (PL).
Rekord lamiacy te reguly => blad (merge przerywa, wskazuje zrodlo+linie).

Wejscie : out/balanced.jsonl, out/balanced_agile.jsonl (lub --pmbok / --agile)
Wyjscie : questions_v2.json (lub --output)

Uruchomienie:
  python tools/merge_into_app.py --expect-pmbok 1044 --expect-agile 189
  python tools/merge_into_app.py --pmbok out/balanced.jsonl --agile out/balanced_agile.jsonl \
      --output questions_v2.json --expect-pmbok 1044 --expect-agile 189
"""
import argparse
import json
import os
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "out"

START_ID = 1001

# Pola czysto wewnetrzne pipeline'u - wycinane z wyjscia aplikacyjnego.
DROP_FIELDS = ("_chunk_ids",)

# Pola wymagane przez aplikacje (musza istniec i byc niepuste tam, gdzie to ma sens).
APP_REQUIRED = ("domain", "question", "question_en", "answers", "answers_en",
                "correct", "explanation", "explanation_en")


def load_jsonl(path: Path):
    """Wczytuje JSONL; zwraca (rekordy, n_pustych, n_blednych_linii).
    Linia, ktora nie parsuje sie jako JSON (np. obciecie placeholdera), jest liczona
    jako bledna - wtedy wynik nie jest ufny i merge to wychwyci (expect-check)."""
    recs, blank, bad = [], 0, 0
    for i, line in enumerate(path.read_text(encoding="utf-8", errors="replace").splitlines(), 1):
        s = line.strip()
        if not s:
            blank += 1
            continue
        try:
            recs.append(json.loads(s))
        except Exception as e:
            bad += 1
            print(f"    ! {path.name} linia {i}: niepoprawny JSON ({str(e)[:60]}) "
                  f"- prawdopodobnie OBCIETE wejscie")
    return recs, blank, bad


def validate_record(q, src, idx):
    """Twarda walidacja strukturalna. Zwraca liste komunikatow bledow (pusta = OK)."""
    errs = []
    for k in APP_REQUIRED:
        if k not in q:
            errs.append(f"brak pola '{k}'")
    a = q.get("answers")
    ae = q.get("answers_en")
    if not (isinstance(a, list) and len(a) == 4):
        errs.append("answers != 4 pozycje")
    if not (isinstance(ae, list) and len(ae) == 4):
        errs.append("answers_en != 4 pozycje")
    if q.get("correct") not in (0, 1, 2, 3):
        errs.append(f"correct poza 0-3: {q.get('correct')!r}")
    for k in ("question", "question_en", "explanation", "explanation_en"):
        v = q.get(k)
        if not (isinstance(v, str) and v.strip()):
            errs.append(f"'{k}' puste/niepoprawne")
    if isinstance(a, list) and len(a) == 4 and len(set(a)) != 4:
        errs.append("zduplikowane odpowiedzi (PL)")
    if errs:
        return [f"[{src} #{idx}] " + "; ".join(errs)]
    return []


def to_app_record(q, new_id):
    """Buduje rekord aplikacyjny: nowe id na poczatku, wszystkie pola poza DROP_FIELDS."""
    rec = {"id": new_id}
    for k, v in q.items():
        if k in DROP_FIELDS or k == "id":
            continue
        rec[k] = v
    return rec


def main():
    ap = argparse.ArgumentParser(description="M4 - scalenie pul do questions_v2.json")
    ap.add_argument("--pmbok", default=str(OUT / "balanced.jsonl"))
    ap.add_argument("--agile", default=str(OUT / "balanced_agile.jsonl"))
    ap.add_argument("--output", default=str(REPO / "questions_v2.json"))
    ap.add_argument("--start-id", type=int, default=START_ID)
    ap.add_argument("--expect-pmbok", type=int, default=None,
                    help="oczekiwana liczba rekordow PMBOK (zabezpieczenie przed obcieciem)")
    ap.add_argument("--expect-agile", type=int, default=None,
                    help="oczekiwana liczba rekordow Agile")
    ap.add_argument("--no-expect-check", action="store_true",
                    help="WYLACZ kontrole liczb (NIEZALECANE - ryzyko obcietego wejscia)")
    args = ap.parse_args()

    pmbok_path = Path(args.pmbok)
    agile_path = Path(args.agile)
    for p in (pmbok_path, agile_path):
        if not p.exists():
            raise SystemExit(f"Brak pliku wejsciowego: {p}")

    print(f"[M4] PMBOK <- {pmbok_path}")
    pmbok, pb_blank, pb_bad = load_jsonl(pmbok_path)
    print(f"[M4] Agile <- {agile_path}")
    agile, ag_blank, ag_bad = load_jsonl(agile_path)
    print(f"[M4] wczytano: PMBOK={len(pmbok)} (puste={pb_blank}, bledne={pb_bad}) | "
          f"Agile={len(agile)} (puste={ag_blank}, bledne={ag_bad})")

    # --- ZABEZPIECZENIE: obciete/uszkodzone wejscie ---
    if pb_bad or ag_bad:
        raise SystemExit("[M4] PRZERWANO: wejscie ma niepoprawne linie JSON "
                         "(prawdopodobnie obciety placeholder OneDrive). "
                         "Zhydratuj pliki i powtorz.")
    if not args.no_expect_check:
        if args.expect_pmbok is None or args.expect_agile is None:
            raise SystemExit("[M4] PRZERWANO: podaj --expect-pmbok i --expect-agile "
                             "(albo --no-expect-check, NIEZALECANE).")
        if len(pmbok) != args.expect_pmbok:
            raise SystemExit(f"[M4] PRZERWANO: PMBOK ma {len(pmbok)} rekordow, "
                             f"oczekiwano {args.expect_pmbok}. Wejscie obciete?")
        if len(agile) != args.expect_agile:
            raise SystemExit(f"[M4] PRZERWANO: Agile ma {len(agile)} rekordow, "
                             f"oczekiwano {args.expect_agile}. Wejscie obciete?")

    # --- walidacja strukturalna ---
    errors = []
    for i, q in enumerate(pmbok, 1):
        errors += validate_record(q, "PMBOK", i)
    for i, q in enumerate(agile, 1):
        errors += validate_record(q, "Agile", i)
    if errors:
        print(f"[M4] WALIDACJA: {len(errors)} bledow:")
        for e in errors[:30]:
            print("   ", e)
        if len(errors) > 30:
            print(f"    ... (+{len(errors) - 30} wiecej)")
        raise SystemExit("[M4] PRZERWANO: napraw rekordy i powtorz.")

    # --- scalenie + renumeracja ---
    merged = []
    nid = args.start_id
    for q in pmbok:
        merged.append(to_app_record(q, nid)); nid += 1
    for q in agile:
        merged.append(to_app_record(q, nid)); nid += 1

    ids = [r["id"] for r in merged]
    assert len(ids) == len(set(ids)), "duplikaty id (nie powinno wystapic)"
    assert ids == list(range(args.start_id, args.start_id + len(merged))), "id nieciagle"

    out = Path(args.output)
    tmp = out.with_suffix(out.suffix + ".tmp")
    tmp.write_text(json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(tmp, out)

    print(f"[M4] scalono: {len(merged)} pytan "
          f"(PMBOK {len(pmbok)} + Agile {len(agile)})")
    print(f"[M4] id: {ids[0]}..{ids[-1]} (ciagle, unikalne)")
    print(f"[M4] -> {out}")


if __name__ == "__main__":
    main()
