# Faza 1: kampania LinkedIn i kontrolowany dostep beta

## Cel

Faza 1 ma pozyskac pierwszych testerow PM Academy z LinkedIn i obslugiwac ich w kontrolowany sposob: kandydat zostawia email, admin zatwierdza kandydata, system przydziela wolny kod beta i wysyla instrukcje. Celem nie jest jeszcze pelna sprzedaz ani duza automatyzacja marketingowa, tylko sprawdzenie zainteresowania, jakosci onboardingu i wartosci feedbacku od 20-100 testerow.

## Kontekst projektu

Aplikacja produkcyjna dziala pod `https://pmp.nord-star.pl` i ma juz zamknieta bete oparta o jednorazowe kody. Istniejace elementy:

- tabela `beta_codes` z kodami i statusem uzycia,
- Edge Function `register-beta-user`, ktora atomowo tworzy konto i zuzywa kod,
- instrukcja dla testerow w `instrukcja-dla-testerow.md`,
- Supabase jako backend,
- Cloudflare Pages/Workers jako hosting aplikacji.

Faza 1 powinna wykorzystac ten fundament zamiast przebudowywac rejestracje.

## Rekomendowane podejscie

Rekomendowane jest podejscie polautomatyczne:

1. LinkedIn kieruje kandydatow na prosta strone beta.
2. Kandydat wypelnia formularz.
3. Zgloszenie trafia do tabeli `beta_applications` ze statusem `new`.
4. Admin widzi liste zgloszen w prostym panelu.
5. Admin klika `Zatwierdz`.
6. Backend wybiera pierwszy wolny, nieprzydzielony kod beta.
7. Backend wysyla mail z kodem, linkiem i instrukcja.
8. Zgloszenie dostaje status `sent`, a kod status `assigned`.
9. Gdy tester zarejestruje konto, obecny mechanizm `register-beta-user` oznacza kod jako `used`.

To ogranicza ryzyko spamu i daje kontrole nad jakoscia testerow, a jednoczesnie usuwa reczne kopiowanie kodow do maili.

## Strona beta

Strona powinna byc praktyczna i krotka. Pierwszy ekran powinien od razu komunikowac:

- nazwe: PM Academy,
- zastosowanie: przygotowanie do PMP,
- status: zamknieta beta,
- wezwanie: zglos sie po dostep testowy.

Sekcje:

- opis produktu w 3-5 zdaniach,
- lista funkcji istotnych dla testera: szybkie quizy, trening adaptacyjny, Trial Exam, statystyki, PL/EN, ranking opcjonalny,
- zasady bety: darmowy dostep, limit kodow, prosba o feedback,
- formularz zgloszeniowy.

Minimalne pola formularza:

- email,
- imie lub nick,
- aktualny etap przygotowan do PMP,
- zgoda na kontakt mailowy w sprawie bety,
- opcjonalnie: link do profilu LinkedIn.

## Dane i statusy

Nowa tabela `beta_applications`:

- `id`,
- `email`,
- `name`,
- `linkedin_url`,
- `pmp_stage`,
- `status`: `new`, `approved`, `sent`, `rejected`, `failed`,
- `assigned_code`,
- `approved_at`,
- `sent_at`,
- `created_at`,
- `admin_notes`.

Rozszerzenie `beta_codes`:

- `assigned_to_email`,
- `assigned_at`,
- `sent_at`.

Kod moze byc:

- wolny: `used=false` i `assigned_to_email IS NULL`,
- przydzielony: `assigned_to_email` wypelnione, ale `used=false`,
- zuzyty: `used=true`.

## Panel admina

Panel admina w fazie 1 moze byc bardzo prosty. Wystarczy widok listy zgloszen z filtrami:

- nowe,
- wyslane,
- odrzucone,
- bledy wysylki.

Dla kazdego zgloszenia admin widzi email, imie/nick, etap PMP, date zgloszenia i notatki. Akcje:

- `Zatwierdz i wyslij kod`,
- `Odrzuc`,
- `Wyslij ponownie`,
- `Dodaj notatke`.

Dostep do panelu powinien byc ograniczony do admina. Najprostsza opcja dla fazy 1: Supabase Auth plus lista admin emaili w konfiguracji lub tabela `admin_users`.

## Wysylka email

Nie stawiamy wlasnego serwera pocztowego. Uzywamy zewnetrznego dostawcy SMTP/API pod domena `nord-star.pl`.

Rekomendacja startowa: Brevo.

Powody:

- darmowy plan wystarcza na bete,
- obsluguje maile transakcyjne i kampanie,
- pozniej mozna wykorzystac te sama baze kontaktow do follow-upow,
- nie wymaga utrzymywania wlasnej reputacji serwera SMTP.

