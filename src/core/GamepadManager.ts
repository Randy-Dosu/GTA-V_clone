export const GP = {
  SOUTH: 0,       // A (Xbox) / Cross (PS)
  EAST: 1,        // B (Xbox) / Circle (PS)
  WEST: 2,        // X (Xbox) / Square (PS)
  NORTH: 3,       // Y (Xbox) / Triangle (PS)
  LB: 4,          // LB / L1
  RB: 5,          // RB / R1
  LT: 6,          // LT / L2
  RT: 7,          // RT / R2
  SELECT: 8,      // View / Share / Create
  START: 9,       // Menu / Options
  L3: 10,         // Left Stick Click
  R3: 11,         // Right Stick Click
  DPAD_UP: 12,
  DPAD_DOWN: 13,
  DPAD_LEFT: 14,
  DPAD_RIGHT: 15,
} as const;

export type GamepadButtonIndex = (typeof GP)[keyof typeof GP];
export type GamepadStyle = 'xbox' | 'playstation';

interface HapticActuatorLike {
  playEffect?: (
    type: string,
    params: {
      startDelay?: number;
      duration: number;
      weakMagnitude: number;
      strongMagnitude: number;
    }
  ) => Promise<unknown>;
  pulse?: (value: number, duration: number) => Promise<unknown>;
}

const BUTTON_COUNT = 16;

export class GamepadManager {
  public connected = false;
  public activeIndex = -1;
  public controllerName = '';
  public style: GamepadStyle = 'xbox';

  // True when the most recent user input came from the gamepad
  public usingGamepad = false;

  // Filtered analog sticks (-1..1; +X right, +Y down matching screen/W3C convention)
  public leftX = 0;
  public leftY = 0;
  public rightX = 0;
  public rightY = 0;
  // Raw-deadzoned right stick (unit range) for crisp radial wheel selection
  public rawRightX = 0;
  public rawRightY = 0;

  // Analog trigger values (0..1)
  public ltValue = 0;
  public rtValue = 0;

  // Auto-repeat menu navigation pulses (D-Pad + Left Stick)
  public navUp = false;
  public navDown = false;
  public navLeft = false;
  public navRight = false;

  public deadzone = 0.14;
  public vibrationEnabled = true;

  private down = new Array<boolean>(BUTTON_COUNT).fill(false);
  private pressed = new Array<boolean>(BUTTON_COUNT).fill(false);
  private released = new Array<boolean>(BUTTON_COUNT).fill(false);
  private holdTime = new Array<number>(BUTTON_COUNT).fill(0);
  private prevReleaseHold = new Array<number>(BUTTON_COUNT).fill(0);

  private navDir: 'none' | 'up' | 'down' | 'left' | 'right' = 'none';
  private navRepeatTimer = 0;
  private lastContinuousRumbleAt = 0;

  private onStatusChange?: (connected: boolean, label: string, style: GamepadStyle) => void;

  constructor(
    onStatusChange?: (connected: boolean, label: string, style: GamepadStyle) => void
  ) {
    this.onStatusChange = onStatusChange;

    window.addEventListener('gamepadconnected', (e: GamepadEvent) => {
      const gp = e.gamepad;
      if (!gp) return;
      this.selectPad(gp);
      this.usingGamepad = true;
      this.onStatusChange?.(true, this.controllerName, this.style);
    });

    window.addEventListener('gamepaddisconnected', (e: GamepadEvent) => {
      if (e.gamepad && e.gamepad.index === this.activeIndex) {
        const prevName = this.controllerName || 'Controller';
        this.activeIndex = -1;
        this.connected = false;
        this.controllerName = '';
        this.usingGamepad = false;
        this.resetState();
        this.onStatusChange?.(false, prevName, this.style);
      }
    });
  }

  public markKeyboardOrMouseUsed(): void {
    this.usingGamepad = false;
  }

  private selectPad(gp: Gamepad): void {
    this.activeIndex = gp.index;
    this.connected = true;
    this.style = this.detectStyle(gp.id);
    this.controllerName = this.cleanName(gp.id, this.style);
  }

