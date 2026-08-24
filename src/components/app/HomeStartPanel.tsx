import {
  memo,
  useEffect,
  useRef,
  type CSSProperties,
} from 'react';
import { ArrowRight, Files, FileText, Settings } from 'lucide-react';
import { useI18n } from '@/context/i18n';
import { cssAlpha, cssAlphaRaw } from '@/theme/cssUtils';
import { debugLog } from '@/hooks/app/helpers';
import { closeCurrentWindow, retryCurrentPage } from '@/utils/app/windowActions';

interface HomeStartPanelProps {
  error: string;
  isElectron: boolean;
  onPickWorkingCopy: () => void;
  onOpenLocalFileCompare: () => void;
  onOpenSvnConfig: () => void;
}

type HomeIconKind = 'file' | 'compare' | 'gear';

type PixelAnimationName = 'appear' | 'disappear';

interface ActionCardProps {
  accent: string;
  icon: HomeIconKind;
  title: string;
  body: string;
  actionLabel: string;
  onClick: () => void;
  tone: 'primary' | 'compare' | 'svn';
  disabled?: boolean;
}

type RgbColor = Readonly<{
  r: number;
  g: number;
  b: number;
}>;

interface ShaderPalette {
  ember: RgbColor;
  sand: RgbColor;
  lilac: RgbColor;
  chargedLilac: RgbColor;
  cyan: RgbColor;
  saturation: number;
  brightness: number;
  grainOpacity: number;
  shadeOpacity: number;
}

const LIGHT_SHADER_PALETTE: ShaderPalette = {
  ember: { r: 226, g: 117, b: 79 },
  sand: { r: 238, g: 207, b: 177 },
  lilac: { r: 214, g: 197, b: 231 },
  chargedLilac: { r: 216, g: 151, b: 232 },
  cyan: { r: 163, g: 237, b: 237 },
  saturation: 1.03,
  brightness: 1.04,
  grainOpacity: 0.38,
  shadeOpacity: 0.08,
};

