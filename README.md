# 🥕 Restlos – Vorrat ohne Verschwendung

**Frictionless Food- und Haushaltsmanagement.** Etwa ein Drittel aller Lebensmittel landet im Müll, oft weil man vergisst, was im Kühlschrank liegt, oder zu viel einkauft. Vorrats-Apps scheitern meist am Eintippen. Restlos macht das Eintragen so einfach wie möglich:

| Problem | Lösung in Restlos |
|---|---|
| Eintippen nervt | **Kassenbon scannen.** Eigene Kamera-Ansicht mit Rahmen und Live-Hinweisen (zu dunkel, ruhig halten), Lampe, und mehrere Fotos für lange Bons. Die KI (Gemini) liest jede Zeile: Lebensmittel, Mengen, Preise, geschätzte Haltbarkeit, dazu Drogerie und Pfand. Restlos gleicht die Summe mit dem Endbetrag auf dem Bon ab und sagt, ob etwas fehlt. Stückzahlen und Namen lassen sich vor dem Übernehmen korrigieren. Fotografiert man statt des Bons die Einkäufe selbst, zählt die KI die Produkte. Ohne KI liest das Gerät den Bon selbst (Texterkennung). |
| Niemand tippt Ablaufdaten ein | **Haltbarkeit wird geschätzt** (über 80 Produkte, ab Kaufdatum). „Angebrochen“ und „Einfrieren“ passen sie an. |
| Man vergisst, was da ist | **Ampel-Übersicht** nach Dringlichkeit und **sparsame Erinnerungen**: höchstens eine Mitteilung am Tag, gebündelt („3 Sachen laufen bald ab“), 2 Tage vor Ablauf, jede Sache nur einmal, nicht nachts. Dazu Erinnerungen im Handy-Kalender (.ics). |
| Was mache ich damit, bevor ich es wegwerfe? | **Retten-Tipps** zu jeder Sache, die bald abläuft (z. B. Brot → Arme Ritter oder einfrieren, Spinat → kurz blanchieren und einfrieren), dazu ein passendes Reste-Rezept und „Rezept mit …“ vom KI-Koch. |
| Was koche ich mit den Resten? | **Reste-Rezepte**, die zuerst das Ablaufende verbrauchen. Benannt nach deinen Resten („Frittata mit Zucchini & Paprika“). |
| Ich kann nicht kochen | **KI-Koch:** Einfach schreiben oder sagen, was da ist. Ein Profikoch (KI, kostenlos über Google Gemini) macht daraus ein Rezept für Anfänger: zuerst das, was bald abläuft, jeder Schritt mit Hitze, Zeit und woran man erkennt, dass es passt. Rückfragen wie „ohne Ofen?“, andere Ideen per Antippen, danach „Gekocht!“ trägt die Zutaten aus. Unter *Rezepte* schaut der Koch selbst in den Vorrat und schlägt drei neue Gerichte vor (neu nur, wenn sich ändert, was bald weg muss). |
| Zu viel eingekauft | **Einkaufsliste mit Warnung** „Hast du noch: 6× Eier (noch 12 Tage)“. Abgehakte Sachen wandern direkt in den Vorrat. |
| Schaffe ich nicht mehr | **Im Hausflur teilen:** fertiger Text für die Haus-WhatsApp-Gruppe oder nebenan.de, Aushang mit Abreißzetteln zum Drucken |
| Nachbarn sollen auch was davon haben | **Nachbarschafts-Börse** (freiwillig): Essen verschenken, sortiert nach Stadt und Straße, mit offenem Chat für die Stadt und Fragen zu jedem Angebot. Ohne Konto und **ohne Telefonnummer** (die App und die Datenbank lassen Nummern, E-Mails, Links und Kontodaten nicht durch), nur Straße ohne Hausnummer. Der **KI-Koch liest mit**, bevor etwas rausgeht, und bremst freundlich bei Streit oder Beleidigungen. Melden (nach 3 Meldungen sofort weg) und Blockieren. Angebote verschwinden nach 3 Tagen, Nachrichten nach 7. Einrichten: [supabase/README.md](supabase/README.md) |
| Bringt das was? | **Bilanz:** Gerettet-Quote, Euro im Müll, CO₂, „am häufigsten weggeworfen“ mit Tipp |

