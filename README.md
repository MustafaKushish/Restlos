# 🥕 Restlos – Vorrat ohne Verschwendung

**Frictionless Food- und Haushaltsmanagement.** Etwa ein Drittel aller Lebensmittel landet im Müll, oft weil man vergisst, was im Kühlschrank liegt, oder zu viel einkauft. Vorrats-Apps scheitern meist am Eintippen. Restlos macht das Eintragen so einfach wie möglich:

| Problem | Lösung in Restlos |
|---|---|
| Eintippen nervt | **Kassenbon fotografieren.** Restlos erkennt die Lebensmittel, Mengen und Preise. Pfand, Rabatte und Drogerieartikel sortiert es aus. |
| Niemand tippt Ablaufdaten ein | **Haltbarkeit wird geschätzt** (über 80 Produkte, ab Kaufdatum). „Angebrochen“ und „Einfrieren“ passen sie an. |
| Man vergisst, was da ist | **Ampel-Übersicht** nach Dringlichkeit, Hinweis beim Öffnen, Erinnerungen im Handy-Kalender (.ics) |
| Was koche ich mit den Resten? | **Reste-Rezepte**, die zuerst das Ablaufende verbrauchen. Benannt nach deinen Resten („Frittata mit Zucchini & Paprika“). |
| Ich kann nicht kochen | **KI-Koch:** Einfach schreiben oder sagen, was da ist. Ein Profikoch (Claude) macht daraus ein Rezept für Anfänger: zuerst das, was bald abläuft, jeder Schritt mit Hitze, Zeit und woran man erkennt, dass es passt. Rückfragen wie „ohne Ofen?“, andere Ideen per Antippen, danach „Gekocht!“ trägt die Zutaten aus. |
| Zu viel eingekauft | **Einkaufsliste mit Warnung** „Hast du noch: 6× Eier (noch 12 Tage)“. Abgehakte Sachen wandern direkt in den Vorrat. |
| Schaffe ich nicht mehr | **Im Hausflur teilen:** fertiger Text für die Haus-WhatsApp-Gruppe oder nebenan.de, Aushang mit Abreißzetteln zum Drucken |
| Bringt das was? | **Bilanz:** Gerettet-Quote, Euro im Müll, CO₂, „am häufigsten weggeworfen“ mit Tipp |

Weitere Eingabewege: **Sprechen** („2 Liter Milch, sechs Eier und Tomaten“) und **Eintippen** mit Vorschlägen.

## Ausprobieren

- **Online:** Jeder Push auf `main` stellt die App über GitHub Pages unter `https://<name>.github.io/Restlos/` bereit (Workflow „Web-App (GitHub Pages)“). Auf dem Handy dann „Zum Home-Bildschirm“.
- **Lokal:** `npm start`, dann http://localhost:8080 öffnen. In der App „Beispiel-Vorrat laden“ antippen.
- **Tests:** `npm test` (Bon-Erkennung, Haltbarkeit, Rezepte, Bilanz, Speicher, KI-Koch)
- **KI-Koch:** Unter „Rezepte → KI-Koch fragen“ einmal einen API-Schlüssel von [console.anthropic.com](https://console.anthropic.com) eintragen. Ein Rezept kostet etwa 5–10 Cent.

## Technik

- Installierbare Web-App (PWA), ohne Build-Schritt, läuft offline. Eine Codebasis für iPhone, Android und Desktop.
- **Datenschutz:** Alles bleibt auf dem Gerät (localStorage). Die Bon-Erkennung (Tesseract.js) läuft im Browser, das Foto wird nicht hochgeladen. Nur beim ersten Scan werden etwa 3 MB Erkennungsdaten aus dem Netz geladen.
- **KI-Koch:** Nur wenn man ihn fragt, gehen Wunsch und Vorratsliste direkt vom Gerät an die Claude API (Modell `claude-opus-5-5`, Antwort wird live gestreamt). Der API-Schlüssel bleibt auf dem Gerät und landet nicht in der Sicherungsdatei. Das offizielle SDK liegt gebündelt in `js/vendor/`, damit kein fremder Server nötig ist.
- Aufbau:
  - `js/products.js` – Produktwissen: Haltbarkeit, Lagerort, Preis, CO₂, Bon-Schreibweisen
  - `js/receipt.js` – Bon-Text → Artikel (REWE, Edeka, Lidl, Aldi …)
  - `js/pantry.js` – Datum, Status (MHD vs. Verbrauchsdatum), Bilanz, Freitext/Sprache
  - `js/recipes.js` – 36 Rezepte und die Auswahl nach Dringlichkeit
  - `js/share.js` – Teilen-Text, Aushang, Kalender-Erinnerungen
  - `js/store.js` – Speicher mit Rückgängig
  - `js/chef.js` – KI-Koch: Anweisungen an den Koch, Anfrage, sichere Darstellung der Antwort
  - `js/ocr.js` – Texterkennung, `js/app.js` – Oberfläche

## Fahrplan

1. **Haushalt teilen:** ein gemeinsamer Vorrat für alle im Haushalt. Braucht einen kleinen Server mit Sync.
2. **Echte Push-Erinnerungen** auch bei geschlossener App (Web Push, auf dem iPhone ab iOS 16.4 für installierte Web-Apps)
3. **KI-Koch ohne eigenen Schlüssel:** ein kleiner Server (z. B. Cloudflare Worker), der den Schlüssel verwahrt, damit alle Nutzer den Koch ohne Einrichtung nutzen können. Dazu **KI-Bon-Erkennung** mit Claude Vision bei schlechten Fotos
4. **Barcode scannen** + Open Food Facts für Produkte ohne Bon (z. B. Geschenke, Vorräte)
5. **Hausflur-Börse:** echte Angebote für Nachbarn im selben Haus (Einladungslink oder QR-Code am schwarzen Brett, Chat, „reserviert“)
6. **eBon-Anbindung:** digitale Kassenbons (REWE, Lidl Plus, Payback) automatisch übernehmen, ganz ohne Foto
7. Lernende Haltbarkeit: Wenn jemand das Datum oft ändert, passt Restlos die eigene Schätzung an.

*Haltbarkeiten und CO₂-Werte sind Durchschnittsschätzungen. Mindesthaltbarkeit heißt nicht „schlecht ab“. Bei Fleisch, Geflügel und Fisch (Verbrauchsdatum) warnt die App deutlich und bietet sie nicht zum Verschenken an.*
