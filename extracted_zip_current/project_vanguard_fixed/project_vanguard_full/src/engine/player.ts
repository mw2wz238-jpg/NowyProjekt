import * as THREE from 'three';
import { WeaponStats, WeaponAttachmentConfig, Combatant } from '../types/game';
import { WeaponModelBuilder, DEFAULT_ATTACHMENTS } from './weapons';
import { SimulationEngine } from './simulation';
import { Sound } from './audio';

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

  constructor(camera: THREE.PerspectiveCamera, sim: SimulationEngine) {
    this.camera = camera;
    this.sim = sim;
    this.setupWeaponModel();
  }

  public setupWeaponModel() {
    if (this.weaponRoot) {
      this.camera.remove(this.weaponRoot);
    }

    const playerCombatant = this.sim.playerRef;
    const wpnId = playerCombatant ? playerCombatant.weapon.id : 'm4a1';

    this.weaponRoot = WeaponModelBuilder.buildProceduralWeapon(wpnId, this.currentAttachments, true);
    // Position weapon in lower-right of camera
    this.weaponRoot.position.set(0.18, -0.16, -0.32);
    this.weaponRoot.rotation.set(0, 0, 0);
    this.camera.add(this.weaponRoot);
  }

  public triggerInspect() {
    if (this.isReloading || this.isAds) return;
    this.isInspecting = true;
    this.inspectTimer = 0;
    Sound.playInspectWeapon();
  }

  public onMouseMove(dx: number, dy: number, sensitivity: number = 0.0022) {
    if (!this.sim.playerRef?.isAlive) {
      // Free look in spectator mode
      this.yaw -= dx * sensitivity;
      this.pitch -= dy * sensitivity;
      this.pitch = Math.max(-Math.PI / 2 + 0.05, Math.min(Math.PI / 2 - 0.05, this.pitch));
      return;
    }

    this.yaw -= dx * sensitivity;
    this.pitch -= dy * sensitivity;
    this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
  }

  public shoot(): boolean {
    const player = this.sim.playerRef;
    if (!player || !player.isAlive || this.isReloading) return false;

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
    const forward = new THREE.Vector3(0, 0, -1);
    forward.applyEuler(new THREE.Euler(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, 0, 'YXZ'));
    forward.normalize();

    const origin = this.pos.clone().add(new THREE.Vector3(0, this.isCrouching ? 0.95 : 1.65, 0));
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

    this.isReloading = true;
    this.reloadProgress = 0;
    Sound.playReload();
  }

  public cycleSpectatorTarget() {
    const aliveAllies = Array.from(this.sim.combatants.values()).filter((c) => c.isAlive && c.team === 'VANGUARD');
    if (aliveAllies.length > 0) {
      this.spectatorIndex = (this.spectatorIndex + 1) % aliveAllies.length;
    }
  }

  public update(dt: number) {
    const player = this.sim.playerRef;
    if (!player) return;

    // 1. Spectator Mode if player is dead
    if (!player.isAlive) {
      if (this.weaponRoot) this.weaponRoot.visible = false;

      const aliveAllies = Array.from(this.sim.combatants.values()).filter((c) => c.isAlive && c.team === 'VANGUARD');
      if (aliveAllies.length > 0) {
        const ally = aliveAllies[this.spectatorIndex % aliveAllies.length];
        // Camera smoothly tracks behind alive teammate
        const targetCamPos = new THREE.Vector3(ally.pos.x, 2.2, ally.pos.z + 3.2);
        this.camera.position.lerp(targetCamPos, dt * 5);
        this.camera.lookAt(ally.pos.x, 1.4, ally.pos.z);
      } else {
        // Free fly camera
        const camDir = new THREE.Vector3(0, 0, -1).applyEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
        this.camera.position.addScaledVector(camDir, 8 * dt);
        this.camera.quaternion.setFromEuler(new THREE.Euler(this.pitch, this.yaw, 0, 'YXZ'));
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
    const moveVector = new THREE.Vector3(moveX, 0, moveZ);
    if (moveVector.lengthSq() > 0) {
      moveVector.normalize();
      moveVector.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

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
    player.pos = { x: this.pos.x, y: this.pos.y, z: this.pos.z };
    player.yaw = this.yaw;
    player.pitch = this.pitch;

    // 4. Camera Position & Sway
    const eyeHeight = this.isCrouching || this.isSliding ? 1.05 : 1.75;
    const bobOffset = moveVector.lengthSq() > 0 ? Math.sin(this.bobTimer) * 0.035 : 0;
    this.camera.position.set(this.pos.x, this.pos.y - 1.75 + eyeHeight + bobOffset, this.pos.z);

    // Camera Rotation with Recoil & Spring Damping
    this.recoilPitch = THREE.MathUtils.damp(this.recoilPitch, 0, 8, dt);
    this.recoilYaw = THREE.MathUtils.damp(this.recoilYaw, 0, 8, dt);

    const rollAngle = this.isSliding ? 0.08 : 0;
    this.camera.quaternion.setFromEuler(
      new THREE.Euler(this.pitch + this.recoilPitch, this.yaw + this.recoilYaw, rollAngle, 'YXZ')
    );

    // 5. ADS Smooth Alignment & FOV
    const targetFov = this.isAds ? (this.currentAttachments.sight === 'acog_scope' ? 32 : 55) : 75;
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 14, dt);
    this.camera.updateProjectionMatrix();

    if (this.isAds) {
      this.isInspecting = false;
    }

    if (this.weaponRoot) {
      if (this.isAds) {
        // In ADS, sight reticle aligns at exact center (x: 0, y: -0.095, z: -0.22)
        const targetPos = new THREE.Vector3(0, -0.088, -0.21);
        this.weaponRoot.position.lerp(targetPos, dt * 14);
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
          this.weaponRoot.position.lerp(new THREE.Vector3(0.08, -0.11, -0.26), ease);
          this.weaponRoot.rotation.set(0.25 * ease, 0.65 * ease, -0.45 * ease);
        } else if (t < 0.8) {
          // Phase 2: Twist left to inspect ejection port, chamber and magazine release
          const p = (t - 0.4) / 0.4;
          const ease = Math.sin(p * Math.PI);
          this.weaponRoot.position.lerp(new THREE.Vector3(-0.06, -0.13, -0.25), 0.2);
          this.weaponRoot.rotation.set(-0.28 * ease, -0.72 * ease, 0.48 * ease);
        } else {
          // Phase 3: Return to standard shoulder ready rest pose
          const p = (t - 0.8) / 0.2;
          this.weaponRoot.position.lerp(new THREE.Vector3(0.18, -0.16, -0.32), p);
          this.weaponRoot.rotation.set(0, 0, 0);
        }
      } else {
        const targetPos = new THREE.Vector3(0.18, -0.16, -0.32);
        this.weaponRoot.position.lerp(targetPos, dt * 14);

        // Weapon Sway when moving
        const sway = moveVector.lengthSq() > 0 ? Math.cos(this.bobTimer * 0.5) * 0.012 : 0;
        this.weaponRoot.position.x += sway;
        this.weaponRoot.rotation.z = -sway * 2;
        this.weaponRoot.rotation.x = THREE.MathUtils.damp(this.weaponRoot.rotation.x, 0, 8, dt);
        this.weaponRoot.rotation.y = THREE.MathUtils.damp(this.weaponRoot.rotation.y, 0, 8, dt);
      }
    }

    // KeyE handling for Bomb Defuse / Plant
    if (this.keys['KeyE']) {
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
      if (this.weaponRoot) {
        // Drop weapon down during reload
        const reloadDip = Math.sin(this.reloadProgress * Math.PI) * 0.14;
        this.weaponRoot.position.y -= reloadDip;
      }
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
