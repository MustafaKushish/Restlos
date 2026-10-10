# 🥕 Restlos – Vorrat ohne Verschwendung

**Frictionless Food- und Haushaltsmanagement.** Etwa ein Drittel aller Lebensmittel landet im Müll, oft weil man vergisst, was im Kühlschrank liegt, oder zu viel einkauft. Vorrats-Apps scheitern meist am Eintippen. Restlos macht das Eintragen so einfach wie möglich:

| Problem | Lösung in Restlos |
|---|---|
| Eintippen nervt | **Kassenbon fotografieren.** Die KI (Gemini) liest den Bon: Lebensmittel, Mengen, Preise und geschätzte Haltbarkeit. Pfand, Rabatte und Drogerieartikel sortiert sie aus. Ohne KI liest das Gerät den Bon selbst (Texterkennung). |
| Niemand tippt Ablaufdaten ein | **Haltbarkeit wird geschätzt** (über 80 Produkte, ab Kaufdatum). „Angebrochen“ und „Einfrieren“ passen sie an. |
| Man vergisst, was da ist | **Ampel-Übersicht** nach Dringlichkeit, Hinweis beim Öffnen, Erinnerungen im Handy-Kalender (.ics) |
| Was koche ich mit den Resten? | **Reste-Rezepte**, die zuerst das Ablaufende verbrauchen. Benannt nach deinen Resten („Frittata mit Zucchini & Paprika“). |
| Ich kann nicht kochen | **KI-Koch:** Einfach schreiben oder sagen, was da ist. Ein Profikoch (KI, kostenlos über Google Gemini) macht daraus ein Rezept für Anfänger: zuerst das, was bald abläuft, jeder Schritt mit Hitze, Zeit und woran man erkennt, dass es passt. Rückfragen wie „ohne Ofen?“, andere Ideen per Antippen, danach „Gekocht!“ trägt die Zutaten aus. |
| Zu viel eingekauft | **Einkaufsliste mit Warnung** „Hast du noch: 6× Eier (noch 12 Tage)“. Abgehakte Sachen wandern direkt in den Vorrat. |
| Schaffe ich nicht mehr | **Im Hausflur teilen:** fertiger Text für die Haus-WhatsApp-Gruppe oder nebenan.de, Aushang mit Abreißzetteln zum Drucken |
| Bringt das was? | **Bilanz:** Gerettet-Quote, Euro im Müll, CO₂, „am häufigsten weggeworfen“ mit Tipp |

Weitere Eingabewege: **Sprechen** („2 Liter Milch, sechs Eier und Tomaten“) und **Eintippen** mit Vorschlägen.

## Ausprobieren

