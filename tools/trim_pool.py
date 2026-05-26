# -*- coding: utf-8 -*-
"""
Plan 16, krok 4.5 (czesc 2): PRZYCIECIE puli do celu + redukcja nadmiaru `hard`.

Po regeneracji z `--difficulty hard` pula urosla powyzej celu (np. 1044) i ma za duzo
trudnych (np. 325 hard = 31% przy celu ~15-20%). Ten skrypt wybiera dokladnie --target
pytan (domyslnie 1000), preferencyjnie USUWAJAC nadmiarowe `hard`, az udzial hard spadnie
do --hard-frac (domyslnie 0.20).

Bezpieczenstwo:
  - NIE usuwa ostatniego pytania danego konceptu (chroni pokrycie blueprintu),
  - usuwa najpierw `hard` w konceptach, ktore maja ich najwiecej (rownomierne chudniecie),
  - jesli po redukcji hard nadal > target, dociina reszte z najliczniejszych konceptow
    (nie naruszajac minimum 1/koncept), nie ruszajac proporcji ECO bardziej niz to konieczne,
  - deterministyczne (--seed) dla powtarzalnosci.

Wejscie : out/balanced.jsonl (lub --input)
Wyjscie : out/final.jsonl (lub --output) + log rozkladu przed/po + lista usunietych

Uruchomienie:
  python tools/trim_pool.py
  python tools/trim_pool.py --target 1000 --hard-frac 0.20
"""
import argparse
import json
import random
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "out"


