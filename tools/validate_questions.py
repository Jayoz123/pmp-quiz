# -*- coding: utf-8 -*-
"""
Faza C (kroki C.1 + C.3, opcjonalnie C.2) planu 13: walidacja partii pytan.

C.1 Walidacja strukturalna (twarda, automat):
    - dokladnie 4 odpowiedzi w answers i answers_en; correct in {0,1,2,3}
    - oba jezyki wypelnione; explanation i explanation_en NIEPUSTE
    - brak duplikatow odpowiedzi w obrebie pytania; rozsadne dlugosci; wymagane pola
C.3 Anti-plagiarism vs zrodla (n-gramy):
    - jesli wspolny ciag >= N (domyslnie 8) slow z question_en/answers_en/explanation_en
      pokrywa sie doslownie z tekstem corpus/pmbok_chunks.jsonl ORAZ corpus/agile_chunks.jsonl
      -> flaga "zbyt blisko zrodla" (pytania Agile sprawdzamy przeciw obu korpusom, wg planu C.3)
C.2 (opcjonalnie, --review): druga przepustka AI ("recenzent") - werdykt ok|flag per pytanie.

Wejscie : out/raw_batches/*.json (lub --input <plik/glob>)
Wyjscie : out/validated.jsonl (pytania PRZECHODZACE) + out/flags.csv (odrzucone/flagowane)

Uruchomienie:
  python tools/validate_questions.py
  python tools/validate_questions.py --review            # + recenzent AI (wymaga .env)
"""
import argparse
import csv
import glob
import json
import re
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CORPUS = REPO / "corpus"
OUT = REPO / "out"
PROMPTS = REPO / "tools" / "prompts"

REQUIRED = ["domain", "eco_domain", "eco_task", "question", "question_en",
            "answers", "answers_en", "correct", "explanation", "explanation_en"]
NGRAM = 8
MIN_Q_LEN = 15
MIN_A_LEN = 2


def norm_tokens(text):
    return re.findall(r"[a-z0-9]+", (text or "").lower())


def ngrams(tokens, n):
    return {" ".join(tokens[i:i + n]) for i in range(len(tokens) - n + 1)}


# ---------- C.1 ----------
def check_structure(q):
    errs = []
    for f in REQUIRED:
        if f not in q:
            errs.append(f"brak pola {f}")
    if errs:
        return errs
    a, ae = q.get("answers"), q.get("answers_en")
    if not (isinstance(a, list) and len(a) == 4):
        errs.append("answers != 4")
    if not (isinstance(ae, list) and len(ae) == 4):
        errs.append("answers_en != 4")
    if q.get("correct") not in (0, 1, 2, 3):
        errs.append("correct poza 0-3")
    for fld in ("question", "question_en", "explanation", "explanation_en"):
        if not str(q.get(fld, "")).strip():
            errs.append(f"{fld} puste")
    if len(str(q.get("question", ""))) < MIN_Q_LEN:
        errs.append("question za krotkie")
    if isinstance(a, list):
        if any(len(str(x).strip()) < MIN_A_LEN for x in a):
            errs.append("pusta odpowiedz PL")
        if len({str(x).strip().lower() for x in a}) != len(a):
            errs.append("duplikat odpowiedzi PL")
    if isinstance(ae, list):
        if len({str(x).strip().lower() for x in ae}) != len(ae):
            errs.append("duplikat odpowiedzi EN")
    return errs


# ---------- C.3 ----------
def build_pmbok_ngrams(n):
    # Buduje zbior n-gramow z OBU korpusow: PMBOK i Agile Practice Guide.
    # Pytania Agile (M2) musza byc sprawdzane przeciw agile_chunks.jsonl - wg planu C.3.
    big = set()
    sources = [CORPUS / "pmbok_chunks.jsonl", CORPUS / "agile_chunks.jsonl"]
    pmbok = sources[0]
    if not pmbok.exists():
        sys.exit("Brak corpus/pmbok_chunks.jsonl - najpierw uruchom prep_pmbok.py")
    for chunks in sources:
        if not chunks.exists():
            print(f"[C.3] Uwaga: brak {chunks.name} - pomijam (uruchom prep_agile.py dla puli Agile)")
            continue
        for line in chunks.open(encoding="utf-8"):
            line = line.strip()
            if not line:
                continue
            toks = norm_tokens(json.loads(line)["text"])
            big |= ngrams(toks, n)
    return big


def check_ngram(q, pmbok_ng, n):
    text = " ".join([q.get("question_en", "")]
                    + (q.get("answers_en") or [])
                    + [q.get("explanation_en", "")])
    qng = ngrams(norm_tokens(text), n)
    hit = qng & pmbok_ng
    return sorted(hit)[0] if hit else None


# ---------- C.2 (opcjonalnie) ----------
import hashlib
import time

REVIEW_CKPT = OUT / "review_verdicts.jsonl"


