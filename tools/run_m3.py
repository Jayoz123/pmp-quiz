# -*- coding: utf-8 -*-
"""M3 driver: resumable, time-budgeted, CONCURRENT generation of the PMBOK pool.
Runs short self-terminating slices; fires several batches concurrently per slice
(~6 batches = 18 q in ~28s). Each batch written on return; re-invoking resumes.
Reuses generate_questions.py prompt assembly verbatim.
"""
import argparse, concurrent.futures as cf, csv, glob, json, sys, threading, time
from datetime import datetime
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(REPO / "tools"))
import generate_questions as gq

OUT_PMBOK = REPO / "out" / "raw_batches" / "pmbok"
OUT_REGEN = REPO / "out" / "raw_batches" / "pmbok_regen"   # tryb --regen pisze TU (osobno od bazy)
RUNS = REPO / "runs"
import os
BATCH_SIZE = int(os.environ.get("M3_BS","3"))
_write_lock = threading.Lock()


# ----- tryb --regen (plan 16, krok 4.3): regeneracja celowana z wymuszona roznorodnoscia -----
SCEN_MAX = 14          # ile istniejacych scenariuszy konceptu wstrzykujemy jako "unikaj tych"
SCEN_CHARS = 160       # dlugosc skrotu kazdego scenariusza


def existing_scenarios(concept_id):
    """Skroty WSZYSTKICH dotychczasowych pytan danego konceptu (z bazy raw_batches/pmbok)
    + ewentualnych juz zregenerowanych (raw_batches/pmbok_regen). Sluza jako lista
    'unikaj tych scenariuszy' wstrzykiwana do promptu regeneracji."""
    seen, out = set(), []
    for base in (OUT_PMBOK, OUT_REGEN):
        f = base / f"{concept_id}.json"
        if not f.exists():
            continue
        try:
            arr = json.load(f.open(encoding="utf-8"))
        except Exception:
            continue
        for q in arr:
            txt = (q.get("question") or "").strip().replace("\n", " ")
            key = txt[:60].lower()
            if not txt or key in seen:
                continue
            seen.add(key)
            out.append(txt[:SCEN_CHARS])
    return out[:SCEN_MAX]


def regen_instruction_block(concept_id, difficulty=None):
    """Blok doklejany na KONIEC user-promptu w trybie regeneracji: wymusza inna branze/
    role/liczby i jawnie wylicza istniejace scenariusze, ktorych model ma unikac.
    difficulty (opcjonalnie 'hard'/'easy'/'medium') wymusza poziom trudnosci - sluzy do
    dosrubowania udzialu `hard` (cel ~20%, krok 4.5)."""
    scen = existing_scenarios(concept_id)
    lines = [
        "",
        "=== REGENERACJA - WYMUSZONA ROZNORODNOSC (plan 16 / krok B+C+A) ===",
        "Te pytania zastepuja wczesniejsze, ktore odpadly w recenzji (duplikat scenariusza,",
        "blad merytoryczny, slaby dystraktor lub niejednoznacznosc). Dlatego:",
        "- UZYJ INNEJ branzy, innych ROL/imion i innych LICZB niz w scenariuszach ponizej.",
        "- NIE powielaj tego samego szkieletu sytuacji (np. 'doswiadczony zespol + mikrozarzadzanie').",
        "- Upewnij sie, ze pole `correct` ZGADZA SIE z `explanation` (dla obliczeniowych: przelicz wynik).",
        "- Dokladnie JEDNA odpowiedz ma byc bezspornie najlepsza; pozostale wiarygodne, ale gorsze.",
        "- Polskie znaki diakrytyczne (a, e, s, c, l, z, o, n) MUSZA byc poprawne (UTF-8).",
        "- Pozycje poprawnej odpowiedzi (`correct`) mieszaj rownomiernie 0-3.",
    ]
    if difficulty:
        lines.append(f"- POZIOM TRUDNOSCI: ustaw pole `difficulty` na '{difficulty}' i tak skonstruuj "
                     f"pytanie (dla 'hard': blizsze dystraktory, wieloetapowa analiza/obliczenie, "
                     f"subtelne pulapki - ale nadal dokladnie jedna bezsporna odpowiedz).")
    if scen:
        lines.append("")
        lines.append("ISTNIEJACE SCENARIUSZE TEGO KONCEPTU - NIE POWTARZAJ ICH:")
        for i, s in enumerate(scen, 1):
            lines.append(f"  {i}. {s}")
    return "\n".join(lines)


