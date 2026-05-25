# -*- coding: utf-8 -*-
"""
Faza B planu 13: generowanie autorskich pytan PMP sterowane blueprintem.

Petla po konceptach z corpus/concept_map.csv: dla kazdego konceptu wstrzykuje
WLASCIWY chunk PMBOK + opis konceptu ECO + podzbior glosariusza + few-shot, po czym
generuje male partie (5-8) pytan przez API. Zapisuje surowe partie do out/raw_batches/.

Klucz API czytany z .env (ANTHROPIC_API_KEY). Tryb --dry-run sklada i zapisuje DOKLADNE
prompty (bez wywolania API i bez kosztow) - sluzy do kalibracji w M1.

OPTYMALIZACJA TOKENOW (przed M3, na podstawie M2):
  - batch-size domyslnie 7 (bylo 5): wiekszosc konceptow PMBOK (kwoty 6-8) miesci sie
    w 1 batchu zamiast 2 -> mniej powtarzanego kontekstu (chunk PMBOK ~2600 slow nie
    leci dwa razy). M3 PMBOK: 266 batchy (bs=5) -> 206 batchy (bs=7).
  - prompt caching (domyslnie ON, wylacz przez --no-cache): STALY prefiks system + few-shot
    (identyczny dla KAZDEGO batcha, ~1.9k tok) dostaje cache_control 'ephemeral'. Anthropic
    liczy go ~90% taniej (cache_read) w kolejnych batchach. Few-shot przeniesiony z konca
    user prompta do stalego prefiksu, by caly prefiks dalo sie cache'owac.
  - log USAGE w runs/*.log + podsumowanie tokenow (input/cache_write/cache_read/output).

Pilotaz M1 (rodzina Ryzyko, ~50 pytan):
  python tools/generate_questions.py --eco-task Process-3 --per-concept 10 --batch-size 5 --dry-run
  python tools/generate_questions.py --eco-task Process-3 --per-concept 10 --batch-size 5

Zaleznosci: anthropic>=0.69 (tylko dla realnego wywolania; --dry-run nie wymaga).
  Caching wymaga SDK >=0.69 (format bloku system z cache_control); zweryfikowane na 0.104.1.
"""
import argparse
import csv
import json
import math
import re
import sys
import time
from datetime import datetime, timezone
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CORPUS = REPO / "corpus"
PROMPTS = REPO / "tools" / "prompts"
OUT_BATCHES = REPO / "out" / "raw_batches"
OUT_DRYRUN = REPO / "out" / "dry_run"
RUNS = REPO / "runs"

DEFAULT_MODEL = "claude-sonnet-4-6"   # silny model; mozna nadpisac --model (np. claude-opus-4-6)
MAX_TOKENS = 4096
CHUNK_WORD_BUDGET = 2600              # ile slow kontekstu PMBOK max wstrzykujemy
GLOSSARY_MAX = 34
# Rdzen glosariusza zawsze wstrzykiwany (spojnosc podstawowych terminow):
GLOSSARY_CORE = {"project manager", "stakeholder", "project charter", "risk",
                 "risk register", "scope", "schedule", "cost"}


# ---------- ladowanie zasobow ----------
def load_env():
    env = {}
    p = REPO / ".env"
    if p.exists():
        for line in p.read_text(encoding="utf-8").splitlines():
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


