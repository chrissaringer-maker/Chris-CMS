# Baustellen-Notizen-App (iPad) – Entwurf & Machbarkeitsanalyse

Stand: 2026-10-06 · Status: Entwurf, nichts implementiert · Sprache: Deutsch

## 1. Kurzfazit

| Frage | Antwort |
|---|---|
| Machbar? | Ja – aber **nicht** so, wie die Zielvorstellung „alles direkt in Forma Build schreiben" es verlangt. |
| Größter Blocker | Für **Besprechungen (Meetings)** gibt es **keine öffentliche API**. Eine interne API existiert, ist für Kunden nicht freigegeben; ein Community-Wunsch dazu ist offen. |
| Daily Log / Bautagebuch | Machbar über die **Forms API** (Template-Typ `daily-log`, Formulare anlegen und Werte schreiben). Nur für Nicht-PDF-Formulare. |
| Fotos | **Photos API ist (nach meinem Stand) read-only.** Fotos lassen sich stattdessen in Docs-Ordner hochladen oder an Issues/Formulare anhängen – erscheinen dann aber **nicht** im Photos-Tool. |
| Empfohlene Plattform | Native iPadOS-App (Swift/SwiftUI, PencilKit). PWA/Cross-Platform ist für Apple-Pencil + Audio + Offline die schlechtere Wahl. |
| Größtes Projektrisiko | Nicht die Technik, sondern (a) Einwilligung zur Tonaufnahme (DSGVO/§ 201 StGB), (b) Freigabe der Integration durch den ACC-Account-Admin, (c) fehlende Mac/Xcode-Umgebung zum Bauen. |

**Kritik an der Aufgabenstellung:** „Aufnehmen + Skizzieren + Foto-Markup + Transkription + KI-Protokoll + Sync nach ACC (Meetings, Bautagebuch, Fotos)" ist kein MVP, sondern ein Produkt. Wer alles gleichzeitig baut, hat nach Monaten nichts Verlässliches. Siehe Phasenplan (Kap. 7).

## 2. Was Forma Build heute bietet (Zielsystem)

ACC heißt inzwischen Autodesk Forma (Build = Forma Build). Relevante Module:

