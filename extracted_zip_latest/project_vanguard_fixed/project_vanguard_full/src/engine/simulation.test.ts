import assert from 'node:assert/strict';
import test from 'node:test';
import * as THREE from 'three';
import { SimulationEngine } from './simulation';
import { ParticleSystem } from './particles';
import { getCameraBobOffset, getSlideCameraRoll, PlayerController } from './player';
import { PointerHoldState } from '../components/PointerHoldState';
import { EnvironmentBuilder } from './environment';
import { Materials } from './materials';
import { readGamepadInput } from './gamepad';

const createSimulation = () => {
  const scene = new THREE.Scene();
  const particles = {
    activeSmokePuffs: [] as { x: number; y: number; z: number; radius: number; life: number }[],
    isLineBlockedBySmoke: () => false,
    clearSmoke() {
      this.activeSmokePuffs = [];
    },
    spawnSmokeGrenade(pos: THREE.Vector3) {
      this.activeSmokePuffs.push({ x: pos.x, y: pos.y + 1.2, z: pos.z, radius: 6.5, life: 18 });
    },
  };
  const simulation = new SimulationEngine(scene, particles as never);
  const vanguardSpawns = [-20, -10, 0, 10, 20].map((x) => new THREE.Vector3(x, 1.75, 50));
  const syndicateSpawns = [-20, -10, 0, 10, 20].map((x) => new THREE.Vector3(x, 1.75, -50));
  simulation.initMatch('industrial', vanguardSpawns, syndicateSpawns);
  return { simulation, vanguardSpawns, syndicateSpawns };
};

test('touch hold state ignores unrelated pointers and releases only its owner', () => {
  const hold = new PointerHoldState();

  assert.equal(hold.begin(10), true);
  assert.equal(hold.begin(11), false);
  assert.equal(hold.end(11), false);
  assert.equal(hold.begin(12), false);
  assert.equal(hold.end(10), true);
  assert.equal(hold.end(10), false);
  assert.equal(hold.begin(12), true);
  assert.equal(hold.end(12), true);
});

test('gamepad input applies radial dead zones and maps standard combat buttons', () => {
  const buttons = Array.from({ length: 11 }, () => ({ pressed: false, value: 0 }));
  buttons[0].pressed = true;
  buttons[6].value = 0.8;
  buttons[7].pressed = true;
  buttons[9].pressed = true;
  const gamepad = {
    axes: [0.03, 0.02, 0.8, 0],
    buttons,
  } as unknown as Gamepad;
  const input = readGamepadInput(gamepad, 0.18);
  assert.equal(input.moveX, 0);
  assert.equal(input.moveY, 0);
  assert.ok(input.lookX > 0.75);
  assert.equal(input.fire, true);
  assert.equal(input.aim, true);
  assert.equal(input.jump, true);
  assert.equal(input.pause, true);
  assert.equal(input.reload, false);
});

test('map cleanup disposes owned geometry while keeping shared and non-map resources', () => {
  const scene = new THREE.Scene();
  const builder = new EnvironmentBuilder();
  const mapGroup = new THREE.Group();
  mapGroup.name = 'env_test';
  const sharedGeometry = new THREE.BoxGeometry(1, 1, 1);
  const sharedMaterial = Materials.get('weapon_matte_black');
  const sharedMesh = new THREE.Mesh(sharedGeometry, sharedMaterial);
  const ownedGeometry = new THREE.SphereGeometry(1);
  const ownedTexture = new THREE.Texture();
  const ownedMaterial = new THREE.MeshBasicMaterial({ map: ownedTexture });
  const ownedMesh = new THREE.Mesh(ownedGeometry, ownedMaterial);
  const secondOwnedMaterial = new THREE.MeshBasicMaterial({ map: ownedTexture });
  const secondOwnedMesh = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), secondOwnedMaterial);
  const mapLight = new THREE.DirectionalLight();
  const shadowTarget = new THREE.WebGLRenderTarget(16, 16);
  mapLight.shadow.map = shadowTarget;
  mapGroup.add(sharedMesh, ownedMesh, secondOwnedMesh, mapLight);
  scene.add(mapGroup);

  const gameplayGeometry = new THREE.BoxGeometry(1, 1, 1);
  const gameplayMesh = new THREE.Mesh(gameplayGeometry, new THREE.MeshBasicMaterial());
  gameplayMesh.name = 'player_mesh';
  scene.add(gameplayMesh);

  let sharedGeometryDisposed = false;
  let sharedMaterialDisposed = false;
  let ownedGeometryDisposed = false;
  let ownedMaterialDisposed = false;
  let ownedTextureDisposeCount = 0;
  let shadowTargetDisposed = false;
  sharedGeometry.addEventListener('dispose', () => {
    sharedGeometryDisposed = true;
  });
  sharedMaterial.addEventListener('dispose', () => {
    sharedMaterialDisposed = true;
  });
  ownedGeometry.addEventListener('dispose', () => {
    ownedGeometryDisposed = true;
  });
  ownedMaterial.addEventListener('dispose', () => {
    ownedMaterialDisposed = true;
  });
  ownedTexture.addEventListener('dispose', () => {
    ownedTextureDisposeCount++;
  });
  shadowTarget.addEventListener('dispose', () => {
    shadowTargetDisposed = true;
  });

  builder.disposeMap(scene);

  assert.equal(scene.children.includes(mapGroup), false);
  assert.equal(scene.children.includes(gameplayMesh), true);
  assert.equal(sharedGeometryDisposed, true);
  assert.equal(sharedMaterialDisposed, false);
  assert.equal(ownedGeometryDisposed, true);
  assert.equal(ownedMaterialDisposed, true);
  assert.equal(ownedTextureDisposeCount, 1);
  assert.equal(shadowTargetDisposed, true);
  assert.equal(mapLight.shadow.map, null);
  assert.equal(Materials.isShared(sharedMaterial), true);
});

test('restarting a match disposes the previous bot visual resources', () => {
  const { simulation, vanguardSpawns, syndicateSpawns } = createSimulation();
  const botRoot = simulation.botMeshes.values().next().value;
  assert.ok(botRoot);
  const botMesh = botRoot.children.find((child) => child instanceof THREE.Mesh);
  assert.ok(botMesh instanceof THREE.Mesh);
  const geometry = botMesh.geometry;
  const material = Array.isArray(botMesh.material) ? botMesh.material[0] : botMesh.material;
  assert.ok(material);
  let geometryDisposed = false;
  let materialDisposed = false;
  geometry.addEventListener('dispose', () => {
    geometryDisposed = true;
  });
  material.addEventListener('dispose', () => {
    materialDisposed = true;
  });

  simulation.initMatch('winter_village', vanguardSpawns, syndicateSpawns);

  assert.equal(simulation.scene.children.includes(botRoot), false);
  assert.equal(geometryDisposed, true);
  assert.equal(materialDisposed, true);
});

test('smoke blocks line of sight only when the segment crosses the cloud', () => {
  const particles = Object.create(ParticleSystem.prototype) as ParticleSystem;
  particles.activeSmokePuffs = [{ x: 0, y: 0, z: 5, radius: 1, life: 10 }];

  assert.equal(
    particles.isLineBlockedBySmoke(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 10)),
    true
  );
  assert.equal(
    particles.isLineBlockedBySmoke(new THREE.Vector3(2, 0, 0), new THREE.Vector3(2, 0, 10)),
    false
  );
  assert.equal(
    particles.isLineBlockedBySmoke(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 4)),
    false
  );
  assert.equal(
    particles.isLineBlockedBySmoke(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, 0)),
    false
  );
});

test('particle capacity replaces entries in constant time without growing the buffer', () => {
  const particles = Object.create(ParticleSystem.prototype) as ParticleSystem;
  particles['maxParticles'] = 2;
  particles['nextParticleIndex'] = 0;
  particles['particles'] = [];

  particles.spawn(1, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1);
  particles.spawn(2, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1);
  particles.spawn(3, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1);

  assert.equal(particles['particles'].length, 2);
  assert.equal(particles['particles'][0].x, 3);
  assert.equal(particles['particles'][1].x, 2);
});