Alternatywa techniczna: Resend, jesli priorytetem jest bardzo prosta integracja API i maile transakcyjne bez marketingowego CRM.

Adres nadawcy:

- `PM Academy <beta@nord-star.pl>` albo
- `PM Academy <no-reply@nord-star.pl>`.

W DNS domeny trzeba ustawic SPF, DKIM i DMARC zgodnie z instrukcja dostawcy.

## Szablon maila

Mail powinien byc krotki i konkretny:

- temat: `Dostep testowy do PM Academy`,
- link do aplikacji: `https://pmp.nord-star.pl`,
- jednorazowy kod beta,
- informacja, ze kod sluzy do zalozenia jednego konta,
- skrocona instrukcja instalacji na telefonie,
- prosba o feedback po kilku quizach,
- kontakt zwrotny.

Tresc moze bazowac na `instrukcja-dla-testerow.md`, ale powinna byc skrocona do pierwszego maila. Pelna instrukcja moze byc linkowana osobno albo dolaczona w tresci po kodzie.

## Kampania LinkedIn

Kampania powinna byc prowadzona jako zamknieta beta, nie jako sprzedaz.

Kolejnosc publikacji:

1. Post zapowiadajacy: buduje aplikacje do PMP i szukam testerow.
2. Post problemowy: dlaczego same banki pytan nie wystarczaja.
3. Post produktowy: pokaz funkcji, ktore warto przetestowac.
4. Post rekrutacyjny: ograniczona pula kodow beta.
5. Post follow-up: pierwsze wnioski z testow i zaproszenie kolejnej grupy.

Kazdy post powinien konczyc sie jednym CTA: wejdz na strone beta i zostaw email.

## Metryki fazy 1

Minimalne metryki:

- liczba wejsc na strone beta,
- liczba zgloszen,
- procent zaakceptowanych,
- procent wyslanych kodow,
- procent aktywowanych kodow,
- liczba testerow, ktorzy ukonczyli co najmniej jeden quiz,
- liczba zgloszen bledow lub feedbacku.

Sukces fazy 1:

- minimum 20 aktywowanych testerow,
- minimum 10 testerow z realna aktywnoscia w aplikacji,
- potwierdzenie, ze proces wyslania kodu dziala bez recznego kopiowania,
- co najmniej kilka konkretnych uwag produktowych.

## Ryzyka i decyzje

Ryzyko: zbyt duzo automatyzacji przed walidacja.
Decyzja: admin zatwierdza kazde zgloszenie recznie.

Ryzyko: problemy z dostarczalnoscia maili.
Decyzja: uzyc Brevo lub Resend, ustawic SPF/DKIM/DMARC, nie uzywac wlasnego serwera SMTP.

Ryzyko: kod zostanie wyslany, ale nieuzyty.
Decyzja: kod ma status `assigned`; w panelu widac nieaktywowane kody i mozna wyslac przypomnienie lub recznie anulowac przydzial w pozniejszej fazie.

Ryzyko: publiczny formularz zbiera spam.
Decyzja: w fazie 1 dodac rate limit i honeypot; CAPTCHA dopiero jesli spam realnie wystapi.

## Zakres poza faza 1

Poza zakresem tej fazy:

- pelna platnosc/subskrypcje,
- newsletter marketingowy z wieloma sekwencjami,
- samodzielna rejestracja bez akceptacji admina,
- dedykowany serwer pocztowy,
- rozbudowany CRM,
- pelna aktywacja konta linkiem mailowym.

Docelowa aktywacja konta linkiem mailowym zostanie dodana po skonfigurowaniu custom SMTP w Supabase Auth.

## Kroki realizacji

1. Wybrac dostawce poczty: Brevo jako rekomendacja domyslna.
2. Zweryfikowac domene `nord-star.pl` u dostawcy poczty.
3. Dodac rekordy DNS SPF, DKIM i DMARC.
4. Przygotowac skrocony szablon maila z kodem.
5. Dodac migracje `beta_applications` i pola przydzialu w `beta_codes`.
6. Dodac Edge Function `approve-beta-application`, ktora zatwierdza zgloszenie, przydziela kod i wysyla mail.
7. Dodac strone beta z formularzem.
8. Dodac prosty panel admina.
9. Przetestowac caly przeplyw na jednym testowym emailu.
10. Opublikowac pierwszy post LinkedIn.
11. Po pierwszych 10-20 zgloszeniach sprawdzic metryki i dopiero wtedy rozszerzac kampanie.
