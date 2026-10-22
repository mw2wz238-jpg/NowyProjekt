import { performance } from 'node:perf_hooks';
import * as THREE from 'three';
import { SimulationEngine } from './simulation';

const spawnPoints = [-20, -10, 0, 10, 20].map((x) => new THREE.Vector3(x, 1.75, 50));
const enemySpawnPoints = [-20, -10, 0, 10, 20].map((x) => new THREE.Vector3(x, 1.75, -50));
const simulation = new SimulationEngine(
  new THREE.Scene(),
  { isLineBlockedBySmoke: () => false, clearSmoke: () => {} } as never
);
simulation.initMatch('industrial', spawnPoints, enemySpawnPoints);
simulation.roundState = 'LIVE_COMBAT';
simulation['hasLineOfSight'] = () => true;
simulation.validateAndExecuteShot = () => ({ hit: false, isHeadshot: false });

for (const combatant of simulation.combatants.values()) {
  const teamOffset = combatant.team === 'VANGUARD' ? 0 : 16;
  combatant.pos = { x: Number(combatant.id.at(-1) ?? 0) * 2, y: 1.75, z: teamOffset };
}

const runTicks = (count: number) => {
  for (let tick = 0; tick < count; tick++) simulation['updateBotsAI'](1 / 60);
};

runTicks(500);
const sampleCount = 5;
const ticksPerSample = 1000;
const samples: number[] = [];
for (let sample = 0; sample < sampleCount; sample++) {
  const startedAt = performance.now();
  runTicks(ticksPerSample);
  samples.push((performance.now() - startedAt) / ticksPerSample);
}

samples.sort((a, b) => a - b);
const medianMsPerTick = samples[Math.floor(samples.length / 2)];
console.log(
  JSON.stringify(
    {
      scenario: '5v5 AI decision loop (renderer and map raycasts excluded)',
      samples: sampleCount,
      ticksPerSample,
      medianMsPerTick: Number(medianMsPerTick.toFixed(4)),
      estimatedAiTicksPerSecond: Math.round(1000 / medianMsPerTick),
      estimatedFrameBudgetPercentAt60Fps: Number(((medianMsPerTick / (1000 / 60)) * 100).toFixed(2)),
    },
    null,
    2
  )
);
