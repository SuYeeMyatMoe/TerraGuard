const assert = require('node:assert/strict');
const test = require('node:test');
const { loadModule } = require('./modules.cjs');

test('map framing leaves usable map area on phones, tablets and short landscape screens', () => {
  const { mapPadding } = loadModule('src/lib/map-layout.ts');
  for (const [width, height] of [[320, 320], [390, 440], [768, 440], [1024, 400], [1440, 780], [844, 260]]) {
    for (const overview of [false, true]) {
      const p = mapPadding(width, height, overview);
      assert.ok(Object.values(p).every(n => Number.isFinite(n) && n >= 0));
      assert.ok(width - p.left - p.right >= Math.min(width * 0.7, 300), `${width} horizontal space`);
      assert.ok(height - p.top - p.bottom >= height * 0.45, `${height} vertical space`);
      if (width < 1024) assert.equal(p.left, p.right, 'compact maps center the selected location');
    }
  }
});

test('desktop camera framing keeps the incident centered between external side panels', () => {
  const { mapPadding } = loadModule('src/lib/map-layout.ts');
  assert.deepEqual({ ...mapPadding(1440, 780, false) }, { top: 0, bottom: 0, left: 24, right: 24 });
  assert.deepEqual({ ...mapPadding(1440, 780, true) }, { top: 90, bottom: 230, left: 24, right: 24 });
});
