// Wasserwaage: Die Icons drehen sich gegen die Neigung des Handys und bleiben so waagerecht.
// Der Winkel steht als --tilt (in Grad) am <html>, das CSS dreht damit die Icons (css/style.css, „Wasserwaage“).
// iPhone: Bewegungssensoren brauchen eine Erlaubnis, die erst nach einem Antippen gefragt werden darf.
const MAX = 60; // darüber hinaus nicht weiter drehen
let tilt = 0;
let target = 0;
let frame = 0;
let on = false;

function paint() {
  frame = 0;
  tilt += (target - tilt) * 0.35; // glätten, damit nichts zittert
  document.documentElement.style.setProperty('--tilt', `${tilt.toFixed(1)}deg`);
  if (Math.abs(target - tilt) > 0.2) frame = requestAnimationFrame(paint);
}

function onTilt(e) {
  if (e.gamma == null) return;
  // Hochkant: gamma = Neigung nach links/rechts. Quer: beta übernimmt, dazu das Vorzeichen der Drehung.
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  const raw = angle === 90 ? -e.beta : angle === 270 || angle === -90 ? e.beta : angle === 180 ? -e.gamma : e.gamma;
  target = Math.max(-MAX, Math.min(MAX, raw || 0));
  if (!frame) frame = requestAnimationFrame(paint);
}

function start() {
  if (on) return;
  on = true;
  window.addEventListener('deviceorientation', onTilt);
}

export function initWaterlevel() {
  if (typeof window === 'undefined' || !('DeviceOrientationEvent' in window)) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const ask = DeviceOrientationEvent.requestPermission;
  if (typeof ask !== 'function') return start();
  // iOS: beim ersten Antippen fragen; wird abgelehnt, bleibt alles gerade.
  const once = () => {
    document.removeEventListener('click', once, true);
    ask.call(DeviceOrientationEvent).then((r) => { if (r === 'granted') start(); }).catch(() => {});
  };
  document.addEventListener('click', once, true);
}
