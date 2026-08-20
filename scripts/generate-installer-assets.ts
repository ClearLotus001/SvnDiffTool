import * as fs from 'node:fs';
import * as path from 'node:path';
import * as zlib from 'node:zlib';

interface Color {
  r: number;
  g: number;
  b: number;
  a: number;
}

class Raster {
  readonly data: Uint8ClampedArray;

  constructor(
    readonly width: number,
    readonly height: number,
    background: Color = rgba(0, 0, 0, 0),
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
    if (background.a > 0) {
      this.fillRect(0, 0, width, height, background);
    }
  }

  blendPixel(x: number, y: number, color: Color) {
    const px = Math.trunc(x);
    const py = Math.trunc(y);
    if (px < 0 || py < 0 || px >= this.width || py >= this.height || color.a <= 0) return;

    const offset = ((py * this.width) + px) * 4;
    const sourceAlpha = clamp01(color.a / 255);
    const targetRed = this.data[offset] ?? 0;
    const targetGreen = this.data[offset + 1] ?? 0;
    const targetBlue = this.data[offset + 2] ?? 0;
    const targetAlpha = (this.data[offset + 3] ?? 0) / 255;
    const outAlpha = sourceAlpha + (targetAlpha * (1 - sourceAlpha));
    if (outAlpha <= 0) return;

    this.data[offset] = Math.round(((color.r * sourceAlpha) + (targetRed * targetAlpha * (1 - sourceAlpha))) / outAlpha);
    this.data[offset + 1] = Math.round(((color.g * sourceAlpha) + (targetGreen * targetAlpha * (1 - sourceAlpha))) / outAlpha);
    this.data[offset + 2] = Math.round(((color.b * sourceAlpha) + (targetBlue * targetAlpha * (1 - sourceAlpha))) / outAlpha);
    this.data[offset + 3] = Math.round(outAlpha * 255);
  }

  fillRect(x: number, y: number, width: number, height: number, color: Color) {
    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const right = Math.min(this.width, Math.ceil(x + width));
    const bottom = Math.min(this.height, Math.ceil(y + height));
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        this.blendPixel(px, py, color);
      }
    }
  }

  fillRoundedRect(
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    fill: Color | ((nx: number, ny: number) => Color),
  ) {
    const left = Math.max(0, Math.floor(x));
    const top = Math.max(0, Math.floor(y));
    const right = Math.min(this.width, Math.ceil(x + width));
    const bottom = Math.min(this.height, Math.ceil(y + height));

    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        if (!insideRoundedRect(px + 0.5, py + 0.5, x, y, width, height, radius)) continue;
        const nx = width === 0 ? 0 : (px - x) / width;
        const ny = height === 0 ? 0 : (py - y) / height;
        this.blendPixel(px, py, typeof fill === 'function' ? fill(nx, ny) : fill);
      }
    }
  }

  strokeRoundedRect(x: number, y: number, width: number, height: number, radius: number, strokeWidth: number, color: Color) {
    const left = Math.max(0, Math.floor(x - strokeWidth));
    const top = Math.max(0, Math.floor(y - strokeWidth));
    const right = Math.min(this.width, Math.ceil(x + width + strokeWidth));
    const bottom = Math.min(this.height, Math.ceil(y + height + strokeWidth));
    const innerX = x + strokeWidth;
    const innerY = y + strokeWidth;
    const innerWidth = width - (strokeWidth * 2);
    const innerHeight = height - (strokeWidth * 2);
    const innerRadius = Math.max(0, radius - strokeWidth);

    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        const cx = px + 0.5;
        const cy = py + 0.5;
        if (!insideRoundedRect(cx, cy, x, y, width, height, radius)) continue;
        if (innerWidth > 0 && innerHeight > 0 && insideRoundedRect(cx, cy, innerX, innerY, innerWidth, innerHeight, innerRadius)) continue;
        this.blendPixel(px, py, color);
      }
    }
  }

  fillCircle(cx: number, cy: number, radius: number, fill: Color | ((nx: number, ny: number) => Color)) {
    const left = Math.max(0, Math.floor(cx - radius));
    const top = Math.max(0, Math.floor(cy - radius));
    const right = Math.min(this.width, Math.ceil(cx + radius));
    const bottom = Math.min(this.height, Math.ceil(cy + radius));
    const radiusSquared = radius * radius;
    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        const dx = px + 0.5 - cx;
        const dy = py + 0.5 - cy;
        if ((dx * dx) + (dy * dy) > radiusSquared) continue;
        const nx = (dx / radius + 1) / 2;
        const ny = (dy / radius + 1) / 2;
        this.blendPixel(px, py, typeof fill === 'function' ? fill(nx, ny) : fill);
      }
    }
  }

  fillPolygon(points: Array<{ x: number; y: number }>, color: Color) {
    if (points.length < 3) return;

    const xs = points.map(point => point.x);
    const ys = points.map(point => point.y);
    const left = Math.max(0, Math.floor(Math.min(...xs)));
    const top = Math.max(0, Math.floor(Math.min(...ys)));
    const right = Math.min(this.width, Math.ceil(Math.max(...xs)));
    const bottom = Math.min(this.height, Math.ceil(Math.max(...ys)));

    for (let py = top; py < bottom; py += 1) {
      for (let px = left; px < right; px += 1) {
        if (isPointInPolygon(px + 0.5, py + 0.5, points)) {
          this.blendPixel(px, py, color);
        }
      }
    }
  }
}

