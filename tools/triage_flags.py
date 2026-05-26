# -*- coding: utf-8 -*-
"""
Plan 16, krok 4.1: TRIAGE flag z recenzji C.2.

Czyta werdykty C.2 (out/review_verdicts.jsonl) + pelna pula raw_batches/pmbok,
laczy je po qhash (stabilny klucz z question_en + answers_en, jak w
validate_questions.py) i dla kazdego pytania `flag` przypisuje kategorie powodu:

  A  duplikat scenariusza/tresci  -> nie blad, nadmiarowosc. Zachowaj 1 z grupy,
                                     reszte zregeneruj z wymuszona roznorodnoscia.
  B  blad merytoryczny            -> twardy defekt (zla `correct`, blad obliczenia,
                                     correct != wyjasnienie, niezgodnosc PL/EN znaczenia).
                                     NIE lata sie - zastepuje regeneracja.
  C  wada jakosciowa              -> slaby dystraktor / >1 obronnej odpowiedzi /
                                     niejednoznacznosc. Regeneracja.
  D  kodowanie PL                 -> brak polskich znakow / mojibake. Naprawa przy odzysku.

Precedencja kategoryzacji (najsurowsza wygrywa): B > D > A > C.
  - Blad merytoryczny trumfuje wszystko (pytania B nie wolno wpuscic do appki,
    nawet jesli jest tez duplikatem - i tak idzie do regeneracji).
  - Reszta nierozpoznana (X) traktowana konserwatywnie jako B (regeneracja),
    bo lepiej zregenerowac watpliwe niz wpuscic potencjalny defekt.

Grupowanie duplikatow: per source_concept + podobienstwo leksykalne tresci pytania
(prog --sim, domyslnie 0.45 na cosinusie zbioru tokenow PL+EN - nizszy niz dedup C.4
0.82, bo recenzent flagowal jako "duplikat" rowniez SCHEMATY scenariusza, nie tylko
doslowne parafrazy). Grupa = pytania flag tego samego konceptu, ktore sa do siebie
podobne >= prog (przechodnio, union-find). W kazdej grupie wybierany jest KANDYDAT
DO ZACHOWANIA: pytanie z najlepszym profilem (pelne pola, brak bledu C.1, najnizsza
srednia podobienstwa do reszty grupy = najbardziej "oryginalne").

UWAGA: do grup duplikatow dolaczamy rowniez juz-zatwierdzone pytania `ok` tego samego
konceptu jako "kotwice" - jesli oflagowany duplikat ma blizniaka wsrod `ok`, to znaczy
ze dobra wersja JUZ jest w puli czystej i NIE promujemy kolejnej (unikamy podwojenia).
Kandydata do zachowania promujemy TYLKO gdy cala grupa to same `flag` (zaden `ok` nie
reprezentuje juz tego scenariusza).

Wyjscie:
  out/triage_keep.jsonl   - pytania-duplikaty do promocji na human_ok (1 z grupy)
  out/triage_regen.csv     - concept_id -> ile slotow do regeneracji (+ rozbicie kategorii)
  out/triage_errors.csv    - kazde pytanie B (blad) z qhash, konceptem i powodem
  out/triage_summary.md     - czytelny bilans liczbowy (krok 3 planu, twarde liczby)

Uruchomienie:
  python tools/triage_flags.py
  python tools/triage_flags.py --sim 0.45
"""
import argparse
import csv
import glob
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "out"
POOL_GLOB = str(OUT / "raw_batches" / "pmbok" / "*.json")
VERDICTS = OUT / "review_verdicts.jsonl"

SIM_DEFAULT = 0.45  # prog grupowania duplikatow (lekser - lapie powtarzalne SCHEMATY)

# Pola wymagane (C.1) - uzywane do oceny "kompletnosci" kandydata do zachowania.
REQUIRED = ["domain", "eco_domain", "eco_task", "question", "question_en",
            "answers", "answers_en", "correct", "explanation", "explanation_en"]


# ---------- klucz pytania (identyczny jak w validate_questions.py) ----------
def qhash(q):
    base = (q.get("question_en") or q.get("question") or "")
    base += "||" + "|".join(q.get("answers_en") or q.get("answers") or [])
    return hashlib.sha1(base.encode("utf-8")).hexdigest()


