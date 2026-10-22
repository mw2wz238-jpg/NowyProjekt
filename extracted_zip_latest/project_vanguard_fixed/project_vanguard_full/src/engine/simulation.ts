import * as THREE from 'three';
import {
  RoundState,
  Team,
  Combatant,
  BotDifficulty,
  KillfeedEntry,
  EconomyLedgerRecord,
  MapId,
  BombSite,
  PlantedBomb,
  KillstreakType,
  ClaymoreMine,
  ActiveAirStrike,
  RadioCallout,
} from '../types/game';
import { WEAPON_REGISTRY } from './weapons';
import { CollidableBox } from './environment';
import { ParticleSystem } from './particles';
import { Sound } from './audio';
import { Materials } from './materials';
import { disposeObjectResources } from './resourceDisposal';

export interface ActiveGrenade {
  id: string;
  type: 'frag' | 'smoke' | 'flashbang';
  ownerId: string;
  ownerTeam: Team;
  mesh: THREE.Mesh;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuseSec: number;
}

export class SimulationEngine {
  private isPaused = false;
  public botDifficulty: BotDifficulty = 'veteran';
  public roundState: RoundState = 'BUY_PHASE';
  public roundNumber: number = 1;
  public maxRoundsToWin: number = 13;
  public scoreVanguard: number = 0;
  public scoreSyndicate: number = 0;

  public roundTimer: number = 15; // Starts with 15s buy phase
  public roundTimeLimit: number = 115; // 1m 55s live combat
  public buyPhaseDuration: number = 15;
  public elapsedMatchTime: number = 0;

  public combatants: Map<string, Combatant> = new Map();
  public activeGrenades: ActiveGrenade[] = [];
  public activeClaymores: { mine: ClaymoreMine; mesh: THREE.Group }[] = [];
  public activeAirStrikes: ActiveAirStrike[] = [];
  public radioCallouts: RadioCallout[] = [];
  public uavActiveUntil: number = 0;
  public killfeed: KillfeedEntry[] = [];
  public ledger: EconomyLedgerRecord[] = [];

  // Bomb & Objective State
  public bombSiteA: BombSite = { id: 'A', position: { x: -26, y: 0, z: -10 }, radius: 7.5 };
  public bombSiteB: BombSite = { id: 'B', position: { x: 26, y: 0, z: -10 }, radius: 7.5 };
  public plantedBomb: PlantedBomb | null = null;
  private plantedBombObjective: BombSite | null = null;
  public bombMesh: THREE.Group | null = null;
  public plantProgress: number = 0; // 0 to 1
  public plantingCombatantId: string | null = null;
  public defuseProgress: number = 0; // 0 to 1
  public defusingCombatantId: string | null = null;
  private bombBeepTimer: number = 0;

  // Idempotency tracking to prevent duplicate round rewards or purchase replays
  private processedRoundRewards = new Set<number>();
  private processedTransactions = new Set<string>();

  public colliders: CollidableBox[] = [];
  public particles: ParticleSystem;
  public scene: THREE.Scene;
  private cachedColliderMeshes: (THREE.Object3D | undefined)[] = [];
  private wallMeshes: THREE.Object3D[] = [];
  private wallRaycaster = new THREE.Raycaster();
  private wallIntersections: THREE.Intersection[] = [];
  private lineOfSightDirection = new THREE.Vector3();
  private botSightOrigin = new THREE.Vector3();
  private botSightTarget = new THREE.Vector3();
  private botShotOrigin = new THREE.Vector3();
  private botShotTarget = new THREE.Vector3();
  private botShotDirection = new THREE.Vector3();
  private aliveVanguardScratch: Combatant[] = [];
  private aliveSyndicateScratch: Combatant[] = [];
  private botScratch: Combatant[] = [];
  private targetAssignmentsScratch = new Map<string, number>();
  private visibleTargetsByBot = new Map<string, Combatant[]>();
  private pendingTimeouts = new Set<ReturnType<typeof setTimeout>>();
  private pendingCombatTimeouts = new Set<ReturnType<typeof setTimeout>>();
  private usedKillstreaks = new Map<string, Set<KillstreakType>>();

  public playerRef: Combatant | null = null;
  public consecutiveLossesVanguard: number = 0;
  public consecutiveLossesSyndicate: number = 0;

  public roundWinner: Team | null = null;
  public roundEndReason = '';
  public mvpCombatant: Combatant | null = null;
  private vanguardSpawns: THREE.Vector3[] = [];
  private syndicateSpawns: THREE.Vector3[] = [];

  // 3D visual representations of AI bots
  public botMeshes: Map<string, THREE.Group> = new Map();
  private botFireCooldowns = new Map<string, number>();
  private botReloadTimers = new Map<string, number>();
  private roundPlanterId: string | null = null;
  private botThreats = new Map<
    string,
    {
      remaining: number;
      coverPosition: { position: THREE.Vector3; waypoints: THREE.Vector3[] } | null;
    }
  >();

  // Callbacks for UI updates
  public onStateChange?: (state: RoundState) => void;
  public onKillfeed?: (entry: KillfeedEntry) => void;
  public onScoreChange?: (vg: number, sy: number) => void;
  public onHitConfirmed?: (isHeadshot: boolean, damage: number) => void;
  public onPlayerDamaged?: (currentHp: number, attackerPos: THREE.Vector3) => void;
  public onBombPlanted?: (site: 'A' | 'B') => void;
  public onBombDefused?: () => void;
  public onKillstreakAwarded?: (type: KillstreakType) => void;
  public onRadioCallout?: (callout: RadioCallout) => void;

  constructor(scene: THREE.Scene, particles: ParticleSystem) {
    this.scene = scene;
    this.particles = particles;
  }

  public initMatch(mapId: MapId, vanguardSpawns: THREE.Vector3[], syndicateSpawns: THREE.Vector3[]) {
    this.clearPendingTimeouts();
    this.usedKillstreaks.clear();
    this.vanguardSpawns = vanguardSpawns.map((spawn) => spawn.clone());
    this.syndicateSpawns = syndicateSpawns.map((spawn) => spawn.clone());
    this.clearMatchVisuals();
    this.combatants.clear();
    this.botFireCooldowns.clear();
    this.botReloadTimers.clear();
    this.roundPlanterId = null;
    this.botThreats.clear();
    this.activeAirStrikes = [];
    this.uavActiveUntil = 0;
    this.radioCallouts = [];
    this.killfeed = [];
    this.ledger = [];
    this.processedRoundRewards.clear();
    this.processedTransactions.clear();

    this.roundNumber = 1;
    this.elapsedMatchTime = 0;
    this.scoreVanguard = 0;
    this.scoreSyndicate = 0;
    this.consecutiveLossesVanguard = 0;
    this.consecutiveLossesSyndicate = 0;

    // 1. Initialize Player (Vanguard Team Captain)
    const player: Combatant = {
      id: 'player_0',
      name: 'Vanguard Operator',
      team: 'VANGUARD',
      isPlayer: true,
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
      currentMag: WEAPON_REGISTRY.m4a1.magSize,
      reserveAmmo: WEAPON_REGISTRY.m4a1.reserveAmmo,
      kills: 0,
      deaths: 0,
      assists: 0,
      damageDealt: 0,
      mvpStars: 0,
      cash: 1000, // Starter economy cash
      pos: { x: vanguardSpawns[2].x, y: vanguardSpawns[2].y, z: vanguardSpawns[2].z },
      yaw: 0,
      pitch: 0,
      role: 'assaulter',
    };
    this.combatants.set(player.id, player);
    this.playerRef = player;

    // 2. Initialize 4 Vanguard AI Teammates
    const vgNames = ['Ghost', 'Soap', 'Roach', 'Gaz'];
    const vgRoles: ('assaulter' | 'sniper' | 'shield' | 'assaulter')[] = ['assaulter', 'sniper', 'shield', 'assaulter'];
    const vgWeapons = [WEAPON_REGISTRY.m4a1, WEAPON_REGISTRY.awp, WEAPON_REGISTRY.shotgun, WEAPON_REGISTRY.mp5];

    for (let i = 0; i < 4; i++) {
      const spawn = vanguardSpawns[i < 2 ? i : i + 1];
      const bot: Combatant = {
        id: `vg_bot_${i}`,
        name: vgNames[i],
        team: 'VANGUARD',
        isPlayer: false,
        isAlive: true,
        hp: 100,
        maxHp: 100,
        armor: 100,
        hasHelmet: true,
        hasDefuseKit: i === 0, // Ghost carries defuse kit
        fragGrenades: 1,
        smokeGrenades: 1,
        flashbangs: 1,
        claymores: 1,
        currentStreak: 0,
        isFlashedUntil: 0,
        weapon: vgWeapons[i],
        currentMag: vgWeapons[i].magSize,
        reserveAmmo: vgWeapons[i].reserveAmmo,
        kills: 0,
        deaths: 0,
        assists: 0,
        damageDealt: 0,
        mvpStars: 0,
        cash: 1000,
        pos: { x: spawn.x, y: spawn.y, z: spawn.z },
        yaw: 0,
        pitch: 0,
        role: vgRoles[i],
      };
      this.combatants.set(bot.id, bot);
      this.createBotVisual(bot);
    }

    // 3. Initialize 5 Syndicate Enemies (OpFor)
    const syNames = ['Viper', 'Nikolai', 'Razor', 'Bane', 'Juggernaut'];
    const syRoles: ('assaulter' | 'sniper' | 'shield' | 'assaulter' | 'juggernaut')[] = [
      'assaulter',
      'sniper',
      'shield',
      'assaulter',
      'juggernaut',
    ];
    const syWeapons = [
      WEAPON_REGISTRY.m4a1,
      WEAPON_REGISTRY.awp,
      WEAPON_REGISTRY.shotgun,
      WEAPON_REGISTRY.mp5,
      WEAPON_REGISTRY.m4a1,
    ];

    for (let i = 0; i < 5; i++) {
      const spawn = syndicateSpawns[i];
      const isJugg = syRoles[i] === 'juggernaut';
      const bot: Combatant = {
        id: `sy_bot_${i}`,
        name: syNames[i],
        team: 'SYNDICATE',
        isPlayer: false,
        isAlive: true,
        hp: isJugg ? 350 : 100,
        maxHp: isJugg ? 350 : 100,
        armor: isJugg ? 150 : 100,
        hasHelmet: true,
        hasDefuseKit: false,
        fragGrenades: 1,
        smokeGrenades: 1,
        flashbangs: 1,
        claymores: 1,
        currentStreak: 0,
        isFlashedUntil: 0,
        weapon: syWeapons[i],
        currentMag: syWeapons[i].magSize,
        reserveAmmo: syWeapons[i].reserveAmmo,
        kills: 0,
        deaths: 0,
        assists: 0,
        damageDealt: 0,
        mvpStars: 0,
        cash: 1000,
        pos: { x: spawn.x, y: spawn.y, z: spawn.z },
        yaw: Math.PI,
        pitch: 0,
        role: syRoles[i],
      };
      this.combatants.set(bot.id, bot);
      this.createBotVisual(bot);
    }

    this.startRound(vanguardSpawns, syndicateSpawns);
  }

