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
- Oefenen groepeert lessen als nieuwsbericht → niveauvariant → zinnen. Elke nieuwe oefening krijgt de oorspronkelijke nieuwstitel; voor geplakte tekst vul je zelf een titel in. Een ander taalniveau maakt een aparte variant, zonder bestaande lessen te overschrijven.
- Wissel tussen **Tekst** (doorlopende oefentekst met gemarkeerde zin en Nederlandse ondertiteling) en **Losse zinnen** (zinparen met eigen afspeelknoppen). Beide gebruiken dezelfde speler en hervatpositie.
- Het tabblad **Bijzonderheden taal** toont vijf uitlegpunten in het Nederlands, met een letterlijk Zweeds fragment, de volledige voorbeeldzin en vertaling. Nieuwe oefeningen krijgen deze uitleg meteen; bij bestaande oefeningen voeg je haar zelf toe met **Taalbijzonderheden toevoegen**. De uitleg past bij A1/A2/B1 en blijft na opslaan offline beschikbaar.
- Vink **Gedaan** aan om één oefening naar **Archief** te verplaatsen. De laatste zin beluisteren archiveert niet automatisch. Vanuit Archief kun je blijven luisteren of de oefening terugzetten naar actieve oefeningen.
- Oefenen en Archief hebben aparte zoek- en datumfilters. Zoek op een deel van titel, bron of Zweedse/Nederlandse tekst; filter op aanmaakdag, ISO-week (maandag–zondag) of maand in lokale tijd. Filters blijven tijdens de appsessie behouden en onderbreken het luisteren niet.
- Oudere lessen blijven actief, ook als hun luistervoortgang al afgerond was. Zonder opgeslagen oorspronkelijke nieuwstitel behouden ze hun bestaande titel.
- De meegeleverde voorbeeldtekst is fictief, duidelijk gelabeld en wordt niet bewaard.

## Opslag en architectuur

React/TypeScript/Vite vormen de UI. Alleen Rust doet nieuwsverzoeken, CLI-processen en SQLite-opslag. `hej.sqlite` staat in de door Tauri bepaalde app-data-map (`nl.learnswedish.hej`). De originele artikeltekst blijft uitsluitend in het geopende scherm en tijdelijke CLI-invoer; de lesopslag bewaart alleen de oefening, vertalingen, bronlink, bronidentiteit, niveau, voortgang, archiefstatus en taalbijzonderheden. Brontekst wordt voor generatie aan Codex doorgegeven.

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

Tests dekken stale spraakmeldingen, progressgrenzen, RSS-normalisatie, artikelherkenning, linkbeperkingen, SQLite-hervatten, schemavalidatie en subprocess-succes/fout/annulering/timeout. Subprocess-tests gebruiken een lokale fake CLI, geen accountcapaciteit. Optionele live tests: `cargo test --manifest-path src-tauri/Cargo.toml live_feeds_and_article -- --ignored --nocapture` en `cargo test --manifest-path src-tauri/Cargo.toml live_codex_levels -- --ignored --nocapture`. De tweede gebruikt je Codex-login/capaciteit en bewaart QA-uitvoer in de genegeerde `target/qa/`-map. Voor echte taalbijzonderheden op A1/A2/B1 met fictieve testteksten: `cargo test --manifest-path src-tauri/Cargo.toml live_language_notes_levels -- --ignored --nocapture`. Deze test gebruikt eveneens je Codex-login/capaciteit en schrijft alleen naar `target/qa/`. Voor een native spraaktest: `python3 scripts/check-speech.py <pad-naar-helper>`.

Handmatige acceptatie op beide systemen: spreek een zin uit, pauzeer middenin, hervat, onderbreek met een andere zin, navigeer weg tijdens afspelen, verander tempo, pauzeer tussen twee zinnen en hervat. Controleer ondertiteling en offline hervatten na herstart. Controleer ontbrekende stem/CLI/login en beoordeel oefenteksten op alle niveaus tegen hun bron. Windows-runtime en Intel-macOS moeten op die platformen worden gecontroleerd.

## Installatiebundels

```sh
npm run package
```