def main():
    ap = argparse.ArgumentParser(description="Plan 16 / 4.5 - przyciecie + redukcja hard")
    ap.add_argument("--input", default=str(OUT / "balanced.jsonl"))
    ap.add_argument("--output", default=str(OUT / "final.jsonl"))
    ap.add_argument("--target", type=int, default=1000)
    ap.add_argument("--hard-frac", type=float, default=0.20,
                    help="docelowy MAKS udzial hard (0.20 = 20%)")
    ap.add_argument("--allow-shrink", action="store_true",
                    help="pozwol zejsc PONIZEJ --target, by osiagnac --hard-frac")
    ap.add_argument("--seed", type=int, default=42)
    args = ap.parse_args()

    src = Path(args.input)
    if not src.exists():
        raise SystemExit(f"Brak {src}")
    qs = [json.loads(l) for l in src.read_text(encoding="utf-8").splitlines() if l.strip()]
    n = len(qs)
    rng = random.Random(args.seed)

    diff0 = Counter(q.get("difficulty") for q in qs)
    print(f"[trim] wejscie: {n} | hard={diff0.get('hard',0)} "
          f"({100*diff0.get('hard',0)/n:.0f}%) | cel: {args.target}, hard<= {args.hard_frac*100:.0f}%")

    # ile pytan na koncept (ochrona: nie schodzimy ponizej 1/koncept)
    by_concept = defaultdict(list)
    for i, q in enumerate(qs):
        by_concept[q.get("source_concept", "?")].append(i)

    keep = set(range(n))

    def concept_count(idx_set):
        c = Counter(qs[i].get("source_concept", "?") for i in idx_set)
        return c

    # 1) REDUKCJA HARD: ile hard wolno zostawic.
    #    OGRANICZENIE: nie usuwamy hard wiecej, niz wynosi nadmiar nad celem (target),
    #    by nie zejsc PONIZEJ target tylko z powodu hard. Jesli redukcja hard do
    #    --hard-frac wymagalaby ciecia ponizej target, ucinamy tyle ile sie da bez
    #    schodzenia pod target (--allow-shrink wylacza ten bezpiecznik).
    target_hard = int(args.target * args.hard_frac)
    hard_ids = [i for i in keep if qs[i].get("difficulty") == "hard"]
    want_drop_hard = max(0, len(hard_ids) - target_hard)
    spare = max(0, len(keep) - args.target)
    if args.allow_shrink:
        n_drop_hard = want_drop_hard
    else:
        n_drop_hard = min(want_drop_hard, spare)
        if want_drop_hard > spare:
            print(f"[trim] UWAGA: aby zejsc do {target_hard} hard trzeba by usunac "
                  f"{want_drop_hard}, ale nadmiar nad celem to tylko {spare}. "
                  f"Usuwam {spare} hard (zostaje {len(hard_ids)-spare} hard = "
                  f"{100*(len(hard_ids)-spare)/args.target:.0f}%). "
                  f"Uzyj --allow-shrink by zejsc ponizej {args.target}.")

    if n_drop_hard > 0:
        # sortuj hard tak, by usuwac najpierw z konceptow majacych ICH najwiecej,
        # i nigdy nie zostawic konceptu z 0 pytaniami
        cc = concept_count(keep)
        hard_by_concept = defaultdict(list)
        for i in hard_ids:
            hard_by_concept[qs[i].get("source_concept", "?")].append(i)
        # kolejnosc usuwania: priorytet konceptom z najwieksza liczba hard
        order = sorted(hard_ids,
                       key=lambda i: (-len(hard_by_concept[qs[i].get("source_concept", "?")]),
                                      rng.random()))
        dropped = 0
        for i in order:
            if dropped >= n_drop_hard:
                break
            cid = qs[i].get("source_concept", "?")
            if cc[cid] <= 1:           # ostatnie pytanie konceptu - nie ruszaj
                continue
            keep.discard(i)
            cc[cid] -= 1
            dropped += 1
        print(f"[trim] usunieto hard: {dropped} (z {len(hard_ids)} -> {len(hard_ids)-dropped})")

    # 2) PRZYCIECIE DO TARGET: jesli wciaz powyzej celu, dociina z najliczniejszych konceptow
    if len(keep) > args.target:
        excess = len(keep) - args.target
        cc = concept_count(keep)
        # kandydaci do usuniecia: nie-hard najpierw (chronimy juz przerzedzone hard),
        # z konceptow z najwieksza liczba pytan
        cand = sorted(
            [i for i in keep if cc[qs[i].get("source_concept", "?")] > 1],
            key=lambda i: (-cc[qs[i].get("source_concept", "?")],
                           0 if qs[i].get("difficulty") != "hard" else 1,
                           rng.random()))
        dropped = 0
        for i in cand:
            if dropped >= excess:
                break
            cid = qs[i].get("source_concept", "?")
            if cc[cid] <= 1:
                continue
            keep.discard(i)
            cc[cid] -= 1
            dropped += 1
        print(f"[trim] dociecie do celu: usunieto {dropped}")

    final = [qs[i] for i in sorted(keep)]
    diff1 = Counter(q.get("difficulty") for q in final)
    eco1 = Counter(q.get("eco_domain") for q in final)
    corr1 = Counter(str(q.get("correct")) for q in final)
    m = len(final)

    import os
    out = Path(args.output)
    tmp = out.with_suffix(out.suffix + ".tmp")
    tmp.write_text("\n".join(json.dumps(q, ensure_ascii=False) for q in final) + ("\n" if final else ""),
                   encoding="utf-8")
    os.replace(tmp, out)

    print(f"[trim] WYNIK: {m} pytan")
    print(f"[trim]   trudnosc: " +
          ", ".join(f"{k}={v} ({100*v/m:.0f}%)" for k, v in sorted(diff1.items(), key=lambda x: -x[1])))
    print(f"[trim]   ECO: " + ", ".join(f"{k}={v} ({100*v/m:.0f}%)" for k, v in eco1.items()))
    print(f"[trim]   correct: " + ", ".join(f"{k}={v}" for k, v in sorted(corr1.items())))
    # ochrona pokrycia: ile konceptow spadlo do 0?
    concepts_before = set(q.get("source_concept") for q in qs)
    concepts_after = set(q.get("source_concept") for q in final)
    lost = concepts_before - concepts_after
    if lost:
        print(f"[trim]   UWAGA: {len(lost)} konceptow stracilo wszystkie pytania: {sorted(lost)[:5]}")
    else:
        print(f"[trim]   pokrycie konceptow zachowane ({len(concepts_after)} konceptow)")
    try:
        rel = out.resolve().relative_to(REPO)
    except ValueError:
        rel = out
    print(f"[trim] -> {rel}")


if __name__ == "__main__":
    main()
