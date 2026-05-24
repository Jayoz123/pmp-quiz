# -*- coding: utf-8 -*-
"""
Faza A (krok A.4) planu 13: blueprint pokrycia egzaminu -> corpus/concept_map.csv

To "kosciec" gwarantujacy, ze ~1000 pytan realnie pokrywa egzamin PMP, a nie
kleci sie wokol kilku tematow. Zrodlem podzialu jest PMP Examination Content
Outline (ECO): 3 domeny -> 35 zadan (People 14 / Process 17 / Business Env 4).
Do kazdego zadania dopisujemy konkretne pojecia/techniki do przetestowania,
mapujemy je na obszar wiedzy (ka_tag) oraz na strony PMBOK 8th ed (z prep_pmbok),
a nastepnie rozdzielamy KWOTY pytan tak, by sumy domen daly dokladnie 420/500/80.

Kolumny wyjsciowe (zgodnie z planem A.4, + pola pomocnicze dla Fazy B):
  concept_id, eco_domain, eco_task, eco_task_label_pl, ka_tag,
  koncept_PL, koncept_EN, qtype_hint, difficulty_hint, n_pytan_docelowo, pmbok_pages

Uruchomienie: python tools/build_concept_map.py
"""
import csv
import re
from collections import defaultdict
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CORPUS = REPO / "corpus"
OUT = CORPUS / "concept_map.csv"

# Docelowy rozklad wg wag egzaminu PMP (suma = 1000).
DOMAIN_TARGETS = {"People": 420, "Process": 500, "Business Environment": 80}
DOMAIN_OF = {"People": "People", "Process": "Process", "BizEnv": "Business Environment"}

