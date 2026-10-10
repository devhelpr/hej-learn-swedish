# Hej — Zweeds oefenen met nieuws

Nederlandstalige Tauri 2-desktopapp voor Windows 11 x64 en macOS 13+ (Intel/Apple Silicon). Nieuws van SVT landelijk en Småland wordt via je eigen Codex CLI een A1-, A2- of B1-oefening. Zweedse zinnen worden uitsluitend door de geïnstalleerde systeemstem uitgesproken. Nederlandse vertalingen blijven tijdens het afspelen zichtbaar en kunnen worden verborgen.

## Starten

Benodigd voor ontwikkeling: Node.js 24+, Rust stable en de [Tauri-platformvereisten](https://v2.tauri.app/start/prerequisites/). macOS vereist Xcode-commandlinetools; Windows vereist MSVC-buildtools, WebView2 en .NET SDK 8 voor de spraakhulp.

```sh
npm ci
npm run desktop
```

De preview op `http://127.0.0.1:1437` toont de schermen. Native functies werken alleen in de desktopapp. `npm run desktop` bouwt eerst de native spraakhulp.

Installeer daarnaast [Codex CLI](https://developers.openai.com/codex/cli/) en voer `codex login` uit. De app gebruikt je bestaande CLI-login; er is geen spraak-API, API-keyveld of cloudstem. Genereren vereist internet en beschikbare Codex-capaciteit. Instellingen zoeken automatisch naar `codex`; kies bij afwijkende installaties het uitvoerbare pad. Op Windows moet dit het native `codex.exe` zijn, geen npm `.cmd`-wrapper. CLI-versie 0.161.0 is als uitgangspunt gecontroleerd; oudere versies zonder `--ignore-user-config` werken niet.

Kies in Instellingen een lokale Zweedse stem. Ontbreekt deze, volg de getoonde OS-instructies en controleer opnieuw. Op macOS is de beschikbare `sv-SE`-stem Alva tijdens ontwikkeling gedetecteerd. Offline luisteren vereist dat een stem eerst is gedownload.

## Oefenen

- Kies Landelijk of Småland, selecteer een bericht, controleer de brontekst en kies A1/A2/B1.
- Of plak zelf minstens 50 woorden Zweedse tekst (maximaal 60.000 tekens). Bij mislukte artikelherkenning verschijnt deze optie eveneens.
- Maak een oefening: circa 12 zinparen. Generatie is annuleerbaar en stopt na drie minuten.
- Speel de hele les of één zin af. Pauze, hervatten, stoppen, vorige/volgende en herhalen zijn beschikbaar. Onderbreken vervangt de lopende zin; oude eindmeldingen kunnen nooit de volgende zin starten.
- De bibliotheek bewaart lessen en de laatste zin lokaal. Een ander taalniveau maakt een aparte les, zonder bestaande lessen te overschrijven.
- De meegeleverde voorbeeldtekst is fictief, duidelijk gelabeld en wordt niet bewaard.

## Opslag en architectuur

React/TypeScript/Vite vormen de UI. Alleen Rust doet nieuwsverzoeken, CLI-processen en SQLite-opslag. `hej.sqlite` staat in de door Tauri bepaalde app-data-map (`nl.learnswedish.hej`). De originele artikeltekst blijft uitsluitend in het geopende scherm en tijdelijke CLI-invoer; de bibliotheek bewaart alleen de oefening, vertalingen, bronlink, niveau en voortgang. Brontekst wordt voor generatie aan Codex doorgegeven.

De Swift-spraakhulp gebruikt `AVSpeechSynthesizer` op de main thread. De Windows C#-hulp gebruikt `Windows.Media.SpeechSynthesis` en NAudio voor lokale audioweergave, pauzeren en eindmeldingen. Beide spreken dezelfde JSON-lines-commandotaal via stdin/stdout. De helper wordt meegeleverd als Tauri-sidecar; de gebruiker hoeft Swift of .NET niet te installeren.

Codex draait in een tijdelijke map met read-only sandbox, zonder gebruikersconfig/MCP-servers, uitgeschakelde shell-tool en webzoekfunctie. Invoer wordt als gequote brondata aangeboden, rechtstreeks via stdin. Processen worden niet via een shell gestart. Uitvoer wordt structureel en op inhoudslengte gevalideerd vóór opslag. Het gekozen CEFR-niveau en feitelijke juistheid vragen menselijke beoordeling; structurele validatie kan dat niet bewijzen.

Nieuwsverzoeken zijn beperkt tot HTTPS op `www.svt.se/nyheter/`, inclusief de officiële feedomleiding naar `www.svt.se/rss.xml`. Feeds en artikelen hebben limieten en timeouts. Artikelherkenning gebruikt de specifieke SVT-artikelbody of `NewsArticle.articleBody`; uitsluitend een titel of willekeurige paginaparagrafen volstaan niet. De twee feeds zijn op 10 oktober 2026 live gecontroleerd. Nieuwsbeelden en volledige originele artikelen worden niet gebundeld; publieke distributie/hergebruik vraagt een aparte beoordeling.

## Controleren

```sh
npm run build
npm test
npm run native
cargo test --locked --manifest-path src-tauri/Cargo.toml
cargo clippy --locked --manifest-path src-tauri/Cargo.toml -- -D warnings
```

Tests dekken stale spraakmeldingen, progressgrenzen, RSS-normalisatie, artikelherkenning, linkbeperkingen, SQLite-hervatten, schemavalidatie en subprocess-succes/fout/annulering/timeout. Subprocess-tests gebruiken een lokale fake CLI, geen accountcapaciteit. Optionele live tests: `cargo test --manifest-path src-tauri/Cargo.toml live_feeds_and_article -- --ignored --nocapture` en `cargo test --manifest-path src-tauri/Cargo.toml live_codex_levels -- --ignored --nocapture`. De tweede gebruikt je Codex-login/capaciteit en bewaart QA-uitvoer in de genegeerde `target/qa/`-map. Voor een native spraaktest: `python3 scripts/check-speech.py <pad-naar-helper>`.

Handmatige acceptatie op beide systemen: spreek een zin uit, pauzeer middenin, hervat, onderbreek met een andere zin, navigeer weg tijdens afspelen, verander tempo, pauzeer tussen twee zinnen en hervat. Controleer ondertiteling en offline hervatten na herstart. Controleer ontbrekende stem/CLI/login en beoordeel oefenteksten op alle niveaus tegen hun bron. Windows-runtime en Intel-macOS moeten op die platformen worden gecontroleerd.

## Installatiebundels

```sh
npm run package
```

Het packaging-script bouwt via Tauri de macOS `.app` en maakt een DMG met `hdiutil` (zonder Finder-opmaakautomatisering); op Windows bouwt Tauri NSIS `.exe`/MSI in `src-tauri/target/release/bundle/`. De lokale build volgt de architectuur van de machine. Op een Mac kun je met `npm run package -- x86_64-apple-darwin` ook de Intel-versie bouwen nadat `rustup target add x86_64-apple-darwin` is uitgevoerd. De GitHub Actions-workflow bouwt Windows x64, macOS ARM en macOS Intel afzonderlijk en bewaart installers als artifacts; er wordt niets gepubliceerd.

De eerste release is niet publiek ondertekend of genotariseerd. De `.gitignore` sluit dependencies, buildoutput, native helpers, databases, logs en lokale credentials uit. `package-lock.json` en `src-tauri/Cargo.lock` horen wel in Git.

Referenties: [Codex exec](https://developers.openai.com/codex/noninteractive), [Apple systeemspraak](https://developer.apple.com/documentation/avfoundation/speech-synthesis), [Windows systeemspraak](https://learn.microsoft.com/en-us/uwp/api/windows.media.speechsynthesis.speechsynthesizer).