test('clearing smoke removes smoke particles without affecting other effects', () => {
  const particles = Object.create(ParticleSystem.prototype) as ParticleSystem;
  particles.activeSmokePuffs = [{ x: 1, y: 2, z: 3, radius: 6.5, life: 18 }];
  particles['particles'] = [
    {
      x: 1, y: 2, z: 3, vx: 0, vy: 0, vz: 0, r: 1, g: 1, b: 1,
      size: 1, life: 18, maxLife: 18, gravity: 0, effect: 'smoke',
    },
    {
      x: 4, y: 5, z: 6, vx: 0, vy: 0, vz: 0, r: 1, g: 0, b: 0,
      size: 1, life: 1, maxLife: 1, gravity: 0, effect: null,
    },
  ];
  particles['nextParticleIndex'] = 1;
  particles['geo'] = new THREE.BufferGeometry();

  particles.clearSmoke();

  assert.equal(particles.activeSmokePuffs.length, 0);
  assert.equal(particles['particles'].length, 1);
  assert.equal(particles['particles'][0].effect, null);
  assert.equal(particles['nextParticleIndex'], 0);
  assert.equal(particles['geo'].drawRange.count, 0);
});

test('particle updates upload only the active attribute ranges', () => {
  const particles = Object.create(ParticleSystem.prototype) as ParticleSystem;
  particles.activeSmokePuffs = [];
  particles['particles'] = [
    {
      x: 1,
      y: 2,
      z: 3,
      vx: 0,
      vy: 0,
      vz: 0,
      r: 1,
      g: 0.5,
      b: 0.25,
      size: 2,
      life: 1,
      maxLife: 2,
      gravity: 0,
      effect: null,
    },
  ];
  particles['nextParticleIndex'] = 0;
  particles['positions'] = new Float32Array(9);
  particles['colors'] = new Float32Array(9);
  particles['sizes'] = new Float32Array(3);
  particles['posAttr'] = new THREE.BufferAttribute(particles['positions'], 3);
  particles['colorAttr'] = new THREE.BufferAttribute(particles['colors'], 3);
  particles['sizeAttr'] = new THREE.BufferAttribute(particles['sizes'], 1);
  particles['geo'] = new THREE.BufferGeometry();

  particles.update(0.1);

  assert.deepEqual(particles['posAttr'].updateRanges, [{ start: 0, count: 3 }]);
  assert.deepEqual(particles['colorAttr'].updateRanges, [{ start: 0, count: 3 }]);
  assert.deepEqual(particles['sizeAttr'].updateRanges, [{ start: 0, count: 1 }]);
  assert.deepEqual([...particles['positions'].slice(0, 3)], [1, 2, 3]);
  assert.equal(particles['geo'].drawRange.count, 1);
});

test('wall raycasts refresh the cached mesh list when colliders change', () => {
  const { simulation } = createSimulation();
  const origin = new THREE.Vector3(0, 1, 0);
  const direction = new THREE.Vector3(0, 0, -1);
  const intersectionBuffer = simulation['wallIntersections'];

  assert.equal(simulation['raycastWalls'](origin, direction, 10).closestWallDist, Infinity);

  const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 1), new THREE.MeshBasicMaterial());
  wall.position.z = -5;
  simulation.scene.add(wall);
  simulation.scene.updateMatrixWorld(true);
  const bounds = new THREE.Box3().setFromObject(wall);
  simulation.colliders = [{ min: bounds.min, max: bounds.max, mesh: wall, isCover: true }];

  assert.ok(simulation['raycastWalls'](origin, direction, 10).closestWallDist < 10);
  assert.equal(simulation['raycastWalls'](origin, direction, 3).closestWallDist, Infinity);
  assert.equal(simulation['wallIntersections'], intersectionBuffer);

  simulation.colliders = [];
  assert.equal(simulation['raycastWalls'](origin, direction, 10).closestWallDist, Infinity);
});

test('hitscan sphere checks preserve headshots, body hits, and nearest-target selection', () => {
  const { simulation } = createSimulation();
  const shooter = simulation.playerRef!;
  const firstTarget = simulation.combatants.get('sy_bot_0')!;
  const secondTarget = simulation.combatants.get('sy_bot_1')!;
  for (const combatant of simulation.combatants.values()) {
    if (combatant.team === 'SYNDICATE') combatant.pos = { x: 500, y: 0, z: 500 };
  }

  firstTarget.pos = { x: 0, y: 0, z: 10 };
  secondTarget.pos = { x: 0, y: 0, z: 20 };
  const headshot = simulation['findHitscanVictim'](
    shooter,
    new THREE.Vector3(0, 1.6, 0),
    new THREE.Vector3(0, 0, 1),
    Infinity,
    false,
    100
  );
  assert.equal(headshot.victim, firstTarget);
  assert.equal(headshot.isHeadshot, true);
  assert.equal(headshot.hitDistance, 10);

  const bodyHit = simulation['findHitscanVictim'](
    shooter,
    new THREE.Vector3(0, 0.9, 0),
    new THREE.Vector3(0, 0, 1),
    Infinity,
    false,
    100
  );
  assert.equal(bodyHit.victim, firstTarget);
  assert.equal(bodyHit.isHeadshot, false);
  assert.equal(bodyHit.hitDistance, 10);

  const blockedByWall = simulation['findHitscanVictim'](
    shooter,
    new THREE.Vector3(0, 1.6, 0),
    new THREE.Vector3(0, 0, 1),
    9,
    false,
    100
  );
  assert.equal(blockedByWall.victim, null);
});

test('player movement retains its forward direction after reusing frame vectors', () => {
  const { simulation } = createSimulation();
  const camera = new THREE.PerspectiveCamera(75);
  const controller = new PlayerController(camera, simulation);
  const combatantPosition = simulation.playerRef!.pos;
  controller.keys['KeyW'] = true;

  controller.update(0.1);

  assert.ok(controller.pos.z < 50);
  assert.equal(controller.pos.x, 0);
  assert.equal(simulation.playerRef?.pos.z, controller.pos.z);
  assert.equal(simulation.playerRef?.pos, combatantPosition);
  assert.equal(camera.position.z, controller.pos.z);
});

test('player firing is blocked outside live rounds without consuming ammo or recoil', () => {
  const { simulation } = createSimulation();
  const controller = new PlayerController(new THREE.PerspectiveCamera(75), simulation);
  const player = simulation.playerRef!;
  for (const combatant of simulation.combatants.values()) {
    if (combatant.team === 'SYNDICATE') combatant.pos = { x: 500, y: 0, z: 500 };
  }
  const startingAmmo = player.currentMag;

  assert.equal(controller.shoot(), false);
  assert.equal(player.currentMag, startingAmmo);
  assert.equal(controller.recoilPitch, 0);

  simulation.roundState = 'LIVE_COMBAT';
  controller.shoot();
  assert.equal(player.currentMag, startingAmmo - 1);

  simulation.roundState = 'ROUND_END';
  const ammoAfterLiveShot = player.currentMag;
  const recoilAfterLiveShot = controller.recoilPitch;
  assert.equal(controller.shoot(), false);
  assert.equal(player.currentMag, ammoAfterLiveShot);
  assert.equal(controller.recoilPitch, recoilAfterLiveShot);
  controller.dispose();
});