  private detectStyle(id: string): GamepadStyle {
    const low = id.toLowerCase();
    if (
      low.includes('xbox') ||
      low.includes('xinput') ||
      low.includes('045e') ||
      low.includes('microsoft') ||
      low.includes('pro controller') ||
      low.includes('057e') ||
      low.includes('nintendo')
    ) {
      return 'xbox';
    }
    if (
      low.includes('dualsense') ||
      low.includes('dualshock') ||
      low.includes('playstation') ||
      low.includes('054c') ||
      low.includes('sony') ||
      low.startsWith('wireless controller')
    ) {
      return 'playstation';
    }
    return 'xbox';
  }

  private cleanName(id: string, style: GamepadStyle): string {
    const low = id.toLowerCase();
    if (low.includes('dualsense')) return 'DualSense Wireless Controller';
    if (low.includes('dualshock')) return 'DualShock Wireless Controller';
    if (style === 'playstation') return 'PlayStation Controller';
    if (low.includes('xbox')) return 'Xbox Wireless Controller';
    if (low.includes('pro controller') || low.includes('057e')) return 'Pro Controller';
    // Strip verbose USB vendor/product parentheses
    const trimmed = id.replace(/\s*\([^)]*\)\s*/g, ' ').trim();
    return trimmed.slice(0, 34) || 'Wireless Controller';
  }

  private applyRadialDeadzone(
    rx: number,
    ry: number,
    dz: number,
    exponent: number
  ): { x: number; y: number } {
    const mag = Math.hypot(rx, ry);
    if (mag <= dz || dz >= 0.95) return { x: 0, y: 0 };
    const norm = Math.min(1, (mag - dz) / (1 - dz));
    const curved = Math.pow(norm, exponent);
    return {
      x: (rx / mag) * curved,
      y: (ry / mag) * curved,
    };
  }

  private getActiveGamepad(): Gamepad | null {
    if (!navigator.getGamepads) return null;
    let pads: (Gamepad | null)[];
    try {
      pads = Array.from(navigator.getGamepads());
    } catch {
      return null;
    }

    // Check if another connected controller has a button/axis active so multi-pad switching is seamless
    for (const p of pads) {
      if (!p || !p.connected || p.buttons.length < 10) continue;
      if (p.index !== this.activeIndex) {
        const anyPressed = p.buttons.some((b) => b && (b.pressed || b.value > 0.5));
        const anyStick = p.axes.length >= 2 && Math.hypot(p.axes[0] || 0, p.axes[1] || 0) > 0.45;
        if (anyPressed || anyStick || this.activeIndex === -1) {
          const wasDisconnected = !this.connected;
          this.selectPad(p);
          if (anyPressed || anyStick) this.usingGamepad = true;
          if (wasDisconnected) {
            this.onStatusChange?.(true, this.controllerName, this.style);
          }
          break;
        }
      }
    }

    if (this.activeIndex >= 0) {
      const current = pads[this.activeIndex];
      if (current && current.connected) return current;
      this.connected = false;
      this.activeIndex = -1;
    }
    return null;
  }

  public poll(dt: number): void {
    this.navUp = false;
    this.navDown = false;
    this.navLeft = false;
    this.navRight = false;

    for (let i = 0; i < BUTTON_COUNT; i++) {
      this.pressed[i] = false;
      this.released[i] = false;
      this.prevReleaseHold[i] = 0;
    }

    const gp = this.getActiveGamepad();
    if (!gp) {
      this.leftX = 0;
      this.leftY = 0;
      this.rightX = 0;
      this.rightY = 0;
      this.rawRightX = 0;
      this.rawRightY = 0;
      this.ltValue = 0;
      this.rtValue = 0;
      return;
    }

    const dz = Math.max(0.04, Math.min(0.4, this.deadzone));

    // Left stick (movement & steering)
    const lxRaw = gp.axes[0] ?? 0;
    const lyRaw = gp.axes[1] ?? 0;
    const ls = this.applyRadialDeadzone(lxRaw, lyRaw, dz, 1.22);
    this.leftX = ls.x;
    this.leftY = ls.y;

    // Right stick (camera & radial wheels)
    const rxRaw = gp.axes[2] ?? 0;
    const ryRaw = gp.axes[3] ?? 0;
    const rs = this.applyRadialDeadzone(rxRaw, ryRaw, dz, 1.62);
    this.rightX = rs.x;
    this.rightY = rs.y;
    const rsLinear = this.applyRadialDeadzone(rxRaw, ryRaw, dz, 1.0);
    this.rawRightX = rsLinear.x;
    this.rawRightY = rsLinear.y;

    // Analog triggers (with subtle top/bottom clamp for crisp 0.0 and 1.0)
    const readTrigger = (idx: number): number => {
      const b = gp.buttons[idx];
      if (!b) return 0;
      const v = typeof b.value === 'number' ? b.value : b.pressed ? 1 : 0;
      if (v < 0.05) return 0;
      if (v > 0.96) return 1;
      return (v - 0.05) / 0.91;
    };
    this.ltValue = readTrigger(GP.LT);
    this.rtValue = readTrigger(GP.RT);

    let anyInputThisFrame =
      Math.hypot(this.leftX, this.leftY) > 0.12 ||
      Math.hypot(this.rightX, this.rightY) > 0.12 ||
      this.ltValue > 0.15 ||
      this.rtValue > 0.15;

    // Digital button edge detection (with hysteresis on analog LT/RT)
    for (let i = 0; i < BUTTON_COUNT; i++) {
      const b = gp.buttons[i];
      const wasDown = this.down[i];
      let isNowDown = false;
      if (b) {
        if (i === GP.LT || i === GP.RT) {
          const val = i === GP.LT ? this.ltValue : this.rtValue;
          isNowDown = wasDown ? val > 0.24 : val > 0.36;
        } else {
          isNowDown = b.pressed || b.value > 0.5;
        }
      }

      if (isNowDown) anyInputThisFrame = true;

      if (isNowDown && !wasDown) {
        this.pressed[i] = true;
        this.holdTime[i] = 0;
      } else if (!isNowDown && wasDown) {
        this.released[i] = true;
        this.prevReleaseHold[i] = this.holdTime[i];
        this.holdTime[i] = 0;
      } else if (isNowDown) {
        this.holdTime[i] += dt;
      }

      this.down[i] = isNowDown;
    }

    if (anyInputThisFrame) {
      this.usingGamepad = true;
    }

    // Compute menu directional navigation with crisp console auto-repeat
    let curDir: 'none' | 'up' | 'down' | 'left' | 'right' = 'none';
    if (this.down[GP.DPAD_UP] || this.leftY < -0.56) curDir = 'up';
    else if (this.down[GP.DPAD_DOWN] || this.leftY > 0.56) curDir = 'down';
    else if (this.down[GP.DPAD_LEFT] || this.leftX < -0.56) curDir = 'left';
    else if (this.down[GP.DPAD_RIGHT] || this.leftX > 0.56) curDir = 'right';

    if (curDir === 'none') {
      this.navDir = 'none';
      this.navRepeatTimer = 0;
    } else if (curDir !== this.navDir) {
      this.navDir = curDir;
      this.navRepeatTimer = 0.32;
      this.emitNav(curDir);
    } else {
      this.navRepeatTimer -= dt;
      if (this.navRepeatTimer <= 0) {
        this.navRepeatTimer = 0.12;
        this.emitNav(curDir);
      }
    }
  }

  private emitNav(dir: 'up' | 'down' | 'left' | 'right'): void {
    if (dir === 'up') this.navUp = true;
    else if (dir === 'down') this.navDown = true;
    else if (dir === 'left') this.navLeft = true;
    else if (dir === 'right') this.navRight = true;
  }

  public isDown(btn: GamepadButtonIndex): boolean {
    return this.down[btn] ?? false;
  }

  public wasPressed(btn: GamepadButtonIndex): boolean {
    return this.pressed[btn] ?? false;
  }

  public wasReleased(btn: GamepadButtonIndex): boolean {
    return this.released[btn] ?? false;
  }

  public wasQuickTapped(btn: GamepadButtonIndex, maxHold = 0.22): boolean {
    return this.released[btn] && this.prevReleaseHold[btn] <= maxHold;
  }

  public getHoldDuration(btn: GamepadButtonIndex): number {
    return this.holdTime[btn] ?? 0;
  }

  /**
   * Dual-motor haptic vibration (gracefully no-ops if unsupported or disabled).
   */
  public rumble(
    weakMagnitude: number,
    strongMagnitude: number,
    durationMs: number,
    continuous = false
  ): void {
    if (!this.vibrationEnabled || !this.usingGamepad || this.activeIndex < 0) return;
    const now = performance.now();
    if (continuous && now - this.lastContinuousRumbleAt < 95) return;
    if (continuous) this.lastContinuousRumbleAt = now;

    try {
      const gp = navigator.getGamepads?.()[this.activeIndex] as
        | (Gamepad & {
            vibrationActuator?: HapticActuatorLike;
            hapticActuators?: HapticActuatorLike[];
          })
        | null;
      if (!gp) return;

      const weak = Math.max(0, Math.min(1, weakMagnitude));
      const strong = Math.max(0, Math.min(1, strongMagnitude));
      const dur = Math.max(20, Math.min(1200, Math.round(durationMs)));

      const act = gp.vibrationActuator;
      if (act && typeof act.playEffect === 'function') {
        act
          .playEffect('dual-rumble', {
            startDelay: 0,
            duration: dur,
            weakMagnitude: weak,
            strongMagnitude: strong,
          })
          .catch(() => {});
        return;
      }
      const legacy = gp.hapticActuators?.[0];
      if (legacy && typeof legacy.pulse === 'function') {
        legacy.pulse(Math.max(weak, strong), dur).catch(() => {});
      }
    } catch {
      // Ignore browser haptic limitations safely
    }
  }

  /**
   * Returns a crisp inline HTML badge matching the connected controller style (Xbox or PlayStation).
   */
  public badge(
    btn:
      | 'south'
      | 'east'
      | 'west'
      | 'north'
      | 'lb'
      | 'rb'
      | 'lt'
      | 'rt'
      | 'l3'
      | 'r3'
      | 'dpad_up'
      | 'dpad_down'
      | 'dpad_left'
      | 'dpad_right'
      | 'start'
      | 'select'
      | 'ls'
      | 'rs'
  ): string {
    const ps = this.style === 'playstation';
    const map: Record<typeof btn, { label: string; cls: string }> = {
      south: ps ? { label: '✕', cls: 'gp-btn gp-round gp-ps-cross' } : { label: 'A', cls: 'gp-btn gp-round gp-xb-a' },
      east: ps ? { label: '○', cls: 'gp-btn gp-round gp-ps-circle' } : { label: 'B', cls: 'gp-btn gp-round gp-xb-b' },
      west: ps ? { label: '□', cls: 'gp-btn gp-round gp-ps-square' } : { label: 'X', cls: 'gp-btn gp-round gp-xb-x' },
      north: ps ? { label: '△', cls: 'gp-btn gp-round gp-ps-tri' } : { label: 'Y', cls: 'gp-btn gp-round gp-xb-y' },
      lb: { label: ps ? 'L1' : 'LB', cls: 'gp-btn' },
      rb: { label: ps ? 'R1' : 'RB', cls: 'gp-btn' },
      lt: { label: ps ? 'L2' : 'LT', cls: 'gp-btn' },
      rt: { label: ps ? 'R2' : 'RT', cls: 'gp-btn' },
      l3: { label: 'L3', cls: 'gp-btn' },
      r3: { label: 'R3', cls: 'gp-btn' },
      ls: { label: 'LS', cls: 'gp-btn' },
      rs: { label: 'RS', cls: 'gp-btn' },
      dpad_up: { label: 'D-Pad ↑', cls: 'gp-btn' },
      dpad_down: { label: 'D-Pad ↓', cls: 'gp-btn' },
      dpad_left: { label: 'D-Pad ←', cls: 'gp-btn' },
      dpad_right: { label: 'D-Pad →', cls: 'gp-btn' },
      start: { label: ps ? 'OPTIONS' : 'MENU', cls: 'gp-btn' },
      select: { label: ps ? 'CREATE' : 'VIEW', cls: 'gp-btn' },
    };
    const info = map[btn];
    return `<span class="${info.cls}">${info.label}</span>`;
  }

  public resetState(): void {
    this.down.fill(false);
    this.pressed.fill(false);
    this.released.fill(false);
    this.holdTime.fill(0);
    this.prevReleaseHold.fill(0);
    this.leftX = 0;
    this.leftY = 0;
    this.rightX = 0;
    this.rightY = 0;
    this.rawRightX = 0;
    this.rawRightY = 0;
    this.ltValue = 0;
    this.rtValue = 0;
    this.navDir = 'none';
    this.navRepeatTimer = 0;
  }
}
