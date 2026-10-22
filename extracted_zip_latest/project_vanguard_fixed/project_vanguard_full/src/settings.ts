export const GAME_ACTIONS = [
  'moveForward',
  'moveBackward',
  'moveLeft',
  'moveRight',
  'jump',
  'sprint',
  'crouch',
  'reload',
  'interact',
  'frag',
  'smoke',
  'flashbang',
  'claymore',
  'inspect',
  'buyMenu',
  'uav',
  'airstrike',
  'predator',
] as const;

export type GameAction = (typeof GAME_ACTIONS)[number];
export type GameKeyBindings = Record<GameAction, string>;

export const DEFAULT_KEY_BINDINGS: GameKeyBindings = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  jump: 'Space',
  sprint: 'ShiftLeft',
  crouch: 'KeyC',
  reload: 'KeyR',
  interact: 'KeyE',
  frag: 'KeyG',
  smoke: 'KeyF',
  flashbang: 'KeyX',
  claymore: 'KeyV',
  inspect: 'KeyY',
  buyMenu: 'KeyB',
  uav: 'Digit1',
  airstrike: 'Digit2',
  predator: 'Digit3',
};

export interface GameSettings {
  mouseSensitivity: number;
  masterVolume: number;
  isMuted: boolean;
  keyBindings: GameKeyBindings;
  graphicsQuality: GraphicsQuality;
  crosshair: CrosshairSettings;
  reduceVisualEffects: boolean;
  audioMix: AudioMixSettings;
  fieldOfView: number;
  cameraMotion: CameraMotionSettings;
  adsSensitivity: number;
  invertLookY: boolean;
  sprintMode: 'hold' | 'toggle';
  gamepadSensitivity: number;
  gamepadDeadZone: number;
}

export interface CameraMotionSettings {
  headBob: number;
  slideTilt: number;
}

export interface AudioMixSettings {
  effects: number;
  communications: number;
  interface: number;
}

export type GraphicsQuality = 'auto' | 'low' | 'medium' | 'high';
export type CrosshairColor = 'green' | 'cyan' | 'magenta' | 'yellow' | 'white' | 'red';

export interface CrosshairSettings {
  enabled: boolean;
  color: CrosshairColor;
  size: number;
  gap: number;
  showCenterDot: boolean;
}

export const DEFAULT_GAME_SETTINGS: GameSettings = {
  mouseSensitivity: 1,
  masterVolume: 1,
  isMuted: false,
  keyBindings: { ...DEFAULT_KEY_BINDINGS },
  graphicsQuality: 'auto',
  crosshair: {
    enabled: true,
    color: 'green',
    size: 8,
    gap: 4,
    showCenterDot: true,
  },
  reduceVisualEffects: false,
  audioMix: {
    effects: 1,
    communications: 1,
    interface: 1,
  },
  fieldOfView: 75,
  cameraMotion: { headBob: 1, slideTilt: 1 },
  adsSensitivity: 1,
  invertLookY: false,
  sprintMode: 'hold',
  gamepadSensitivity: 1,
  gamepadDeadZone: 0.18,
};

