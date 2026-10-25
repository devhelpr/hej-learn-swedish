# Hej — Zweeds oefenen met nieuws

Nederlandstalige Tauri 2-desktopapp voor Windows 11 x64 en macOS 13+ (Intel/Apple Silicon). Nieuws van SVT landelijk en Småland wordt via je eigen Codex CLI een A1-, A2- of B1-oefening. Zweedse zinnen worden lokaal uitgesproken: met systeemstemmen of, op Windows, downloadbare Alma-, NST- en Supertonic-stemmen. Nederlandse vertalingen blijven tijdens het afspelen zichtbaar en kunnen worden verborgen.

## Nieuw in 1.4.0

- Windows controleert bij het opstarten automatisch op nieuwe stabiele versies via GitHub Releases. Kies **Update installeren** of **Later**.
- Updates tonen downloadvoortgang, worden met de Tauri-updatesleutel gecontroleerd en starten Hej na installatie opnieuw. Bij fouten kun je opnieuw proberen.
- De releasepipeline publiceert ondertekende Windows-installers en `latest.json`. De NSIS-installer installeert per gebruiker; een betaald Windows-codecertificaat is niet nodig.
- Bestaande versies zonder updater moeten eenmalig handmatig worden bijgewerkt via de NSIS **`-setup.exe`**.

## Nieuw in 1.3.2

- Ronde **⏮**-knop om direct vanaf de Zweedse titel opnieuw te luisteren.
- Nederlandse titelvertalingen en een aparte luisterknop voor de titel; bij bestaande oefeningen kun je de vertaling toevoegen.
- Vragenbalk onder de oefening, met het antwoord direct eronder. Het vraagveld is ook invulbaar wanneer verzenden tijdelijk niet beschikbaar is; verzenden werkt bij opgeslagen oefeningen in de desktopapp.

## Starten