test('reload only transfers ammo when complete and input release cancels held actions', () => {
  const { simulation } = createSimulation();
  const controller = new PlayerController(new THREE.PerspectiveCamera(75), simulation);
  const player = simulation.playerRef!;
  player.currentMag = 10;
  player.reserveAmmo = 20;
  simulation.roundState = 'LIVE_COMBAT';
  controller.weaponRoot = new THREE.Group();
  controller.weaponRoot.position.set(0.18, -0.16, -0.32);
  controller.camera.add(controller.weaponRoot);

  controller.startReload();
  assert.equal(controller.isReloading, true);
  for (let frame = 0; frame < 10; frame++) controller.update(0.1);
  assert.equal(player.currentMag, 10);
  assert.equal(player.reserveAmmo, 20);
  assert.ok(controller.weaponRoot.position.y > -0.5);
  assert.ok(controller.weaponRoot.position.y < -0.15);
  controller.update(player.weapon.reloadTimeSec - 1);
  assert.equal(controller.isReloading, false);
  assert.equal(player.currentMag, 30);
  assert.equal(player.reserveAmmo, 0);

  controller.keys['KeyW'] = true;
  controller.isSprinting = true;
  controller.isAds = true;
  controller.isSliding = true;
  simulation.plantBomb('sy_bot_0', 'A', new THREE.Vector3(-26, 0, -10));
  player.pos = { x: -26, y: 1.75, z: -10 };
  assert.equal(simulation.startDefusing(player.id), true);
  controller.keys['KeyE'] = true;
  controller.releaseInputs();

  assert.deepEqual(controller.keys, {});
  assert.equal(controller.isSprinting, false);
  assert.equal(controller.isAds, false);
  assert.equal(controller.isSliding, false);
  assert.equal(simulation.defusingCombatantId, null);
  controller.dispose();
});

test('camera projection updates only while the field of view changes', () => {
  const { simulation } = createSimulation();
  const camera = new THREE.PerspectiveCamera(75);
  const controller = new PlayerController(camera, simulation);
  let projectionUpdates = 0;
  camera.updateProjectionMatrix = () => {
    projectionUpdates++;
  };

  controller.update(1 / 60);
  controller.update(1 / 60);
  assert.equal(projectionUpdates, 0);

  controller.isAds = true;
  controller.update(1 / 60);
  assert.equal(projectionUpdates, 1);
  assert.ok(camera.fov < 75);

  controller.update(1 / 60);
  assert.equal(projectionUpdates, 2);
});

test('player field of view updates immediately and remains independent from ADS zoom', () => {
  const { simulation } = createSimulation();
  const camera = new THREE.PerspectiveCamera(75);
  const controller = new PlayerController(camera, simulation);
  let projectionUpdates = 0;
  camera.updateProjectionMatrix = () => {
    projectionUpdates++;
  };

  controller.setBaseFieldOfView(100);
  assert.equal(camera.fov, 100);
  assert.equal(projectionUpdates, 1);

  controller.isAds = true;
  controller.setBaseFieldOfView(90);
  assert.equal(camera.fov, 100);
  controller.update(1 / 60);
  assert.ok(camera.fov < 100);

  controller.isAds = false;
  controller.update(1 / 60);
  assert.ok(camera.fov > 90);

  controller.resetForRound();
  assert.equal(camera.fov, 90);
  controller.dispose();
});

test('camera motion controls disable slide tilt and clamp configured values', () => {
  const { simulation } = createSimulation();
  const camera = new THREE.PerspectiveCamera(75);
  const controller = new PlayerController(camera, simulation);
  controller.setCameraMotion({ headBob: 0, slideTilt: 0 });
  controller.isSliding = true;
  controller.update(1 / 60);
  assert.ok(Math.abs(camera.rotation.z) < 1e-6);

  controller.setCameraMotion({ headBob: 2, slideTilt: 1 });
  assert.deepEqual(controller.cameraMotion, { headBob: 1, slideTilt: 1 });
  assert.equal(getCameraBobOffset(true, Math.PI / 2, 0), 0);
  assert.equal(getCameraBobOffset(false, Math.PI / 2, 1), 0);
  assert.ok(getCameraBobOffset(true, Math.PI / 2, 1) > 0);
  assert.equal(getSlideCameraRoll(true, 0), 0);
  assert.equal(getSlideCameraRoll(false, 1), 0);
  assert.equal(getSlideCameraRoll(true, 1), 0.08);
  controller.dispose();
});

test('vertical look inversion affects only vertical camera input', () => {
  const { simulation } = createSimulation();
  const controller = new PlayerController(new THREE.PerspectiveCamera(75), simulation);
  controller.onMouseMove(10, 10, 0.01);
  assert.equal(controller.yaw, -0.1);
  assert.equal(controller.pitch, -0.1);
  controller.yaw = 0;
  controller.pitch = 0;
  controller.setInvertLookY(true);
  controller.onMouseMove(10, 10, 0.01);
  assert.equal(controller.yaw, -0.1);
  assert.equal(controller.pitch, 0.1);
  controller.dispose();
});

test('match setup creates both teams at distinct map spawns', () => {
  const { simulation } = createSimulation();
  const vanguard = [...simulation.combatants.values()].filter((combatant) => combatant.team === 'VANGUARD');
  const syndicate = [...simulation.combatants.values()].filter((combatant) => combatant.team === 'SYNDICATE');

  assert.equal(vanguard.length, 5);
  assert.equal(syndicate.length, 5);
  assert.deepEqual(simulation.playerRef?.pos, { x: 0, y: 1.75, z: 50 });
  assert.equal(new Set(vanguard.map((combatant) => `${combatant.pos.x}:${combatant.pos.z}`)).size, 5);
  assert.equal(new Set(syndicate.map((combatant) => `${combatant.pos.x}:${combatant.pos.z}`)).size, 5);
});

test('weapon purchases are limited to buy phase and available cash', () => {
  const { simulation } = createSimulation();
  const player = simulation.playerRef!;
  player.cash = 5000;

  assert.equal(simulation.buyItem(player.id, 'm4a1', 'BUY_WEAPON'), true);
  assert.equal(player.cash, 1900);

  assert.equal(simulation.buyItem(player.id, 'awp', 'BUY_WEAPON'), false);
  assert.equal(player.cash, 1900);

  simulation.roundState = 'LIVE_COMBAT';
  assert.equal(simulation.buyItem(player.id, 'armor', 'BUY_ARMOR'), false);
  assert.equal(player.cash, 1900);
});

test('invalid purchases are rejected without charging and armor only sells when needed', () => {
  const { simulation } = createSimulation();
  const player = simulation.playerRef!;
  player.cash = 3000;

  assert.equal(simulation.buyItem(player.id, 'unknown_weapon', 'BUY_WEAPON'), false);
  assert.equal(simulation.buyItem(player.id, 'armor', 'BUY_GRENADE'), false);
  assert.equal(simulation.buyItem(player.id, 'frag', 'BUY_GRENADE'), false);
  assert.equal(simulation.buyItem(player.id, 'armor', 'BUY_ARMOR'), false);
  player.cash = 399;
  assert.equal(simulation.buyItem(player.id, 'defuse_kit', 'BUY_DEFUSE_KIT'), false);
  player.cash = 3000;
  const attacker = simulation.combatants.get('sy_bot_0')!;
  assert.equal(simulation.buyItem(attacker.id, 'defuse_kit', 'BUY_DEFUSE_KIT'), false);
  assert.equal(simulation.buyItem(player.id, 'defuse_kit', 'BUY_DEFUSE_KIT'), true);
  assert.equal(player.hasDefuseKit, true);
  assert.equal(player.cash, 2600);
  assert.equal(simulation.buyItem(player.id, 'defuse_kit', 'BUY_DEFUSE_KIT'), false);
  assert.equal(player.cash, 2600);
  assert.equal(simulation.ledger.length, 1);

  player.armor = 45;
  assert.equal(simulation.buyItem(player.id, 'armor', 'BUY_ARMOR'), true);
  assert.equal(player.armor, 100);
  assert.equal(player.hasHelmet, true);
  assert.equal(player.cash, 1600);
  assert.equal(simulation.ledger.length, 2);
});

