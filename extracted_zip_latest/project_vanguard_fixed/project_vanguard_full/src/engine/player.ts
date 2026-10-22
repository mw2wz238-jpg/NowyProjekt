import * as THREE from 'three';
import { Combatant, WeaponAttachmentConfig } from '../types/game';
import { WeaponModelBuilder, DEFAULT_ATTACHMENTS } from './weapons';
import { SimulationEngine } from './simulation';
import { Sound } from './audio';
import { Materials } from './materials';
import { disposeObjectResources } from './resourceDisposal';
import type { CameraMotionSettings } from '../settings';

export const getCameraBobOffset = (
  isMoving: boolean,
  timer: number,
  intensity: number
): number => (isMoving ? Math.sin(timer) * 0.035 * THREE.MathUtils.clamp(intensity, 0, 1) : 0);

export const getSlideCameraRoll = (isSliding: boolean, intensity: number): number =>
  isSliding ? 0.08 * THREE.MathUtils.clamp(intensity, 0, 1) : 0;

export class PlayerController {
  public camera: THREE.PerspectiveCamera;
  public sim: SimulationEngine;

  public pos: THREE.Vector3 = new THREE.Vector3(0, 1.75, 48);
  public vel: THREE.Vector3 = new THREE.Vector3();
  public yaw: number = 0;
  public pitch: number = 0;

  public isGrounded: boolean = true;
  public isSprinting: boolean = false;
  public isCrouching: boolean = false;
  public isSliding: boolean = false;
  public slideTimer: number = 0;
  public isAds: boolean = false;
  public baseFieldOfView = 75;
  public cameraMotion: CameraMotionSettings = { headBob: 1, slideTilt: 1 };
  public invertLookY = false;
  public gamepadMoveX = 0;
  public gamepadMoveY = 0;
  public gamepadInteract = false;
  public isReloading: boolean = false;
  public reloadProgress: number = 0;

  // Weapon Inspection
  public isInspecting: boolean = false;
  public inspectTimer: number = 0;
  public inspectDuration: number = 3.2;

  public stamina: number = 100;
  public maxStamina: number = 100;

  // Recoil recovery
  public recoilPitch: number = 0;
  public recoilYaw: number = 0;

  // Viewmodel weapon mesh & hands
  public weaponRoot: THREE.Group | null = null;
  public currentAttachments: WeaponAttachmentConfig = { ...DEFAULT_ATTACHMENTS };

  // Spectator mode properties
  public spectatorIndex: number = 0;

  // Keys state
  public keys: Record<string, boolean> = {};

  // Bobbing
  private bobTimer: number = 0;
  private moveVector = new THREE.Vector3();
  private shotDirection = new THREE.Vector3(0, 0, -1);
  private shotOrigin = new THREE.Vector3();
  private spectatorCameraPosition = new THREE.Vector3();
  private spectatorDirection = new THREE.Vector3(0, 0, -1);
  private aliveSpectatorAllies: Combatant[] = [];
  private rotationEuler = new THREE.Euler(0, 0, 0, 'YXZ');
  private readonly worldUp = new THREE.Vector3(0, 1, 0);
  private readonly adsWeaponPosition = new THREE.Vector3(0, -0.088, -0.21);
  private readonly inspectWeaponPositions = [
    new THREE.Vector3(0.08, -0.11, -0.26),
    new THREE.Vector3(-0.06, -0.13, -0.25),
    new THREE.Vector3(0.18, -0.16, -0.32),
  ];
  private readonly readyWeaponPosition = new THREE.Vector3(0.18, -0.16, -0.32);
  private readonly reloadWeaponPosition = new THREE.Vector3();

  constructor(camera: THREE.PerspectiveCamera, sim: SimulationEngine) {
    this.camera = camera;
    this.sim = sim;
    this.setupWeaponModel();
  }

  public setBaseFieldOfView(fieldOfView: number) {
    if (!Number.isFinite(fieldOfView)) return;
    this.baseFieldOfView = THREE.MathUtils.clamp(fieldOfView, 60, 110);
    if (!this.isAds && this.camera.fov !== this.baseFieldOfView) {
      this.camera.fov = this.baseFieldOfView;
      this.camera.updateProjectionMatrix();
    }
  }

  public setCameraMotion(settings: CameraMotionSettings) {
    this.cameraMotion = {
      headBob: THREE.MathUtils.clamp(settings.headBob, 0, 1),
      slideTilt: THREE.MathUtils.clamp(settings.slideTilt, 0, 1),
    };
  }