# Dane: jeden koncept na linie, pola oddzielone '|':
#   task_id | task_label_pl | ka_tag | pmbok_pages | qtype | difficulty | koncept_PL | koncept_EN
DATA = """
People-1 | Zarzadzanie konfliktem | Ludzie | 250-321 | scenario | easy   | Zrodla i poziomy konfliktu | Sources and levels of conflict
People-1 | Zarzadzanie konfliktem | Ludzie | 250-321 | scenario | medium | Techniki rozwiazywania konfliktu (wspolpraca, kompromis, wymuszanie, lagodzenie, unikanie) | Conflict resolution techniques (collaborate, compromise, force, smooth, avoid)
People-1 | Zarzadzanie konfliktem | Ludzie | 250-321 | scenario | hard   | Dobor trybu rozwiazania konfliktu do sytuacji | Choosing the right conflict-handling mode
People-1 | Zarzadzanie konfliktem | Ludzie | 250-321 | scenario | medium | Przeksztalcanie konfliktu w wartosc | Turning conflict into a constructive outcome
People-2 | Przewodzenie zespolowi | Ludzie | 69-79 | scenario | medium | Przywodztwo sluzebne | Servant leadership
People-2 | Przewodzenie zespolowi | Ludzie | 69-79 | scenario | medium | Style przywodztwa (dyrektywny, wspierajacy, delegujacy) | Leadership styles
People-2 | Przewodzenie zespolowi | Ludzie | 69-79 | scenario | easy   | Wyznaczanie wizji i kierunku dla zespolu | Setting vision and direction
People-2 | Przewodzenie zespolowi | Ludzie | 250-321 | knowledge | medium | Motywowanie zespolu i teorie motywacji | Motivating the team and motivation theories
People-3 | Wspieranie wydajnosci zespolu | Ludzie | 184-196 | scenario | medium | Ocena wydajnosci i informacja zwrotna | Performance appraisal and feedback
People-3 | Wspieranie wydajnosci zespolu | Zasoby | 184-196 | knowledge | medium | Wskazniki wydajnosci zespolu | Team performance metrics
People-3 | Wspieranie wydajnosci zespolu | Ludzie | 184-196 | scenario | easy   | Rozwoj kompetencji czlonkow zespolu | Developing team member competencies
People-3 | Wspieranie wydajnosci zespolu | Zasoby | 184-196 | scenario | easy   | Uznanie i nagradzanie zespolu | Recognition and rewards
People-4 | Wzmacnianie zespolu i interesariuszy | Ludzie | 76-79 | scenario | medium | Delegowanie i poziomy decyzyjnosci | Delegation and decision authority
People-4 | Wzmacnianie zespolu i interesariuszy | Ludzie | 184-196 | scenario | medium | Zespoly samoorganizujace sie | Self-organizing teams
People-4 | Wzmacnianie zespolu i interesariuszy | Ludzie | 76-79 | scenario | easy   | Odpowiedzialnosc za zadania (ownership) | Task accountability and ownership
People-4 | Wzmacnianie zespolu i interesariuszy | Ludzie | 76-79 | scenario | medium | Budowanie zaufania i autonomii | Building trust and autonomy
People-5 | Zapewnienie przeszkolenia zespolu | Zasoby | 184-196 | scenario | medium | Analiza luk kompetencyjnych | Competency gap analysis
People-5 | Zapewnienie przeszkolenia zespolu | Zasoby | 184-196 | scenario | easy   | Planowanie szkolen i budzet na rozwoj | Training planning and development budget
People-5 | Zapewnienie przeszkolenia zespolu | Ludzie | 184-196 | knowledge | easy | Metody rozwoju (mentoring, coaching, szkolenia) | Development methods (mentoring, coaching, training)
People-5 | Zapewnienie przeszkolenia zespolu | Zasoby | 184-196 | scenario | medium | Walidacja efektow szkolen | Validating training effectiveness
People-6 | Budowanie zespolu | Ludzie | 184-196 | knowledge | medium | Etapy rozwoju zespolu (model Tuckmana) | Stages of team development (Tuckman)
People-6 | Budowanie zespolu | Zasoby | 184-196 | scenario | medium | Pozyskiwanie i dobor zespolu | Acquiring and selecting the team
People-6 | Budowanie zespolu | Zasoby | 184-196 | scenario | medium | Macierz RACI oraz role i odpowiedzialnosci | RACI matrix and roles & responsibilities
People-6 | Budowanie zespolu | Ludzie | 184-196 | scenario | easy   | Dzialania integrujace zespol (team building) | Team-building activities
People-7 | Usuwanie przeszkod i blokad | Ludzie | 184-196 | scenario | medium | Identyfikacja i priorytetyzacja przeszkod | Identifying and prioritizing impediments
People-7 | Usuwanie przeszkod i blokad | Proces | 184-196 | scenario | easy   | Rejestr przeszkod (impediment log) | Impediment log/backlog
People-7 | Usuwanie przeszkod i blokad | Ludzie | 184-196 | scenario | medium | Eskalacja blokad | Escalating blockers
People-7 | Usuwanie przeszkod i blokad | Ludzie | 184-196 | scenario | medium | Proaktywne zapobieganie przeszkodom | Preventing impediments proactively
People-8 | Negocjowanie porozumien projektowych | Ludzie | 250-321 | scenario | medium | Techniki negocjacji | Negotiation techniques
People-8 | Negocjowanie porozumien projektowych | Ludzie | 140-151 | scenario | medium | Negocjowanie zakresu i priorytetow | Negotiating scope and priorities
People-8 | Negocjowanie porozumien projektowych | Ludzie | 250-321 | knowledge | hard | BATNA i strefa mozliwego porozumienia (ZOPA) | BATNA and ZOPA
People-8 | Negocjowanie porozumien projektowych | Nabywanie | 350-359 | scenario | medium | Negocjacje z dostawcami i partnerami | Negotiating with vendors and partners
People-9 | Wspolpraca z interesariuszami | Interesariusz | 172-183 | scenario | medium | Analiza interesariuszy | Stakeholder analysis
People-9 | Wspolpraca z interesariuszami | Interesariusz | 172-183 | scenario | medium | Zarzadzanie zaangazowaniem interesariuszy | Managing stakeholder engagement
People-9 | Wspolpraca z interesariuszami | Interesariusz | 172-183 | knowledge | easy | Macierz wplywu i zainteresowania | Power-interest grid
People-9 | Wspolpraca z interesariuszami | Interesariusz | 172-183 | scenario | easy | Budowanie relacji z interesariuszami | Building stakeholder relationships
People-10 | Budowanie wspolnego zrozumienia | Ludzie | 172-183 | scenario | medium | Budowanie konsensusu | Building consensus
People-10 | Budowanie wspolnego zrozumienia | Komunikacja | 172-183 | scenario | easy | Komunikowanie wizji i celow | Communicating vision and goals
People-10 | Budowanie wspolnego zrozumienia | Ludzie | 172-183 | scenario | medium | Rozwiazywanie nieporozumien | Resolving misunderstandings
People-10 | Budowanie wspolnego zrozumienia | Ludzie | 172-183 | scenario | medium | Wspolne wypracowywanie celow | Co-creating goals with the team
People-11 | Angazowanie i wsparcie zespolow wirtualnych | Komunikacja | 184-196 | scenario | easy | Narzedzia wspolpracy zdalnej | Remote collaboration tools
People-11 | Angazowanie i wsparcie zespolow wirtualnych | Ludzie | 184-196 | scenario | medium | Wyzwania zespolow rozproszonych | Distributed team challenges
People-11 | Angazowanie i wsparcie zespolow wirtualnych | Ludzie | 184-196 | scenario | medium | Budowanie zaangazowania na odleglosc | Building engagement at a distance
People-11 | Angazowanie i wsparcie zespolow wirtualnych | Komunikacja | 184-196 | scenario | easy | Etykieta i normy komunikacji wirtualnej | Virtual communication etiquette
People-12 | Ustalanie zasad pracy zespolu | Zasoby | 184-196 | scenario | easy | Karta zespolu (team charter) | Team charter
People-12 | Ustalanie zasad pracy zespolu | Ludzie | 184-196 | scenario | medium | Normy i umowy o wspolpracy | Norms and working agreements
People-12 | Ustalanie zasad pracy zespolu | Ludzie | 184-196 | scenario | medium | Egzekwowanie zasad zespolu | Enforcing ground rules
People-12 | Ustalanie zasad pracy zespolu | Ludzie | 184-196 | scenario | easy | Aktualizacja zasad w trakcie projektu | Updating ground rules over time
People-13 | Mentoring interesariuszy | Ludzie | 250-321 | knowledge | easy | Mentoring a coaching | Mentoring vs coaching
People-13 | Mentoring interesariuszy | Ludzie | 184-196 | scenario | medium | Plan rozwoju i transfer wiedzy | Development plan and knowledge transfer
People-13 | Mentoring interesariuszy | Interesariusz | 172-183 | scenario | easy | Budowanie relacji mentorskich | Building mentoring relationships
People-13 | Mentoring interesariuszy | Ludzie | 184-196 | scenario | medium | Rozpoznawanie potrzeb rozwojowych | Identifying development needs
People-14 | Inteligencja emocjonalna | Ludzie | 250-321 | knowledge | medium | Skladowe inteligencji emocjonalnej | Components of emotional intelligence
People-14 | Inteligencja emocjonalna | Ludzie | 250-321 | scenario | medium | Samoswiadomosc i samoregulacja PM | PM self-awareness and self-regulation
People-14 | Inteligencja emocjonalna | Ludzie | 250-321 | scenario | medium | Empatia i odczytywanie nastroju zespolu | Empathy and reading team mood
People-14 | Inteligencja emocjonalna | Ludzie | 250-321 | scenario | hard | Zarzadzanie emocjami pod presja | Managing emotions under pressure
Process-1 | Dostarczanie wartosci biznesowej | Srodowisko biznesowe | 36-57 | scenario | medium | Priorytetyzacja wedlug wartosci biznesowej | Prioritizing by business value
Process-1 | Dostarczanie wartosci biznesowej | Proces | 80-97 | scenario | medium | MVP i przyrostowe dostarczanie wartosci | MVP and incremental value delivery
Process-1 | Dostarczanie wartosci biznesowej | Srodowisko biznesowe | 36-57 | knowledge | medium | Mierzenie dostarczonej wartosci | Measuring delivered value
Process-1 | Dostarczanie wartosci biznesowej | Proces | 80-97 | scenario | easy | Decyzje o tempie dostarczania (delivery cadence) | Delivery cadence decisions
Process-2 | Zarzadzanie komunikacja | Komunikacja | 172-183 | scenario | easy | Planowanie komunikacji | Communications planning
Process-2 | Zarzadzanie komunikacja | Komunikacja | 250-321 | calculation | medium | Liczba kanalow komunikacji (wzor n(n-1)/2) | Communication channels formula
Process-2 | Zarzadzanie komunikacja | Komunikacja | 172-183 | knowledge | medium | Metody i modele komunikacji | Communication methods and models
Process-2 | Zarzadzanie komunikacja | Komunikacja | 172-183 | scenario | medium | Zarzadzanie informacja dla interesariuszy | Managing information for stakeholders
Process-3 | Ocena i zarzadzanie ryzykiem | Ryzyko | 197-207 | scenario | easy | Identyfikacja ryzyk | Risk identification
Process-3 | Ocena i zarzadzanie ryzykiem | Ryzyko | 197-207 | scenario | medium | Jakosciowa analiza ryzyka (prawdopodobienstwo x wplyw) | Qualitative risk analysis
Process-3 | Ocena i zarzadzanie ryzykiem | Ryzyko | 197-207 | calculation | hard | Ilosciowa analiza ryzyka (EMV) | Quantitative risk analysis (EMV)
Process-3 | Ocena i zarzadzanie ryzykiem | Ryzyko | 197-207 | scenario | medium | Strategie reakcji na zagrozenia i szanse | Threat and opportunity response strategies
Process-3 | Ocena i zarzadzanie ryzykiem | Ryzyko | 163-171 | knowledge | medium | Rezerwy na ryzyko (kontyngencyjna a zarzadcza) | Risk reserves (contingency vs management)
Process-4 | Angazowanie interesariuszy | Interesariusz | 172-183 | scenario | easy | Rejestr interesariuszy | Stakeholder register
Process-4 | Angazowanie interesariuszy | Interesariusz | 172-183 | knowledge | medium | Macierz oceny zaangazowania | Engagement assessment matrix
Process-4 | Angazowanie interesariuszy | Interesariusz | 172-183 | scenario | medium | Strategie angazowania wedlug wplywu | Engagement strategies by influence
Process-5 | Planowanie i zarzadzanie budzetem i zasobami | Koszt | 163-171 | knowledge | medium | Szacowanie kosztow (analogiczne, parametryczne, oddolne) | Cost estimating (analogous, parametric, bottom-up)
Process-5 | Planowanie i zarzadzanie budzetem i zasobami | Koszt | 163-171 | scenario | medium | Budzetowanie i baza kosztowa | Budgeting and cost baseline
Process-5 | Planowanie i zarzadzanie budzetem i zasobami | Koszt | 250-321 | calculation | hard | Wartosc wypracowana: CPI i CV | Earned value: CPI and CV
Process-5 | Planowanie i zarzadzanie budzetem i zasobami | Koszt | 250-321 | calculation | hard | Prognozy EAC, ETC i VAC | Forecasting EAC, ETC and VAC
Process-5 | Planowanie i zarzadzanie budzetem i zasobami | Zasoby | 184-196 | scenario | medium | Planowanie i wyrownywanie zasobow | Resource planning and leveling
Process-6 | Planowanie i zarzadzanie harmonogramem | Harmonogram | 152-162 | scenario | easy | Definiowanie i sekwencjonowanie dzialan | Defining and sequencing activities
Process-6 | Planowanie i zarzadzanie harmonogramem | Harmonogram | 250-321 | calculation | hard | Metoda sciezki krytycznej i zapas czasu | Critical path method and float
Process-6 | Planowanie i zarzadzanie harmonogramem | Harmonogram | 250-321 | calculation | medium | Szacowanie czasu trwania (PERT) | Duration estimating (PERT)
Process-6 | Planowanie i zarzadzanie harmonogramem | Harmonogram | 152-162 | scenario | medium | Kompresja harmonogramu (crashing, fast-tracking) | Schedule compression (crashing, fast-tracking)
Process-6 | Planowanie i zarzadzanie harmonogramem | Harmonogram | 80-97 | knowledge | medium | Planowanie zwinne (story points, velocity) | Agile scheduling (story points, velocity)
Process-7 | Planowanie i zarzadzanie jakoscia | Jakosc | 66-68 | knowledge | medium | Planowanie jakosci i koszt jakosci | Quality planning and cost of quality
Process-7 | Planowanie i zarzadzanie jakoscia | Jakosc | 66-68 | scenario | medium | Zapewnienie jakosci a kontrola jakosci | Quality assurance vs quality control
Process-7 | Planowanie i zarzadzanie jakoscia | Jakosc | 250-321 | knowledge | medium | Narzedzia kontroli jakosci | Quality control tools
Process-7 | Planowanie i zarzadzanie jakoscia | Jakosc | 66-68 | scenario | easy | Ciagle doskonalenie (PDCA, Kaizen) | Continuous improvement (PDCA, Kaizen)
Process-8 | Planowanie i zarzadzanie zakresem | Zakres | 140-151 | scenario | easy | Zbieranie wymagan | Collecting requirements
Process-8 | Planowanie i zarzadzanie zakresem | Zakres | 140-151 | knowledge | medium | Struktura podzialu prac (WBS) | Work breakdown structure (WBS)
Process-8 | Planowanie i zarzadzanie zakresem | Zakres | 140-151 | scenario | medium | Definiowanie zakresu i kryteria akceptacji | Defining scope and acceptance criteria
Process-8 | Planowanie i zarzadzanie zakresem | Zakres | 140-151 | scenario | medium | Backlog produktu i jego pielegnacja | Product backlog and refinement
Process-8 | Planowanie i zarzadzanie zakresem | Zakres | 140-151 | scenario | medium | Walidacja i kontrola zakresu (scope creep) | Validate and control scope (scope creep)
Process-9 | Integracja dzialan planistycznych | Integracja | 115-139 | scenario | easy | Karta projektu | Project charter
Process-9 | Integracja dzialan planistycznych | Integracja | 115-139 | scenario | medium | Plan zarzadzania projektem | Project management plan
Process-9 | Integracja dzialan planistycznych | Integracja | 115-139 | scenario | medium | Integracja planow czastkowych | Integrating subsidiary plans
Process-10 | Zarzadzanie zmianami w projekcie | Integracja | 115-139 | scenario | medium | Zintegrowana kontrola zmian | Integrated change control
Process-10 | Zarzadzanie zmianami w projekcie | Integracja | 115-139 | knowledge | easy | Komisja ds. zmian (CCB) | Change control board
Process-10 | Zarzadzanie zmianami w projekcie | Integracja | 115-139 | scenario | medium | Ocena wplywu zmiany | Assessing change impact
Process-10 | Zarzadzanie zmianami w projekcie | Proces | 80-97 | scenario | medium | Zarzadzanie zmiana w podejsciu zwinnym | Managing change in agile
Process-11 | Planowanie i zarzadzanie zaopatrzeniem | Nabywanie | 350-359 | scenario | medium | Analiza wykonac czy kupic (make-or-buy) | Make-or-buy analysis
Process-11 | Planowanie i zarzadzanie zaopatrzeniem | Nabywanie | 350-359 | knowledge | hard | Typy umow i podzial ryzyka | Contract types and risk allocation
Process-11 | Planowanie i zarzadzanie zaopatrzeniem | Nabywanie | 350-359 | scenario | medium | Proces przetargowy i wybor dostawcy | Bid process and source selection
Process-11 | Planowanie i zarzadzanie zaopatrzeniem | Nabywanie | 350-359 | scenario | medium | Administrowanie umowa i roszczenia | Contract administration and claims
Process-12 | Zarzadzanie artefaktami projektu | Proces | 218-249 | knowledge | medium | Zarzadzanie konfiguracja | Configuration management
Process-12 | Zarzadzanie artefaktami projektu | Proces | 218-249 | scenario | easy | Wersjonowanie i dostepnosc artefaktow | Versioning and accessibility of artifacts
Process-12 | Zarzadzanie artefaktami projektu | Proces | 218-249 | knowledge | easy | Rejestry i logi projektu | Project registers and logs
Process-13 | Dobor metodyki i praktyk | Proces | 80-97 | scenario | medium | Predykcyjne, adaptacyjne i hybrydowe | Predictive, adaptive and hybrid
Process-13 | Dobor metodyki i praktyk | Proces | 80-97 | scenario | medium | Dobor podejscia do projektu | Selecting the development approach
Process-13 | Dobor metodyki i praktyk | Proces | 208-217 | scenario | hard | Tailoring procesow i artefaktow | Tailoring processes and artifacts
Process-13 | Dobor metodyki i praktyk | Proces | 80-97 | knowledge | medium | Ramy zwinne (Scrum, Kanban) | Agile frameworks (Scrum, Kanban)
Process-14 | Ustanowienie nadzoru projektowego | Integracja | 115-139 | knowledge | medium | Modele nadzoru (governance) projektu | Project governance models
Process-14 | Ustanowienie nadzoru projektowego | Integracja | 115-139 | scenario | medium | Bramki decyzyjne (phase gates) | Decision/phase gates
Process-14 | Ustanowienie nadzoru projektowego | Integracja | 115-139 | scenario | medium | Metryki i mechanizmy nadzoru | Governance metrics and mechanisms
Process-15 | Zarzadzanie problemami | Proces | 218-249 | scenario | easy | Rejestr problemow (issue log) | Issue log
Process-15 | Zarzadzanie problemami | Proces | 250-321 | scenario | medium | Analiza przyczyn zrodlowych (RCA) | Root cause analysis
Process-15 | Zarzadzanie problemami | Proces | 218-249 | scenario | medium | Eskalacja i rozwiazywanie problemow | Escalation and issue resolution
Process-16 | Zapewnienie transferu wiedzy | Proces | 36-57 | scenario | easy | Wnioski z projektu (lessons learned) | Lessons learned
Process-16 | Zapewnienie transferu wiedzy | Proces | 36-57 | knowledge | medium | Zarzadzanie wiedza jawna i ukryta | Managing explicit and tacit knowledge
Process-16 | Zapewnienie transferu wiedzy | Proces | 36-57 | knowledge | easy | Repozytoria wiedzy organizacji | Organizational knowledge repositories
Process-17 | Zarzadzanie zamknieciem i przejsciami | Proces | 80-97 | scenario | medium | Zamkniecie projektu lub fazy | Closing the project or phase
Process-17 | Zarzadzanie zamknieciem i przejsciami | Proces | 80-97 | scenario | medium | Przekazanie produktu i kryteria przejscia | Product handover and transition criteria
Process-17 | Zarzadzanie zamknieciem i przejsciami | Proces | 218-249 | scenario | easy | Zwolnienie zasobow i archiwizacja | Releasing resources and archiving
BizEnv-1 | Planowanie i zarzadzanie zgodnoscia | Srodowisko biznesowe | 342-349 | scenario | medium | Identyfikacja wymagan zgodnosci | Identifying compliance requirements
BizEnv-1 | Planowanie i zarzadzanie zgodnoscia | Srodowisko biznesowe | 350-359 | knowledge | medium | Klasyfikacja i priorytety zgodnosci | Compliance categories and priorities
BizEnv-1 | Planowanie i zarzadzanie zgodnoscia | Srodowisko biznesowe | 197-207 | scenario | medium | Ryzyka braku zgodnosci i audyty | Compliance risks and audits
BizEnv-2 | Ocena i dostarczanie korzysci i wartosci | Srodowisko biznesowe | 36-57 | scenario | medium | Uzasadnienie biznesowe (business case) | Business case
BizEnv-2 | Ocena i dostarczanie korzysci i wartosci | Srodowisko biznesowe | 36-57 | scenario | medium | Plan realizacji korzysci | Benefits realization plan
BizEnv-2 | Ocena i dostarczanie korzysci i wartosci | Srodowisko biznesowe | 163-171 | calculation | hard | Wskazniki wartosci (ROI, NPV, IRR, okres zwrotu) | Value metrics (ROI, NPV, IRR, payback)
BizEnv-3 | Ocena zmian otoczenia zewnetrznego | Srodowisko biznesowe | 36-57 | knowledge | easy | Czynniki srodowiskowe przedsiebiorstwa (EEF) | Enterprise environmental factors
BizEnv-3 | Ocena zmian otoczenia zewnetrznego | Srodowisko biznesowe | 36-57 | scenario | medium | Monitorowanie otoczenia zewnetrznego | Monitoring the external environment
BizEnv-3 | Ocena zmian otoczenia zewnetrznego | Srodowisko biznesowe | 140-151 | scenario | medium | Wplyw zmian otoczenia na zakres | Impact of environment changes on scope
BizEnv-4 | Wspieranie zmiany organizacyjnej | Srodowisko biznesowe | 36-57 | scenario | medium | Zarzadzanie zmiana organizacyjna | Organizational change management
BizEnv-4 | Wspieranie zmiany organizacyjnej | Ludzie | 69-79 | scenario | medium | Gotowosc na zmiane i opor | Change readiness and resistance
BizEnv-4 | Wspieranie zmiany organizacyjnej | Srodowisko biznesowe | 36-57 | scenario | easy | Rola PM we wdrazaniu zmiany | PM role in driving change
"""