- **Online:** Jeder Push auf `main` stellt die App über GitHub Pages unter `https://<name>.github.io/Restlos/` bereit (Workflow „Web-App (GitHub Pages)“). Auf dem Handy dann „Zum Home-Bildschirm“.
- **Lokal:** `npm start`, dann http://localhost:8080 öffnen. In der App „Beispiel-Vorrat laden“ antippen.
- **Tests:** `npm test` (Bon-Erkennung, Haltbarkeit, Rezepte, Bilanz, Speicher, KI-Koch)
- **KI-Koch und KI-Bonerkennung ohne Einrichtung für Nutzer:** kostenlosen Gemini-Schlüssel (aistudio.google.com) auf GitHub unter *Settings → Secrets and variables → Actions → New repository secret* als `GEMINI_API_KEY` speichern. Beim Veröffentlichen setzt der Workflow ihn in die App ein. Wichtig: Der Schlüssel ist dann im Code der Webseite sichtbar. Deshalb in der [Google Cloud Console](https://console.cloud.google.com/apis/credentials) beim Schlüssel *Website-Einschränkung* auf `https://mustafakushish.github.io/*` und *API-Einschränkung* auf „Generative Language API“ setzen und **keine Zahlungsdaten** hinterlegen – dann kann er höchstens das kostenlose Tageslimit verbrauchen, nie Geld kosten. Alternative ohne sichtbaren Schlüssel: der Koch-Server in `worker/` ([Anleitung](worker/README.md)). Nutzer können auch selbst einen Schlüssel eintragen.
- **Unterstützen:** PayPal-Link in `js/config.js` eintragen, dann erscheinen die Knöpfe „Restlos unterstützen“ (Bilanz und nach jedem Rezept).

## Technik

- Installierbare Web-App (PWA), ohne Build-Schritt, läuft offline. Eine Codebasis für iPhone, Android und Desktop.
- **Datenschutz:** Alles bleibt auf dem Gerät (localStorage). Die Bon-Erkennung (Tesseract.js) läuft im Browser, das Foto wird nicht hochgeladen. Nur beim ersten Scan werden etwa 3 MB Erkennungsdaten aus dem Netz geladen.
- **KI-Koch:** Nur wenn man ihn fragt, gehen Wunsch und Vorratsliste an die KI, die Antwort wird live gestreamt. Standard ist Gemini (kostenlose Flash-Modelle; ist bei einem das Tageslimit erreicht, übernimmt das nächste), über den Koch-Server oder mit eigenem Schlüssel. Wer einen Claude-Schlüssel (`sk-ant-…`) einträgt, bekommt Claude (`claude-opus-5-5`, SDK gebündelt in `js/vendor/`). Eigene Schlüssel bleiben auf dem Gerät und landen nicht in der Sicherungsdatei. Hinweis: Bei der kostenlosen Google-Stufe darf Google Anfragen zur Verbesserung nutzen.
- Aufbau:
  - `js/products.js` – Produktwissen: Haltbarkeit, Lagerort, Preis, CO₂, Bon-Schreibweisen
  - `js/receipt.js` – Bon-Text → Artikel (REWE, Edeka, Lidl, Aldi …)
  - `js/pantry.js` – Datum, Status (MHD vs. Verbrauchsdatum), Bilanz, Freitext/Sprache
  - `js/recipes.js` – 36 Rezepte und die Auswahl nach Dringlichkeit
  - `js/share.js` – Teilen-Text, Aushang, Kalender-Erinnerungen
  - `js/store.js` – Speicher mit Rückgängig
  - `js/receiptai.js` – Kassenbon per KI lesen
  - `js/chef.js` – KI-Koch: Anweisungen an den Koch, Anfrage (Gemini/Claude), sichere Darstellung der Antwort
  - `js/config.js` – Adresse des Koch-Servers und PayPal-Link
  - `worker/` – Restlos-Koch-Server für Cloudflare (verwahrt den Gemini-Schlüssel)
  - `js/ocr.js` – Texterkennung, `js/app.js` – Oberfläche

## Fahrplan

1. **Haushalt teilen:** ein gemeinsamer Vorrat für alle im Haushalt. Braucht einen kleinen Server mit Sync.
2. **Echte Push-Erinnerungen** auch bei geschlossener App (Web Push, auf dem iPhone ab iOS 16.4 für installierte Web-Apps)
3. **KI-Bon-Erkennung** bei schlechten Fotos über den Koch-Server
4. **Barcode scannen** + Open Food Facts für Produkte ohne Bon (z. B. Geschenke, Vorräte)
5. **Hausflur-Börse:** echte Angebote für Nachbarn im selben Haus (Einladungslink oder QR-Code am schwarzen Brett, Chat, „reserviert“)
6. **eBon-Anbindung:** digitale Kassenbons (REWE, Lidl Plus, Payback) automatisch übernehmen, ganz ohne Foto
7. Lernende Haltbarkeit: Wenn jemand das Datum oft ändert, passt Restlos die eigene Schätzung an.

*Haltbarkeiten und CO₂-Werte sind Durchschnittsschätzungen. Mindesthaltbarkeit heißt nicht „schlecht ab“. Bei Fleisch, Geflügel und Fisch (Verbrauchsdatum) warnt die App deutlich und bietet sie nicht zum Verschenken an.*
