# Baustellen-Protokoll

Web-App fürs iPad: Baubesprechungen und Baubegehungen erfassen – diktieren, fotografieren, skizzieren –
und als PDF-Protokoll an die Firmen verschicken. Offene Punkte werden automatisch in die nächste Sitzung übernommen.

**Stand: „Feldtest 1“.** Kein Server, kein Login, keine KI, keine Anbindung an Forma. Alle Daten bleiben auf dem iPad.
**Funktionsstopp bis nach drei echten Besprechungen** – neue Wünsche kommen auf die [Wunschliste](WUNSCHLISTE.md).

## Auf dem iPad einrichten

1. In **Safari** die App-Adresse öffnen: **https://chrissaringer-maker.github.io/Chris-CMS/**
2. **Teilen → Mehr anzeigen → „Zum Home-Bildschirm“ → Hinzufügen.**
3. **Ab jetzt nur noch die App vom Home-Bildschirm benutzen.** Safari und die installierte App speichern
   getrennt – was du in Safari eingibst, siehst du in der App nicht.
4. Empfohlen: **Ausrichtungssperre** (Querformat) und in den iPad-Einstellungen unter „Gesten“ das Wischen aus
   der Ecke abschalten, damit beim Bedienen mit dem Daumen keine Schnellnotiz aufgeht.
5. Einmal pro Woche **Sicherung** erstellen und in OneDrive oder „Dateien“ ablegen. Die App erinnert daran.

## Bedienung mit einer Hand (Querformat)

Alle Aktionen liegen im **Knopffeld unten rechts** am Daumen der Haltehand (unter „Sicherung“ umstellbar auf
links bzw. Mitte des Randes). In der Besprechung, von oben nach unten:

| | |
|---|---|
| **Mehr** (Zurück, Skizze, Vorabzug, Endfassung, Versand …) | **▲ Vorher** |
| **Erledigt** (aktueller Punkt) | **▼ Weiter** (Position, z. B. 3/12) |
| **Foto** (zum aktuellen Punkt) | **+ Punkt** |
| **Diktat → Nummer des aktuellen Punkts** (breit, ganz unten) | |

Der **aktuelle Punkt** ist blau umrandet. Er wechselt nur durch Antippen oder mit ▲/▼, nicht beim Scrollen.

## Ablauf einer Besprechung

1. Projekt anlegen, unter **Firmen** die Firmen mit Gewerk, **Leistungsgruppe** (LB-HB, z. B. 39 Trockenbau),
   Ansprechpartner und E-Mail eintragen. Die Kontakte „im Verteiler“ bilden den Verteiler.
2. **Neue Besprechung** (oder **Begehung**). Offene und unklare Punkte früherer Sitzungen sind schon drin –
   auch solche, die du in der Vorsitzung nachträglich ergänzt hast (Abgleich beim Öffnen).
3. **Anwesenheit:** Tipp auf den Knopf neben dem Namen schaltet weiter: offen → anwesend → entschuldigt →
   nicht erschienen. Neue Sitzungen beginnen bewusst mit „offen“.
4. **+ Punkt**, dann **Diktat** (siehe unten) oder ins Textfeld tippen. Zuständig, Frist, Art und Status setzen.
   **Überfällig** = Status offen und Frist vor dem Besprechungstag: in der Punktkarte rot mit Tagen
   („3 Tage überfällig“), im PDF rot in der Spalte Frist, in der Firmen-Mail ganz oben. Gerechnet wird immer
   zum **Besprechungstag**, nicht zum Versandtag – so bleiben PDF und Mail gleich, auch wenn später versendet wird.
   Unsicheres mit **„unklar“** markieren – erscheint im PDF als „[unklar – bitte ergänzen]“ und wird fortgeschrieben.
5. Je Punkt: **Foto**, **Mediathek** (auch abfotografierte Papierskizzen), **Skizze** (Apple Pencil).
6. Optional **Vorabzug-PDF** (Wasserzeichen „VORABZUG“) an die Firmen zur Ergänzung.
7. **Endfassung abschließen:** verlangt einen **Verfasser** (Adressat der Einwendungen) und warnt bei offener
   Anwesenheit, unklaren Punkten, leeren Punkten und fehlendem nächsten Termin. Danach ist die Sitzung gesperrt;
   Änderungen nur als **neue Fassung** (das PDF vermerkt „Ersetzt Fassung n vom …“).