- **Meetings**: Agenda, Notizen je Punkt, Anwesenheit, Aktionspunkte (offene wandern ins Folgemeeting), Verknüpfung mit Dokumenten/Plänen/Issues/RFIs, Vorlagen (OAC, Toolbox-Talk …), PDF-Export. ([Autodesk](https://construction.autodesk.com/tools/construction-meeting-records/), [Vorlagen](https://www.autodesk.com/blogs/construction/have-you-tried-it-meeting-templates-in-autodesk-build/))
- **Forms** inkl. Template-Typ Daily Log (Wetter, Personal/Stunden je Firma, Notizen, Fotos). ([Forms API](https://aps.autodesk.com/blog/first-autodesk-construction-cloud-acc-specific-api-forms-api))
- **Photos** (neue Version seit 24.03.2026, Alben) ([Autodesk](https://www.autodesk.com/support/technical/article/caas/sfdcarticles/sfdcarticles/How-to-activate-the-new-version-of-Photos-tool-in-Autodesk-Forma-Build-for-old-projects.html))
- **Issues**, Docs (Project Files), Sheets, RFIs, Submittals.
- **Autodesk Assistant**: seit 2026 aus der Beta, Meeting-Minutes sind Datenquelle des Project-Data-Agents, kann Meeting-Zusammenfassungen erzeugen. ([Autodesk](https://www.autodesk.com/blogs/construction/meet-autodesk-assistant-ai-native-intelligence-in-forma/)) → Autodesk bewegt sich in deine Richtung; Wettbewerbsrisiko für den KI-Teil.

## 3. API-Realität (entscheidend)

| Funktion | API vorhanden? | Schreiben möglich? | Konsequenz für die App |
|---|---|---|---|
| **Meetings / Baubesprechungen** | Nein (nur intern) | **Nein** | Kein natives Anlegen. Workaround: Protokoll als PDF in Docs hochladen + Aktionspunkte als Issues anlegen (Kap. 5). Folgemeeting-Automatik, Anwesenheit, Agenda gehen **nicht**. Quelle: [Community-Idee „Public Meeting Minutes API"](https://forums.autodesk.com/t5/forma-for-construction-ideas/public-meeting-minutes-api/idi-p/14143699) |
| **Daily Log / Bautagebuch** | Ja, über Forms API | Ja (Formulare anlegen + Werte ändern, nur Nicht-PDF) | Template in Forma muss **vorher** existieren; App füllt es. [Forms Write API](https://aps.autodesk.com/blog/autodesk-build-forms-write-api), [POST forms](https://aps.autodesk.com/en/docs/acc/v1/reference/http/forms-forms-POST) |
| **Issues** (Mängel, Aufgaben) | Ja | Ja, inkl. Anhänge (storage object → Upload → Attachment registrieren, 3-legged, `data:write`) | Gute Zielstruktur für Aktionspunkte/Mängel mit Foto. [Tutorial](https://aps.autodesk.com/en/docs/bim360/v1/tutorials/issuesv2/attach-local-attachment-issues-v2). Pushpin-/Plan-Issues laut Doku **nicht** unterstützt. |
| **Fotos (Photos-Tool)** | Ja | **Nein** (nur `POST photos:filter`, `GET photos/:id`, 3-legged) | [Photos API](https://aps.autodesk.com/blog/autodesk-build-photos-api). Upload war „in naher Zukunft" angekündigt – **vor Planung erneut prüfen**. |
| **Dokumente (Docs/Project Files)** | Ja (Data Management) | Ja (Storage-Objekt → signierte S3-URL → Item/Version) | Hier landen PDF-Protokolle, Skizzen, Original-/Markup-Fotos. [Tutorial](https://aps.autodesk.com/en/docs/acc/v1/tutorials/files/download-document-s3) |

**Auth:** 3-legged OAuth (Benutzerkontext) ist für Photos/Issues-Anhänge/Forms-Schreiben nötig. Für eine iPad-App: Authorization Code + **PKCE**, Tokens im Keychain. **Der ACC-Account-Admin muss die Integration (Client ID) unter „Custom Integrations" freischalten** ([Hilfe](https://help.autodesk.com/cloudhelp/ENU/Docs-Admin/files/account-administration/Custom_Integrations.html)) – ohne das läuft nichts. Prüfen: Rechte des eingeloggten Nutzers begrenzen, was die App darf (gut).

**Nicht verifiziert (aps.autodesk.com war aus meiner Umgebung per Fetch gesperrt, Aussagen stammen aus Suchergebnissen):**
- ob Forms-Anhänge (Fotos) per API an Formulare gehängt werden können,
- ob Form-Templates per API anlegbar sind (vermutlich nicht → in der UI vorbereiten),
- Region-Header/EMEA-Datenhaltung für deutsche Projekte,
- aktueller Stand Photos-API-Upload,
- ob Meetings-API inzwischen freigegeben wurde.
→ **Spike 1 (1–2 Tage, Postman-Collection von Autodesk) klärt das vor jeder App-Zeile.** ([Postman-Collection Build](https://github.com/autodesk-platform-services/aps-autodesk.build.api-postman.collection/))

## 4. Funktionen der App

### 4.1 Aufnahme
- Audio mit `AVAudioEngine`, Hintergrundmodus „audio", chunkweise auf Platte (Absturz-/Akku-sicher), Pause/Fortsetzen, Marker per Tipp („Beschluss", „Mangel").
- **Zeitindex**: Jeder Skizzenstrich, jede Textnotiz und jedes Foto bekommt den Audio-Zeitstempel (wie Notability/GoodNotes „Recording"). Tippen auf Strich → Audio springt zur Stelle. Das ist der eigentliche Mehrwert gegenüber Einzel-Apps.
- **Transkription on-device**: `SpeechAnalyzer`/`SpeechTranscriber` (iPadOS 26, Deutsch unterstützt). Ein unabhängiger Benchmark sah ihn bei Deutsch vor WhisperKit (6,7 % WER, Testset gemischt) – aber: **Baustellenlärm, Dialekt und Fachbegriffe (Bewehrung, Estrich, Brandschott) sind schlechter als Benchmarks**; Eigenvalidierung mit echten Aufnahmen nötig. ([addpipe](https://blog.addpipe.com/apple-speechanalyzer-api/), [Vergleich](https://rohitraj.tech/en/notes/apple-speechanalyzer-vs-whisper-on-device-stt-2026)) **Keine Sprechertrennung** in keiner dieser Engines → bei Meetings selbst lösen (separat, fehleranfällig) oder darauf verzichten und Sprecher manuell zuordnen.
- Fachwortliste (Custom Vocabulary/Kontext) pro Projekt.

### 4.2 Skizzen & Foto-Markup
- `PencilKit` (Canvas, Radierer, Lineal, Pencil Pro-Gesten). Skizzen als Vektor (`PKDrawing`) speichern, für Export als PNG/PDF rendern.
- Fotos: `AVCaptureSession`/`PHPicker`; Markup = `PKCanvasView` über dem Foto, **Original bleibt unverändert**, Markup als Ebene; Export flatten. Optional: Maßstab/Kalibrierung für Messen im Foto (spätere Phase).
- Optional: Plan-PDF als Hintergrund (aus Docs geladen), Skizze/Foto als Pin darauf → Voraussetzung für Plan-bezogene Issues; **Issues-API unterstützt Pushpins laut Doku nicht**, daher Ortsbezug nur als Text/Location-Feld.

### 4.3 Auswertung (KI) – mit Pflichtprüfung
- Aus Transkript + Notizen: Teilnehmer, Beschlüsse, Aufgaben (Verantwortlicher, Frist), Mängel, offene Punkte.
- LLM: on-device (Apple Foundation Models) für Datenschutz/Offline, oder Cloud-LLM (EU-Region, AVV). Entscheidung in Kap. 8.
- **Nie automatisch hochladen.** Review-Bildschirm: jede Aufgabe/Beschluss mit Quelle (Transkript-Stelle + Audio-Sprung) bestätigen oder verwerfen. Begründung: Ein falsch zugeordneter Beschluss in einem Protokoll hat vertragliche Wirkung; LLM-Halluzinationen und Verwechslungen bei Zahlen/Terminen sind real.

### 4.4 Sync zu Forma
Siehe Kap. 5. Offline-first mit Outbox-Queue, Idempotenz (lokale UUID → gespeicherte Remote-ID), Wiederholung bei Fehlern, Token-Refresh.

## 5. Mapping: App-Daten → Forma

| App-Objekt | Ziel in Forma | Weg |
|---|---|---|
| Besprechungsprotokoll (Text, Beschlüsse, Teilnehmer) | **Docs**, Ordner z. B. `Projekt/Protokolle/<Datum>` als **PDF** (+ optional DOCX/JSON) | Data Management Upload |
| Besprechungsprotokoll (strukturiert) | **Forms**, eigenes Template „Baubesprechung" (in Forma angelegt) | Forms API create + update (falls Template-Feldtypen reichen) |
| Aktionspunkte / Mängel | **Issues** (Typ/Kategorie, Zuständiger, Fälligkeit, Beschreibung, Foto-Anhang) | Issues API + Attachment-Flow |
| Bautagebuch | **Forms** Template-Typ `daily-log` | Forms API create + update |
| Fotos (Original + markiert) | **Docs** `Fotos/<Datum>` ODER Anhang an Issue/Formular | Data Management / Issue-Attachment; *nicht* ins Photos-Tool (read-only) |
| Skizzen | PNG/PDF in Docs, ggf. Anhang an Issue/Formular | wie oben |
| Audio | **Standardmäßig nicht hochladen** (Datenschutz, Größe); nur Transkript nach Prüfung | – |

**Ehrliche Bewertung:** Das Ergebnis ist ein „Protokoll-PDF im Dokumentenordner" statt einer „Baubesprechung im Meetings-Tool". Für Abnehmer (Bauherr, ÖBA) ist das oft ausreichend, aber Meetings-Features (Folgemeeting, Anwesenheitsliste, Verlauf, Assistant-Suche über Meetings) fehlen. Sollte Autodesk die Meetings-API freigeben, ist die Sync-Schicht (Kap. 6) austauschbar gestaltet.

## 6. Architektur

```
┌────────────── iPadOS-App (SwiftUI, iPadOS 26+) ──────────────┐
│ UI: Meeting-Workspace (Audio · Notizen · PencilKit · Fotos)  │
│ Domain: Meeting, Segment(Transkript), Note, Sketch, Photo,   │
│         ActionItem, DailyLog, Participant                    │
│ Persistenz: SwiftData/SQLite + Dateien (Audio, Bilder)       │
│ Services: AudioRecorder · Transcriber · Extractor(LLM)       │
│           ExportService (PDF) · SyncEngine (Outbox)          │
│ ForgeBackends (Protokoll): ACCDocsExporter, ACCIssuesSync,   │
│    ACCFormsSync, [ACCMeetingsSync – nicht verfügbar]         │
│ Auth: ASWebAuthenticationSession + PKCE, Keychain            │
└───────────────────────────┬──────────────────────────────────┘
                            │ HTTPS (APS, 3-legged)
                  Autodesk Forma / APS
```

- Kein eigener Server nötig (weniger Betrieb, weniger DSGVO-Fläche). Server wird erst bei Cloud-LLM-Proxy, Teamfunktionen oder Admin-Konfiguration relevant.
- Jede Forma-Anbindung hinter einem Protokoll → Mock für Tests, Austausch bei API-Änderung.
- Projekt-/Ordner-/Template-Konfiguration pro Baustelle einmalig (Mapping Hub/Projekt/Ordner/Form-Template/Issue-Typ).
- Mehrsprachigkeit der Forma-Felder: Template-/Feldnamen sind projektspezifisch → Mapping konfigurierbar, nicht hartcodiert.

## 7. Phasenplan

| Phase | Inhalt | Ergebnis / Abbruchkriterium |
|---|---|---|
| **0 – Spike (1–2 Tage)** | Postman: Login, Forms create daily-log, Docs-Upload, Issue + Foto-Anhang; Photos-Upload & Meetings-API erneut prüfen; Admin-Freigabe der Custom Integration klären | Wenn Forms-Write oder Admin-Freigabe scheitert → Konzept ändern, bevor Code entsteht |
| **1 – Aufnahme-Kern** | Meeting anlegen, Audio, Zeitindex-Notizen, PencilKit, Foto + Markup, lokal, PDF-Export | Offline vollständig nutzbar; Teilen per Dateien/Mail |
| **2 – Forma-Export** | Auth, Upload Protokoll-PDF + Skizzen/Fotos nach Docs, Issues aus Aktionspunkten | Ein echtes Protokoll landet ohne Handarbeit in Forma |
| **3 – Bautagebuch** | Daily-Log-Formular befüllen (Wetter automatisch, Personal je Firma, Fotos, Notizen), „Kopie vom Vortag" | Ersetzt Handeingabe im Browser |
| **4 – Transkription + KI-Extraktion** | On-device Transkript, Review-UI, Vorschläge für Beschlüsse/Aufgaben | Messbar: Zeitersparnis vs. Fehlerquote auf echten Aufnahmen |
| **5 – Erweiterungen** | Plan-Hintergrund, Photos-Upload (wenn API da), Meetings-API (wenn da), Mehrbenutzer | – |

Reihenfolge bewusst: Transkription/KI **nach** dem Export, weil Skizzen/Fotos/Bautagebuch sofort Nutzen bringen und der KI-Teil das riskanteste und rechtlich heikelste ist.

## 8. Risiken & offene Entscheidungen

1. **Tonaufnahme rechtlich (Deutschland):** Heimliche/ungefragte Aufnahme von nichtöffentlich gesprochenem Wort ist strafbar (§ 201 StGB); zusätzlich DSGVO (Zweckbindung, Löschfristen, Betriebsrat bei Beschäftigten). → Einwilligungs-Screen mit Protokollierung, Aufnahme-Indikator, Standard „Audio nach Transkription löschen". *Keine Rechtsberatung – mit Datenschutzbeauftragten klären.*
2. **Online-Meetings (Teams/Zoom):** iPadOS erlaubt keinen einfachen Systemaudio-Abgriff. Realistisch: Lautsprecher + Mikro (schlechte Qualität, eigene Stimme/Kopfhörer-Problem), oder das Transkript der Plattform nutzen (Teams-Transkript, Microsoft-365-Anbindung). Für den Anwendungsfall „Online-Besprechungen" daher Importfunktion für Transkripte statt Mitschnitt einplanen. *(Einschätzung aus Plattformwissen, nicht gesondert verifiziert.)*
3. **Cloud-LLM vs. on-device:** Cloud = bessere Qualität, aber Personenbezug/Vertraulichkeit (Bauherrenvertraulichkeit, AVV, EU-Hosting). On-device = datenschutzfreundlich, schwächere Extraktion. Empfehlung: on-device als Standard, Cloud optional pro Projekt.
4. **Autodesk-Konkurrenz:** Assistant erzeugt bereits Meeting-Zusammenfassungen im Tool. Differenzierung deiner App = Zeitindex-Skizzen + Foto-Markup + Offline + deutsche Fachwörter, nicht „KI-Protokoll" allein.
5. **API-Stabilität:** Autodesk benennt/ändert Produkte und APIs häufig (BIM 360 → ACC → Forma). Adapter-Schicht und Versionspinning einplanen.
6. **Distribution:** Apple-Developer-Programm nötig; für interne Nutzung TestFlight oder Apple Business Manager (Custom App). App-Store-Review bei Audioaufnahme: Datenschutzerklärung und Mikrofon-Zweckstring.
7. **Build-Umgebung:** Eine iPad-App kann nur mit **Xcode auf einem Mac** gebaut/signiert werden. Diese Cloud-Umgebung (Linux) kann Swift-Code schreiben, aber **nicht kompilieren, nicht auf dem iPad testen**. Alternativ: Web-App (PWA) – lauffähig hier testbar, aber ohne PencilKit, mit eingeschränktem Hintergrund-Audio und schwächerem Offline. Für deinen Funktionsumfang ist PWA **keine** gleichwertige Lösung.
8. **Lizenz:** Nutzt dein Unternehmen Forma **Build** oder nur Docs/Build Essentials? Forms/Issues/Meetings hängen am Produkt (Build Essentials enthält Daily Reports/Forms laut [Autodesk](https://www.autodesk.com/blogs/construction/forma-build-essentials-or-forma-build-comparison/)).

## 9. Was ich von dir brauche, um weiterzugehen

1. Hast du einen Mac mit Xcode und Apple-Developer-Zugang (oder jemanden dafür)? → bestimmt, ob ich Swift-Code liefere oder ein Web-Prototyp.
2. Bist du ACC-Account-Admin (oder erreichbar), um eine Custom Integration freizuschalten? Welche Region (EMEA)?
3. Welche Forma-Produktstufe, und gibt es bereits ein Daily-Log-Template im Projekt?
4. Wie sensibel sind die Gespräche (Bauherr, Rechtsstreit)? → on-device vs. Cloud-LLM.
5. Ein Beispiel deines heutigen Bautagebuchs und Protokolls (anonymisiert), damit Mapping und PDF-Layout stimmen.

## Quellen

- [Public Meeting Minutes API – Autodesk Community](https://forums.autodesk.com/t5/forma-for-construction-ideas/public-meeting-minutes-api/idi-p/14143699)
- [Forma Meetings (Funktionen)](https://construction.autodesk.com/tools/construction-meeting-records/)
- [Forms API](https://aps.autodesk.com/blog/first-autodesk-construction-cloud-acc-specific-api-forms-api), [Forms Write API](https://aps.autodesk.com/blog/autodesk-build-forms-write-api), [POST forms](https://aps.autodesk.com/en/docs/acc/v1/reference/http/forms-forms-POST)
- [Photos API](https://aps.autodesk.com/blog/autodesk-build-photos-api)
- [Issues: lokale Anhänge](https://aps.autodesk.com/en/docs/bim360/v1/tutorials/issuesv2/attach-local-attachment-issues-v2)
- [Dateien in ACC (Data Management)](https://aps.autodesk.com/en/docs/acc/v1/tutorials/files/download-document-s3)
- [Custom Integrations (Admin)](https://help.autodesk.com/cloudhelp/ENU/Docs-Admin/files/account-administration/Custom_Integrations.html)
- [Autodesk Assistant](https://www.autodesk.com/blogs/construction/meet-autodesk-assistant-ai-native-intelligence-in-forma/)
- [SpeechAnalyzer](https://blog.addpipe.com/apple-speechanalyzer-api/), [SpeechAnalyzer vs. Whisper](https://rohitraj.tech/en/notes/apple-speechanalyzer-vs-whisper-on-device-stt-2026)
