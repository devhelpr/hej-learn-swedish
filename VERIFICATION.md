# Verificatie — 10 oktober 2026

- Frontend: TypeScript/Vite-productiebuild geslaagd; React-spelertests controleren de actuele aanvraagidentiteit, automatische volgende zin, pauzeren tussen zinnen, stoppen bij navigatie, opgeslagen hervatpositie en behoud van instellingen als de spraakhulp ontbreekt.
- Rust: unit- en subprocess-tests slagen. `cargo clippy -- -D warnings` slaagt. Tests gebruiken een fake CLI voor succes, ongeldige uitvoer, timeout en annulering, inclusief opruimen van de procesgroep.
- SVT: beide feeds live opgehaald; de landelijke feed leidt officieel om naar `/rss.xml`. Native Rust-feedverwerking en artikelextractie live getest voor landelijk nieuws en Småland. De artikelintro wordt meegenomen, navigatie en scripts niet.
- Codex: echte CLI-generaties op A1/A2/B1 geslaagd met de bestaande login. Zinparen en vertalingen beoordeeld tegen de artikelbron. Na te complexe eerste A1-uitvoer zijn de instructies aangescherpt voor absolute beginners en woordlimieten toegevoegd. De laatste A1-test bevat acht korte zinparen; de A2/B1-tests bevatten twaalf/dertien zinparen. Dit is een steekproef, geen garantie voor toekomstige tekstkwaliteit of CEFR-certificering.
- macOS ARM: Swift-helper gecompileerd; systeemstemmen Alva gedetecteerd. Native start, pauze, hervatten, vervangen van een uitspraak en echte eindmelding gecontroleerd via `scripts/check-speech.py`. Desktop- en browserweergave visueel bekeken. De desktopapp toont SVT-nieuws en een lokaal opgeslagen oefening.
- macOS Intel: volledige Tauri-app en Swift-helper cross-gecompileerd op Apple Silicon; DMG gemaakt. Nog niet op fysieke Intel-hardware uitgevoerd.
- Windows: native .NET-spraakhulp succesvol cross-gecompileerd voor Windows x64. De complete Windows-app, installer en daadwerkelijke Windows-spraak zijn hier niet uitgevoerd: deze omgeving is macOS. `.github/workflows/desktop.yml` bevat de Windows-build en installer-artifacts, naast ARM/Intel-macOS. De workflow is lokaal voorbereid, niet naar GitHub gepusht of uitgevoerd.
- Packaging: macOS-DMG's gebruiken een eigen `hdiutil`-stap met een Applications-snelkoppeling; Finder-opmaakautomatisering is niet nodig. Bundels zijn voor eigen gebruik, zonder publieke ondertekening/notarisatie.
- `.gitignore`: gecontroleerd in een tijdelijk Git-repository. Dependencies, buildoutput, tijdelijke helpers, SQLite, credentials en gegenereerde Tauri-schema's worden genegeerd. Broncode, `package-lock.json` en `Cargo.lock` blijven zichtbaar.


## Oefeningenwerkplek — 11 oktober 2026

- Frontendtests controleren boomgroepering, titelovername, bronidentiteit van geplakte niveauvarianten, losse spraak, wisselen van leesweergave zonder stoppen, markering/ondertiteling, handmatig archiveren/herstellen, opslagfouten en afzonderlijke zoekfilters. Filters testen dag/week/maand, ISO-week 53, jaargrenzen en lokale zomertijdgrenzen.
- Rust-tests controleren de oorspronkelijke nieuwstitel, compatibiliteit met oude les-JSON, archiveren/herstellen na herstart, behoud van archiefstatus bij voortgangsupdates en mislukte archiefopslag. De bestaande automatische luistervoltooiing bepaalt niet de archiefstatus.
- Frontendproductiebuild en 22 frontendtests slagen; 16 Rust-tests slagen (2 live tests over nieuws/CLI zijn bewust overgeslagen); Clippy met `-D warnings` slaagt. De Swift-helper is opnieuw gebouwd. De native macOS-spraakcheck slaagt buiten de sandbox; binnen de sandbox annuleert ook de oorspronkelijke helper zelfs een losse uitspraak. De native code is ongewijzigd.
- De Windows-runtime is in deze macOS-omgeving niet beschikbaar. De GUI-automatisering kan niet starten omdat de computer-use-connector `codex app-server` niet kan vinden; de nieuwe schermindeling moet nog visueel op macOS en Windows worden gecontroleerd.


## Bijzonderheden taal — 11 oktober 2026

- Het nieuwe tabblad toont vijf niveaugebonden Nederlandse uitlegpunten, met een gemarkeerd letterlijk Zweeds fragment en de bestaande zinvertaling. De demo heeft vijf vaste A1-punten.
- 29 frontendtests slagen, inclusief wisselen tijdens afspelen, toevoegen aan actieve/gearchiveerde lessen, behoud van nieuwere voortgang en archiefstatus, handmatig opnieuw proberen, annulering vóór en tijdens de CLI-aanvraag en offline openen zonder generatie.
- 23 reguliere Rust-tests slagen, inclusief exact vijf punten, ongeldige/verzonnen fragmenten, lege/duplicerende punten, dezelfde generatieslot voor lessen en uitleg, annulering/timeout, opslagfouten en herstart met oude lesgegevens. Drie live tests worden standaard overgeslagen.
- Echte Codex CLI-controle op A1/A2/B1 geslaagd met fictieve busnieuwsteksten: A1 maakt een nieuwe oefening inclusief uitleg, A2/B1 vullen bestaande zinparen aan. Alle vijftien punten zijn nagekeken op context, niveau en taalkundige juistheid. De voorbeelden bevatten basiswoordenschat/vormen op A1, verleden tijd/verbindingen op A2 en bijzinnen/passief/nieuwsuitdrukkingen op B1. QA-uitvoer staat uitsluitend in de genegeerde `src-tauri/target/qa/language-*.json`.
- Frontendproductiebuild en Clippy met `-D warnings` slagen. De native spraakhulp is ongewijzigd; dit tabblad genereert en bewaart alleen tekst.

## Direct aanmaken en gedeeld taalniveau

- Het hoofdmenu bevat het opgeslagen taalniveau en Eigen tekst toevoegen. Nieuwsselectie haalt de artikeltekst op en start direct generatie met de vastgelegde titel, bron en niveau. Ophalen en genereren delen dezelfde blokkering; annuleren tijdens ophalen negeert de late respons en start geen CLI-proces.
- Eigen tekst staat in een native modal-dialoog met titel, tekstvalidatie, conceptbehoud bij sluiten/fouten en wissen na succes. Onvolledige artikelen bieden plakken met behoud van bronvermelding. Native dialog verzorgt focusbegrenzing en toetsenbordgedrag; React-tests simuleren alleen de ontbrekende jsdom-dialogmethoden.
- 36 frontendtests slagen: directe generatie, retry, bronfallback, conceptbehoud, annulering, blokkeren van sluiten tijdens generatie, gecombineerd niveau/zoek/datumfilter en behoud van afspelen bij niveauwissel. Productiebuild slaagt. 23 reguliere Rust-tests slagen; drie live tests zijn overgeslagen. Clippy met alle targets en `-D warnings` slaagt na verplaatsing van een bestaande testhelper vóór de testmodule.
- Visuele controle op brede/smalle desktopvensters en native modal-toetsenbordcontrole blijven handmatig te doen: de beschikbare browserautomatisering kan haar codex app-server niet starten. Native spraakcode en opslagformaat zijn ongewijzigd.
