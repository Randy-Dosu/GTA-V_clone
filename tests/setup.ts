// Polyfill 2D Canvas, Web Audio, scrollIntoView, and URL.createObjectURL for headless jsdom tests

const noop = () => {};

function createMock2DContext(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const gradient = { addColorStop: noop };
  const ctx: Record<string, unknown> = {
    canvas,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    globalCompositeOperation: 'source-over',
    shadowColor: 'transparent',
    shadowBlur: 0,
    shadowOffsetX: 0,
    shadowOffsetY: 0,
    font: '12px sans-serif',
    textAlign: 'start',
    textBaseline: 'alphabetic',
    save: noop,
    restore: noop,
    scale: noop,
    rotate: noop,
    translate: noop,
    transform: noop,
    setTransform: noop,
    resetTransform: noop,
    clearRect: noop,
    fillRect: noop,
    strokeRect: noop,
    beginPath: noop,
    closePath: noop,
    moveTo: noop,
    lineTo: noop,
    quadraticCurveTo: noop,
    bezierCurveTo: noop,
    arc: noop,
    arcTo: noop,
    ellipse: noop,
    rect: noop,
    roundRect: noop,
    fill: noop,
    stroke: noop,
    clip: noop,
    setLineDash: noop,
    getLineDash: () => [],
    fillText: noop,
    strokeText: noop,
    measureText: (text: string) => ({ width: text.length * 7 }),
    drawImage: noop,
    createLinearGradient: () => gradient,
    createRadialGradient: () => gradient,
    createPattern: () => ({}),
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    }),
    putImageData: noop,
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w * h * 4)),
      width: w,
      height: h,
    }),
  };
  return ctx as unknown as CanvasRenderingContext2D;
}

HTMLCanvasElement.prototype.getContext = function getContext(
  this: HTMLCanvasElement,
  contextId: string
) {
  if (contextId === '2d') {
    return createMock2DContext(this);
  }
  return null;
} as unknown as typeof HTMLCanvasElement.prototype.getContext;

if (!HTMLElement.prototype.scrollIntoView) {
  HTMLElement.prototype.scrollIntoView = noop;
}

function createAudioParam(initial = 0) {
  const param = {
    value: initial,
    setValueAtTime(v: number) {
      param.value = v;
      return param;
    },
    linearRampToValueAtTime(v: number) {
      param.value = v;
      return param;
    },
    exponentialRampToValueAtTime(v: number) {
      param.value = v;
      return param;
    },
    setTargetAtTime(v: number) {
      param.value = v;
      return param;
    },
    cancelScheduledValues() {
      return param;
    },
  };
  return param;
}

function createAudioNode(extra: Record<string, unknown> = {}) {
  return {
    connect: (dest: unknown) => dest,
    disconnect: noop,
    start: noop,
    stop: noop,
    ...extra,
  };
}

class MockAudioContext {
  public state: AudioContextState = 'running';
  public currentTime = 0;
  public sampleRate = 44100;
  public destination = createAudioNode();

  public resume(): Promise<void> {
    this.state = 'running';
    return Promise.resolve();
  }
  public createGain() {
    return createAudioNode({ gain: createAudioParam(1) });
  }
  public createOscillator() {
    return createAudioNode({
      type: 'sine',
      frequency: createAudioParam(440),
      detune: createAudioParam(0),
    });
  }
  public createBiquadFilter() {
    return createAudioNode({
      type: 'lowpass',
      frequency: createAudioParam(1000),
      Q: createAudioParam(1),
      gain: createAudioParam(0),
    });
  }
  public createDynamicsCompressor() {
    return createAudioNode({
      threshold: createAudioParam(-24),
      knee: createAudioParam(30),
      ratio: createAudioParam(12),
      attack: createAudioParam(0.003),
      release: createAudioParam(0.25),
    });
  }
  public createDelay() {
    return createAudioNode({ delayTime: createAudioParam(0) });
  }
  public createBuffer(_channels: number, length: number, sampleRate: number) {
    const arr = new Float32Array(length);
    return {
      length,
      sampleRate,
      numberOfChannels: 1,
      duration: length / sampleRate,
      getChannelData: () => arr,
    };
  }
  public createBufferSource() {
    return createAudioNode({
      buffer: null,
      loop: false,
      playbackRate: createAudioParam(1),
    });
  }
}

(globalThis as unknown as { AudioContext: typeof MockAudioContext }).AudioContext =
  MockAudioContext;

if (!URL.createObjectURL) {
  let blobSeq = 0;
  URL.createObjectURL = () => `blob:test-audio-${++blobSeq}`;
}

HTMLMediaElement.prototype.play = function play() {
  Object.defineProperty(this, 'paused', { value: false, configurable: true });
  return Promise.resolve();
};
HTMLMediaElement.prototype.pause = function pause() {
  Object.defineProperty(this, 'paused', { value: true, configurable: true });
};

// Quiet optional manifest fetch during unit tests unless explicitly mocked
globalThis.fetch = (async () =>
  ({
    ok: true,
    json: async () => ({ files: {} }),
  }) as Response) as typeof fetch;