Het packaging-script bouwt via Tauri de macOS `.app` en maakt een DMG met `hdiutil` (zonder Finder-opmaakautomatisering); op Windows bouwt Tauri NSIS `.exe`/MSI in `src-tauri/target/release/bundle/`. De lokale build volgt de architectuur van de machine. Op een Mac kun je met `npm run package -- x86_64-apple-darwin` ook de Intel-versie bouwen nadat `rustup target add x86_64-apple-darwin` is uitgevoerd. De GitHub Actions-releasepipeline bouwt uitsluitend Windows x64 en macOS Apple Silicon en bewaart installers als artifacts. Bij een versietag publiceert de pipeline daarnaast een GitHub Release met de losse installers.

De eerste release is niet publiek ondertekend of genotariseerd. De `.gitignore` sluit dependencies, buildoutput, native helpers, databases, logs en lokale credentials uit. `package-lock.json` en `src-tauri/Cargo.lock` horen wel in Git.

## Releasepipeline op GitHub starten

De workflow **Desktop builds** (`.github/workflows/desktop.yml`) start zodra je een tag met prefix `v` naar GitHub pusht, bijvoorbeeld `v0.1.3`, of wanneer je hem handmatig start. Gewone branch-pushes en pull requests starten deze releasepipeline niet. De commit waarnaar de tag verwijst moet deze workflow bevatten. GitHub Actions moet ingeschakeld zijn voor de repository.

1. Kies een nieuw versienummer. Gebruik hieronder overal dezelfde versie; `0.1.3` is een voorbeeld. Werk de npm-versie en bijbehorende lockfile bij:

   ```sh
   npm version 0.1.3 --no-git-tag-version
   ```

2. Zet ook `version` in `src-tauri/tauri.conf.json` en de package-versie in `src-tauri/Cargo.toml` op `0.1.3`. De tag zelf wijzigt deze bestanden niet. Werk de Rust-lockfile bij en controleer de build:

   ```sh
   npm run native
   cargo check --manifest-path src-tauri/Cargo.toml
   npm run build
   npm test
   cargo test --locked --manifest-path src-tauri/Cargo.toml
   ```

3. Commit de versieaanpassingen op `main`, maak een geannoteerde tag op die commit en push deze expliciet:

   ```sh
   git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock
   git commit -m "Release v0.1.3"
   git tag -a v0.1.3 -m "Hej v0.1.3"
   git push origin main
   git push origin v0.1.3
   ```

4. Open op GitHub **Actions → Desktop builds** en kies de run voor `v0.1.3`. Na een geslaagde build download je de installers onder **Artifacts**:

   | Artifact | Platform |
   | --- | --- |
   | `hej-windows-2022` | Windows x64 (`.exe` en `.msi`) |
   | `hej-macos-15` | macOS Apple Silicon (`.dmg`) |

Na succesvolle builds voor beide platformen publiceert de pipeline automatisch een **GitHub Release** voor de versietag, met gegenereerde release notes en de losse Windows `.exe`/`.msi`-installers en macOS `.dmg`. Onder **Releases** kun je deze bestanden direct downloaden, zonder artifact-ZIP uit te pakken. De release wordt pas gepubliceerd als alle drie bestandstypen aanwezig en geüpload zijn. Tags met een suffix, zoals `v0.1.3-rc.1`, worden als prerelease gepubliceerd.

Voor een gewone handmatige build kun je **Actions → Desktop builds → Run workflow** gebruiken. Een uitvoering op een branch maakt alleen artifacts; een uitvoering op een `v*`-tag publiceert ook de release. Het releasejob gebruikt het ingebouwde GitHub Actions-token met `contents: write`; een apart token is niet nodig.

Gebruik voor een volgende versie een nieuwe tag. Bij een tijdelijke buildfout kun je de bestaande workflowrun opnieuw uitvoeren via **Re-run failed jobs**. Een herhaalde releasejob vult de bestaande release aan en vervangt installers met dezelfde bestandsnaam.

Referenties: [Codex exec](https://developers.openai.com/codex/noninteractive), [Apple systeemspraak](https://developer.apple.com/documentation/avfoundation/speech-synthesis), [Windows systeemspraak](https://learn.microsoft.com/en-us/uwp/api/windows.media.speechsynthesis.speechsynthesizer).


npm run desktop