const STORAGE_KEY = 'project-vanguard-settings';
type SettingsStorage = Pick<Storage, 'getItem' | 'setItem'>;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export const normalizeGameSettings = (value: unknown): GameSettings => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_GAME_SETTINGS };
  }

  const candidate = value as Partial<GameSettings>;
  const keyBindings = normalizeKeyBindings(candidate.keyBindings);
  const crosshair = normalizeCrosshairSettings(candidate.crosshair);
  const audioMix = normalizeAudioMixSettings(candidate.audioMix);
  return {
    mouseSensitivity:
      typeof candidate.mouseSensitivity === 'number' && Number.isFinite(candidate.mouseSensitivity)
        ? clamp(candidate.mouseSensitivity, 0.5, 2)
        : DEFAULT_GAME_SETTINGS.mouseSensitivity,
    masterVolume:
      typeof candidate.masterVolume === 'number' && Number.isFinite(candidate.masterVolume)
        ? clamp(candidate.masterVolume, 0, 1)
        : DEFAULT_GAME_SETTINGS.masterVolume,
    isMuted: typeof candidate.isMuted === 'boolean' ? candidate.isMuted : DEFAULT_GAME_SETTINGS.isMuted,
    keyBindings,
    graphicsQuality:
      candidate.graphicsQuality === 'auto' ||
      candidate.graphicsQuality === 'low' ||
      candidate.graphicsQuality === 'medium' ||
      candidate.graphicsQuality === 'high'
        ? candidate.graphicsQuality
        : DEFAULT_GAME_SETTINGS.graphicsQuality,
    crosshair,
    reduceVisualEffects:
      typeof candidate.reduceVisualEffects === 'boolean'
        ? candidate.reduceVisualEffects
        : DEFAULT_GAME_SETTINGS.reduceVisualEffects,
    audioMix,
    fieldOfView:
      typeof candidate.fieldOfView === 'number' && Number.isFinite(candidate.fieldOfView)
        ? clamp(candidate.fieldOfView, 60, 110)
        : DEFAULT_GAME_SETTINGS.fieldOfView,
    cameraMotion: normalizeCameraMotionSettings(candidate.cameraMotion),
    adsSensitivity:
      typeof candidate.adsSensitivity === 'number' && Number.isFinite(candidate.adsSensitivity)
        ? clamp(candidate.adsSensitivity, 0.25, 2)
        : DEFAULT_GAME_SETTINGS.adsSensitivity,
    invertLookY:
      typeof candidate.invertLookY === 'boolean'
        ? candidate.invertLookY
        : DEFAULT_GAME_SETTINGS.invertLookY,
    sprintMode:
      candidate.sprintMode === 'hold' || candidate.sprintMode === 'toggle'
        ? candidate.sprintMode
        : DEFAULT_GAME_SETTINGS.sprintMode,
    gamepadSensitivity:
      typeof candidate.gamepadSensitivity === 'number' && Number.isFinite(candidate.gamepadSensitivity)
        ? clamp(candidate.gamepadSensitivity, 0.25, 2)
        : DEFAULT_GAME_SETTINGS.gamepadSensitivity,
    gamepadDeadZone:
      typeof candidate.gamepadDeadZone === 'number' && Number.isFinite(candidate.gamepadDeadZone)
        ? clamp(candidate.gamepadDeadZone, 0.05, 0.4)
        : DEFAULT_GAME_SETTINGS.gamepadDeadZone,
  };
};

export const normalizeCameraMotionSettings = (value: unknown): CameraMotionSettings => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_GAME_SETTINGS.cameraMotion };
  }
  const candidate = value as Partial<CameraMotionSettings>;
  const normalizeAmount = (amount: unknown, fallback: number): number =>
    typeof amount === 'number' && Number.isFinite(amount) ? clamp(amount, 0, 1) : fallback;
  return {
    headBob: normalizeAmount(candidate.headBob, DEFAULT_GAME_SETTINGS.cameraMotion.headBob),
    slideTilt: normalizeAmount(candidate.slideTilt, DEFAULT_GAME_SETTINGS.cameraMotion.slideTilt),
  };
};

export const getLookSensitivity = (
  baseSensitivity: number,
  isAds: boolean,
  adsSensitivity: number
): number => baseSensitivity * (isAds ? adsSensitivity : 1);

export const updateSprintState = (
  isSprinting: boolean,
  mode: 'hold' | 'toggle',
  pressed: boolean
): boolean => (mode === 'hold' ? pressed : pressed ? !isSprinting : isSprinting);

export const normalizeAudioMixSettings = (value: unknown): AudioMixSettings => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_GAME_SETTINGS.audioMix };
  }
  const candidate = value as Partial<AudioMixSettings>;
  const normalizeVolume = (volume: unknown, fallback: number): number =>
    typeof volume === 'number' && Number.isFinite(volume)
      ? clamp(volume, 0, 1)
      : fallback;
  return {
    effects: normalizeVolume(candidate.effects, DEFAULT_GAME_SETTINGS.audioMix.effects),
    communications: normalizeVolume(
      candidate.communications,
      DEFAULT_GAME_SETTINGS.audioMix.communications
    ),
    interface: normalizeVolume(candidate.interface, DEFAULT_GAME_SETTINGS.audioMix.interface),
  };
};

const CROSSHAIR_COLORS: CrosshairColor[] = [
  'green',
  'cyan',
  'magenta',
  'yellow',
  'white',
  'red',
];

