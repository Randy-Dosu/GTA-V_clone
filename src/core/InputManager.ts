export class InputManager {
  private keysDown = new Set<string>();
  private keysPressed = new Set<string>();
  private keysReleased = new Set<string>();

  public mouseDownLeft = false;
  public mousePressedLeft = false;
  public mouseDownRight = false;
  public mousePressedRight = false;

  public mouseDeltaX = 0;
  public mouseDeltaY = 0;
  public wheelDelta = 0;

  public cursorX = window.innerWidth * 0.5;
  public cursorY = window.innerHeight * 0.5;
  public radialDX = 0;
  public radialDY = 0;

  public pointerLocked = false;
  private canvas: HTMLCanvasElement;
  public allowPointerLock = false;
  public overlayBlocking = false;
  public onKeyboardOrMouse?: () => void;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.bindEvents();
  }

  private bindEvents(): void {
    window.addEventListener('keydown', (e) => {
      const code = e.code;
      // Prevent browser navigation on game keys while playing
      if (
        this.allowPointerLock &&
        (code === 'Tab' ||
          code === 'Space' ||
          code === 'ArrowUp' ||
          code === 'ArrowDown' ||
          code === 'ArrowLeft' ||
          code === 'ArrowRight' ||
          code === 'AltLeft' ||
          code === 'AltRight')
      ) {
        e.preventDefault();
      }
      if (!this.keysDown.has(code)) {
        this.keysPressed.add(code);
      }
      this.keysDown.add(code);
      this.onKeyboardOrMouse?.();
    });

    window.addEventListener('keyup', (e) => {
      const code = e.code;
      if (this.keysDown.has(code)) {
        this.keysReleased.add(code);
      }
      this.keysDown.delete(code);
    });

    window.addEventListener('blur', () => {
      this.clearAll();
    });

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.clearAll();
    });

    document.addEventListener('pointerlockchange', () => {
      this.pointerLocked = document.pointerLockElement === this.canvas;
    });

    this.canvas.addEventListener('mousedown', (e) => {
      this.onKeyboardOrMouse?.();
      if (this.overlayBlocking) return;
      if (this.allowPointerLock && !this.pointerLocked) {
        this.requestLock();
      }
      if (e.button === 0) {
        if (!this.mouseDownLeft) this.mousePressedLeft = true;
        this.mouseDownLeft = true;
      } else if (e.button === 2) {
        if (!this.mouseDownRight) this.mousePressedRight = true;
        this.mouseDownRight = true;
      }
    });

    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.mouseDownLeft = false;
      if (e.button === 2) this.mouseDownRight = false;
    });

    window.addEventListener('contextmenu', (e) => {
      if (this.allowPointerLock) e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (this.pointerLocked) {
        const dx = Math.max(-120, Math.min(120, e.movementX || 0));
        const dy = Math.max(-120, Math.min(120, e.movementY || 0));
        if (Math.abs(dx) > 1 || Math.abs(dy) > 1) {
          this.onKeyboardOrMouse?.();
        }
        this.mouseDeltaX += dx;
        this.mouseDeltaY += dy;
        this.radialDX = Math.max(-180, Math.min(180, this.radialDX + dx));
        this.radialDY = Math.max(-180, Math.min(180, this.radialDY + dy));
      } else {
        this.cursorX = e.clientX;
        this.cursorY = e.clientY;
        this.radialDX = e.clientX - window.innerWidth * 0.5;
        this.radialDY = e.clientY - window.innerHeight * 0.5;
        if (this.allowPointerLock && !this.overlayBlocking && this.mouseDownRight) {
          this.mouseDeltaX += e.movementX || 0;
          this.mouseDeltaY += e.movementY || 0;
        }
      }
    });

    window.addEventListener(
      'wheel',
      (e) => {
        if (!this.allowPointerLock || this.overlayBlocking) return;
        this.wheelDelta += Math.sign(e.deltaY);
      },
      { passive: true }
    );
  }

  public resetRadialCursor(): void {
    this.radialDX = 0;
    this.radialDY = 0;
  }

  public requestLock(): void {
    try {
      if (this.canvas.requestPointerLock) {
        const res = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
        if (res && typeof res.catch === 'function') {
          res.catch(() => {
            // Safe ignore if sandbox rejects pointer lock
          });
        }
      }
    } catch {
      // Ignore
    }
  }

  public exitLock(): void {
    try {
      if (document.pointerLockElement) {
        document.exitPointerLock();
      }
    } catch {
      // Ignore
    }
  }

  public isDown(code: string): boolean {
    return this.keysDown.has(code);
  }

  public wasPressed(code: string): boolean {
    return this.keysPressed.has(code);
  }

  public wasReleased(code: string): boolean {
    return this.keysReleased.has(code);
  }

  public clearAll(): void {
    this.keysDown.clear();
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mouseDownLeft = false;
    this.mousePressedLeft = false;
    this.mouseDownRight = false;
    this.mousePressedRight = false;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.wheelDelta = 0;
  }

  public endFrame(): void {
    this.keysPressed.clear();
    this.keysReleased.clear();
    this.mousePressedLeft = false;
    this.mousePressedRight = false;
    this.mouseDeltaX = 0;
    this.mouseDeltaY = 0;
    this.wheelDelta = 0;
  }
}
