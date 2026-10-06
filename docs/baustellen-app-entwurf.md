# Baustellen-Protokoll-Assistent (iPad) – Entwurf v2

Stand: 2026-10-06 · Status: **Phase 1 umgesetzt („Feldtest 1“, siehe Abschnitt 0)** · v1 liegt in der Git-Historie

**Was sich gegenüber v1 geändert hat:** v1 plante eine native iPad-App, die alles kann. Nach vier parallelen
Recherchen (offizielle Forma-App, API-Nachprüfung, Diktat/Spracherkennung, Rechtslage) ist das überholt:

1. Die **offizielle Forma-App deckt Bautagebuch, Fotos mit Einzeichnung, Mängel mit Plan-Pin und Plan-Markups bereits ab.** Das nachzubauen wäre verschwendete Arbeit.
2. Die echte Lücke ist das **Besprechungs- und Begehungsprotokoll**: schnell per Diktat erfassen, Skizze dazu, prüfen, an Firmen versenden, in Forma ablegen.
3. **Kein Mitschnitt aller Teilnehmer**, sondern du diktierst das Ergebnis je Tagesordnungspunkt selbst. Das ist rechtlich am saubersten und technisch am zuverlässigsten.
4. **Web-App statt nativer App.** Ohne Mac/Xcode ist eine native App nicht baubar. Die Web-App läuft im Safari auf dem iPad, nutzt die Diktiertaste der iPad-Tastatur und den Apple Pencil, und ich kann sie in dieser Umgebung bauen und testen. Sie passt auf den bestehenden Stack dieses Repos (Node, Express, SQLite). *(Überholt, siehe Abschnitt 0: gebaut als eigenständige App ohne Server.)*

---

## 0. Stand der Umsetzung und Entscheidungen (06.10.2026)

**App:** https://chrissaringer-maker.github.io/Chris-CMS/ · Code im Zweig `claude/baustellen-protokoll-app`
(veröffentlicht über `gh-pages`). Anleitung, Gerätetest und Wunschliste stehen dort in `README.md` und `WUNSCHLISTE.md`.

| Entscheidung | Begründung |
|---|---|
| Eigenständige statische Web-App **ohne Server**, Daten nur in IndexedDB auf dem iPad | Kein Betrieb, keine Kosten, offline auf der Baustelle; Preis: Sicherung ist Pflicht, kein Abgleich zwischen Geräten |
| Zuerst nur die Erfassung (Diktat, Fotos, Skizzen, PDF); **Schnittstellen zu Forma später** | Vorgabe des Nutzers; bis dahin PDF von Hand in Forma Files ablegen |
| Diktat = **eigene Zusammenfassung**, kein Mitschnitt; Unklares als „unklar“ markieren; **Vorabzug vor Endfassung** | § 120 StGB, Beweiswert, Fehler von Spracherkennung abfangen |
| Gesamtprotokoll an den ganzen Verteiler, optional je Firma „Ihre offenen Punkte“ | Vorschlag des Nutzers |
| Nummer = **Leistungsgruppe.laufende Nummer** (z. B. 39.001–39.999), je Projekt, bleibt fix | Vorgabe des Nutzers (LB-HB) |
| Einwendungsfrist **14 Tage ab Übermittlung**, Verfasser ist Pflicht | ÖNORM B 2110 – nur wirksam, wenn im Bauvertrag vereinbart |
| **Querformat, Bedienung mit dem rechten Daumen:** Knopffeld unten rechts, Optik „iPad-nativ“ (Variante C) | Vorgabe des Nutzers |
| **Funktionsstopp bis nach drei echten Besprechungen** | Prüfung (Masterdirektorium/Mastersekretariat), vom Nutzer bestätigt; Wünsche gehen auf die Wunschliste |

**Am Gerät noch offen:** Funktioniert die Spracherkennung in der installierten Home-Bildschirm-App (sonst Tastatur-Diktat
bzw. später Sprachnotiz + lokales Whisper)? Teilen großer PDFs an Outlook, Apple Pencil, Verhalten bei längerem Hintergrund.

---

## 1. Analyse deiner Stellungnahme