const rootDir = path.resolve(__dirname, '..');

const ink = hex('#17212b');
const paperBright = hex('#ffffff');
const cream = hex('#f7fafb');
const coral = hex('#d65a50');
const coralDeep = hex('#b8453d');
const blue = hex('#3aa6a8');
const blueDeep = hex('#208b8d');

function clamp01(value: number): number {
  return Math.max(0, Math.min(1, value));
}

function rgba(r: number, g: number, b: number, a = 255): Color {
  return { r, g, b, a };
}

function withAlpha(color: Color, a: number): Color {
  return { ...color, a };
}

function hex(value: string, alpha = 255): Color {
  const normalized = value.replace('#', '');
  return rgba(
    Number.parseInt(normalized.slice(0, 2), 16),
    Number.parseInt(normalized.slice(2, 4), 16),
    Number.parseInt(normalized.slice(4, 6), 16),
    alpha,
  );
}

function mix(left: Color, right: Color, amount: number): Color {
  const t = clamp01(amount);
  return rgba(
    Math.round(left.r + ((right.r - left.r) * t)),
    Math.round(left.g + ((right.g - left.g) * t)),
    Math.round(left.b + ((right.b - left.b) * t)),
    Math.round(left.a + ((right.a - left.a) * t)),
  );
}

function insideRoundedRect(px: number, py: number, x: number, y: number, width: number, height: number, radius: number): boolean {
  const safeRadius = Math.max(0, Math.min(radius, width / 2, height / 2));
  const nearestX = Math.max(x + safeRadius, Math.min(px, x + width - safeRadius));
  const nearestY = Math.max(y + safeRadius, Math.min(py, y + height - safeRadius));
  const dx = px - nearestX;
  const dy = py - nearestY;
  return (dx * dx) + (dy * dy) <= safeRadius * safeRadius;
}