Benodigd voor ontwikkeling: Node.js 24+, Rust stable en de [Tauri-platformvereisten](https://v2.tauri.app/start/prerequisites/). macOS vereist Xcode-commandlinetools; Windows vereist MSVC-buildtools, WebView2, Python 3.11+ en .NET SDK 8 voor de spraakhulp. Python downloadt tijdens de Windows-build de gecontroleerde fonemizergegevens; eindgebruikers hoeven Python of .NET niet te installeren.

```sh
npm ci
npm run desktop
```

De preview op `http://127.0.0.1:1437` toont de schermen. Native functies werken alleen in de desktopapp. `npm run desktop` bouwt eerst de native spraakhulp.

Installeer daarnaast [Codex CLI](https://developers.openai.com/codex/cli/) en voer `codex login` uit. De app gebruikt je bestaande CLI-login; er is geen spraak-API, API-keyveld of cloudstem. Genereren vereist internet en beschikbare Codex-capaciteit. Instellingen zoeken automatisch naar `codex`; kies bij afwijkende installaties het uitvoerbare pad. Op Windows moet dit het native `codex.exe` zijn, geen npm `.cmd`-wrapper. CLI-versie 0.161.0 is als uitgangspunt gecontroleerd; oudere versies zonder `--ignore-user-config` werken niet.

Kies in Instellingen een lokale Zweedse stem. Ontbreekt deze, volg de getoonde OS-instructies en controleer opnieuw. Op macOS is de beschikbare `sv-SE`-stem Alva tijdens ontwikkeling gedetecteerd. Offline luisteren vereist dat een stem eerst is gedownload.

### Extra Windows-stemmen

Open **Instellingen → Stemmen downloaden** en download **Alma** (circa 63,5 MB), **NST** (circa 63,1 MB) of **Supertonic 3** (circa 145,3 MB). Supertonic biedt tien stemmen uit één gedeeld modelpakket; na installatie verschijnen **Supertonic 1–10** in de stemkeuzelijst. De voorbeeldknop kiest standaard Supertonic 1, of test je al gekozen Supertonic-stem. De app toont voortgang en biedt annuleren en opnieuw proberen. Downloaden verandert je gekozen stem niet. Met **Selecteren en testen** kies je de stem en hoor je een voorbeeldzin; daarna blijft de keuze opgeslagen. Bengt en andere geïnstalleerde Zweedse systeemstemmen blijven beschikbaar.

De download komt van de vaste GitHub Release `speech-models-v1` van deze repository (met HTTPS-omleidingen naar GitHub asset-hosts). Er is geen account, API-sleutel of GPU nodig. Na downloaden werken alle gedownloade stemmen offline op de CPU; oefentekst wordt voor spraak nooit verstuurd. De modellen worden met pakket- en bestandschecksums gecontroleerd en onder `voices/` in de app-data-map opgeslagen. De installer bevat de spraakruntime en eSpeak NG-gegevens, maar geen stemmodellen. Een ontbrekende of beschadigde gekozen stem vraagt om opnieuw installeren; de app wisselt niet automatisch naar Bengt. De modellen klinken verschillend: vergelijk ze zelf bij het gewenste tempo.

De modellen staan in de vaste [stemrelease `speech-models-v1`](https://github.com/devhelpr/hej-learn-swedish/releases/tag/speech-models-v1). Deze release bevat modelgegevens; gebruik een Windows-appbuild met de nieuwe stemondersteuning. De releasepipeline controleert bestaande assets op exacte overeenstemming voordat zij nieuwe installers publiceert; bestaande stempackages worden niet overschreven.

De voorbeeldtekst en gedownloade stemmen werken zonder Codex en zonder geïnstalleerde Windows-systeemstem. Een onbeschikbare Windows-spraakcomponent blokkeert de lokale stemmen niet. Bij een afspeelfout vermeldt de melding of spraak maken, audio openen of afspelen mislukt; **Technische details** toont de exception en recente runtime-diagnostiek voor probleemonderzoek. Deze diagnostiek blijft in het geheugen en wordt niet naar een logbestand geschreven.

De Windows-helper leest en schrijft het JSON-lines-protocol expliciet als UTF-8, onafhankelijk van de Windows-codepagina. Dit voorkomt dat `å`, `ä` en `ö` vóór de synthese worden vervormd. CI test een echte subprocess-roundtrip met ruwe UTF-8 én JSON-escapes, inclusief samengestelde en ontlede Zweedse letters; de modeltests gebruiken ook Zweedse diakritische tekens. De hoorbare uitspraak blijft een aparte acceptatiecontrole.

De Windows-helper normaliseert Tauri-paden met een `\\?\`-prefix naar gewone schijf- of UNC-paden voordat hij model-, token- en fonemizerpaden aan de native spraakengine doorgeeft. Dit voorkomt een onterechte melding dat `phontab` ontbreekt bij een geïnstalleerde app. De Windows-modeltest controleert zowel gewone als geprefixte paden met alle echte stemmen; opnieuw downloaden van modellen is voor deze padcorrectie niet nodig.

## Oefenen

- Kies A1/A2/B1 in het hoofdmenu. Selecteer daarna een bericht uit Landelijk of Småland: de app haalt de artikeltekst op, maakt direct een oefening en opent haar in Oefenen.
- Gebruik **Eigen tekst toevoegen** in het hoofdmenu voor een dialoog met titel en Zweedse tekst (minimaal 50 woorden, maximaal 60.000 tekens). Je concept blijft behouden bij sluiten of een fout; na succesvol aanmaken wordt het gewist. Bij mislukte artikelherkenning biedt **Tekst zelf plakken** dezelfde dialoog met de oorspronkelijke titel en bron.
- Maak een oefening: circa 12 zinparen. Generatie is annuleerbaar en stopt na drie minuten.
- Speel de hele les, de titel of één zin af. **⏮ Naar het begin** begint direct bij de Zweedse titel en gaat daarna naar zin 1 wanneer **Automatisch doorgaan** aanstaat. De titel heeft ook een eigen luisterknop; pauze, hervatten, stoppen, vorige/volgende en herhalen werken ook op de titel. Onderbreken vervangt de lopende zin; oude eindmeldingen kunnen nooit de volgende zin starten.
- Nieuwe oefeningen krijgen een Nederlandse vertaling van de oorspronkelijke titel. Die volgt de instelling **Nederlandse vertaling** en wordt lokaal bewaard. Bij oudere oefeningen kun je **Titelvertaling toevoegen** gebruiken, annuleren en opnieuw proberen zonder de oefening opnieuw te maken. Alleen de Zweedse titel wordt uitgesproken.
- Oefenen groepeert lessen als nieuwsbericht → niveauvariant → zinnen. Elke nieuwe oefening krijgt de oorspronkelijke nieuwstitel; voor geplakte tekst vul je zelf een titel in. Een ander taalniveau maakt een aparte variant, zonder bestaande lessen te overschrijven.
- Wissel tussen **Tekst** (doorlopende oefentekst met gemarkeerde zin en Nederlandse ondertiteling) en **Losse zinnen** (zinparen met eigen afspeelknoppen). Beide gebruiken dezelfde speler en hervatpositie.
- Het tabblad **Grammatica** licht vijf verschillende grammatica-elementen uit de oefening toe in het Nederlands, passend bij A1/A2/B1. Elk punt toont een gemarkeerd Zweeds fragment en de vertaling. Nieuwe oefeningen krijgen deze uitleg meteen; bij bestaande oefeningen gebruik je **Grammatica-uitleg toevoegen**. De uitleg wordt apart opgeslagen en blijft offline beschikbaar.
- Het tabblad **Bijzonderheden taal** toont vijf uitlegpunten in het Nederlands, met een letterlijk Zweeds fragment, de volledige voorbeeldzin en vertaling. Nieuwe oefeningen krijgen deze uitleg meteen; bij bestaande oefeningen voeg je haar zelf toe met **Taalbijzonderheden toevoegen**. De uitleg past bij A1/A2/B1 en blijft na opslaan offline beschikbaar.
- Onder elke opgeslagen oefening (ook in Archief) staat een vragenbalk voor vragen over de tekst, titel, vertaling, grammatica of uitspraak. Typ je vraag en kies **Vraag stellen**; het antwoord verschijnt direct onder de oefening, bij alle vier de oefentabbladen. De actieve titel of zin en volledige oefening gaan als context naar Codex. De context wordt bij verzenden vastgelegd. Een aparte relevantiecontrole moet de vraag goedkeuren en een letterlijk fragment in de oefening of titel aanwijzen voordat een antwoord wordt gemaakt. Niet-passende vragen verwijzen naar ChatGPT; bij een mislukte controle wordt geen antwoord gemaakt. De controle is AI-gebaseerd en kan zich vergissen. Je kunt annuleren, je vraag aanpassen en opnieuw proberen. Wisselen van oefening annuleert de lopende vraag en wist de vragenbalk; late antwoorden worden genegeerd. Vragen en antwoorden worden niet in de app opgeslagen. Hiervoor zijn internet en beschikbare Codex-capaciteit nodig.
- Vink **Gedaan** aan om één oefening naar **Archief** te verplaatsen. De laatste zin beluisteren archiveert niet automatisch. Vanuit Archief kun je blijven luisteren of de oefening terugzetten naar actieve oefeningen.
- Het taalniveau in het hoofdmenu filtert zowel Oefenen als Archief. Wisselen van niveau behoudt de geopende oefening en het afspelen. Filters wissen behoudt het gekozen niveau. Oefenen en Archief hebben aparte zoek- en datumfilters. Zoek op een deel van titel, bron of Zweedse/Nederlandse tekst; filter op aanmaakdag, ISO-week (maandag–zondag) of maand in lokale tijd. Filters blijven tijdens de appsessie behouden en onderbreken het luisteren niet.
- Oudere lessen blijven actief, ook als hun luistervoortgang al afgerond was. Zonder opgeslagen oorspronkelijke nieuwstitel behouden ze hun bestaande titel.
- De meegeleverde voorbeeldtekst is fictief, duidelijk gelabeld en wordt niet bewaard.

## Opslag en architectuur

React/TypeScript/Vite vormen de UI. Alleen Rust doet nieuwsverzoeken, CLI-processen en SQLite-opslag. `hej.sqlite` staat in de door Tauri bepaalde app-data-map (`nl.learnswedish.hej`). De originele artikeltekst blijft uitsluitend in het geopende scherm en tijdelijke CLI-invoer; de lesopslag bewaart alleen de oefening, vertalingen, bronlink, bronidentiteit, niveau, voortgang, archiefstatus, taalbijzonderheden en grammatica-uitleg. Brontekst wordt voor generatie aan Codex doorgegeven.

De Swift-spraakhulp gebruikt `AVSpeechSynthesizer` op de main thread. De Windows C#-hulp gebruikt `Windows.Media.SpeechSynthesis` voor systeemstemmen en sherpa-onnx 1.13.8 voor Piper- en Supertonic 3-modellen; NAudio verzorgt lokale audioweergave, pauzeren en eindmeldingen. Een geladen model blijft tussen zinnen in het geheugen. Annulering en vervangen van een zin behouden de bestaande request-ID-bescherming. Beide helpers spreken dezelfde JSON-lines-commandotaal via stdin/stdout. De helper wordt meegeleverd als Tauri-sidecar; de gebruiker hoeft Swift of .NET niet te installeren.

Rust beheert de vaste stemcatalogus en expliciete downloads via `list_downloadable_voices`, `install_voice` en `cancel_voice_download`. Voortgang komt via `voice-download`, los van het bestaande `speech`-event. Tijdelijke downloads worden nooit als geïnstalleerde stem aangeboden. De bestaande instellingenstructuur blijft gelijk; nieuwe stem-ID's zijn `local:alma` en `local:nst`. macOS houdt zijn bestaande spraakpad.

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

Voor alle echte Windows-modellen bouwt CI gecontroleerde stempackages en test zij de gepubliceerde helper zonder geluidsapparaat op synthese bij snelheid 0,5 en 1,3 plus annulering. Lokaal:

```sh
python -m pip install -r scripts/voice-requirements.txt
python scripts/prepare-voices.py
python scripts/check-local-voices.py src-tauri/binaries/speech-helper-x86_64-pc-windows-msvc.exe
```

`prepare-voices.py` gebruikt vaste upstream commits, ONNX-metadata-conversie volgens sherpa-onnx en deterministische ZIP-bestanden. Het script weigert publicatie als grootte of checksums afwijken van `src-tauri/voice-catalog.json`. `--update-catalog` is alleen voor het voorbereiden van een nieuwe stemrelease; verander dan ook de release-/pakketversie, zodat bestaande downloads nooit worden vervangen. `--resources-only` vereist geen Python-pakketten en wordt door `npm run native` op Windows gebruikt. Een afwijkend Python-pad kan via `HEJ_PYTHON` worden ingesteld.

Handmatige Windows-acceptatie: installeer zowel NSIS als MSI op een schone computer zonder ontwikkeltools; download alle stempakketten, vergelijk met Bengt, controleer Zweedse namen/getallen en langzaam afspelen, herstart zonder internet, onderbreek downloads en test pauze/hervatten/stoppen tijdens synthese en afspelen. Controleer ook opnieuw installeren na een beschadigd model. Voor hoorbare protocoltests geef je `local:alma`, `local:nst` of `local:supertonic:0` (t/m `:9`) als tweede argument aan `scripts/check-speech.py`, met `HEJ_VOICE_DIR` op de app-data-map `voices/` en `HEJ_SPEECH_DATA` op de geïnstalleerde map `speech-data/`.

Licenties en bronverwijzingen voor sherpa-onnx, ONNX Runtime, eSpeak NG, NAudio en modellen staan in `scripts/voice-licenses/` en worden met de Windows-app meegeleverd. Alma gebruikt CC BY 4.0; de Piper NST-repository vermeldt MIT en de NST-dataset CC0. Supertonic 3 heeft MIT-code en [BigScience OpenRAIL-M-modelgewichten](https://huggingface.co/Supertone/supertonic-3/blob/main/LICENSE) met gebruiksbeperkingen; het is dus geen onbeperkt open-source model. Elke stempackage bevat eigen licenties en naamsvermelding.

Supertonic gebruikt de [sherpa-onnx int8-distributie van 11 mei 2026](https://github.com/k2-fsa/sherpa-onnx/releases/tag/tts-models), vastgezet met SHA-256 in `scripts/prepare-voices.py`. De engine krijgt expliciet de Zweedse taalcode `sv`, werkt op CPU en heeft geen eSpeak-, systeemstem- of Codex-installatie nodig. De tien stemmen delen één geladen model; wisselen tussen deze stemmen laadt het model niet opnieuw. De upstream Supertonic-code is gearchiveerd; de runtime-integratie loopt via sherpa-onnx. Vergelijk de uitspraak zelf met Alma/NST en systeemstemmen: modelondersteuning garandeert geen betere uitspraak.

## Installatiebundels

```sh
npm run package
```

Het packaging-script bouwt via Tauri de macOS `.app` en maakt een DMG met `hdiutil` (zonder Finder-opmaakautomatisering); op Windows bouwt Tauri NSIS `.exe`/MSI in `src-tauri/target/release/bundle/`. De lokale build volgt de architectuur van de machine. Op een Mac kun je met `npm run package -- x86_64-apple-darwin` ook de Intel-versie bouwen nadat `rustup target add x86_64-apple-darwin` is uitgevoerd. De GitHub Actions-releasepipeline bouwt uitsluitend Windows x64 en macOS Apple Silicon en bewaart installers als artifacts. Bij een versietag publiceert de pipeline daarnaast een GitHub Release met de losse installers.

De eerste release is niet publiek ondertekend of genotariseerd. De `.gitignore` sluit dependencies, buildoutput, native helpers, databases, logs en lokale credentials uit. `package-lock.json` en `src-tauri/Cargo.lock` horen wel in Git.

### Automatische Windows-updates

De Windows-release controleert bij het opstarten via de officiële [Tauri Updater](https://v2.tauri.app/plugin/updater/) op een nieuwere stabiele versie in [GitHub Releases](https://github.com/devhelpr/hej-learn-swedish/releases). De gebruiker kiest **Update installeren** of **Later**. Tijdens downloaden verschijnt voortgang; na verificatie start de installer en sluit Hej. De NSIS-installer start Hej vervolgens opnieuw. Een mislukte updatecontrole blokkeert oefenen niet; opnieuw proberen is mogelijk. Browserpreview, ontwikkelmodus en macOS voeren deze controle niet uit.

Gebruik de NSIS **`-setup.exe`** voor installatie per gebruiker (`currentUser`), zodat normaal geen administratorrechten nodig zijn. Updates gebruiken dezelfde NSIS-installatievorm met een voortgangsvenster (`passive`). De losse MSI blijft beschikbaar voor beheerde installatie. Stap bij een bestaande MSI-installatie eerst handmatig over naar NSIS voordat je deze updater gebruikt. Versies zonder updater moeten eenmalig handmatig naar een release met updater worden bijgewerkt.

De publieke updatesleutel staat in `src-tauri/tauri.windows.conf.json`. De private sleutel is op 25 oktober 2026 ingesteld als Actions-secret **`TAURI_SIGNING_PRIVATE_KEY`** in `devhelpr/hej-learn-swedish`. De lokale kopie staat in de genegeerde `.secrets/hej-updater.key`; bewaar hiervan ook een veilige backup. Deze sleutel heeft geen wachtwoord; vertrouwelijkheid berust op GitHub Secrets en de lokale bestandsrechten. Genereer voor volgende releases geen nieuwe sleutel: geïnstalleerde apps vertrouwen de bestaande publieke sleutel. Bij gebruik van een sleutel met wachtwoord voeg je ook `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` toe aan de repository-secrets.

Voor een lokale Windows-releasebuild stel je de sleutel in vóór `npm run package`, bijvoorbeeld in PowerShell:

```powershell
$env:TAURI_SIGNING_PRIVATE_KEY = (Resolve-Path '.secrets/hej-updater.key').Path
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ''
npm run package
```

Tauri maakt `.sig`-bestanden voor de Windows-installers. Het releasejob genereert `latest.json` met de Windows x64 NSIS-download en de inhoud van de bijbehorende handtekening. Ontbrekende handtekeningen, dubbele NSIS-installers of afwijkende tag/npm/Tauri/Cargo-versies laten de publicatie falen. Alle bestanden worden eerst naar een draft release geüpload; daarna wordt de release gepubliceerd. Prereleases komen niet via het endpoint voor de nieuwste stabiele release binnen. Er is geen betaald Windows-codecertificaat ingesteld; Windows kan dus nog een SmartScreen-waarschuwing tonen. Tauri-updateondertekening staat los van Windows-codeondertekening.

Windows-acceptatie vóór brede distributie: installeer een NSIS-release met updater als gewone gebruiker, publiceer een hogere testversie, controleer de melding en **Later**, en voer daarna de update uit. Controleer herstart, behoud van lessen/instellingen/stemmen, foutafhandeling zonder internet en de weigering van een beschadigd of verkeerd ondertekend updatebestand. Deze installatiestappen moeten op Windows worden uitgevoerd.

## Releasepipeline op GitHub starten

De workflow **Desktop builds** (`.github/workflows/desktop.yml`) start zodra je een tag met prefix `v` naar GitHub pusht, bijvoorbeeld `v1.4.0`, of wanneer je hem handmatig start. Gewone branch-pushes en pull requests starten deze releasepipeline niet. De commit waarnaar de tag verwijst moet deze workflow bevatten. GitHub Actions moet ingeschakeld zijn voor de repository.

1. Kies een nieuw versienummer. Gebruik hieronder overal dezelfde versie; `1.4.0` is een voorbeeld. Werk de npm-versie en bijbehorende lockfile bij:

   ```sh
   npm version 1.4.0 --no-git-tag-version
   ```

2. Zet ook `version` in `src-tauri/tauri.conf.json` en de package-versie in `src-tauri/Cargo.toml` op `1.4.0`. De tag zelf wijzigt deze bestanden niet. Werk de Rust-lockfile bij en controleer de build:

   ```sh
   npm run native
   cargo check --manifest-path src-tauri/Cargo.toml
   npm run build
   npm test
   cargo test --locked --manifest-path src-tauri/Cargo.toml
   ```

3. Commit de versieaanpassingen op `main`, maak een geannoteerde tag op die commit en push deze expliciet:

   ```sh
   git add package.json package-lock.json src-tauri/tauri.conf.json src-tauri/Cargo.toml src-tauri/Cargo.lock README.md
   git commit -m "Release v1.4.0"
   git tag -a v1.4.0 -m "Hej v1.4.0"
   git push origin main
   git push origin v1.4.0
   ```

4. Open op GitHub **Actions → Desktop builds** en kies de run voor `v1.4.0`. Na een geslaagde build download je de installers onder **Artifacts**:

   | Artifact | Platform |
   | --- | --- |
   | `hej-windows-2022` | Windows x64 (`.exe` en `.msi`) |
   | `hej-macos-15` | macOS Apple Silicon (`.dmg`) |

Na succesvolle builds voor beide platformen publiceert de pipeline automatisch een **GitHub Release** voor de versietag, met gegenereerde release notes, de losse Windows `.exe`/`.msi`-installers, macOS `.dmg`, Windows `.sig`-handtekeningen en `latest.json`. Onder **Releases** kun je deze bestanden direct downloaden, zonder artifact-ZIP uit te pakken. De release wordt pas gepubliceerd als alle installers en updatebestanden aanwezig en geüpload zijn. Tags met een suffix, zoals `v1.4.0-rc.1`, worden als prerelease gepubliceerd.

Voor een gewone handmatige build kun je **Actions → Desktop builds → Run workflow** gebruiken. Een uitvoering op een branch maakt alleen artifacts; een uitvoering op een `v*`-tag publiceert ook de release. Het releasejob gebruikt het ingebouwde GitHub Actions-token met `contents: write`; een apart token is niet nodig.

Gebruik voor een volgende versie een nieuwe tag. Bij een tijdelijke buildfout kun je de bestaande workflowrun opnieuw uitvoeren via **Re-run failed jobs**. Een herhaalde releasejob vult de bestaande release aan en vervangt installers met dezelfde bestandsnaam.

Referenties: [Codex exec](https://developers.openai.com/codex/noninteractive), [Apple systeemspraak](https://developer.apple.com/documentation/avfoundation/speech-synthesis), [Windows systeemspraak](https://learn.microsoft.com/en-us/uwp/api/windows.media.speechsynthesis.speechsynthesizer).


npm run desktop