def load_regen_targets(csv_path):
    """Czyta out/triage_regen.csv (concept_id, regen_total, ...) -> {concept_id: n}."""
    targets = {}
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        for r in csv.DictReader(f):
            cid = (r.get("concept_id") or "").strip()
            try:
                n = int(r.get("regen_total") or 0)
            except ValueError:
                n = 0
            if cid and n > 0:
                targets[cid] = n
    return targets


def regen_done_count(concept_id):
    f = OUT_REGEN / f"{concept_id}.json"
    if not f.exists():
        return 0
    try:
        return len(json.load(f.open(encoding="utf-8")))
    except Exception as e:
        print(f"  [UWAGA] uszkodzony regen {f.name}: {e} -> licze 0", file=sys.stderr)
        return 0

def pmbok_concepts():
    return [c for c in gq.load_concepts()
            if (c.get("source") or "pmbok").strip().lower() == "pmbok"]

def done_count(concept):
    f = OUT_PMBOK / f"{concept['concept_id']}.json"
    if not f.exists():
        return 0
    try:
        return len(json.load(f.open(encoding="utf-8")))
    except Exception as e:
        # NIE maskuj uszkodzenia jako 0 - to wczesniej ukrywalo przerwane/wspolbiezne
        # zapisy i raportowalo "0/N", choc plik mial czesc pytan. Glosno ostrzegaj.
        print(f"  [UWAGA] uszkodzony plik puli {f.name}: {e} -> licze jako 0; "
              f"odzysk: python tools/recover_from_logs.py --concepts {concept['concept_id']}",
              file=sys.stderr)
        return 0

def status():
    concepts = pmbok_concepts()
    target = sum(int(c["n_pytan_docelowo"]) for c in concepts)
    made = sum(done_count(c) for c in concepts)
    done_concepts = sum(1 for c in concepts if done_count(c) >= int(c["n_pytan_docelowo"]))
    print(f"[M3] koncepty: {done_concepts}/{len(concepts)} ukonczone | pytania: {made}/{target}")
    return made, target, done_concepts, len(concepts)

def regen_status(csv_path):
    targets = load_regen_targets(csv_path)
    made = {c: regen_done_count(c) for c in targets}
    done = sum(1 for c, n in targets.items() if made[c] >= n)
    total_t = sum(targets.values())
    total_m = sum(min(made[c], targets[c]) for c in targets)  # nie licz nadwyzki
    print(f"[REGEN] koncepty: {done}/{len(targets)} ukonczone | "
          f"pytania: {total_m}/{total_t} (cel z triage_regen.csv)")
    pend = [(c, targets[c] - made[c]) for c in targets if made[c] < targets[c]]
    if pend:
        pend.sort(key=lambda x: -x[1])
        print("[REGEN] do zrobienia (top 10): " +
              ", ".join(f"{c}:{n}" for c, n in pend[:10]))
    return total_m, total_t