  public setInvertLookY(invert: boolean) {
    this.invertLookY = invert;
  }

  public setGamepadMovement(x: number, y: number) {
    this.gamepadMoveX = Number.isFinite(x) ? THREE.MathUtils.clamp(x, -1, 1) : 0;
    this.gamepadMoveY = Number.isFinite(y) ? THREE.MathUtils.clamp(y, -1, 1) : 0;
  }

  public onGamepadLook(x: number, y: number, dt: number, sensitivity: number) {
    this.yaw -= x * sensitivity * dt;
    this.pitch -= (this.invertLookY ? -y : y) * sensitivity * dt;
    const pitchLimit = this.sim.playerRef?.isAlive ? 1.45 : Math.PI / 2 - 0.05;
    this.pitch = THREE.MathUtils.clamp(this.pitch, -pitchLimit, pitchLimit);
  }

  public setGamepadInteract(active: boolean) {
    this.gamepadInteract = active;
  }

  public setupWeaponModel() {
    this.disposeWeaponModel();

    const playerCombatant = this.sim.playerRef;
    const wpnId = playerCombatant ? playerCombatant.weapon.id : 'm4a1';

    this.weaponRoot = WeaponModelBuilder.buildProceduralWeapon(wpnId, this.currentAttachments, true);
    // Position weapon in lower-right of camera
    this.weaponRoot.position.set(0.18, -0.16, -0.32);
    this.weaponRoot.rotation.set(0, 0, 0);
    this.camera.add(this.weaponRoot);
  }

  public dispose(): void {
    this.disposeWeaponModel();
  }

  private disposeWeaponModel(): void {
    if (!this.weaponRoot) return;
    this.camera.remove(this.weaponRoot);
    disposeObjectResources([this.weaponRoot], (material) => Materials.isShared(material));
    this.weaponRoot = null;
  }

  public triggerInspect() {
    if (this.isReloading || this.isAds) return;
    this.isInspecting = true;
    this.inspectTimer = 0;
    Sound.playInspectWeapon();
  }

  public onMouseMove(dx: number, dy: number, sensitivity: number = 0.0022) {
    const lookDy = this.invertLookY ? -dy : dy;
    if (!this.sim.playerRef?.isAlive) {
      // Free look in spectator mode
      this.yaw -= dx * sensitivity;
      this.pitch -= lookDy * sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
      return;
    }

    this.yaw -= dx * sensitivity;
    this.pitch -= lookDy * sensitivity;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  public shoot(): boolean {
    const player = this.sim.playerRef;
    if (
      !player ||
      !player.isAlive ||
      this.isReloading ||
      (this.sim.roundState !== 'LIVE_COMBAT' && this.sim.roundState !== 'BOMB_PLANTED')
    ) {
      return false;
    }

    // Shooting cancels weapon inspection
    if (this.isInspecting) {
      this.isInspecting = false;
    }

    // Check weapon ammo
    if (player.currentMag <= 0) {
      this.startReload();
      return false;
    }

    // Direction vector from camera forward + recoil
    const forward = this.shotDirection.set(0, 0, -1);
    this.rotationEuler.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0, 'YXZ');
    forward.applyEuler(this.rotationEuler).normalize();

    const origin = this.shotOrigin.set(this.pos.x, this.pos.y + (this.isCrouching ? 0.95 : 1.65), this.pos.z);
    const spread = this.isAds ? player.weapon.spreadAds : player.weapon.spreadNormal * (this.isSprinting ? 2.0 : 1.0);

    const result = this.sim.validateAndExecuteShot(player.id, origin, forward, spread);

    // Apply Recoil Kick
    this.recoilPitch += player.weapon.recoilVertical * (this.isAds ? 0.6 : 1.0);
    this.recoilYaw += (Math.random() - 0.5) * player.weapon.recoilHorizontal;

    // Weapon kick visual animation
    if (this.weaponRoot) {
      this.weaponRoot.position.z += 0.035;
      this.weaponRoot.rotation.x += 0.08;
    }

    // Sound
    const isSuppressed = this.currentAttachments.barrel === 'suppressed';
    Sound.playGunshot(player.weapon.category, isSuppressed);

    return result.hit;
  }

  public startReload() {
    const player = this.sim.playerRef;
    if (!player || !player.isAlive || this.isReloading) return;
    if (player.currentMag >= player.weapon.magSize || player.reserveAmmo <= 0) return;

    this.isInspecting = false;
    this.inspectTimer = 0;
    this.isAds = false;
    this.isReloading = true;
    this.reloadProgress = 0;
    Sound.playReload();
  }

