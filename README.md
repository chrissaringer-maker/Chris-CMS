# Chris-CMS

Schlankes CMS: Seiten anlegen, bearbeiten, veröffentlichen. Die Admin-Oberfläche ist
touch-optimiert und läuft im Browser, also auch auf dem iPad.

**Stack:** Node.js ≥ 22.13, Express, SQLite (`node:sqlite`, eingebaut). Nur eine Abhängigkeit (`express`).

## Starten

```bash
npm install
npm start                    # http://localhost:3000
```

- **Öffentliche Seiten:** `/` (Liste) und `/p/<slug>`
- **Admin:** `/admin`
- Beim ersten Start wird der Benutzer `admin` angelegt. Das Passwort steht einmalig in der Konsole,
  oder du setzt es vorab: `ADMIN_PASSWORD=geheim npm start` (optional `ADMIN_USER`).

| Variable | Standard | Bedeutung |
|---|---|---|
| `PORT` | `3000` | HTTP-Port |
| `HOST` | `0.0.0.0` | Bind-Adresse |
| `DB_FILE` | `data/cms.db` | SQLite-Datei |
| `NODE_ENV` | – | `production` setzt das `Secure`-Flag am Cookie (HTTPS nötig) |

## Tests

```bash
npm test
```

## Inhalte schreiben

Bewusst kein rohes HTML (Schutz vor XSS): `# Überschrift`, `## Unterüberschrift`, Leerzeile = neuer Absatz.

## Auf dem iPad nutzen

Der Server läuft nicht auf dem iPad. Zwei Wege:

1. **Entwickeln:** `claude.ai/code` in Safari öffnen, Session auf dem Branch weiterführen.
2. **Betrieb:** Server auf einem Host laufen lassen (Render, Fly.io, eigener Server) und `/admin` in Safari öffnen.
   Dort unbedingt HTTPS, `NODE_ENV=production` und ein starkes `ADMIN_PASSWORD` setzen.

## Bekannte Grenzen (v0.1)

- Ein Admin-Konto, keine Benutzerverwaltung und keine Rollen.
- Login-Bremse (5 Versuche/Minute pro IP) liegt im Speicher und gilt nur für eine Serverinstanz.
- Kein Medien-Upload, kein Markdown-Vollumfang.
- `node:sqlite` ist in Node 22 noch als experimentell markiert (Warnung beim Start ist normal).