def slugify(text: str) -> str:
    text = text.lower()
    repl = {"a": "aąâ", "c": "cć", "e": "eęê", "l": "lł", "n": "nń",
            "o": "oóô", "s": "sś", "z": "zźż"}
    rev = {ch: base for base, group in repl.items() for ch in group}
    text = "".join(rev.get(ch, ch) for ch in text)
    text = re.sub(r"[^a-z0-9]+", "-", text).strip("-")
    return text[:48]


def parse_rows():
    rows = []
    for line in DATA.strip().splitlines():
        if not line.strip():
            continue
        parts = [p.strip() for p in line.split("|")]
        task_id, task_label, ka, pages, qtype, diff, kpl, ken = parts
        dom_key = task_id.split("-")[0]
        rows.append({
            "eco_domain": DOMAIN_OF[dom_key],
            "eco_task": task_id,
            "eco_task_label_pl": task_label,
            "ka_tag": ka,
            "pmbok_pages": pages,
            "qtype_hint": qtype,
            "difficulty_hint": diff,
            "koncept_PL": kpl,
            "koncept_EN": ken,
        })
    return rows


def allocate_quotas(rows):
    """Rozdziela DOMAIN_TARGETS na koncepty per domena (rowno + reszta do pierwszych)."""
    by_dom = defaultdict(list)
    for r in rows:
        by_dom[r["eco_domain"]].append(r)
    for dom, target in DOMAIN_TARGETS.items():
        group = by_dom[dom]
        n = len(group)
        base, rem = divmod(target, n)
        for i, r in enumerate(group):
            r["n_pytan_docelowo"] = base + (1 if i < rem else 0)