def append_questions(concept_id, chunk_ids, arr, out_dir=OUT_PMBOK, regen=False):
    out_file = out_dir / f"{concept_id}.json"
    stamp = f"v2-{datetime.now().strftime('%Y-%m')}" + ("-regen" if regen else "")
    for q in arr:
        q.setdefault("source_concept", concept_id)
        q["generated_by"] = stamp
        q["review_status"] = "pending"
        q["_chunk_ids"] = chunk_ids
    with _write_lock:
        existing = json.load(out_file.open(encoding="utf-8")) if out_file.exists() else []
        existing.extend(arr)
        # Zapis ATOMOWY: najpierw .tmp w tym samym katalogu, potem os.replace.
        # Dzieki temu przerwanie procesu lub race nie zostawia obcietego/uszkodzonego
        # pliku puli - albo widac stara, kompletna wersje, albo nowa, kompletna.
        tmp = out_file.with_suffix(".json.tmp")
        tmp.write_text(json.dumps(existing, ensure_ascii=False, indent=2), encoding="utf-8")
        os.replace(tmp, out_file)
    return len(arr)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget", type=float, default=38.0)
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--eco", default=None)
    ap.add_argument("--model", default=gq.DEFAULT_MODEL)
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--regen", default=None,
                    help="tryb regeneracji celowanej: sciezka do triage_regen.csv "
                         "(concept_id,regen_total). Pisze do raw_batches/pmbok_regen/.")
    ap.add_argument("--overshoot", type=float, default=1.0,
                    help="mnoznik nadgeneracji w trybie --regen (np. 1.2 = +20%% na odpad recenzji)")
    ap.add_argument("--difficulty", default=None, choices=["easy", "medium", "hard"],
                    help="(tylko --regen) wymus poziom trudnosci - do dosrubowania udzialu hard (4.5)")
    args = ap.parse_args()
    if args.status:
        if args.regen:
            regen_status(args.regen)
        else:
            status()
        return

    OUT_PMBOK.mkdir(parents=True, exist_ok=True)
    RUNS.mkdir(exist_ok=True)
    env = gq.load_env()
    api_key = env.get("ANTHROPIC_API_KEY") or ""
    if not api_key:
        sys.exit("Brak ANTHROPIC_API_KEY w .env")

    chunks = gq.load_chunks()
    glossary = gq.load_glossary()
    system = (gq.PROMPTS / "system_prompt.txt").read_text(encoding="utf-8")
    template = (gq.PROMPTS / "user_prompt_template.txt").read_text(encoding="utf-8")
    fewshot = json.load((gq.PROMPTS / "fewshot.json").open(encoding="utf-8"))
    fewshot_text = json.dumps(fewshot, ensure_ascii=False, indent=2)
    system_block = gq.build_system_block(system, fewshot_text)

    concepts = pmbok_concepts()
    if args.eco:
        eco = {"people": "People", "process": "Process",
               "bizenv": "Business Environment"}.get(args.eco.lower(), args.eco)
        concepts = [c for c in concepts if c["eco_domain"] == eco]
    by_id = {c["concept_id"]: c for c in concepts}

    regen_mode = bool(args.regen)
    pending = []

    if regen_mode:
        OUT_REGEN.mkdir(parents=True, exist_ok=True)
        targets = load_regen_targets(args.regen)
        if not targets:
            print(f"[REGEN] brak celow w {args.regen}"); return
        unknown = [c for c in targets if c not in by_id]
        if unknown:
            print(f"[REGEN] UWAGA: {len(unknown)} konceptow z CSV spoza blueprintu "
                  f"(pomijam): {unknown[:5]}")
        import math
        for cid, want in targets.items():
            c = by_id.get(cid)
            if not c:
                continue
            want = int(math.ceil(want * args.overshoot))
            have = regen_done_count(cid)
            if have >= want:
                continue
            chunk_text, chunk_ids = gq.chunks_for_concept(c, chunks)
            gloss = gq.glossary_subset(c, glossary)
            temp = 0.3 if c["qtype_hint"] == "calculation" else 0.7
            remaining = want - have; bk = have // BATCH_SIZE
            while remaining > 0:
                n = min(BATCH_SIZE, remaining); bk += 1
                pending.append((c, chunk_text, chunk_ids, gloss, temp, n, bk))
                remaining -= n
        if not pending:
            print("[REGEN] nic do zrobienia - cele regeneracji osiagniete.")
            regen_status(args.regen); return
        print(f"[REGEN] do wygenerowania: {sum(j[5] for j in pending)} pytan "
              f"w {len({j[0]['concept_id'] for j in pending})} konceptach "
              f"(overshoot x{args.overshoot})")
    else:
        for c in concepts:
            target = int(c["n_pytan_docelowo"]); have = done_count(c)
            if have >= target:
                continue
            chunk_text, chunk_ids = gq.chunks_for_concept(c, chunks)
            gloss = gq.glossary_subset(c, glossary)
            temp = 0.3 if c["qtype_hint"] == "calculation" else 0.7
            remaining = target - have; bk = have // BATCH_SIZE
            while remaining > 0:
                n = min(BATCH_SIZE, remaining); bk += 1
                pending.append((c, chunk_text, chunk_ids, gloss, temp, n, bk))
                remaining -= n
        if not pending:
            print("[M3] nic do zrobienia - pula PMBOK kompletna."); status(); return

    def do_batch(job):
        c, chunk_text, chunk_ids, gloss, temp, n, bk = job
        user = gq.build_user_prompt(template, c, chunk_text, gloss, n)
        if regen_mode:
            # wstrzykniecie listy istniejacych scenariuszy + wymuszenie roznorodnosci
            user = user + "\n" + regen_instruction_block(c["concept_id"], args.difficulty)
        tag = f"{c['concept_id']}_b{bk}" + ("_regen" if regen_mode else "")
        raw=usage=None
        for attempt in range(4):
            try:
                raw, usage = gq.call_anthropic(api_key, args.model, temp, system_block, user, cache=True)
                break
            except Exception as e:
                if "429" in str(e) or "rate_limit" in str(e):
                    time.sleep(6*(attempt+1))
                    continue
                raise
        if raw is None:
            (RUNS / f"{tag}_{gq.now()}_ERROR.log").write_text(
                "rate-limited po 4 probach (brak odpowiedzi API)", encoding="utf-8")
            return ("err", tag, 0, "rate-limited po 4 probach")
        u = {"input": getattr(usage, "input_tokens", 0) or 0,
             "cache_create": getattr(usage, "cache_creation_input_tokens", 0) or 0,
             "cache_read": getattr(usage, "cache_read_input_tokens", 0) or 0,
             "output": getattr(usage, "output_tokens", 0) or 0}
        # ZAWSZE zapisz log z pelnym RAW (sukces I blad parsowania) - dzieki temu
        # recover_from_logs.py moze odzyskac pytania z batcha, ktory padl na json.loads,
        # bez ponownego placenia za API. Plik to zwykly .log (recover pomija tylko *ERROR*).
        log_path = RUNS / f"{tag}_{gq.now()}.log"
        log_path.write_text(
            f"MODEL={args.model} TEMP={temp} USAGE={u}\n\nUSER:\n{user}\n\nRAW:\n{raw}\n",
            encoding="utf-8")
        try:
            arr = gq.extract_json_array(raw)
            got = append_questions(c["concept_id"], chunk_ids, arr,
                                   out_dir=(OUT_REGEN if regen_mode else OUT_PMBOK),
                                   regen=regen_mode)
            return ("ok", tag, got, u)
        except Exception as e:
            # RAW juz zapisany w log_path -> odzyskiwalny. Dopisz notke o bledzie obok.
            (RUNS / f"{tag}_{gq.now()}_PARSEFAIL.log").write_text(
                f"PARSE FAILED: {e}\nRAW w: {log_path.name}\n", encoding="utf-8")
            return ("err", tag, 0, f"parse: {e} (RAW zapisany w {log_path.name})")

    t0 = time.time(); made = 0
    tok = {"input": 0, "cache_create": 0, "cache_read": 0, "output": 0}
    idx = 0
    with cf.ThreadPoolExecutor(max_workers=args.workers) as ex:
        while idx < len(pending) and time.time() - t0 < args.budget:
            wave = pending[idx: idx + args.workers]; idx += len(wave)
            for res in ex.map(do_batch, wave):
                kind, tag, got, info = res
                if kind == "ok":
                    made += got
                    for k in tok:
                        tok[k] += info[k]
                    print(f"  OK {tag}: +{got}")
                else:
                    print(f"  BLAD {tag}: {info}")
    label = "REGEN" if regen_mode else "M3"
    print(f"[{label}] slice: +{made} pytan | tok in={tok['input']} cache_w={tok['cache_create']} "
          f"cache_r={tok['cache_read']} out={tok['output']}")
    if regen_mode:
        regen_status(args.regen)
    else:
        status()

if __name__ == "__main__":
    main()
