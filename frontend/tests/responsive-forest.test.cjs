const assert = require('node:assert/strict');
const test = require('node:test');
const { loadModule } = require('./modules.cjs');

test('forest resize and reduced-motion changes tolerate a temporarily zero-height canvas', () => {
  let effect, resize, motionChange, draws = 0;
  let bounds = { width: 390, height: 0 };
  const context = {
    drawImage(source) {
      if (source.width === 0 || source.height === 0) throw new Error('empty source canvas');
      draws++;
    },
    clearRect() {}, fillRect() {},
    createLinearGradient: () => ({ addColorStop() {} }),
  };
  const element = {
    width: 0, height: 0,
    getContext: () => context,
    getBoundingClientRect: () => bounds,
    closest: () => null,
  };
  const motion = { matches: true, addEventListener: (_, cb) => { motionChange = cb; }, removeEventListener() {} };
  const { ForestEnvironment } = loadModule('src/components/landing/ForestEnvironment.tsx', {
    react: { useEffect: cb => { effect = cb; }, useRef: () => ({ current: element }) },
    './story': loadModule('src/components/landing/story.ts'),
    './cinematic.module.css': { default: { forest: 'forest' } },
  }, {
    window: { devicePixelRatio: 1, matchMedia: () => motion },
    document: { hidden: false, createElement: () => ({ width: 0, height: 0, getContext: () => context }) },
    Image: class { complete = true; naturalWidth = 1024; },
    IntersectionObserver: class { observe() {} disconnect() {} },
    ResizeObserver: class { constructor(cb) { resize = cb; } observe() {} disconnect() {} },
    cancelAnimationFrame() {}, requestAnimationFrame: () => 1,
  });
  ForestEnvironment({ progress: { current: 0 } });
  const cleanup = effect();
  assert.equal(draws, 0);
  bounds = { width: 390, height: 280 };
  resize();
  assert.ok(draws > 0, 'a visible forest renders');
  const visibleDraws = draws;
  bounds = { width: 390, height: 0 };
  resize();
  motionChange();
  assert.equal(draws, visibleDraws, 'hidden chapters skip painting');
  bounds = { width: 844, height: 180 };
  resize();
  assert.ok(draws > visibleDraws, 'landscape forest resumes rendering');
  cleanup();
});