function isPointInPolygon(px: number, py: number, points: Array<{ x: number; y: number }>): boolean {
  let inside = false;
  for (let index = 0, previous = points.length - 1; index < points.length; previous = index, index += 1) {
    const currentPoint = points[index];
    const previousPoint = points[previous];
    if (!currentPoint || !previousPoint) continue;
    const intersects = ((currentPoint.y > py) !== (previousPoint.y > py))
      && (px < ((previousPoint.x - currentPoint.x) * (py - currentPoint.y)) / (previousPoint.y - currentPoint.y) + currentPoint.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function drawCapsule(canvas: Raster, x: number, y: number, width: number, height: number, color: Color) {
  canvas.fillRoundedRect(x, y, width, height, height / 2, color);
}

function drawAppMark(canvas: Raster, x: number, y: number, size: number) {
  const u = (value: number) => x + (value * size);
  const v = (value: number) => y + (value * size);
  const d = (value: number) => value * size;

  canvas.fillRoundedRect(u(0.075), v(0.085), d(0.85), d(0.85), d(0.19), withAlpha(rgba(0, 0, 0), 34));
  canvas.fillRoundedRect(u(0.058), v(0.055), d(0.884), d(0.884), d(0.205), verticalGradient(hex('#15171a'), ink));
  canvas.strokeRoundedRect(u(0.09), v(0.088), d(0.82), d(0.82), d(0.17), d(0.0045), withAlpha(cream, 42));

  // Two version ribbons converge into a single V: one memorable silhouette
  // instead of a miniature diff interface that disappears at taskbar sizes.
  canvas.fillPolygon([
    { x: u(0.19), y: v(0.25) },
    { x: u(0.35), y: v(0.25) },
    { x: u(0.36), y: v(0.27) },
    { x: u(0.5), y: v(0.585) },
    { x: u(0.5), y: v(0.82) },
    { x: u(0.385), y: v(0.705) },
    { x: u(0.18), y: v(0.28) },
  ], coral);
  canvas.fillPolygon([
    { x: u(0.65), y: v(0.25) },
    { x: u(0.81), y: v(0.25) },
    { x: u(0.82), y: v(0.28) },
    { x: u(0.615), y: v(0.705) },
    { x: u(0.5), y: v(0.82) },
    { x: u(0.5), y: v(0.585) },
    { x: u(0.64), y: v(0.27) },
  ], blue);

  // Fold facets make the two inputs legible as pages while remaining visible
  // when the master artwork is rasterized down to 16 px.
  canvas.fillPolygon([
    { x: u(0.385), y: v(0.705) },
    { x: u(0.5), y: v(0.82) },
    { x: u(0.5), y: v(0.585) },
  ], withAlpha(coralDeep, 232));
  canvas.fillPolygon([
    { x: u(0.615), y: v(0.705) },
    { x: u(0.5), y: v(0.82) },
    { x: u(0.5), y: v(0.585) },
  ], withAlpha(blueDeep, 218));

  canvas.fillRect(u(0.4975), v(0.585), d(0.005), d(0.235), withAlpha(cream, 54));
}

function verticalGradient(top: Color, bottom: Color): (nx: number, ny: number) => Color {
  return (_nx, ny) => mix(top, bottom, ny);
}

function drawInstallerHeader(): Raster {
  const canvas = new Raster(300, 114, paperBright);
  return downsample(canvas, 2);
}

function drawInstallerSidebar(): Raster {
  const canvas = new Raster(328, 628, ink);
  canvas.fillRect(0, 0, canvas.width / 2, 12, coral);
  canvas.fillRect(canvas.width / 2, 0, canvas.width / 2, 12, blueDeep);
  canvas.fillRect(0, 12, canvas.width, 2, withAlpha(paperBright, 34));

  drawAppMark(canvas, 109, 54, 110);
  canvas.fillRect(46, 210, 236, 2, withAlpha(paperBright, 30));

  drawCapsule(canvas, 48, 254, 90, 12, withAlpha(coral, 235));
  drawCapsule(canvas, 174, 254, 104, 12, withAlpha(blue, 220));
  drawCapsule(canvas, 66, 286, 126, 10, withAlpha(paperBright, 92));
  drawCapsule(canvas, 204, 286, 56, 10, withAlpha(blue, 165));

  canvas.fillRect(46, 338, 236, 2, withAlpha(paperBright, 30));
  drawCapsule(canvas, 48, 382, 132, 12, withAlpha(coral, 205));
  drawCapsule(canvas, 194, 382, 84, 12, withAlpha(blue, 235));
  drawCapsule(canvas, 78, 414, 60, 10, withAlpha(coral, 145));
  drawCapsule(canvas, 152, 414, 108, 10, withAlpha(paperBright, 88));

  canvas.fillRect(46, 466, 236, 2, withAlpha(paperBright, 30));
  drawCapsule(canvas, 48, 510, 78, 12, withAlpha(coral, 225));
  drawCapsule(canvas, 160, 510, 118, 12, withAlpha(blue, 205));
  drawCapsule(canvas, 64, 542, 112, 10, withAlpha(paperBright, 84));
  drawCapsule(canvas, 190, 542, 70, 10, withAlpha(coral, 145));
  return downsample(canvas, 2);
}

function drawIconPng(): Raster {
  const scale = 3;
  const canvas = new Raster(1024 * scale, 1024 * scale);
  drawAppMark(canvas, 0, 0, 1024 * scale);
  return downsample(canvas, scale);
}

function downsample(source: Raster, factor: number): Raster {
  const width = Math.floor(source.width / factor);
  const height = Math.floor(source.height / factor);
  const target = new Raster(width, height);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      let alphaSum = 0;
      let redSum = 0;
      let greenSum = 0;
      let blueSum = 0;
      for (let oy = 0; oy < factor; oy += 1) {
        for (let ox = 0; ox < factor; ox += 1) {
          const sourceOffset = ((((y * factor) + oy) * source.width) + ((x * factor) + ox)) * 4;
          const alpha = (source.data[sourceOffset + 3] ?? 0) / 255;
          alphaSum += alpha;
          redSum += (source.data[sourceOffset] ?? 0) * alpha;
          greenSum += (source.data[sourceOffset + 1] ?? 0) * alpha;
          blueSum += (source.data[sourceOffset + 2] ?? 0) * alpha;
        }
      }
      const sampleCount = factor * factor;
      const targetOffset = ((y * width) + x) * 4;
      const outAlpha = alphaSum / sampleCount;
      target.data[targetOffset + 3] = Math.round(outAlpha * 255);
      if (alphaSum > 0) {
        target.data[targetOffset] = Math.round(redSum / alphaSum);
        target.data[targetOffset + 1] = Math.round(greenSum / alphaSum);
        target.data[targetOffset + 2] = Math.round(blueSum / alphaSum);
      }
    }
  }

  return target;
}

function resize(source: Raster, width: number, height: number): Raster {
  const target = new Raster(width, height);
  const xRatio = source.width / width;
  const yRatio = source.height / height;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const sx = Math.min(source.width - 1, Math.max(0, (x + 0.5) * xRatio - 0.5));
      const sy = Math.min(source.height - 1, Math.max(0, (y + 0.5) * yRatio - 0.5));
      const x0 = Math.floor(sx);
      const y0 = Math.floor(sy);
      const x1 = Math.min(source.width - 1, x0 + 1);
      const y1 = Math.min(source.height - 1, y0 + 1);
      const tx = sx - x0;
      const ty = sy - y0;
      const color = sampleBilinear(source, x0, y0, x1, y1, tx, ty);
      const offset = ((y * width) + x) * 4;
      target.data[offset] = color.r;
      target.data[offset + 1] = color.g;
      target.data[offset + 2] = color.b;
      target.data[offset + 3] = color.a;
    }
  }
  return target;
}

