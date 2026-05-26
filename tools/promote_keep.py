# -*- coding: utf-8 -*-
"""
Plan 16, krok 4.2: PROMOCJA zachowanych duplikatow + zlozenie czystej puli PMBOK.

Plan zaklada "dopisz triage_keep.jsonl do validated.jsonl z human_ok". W praktyce
out/validated.jsonl pochodzi z WCZESNIEJSZEGO przebiegu walidacji (688 auto_ok) i NIE
odzwierciedla pelnego zestawu 708 `ok` z ukonczonej recenzji C.2 (brakuje 20 pytan
zrecenzowanych `ok` w pozniejszej partii, po ktorej walidatora nie odpalono ponownie).
Dodatkowo bywa uszkodzony NUL-bajtami z OneDrive (placeholder).

Dlatego skladamy czysta pule PMBOK DETERMINISTYCZNIE z AUTORYTATYWNYCH zrodel:
  1) 708 `ok` z out/review_verdicts.jsonl  (laczone z pula raw_batches/pmbok po qhash) -> auto_ok
  2)  43 zachowane duplikaty z out/triage_keep.jsonl                                    -> human_ok

Wynik: out/validated_pmbok_remediated.jsonl  (czysta pula PMBOK po C.2 + remediacji A).
To wejscie do dedup_questions.py (C.4) - krok kolejny w pipeline.

Idempotentne: liczy wszystko od zrodel, nie dopisuje do plikow append-only.

Uruchomienie:
  python tools/promote_keep.py
"""
import glob
import hashlib
import json
from collections import Counter
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "out"
# Domyslnie obejmuje baze I regenerat - by finalne skladanie wzielo nowe pytania.
POOL_GLOB = (str(OUT / "raw_batches" / "pmbok" / "*.json") + " " +
             str(OUT / "raw_batches" / "pmbok_regen" / "*.json"))
VERDICTS = OUT / "review_verdicts.jsonl"
KEEP = OUT / "triage_keep.jsonl"
DST = OUT / "validated_pmbok_remediated.jsonl"

DROP_FIELDS = {"_src_file"}


def qhash(q):
    base = (q.get("question_en") or q.get("question") or "")
    base += "||" + "|".join(q.get("answers_en") or q.get("answers") or [])
    return hashlib.sha1(base.encode("utf-8")).hexdigest()


def clean(q, status):
    qq = {k: v for k, v in q.items() if k not in DROP_FIELDS}
    qq["review_status"] = status
    return qq


def main():
    import argparse
    ap = argparse.ArgumentParser(description="Plan 16 / 4.2 - promocja keep + czysta pula")
    ap.add_argument("--pool", default=POOL_GLOB,
                    help="globy puli (spacja-rozdz.): baza + regenerat; lub JSONL Agile")
    ap.add_argument("--keep", default=str(KEEP),
                    help="plik triage_keep.jsonl (do promocji human_ok)")
    ap.add_argument("--out", default=str(DST), help="plik wyjsciowy czystej puli")
    args = ap.parse_args()
    keep_path = Path(args.keep)
    dst = Path(args.out)

    # 1) pula (baza + regen, lub pojedynczy JSONL Agile) -> qhash -> pytanie.
    def _load(fp):
        txt = Path(fp).read_text(encoding="utf-8").strip()
        if not txt:
            return []
        if txt.lstrip()[0] != "[":          # JSONL (np. deduped_agile_m2.jsonl)
            return [json.loads(l) for l in txt.splitlines() if l.strip()]
        return json.loads(txt)
    files = []
    for pat in args.pool.split():
        files.extend(glob.glob(pat))
    pool = {}
    for fp in sorted(set(files)):
        for q in _load(fp):
            pool[qhash(q)] = q
    print(f"[4.2] pula (baza+regen / Agile): {len(pool)}")

    # 2) werdykty C.2
    verdict = {}
    for line in VERDICTS.read_text(encoding="utf-8").splitlines():
        s = line.strip()
        if not s:
            continue
        try:
            d = json.loads(s)
        except Exception:
            continue
        verdict[d["qhash"]] = d.get("verdict", "flag")
    ok_hashes = [h for h, v in verdict.items() if v == "ok" and h in pool]
    print(f"[4.2] ok -> auto_ok: {len(ok_hashes)}")

    out = []
    seen = set()
    for h in ok_hashes:
        out.append(clean(pool[h], "auto_ok"))
        seen.add(h)

    # 3) zachowane duplikaty -> human_ok (pomijamy ewentualne kolizje z ok)
    kept = 0
    dup_skip = 0
    if keep_path.exists():
        for line in keep_path.read_text(encoding="utf-8").splitlines():
            s = line.strip()
            if not s:
                continue
            q = json.loads(s)
            h = qhash(q)
            if h in seen:
                dup_skip += 1
                continue
            out.append(clean(q, "human_ok"))
            seen.add(h)
            kept += 1
    print(f"[4.2] zachowane duplikaty -> human_ok: {kept}"
          + (f" (pominieto {dup_skip} kolidujacych z ok)" if dup_skip else ""))

    # 4) zapis ATOMOWY (tmp + replace) - bezpieczny przy OneDrive
    import os
    tmp = dst.with_suffix(".jsonl.tmp")
    tmp.write_text(
        "\n".join(json.dumps(q, ensure_ascii=False) for q in out) + ("\n" if out else ""),
        encoding="utf-8")
    os.replace(tmp, dst)

    st = Counter(q["review_status"] for q in out)
    rel = dst.relative_to(REPO) if dst.is_absolute() and str(dst).startswith(str(REPO)) else dst
    print(f"[4.2] -> {rel}: {len(out)} pytan ({dict(st)})")
    print(f"[4.2] nastepny krok: python tools/dedup_questions.py --input {rel}")


if __name__ == "__main__":
    main()