test('only a living Syndicate combatant can start planting inside a bomb site', () => {
  const { simulation } = createSimulation();
  const attacker = simulation.combatants.get('sy_bot_0')!;
  attacker.pos = { ...simulation.bombSiteA.position, y: 1.75 };
  simulation.roundState = 'LIVE_COMBAT';

  assert.equal(simulation.startPlanting(simulation.playerRef!.id, 'A'), false);
  assert.equal(simulation.startPlanting(attacker.id, 'B'), false);
  assert.equal(simulation.startPlanting(attacker.id, 'A'), true);

  attacker.isAlive = false;
  assert.equal(simulation.startPlanting(attacker.id, 'A'), false);
});

test('only a living Vanguard combatant in range can start defusing', () => {
  const { simulation } = createSimulation();
  const player = simulation.playerRef!;
  simulation.plantBomb('sy_bot_0', 'A', new THREE.Vector3(-26, 0, -10));

  player.pos = { x: -26, y: 1.75, z: -10 };
  assert.equal(simulation.startDefusing('sy_bot_0'), false);
  assert.equal(simulation.startDefusing(player.id), true);

  simulation.cancelDefusing();
  player.pos = { x: 0, y: 1.75, z: 0 };
  assert.equal(simulation.startDefusing(player.id), false);

  player.pos = { x: -26, y: 1.75, z: -10 };
  player.isAlive = false;
  assert.equal(simulation.startDefusing(player.id), false);
});

test('defusing is cancelled and progress reset when the defuser leaves bomb range', () => {
  const { simulation } = createSimulation();
  const player = simulation.playerRef!;
  simulation.plantBomb('sy_bot_0', 'A', new THREE.Vector3(-26, 0, -10));

  for (const combatant of simulation.combatants.values()) {
    if (!combatant.isPlayer) combatant.isAlive = false;
  }
  player.pos = { x: -26, y: 1.75, z: -10 };
  assert.equal(simulation.startDefusing(player.id), true);
  simulation.defuseProgress = 0.4;

  player.pos = { x: 0, y: 1.75, z: 0 };
  simulation.update(0.1);

  assert.equal(simulation.defusingCombatantId, null);
  assert.equal(simulation.defuseProgress, 0);
  assert.equal(simulation.plantedBomb?.defuseProgress, 0);
});

test('planting is cancelled and progress reset when the planter dies', () => {
  const { simulation } = createSimulation();
  const planter = simulation.combatants.get('sy_bot_0')!;
  planter.pos = { ...simulation.bombSiteA.position, y: 1.75 };
  simulation.roundState = 'LIVE_COMBAT';

  assert.equal(simulation.startPlanting(planter.id, 'A'), true);
  simulation.plantProgress = 0.6;
  planter.isAlive = false;
  simulation['updateBotsAI'] = () => {};
  simulation.update(0.1);

  assert.equal(simulation.plantingCombatantId, null);
  assert.equal(simulation.plantProgress, 0);
  assert.equal(simulation.plantedBomb, null);
});

test('defusing is cancelled and progress reset when the defuser dies', () => {
  const { simulation } = createSimulation();
  const defuser = simulation.playerRef!;
  simulation.plantBomb('sy_bot_0', 'A', new THREE.Vector3(-26, 0, -10));
  defuser.pos = { x: -26, y: 1.75, z: -10 };

  assert.equal(simulation.startDefusing(defuser.id), true);
  simulation.defuseProgress = 0.6;
  defuser.isAlive = false;
  simulation['updateBotsAI'] = () => {};
  simulation.update(0.1);

  assert.equal(simulation.defusingCombatantId, null);
  assert.equal(simulation.plantedBomb?.defusingCombatantId, null);
  assert.equal(simulation.defuseProgress, 0);
  assert.equal(simulation.plantedBomb?.defuseProgress, 0);
});

test('bots reuse the planted bomb objective across AI updates', () => {
  const { simulation } = createSimulation();
  simulation.plantBomb('sy_bot_0', 'A', new THREE.Vector3(-26, 0, -10));
  const objectives: object[] = [];
  simulation['updateBotCombat'] = (_bot, _nearest, _dt, objective) => {
    if (objective) objectives.push(objective);
  };

  simulation['updateBotsAI'](0.016);
  const cachedObjective = objectives[0];
  objectives.length = 0;
  simulation['updateBotsAI'](0.016);

  assert.ok(cachedObjective);
  assert.ok(objectives.length > 0);
  assert.ok(objectives.every((objective) => objective === cachedObjective));
});

test('completed defuse ends the round for Vanguard without detonating the bomb', () => {
  const { simulation } = createSimulation();
  const defuser = simulation.playerRef!;
  simulation.plantBomb('sy_bot_0', 'A', new THREE.Vector3(-26, 0, -10));
  for (const combatant of simulation.combatants.values()) {
    if (!combatant.isPlayer) combatant.isAlive = false;
  }
  defuser.pos = { x: -26, y: 1.75, z: -10 };
  defuser.hasDefuseKit = true;

  assert.equal(simulation.startDefusing(defuser.id), true);
  simulation.update(5);

  assert.equal(simulation.plantedBomb?.isDefused, true);
  assert.equal(simulation.plantedBomb?.isExploded, false);
  assert.equal(simulation.roundState, 'ROUND_END');
  assert.equal(simulation.roundWinner, 'VANGUARD');
  assert.equal(simulation.scoreVanguard, 1);
  assert.equal(simulation.scoreSyndicate, 0);
});

test('defusing takes ten seconds without a kit and five seconds with one', () => {
  const { simulation } = createSimulation();
  const defuser = simulation.playerRef!;
  const bombPosition = new THREE.Vector3(-26, 0, -10);
  simulation.plantBomb('sy_bot_0', 'A', bombPosition);
  for (const combatant of simulation.combatants.values()) {
    if (!combatant.isPlayer) combatant.isAlive = false;
  }
  defuser.pos = { x: -26, y: 1.75, z: -10 };

  assert.equal(simulation.startDefusing(defuser.id), true);
  simulation.update(5);
  assert.equal(simulation.plantedBomb?.isDefused, false);
  assert.equal(simulation.defuseProgress, 0.5);
  simulation.update(5);
  assert.equal(simulation.plantedBomb?.isDefused, true);

  simulation.initMatch(
    'industrial',
    [-20, -10, 0, 10, 20].map((x) => new THREE.Vector3(x, 1.75, 50)),
    [-20, -10, 0, 10, 20].map((x) => new THREE.Vector3(x, 1.75, -50))
  );
  const kitDefuser = simulation.playerRef!;
  kitDefuser.hasDefuseKit = true;
  simulation.plantBomb('sy_bot_0', 'A', bombPosition);
  for (const combatant of simulation.combatants.values()) {
    if (!combatant.isPlayer) combatant.isAlive = false;
  }
  kitDefuser.pos = { x: -26, y: 1.75, z: -10 };

  assert.equal(simulation.startDefusing(kitDefuser.id), true);
  simulation.update(2.5);
  assert.equal(simulation.plantedBomb?.isDefused, false);
  assert.equal(simulation.defuseProgress, 0.5);
  simulation.update(2.5);
  assert.equal(simulation.plantedBomb?.isDefused, true);
});

test('bomb detonation ends the round for Syndicate and eliminates combatants in range', () => {
  const { simulation } = createSimulation();
  const player = simulation.playerRef!;
  simulation.particles = {
    isLineBlockedBySmoke: () => false,
    clearSmoke: () => {},
    spawnExplosion: () => {},
  } as never;
  player.pos = { x: 50, y: 1.75, z: 50 };
  const nearbyBot = simulation.combatants.get('sy_bot_0')!;
  nearbyBot.pos = { x: 1, y: 1.75, z: 1 };
  for (const combatant of simulation.combatants.values()) {
    if (combatant.id !== player.id && combatant.id !== nearbyBot.id) {
      combatant.pos = { x: 100, y: 1.75, z: 100 };
    }
  }

  simulation.plantBomb('sy_bot_0', 'A', new THREE.Vector3(0, 0, 0));
  simulation.plantedBomb!.timerSec = 0.1;
  simulation.update(0.2);

  assert.equal(simulation.plantedBomb?.isExploded, true);
  assert.equal(simulation.plantedBomb?.isDefused, false);
  assert.equal(nearbyBot.isAlive, false);
  assert.equal(nearbyBot.hp, 0);
  assert.equal(player.isAlive, true);
  assert.equal(simulation.roundState, 'ROUND_END');
  assert.equal(simulation.roundWinner, 'SYNDICATE');
  assert.equal(simulation.scoreSyndicate, 1);
  assert.equal(simulation.scoreVanguard, 0);
});