const DARK_SHADER_PALETTE: ShaderPalette = {
  ember: { r: 178, g: 56, b: 31 },
  sand: { r: 83, g: 53, b: 55 },
  lilac: { r: 82, g: 61, b: 108 },
  chargedLilac: { r: 137, g: 83, b: 198 },
  cyan: { r: 53, g: 164, b: 174 },
  saturation: 1.2,
  brightness: 0.86,
  grainOpacity: 0.28,
  shadeOpacity: 0.26,
};

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function smoothstep(edge0: number, edge1: number, value: number) {
  const x = clampNumber((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - (2 * x));
}

function mixNumber(from: number, to: number, amount: number) {
  return from + ((to - from) * amount);
}

function mixRgb(from: RgbColor, to: RgbColor, amount: number): RgbColor {
  const t = clampNumber(amount, 0, 1);
  return {
    r: mixNumber(from.r, to.r, t),
    g: mixNumber(from.g, to.g, t),
    b: mixNumber(from.b, to.b, t),
  };
}

function saturateRgb(color: RgbColor, amount: number): RgbColor {
  const luma = (color.r * 0.2126) + (color.g * 0.7152) + (color.b * 0.0722);
  return {
    r: clampNumber(luma + ((color.r - luma) * amount), 0, 255),
    g: clampNumber(luma + ((color.g - luma) * amount), 0, 255),
    b: clampNumber(luma + ((color.b - luma) * amount), 0, 255),
  };
}

function brightenRgb(color: RgbColor, amount: number): RgbColor {
  return {
    r: clampNumber(color.r * amount, 0, 255),
    g: clampNumber(color.g * amount, 0, 255),
    b: clampNumber(color.b * amount, 0, 255),
  };
}

function writeRgb(data: Uint8ClampedArray, offset: number, color: RgbColor) {
  data[offset] = color.r;
  data[offset + 1] = color.g;
  data[offset + 2] = color.b;
  data[offset + 3] = 255;
}

function hashPoint(x: number, y: number) {
  const raw = Math.sin(x * 12.9898 + y * 78.233) * 43758.5453;
  return raw - Math.floor(raw);
}

function rangedHash(seed: number, min: number, max: number) {
  const raw = Math.sin(seed * 91.712 + 17.233) * 43758.5453;
  const normalized = raw - Math.floor(raw);
  return normalized * (max - min) + min;
}

function getEffectivePixelSpeed(value: number, reducedMotion: boolean) {
  if (value <= 0 || reducedMotion) return 0;
  return value * 0.001;
}

class HomePixel {
  readonly x: number;

  readonly y: number;

  readonly color: string;

  readonly speed: number;

  readonly sizeStep: number;

  readonly minSize: number;

  readonly maxSizeInteger: number;

  readonly maxSize: number;

  readonly delay: number;

  readonly counterStep: number;

  size: number;

  counter: number;

  isIdle: boolean;

  isReverse: boolean;

  isShimmer: boolean;

  constructor(
    private readonly ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    color: string,
    speed: number,
    delay: number,
    seed: number,
    dimensionFactor: number,
  ) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.speed = rangedHash(seed + 0.11, 0.1, 0.9) * speed;
    this.size = 0;
    this.sizeStep = rangedHash(seed + 0.31, 0.12, 0.48);
    this.minSize = 0.55;
    this.maxSizeInteger = 3;
    this.maxSize = rangedHash(seed + 0.53, this.minSize, this.maxSizeInteger);
    this.delay = delay;
    this.counter = 0;
    this.counterStep = rangedHash(seed + 0.77, 0, 4) + dimensionFactor * 0.01;
    this.isIdle = true;
    this.isReverse = false;
    this.isShimmer = false;
  }

  draw() {
    if (this.size <= 0) return;
    const centerOffset = this.maxSizeInteger * 0.5 - this.size * 0.5;
    this.ctx.fillStyle = this.color;
    this.ctx.fillRect(this.x + centerOffset, this.y + centerOffset, this.size, this.size);
  }

  appear() {
    this.isIdle = false;
    if (this.counter <= this.delay) {
      this.counter += this.counterStep;
      return;
    }
    if (this.size >= this.maxSize) {
      this.isShimmer = true;
    }
    if (this.isShimmer) {
      this.shimmer();
    } else {
      this.size = Math.min(this.maxSize, this.size + this.sizeStep);
    }
    this.draw();
  }

  disappear() {
    this.isShimmer = false;
    this.counter = 0;
    if (this.size <= 0) {
      this.size = 0;
      this.isIdle = true;
      return;
    }
    this.size = Math.max(0, this.size - 0.14);
    this.draw();
  }

  run(animationName: PixelAnimationName) {
    if (animationName === 'appear') {
      this.appear();
      return;
    }
    this.disappear();
  }

  private shimmer() {
    if (this.size >= this.maxSize) {
      this.isReverse = true;
    } else if (this.size <= this.minSize) {
      this.isReverse = false;
    }
    this.size += this.isReverse ? -this.speed : this.speed;
  }
}

function HomeIcon({ kind }: { kind: HomeIconKind }) {
  if (kind === 'gear') return <Settings size={18} />;
  if (kind === 'compare') return <Files size={18} />;
  return <FileText size={18} />;
}

function readThemeColor(element: Element, variableName: string, fallback: string) {
  const value = getComputedStyle(element).getPropertyValue(variableName).trim();
  return value || fallback;
}

function isFocusStillInside(currentTarget: HTMLElement, relatedTarget: EventTarget | null) {
  return relatedTarget instanceof Node && currentTarget.contains(relatedTarget);
}

