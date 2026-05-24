# -*- coding: utf-8 -*-
"""
Faza A (krok A.5) planu 13: glosariusz terminologii PL <-> EN -> corpus/glossary_pl_en.csv

Spojne tlumaczenia terminow PMP, wstrzykiwane do KAZDEGO promptu generujacego
("trzymaj sie tych tlumaczen") - klucz do jakosci dwujezycznosci. Glosariusz jest
kuratorowany (gwarancja poprawnosci), a jednoczesnie ZASILANY istniejacymi 990
pytaniami: dla kazdego terminu liczymy jego czestosc wystapien w korpusie pytan
(PL i EN) - to potwierdza ciaglosc stylu i wskazuje terminy najczesciej uzywane.

Kolumny: term_en, term_pl, term_pl_alt (forma alternatywna / czesto pozostawiana
po angielsku), category (ka_tag), freq_pl, freq_en

Uruchomienie: python tools/build_glossary.py
"""
import csv
import json
import re
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CORPUS = REPO / "corpus"
QUESTIONS = REPO / "pmp-quiz-app" / "questions.json"
OUT = CORPUS / "glossary_pl_en.csv"

# Kuratorowany glosariusz: term_en | term_pl | term_pl_alt | category
TERMS = """
project manager | kierownik projektu | PM | Ogolny
project sponsor | sponsor projektu | sponsor | Ogolny
stakeholder | interesariusz |  | Interesariusz
project team | zespol projektowy |  | Zasoby
product owner | wlasciciel produktu | product owner | Proces
scrum master | scrum master |  | Proces
project charter | karta projektu |  | Integracja
business case | uzasadnienie biznesowe |  | Srodowisko biznesowe
project management plan | plan zarzadzania projektem |  | Integracja
baseline | linia bazowa | baseline | Integracja
milestone | kamien milowy |  | Harmonogram
deliverable | produkt czastkowy | rezultat | Zakres
assumption | zalozenie |  | Ogolny
constraint | ograniczenie |  | Ogolny
scope | zakres |  | Zakres
scope creep | pelzanie zakresu | scope creep | Zakres
work breakdown structure | struktura podzialu prac | WBS | Zakres
requirements | wymagania |  | Zakres
acceptance criteria | kryteria akceptacji |  | Zakres
product backlog | backlog produktu | rejestr produktu | Zakres
definition of done | definicja ukonczenia | DoD | Zakres
validate scope | walidacja zakresu |  | Zakres
gold plating | nadmiarowe wzbogacanie | gold plating | Zakres
schedule | harmonogram |  | Harmonogram
critical path | sciezka krytyczna |  | Harmonogram
float | zapas czasu | luz | Harmonogram
fast-tracking | przyspieszanie | fast-tracking | Harmonogram
crashing | kompresja zasobami | crashing | Harmonogram
lead | wyprzedzenie | lead | Harmonogram
lag | opoznienie | lag | Harmonogram
velocity | predkosc zespolu | velocity | Harmonogram
story point | punkt historyjki | story point | Harmonogram
duration | czas trwania |  | Harmonogram
cost | koszt |  | Koszt
budget | budzet |  | Koszt
cost baseline | bazowy plan kosztow |  | Koszt
earned value | wartosc wypracowana | EV | Koszt
planned value | wartosc planowana | PV | Koszt
actual cost | koszt rzeczywisty | AC | Koszt
cost performance index | wskaznik wydajnosci kosztowej | CPI | Koszt
schedule performance index | wskaznik wydajnosci harmonogramu | SPI | Koszt
estimate at completion | szacowany koszt koncowy | EAC | Koszt
estimate to complete | szacowany koszt pozostaly | ETC | Koszt
budget at completion | budzet koncowy | BAC | Koszt
variance at completion | odchylenie koncowe | VAC | Koszt
cost variance | odchylenie kosztowe | CV | Koszt
schedule variance | odchylenie harmonogramu | SV | Koszt
contingency reserve | rezerwa kontyngencyjna |  | Koszt
management reserve | rezerwa zarzadcza |  | Koszt
return on investment | zwrot z inwestycji | ROI | Srodowisko biznesowe
net present value | wartosc biezaca netto | NPV | Srodowisko biznesowe
internal rate of return | wewnetrzna stopa zwrotu | IRR | Srodowisko biznesowe
payback period | okres zwrotu |  | Srodowisko biznesowe
risk | ryzyko |  | Ryzyko
threat | zagrozenie |  | Ryzyko
opportunity | szansa |  | Ryzyko
risk register | rejestr ryzyk |  | Ryzyko
probability | prawdopodobienstwo |  | Ryzyko
impact | wplyw |  | Ryzyko
risk appetite | apetyt na ryzyko |  | Ryzyko
risk tolerance | tolerancja ryzyka |  | Ryzyko
expected monetary value | oczekiwana wartosc pieniezna | EMV | Ryzyko
secondary risk | ryzyko wtorne |  | Ryzyko
residual risk | ryzyko szczatkowe |  | Ryzyko
quality | jakosc |  | Jakosc
quality assurance | zapewnienie jakosci | QA | Jakosc
quality control | kontrola jakosci | QC | Jakosc
cost of quality | koszt jakosci | CoQ | Jakosc
continuous improvement | ciagle doskonalenie | Kaizen | Jakosc
root cause analysis | analiza przyczyn zrodlowych | RCA | Jakosc
defect | wada | defekt | Jakosc
stakeholder register | rejestr interesariuszy |  | Interesariusz
stakeholder engagement | zaangazowanie interesariuszy |  | Interesariusz
power-interest grid | macierz wplywu i zainteresowania |  | Interesariusz
communication channels | kanaly komunikacji |  | Komunikacja
communications management plan | plan zarzadzania komunikacja |  | Komunikacja
resource | zasob |  | Zasoby
responsibility assignment matrix | macierz przypisania odpowiedzialnosci | RACI | Zasoby
servant leadership | przywodztwo sluzebne |  | Ludzie
emotional intelligence | inteligencja emocjonalna | EQ | Ludzie
conflict | konflikt |  | Ludzie
negotiation | negocjacje |  | Ludzie
motivation | motywacja |  | Ludzie
team development | rozwoj zespolu |  | Ludzie
self-organizing team | zespol samoorganizujacy sie |  | Ludzie
ground rules | zasady wspolpracy zespolu |  | Ludzie
change request | wniosek o zmiane |  | Integracja
integrated change control | zintegrowana kontrola zmian |  | Integracja
change control board | komisja ds. zmian | CCB | Integracja
issue log | rejestr problemow |  | Proces
lessons learned | wnioski z projektu | lessons learned | Proces
configuration management | zarzadzanie konfiguracja |  | Proces
governance | nadzor projektowy | governance | Integracja
phase gate | bramka decyzyjna | phase gate | Integracja
tailoring | dostosowanie | tailoring | Proces
predictive approach | podejscie predykcyjne |  | Proces
adaptive approach | podejscie adaptacyjne |  | Proces
hybrid approach | podejscie hybrydowe |  | Proces
agile | zwinne podejscie | agile | Proces
iteration | iteracja | sprint | Proces
increment | przyrost |  | Proces
minimum viable product | produkt o minimalnej koniecznej funkcjonalnosci | MVP | Proces
procurement | zaopatrzenie | nabywanie | Nabywanie
make-or-buy analysis | analiza wykonac czy kupic |  | Nabywanie
contract | umowa | kontrakt | Nabywanie
fixed-price contract | umowa ryczaltowa |  | Nabywanie
cost-reimbursable contract | umowa z refundacja kosztow |  | Nabywanie
time and materials | czas i materialy | T&M | Nabywanie
statement of work | opis przedmiotu zamowienia | SOW | Nabywanie
request for proposal | zapytanie ofertowe | RFP | Nabywanie
enterprise environmental factors | czynniki srodowiskowe przedsiebiorstwa | EEF | Srodowisko biznesowe
organizational process assets | aktywa procesow organizacji | OPA | Srodowisko biznesowe
benefits realization | realizacja korzysci |  | Srodowisko biznesowe
compliance | zgodnosc |  | Srodowisko biznesowe
organizational change | zmiana organizacyjna |  | Srodowisko biznesowe
value delivery | dostarczanie wartosci |  | Srodowisko biznesowe
"""


