import assert from 'node:assert/strict';
import test from 'node:test';
import { getRendererPixelRatio, resolveGraphicsProfile } from './graphics';

test('automatic graphics selects balanced settings on touch and low settings for software WebGL', () => {
  assert.equal(resolveGraphicsProfile('auto', false, true).quality, 'medium');

  const softwareProfile = resolveGraphicsProfile('high', true, false);
  assert.equal(softwareProfile.quality, 'high');
  assert.equal(softwareProfile.shadowsEnabled, false);
  assert.equal(softwareProfile.shadowMapSize, 0);
  assert.equal(softwareProfile.maxPixelRatio, 1);
});

test('graphics profiles scale rendering resolution and cap device pixel ratio', () => {
  const low = resolveGraphicsProfile('low', false, false);
  const high = resolveGraphicsProfile('high', false, false);

  assert.equal(low.shadowsEnabled, false);
  assert.equal(low.resolutionScale, 0.65);
  assert.equal(high.shadowsEnabled, true);
  assert.equal(high.shadowMapSize, 2048);
  assert.equal(getRendererPixelRatio(3, low), 1);
  assert.equal(getRendererPixelRatio(3, high), 2);
  assert.equal(getRendererPixelRatio(Number.NaN, high), 1);
});