8. **Verteiler kopieren** → **PDF teilen** (zwei Schritte: Datei wird erzeugt, dann „Teilen …“) → Outlook →
   Adressen ins Feld „An“ einfügen. Jedes versendete PDF zusätzlich in **Forma Files** ablegen (Archiv, Vertretung).
9. Optional je Firma **„Ihre offenen Punkte“** – Outlook öffnet sich mit fertiger Mail an die Kontakte im Verteiler
   (überfällige Punkte zuerst, Hinweis „Maßgeblich ist das Gesamtprotokoll“).

## Diktat

- Der Knopf **Diktat** nutzt die Spracherkennung von Safari: tippen, sprechen, **Stopp** tippen. Der Text kommt in
  den aktuellen Punkt. Gesprochen wird nur die **eigene Zusammenfassung** – kein Mitschnitt der Besprechung.
- Ein laufendes Diktat endet automatisch beim Verlassen der Ansicht, bei Foto/Skizze und wenn die App in den
  Hintergrund geht. Nach Sprechpausen startet es höchstens dreimal in 10 s neu.
- **Datenschutz:** Safari kann die Sprache zur Erkennung an Apple-Server senden (nicht garantiert auf dem Gerät).
- **Ungeklärt:** In der installierten Home-Bildschirm-App ist die Spracherkennung laut Berichten teils gesperrt.
  Dann zeigt der Knopf „Tastatur-Diktat“ und öffnet die Tastatur; diktiert wird mit der Mikrofon-Taste der Tastatur.
  Ob es auf deinem iPad geht, zeigt der Gerätetest. Wenn nicht: Sprachnotiz als Tonaufnahme steht auf der Wunschliste.

## Nummerierung nach Leistungsgruppe

- Nummer = **Leistungsgruppe.laufende Nummer**, z. B. `39.001` … `39.999` für LG 39 Trockenbau.
- Gezählt wird **je Projekt**, über alle Baubesprechungen und Begehungen hinweg. Eine Nummer bleibt dem Punkt für immer.
- Neue Punkte starten unter **LG 00 (Allgemein)**. Wählst du die zuständige Firma, übernimmt der Punkt deren LG
  (z. B. aus `00.003` wird `39.004`). Die LG kann auch direkt in der Punktkarte gewählt werden („Andere LG …“ für weitere).
- Umnummerieren geht nur, solange der Punkt nicht in eine weitere Sitzung übernommen wurde.
- Im PDF sind die Punkte nach Leistungsgruppe gegliedert.

## Österreich: Einwendungsfrist

Standard im Protokoll: *„Einwendungen gegen dieses Protokoll sind binnen 14 Tagen ab Übermittlung schriftlich beim
Verfasser zu erheben. Andernfalls gilt das Protokoll als bestätigt.“* Das entspricht der 14-Tage-Regel der
**ÖNORM B 2110** für einseitige Aufzeichnungen – wirksam nur, wenn die Norm im Bauvertrag vereinbart ist.
Frist und Text sind je Projekt unter **Projektdaten** änderbar. Keine Rechtsberatung.

## Sicherung und Updates

- **Sicherung** = eine Datei `….bpsicherung` (Bilder als Rohdaten, kein Base64). Sie gilt erst als erledigt, wenn
  sie über „Teilen …“ wirklich weitergegeben wurde – bei Abbruch meldet die App „es wurde NICHTS gesichert“.
- **Wiederherstellen** prüft die Datei zuerst; eine beschädigte Datei verändert nichts. Alte JSON-Sicherungen
  werden weiterhin eingelesen.
- **Updates** kommen nicht mehr unbemerkt: Eine neue Version wird im Hintergrund geladen und erst nach Tipp auf
  **„Neu starten“** aktiv. **Nie am Besprechungstag aktualisieren.** Die Version steht unter „Sicherung“.

## Bekannte Grenzen

