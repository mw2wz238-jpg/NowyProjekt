import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { MapId, RoundState, WeaponStats, WeaponAttachmentConfig, Combatant } from './types/game';
import { Materials } from './engine/materials';
import { EnvironmentBuilder } from './engine/environment';
import { ParticleSystem } from './engine/particles';
import { SimulationEngine } from './engine/simulation';
import { PlayerController } from './engine/player';
import { Sound } from './engine/audio';
import { WEAPON_REGISTRY, DEFAULT_ATTACHMENTS } from './engine/weapons';

import { TitleScreen } from './components/TitleScreen';
import { HUD } from './components/HUD';
import { BuyMenu } from './components/BuyMenu';
import { Scoreboard } from './components/Scoreboard';
import { GunsmithModal } from './components/GunsmithModal';
import { MapSelectModal } from './components/MapSelectModal';
import { GameOverModal } from './components/GameOverModal';

export default function App() {
  const canvasRef = useRef<HTMLDivElement>(null);

  // High-level App State with ref to avoid stale closures in animation loop
  const [gameState, setGameState] = useState<'TITLE' | 'PLAYING' | 'GAMEOVER'>('TITLE');
  const gameStateRef = useRef<'TITLE' | 'PLAYING' | 'GAMEOVER'>('TITLE');
  const [currentMap, setCurrentMap] = useState<MapId>('industrial');
  const [isMuted, setIsMuted] = useState<boolean>(false);

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
  const [hitmarker, setHitmarker] = useState<{ active: boolean; isHeadshot: boolean } | null>(null);
  const [damageDirection, setDamageDirection] = useState<number | null>(null);
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

  const spawnsVanguardRef = useRef<THREE.Vector3[]>([]);
  const spawnsSyndicateRef = useRef<THREE.Vector3[]>([]);

  const setGameStateSafe = (state: 'TITLE' | 'PLAYING' | 'GAMEOVER') => {
    gameStateRef.current = state;
    setGameState(state);
  };

  // Initialize Three.js WebGL & Simulation Engine once
  useEffect(() => {
    if (!canvasRef.current) return;

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

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 800);
    cameraRef.current = camera;
    scene.add(camera);

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.15;
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    canvasRef.current.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    // Studio Environment lighting reflection
    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // Particle system
    const particles = new ParticleSystem(scene);
    particlesRef.current = particles;

    // Simulation Engine
    const sim = new SimulationEngine(scene, particles);
    simRef.current = sim;

    // Environment build
    const envData = envBuilderRef.current.buildMap(scene, currentMap);
    sim.colliders = envData.colliders;
    sim.bombSiteA = envData.bombSiteA;
    sim.bombSiteB = envData.bombSiteB;
    spawnsVanguardRef.current = envData.spawnPointsVanguard;
    spawnsSyndicateRef.current = envData.spawnPointsSyndicate;

    // Player Controller
    const playerCtrl = new PlayerController(camera, sim);
    playerRef.current = playerCtrl;

    // Init 5v5 Match
    sim.initMatch(currentMap, envData.spawnPointsVanguard, envData.spawnPointsSyndicate);

    // Callbacks for HUD
    sim.onStateChange = (state) => {
      setRoundState(state);
      if (state === 'MATCH_END') {
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
      setTimeout(() => setHitmarker(null), 180);
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
        setTimeout(() => setDamageDirection(null), 600);
      }
    };

    // 60fps Game Simulation Loop using ref to guarantee fresh state
    let animId = 0;
    let lastTime = performance.now();
    let titleAngle = 0;

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
        } else if (gameStateRef.current === 'TITLE') {
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
      rendererRef.current.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', handleResize);
      renderer.dispose();
      if (canvasRef.current && renderer.domElement) {
        canvasRef.current.removeChild(renderer.domElement);
      }
    };
  }, []);

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
        e.preventDefault();
        setIsScoreboardOpen((prev) => !prev);
        return;
      }

      if (e.code === 'KeyB') {
        if (gameStateRef.current === 'PLAYING' && roundState === 'BUY_PHASE') {
          setIsBuyMenuOpen((prev) => !prev);
          if (!isBuyMenuOpen) document.exitPointerLock?.();
          return;
        }
      }

      if (e.code === 'Escape') {
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
          setGameStateSafe('TITLE');
          document.exitPointerLock?.();
          return;
        }
      }

      if (gameStateRef.current !== 'PLAYING') return;

      if (playerRef.current) {
        playerRef.current.keys[e.code] = true;

        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          playerRef.current.isSprinting = true;
        }
        if (e.code === 'KeyC' || e.code === 'ControlLeft') {
          if (playerRef.current.isSprinting && playerRef.current.isGrounded) {
            playerRef.current.isSliding = true;
            playerRef.current.slideTimer = 0.85;
          } else {
            playerRef.current.isCrouching = !playerRef.current.isCrouching;
          }
        }
        if (e.code === 'Space') {
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
        if (e.code === 'KeyR') {
          playerRef.current.startReload();
        }
        if (e.code === 'KeyY' || e.code === 'KeyI') {
          // Trigger Weapon Inspection
          playerRef.current.triggerInspect();
        }
        if (e.code === 'KeyG') {
          // Toss Frag Grenade
          if (cameraRef.current && simRef.current && playerRef.current) {
            const dir = new THREE.Vector3();
            cameraRef.current.getWorldDirection(dir);
            simRef.current.throwGrenade(
              playerRef.current.sim.playerRef?.id ?? 'player_0',
              'frag',
              playerRef.current.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
              dir
            );
          }
        }
        if (e.code === 'KeyF') {
          // Toss Smoke Grenade
          if (cameraRef.current && simRef.current && playerRef.current) {
            const dir = new THREE.Vector3();
            cameraRef.current.getWorldDirection(dir);
            simRef.current.throwGrenade(
              playerRef.current.sim.playerRef?.id ?? 'player_0',
              'smoke',
              playerRef.current.pos.clone().add(new THREE.Vector3(0, 1.4, 0)),
              dir
            );
          }
        }
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (playerRef.current) {
        playerRef.current.keys[e.code] = false;
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          playerRef.current.isSprinting = false;
        }
      }
    };

    const onMouseMove = (e: MouseEvent) => {
      if (document.pointerLockElement && playerRef.current) {
        playerRef.current.onMouseMove(e.movementX, e.movementY);
      }
    };

    const onMouseDown = (e: MouseEvent) => {
      if (gameStateRef.current !== 'PLAYING') return;

      if (!document.pointerLockElement) {
        if (!isBuyMenuOpen && !isGunsmithOpen && !isMapSelectOpen) {
          canvasRef.current?.requestPointerLock();
        }
        return;
      }

      if (e.button === 0) {
        // Fire Weapon
        playerRef.current?.shoot();
      } else if (e.button === 2) {
        // Aim Down Sights (ADS)
        if (playerRef.current) {
          playerRef.current.isAds = true;
          setIsAds(true);
        }
      }
    };

    const onMouseUp = (e: MouseEvent) => {
      if (e.button === 2) {
        if (playerRef.current) {
          playerRef.current.isAds = false;
          setIsAds(false);
        }
      }
    };

    const onContextMenu = (e: MouseEvent) => e.preventDefault();

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mousedown', onMouseDown);
    window.addEventListener('mouseup', onMouseUp);
    window.addEventListener('contextmenu', onContextMenu);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mousedown', onMouseDown);
      window.removeEventListener('mouseup', onMouseUp);
      window.removeEventListener('contextmenu', onContextMenu);
    };
  }, [gameState, isBuyMenuOpen, isGunsmithOpen, isMapSelectOpen, roundState, playerCombatant?.isAlive]);

  const startGame = () => {
    Sound.init();
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
      playerRef.current.setupWeaponModel();

      if (cameraRef.current) {
        cameraRef.current.position.set(spawn.x, 1.75, spawn.z);
        cameraRef.current.quaternion.set(0, 0, 0, 1);
      }
    }

    canvasRef.current?.requestPointerLock();
  };

  const handleBuyWeapon = (weapon: WeaponStats) => {
    if (!simRef.current || !playerRef.current) return;
    const success = simRef.current.buyItem('player_0', weapon.id, weapon.price, 'BUY_WEAPON');
    if (success) {
      playerRef.current.setupWeaponModel();
      setPlayerCombatant(simRef.current.playerRef ? { ...simRef.current.playerRef } : null);
    }
  };

  const handleBuyArmor = () => {
    if (!simRef.current) return;
    const success = simRef.current.buyItem('player_0', 'armor', 1000, 'BUY_ARMOR');
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
      gameStateRef.current = 'PLAYING';
      setGameState('PLAYING');
      canvasRef.current?.requestPointerLock();
    }
  };

  const toggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    Sound.setMuted(nextMuted);
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-black select-none font-sans">
      {/* 1. Isolated WebGL Canvas Container */}
      <div
        ref={canvasRef}
        onClick={() => {
          if (gameStateRef.current === 'PLAYING' && !isBuyMenuOpen && !isGunsmithOpen && !isMapSelectOpen) {
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
          isMuted={isMuted}
          onToggleMute={toggleMute}
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
          hitmarker={hitmarker}
          damageDirection={damageDirection}
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
        />
      )}

      {/* 4. Buy Menu Modal */}
      {isBuyMenuOpen && (
        <BuyMenu
          cash={playerCombatant?.cash ?? 1000}
          remainingTime={roundTimer}
          onBuyWeapon={handleBuyWeapon}
          onBuyArmor={handleBuyArmor}
          onClose={() => {
            setIsBuyMenuOpen(false);
            if (gameStateRef.current === 'PLAYING') canvasRef.current?.requestPointerLock();
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
          onSelectMap={(id) => setCurrentMap(id)}
          onClose={() => setIsMapSelectOpen(false)}
        />
      )}

      {/* 8. Game Over / Match End Screen */}
      {gameState === 'GAMEOVER' && (
        <GameOverModal
          winner={scoreVanguard >= 13 ? 'VANGUARD' : 'SYNDICATE'}
          scoreVanguard={scoreVanguard}
          scoreSyndicate={scoreSyndicate}
          mvp={simRef.current?.mvpCombatant ?? null}
          player={playerCombatant}
          onRematch={handleRematch}
        />
      )}
    </div>
  );
}
