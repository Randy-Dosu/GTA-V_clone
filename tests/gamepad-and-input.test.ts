import { describe, expect, it, vi } from 'vitest';
import { GP, GamepadManager } from '../src/core/GamepadManager';
import { InputManager } from '../src/core/InputManager';

interface MockPadState {
  index: number;
  id: string;
  connected: boolean;
  axes: number[];
  buttons: Array<{ pressed: boolean; value: number }>;
  vibrationActuator?: {
    playEffect: ReturnType<typeof vi.fn>;
  };
}

function makePad(id: string, index = 0): MockPadState {
  return {
    index,
    id,
    connected: true,
    axes: [0, 0, 0, 0],
    buttons: Array.from({ length: 16 }, () => ({ pressed: false, value: 0 })),
    vibrationActuator: {
      playEffect: vi.fn().mockResolvedValue('complete'),
    },
  };
}

describe('W3C GamepadManager & InputManager Coexistence', () => {
  it('detects Xbox and PlayStation controllers, renders matching glyphs, and handles hot-unplug', () => {
    const pad = makePad('DualSense Wireless Controller (STANDARD GAMEPAD Vendor: 054c Product: 0ce6)');
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad, null, null, null],
    });

    const events: Array<[boolean, string, string]> = [];
    const gm = new GamepadManager((connected, label, style) => {
      events.push([connected, label, style]);
    });

    pad.buttons[GP.SOUTH] = { pressed: true, value: 1 };
    gm.poll(1 / 60);

    expect(gm.connected).toBe(true);
    expect(gm.style).toBe('playstation');
    expect(gm.controllerName).toBe('DualSense Wireless Controller');
    expect(gm.usingGamepad).toBe(true);
    expect(gm.badge('south')).toContain('✕');
    expect(gm.badge('north')).toContain('△');
    expect(gm.badge('lb')).toContain('L1');
    expect(events[0]).toEqual([true, 'DualSense Wireless Controller', 'playstation']);

    // Switch to an Xbox controller on slot 1
    pad.buttons[GP.SOUTH] = { pressed: false, value: 0 };
    const xbox = makePad('Xbox Wireless Controller (STANDARD GAMEPAD)', 1);
    xbox.buttons[GP.NORTH] = { pressed: true, value: 1 };
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad, xbox, null, null],
    });

    gm.poll(1 / 60);
    expect(gm.activeIndex).toBe(1);
    expect(gm.style).toBe('xbox');
    expect(gm.badge('south')).toContain('>A<');
    expect(gm.badge('north')).toContain('>Y<');
    expect(gm.badge('lb')).toContain('LB');

    // Keyboard input smoothly switches glyph mode back to keyboard without disconnecting pad
    const canvas = document.createElement('canvas');
    const input = new InputManager(canvas);
    input.onKeyboardOrMouse = () => gm.markKeyboardOrMouseUsed();
    window.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyW' }));
    expect(gm.usingGamepad).toBe(false);
    expect(gm.connected).toBe(true);
    expect(input.isDown('KeyW')).toBe(true);
    expect(input.wasPressed('KeyW')).toBe(true);
    input.endFrame();
    expect(input.wasPressed('KeyW')).toBe(false);
  });

  it('filters radial stick deadzone, tracks analog triggers, distinguishes quick-tap vs hold, and auto-repeats menu nav', () => {
    const pad = makePad('Xbox Wireless Controller');
    Object.defineProperty(navigator, 'getGamepads', {
      configurable: true,
      value: () => [pad],
    });

    const gm = new GamepadManager();
    gm.deadzone = 0.15;

    // Tiny stick drift stays strictly 0
    pad.axes = [0.08, -0.06, 0.05, 0.04];
    gm.poll(1 / 60);
    expect(gm.leftX).toBe(0);
    expect(gm.leftY).toBe(0);
    expect(gm.rightX).toBe(0);
    expect(gm.rightY).toBe(0);

    // Full deflection reaches 1.0 and proportional triggers report exact pressure
    pad.axes = [0, -1, 0.6, 0];
    pad.buttons[GP.RT] = { pressed: true, value: 0.72 };
    pad.buttons[GP.LT] = { pressed: false, value: 0.3 };
    gm.poll(1 / 60);
    expect(gm.leftY).toBeCloseTo(-1, 4);
    expect(gm.rightX).toBeGreaterThan(0.35);
    expect(gm.rtValue).toBeGreaterThan(0.7);
    expect(gm.rtValue).toBeLessThan(0.78);
    expect(gm.ltValue).toBeGreaterThan(0.24);
    expect(gm.ltValue).toBeLessThan(0.32);

    // Quick-tap LB (< 0.16s) fires wasQuickTapped for fast weapon/song skip
    pad.buttons[GP.LB] = { pressed: true, value: 1 };
    gm.poll(0.05);
    expect(gm.wasPressed(GP.LB)).toBe(true);
    gm.poll(0.05);
    pad.buttons[GP.LB] = { pressed: false, value: 0 };
    gm.poll(0.02);
    expect(gm.wasReleased(GP.LB)).toBe(true);
    expect(gm.wasQuickTapped(GP.LB, 0.16)).toBe(true);

    // Long-hold LB (> 0.16s) opens Weapon Wheel without triggering wasQuickTapped on release
    pad.buttons[GP.LB] = { pressed: true, value: 1 };
    gm.poll(0.02); // press edge resets hold timer to 0
    gm.poll(0.1);
    gm.poll(0.15);
    expect(gm.getHoldDuration(GP.LB)).toBeCloseTo(0.25, 3);
    pad.buttons[GP.LB] = { pressed: false, value: 0 };
    gm.poll(0.02);
    expect(gm.wasQuickTapped(GP.LB, 0.16)).toBe(false);

    // Menu auto-repeat fires immediately, pauses during initial delay, then repeats
    pad.axes = [0, 0, 0, 0];
    pad.buttons[GP.DPAD_DOWN] = { pressed: true, value: 1 };
    gm.poll(0.02);
    expect(gm.navDown).toBe(true);
    gm.poll(0.1);
    expect(gm.navDown).toBe(false);
    gm.poll(0.3);
    expect(gm.navDown).toBe(true);

    // Haptic dual-rumble invokes actuator when enabled and stays silent when disabled
    gm.rumble(0.5, 0.8, 200);
    expect(pad.vibrationActuator!.playEffect).toHaveBeenCalledTimes(1);
    gm.vibrationEnabled = false;
    gm.rumble(0.5, 0.8, 200);
    expect(pad.vibrationActuator!.playEffect).toHaveBeenCalledTimes(1);
  });
});
