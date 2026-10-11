// Retten statt wegwerfen: kurze Tipps je Lebensmittel und sparsame Erinnerungen vor dem Ablauf.
// Ohne DOM und Netz, damit es testbar bleibt – app.js zeigt an, sw.js verschickt im Hintergrund.
import { iso, addDays, daysLeft } from './pantry.js';
import { byId } from './products.js';

// So viele Tage vorher erinnert Restlos (2 = übermorgen, morgen, heute).
export const REMIND_DAYS = 2;

// Tipps je Produkt: was man damit machen kann, bevor es schlecht wird. Kurz, ohne Fachwörter.
const T = (icon, text) => ({ icon, text });
const PRODUCT_TIPS = {
  bananen: [T('🥞', 'Zerdrücken und mit 2 Eiern zu Bananen-Pancakes braten'), T('❄️', 'Geschält in Stücken einfrieren – perfekt für Smoothies')],
  aepfel: [T('🍎', 'Als Apfelmus kochen oder in den Pfannkuchenteig reiben'), T('🥧', 'Mit Butter-Streuseln zum Crumble backen')],
  birnen: [T('🍐', 'Klein schneiden und mit etwas Zucker zu Kompott kochen')],
  beeren: [T('❄️', 'Einfrieren – später für Joghurt, Smoothie oder Kuchen'), T('🍯', 'Mit Zucker kurz aufkochen: schnelle Marmelade')],
  erdbeeren: [T('🥤', 'Mit Joghurt zum Smoothie pürieren'), T('❄️', 'Ohne Grün einfrieren – für Smoothies')],
  trauben: [T('❄️', 'Eingefroren sind sie ein Snack wie Eis')],
  avocado: [T('🥑', 'Zu Guacamole zerdrücken, mit Zitrone hält sie einen Tag länger')],
  tomaten: [T('🍅', 'Weiche Tomaten zu Tomatensauce kochen – die lässt sich einfrieren'), T('🥗', 'Mit altem Brot zum Brotsalat')],
  gurke: [T('🥒', 'Mit Joghurt und Knoblauch zu Tzatziki')],
  paprika: [T('🫑', 'In Streifen schneiden und einfrieren oder in die Pfanne')],
  salat: [T('🥬', 'Welke Blätter 10 Minuten in kaltes Wasser legen – wieder knackig'), T('🍲', 'Schon schlapp? Mit Kartoffeln zur Suppe pürieren')],
  rucola: [T('🌿', 'Mit Öl, Nüssen und Käse zu Pesto mixen')],
  spinat: [T('🍳', 'Zusammenfallen lassen und in Rührei oder Nudeln geben'), T('❄️', 'Kurz in kochendes Wasser, dann portionsweise einfrieren')],
  moehren: [T('🍲', 'Mit Zwiebel und Brühe zur Möhrensuppe')],
  zucchini: [T('🍳', 'Reiben und zu Puffern oder in die Frittata')],
  brokkoli: [T('🥦', 'Auch den Strunk schälen und mitkochen – zur Suppe oder Pfanne')],
  pilze: [T('🍄', 'Gebraten und abgekühlt lassen sie sich einfrieren')],
  kraeuter: [T('🧊', 'Hacken, mit Öl in den Eiswürfelbehälter und einfrieren'), T('🌿', 'Zu Pesto oder Kräuterquark verarbeiten')],
  kartoffeln: [T('🥔', 'Keime großzügig wegschneiden, dann Bratkartoffeln oder Suppe')],
  milch: [T('🥞', 'In Pfannkuchen, Milchreis oder Kakao verbrauchen'), T('👃', 'Nach Ablauf erst riechen und probieren – oft noch gut')],
  joghurt: [T('🥣', 'Mit Haferflocken und Obst zu Overnight Oats'), T('👃', 'Mindesthaltbar: ansehen, riechen, probieren – oft noch Tage gut')],
  quark: [T('🥔', 'Mit Kräutern zu Kräuterquark für Pellkartoffeln')],
  sahne: [T('🍝', 'In eine Nudelsauce oder Suppe rühren'), T('❄️', 'Lässt sich einfrieren – danach zum Kochen nehmen')],
  frischkaese: [T('🍝', 'Mit etwas Nudelwasser zu einer cremigen Nudelsauce')],
  mozzarella: [T('🧀', 'Auf Brot oder Nudelauflauf überbacken')],
  kaese: [T('🧀', 'Reiben und portionsweise einfrieren – für Auflauf und Pizza'), T('🍞', 'Überbackene Brote machen')],
  eier: [T('🥚', 'Hart kochen – dann halten sie noch ein paar Tage länger'), T('💧', 'Wasser-Test: Sinkt das Ei, ist es noch gut')],
  hackfleisch: [T('🔥', 'Heute ganz durchbraten (z. B. Bolognese) – gekocht hält es 2 Tage mehr'), T('❄️', 'Oder sofort einfrieren')],
  haehnchen: [T('🔥', 'Heute ganz durchgaren – gekocht hält es 2 Tage mehr'), T('❄️', 'Oder sofort einfrieren')],
  fisch: [T('🔥', 'Heute braten oder einfrieren')],
  brot: [T('🍞', 'Altbackenes Brot: Arme Ritter, Croûtons oder Brotsalat'), T('❄️', 'In Scheiben einfrieren und direkt toasten')],
  broetchen: [T('🥖', 'Kurz mit Wasser benetzen und 5 Minuten aufbacken'), T('❄️', 'Einfrieren und später aufbacken')],
  toast: [T('❄️', 'Einfrieren – direkt aus dem Gefrierfach in den Toaster')],
  kuchen: [T('❄️', 'Stückweise einfrieren')],
  frischenudeln: [T('❄️', 'Ungekocht einfrieren, später direkt ins Wasser')],
  salatfertig: [T('🍳', 'Heute essen oder in eine Pfanne mit Ei geben')],
};
const CAT_TIPS = {
  obst: [T('🥤', 'Zum Smoothie pürieren oder zu Kompott kochen'), T('❄️', 'In Stücken einfrieren')],
  gemuese: [T('🍲', 'Alles klein schneiden: Suppe, Gemüsepfanne oder Frittata'), T('❄️', 'Klein geschnitten einfrieren')],
  milch: [T('👃', 'Mindesthaltbar: ansehen, riechen, probieren – oft noch gut')],
  kaese: [T('🧀', 'Überbacken oder reiben und einfrieren')],
  fleisch: [T('🔥', 'Heute ganz durchgaren oder sofort einfrieren')],
  wurst: [T('🍳', 'In Rührei, Nudeln oder Bratkartoffeln')],
  brot: [T('🍞', 'Rösten, Arme Ritter oder einfrieren')],
  fertig: [T('🍳', 'Heute essen oder mit Resten aufpeppen')],
};
// Lässt sich das einfrieren? (Salat, Gurke, Joghurt & Co. eher nicht.)
const NO_FREEZE = new Set(['salat', 'rucola', 'gurke', 'avocado', 'joghurt', 'quark', 'frischkaese', 'mozzarella', 'milch', 'eier', 'kartoffeln', 'tomaten', 'salatfertig', 'melone', 'trauben']);