Weitere Eingabewege: **Sprechen** („2 Liter Milch, sechs Eier und Tomaten“) und **Eintippen** mit Vorschlägen.

## Ausprobieren

- **Installieren in 2 Klicks:** Werbung und geteilte Links zeigen auf `https://mustafakushish.github.io/Restlos/install/`. Die Seite erkennt Android, iPhone und eingebaute Browser (Instagram, Facebook, WhatsApp) und zeigt jeweils nur den passenden Weg.
- **Online:** Jeder Push auf `main` stellt die App über GitHub Pages unter `https://<name>.github.io/Restlos/` bereit (Workflow „Web-App (GitHub Pages)“). Auf dem Handy dann „Zum Home-Bildschirm“.
- **Lokal:** `npm start`, dann http://localhost:8080 öffnen. In der App „Beispiel-Vorrat laden“ antippen.
- **Tests:** `npm test` (Bon-Erkennung, Scanner, Haltbarkeit, Rezepte, Bilanz, Speicher, KI-Koch)
- **KI-Koch und KI-Bonerkennung ohne Einrichtung für Nutzer:** kostenlosen Gemini-Schlüssel (aistudio.google.com) auf GitHub unter *Settings → Secrets and variables → Actions → New repository secret* als `GEMINI_API_KEY` speichern. Beim Veröffentlichen setzt der Workflow ihn in die App ein. Wichtig: Der Schlüssel ist dann im Code der Webseite sichtbar. Deshalb in der [Google Cloud Console](https://console.cloud.google.com/apis/credentials) beim Schlüssel *Website-Einschränkung* auf `https://mustafakushish.github.io/*` und *API-Einschränkung* auf „Generative Language API“ setzen und **keine Zahlungsdaten** hinterlegen – dann kann er höchstens das kostenlose Tageslimit verbrauchen, nie Geld kosten. Alternative ohne sichtbaren Schlüssel: der Koch-Server in `worker/` ([Anleitung](worker/README.md)). Nutzer können auch selbst einen Schlüssel eintragen.
- **Unterstützen:** PayPal-Link in `js/config.js` eintragen, dann erscheinen die Knöpfe „Restlos unterstützen“ (Bilanz und nach jedem Rezept).

## Sprachen

Restlos spricht **Deutsch, Englisch, Türkisch, Arabisch (von rechts nach links), Französisch und Spanisch**. Beim ersten Start nimmt die App die Sprache des Handys, umschalten geht oben über 🌐 oder unter *Bilanz → Sprache*. Übersetzt sind alle Texte, Lebensmittel und Rezepte; der KI-Koch antwortet in der gewählten Sprache.

- Im Code steht der deutsche Text in `t('…')` (`js/i18n.js`), die Übersetzungen liegen in `js/lang/<code>.js`.
- **Neuer Text:** `t('Deutscher Text')` schreiben und in jede Sprachdatei eintragen. Fehlt eine Übersetzung, erscheint Deutsch, und `npm test` zeigt genau, welche fehlt.
- **Neue Sprache:** Eintrag in `LANGS` (`js/i18n.js`), Datei `js/lang/<code>.js` nach dem Muster von `en.js`, in `sw.js` aufnehmen. `node tests/i18n-keys.mjs` gibt alle Texte als Vorlage aus.

## Technik

- Installierbare Web-App (PWA), ohne Build-Schritt, läuft offline. Eine Codebasis für iPhone, Android und Desktop.
- **Datenschutz:** Alles bleibt auf dem Gerät (localStorage). Mit KI gehen die Bon-Fotos zum Lesen an Gemini. Ohne KI läuft die Bon-Erkennung (Tesseract.js) im Browser und das Foto wird nicht hochgeladen; nur beim ersten Scan werden etwa 3 MB Erkennungsdaten aus dem Netz geladen.
- **KI-Koch:** Nur wenn man ihn fragt, gehen Wunsch und Vorratsliste an die KI, die Antwort wird live gestreamt. Standard ist Gemini (kostenlose Flash-Modelle; ist bei einem das Tageslimit erreicht, übernimmt das nächste), über den Koch-Server oder mit eigenem Schlüssel. Wer einen Claude-Schlüssel (`sk-ant-…`) einträgt, bekommt Claude (`claude-opus-5-5`, SDK gebündelt in `js/vendor/`). Eigene Schlüssel bleiben auf dem Gerät und landen nicht in der Sicherungsdatei. Hinweis: Bei der kostenlosen Google-Stufe darf Google Anfragen zur Verbesserung nutzen.
- Aufbau:
  - `js/products.js` – Produktwissen: Haltbarkeit, Lagerort, Preis, CO₂, Bon-Schreibweisen
  - `js/camera.js` – Kamera-Scanner (Live-Bild, Hinweise, Lampe, mehrere Fotos)
  - `js/receipt.js` – Bon-Text → Artikel (REWE, Edeka, Lidl, Aldi …), Summe, Artikelanzahl, Zusammenfügen mehrerer Fotos
  - `js/pantry.js` – Datum, Status (MHD vs. Verbrauchsdatum), Bilanz, Freitext/Sprache
  - `js/recipes.js` – 36 Rezepte und die Auswahl nach Dringlichkeit
  - `js/share.js` – Teilen-Text, Aushang, Kalender-Erinnerungen
  - `js/rescue.js` – Retten-Tipps je Lebensmittel, Regeln für sparsame Erinnerungen und ihr Fahrplan für den Hintergrund
  - `js/store.js` – Speicher mit Rückgängig
  - `js/receiptai.js` – Kassenbon per KI lesen, Summen-Abgleich
  - `js/chef.js` – KI-Koch: Anweisungen an den Koch, Anfrage (Gemini/Claude), sichere Darstellung der Antwort
  - `js/neighbors.js` – Nachbarschafts-Börse: Datenschutz-Prüfung, Stadt/Straße, KI-Koch als Aufpasser
  - `js/neighborapi.js` – Verbindung zur Datenbank (anonym) und Vorschau nur auf dem Gerät
  - `js/nachbarn.js` – Oberfläche der Nachbarschafts-Börse
  - `supabase/schema.sql` – Datenbank mit Zugriffsregeln, Prüfungen und automatischem Löschen
  - `js/config.js` – Adresse des Koch-Servers, der Nachbarschafts-Datenbank und PayPal-Link
  - `worker/` – Restlos-Koch-Server für Cloudflare (verwahrt den Gemini-Schlüssel)
  - `js/ocr.js` – Texterkennung, `js/app.js` – Oberfläche

## Fahrplan

1. **Haushalt teilen:** ein gemeinsamer Vorrat für alle im Haushalt. Braucht einen kleinen Server mit Sync.
2. **Push-Erinnerungen für alle Geräte:** Heute kommen Erinnerungen im Hintergrund nur bei der installierten App in Chrome/Edge (Android, Computer), sonst beim Öffnen. Für das iPhone bräuchte es Web Push mit einem kleinen Server.
3. **KI-Bon-Erkennung** bei schlechten Fotos über den Koch-Server
4. **Barcode scannen** + Open Food Facts für Produkte ohne Bon (z. B. Geschenke, Vorräte)
5. **Nachbarschafts-Börse:** fertig gebaut, wird mit einer Supabase-Datenbank eingeschaltet (siehe oben). Später vielleicht: Hinweis, wenn in der eigenen Straße etwas Neues angeboten wird.
6. **eBon-Anbindung:** digitale Kassenbons (REWE, Lidl Plus, Payback) automatisch übernehmen, ganz ohne Foto
7. Lernende Haltbarkeit: Wenn jemand das Datum oft ändert, passt Restlos die eigene Schätzung an.

*Haltbarkeiten und CO₂-Werte sind Durchschnittsschätzungen. Mindesthaltbarkeit heißt nicht „schlecht ab“. Bei Fleisch, Geflügel und Fisch (Verbrauchsdatum) warnt die App deutlich und bietet sie nicht zum Verschenken an.*