test('buy phase advances through equipment lock into live combat', () => {
  const { simulation } = createSimulation();

  simulation.update(simulation.buyPhaseDuration);
  assert.equal(simulation.roundState, 'EQUIPMENT_LOCK');

  for (const combatant of simulation.combatants.values()) {
    if (!combatant.isPlayer) combatant.isAlive = false;
  }
  simulation.update(2);
  assert.equal(simulation.roundState, 'LIVE_COMBAT');
});

test('round rewards are awarded once and respect streak bonuses and cash limits', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { simulation } = createSimulation();
  const winner = simulation.playerRef!;
  const loser = simulation.combatants.get('sy_bot_0')!;

  winner.cash = 15000;
  simulation.consecutiveLossesSyndicate = 2;
  simulation.roundState = 'LIVE_COMBAT';
  simulation.endRound('VANGUARD', 'SYNDICATE ELIMINATED');
  simulation.endRound('VANGUARD', 'duplicate round result');

  assert.equal(simulation.scoreVanguard, 1);
  assert.equal(simulation.scoreSyndicate, 0);
  assert.equal(simulation.roundWinner, 'VANGUARD');
  assert.equal(simulation.roundEndReason, 'SYNDICATE ELIMINATED');

  t.mock.timers.tick(2000);
  assert.equal(simulation.roundState, 'REWARDS');
  simulation['processRoundRewards']('VANGUARD');

  const winnerReward = simulation.ledger.find((entry) => entry.playerId === winner.id);
  const loserReward = simulation.ledger.find((entry) => entry.playerId === loser.id);
  assert.equal(winnerReward?.amount, 3250);
  assert.equal(winnerReward?.resultingBalance, 16000);
  assert.equal(winner.cash, 16000);
  assert.equal(loserReward?.amount, 2400);
  assert.equal(loser.cash, 3400);
  assert.equal(simulation.ledger.length, simulation.combatants.size);
});

test('starting a new match cancels delayed callbacks from the previous match', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { simulation, vanguardSpawns, syndicateSpawns } = createSimulation();
  simulation.roundState = 'LIVE_COMBAT';
  simulation.endRound('VANGUARD', 'SYNDICATE ELIMINATED');

  simulation.initMatch('winter_village', vanguardSpawns, syndicateSpawns);
  t.mock.timers.tick(10000);

  assert.equal(simulation.roundNumber, 1);
  assert.equal(simulation.roundState, 'BUY_PHASE');
  assert.equal(simulation.scoreVanguard, 0);
  assert.equal(simulation.ledger.length, 0);
});

test('disposing the simulation cancels pending match callbacks', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { simulation } = createSimulation();
  simulation.roundState = 'LIVE_COMBAT';
  simulation.endRound('VANGUARD', 'SYNDICATE ELIMINATED');

  simulation.dispose();
  t.mock.timers.tick(10000);

  assert.equal(simulation.roundState, 'ROUND_END');
  assert.equal(simulation.ledger.length, 0);
  assert.equal(simulation.combatants.size, 0);
});

test('paused simulations defer delayed callbacks until play resumes', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { simulation } = createSimulation();
  const startingRoundTimer = simulation.roundTimer;
  let matchCallbackRan = false;
  let combatCallbackRan = false;
  simulation.roundState = 'LIVE_COMBAT';

  simulation.setPaused(true);
  simulation['scheduleTimeout'](() => {
    matchCallbackRan = true;
  }, 100);
  simulation['scheduleCombatTimeout'](() => {
    combatCallbackRan = true;
  }, 100);
  simulation.update(1);
  t.mock.timers.tick(100);
  assert.equal(simulation.roundTimer, startingRoundTimer);
  assert.equal(matchCallbackRan, false);
  assert.equal(combatCallbackRan, false);

  simulation.setPaused(false);
  t.mock.timers.tick(100);
  assert.equal(matchCallbackRan, true);
  assert.equal(combatCallbackRan, true);
  simulation.dispose();
});

test('match duration advances only while simulation is active and resets on a new match', () => {
  const { simulation, vanguardSpawns, syndicateSpawns } = createSimulation();

  simulation.update(2);
  assert.equal(simulation.elapsedMatchTime, 2);

  simulation.setPaused(true);
  simulation.update(5);
  assert.equal(simulation.elapsedMatchTime, 2);

  simulation.setPaused(false);
  simulation.update(0.5);
  assert.equal(simulation.elapsedMatchTime, 2.5);

  simulation.initMatch('industrial', vanguardSpawns, syndicateSpawns);
  assert.equal(simulation.elapsedMatchTime, 0);
  simulation.dispose();
});

test('claymores arm, ignore targets behind them, and credit forward kills', () => {
  const { simulation } = createSimulation();
  simulation.roundState = 'LIVE_COMBAT';
  simulation['updateBotsAI'] = () => {};
  simulation.particles.spawnExplosion = () => {};
  for (const combatant of simulation.combatants.values()) {
    if (combatant.id !== 'player_0' && combatant.id !== 'sy_bot_0') {
      combatant.pos = { x: 80, y: 1.75, z: 80 };
    }
  }
  const owner = simulation.playerRef!;
  const enemy = simulation.combatants.get('sy_bot_0')!;
  enemy.pos = { x: 0, y: 1.75, z: -2 };
  enemy.armor = 0;
  enemy.hp = 40;

  assert.equal(simulation.plantClaymore(owner.id, new THREE.Vector3(0, 0, 0), 0), true);
  const planted = simulation.activeClaymores[0];
  assert.ok(planted);
  simulation.update(0);
  assert.equal(planted.mine.isArmed, false);
  assert.equal(simulation.activeClaymores.length, 1);

  planted.mine.isArmed = true;
  simulation.update(0);
  assert.equal(simulation.activeClaymores.length, 1);
  assert.equal(enemy.isAlive, true);

  enemy.pos.z = 2;
  simulation.update(0);

  assert.equal(simulation.activeClaymores.length, 0);
  assert.equal(enemy.isAlive, false);
  assert.equal(owner.kills, 1);
  assert.equal(owner.cash, 1300);
  assert.equal(simulation.killfeed[0]?.weaponName, 'Claymore');
});

test('flashbangs blind nearby combatants based on facing and then consume the grenade', () => {
  const { simulation } = createSimulation();
  simulation.roundState = 'LIVE_COMBAT';
  let flashBurstCount = 0;
  let smokeCount = 0;
  let botCombatUpdates = 0;
  simulation.particles.flashbangBurst = () => {
    flashBurstCount++;
  };
  simulation.particles.spawnSmokeGrenade = () => {
    smokeCount++;
  };
  simulation['updateBotCombat'] = () => {
    botCombatUpdates++;
  };

  const player = simulation.playerRef!;
  const enemy = simulation.combatants.get('sy_bot_0')!;
  player.pos = { x: 0, y: 1.75, z: 48 };
  player.yaw = Math.PI;
  enemy.pos = { x: 0, y: 1.75, z: 48 };
  enemy.yaw = 0;
  for (const combatant of simulation.combatants.values()) {
    if (combatant.id !== player.id && combatant.id !== enemy.id) {
      combatant.pos = { x: 80, y: 1.75, z: 80 };
    }
  }

  simulation.throwGrenade(
    player.id,
    'flashbang',
    new THREE.Vector3(0, 1.75, 51),
    new THREE.Vector3(0, 0, 0)
  );
  const grenade = simulation.activeGrenades[0];
  assert.ok(grenade);
  grenade.fuseSec = 0;
  grenade.vel.set(0, 0, 0);
  simulation.update(0);

  assert.ok(player.isFlashedUntil > Date.now());
  assert.ok(player.isFlashedUntil > enemy.isFlashedUntil);
  assert.equal(simulation.activeGrenades.length, 0);
  assert.equal(flashBurstCount, 1);
  assert.equal(smokeCount, 0);
  assert.equal(player.flashbangs, 0);
  assert.equal(botCombatUpdates, 8);
});

