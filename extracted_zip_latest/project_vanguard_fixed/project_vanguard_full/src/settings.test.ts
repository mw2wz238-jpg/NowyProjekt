import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DEFAULT_GAME_SETTINGS,
  DEFAULT_KEY_BINDINGS,
  GameSettings,
  getActionForKey,
  loadGameSettings,
  normalizeGameSettings,
  normalizeCameraMotionSettings,
  getLookSensitivity,
  updateSprintState,
  normalizeAudioMixSettings,
  normalizeCrosshairSettings,
  normalizeKeyBindings,
  rebindGameAction,
  saveGameSettings,
} from './settings';

test('settings normalization clamps numeric controls and rejects invalid values', () => {
  assert.deepEqual(
    normalizeGameSettings({
      mouseSensitivity: 99,
      masterVolume: -2,
      isMuted: 'yes',
    }),
    {
      mouseSensitivity: 2,
      masterVolume: 0,
      isMuted: DEFAULT_GAME_SETTINGS.isMuted,
      keyBindings: DEFAULT_KEY_BINDINGS,
      graphicsQuality: 'auto',
      crosshair: DEFAULT_GAME_SETTINGS.crosshair,
      reduceVisualEffects: false,
      audioMix: DEFAULT_GAME_SETTINGS.audioMix,
      fieldOfView: 75,
      cameraMotion: DEFAULT_GAME_SETTINGS.cameraMotion,
      adsSensitivity: 1,
      invertLookY: false,
      sprintMode: 'hold',
      gamepadSensitivity: 1,
      gamepadDeadZone: 0.18,
    }
  );
  assert.deepEqual(normalizeGameSettings({ mouseSensitivity: Number.NaN }), DEFAULT_GAME_SETTINGS);
  assert.equal(normalizeGameSettings({ graphicsQuality: 'ultra' }).graphicsQuality, 'auto');
  assert.equal(normalizeGameSettings({ fieldOfView: 40 }).fieldOfView, 60);
  assert.equal(normalizeGameSettings({ fieldOfView: 140 }).fieldOfView, 110);
  assert.equal(normalizeGameSettings({ fieldOfView: Number.NaN }).fieldOfView, 75);
  assert.deepEqual(normalizeCameraMotionSettings({ headBob: -1, slideTilt: 3 }), {
    headBob: 0,
    slideTilt: 1,
  });
  assert.equal(normalizeGameSettings({ adsSensitivity: 4 }).adsSensitivity, 2);
  assert.equal(normalizeGameSettings({ adsSensitivity: Number.NaN }).adsSensitivity, 1);
  assert.equal(getLookSensitivity(1.5, false, 0.5), 1.5);
  assert.equal(getLookSensitivity(1.5, true, 0.5), 0.75);
  assert.equal(normalizeGameSettings({ invertLookY: true }).invertLookY, true);
  assert.equal(normalizeGameSettings({ sprintMode: 'toggle' }).sprintMode, 'toggle');
  assert.equal(normalizeGameSettings({ sprintMode: 'other' }).sprintMode, 'hold');
  assert.equal(normalizeGameSettings({ gamepadSensitivity: 9 }).gamepadSensitivity, 2);
  assert.equal(normalizeGameSettings({ gamepadSensitivity: Number.NaN }).gamepadSensitivity, 1);
  assert.equal(normalizeGameSettings({ gamepadDeadZone: -1 }).gamepadDeadZone, 0.05);
  assert.equal(normalizeGameSettings({ gamepadDeadZone: 1 }).gamepadDeadZone, 0.4);
  assert.equal(updateSprintState(false, 'hold', true), true);
  assert.equal(updateSprintState(true, 'hold', false), false);
  assert.equal(updateSprintState(false, 'toggle', true), true);
  assert.equal(updateSprintState(true, 'toggle', true), false);
  assert.equal(updateSprintState(true, 'toggle', false), true);
  assert.equal(
    normalizeGameSettings({ reduceVisualEffects: true }).reduceVisualEffects,
    true
  );
  assert.equal(
    normalizeGameSettings({ reduceVisualEffects: 'true' }).reduceVisualEffects,
    false
  );
  assert.deepEqual(normalizeAudioMixSettings({
    effects: -0.5,
    communications: 2,
    interface: Number.NaN,
  }), {
    effects: 0,
    communications: 1,
    interface: 1,
  });
});

