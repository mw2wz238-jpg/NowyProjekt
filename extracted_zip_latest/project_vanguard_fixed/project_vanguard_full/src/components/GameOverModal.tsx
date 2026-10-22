import React, { useEffect } from 'react';
import confetti from 'canvas-confetti';
import { Combatant, MapId, Team } from '../types/game';
import { formatMatchDuration, getKillDeathRatio, MAP_DISPLAY_NAMES, sortMatchLeaderboard } from '../engine/matchReport';
import { Trophy, Star, RotateCcw, House } from 'lucide-react';

interface GameOverModalProps {
  winner: Team;
  scoreVanguard: number;
  scoreSyndicate: number;
  mvp: Combatant | null;
  player: Combatant | null;
  combatants: Combatant[];
  map: MapId;
  elapsedSeconds: number;
  endReason: string;
  onRematch: () => void;
  onReturnToMenu: () => void;
}

export const GameOverModal: React.FC<GameOverModalProps> = ({
  winner,
  scoreVanguard,
  scoreSyndicate,
  mvp,
  player,
  combatants,
  map,
  elapsedSeconds,
  endReason,
  onRematch,
  onReturnToMenu,
}) => {
  const isPlayerWinner = winner === player?.team;
  const leaderboard = sortMatchLeaderboard(combatants);

  useEffect(() => {
    if (isPlayerWinner) {
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { y: 0.6 },
      });
    }
  }, [isPlayerWinner]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/90 p-3 font-sans text-white backdrop-blur-lg sm:p-6">
      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="match-report-title"
        className="my-auto flex max-h-[calc(100dvh-1.5rem)] w-full max-w-5xl flex-col items-center gap-5 overflow-y-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-center shadow-2xl sm:max-h-[calc(100dvh-3rem)] sm:gap-6 sm:p-8"
      >
        <header className="flex flex-col items-center">
          <div
            className={`mb-3 flex h-14 w-14 items-center justify-center rounded-full shadow-2xl sm:h-16 sm:w-16 ${
              isPlayerWinner
                ? 'border-2 border-amber-500/50 bg-amber-500/20 text-amber-400'
                : 'border-2 border-red-500/50 bg-red-500/20 text-red-400'
            }`}
          >
            <Trophy className="h-7 w-7 sm:h-8 sm:w-8" />
          </div>
          <h1 id="match-report-title" className="text-xl font-black tracking-widest sm:text-3xl">
            {winner === 'VANGUARD' ? 'ZWYCIĘSTWO VANGUARD' : 'ZWYCIĘSTWO SYNDICATE'}
          </h1>
          <p className="mt-1 text-xs font-bold uppercase tracking-wider text-zinc-400">
            RAPORT MECZU · {MAP_DISPLAY_NAMES[map]} · {formatMatchDuration(elapsedSeconds)}
          </p>
          {endReason && <p className="mt-2 max-w-2xl text-sm text-zinc-300">{endReason}</p>}
        </header>

        <div
          className="flex items-center gap-5 rounded-xl border border-zinc-800 bg-zinc-900/60 px-6 py-3 sm:gap-8 sm:px-8"
          aria-label={`Wynik: Vanguard ${scoreVanguard}, Syndicate ${scoreSyndicate}`}
        >
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-blue-400 sm:text-xs">VANGUARD</span>
            <span className="text-3xl font-black tabular-nums text-blue-400 sm:text-4xl">{scoreVanguard}</span>
          </div>
          <span className="text-xl font-bold text-zinc-600">:</span>
          <div className="flex flex-col items-center">
            <span className="text-[10px] font-black text-red-400 sm:text-xs">SYNDICATE</span>
            <span className="text-3xl font-black tabular-nums text-red-400 sm:text-4xl">{scoreSyndicate}</span>
          </div>
        </div>

        {mvp && (
          <div className="flex w-full items-center justify-between gap-3 rounded-xl border border-amber-500/40 bg-amber-950/20 p-3 sm:p-4">
            <div className="flex items-center gap-3 text-left">
              <Star className="h-6 w-6 shrink-0 fill-amber-400 text-amber-400" />
              <div>
                <span className="text-[10px] font-black uppercase tracking-widest text-amber-400">
                  MVP MECZU {mvp.isPlayer && '· TY'}
                </span>
                <div className="text-sm font-black text-white">{mvp.name}</div>
              </div>
            </div>
            <div className="text-right text-xs font-bold text-zinc-300">
              {mvp.kills}/{mvp.deaths}/{mvp.assists} K/D/A · {Math.round(mvp.damageDealt)} obrażeń
            </div>
          </div>
        )}

        {player && (
          <section className="w-full" aria-label="Twoje statystyki meczu">
            <h2 className="mb-2 text-left text-xs font-black tracking-widest text-zinc-300">TWOJE STATYSTYKI</h2>
            <div className="grid grid-cols-3 gap-2 rounded-xl border border-zinc-800/60 bg-zinc-900/40 p-3 text-xs sm:grid-cols-6 sm:gap-3 sm:p-4">
              <Stat label="ZABÓJSTWA" value={player.kills} />
              <Stat label="ZGONY" value={player.deaths} />
              <Stat label="ASYSTY" value={player.assists} />
              <Stat label="K/D" value={getKillDeathRatio(player.kills, player.deaths)} />
              <Stat label="K + A" value={player.kills + player.assists} />
              <Stat label="OBRAŻENIA" value={Math.round(player.damageDealt)} />
            </div>
          </section>
        )}

        <section className="w-full text-left" aria-label="Tabela statystyk meczu">
          <h2 className="mb-2 text-xs font-black tracking-widest text-zinc-300">RANKING MECZU</h2>
          <div className="max-h-64 overflow-auto rounded-xl border border-zinc-800">
            <table className="w-full min-w-[580px] border-collapse text-left text-xs">
              <caption className="sr-only">Ranking graczy według wkładu w mecz; kolumny zabójstwa, zgony, asysty i obrażenia</caption>
              <thead className="sticky top-0 bg-zinc-900 text-[10px] font-black tracking-wider text-zinc-400">
                <tr>
                  <th scope="col" className="px-3 py-2 text-center">#</th>
                  <th scope="col" className="px-3 py-2">OPERATOR</th>
                  <th scope="col" className="px-3 py-2 text-center">K</th>
                  <th scope="col" className="px-3 py-2 text-center">Z</th>
                  <th scope="col" className="px-3 py-2 text-center">A</th>
                  <th scope="col" className="px-3 py-2 text-right">OBRAŻENIA</th>
                </tr>
              </thead>
              <tbody>
                {leaderboard.map((combatant, index) => (
                  <tr
                    key={combatant.id}
                    className={`border-t border-zinc-800/80 ${
                      combatant.isPlayer ? 'bg-amber-950/40 font-bold' : 'bg-zinc-950/60'
                    }`}
                  >
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-500">{index + 1}</td>
                    <th scope="row" className="px-3 py-2 font-bold text-white">
                      <span className={combatant.isPlayer ? 'text-amber-300' : ''}>
                        {combatant.name}{combatant.isPlayer ? ' (TY)' : ''}
                      </span>
                      {combatant.id === mvp?.id && (
                        <span className="ml-2 inline-flex items-center gap-1 text-[9px] text-amber-400">
                          <Star className="h-3 w-3 fill-current" /> MVP
                        </span>
                      )}
                    </th>
                    <td className="px-3 py-2 text-center tabular-nums">{combatant.kills}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-400">{combatant.deaths}</td>
                    <td className="px-3 py-2 text-center tabular-nums text-zinc-300">{combatant.assists}</td>
                    <td className="px-3 py-2 text-right tabular-nums text-zinc-300">
                      {Math.round(combatant.damageDealt)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-1 text-right text-[10px] text-zinc-500">
            Wkład = zabójstwa × 100 + asysty × 50 + obrażenia
          </p>
        </section>

        <footer className="grid w-full gap-3 sm:grid-cols-2">
          <button
            type="button"
            onClick={onRematch}
            className="flex min-h-12 items-center justify-center gap-2 rounded-lg bg-amber-500 px-4 py-3 text-sm font-black tracking-wider text-zinc-950 transition-colors hover:bg-amber-400 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <RotateCcw className="h-5 w-5" />
            ZAGRAJ REWANŻ
          </button>
          <button
            type="button"
            onClick={onReturnToMenu}
            className="flex min-h-12 items-center justify-center gap-2 rounded-lg border border-zinc-700 bg-zinc-900 px-4 py-3 text-sm font-black tracking-wider text-zinc-200 transition-colors hover:border-zinc-500 hover:bg-zinc-800 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-white"
          >
            <House className="h-5 w-5" />
            MENU GŁÓWNE
          </button>
        </footer>
      </section>
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string | number }> = ({ label, value }) => (
  <div className="flex flex-col items-center gap-1">
    <span className="text-[9px] font-bold text-zinc-400">{label}</span>
    <span className="text-base font-black tabular-nums text-white sm:text-lg">{value}</span>
  </div>
);