function HomeAmbientCanvas() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const meshCanvas = document.createElement('canvas');
    const meshCtx = meshCanvas.getContext('2d');
    const grainCanvas = document.createElement('canvas');
    const grainCtx = grainCanvas.getContext('2d');
    if (!meshCtx || !grainCtx) return undefined;

    let width = 1;
    let height = 1;
    let dpr = 1;
    let meshWidth = 1;
    let meshHeight = 1;
    const frameInterval = 1000 / 10;

    const isLightTheme = () => document.documentElement.classList.contains('theme-light');
    const isHighContrastTheme = () => document.documentElement.classList.contains('theme-hc');
    const getShaderPalette = () => (isLightTheme() ? LIGHT_SHADER_PALETTE : DARK_SHADER_PALETTE);

    const rgbToRgba = (color: RgbColor, alpha: number) => (
      `rgba(${Math.round(color.r)}, ${Math.round(color.g)}, ${Math.round(color.b)}, ${alpha})`
    );

    const drawEllipticGlow = (
      x: number,
      y: number,
      radiusX: number,
      radiusY: number,
      color: RgbColor,
      alpha: number,
    ) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(radiusX, radiusY);
      const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, 1);
      gradient.addColorStop(0, rgbToRgba(color, alpha));
      gradient.addColorStop(0.42, rgbToRgba(color, alpha * 0.45));
      gradient.addColorStop(1, rgbToRgba(color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(0, 0, 1, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };

    const buildGrainTexture = () => {
      const pixelWidth = Math.max(1, Math.floor(width * dpr));
      const pixelHeight = Math.max(1, Math.floor(height * dpr));
      grainCanvas.width = pixelWidth;
      grainCanvas.height = pixelHeight;

      const image = grainCtx.createImageData(pixelWidth, pixelHeight);
      const { data } = image;
      for (let y = 0; y < pixelHeight; y += 1) {
        for (let x = 0; x < pixelWidth; x += 1) {
          const index = (y * pixelWidth + x) * 4;
          const value = hashPoint(x + 4.17, y + 8.91) > 0.5 ? 255 : 0;
          data[index] = value;
          data[index + 1] = value;
          data[index + 2] = value;
          data[index + 3] = Math.floor(17 + (hashPoint(x + 19.31, y + 2.43) * 38));
        }
      }
      grainCtx.putImageData(image, 0, 0);
    };

    const renderShaderMesh = (time: number, palette: ShaderPalette) => {
      const image = meshCtx.createImageData(meshWidth, meshHeight);
      const { data } = image;
      const seconds = time * 0.001;
      const phase = seconds * 0.4;
      const drift = seconds * 0.16;
      const warmGlowX = 0.78 + (Math.sin(drift * 0.82) * 0.13);
      const warmGlowY = 0.26 + (Math.cos(drift * 0.74) * 0.12);
      const lilacGlowX = 0.22 + (Math.cos(drift * 0.92) * 0.12);
      const lilacGlowY = 0.34 + (Math.sin(drift * 0.66) * 0.14);
      const cyanGlowX = 0.48 + (Math.sin(drift * 0.7) * 0.14);
      const cyanGlowY = 0.78 + (Math.cos(drift * 0.58) * 0.1);

      for (let y = 0; y < meshHeight; y += 1) {
        const uy = meshHeight <= 1 ? 0 : y / (meshHeight - 1);
        for (let x = 0; x < meshWidth; x += 1) {
          const ux = meshWidth <= 1 ? 0 : x / (meshWidth - 1);
          const nx = (ux - 0.5) * 2;
          const ny = (uy - 0.5) * 2;

          const line = 0.08
            + (uy * 0.56)
            + (Math.sin((uy * 5.5) + (phase * 1.15)) * 0.065)
            + (Math.sin((ux * 7.2) - (phase * 0.85)) * 0.024);
          const wave = (
            Math.sin(((nx * 1.65) + (ny * 0.48) + phase) * 5.5)
            + (Math.sin(((ny * 1.12) - (nx * 0.54) - (phase * 0.7)) * 4.2) * 0.46)
            + (Math.sin(((nx + ny) * 2.45) + (phase * 0.9)) * 0.24)
          ) / 1.7;
          const distance = ux - line + (wave * 0.052);

          const warmMix = clampNumber(
            0.44
            + (smoothstep(-0.22, 0.43, distance) * 0.56)
            + (ux * 0.12)
            + (wave * 0.08),
            0,
            1,
          );
          let color = mixRgb(palette.sand, palette.ember, warmMix);

          const purpleBand = Math.exp(-(((distance - 0.018) / 0.31) ** 2))
            * (0.98 - (uy * 0.12));
          const cyanBeam = Math.exp(-(((distance + 0.035) / 0.13) ** 2))
            * smoothstep(0.28, 0.96, uy)
            * (0.78 + (Math.sin((uy * 2.7) + (phase * 0.8)) * 0.1));
          const leftBloom = Math.exp(
            -(
              (((ux - 0.13) * (ux - 0.13)) / 0.082)
              + (((uy - 0.48) * (uy - 0.48)) / 0.34)
            ),
          );
          const lowerHeat = Math.exp(
            -(
              (((ux - 0.38) * (ux - 0.38)) / 0.18)
              + (((uy - 0.94) * (uy - 0.94)) / 0.12)
            ),
          );
          const warmGlow = Math.exp(
            -(
              (((ux - warmGlowX) * (ux - warmGlowX)) / 0.13)
              + (((uy - warmGlowY) * (uy - warmGlowY)) / 0.08)
            ),
          );
          const lilacGlow = Math.exp(
            -(
              (((ux - lilacGlowX) * (ux - lilacGlowX)) / 0.1)
              + (((uy - lilacGlowY) * (uy - lilacGlowY)) / 0.16)
            ),
          );
          const cyanGlow = Math.exp(
            -(
              (((ux - cyanGlowX) * (ux - cyanGlowX)) / 0.07)
              + (((uy - cyanGlowY) * (uy - cyanGlowY)) / 0.1)
            ),
          );

          color = mixRgb(color, palette.sand, leftBloom * 0.2);
          color = mixRgb(color, palette.ember, (lowerHeat * 0.2) + (warmGlow * 0.32));
          color = mixRgb(
            color,
            mixRgb(palette.lilac, palette.chargedLilac, 0.52),
            clampNumber(purpleBand * 0.84, 0, 0.9),
          );
          color = mixRgb(color, palette.chargedLilac, clampNumber(lilacGlow * 0.26, 0, 0.36));
          color = mixRgb(
            color,
            palette.cyan,
            clampNumber((cyanBeam * 0.74) + (cyanGlow * 0.34), 0, 0.72),
          );

          const vignetteDistance = Math.hypot((ux - 0.52) * 1.08, (uy - 0.48) * 0.94);
          const vignette = 1 - (smoothstep(0.5, 1.18, vignetteDistance) * 0.16);
          const sparkle = 1 + (wave * 0.035);
          const finalColor = brightenRgb(
            saturateRgb(color, palette.saturation),
            palette.brightness * vignette * sparkle,
          );

          writeRgb(data, (y * meshWidth + x) * 4, finalColor);
        }
      }

      meshCtx.putImageData(image, 0, 0);
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      dpr = Math.min(window.devicePixelRatio || 1, 1.25);
      width = Math.max(1, rect.width);
      height = Math.max(1, rect.height);
      meshWidth = clampNumber(Math.floor(width / 5), 180, 430);
      meshHeight = clampNumber(Math.floor(meshWidth * (height / width)), 120, 280);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      meshCanvas.width = meshWidth;
      meshCanvas.height = meshHeight;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      buildGrainTexture();
      paint(performance.now());
    };

    const paint = (time: number) => {
      const lightTheme = isLightTheme();
      const highContrastTheme = isHighContrastTheme();
      const palette = getShaderPalette();
      const baseColor = readThemeColor(canvas, '--bg-base', lightTheme ? '#F4F4F5' : '#09090B');

      ctx.clearRect(0, 0, width, height);

      if (highContrastTheme) {
        ctx.fillStyle = baseColor;
        ctx.fillRect(0, 0, width, height);
        return;
      }

      renderShaderMesh(time, palette);
      ctx.imageSmoothingEnabled = true;
      ctx.drawImage(meshCanvas, 0, 0, width, height);

      ctx.save();
      const glowTime = time * 0.00034;
      ctx.globalCompositeOperation = lightTheme ? 'screen' : 'lighter';
      drawEllipticGlow(
        width * (0.2 + (Math.sin(glowTime * 0.9) * 0.1)),
        height * (0.28 + (Math.cos(glowTime * 0.72) * 0.1)),
        width * 0.34,
        height * 0.38,
        palette.chargedLilac,
        lightTheme ? 0.2 : 0.12,
      );
      drawEllipticGlow(
        width * (0.72 + (Math.cos(glowTime * 0.82) * 0.09)),
        height * (0.22 + (Math.sin(glowTime * 0.58) * 0.12)),
        width * 0.36,
        height * 0.32,
        palette.ember,
        lightTheme ? 0.18 : 0.1,
      );
      drawEllipticGlow(
        width * (0.48 + (Math.sin(glowTime * 0.62) * 0.13)),
        height * (0.82 + (Math.cos(glowTime * 0.68) * 0.08)),
        width * 0.28,
        height * 0.22,
        palette.cyan,
        lightTheme ? 0.2 : 0.14,
      );
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = lightTheme ? 'overlay' : 'screen';
      ctx.globalAlpha = palette.grainOpacity;
      ctx.drawImage(grainCanvas, 0, 0, width, height);
      ctx.restore();

      ctx.save();
      const topLight = ctx.createLinearGradient(0, 0, 0, height);
      topLight.addColorStop(0, lightTheme ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.05)');
      topLight.addColorStop(0.36, 'rgba(255,255,255,0)');
      topLight.addColorStop(1, `rgba(0,0,0,${palette.shadeOpacity})`);
      ctx.globalCompositeOperation = lightTheme ? 'soft-light' : 'source-over';
      ctx.globalAlpha = 1;
      ctx.fillStyle = topLight;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    };

    const start = () => {
      if (frameRef.current !== null) return;
      if (media.matches) {
        paint(performance.now());
        return;
      }
      frameRef.current = window.setInterval(() => {
        paint(performance.now());
      }, frameInterval);
    };

    const handleReducedMotionChange = () => {
      if (frameRef.current !== null) {
        window.clearInterval(frameRef.current);
        frameRef.current = null;
      }
      start();
    };

    resize();
    start();

    const resizeObserver = new ResizeObserver(() => {
      resize();
      start();
    });
    const themeObserver = new MutationObserver(() => {
      resize();
      start();
    });
    resizeObserver.observe(canvas);
    themeObserver.observe(document.documentElement, {
      attributeFilter: ['class'],
      attributes: true,
    });
    media.addEventListener('change', handleReducedMotionChange);

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      media.removeEventListener('change', handleReducedMotionChange);
      if (frameRef.current !== null) {
        window.clearInterval(frameRef.current);
      }
    };
  }, []);

  return <canvas ref={canvasRef} aria-hidden="true" className="home-ambient-canvas" />;
}

