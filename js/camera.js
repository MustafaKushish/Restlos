// Kamera-Scanner: Live-Bild mit Rahmen, Hinweise in Echtzeit (zu dunkel, ruhig halten), Taschenlampe
// und mehrere Fotos hintereinander für lange Bons. Liefert die Fotos als Blobs zurück.
export const MAX_SHOTS = 6;

export const cameraSupported = () => !!globalThis.navigator?.mediaDevices?.getUserMedia && globalThis.isSecureContext !== false;

function cameraError(e) {
  const name = e?.name || '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'Die Kamera wurde nicht erlaubt. Du kannst sie in den Browser-Einstellungen für diese Seite erlauben – oder ein Foto auswählen.';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'Keine Kamera gefunden. Wähl einfach ein Foto vom Bon aus.';
  if (name === 'NotReadableError') return 'Die Kamera wird gerade von einer anderen App benutzt. Schließ sie und versuch es nochmal.';
  return 'Die Kamera ließ sich nicht starten. Wähl einfach ein Foto vom Bon aus.';
}

async function openStream() {
  // So scharf wie möglich – kleine Bonschrift braucht viele Bildpunkte.
  const tries = [
    { facingMode: { ideal: 'environment' }, width: { ideal: 3840 }, height: { ideal: 2160 } },
    { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
    true,
  ];
  let err;
  for (const video of tries) {
    try { return await navigator.mediaDevices.getUserMedia({ video, audio: false }); } catch (e) {
      err = e;
      if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError' || e?.name === 'NotReadableError') break;
    }
  }
  throw new Error(cameraError(err), { cause: err });
}

// Helligkeit und Bewegung aus einem kleinen Vorschaubild – reicht für die Hinweise und kostet kaum Akku.
export function frameStats(data, prev) {
  let light = 0, moved = 0;
  const n = data.length / 4;
  const gray = new Uint8ClampedArray(n);
  for (let i = 0; i < n; i++) {
    gray[i] = (data[i * 4] * 3 + data[i * 4 + 1] * 6 + data[i * 4 + 2]) / 10;
    light += gray[i];
    if (prev) moved += Math.abs(gray[i] - prev[i]);
  }
  return { gray, light: light / n, moved: prev ? moved / n : 0 };
}

export function hintFor({ light, moved }, { shots, torch }) {
  if (light < 55) return { text: torch ? 'Zu dunkel – Lampe an oder mehr Licht' : 'Zu dunkel – mehr Licht bitte', ok: false };
  if (light > 235) return { text: 'Zu hell – Spiegelung vermeiden', ok: false };
  if (moved > 14) return { text: 'Ruhig halten …', ok: false };
  return { text: shots ? 'Gut – nächstes Stück oder „Fertig“' : 'Gut so – jetzt auslösen', ok: true };
}

let dialog;
function ui() {
  if (dialog) return dialog;
  dialog = document.createElement('dialog');
  dialog.id = 'cam';
  dialog.setAttribute('aria-label', 'Kassenbon scannen');
  dialog.innerHTML = `
    <div class="cam-stage">
      <video playsinline muted autoplay></video>
      <div class="cam-frame" aria-hidden="true"><i></i><i></i><i></i><i></i></div>
      <div class="cam-flash"></div>
    </div>
    <div class="cam-top">
      <button class="cam-round" data-cam="close" aria-label="Schließen">✕</button>
      <p class="cam-hint" role="status" aria-live="polite">Kamera startet …</p>
      <button class="cam-round" data-cam="torch" aria-label="Lampe" aria-pressed="false" hidden>🔦</button>
    </div>
    <div class="cam-bar">
      <p class="cam-tip">Bon flach hinlegen und ganz in den Rahmen. Langer Bon? Oben anfangen, dann weiter unten noch ein Foto – etwas überlappend.</p>
      <div class="cam-shots"></div>
      <div class="cam-controls">
        <button class="cam-side" data-cam="gallery"><span>🖼️</span>Foto wählen</button>
        <button class="cam-shutter" data-cam="shoot" aria-label="Foto aufnehmen"></button>
        <button class="cam-side done" data-cam="done" disabled><span>✓</span>Fertig</button>
      </div>
    </div>
    <input type="file" accept="image/*" multiple hidden>`;
  document.body.append(dialog);
  return dialog;
}

// Öffnet die Kamera. Ergebnis: Liste der Fotos (Blobs) oder null, wenn abgebrochen.
// Lässt sich die Kamera nicht starten, kommt ein Fehler mit verständlicher Meldung.
export async function scanCamera({ existing = [] } = {}) {
  const d = ui();
  const $ = (s) => d.querySelector(s);
  const video = $('video');
  const shots = [...existing];
  const urls = new Map();
  const stream = await openStream();
  const track = stream.getVideoTracks()[0];
  const caps = track.getCapabilities?.() || {};
  if (caps.focusMode?.includes('continuous')) track.applyConstraints({ advanced: [{ focusMode: 'continuous' }] }).catch(() => {});
  let torchOn = false;
  $('[data-cam="torch"]').hidden = !caps.torch;
  video.srcObject = stream;
  d.showModal();
  video.play().catch(() => {});

  const small = document.createElement('canvas');
  small.width = 64; small.height = 64;
  const sctx = small.getContext('2d', { willReadFrequently: true });
  let prev = null;
  const hint = $('.cam-hint');
  const timer = setInterval(() => {
    if (video.readyState < 2) return;
    sctx.drawImage(video, 0, 0, 64, 64);
    const st = frameStats(sctx.getImageData(0, 0, 64, 64).data, prev);
    prev = st.gray;
    const h = hintFor(st, { shots: shots.length, torch: !!caps.torch && !torchOn });
    hint.textContent = h.text;
    hint.classList.toggle('ok', h.ok);
  }, 350);

  const drawShots = () => {
    $('.cam-shots').innerHTML = shots.map((b, n) => {
      if (!urls.has(b)) urls.set(b, URL.createObjectURL(b));
      return `<span class="cam-thumb"><img src="${urls.get(b)}" alt="Foto ${n + 1}"><button data-cam="drop" data-n="${n}" aria-label="Foto ${n + 1} löschen">✕</button></span>`;
    }).join('');
    const done = $('[data-cam="done"]');
    done.disabled = !shots.length;
    done.innerHTML = `<span>✓</span>Fertig${shots.length ? ` (${shots.length})` : ''}`;
    $('[data-cam="shoot"]').disabled = shots.length >= MAX_SHOTS;
    $('.cam-tip').hidden = shots.length > 0;
  };
  drawShots();

  const shoot = async () => {
    if (video.readyState < 2 || shots.length >= MAX_SHOTS) return;
    const c = document.createElement('canvas');
    c.width = video.videoWidth;
    c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    const flash = $('.cam-flash');
    flash.classList.remove('go'); void flash.offsetWidth; flash.classList.add('go');
    navigator.vibrate?.(30);
    const blob = await new Promise((ok) => c.toBlob(ok, 'image/jpeg', 0.92));
    if (blob) { shots.push(blob); drawShots(); }
  };

  return new Promise((resolve) => {
    const finish = (result) => {
      clearInterval(timer);
      stream.getTracks().forEach((t) => t.stop());
      video.srcObject = null;
      d.removeEventListener('click', onClick);
      d.removeEventListener('cancel', onCancel);
      input.removeEventListener('change', onPick);
      d.close();
      // Sonst bleibt nach „Zurück“ ein Fokus-Rahmen um den Kassenbon-Knopf stehen.
      document.activeElement?.blur();
      for (const [b, u] of urls) if (!result?.includes(b)) URL.revokeObjectURL(u);
      resolve(result);
    };
    const input = $('input[type="file"]');
    const onPick = () => {
      const files = [...input.files].slice(0, MAX_SHOTS - shots.length);
      input.value = '';
      if (files.length) finish([...shots, ...files]);
    };
    const onCancel = (e) => { e.preventDefault(); finish(null); };
    const onClick = (e) => {
      const b = e.target.closest('[data-cam]');
      if (!b || b.disabled) return;
      const act = b.dataset.cam;
      if (act === 'close') finish(null);
      else if (act === 'shoot') shoot();
      else if (act === 'done') finish(shots);
      else if (act === 'gallery') input.click();
      else if (act === 'drop') { shots.splice(+b.dataset.n, 1); drawShots(); }
      else if (act === 'torch') {
        torchOn = !torchOn;
        track.applyConstraints({ advanced: [{ torch: torchOn }] }).catch(() => { torchOn = false; });
        b.setAttribute('aria-pressed', String(torchOn));
      }
    };
    d.addEventListener('click', onClick);
    d.addEventListener('cancel', onCancel);
    input.addEventListener('change', onPick);
  });
}
