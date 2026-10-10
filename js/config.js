// Einstellungen für die veröffentlichte App. Leer lassen, was es (noch) nicht gibt – dann blendet die App es aus.
export const CONFIG = {
  // Adresse des Restlos-Koch-Servers (worker/koch.js bei Cloudflare). Dann brauchen Nutzer keinen eigenen Schlüssel.
  chefServer: '',
  // Gemini-Schlüssel der App. Wird beim Veröffentlichen aus dem GitHub-Secret GEMINI_API_KEY eingesetzt
  // (.github/workflows/pages.yml) – nie hier von Hand eintragen, sonst steht er im Code auf GitHub.
  appKey: '',
  // PayPal-Link für „Restlos unterstützen“, z. B. 'https://paypal.me/deinname'.
  paypal: '',
};
