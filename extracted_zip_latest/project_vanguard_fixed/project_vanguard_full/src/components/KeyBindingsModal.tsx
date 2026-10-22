import React, { useState } from 'react';
import {
  DEFAULT_KEY_BINDINGS,
  GameAction,
  GameKeyBindings,
  formatKeyCode,
  rebindGameAction,
} from '../settings';
import { RotateCcw, X } from 'lucide-react';

interface KeyBindingsModalProps {
  bindings: GameKeyBindings;
  onChange: (bindings: GameKeyBindings) => void;
  onClose: () => void;
}

const ACTION_LABELS: Record<GameAction, string> = {
  moveForward: 'Ruch do przodu',
  moveBackward: 'Ruch do tyłu',
  moveLeft: 'Ruch w lewo',
  moveRight: 'Ruch w prawo',
  jump: 'Skok',
  sprint: 'Sprint',
  crouch: 'Kucanie / ślizg',
  reload: 'Przeładuj',
  interact: 'Podłóż / rozbrój',
  frag: 'Granat odłamkowy',
  smoke: 'Granat dymny',
  flashbang: 'Granat błyskowy',
  claymore: 'Mina Claymore',
  inspect: 'Inspekcja broni',
  buyMenu: 'Sklep',
  uav: 'Seria: UAV',
  airstrike: 'Seria: nalot',
  predator: 'Seria: Predator',
};

export const KeyBindingsModal: React.FC<KeyBindingsModalProps> = ({
  bindings,
  onChange,
  onClose,
}) => {
  const [listeningAction, setListeningAction] = useState<GameAction | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleKeyDown = (event: React.KeyboardEvent<HTMLElement>) => {
    if (!listeningAction) return;
    event.preventDefault();
    event.stopPropagation();
    if (event.code === 'Escape') {
      setListeningAction(null);
      setError(null);
      return;
    }

    const result = rebindGameAction(bindings, listeningAction, event.code);
    if (!result.success) {
      setError(
        result.reason === 'conflict'
          ? 'Ten klawisz jest już przypisany do innej akcji.'
          : 'Wybierz literę, cyfrę, spację, strzałkę lub klawisz interpunkcyjny. Escape i Tab są zarezerwowane.'
      );
      return;
    }

    onChange(result.bindings);
    setListeningAction(null);
    setError(null);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-3 backdrop-blur-sm"
      onKeyDown={handleKeyDown}
    >
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="key-bindings-title"
        className="flex max-h-[90dvh] w-full max-w-2xl flex-col rounded-2xl border border-zinc-700 bg-zinc-950 p-4 text-white shadow-2xl sm:p-6"
      >
        <header className="flex items-start justify-between gap-4">
          <div>
            <h2 id="key-bindings-title" className="text-xl font-black tracking-widest">
              STEROWANIE
            </h2>
            <p className="mt-1 text-xs text-zinc-400">Wybierz akcję, a następnie naciśnij nowy klawisz.</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-zinc-300 hover:bg-zinc-800 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
            aria-label="Zamknij ustawienia sterowania"
          >
            <X className="h-5 w-5" />
          </button>
        </header>

        {error && <p role="alert" className="mt-3 rounded-lg bg-red-950/70 px-3 py-2 text-xs text-red-200">{error}</p>}
        {listeningAction && (
          <p role="status" aria-live="polite" className="mt-3 rounded-lg bg-amber-950/70 px-3 py-2 text-xs text-amber-200">
            Naciśnij nowy klawisz dla: {ACTION_LABELS[listeningAction]} (Escape anuluje)
          </p>
        )}

        <div className="mt-4 overflow-y-auto pr-1">
          <div className="grid gap-2 sm:grid-cols-2">
            {(Object.keys(ACTION_LABELS) as GameAction[]).map((action) => (
              <div key={action} className="flex min-h-12 items-center justify-between gap-3 rounded-lg border border-zinc-800 bg-zinc-900/60 px-3 py-2">
                <span className="text-xs font-semibold text-zinc-200">{ACTION_LABELS[action]}</span>
                <button
                  type="button"
                  onClick={() => {
                    setError(null);
                    setListeningAction(action);
                  }}
                  aria-pressed={listeningAction === action}
                  className={`min-w-20 rounded-md border px-3 py-2 text-xs font-black ${
                    listeningAction === action
                      ? 'border-amber-400 bg-amber-500 text-zinc-950'
                      : 'border-zinc-700 bg-zinc-950 text-amber-300 hover:border-amber-400'
                  } focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white`}
                >
                  {listeningAction === action ? 'NACIŚNIJ…' : formatKeyCode(bindings[action])}
                </button>
              </div>
            ))}
          </div>
        </div>

        <footer className="mt-4 flex flex-wrap justify-between gap-3 border-t border-zinc-800 pt-4">
          <button
            type="button"
            onClick={() => {
              onChange({ ...DEFAULT_KEY_BINDINGS });
              setListeningAction(null);
              setError(null);
            }}
            className="flex items-center gap-2 rounded-lg border border-zinc-700 px-3 py-2 text-xs font-bold text-zinc-200 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-white"
          >
            <RotateCcw className="h-4 w-4" />
            PRZYWRÓĆ DOMYŚLNE
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-amber-500 px-5 py-2 text-xs font-black text-zinc-950 hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            GOTOWE
          </button>
        </footer>
      </section>
    </div>
  );
};
