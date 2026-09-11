// One-off icon generator — writes public/icon-*.png as pure PNGs via zlib, no canvas/image
// library dependency, so it's reproducible from source instead of a hand-copied base64 blob.
import fs from "fs";
import zlib from "zlib";

const BG = [0x0a, 0x12, 0x0e]; // near-black app background
const FG = [0x3e, 0xcf, 0x8e]; // mint green brand accent

function roundedRectContains(x, y, w, h, r) {
  const cx = Math.min(Math.max(x, r), w - r);
  const cy = Math.min(Math.max(y, r), h - r);
  const dx = x - cx, dy = y - cy;
  return dx * dx + dy * dy <= r * r;
}

function drawIcon(size) {
  const buf = Buffer.alloc(size * size * 4);
  const bgR = size * 0.22;

  // dumbbell geometry, in a coordinate frame centered on the icon and rotated -45deg
  const barW = size * 0.46, barH = size * 0.09;
  const plateW = size * 0.12, plateH = size * 0.34;
  const smallPlateW = size * 0.07, smallPlateH = size * 0.24;
  const cos = Math.cos(Math.PI / 4), sin = Math.sin(Math.PI / 4);

  function inRoundedRect(px, py, rx, ry, rw, rh, rad) {
    if (px < rx - rad || px > rx + rw + rad || py < ry - rad || py > ry + rh + rad) return false;
    const cx = Math.min(Math.max(px, rx), rx + rw);
    const cy = Math.min(Math.max(py, ry), ry + rh);
    const dx = px - cx, dy = py - cy;
    return dx * dx + dy * dy <= rad * rad || (px >= rx && px <= rx + rw) || (py >= ry && py <= ry + rh);
  }

  function dumbbellHit(x, y) {
    // rotate point into the bar's local (unrotated) frame
    const dx = x - size / 2, dy = y - size / 2;
    const lx = dx * cos + dy * sin;
    const ly = -dx * sin + dy * cos;
    const rad2 = size * 0.02;
    if (inRoundedRect(lx, ly, -barW / 2, -barH / 2, barW, barH, barH / 2)) return true;
    if (inRoundedRect(lx, ly, -barW / 2 - plateW * 0.9, -plateH / 2, plateW, plateH, rad2)) return true;
    if (inRoundedRect(lx, ly, barW / 2 - plateW * 0.1, -plateH / 2, plateW, plateH, rad2)) return true;
    if (inRoundedRect(lx, ly, -barW / 2 - plateW * 1.5, -smallPlateH / 2, smallPlateW, smallPlateH, rad2)) return true;
    if (inRoundedRect(lx, ly, barW / 2 + plateW * 0.5, -smallPlateH / 2, smallPlateW, smallPlateH, rad2)) return true;
    return false;
  }

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const i = (y * size + x) * 4;
      const inside = roundedRectContains(x + 0.5, y + 0.5, size, size, bgR);
      let color = inside ? BG : [0, 0, 0];
      const alpha = inside ? 255 : 0;
      if (inside && dumbbellHit(x + 0.5, y + 0.5)) color = FG;
      buf[i] = color[0]; buf[i + 1] = color[1]; buf[i + 2] = color[2]; buf[i + 3] = alpha;
    }
  }
  return buf;
}

function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = (crc ^ buf[i]) & 0xff;
    for (let j = 0; j < 8; j++) c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeData = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(typeData), 0);
  return Buffer.concat([len, typeData, crc]);
}

function encodePNG(size, rgba) {
  const sig = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type RGBA
  ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

  const raw = Buffer.alloc(size * (size * 4 + 1));
  for (let y = 0; y < size; y++) {
    raw[y * (size * 4 + 1)] = 0; // filter: none
    rgba.copy(raw, y * (size * 4 + 1) + 1, y * size * 4, (y + 1) * size * 4);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });

  return Buffer.concat([sig, chunk("IHDR", ihdr), chunk("IDAT", idat), chunk("IEND", Buffer.alloc(0))]);
}

fs.mkdirSync("public", { recursive: true });
for (const size of [512, 192, 180, 32]) {
  const png = encodePNG(size, drawIcon(size));
  const name = size === 180 ? "apple-touch-icon.png" : `icon-${size}.png`;
  fs.writeFileSync(`public/${name}`, png);
  console.log("wrote", name, png.length, "bytes");
}
