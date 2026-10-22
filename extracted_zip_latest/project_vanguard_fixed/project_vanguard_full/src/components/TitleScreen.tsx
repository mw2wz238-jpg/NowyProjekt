import React from 'react';
import { Play, Sliders, MapPin, Volume2, VolumeX, Shield, Settings2, Keyboard } from 'lucide-react';
import { BotDifficulty, MapId } from '../types/game';
import {
  CrosshairSettings,
  CameraMotionSettings,
  AudioMixSettings,
  DEFAULT_GAME_SETTINGS,
  GameKeyBindings,
  normalizeCrosshairSettings,
} from '../settings';
import { GraphicsQuality } from '../settings';
import { KeyBindingsModal } from './KeyBindingsModal';
import { Crosshair } from './Crosshair';
import { CROSSHAIR_COLOR_LABELS } from './crosshairColors';

interface TitleScreenProps {
  onStartGame: () => void;
  onOpenGunsmith: () => void;
  onOpenMapSelect: () => void;
  currentMap: MapId;
  botDifficulty: BotDifficulty;
  onBotDifficultyChange: (difficulty: BotDifficulty) => void;
  isMuted: boolean;
  onToggleMute: () => void;
  mouseSensitivity: number;
  masterVolume: number;
  onMouseSensitivityChange: (sensitivity: number) => void;
  onMasterVolumeChange: (volume: number) => void;
  keyBindings: GameKeyBindings;
  onKeyBindingsChange: (bindings: GameKeyBindings) => void;
  graphicsQuality: GraphicsQuality;
  onGraphicsQualityChange: (quality: GraphicsQuality) => void;
  crosshair: CrosshairSettings;
  onCrosshairChange: (crosshair: CrosshairSettings) => void;
  reduceVisualEffects: boolean;
  onReduceVisualEffectsChange: (enabled: boolean) => void;
  audioMix: AudioMixSettings;
  onAudioMixChange: (audioMix: AudioMixSettings) => void;
  fieldOfView: number;
  onFieldOfViewChange: (fieldOfView: number) => void;
  cameraMotion: CameraMotionSettings;
  onCameraMotionChange: (cameraMotion: CameraMotionSettings) => void;
  adsSensitivity: number;
  onAdsSensitivityChange: (sensitivity: number) => void;
  invertLookY: boolean;
  onInvertLookYChange: (invert: boolean) => void;
  sprintMode: 'hold' | 'toggle';
  onSprintModeChange: (mode: 'hold' | 'toggle') => void;
  gamepadSensitivity: number;
  onGamepadSensitivityChange: (sensitivity: number) => void;
  gamepadDeadZone: number;
  onGamepadDeadZoneChange: (deadZone: number) => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStartGame,
  onOpenGunsmith,
  onOpenMapSelect,
  currentMap,
  botDifficulty,
  onBotDifficultyChange,
  isMuted,
  onToggleMute,
  mouseSensitivity,
  masterVolume,
  onMouseSensitivityChange,
  onMasterVolumeChange,
  keyBindings,
  onKeyBindingsChange,
  graphicsQuality,
  onGraphicsQualityChange,
  crosshair,
  onCrosshairChange,
  reduceVisualEffects,
  onReduceVisualEffectsChange,
  audioMix,
  onAudioMixChange,
  fieldOfView,
  onFieldOfViewChange,
  cameraMotion,
  onCameraMotionChange,
  adsSensitivity,
  onAdsSensitivityChange,
  invertLookY,
  onInvertLookYChange,
  sprintMode,
  onSprintModeChange,
  gamepadSensitivity,
  onGamepadSensitivityChange,
  gamepadDeadZone,
  onGamepadDeadZoneChange,
}) => {
  const [showSettings, setShowSettings] = React.useState(false);
  const [showKeyBindings, setShowKeyBindings] = React.useState(false);
  const mapNames: Record<MapId, string> = {
    industrial: 'Strefa Przemysłowa (Dzień)',
    winter_village: 'Górska Wioska (Zima)',
    night_docks: 'Doki (Noc / Deszcz)',
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-between gap-8 overflow-y-auto p-4 sm:p-8 lg:p-12 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent pointer-events-none select-none text-white font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between pointer-events-auto">
        <div className="flex items-center gap-3">
          {/* Bespoke inline SVG logo lockup */}
          <svg className="w-10 h-10 text-amber-500 fill-current" viewBox="0 0 100 100">
            <polygon points="50,5 95,85 70,85 50,45 30,85 5,85" />
            <polygon points="50,60 62,85 38,85" />
          </svg>
          <div className="flex flex-col">
            <span className="text-xs font-black tracking-widest text-amber-400 uppercase">
              PROJECT VANGUARD
            </span>
            <span className="text-[10px] tracking-wider text-zinc-400 font-bold uppercase">
              AAA COMPETITIVE FPS • 5v5 TAC-SHOOTER
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleMute}
            className="p-3 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 rounded-xl text-zinc-300 hover:text-white cursor-pointer transition-all shadow-lg"
            title={isMuted ? 'Włącz dźwięk' : 'Wycisz dźwięk'}
            aria-label={isMuted ? 'Włącz dźwięk' : 'Wycisz dźwięk'}
          >
            {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
          </button>
          <button
            type="button"
            onClick={() => setShowSettings((visible) => !visible)}
            className="p-3 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 rounded-xl text-zinc-300 hover:text-white cursor-pointer transition-all shadow-lg"
            aria-expanded={showSettings}
            aria-controls="game-settings"
            aria-label="Ustawienia gry"
          >
            <Settings2 className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Center Title Lockup */}
      <div className="max-w-2xl flex flex-col gap-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-md text-[11px] font-black text-amber-400 tracking-wider uppercase w-fit">
          <Shield className="w-3.5 h-3.5" />
          SILNIK PBR WEBGL2 • TAKTYCZNY CYKL RUND
        </div>

        <h1 className="text-4xl font-black tracking-tight text-white uppercase drop-shadow-2xl leading-none sm:text-6xl">
          PROJECT<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-white">
            VANGUARD
          </span>
        </h1>

        <p className="text-sm text-zinc-300 font-medium max-w-lg leading-relaxed drop-shadow-md">
          Profesjonalny taktyczny shooter pierwszoosobowy 3D. Pełen cykl rundy (Faza zakupów, Live Combat, System nagród), zaawansowany Rusznikarz i taktyczna fizyka granatów dymnych.
        </p>

        {/* Primary CTA Buttons */}
        <div className="flex flex-wrap items-center gap-3 mt-4 pointer-events-auto">
          <button
            onClick={onStartGame}
            className="flex items-center gap-3 px-8 py-4 bg-amber-500 hover:bg-amber-400 text-zinc-950 font-black tracking-widest text-sm rounded-xl shadow-[0_0_30px_rgba(245,158,11,0.6)] transition-all transform hover:scale-105 active:scale-95 cursor-pointer uppercase"
          >
            <Play className="w-5 h-5 fill-current" />
            ROZPOCZNIJ MECZ 5v5
          </button>

          <button
            onClick={onOpenGunsmith}
            className="flex items-center gap-2.5 px-6 py-4 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-white font-black tracking-wider text-xs rounded-xl shadow-lg transition-all cursor-pointer uppercase"
          >
            <Sliders className="w-4 h-4 text-amber-400" />
            RUSZNIKARZ
          </button>

          <button
            onClick={onOpenMapSelect}
            className="flex items-center gap-2.5 px-6 py-4 bg-zinc-900/90 hover:bg-zinc-800 border border-zinc-700/80 text-white font-black tracking-wider text-xs rounded-xl shadow-lg transition-all cursor-pointer uppercase"
          >
            <MapPin className="w-4 h-4 text-blue-400" />
            MAPA: {mapNames[currentMap]}
          </button>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2 pointer-events-auto">
          <span className="mr-2 text-[10px] font-black tracking-widest text-zinc-400 uppercase">Poziom botów</span>
          {([
            ['recruit', 'REKRUT'],
            ['veteran', 'WETERAN'],
            ['elite', 'ELITA'],
          ] as const).map(([difficulty, label]) => (
            <button
              key={difficulty}
              type="button"
              aria-pressed={botDifficulty === difficulty}
              onClick={() => onBotDifficultyChange(difficulty)}
              className={`rounded-lg border px-3 py-2 text-[10px] font-black tracking-wider transition-colors ${
                botDifficulty === difficulty
                  ? 'border-amber-400 bg-amber-500 text-zinc-950'
                  : 'border-zinc-700 bg-zinc-900/80 text-zinc-300 hover:border-zinc-500 hover:text-white'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {showSettings && (
          <section
            id="game-settings"
            aria-label="Ustawienia gry"
            className="mt-4 grid max-w-xl gap-4 rounded-xl border border-zinc-700/80 bg-zinc-950/90 p-4 pointer-events-auto sm:grid-cols-2"
          >
            <label className="grid gap-2 text-xs font-bold text-zinc-200">
              <span className="flex justify-between gap-4">
                <span>Czułość myszy</span>
                <output>{Math.round(mouseSensitivity * 100)}%</output>
              </span>
              <input
                type="range"
                min="0.5"
                max="2"
                step="0.05"
                value={mouseSensitivity}
                onChange={(event) => onMouseSensitivityChange(Number(event.currentTarget.value))}
                aria-label="Czułość myszy"
                className="w-full accent-amber-400"
              />
            </label>
            <label className="flex items-center justify-between gap-4 text-xs font-bold text-zinc-200">
              <span>Odwróć oś pionową</span>
              <input
                type="checkbox"
                checked={invertLookY}
                onChange={(event) => onInvertLookYChange(event.currentTarget.checked)}
                aria-label="Odwróć oś pionową"
                className="h-4 w-4 accent-amber-400"
              />
            </label>
            <label className="grid gap-2 text-xs font-bold text-zinc-200">
              <span>Tryb sprintu</span>
              <select
                value={sprintMode}
                onChange={(event) =>
                  onSprintModeChange(event.currentTarget.value === 'toggle' ? 'toggle' : 'hold')
                }
                aria-label="Tryb sprintu"
                className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm"
              >
                <option value="hold">Przytrzymaj</option>
                <option value="toggle">Przełącz</option>
              </select>
            </label>
            <label className="grid gap-2 text-xs font-bold text-zinc-200">
              <span className="flex justify-between gap-4">
                <span>Czułość gamepada</span>
                <output>{Math.round(gamepadSensitivity * 100)}%</output>
              </span>
              <input
                type="range"
                min="0.25"
                max="2"
                step="0.05"
                value={gamepadSensitivity}
                onChange={(event) =>
                  onGamepadSensitivityChange(Number(event.currentTarget.value))
                }
                aria-label="Czułość kamery gamepada"
                className="w-full accent-amber-400"
              />
            </label>
            <label className="grid gap-2 text-xs font-bold text-zinc-200">
              <span className="flex justify-between gap-4">
                <span>Martwa strefa drążków</span>
                <output>{Math.round(gamepadDeadZone * 100)}%</output>
              </span>
              <input
                type="range"
                min="0.05"
                max="0.4"
                step="0.01"
                value={gamepadDeadZone}
                onChange={(event) =>
                  onGamepadDeadZoneChange(Number(event.currentTarget.value))
                }
                aria-label="Martwa strefa drążków gamepada"
                className="w-full accent-amber-400"
              />
            </label>
            <label className="grid gap-2 text-xs font-bold text-zinc-200 sm:col-span-2">
              <span className="flex justify-between gap-4">
                <span>Pole widzenia (FOV)</span>
                <output>{fieldOfView}°</output>
              </span>
              <input
                type="range"
                min="60"
                max="110"
                step="1"
                value={fieldOfView}
                onChange={(event) => onFieldOfViewChange(Number(event.currentTarget.value))}
                aria-label="Pole widzenia"
                className="w-full accent-amber-400"
              />
              <span className="text-[10px] font-normal text-zinc-400">
                Wyższa wartość pokazuje więcej otoczenia. Zoom ADS pozostaje bez zmian.
              </span>
            </label>
            {([
              ['headBob', 'Kołysanie kamery podczas ruchu'],
              ['slideTilt', 'Przechył kamery podczas ślizgu'],
            ] as const).map(([setting, label]) => (
              <label key={setting} className="grid gap-2 text-xs font-bold text-zinc-200">
                <span className="flex justify-between gap-4">
                  <span>{label}</span>
                  <output>{Math.round(cameraMotion[setting] * 100)}%</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={cameraMotion[setting]}
                  onChange={(event) =>
                    onCameraMotionChange({
                      ...cameraMotion,
                      [setting]: Number(event.currentTarget.value),
                    })
                  }
                  aria-label={label}
                  className="w-full accent-amber-400"
                />
              </label>
            ))}
            <label className="grid gap-2 text-xs font-bold text-zinc-200">
              <span className="flex justify-between gap-4">
                <span>Czułość podczas ADS</span>
                <output>{Math.round(adsSensitivity * 100)}%</output>
              </span>
              <input
                type="range"
                min="0.25"
                max="2"
                step="0.05"
                value={adsSensitivity}
                onChange={(event) => onAdsSensitivityChange(Number(event.currentTarget.value))}
                aria-label="Mnożnik czułości podczas ADS"
                className="w-full accent-amber-400"
              />
            </label>
            {([
              ['effects', 'Efekty dźwiękowe'],
              ['communications', 'Komunikaty i sygnały taktyczne'],
              ['interface', 'Interfejs'],
            ] as const).map(([channel, label]) => (
              <label key={channel} className="grid gap-2 text-xs font-bold text-zinc-200">
                <span className="flex justify-between gap-4">
                  <span>{label}</span>
                  <output>{Math.round(audioMix[channel] * 100)}%</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={audioMix[channel]}
                  onChange={(event) =>
                    onAudioMixChange({
                      ...audioMix,
                      [channel]: Number(event.currentTarget.value),
                    })
                  }
                  aria-label={`Głośność: ${label}`}
                  className="w-full accent-amber-400"
                />
              </label>
            ))}
            <label className="grid gap-2 text-xs font-bold text-zinc-200">
              <span className="flex justify-between gap-4">
                <span>Głośność główna</span>
                <output>{Math.round(masterVolume * 100)}%</output>
              </span>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={masterVolume}
                onChange={(event) => onMasterVolumeChange(Number(event.currentTarget.value))}
                aria-label="Głośność główna"
                className="w-full accent-amber-400"
              />
            </label>
            <label className="grid gap-2 text-xs font-bold text-zinc-200 sm:col-span-2">
              <span>Jakość grafiki</span>
              <select
                value={graphicsQuality}
                onChange={(event) => onGraphicsQualityChange(event.currentTarget.value as GraphicsQuality)}
                aria-label="Jakość grafiki"
                className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-amber-400"
              >
                <option value="auto">Automatyczna — dobór do urządzenia</option>
                <option value="low">Niska — najwyższa wydajność</option>
                <option value="medium">Średnia — balans wydajności i jakości</option>
                <option value="high">Wysoka — najlepsza jakość obrazu</option>
              </select>
              <span className="text-[10px] font-normal text-zinc-400">
                Zmiana skali renderowania i cieni działa natychmiast, bez resetowania meczu.
              </span>
            </label>
            <fieldset className="grid gap-2 border-t border-zinc-800 pt-4 sm:col-span-2">
              <legend className="text-xs font-black tracking-wider text-zinc-200">DOSTĘPNOŚĆ</legend>
              <label className="flex items-start justify-between gap-4 text-xs text-zinc-200">
                <span className="grid gap-1">
                  <span>Ogranicz błyski i animacje HUD</span>
                  <span className="text-[10px] font-normal text-zinc-400">
                    Zmniejsza intensywność oślepienia i wyłącza pulsujące efekty interfejsu.
                  </span>
                </span>
                <input
                  type="checkbox"
                  checked={reduceVisualEffects}
                  onChange={(event) =>
                    onReduceVisualEffectsChange(event.currentTarget.checked)
                  }
                  aria-label="Ogranicz błyski i animacje HUD"
                  className="mt-0.5 h-4 w-4 shrink-0 accent-amber-400"
                />
              </label>
            </fieldset>
            <fieldset className="grid gap-3 border-t border-zinc-800 pt-4 sm:col-span-2">
              <legend className="text-xs font-black tracking-wider text-zinc-200">CELOWNIK</legend>
              <label className="flex items-center justify-between gap-4 text-xs text-zinc-200">
                <span>Pokazuj celownik poza ADS</span>
                <input
                  type="checkbox"
                  checked={crosshair.enabled}
                  onChange={(event) =>
                    onCrosshairChange({ ...crosshair, enabled: event.currentTarget.checked })
                  }
                  aria-label="Pokazuj celownik"
                  className="h-4 w-4 accent-amber-400"
                />
              </label>
              <div className="flex min-h-20 items-center justify-center rounded-lg border border-zinc-800 bg-black/50">
                <Crosshair settings={crosshair} preview />
              </div>
              <label className="grid gap-1 text-xs font-semibold text-zinc-200">
                <span>Kolor</span>
                <select
                  value={crosshair.color}
                  onChange={(event) =>
                    onCrosshairChange({
                      ...crosshair,
                      color: normalizeCrosshairSettings({
                        ...crosshair,
                        color: event.currentTarget.value,
                      }).color,
                    })
                  }
                  aria-label="Kolor celownika"
                  className="min-h-10 rounded-lg border border-zinc-700 bg-zinc-900 px-3 text-sm"
                >
                  {Object.entries(CROSSHAIR_COLOR_LABELS).map(([color, label]) => (
                    <option key={color} value={color}>
                      {label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="grid gap-1 text-xs font-semibold text-zinc-200">
                <span className="flex justify-between">
                  <span>Rozmiar ramion</span>
                  <output>{crosshair.size}px</output>
                </span>
                <input
                  type="range"
                  min="4"
                  max="16"
                  step="1"
                  value={crosshair.size}
                  onChange={(event) =>
                    onCrosshairChange({ ...crosshair, size: Number(event.currentTarget.value) })
                  }
                  aria-label="Rozmiar ramion celownika"
                  className="accent-amber-400"
                />
              </label>
              <label className="grid gap-1 text-xs font-semibold text-zinc-200">
                <span className="flex justify-between">
                  <span>Odstęp od środka</span>
                  <output>{crosshair.gap}px</output>
                </span>
                <input
                  type="range"
                  min="0"
                  max="12"
                  step="1"
                  value={crosshair.gap}
                  onChange={(event) =>
                    onCrosshairChange({ ...crosshair, gap: Number(event.currentTarget.value) })
                  }
                  aria-label="Odstęp ramion celownika"
                  className="accent-amber-400"
                />
              </label>
              <label className="flex items-center justify-between gap-4 text-xs text-zinc-200">
                <span>Kropka środkowa</span>
                <input
                  type="checkbox"
                  checked={crosshair.showCenterDot}
                  onChange={(event) =>
                    onCrosshairChange({ ...crosshair, showCenterDot: event.currentTarget.checked })
                  }
                  aria-label="Kropka środkowa celownika"
                  className="h-4 w-4 accent-amber-400"
                />
              </label>
              <button
                type="button"
                onClick={() => onCrosshairChange({ ...DEFAULT_GAME_SETTINGS.crosshair })}
                className="justify-self-start rounded-lg border border-zinc-700 px-3 py-2 text-[10px] font-black text-zinc-200 hover:border-amber-400"
              >
                PRZYWRÓĆ CELOWNIK DOMYŚLNY
              </button>
            </fieldset>
          </section>
        )}
        {showKeyBindings && (
          <KeyBindingsModal
            bindings={keyBindings}
            onChange={onKeyBindingsChange}
            onClose={() => setShowKeyBindings(false)}
          />
        )}
      </div>

      {/* Flat Control Hints Line at Bottom */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-zinc-400 border-t border-zinc-800/80 pt-4">
        <span>Ruch, akcje i wyposażenie dostosujesz w ustawieniach sterowania.</span>
        <span className="text-zinc-500">LPM Strzał · PPM Celowanie · Tab Tabela Wyników · Escape Pauza</span>
      </div>
      {!showKeyBindings && (
        <button
          type="button"
          onClick={() => setShowKeyBindings(true)}
          className="pointer-events-auto fixed bottom-20 right-4 flex items-center gap-2 rounded-lg border border-zinc-700 bg-zinc-950/90 px-3 py-2 text-xs font-bold text-zinc-200 shadow-lg hover:border-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white sm:bottom-24 sm:right-12"
          aria-label="Konfiguruj sterowanie"
        >
          <Keyboard className="h-4 w-4 text-amber-400" />
          STEROWANIE
        </button>
      )}
    </div>
  );
};