test('flashbang line of sight is blocked by map geometry', () => {
  const { simulation } = createSimulation();
  const player = simulation.playerRef!;
  player.pos = { x: 0, y: 1.75, z: 0 };
  player.isFlashedUntil = 0;

  const wall = new THREE.Mesh(new THREE.BoxGeometry(4, 5, 0.25), new THREE.MeshBasicMaterial());
  wall.position.set(0, 2.5, 1.5);
  wall.updateMatrixWorld(true);
  simulation.scene.add(wall);
  simulation.colliders.push({
    min: new THREE.Vector3(-2, 0, 1.375),
    max: new THREE.Vector3(2, 5, 1.625),
    mesh: wall,
  });

  simulation['applyFlashbang'](new THREE.Vector3(0, 1.75, 3));

  assert.equal(player.isFlashedUntil, 0);
});

test('frag grenade kills respect armor and update killfeed and kill rewards', () => {
  const { simulation } = createSimulation();
  simulation.roundState = 'LIVE_COMBAT';
  simulation['updateBotsAI'] = () => {};
  simulation.particles.spawnExplosion = () => {};

  const owner = simulation.playerRef!;
  const victim = simulation.combatants.get('sy_bot_0')!;
  owner.pos = { x: 0, y: 1.75, z: 0 };
  victim.pos = { x: 1, y: 1.75, z: 0 };
  victim.armor = 0;
  victim.hp = 40;
  for (const combatant of simulation.combatants.values()) {
    if (combatant.id !== owner.id && combatant.id !== victim.id) {
      combatant.pos = { x: 80, y: 1.75, z: 80 };
    }
  }

  simulation.throwGrenade(
    owner.id,
    'frag',
    new THREE.Vector3(0, 1.75, 0),
    new THREE.Vector3(0, 0, 0)
  );
  const grenade = simulation.activeGrenades[0];
  assert.ok(grenade);
  grenade.fuseSec = 0;
  grenade.vel.set(0, 0, 0);
  simulation.update(0);

  assert.equal(victim.isAlive, false);
  assert.equal(owner.kills, 1);
  assert.equal(owner.cash, 1300);
  assert.ok(owner.damageDealt > 0);
  assert.equal(simulation.killfeed[0]?.weaponName, 'Frag Grenade');
});

test('airstrikes impact in sequence, damage enemies, and leave allies unharmed', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const { simulation } = createSimulation();
  simulation.roundState = 'LIVE_COMBAT';
  simulation['updateBotsAI'] = () => {};
  simulation.particles.spawnExplosion = () => {};

  const owner = simulation.playerRef!;
  const enemy = simulation.combatants.get('sy_bot_0')!;
  const ally = simulation.combatants.get('vg_bot_0')!;
  owner.currentStreak = 5;
  enemy.pos = { x: 0, y: 1.75, z: 0 };
  enemy.armor = 0;
  enemy.hp = 100;
  ally.pos = { x: 0, y: 1.75, z: 0 };
  ally.armor = 0;
  ally.hp = 100;
  for (const combatant of simulation.combatants.values()) {
    if (combatant.id !== owner.id && combatant.id !== enemy.id && combatant.id !== ally.id) {
      combatant.pos = { x: 80, y: 1.75, z: 80 };
    }
  }

  assert.equal(simulation.activateKillstreak(owner.id, 'AIRSTRIKE', { x: 0, z: 0 }), true);
  assert.equal(simulation.canActivateKillstreak(owner.id, 'AIRSTRIKE'), false);
  assert.equal(simulation.activateKillstreak(owner.id, 'AIRSTRIKE', { x: 0, z: 0 }), false);
  const strike = simulation.activeAirStrikes[0];
  assert.ok(strike);
  strike.startTime = Date.now() - 1200;
  simulation.update(0);

  assert.equal(strike.strikesCompleted, 1);
  assert.ok(enemy.hp < 100 && enemy.isAlive);
  assert.equal(ally.hp, 100);

  strike.startTime = Date.now() - 1650;
  simulation.update(0);
  assert.equal(enemy.isAlive, false);
  assert.equal(owner.kills, 1);
  assert.equal(simulation.killfeed[0]?.weaponName, 'Airstrike');

  strike.startTime = Date.now() - 2100;
  simulation.update(0);
  assert.equal(simulation.activeAirStrikes.length, 0);
});

test('UAV requires three kills and can be activated once per life', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const { simulation } = createSimulation();
  simulation.roundState = 'LIVE_COMBAT';
  const player = simulation.playerRef!;

  player.currentStreak = 2;
  assert.equal(simulation.canActivateKillstreak(player.id, 'UAV'), false);
  assert.equal(simulation.activateKillstreak(player.id, 'UAV'), false);

  player.currentStreak = 3;
  assert.equal(simulation.canActivateKillstreak(player.id, 'UAV'), true);
  assert.equal(simulation.activateKillstreak(player.id, 'UAV'), true);
  assert.ok(simulation.uavActiveUntil > Date.now());
  assert.equal(simulation.canActivateKillstreak(player.id, 'UAV'), false);
  assert.equal(simulation.activateKillstreak(player.id, 'UAV'), false);
});

test('Predator kills use the standard killfeed and reward path', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { simulation } = createSimulation();
  simulation.roundState = 'LIVE_COMBAT';
  simulation['updateBotsAI'] = () => {};
  simulation.particles.spawnExplosion = () => {};

  const owner = simulation.playerRef!;
  const victim = simulation.combatants.get('sy_bot_0')!;
  owner.currentStreak = 7;
  victim.pos = { x: 0, y: 1.75, z: 0 };
  victim.hp = 100;
  victim.armor = 0;
  for (const combatant of simulation.combatants.values()) {
    if (combatant.id !== owner.id && combatant.id !== victim.id) {
      combatant.pos = { x: 80, y: 1.75, z: 80 };
    }
  }

  assert.equal(simulation.activateKillstreak(owner.id, 'PREDATOR'), true);
  assert.equal(simulation.activateKillstreak(owner.id, 'PREDATOR'), false);
  t.mock.timers.tick(1200);

  assert.equal(victim.isAlive, false);
  assert.equal(owner.kills, 1);
  assert.equal(owner.currentStreak, 8);
  assert.equal(owner.cash, 1300);
  assert.equal(owner.damageDealt, 100);
  assert.equal(simulation.killfeed[0]?.weaponName, 'Predator');
});

test('round end cancels a pending Predator impact', (t) => {
  t.mock.timers.enable({ apis: ['Date', 'setTimeout'] });
  const { simulation } = createSimulation();
  simulation.roundState = 'LIVE_COMBAT';
  const owner = simulation.playerRef!;
  const victim = simulation.combatants.get('sy_bot_0')!;
  owner.currentStreak = 7;
  victim.pos = { x: 0, y: 1.75, z: 0 };
  for (const combatant of simulation.combatants.values()) {
    if (combatant.id !== owner.id && combatant.id !== victim.id) {
      combatant.pos = { x: 80, y: 1.75, z: 80 };
    }
  }
  let explosionCount = 0;
  simulation.particles = {
    isLineBlockedBySmoke: () => false,
    clearSmoke: () => {},
    spawnExplosion: () => {
      explosionCount++;
    },
  } as never;

  assert.equal(simulation.activateKillstreak(owner.id, 'PREDATOR'), true);
  simulation.endRound('VANGUARD', 'ROUND OBJECTIVE COMPLETED');
  t.mock.timers.tick(1200);

  assert.equal(victim.isAlive, true);
  assert.equal(victim.hp, 100);
  assert.equal(owner.kills, 0);
  assert.equal(simulation.killfeed.length, 0);
  assert.equal(explosionCount, 0);
});