function sampleBilinear(source: Raster, x0: number, y0: number, x1: number, y1: number, tx: number, ty: number): Color {
  const top = mix(readPixel(source, x0, y0), readPixel(source, x1, y0), tx);
  const bottom = mix(readPixel(source, x0, y1), readPixel(source, x1, y1), tx);
  return mix(top, bottom, ty);
}

function readPixel(source: Raster, x: number, y: number): Color {
  const offset = ((y * source.width) + x) * 4;
  return rgba(
    source.data[offset] ?? 0,
    source.data[offset + 1] ?? 0,
    source.data[offset + 2] ?? 0,
    source.data[offset + 3] ?? 0,
  );
}

function encodePng(image: Raster): Buffer {
  const raw = Buffer.alloc((image.width * 4 + 1) * image.height);
  for (let y = 0; y < image.height; y += 1) {
    const rowOffset = y * (image.width * 4 + 1);
    raw[rowOffset] = 0;
    for (let x = 0; x < image.width; x += 1) {
      const sourceOffset = ((y * image.width) + x) * 4;
      const targetOffset = rowOffset + 1 + (x * 4);
      raw[targetOffset] = image.data[sourceOffset] ?? 0;
      raw[targetOffset + 1] = image.data[sourceOffset + 1] ?? 0;
      raw[targetOffset + 2] = image.data[sourceOffset + 2] ?? 0;
      raw[targetOffset + 3] = image.data[sourceOffset + 3] ?? 0;
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(image.width, 0);
  ihdr.writeUInt32BE(image.height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    pngChunk('IHDR', ihdr),
    pngChunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

function pngChunk(type: string, data: Buffer): Buffer {
  const typeBuffer = Buffer.from(type, 'ascii');
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

const crcTable = new Uint32Array(256).map((_, index) => {
  let c = index;
  for (let k = 0; k < 8; k += 1) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  return c >>> 0;
});

function crc32(buffer: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function encodeBmp(image: Raster): Buffer {
  const rowStride = Math.ceil((image.width * 3) / 4) * 4;
  const pixelBytes = rowStride * image.height;
  const buffer = Buffer.alloc(54 + pixelBytes);
  buffer.write('BM', 0, 'ascii');
  buffer.writeUInt32LE(buffer.length, 2);
  buffer.writeUInt32LE(54, 10);
  buffer.writeUInt32LE(40, 14);
  buffer.writeInt32LE(image.width, 18);
  buffer.writeInt32LE(image.height, 22);
  buffer.writeUInt16LE(1, 26);
  buffer.writeUInt16LE(24, 28);
  buffer.writeUInt32LE(pixelBytes, 34);
  buffer.writeInt32LE(2835, 38);
  buffer.writeInt32LE(2835, 42);

  for (let y = 0; y < image.height; y += 1) {
    const targetRow = image.height - 1 - y;
    const rowOffset = 54 + (targetRow * rowStride);
    for (let x = 0; x < image.width; x += 1) {
      const sourceOffset = ((y * image.width) + x) * 4;
      const alpha = (image.data[sourceOffset + 3] ?? 0) / 255;
      const red = Math.round(((image.data[sourceOffset] ?? 0) * alpha) + (255 * (1 - alpha)));
      const green = Math.round(((image.data[sourceOffset + 1] ?? 0) * alpha) + (255 * (1 - alpha)));
      const blueChannel = Math.round(((image.data[sourceOffset + 2] ?? 0) * alpha) + (255 * (1 - alpha)));
      const targetOffset = rowOffset + (x * 3);
      buffer[targetOffset] = blueChannel;
      buffer[targetOffset + 1] = green;
      buffer[targetOffset + 2] = red;
    }
  }

  return buffer;
}

function encodeIco(source: Raster): Buffer {
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const images = sizes.map((size) => encodePng(resize(source, size, size)));
  const headerSize = 6 + (sizes.length * 16);
  const header = Buffer.alloc(headerSize);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(sizes.length, 4);

  let imageOffset = headerSize;
  sizes.forEach((size, index) => {
    const image = images[index];
    if (!image) {
      throw new Error(`Missing icon image for ${size}px.`);
    }
    const entryOffset = 6 + (index * 16);
    header[entryOffset] = size === 256 ? 0 : size;
    header[entryOffset + 1] = size === 256 ? 0 : size;
    header[entryOffset + 2] = 0;
    header[entryOffset + 3] = 0;
    header.writeUInt16LE(1, entryOffset + 4);
    header.writeUInt16LE(32, entryOffset + 6);
    header.writeUInt32LE(image.length, entryOffset + 8);
    header.writeUInt32LE(imageOffset, entryOffset + 12);
    imageOffset += image.length;
  });

  return Buffer.concat([header, ...images]);
}

async function writeFile(filePath: string, contents: Buffer) {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, contents);
}

async function main() {
  const icon = drawIconPng();
  await writeFile(path.join(rootDir, 'assets', 'icon.png'), encodePng(icon));
  await writeFile(path.join(rootDir, 'assets', 'icon.ico'), encodeIco(icon));
  await writeFile(path.join(rootDir, 'build', 'installerHeader.bmp'), encodeBmp(drawInstallerHeader()));
  await writeFile(path.join(rootDir, 'build', 'installerSidebar.bmp'), encodeBmp(drawInstallerSidebar()));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