def load_pool_file(fp):
    """Obsluguje OBA formaty: tablice JSON (.json batche PMBOK) oraz JSONL (1 obiekt/linia,
    np. out/deduped_agile_m2.jsonl). Dzieki temu triage dziala tez na puli Agile."""
    txt = Path(fp).read_text(encoding="utf-8").strip()
    if not txt:
        return []
    if txt.lstrip()[0] != "[":            # JSONL
        return [json.loads(l) for l in txt.splitlines() if l.strip()]
    return json.loads(txt)                # tablica JSON


# ---------- podobienstwo leksykalne (jak w dedup_questions.py) ----------
def toks(*texts):
    s = set()
    for t in texts:
        s |= set(re.findall(r"[a-z0-9]+", (t or "").lower()))
    return s


def q_tokens(q):
    # tresc pytania PL+EN (bez odpowiedzi), spojnie z dedup_questions.q_tokens
    return toks(q.get("question", ""), q.get("question_en", ""))


def sim(a, b):
    if not a or not b:
        return 0.0
    return len(a & b) / math.sqrt(len(a) * len(b))


# ---------- kategoryzacja powodu flagi ----------
RE_ERR = re.compile(
    r"(pole\s*.?correct|correct\b.{0,25}(wskaz|niezgod|nie zgadz|b[łl][ęe]d|prawid)|"
    r"niezgodno[śs][cć].{0,30}correct|b[łl][ęe]d\s+w\s+polu\s+correct|"
    r"b[łl][ęe]d(?:n[ey])?\s+(oblicz|wynik|wyliczen|arytmet|matematy|merytor)|"
    r"(oblicz|wyliczen|arytmet|matematy)\w*\s+b[łl][ęe]d|b[łl][ęe]d\s+obliczeniow|"
    r"zła\s+(poprawn|odpowied)|nieprawid[łl]ow[aey].{0,20}(odpowied|poprawn|wynik)|"
    r"wyja[śs]nieni[ae].{0,45}(b[łl][ęe]d|sprzeczn|niezgod|nieprawid|przyznaje\s+b[łl])|"
    r"sprzeczno[śs][cć]|niezgodn[aey].{0,25}(z\s+tre[śs]ci|PL/EN|PL\s*/\s*EN)|"
    r"\bPERT\b|\bEAC\b|\bEMV\b|\bNPV\b|niezgodn[aey].{0,20}tre[śs]ci|"
    r"suma\s+(wszystkich\s+)?(wad|element).{0,40}(niezgodn|nie\s+zgadz)|"
    r"merytoryczn[ey].{0,15}b[łl][ęe]d|b[łl][ęe]d.{0,15}merytor|rozbie[żz]no[śs][cć]\s+z\s+w[łl]asn)",
    re.I)
RE_ENC = re.compile(
    r"(brak\s+polskich\s+znak|polskich\s+znak[óo]w\s+diakryt|mojibake|diakrytyczn|"
    r"kodowani[ea]\s|krzaczk|ogonk)", re.I)
RE_QUAL = re.compile(
    r"(dystraktor|s[łl]ab[ey].{0,15}(dystr|odpowied)|wi[ęe]cej\s+ni[żz]\s+jedn|>\s*1|"
    r"(dwie|dwa|dwoma)\s+(poprawn|obronn|uzasadn|dobr)|r[óo]wnie\s+(uzasadn|dobr|popraw)|"
    r"obronn|niejednoznaczn|dwuznaczn|myl[ąa]c|nieprecyzyjn|w[ąa]tpliwo[śs][cć]|"
    r"oczywi[śs]cie\s+b[łl][ęe]dn|zbyt\s+(s[łl]ab|[łl]atw))", re.I)
RE_DUP = re.compile(
    r"(duplik|niemal\s+identyczn|bardzo\s+podobn|ten\s+sam\s+scenariusz|tak[ia]\s+sam|"
    r"powtarzaj|redundan|nadmiarow|powt[óo]rz|kopia\s+scenariusz|kolejna\s+kopia|"
    r"idx\s*\d+.{0,6}(i|,|–|-)\s*idx|pytani[ae]\s+\d+\s+(i|,|–|-)\s+\d+|"
    r"zbli[żz]on|para\s+pyta[ńn]|podobn[ye].{0,15}do\s+(pyta|idx)|powtarzaln)", re.I)