test('round transition resets combatants and bomb state while preserving the score', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { simulation, vanguardSpawns, syndicateSpawns } = createSimulation();
  const player = simulation.playerRef!;
  const bot = simulation.combatants.get('sy_bot_0')!;

  player.isAlive = false;
  player.hp = 1;
  player.currentMag = 0;
  player.reserveAmmo = 1;
  player.pos = { x: 500, y: 1.75, z: 500 };
  player.cash = 2300;
  bot.isAlive = false;
  bot.hp = 0;
  bot.currentMag = 0;
  bot.reserveAmmo = 0;
  simulation.plantedBomb = {
    position: { x: 0, y: 0, z: 0 },
    site: 'A',
    plantedAt: 0,
    timerSec: 40,
    defuseProgress: 0,
    defusingCombatantId: null,
    isDefused: false,
    isExploded: false,
  };
  simulation.plantProgress = 0.6;
  simulation.plantingCombatantId = bot.id;
  simulation.defuseProgress = 0.3;
  simulation.defusingCombatantId = player.id;
  simulation.roundState = 'BOMB_PLANTED';
  simulation.scoreVanguard = 1;

  simulation.endRound('VANGUARD', 'BOMB DEFUSED');
  t.mock.timers.tick(2000);
  t.mock.timers.tick(5000);

  assert.equal(simulation.roundNumber, 2);
  assert.equal(simulation.roundState, 'BUY_PHASE');
  assert.equal(simulation.roundTimer, simulation.buyPhaseDuration);
  assert.equal(simulation.scoreVanguard, 2);
  assert.equal(simulation.scoreSyndicate, 0);
  assert.equal(simulation.roundWinner, null);
  assert.equal(simulation.roundEndReason, '');
  assert.equal(simulation.plantedBomb, null);
  assert.equal(simulation.plantProgress, 0);
  assert.equal(simulation.plantingCombatantId, null);
  assert.equal(simulation.defuseProgress, 0);
  assert.equal(simulation.defusingCombatantId, null);
  assert.equal(player.isAlive, true);
  assert.equal(player.hp, player.maxHp);
  assert.deepEqual(player.pos, {
    x: vanguardSpawns[2].x,
    y: vanguardSpawns[2].y,
    z: vanguardSpawns[2].z,
  });
  assert.equal(player.currentMag, player.weapon.magSize);
  assert.equal(player.reserveAmmo, player.weapon.reserveAmmo);
  assert.equal(player.fragGrenades, 1);
  assert.equal(player.smokeGrenades, 1);
  assert.equal(player.flashbangs, 1);
  assert.equal(player.claymores, 1);
  assert.equal(player.cash, 5550);
  assert.equal(bot.isAlive, true);
  assert.equal(bot.hp, bot.maxHp);
  assert.deepEqual(bot.pos, {
    x: syndicateSpawns[0].x,
    y: syndicateSpawns[0].y,
    z: syndicateSpawns[0].z,
  });
});

test('round start clears remaining tactical equipment and replenishes consumables', () => {
  const { simulation, vanguardSpawns, syndicateSpawns } = createSimulation();
  const player = simulation.playerRef!;
  simulation.roundState = 'LIVE_COMBAT';
  assert.equal(simulation.plantClaymore(player.id, new THREE.Vector3(0, 0, 0), 0), true);
  simulation.throwGrenade(
    player.id,
    'frag',
    new THREE.Vector3(0, 1.75, 0),
    new THREE.Vector3(0, 0, -1)
  );
  simulation.particles.spawnSmokeGrenade(new THREE.Vector3(0, 0, -2));
  player.currentStreak = 3;
  assert.equal(simulation.activateKillstreak(player.id, 'UAV'), true);
  const mineMesh = simulation.activeClaymores[0].mesh;
  const grenadeMesh = simulation.activeGrenades[0].mesh;
  let mineGeometryDisposed = false;
  mineMesh.traverse((object) => {
    if (object instanceof THREE.Mesh) {
      object.geometry.addEventListener('dispose', () => {
        mineGeometryDisposed = true;
      });
    }
  });
  player.flashbangs = 0;
  player.claymores = 0;
  player.isFlashedUntil = Date.now() + 10000;

  simulation.startRound(vanguardSpawns, syndicateSpawns);

  assert.equal(simulation.activeClaymores.length, 0);
  assert.equal(simulation.activeGrenades.length, 0);
  assert.equal(simulation.particles.activeSmokePuffs.length, 0);
  assert.equal(simulation.uavActiveUntil, 0);
  assert.equal(simulation.scene.children.includes(mineMesh), false);
  assert.equal(simulation.scene.children.includes(grenadeMesh), false);
  assert.equal(mineGeometryDisposed, true);
  assert.equal(player.flashbangs, 1);
  assert.equal(player.claymores, 1);
  assert.equal(player.isFlashedUntil, 0);
});

test('tactical grenades consume a single round allocation and reject empty inventory', () => {
  const { simulation } = createSimulation();
  const player = simulation.playerRef!;
  simulation.roundState = 'LIVE_COMBAT';
  const origin = new THREE.Vector3(0, 1.75, 0);
  const direction = new THREE.Vector3(0, 0, -1);

  simulation.throwGrenade(player.id, 'frag', origin, direction);
  simulation.throwGrenade(player.id, 'smoke', origin, direction);
  simulation.throwGrenade(player.id, 'flashbang', origin, direction);
  assert.equal(simulation.activeGrenades.length, 3);
  assert.equal(player.fragGrenades, 0);
  assert.equal(player.smokeGrenades, 0);
  assert.equal(player.flashbangs, 0);

  simulation.throwGrenade(player.id, 'frag', origin, direction);
  simulation.throwGrenade(player.id, 'smoke', origin, direction);
  simulation.throwGrenade(player.id, 'flashbang', origin, direction);

  assert.equal(simulation.activeGrenades.length, 3);
  assert.equal(player.fragGrenades, 0);
  assert.equal(player.smokeGrenades, 0);
  assert.equal(player.flashbangs, 0);
});

test('ending a round cancels pending tactical damage and removes its visuals', () => {
  const { simulation } = createSimulation();
  const player = simulation.playerRef!;
  simulation.roundState = 'LIVE_COMBAT';
  let explosionCount = 0;
  const particles = {
    activeSmokePuffs: [{ x: 0, y: 0, z: 0, radius: 6.5, life: 18 }],
    isLineBlockedBySmoke: () => false,
    clearSmoke() {
      this.activeSmokePuffs = [];
    },
    spawnExplosion() {
      explosionCount++;
    },
  };
  simulation.particles = particles as never;
  assert.equal(simulation.plantClaymore(player.id, new THREE.Vector3(0, 0, 0), 0), true);
  simulation.throwGrenade(
    player.id,
    'frag',
    new THREE.Vector3(0, 1.75, 0),
    new THREE.Vector3(0, 0, -1)
  );
  const mineMesh = simulation.activeClaymores[0].mesh;
  const grenadeMesh = simulation.activeGrenades[0].mesh;
  const killsBeforeRoundEnd = player.kills;
  simulation.activeAirStrikes.push({
    id: 'pending_strike',
    ownerId: player.id,
    targetPos: { x: 0, z: 0 },
    ownerTeam: player.team,
    startTime: Date.now() - 10000,
    strikesCompleted: 0,
    totalStrikes: 3,
  });

  simulation.endRound('VANGUARD', 'ROUND OBJECTIVE COMPLETED');
  simulation.update(5);

  assert.equal(simulation.roundState, 'ROUND_END');
  assert.equal(simulation.activeGrenades.length, 0);
  assert.equal(simulation.activeClaymores.length, 0);
  assert.equal(simulation.activeAirStrikes.length, 0);
  assert.equal(particles.activeSmokePuffs.length, 0);
  assert.equal(simulation.scene.children.includes(mineMesh), false);
  assert.equal(simulation.scene.children.includes(grenadeMesh), false);
  assert.equal(player.kills, killsBeforeRoundEnd);
  assert.equal(explosionCount, 0);
});