def qhash(q):
    """Stabilny klucz pytania (niezalezny od pozycji idx w puli).
    Liczony z question_en + answers_en, ktore identyfikuja pytanie merytorycznie."""
    base = (q.get("question_en") or q.get("question") or "")
    base += "||" + "|".join(q.get("answers_en") or q.get("answers") or [])
    return hashlib.sha1(base.encode("utf-8")).hexdigest()


def load_review_checkpoint():
    """Wczytuje juz zrecenzowane werdykty z poprzednich (przerwanych) przebiegow.
    Zwraca dict: qhash -> (verdict, reason). Plik to JSONL append-only."""
    done = {}
    if REVIEW_CKPT.exists():
        for line in REVIEW_CKPT.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line:
                continue
            try:
                r = json.loads(line)
                done[r["qhash"]] = (r.get("verdict", "flag"), r.get("reason", ""))
            except Exception:
                continue  # pomijamy ewentualny obciety ostatni wiersz
    return done


def _append_ckpt(rows):
    """Dopisuje partie werdyktow do checkpointu (flush+fsync, by przetrwac crash)."""
    OUT.mkdir(exist_ok=True)
    with open(REVIEW_CKPT, "a", encoding="utf-8") as f:
        for r in rows:
            f.write(json.dumps(r, ensure_ascii=False) + "\n")
        f.flush()
        import os
        os.fsync(f.fileno())


def review_batch(questions, env):
    import anthropic
    key = env.get("ANTHROPIC_API_KEY")
    model = env.get("REVIEW_MODEL", "claude-sonnet-4-6")
    if not key:
        sys.exit("--review wymaga ANTHROPIC_API_KEY w .env")
    sysp = (PROMPTS / "reviewer_prompt.txt").read_text(encoding="utf-8")
    client = anthropic.Anthropic(api_key=key)

    # 1) WZNAWIANIE: wczytaj juz zrobione, pomijaj je w tym przebiegu.
    done = load_review_checkpoint()
    verdicts = {}                      # idx -> (verdict, reason) dla CALEJ puli
    hash_by_idx = {i: qhash(q) for i, q in enumerate(questions)}
    for i, q in enumerate(questions):
        h = hash_by_idx[i]
        if h in done:
            verdicts[i] = done[h]      # z checkpointu, bez ponownego wywolania API
    todo = [i for i in range(len(questions)) if i not in verdicts]
    if done:
        print(f"[C.2] checkpoint: {len(verdicts)} juz zrecenzowanych -> wznawiam, "
              f"do zrobienia {len(todo)}")

    # 2) Pozostale recenzuj partiami po 10; ZAPIS po KAZDEJ partii.
    for s in range(0, len(todo), 10):
        idx_batch = todo[s:s + 10]
        batch = [{"idx": i,
                  **{k: questions[i][k] for k in REQUIRED if k in questions[i]},
                  "difficulty": questions[i].get("difficulty"),
                  "qtype": questions[i].get("qtype")}
                 for i in idx_batch]

        # retry z backoffem na zerwaniu sieci / rate-limicie
        raw = None
        for attempt in range(6):
            try:
                resp = client.messages.create(
                    model=model, max_tokens=2048, temperature=0,
                    system=sysp,
                    messages=[{"role": "user",
                               "content": json.dumps(batch, ensure_ascii=False)}])
                raw = "".join(b.text for b in resp.content
                              if getattr(b, "type", "") == "text")
                break
            except (anthropic.APIConnectionError, anthropic.APITimeoutError) as e:
                wait = min(60, 5 * (attempt + 1))
                print(f"  [C.2] siec padla ({type(e).__name__}) - retry {attempt+1}/6 "
                      f"za {wait}s; postep zapisany, mozesz tez przerwac (Ctrl+C) i wznowic")
                time.sleep(wait)
            except anthropic.RateLimitError:
                wait = min(90, 10 * (attempt + 1))
                print(f"  [C.2] 429 rate-limit - retry {attempt+1}/6 za {wait}s")
                time.sleep(wait)
        if raw is None:
            print(f"  [C.2] partia {s//10+1}: nie udalo sie po 6 probach - "
                  f"przerywam. Uruchom ponownie, by wznowic od tego miejsca "
                  f"({len(verdicts)} werdyktow juz w {REVIEW_CKPT.name}).")
            break

        raw = re.sub(r"^```(?:json)?|```$", "", raw.strip(), flags=re.I | re.M)
        rows = []
        try:
            parsed = json.loads(raw[raw.find("["):raw.rfind("]") + 1])
        except Exception as e:
            print(f"  recenzent: blad parsowania ({e}) - partia oznaczona do reczu")
            parsed = []
        seen_idx = set()
        for v in parsed:
            i = v.get("idx")
            if i is None or i not in idx_batch:
                continue
            verdict = v.get("verdict", "flag")
            reason = v.get("reason", "")
            verdicts[i] = (verdict, reason)
            seen_idx.add(i)
            rows.append({"qhash": hash_by_idx[i], "verdict": verdict, "reason": reason})
        # pytania, dla ktorych model nic nie zwrocil -> oznacz do reczu (nie tracimy ich)
        for i in idx_batch:
            if i not in seen_idx:
                verdicts[i] = ("flag", "brak werdyktu recenzenta (do reczu)")
                rows.append({"qhash": hash_by_idx[i], "verdict": "flag",
                             "reason": "brak werdyktu recenzenta (do reczu)"})
        _append_ckpt(rows)             # <-- CHECKPOINT po kazdej partii
        print(f"  [C.2] partia {s//10+1}/{(len(todo)+9)//10}: +{len(rows)} "
              f"(lacznie {len(verdicts)}/{len(questions)})")
    return verdicts


