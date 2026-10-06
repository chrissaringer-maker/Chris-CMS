# Baustellen-Protokoll

Web-App fürs iPad: Baubesprechungen und Baubegehungen erfassen – diktieren, fotografieren, skizzieren –
und als PDF-Protokoll an die Firmen verschicken. Offene Punkte werden automatisch in die nächste Sitzung übernommen.

**Stufe 1:** Kein Server, kein Login, keine KI, keine Anbindung an Forma. Alle Daten bleiben auf dem iPad.

## Auf dem iPad einrichten

1. In **Safari** die App-Adresse öffnen (GitHub Pages, siehe unten).
2. **Teilen → „Zum Home-Bildschirm“**.
3. **Ab jetzt nur noch die App vom Home-Bildschirm benutzen.** Safari und die installierte App speichern
   getrennt – was du in Safari eingibst, siehst du in der App nicht.
4. Einmal pro Woche **Sicherung** erstellen und in OneDrive oder „Dateien“ ablegen. Die App erinnert daran.

## Ablauf einer Besprechung

1. Projekt anlegen, unter **Firmen** die Firmen mit Gewerk, **Leistungsgruppe** (LB-HB, z. B. 39 Trockenbau),
   Ansprechpartner und E-Mail eintragen. Die Kontakte mit E-Mail bilden den Verteiler.
2. **+ Baubesprechung** (oder **+ Baubegehung**). Offene Punkte der letzten Sitzung sind schon drin.
3. Teilnehmer abhaken, mit **Punkt** neue Punkte anlegen. Ins Textfeld tippen und mit der
   **Mikrofon-Taste der iPad-Tastatur diktieren**. Zuständig, Frist, Art und Status setzen.
   Unsicheres mit **„unklar“** markieren – erscheint im PDF als „[unklar – bitte ergänzen]“.
4. Je Punkt: **Foto**, **Mediathek** (auch abfotografierte Papierskizzen), **Skizze** (Apple Pencil).
   Auf ein Vorschaubild tippen → **Einzeichnen**, Beschriftung, Löschen.
5. Optional **Vorabzug-PDF** (Wasserzeichen „VORABZUG“) an die Firmen zur Ergänzung.
6. **Endfassung abschließen** → Sitzung ist gesperrt. Änderungen nur als **neue Fassung**.
7. **Verteiler kopieren** → **PDF teilen** → Outlook → Adressen ins Feld „An“ einfügen.
8. Optional je Firma **„Ihre offenen Punkte“** – Outlook öffnet sich mit fertiger Mail
   (überfällige Punkte zuerst, Hinweis „Maßgeblich ist das Gesamtprotokoll“).

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

## Bekannte Grenzen (Stufe 1)

- Daten nur auf diesem iPad → **Sicherung ist Pflicht**. Kein Abgleich zwischen Geräten.
- Mails: Die App kann Empfänger *oder* Anhang vorbelegen, nicht beides (Grenze von Web-Apps auf iOS).
  Darum „Verteiler kopieren“ + „PDF teilen“.
- Diktat = Diktierfunktion der iPad-Tastatur (auf dem Gerät, Deutsch, ohne eigenes Fachwörterbuch).
  Tipp: Firmen- und Fachbegriffe als Kontakte anlegen, dann erkennt das Diktat sie besser.
- Apple-Pencil-Doppeltipp ist für Web-Apps nicht verfügbar.
- Die Liste der Leistungsgruppen ist nicht eingebaut (die amtliche LB-HB-Liste war nicht abrufbar);
  die LG wird je Firma eingetragen.
- Kein Mitschnitt, keine KI, keine Forma-Anbindung – bewusst, siehe Entwurf im Repo `Chris-CMS`
  (`docs/baustellen-app-entwurf.md`).
- Getestet automatisiert in Chromium; **Safari auf dem iPad muss von Hand geprüft werden**
  (Pencil, Kamera, Teilen-Menü, Mail-Links).

## Technik

Statische Web-App ohne Build-Schritt: HTML, CSS, JavaScript-Module. Daten in IndexedDB, offline über
Service Worker, PDF mit [jsPDF](https://github.com/parallax/jsPDF) (MIT, `vendor/`).

| Datei | Inhalt |
|---|---|
| `js/model.js` | Fachlogik (Nummerierung, Fortschreibung, Protokoll, Firmen-Mails) – ohne Browser, getestet |
| `js/meeting.js` | Ansicht Besprechung/Begehung |
| `js/app.js` | Router, Start, Projekt, Firmen, Projektdaten, Sicherung |
| `js/sketch.js` | Zeichenfläche (Pencil-Andruck, Handballen-Schutz, Radierer, Rückgängig) |
| `js/pdf.js` | PDF-Erzeugung |
| `js/db.js`, `js/store.js`, `js/backup.js` | Speicher, Datenzugriff, Sicherung |

```bash
npm test                                  # Fachlogik (node:test)
npx http-server -c-1 -p 8080 . &          # lokaler Server
node test/e2e.mjs test-output             # Browser-Durchlauf mit Playwright (braucht pdftotext)
```

### Veröffentlichen (GitHub Pages)

Repo → **Settings → Pages → Build and deployment → Source: „Deploy from a branch“, Branch `main`, Ordner `/ (root)`**.
Die App ist dann unter `https://<benutzer>.github.io/baustellen-protokoll/` erreichbar.
Der Programmcode ist öffentlich, **die Daten nie** – sie liegen ausschließlich auf dem iPad.
