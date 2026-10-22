import React, { useRef, useState } from 'react';
import { PointerHoldState } from './PointerHoldState';
import { KillstreakType } from '../types/game';

type MovementKeys = {
  KeyW: boolean;
  KeyA: boolean;
  KeyS: boolean;
  KeyD: boolean;
};

interface MobileControlsProps {
  actionLabel?: string;
  onMovementChange: (keys: MovementKeys) => void;
  onLook: (dx: number, dy: number) => void;
  onFire: (active: boolean) => void;
  fragGrenades: number;
  smokeGrenades: number;
  flashbangs: number;
  claymores: number;
  onFlashbang: () => void;
  onFragGrenade: () => void;
  onSmokeGrenade: () => void;
  onPlantClaymore: () => void;
  readyKillstreaks: KillstreakType[];
  onActivateKillstreak: (type: KillstreakType) => void;
  onReload: () => void;
  onJump: () => void;
  onSprint: (active: boolean) => void;
  onAim: (active: boolean) => void;
  onAction: (active: boolean) => void;
}

const EMPTY_MOVEMENT: MovementKeys = { KeyW: false, KeyA: false, KeyS: false, KeyD: false };
const JOYSTICK_RADIUS = 44;

export const MobileControls: React.FC<MobileControlsProps> = ({
  actionLabel,
  onMovementChange,
  onLook,
  onFire,
  fragGrenades,
  smokeGrenades,
  flashbangs,
  claymores,
  onFlashbang,
  onFragGrenade,
  onSmokeGrenade,
  onPlantClaymore,
  readyKillstreaks,
  onActivateKillstreak,
  onReload,
  onJump,
  onSprint,
  onAim,
  onAction,
}) => {
  const joystickPointer = useRef<number | null>(null);
  const lookPointer = useRef<number | null>(null);
  const previousLook = useRef<{ x: number; y: number } | null>(null);
  const fireHold = useRef(new PointerHoldState());
  const aimHold = useRef(new PointerHoldState());
  const sprintHold = useRef(new PointerHoldState());
  const actionHold = useRef(new PointerHoldState());
  const [stickPosition, setStickPosition] = useState({ x: 0, y: 0 });

  const updateJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const centerX = bounds.left + bounds.width / 2;
    const centerY = bounds.top + bounds.height / 2;
    const dx = event.clientX - centerX;
    const dy = event.clientY - centerY;
    const length = Math.hypot(dx, dy);
    const scale = length > JOYSTICK_RADIUS ? JOYSTICK_RADIUS / length : 1;
    const x = dx * scale;
    const y = dy * scale;

    setStickPosition({ x, y });
    onMovementChange({
      KeyW: y < -12,
      KeyA: x < -12,
      KeyS: y > 12,
      KeyD: x > 12,
    });
  };

  const endJoystick = (event: React.PointerEvent<HTMLDivElement>) => {
    if (joystickPointer.current !== event.pointerId) return;
    joystickPointer.current = null;
    setStickPosition({ x: 0, y: 0 });
    onMovementChange(EMPTY_MOVEMENT);
  };

  const beginHold = (
    event: React.PointerEvent<HTMLButtonElement>,
    hold: PointerHoldState,
    callback: (active: boolean) => void
  ) => {
    event.preventDefault();
    event.stopPropagation();
    if (!hold.begin(event.pointerId)) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    callback(true);
  };

  const endHold = (
    event: React.PointerEvent<HTMLButtonElement>,
    hold: PointerHoldState,
    callback: (active: boolean) => void
  ) => {
    if (!hold.end(event.pointerId)) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    callback(false);
  };

  const buttonClass =
    'pointer-events-auto flex h-14 min-w-14 touch-none items-center justify-center rounded-full border border-white/35 bg-zinc-950/75 px-3 text-[10px] font-black tracking-wide text-white shadow-lg backdrop-blur active:scale-95 active:bg-amber-500 active:text-black';

  return (
    <div className="pointer-events-none fixed inset-0 z-40 select-none">
      <div
        className="pointer-events-auto absolute bottom-36 left-[42%] right-0 top-36 touch-none"
        role="region"
        aria-label="Przeciągnij, aby rozglądać się"
        onPointerDown={(event) => {
          if (event.target !== event.currentTarget || lookPointer.current !== null) return;
          event.preventDefault();
          lookPointer.current = event.pointerId;
          previousLook.current = { x: event.clientX, y: event.clientY };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (lookPointer.current !== event.pointerId || !previousLook.current) return;
          event.preventDefault();
          const dx = event.clientX - previousLook.current.x;
          const dy = event.clientY - previousLook.current.y;
          previousLook.current = { x: event.clientX, y: event.clientY };
          onLook(dx, dy);
        }}
        onPointerUp={(event) => {
          if (lookPointer.current !== event.pointerId) return;
          lookPointer.current = null;
          previousLook.current = null;
        }}
        onPointerCancel={(event) => {
          if (lookPointer.current !== event.pointerId) return;
          lookPointer.current = null;
          previousLook.current = null;
        }}
        onLostPointerCapture={(event) => {
          if (lookPointer.current !== event.pointerId) return;
          lookPointer.current = null;
          previousLook.current = null;
        }}
      />

      <div
        className="pointer-events-auto absolute bottom-8 left-7 flex h-32 w-32 touch-none items-center justify-center rounded-full border border-white/25 bg-zinc-950/35 shadow-xl backdrop-blur-[2px] max-[480px]:bottom-6 max-[480px]:left-3 max-[480px]:h-24 max-[480px]:w-24"
        role="region"
        aria-label="Joystick ruchu"
        onPointerDown={(event) => {
          if (joystickPointer.current !== null) return;
          event.preventDefault();
          joystickPointer.current = event.pointerId;
          event.currentTarget.setPointerCapture(event.pointerId);
          updateJoystick(event);
        }}
        onPointerMove={(event) => {
          if (joystickPointer.current === event.pointerId) updateJoystick(event);
        }}
        onPointerUp={endJoystick}
        onPointerCancel={endJoystick}
        onLostPointerCapture={endJoystick}
      >
        <div className="h-14 w-14 rounded-full border border-white/40 bg-white/10" />
        <div
          className="pointer-events-none absolute h-12 w-12 rounded-full border-2 border-amber-300/80 bg-amber-500/55 shadow-lg"
          style={{ transform: `translate(${stickPosition.x}px, ${stickPosition.y}px)` }}
        />
      </div>

      <div className="pointer-events-none absolute bottom-7 right-5 flex items-end gap-2 max-[560px]:bottom-5 max-[560px]:right-2 max-[560px]:origin-bottom-right max-[560px]:scale-75 max-[480px]:scale-[0.58]">
        <div className="flex flex-col gap-2">
          <button className={buttonClass} onPointerDown={(event) => beginHold(event, aimHold.current, onAim)} onPointerUp={(event) => endHold(event, aimHold.current, onAim)} onPointerCancel={(event) => endHold(event, aimHold.current, onAim)} onLostPointerCapture={(event) => endHold(event, aimHold.current, onAim)}>
            AIM
          </button>
          <button className={buttonClass} onPointerDown={(event) => beginHold(event, sprintHold.current, onSprint)} onPointerUp={(event) => endHold(event, sprintHold.current, onSprint)} onPointerCancel={(event) => endHold(event, sprintHold.current, onSprint)} onLostPointerCapture={(event) => endHold(event, sprintHold.current, onSprint)}>
            BIEG
          </button>
          <button
            className={`${buttonClass} rounded-xl border-orange-300/70 disabled:opacity-40`}
            disabled={fragGrenades <= 0}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFragGrenade();
            }}
          >
            FRAG {fragGrenades}
          </button>
          <button
            className={`${buttonClass} rounded-xl border-sky-300/70 disabled:opacity-40`}
            disabled={smokeGrenades <= 0}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onSmokeGrenade();
            }}
          >
            DYM {smokeGrenades}
          </button>
          <button
            className={`${buttonClass} rounded-xl border-cyan-300/70 disabled:opacity-40`}
            disabled={flashbangs <= 0}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onFlashbang();
            }}
          >
            BŁYSK
          </button>
          <button
            className={`${buttonClass} rounded-xl border-amber-300/70 disabled:opacity-40`}
            disabled={claymores <= 0}
            onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onPlantClaymore();
            }}
          >
            MINA
          </button>
          {readyKillstreaks.map((killstreak) => (
            <button
              key={killstreak}
              className={`${buttonClass} rounded-xl border-emerald-300/70`}
              onPointerDown={(event) => {
                event.preventDefault();
                event.stopPropagation();
                onActivateKillstreak(killstreak);
              }}
            >
              {killstreak === 'UAV' ? 'UAV' : killstreak === 'AIRSTRIKE' ? 'NALOT' : 'PREDATOR'}
            </button>
          ))}
        </div>
        <div className="flex flex-col items-center gap-2">
          {actionLabel && (
            <button
              className={`${buttonClass} rounded-xl border-amber-300/70`}
              onPointerDown={(event) => beginHold(event, actionHold.current, onAction)}
              onPointerUp={(event) => endHold(event, actionHold.current, onAction)}
              onPointerCancel={(event) => endHold(event, actionHold.current, onAction)}
              onLostPointerCapture={(event) => endHold(event, actionHold.current, onAction)}
            >
              {actionLabel}
            </button>
          )}
          <div className="flex items-end gap-2">
            <button className={`${buttonClass} h-12 min-w-12 rounded-xl`} onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onReload();
            }}>
              PRZEŁAD.
            </button>
            <button className={`${buttonClass} h-12 min-w-12 rounded-xl`} onPointerDown={(event) => {
              event.preventDefault();
              event.stopPropagation();
              onJump();
            }}>
              SKOK
            </button>
            <button
              className={`${buttonClass} h-20 min-w-20 border-red-300/80 bg-red-950/80`}
              style={{ touchAction: 'none' }}
              onPointerDown={(event) => beginHold(event, fireHold.current, onFire)}
              onPointerUp={(event) => endHold(event, fireHold.current, onFire)}
              onPointerCancel={(event) => endHold(event, fireHold.current, onFire)}
              onLostPointerCapture={(event) => endHold(event, fireHold.current, onFire)}
            >
              OGIEŃ
            </button>
          </div>
        </div>
      </div>

      <span className="absolute bottom-2 left-1/2 -translate-x-1/2 text-[9px] font-bold uppercase tracking-wider text-white/60">
        Przeciągnij prawą stronę, aby rozglądać się
      </span>
    </div>
  );
};
