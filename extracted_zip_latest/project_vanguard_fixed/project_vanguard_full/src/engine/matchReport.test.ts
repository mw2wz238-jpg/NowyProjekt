import assert from 'node:assert/strict';
import test from 'node:test';
import { getCombatScore, getKillDeathRatio, formatMatchDuration, sortMatchLeaderboard } from './matchReport';
import { Combatant } from '../types/game';
import { WEAPON_REGISTRY } from './weapons';

const makeCombatant = (
  id: string,
  name: string,
  kills: number,
  deaths: number,
  assists: number,
  damageDealt: number
): Combatant => ({
  id,
  name,
  team: 'VANGUARD',
  isPlayer: id === 'player_0',
  isAlive: true,
  hp: 100,
  maxHp: 100,
  armor: 100,
  hasHelmet: true,
  hasDefuseKit: false,
  fragGrenades: 1,
  smokeGrenades: 1,
  flashbangs: 1,
  claymores: 1,
  currentStreak: 0,
  isFlashedUntil: 0,
  weapon: WEAPON_REGISTRY.m4a1,
  currentMag: 30,
  reserveAmmo: 90,
  kills,
  deaths,
  assists,
  damageDealt,
  mvpStars: 0,
  cash: 1000,
  pos: { x: 0, y: 0, z: 0 },
  yaw: 0,
  pitch: 0,
  role: 'assaulter',
});

test('match report formats K/D safely with no deaths', () => {
  assert.equal(getKillDeathRatio(4, 2), '2.00');
  assert.equal(getKillDeathRatio(3, 0), '∞');
  assert.equal(getKillDeathRatio(0, 0), '0.00');
});

test('match report leaderboard ranks combat impact without mutating the roster', () => {
  const roster = [
    makeCombatant('player_0', 'Player', 2, 1, 4, 120),
    makeCombatant('bot_1', 'Assist', 1, 2, 8, 90),
    makeCombatant('bot_2', 'Slayer', 3, 1, 0, 100),
  ];
  const originalOrder = roster.map((combatant) => combatant.id);

  assert.equal(getCombatScore(roster[0]), 520);
  assert.deepEqual(
    sortMatchLeaderboard(roster).map((combatant) => combatant.id),
    ['bot_1', 'player_0', 'bot_2']
  );
  assert.deepEqual(roster.map((combatant) => combatant.id), originalOrder);
});

test('match report duration handles invalid and negative values', () => {
  assert.equal(formatMatchDuration(3661.9), '61:01');
  assert.equal(formatMatchDuration(-5), '0:00');
  assert.equal(formatMatchDuration(Number.NaN), '0:00');
});