def load_corpus_text():
    """Zwraca (pl_text, en_text) - skonkatenowane, male litery, ze wszystkich 990 pytan."""
    if not QUESTIONS.exists():
        return "", ""
    data = json.load(QUESTIONS.open(encoding="utf-8"))
    pl, en = [], []
    for q in data:
        pl.append(q.get("question", ""))
        pl.extend(q.get("answers", []) or [])
        pl.append(q.get("explanation", ""))
        en.append(q.get("question_en", ""))
        en.extend(q.get("answers_en", []) or [])
        en.append(q.get("explanation_en", ""))
    return " ".join(pl).lower(), " ".join(en).lower()


def main():
    CORPUS.mkdir(exist_ok=True)
    pl_text, en_text = load_corpus_text()

    rows = []
    for line in TERMS.strip().splitlines():
        if not line.strip():
            continue
        en, pl, alt, cat = [p.strip() for p in line.split("|")]
        rows.append({
            "term_en": en,
            "term_pl": pl,
            "term_pl_alt": alt,
            "category": cat,
            "freq_en": en_text.count(en.lower()) if en_text else 0,
            "freq_pl": pl_text.count(pl.lower()) if pl_text else 0,
        })

    cols = ["term_en", "term_pl", "term_pl_alt", "category", "freq_pl", "freq_en"]
    with OUT.open("w", encoding="utf-8-sig", newline="") as f:
        w = csv.DictWriter(f, fieldnames=cols)
        w.writeheader()
        for r in rows:
            w.writerow(r)

    attested = sum(1 for r in rows if r["freq_pl"] or r["freq_en"])
    print(f"Zapisano {OUT.relative_to(REPO)}")
    print(f"Terminow: {len(rows)} | poswiadczonych w istniejacych 990 pytaniach: {attested}")
    top = sorted(rows, key=lambda r: r["freq_pl"] + r["freq_en"], reverse=True)[:8]
    print("Najczestsze (PL+EN):")
    for r in top:
        print(f"  {r['term_en']:34} <-> {r['term_pl']:34} pl={r['freq_pl']} en={r['freq_en']}")


if __name__ == "__main__":
    main()