| Deine Aussage | Bewertung | Konsequenz |
|---|---|---|
| „Schau auf meinem iPad nach“ | Nicht möglich. Ich laufe in einem Cloud-Container ohne Verbindung zu iPad oder Computer. | Bitte selbst nachsehen: **Einstellungen → Allgemein → Info** (Modellname, iPadOS-Version). Für die Web-App ist das Modell zweitrangig; relevant wird es erst für KI auf dem Gerät (ab M1 bzw. iPad mini A17 Pro). |
| „Ich bin ACC-Account-Admin“ | Gut, damit kannst du die Integration selbst freischalten. Der Bereich heißt inzwischen **Hub Admin**. | Freischaltung unter Hub Admin → Custom Integrations (Kap. 4). |
| „Forma-Stufe? Nie gehört“ | Gemeint ist die gekaufte Lizenz. **Forma Build** hat Meetings. **Forma Build Essentials** hat Forms, Fotos und Issues, aber **keine Meetings**. **Forma Data Management** (früher Docs) hat keins davon. | Prüfen: Web → Produktauswahl **Hub Admin → Subscriptions**. |
| „Keine vertraulichen Gespräche, Inhalt geht ohnehin per Mail raus“ | Entlastet beim Datenschutz und erlaubt den Einsatz einer Cloud-KI. **Österreich (maßgeblich):** Die *Aufnahme* durch einen Gesprächsteilnehmer ist nicht strafbar (§ 120 Abs. 1 StGB), die *Weitergabe der Tonaufnahme* ohne Einverständnis schon (Abs. 2). Zivilrechtlich ist die Aufnahme einer geschäftlichen Besprechung ohne Zustimmung grundsätzlich rechtswidrig (OGH 6 Ob 190/01m), und die DSGVO verlangt Information bzw. Einwilligung. | Kap. 4. Die Variante ohne Audiospeicherung ist besser, das eigene Diktat noch besser. |
| „Nur die Zusammenfassung speichern, nicht das Gespräch“ | Gangbar (Variante C), in Österreich **niedriges bis mittleres Risiko**: keine Tonaufnahme, also kein § 120 StGB. Die DSGVO gilt trotzdem (Ansage zu Beginn, Löschfristen). **Achtung: Die iPad-Notizen-App speichert bei der Transkription die Audiodatei. Das ist Variante A, nicht C.** | C als Zusatzfunktion; Hauptweg ist das eigene Diktat (B). |
| „Unklares markieren wir als ‚können wir uns nicht mehr erinnern‘, Vorabzug“ | Gute Praxis, mit einer Lücke: **Die gefährlichen Fehler sind plausible falsche Werte** (15.10. statt 5.10., Meier statt Maier), die niemand als unklar erkennt. | Automatische Prüfung (Kap. 7.3). Ein „Vorabzug“ hat vermutlich **keine** Bestätigungswirkung, also braucht es eine Endfassung mit Einwendungsfrist. |
| „Diktat am Computer per Shift, lernt aus meiner Sprache“ | Welches Tool das ist, ist unbekannt. **Die Stimme lernt nur Dragon.** Wispr Flow, Superwhisper, Aqua Voice und Windows Voice Access lernen nur **Wörter** (Vokabelliste). Win+H, M365-Diktat und Whisper lernen gar nichts. Ein Kandidat mit Shift ist **Windows Voice Access (Alt+Shift+B)**. | Ein Stimmprofil lässt sich auf kein iPad übertragen. Was sich übertragen lässt, ist eine **gemeinsame Begriffsliste** (Kap. 6). |

## 2. Kaufen statt bauen: Was die offizielle Forma-App heute kann

Basis: Autodesk-Hilfe, gelesen über das Autodesk-Help-MCP, Stand 10/2026.

| Bedarf | Offizielle iPad-App | Bewertung |
|---|---|---|
| **Bautagebuch** | Forms mit Daily-Log-Vorlage: ausfüllen, Fotos, Unterschrift, **Wetter automatisch** (Apple WeatherKit, Projektstandort), PDF, offline mit späterem Sync | **Nicht nachbauen.** Freitext per iPad-Diktiertaste. |
| **Fotos mit Einzeichnung** | Aufnahme, Alben, Tags, GPS, Freihand-Markup (als Kopie, das Original bleibt) | **Nicht nachbauen.** |
| **Mängel / Issues** | Anlegen mit **Pin auf dem Plan**, Foto mit Zeichnung, Zuweisung an eine Firma | **Nicht nachbauen.** Bei Begehungen Mängel direkt hier erfassen. Die API kann **keine** Plan-Pins setzen, die App schon. |
| **Skizze auf Plan** | Stift, Textmarker, Formen, Text, Wolke | Vorhanden. |
| **Leere Skizzenseite** | Nein. Umweg: ein leeres PDF hochladen und darauf zeichnen | **Lücke**, die die eigene App schließt. |
| **Meetings auf dem iPad** | Ansehen, anlegen, Themen bearbeiten. **Anwesenheit, Aktionspunkte mit Zuweisung, PDF-Export und Versand sind nur im Web dokumentiert.** Offline nur lesbar. | **Hauptlücke.** |
| **Versand an Firmen** | Meetings: nur im Web („Share with invitees/non-members“). Forms: Link oder iOS-Teilen-Menü. | Lücke. |
| **Sprache** | Nur das normale iPad-Diktat. KI-Issue-Erfassung ist private Beta (EBA/Unlimited). Der „Daily Log Agent“ (gesprochener Bericht wird Bautagebuch) ist auf der AU 2026 als *coming soon* angekündigt, der neue Assistant für 2027. | Autodesk arbeitet daran. Was wir beim Bautagebuch bauen, könnte bald überholt sein; ein Grund mehr, dort nichts zu bauen. |

**Zuerst ohne Code testen** (Phase 0): Öffne Forma Meetings im **Safari auf dem iPad** (Web-Oberfläche, nicht die App) und probiere aus, ob Anwesenheit, Aktionspunkte und Versand dort brauchbar sind. Wenn ja, schrumpft die eigene App auf ein Diktat- und Skizzenwerkzeug. Ungetestet, Konfidenz niedrig.

## 3. API-Realität (nachgeprüft)