def categorize(reason):
    """Zwraca kod kategorii: B/D/A/C. Precedencja: B > D > A > C; reszta -> B (konserwatywnie)."""
    r = reason or ""
    if RE_ERR.search(r):
        return "B"
    if RE_ENC.search(r):
        return "D"
    if RE_DUP.search(r):
        return "A"
    if RE_QUAL.search(r):
        return "C"
    return "B"  # nierozpoznane -> regeneracja (bezpieczniej niz wpuscic defekt)


# ---------- union-find do grupowania duplikatow ----------
class UF:
    def __init__(self, n):
        self.p = list(range(n))

    def find(self, x):
        while self.p[x] != x:
            self.p[x] = self.p[self.p[x]]
            x = self.p[x]
        return x

    def union(self, a, b):
        ra, rb = self.find(a), self.find(b)
        if ra != rb:
            self.p[ra] = rb


def completeness_score(q):
    """Wyzszy = bardziej kompletne/zdatne do zachowania (pelne pola C.1, sensowne dlugosci)."""
    s = 0
    for f in REQUIRED:
        if str(q.get(f, "")).strip():
            s += 1
    a = q.get("answers")
    if isinstance(a, list) and len(a) == 4 and len({str(x).strip().lower() for x in a}) == 4:
        s += 2
    if q.get("correct") in (0, 1, 2, 3):
        s += 1
    if len(str(q.get("explanation", ""))) > 120:
        s += 1
    return s


