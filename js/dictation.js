// Diktat per Knopf (Web Speech API von Safari). Gesprochen wird nur die eigene Zusammenfassung.
// Fehlt die Schnittstelle (oder ist sie gesperrt), bleibt die Mikrofon-Taste der iPad-Tastatur.

const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition;

export const dictationAvailable = () => typeof Recognition === 'function';

const MESSAGES = {
  'not-allowed': 'Mikrofon bzw. Spracherkennung nicht erlaubt. iPad-Einstellungen → Apps → Safari → Mikrofon „Erlauben“.',
  'service-not-allowed': 'Spracherkennung ist hier nicht verfügbar. Bitte die Mikrofon-Taste der Tastatur verwenden.',
  'audio-capture': 'Kein Mikrofon verfügbar.',
  network: 'Spracherkennung braucht gerade eine Internetverbindung.',
};

/**
 * Startet ein Diktat. onText(text) bekommt den bisher erkannten Text (endgültig + vorläufig).
 * Rückgabe: { stop() } – beendet und liefert über onEnd(text) den letzten Stand.
 */
export function startDictation({ lang = 'de-AT', onText, onEnd: onEndOnce, onError }) {
  let ended = false;
  const onEnd = (t) => {
    if (ended) return;
    ended = true;
    onEndOnce(t);
  };
  let finals = '';
  let interim = '';
  let stopped = false;
  let rec;
  let triedFallbackLang = false;
  let restarts = [];

  const text = () => `${finals}${interim}`.replace(/\s+/g, ' ').trim();

  const create = (language) => {
    rec = new Recognition();
    rec.lang = language;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e) => {
      interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += `${r[0].transcript} `;
        else interim += r[0].transcript;
      }
      onText(text());
    };
    rec.onerror = (e) => {
      if (e.error === 'no-speech' || e.error === 'aborted') return;
      if (e.error === 'language-not-supported' && !triedFallbackLang) {
        triedFallbackLang = true;
        create('de-DE');
        rec.start();
        return;
      }
      stopped = true;
      onError(MESSAGES[e.error] ?? `Spracherkennung: ${e.error}`, e.error);
      onEnd(text());
    };
    // Safari beendet nach Sprechpausen von selbst – dann neu starten, bis der Knopf erneut gedrückt wird.
    // Bremse: höchstens 3 Neustarts in 10 s und nur bei sichtbarer Seite (sonst Endlosschleife bzw.
    // falsche Berechtigungsmeldung, weil WebKit Fehler oft nur als „aborted“ meldet).
    rec.onend = () => {
      if (stopped) return onEnd(text());
      finals += interim ? `${interim} ` : '';
      interim = '';
      const now = Date.now();
      restarts = restarts.filter((t) => now - t < 10000);
      if (document.visibilityState !== 'visible' || restarts.length >= 3) {
        stopped = true;
        return onEnd(text());
      }
      restarts.push(now);
      setTimeout(() => {
        if (stopped) return onEnd(text());
        try {
          rec.start();
        } catch {
          stopped = true;
          onEnd(text());
        }
      }, 300);
    };
  };

  create(lang);
  rec.start();
  return {
    stop() {
      stopped = true;
      try {
        rec.stop();
      } catch {
        onEnd(text());
      }
    },
  };
}