Methodik: APS-Seiten waren für den direkten Abruf gesperrt. Grundlage sind Suchauszüge, die offiziellen Postman-Collections auf GitHub und die Autodesk-Hilfe.

| Fähigkeit | Status | Konfidenz |
|---|---|---|
| Meetings schreiben | **Nein.** Eine interne API existiert, die Community-Idee steht seit 27.05.2026 auf „Gathering Support“. Lesend über den Data Connector (`meetingminutes_meetings.csv`). | mittel–hoch |
| Forms anlegen | Ja (`POST …/form-templates/{id}/forms`), Start im Status *draft* | hoch |
| Forms-Werte schreiben | Nur Web-Formulare (nicht PDF): Text, Zahl, Datum, Schalter, **Unterschrift** (`svgVal`), Tabellen **Work Log (Personal), Material, Geräte**; eigene Tabellen über v2 (Beta seit 30.03.2026) | hoch |
| Forms abschließen | `PATCH status=submitted` | hoch |
| **Legacy-Forms-Endpunkte** | **Entfallen am 31.12.2026**, also direkt auf v2 aufbauen | hoch |
| Form-Vorlagen per API | Nein, nur im Web anlegen | hoch |
| Wetter | Nur lesbar (Beta) | hoch |
| Fotos/Anhänge an Formulare | Kein Upload-Endpunkt; eventuell Verknüpfung über die Relationship-API | niedrig–mittel |
| Photos-Modul schreiben | **Nein**, weiterhin nur lesend | hoch |
| Issues | Anlegen, ändern, kommentieren, **bis 200 Anhänge**, `locationId`, **Zuweisung an eine Firma** (Forma mailt dann an alle Mitglieder der Firma; ob das bei API-Anlage auch passiert, ist ungetestet). **Keine Plan-Pins** (offiziell). | hoch |
| Dateien nach Files | Ja (Data Management: Storage → signierte S3-URL → Version). Für DEU/EMEA-Projekte eventuell mit Region-Angabe. | hoch / Region: mittel |
| Login | OAuth mit PKCE ohne Client Secret (App-Typ „Desktop, Mobile, Single-Page App“). Access Token 60 min, Refresh Token 15 Tage, rotiert bei jeder Nutzung. | hoch / mittel |
| Freischaltung | Hub Admin → Custom Integrations → Add → APS Client ID | hoch |
| Externe Konnektoren | **Forma Connect** (Workato, separat lizenziert). Kein zertifizierter Power-Automate- oder Zapier-Connector. | mittel–hoch |

## 4. Recht (Österreich): Varianten der Spracherfassung

Faktenlage, keine Rechtsberatung. **Maßgeblich ist österreichisches Recht** (Projekte in Österreich). Deutsches Recht wäre strenger (§ 201 dStGB kennt kein Teilnehmerprivileg), spielt hier aber keine Rolle.

| Variante | Strafrecht (StGB) | Zivilrecht und Datenschutz | Risiko |
|---|---|---|---|
| **A: Mitschnitt aller** (auch die iPad-Notizen-App) | Aufnahme durch einen Teilnehmer nicht strafbar (§ 120 Abs. 1). **Strafbar: die Tonaufnahme ohne Einverständnis an Dritte weitergeben oder veröffentlichen** (§ 120 Abs. 2, Verfolgung nur mit Ermächtigung). | Ohne Zustimmung grundsätzlich rechtswidrig (OGH 6 Ob 190/01m, § 16 ABGB). DSGVO/DSG: Externe willigen ein; eigene Mitarbeiter: Betriebsvereinbarung nach ArbVG §§ 96/96a bzw. Zustimmung nach § 10 AVRAG. | mittel; mit dokumentierter Zustimmung niedrig |
| **B: Du diktierst nur dich selbst** | nicht berührt | wie ein handschriftliches Protokoll | **niedrig** |
| **C: Live-Mitschrift, kein Audio gespeichert** | keine Tonaufnahme → § 120 nicht berührt; ein Transkript weiterzugeben erfüllt Abs. 2 nicht (Sekundärquelle) | DSGVO gilt voll: Ansage zu Beginn, Löschkonzept, Auftragsverarbeitung (Microsoft) | niedrig–mittel |

**Bestätigungswirkung des Protokolls:** Die **ÖNORM B 2110** regelt, dass Aufzeichnungen, die nur ein Vertragspartner führt, dem anderen umgehend zu übergeben sind und **als bestätigt gelten, wenn nicht binnen 14 Tagen ab Übergabe schriftlich widersprochen wird** (laut Sekundärquellen; den Normtext konnte ich nicht einsehen, die genaue Punktnummer bitte in deiner Normausgabe prüfen). **Das wirkt nur, wenn die ÖNORM B 2110 im Bauvertrag vereinbart ist** – ÖNORMen sind keine Gesetze. Ohne diese Vereinbarung ist die Lage unsicher: Der OGH sieht Schweigen auf ein Bestätigungsschreiben, das vom tatsächlich Vereinbarten abweicht, grundsätzlich nicht als Vertragsänderung an. Praktisch heißt das:
- ÖNORM B 2110 im Bauvertrag vereinbaren (bei öffentlichen Auftraggebern üblich).
- Das Übermittlungsdatum belegen (gesendete Mail aufheben).
- In der App ist die Frist deshalb standardmäßig **14 Tage ab Übermittlung**, Text und Frist sind je Projekt änderbar.

