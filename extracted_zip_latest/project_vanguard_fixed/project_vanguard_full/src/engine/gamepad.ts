export interface GamepadInputState {
  moveX: number;
  moveY: number;
  lookX: number;
  lookY: number;
  fire: boolean;
  aim: boolean;
  jump: boolean;
  reload: boolean;
  sprint: boolean;
  crouch: boolean;
  interact: boolean;
  pause: boolean;
}

const applyDeadZone = (x: number, y: number, deadZone: number) => {
  const magnitude = Math.min(1, Math.hypot(x, y));
  if (magnitude <= deadZone) return { x: 0, y: 0 };
  const scaledMagnitude = (magnitude - deadZone) / (1 - deadZone);
  const scale = scaledMagnitude / magnitude;
  return { x: x * scale, y: y * scale };
};

export const readGamepadInput = (gamepad: Gamepad, deadZone: number): GamepadInputState => {
  const safeDeadZone = Number.isFinite(deadZone) ? Math.min(0.4, Math.max(0.05, deadZone)) : 0.18;
  const movement = applyDeadZone(gamepad.axes[0] ?? 0, gamepad.axes[1] ?? 0, safeDeadZone);
  const look = applyDeadZone(gamepad.axes[2] ?? 0, gamepad.axes[3] ?? 0, safeDeadZone);
  const pressed = (index: number) => gamepad.buttons[index]?.pressed ?? false;
  const triggerPressed = (index: number) => {
    const button = gamepad.buttons[index];
    return (button?.pressed ?? false) || (button?.value ?? 0) > 0.5;
  };
  return {
    moveX: movement.x,
    moveY: movement.y,
    lookX: look.x,
    lookY: look.y,
    fire: triggerPressed(7),
    aim: triggerPressed(6),
    jump: pressed(0),
    crouch: pressed(1),
    reload: pressed(2),
    interact: pressed(3),
    sprint: pressed(10),
    pause: pressed(9),
  };
};