  public dispose(): void {
    this.isPaused = false;
    this.clearPendingTimeouts();
    this.clearMatchVisuals();
    this.combatants.clear();
    this.botMeshes.clear();
  }

  private scheduleTimeout(callback: () => void, delayMs: number): void {
    const timeout = setTimeout(() => {
      this.pendingTimeouts.delete(timeout);
      if (this.isPaused) {
        this.scheduleTimeout(callback, 100);
        return;
      }
      callback();
    }, delayMs);
    this.pendingTimeouts.add(timeout);
  }

  private clearPendingTimeouts(): void {
    for (const timeout of this.pendingTimeouts) clearTimeout(timeout);
    this.pendingTimeouts.clear();
    this.pendingCombatTimeouts.clear();
  }

  private scheduleCombatTimeout(callback: () => void, delayMs: number): void {
    const timeout = setTimeout(() => {
      this.pendingTimeouts.delete(timeout);
      this.pendingCombatTimeouts.delete(timeout);
      if (this.isPaused) {
        this.scheduleCombatTimeout(callback, 100);
        return;
      }
      if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') return;
      callback();
    }, delayMs);
    this.pendingTimeouts.add(timeout);
    this.pendingCombatTimeouts.add(timeout);
  }

  private clearCombatTimeouts(): void {
    for (const timeout of this.pendingCombatTimeouts) {
      clearTimeout(timeout);
      this.pendingTimeouts.delete(timeout);
    }
    this.pendingCombatTimeouts.clear();
  }

  public setPaused(paused: boolean): void {
    this.isPaused = paused;
  }

  public get paused(): boolean {
    return this.isPaused;
  }

  private clearMatchVisuals(): void {
    for (const mesh of this.botMeshes.values()) this.disposeAndRemove(mesh);
    this.botMeshes.clear();

    for (const grenade of this.activeGrenades) this.disposeAndRemove(grenade.mesh);
    this.activeGrenades = [];

    for (const { mesh } of this.activeClaymores) this.disposeAndRemove(mesh);
    this.activeClaymores = [];

    if (this.bombMesh) this.disposeAndRemove(this.bombMesh);
    this.bombMesh = null;
  }

  private disposeAndRemove(object: THREE.Object3D): void {
    this.scene.remove(object);
    disposeObjectResources([object], (material) => Materials.isShared(material));
  }