  public releaseInputs(): void {
    this.keys = {};
    this.isSprinting = false;
    this.setGamepadMovement(0, 0);
    this.gamepadInteract = false;
    this.isAds = false;
    this.isSliding = false;
    this.slideTimer = 0;
    if (this.sim.defusingCombatantId === this.sim.playerRef?.id) this.sim.cancelDefusing();
    if (this.sim.plantingCombatantId === this.sim.playerRef?.id) this.sim.cancelPlanting();
  }

  public cycleSpectatorTarget() {
    const aliveAllies = Array.from(this.sim.combatants.values()).filter((c) => c.isAlive && c.team === 'VANGUARD');
    if (aliveAllies.length > 0) {
      this.spectatorIndex = (this.spectatorIndex + 1) % aliveAllies.length;
    }
  }

  public resetForRound() {
    const player = this.sim.playerRef;
    if (!player) return;

    this.pos.set(player.pos.x, player.pos.y, player.pos.z);
    this.vel.set(0, 0, 0);
    this.yaw = player.yaw;
    this.pitch = player.pitch;
    this.isGrounded = true;
    this.isSprinting = false;
    this.isCrouching = false;
    this.isSliding = false;
    this.slideTimer = 0;
    this.isAds = false;
    this.isReloading = false;
    this.reloadProgress = 0;
    this.isInspecting = false;
    this.inspectTimer = 0;
    this.stamina = this.maxStamina;
    this.recoilPitch = 0;
    this.recoilYaw = 0;
    this.keys = {};

    if (this.weaponRoot) this.weaponRoot.visible = true;
    this.camera.position.copy(this.pos);
    this.rotationEuler.set(this.pitch, this.yaw, 0, 'YXZ');
    this.camera.quaternion.setFromEuler(this.rotationEuler);
    this.camera.fov = this.baseFieldOfView;
    this.camera.updateProjectionMatrix();
  }

  public update(dt: number) {
    const player = this.sim.playerRef;
    if (!player) return;

    // 1. Spectator Mode if player is dead
    if (!player.isAlive) {
      this.isSprinting = false;
      this.isAds = false;
      if (this.weaponRoot) this.weaponRoot.visible = false;

      const aliveAllies = this.aliveSpectatorAllies;
      aliveAllies.length = 0;
      for (const combatant of this.sim.combatants.values()) {
        if (!combatant.isAlive || combatant.team !== 'VANGUARD') continue;
        aliveAllies.push(combatant);
      }
      if (aliveAllies.length > 0) {
        this.spectatorIndex %= aliveAllies.length;
        const ally = aliveAllies[this.spectatorIndex];
        // Camera smoothly tracks behind alive teammate
        const targetCamPos = this.spectatorCameraPosition.set(ally.pos.x, 2.2, ally.pos.z + 3.2);
        this.camera.position.lerp(targetCamPos, dt * 5);
        this.camera.lookAt(ally.pos.x, 1.4, ally.pos.z);
      } else {
        // Free fly camera
        const camDir = this.spectatorDirection.set(0, 0, -1);
        this.rotationEuler.set(this.pitch, this.yaw, 0, 'YXZ');
        camDir.applyEuler(this.rotationEuler);
        this.camera.position.addScaledVector(camDir, 8 * dt);
        this.camera.quaternion.setFromEuler(this.rotationEuler);
      }
      return;
    }

    // 2. Weapon visible if alive
    if (this.weaponRoot) this.weaponRoot.visible = true;

    // 3. Movement Inputs
    let moveX = 0;
    let moveZ = 0;
    if (this.keys['KeyW']) moveZ -= 1;
    if (this.keys['KeyS']) moveZ += 1;
    if (this.keys['KeyA']) moveX -= 1;
    if (this.keys['KeyD']) moveX += 1;
    moveX += this.gamepadMoveX;
    moveZ += this.gamepadMoveY;

    // Sliding mechanic
    if (this.isSliding) {
      this.slideTimer -= dt;
      if (this.slideTimer <= 0) {
        this.isSliding = false;
      }
    }

    // Stamina & Sprint
    if (this.isSprinting && (moveX !== 0 || moveZ !== 0) && !this.isAds) {
      this.stamina = Math.max(0, this.stamina - 28 * dt);
      if (this.stamina <= 0) this.isSprinting = false;
    } else {
      this.stamina = Math.min(this.maxStamina, this.stamina + 20 * dt);
    }

    // Determine speed
    let speed = 5.2; // Walk
    if (this.isSliding) speed = 12.0;
    else if (this.isSprinting && !this.isAds) speed = 8.5;
    else if (this.isCrouching) speed = 2.8;
    else if (this.isAds) speed = 3.1;

    // Calculate movement vector in camera space
    const moveVector = this.moveVector.set(moveX, 0, moveZ);
    if (moveVector.lengthSq() > 0) {
      moveVector.normalize();
      moveVector.applyAxisAngle(this.worldUp, this.yaw);

      this.pos.x += moveVector.x * speed * dt;
      this.pos.z += moveVector.z * speed * dt;

      // Footsteps
      this.bobTimer += dt * (this.isSprinting ? 14 : 9);
      if (Math.sin(this.bobTimer) > 0.95 && this.isGrounded) {
        Sound.playFootstep('concrete');
      }
    }

    // Gravity
    this.vel.y -= 24 * dt;
    this.pos.y += this.vel.y * dt;

    if (this.pos.y <= 1.75) {
      this.pos.y = 1.75;
      this.vel.y = 0;
      this.isGrounded = true;
    }

    // Wall collision checks
    this.resolveCollisions();

    // Sync player object position
    player.pos.x = this.pos.x;
    player.pos.y = this.pos.y;
    player.pos.z = this.pos.z;
    player.yaw = this.yaw;
    player.pitch = this.pitch;

    // 4. Camera Position & Sway
    const eyeHeight = this.isCrouching || this.isSliding ? 1.05 : 1.75;
    const bobOffset = getCameraBobOffset(
      moveVector.lengthSq() > 0,
      this.bobTimer,
      this.cameraMotion.headBob
    );
    this.camera.position.set(this.pos.x, this.pos.y - 1.75 + eyeHeight + bobOffset, this.pos.z);

    // Camera Rotation with Recoil & Spring Damping
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 8, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, 8, dt);