**Festlegung:** B ist der Hauptweg. C ist optional, mit Ansage zu Beginn („Live-Mitschrift fürs Protokoll, es wird kein Ton gespeichert“). A wird nicht umgesetzt.

## 5. Diktat: Was geht auf dem iPad

| Weg | Fakten | Einsatz |
|---|---|---|
| **Diktiertaste der iPad-Tastatur** | Funktioniert in jedem Textfeld, **auch in Safari-Web-Apps**. Deutsch auf dem Gerät, automatische Satzzeichen, kein Zeitlimit, stoppt nach ~30 s Stille. **Kein eigenes Vokabular.** | **Hauptweg** für „Festgehalten: …“ je Tagesordnungspunkt. Push-to-Talk ergibt sich von selbst: Feld antippen, Mikrofon, sprechen. |
| Kontakte-Trick | Firmen, Personen und Fachbegriffe als Kontakte anlegen; das Diktat erkennt sie dann besser. Über iCloud wirkt das auch auf dem Mac. | Sofort umsetzbar, ohne Code. |
| Scribble (Pencil-Handschrift wird Text) | Handschrift in Textfeldern wird umgewandelt, auch in Safari | Ergänzung, wenn Sprechen unpassend ist. |
| SpeechAnalyzer / DictationTranscriber | Nur für **native** Apps. DictationTranscriber nimmt bis zu **100 Fachbegriffe** als Kontext; SpeechTranscriber nimmt kein eigenes Vokabular und hat Hardware-Hürden. | Nur relevant, falls später nativ (Phase 5). |
| „Verbessertes Diktat“ (iPadOS 27) | **Nur Englisch**, ab M4 mit 12 GB | Irrelevant. |
| Wispr Flow / Superwhisper (Tastatur-Apps) | Wispr Flow: Wörterbuch wird über Geräte **synchronisiert**, nur Cloud, auf dem iPad nur die iPhone-App. Superwhisper: Vokabelliste pro Gerät, keine Synchronisierung. | Nur sinnvoll, wenn dein Computer-Tool eines davon ist. |
| Dragon | Lernt die Stimme, nur unter Windows. **Dragon Anywhere (iOS) gibt es seit 01.07.2026 nicht mehr.** | Kein Weg aufs iPad. |

**„Verbinden“ mit deinem Computer-Diktat** heißt realistisch: Wir führen **eine gemeinsame Begriffsliste** (Firmen, Personen, Gewerke, Abkürzungen, Achsbezeichnungen). Daraus speisen sich drei Dinge: die iPad-Kontakte, die Vokabelliste deines Computer-Tools (falls es eine hat) und die **KI-Nachkorrektur in der App** (Kap. 7.3). Dafür müssen wir wissen, welches Tool es ist.

**Mikrofon:** Ein Ansteckmikrofon mit Windschutz bringt bei Baustellenlärm mehr als jede Software (Headset ~12 % gegenüber ~17 % Wortfehlerrate mit Raummikrofon, englische Studie). Bei Variante B sprichst du nah am iPad, das reicht meist.

## 5a. Beide Modi zusammen: Festhalten + Live-Mitschrift + Begriffsklärung

Entscheidung (06.10.2026): **beide Modi**. „Festgehalten“ ist die verbindliche Quelle fürs Protokoll. Die Live-Mitschrift
dient als Gedächtnisstütze, vor allem für **Fachbegriffe der Firmen**, die später geklärt oder recherchiert werden sollen.

