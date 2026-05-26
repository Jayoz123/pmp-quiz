# -*- coding: utf-8 -*-
"""Odzysk pytan z surowych logow RAW w runs/ dla konceptow, ktorych plik puli
w out/raw_batches/pmbok/ jest uszkodzony (przerwany/wspolbiezny zapis).

Dla kazdego podanego concept_id:
  - czyta wszystkie runs/{concept}_*.log (pomija *ERROR*),
  - wyciaga blok RAW i parsuje go ta sama funkcja co pipeline (extract_json_array),
  - deduplikuje po tresci pytania (logi batchy bywaja zduplikowane),
  - odtwarza plik puli z tymi samymi polami metadanych co append_questions.

Zero kosztu API. NIE nadpisuje plikow, ktore juz sa poprawnym JSON-em
(chyba ze --force) i NIE niszczy danych: stary plik -> .corrupt.bak przed zapisem.
"""
import argparse, json, re, sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))
import generate_questions as gq

OUT_PMBOK = REPO / "out" / "raw_batches" / "pmbok"
OUT_REGEN = REPO / "out" / "raw_batches" / "pmbok_regen"
RUNS = REPO / "runs"

DEFAULT_CONCEPTS = [
    "communication-channels-formula",
    "communications-planning",
    "compliance-risks-and-audits",
    "development-methods-mentoring-coaching-training",
]


def parse_log(path):
    """Zwraca (chunk_ids, [pytania]) z jednego logu, albo (None, []) gdy sie nie da."""
    txt = path.read_text(encoding="utf-8")
    m = re.search(r"^RAW:\s*$", txt, flags=re.MULTILINE)
    if not m:
        return None, []
    raw = txt[m.end():]
    try:
        arr = gq.extract_json_array(raw)
    except Exception:
        return None, []
    # chunk_ids nie ma w logu jawnie -> ustalimy z konceptu pozniej; zwracamy tylko pytania
    return None, arr


def qkey(q):
    """Klucz deduplikacji: tresc pytania PL (po znormalizowaniu bialych znakow)."""
    s = (q.get("question") or q.get("question_en") or json.dumps(q, ensure_ascii=False))
    return re.sub(r"\s+", " ", str(s)).strip().lower()


def is_valid_json_file(p):
    try:
        json.load(p.open(encoding="utf-8"))
        return True
    except Exception:
        return False


def recover_concept(concept_id, chunk_ids_by_concept, force, dry, regen=False):
    out_dir = OUT_REGEN if regen else OUT_PMBOK
    pool_file = out_dir / f"{concept_id}.json"
    if pool_file.exists() and is_valid_json_file(pool_file) and not force:
        print(f"[skip] {concept_id}: plik puli juz poprawny (uzyj --force by nadpisac)")
        return None

    # w trybie regen bierzemy TYLKO logi *_regen_*.log; w bazowym - tylko nie-regen.
    def _is_match(p):
        if "ERROR" in p.name:
            return False
        is_regen_log = "_regen_" in p.name
        return is_regen_log if regen else (not is_regen_log)
    logs = sorted(p for p in RUNS.glob(f"{concept_id}_*.log") if _is_match(p))
    if not logs:
        print(f"[warn] {concept_id}: brak logow RAW w runs/")
        return None

    seen, recovered = set(), []
    per_log = []
    for lg in logs:
        _, arr = parse_log(lg)
        added = 0
        for q in arr:
            if not isinstance(q, dict):
                continue
            k = qkey(q)
            if k in seen:
                continue
            seen.add(k)
            recovered.append(q)
            added += 1
        per_log.append((lg.name, len(arr), added))

    if not recovered:
        print(f"[warn] {concept_id}: nie odzyskano zadnego pytania z {len(logs)} logow")
        return None

    # nalóz metadane jak append_questions
    chunk_ids = chunk_ids_by_concept.get(concept_id, [])
    stamp = "v2-2026-05"
    for q in recovered:
        q.setdefault("source_concept", concept_id)
        q["generated_by"] = stamp
        q["review_status"] = "pending"
        q.setdefault("_chunk_ids", chunk_ids)

    print(f"[OK]  {concept_id}: odzyskano {len(recovered)} unikalnych pytan z {len(logs)} logow")
    for name, total, added in per_log:
        print(f"         {name}: {total} w logu, +{added} nowych")

    if dry:
        return len(recovered)

    # backup uszkodzonego pliku, potem atomowy zapis
    if pool_file.exists():
        bak = pool_file.with_suffix(".json.corrupt.bak")
        if not bak.exists():
            pool_file.replace(bak)
            print(f"         backup uszkodzonego -> {bak.name}")
    tmp = pool_file.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(recovered, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(pool_file)
    return len(recovered)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--concepts", nargs="*", default=DEFAULT_CONCEPTS)
    ap.add_argument("--force", action="store_true", help="nadpisz nawet poprawne pliki")
    ap.add_argument("--dry", action="store_true", help="tylko pokaz, nie zapisuj")
    ap.add_argument("--regen", action="store_true",
                    help="odzysk z logow *_regen_*.log -> raw_batches/pmbok_regen/")
    args = ap.parse_args()

    # mapowanie chunk_ids per koncept (jak w pipeline) - dla wiernosci metadanych
    chunks = gq.load_chunks()
    chunk_ids_by_concept = {}
    for c in gq.load_concepts():
        try:
            _, cids = gq.chunks_for_concept(c, chunks)
            chunk_ids_by_concept[c["concept_id"]] = cids
        except Exception:
            chunk_ids_by_concept[c["concept_id"]] = []

    total = 0
    for cid in args.concepts:
        n = recover_concept(cid, chunk_ids_by_concept, args.force, args.dry, args.regen)
        if n:
            total += n
    print(f"\n[recover] razem odzyskanych pytan: {total}  (dry={args.dry}, regen={args.regen})")


if __name__ == "__main__":
    main()