// Bis zu drei Ideen, wie man etwas noch rettet. Verschenken nur, wenn es erlaubt ist.
export function rescueTips(item, today = iso()) {
  const d = daysLeft(item, today);
  const p = item.pid && byId[item.pid];
  if (p?.vd && d < 0) return [T('⚠️', 'Verbrauchsdatum überschritten – bitte nicht mehr essen.')];
  const tips = [...(PRODUCT_TIPS[item.pid] ?? CAT_TIPS[item.cat] ?? [])];
  const freezable = item.place !== 'tk' && !NO_FREEZE.has(item.pid) && !['getraenke', 'vorrat', 'tk', 'sonst'].includes(item.cat);
  if (freezable && !tips.some((t) => t.icon === '❄️')) tips.push(T('❄️', 'Einfrieren – hält dann Wochen länger'));
  if (!p?.vd && d >= 0) tips.push(T('🤝', 'Schaffst du es nicht? Im Hausflur verschenken'));
  return tips.slice(0, 3);
}

// ---------- Erinnerungen ----------
// Sparsam: höchstens eine Mitteilung am Tag, alles in einer gebündelt („3 Sachen laufen bald ab“),
// und nur, wenn etwas Neues fällig ist. Jede Sache meldet Restlos nur einmal – außer ihr Datum ändert sich
// (z. B. angebrochen). Damit nicht jeden Tag etwas kommt, nimmt eine Mitteilung schon mit, was einen Tag
// später fällig würde, und direkt am Tag nach einer Mitteilung meldet Restlos sich nur bei Dringendem (heute/morgen).
// memo = { day: 'JJJJ-MM-TT' der letzten Mitteilung, seen: { id: Ablaufdatum } }
export const emptyMemo = () => ({ day: '', seen: {} });