function getPixelCardColors(host: HTMLElement, accent: string) {
  const accentColor = readThemeColor(host, accent, '#A6BDC9');
  const secondaryAccent = readThemeColor(host, '--acc2', '#D0B49A');
  const add = readThemeColor(host, '--diff-add-border', '#4E9B62');
  const modify = readThemeColor(host, '--diff-modify-border', '#B69A3B');
  const secondary = readThemeColor(host, '--text-secondary', '#A1A1AA');
  const border = readThemeColor(host, '--border-strong', '#3F3F46');

  if (accent === '--accent') {
    return [accentColor, secondaryAccent, secondary, border];
  }

  return [accentColor, secondaryAccent, add, modify];
}

function PixelCardField({ accent, disabled = false }: { accent: string; disabled?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const host = canvas?.parentElement;
    if (!host) return undefined;
    const ctx = canvas.getContext('2d');
    if (!ctx) return undefined;

    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const pixels: HomePixel[] = [];
    let frameHandle: number | null = null;
    let animationName: PixelAnimationName = 'disappear';
    let previousTime = performance.now();
    let width = 1;
    let height = 1;
    let isActive = false;

    const cancelCurrentFrame = () => {
      if (frameHandle === null) return;
      cancelAnimationFrame(frameHandle);
      frameHandle = null;
    };

    const initializePixels = () => {
      const rect = host.getBoundingClientRect();
      const nextWidth = Math.max(1, Math.floor(rect.width));
      const nextHeight = Math.max(1, Math.floor(rect.height));
      const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
      width = nextWidth;
      height = nextHeight;
      canvas.width = Math.max(1, Math.floor(width * dpr));
      canvas.height = Math.max(1, Math.floor(height * dpr));
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      pixels.length = 0;
      const colors = getPixelCardColors(host, accent);
      const gap = width < 340 ? 7 : 8;
      const speed = getEffectivePixelSpeed(accent === '--accent' ? 30 : 38, media.matches);
      const dimensionFactor = width + height;

      for (let x = 0; x < width; x += gap) {
        for (let y = 0; y < height; y += gap) {
          const seed = hashPoint(x + gap * 0.37, y + gap * 0.61);
          const color = colors[Math.floor(seed * colors.length)] ?? colors[0] ?? '#D0B49A';
          const dx = x - width / 2;
          const dy = y - height / 2;
          const distance = Math.hypot(dx, dy);
          const delay = media.matches ? 0 : distance;
          pixels.push(new HomePixel(ctx, x, y, color, speed, delay, seed, dimensionFactor));
        }
      }
    };

    const tick = (time: number) => {
      const timeInterval = 1000 / 60;
      const timePassed = time - previousTime;
      let shouldContinue = true;

      if (timePassed >= timeInterval) {
        previousTime = time - (timePassed % timeInterval);
        ctx.clearRect(0, 0, width, height);

        let allIdle = true;
        let allSettled = true;
        for (const pixel of pixels) {
          pixel.run(animationName);
          if (!pixel.isIdle) {
            allIdle = false;
          }
          if (!pixel.isShimmer) {
            allSettled = false;
          }
        }

        shouldContinue = animationName === 'appear'
          ? !media.matches || !allSettled
          : !allIdle;
      }

      if (shouldContinue) {
        frameHandle = requestAnimationFrame(tick);
        return;
      }

      frameHandle = null;
    };

    const handleAnimation = (nextAnimationName: PixelAnimationName) => {
      if (disabled && nextAnimationName === 'appear') return;
      if (nextAnimationName === 'appear') {
        initializePixels();
      }
      animationName = nextAnimationName;
      isActive = nextAnimationName === 'appear';
      previousTime = performance.now();
      cancelCurrentFrame();
      frameHandle = requestAnimationFrame(tick);
    };

    const handleEnter = () => handleAnimation('appear');
    const handleLeave = () => handleAnimation('disappear');
    const handleFocusIn = () => handleAnimation('appear');
    const handleFocusOut = (event: FocusEvent) => {
      if (isFocusStillInside(host, event.relatedTarget)) return;
      handleAnimation('disappear');
    };

    const handleReducedMotionChange = () => {
      initializePixels();
      if (isActive) {
        handleAnimation('appear');
      }
    };

    initializePixels();

    const resizeObserver = new ResizeObserver(() => {
      initializePixels();
      if (isActive) {
        handleAnimation('appear');
      }
    });
    resizeObserver.observe(host);

    if (disabled) {
      return () => {
        resizeObserver.disconnect();
        cancelCurrentFrame();
        ctx.clearRect(0, 0, width, height);
      };
    }

    host.addEventListener('pointerenter', handleEnter);
    host.addEventListener('pointerleave', handleLeave);
    host.addEventListener('focusin', handleFocusIn);
    host.addEventListener('focusout', handleFocusOut);
    media.addEventListener('change', handleReducedMotionChange);

    return () => {
      resizeObserver.disconnect();
      host.removeEventListener('pointerenter', handleEnter);
      host.removeEventListener('pointerleave', handleLeave);
      host.removeEventListener('focusin', handleFocusIn);
      host.removeEventListener('focusout', handleFocusOut);
      media.removeEventListener('change', handleReducedMotionChange);
      cancelCurrentFrame();
    };
  }, [accent, disabled]);

  return <canvas ref={canvasRef} aria-hidden="true" className="home-action-card__pixels" />;
}

