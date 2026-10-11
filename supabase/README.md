# Nachbarschafts-Börse einschalten (kostenlos, Server in der EU)

Die Börse braucht eine gemeinsame Datenbank, damit Nachbarn die Angebote der anderen sehen. Dafür nutzt Restlos
**Supabase** mit Servern in **Frankfurt** (DSGVO). Bis das eingerichtet ist, gibt es unter
`https://mustafakushish.github.io/Restlos/#/nachbarn` nur eine Vorschau, die auf dem eigenen Gerät speichert.

**Kosten:** keine. Der kostenlose Plan reicht für viele tausend Nachrichten. Hinweis: Wird die Börse eine Woche lang
gar nicht benutzt, pausiert Supabase das Projekt; im Dashboard mit einem Klick wieder starten.

## Einrichten (einmalig, ca. 10 Minuten)

1. Auf [supabase.com](https://supabase.com) kostenlos anmelden (z. B. mit GitHub) → **New project**.
   - Name: `restlos`, ein Datenbank-Passwort ausdenken (wird später nicht gebraucht).
   - **Region: Central EU (Frankfurt)**.
2. Links **SQL Editor** → den ganzen Inhalt von [`schema.sql`](schema.sql) einfügen → **Run**.
3. Links **Authentication** → **Sign In / Providers** → **Allow anonymous sign-ins** einschalten → Speichern.
   (So braucht niemand E-Mail oder Telefonnummer.)
4. **Project Settings** → **API Keys**: die **Project URL** (`https://….supabase.co`) und den
   **Publishable key** (`sb_publishable_…`, oder bei älteren Projekten den `anon`-Schlüssel) kopieren.
5. Beides Claude im Chat geben – dann trage ich es in `js/config.js` ein (`neighborUrl`, `neighborKey`).

Der Publishable-Schlüssel ist dafür gedacht, in einer Web-App zu stehen. Er darf nur das, was `schema.sql` erlaubt.
Den **secret**/`service_role`-Schlüssel niemals weitergeben oder eintragen.

## Was die Datenbank selbst sicherstellt

- Alle sehen nur Beiträge ihrer gewählten Stadt, die nicht abgelaufen und nicht ausgeblendet sind. Private Nachrichten gibt es nicht.
- Telefonnummern, E-Mails, Links, Kontodaten und Hausnummern werden abgelehnt – auch wenn jemand die App umgeht.
- Jeder kann nur eigene Beiträge löschen und nur bei eigenen Angeboten den Status ändern.
- Ab 3 Meldungen ist ein Beitrag sofort unsichtbar. Meldungen siehst nur du im Dashboard unter **Table Editor → reports**.
- Höchstens 20 Beiträge pro Stunde und 6 Angebote pro Tag je Gerät.
- Stündlich wird alles Abgelaufene endgültig gelöscht (Angebote nach 3 Tagen, Nachrichten nach 7, Meldungen nach 30).

## Aufpassen als Betreiber

- **Table Editor → posts**: Spalte `hidden` auf `true` setzen blendet einen Beitrag aus, Zeile löschen entfernt ihn.
- Der KI-Koch prüft jede Nachricht vor dem Senden (Gemini). Ohne erreichbare KI greifen trotzdem alle Regeln oben.
