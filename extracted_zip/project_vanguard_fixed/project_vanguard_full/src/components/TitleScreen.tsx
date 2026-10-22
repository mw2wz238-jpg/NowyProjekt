import React from 'react';
import { Play, Sliders, MapPin, Volume2, VolumeX, Shield } from 'lucide-react';
import { MapId } from '../types/game';

interface TitleScreenProps {
  onStartGame: () => void;
  onOpenGunsmith: () => void;
  onOpenMapSelect: () => void;
  currentMap: MapId;
  isMuted: boolean;
  onToggleMute: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({
  onStartGame,
  onOpenGunsmith,
  onOpenMapSelect,
  currentMap,
  isMuted,
  onToggleMute,
}) => {
  const mapNames: Record<MapId, string> = {
    industrial: 'Strefa Przemysłowa (Dzień)',
    winter_village: 'Górska Wioska (Zima)',
    night_docks: 'Doki (Noc / Deszcz)',
  };

  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-between p-12 bg-gradient-to-t from-zinc-950 via-zinc-950/40 to-transparent pointer-events-none select-none text-white font-sans">
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

        <button
          onClick={onToggleMute}
          className="p-3 bg-zinc-900/80 hover:bg-zinc-800 border border-zinc-700/80 rounded-xl text-zinc-300 hover:text-white cursor-pointer transition-all shadow-lg"
          title="Dźwięk"
        >
          {isMuted ? <VolumeX className="w-5 h-5" /> : <Volume2 className="w-5 h-5" />}
        </button>
      </div>

      {/* Center Title Lockup */}
      <div className="max-w-2xl flex flex-col gap-3">
        <div className="inline-flex items-center gap-2 px-3 py-1 bg-amber-500/10 border border-amber-500/30 rounded-md text-[11px] font-black text-amber-400 tracking-wider uppercase w-fit">
          <Shield className="w-3.5 h-3.5" />
          SILNIK PBR WEBGL2 • AUTORYTATYWNY ROUND LOOP
        </div>

        <h1 className="text-6xl font-black tracking-tight text-white uppercase drop-shadow-2xl leading-none">
          PROJECT<br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-amber-400 via-amber-200 to-white">
            VANGUARD
          </span>
        </h1>

        <p className="text-sm text-zinc-300 font-medium max-w-lg leading-relaxed drop-shadow-md">
          Profesjonalny taktyczny shooter pierwszoosobowy 3D. Pełen cykl rundy (Faza zakupów, Live Combat, System nagród), zaawansowany Rusznikarz i taktyczna fizyka granatów dymnych.
        </p>

        {/* Primary CTA Buttons */}
        <div className="flex items-center gap-4 mt-4 pointer-events-auto">
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
      </div>

      {/* Flat Control Hints Line at Bottom */}
      <div className="flex items-center justify-between text-xs font-mono text-zinc-400 border-t border-zinc-800/80 pt-4">
        <span>WASD Ruch · LPM Strzał · PPM Celowanie (ADS) · R Przeładuj · B Sklep · Tab Tabela Wyników</span>
        <span className="text-zinc-500">G Odłamkowy · F Dymny · C Kucnij · Shift Sprint</span>
      </div>
    </div>
  );
};