const when = (d) => (d <= 0 ? 'heute' : d === 1 ? 'morgen' : d === 2 ? 'übermorgen' : `in ${d} Tagen`);

export function dueSoon(items, today = iso(), days = REMIND_DAYS) {
  return items
    .filter((i) => !i.offered && i.place !== 'tk')
    .filter((i) => { const d = daysLeft(i, today); return d >= 0 && d <= days; })
    .sort((a, b) => a.expires.localeCompare(b.expires));
}

// idea(due) darf einen Rezeptnamen liefern, der die Sachen aufbraucht („Frittata mit Spinat“).
export function reminderPlan(items, memo = emptyMemo(), today = iso(), idea) {
  if (memo.day >= today) return null;
  const fresh = (i) => memo.seen?.[i.id] !== i.expires;
  const urgentOnly = memo.day === addDays(today, -1);
  const trigger = dueSoon(items, today, urgentOnly ? 1 : REMIND_DAYS).some(fresh);
  if (!trigger) return null;
  const due = dueSoon(items, today, REMIND_DAYS + 1);
  const n = due.length;
  const first = due[0];
  const title = n === 1 ? `Bald weg: ${first.name}` : `${n} Sachen laufen bald ab`;
  const list = due.slice(0, 4).map((i) => `${i.name} (${when(daysLeft(i, today))})`).join(', ') + (n > 4 ? ` und ${n - 4} mehr` : '');
  const tip = idea?.(due);
  const body = n === 1
    ? `Ablauf ${when(daysLeft(first, today))}.${tip ? ` Idee: ${tip}.` : ''} Tippe für Retten-Tipps.`
    : `${list}.${tip ? ` Idee: ${tip}.` : ''} Tippe für Retten-Tipps.`;
  return { title, body, ids: due.map((i) => i.id), seen: Object.fromEntries(due.map((i) => [i.id, i.expires])), url: './#/vorrat?retten=1' };
}

// Nach einer Mitteilung merken, was schon gemeldet wurde. Aufgebrauchtes fliegt aus dem Gedächtnis.
export function remember(memo, plan, today = iso(), items) {
  const seen = { ...memo.seen, ...plan.seen };
  if (items) for (const id of Object.keys(seen)) if (!items.some((i) => i.id === id)) delete seen[id];
  return { day: today, seen };
}

// Fahrplan für den Hintergrund (sw.js): Für die nächsten Tage schon fertige Mitteilungen,
// so wie sie kämen, wenn sich am Vorrat nichts ändert. Ändert sich etwas, schreibt die App ihn neu.
export function reminderSchedule(items, memo = emptyMemo(), today = iso(), idea, days = 14) {
  const out = [];
  let m = memo;
  for (let k = 0; k <= days; k++) {
    const day = addDays(today, k);
    const plan = reminderPlan(items, m, day, idea);
    if (!plan) continue;
    out.push({ day, title: plan.title, body: plan.body, url: plan.url, seen: plan.seen });
    m = remember(m, plan, day);
  }
  return out;
}