def load_env():
    env = {}
    p = REPO / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            if "=" in line and not line.strip().startswith("#"):
                k, v = line.split("=", 1)
                env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def main():
    ap = argparse.ArgumentParser(description="Faza C.1+C.3(+C.2) - walidacja pytan")
    ap.add_argument("--input", default=str(OUT / "raw_batches" / "*.json"))
    ap.add_argument("--ngram", type=int, default=NGRAM)
    ap.add_argument("--review", action="store_true", help="dodatkowa przepustka AI (C.2)")
    args = ap.parse_args()

    files = sorted(glob.glob(args.input))
    if not files:
        sys.exit(f"Brak plikow wejsciowych: {args.input}")

    def _load_questions(fp):
        """Obsluguje OBA formaty: tablice JSON (.json batche) oraz JSONL (.jsonl,
        obiekt/linia - np. out/deduped_agile_m2.jsonl). Wczesniej json.load() na JSONL
        wywalal 'Extra data: line 2'."""
        txt = Path(fp).read_text(encoding="utf-8").strip()
        if not txt:
            return []
        # JSONL: kazda niepusta linia to osobny obiekt (pierwszy znak '{' a nie '[')
        if txt.lstrip()[0] != "[":
            out = []
            for line in txt.splitlines():
                line = line.strip()
                if line:
                    out.append(json.loads(line))
            return out
        return json.load(open(fp, encoding="utf-8"))

    questions = []
    for fp in files:
        for q in _load_questions(fp):
            q["_src_file"] = Path(fp).name
            questions.append(q)
    print(f"[C] Wczytano {len(questions)} pytan z {len(files)} partii")

    print(f"[C.3] Buduje zbior {args.ngram}-gramow ze zrodel (PMBOK + Agile)...")
    pmbok_ng = build_pmbok_ngrams(args.ngram)
    print(f"[C.3] {len(pmbok_ng)} unikalnych {args.ngram}-gramow")

    verdicts = {}
    if args.review:
        print("[C.2] Recenzent AI...")
        verdicts = review_batch(questions, load_env())

    OUT.mkdir(exist_ok=True)
    passed, flags = [], []
    for i, q in enumerate(questions):
        reasons = []
        stage = ""
        s_err = check_structure(q)
        if s_err:
            reasons += s_err
            stage = "C.1"
        else:
            hit = check_ngram(q, pmbok_ng, args.ngram)
            if hit:
                reasons.append(f"n-gram pokrywa sie z PMBOK: '{hit}'")
                stage = "C.3"
            elif args.review and verdicts.get(i, ("ok",))[0] == "flag":
                reasons.append("recenzent: " + verdicts[i][1])
                stage = "C.2"
        if reasons:
            q["review_status"] = "flagged"
            flags.append({"idx": i, "src_file": q.get("_src_file", ""),
                          "source_concept": q.get("source_concept", ""),
                          "stage": stage, "reason": "; ".join(reasons),
                          "question": q.get("question", "")[:120]})
        else:
            q["review_status"] = "auto_ok"
            q.pop("_src_file", None)
            passed.append(q)

    (OUT / "validated.jsonl").write_text(
        "\n".join(json.dumps(q, ensure_ascii=False) for q in passed) + ("\n" if passed else ""),
        encoding="utf-8")
    with (OUT / "flags.csv").open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=["idx", "src_file", "source_concept",
                                          "stage", "reason", "question"])
        w.writeheader()
        for r in flags:
            w.writerow(r)

    n = len(questions)
    rej = len(flags)
    print(f"\n[C] WYNIK: przeszlo {len(passed)}/{n} | odrzuconych/flag {rej}/{n} "
          f"({100*rej/n:.0f}% odrzucen)")
    by_stage = {}
    for r in flags:
        by_stage[r["stage"]] = by_stage.get(r["stage"], 0) + 1
    if by_stage:
        print("[C] Flagi wg bramki:", by_stage)
    print(f"[C] -> {(OUT/'validated.jsonl').relative_to(REPO)} , {(OUT/'flags.csv').relative_to(REPO)}")


if __name__ == "__main__":
    main()
