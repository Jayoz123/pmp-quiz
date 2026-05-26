# -*- coding: utf-8 -*-
"""
Plan 16, krok 4.5 (czesc 1): WYROWNANIE pozycji poprawnej odpowiedzi.

Recenzja pokazala silne odchylenie: ~48% pytan ma poprawna odpowiedz na pozycji 1
(indeks 1), a pozycja 3 prawie pusta (~1%). Cel: ~rownomierne 25/25/25/25.

Metoda (deterministyczna, BEZ API): dla kazdego pytania permutujemy odpowiedzi tak, by
docelowy rozklad pozycji `correct` byl jak najbardziej rownomierny. Konkretnie:
  - przydzielamy pytaniom DOCELOWE pozycje poprawnej odpowiedzi metoda najmniej
    obsadzonego kubelka (greedy round-robin sterowany licznikiem), z losowym tie-break,
  - przestawiamy `answers` i `answers_en` SPOJNIE (ten sam permutacja w obu jezykach),
    tak by poprawna odpowiedz trafila na docelowa pozycje, a kolejnosc reszty zostala
    zachowana (stabilnie) - to nie zmienia tresci, tylko kolejnosc opcji,
  - aktualizujemy pole `correct`.

Zachowuje wszystkie pozostale pola. Seedowane (--seed) dla powtarzalnosci.

Wejscie : out/deduped.jsonl (lub --input)
Wyjscie : out/balanced.jsonl (lub --output) + log rozkladu przed/po

Uruchomienie:
  python tools/balance_correct.py
  python tools/balance_correct.py --input out/deduped.jsonl --output out/balanced.jsonl
"""
import argparse
import json
import random
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "out"


def remap_to_position(q, target_pos):
    """Permutuje answers/answers_en tak, by poprawna odpowiedz trafila na target_pos.
    Pozostale odpowiedzi zachowuja wzgledna kolejnosc (przesuwka stabilna). Zwraca True
    jesli przestawiono, False gdy nie da sie (zle dane)."""
    a = q.get("answers")
    ae = q.get("answers_en")
    c = q.get("correct")
    if not (isinstance(a, list) and len(a) == 4 and c in (0, 1, 2, 3)):
        return False
    has_en = isinstance(ae, list) and len(ae) == 4
    # indeksy w nowej kolejnosci: poprawna na target_pos, reszta stabilnie wypelnia luki
    others = [i for i in range(4) if i != c]
    new_order = [None] * 4
    new_order[target_pos] = c
    slot = 0
    for pos in range(4):
        if pos == target_pos:
            continue
        new_order[pos] = others[slot]
        slot += 1
    q["answers"] = [a[i] for i in new_order]
    if has_en:
        q["answers_en"] = [ae[i] for i in new_order]
    q["correct"] = target_pos
    return True


def main():
    ap = argparse.ArgumentParser(description="Plan 16 / 4.5 - wyrownanie pozycji correct")
    ap.add_argument("--input", default=str(OUT / "deduped.jsonl"))
    ap.add_argument("--output", default=str(OUT / "balanced.jsonl"))
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    src = Path(args.input)
    if not src.exists():
        raise SystemExit(f"Brak {src}")
    qs = [json.loads(l) for l in src.read_text(encoding="utf-8").splitlines() if l.strip()]
    n = len(qs)
    before = Counter(q.get("correct") for q in qs)
    print(f"[4.5] wejscie: {n} pytan | przed: " +
          ", ".join(f"poz{p}={before.get(p,0)}" for p in range(4)))

    rng = random.Random(args.seed)
    order = list(range(n))
    rng.shuffle(order)        # losowa kolejnosc przydzialu, by tie-break nie faworyzowal poczatku

    counts = [0, 0, 0, 0]     # ile juz przydzielono na kazda pozycje
    changed = 0
    skipped = 0
    for i in order:
        q = qs[i]
        # docelowa pozycja = najmniej obsadzony kubelek (tie-break losowy)
        m = min(counts)
        cands = [p for p in range(4) if counts[p] == m]
        target = rng.choice(cands)
        if remap_to_position(q, target):
            counts[target] += 1
            changed += 1
        else:
            skipped += 1

    after = Counter(q.get("correct") for q in qs)
    out = Path(args.output)
    import os
    tmp = out.with_suffix(out.suffix + ".tmp")
    tmp.write_text("\n".join(json.dumps(q, ensure_ascii=False) for q in qs) + ("\n" if qs else ""),
                   encoding="utf-8")
    os.replace(tmp, out)
    try:
        rel = out.resolve().relative_to(REPO)
    except ValueError:
        rel = out
    print(f"[4.5] przestawiono {changed} | pominieto {skipped} (zle dane)")
    print(f"[4.5] po: " + ", ".join(f"poz{p}={after.get(p,0)} ({100*after.get(p,0)/n:.0f}%)"
                                    for p in range(4)))
    print(f"[4.5] -> {rel}")


if __name__ == "__main__":
    main()