- Daten nur auf diesem iPad → **Sicherung ist Pflicht**. Kein Abgleich zwischen Geräten.
- Mails: Die App kann Empfänger *oder* Anhang vorbelegen, nicht beides (Grenze von Web-Apps auf iOS).
- Die Liste der Leistungsgruppen ist nicht eingebaut (die amtliche LB-HB-Liste war nicht abrufbar).
- PDF-Schrift: Buchstaben außerhalb Westeuropas werden auf die Grundform gebracht (Šimić → Simic).
- Getestet automatisiert in Chromium (Querformat 1180 × 820). **Safari auf dem iPad muss von Hand geprüft werden.**

## Gerätetest „Feldtest 1“ (bitte je Punkt „ok“/„nicht ok“, bei Fehlern Bildschirmfoto)

1. App ganz schließen, neu öffnen; unter „Sicherung“ steht die Version `2026-10-06-feldtest-1b`.
2. **Diktat** tippen, 10 s sprechen, **Stopp**: Kommt Text? Kommt eine Fehlermeldung (Wortlaut notieren)?
   Dasselbe im Flugmodus.
3. Während eines Diktats **Mehr → Zurück zum Projekt**: Diktat endet, nichts wird nachgeschrieben.
4. iPad quer mit der rechten Hand halten: Erreichst du alle Knöpfe unten rechts ohne Umgreifen? Welche nicht?
5. Durch die Liste wischen: Bleibt der blaue Rahmen am selben Punkt? Landet ein **Foto** beim umrandeten Punkt?
6. **Sicherung erstellen** → im Teilen-Menü abbrechen: Es muss „NICHTS gesichert“ erscheinen. Dann wirklich in
   „Dateien“ oder OneDrive sichern.
7. Ein PDF mit 10–20 Fotos erstellen, teilen, mit Outlook an dich senden: Kommt es an?
8. App 15 Minuten im Hintergrund lassen, dann weiterschreiben: Erscheint „gespeichert“?
9. Flugmodus ein, App neu starten: Startet sie vollständig?

## Technik

Statische Web-App ohne Build-Schritt: HTML, CSS, JavaScript-Module. Daten in IndexedDB (mit Neuverbindung nach
Verbindungsverlust), offline über Service Worker mit festen Versionen, PDF mit
[jsPDF](https://github.com/parallax/jsPDF) (MIT, `vendor/`).

| Datei | Inhalt |
|---|---|
| `js/model.js` | Fachlogik (Nummerierung, Fortschreibung, Anwesenheit, Protokoll, Firmen-Mails) – ohne Browser, getestet |
| `js/meeting.js` | Ansicht Besprechung/Begehung mit Knopffeld und aktuellem Punkt |
| `js/app.js` | Router, Start, Projekt, Firmen, Projektdaten, Sicherung, Update-Hinweis |
| `js/dictation.js` | Diktat über die Spracherkennung von Safari (mit Neustart-Bremse) |
| `js/sketch.js` | Zeichenfläche (Pencil-Andruck, Handballen-Schutz, Radierer, Rückgängig) |
| `js/pdf.js` | PDF-Erzeugung |
| `js/db.js`, `js/store.js`, `js/backup.js` | Speicher, Datenzugriff, Sicherung (Format 2) |
| `sw.js` | Offline-Speicher je Version, Update erst nach „Neu starten“ |

```bash
npm test                                  # Fachlogik (node:test)
npx http-server -c-1 -p 8080 . &          # lokaler Server
node test/e2e.mjs test-output             # Browser-Durchlauf (Querformat) mit Playwright (braucht pdftotext)
CPU_THROTTLE=6 node test/e2e.mjs test-output   # dasselbe auf gedrosselter CPU (deckt Wettläufe auf wie im CI)
node test/stress.mjs test-output          # Stresstest: 30 Sitzungen, ~600 Punkte, 40 große Fotos
```

Bei jeder Veröffentlichung `VERSION` in `sw.js` erhöhen, sonst bekommt das iPad das Update nicht.

### Veröffentlichen (GitHub Pages)

**Derzeit:** veröffentlicht aus dem Repo `Chris-CMS`, Zweig `gh-pages` →
**https://chrissaringer-maker.github.io/Chris-CMS/**

Später sauberer in einem eigenen Repo: Repo → **Settings → Pages → Branch `main`, Ordner `/ (root)`**.
Ein Umzug ändert die Adresse → neue App mit leerem Speicher; nur über Sicherung und Wiederherstellung umziehen.
Der Programmcode ist öffentlich, **die Daten nie** – sie liegen ausschließlich auf dem iPad.