    const rollAngle = getSlideCameraRoll(this.isSliding, this.cameraMotion.slideTilt);
    this.rotationEuler.set(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, rollAngle, 'YXZ');
    this.camera.quaternion.setFromEuler(this.rotationEuler);

    // 5. ADS Smooth Alignment & FOV
    const targetFov = this.isAds
      ? this.currentAttachments.sight === 'acog_scope'
        ? 32
        : 55
      : this.baseFieldOfView;
    const nextFov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
    if (nextFov !== this.camera.fov) {
      this.camera.fov = nextFov;
      this.camera.updateProjectionMatrix();
    }

    if (this.isAds) {
      this.isInspecting = false;
    }

    if (this.weaponRoot) {
      if (this.isAds) {
        // In ADS, sight reticle aligns at exact center (x: 0, y: -0.095, z: -0.22)
        this.weaponRoot.position.lerp(this.adsWeaponPosition, dt * 14);
        this.weaponRoot.rotation.set(0, 0, 0);
      } else if (this.isInspecting && !this.isReloading) {
        // Weapon Inspection Dynamic Multi-Angle Showcase Animation
        this.inspectTimer += dt;
        const t = this.inspectTimer / this.inspectDuration;
        if (t >= 1.0) {
          this.isInspecting = false;
          this.inspectTimer = 0;
        } else if (t < 0.4) {
          // Phase 1: Tilt right and upward to inspect receiver camo and optic
          const p = t / 0.4;
          const ease = Math.sin(p * Math.PI * 0.5);
          this.weaponRoot.position.lerp(this.inspectWeaponPositions[0], ease);
          this.weaponRoot.rotation.set(0.25 * ease, 0.65 * ease, -0.45 * ease);
        } else if (t < 0.8) {
          // Phase 2: Twist left to inspect ejection port, chamber and magazine release
          const p = (t - 0.4) / 0.4;
          const ease = Math.sin(p * Math.PI);
          this.weaponRoot.position.lerp(this.inspectWeaponPositions[1], 0.2);
          this.weaponRoot.rotation.set(-0.28 * ease, -0.72 * ease, 0.48 * ease);
        } else {
          // Phase 3: Return to standard shoulder ready rest pose
          const p = (t - 0.8) / 0.2;
          this.weaponRoot.position.lerp(this.inspectWeaponPositions[2], p);
          this.weaponRoot.rotation.set(0, 0, 0);
        }
      } else if (this.isReloading) {
        const reloadDip = Math.sin(Math.min(this.reloadProgress, 1) * Math.PI) * 0.14;
        this.reloadWeaponPosition.copy(this.readyWeaponPosition);
        this.reloadWeaponPosition.y -= reloadDip;
        this.weaponRoot.position.lerp(this.reloadWeaponPosition, dt * 14);
        this.weaponRoot.rotation.x = THREE.MathUtils.damp(this.weaponRoot.rotation.x, 0, 8, dt);
        this.weaponRoot.rotation.y = THREE.MathUtils.damp(this.weaponRoot.rotation.y, 0, 8, dt);
        this.weaponRoot.rotation.z = 0;
      } else {
        this.weaponRoot.position.lerp(this.readyWeaponPosition, dt * 14);

        // Weapon Sway when moving
        const sway = moveVector.lengthSq() > 0 ? Math.cos(this.bobTimer * 0.5) * 0.012 : 0;
        this.weaponRoot.position.x += sway;
        this.weaponRoot.rotation.z = -sway * 2;
        this.weaponRoot.rotation.x = THREE.MathUtils.damp(this.weaponRoot.rotation.x, 0, 8, dt);
        this.weaponRoot.rotation.y = THREE.MathUtils.damp(this.weaponRoot.rotation.y, 0, 8, dt);
      }
    }