export const normalizeCrosshairSettings = (value: unknown): CrosshairSettings => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_GAME_SETTINGS.crosshair };
  }
  const candidate = value as Partial<CrosshairSettings>;
  return {
    enabled:
      typeof candidate.enabled === 'boolean'
        ? candidate.enabled
        : DEFAULT_GAME_SETTINGS.crosshair.enabled,
    color:
      candidate.color && CROSSHAIR_COLORS.includes(candidate.color)
        ? candidate.color
        : DEFAULT_GAME_SETTINGS.crosshair.color,
    size:
      typeof candidate.size === 'number' && Number.isFinite(candidate.size)
        ? clamp(candidate.size, 4, 16)
        : DEFAULT_GAME_SETTINGS.crosshair.size,
    gap:
      typeof candidate.gap === 'number' && Number.isFinite(candidate.gap)
        ? clamp(candidate.gap, 0, 12)
        : DEFAULT_GAME_SETTINGS.crosshair.gap,
    showCenterDot:
      typeof candidate.showCenterDot === 'boolean'
        ? candidate.showCenterDot
        : DEFAULT_GAME_SETTINGS.crosshair.showCenterDot,
  };
};

const isBindableKeyCode = (code: unknown): code is string =>
  typeof code === 'string' &&
  (/^(Key[A-Z]|Digit[0-9]|Numpad[0-9])$/.test(code) ||
    [
      'Space',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Backquote',
      'Minus',
      'Equal',
      'BracketLeft',
      'BracketRight',
      'Backslash',
      'Semicolon',
      'Quote',
      'Comma',
      'Period',
      'Slash',
    ].includes(code));

export const normalizeKeyBindings = (value: unknown): GameKeyBindings => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { ...DEFAULT_KEY_BINDINGS };
  }

  const candidate = value as Partial<Record<GameAction, unknown>>;
  const normalized = {} as GameKeyBindings;
  const usedCodes = new Set<string>();

  for (const action of GAME_ACTIONS) {
    const code = candidate[action];
    const selectedCode =
      isBindableKeyCode(code) && !usedCodes.has(code)
        ? code
        : !usedCodes.has(DEFAULT_KEY_BINDINGS[action])
          ? DEFAULT_KEY_BINDINGS[action]
          : GAME_ACTIONS.map((fallbackAction) => DEFAULT_KEY_BINDINGS[fallbackAction]).find(
              (fallbackCode) => !usedCodes.has(fallbackCode)
            ) ?? DEFAULT_KEY_BINDINGS[action];
    normalized[action] = selectedCode;
    usedCodes.add(selectedCode);
  }

  return normalized;
};

export type RebindResult =
  | { success: true; bindings: GameKeyBindings }
  | { success: false; reason: 'reserved' | 'conflict' };

export const rebindGameAction = (
  bindings: GameKeyBindings,
  action: GameAction,
  code: string
): RebindResult => {
  if (!isBindableKeyCode(code)) return { success: false, reason: 'reserved' };
  const conflict = GAME_ACTIONS.find(
    (candidate) => candidate !== action && bindings[candidate] === code
  );
  if (conflict) return { success: false, reason: 'conflict' };
  return { success: true, bindings: { ...bindings, [action]: code } };
};

export const getActionForKey = (
  bindings: GameKeyBindings,
  code: string
): GameAction | null =>
  GAME_ACTIONS.find((action) => bindings[action] === code) ?? null;

export const MOVEMENT_KEY_FOR_ACTION: Partial<Record<GameAction, string>> = {
  moveForward: 'KeyW',
  moveBackward: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  interact: 'KeyE',
};

export const formatKeyCode = (code: string): string => {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code === 'Space') return 'SPACJA';
  if (code === 'ShiftLeft' || code === 'ShiftRight') return 'SHIFT';
  if (code === 'ControlLeft' || code === 'ControlRight') return 'CTRL';
  if (code === 'AltLeft' || code === 'AltRight') return 'ALT';
  return code;
};

export const loadGameSettings = (storage?: SettingsStorage): GameSettings => {
  try {
    const source = storage ?? window.localStorage;
    const serialized = source.getItem(STORAGE_KEY);
    return serialized === null
      ? { ...DEFAULT_GAME_SETTINGS }
      : normalizeGameSettings(JSON.parse(serialized));
  } catch (error) {
    console.warn('Nie udało się wczytać ustawień gry; używam wartości domyślnych.', error);
    return { ...DEFAULT_GAME_SETTINGS };
  }
};

export const saveGameSettings = (settings: GameSettings, storage?: SettingsStorage): void => {
  try {
    const target = storage ?? window.localStorage;
    target.setItem(STORAGE_KEY, JSON.stringify(normalizeGameSettings(settings)));
  } catch (error) {
    console.warn('Nie udało się zapisać ustawień gry.', error);
  }
};