def main():
    ap = argparse.ArgumentParser(description="Plan 16 / 4.1 - triage flag C.2")
    ap.add_argument("--sim", type=float, default=SIM_DEFAULT,
                    help="prog podobienstwa leksykalnego do grupowania duplikatow")
    ap.add_argument("--pool", default=POOL_GLOB, help="glob puli PMBOK (raw batches)")
    ap.add_argument("--verdicts", default=str(VERDICTS), help="JSONL werdyktow C.2")
    args = ap.parse_args()

    # 1) wczytaj pule i zindeksuj po qhash. --pool moze byc kilkoma globami (spacja-rozdz.),
    #    by objac baze + regenerat: --pool "out/raw_batches/pmbok/*.json out/.../pmbok_regen/*.json"
    #    Dla puli Agile to JEDEN plik JSONL: --pool out/deduped_agile_m2.jsonl
    files = []
    for pat in args.pool.split():
        files.extend(glob.glob(pat))
    files = sorted(set(files))
    if not files:
        raise SystemExit(f"Brak puli: {args.pool}")
    pool = {}        # qhash -> question dict (z dodanym _src_file)
    for fp in files:
        for q in load_pool_file(fp):
            q["_src_file"] = Path(fp).name
            pool[qhash(q)] = q
    print(f"[4.1] pula: {len(pool)} pytan z {len(files)} plikow")

    # 2) wczytaj werdykty
    verdict = {}     # qhash -> (verdict, reason)
    for line in Path(args.verdicts).read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            d = json.loads(line)
        except Exception:
            continue
        verdict[d["qhash"]] = (d.get("verdict", "flag"), d.get("reason", ""))
    n_ok = sum(1 for v in verdict.values() if v[0] == "ok")
    n_flag = sum(1 for v in verdict.values() if v[0] == "flag")
    print(f"[4.1] werdykty C.2: {n_ok} ok, {n_flag} flag (razem {len(verdict)})")

    missing = [h for h in verdict if h not in pool]
    if missing:
        print(f"[4.1] UWAGA: {len(missing)} werdyktow nie laczy sie z pula (pomine)")

    # 3) kategoryzuj flagi
    flags = []       # list of (qhash, q, reason, kategoria)
    for h, (vd, reason) in verdict.items():
        if vd != "flag" or h not in pool:
            continue
        flags.append((h, pool[h], reason, categorize(reason)))

    cat_count = Counter(f[3] for f in flags)
    print(f"[4.1] kategorie flag: " +
          ", ".join(f"{k}={cat_count.get(k,0)}" for k in ["A", "B", "C", "D"]))

    # 4) GRUPOWANIE DUPLIKATOW per koncept.
    #    Do grupy dolaczamy ANCHORS = pytania `ok` tego konceptu (kotwice), by nie
    #    promowac duplikatu, gdy dobra wersja juz jest czysta.
    by_concept = defaultdict(list)   # concept_id -> [ (qhash, q, is_flag, reason, kat) ]
    for h, q in pool.items():
        vd = verdict.get(h, ("ok", ""))[0]
        cid = q.get("source_concept", q.get("_src_file", "").replace(".json", ""))
        if vd == "flag":
            reason = verdict[h][1]
            by_concept[cid].append((h, q, True, reason, categorize(reason)))
        else:  # ok -> kotwica
            by_concept[cid].append((h, q, False, "", None))

    keep = []        # pytania-duplikaty do promocji (human_ok)
    keep_hashes = set()
    regen_by_concept = defaultdict(lambda: Counter())  # cid -> Counter(kategorii regenerowanych)

    for cid, items in by_concept.items():
        n = len(items)
        toksets = [q_tokens(it[1]) for it in items]
        uf = UF(n)
        for i in range(n):
            for j in range(i + 1, n):
                if sim(toksets[i], toksets[j]) >= args.sim:
                    uf.union(i, j)
        groups = defaultdict(list)
        for i in range(n):
            groups[uf.find(i)].append(i)

        for _, idxs in groups.items():
            flag_idxs = [i for i in idxs if items[i][2]]      # tylko flagi
            if not flag_idxs:
                continue
            # czy grupa zawiera "duplikatowe" flagi (kat A)? promocja dotyczy tylko duplikatow.
            dup_flag_idxs = [i for i in flag_idxs if items[i][4] == "A"]
            has_ok_anchor = any(not items[i][2] for i in idxs)

            if dup_flag_idxs and not has_ok_anchor:
                # cala reprezentacja scenariusza to flagi-duplikaty: zachowaj 1 najlepszy.
                def cand_key(i):
                    q = items[i][1]
                    others = [j for j in idxs if j != i]
                    avg_sim = (sum(sim(toksets[i], toksets[j]) for j in others) / len(others)
                               if others else 0.0)
                    return (completeness_score(q), -avg_sim)
                best = max(dup_flag_idxs, key=cand_key)
                bh, bq, _, _, _ = items[best]
                keep.append(bq)
                keep_hashes.add(bh)
                # reszta flag w grupie -> regeneracja wg ich kategorii
                for i in flag_idxs:
                    if i == best:
                        continue
                    regen_by_concept[cid][items[i][4]] += 1
            else:
                # grupa ma juz kotwice `ok` (dobra wersja istnieje) LUB to flagi B/C/D
                # bez duplikatu -> wszystkie flagi do regeneracji (nic nie promujemy).
                for i in flag_idxs:
                    regen_by_concept[cid][items[i][4]] += 1

    # 5) zapis triage_keep.jsonl (promocja human_ok)
    OUT.mkdir(exist_ok=True)
    with (OUT / "triage_keep.jsonl").open("w", encoding="utf-8") as f:
        for q in keep:
            qq = {k: v for k, v in q.items() if k != "_src_file"}
            qq["review_status"] = "human_ok"
            qq.setdefault("source_concept",
                          q.get("_src_file", "").replace(".json", ""))
            f.write(json.dumps(qq, ensure_ascii=False) + "\n")

    # 6) zapis triage_regen.csv (ile slotow per koncept)
    regen_rows = []
    for cid in sorted(regen_by_concept):
        c = regen_by_concept[cid]
        total = sum(c.values())
        regen_rows.append({
            "concept_id": cid, "regen_total": total,
            "blad_B": c.get("B", 0), "wada_C": c.get("C", 0),
            "duplikat_A": c.get("A", 0), "kodowanie_D": c.get("D", 0),
        })
    with (OUT / "triage_regen.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["concept_id", "regen_total", "blad_B",
                                          "wada_C", "duplikat_A", "kodowanie_D"])
        w.writeheader()
        for r in sorted(regen_rows, key=lambda x: -x["regen_total"]):
            w.writerow(r)

    # 7) zapis triage_errors.csv (twarde bledy B)
    with (OUT / "triage_errors.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.writer(f)
        w.writerow(["qhash", "source_concept", "reason", "question"])
        for h, q, reason, kat in flags:
            if kat == "B":
                w.writerow([h, q.get("source_concept", ""), reason,
                            q.get("question", "")[:140]])

    # 8) bilans liczbowy -> triage_summary.md
    total_regen = sum(sum(c.values()) for c in regen_by_concept.values())
    regen_by_cat = Counter()
    for c in regen_by_concept.values():
        regen_by_cat.update(c)
    n_keep = len(keep)
    n_pmbok_quota = 1000

    md = []
    md.append("# Triage flag C.2 - bilans liczbowy (plan 16, krok 3+4.1)\n")
    md.append(f"Pula PMBOK: **{len(pool)}** | werdykty: **{n_ok} ok + {n_flag} flag**\n")
    md.append("## Kategorie flag (precedencja B > D > A > C)\n")
    md.append("| Kat | Opis | N |")
    md.append("|---|---|---|")
    md.append(f"| A | duplikat scenariusza/tresci | {cat_count.get('A',0)} |")
    md.append(f"| B | blad merytoryczny (+ nierozpoznane) | {cat_count.get('B',0)} |")
    md.append(f"| C | wada jakosciowa | {cat_count.get('C',0)} |")
    md.append(f"| D | kodowanie PL | {cat_count.get('D',0)} |")
    md.append(f"| | **razem flag** | **{n_flag}** |\n")
    md.append("## Krok A - duplikaty: ile odzyskano (promocja 1 z grupy)\n")
    md.append(f"- **{n_keep}** pytan-duplikatow promowanych do `human_ok` "
              f"(zapisane w `out/triage_keep.jsonl`).\n")
    md.append("## Ile do regeneracji (krok B+C+D + reszta duplikatow)\n")
    md.append("| Powod regeneracji | N |")
    md.append("|---|---|")
    md.append(f"| A duplikat (poza zachowanym) | {regen_by_cat.get('A',0)} |")
    md.append(f"| B blad merytoryczny | {regen_by_cat.get('B',0)} |")
    md.append(f"| C wada jakosciowa | {regen_by_cat.get('C',0)} |")
    md.append(f"| D kodowanie PL | {regen_by_cat.get('D',0)} |")
    md.append(f"| **razem do regeneracji** | **{total_regen}** |\n")
    clean_after = n_ok + n_keep
    md.append("## Bilans drogi do 1000 PMBOK\n")
    md.append(f"```\n{n_ok:4d}  czystych ok (C.2)\n"
              f"+{n_keep:3d}  odzyskanych '1 z grupy duplikatow' (promocja human_ok)\n"
              f"={clean_after:4d}  czystych po remediacji duplikatow\n"
              f"\ncel  {n_pmbok_quota} PMBOK -> brakuje {max(0, n_pmbok_quota - clean_after)} "
              f"do dogenerowania\n"
              f"(regeneracja zastapi {total_regen} oflagowanych; nadwyzka ponad brak "
              f"= zapas na odpad recenzji)\n```\n")
    md.append("## Pliki wyjsciowe\n")
    md.append("- `out/triage_keep.jsonl` - do promocji human_ok (krok 4.2)")
    md.append("- `out/triage_regen.csv` - concept_id -> sloty regeneracji (krok 4.3)")
    md.append("- `out/triage_errors.csv` - twarde bledy B (kontrola)")
    (OUT / "triage_summary.md").write_text("\n".join(md), encoding="utf-8")

    print(f"\n[4.1] WYNIK:")
    print(f"  zachowane duplikaty (human_ok): {n_keep}")
    print(f"  do regeneracji razem:           {total_regen}  "
          f"(A={regen_by_cat.get('A',0)} B={regen_by_cat.get('B',0)} "
          f"C={regen_by_cat.get('C',0)} D={regen_by_cat.get('D',0)})")
    print(f"  czystych po remediacji:         {clean_after}  -> do 1000 brakuje "
          f"{max(0, n_pmbok_quota - clean_after)}")
    print(f"  -> out/triage_keep.jsonl, out/triage_regen.csv, "
          f"out/triage_errors.csv, out/triage_summary.md")


if __name__ == "__main__":
    main()
