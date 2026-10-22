import React, { useCallback, useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MapId, RoundState, WeaponStats, WeaponAttachmentConfig, Combatant, BotDifficulty, KillstreakType } from './types/game';
import { EnvironmentBuilder } from './engine/environment';
import { ParticleSystem } from './engine/particles';
import { SimulationEngine } from './engine/simulation';
import { PlayerController } from './engine/player';
import { Sound } from './engine/audio';
import { getRendererPixelRatio, resolveGraphicsProfile } from './engine/graphics';
import { readGamepadInput } from './engine/gamepad';
import { WEAPON_REGISTRY, DEFAULT_ATTACHMENTS } from './engine/weapons';

import { TitleScreen } from './components/TitleScreen';
import { HUD } from './components/HUD';
import { BuyMenu } from './components/BuyMenu';
import { Scoreboard } from './components/Scoreboard';
import { GunsmithModal } from './components/GunsmithModal';
import { MapSelectModal } from './components/MapSelectModal';
import { GameOverModal } from './components/GameOverModal';
import { MobileControls } from './components/MobileControls';
import { PauseMenu } from './components/PauseMenu';
import {
  GameKeyBindings,
  GraphicsQuality,
  GameSettings,
  getActionForKey,
  getLookSensitivity,
  updateSprintState,
  loadGameSettings,
  MOVEMENT_KEY_FOR_ACTION,
  saveGameSettings,
} from './settings';

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null);

  // High-level App State with ref to avoid stale closures in animation loop
  const [gameState, setGameState] = useState<'TITLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('TITLE');
  const gameStateRef = useRef<'TITLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER'>('TITLE');
  const [currentMap, setCurrentMap] = useState<MapId>('industrial');
  const currentMapRef = useRef(currentMap);
  const [botDifficulty, setBotDifficulty] = useState<BotDifficulty>('veteran');
  const botDifficultyRef = useRef(botDifficulty);
  const [settings, setSettings] = useState<GameSettings>(() => loadGameSettings());
  const isMuted = settings.isMuted;
  const graphicsQualityRef = useRef(settings.graphicsQuality);
  graphicsQualityRef.current = settings.graphicsQuality;
  const fieldOfViewRef = useRef(settings.fieldOfView);
  fieldOfViewRef.current = settings.fieldOfView;
  const cameraMotionRef = useRef(settings.cameraMotion);
  cameraMotionRef.current = settings.cameraMotion;
  const invertLookYRef = useRef(settings.invertLookY);
  invertLookYRef.current = settings.invertLookY;
  const gamepadSensitivityRef = useRef(settings.gamepadSensitivity);
  gamepadSensitivityRef.current = settings.gamepadSensitivity;
  const gamepadDeadZoneRef = useRef(settings.gamepadDeadZone);
  gamepadDeadZoneRef.current = settings.gamepadDeadZone;
  const sprintModeRef = useRef(settings.sprintMode);
  sprintModeRef.current = settings.sprintMode;
  const [isTouchDevice, setIsTouchDevice] = useState<boolean>(false);
  const [webglError, setWebglError] = useState<string | null>(null);

  // Modals
  const [isBuyMenuOpen, setIsBuyMenuOpen] = useState<boolean>(false);
  const [isScoreboardOpen, setIsScoreboardOpen] = useState<boolean>(false);
  const [isGunsmithOpen, setIsGunsmithOpen] = useState<boolean>(false);
  const [isMapSelectOpen, setIsMapSelectOpen] = useState<boolean>(false);

  // HUD and Round State
  const [roundState, setRoundState] = useState<RoundState>('BUY_PHASE');
  const [roundTimer, setRoundTimer] = useState<number>(15);
  const [roundNumber, setRoundNumber] = useState<number>(1);
  const [scoreVanguard, setScoreVanguard] = useState<number>(0);
  const [scoreSyndicate, setScoreSyndicate] = useState<number>(0);

  // Player & Combat state for UI
  const [playerCombatant, setPlayerCombatant] = useState<Combatant | null>(null);
  const [combatantsList, setCombatantsList] = useState<Combatant[]>([]);
  const [isAds, setIsAds] = useState<boolean>(false);
  const [isReloading, setIsReloading] = useState(false);
  const [reloadProgress, setReloadProgress] = useState(0);
  const [hitmarker, setHitmarker] = useState<{ active: boolean; isHeadshot: boolean } | null>(null);
  const [damageDirection, setDamageDirection] = useState<number | null>(null);
  const [readyKillstreaks, setReadyKillstreaks] = useState<KillstreakType[]>([]);
  const [isUavActive, setIsUavActive] = useState(false);
  const [spectatorTarget, setSpectatorTarget] = useState<Combatant | null>(null);

  // Bomb Objective State for UI
  const [isNearSiteA, setIsNearSiteA] = useState<boolean>(false);
  const [isNearSiteB, setIsNearSiteB] = useState<boolean>(false);
  const [isNearPlantedBomb, setIsNearPlantedBomb] = useState<boolean>(false);
  const [plantProgress, setPlantProgress] = useState<number>(0);
  const [defuseProgress, setDefuseProgress] = useState<number>(0);

  // Weapon customization
  const [customAttachments, setCustomAttachments] = useState<WeaponAttachmentConfig>({ ...DEFAULT_ATTACHMENTS });

  // Engine references kept across re-renders
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const simRef = useRef<SimulationEngine | null>(null);
  const playerRef = useRef<PlayerController | null>(null);
  const envBuilderRef = useRef<EnvironmentBuilder>(new EnvironmentBuilder());
  const particlesRef = useRef<ParticleSystem | null>(null);
  const fireIntervalRef = useRef<number | null>(null);
  const fireSourcesRef = useRef(new Set<string>());
  const hitmarkerTimeoutRef = useRef<number | null>(null);
  const damageDirectionTimeoutRef = useRef<number | null>(null);

  const spawnsVanguardRef = useRef<THREE.Vector3[]>([]);
  const spawnsSyndicateRef = useRef<THREE.Vector3[]>([]);

  useEffect(() => {
    saveGameSettings(settings);
    Sound.setMasterVolume(settings.masterVolume);
    Sound.setMuted(settings.isMuted);
    Sound.setAudioMix(settings.audioMix);
    playerRef.current?.setBaseFieldOfView(settings.fieldOfView);
    playerRef.current?.setCameraMotion(settings.cameraMotion);
    playerRef.current?.setInvertLookY(settings.invertLookY);
  }, [settings]);

  const setGameStateSafe = (state: 'TITLE' | 'PLAYING' | 'PAUSED' | 'GAMEOVER') => {
    gameStateRef.current = state;
    setGameState(state);
  };

  const resumeGame = useCallback(() => {
    if (gameStateRef.current !== 'PAUSED') return;
    simRef.current?.setPaused(false);
    setGameStateSafe('PLAYING');
    if (!isTouchDevice) canvasRef.current?.requestPointerLock();
  }, [isTouchDevice]);

  const returnToTitle = useCallback(() => {
    if (simRef.current && spawnsVanguardRef.current.length > 0) {
      simRef.current.initMatch(currentMap, spawnsVanguardRef.current, spawnsSyndicateRef.current);
      simRef.current.setPaused(false);
    }
    setGameStateSafe('TITLE');
    document.exitPointerLock?.();
  }, [currentMap]);

  const throwPlayerGrenade = useCallback((type: 'frag' | 'smoke' | 'flashbang') => {
    if (!cameraRef.current || !simRef.current || !playerRef.current) return;
    const direction = new THREE.Vector3();
    cameraRef.current.getWorldDirection(direction);
    simRef.current.throwGrenade(
      playerRef.current.sim.playerRef?.id ?? 'player_0',
      type,
      playerRef.current.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
      direction
    );
  }, []);

  const stopPlayerFire = useCallback((source?: string) => {
    if (source) fireSourcesRef.current.delete(source);
    else fireSourcesRef.current.clear();
    if (fireSourcesRef.current.size > 0) return;
    if (fireIntervalRef.current !== null) {
      window.clearInterval(fireIntervalRef.current);
      fireIntervalRef.current = null;
    }
  }, []);

  const pauseGame = useCallback(() => {
    if (gameStateRef.current !== 'PLAYING') return;
    playerRef.current?.releaseInputs();
    stopPlayerFire();
    setIsAds(false);
    setIsScoreboardOpen(false);
    simRef.current?.setPaused(true);
    setGameStateSafe('PAUSED');
    document.exitPointerLock?.();
  }, [stopPlayerFire]);

  const startPlayerFire = useCallback((source = 'mouse') => {
    const simulation = simRef.current;
    const player = playerRef.current;
    const combatant = simulation?.playerRef;
    if (
      gameStateRef.current !== 'PLAYING' ||
      !simulation ||
      !player ||
      !combatant?.isAlive ||
      (simulation.roundState !== 'LIVE_COMBAT' && simulation.roundState !== 'BOMB_PLANTED')
    ) {
      return;
    }

    if (fireSourcesRef.current.has(source)) return;
    fireSourcesRef.current.add(source);
    if (fireIntervalRef.current !== null) return;
    player.shoot();
    const interval = Math.max(80, 60000 / combatant.weapon.fireRateRPM);
    fireIntervalRef.current = window.setInterval(() => {
      const currentSimulation = simRef.current;
      const currentPlayer = playerRef.current;
      if (
        gameStateRef.current !== 'PLAYING' ||
        !currentPlayer?.sim.playerRef?.isAlive ||
        (currentSimulation?.roundState !== 'LIVE_COMBAT' &&
          currentSimulation?.roundState !== 'BOMB_PLANTED')
      ) {
        stopPlayerFire();
        return;
      }
      currentPlayer.shoot();
    }, interval);
  }, [stopPlayerFire]);

  const plantPlayerClaymore = useCallback(() => {
    const simulation = simRef.current;
    const player = playerRef.current;
    const playerId = simulation?.playerRef?.id;
    if (!simulation || !player || !playerId) return;

    const forward = new THREE.Vector3(0, 0, -1).applyAxisAngle(
      new THREE.Vector3(0, 1, 0),
      player.yaw
    );
    const position = new THREE.Vector3(player.pos.x, 0, player.pos.z).addScaledVector(forward, 1.3);
    simulation.plantClaymore(playerId, position, player.yaw + Math.PI);
  }, []);

  const activatePlayerKillstreak = useCallback((type: KillstreakType) => {
    const playerId = simRef.current?.playerRef?.id;
    if (!playerId || !simRef.current?.activateKillstreak(playerId, type)) return;
    setReadyKillstreaks((ready) => ready.filter((killstreak) => killstreak !== type));
  }, []);

  useEffect(() => {
    const media = window.matchMedia('(pointer: coarse)');
    const updateTouchMode = () => setIsTouchDevice(media.matches || navigator.maxTouchPoints > 0);
    updateTouchMode();
    media.addEventListener('change', updateTouchMode);
    return () => media.removeEventListener('change', updateTouchMode);
  }, []);

  useEffect(() => {
    if (gameState === 'PLAYING' && !isBuyMenuOpen && !isGunsmithOpen && !isMapSelectOpen) return;
    playerRef.current?.releaseInputs();
    setIsAds(false);
    stopPlayerFire();
  }, [gameState, isBuyMenuOpen, isGunsmithOpen, isMapSelectOpen, stopPlayerFire]);

  // Initialize Three.js WebGL & Simulation Engine once
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const envBuilder = envBuilderRef.current;

    // Detect software GL
    const isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();
    const softwareGlRef = { current: isSoftwareGl };

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(fieldOfViewRef.current, window.innerWidth / window.innerHeight, 0.1, 800);
    cameraRef.current = camera;
    scene.add(camera);

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: !isSoftwareGl,
        powerPreference: 'high-performance',
      });
    } catch (error) {
      console.error('Unable to initialize the WebGL renderer', error);
      setWebglError('Ta przeglądarka lub urządzenie nie może uruchomić grafiki WebGL 2.');
      return;
    }
    renderer.setSize(window.innerWidth, window.innerHeight);
    const initialGraphicsProfile = resolveGraphicsProfile(
      graphicsQualityRef.current,
      isSoftwareGl,
      window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
    );
    renderer.setPixelRatio(getRendererPixelRatio(window.devicePixelRatio, initialGraphicsProfile));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = initialGraphicsProfile.shadowsEnabled;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvas.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Studio Environment lighting reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    const roomEnvironment = new RoomEnvironment();
    const environmentTarget = pmremGenerator.fromScene(roomEnvironment, 0.04);
    scene.environment = environmentTarget.texture;
    pmremGenerator.dispose();
    roomEnvironment.dispose();

    // Particle system
    const particles = new ParticleSystem(scene);
    particlesRef.current = particles;

    // Simulation Engine
    const sim = new SimulationEngine(scene, particles);
    sim.botDifficulty = botDifficultyRef.current;
    simRef.current = sim;

    // Environment build
    const initialMap = currentMapRef.current;
    const envData = envBuilder.buildMap(scene, initialMap);
    sim.colliders = envData.colliders;
    sim.bombSiteA = envData.bombSiteA;
    sim.bombSiteB = envData.bombSiteB;
    spawnsVanguardRef.current = envData.spawnPointsVanguard;
    spawnsSyndicateRef.current = envData.spawnPointsSyndicate;

    // Player Controller
    const playerCtrl = new PlayerController(camera, sim);
    playerCtrl.setBaseFieldOfView(fieldOfViewRef.current);
    playerCtrl.setCameraMotion(cameraMotionRef.current);
    playerCtrl.setInvertLookY(invertLookYRef.current);
    playerRef.current = playerCtrl;

    // Init 5v5 Match
    sim.initMatch(initialMap, envData.spawnPointsVanguard, envData.spawnPointsSyndicate);

    // Callbacks for HUD
    sim.onStateChange = (state) => {
      setRoundState(state);
      if (state === 'BUY_PHASE') {
        playerRef.current?.resetForRound();
      }
      if (state === 'MATCH_END') {
        sim.setPaused(false);
        setGameStateSafe('GAMEOVER');
        document.exitPointerLock?.();
      }
    };
    sim.onScoreChange = (vg, sy) => {
      setScoreVanguard(vg);
      setScoreSyndicate(sy);
    };
    sim.onHitConfirmed = (isHeadshot) => {
      setHitmarker({ active: true, isHeadshot });
      if (hitmarkerTimeoutRef.current !== null) {
        window.clearTimeout(hitmarkerTimeoutRef.current);
      }
      hitmarkerTimeoutRef.current = window.setTimeout(() => {
        hitmarkerTimeoutRef.current = null;
        setHitmarker(null);
      }, 180);
    };
    sim.onPlayerDamaged = (hp, attackerPos) => {
      if (cameraRef.current) {
        const toAttacker = attackerPos.clone().sub(cameraRef.current.position);
        toAttacker.y = 0;
        toAttacker.normalize();
        const camDir = new THREE.Vector3();
        cameraRef.current.getWorldDirection(camDir);
        camDir.y = 0;
        camDir.normalize();

        const angle = Math.atan2(
          toAttacker.x * camDir.z - toAttacker.z * camDir.x,
          toAttacker.x * camDir.x + toAttacker.z * camDir.z
        );
        setDamageDirection(angle);
        if (damageDirectionTimeoutRef.current !== null) {
          window.clearTimeout(damageDirectionTimeoutRef.current);
        }
        damageDirectionTimeoutRef.current = window.setTimeout(() => {
          damageDirectionTimeoutRef.current = null;
          setDamageDirection(null);
        }, 600);
      }
    };

    // 60fps Game Simulation Loop using ref to guarantee fresh state
    let animId = 0;
    let lastTime = performance.now();
    let titleAngle = 0;
    let gamepadFireActive = false;
    let gamepadAimActive = false;
    let gamepadReloadActive = false;
    let gamepadJumpActive = false;
    let gamepadCrouchActive = false;
    let gamepadSprintActive = false;
    let gamepadPauseActive = false;

    // The Three.js scene renders every frame regardless, but the React-driven
    // HUD doesn't need to re-render 60x/sec: pushing a fresh combatant array
    // and a fresh player-combatant object into setState every single frame
    // forces a full HUD/Scoreboard re-render on every tick even when nothing
    // the player can see has changed. 30Hz is imperceptible for HUD readouts
    // (ammo, HP, timer, plant/defuse progress) and halves React's work.
    const UI_SYNC_INTERVAL = 1 / 30;
    let uiSyncAccumulator = 0;

    const gameLoop = (now: number) => {
      const rawDt = (now - lastTime) / 1000;
      lastTime = now;
      const dt = Math.min(rawDt, 0.05);

      if (simRef.current && playerRef.current) {
        if (gameStateRef.current === 'PLAYING') {
          const gamepad = document.hasFocus()
            ? navigator.getGamepads?.().find((candidate) => candidate?.connected) ?? null
            : null;
          if (gamepad) {
            const input = readGamepadInput(gamepad, gamepadDeadZoneRef.current);
            playerRef.current.setGamepadMovement(input.moveX, input.moveY);
            playerRef.current.onGamepadLook(
              input.lookX,
              input.lookY,
              dt,
              2.4 * gamepadSensitivityRef.current
            );
            if (input.fire !== gamepadFireActive) {
              gamepadFireActive = input.fire;
              if (input.fire) startPlayerFire('gamepad');
              else stopPlayerFire('gamepad');
            }
            if (input.aim !== gamepadAimActive) {
              gamepadAimActive = input.aim;
              playerRef.current.isAds = input.aim;
              setIsAds(input.aim);
            }
            if (input.reload && !gamepadReloadActive) playerRef.current.startReload();
            if (input.jump && !gamepadJumpActive && playerRef.current.isGrounded) {
              playerRef.current.vel.y = 8.5;
              playerRef.current.isGrounded = false;
            }
            if (input.crouch && !gamepadCrouchActive) {
              if (playerRef.current.isSprinting && playerRef.current.isGrounded) {
                playerRef.current.isSliding = true;
                playerRef.current.slideTimer = 0.85;
              } else {
                playerRef.current.isCrouching = !playerRef.current.isCrouching;
              }
            }
            if (input.sprint && !gamepadSprintActive) {
              playerRef.current.isSprinting =
                sprintModeRef.current === 'toggle'
                  ? !playerRef.current.isSprinting
                  : true;
            }
            if (!input.sprint && gamepadSprintActive && sprintModeRef.current === 'hold') {
              playerRef.current.isSprinting = false;
            }
            playerRef.current.setGamepadInteract(input.interact);
            if (input.pause && !gamepadPauseActive) {
              pauseGame();
            }
            gamepadFireActive = input.fire;
            gamepadAimActive = input.aim;
            gamepadReloadActive = input.reload;
            gamepadJumpActive = input.jump;
            gamepadCrouchActive = input.crouch;
            gamepadSprintActive = input.sprint;
            gamepadPauseActive = input.pause;
          } else {
            playerRef.current.setGamepadMovement(0, 0);
            if (gamepadFireActive) stopPlayerFire('gamepad');
            if (gamepadAimActive) {
              playerRef.current.isAds = false;
              setIsAds(false);
            }
            if (gamepadSprintActive && sprintModeRef.current === 'hold') {
              playerRef.current.isSprinting = false;
            }
            playerRef.current.setGamepadInteract(false);
            gamepadFireActive = false;
            gamepadAimActive = false;
            gamepadReloadActive = false;
            gamepadJumpActive = false;
            gamepadCrouchActive = false;
            gamepadSprintActive = false;
            gamepadPauseActive = false;
          }
          if (gameStateRef.current !== 'PLAYING') {
            stopPlayerFire();
            playerRef.current.releaseInputs();
            gamepadFireActive = false;
            gamepadAimActive = false;
            gamepadReloadActive = false;
            gamepadJumpActive = false;
            gamepadCrouchActive = false;
            gamepadSprintActive = false;
            gamepadPauseActive = false;
          }
          simRef.current.update(dt);
          playerRef.current.update(dt);

          uiSyncAccumulator += dt;
          if (uiSyncAccumulator >= UI_SYNC_INTERVAL) {
            uiSyncAccumulator = 0;

            // Update HUD state values
            setRoundTimer(simRef.current.roundTimer);
            setRoundNumber(simRef.current.roundNumber);
            if (simRef.current.playerRef) {
              setPlayerCombatant({ ...simRef.current.playerRef });
              setIsReloading(playerRef.current?.isReloading ?? false);
              setReloadProgress(playerRef.current?.reloadProgress ?? 0);
              setReadyKillstreaks(
                (['UAV', 'AIRSTRIKE', 'PREDATOR'] as const).filter((type) =>
                  simRef.current?.canActivateKillstreak('player_0', type)
                )
              );
              setIsUavActive(Date.now() < simRef.current.uavActiveUntil);
            }
            setCombatantsList(Array.from(simRef.current.combatants.values()));

            // Check proximity to Bomb Sites & Planted Bomb
            const pPos = playerRef.current.pos;
            const sA = simRef.current.bombSiteA;
            const sB = simRef.current.bombSiteB;
            const nearA = Math.hypot(pPos.x - sA.position.x, pPos.z - sA.position.z) <= sA.radius;
            const nearB = Math.hypot(pPos.x - sB.position.x, pPos.z - sB.position.z) <= sB.radius;
            setIsNearSiteA(nearA);
            setIsNearSiteB(nearB);

            if (simRef.current.plantedBomb) {
              const bPos = simRef.current.plantedBomb.position;
              const nearBomb = Math.hypot(pPos.x - bPos.x, pPos.z - bPos.z) <= 3.5;
              setIsNearPlantedBomb(nearBomb);
            } else {
              setIsNearPlantedBomb(false);
            }

            setPlantProgress(simRef.current.plantProgress);
            setDefuseProgress(simRef.current.defuseProgress);

            // Update spectator target
            if (simRef.current.playerRef && !simRef.current.playerRef.isAlive) {
              const aliveAllies = Array.from(simRef.current.combatants.values()).filter(
                (c) => c.isAlive && c.team === 'VANGUARD'
              );
              if (aliveAllies.length > 0) {
                setSpectatorTarget(aliveAllies[playerRef.current.spectatorIndex % aliveAllies.length]);
              } else {
                setSpectatorTarget(null);
              }
            }
          }
        } else {
          playerRef.current.setGamepadMovement(0, 0);
          playerRef.current.setGamepadInteract(false);
          if (gamepadFireActive) stopPlayerFire();
          if (gamepadAimActive) {
            playerRef.current.isAds = false;
            setIsAds(false);
          }
          gamepadFireActive = false;
          gamepadAimActive = false;
          gamepadReloadActive = false;
          gamepadJumpActive = false;
          gamepadCrouchActive = false;
          gamepadSprintActive = false;
          gamepadPauseActive = false;
        }

        if (gameStateRef.current === 'TITLE') {
          // Atmospheric live-world cinematic camera pan only on Title Screen
          titleAngle += dt * 0.15;
          camera.position.set(Math.cos(titleAngle) * 55, 14, Math.sin(titleAngle) * 55);
          camera.lookAt(0, 4, 0);
        }

        particles.update(dt);
      }

      renderer.render(scene, camera);
      animId = requestAnimationFrame(gameLoop);
    };

    animId = requestAnimationFrame(gameLoop);

    // Window Resize Handler
    const handleResize = () => {
      if (!cameraRef.current || !rendererRef.current) return;
      cameraRef.current.aspect = window.innerWidth / window.innerHeight;
      cameraRef.current.updateProjectionMatrix();
      const profile = resolveGraphicsProfile(
        graphicsQualityRef.current,
        softwareGlRef.current,
        window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0
      );
      rendererRef.current.setPixelRatio(getRendererPixelRatio(window.devicePixelRatio, profile));
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      if (hitmarkerTimeoutRef.current !== null) {
        window.clearTimeout(hitmarkerTimeoutRef.current);
        hitmarkerTimeoutRef.current = null;
      }
      if (damageDirectionTimeoutRef.current !== null) {
        window.clearTimeout(damageDirectionTimeoutRef.current);
        damageDirectionTimeoutRef.current = null;
      }
      sim.dispose();
      playerCtrl.dispose();
      particles.dispose();
      envBuilder.disposeMap(scene);
      scene.environment = null;
      environmentTarget.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === canvas) {
        canvas.removeChild(renderer.domElement);
      }
      if (sceneRef.current === scene) sceneRef.current = null;
      if (cameraRef.current === camera) cameraRef.current = null;
      if (rendererRef.current === renderer) rendererRef.current = null;
      if (simRef.current === sim) simRef.current = null;
      if (playerRef.current === playerCtrl) playerRef.current = null;
      if (particlesRef.current === particles) particlesRef.current = null;
    };
  }, [pauseGame, startPlayerFire, stopPlayerFire]);

  useEffect(() => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    if (!renderer || !scene) return;

    const isSoftwareGl = (() => {
      const gl = renderer.getContext();
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(
        String(gl.getParameter(param))
      );
    })();
    const profile = resolveGraphicsProfile(
      settings.graphicsQuality,
      isSoftwareGl,
      isTouchDevice
    );
    renderer.setPixelRatio(getRendererPixelRatio(window.devicePixelRatio, profile));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = profile.shadowsEnabled;
    scene.traverse((object) => {
      if (!(object instanceof THREE.DirectionalLight) || !object.castShadow) return;
      if (profile.shadowsEnabled) {
        object.shadow.mapSize.set(profile.shadowMapSize, profile.shadowMapSize);
      }
      object.shadow.needsUpdate = true;
    });
  }, [settings.graphicsQuality, isTouchDevice]);

  // Reload map when currentMap changes
  useEffect(() => {
    if (!sceneRef.current || !simRef.current || !playerRef.current) return;
    const envData = envBuilderRef.current.buildMap(sceneRef.current, currentMap);
    simRef.current.colliders = envData.colliders;
    simRef.current.bombSiteA = envData.bombSiteA;
    simRef.current.bombSiteB = envData.bombSiteB;
    spawnsVanguardRef.current = envData.spawnPointsVanguard;
    spawnsSyndicateRef.current = envData.spawnPointsSyndicate;

    simRef.current.initMatch(currentMap, envData.spawnPointsVanguard, envData.spawnPointsSyndicate);
    playerRef.current.pos.copy(envData.spawnPointsVanguard[2]);
    playerRef.current.setupWeaponModel();
  }, [currentMap]);

  // Input Event Handlers
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Tab') {
        if (gameStateRef.current !== 'PLAYING') return;
        e.preventDefault();
        setIsScoreboardOpen((prev) => !prev);
        return;
      }

      if (
        gameStateRef.current === 'PLAYING' &&
        roundState === 'BUY_PHASE' &&
        !e.repeat &&
        getActionForKey(settings.keyBindings, e.code) === 'buyMenu'
      ) {
        e.preventDefault();
        setIsBuyMenuOpen((prev) => !prev);
        if (!isBuyMenuOpen) document.exitPointerLock?.();
        return;
      }

      if (e.code === 'Escape' && !e.repeat) {
        if (gameStateRef.current === 'PAUSED') {
          resumeGame();
          return;
        }
        if (isBuyMenuOpen) {
          setIsBuyMenuOpen(false);
          return;
        }
        if (isGunsmithOpen) {
          setIsGunsmithOpen(false);
          return;
        }
        if (isMapSelectOpen) {
          setIsMapSelectOpen(false);
          return;
        }
        if (gameStateRef.current === 'PLAYING') {
          pauseGame();
          return;
        }
      }

      if (gameStateRef.current !== 'PLAYING') return;

      if (playerRef.current) {
        const action = getActionForKey(settings.keyBindings, e.code);
        if (action) e.preventDefault();
        const mappedKey = action ? MOVEMENT_KEY_FOR_ACTION[action] : undefined;
        if (mappedKey) playerRef.current.keys[mappedKey] = true;

        if (action === 'sprint') {
          if (settings.sprintMode === 'toggle') {
            if (!e.repeat) {
              playerRef.current.isSprinting = updateSprintState(
                playerRef.current.isSprinting,
                settings.sprintMode,
                true
              );
            }
          } else {
            playerRef.current.isSprinting = updateSprintState(
              playerRef.current.isSprinting,
              settings.sprintMode,
              true
            );
          }
        }
        if (action === 'crouch' && !e.repeat) {
          if (playerRef.current.isSprinting && playerRef.current.isGrounded) {
            playerRef.current.isSliding = true;
            playerRef.current.slideTimer = 0.85;
          } else {
            playerRef.current.isCrouching = !playerRef.current.isCrouching;
          }
        }
        if (action === 'jump' && !e.repeat) {
          if (playerCombatant?.isAlive) {
            if (playerRef.current.isGrounded) {
              playerRef.current.vel.y = 8.5;
              playerRef.current.isGrounded = false;
              Sound.playFootstep('concrete');
            }
          } else {
            playerRef.current.cycleSpectatorTarget();
          }
        }
        if (action === 'reload' && !e.repeat) {
          playerRef.current.startReload();
        }
        if (action === 'inspect' && !e.repeat) {
          playerRef.current.triggerInspect();
        }
        if (action === 'frag' && !e.repeat) throwPlayerGrenade('frag');
        if (action === 'smoke' && !e.repeat) throwPlayerGrenade('smoke');
        if (action === 'flashbang' && !e.repeat) throwPlayerGrenade('flashbang');
        if (action === 'claymore' && !e.repeat) plantPlayerClaymore();
        if (action === 'uav' && !e.repeat) activatePlayerKillstreak('UAV');
        if (action === 'airstrike' && !e.repeat) activatePlayerKillstreak('AIRSTRIKE');
        if (action === 'predator' && !e.repeat) activatePlayerKillstreak('PREDATOR');
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (playerRef.current) {
        const action = getActionForKey(settings.keyBindings, e.code);
        const mappedKey = action ? MOVEMENT_KEY_FOR_ACTION[action] : undefined;
        if (mappedKey) playerRef.current.keys[mappedKey] = false;
        if (action === 'sprint') {
          playerRef.current.isSprinting = updateSprintState(
            playerRef.current.isSprinting,
            settings.sprintMode,
            false
          );
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement && playerRef.current) {
        playerRef.current.onMouseMove(
          e.movementX,
          e.movementY,
          0.0022 *
            getLookSensitivity(settings.mouseSensitivity, playerRef.current.isAds, settings.adsSensitivity)
        );
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (isTouchDevice || gameStateRef.current !== 'PLAYING') return;

      if (!document.pointerLockElement) {
        if (!isBuyMenuOpen && !isGunsmithOpen && !isMapSelectOpen) {
          canvasRef.current?.requestPointerLock();
        }
        return;
      }

      if (e.button === 0) {
        startPlayerFire('mouse');
      } else if (e.button === 2) {
        // Aim Down Sights (ADS)
        if (playerRef.current) {
          playerRef.current.isAds = true;
          setIsAds(true);
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 0) {
        stopPlayerFire('mouse');
      } else if (e.button === 2) {
        if (playerRef.current) {
          playerRef.current.isAds = false;
          setIsAds(false);
        }
      }
    };

    const releaseInputs = () => {
      stopPlayerFire();
      playerRef.current?.releaseInputs();
      setIsAds(false);
    };
    const onVisibilityChange = () => {
      if (document.hidden) releaseInputs();
    };
    const onPointerLockChange = () => {
      if (!document.pointerLockElement) releaseInputs();
    };
    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('blur', releaseInputs);
    document.addEventListener('visibilitychange', onVisibilityChange);
    document.addEventListener('pointerlockchange', onPointerLockChange);
    window.addEventListener('contextmenu', onContextMenu);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('blur', releaseInputs);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      document.removeEventListener('pointerlockchange', onPointerLockChange);
      window.removeEventListener('contextmenu', onContextMenu);
      stopPlayerFire();
    };
  }, [gameState, isBuyMenuOpen, isGunsmithOpen, isMapSelectOpen, roundState, playerCombatant?.isAlive, isTouchDevice, settings.mouseSensitivity, settings.adsSensitivity, settings.keyBindings, settings.sprintMode, throwPlayerGrenade, activatePlayerKillstreak, plantPlayerClaymore, startPlayerFire, stopPlayerFire, pauseGame, resumeGame]);

  const startGame = () => {
    Sound.init();
    if (simRef.current && spawnsVanguardRef.current.length > 0) {
      simRef.current.initMatch(currentMap, spawnsVanguardRef.current, spawnsSyndicateRef.current);
      simRef.current.setPaused(false);
      setRoundState(simRef.current.roundState);
      setRoundTimer(simRef.current.roundTimer);
      setRoundNumber(simRef.current.roundNumber);
      setScoreVanguard(simRef.current.scoreVanguard);
      setScoreSyndicate(simRef.current.scoreSyndicate);
      setCombatantsList(Array.from(simRef.current.combatants.values()));
      setPlayerCombatant(simRef.current.playerRef ? { ...simRef.current.playerRef } : null);
      setReadyKillstreaks([]);
      setIsUavActive(false);
      setSpectatorTarget(null);
    }
    gameStateRef.current = 'PLAYING';
    setGameState('PLAYING');

    if (playerRef.current && simRef.current) {
      const spawn = spawnsVanguardRef.current[2] || new THREE.Vector3(0, 1.75, 48);
      playerRef.current.pos.set(spawn.x, 1.75, spawn.z);
      playerRef.current.vel.set(0, 0, 0);
      playerRef.current.yaw = 0;
      playerRef.current.pitch = 0;
      playerRef.current.isGrounded = true;
      playerRef.current.isInspecting = false;
      playerRef.current.keys = {};
      playerRef.current.resetForRound();
      playerRef.current.setupWeaponModel();

      if (cameraRef.current) {
        cameraRef.current.position.set(spawn.x, 1.75, spawn.z);
        cameraRef.current.quaternion.set(0, 0, 0, 1);
      }
    }

    if (!isTouchDevice) canvasRef.current?.requestPointerLock();
  };

  const handleMobileMovement = (keys: { KeyW: boolean; KeyA: boolean; KeyS: boolean; KeyD: boolean }) => {
    if (playerRef.current) Object.assign(playerRef.current.keys, keys);
  };

  const handleMobileFire = (active: boolean) => {
    if (active) startPlayerFire('touch');
    else stopPlayerFire('touch');
  };

  const handleMobileJump = () => {
    if (!playerRef.current) return;
    if (playerRef.current.sim.playerRef?.isAlive) {
      if (playerRef.current.isGrounded) {
        playerRef.current.vel.y = 8.5;
        playerRef.current.isGrounded = false;
        Sound.playFootstep('concrete');
      }
    } else {
      playerRef.current.cycleSpectatorTarget();
    }
  };

  const handleMobileAction = (active: boolean) => {
    const simulation = simRef.current;
    const player = simulation?.playerRef;
    if (!simulation || !player) return;
    if (!active) {
      if (simulation.defusingCombatantId === player.id) simulation.cancelDefusing();
      return;
    }
    if (!player.isAlive || !simulation.plantedBomb || !simulation.isInDefuseRange(player)) return;
    simulation.startDefusing(player.id);
  };

  const handleBuyWeapon = (weapon: WeaponStats) => {
    if (!simRef.current || !playerRef.current) return;
    const success = simRef.current.buyItem('player_0', weapon.id, 'BUY_WEAPON');
    if (success) {
      playerRef.current.setupWeaponModel();
      setPlayerCombatant(simRef.current.playerRef ? { ...simRef.current.playerRef } : null);
    }
  };

  const handleBuyArmor = () => {
    if (!simRef.current) return;
    const success = simRef.current.buyItem('player_0', 'armor', 'BUY_ARMOR');
    if (success && simRef.current.playerRef) {
      setPlayerCombatant({ ...simRef.current.playerRef });
    }
  };

  const handleBuyDefuseKit = () => {
    if (!simRef.current) return;
    const success = simRef.current.buyItem('player_0', 'defuse_kit', 'BUY_DEFUSE_KIT');
    if (success && simRef.current.playerRef) {
      setPlayerCombatant({ ...simRef.current.playerRef });
    }
  };

  const handleApplyAttachments = (attachments: WeaponAttachmentConfig) => {
    setCustomAttachments(attachments);
    if (playerRef.current) {
      playerRef.current.currentAttachments = attachments;
      playerRef.current.setupWeaponModel();
    }
  };

  const handleRematch = () => {
    if (simRef.current && spawnsVanguardRef.current.length > 0) {
      simRef.current.initMatch(currentMap, spawnsVanguardRef.current, spawnsSyndicateRef.current);
      simRef.current.setPaused(false);
      const spawn = spawnsVanguardRef.current[2];
      playerRef.current?.pos.copy(spawn);
      playerRef.current?.resetForRound();
      playerRef.current?.setupWeaponModel();
      setRoundState(simRef.current.roundState);
      setRoundTimer(simRef.current.roundTimer);
      setRoundNumber(simRef.current.roundNumber);
      setScoreVanguard(simRef.current.scoreVanguard);
      setScoreSyndicate(simRef.current.scoreSyndicate);
      setPlayerCombatant(simRef.current.playerRef ? { ...simRef.current.playerRef } : null);
      setIsAds(false);
      setIsReloading(false);
      setReloadProgress(0);
      setHitmarker(null);
      setDamageDirection(null);
      setIsNearSiteA(false);
      setIsNearSiteB(false);
      setIsNearPlantedBomb(false);
      setPlantProgress(0);
      setDefuseProgress(0);
      setCombatantsList(Array.from(simRef.current.combatants.values()));
      setReadyKillstreaks([]);
      setIsUavActive(false);
      setSpectatorTarget(null);
      gameStateRef.current = 'PLAYING';
      setGameState('PLAYING');
      if (!isTouchDevice) canvasRef.current?.requestPointerLock();
    }
  };

  const toggleMute = () => {
    setSettings((current) => ({ ...current, isMuted: !current.isMuted }));
  };

  const handleBotDifficultyChange = (difficulty: BotDifficulty) => {
    botDifficultyRef.current = difficulty;
    setBotDifficulty(difficulty);
    if (simRef.current) simRef.current.botDifficulty = difficulty;
  };

  const handleMapSelect = (map: MapId) => {
    currentMapRef.current = map;
    setCurrentMap(map);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none font-sans">
      {webglError && (
        <div role="alert" className="fixed inset-0 z-[100] flex items-center justify-center bg-zinc-950 p-6 text-center text-white">
          <div className="max-w-lg">
            <h1 className="text-2xl font-black">Nie można uruchomić gry</h1>
            <p className="mt-3 text-sm text-zinc-300">{webglError}</p>
            <p className="mt-2 text-sm text-zinc-400">
              Włącz akcelerację sprzętową lub otwórz grę w aktualnej przeglądarce obsługującej WebGL 2.
            </p>
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="mt-6 rounded-lg bg-amber-500 px-5 py-3 text-sm font-black text-zinc-950 hover:bg-amber-400"
            >
              SPRÓBUJ PONOWNIE
            </button>
          </div>
        </div>
      )}
      {/* 1. Isolated WebGL Canvas Container */}
      <div
        ref={canvasRef}
        onClick={() => {
          if (!isTouchDevice && gameStateRef.current === 'PLAYING' && !isBuyMenuOpen && !isGunsmithOpen && !isMapSelectOpen) {
            canvasRef.current?.requestPointerLock();
          }
        }}
        className="absolute inset-0 z-0 cursor-crosshair"
      />

      {/* 2. Title Screen State */}
      {gameState === 'TITLE' && (
        <TitleScreen
          onStartGame={startGame}
          onOpenGunsmith={() => setIsGunsmithOpen(true)}
          onOpenMapSelect={() => setIsMapSelectOpen(true)}
          currentMap={currentMap}
          botDifficulty={botDifficulty}
          onBotDifficultyChange={handleBotDifficultyChange}
          isMuted={isMuted}
          onToggleMute={toggleMute}
          mouseSensitivity={settings.mouseSensitivity}
          masterVolume={settings.masterVolume}
          onMouseSensitivityChange={(mouseSensitivity) =>
            setSettings((current) => ({ ...current, mouseSensitivity }))
          }
          onMasterVolumeChange={(masterVolume) =>
            setSettings((current) => ({ ...current, masterVolume }))
          }
          graphicsQuality={settings.graphicsQuality}
          onGraphicsQualityChange={(graphicsQuality: GraphicsQuality) =>
            setSettings((current) => ({ ...current, graphicsQuality }))
          }
          keyBindings={settings.keyBindings}
          onKeyBindingsChange={(keyBindings: GameKeyBindings) =>
            setSettings((current) => ({ ...current, keyBindings }))
          }
          crosshair={settings.crosshair}
          onCrosshairChange={(crosshair) =>
            setSettings((current) => ({ ...current, crosshair }))
          }
          audioMix={settings.audioMix}
          onAudioMixChange={(audioMix) => setSettings((current) => ({ ...current, audioMix }))}
          fieldOfView={settings.fieldOfView}
          onFieldOfViewChange={(fieldOfView) =>
            setSettings((current) => ({ ...current, fieldOfView }))
          }
          cameraMotion={settings.cameraMotion}
          onCameraMotionChange={(cameraMotion) =>
            setSettings((current) => ({ ...current, cameraMotion }))
          }
          adsSensitivity={settings.adsSensitivity}
          onAdsSensitivityChange={(adsSensitivity) =>
            setSettings((current) => ({ ...current, adsSensitivity }))
          }
          invertLookY={settings.invertLookY}
          onInvertLookYChange={(invertLookY) =>
            setSettings((current) => ({ ...current, invertLookY }))
          }
          sprintMode={settings.sprintMode}
          onSprintModeChange={(sprintMode) =>
            setSettings((current) => ({ ...current, sprintMode }))
          }
          gamepadSensitivity={settings.gamepadSensitivity}
          onGamepadSensitivityChange={(gamepadSensitivity) =>
            setSettings((current) => ({ ...current, gamepadSensitivity }))
          }
          gamepadDeadZone={settings.gamepadDeadZone}
          onGamepadDeadZoneChange={(gamepadDeadZone) =>
            setSettings((current) => ({ ...current, gamepadDeadZone }))
          }
          reduceVisualEffects={settings.reduceVisualEffects}
          onReduceVisualEffectsChange={(reduceVisualEffects) =>
            setSettings((current) => ({ ...current, reduceVisualEffects }))
          }
        />
      )}

      {/* 3. In-Game HUD Overlay */}
      {gameState === 'PLAYING' && (
        <HUD
          player={playerCombatant}
          roundState={roundState}
          roundTimer={roundTimer}
          roundNumber={roundNumber}
          scoreVanguard={scoreVanguard}
          scoreSyndicate={scoreSyndicate}
          killfeed={simRef.current?.killfeed ?? []}
          combatants={combatantsList}
          isAds={isAds}
          isReloading={isReloading}
          reloadProgress={reloadProgress}
          hitmarker={hitmarker}
          damageDirection={damageDirection}
          flashUntil={playerCombatant?.isFlashedUntil}
          readyKillstreaks={isTouchDevice ? [] : readyKillstreaks}
          onActivateKillstreak={activatePlayerKillstreak}
          isUavActive={isUavActive}
          onOpenBuyMenu={() => {
            setIsBuyMenuOpen(true);
            document.exitPointerLock?.();
          }}
          spectatorTarget={spectatorTarget}
          onCycleSpectator={() => playerRef.current?.cycleSpectatorTarget()}
          zoneName={
            currentMap === 'winter_village'
              ? 'GÓRSKA WIOSKA — PRZEŁĘCZ B'
              : currentMap === 'night_docks'
              ? 'DOKI PRZEMYSŁOWE — SEKTOR C'
              : 'STREFA PRZEMYSŁOWA — BRAMA GŁÓWNA'
          }
          bombSiteA={simRef.current ? { x: simRef.current.bombSiteA.position.x, z: simRef.current.bombSiteA.position.z } : undefined}
          bombSiteB={simRef.current ? { x: simRef.current.bombSiteB.position.x, z: simRef.current.bombSiteB.position.z } : undefined}
          isNearSiteA={isNearSiteA}
          isNearSiteB={isNearSiteB}
          isNearPlantedBomb={isNearPlantedBomb}
          plantProgress={plantProgress}
          defuseProgress={defuseProgress}
          onInspectWeapon={() => playerRef.current?.triggerInspect()}
          onPause={pauseGame}
          crosshair={settings.crosshair}
          reduceVisualEffects={settings.reduceVisualEffects}
        />
      )}

      {gameState === 'PAUSED' && (
        <PauseMenu onResume={resumeGame} onReturnToMenu={returnToTitle} />
      )}

      {gameState === 'PLAYING' && isTouchDevice && !isBuyMenuOpen && !isGunsmithOpen && !isMapSelectOpen && (
        <MobileControls
          actionLabel={isNearPlantedBomb && roundState === 'BOMB_PLANTED' ? 'ROZBRAJAJ' : undefined}
          onMovementChange={handleMobileMovement}
          onLook={(dx, dy) =>
            playerRef.current?.onMouseMove(
              dx,
              dy,
              0.0035 *
                getLookSensitivity(
                  settings.mouseSensitivity,
                  playerRef.current?.isAds ?? false,
                  settings.adsSensitivity
                )
            )
          }
          onFire={handleMobileFire}
          fragGrenades={playerCombatant?.fragGrenades ?? 0}
          smokeGrenades={playerCombatant?.smokeGrenades ?? 0}
          flashbangs={playerCombatant?.flashbangs ?? 0}
          claymores={playerCombatant?.claymores ?? 0}
          onFragGrenade={() => throwPlayerGrenade('frag')}
          onSmokeGrenade={() => throwPlayerGrenade('smoke')}
          onFlashbang={() => throwPlayerGrenade('flashbang')}
          onPlantClaymore={plantPlayerClaymore}
          readyKillstreaks={readyKillstreaks}
          onActivateKillstreak={activatePlayerKillstreak}
          onReload={() => playerRef.current?.startReload()}
          onJump={handleMobileJump}
          onSprint={(active) => {
            if (!playerRef.current) return;
            if (settings.sprintMode === 'toggle') {
              playerRef.current.isSprinting = updateSprintState(
                playerRef.current.isSprinting,
                settings.sprintMode,
                active
              );
            } else {
              playerRef.current.isSprinting = updateSprintState(
                playerRef.current.isSprinting,
                settings.sprintMode,
                active
              );
            }
          }}
          onAim={(active) => {
            if (playerRef.current) playerRef.current.isAds = active;
            setIsAds(active);
          }}
          onAction={handleMobileAction}
        />
      )}

      {/* 4. Buy Menu Modal */}
      {isBuyMenuOpen && (
        <BuyMenu
          cash={playerCombatant?.cash ?? 1000}
          remainingTime={roundTimer}
          armor={playerCombatant?.armor ?? 100}
          hasHelmet={playerCombatant?.hasHelmet ?? true}
          hasDefuseKit={playerCombatant?.hasDefuseKit ?? false}
          onBuyWeapon={handleBuyWeapon}
          onBuyArmor={handleBuyArmor}
          onBuyDefuseKit={handleBuyDefuseKit}
          onClose={() => {
            setIsBuyMenuOpen(false);
            if (!isTouchDevice && gameStateRef.current === 'PLAYING') canvasRef.current?.requestPointerLock();
          }}
        />
      )}

      {/* 5. 5v5 Scoreboard Modal */}
      {isScoreboardOpen && (
        <Scoreboard
          combatants={combatantsList}
          scoreVanguard={scoreVanguard}
          scoreSyndicate={scoreSyndicate}
          roundNumber={roundNumber}
        />
      )}

      {/* 6. Gunsmith 3D Customization Modal */}
      {isGunsmithOpen && (
        <GunsmithModal
          currentWeapon={playerCombatant?.weapon ?? WEAPON_REGISTRY.m4a1}
          currentAttachments={customAttachments}
          onApplyAttachments={handleApplyAttachments}
          onClose={() => setIsGunsmithOpen(false)}
        />
      )}

      {/* 7. Map Selector Modal */}
      {isMapSelectOpen && (
        <MapSelectModal
          currentMap={currentMap}
          onSelectMap={handleMapSelect}
          onClose={() => setIsMapSelectOpen(false)}
        />
      )}

      {/* 8. Game Over / Match End Screen */}
      {gameState === 'GAMEOVER' && (
        <GameOverModal
          winner={scoreVanguard > scoreSyndicate ? 'VANGUARD' : 'SYNDICATE'}
          scoreVanguard={scoreVanguard}
          scoreSyndicate={scoreSyndicate}
          mvp={simRef.current?.mvpCombatant ?? null}
          player={simRef.current?.playerRef ?? playerCombatant}
          combatants={
            simRef.current
              ? Array.from(simRef.current.combatants.values())
              : combatantsList
          }
          map={currentMap}
          elapsedSeconds={simRef.current?.elapsedMatchTime ?? 0}
          endReason={simRef.current?.roundEndReason ?? ''}
          onRematch={handleRematch}
          onReturnToMenu={() => setGameStateSafe('TITLE')}
        />
      )}
    </div>
  );
}