test('crosshair settings clamp size and gap and reject unsupported colors', () => {
  assert.deepEqual(
    normalizeCrosshairSettings({
      enabled: false,
      color: 'ultraviolet',
      size: 99,
      gap: -4,
      showCenterDot: false,
    }),
    {
      enabled: false,
      color: DEFAULT_GAME_SETTINGS.crosshair.color,
      size: 16,
      gap: 0,
      showCenterDot: false,
    }
  );
});

test('settings persist and reload with validated values', () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, value),
  };
  const settings: GameSettings = {
    mouseSensitivity: 1.4,
    masterVolume: 0.65,
    isMuted: true,
    keyBindings: { ...DEFAULT_KEY_BINDINGS, moveForward: 'KeyI' },
    graphicsQuality: 'medium',
    crosshair: { ...DEFAULT_GAME_SETTINGS.crosshair, color: 'cyan', size: 12 },
    reduceVisualEffects: true,
    audioMix: { effects: 0.35, communications: 0.8, interface: 0 },
    fieldOfView: 96,
    cameraMotion: { headBob: 0, slideTilt: 0.5 },
    adsSensitivity: 0.75,
    invertLookY: true,
    sprintMode: 'toggle',
    gamepadSensitivity: 1.4,
    gamepadDeadZone: 0.24,
  };

  saveGameSettings(settings, storage);
  assert.deepEqual(loadGameSettings(storage), settings);
});

test('key bindings reject duplicate and reserved keys', () => {
  const conflict = rebindGameAction(DEFAULT_KEY_BINDINGS, 'moveForward', 'KeyR');
  assert.deepEqual(conflict, { success: false, reason: 'conflict' });

  const reserved = rebindGameAction(DEFAULT_KEY_BINDINGS, 'moveForward', 'Escape');
  assert.deepEqual(reserved, { success: false, reason: 'reserved' });
  assert.deepEqual(
    rebindGameAction(DEFAULT_KEY_BINDINGS, 'moveForward', 'F5'),
    { success: false, reason: 'reserved' }
  );

  const rebound = rebindGameAction(DEFAULT_KEY_BINDINGS, 'moveForward', 'KeyI');
  assert.equal(rebound.success, true);
  if (rebound.success) {
    assert.equal(rebound.bindings.moveForward, 'KeyI');
    assert.equal(getActionForKey(rebound.bindings, 'KeyI'), 'moveForward');
  }
});

test('legacy and conflicting stored key bindings normalize to unique defaults', () => {
  const legacy = normalizeGameSettings({ mouseSensitivity: 1.2 });
  assert.deepEqual(legacy.keyBindings, DEFAULT_KEY_BINDINGS);

  const conflicting = normalizeKeyBindings({
    moveForward: 'KeyS',
    moveBackward: 'KeyS',
    reload: 'Tab',
  });
  assert.equal(conflicting.moveForward, 'KeyS');
  assert.equal(conflicting.moveBackward, 'KeyW');
  assert.equal(conflicting.reload, DEFAULT_KEY_BINDINGS.reload);
  assert.equal(new Set(Object.values(conflicting)).size, Object.values(conflicting).length);
});

test('malformed stored settings fall back to defaults', () => {
  const storage = {
    getItem: () => '{not-json',
    setItem: () => {},
  };
  const originalWarn = console.warn;
  console.warn = () => {};
  try {
    assert.deepEqual(loadGameSettings(storage), DEFAULT_GAME_SETTINGS);
  } finally {
    console.warn = originalWarn;
  }
});