def load_concepts():
    with (CORPUS / "concept_map.csv").open(encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def load_chunks():
    """Wczytuje OBA korpusy: PMBOK + Agile. Kazdemu chunkowi nadaje pole 'source'
    ('pmbok'|'agile') wg prefiksu chunk_id, by chunks_for_concept() mogl trafic do
    wlasciwego zrodla (strony 16-153 wystepuja w obu PDF-ach)."""
    out = []
    for fname, src in (("pmbok_chunks.jsonl", "pmbok"), ("agile_chunks.jsonl", "agile")):
        path = CORPUS / fname
        if not path.exists():               # Agile opcjonalny (pula zwinna)
            continue
        for line in path.open(encoding="utf-8"):
            c = json.loads(line)
            c["source"] = "agile" if c["chunk_id"].startswith("agile-") else "pmbok"
            out.append(c)
    return out


def load_glossary():
    with (CORPUS / "glossary_pl_en.csv").open(encoding="utf-8-sig") as f:
        return list(csv.DictReader(f))


def parse_range(s):
    a, b = s.split("-")
    return int(a), int(b)


def chunks_for_concept(concept, chunks):
    lo, hi = parse_range(concept["pmbok_pages"])
    ka = concept["ka_tag"]
    # Zrodlo konceptu: kolumna 'source' z concept_map (brak/puste => 'pmbok' dla
    # wstecznej zgodnosci). Dobieramy chunki TYLKO z tego korpusu - strony 16-153
    # wystepuja w obu PDF-ach, wiec sam zakres stron nie wystarcza.
    src = (concept.get("source") or "pmbok").strip().lower()
    label = "AGILE" if src == "agile" else "PMBOK"
    scored = []
    for c in chunks:
        if c.get("source", "pmbok") != src:     # tylko wlasciwy korpus
            continue
        clo, chi = c["pages"][0], c["pages"][1]
        if chi < lo or clo > hi:        # brak nakladki stron
            continue
        overlap = min(chi, hi) - max(clo, lo) + 1
        score = overlap + (5 if c["ka_tag"] == ka else 0)
        scored.append((score, c))
    scored.sort(key=lambda x: -x[0])
    picked, words = [], 0
    for _, c in scored:
        w = len(c["text"].split())
        if picked and words + w > CHUNK_WORD_BUDGET:
            break
        picked.append(c)
        words += w
        if words >= CHUNK_WORD_BUDGET:
            break
    if not picked and scored:
        picked = [scored[0][1]]
    text = "\n\n".join(f"[{label} s.{c['pages'][0]}-{c['pages'][1]}, {c['section']}]\n{c['text']}"
                       for c in picked)
    return text[:CHUNK_WORD_BUDGET * 8], [c["chunk_id"] for c in picked]


def glossary_subset(concept, glossary):
    ka = concept["ka_tag"]
    rows = [g for g in glossary if g["category"] == ka]
    rows += [g for g in glossary if g["term_en"].lower() in GLOSSARY_CORE
             and g not in rows]
    out = []
    for g in rows[:GLOSSARY_MAX]:
        alt = f" (alt: {g['term_pl_alt']})" if g["term_pl_alt"] else ""
        out.append(f"- {g['term_pl']}{alt} <-> {g['term_en']}")
    return "\n".join(out)


def fill_template(tpl, mapping):
    for k, v in mapping.items():
        tpl = tpl.replace("{{" + k + "}}", str(v))
    return tpl


def build_system_block(system, fewshot_text):
    """Sklada STALY prefiks (system prompt + few-shot) - identyczny dla KAZDEGO batcha.
    Few-shot byl wczesniej doklejany na koncu user prompta (po zmiennym chunku), co
    uniemozliwialo cache - teraz jest czescia stalego prefiksu, wiec caleyprefiks da sie
    cache'owac (cache_control w call_anthropic)."""
    return (system
            + "\n\nPRZYKLADY STYLU I FORMATU (wlasne, autorskie - NASLADUJ format/poziom, "
              "NIE kopiuj tresci):\n" + fewshot_text)


def build_user_prompt(template, concept, chunk_text, gloss, n):
    mapping = {
        "eco_domain": concept["eco_domain"],
        "eco_task": concept["eco_task"],
        "eco_task_label_pl": concept["eco_task_label_pl"],
        "ka_tag": concept["ka_tag"],
        "koncept_pl": concept["koncept_PL"],
        "koncept_en": concept["koncept_EN"],
        "difficulty": concept["difficulty_hint"],
        "qtype": concept["qtype_hint"],
        "source_concept": concept["concept_id"],
        "pmbok_chunk_text": chunk_text,
        "glossary_subset": gloss,
        "N": n,
    }
    return fill_template(template, mapping)


# ---------- parsowanie odpowiedzi modelu ----------
def extract_json_array(text):
    text = text.strip()
    text = re.sub(r"^```(?:json)?\s*|\s*```$", "", text, flags=re.IGNORECASE | re.MULTILINE)
    start = text.find("[")
    end = text.rfind("]")
    if start == -1 or end == -1 or end <= start:
        raise ValueError("brak tablicy JSON w odpowiedzi")
    return json.loads(text[start:end + 1])


# ---------- wywolanie API ----------
def call_anthropic(api_key, model, temperature, system_block, user, cache=True):
    """system_block = STALY prefiks (system + few-shot), identyczny dla wszystkich batchow.
    Z cache=True dostaje cache_control 'ephemeral' -> Anthropic cache'uje ten prefiks i
    przy kolejnych batchach liczy go ~90% taniej (cache_read zamiast pelnego inputu).
    Cache zyje ~5 min, wiec dziala dla serii batchow tego samego i kolejnych konceptow."""
    import anthropic  # lazy import - tylko gdy realne wywolanie
    client = anthropic.Anthropic(api_key=api_key)
    if cache:
        system = [{"type": "text", "text": system_block,
                   "cache_control": {"type": "ephemeral"}}]
    else:
        system = system_block
    resp = client.messages.create(
        model=model, max_tokens=MAX_TOKENS, temperature=temperature,
        system=system, messages=[{"role": "user", "content": user}],
    )
    usage = getattr(resp, "usage", None)
    text = "".join(b.text for b in resp.content if getattr(b, "type", "") == "text")
    return text, usage


def now():
    return datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")


def main():
    ap = argparse.ArgumentParser(description="Faza B - generowanie pytan PMP")
    ap.add_argument("--eco-task", default="Process-3", help="filtr po ECO zadaniu (np. Process-3)")
    ap.add_argument("--concept-id", default=None, help="pojedynczy concept_id (zamiast --eco-task)")
    ap.add_argument("--per-concept", type=int, default=None,
                    help="ile pytan na koncept (domyslnie = n_pytan_docelowo z blueprintu)")
    ap.add_argument("--batch-size", type=int, default=7)
    ap.add_argument("--model", default=DEFAULT_MODEL)
    ap.add_argument("--temperature", type=float, default=None,
                    help="domyslnie 0.3 dla calculation, 0.7 dla reszty")
    ap.add_argument("--dry-run", action="store_true", help="skladaj i zapisz prompty, BEZ API")
    ap.add_argument("--force", action="store_true", help="nadpisz istniejace partie")
    ap.add_argument("--no-cache", action="store_true",
                    help="wylacz prompt caching stalego prefiksu (domyslnie wlaczony)")
    args = ap.parse_args()

    concepts = load_concepts()
    if args.concept_id:
        concepts = [c for c in concepts if c["concept_id"] == args.concept_id]
    else:
        concepts = [c for c in concepts if c["eco_task"] == args.eco_task]
    if not concepts:
        sys.exit("Brak konceptow dla podanego filtra.")

    chunks = load_chunks()
    glossary = load_glossary()
    system = (PROMPTS / "system_prompt.txt").read_text(encoding="utf-8")
    template = (PROMPTS / "user_prompt_template.txt").read_text(encoding="utf-8")
    fewshot = json.load((PROMPTS / "fewshot.json").open(encoding="utf-8"))
    fewshot_text = json.dumps(fewshot, ensure_ascii=False, indent=2)
    # STALY prefiks (system + few-shot) - identyczny dla KAZDEGO batcha => cache'owalny.
    system_block = build_system_block(system, fewshot_text)
    use_cache = not args.no_cache

    env = load_env()
    api_key = env.get("ANTHROPIC_API_KEY") or ""
    if not args.dry_run and not api_key:
        sys.exit("Brak ANTHROPIC_API_KEY w .env (lub uzyj --dry-run).")

    OUT_BATCHES.mkdir(parents=True, exist_ok=True)
    OUT_DRYRUN.mkdir(parents=True, exist_ok=True)
    RUNS.mkdir(exist_ok=True)

    total_target = 0
    total_made = 0
    usage_tot = {"input": 0, "cache_create": 0, "cache_read": 0, "output": 0}
    cache_note = "cache ON" if use_cache else "cache OFF"
    print(f"[B] Koncepty: {len(concepts)} (filtr: {args.concept_id or args.eco_task}) | "
          f"tryb: {'DRY-RUN' if args.dry_run else 'API '+args.model} | batch={args.batch_size} | "
          f"{cache_note}")

    for c in concepts:
        per = args.per_concept if args.per_concept else int(c["n_pytan_docelowo"])
        n_batches = math.ceil(per / args.batch_size)
        chunk_text, chunk_ids = chunks_for_concept(c, chunks)
        gloss = glossary_subset(c, glossary)
        temp = args.temperature
        if temp is None:
            temp = 0.3 if c["qtype_hint"] == "calculation" else 0.7

        for b in range(n_batches):
            n = min(args.batch_size, per - b * args.batch_size)
            if n <= 0:
                break
            total_target += n
            user = build_user_prompt(template, c, chunk_text, gloss, n)
            tag = f"{c['concept_id']}_b{b+1}"

            if args.dry_run:
                # SYSTEM = staly, cache'owalny prefiks (system + few-shot); USER = zmienna czesc.
                (OUT_DRYRUN / f"{tag}.txt").write_text(
                    f"==== SYSTEM (staly prefiks, cache'owalny) ====\n{system_block}\n\n"
                    f"==== USER (zmienna czesc) ====\n{user}\n",
                    encoding="utf-8")
                continue

            out_file = OUT_BATCHES / f"{tag}.json"
            if out_file.exists() and not args.force:
                print(f"  pomijam (istnieje): {tag}")
                arr = json.load(out_file.open(encoding="utf-8"))
                total_made += len(arr)
                continue
            try:
                raw, usage = call_anthropic(api_key, args.model, temp, system_block,
                                            user, cache=use_cache)
                arr = extract_json_array(raw)
                stamp = f"v2-{datetime.now().strftime('%Y-%m')}"
                for q in arr:
                    q.setdefault("source_concept", c["concept_id"])
                    q["generated_by"] = stamp
                    q["review_status"] = "pending"
                    q["_chunk_ids"] = chunk_ids
                out_file.write_text(json.dumps(arr, ensure_ascii=False, indent=2),
                                    encoding="utf-8")
                u = {"input": getattr(usage, "input_tokens", 0) or 0,
                     "cache_create": getattr(usage, "cache_creation_input_tokens", 0) or 0,
                     "cache_read": getattr(usage, "cache_read_input_tokens", 0) or 0,
                     "output": getattr(usage, "output_tokens", 0) or 0}
                for k in usage_tot:
                    usage_tot[k] += u[k]
                (RUNS / f"{tag}_{now()}.log").write_text(
                    f"MODEL={args.model} TEMP={temp} USAGE={u}\n\nUSER:\n{user}\n\nRAW:\n{raw}\n",
                    encoding="utf-8")
                total_made += len(arr)
                print(f"  OK {tag}: {len(arr)} pytan | tok in={u['input']} "
                      f"cache_w={u['cache_create']} cache_r={u['cache_read']} out={u['output']}")
            except Exception as e:
                print(f"  BLAD {tag}: {e}")
                (RUNS / f"{tag}_{now()}_ERROR.log").write_text(str(e), encoding="utf-8")
            time.sleep(0.5)

    if args.dry_run:
        print(f"[B] DRY-RUN: zapisano {total_target} promptow do {OUT_DRYRUN.relative_to(REPO)} "
              f"(cel pytan: {total_target})")
    else:
        print(f"[B] Wygenerowano ~{total_made} pytan (cel: {total_target}) -> "
              f"{OUT_BATCHES.relative_to(REPO)}")
        print(f"[B] Tokeny lacznie: input={usage_tot['input']} "
              f"cache_write={usage_tot['cache_create']} cache_read={usage_tot['cache_read']} "
              f"output={usage_tot['output']}")
        billed = usage_tot["cache_read"]
        if billed:
            # cache_read liczone ~0.1x ceny inputu -> pokaz ile "swiezego" inputu zaoszczedzono
            print(f"[B] Cache: {billed} tokenow odczytanych z cache (~90% taniej niz swiezy input)")


if __name__ == "__main__":
    main()