**Spracherkennung für die Live-Mitschrift: Azure AI Speech (Echtzeit) über den Browser.**
- Laut Microsoft: Bei Echtzeit-Transkription wird das Audio **nur im Arbeitsspeicher des Servers verarbeitet, nichts gespeichert** („no data trace“). Das ist technisch genau Variante C. ([Microsoft Learn](https://learn.microsoft.com/azure/foundry/responsible-ai/speech-service/speech-to-text/data-privacy-security))
- **Phrasenliste** (Firmen, Gewerke, Fachbegriffe) wird pro Sitzung mitgegeben. Laut Doku gibt es dafür kein festes Limit.
- **Sprechertrennung** (Sprecher 1, 2, …) ist auch in Echtzeit verfügbar, standardmäßig aus. Die Stimmmerkmale werden laut Microsoft danach verworfen, eine Identifizierung findet nicht statt. Optional.
- Microsoft ist als Auftragsverarbeiter über den bestehenden Microsoft-Vertrag (M365-Tenant vorhanden) abgedeckt. **Ein Azure-Abo mit Region EU ist nötig.** Kosten fallen pro Audiostunde an; den Preis im Azure-Preisrechner prüfen, nicht verifiziert.
- Nicht genutzt wird die **Web Speech API von Safari**: Sie ist auf iOS laut Entwicklerberichten instabil (bricht ab, Zwischenergebnisse unzuverlässig) und kennt keine Phrasenliste. ([Apple-Forum](https://developer.apple.com/forums/thread/775699), [lilting.ch](https://lilting.ch/en/articles/ios-webspeech-api-tips))

**Technische Grenzen der Web-App bei der Live-Mitschrift** (am iPad zu testen, nicht verifiziert):
1. **Wechsel in eine andere App (z. B. Forma, um einen Plan anzusehen) oder Bildschirmsperre unterbricht das Mikrofon im Safari.** Ausweg: Safari und Forma nebeneinander (Split View / Fenster). Ob das Mikrofon dann weiterläuft, muss getestet werden.
2. **Ein Mikrofon, zwei Nutzer:** Läuft die Live-Mitschrift, unterbricht die Diktiertaste der Tastatur sehr wahrscheinlich den Mikrofon-Stream. Darum wird „Festhalten“ im Live-Modus **ein Knopf in der App**: Er markiert den Abschnitt im laufenden Transkript als „Festgehalten“. Ohne Live-Modus bleibt es die Diktiertaste.
3. **Kein Netz, keine Live-Mitschrift.** „Festhalten“ über die Diktiertaste funktioniert offline weiter.
4. **Apple-Pencil-Doppeltipp ist für Web-Apps nicht zugänglich**, nur für native Apps. Der Auslöser ist ein großer Knopf auf dem Bildschirm.

Wenn 1 im Praxistest scheitert, ist das **der** Grund für eine native App (Hintergrund-Audio, Erkennung auf dem Gerät), und dann braucht es einen Mac.

### Ablauf Begriffsklärung
1. **Während der Besprechung:** Du hörst einen unbekannten Begriff und tippst auf **„❓ Begriff“**. Die App merkt sich die Stelle und nimmt die letzten ~20 s und die nächsten ~10 s Transkript als Kontext. Optional schreibst du mit dem Pencil, was du gehört hast (Scribble), auch lautmalerisch („Kompri-Band?“).
2. **Nach der Besprechung:** Liste „Zu klären“. Pro Begriff zeigt die App:
   - erkannten Wortlaut, Kontext, Sprecher und Tagesordnungspunkt;
   - einen KI-Vorschlag: vermutlich gemeinter Fachbegriff samt Schreibweise, Kurzbedeutung, Gewerk und „sicher / unsicher“;
   - Aktionen: **geklärt** · **Rückfrage an Firma X** (fertiger Mailtext mit Kontext) · **recherchieren** (KI mit Websuche, nur mit Quellen; Normverweise gelten als Suchhinweis, nicht als Beleg).
3. **Geklärte Begriffe** übernimmst du mit einem Tipp ins **Projekt-Glossar**. Ab der nächsten Besprechung stehen sie in der Phrasenliste der Spracherkennung und in der Nachkorrektur. **Das ist das „Lernen“:** nicht die Stimme, sondern dein Fachwortschatz, und zwar nachvollziehbar.

**Ehrliche Grenze:** Genau seltene Fachbegriffe, von weiter weg gesprochen, erkennt jede Spracherkennung am schlechtesten. Oft kommt ein ähnlich klingendes Alltagswort heraus. Der Kontextsatz rettet die Deutung häufig, aber nicht immer. Die zuverlässigste Methode bleibt die direkte Rückfrage in der Besprechung („Wie schreibt man das?“); die landet dann ebenfalls im Transkript.

**Aufbewahrung:**
- Das vollständige Transkript wird gelöscht, sobald die Einwendungsfrist abgelaufen ist.
- Begriffs-Ausschnitte bleiben, bis du den Begriff als geklärt markierst, höchstens 90 Tage (Wert anpassbar).
- Zu Beginn der Besprechung gibt es eine Ansage. Ein **Pause-Knopf** ist jederzeit erreichbar, falls jemand nicht mitgeschrieben werden will.

## 6. Architektur v2: Web-App

```
iPad (Safari, als Web-App auf dem Home-Bildschirm)
 ├─ Protokoll-Editor: Tagesordnungspunkte, „Festgehalten“-Felder (iPad-Diktat), Status, Zuständig, Frist
 ├─ Skizzenseite: Canvas + Apple Pencil (Druck, Neigung über Pointer Events)
 ├─ Fotos: Kamera über <input capture>, Markup im Canvas (Original bleibt)
 ├─ Lokaler Zwischenspeicher: IndexedDB (Entwurf geht bei Funkloch nicht verloren)
 └─ Teilen: PDF über das iOS-Teilen-Menü → Outlook
        │ HTTPS
Server (bestehender Stack dieses Repos: Node, Express, SQLite; Hosting in der EU)
 ├─ Login (vorhanden, wird ausgebaut)
 ├─ Projekte, Teilnehmer, Firmen, Begriffsliste, Protokolle, offene Punkte
 ├─ KI-Strukturierung + Nachkorrektur (API-Schlüssel nur auf dem Server)
 ├─ Live-Mitschrift: Kurzzeit-Token für Azure AI Speech (EU) ausgeben; Audio geht vom iPad direkt zu Azure, nicht über unseren Server
 ├─ Begriffsklärung + Projekt-Glossar (speist Phrasenliste und Nachkorrektur)
 ├─ Prüfung ohne KI: Zahlen, Daten, Namen gegen den diktierten Text
 ├─ PDF-Erzeugung (Vorabzug / Endfassung)
 ├─ Forma-Anbindung (Phase 2): OAuth PKCE, Upload nach Files, Issues für Aufgaben
 └─ optional: Versand über Microsoft Graph (Outlook) statt Teilen-Menü
```

**Warum Web statt nativ:**

| Kriterium | Web-App | Native App |
|---|---|---|
| Baubar ohne Mac/Xcode | **Ja**, und hier testbar | Nein (Mac + Apple-Developer-Programm 99 $/Jahr) |
| Diktat | iPad-Tastatur (gleiche Engine), ohne Vokabular | DictationTranscriber mit 100 Begriffen |
| Apple Pencil | Gut (Druck, Neigung); kein PencilKit-Komfort | PencilKit, bestes Schreibgefühl |
| Offline | Eingeschränkt. Safari kann Speicher nicht installierter Seiten nach 7 Tagen ohne Nutzung löschen; als Web-App auf dem Home-Bildschirm gilt das laut WebKit nicht (vorher prüfen). Deshalb sofort zum Server synchronisieren. | Zuverlässig |
| Verteilung, Updates | Link genügt, Updates sofort | TestFlight oder App Store |

Die Web-App reicht für Variante B vollständig, weil die Spracherkennung von der iPad-Tastatur kommt und nicht von der App. Nativ lohnt erst, wenn sich in der Praxis zeigt, dass Vokabular oder Offline-Betrieb fehlen.

**KI-Anbieter:** Die Gespräche sind nicht vertraulich, daher ist eine Cloud-KI vertretbar. Sie verarbeitet aber Namen von Personen, also braucht es einen Auftragsverarbeitungsvertrag und möglichst Verarbeitung in der EU. Das EU-US Data Privacy Framework steht seit 07/2026 unter Druck (EDPB-Überprüfungsantrag). Konkreten Anbieter erst in Phase 3 festlegen.

## 7. Abläufe

### 7.1 Baubesprechung
1. **Vorbereiten:** Neues Protokoll aus dem letzten. Offene Punkte wandern automatisch mit, wie bei Forma Meetings. Teilnehmerliste aus der Firmenliste. Anwesenheit abhaken.
2. **Während:** Pro Tagesordnungspunkt ins Feld „Festgehalten“ tippen, diktieren: *„Firma Müller, Brandschott Achse 3, bis 15.10.“* Zuständig und Frist werden daraus vorgeschlagen, ändern geht per Tipp. Skizze oder Foto lassen sich dem Punkt zuordnen. Optional läuft eine Live-Mitschrift (Variante C) mit.
3. **Danach:** Die KI glättet die Formulierungen und schlägt Zuständige und Fristen vor. Die Prüfung ohne KI markiert gelb, was nicht belegt ist. Du prüfst und gibst frei.
4. **Vorabzug (optional):** PDF mit „VORABZUG“, offene Stellen als „[unklar – bitte ergänzen]“, an die Firmen zur Ergänzung.
5. **Endfassung:** PDF mit Verteiler und Satz „Einwendungen binnen 14 Tagen ab Übermittlung schriftlich, andernfalls gilt das Protokoll als bestätigt“ (ÖNORM B 2110, sofern vereinbart). Versand über das Teilen-Menü → Outlook. Ab Phase 2 zusätzlich Ablage in Forma Files und Aufgaben als Issues, zugewiesen an die Firma.
6. **Aufräumen:** Ein eventuelles Mitschrift-Transkript wird nach Ablauf der Einwendungsfrist automatisch gelöscht.

### 7.2 Baubegehung
- **Mängel in der offiziellen Forma-App** erfassen (Issue mit Plan-Pin, Foto, Zeichnung, Zuweisung an die Firma). Das kann die eigene App per API nicht besser.
- **Bericht** in der eigenen App wie die Besprechung (Teilnehmer, Feststellungen, Skizzen). In Phase 2 werden die Issues der Begehung über die API gelesen und als Liste ins PDF übernommen.

### 7.3 Absicherung gegen KI- und Diktatfehler
- **Regel für die KI:** Termine, Firmen, Mengen, Orte und Achsen werden nur aus dem diktierten Text übernommen. Fehlt etwas, schreibt sie „[unklar]“ und rät nie.
- **Prüfung ohne KI:** Jede Zahl, jedes Datum und jeder Firmenname im Ergebnis muss im Diktat vorkommen, sonst wird er gelb markiert.
- **Begriffsliste:** Die Nachkorrektur darf nur auf Begriffe aus der Liste korrigieren („Mayer Bau“ → „Maier Bau GmbH“). Jede Änderung wird sichtbar markiert.
- **Freigabe:** Ohne deine Bestätigung wird nichts versendet und nichts zu Forma übertragen.

### 7.4 Bautagebuch
Bleibt in der **offiziellen Forma-App** (Daily-Log-Formular mit automatischem Wetter, Freitext per Diktiertaste). Ein Eintrag aus der eigenen App heraus über Forms v2 ist technisch möglich, lohnt aber erst, wenn die offizielle App im Alltag zu langsam ist, und erst nach Autodesks angekündigtem Daily Log Agent.

## 8. Phasenplan

| Phase | Inhalt | Aufwand (grob) | Ergebnis / Abbruchkriterium |
|---|---|---|---|
| **0 – Ohne Code (diese Woche)** | Hub Admin → Subscriptions prüfen. Forma Meetings im iPad-Safari testen. Forma-App: Bautagebuch und Begehung je einmal mit Diktiertaste ausprobieren. Computer-Diktat-Tool identifizieren. 20 Fachbegriffe/Firmen als Kontakte anlegen. | 2–3 h | Klare Liste, was wirklich fehlt. Wenn Meetings im Safari genügen, schrumpft Phase 1 stark. |
| **1 – Web-App MVP** ✅ *umgesetzt, im Feldtest* | Projekte, Firmen, Teilnehmer, Protokoll mit Tagesordnungspunkten, Diktatfelder, offene Punkte übernehmen, Skizzenseite, Fotos, PDF (Vorabzug/Endfassung), Teilen. Kein Forma, keine KI. | 1–2 Wochen Sessions | Eine echte Baubesprechung damit protokolliert und versendet. **Danach drei echte Besprechungen, erst dann neue Funktionen.** |
| **2 – Forma-Anbindung** | Custom Integration, OAuth, PDF nach Files, Aufgaben als Issues an Firmen, Issues der Begehung lesen. Vorher den Postman-Test (Kap. 9). | ~1 Woche | Protokoll liegt ohne Handarbeit in Forma. |
| **3 – KI + Live-Mitschrift** | Strukturierung, Nachkorrektur mit Glossar, Prüfung ohne KI. Live-Mitschrift über Azure (Kap. 5a) mit „❓ Begriff“ und Begriffsklärung. **Zuerst Praxistest:** Mikrofon bei Split View mit Forma, Diktiertaste neben laufendem Stream, LTE im Baucontainer. | ~1–2 Wochen | Wenn das Mikrofon beim App-Wechsel abbricht und Split View nicht reicht: Entscheidung native App (Mac nötig). |
| **4 – Optional** | Versand über Microsoft Graph, Bautagebuch über Forms v2, Meetings-API (falls freigegeben), native App (falls Phase 1–3 Grenzen zeigen). | – | – |

## 9. Postman-Test vor Phase 2

1. Daily-Log-Vorlage finden, v2-Layout abrufen, Feld-IDs prüfen.
2. Auswahlfelder und eigene Tabellen über v2 testen.
3. Nach `status=submitted`: Kommen Mails? Gibt es weitere Status?
4. Wetter: Lässt es sich überschreiben (erwartet: nein)?
5. `relationships:writable`: Lassen sich Formular und Datei verknüpfen?
6. Issue mit Foto-Anhang: Wird das Bild in Web und App angezeigt?
7. Issue an eine Firma per API: Bekommen deren Mitglieder eine Mail?
8. Plan-Platzierung (`linkedDocuments`, „Issue Placements“-Beta) bei Autodesk erfragen.
9. DEU-/EMEA-Projekt: Forms/Issues ohne Region-Header, Upload mit Region.
10. Ohne Freischaltung 403, nach Freischaltung Erfolg.

## 10. Was ich von dir brauche

1. **Hub Admin → Subscriptions:** Steht dort „Forma Build“ oder „Build Essentials“?
2. **Computer-Diktat:** *Teilweise geklärt:* lokales Whisper-Programm auf dem PC, früher mit Claude gebaut, Name unbekannt. Für eine spätere Anbindung wird der Code bzw. der Ordner des Programms gebraucht.
3. **iPad-Modell** (Einstellungen → Allgemein → Info). Nicht kritisch, nur für spätere KI auf dem Gerät.
4. **Ein anonymisiertes Beispiel** deines heutigen Besprechungsprotokolls (PDF/Word): Danach richte ich PDF-Layout und Felder aus.
5. ~~Deutschland oder Österreich?~~ **Geklärt: Österreich.** Einwendungsfrist 14 Tage (ÖNORM B 2110), Nummerierung nach Leistungsgruppe (z. B. 39.001).
6. ~~Entscheidung Web-App oder nativ~~ **Entschieden:** eigenständige Web-App ohne Server (Abschnitt 0).
7. **Azure:** Gibt es zu deinem Microsoft-365-Tenant schon ein Azure-Abo? Für die Live-Mitschrift wird eins gebraucht (Region EU).
8. **Rolle:** Protokollierst du als **ÖBA** (für den Bauherrn) oder als **Bauleiter des Auftragnehmers**? Davon hängen Kennzeichen wie Mehrkostenforderung/Behinderung und der Protokollkopf ab.
9. **Vertrag:** Ist die **ÖNORM B 2110** in deinen Bauverträgen vereinbart? Sonst trägt die 14-Tage-Klausel nicht automatisch.
10. **iPad:** Privat oder **Firmengerät mit Verwaltung** (z. B. Intune)? Verwaltung kann Home-Bildschirm-Apps, Mikrofon oder Speicher einschränken.

## Quellen (Auswahl)

**Forma-App und Produkt** (Autodesk-Hilfe): Meetings mobil `help.autodesk.com/view/BUILD/DEU/?guid=Meetings_Mobile_App` · Meetings verwalten/teilen `?guid=Manage_Meetings` · Forms mobil `?guid=Submit_Forms_Mobile` · Wetter `?guid=Forms_Weather` · Fotos iOS `?guid=Photos_New_iOS` · Markups mobil `?guid=Markups_Mobile` · Vergleich Build/Essentials `?guid=Build_Essentials_Comparison`, [Autodesk-Blog](https://www.autodesk.com/blogs/construction/forma-build-essentials-or-forma-build-comparison/) · Hub Admin Subscriptions `help.autodesk.com/view/DOCS/ENU/?guid=Hub_Admin_Subscriptions` · [AU 2026 / Daily Log Agent](https://adsknews.autodesk.com/en/news/autodesk-forma-ai-aec-connected-workflows-2026/)

**API:** [Public Meeting Minutes API (Idee)](https://forums.autodesk.com/t5/forma-for-construction-ideas/public-meeting-minutes-api/idi-p/14143699) · [Forms Write API](https://aps.autodesk.com/blog/autodesk-build-forms-write-api) · [Template Layout & Custom Table API](https://aps.autodesk.com/blog/forms-template-layout-and-custom-table-api-are-released) · [Photos API](https://aps.autodesk.com/blog/autodesk-build-photos-api) · [Issues-Anhänge](https://aps.autodesk.com/en/docs/bim360/v1/tutorials/issuesv2/attach-local-attachment-issues-v2) · [PKCE-App-Typen](https://aps.autodesk.com/blog/new-application-types) · [Regionen](https://aps.autodesk.com/blog/expanding-regional-offerings-uk-germany-japan-canada-and-india) · [Postman Build](https://github.com/autodesk-platform-services/aps-autodesk.build.api-postman.collection/) · [Custom Integrations](https://help.autodesk.com/cloudhelp/ENU/Docs-Admin/files/account-administration/Custom_Integrations.html)

**Recht (Österreich):** [§ 120 StGB](https://www.ris.bka.gv.at/Dokumente/Bundesnormen/NOR12039404/NOR12039404.html) · [OGH 6 Ob 190/01m](https://www.ris.bka.gv.at/JustizEntscheidung.wxe?Abfrage=Justiz&Dokumentnummer=JJT_20010927_OGH0002_0060OB00190_01M0000_000) · [Weitergabe von Transkripten (jusguide)](https://www.jusguide.at/index.php?id=88&tx_ttnews%5Btt_news%5D=10464) · [ÖNORM B 2110 – Skriptum Uni Wien](https://zivilrecht.univie.ac.at/fileadmin/user_upload/i_zivilrecht/Zoechling-Jud/Karasek/Skriptum_OENORM_B2110_WS_2017.pdf) · [ÖNORM B 2110 – Dokumentation (bw-b)](https://www.bw-b.com/bauwirtschaft-infobox/oenorm-b-2110-baudokumentation-bautagesberichte-und-dokumentation/) · [LB-HB (BMWET)](https://www.bmwet.gv.at/Services/Bauservice/LB-HB-023-PDF.html) · [EDPB zu DPF](https://iapp.org/news/a/edpb-requests-review-of-eu-us-data-privacy-framework-following-trump-v-slaughter) · [Notizen-App Audio](https://appleinsider.com/inside/ios-18/tips/how-to-record-audio-and-create-transcripts-in-notes-in-ios-18)

**Diktat:** [Dragon Accuracy Tuning](https://www.nuance.com/products/help/dragon1561/dragon-for-pc/enx/dpg-vla/Content/Accuracy/about_accuracy_tuning.htm) · [Dragon Anywhere eingestellt](https://www.getvoibe.com/resources/dragon-anywhere-discontinued/) · [Windows Voice Access](https://support.microsoft.com/en-us/accessibility/windows/voice-access/get-started-with-voice-access) · [Wispr Flow Dictionary](https://docs.wisprflow.ai/articles/4052411709-teach-flow-your-words-with-the-dictionary) · [Superwhisper iOS](https://superwhisper.com/docs/get-started/ios) · [Kontakte-Trick](https://tidbits.com/2026/05/15/tipbits-how-fake-contacts-can-fix-dictations-proper-noun-problems/) · [DictationTranscriber](https://developer.apple.com/documentation/speech/dictationtranscriber) · [SpeechTranscriber Hardware](https://developer.apple.com/forums/thread/801197) · [Notizen-Transkript Deutsch](https://support.apple.com/guide/ipad/record-and-transcribe-audio-ipadd0bde806/ipados) · [iPadOS 27 Diktat nur Englisch](https://www.macobserver.com/tips/round-ups/ios-27-dictation-spelling-punctuation-english-select-iphones/)

**Nicht verifiziert** (Primärquellen gesperrt, nur Suchauszüge): AU-2026-Ankündigungen, Token-Laufzeiten, Region-Header, Placements-Beta, Mailversand bei API-Aktionen, Web-App-Speicherregel in Safari, Meetings-Web-Oberfläche auf dem iPad.