def main():
    CORPUS.mkdir(exist_ok=True)
    rows = parse_rows()
    allocate_quotas(rows)

    # unikalne concept_id
    seen = {}
    for r in rows:
        base = slugify(r["koncept_EN"])
        cid = base
        k = 2
        while cid in seen:
            cid = f"{base}-{k}"
            k += 1
        seen[cid] = True
        r["concept_id"] = cid

    cols = ["concept_id", "eco_domain", "eco_task", "eco_task_label_pl", "ka_tag",
            "koncept_PL", "koncept_EN", "qtype_hint", "difficulty_hint",
            "n_pytan_docelowo", "pmbok_pages"]
    with OUT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow({c: r[c] for c in cols})

    total = sum(r["n_pytan_docelowo"] for r in rows)
    print(f"Zapisano {OUT.relative_to(REPO)}")
    print(f"Konceptow: {len(rows)} | suma kwot pytan: {total}")
    for dom in DOMAIN_TARGETS:
        grp = [r for r in rows if r["eco_domain"] == dom]
        s = sum(r["n_pytan_docelowo"] for r in grp)
        print(f"  {dom:22}: {len(grp):3} konceptow -> {s} pytan ({100*s/total:.0f}%)")
    from collections import Counter
    print("  wg ka_tag:", dict(Counter(r["ka_tag"] for r in rows)))
    print("  wg qtype :", dict(Counter(r["qtype_hint"] for r in rows)))
    print("  wg diff  :", dict(Counter(r["difficulty_hint"] for r in rows)))


if __name__ == "__main__":
    main()