function ActionCard({
  accent, icon, title, body, actionLabel, onClick, tone, disabled = false,
}: ActionCardProps) {
  const cardStyle = {
    '--home-card-accent': `var(${accent})`,
    '--home-card-accent-soft': cssAlphaRaw(accent, '1f'),
  } as CSSProperties;

  return (
    <div
      className={`home-action-card home-action-card--${tone} ${disabled ? 'home-action-card--disabled' : ''}`}
      style={cardStyle}
    >
      <PixelCardField accent={accent} disabled={disabled} />
      <div className="relative z-[1] flex-1 min-h-[154px] flex flex-col justify-center items-center gap-[18px] pb-2 text-center">
        <div className="inline-flex items-center justify-center gap-3 min-w-0 w-full">
          <div aria-hidden="true" className="home-action-card__icon">
            <HomeIcon kind={icon} />
          </div>
          <div className="home-action-card__title text-text-title text-[21px] font-[850] leading-tight">
            {title}
          </div>
        </div>
        <div className="home-action-card__body text-text-secondary text-[13px] leading-[1.75] text-center">
          {body}
        </div>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={onClick}
        className="home-action-card__button"
      >
        {actionLabel}
        {!disabled && <ArrowRight size={14} />}
      </button>
    </div>
  );
}

const HomeStartPanel = memo(({
  error, isElectron, onPickWorkingCopy, onOpenLocalFileCompare, onOpenSvnConfig,
}: HomeStartPanelProps) => {
  const { t } = useI18n();
  useEffect(() => {
    debugLog('home-start-panel:mounted', {
      isElectron,
      hasError: Boolean(error),
    });
  }, [error, isElectron]);

  return (
    <div className="home-stage flex-1 w-full min-w-0 min-h-0 flex items-center justify-center p-[34px_24px_44px] overflow-auto">
      <HomeAmbientCanvas />
      <div className="relative z-[1] w-[min(1120px,100%)] grid gap-5">
        {error && (
          <div
            className="relative rounded-[8px] p-[14px_16px] border border-diff-remove-border text-diff-remove-text text-[13px] leading-relaxed font-bold"
            style={{ background: cssAlpha('delBg', 'cc') }}>
            <div className="grid gap-3">
              <div>{error}</div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => retryCurrentPage()}
                  className="h-8 px-3 rounded-[8px] border border-transparent bg-accent text-bg-base text-[13px] font-semibold cursor-pointer hover:bg-accent-hover active:scale-[0.97] transition-all duration-150"
                >
                  {t('rendererErrorRetryAction')}
                </button>
                <button
                  type="button"
                  onClick={() => closeCurrentWindow()}
                  className="h-8 px-3 rounded-[8px] border border-diff-remove-border bg-transparent text-diff-remove-text text-[13px] font-semibold cursor-pointer hover:bg-diff-remove-bg active:scale-[0.97] transition-all duration-150"
                >
                  {t('rendererErrorCloseAction')}
                </button>
              </div>
            </div>
          </div>
        )}

        {!isElectron && (
          <div
            className="relative rounded-[8px] p-[14px_16px] border border-border-default text-text-secondary text-[13px] leading-relaxed font-semibold"
            style={{ background: cssAlpha('bg1', 'd9') }}>
            {t('homeStartDesktopOnly')}
          </div>
        )}

        <section className="home-hero-heading" aria-labelledby="versora-home-title">
          <h1 id="versora-home-title">{t('homeStartHeroTitle')}</h1>
        </section>

        <div className="home-action-grid grid gap-5 sm:grid-cols-2 items-stretch">
          <ActionCard
            accent="--acc2"
            icon="compare"
            title={t('homeStartLocalFileCompareTitle')}
            body={t('homeStartLocalFileCompareBody')}
            actionLabel={t('homeStartLocalFileCompareAction')}
            onClick={onOpenLocalFileCompare}
            tone="compare"
            disabled={!isElectron}
          />
          <ActionCard
            accent="--accent-hover"
            icon="file"
            title={t('homeStartPickTitle')}
            body={t('homeStartPickBody')}
            actionLabel={t('homeStartPickAction')}
            onClick={onPickWorkingCopy}
            tone="primary"
            disabled={!isElectron}
          />
          <ActionCard
            accent="--text-secondary"
            icon="gear"
            title={t('homeStartConfigTitle')}
            body={t('homeStartConfigBody')}
            actionLabel={t('homeStartConfigAction')}
            onClick={onOpenSvnConfig}
            tone="svn"
            disabled={!isElectron}
          />
        </div>
      </div>
    </div>
  );
});

export default HomeStartPanel;
