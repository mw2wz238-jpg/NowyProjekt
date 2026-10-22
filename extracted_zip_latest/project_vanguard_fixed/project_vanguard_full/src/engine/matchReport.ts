import { Combatant, MapId } from '../types/game';

export const MAP_DISPLAY_NAMES: Record<MapId, string> = {
  industrial: 'Strefa Przemysłowa (Dzień)',
  winter_village: 'Górska Wioska (Zima)',
  night_docks: 'Doki (Noc / Deszcz)',
};

export const getKillDeathRatio = (kills: number, deaths: number): string => {
  if (deaths === 0) return kills > 0 ? '∞' : '0.00';
  return (kills / deaths).toFixed(2);
};

export const getCombatScore = (combatant: Combatant): number =>
  combatant.kills * 100 + combatant.assists * 50 + combatant.damageDealt;

export const sortMatchLeaderboard = (combatants: Combatant[]): Combatant[] =>
  [...combatants].sort(
    (left, right) =>
      getCombatScore(right) - getCombatScore(left) ||
      right.kills - left.kills ||
      left.name.localeCompare(right.name)
  );

export const formatMatchDuration = (elapsedSeconds: number): string => {
  const safeSeconds = Number.isFinite(elapsedSeconds) ? Math.max(0, Math.floor(elapsedSeconds)) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
};