    // KeyE handling for Bomb Defuse / Plant
    if (this.keys['KeyE'] || this.gamepadInteract) {
      if (this.sim.roundState === 'BOMB_PLANTED' && this.sim.plantedBomb) {
        const bPos = this.sim.plantedBomb.position;
        const dist = Math.hypot(this.pos.x - bPos.x, this.pos.z - bPos.z);
        if (dist <= 3.5) {
          this.sim.startDefusing('player_0');
        }
      } else if (this.sim.roundState === 'LIVE_COMBAT' && !this.sim.plantedBomb) {
        const siteA = this.sim.bombSiteA;
        const siteB = this.sim.bombSiteB;
        const distA = Math.hypot(this.pos.x - siteA.position.x, this.pos.z - siteA.position.z);
        const distB = Math.hypot(this.pos.x - siteB.position.x, this.pos.z - siteB.position.z);
        if (distA <= siteA.radius) {
          this.sim.startPlanting('player_0', 'A');
        } else if (distB <= siteB.radius) {
          this.sim.startPlanting('player_0', 'B');
        }
      }
    } else {
      if (this.sim.defusingCombatantId === 'player_0') {
        this.sim.cancelDefusing();
      }
      if (this.sim.plantingCombatantId === 'player_0') {
        this.sim.cancelPlanting();
      }
    }

    // 6. Reload Timer
    if (this.isReloading) {
      this.reloadProgress += dt / player.weapon.reloadTimeSec;
      if (this.reloadProgress >= 1.0) {
        this.isReloading = false;
        this.reloadProgress = 0;
        const needed = player.weapon.magSize - player.currentMag;
        const available = Math.min(needed, player.reserveAmmo);
        player.currentMag += available;
        player.reserveAmmo -= available;
      }
    }
  }

  private resolveCollisions() {
    const halfWidth = 0.45;
    for (const c of this.sim.colliders) {
      // Simple AABB vs player cylinder/box
      if (
        this.pos.x + halfWidth > c.min.x &&
        this.pos.x - halfWidth < c.max.x &&
        this.pos.z + halfWidth > c.min.z &&
        this.pos.z - halfWidth < c.max.z &&
        this.pos.y + 0.5 > c.min.y &&
        this.pos.y - 1.7 < c.max.y
      ) {
        // Push out of shortest axis
        const dx1 = Math.abs(this.pos.x + halfWidth - c.min.x);
        const dx2 = Math.abs(this.pos.x - halfWidth - c.max.x);
        const dz1 = Math.abs(this.pos.z + halfWidth - c.min.z);
        const dz2 = Math.abs(this.pos.z - halfWidth - c.max.z);

        const minOverlap = Math.min(dx1, dx2, dz1, dz2);
        if (minOverlap === dx1) this.pos.x = c.min.x - halfWidth;
        else if (minOverlap === dx2) this.pos.x = c.max.x + halfWidth;
        else if (minOverlap === dz1) this.pos.z = c.min.z - halfWidth;
        else if (minOverlap === dz2) this.pos.z = c.max.z + halfWidth;
      }
    }
  }
}
