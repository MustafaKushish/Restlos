// Einstellungen für die veröffentlichte App. Leer lassen, was es (noch) nicht gibt – dann blendet die App es aus.
export const CONFIG = {
  // Adresse des Restlos-Koch-Servers (worker/koch.js bei Cloudflare). Dann brauchen Nutzer keinen eigenen Schlüssel.
  chefServer: '',
  // Gemini-Schlüssel der App. Wird beim Veröffentlichen aus dem GitHub-Secret GEMINI_API_KEY eingesetzt
  // (.github/workflows/pages.yml) – nie hier von Hand eintragen, sonst steht er im Code auf GitHub.
  appKey: '',
  // Nachbarschafts-Börse (Supabase, Region Frankfurt): Projekt-Adresse und „publishable“/„anon“-Schlüssel.
  // Der Schlüssel ist zum Veröffentlichen gedacht – geschützt wird alles durch die Regeln in supabase/schema.sql.
  // Leer = die Börse ist nur als Vorschau unter …#/nachbarn zu sehen und speichert nur auf dem Gerät.
  neighborUrl: '',
  neighborKey: '',
  // PayPal-Link für „Restlos unterstützen“ (Spenden-Seite von PayPal; dort geht auch Karte, Apple Pay und Google Pay,
  // soweit PayPal es anbietet). Mit eigenem paypal.me-Namen ginge auch 'https://paypal.me/deinname'.
  paypal: 'https://www.paypal.com/donate/?business=mustafa.al-zurgany%40web.de&currency_code=EUR&item_name=Restlos%20unterst%C3%BCtzen',
  // Apple Pay, Google Pay und Karte: Stripe-„Payment Link“ mit frei wählbarem Betrag (https://buy.stripe.com/ oder https://donate.stripe.com/).
  // Leer lassen, solange es ihn nicht gibt – dann bleibt der Knopf ausgeblendet.
  cardPay: 'https://donate.stripe.com/7sYfZh3Xa5Ga74zeuuao800',
};
