import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// Die App darf erst zeichnen, wenn alle Konstanten oben definiert sind – sonst bleibt der Start leer.
test('Start: erstes render() steht nach allen Konstanten und Variablen', () => {
  const lines = readFileSync(new URL('../js/app.js', import.meta.url), 'utf8').split('\n');
  const first = lines.findIndex((l) => /^render\(\);/.test(l));
  const lastDecl = lines.findLastIndex((l) => /^(const|let) /.test(l));
  assert.ok(first > 0, 'render() wird aufgerufen');
  assert.ok(first > lastDecl, `render() in Zeile ${first + 1}, aber Zeile ${lastDecl + 1} definiert noch etwas`);
});
