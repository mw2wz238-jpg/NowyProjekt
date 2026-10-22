# Project Vanguard

Przeglądarkowa strzelanka 3D z taktycznymi rundami, botami 5v5, trzema mapami i sterowaniem dotykowym.

## Run Locally

**Wymagania:** Node.js 20.19+ lub 22.12+


1. Zainstaluj zależności:
   `npm install`
2. Uruchom aplikację:
   `npm run dev`

## Kontrola jakości

- `npm test` — uruchamia testy reguł symulacji meczu,
- `npm run benchmark:simulation` — mierzy medianę czasu decyzji AI w scenariuszu 5v5 (bez renderera i geometrii mapy),
- `npm run lint` — sprawdza typy TypeScript,
- `npm run lint:eslint` — uruchamia ESLint dla całego projektu,
- `npm run build` — tworzy produkcyjną wersję aplikacji.

## Sterowanie

Na komputerze steruj ruchem klawiszami WASD, rozglądaj się myszą, przytrzymaj lewy przycisk, aby prowadzić ogień w tempie właściwym dla broni, celuj prawym przyciskiem, a broń przeładuj klawiszem R. Na rundę otrzymujesz po jednym granacie odłamkowym (G), dymnym (F), błyskowym (X) i minie Claymore (V). Gotowe serie aktywuj klawiszami 1 (UAV), 2 (nalot) i 3 (Predator).

Podczas meczu użyj Escape lub przycisku pauzy w HUD, aby zatrzymać symulację. Escape albo „Wznów mecz” kontynuuje rozgrywkę; „Wróć do menu” porzuca mecz, a rozpoczęcie nowej gry tworzy świeżą sesję.

Na telefonach i innych urządzeniach z ekranem dotykowym dostępne są tymczasowe kontrolki ekranowe:

- joystick po lewej stronie porusza postacią,
- przeciąganie po prawej stronie obraca kamerę,
- przyciski ekranowe obsługują strzelanie, celowanie, bieg, skok, przeładowanie, wszystkie granaty, minę Claymore i dostępne serie,
- przycisk „ROZBRAJAJ” pojawia się w pobliżu podłożonej bomby — przytrzymaj go do końca paska postępu.

W ustawieniach na ekranie tytułowym możesz dostosować czułość myszy, głośność główną i osobne poziomy efektów dźwiękowych, komunikatów taktycznych oraz interfejsu. Głośność główna skaluje wszystkie kanały, a wyciszenie nadal wyłącza je globalnie. Ustawienia są zapisywane lokalnie w przeglądarce.

Suwak pola widzenia (FOV) ustawia perspektywę kamery w zakresie 60–110° i działa natychmiast, również w trakcie meczu. Zoom celowania ADS pozostaje niezależny.

W ustawieniach możesz ograniczyć kołysanie kamery podczas ruchu oraz przechył przy ślizgu. Osobny mnożnik czułości ADS zmienia szybkość rozglądania wyłącznie podczas celowania; standardowa czułość myszy/touch pozostaje bazą.

Ustawienie „Odwróć oś pionową” działa dla myszy i dotyku, nie zmieniając osi poziomej. Tryb sprintu pozwala wybrać przytrzymanie lub przełączanie; domyślnie sprint działa jak dotychczas, czyli podczas przytrzymania. Utrata fokusu i pauza zawsze wyłączają sprint.

Gra obsługuje standardowy gamepad przeglądarkowy: lewy drążek porusza, prawy rozgląda się, spusty strzelają/celują, a przyciski A/B/X/Y obsługują skok, kucanie, przeładowanie i interakcję. Kliknięcie lewego drążka uruchamia sprint, Start wstrzymuje mecz. W ustawieniach można dostosować czułość gamepada i martwą strefę obu drążków; zmiany są zapisywane lokalnie.

Ustawienie „Jakość grafiki” wybiera profil automatyczny, niski, średni lub wysoki. Profile regulują skalę renderowania i jakość cieni; automatyczny profil wybiera niższą jakość dla dotyku i wyłącza cienie przy programowym WebGL. Zmiana działa od razu i nie wpływa na symulację.

W tych samych ustawieniach możesz włączyć/wyłączyć celownik, wybrać jego kolor, rozmiar ramion, odstęp oraz kropkę środkową. Podgląd aktualizuje się na żywo, a ustawienia celownika są zapisywane lokalnie. Celownik ekranowy ukrywa się podczas ADS; celownik lunety snajperskiej i hitmarkery pozostają niezależne.

Opcja dostępności „Ogranicz błyski i animacje HUD” zmniejsza intensywność białego efektu oślepienia i zatrzymuje animacje interfejsu bez skracania czasu działania oślepienia w rozgrywce. Ustawienie systemowe „Ogranicz ruch” jest również respektowane automatycznie.

Przycisk „Sterowanie” na ekranie tytułowym pozwala przypisać klawisze do ruchu, skoku, sprintu, interakcji, przeładowania, granatów, miny i serii. Zmiany są zapisywane lokalnie; podwójne przypisania oraz klawisze Escape i Tab są odrzucane. Escape (pauza) i Tab (tabela wyników) pozostają stałymi skrótami. Sterowanie dotykowe działa niezależnie od przypisań klawiatury.

Przed meczem wybierz poziom botów: Rekrut zapewnia wolniejsze poruszanie i mniejszą celność, Weteran to ustawienie domyślne, a Elita zwiększa celność i tempo poruszania. Bot atakujący najbliższy strefy podłożenia podejmuje próbę podłożenia bomby; po podłożeniu jeden bot obrońców koncentruje się na rozbrojeniu, a pozostali szukają przeciwników. Zestaw do rozbrajania kosztuje 400 i skraca rozbrajanie z 10 do 5 sekund; kupiony zestaw pozostaje przy graczu do końca meczu. Drużyna botów rozdziela widoczne cele, zamiast skupiać wszystkich na jednym przeciwniku. Boty dopasowują dystans walki do roli: snajperzy utrzymują większą odległość, a użytkownicy strzelb próbują podejść bliżej. Boty, które otrzymają obrażenia, przez chwilę próbują wycofać się za pobliską osłonę, jeśli da się do niej bezpiecznie dojść.

Po zakończeniu meczu raport pokazuje mapę, aktywny czas gry (pauza nie jest liczona), powód zakończenia, MVP, statystyki K/D/A i ranking całej dziesiątki graczy. Ranking porządkuje wkład według wzoru zabójstwa × 100 + asysty × 50 + obrażenia; współczynnik K/D przy zerowej liczbie zgonów pokazuje ∞, jeśli gracz zdobył eliminację.

Granat błyskowy oślepia osoby w zasięgu, które mają widoczność na wybuch; efekt jest silniejszy, gdy patrzą w jego stronę. UAV przez 25 sekund ujawnia przeciwników na radarze. Nalot wykonuje trzy kolejne uderzenia, a Predator atakuje najbliższego przeciwnika. Każda seria jest dostępna po wymaganej liczbie eliminacji i może zostać użyta raz do następnej śmierci.