test('match ends instead of scheduling another round when a team reaches the win limit', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  const { simulation } = createSimulation();
  simulation.scoreVanguard = simulation.maxRoundsToWin - 1;
  simulation.roundState = 'LIVE_COMBAT';

  simulation.endRound('VANGUARD', 'SYNDICATE ELIMINATED');
  t.mock.timers.tick(2000);
  assert.equal(simulation.roundState, 'REWARDS');
  t.mock.timers.tick(4000);

  assert.equal(simulation.roundState, 'MATCH_END');
  assert.equal(simulation.roundNumber, 1);
});

test('bots distribute their fire across multiple visible opponents', () => {
  const { simulation } = createSimulation();
  simulation.roundState = 'LIVE_COMBAT';
  simulation['hasLineOfSight'] = () => true;

  const vanguardBots = [...simulation.combatants.values()].filter(
    (combatant) => combatant.team === 'VANGUARD' && !combatant.isPlayer
  );
  vanguardBots.forEach((bot, index) => {
    bot.pos = { x: [-8, -4, 4, 8][index], y: 1.75, z: 0 };
  });

  const targetA = simulation.combatants.get('sy_bot_0')!;
  const targetB = simulation.combatants.get('sy_bot_1')!;
  targetA.pos = { x: -6, y: 1.75, z: 20 };
  targetB.pos = { x: 6, y: 1.75, z: 20 };
  for (const combatant of simulation.combatants.values()) {
    if (combatant.team === 'SYNDICATE' && combatant.id !== targetA.id && combatant.id !== targetB.id) {
      combatant.pos = { x: 500, y: 1.75, z: 500 };
    }
  }

  const assignments = new Map<string, string>();
  simulation.validateAndExecuteShot = (shooterId, _origin, direction) => {
    if (!vanguardBots.some((bot) => bot.id === shooterId)) return { hit: false, isHeadshot: false };
    const shooter = simulation.combatants.get(shooterId)!;
    const shotAngle = Math.atan2(direction.x, direction.z);
    const target = [targetA, targetB].sort((a, b) => {
      const angleA = Math.atan2(a.pos.x - shooter.pos.x, a.pos.z - shooter.pos.z);
      const angleB = Math.atan2(b.pos.x - shooter.pos.x, b.pos.z - shooter.pos.z);
      return Math.abs(angleA - shotAngle) - Math.abs(angleB - shotAngle);
    })[0];
    assignments.set(shooterId, target.id);
    return { hit: false, isHeadshot: false };
  };

  simulation['updateBotsAI'](0.01);
  const targetCounts = [...assignments.values()].reduce(
    (counts, targetId) => counts.set(targetId, (counts.get(targetId) ?? 0) + 1),
    new Map<string, number>()
  );

  assert.equal(assignments.size, 4);
  assert.equal(targetCounts.get(targetA.id), 2);
  assert.equal(targetCounts.get(targetB.id), 2);
});

test('bot difficulty changes firing accuracy in the expected order', () => {
  const getShotSpread = (difficulty: 'recruit' | 'veteran' | 'elite') => {
    const { simulation } = createSimulation();
    simulation.botDifficulty = difficulty;
    simulation.roundState = 'LIVE_COMBAT';
    simulation['hasLineOfSight'] = () => true;

    const bot = simulation.combatants.get('sy_bot_0')!;
    bot.pos = { x: 0, y: 1.75, z: 0 };
    simulation.playerRef!.pos = { x: 0, y: 1.75, z: 20 };

    let shotSpread = 0;
    simulation.validateAndExecuteShot = (shooterId, _origin, _direction, spread) => {
      if (shooterId === bot.id) shotSpread = spread;
      return { hit: false, isHeadshot: false };
    };

    simulation['updateBotsAI'](0);
    assert.ok(shotSpread > 0, `${difficulty} bot should fire in this scenario`);
    return shotSpread;
  };

  const recruitSpread = getShotSpread('recruit');
  const veteranSpread = getShotSpread('veteran');
  const eliteSpread = getShotSpread('elite');

  assert.ok(recruitSpread > veteranSpread);
  assert.ok(veteranSpread > eliteSpread);
});

test('snipers preserve range while shotgun bots close the distance', () => {
  const { simulation } = createSimulation();
  simulation['hasLineOfSight'] = () => true;
  simulation.validateAndExecuteShot = () => ({ hit: false, isHeadshot: false });

  const target = simulation.playerRef!;
  const sniper = simulation.combatants.get('sy_bot_1')!;
  sniper.pos = { x: 0, y: 1.75, z: 0 };
  target.pos = { x: 0, y: 1.75, z: 26 };

  simulation['updateBotCombat'](sniper, target, 0.1, null, false, [target], target);
  assert.equal(sniper.pos.z, 0, 'sniper should hold position at its preferred range');

  target.pos = { x: 0, y: 1.75, z: 8 };
  simulation['updateBotCombat'](sniper, target, 0.1, null, false, [target], target);
  assert.ok(sniper.pos.z < 0, 'sniper should retreat when an opponent gets too close');

  const shotgunBot = simulation.combatants.get('sy_bot_2')!;
  shotgunBot.pos = { x: 0, y: 1.75, z: 0 };
  target.pos = { x: 0, y: 1.75, z: 20 };
  simulation['updateBotCombat'](shotgunBot, target, 0.1, null, false, [target], target);
  assert.ok(shotgunBot.pos.z > 0, 'shotgun user should push toward a distant opponent');
});

test('bots can route to a position hidden behind nearby cover', () => {
  const scene = new THREE.Scene();
  const wall = new THREE.Mesh(new THREE.BoxGeometry(2, 4, 1), new THREE.MeshBasicMaterial());
  wall.position.set(0, 2, 0);
  scene.add(wall);
  scene.updateMatrixWorld(true);

  const bounds = new THREE.Box3().setFromObject(wall);
  const simulation = new SimulationEngine(
    scene,
    { isLineBlockedBySmoke: () => false, clearSmoke: () => {} } as never
  );
  simulation.colliders = [{ min: bounds.min, max: bounds.max, mesh: wall, isCover: true }];
  const spawns = [-20, -10, 0, 10, 20].map((x) => new THREE.Vector3(x, 1.75, 50));
  simulation.initMatch('industrial', spawns, spawns.map((spawn) => spawn.clone().setZ(-50)));

  const bot = simulation.playerRef!;
  bot.pos = { x: 0, y: 1.75, z: 2 };
  const threat = new THREE.Vector3(0, 1.75, 5);
  const coverPlan = simulation['findCoverPosition'](bot, threat);

  assert.ok(coverPlan, 'bot should find a nearby cover position');
  assert.ok(coverPlan.position.z < -0.5, 'cover position should be hidden behind the wall');
  assert.equal(coverPlan.waypoints.length, 2, 'bot should route around the wall edge');

  let routeOrigin = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
  for (const waypoint of [...coverPlan.waypoints, coverPlan.position]) {
    const routeTarget = waypoint.clone().add(new THREE.Vector3(0, 1.45, 0));
    assert.ok(simulation['hasLineOfSight'](routeOrigin, routeTarget), 'each route segment should be clear');
    routeOrigin = routeTarget;
  }
  assert.equal(
    simulation['hasLineOfSight'](threat.clone().add(new THREE.Vector3(0, 1.45, 0)), routeOrigin),
    false,
    'cover destination should block line of sight from the shooter'
  );
});
