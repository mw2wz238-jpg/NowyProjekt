import React from 'react';
import { Play, LogOut } from 'lucide-react';

interface PauseMenuProps {
  onResume: () => void;
  onReturnToMenu: () => void;
}

export const PauseMenu: React.FC<PauseMenuProps> = ({ onResume, onReturnToMenu }) => (
  <div className="absolute inset-0 z-50 flex items-center justify-center bg-zinc-950/80 p-4 backdrop-blur-sm">
    <section
      role="dialog"
      aria-modal="true"
      aria-labelledby="pause-menu-title"
      className="w-full max-w-md rounded-2xl border border-zinc-700 bg-zinc-950/95 p-6 text-white shadow-2xl sm:p-8"
    >
      <p className="text-xs font-black tracking-[0.3em] text-amber-400">PROJECT VANGUARD</p>
      <h1 id="pause-menu-title" className="mt-2 text-3xl font-black tracking-widest">
        PAUZA
      </h1>
      <p className="mt-2 text-sm text-zinc-400">Mecz jest wstrzymany. Twoja runda nie traci czasu.</p>
      <div className="mt-8 grid gap-3">
        <button
          type="button"
          autoFocus
          onClick={onResume}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3 text-sm font-black tracking-wider text-zinc-950 transition-colors hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <Play className="h-4 w-4 fill-current" />
          WZNÓW MECZ
        </button>
        <button
          type="button"
          onClick={onReturnToMenu}
          className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-black tracking-wider text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
        >
          <LogOut className="h-4 w-4" />
          WRÓĆ DO MENU
        </button>
      </div>
    </section>
  </div>
);
