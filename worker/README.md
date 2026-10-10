# Restlos-Koch-Server (kostenlos)

Damit alle den KI-Koch **ohne eigenen Schlüssel** nutzen können, läuft ein kleiner Server bei Cloudflare.
Er verwahrt **deinen** kostenlosen Gemini-Schlüssel und lässt nur Koch-Anfragen aus der Restlos-App durch.

**Kosten:** keine. Cloudflare Workers ist bis 100.000 Aufrufe pro Tag kostenlos. Gemini ist kostenlos, solange du
bei Google **keine Zahlungsdaten** hinterlegst. Ist das Tageslimit von Google erreicht, sagt der Koch freundlich
„bitte später nochmal“. Es entstehen keine Kosten.

## Einrichten (einmalig, ca. 10 Minuten)

1. **Gemini-Schlüssel holen:** [aistudio.google.com](https://aistudio.google.com) → mit Google anmelden → „Get API key“ → „Create API key“ → kopieren.
2. **Cloudflare-Konto** anlegen (kostenlos): [dash.cloudflare.com](https://dash.cloudflare.com).
3. Links **Workers & Pages** → **Create** → **Import a repository** → GitHub verbinden → Repo **Restlos** wählen.
   - Bei „Root directory“ / „Path“: `worker` eintragen. Der Rest kommt aus `worker/wrangler.toml`.
   - **Deploy**.
4. Im neuen Worker **restlos-koch** → **Settings** → **Variables and Secrets** → **Add**:
   - Typ **Secret**, Name `GEMINI_API_KEY`, Wert: der Schlüssel aus Schritt 1.
   - `ALLOWED_ORIGIN` steht schon in `wrangler.toml` (`https://mustafakushish.github.io`). Läuft die App woanders, hier anpassen.
5. Die Adresse des Workers kopieren (z. B. `https://restlos-koch.<dein-name>.workers.dev`) und in `js/config.js` bei `chefServer` eintragen.
   Oder Claude im Chat geben – dann trage ich sie ein.

Danach sehen Nutzer keine Schlüssel-Einrichtung mehr: Der Koch ist einfach da.

## Hinweise

- Bei der kostenlosen Google-Stufe darf Google Anfragen zur Verbesserung seiner Dienste verwenden. Die App schickt nur die Vorratsliste und den Kochwunsch, keine Namen oder Konten.
- Der Server übernimmt nur `{ messages }` und setzt die Koch-Anweisungen selbst (`js/chef.js`). Andere Seiten (fremde Origins) werden abgewiesen.
- Tests: `npm test` (im Hauptordner) prüft auch den Server.