  private createBotVisual(bot: Combatant) {
    const group = new THREE.Group();
    group.name = `visual_${bot.id}`;

    const uniformMat = new THREE.MeshStandardMaterial({
      color: bot.team === 'VANGUARD' ? 0x223a5e : 0x541818,
      roughness: 0.7,
      metalness: 0.1,
    });
    const vestMat = new THREE.MeshStandardMaterial({
      color: bot.role === 'juggernaut' ? 0x111111 : 0x181c22,
      roughness: 0.5,
      metalness: 0.4,
    });
    const helmetMat = new THREE.MeshStandardMaterial({
      color: 0x1a1e24,
      roughness: 0.4,
      metalness: 0.6,
    });
    const gearMat = new THREE.MeshStandardMaterial({
      color: bot.team === 'VANGUARD' ? 0x3a4a50 : 0x3a3030,
      roughness: 0.82,
      metalness: 0.04,
    });
    const trimMat = new THREE.MeshStandardMaterial({
      color: bot.team === 'VANGUARD' ? 0x8b9a9c : 0xb18b69,
      roughness: 0.65,
      metalness: 0.12,
    });

    // Torso / Vest
    const torsoScale = bot.role === 'juggernaut' ? 1.4 : 1.0;
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55 * torsoScale, 0.75 * torsoScale, 0.35 * torsoScale), vestMat);
    torso.position.y = 1.05 * torsoScale;
    torso.castShadow = true;
    group.add(torso);

    const chestPlate = new THREE.Mesh(
      new THREE.BoxGeometry(0.38 * torsoScale, 0.38 * torsoScale, 0.035 * torsoScale),
      gearMat
    );
    chestPlate.position.set(0, 1.1 * torsoScale, 0.19 * torsoScale);
    chestPlate.castShadow = true;
    group.add(chestPlate);

    const pouchGeometry = new THREE.BoxGeometry(0.1 * torsoScale, 0.13 * torsoScale, 0.09 * torsoScale);
    for (let pouch = 0; pouch < 3; pouch++) {
      const magPouch = new THREE.Mesh(pouchGeometry, gearMat);
      magPouch.position.set((pouch - 1) * 0.12 * torsoScale, 0.88 * torsoScale, 0.2 * torsoScale);
      magPouch.castShadow = true;
      group.add(magPouch);
    }

    const backpack = new THREE.Mesh(
      new THREE.BoxGeometry(0.38 * torsoScale, 0.48 * torsoScale, 0.16 * torsoScale),
      gearMat
    );
    backpack.position.set(0, 1.25 * torsoScale, -0.23 * torsoScale);
    backpack.castShadow = true;
    group.add(backpack);

    // Head & Tactical Helmet
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.3 * torsoScale, 0.32 * torsoScale, 0.3 * torsoScale), uniformMat);
    head.position.y = 1.62 * torsoScale;
    head.name = 'head';
    group.add(head);

    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.34 * torsoScale, 0.22 * torsoScale, 0.34 * torsoScale), helmetMat);
    helmet.position.y = 1.72 * torsoScale;
    helmet.castShadow = true;
    group.add(helmet);

    // Goggles / Visor
    const visorMat = new THREE.MeshStandardMaterial({
      color: bot.role === 'sniper' ? 0xff2222 : 0x33ff66,
      emissive: bot.role === 'sniper' ? 0xaa1111 : 0x116622,
      roughness: 0.1,
      metalness: 0.9,
    });
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24 * torsoScale, 0.08 * torsoScale, 0.06 * torsoScale), visorMat);
    visor.position.set(0, 1.63 * torsoScale, 0.17 * torsoScale);
    group.add(visor);

    // Arms
    const lArm = new THREE.Mesh(new THREE.BoxGeometry(0.16 * torsoScale, 0.65 * torsoScale, 0.16 * torsoScale), uniformMat);
    lArm.position.set(-0.35 * torsoScale, 1.0 * torsoScale, 0.1 * torsoScale);
    group.add(lArm);

    const rArm = new THREE.Mesh(new THREE.BoxGeometry(0.16 * torsoScale, 0.65 * torsoScale, 0.16 * torsoScale), uniformMat);
    rArm.position.set(0.35 * torsoScale, 1.0 * torsoScale, 0.15 * torsoScale);
    group.add(rArm);

    for (const side of [-1, 1]) {
      const shoulderPad = new THREE.Mesh(
        new THREE.BoxGeometry(0.2 * torsoScale, 0.19 * torsoScale, 0.2 * torsoScale),
        vestMat
      );
      shoulderPad.position.set(side * 0.36 * torsoScale, 1.32 * torsoScale, 0.08 * torsoScale);
      shoulderPad.castShadow = true;
      group.add(shoulderPad);

      const kneePad = new THREE.Mesh(
        new THREE.BoxGeometry(0.17 * torsoScale, 0.14 * torsoScale, 0.055 * torsoScale),
        gearMat
      );
      kneePad.position.set(side * 0.16 * torsoScale, 0.42 * torsoScale, 0.12 * torsoScale);
      kneePad.castShadow = true;
      group.add(kneePad);
    }

    const teamPatch = new THREE.Mesh(
      new THREE.BoxGeometry(0.12 * torsoScale, 0.09 * torsoScale, 0.018 * torsoScale),
      trimMat
    );
    teamPatch.position.set(-0.2 * torsoScale, 1.28 * torsoScale, 0.19 * torsoScale);
    group.add(teamPatch);

    // Legs
    const lLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2 * torsoScale, 0.75 * torsoScale, 0.2 * torsoScale), uniformMat);
    lLeg.position.set(-0.16 * torsoScale, 0.38 * torsoScale, 0);
    lLeg.castShadow = true;
    group.add(lLeg);

    const rLeg = new THREE.Mesh(new THREE.BoxGeometry(0.2 * torsoScale, 0.75 * torsoScale, 0.2 * torsoScale), uniformMat);
    rLeg.position.set(0.16 * torsoScale, 0.38 * torsoScale, 0);
    rLeg.castShadow = true;
    group.add(rLeg);

    // Weapon representation
    const wpnMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.08, 0.12, bot.role === 'sniper' ? 0.9 : 0.6),
      new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.3, metalness: 0.9 })
    );
    wpnMesh.position.set(0.22, 1.05 * torsoScale, 0.35);
    wpnMesh.castShadow = true;
    group.add(wpnMesh);

    // Sniper Laser pointer
    if (bot.role === 'sniper') {
      const laserMat = new THREE.MeshBasicMaterial({ color: 0xff0033 });
      const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 45, 8), laserMat);
      laser.rotation.x = Math.PI / 2;
      laser.position.set(0.22, 1.08, 22.5);
      laser.name = 'sniperLaser';
      group.add(laser);
    }

    group.position.set(bot.pos.x, bot.pos.y, bot.pos.z);
    this.scene.add(group);
    this.botMeshes.set(bot.id, group);
  }

  public createC4Mesh(pos: THREE.Vector3): THREE.Group {
    const group = new THREE.Group();
    group.name = 'prop_c4';

    // C4 explosive block
    const c4Mat = new THREE.MeshStandardMaterial({ color: 0x8a7050, roughness: 0.8, metalness: 0.1 });
    const tapeMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.5, metalness: 0.2 });
    const block = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.18, 0.55), c4Mat);
    block.position.y = 0.09;
    block.castShadow = true;
    group.add(block);

    // Black electrical tape bands
    const tape1 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.185, 0.08), tapeMat);
    tape1.position.set(0, 0.09, -0.14);
    group.add(tape1);
    const tape2 = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.185, 0.08), tapeMat);
    tape2.position.set(0, 0.09, 0.14);
    group.add(tape2);

    // Receiver unit with digital display
    const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.22), Materials.get('weapon_matte_black'));
    receiver.position.set(0, 0.21, 0);
    group.add(receiver);

    // Glowing blinking red LED beacon
    const ledMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    const led = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), ledMat);
    led.position.set(0.08, 0.25, 0.06);
    led.name = 'c4_led';
    group.add(led);

    // Beeping light pulse
    const pointLight = new THREE.PointLight(0xff0000, 2.5, 6);
    pointLight.position.set(0, 0.35, 0);
    pointLight.name = 'c4_light';
    group.add(pointLight);

    group.position.copy(pos);
    this.scene.add(group);
    return group;
  }

  public startPlanting(combatantId: string, site: 'A' | 'B'): boolean {
    if (this.roundState !== 'LIVE_COMBAT' || this.plantedBomb) return false;
    const c = this.combatants.get(combatantId);
    if (!c || !c.isAlive || c.team !== 'SYNDICATE') return false;

    const targetSite = site === 'A' ? this.bombSiteA : this.bombSiteB;
    const dist = Math.hypot(c.pos.x - targetSite.position.x, c.pos.z - targetSite.position.z);
    if (dist > targetSite.radius) return false;

    this.plantingCombatantId = combatantId;
    return true;
  }

  public cancelPlanting(): void {
    this.plantingCombatantId = null;
    this.plantProgress = 0;
  }

  public plantBomb(combatantId: string, site: 'A' | 'B', pos: THREE.Vector3): void {
    if (this.plantedBomb) return;
    this.plantedBomb = {
      position: { x: pos.x, y: pos.y, z: pos.z },
      site,
      plantedAt: Date.now(),
      timerSec: 40.0,
      defuseProgress: 0,
      defusingCombatantId: null,
      isDefused: false,
      isExploded: false,
    };
    this.plantedBombObjective = { id: site, position: this.plantedBomb.position, radius: 3.5 };
    this.roundState = 'BOMB_PLANTED';
    this.roundTimer = 40.0;
    this.plantProgress = 0;
    this.plantingCombatantId = null;

    // Spawn 3D C4 prop
    this.bombMesh = this.createC4Mesh(new THREE.Vector3(pos.x, 0, pos.z));

    Sound.playBombPlanted();
    if (this.onBombPlanted) this.onBombPlanted(site);
    if (this.onStateChange) this.onStateChange(this.roundState);
  }

  public startDefusing(combatantId: string): boolean {
    if (this.roundState !== 'BOMB_PLANTED' || !this.plantedBomb || this.plantedBomb.isDefused || this.plantedBomb.isExploded) {
      return false;
    }
    const c = this.combatants.get(combatantId);
    if (!c || !c.isAlive || c.team !== 'VANGUARD') return false;

    const bPos = this.plantedBomb.position;
    const dist = Math.hypot(c.pos.x - bPos.x, c.pos.z - bPos.z);
    if (dist > 3.5) return false;

    this.defusingCombatantId = combatantId;
    this.plantedBomb.defusingCombatantId = combatantId;
    return true;
  }

  public isInDefuseRange(combatant: Combatant): boolean {
    if (!this.plantedBomb) return false;
    const bombPos = this.plantedBomb.position;
    return Math.hypot(combatant.pos.x - bombPos.x, combatant.pos.z - bombPos.z) <= 3.5;
  }

  public cancelDefusing(): void {
    this.defusingCombatantId = null;
    this.defuseProgress = 0;
    if (this.plantedBomb) {
      this.plantedBomb.defusingCombatantId = null;
      this.plantedBomb.defuseProgress = 0;
    }
  }

  public startRound(vanguardSpawns: THREE.Vector3[], syndicateSpawns: THREE.Vector3[]) {
    this.clearRoundTacticalEffects();
    this.uavActiveUntil = 0;
    this.roundState = 'BUY_PHASE';
    this.roundTimer = this.buyPhaseDuration;
    this.roundWinner = null;
    this.roundEndReason = '';
    this.mvpCombatant = null;

    // Reset bomb state
    this.plantedBomb = null;
    this.plantedBombObjective = null;
    if (this.bombMesh) {
      this.disposeAndRemove(this.bombMesh);
      this.bombMesh = null;
    }
    this.plantProgress = 0;
    this.plantingCombatantId = null;
    this.defuseProgress = 0;
    this.defusingCombatantId = null;
    this.bombBeepTimer = 0;

    Sound.playRoundStart();

    // Reset combatants for next round
    let vgIdx = 0;
    let syIdx = 0;
    const playerSpawnIndex = Math.floor(vanguardSpawns.length / 2);

    this.combatants.forEach((c) => {
      c.isAlive = true;
      c.hp = c.role === 'juggernaut' ? 350 : 100;
      c.maxHp = c.hp;
      c.currentMag = c.weapon.magSize;
      c.reserveAmmo = c.weapon.reserveAmmo;
      c.fragGrenades = 1;
      c.smokeGrenades = 1;
      c.flashbangs = 1;
      c.claymores = 1;
      c.isFlashedUntil = 0;
      this.botFireCooldowns.set(c.id, 0);
      this.botReloadTimers.delete(c.id);
      this.botThreats.delete(c.id);

      // Position reset to team spawns
      if (c.team === 'VANGUARD') {
        if (c.isPlayer) {
          const sp = vanguardSpawns[playerSpawnIndex];
          c.pos = { x: sp.x, y: sp.y, z: sp.z };
        } else {
          if (vgIdx === playerSpawnIndex) vgIdx++;
          const sp = vanguardSpawns[vgIdx % vanguardSpawns.length];
          c.pos = { x: sp.x, y: sp.y, z: sp.z };
          vgIdx++;
        }
        c.yaw = 0;
      } else {
        const sp = syndicateSpawns[syIdx % syndicateSpawns.length];
        c.pos = { x: sp.x, y: sp.y, z: sp.z };
        c.yaw = Math.PI;
        syIdx++;
      }

      // Update 3D mesh
      const mesh = this.botMeshes.get(c.id);
      if (mesh) {
        mesh.visible = true;
        mesh.position.set(c.pos.x, 0, c.pos.z);
        mesh.rotation.y = c.yaw;
      }
    });

    this.roundPlanterId = [...this.combatants.values()]
      .filter((combatant) => combatant.isAlive && !combatant.isPlayer && combatant.team === 'SYNDICATE')
      .sort((a, b) => this.distanceToNearestBombSite(a) - this.distanceToNearestBombSite(b))[0]?.id ?? null;

    if (this.onStateChange) this.onStateChange(this.roundState);
  }

  private distanceToNearestBombSite(combatant: Combatant): number {
    const distanceToA = Math.hypot(combatant.pos.x - this.bombSiteA.position.x, combatant.pos.z - this.bombSiteA.position.z);
    const distanceToB = Math.hypot(combatant.pos.x - this.bombSiteB.position.x, combatant.pos.z - this.bombSiteB.position.z);
    return Math.min(distanceToA, distanceToB);
  }

  public buyItem(
    playerId: string,
    itemId: string,
    type: 'BUY_WEAPON' | 'BUY_ARMOR' | 'BUY_GRENADE' | 'BUY_DEFUSE_KIT'
  ): boolean {
    // Only allowed during BUY_PHASE!
    if (this.roundState !== 'BUY_PHASE') return false;

    const combatant = this.combatants.get(playerId);
    if (!combatant || !combatant.isAlive) return false;

    const weapon = type === 'BUY_WEAPON' ? WEAPON_REGISTRY[itemId] : undefined;
    if (type === 'BUY_WEAPON' && !weapon) return false;
    if (type === 'BUY_ARMOR' && (itemId !== 'armor' || (combatant.armor >= 100 && combatant.hasHelmet))) {
      return false;
    }
    if (
      type === 'BUY_DEFUSE_KIT' &&
      (itemId !== 'defuse_kit' || combatant.team !== 'VANGUARD' || combatant.hasDefuseKit)
    ) {
      return false;
    }
    if (type === 'BUY_GRENADE') return false;
    const price = weapon?.price ?? (type === 'BUY_DEFUSE_KIT' ? 400 : 1000);

    // Check funds
    if (combatant.cash < price) return false;

    // Atomic transaction
    const txId = `tx_${this.roundNumber}_${playerId}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    if (this.processedTransactions.has(txId)) return false; // Duplicate protection
    this.processedTransactions.add(txId);

    combatant.cash -= price;

    if (type === 'BUY_WEAPON' && weapon) {
      combatant.weapon = weapon;
      combatant.currentMag = weapon.magSize;
      combatant.reserveAmmo = weapon.reserveAmmo;
    } else if (type === 'BUY_ARMOR') {
      combatant.armor = 100;
      combatant.hasHelmet = true;
    } else if (type === 'BUY_DEFUSE_KIT') {
      combatant.hasDefuseKit = true;
    }

    this.ledger.push({
      transactionId: txId,
      playerId,
      type,
      amount: -price,
      timestamp: Date.now(),
      resultingBalance: combatant.cash,
    });

    Sound.playUIBeep(true);
    return true;
  }

  public validateAndExecuteShot(
    shooterId: string,
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    spread: number
  ): { hit: boolean; isHeadshot: boolean; victimId?: string; damageDealt?: number } {
    // Shots remain enabled after the bomb is planted.
    if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') {
      return { hit: false, isHeadshot: false };
    }

    const shooter = this.combatants.get(shooterId);
    if (!shooter || !shooter.isAlive || shooter.currentMag <= 0) {
      return { hit: false, isHeadshot: false };
    }

    // Authoritative ammo consumption
    shooter.currentMag--;

    const shotDir = this.applyWeaponSpread(direction, spread);

    // Check line of sight with active smoke clouds
    const maxRange = shooter.weapon.rangeMeters;
    const endPoint = origin.clone().addScaledVector(shotDir, maxRange);

    if (this.particles.isLineBlockedBySmoke(origin, endPoint)) {
      // Bullet penetrating smoke has 75% reduced accuracy and chance to strike
      if (Math.random() < 0.7) {
        return { hit: false, isHeadshot: false };
      }
    }

    // Check environment wall collisions first
    const { closestWallDist, closestCollider, closestIntersection } = this.raycastWalls(origin, shotDir, maxRange);

    const isPenetrable = Boolean(closestCollider && (closestCollider.penetrationResistance ?? 0) > 0);
    const penResistance = isPenetrable ? (closestCollider!.penetrationResistance ?? 0.45) : 1.0;

    // Check combatants
    const { victim: closestVictim, hitDistance: closestDist, isHeadshot, isWallbang } = this.findHitscanVictim(
      shooter,
      origin,
      shotDir,
      closestWallDist,
      isPenetrable,
      maxRange
    );

    if (closestVictim) {
      const damageDealt = this.applyShotDamage(
        shooter,
        closestVictim,
        shotDir,
        origin,
        closestDist,
        isHeadshot,
        isWallbang,
        closestIntersection,
        closestCollider,
        penResistance
      );

      return { hit: true, isHeadshot, victimId: closestVictim.id, damageDealt };
    }

    // Hit environment only
    if (closestWallDist < Infinity && closestIntersection) {
      const hitPt = closestIntersection.point;
      const normal = closestIntersection.face ? closestIntersection.face.normal : new THREE.Vector3(0, 1, 0);
      this.particles.spawnSparks(hitPt, normal, 14);
    }

    return { hit: false, isHeadshot: false };
  }

  // Randomizes the shot direction within the weapon's current spread cone.
  private applyWeaponSpread(direction: THREE.Vector3, spread: number): THREE.Vector3 {
    const shotDir = direction.clone();
    shotDir.x += (Math.random() - 0.5) * spread;
    shotDir.y += (Math.random() - 0.5) * spread;
    shotDir.z += (Math.random() - 0.5) * spread;
    shotDir.normalize();
    return shotDir;
  }

  // Raycasts the shot against level geometry and resolves which CollidableBox,
  // if any, was the closest thing hit (used for wallbang penetration math).
  private raycastWalls(
    origin: THREE.Vector3,
    shotDir: THREE.Vector3,
    maxRange: number
  ): { closestWallDist: number; closestCollider: CollidableBox | null; closestIntersection: THREE.Intersection | null } {
    this.wallRaycaster.set(origin, shotDir);
    this.wallRaycaster.near = 0.1;
    this.wallRaycaster.far = maxRange;
    const colliderMeshesChanged =
      this.cachedColliderMeshes.length !== this.colliders.length ||
      this.colliders.some((collider, index) => collider.mesh !== this.cachedColliderMeshes[index]);
    if (colliderMeshesChanged) {
      this.cachedColliderMeshes = this.colliders.map((collider) => collider.mesh);
      this.wallMeshes = this.cachedColliderMeshes.filter((mesh): mesh is THREE.Object3D => Boolean(mesh));
    }
    this.wallIntersections.length = 0;
    const wallIntersects = this.wallRaycaster.intersectObjects(this.wallMeshes, true, this.wallIntersections);

    let closestWallDist = Infinity;
    let closestCollider: CollidableBox | null = null;
    let closestIntersection: THREE.Intersection | null = null;

    if (wallIntersects.length > 0) {
      closestIntersection = wallIntersects[0];
      closestWallDist = closestIntersection.distance;
      for (const col of this.colliders) {
        if (col.mesh === closestIntersection.object || (col.mesh && col.mesh.children.includes(closestIntersection.object))) {
          closestCollider = col;
          break;
        }
      }
    }

    return { closestWallDist, closestCollider, closestIntersection };
  }

  // Tests the shot against every enemy combatant's head/body hitboxes and
  // returns the nearest one actually struck (if any), honoring wallbangs.
  private findHitscanVictim(
    shooter: Combatant,
    origin: THREE.Vector3,
    shotDir: THREE.Vector3,
    closestWallDist: number,
    isPenetrable: boolean,
    maxRange: number
  ): { victim: Combatant | null; hitDistance: number; isHeadshot: boolean; isWallbang: boolean } {
    let closestVictim: Combatant | null = null;
    let closestDist = isPenetrable ? maxRange : closestWallDist;
    let isHeadshot = false;
    let isWallbang = false;

    this.combatants.forEach((target) => {
      if (target.id === shooter.id || !target.isAlive || target.team === shooter.team) return;

      // Test head
      const headHitDistance = this.getRaySphereHitDistance(
        origin,
        shotDir,
        target.pos.x,
        target.pos.y + 1.6,
        target.pos.z,
        0.24,
        closestDist
      );
      if (headHitDistance !== null) {
        closestVictim = target;
        closestDist = headHitDistance;
        isHeadshot = true;
        isWallbang = headHitDistance > closestWallDist;
        return;
      }

      // Test body
      const bodyHitDistance = this.getRaySphereHitDistance(
        origin,
        shotDir,
        target.pos.x,
        target.pos.y + 0.9,
        target.pos.z,
        0.45,
        closestDist
      );
      if (bodyHitDistance !== null) {
        closestVictim = target;
        closestDist = bodyHitDistance;
        isHeadshot = false;
        isWallbang = bodyHitDistance > closestWallDist;
      }
    });

    return { victim: closestVictim, hitDistance: closestDist, isHeadshot, isWallbang };
  }

  private getRaySphereHitDistance(
    origin: THREE.Vector3,
    direction: THREE.Vector3,
    centerX: number,
    centerY: number,
    centerZ: number,
    radius: number,
    maxDistance: number
  ): number | null {
    const offsetX = centerX - origin.x;
    const offsetY = centerY - origin.y;
    const offsetZ = centerZ - origin.z;
    const distance = offsetX * direction.x + offsetY * direction.y + offsetZ * direction.z;
    if (distance <= 0 || distance >= maxDistance) return null;

    const closestX = origin.x + direction.x * distance - centerX;
    const closestY = origin.y + direction.y * distance - centerY;
    const closestZ = origin.z + direction.z * distance - centerZ;
    return closestX * closestX + closestY * closestY + closestZ * closestZ < radius * radius ? distance : null;
  }

  // Applies damage (headshot multiplier, wallbang attenuation, armor
  // absorption), fires hit-feedback callbacks/sound/particles, and routes
  // into resolveKill() if the victim's HP reaches zero. Returns the final
  // raw damage number dealt, after all reductions.
  private applyShotDamage(
    shooter: Combatant,
    victim: Combatant,
    shotDir: THREE.Vector3,
    origin: THREE.Vector3,
    hitDistance: number,
    isHeadshot: boolean,
    isWallbang: boolean,
    closestIntersection: THREE.Intersection | null,
    closestCollider: CollidableBox | null,
    penResistance: number
  ): number {
    let rawDmg = shooter.weapon.damage;
    if (isHeadshot) {
      rawDmg *= shooter.weapon.headshotMultiplier;
    }

    // Wallbang penetration damage attenuation
    if (isWallbang && closestIntersection && closestCollider) {
      rawDmg *= 1.0 - penResistance;
      Sound.playWallbang();
      const wallNorm = closestIntersection.face ? closestIntersection.face.normal : new THREE.Vector3(0, 1, 0);
      this.particles.wallbangImpact(closestIntersection.point, wallNorm, closestCollider.materialType ?? 'wood');
    }

    // Armor absorption
    if (victim.armor > 0) {
      const absorbed = rawDmg * 0.35;
      victim.armor = Math.max(0, victim.armor - absorbed);
      rawDmg = rawDmg * 0.65;
    }

    victim.hp = Math.max(0, victim.hp - rawDmg);
    shooter.damageDealt += rawDmg;
    if (!victim.isPlayer) {
      const threatPosition = new THREE.Vector3(shooter.pos.x, shooter.pos.y, shooter.pos.z);
      this.botThreats.set(victim.id, {
        remaining: 3.5,
        coverPosition: this.findCoverPosition(victim, threatPosition),
      });
    }

    // Particle blood
    const hitPt = origin.clone().addScaledVector(shotDir, hitDistance);
    this.particles.spawnBlood(hitPt, shotDir, isHeadshot ? 35 : 20);

    // Hit confirmation
    if (shooter.isPlayer && this.onHitConfirmed) {
      this.onHitConfirmed(isHeadshot, Math.round(rawDmg));
      Sound.playHitmarker(isHeadshot);
    }

    // Player feedback if player was damaged
    if (victim.isPlayer && this.onPlayerDamaged) {
      this.onPlayerDamaged(victim.hp, new THREE.Vector3(shooter.pos.x, shooter.pos.y, shooter.pos.z));
    }

    // Check death
    if (victim.hp <= 0) {
      this.resolveKill(shooter, victim, shotDir, isHeadshot);
    }

    return rawDmg;
  }

  // Handles everything that happens the instant a combatant is eliminated:
  // streak bookkeeping, killstreak milestone callouts, ragdoll impulse,
  // cash reward, killfeed entry, death-pose mesh animation, round-end check.
  private resolveKill(
    shooter: Combatant,
    victim: Combatant,
    shotDir: THREE.Vector3,
    isHeadshot: boolean,
    weaponName: string = shooter.weapon.name,
    killReward: number = shooter.weapon.killReward,
    impactForce: number = shooter.weapon.category === 'shotgun'
      ? 9.5
      : shooter.weapon.category === 'sniper'
        ? 8.0
        : 4.5
  ): void {
    victim.isAlive = false;
    victim.deaths++;
    victim.currentStreak = 0; // reset victim streak
    this.usedKillstreaks.delete(victim.id);
    shooter.kills++;
    shooter.currentStreak++;

    // Killstreak Milestones check
    if (shooter.currentStreak === 3) {
      if (this.onKillstreakAwarded) this.onKillstreakAwarded('UAV');
      this.triggerCallout(shooter, 'uav_online', `${shooter.name}: UAV gotowe do użycia!`);
    } else if (shooter.currentStreak === 5) {
      if (this.onKillstreakAwarded) this.onKillstreakAwarded('AIRSTRIKE');
      this.triggerCallout(shooter, 'airstrike_incoming', `${shooter.name}: Nalot taktyczny gotowy!`);
    } else if (shooter.currentStreak === 7) {
      if (this.onKillstreakAwarded) this.onKillstreakAwarded('PREDATOR');
      this.triggerCallout(shooter, 'uav_online', `${shooter.name}: Pocisk Predator uzbrojony!`);
    }

    // Ragdoll knockback impulse
    victim.deathImpulse = {
      x: shotDir.x * impactForce,
      y: 2.2,
      z: shotDir.z * impactForce,
    };

    // Add kill reward
    shooter.cash += killReward;

    const kfEntry: KillfeedEntry = {
      id: `kf_${Date.now()}_${Math.random()}`,
      killerName: shooter.name,
      killerTeam: shooter.team,
      victimName: victim.name,
      victimTeam: victim.team,
      weaponName,
      isHeadshot,
      timestamp: Date.now(),
    };
    this.killfeed.unshift(kfEntry);
    if (this.killfeed.length > 6) this.killfeed.pop();
    if (this.onKillfeed) this.onKillfeed(kfEntry);

    // Animate dead bot mesh
    const bMesh = this.botMeshes.get(victim.id);
    if (bMesh) {
      bMesh.rotation.x = -Math.PI / 2;
      bMesh.position.y = 0.2;
    }

    this.checkRoundEndConditions();
  }

  public throwGrenade(
    ownerId: string,
    type: 'frag' | 'smoke' | 'flashbang',
    origin: THREE.Vector3,
    direction: THREE.Vector3
  ) {
    if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') return;

    const owner = this.combatants.get(ownerId);
    if (!owner || !owner.isAlive) return;

    if (type === 'frag') {
      if (owner.fragGrenades <= 0) return;
      owner.fragGrenades--;
      this.triggerCallout(owner, 'grenade', `${owner.name}: Granat odłamkowy w drodze!`);
    } else if (type === 'smoke') {
      if (owner.smokeGrenades <= 0) return;
      owner.smokeGrenades--;
    } else if (type === 'flashbang') {
      if (owner.flashbangs <= 0) return;
      owner.flashbangs--;
      this.triggerCallout(owner, 'flashbang', `${owner.name}: Rzucam granat błyskowy!`);
    }

    // Build 3D grenade mesh
    const geo = new THREE.SphereGeometry(0.12, 12, 12);
    const color = type === 'frag' ? 0x224422 : (type === 'flashbang' ? 0xcccccc : 0x446688);
    const mat = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.3,
      metalness: 0.8,
    });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.copy(origin);
    mesh.castShadow = true;
    this.scene.add(mesh);

    const throwVel = direction.clone().multiplyScalar(22);
    throwVel.y += 4.5; // Arc trajectory

    this.activeGrenades.push({
      id: `grenade_${Date.now()}_${Math.random()}`,
      type,
      ownerId,
      ownerTeam: owner.team,
      mesh,
      pos: origin.clone(),
      vel: throwVel,
      fuseSec: type === 'frag' ? 3.0 : (type === 'flashbang' ? 1.6 : 2.5),
    });
  }

  public plantClaymore(ownerId: string, pos: THREE.Vector3, yaw: number): boolean {
    if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') return false;
    const owner = this.combatants.get(ownerId);
    if (!owner || !owner.isAlive || owner.claymores <= 0) return false;
    owner.claymores--;

    // Build 3D Claymore mine
    const group = new THREE.Group();
    const greenMat = new THREE.MeshStandardMaterial({ color: 0x3b5323, roughness: 0.6, metalness: 0.1 });
    const blackMat = Materials.get('weapon_matte_black');

    // Curved front face case
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.2, 0.09), greenMat);
    body.position.set(0, 0.15, 0);
    body.castShadow = true;
    group.add(body);

    // Front sensor lenses
    const lensL = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    lensL.rotation.x = Math.PI / 2;
    lensL.position.set(-0.08, 0.18, 0.05);
    group.add(lensL);
    const lensR = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.03, 8), new THREE.MeshBasicMaterial({ color: 0xff0000 }));
    lensR.rotation.x = Math.PI / 2;
    lensR.position.set(0.08, 0.18, 0.05);
    group.add(lensR);

    // Wire tripod scissor legs
    const legL = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6), blackMat);
    legL.position.set(-0.12, 0.07, 0);
    legL.rotation.z = 0.25;
    group.add(legL);
    const legR = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 0.01, 0.22, 6), blackMat);
    legR.position.set(0.12, 0.07, 0);
    legR.rotation.z = -0.25;
    group.add(legR);

    // Laser tripwire visual indicators
    const tripGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-0.08, 0.18, 0.06),
      new THREE.Vector3(-0.6, 0.05, 2.5),
      new THREE.Vector3(0.08, 0.18, 0.06),
      new THREE.Vector3(0.6, 0.05, 2.5),
    ]);
    const tripLines = new THREE.LineSegments(
      tripGeo,
      new THREE.LineBasicMaterial({ color: 0xff2222, transparent: true, opacity: 0.55 })
    );
    group.add(tripLines);

    group.position.copy(pos);
    group.rotation.y = yaw;
    this.scene.add(group);

    Sound.playClaymoreArm();
    this.activeClaymores.push({
      mine: {
        id: `claymore_${Date.now()}_${Math.random()}`,
        ownerId,
        ownerTeam: owner.team,
        pos: { x: pos.x, y: pos.y, z: pos.z },
        yaw,
        isArmed: false,
        armedAt: Date.now() + 1500, // Arms in 1.5s
      },
      mesh: group,
    });

    this.triggerCallout(owner, 'grenade', `${owner.name}: Mina Claymore rozstawiona!`);
    return true;
  }

  private updateClaymores(): void {
    for (let i = this.activeClaymores.length - 1; i >= 0; i--) {
      const { mine, mesh } = this.activeClaymores[i];
      if (!mine.isArmed) {
        mine.isArmed = Date.now() >= mine.armedAt;
        continue;
      }

      const owner = this.combatants.get(mine.ownerId);
      if (!owner) {
        this.disposeAndRemove(mesh);
        this.activeClaymores.splice(i, 1);
        continue;
      }

      const forwardX = Math.sin(mine.yaw);
      const forwardZ = Math.cos(mine.yaw);
      let triggered = false;
      for (const combatant of this.combatants.values()) {
        if (!combatant.isAlive || combatant.team === mine.ownerTeam) continue;
        const dx = combatant.pos.x - mine.pos.x;
        const dz = combatant.pos.z - mine.pos.z;
        const distance = Math.hypot(dx, dz);
        if (
          distance <= 8 &&
          distance > 0 &&
          (dx * forwardX + dz * forwardZ) / distance >= 0.5
        ) {
          triggered = true;
          break;
        }
      }
      if (!triggered) continue;

      this.disposeAndRemove(mesh);
      this.activeClaymores.splice(i, 1);
      const blastPosition = new THREE.Vector3(mine.pos.x, mine.pos.y + 0.4, mine.pos.z);
      this.particles.spawnExplosion(blastPosition);
      Sound.playExplosion(blastPosition, this.playerRef?.pos);

      const blastRadius = 6;
      for (const victim of this.combatants.values()) {
        if (!victim.isAlive) continue;
        const dx = victim.pos.x - mine.pos.x;
        const dz = victim.pos.z - mine.pos.z;
        const distance = Math.hypot(dx, dz);
        if (distance >= blastRadius) continue;

        let damage = 120 * (1 - distance / blastRadius);
        if (victim.armor > 0) {
          const absorbed = damage * 0.35;
          victim.armor = Math.max(0, victim.armor - absorbed);
          damage *= 0.65;
        }
        victim.hp = Math.max(0, victim.hp - damage);
        owner.damageDealt += damage;

        if (victim.isPlayer && this.onPlayerDamaged) {
          this.onPlayerDamaged(victim.hp, new THREE.Vector3(mine.pos.x, mine.pos.y, mine.pos.z));
        }
        if (victim.hp <= 0) {
          const direction = new THREE.Vector3(dx, 0, dz);
          if (direction.lengthSq() === 0) direction.set(-forwardX, 0, -forwardZ);
          direction.normalize();
          this.resolveKill(owner, victim, direction, false, 'Claymore', 300, 2.5);
        }
      }
      this.checkRoundEndConditions();
    }
  }

  private updateAirStrikes(): void {
    const now = Date.now();
    for (let i = this.activeAirStrikes.length - 1; i >= 0; i--) {
      const strike = this.activeAirStrikes[i];
      const impactAt = 1200 + strike.strikesCompleted * 450;
      if (now - strike.startTime < impactAt) continue;

      const offset = (strike.strikesCompleted - (strike.totalStrikes - 1) / 2) * 4;
      const impactPosition = new THREE.Vector3(
        strike.targetPos.x + offset,
        0.4,
        strike.targetPos.z
      );
      this.particles.spawnExplosion(impactPosition);
      Sound.playExplosion(impactPosition, this.playerRef?.pos);

      const owner = this.combatants.get(strike.ownerId);
      const blastRadius = 7.5;
      for (const victim of this.combatants.values()) {
        if (!victim.isAlive || victim.team === strike.ownerTeam) continue;
        const distance = Math.hypot(victim.pos.x - impactPosition.x, victim.pos.z - impactPosition.z);
        if (distance >= blastRadius) continue;

        let damage = 120 * (1 - distance / blastRadius);
        if (victim.armor > 0) {
          const absorbed = damage * 0.35;
          victim.armor = Math.max(0, victim.armor - absorbed);
          damage *= 0.65;
        }
        victim.hp = Math.max(0, victim.hp - damage);
        if (owner) owner.damageDealt += damage;
        if (victim.isPlayer && this.onPlayerDamaged && owner) {
          this.onPlayerDamaged(victim.hp, new THREE.Vector3(owner.pos.x, owner.pos.y, owner.pos.z));
        }
        if (victim.hp <= 0) {
          if (owner) {
            const direction = new THREE.Vector3(
              victim.pos.x - impactPosition.x,
              0,
              victim.pos.z - impactPosition.z
            );
            if (direction.lengthSq() === 0) direction.set(0, 0, 1);
            direction.normalize();
            this.resolveKill(owner, victim, direction, false, 'Airstrike', 300, 3.5);
          } else {
            victim.isAlive = false;
            victim.deaths++;
            this.checkRoundEndConditions();
          }
        }
      }

      strike.strikesCompleted++;
      if (strike.strikesCompleted >= strike.totalStrikes) {
        this.activeAirStrikes.splice(i, 1);
      }
    }
  }

  private applyFlashbang(pos: THREE.Vector3): void {
    const now = Date.now();
    const maxDistance = 24;
    for (const combatant of this.combatants.values()) {
      if (!combatant.isAlive) continue;
      const target = new THREE.Vector3(combatant.pos.x, combatant.pos.y + 1.5, combatant.pos.z);
      const distance = pos.distanceTo(target);
      if (distance >= maxDistance || !this.hasLineOfSight(pos, target)) continue;

      const directionToFlash = new THREE.Vector3(pos.x - combatant.pos.x, 0, pos.z - combatant.pos.z);
      if (directionToFlash.lengthSq() === 0) continue;
      directionToFlash.normalize();
      const facingDot =
        directionToFlash.x * -Math.sin(combatant.yaw) +
        directionToFlash.z * -Math.cos(combatant.yaw);
      const facingFactor = THREE.MathUtils.clamp((facingDot + 0.25) / 1.25, 0.15, 1);
      const durationMs = (1 - distance / maxDistance) * facingFactor * 3000;
      combatant.isFlashedUntil = Math.max(combatant.isFlashedUntil, now + durationMs);
    }
  }

  public activateKillstreak(
    combatantId: string,
    type: KillstreakType,
    targetPos?: { x: number; z: number }
  ): boolean {
    if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') return false;
    const c = this.combatants.get(combatantId);
    if (!c || !this.canActivateKillstreak(combatantId, type)) return false;

    if (type === 'UAV') {
      this.markKillstreakUsed(combatantId, type);
      this.uavActiveUntil = Date.now() + 25000;
      Sound.playUAVScan();
      this.triggerCallout(c, 'uav_online', `${c.name}: Zwiad satelitarny UAV aktywny!`);
      return true;
    } else if (type === 'AIRSTRIKE') {
      this.markKillstreakUsed(combatantId, type);
      const tX = targetPos ? targetPos.x : (c.team === 'VANGUARD' ? 0 : 0);
      const tZ = targetPos ? targetPos.z : (c.team === 'VANGUARD' ? -15 : 15);
      this.activeAirStrikes.push({
        id: `strike_${Date.now()}`,
        ownerId: c.id,
        targetPos: { x: tX, z: tZ },
        ownerTeam: c.team,
        startTime: Date.now(),
        strikesCompleted: 0,
        totalStrikes: 3,
      });
      Sound.playAirstrikeJet();
      this.triggerCallout(c, 'airstrike_incoming', `${c.name}: Nalot taktyczny wezwany na sektor!`);
      return true;
    } else if (type === 'PREDATOR') {
      this.markKillstreakUsed(combatantId, type);
      Sound.playPredatorRocket();
      const enemyTeam = c.team === 'VANGUARD' ? 'SYNDICATE' : 'VANGUARD';
      const enemies = Array.from(this.combatants.values()).filter((e) => e.isAlive && e.team === enemyTeam);
      const target = enemies[0];
      const strikePos = target ? new THREE.Vector3(target.pos.x, 0, target.pos.z) : new THREE.Vector3(0, 0, 0);

      this.scheduleCombatTimeout(() => {
        this.particles.spawnExplosion(strikePos);
        Sound.playExplosion(strikePos, this.playerRef?.pos);
        this.combatants.forEach((victim) => {
          if (!victim.isAlive || victim.team === c.team) return;
          const dist = Math.hypot(victim.pos.x - strikePos.x, victim.pos.z - strikePos.z);
          if (dist < 14) {
            c.damageDealt += victim.hp;
            victim.hp = 0;
            const direction = new THREE.Vector3(
              victim.pos.x - strikePos.x,
              0,
              victim.pos.z - strikePos.z
            );
            if (direction.lengthSq() === 0) direction.set(0, 0, 1);
            direction.normalize();
            this.resolveKill(c, victim, direction, false, 'Predator', 300, 5);
          }
        });
        this.checkRoundEndConditions();
      }, 1200);

      this.triggerCallout(c, 'uav_online', `${c.name}: Pocisk Predator uderza w cel!`);
      return true;
    }

    return false;
  }

  public canActivateKillstreak(combatantId: string, type: KillstreakType): boolean {
    const combatant = this.combatants.get(combatantId);
    if (
      !combatant?.isAlive ||
      (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED')
    ) {
      return false;
    }
    const requiredStreak = type === 'UAV' ? 3 : type === 'AIRSTRIKE' ? 5 : 7;
    return (
      combatant.currentStreak >= requiredStreak &&
      !this.usedKillstreaks.get(combatantId)?.has(type)
    );
  }

  private markKillstreakUsed(combatantId: string, type: KillstreakType): void {
    let used = this.usedKillstreaks.get(combatantId);
    if (!used) {
      used = new Set<KillstreakType>();
      this.usedKillstreaks.set(combatantId, used);
    }
    used.add(type);
  }

  public triggerCallout(
    speaker: Combatant,
    type: 'grenade' | 'flashbang' | 'reloading' | 'enemy_spotted' | 'bomb_planted' | 'bomb_defused' | 'uav_online' | 'airstrike_incoming',
    text: string
  ) {
    const callout: RadioCallout = {
      id: `callout_${Date.now()}_${Math.random()}`,
      speakerName: speaker.name,
      team: speaker.team,
      type,
      text,
      timestamp: Date.now(),
    };
    this.radioCallouts.unshift(callout);
    if (this.radioCallouts.length > 5) this.radioCallouts.pop();
    Sound.playRadioCallout(type);
    if (this.onRadioCallout) this.onRadioCallout(callout);
  }

  public checkRoundEndConditions(): boolean {
    if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') return false;

    let vgAlive = 0;
    let syAlive = 0;

    this.combatants.forEach((c) => {
      if (c.isAlive) {
        if (c.team === 'VANGUARD') vgAlive++;
        else syAlive++;
      }
    });

    if (this.roundState === 'BOMB_PLANTED') {
      // If bomb is planted, eliminating Syndicate is NOT enough - Vanguard MUST defuse before 40s!
      if (vgAlive === 0) {
        this.endRound('SYNDICATE', 'VANGUARD ELIMINATED — BOMB IS ACTIVE');
        return true;
      }
      return false;
    }

    if (syAlive === 0) {
      this.endRound('VANGUARD', 'SYNDICATE ELIMINATED');
      return true;
    } else if (vgAlive === 0) {
      this.endRound('SYNDICATE', 'VANGUARD ELIMINATED');
      return true;
    }

    return false;
  }

  public endRound(winner: Team, reason: string) {
    if (this.roundState !== 'LIVE_COMBAT' && this.roundState !== 'BOMB_PLANTED') return;

    this.clearRoundTacticalEffects();
    this.roundState = 'ROUND_END';
    this.roundWinner = winner;
    this.roundEndReason = reason;

    if (winner === 'VANGUARD') {
      this.scoreVanguard++;
      this.consecutiveLossesVanguard = 0;
      this.consecutiveLossesSyndicate++;
      Sound.playRoundWon();
    } else {
      this.scoreSyndicate++;
      this.consecutiveLossesSyndicate = 0;
      this.consecutiveLossesVanguard++;
      Sound.playRoundLost();
    }

    if (this.onScoreChange) this.onScoreChange(this.scoreVanguard, this.scoreSyndicate);
    if (this.onStateChange) this.onStateChange(this.roundState);

    // Pick MVP based on kills & damage this round
    let highestMvpScore = -1;
    this.combatants.forEach((c) => {
      if (c.team === winner) {
        const score = c.kills * 100 + c.damageDealt;
        if (score > highestMvpScore) {
          highestMvpScore = score;
          this.mvpCombatant = c;
        }
      }
    });
    if (this.mvpCombatant) {
      this.mvpCombatant.mvpStars++;
    }

    // Process Idempotent Rewards after a short delay
    this.scheduleTimeout(() => {
      this.processRoundRewards(winner);
    }, 2000);
  }

  private processRoundRewards(winner: Team) {
    if (this.processedRoundRewards.has(this.roundNumber)) {
      return; // Already rewarded!
    }
    this.processedRoundRewards.add(this.roundNumber);
    this.roundState = 'REWARDS';

    const winBonus = 3250;
    const baseLoss = 1400;

    this.combatants.forEach((c) => {
      let reward = 0;
      let txType: 'ROUND_WIN' | 'ROUND_LOSS' = 'ROUND_LOSS';

      if (c.team === winner) {
        reward = winBonus;
        txType = 'ROUND_WIN';
      } else {
        const lossStreak = c.team === 'VANGUARD' ? this.consecutiveLossesVanguard : this.consecutiveLossesSyndicate;
        reward = Math.min(3400, baseLoss + (lossStreak - 1) * 500);
      }

      c.cash = Math.min(16000, c.cash + reward);

      this.ledger.push({
        transactionId: `reward_r${this.roundNumber}_${c.id}`,
        playerId: c.id,
        type: txType,
        amount: reward,
        timestamp: Date.now(),
        resultingBalance: c.cash,
      });
    });

    if (this.onStateChange) this.onStateChange(this.roundState);

    // Check Match End
    if (this.scoreVanguard >= this.maxRoundsToWin || this.scoreSyndicate >= this.maxRoundsToWin) {
      this.scheduleTimeout(() => {
        this.roundState = 'MATCH_END';
        if (this.onStateChange) this.onStateChange(this.roundState);
      }, 4000);
    } else {
      // Transition to next round after 5s
      this.scheduleTimeout(() => {
        this.roundNumber++;
        this.startRound(this.vanguardSpawns, this.syndicateSpawns);
      }, 5000);
    }
  }

  private clearRoundTacticalEffects(): void {
    this.clearCombatTimeouts();
    this.activeAirStrikes = [];
    for (const grenade of this.activeGrenades) this.disposeAndRemove(grenade.mesh);
    this.activeGrenades = [];
    for (const { mesh } of this.activeClaymores) this.disposeAndRemove(mesh);
    this.activeClaymores = [];
    this.particles.clearSmoke();
  }

  public update(dt: number) {
    if (this.isPaused) return;
    this.elapsedMatchTime += dt;

    // 1. Round Timer Countdown
    if (this.roundState === 'BUY_PHASE') {
      this.roundTimer -= dt;
      if (this.roundTimer <= 0) {
        this.roundState = 'EQUIPMENT_LOCK';
        this.roundTimer = 2.0; // 2s lock
        if (this.onStateChange) this.onStateChange(this.roundState);
      }
    } else if (this.roundState === 'EQUIPMENT_LOCK') {
      this.roundTimer -= dt;
      if (this.roundTimer <= 0) {
        this.roundState = 'LIVE_COMBAT';
        this.roundTimer = this.roundTimeLimit;
        if (this.onStateChange) this.onStateChange(this.roundState);
      }
    } else if (this.roundState === 'LIVE_COMBAT') {
      this.roundTimer -= dt;

      // Handle AI bot bomb planting attempt if Syndicate near bombsite
      if (this.plantingCombatantId) {
        const planter = this.combatants.get(this.plantingCombatantId);
        const site: 'A' | 'B' | null = planter
          ? Math.hypot(planter.pos.x - this.bombSiteA.position.x, planter.pos.z - this.bombSiteA.position.z) <=
              this.bombSiteA.radius
            ? 'A'
            : Math.hypot(planter.pos.x - this.bombSiteB.position.x, planter.pos.z - this.bombSiteB.position.z) <=
                this.bombSiteB.radius
              ? 'B'
              : null
          : null;
        if (!planter?.isAlive || !site) {
          this.cancelPlanting();
        } else {
          this.plantProgress += dt / 3.5;
          if (this.plantProgress >= 1.0) {
            this.plantBomb(planter.id, site, new THREE.Vector3(planter.pos.x, 0, planter.pos.z));
          }
        }
      }

      if (this.roundTimer <= 0) {
        // Time expired without plant! Defenders (Vanguard) win!
        this.endRound('VANGUARD', 'ROUND TIME EXPIRED - DEFENDERS WIN');
      }
    } else if (this.roundState === 'BOMB_PLANTED' && this.plantedBomb) {
      this.plantedBomb.timerSec -= dt;
      this.roundTimer = Math.max(0, this.plantedBomb.timerSec);

      // Accelerating beep
      const beepInterval =
        this.plantedBomb.timerSec > 20 ? 1.0 : this.plantedBomb.timerSec > 10 ? 0.5 : this.plantedBomb.timerSec > 4 ? 0.25 : 0.12;
      this.bombBeepTimer += dt;
      if (this.bombBeepTimer >= beepInterval) {
        this.bombBeepTimer = 0;
        Sound.playBombBeep(this.plantedBomb.timerSec < 10);
      }

      // Handle Defusing
      if (this.defusingCombatantId) {
        const defuser = this.combatants.get(this.defusingCombatantId);
        if (!defuser || !defuser.isAlive || !this.isInDefuseRange(defuser)) {
          this.cancelDefusing();
        } else {
          this.defuseProgress += dt / (defuser.hasDefuseKit ? 5 : 10);
          this.plantedBomb.defuseProgress = this.defuseProgress;
          if (Math.random() < 0.15) Sound.playDefuseWireSnip();

          if (this.defuseProgress >= 1.0) {
            this.plantedBomb.isDefused = true;
            Sound.playBombDefused();
            if (this.onBombDefused) this.onBombDefused();
            this.endRound('VANGUARD', 'BOMBA ROZBROJONA — VANGUARD WYGRYWA!');
          }
        }
      }

      // Handle Bomb Detonation
      if (this.plantedBomb.timerSec <= 0 && !this.plantedBomb.isDefused) {
        this.plantedBomb.isExploded = true;
        const bPos = new THREE.Vector3(this.plantedBomb.position.x, 0.4, this.plantedBomb.position.z);
        this.particles.spawnExplosion(bPos);
        Sound.playExplosion(bPos, this.playerRef?.pos);

        // Blast radius elimination
        this.combatants.forEach((c) => {
          if (!c.isAlive) return;
          const dist = Math.hypot(c.pos.x - bPos.x, c.pos.z - bPos.z);
          if (dist < 35) {
            c.hp = 0;
            c.isAlive = false;
            c.deaths++;
          }
        });

        this.endRound('SYNDICATE', 'BOMBA ZDETONOWANA — SYNDICATE WYGRYWA!');
      }
    }

    // 2. Grenade Physics & Explosion
    for (let i = this.activeGrenades.length - 1; i >= 0; i--) {
      const g = this.activeGrenades[i];
      g.fuseSec -= dt;

      g.vel.y -= 18 * dt; // Gravity
      g.pos.x += g.vel.x * dt;
      g.pos.y += g.vel.y * dt;
      g.pos.z += g.vel.z * dt;

      // Floor bounce
      if (g.pos.y < 0.1) {
        g.pos.y = 0.1;
        g.vel.y = -g.vel.y * 0.45;
        g.vel.x *= 0.7;
        g.vel.z *= 0.7;
      }

      g.mesh.position.copy(g.pos);

      if (g.fuseSec <= 0) {
        // Detonate!
        this.disposeAndRemove(g.mesh);
        this.activeGrenades.splice(i, 1);

        if (g.type === 'frag') {
          this.particles.spawnExplosion(g.pos);
          Sound.playExplosion({ x: g.pos.x, y: g.pos.y, z: g.pos.z }, this.playerRef?.pos);
          const owner = this.combatants.get(g.ownerId);

          // Damage radius 8.5m
          const blastRadius = 8.5;
          this.combatants.forEach((c) => {
            if (!c.isAlive) return;
            const distance = Math.hypot(c.pos.x - g.pos.x, c.pos.y - g.pos.y, c.pos.z - g.pos.z);
            if (distance >= blastRadius) return;

            let damage = 95 * (1 - distance / blastRadius);
            if (c.armor > 0) {
              const absorbed = damage * 0.35;
              c.armor = Math.max(0, c.armor - absorbed);
              damage *= 0.65;
            }
            c.hp = Math.max(0, c.hp - damage);
            if (owner) owner.damageDealt += damage;

            if (c.isPlayer && this.onPlayerDamaged && owner) {
              this.onPlayerDamaged(c.hp, new THREE.Vector3(owner.pos.x, owner.pos.y, owner.pos.z));
            }
            if (c.hp <= 0) {
              if (owner) {
                const direction = new THREE.Vector3(c.pos.x - g.pos.x, 0, c.pos.z - g.pos.z);
                if (direction.lengthSq() === 0) direction.set(0, 0, 1);
                direction.normalize();
                this.resolveKill(owner, c, direction, false, 'Frag Grenade', 300, 2.5);
              } else {
                c.isAlive = false;
                c.deaths++;
                this.checkRoundEndConditions();
              }
            }
          });
        } else {
          if (g.type === 'flashbang') {
            this.particles.flashbangBurst(g.pos);
            Sound.playFlashbangDetonate();
            this.applyFlashbang(g.pos);
            continue;
          }

          this.particles.spawnSmokeGrenade(g.pos, 18);
          Sound.playSmokeHiss();
        }
      }
    }

    if (this.roundState === 'LIVE_COMBAT' || this.roundState === 'BOMB_PLANTED') {
      this.updateAirStrikes();
      this.updateClaymores();
    }

    // 3. AI Bot Behavior Simulation (at 60Hz tick)
    if (this.roundState === 'LIVE_COMBAT' || this.roundState === 'BOMB_PLANTED') {
      this.updateBotsAI(dt);
    }
  }

  // Pushes a bot out of any overlapping wall/cover collider, mirroring
  // PlayerController.resolveCollisions so bots stop walking through geometry.
  private resolveBotCollision(pos: { x: number; y: number; z: number }) {
    const halfWidth = 0.45;
    const bodyMin = 0.1;
    const bodyMax = 2.2;
    for (const c of this.colliders) {
      if (
        pos.x + halfWidth > c.min.x &&
        pos.x - halfWidth < c.max.x &&
        pos.z + halfWidth > c.min.z &&
        pos.z - halfWidth < c.max.z &&
        bodyMax > c.min.y &&
        bodyMin < c.max.y
      ) {
        const dx1 = Math.abs(pos.x + halfWidth - c.min.x);
        const dx2 = Math.abs(pos.x - halfWidth - c.max.x);
        const dz1 = Math.abs(pos.z + halfWidth - c.min.z);
        const dz2 = Math.abs(pos.z - halfWidth - c.max.z);

        const minOverlap = Math.min(dx1, dx2, dz1, dz2);
        if (minOverlap === dx1) pos.x = c.min.x - halfWidth;
        else if (minOverlap === dx2) pos.x = c.max.x + halfWidth;
        else if (minOverlap === dz1) pos.z = c.min.z - halfWidth;
        else if (minOverlap === dz2) pos.z = c.max.z + halfWidth;
      }
    }
  }

  private updateBotsAI(dt: number) {
    const vanguard = this.aliveVanguardScratch;
    const syndicate = this.aliveSyndicateScratch;
    const bots = this.botScratch;
    vanguard.length = 0;
    syndicate.length = 0;
    bots.length = 0;
    for (const combatant of this.combatants.values()) {
      if (!combatant.isAlive) continue;
      if (combatant.team === 'VANGUARD') vanguard.push(combatant);
      else syndicate.push(combatant);
      if (!combatant.isPlayer) bots.push(combatant);
    }

    if (!syndicate.some((combatant) => combatant.id === this.roundPlanterId && !combatant.isPlayer)) {
      let nearestPlanter: Combatant | null = null;
      let nearestPlanterDistance = Infinity;
      for (const combatant of syndicate) {
        if (combatant.isPlayer) continue;
        const distance = this.distanceToNearestBombSite(combatant);
        if (distance < nearestPlanterDistance) {
          nearestPlanter = combatant;
          nearestPlanterDistance = distance;
        }
      }
      this.roundPlanterId = nearestPlanter?.id ?? null;
    }
    const planterId =
      this.plantingCombatantId ??
      (this.roundState === 'LIVE_COMBAT' && !this.plantedBomb ? this.roundPlanterId : null);
    const targetAssignments = this.targetAssignmentsScratch;
    targetAssignments.clear();
    let defuserId = this.defusingCombatantId;
    if (
      this.roundState === 'BOMB_PLANTED' &&
      this.plantedBomb &&
      (!defuserId || !this.combatants.get(defuserId)?.isAlive)
    ) {
      let nearestDefuser: Combatant | null = null;
      let nearestDefuserDistance = Infinity;
      for (const combatant of vanguard) {
        if (combatant.isPlayer) continue;
        const distance = Math.hypot(
          combatant.pos.x - this.plantedBomb.position.x,
          combatant.pos.z - this.plantedBomb.position.z
        );
        if (distance < nearestDefuserDistance) {
          nearestDefuser = combatant;
          nearestDefuserDistance = distance;
        }
      }
      defuserId = nearestDefuser?.id ?? null;
    }

    for (const bot of bots) {
      if (bot.isFlashedUntil > Date.now()) {
        if (this.plantingCombatantId === bot.id) this.cancelPlanting();
        if (this.defusingCombatantId === bot.id) this.cancelDefusing();
        continue;
      }
      const opponents = bot.team === 'VANGUARD' ? syndicate : vanguard;
      const nearest = this.findClosestOpponent(bot, opponents);

      let objective: BombSite | null = null;
      if (bot.team === 'SYNDICATE' && bot.id === planterId && this.roundState === 'LIVE_COMBAT' && !this.plantedBomb) {
        const distanceToA = Math.hypot(bot.pos.x - this.bombSiteA.position.x, bot.pos.z - this.bombSiteA.position.z);
        const distanceToB = Math.hypot(bot.pos.x - this.bombSiteB.position.x, bot.pos.z - this.bombSiteB.position.z);
        objective = distanceToA <= distanceToB ? this.bombSiteA : this.bombSiteB;
        if (distanceToA <= this.bombSiteA.radius) this.startPlanting(bot.id, 'A');
        else if (distanceToB <= this.bombSiteB.radius) this.startPlanting(bot.id, 'B');
      } else if (
        this.roundState === 'BOMB_PLANTED' &&
        this.plantedBomb &&
        (bot.team === 'SYNDICATE' || bot.id === defuserId)
      ) {
        this.plantedBombObjective ??= {
          id: this.plantedBomb.site,
          position: this.plantedBomb.position,
          radius: 3.5,
        };
        objective = this.plantedBombObjective;
      }

      if (
        bot.id === defuserId &&
        this.roundState === 'BOMB_PLANTED' &&
        this.plantedBomb &&
        this.isInDefuseRange(bot)
      ) {
        this.startDefusing(bot.id);
      }
      if (this.plantingCombatantId === bot.id) continue;
      const prioritizeObjective =
        bot.id === planterId ||
        bot.id === defuserId ||
        (bot.team === 'SYNDICATE' && this.roundState === 'BOMB_PLANTED');
      const visibleTargets = this.findVisibleBotTargets(bot, opponents);
      let assignedTarget: Combatant | null = null;
      let bestTargetScore = Infinity;
      for (const target of visibleTargets) {
        const distance = Math.hypot(target.pos.x - bot.pos.x, target.pos.z - bot.pos.z);
        const score = (targetAssignments.get(target.id) ?? 0) * 12 + distance;
        if (score < bestTargetScore) {
          assignedTarget = target;
          bestTargetScore = score;
        }
      }
      if (assignedTarget) {
        targetAssignments.set(assignedTarget.id, (targetAssignments.get(assignedTarget.id) ?? 0) + 1);
      }
      this.updateBotCombat(bot, nearest, dt, objective, prioritizeObjective, visibleTargets, assignedTarget);
    }
  }

  private findClosestOpponent(bot: Combatant, opponents: Combatant[]): Combatant | null {
    let closest: Combatant | null = null;
    let closestDistance = Infinity;
    for (const opponent of opponents) {
      if (!opponent.isAlive) continue;
      const distance = Math.hypot(opponent.pos.x - bot.pos.x, opponent.pos.z - bot.pos.z);
      if (distance < closestDistance) {
        closest = opponent;
        closestDistance = distance;
      }
    }
    return closest;
  }

  private hasLineOfSight(from: THREE.Vector3, to: THREE.Vector3): boolean {
    const direction = this.lineOfSightDirection.subVectors(to, from);
    const distance = direction.length();
    if (distance === 0) return true;
    direction.normalize();
    const { closestWallDist } = this.raycastWalls(from, direction, distance);
    return closestWallDist >= distance - 0.15;
  }

  private findVisibleBotTargets(bot: Combatant, opponents: Combatant[]): Combatant[] {
    const origin = this.botSightOrigin.set(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
    let visibleTargets = this.visibleTargetsByBot.get(bot.id);
    if (!visibleTargets) {
      visibleTargets = [];
      this.visibleTargetsByBot.set(bot.id, visibleTargets);
    }
    visibleTargets.length = 0;

    for (const opponent of opponents) {
      if (!opponent.isAlive) continue;
      const distance = Math.hypot(opponent.pos.x - bot.pos.x, opponent.pos.z - bot.pos.z);
      if (distance > bot.weapon.rangeMeters) continue;
      const targetEye = this.botSightTarget.set(opponent.pos.x, opponent.pos.y + 1.45, opponent.pos.z);
      if (this.hasLineOfSight(origin, targetEye) && !this.particles.isLineBlockedBySmoke(origin, targetEye)) {
        visibleTargets.push(opponent);
      }
    }
    visibleTargets.sort(
      (a, b) =>
        Math.hypot(a.pos.x - bot.pos.x, a.pos.z - bot.pos.z) -
        Math.hypot(b.pos.x - bot.pos.x, b.pos.z - bot.pos.z)
    );
    return visibleTargets;
  }

  private findCoverPosition(
    bot: Combatant,
    threatPosition: THREE.Vector3
  ): { position: THREE.Vector3; waypoints: THREE.Vector3[] } | null {
    const threatEye = threatPosition.clone().add(new THREE.Vector3(0, 1.45, 0));
    let bestPosition: { position: THREE.Vector3; waypoints: THREE.Vector3[] } | null = null;
    let bestDistance = 18;

    for (const collider of this.colliders) {
      if (!collider.isCover || collider.max.y - collider.min.y < 0.8) continue;

      const centerX = (collider.min.x + collider.max.x) / 2;
      const centerZ = (collider.min.z + collider.max.z) / 2;
      const cornerOffset = 0.9;
      const candidates = [
        new THREE.Vector3(centerX, bot.pos.y, collider.min.z - cornerOffset),
        new THREE.Vector3(centerX, bot.pos.y, collider.max.z + cornerOffset),
        new THREE.Vector3(collider.min.x - cornerOffset, bot.pos.y, centerZ),
        new THREE.Vector3(collider.max.x + cornerOffset, bot.pos.y, centerZ),
        new THREE.Vector3(collider.min.x - cornerOffset, bot.pos.y, collider.min.z - cornerOffset),
        new THREE.Vector3(collider.min.x - cornerOffset, bot.pos.y, collider.max.z + cornerOffset),
        new THREE.Vector3(collider.max.x + cornerOffset, bot.pos.y, collider.min.z - cornerOffset),
        new THREE.Vector3(collider.max.x + cornerOffset, bot.pos.y, collider.max.z + cornerOffset),
      ];
      const waypoints = [
        new THREE.Vector3(collider.min.x - cornerOffset, bot.pos.y, collider.min.z - cornerOffset),
        new THREE.Vector3(collider.min.x - cornerOffset, bot.pos.y, collider.max.z + cornerOffset),
        new THREE.Vector3(collider.max.x + cornerOffset, bot.pos.y, collider.min.z - cornerOffset),
        new THREE.Vector3(collider.max.x + cornerOffset, bot.pos.y, collider.max.z + cornerOffset),
      ];

      for (const candidate of candidates) {
        const overlapsCollider = this.colliders.some(
          (other) =>
            candidate.x + 0.45 > other.min.x &&
            candidate.x - 0.45 < other.max.x &&
            candidate.z + 0.45 > other.min.z &&
            candidate.z - 0.45 < other.max.z &&
            2.2 > other.min.y &&
            0.1 < other.max.y
        );
        if (overlapsCollider) continue;

        const candidateEye = candidate.clone().add(new THREE.Vector3(0, 1.45, 0));
        if (this.hasLineOfSight(threatEye, candidateEye)) continue;

        const botEye = new THREE.Vector3(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
        const directDistance = Math.hypot(candidate.x - bot.pos.x, candidate.z - bot.pos.z);
        const routes: { distance: number; waypoints: THREE.Vector3[] }[] = [];
        if (this.hasLineOfSight(botEye, candidateEye)) {
          routes.push({ distance: directDistance, waypoints: [] });
        } else {
          for (const firstWaypoint of waypoints) {
            const firstEye = firstWaypoint.clone().add(new THREE.Vector3(0, 1.45, 0));
            if (!this.hasLineOfSight(botEye, firstEye)) continue;

            if (this.hasLineOfSight(firstEye, candidateEye)) {
              routes.push({
                distance:
                  Math.hypot(firstWaypoint.x - bot.pos.x, firstWaypoint.z - bot.pos.z) +
                  Math.hypot(candidate.x - firstWaypoint.x, candidate.z - firstWaypoint.z),
                waypoints: [firstWaypoint],
              });
            }

            for (const secondWaypoint of waypoints) {
              if (firstWaypoint === secondWaypoint) continue;
              const secondEye = secondWaypoint.clone().add(new THREE.Vector3(0, 1.45, 0));
              if (!this.hasLineOfSight(firstEye, secondEye) || !this.hasLineOfSight(secondEye, candidateEye)) continue;
              routes.push({
                distance:
                  Math.hypot(firstWaypoint.x - bot.pos.x, firstWaypoint.z - bot.pos.z) +
                  Math.hypot(secondWaypoint.x - firstWaypoint.x, secondWaypoint.z - firstWaypoint.z) +
                  Math.hypot(candidate.x - secondWaypoint.x, candidate.z - secondWaypoint.z),
                waypoints: [firstWaypoint, secondWaypoint],
              });
            }
          }
        }

        for (const route of routes) {
          if (route.distance >= bestDistance) continue;
          bestPosition = { position: candidate, waypoints: route.waypoints };
          bestDistance = route.distance;
        }
      }
    }

    return bestPosition;
  }

  private updateBotCombat(
    bot: Combatant,
    nearest: Combatant | null,
    dt: number,
    objective: BombSite | null,
    prioritizeObjective: boolean,
    visibleTargets: Combatant[],
    assignedTarget: Combatant | null
  ): void {
    const threat = this.botThreats.get(bot.id);
    if (threat) {
      threat.remaining -= dt;
      if (threat.remaining <= 0) this.botThreats.delete(bot.id);
    }
    const origin = this.botShotOrigin.set(bot.pos.x, bot.pos.y + 1.45, bot.pos.z);
    const visibleTarget = assignedTarget ?? visibleTargets[0] ?? null;
    const coverPlan = !prioritizeObjective && threat && threat.remaining > 0 ? threat.coverPosition : null;
    if (coverPlan?.waypoints[0] && Math.hypot(coverPlan.waypoints[0].x - bot.pos.x, coverPlan.waypoints[0].z - bot.pos.z) <= 0.8) {
      coverPlan.waypoints.shift();
    }
    const coverPosition = coverPlan?.waypoints[0] ?? coverPlan?.position ?? null;
    const moveTarget = coverPosition
      ? coverPosition
      : prioritizeObjective && objective
        ? objective.position
        : visibleTarget
          ? visibleTarget.pos
          : objective?.position ?? nearest?.pos;
    if (!moveTarget) return;
    const dx = moveTarget.x - bot.pos.x;
    const dz = moveTarget.z - bot.pos.z;
    const planarDistance = Math.hypot(dx, dz);
    const angle = Math.atan2(dx, dz);
    bot.yaw = angle;

    const speedMultiplier = this.botDifficulty === 'recruit' ? 0.9 : this.botDifficulty === 'elite' ? 1.1 : 1;
    const speed = (bot.role === 'juggernaut' ? 2.8 : 4.4) * speedMultiplier;
    const isDefuser = this.defusingCombatantId === bot.id;
    const preferredDistance =
      bot.role === 'sniper' ? 26 : bot.weapon.category === 'shotgun' ? 6 : bot.role === 'juggernaut' ? 9 : 12;
    const combatDistance = visibleTarget
      ? Math.hypot(visibleTarget.pos.x - bot.pos.x, visibleTarget.pos.z - bot.pos.z)
      : nearest
        ? Math.hypot(nearest.pos.x - bot.pos.x, nearest.pos.z - bot.pos.z)
        : planarDistance;
    const shouldApproach = isDefuser
      ? planarDistance > 2.6
      : objective
        ? planarDistance > objective.radius * 0.65
        : combatDistance > preferredDistance + (visibleTarget ? 3 : 0);
    const shouldRetreat =
      !objective &&
      visibleTarget &&
      bot.weapon.category !== 'shotgun' &&
      combatDistance < preferredDistance - 3;
    const shouldStrafe =
      visibleTarget &&
      (objective
        ? planarDistance < 12
        : bot.role !== 'sniper' &&
          combatDistance >= preferredDistance - 3 &&
          combatDistance <= preferredDistance + 3);
    const movingToCover = Boolean(coverPosition);
    if ((movingToCover && planarDistance > 1.1) || (!movingToCover && (shouldApproach || shouldRetreat))) {
      const direction = movingToCover || !shouldRetreat ? 1 : -1;
      bot.pos.x += Math.sin(angle) * speed * direction * dt;
      bot.pos.z += Math.cos(angle) * speed * direction * dt;
    } else if (!movingToCover && shouldStrafe) {
      const strafeDirection = bot.id.charCodeAt(bot.id.length - 1) % 2 === 0 ? 1 : -1;
      bot.pos.x += Math.cos(angle) * speed * 0.45 * strafeDirection * dt;
      bot.pos.z -= Math.sin(angle) * speed * 0.45 * strafeDirection * dt;
    }

    this.resolveBotCollision(bot.pos);
    const botGroup = this.botMeshes.get(bot.id);
    if (botGroup) {
      botGroup.position.set(bot.pos.x, 0, bot.pos.z);
      botGroup.rotation.y = angle;
    }

    const reloadTimer = this.botReloadTimers.get(bot.id);
    if (reloadTimer !== undefined) {
      const remaining = reloadTimer - dt;
      if (remaining <= 0) {
        const rounds = Math.min(bot.weapon.magSize - bot.currentMag, bot.reserveAmmo);
        bot.currentMag += rounds;
        bot.reserveAmmo -= rounds;
        this.botReloadTimers.delete(bot.id);
      } else {
        this.botReloadTimers.set(bot.id, remaining);
      }
      return;
    }

    if (bot.currentMag <= 0) {
      if (bot.reserveAmmo > 0) this.botReloadTimers.set(bot.id, bot.weapon.reloadTimeSec);
      return;
    }

    if (!visibleTarget) return;

    const cooldown = Math.max(0, (this.botFireCooldowns.get(bot.id) ?? 0) - dt);
    if (cooldown > 0) {
      this.botFireCooldowns.set(bot.id, cooldown);
      return;
    }

    const shotTarget = this.botShotTarget.set(visibleTarget.pos.x, visibleTarget.pos.y + 0.9, visibleTarget.pos.z);
    const shotDirection = this.botShotDirection.subVectors(shotTarget, origin).normalize();
    const aimMultiplier = this.botDifficulty === 'recruit' ? 2.2 : this.botDifficulty === 'elite' ? 0.8 : 1.5;
    this.validateAndExecuteShot(bot.id, origin, shotDirection, bot.weapon.spreadNormal * aimMultiplier);
    this.botFireCooldowns.set(bot.id, 60 / bot.weapon.fireRateRPM);
    Sound.playGunshot(bot.weapon.category, false, bot.pos, this.playerRef?.pos);
  }
}
