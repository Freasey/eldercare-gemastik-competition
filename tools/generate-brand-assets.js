/**
 * Generator ikon merek RawatLansia (konsep "Suara Peduli": hati berisi
 * gelombang suara) untuk elder-app dan family-app.
 *
 * Jalankan: `node tools/generate-brand-assets.js`
 *
 * Kenapa menggambar sendiri, bukan memakai sharp/ImageMagick: mesin build di
 * proyek ini (build-apk.ps1) hanya menjamin Node ada. Menambah dependensi biner
 * yang harus dikompilasi per-OS cuma untuk membuat ulang tujuh PNG statis lebih
 * mahal daripada rasterizer ~200 baris di bawah ini, yang cuma butuh `zlib`
 * bawaan Node. Efeknya ikon bisa dibuat ulang di mesin mana pun tanpa
 * `npm install` lebih dulu.
 */

'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

// ---------------------------------------------------------------------------
// Palet
// ---------------------------------------------------------------------------

/**
 * Teal diambil dari `src/theme.js` (elder) dan `src/theme/tokens.js` (family),
 * bukan dari papan branding, supaya tidak lahir dua teal yang beda tipis.
 *
 * Amber gelap dipakai khusus untuk batang gelombang di ikon lansia. Amber
 * terang di atas putih cuma 2,4:1 sehingga batang setipis ini lumer di ukuran
 * notifikasi; versi gelapnya 4,1:1 dan tetap satu keluarga warna.
 */
const AMBER = '#E8930C';
const AMBER_DEEP = '#B36F04';
const TEAL = '#0E7C6B';
const WHITE = '#FFFFFF';

// ---------------------------------------------------------------------------
// Geometri logo, memakai kanvas rancangan 96x96 (sama dengan file SVG-nya)
// ---------------------------------------------------------------------------

const HEART =
  'M48 74C33 64 24 55.5 24 45.3 24 38 29.8 32 37 32c4.5 0 8.5 2.3 11 6 ' +
  '2.5-3.7 6.5-6 11-6 7.2 0 13 6 13 13.3C72 55.5 63 64 48 74z';

/** Tiga batang gelombang: [x, y, lebar, tinggi], sudut selalu setengah lebar. */
const BARS = [
  [38, 44, 5, 12],
  [45.5, 39, 5, 20],
  [53, 44, 5, 12],
];

/**
 * Titik tengah kotak pembatas hati (24..72, 32..74). Dipakai sebagai titik
 * nol supaya logo bisa ditaruh persis di tengah kanvas berapa pun ukurannya —
 * kalau memakai tengah kanvas 96 (48,48) logo akan tampak naik 5 satuan.
 */
const LOGO_CX = 48;
const LOGO_CY = 53;
const LOGO_W = 48;

// ---------------------------------------------------------------------------
// Parser path SVG (cukup M/m, L/l, C/c, Z/z — hanya itu yang dipakai HEART)
// ---------------------------------------------------------------------------

/**
 * Mengubah string path SVG jadi daftar subpath berisi titik-titik.
 *
 * @param {string} d Atribut `d` dari sebuah <path>.
 * @param {number} [steps=48] Jumlah ruas pemecah tiap kurva bezier.
 * @returns {number[][][]} Daftar subpath; tiap subpath daftar pasangan [x, y].
 */
function parsePath(d, steps = 48) {
  const tokens = d.match(/[a-zA-Z]|-?\d*\.?\d+(?:e[-+]?\d+)?/gi) || [];
  const subpaths = [];
  let current = null;
  let cmd = null;
  let x = 0;
  let y = 0;
  let startX = 0;
  let startY = 0;
  let i = 0;

  const num = () => parseFloat(tokens[i++]);

  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) {
      cmd = tokens[i++];
    }
    const rel = cmd === cmd.toLowerCase();
    const c = cmd.toUpperCase();

    if (c === 'M') {
      const nx = num();
      const ny = num();
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      startX = x;
      startY = y;
      current = [[x, y]];
      subpaths.push(current);
      // Angka berikutnya tanpa huruf perintah berarti lineto, sesuai spek SVG.
      cmd = rel ? 'l' : 'L';
    } else if (c === 'L') {
      const nx = num();
      const ny = num();
      x = rel ? x + nx : nx;
      y = rel ? y + ny : ny;
      current.push([x, y]);
    } else if (c === 'C') {
      const x1 = rel ? x + num() : num();
      const y1 = rel ? y + num() : num();
      const x2 = rel ? x + num() : num();
      const y2 = rel ? y + num() : num();
      const x3 = rel ? x + num() : num();
      const y3 = rel ? y + num() : num();
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        current.push([
          u * u * u * x + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x3,
          u * u * u * y + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y3,
        ]);
      }
      x = x3;
      y = y3;
    } else if (c === 'Z') {
      current.push([startX, startY]);
      x = startX;
      y = startY;
    } else {
      throw new Error(`Perintah path "${cmd}" belum didukung parser ini.`);
    }
  }
  return subpaths;
}

/**
 * Membuat subpath berbentuk kapsul (persegi dengan sudut setengah lebar).
 *
 * @param {number} rx Sisi kiri.
 * @param {number} ry Sisi atas.
 * @param {number} w Lebar.
 * @param {number} h Tinggi.
 * @returns {number[][][]} Subpath siap raster.
 */
function capsule(rx, ry, w, h) {
  const r = w / 2;
  const k = r * 0.5523; // Panjang handle bezier untuk seperempat lingkaran.
  const d =
    `M${rx} ${ry + r}` +
    `C${rx} ${ry + r - k} ${rx + r - k} ${ry} ${rx + r} ${ry}` +
    `C${rx + r + k} ${ry} ${rx + w} ${ry + r - k} ${rx + w} ${ry + r}` +
    `L${rx + w} ${ry + h - r}` +
    `C${rx + w} ${ry + h - r + k} ${rx + r + k} ${ry + h} ${rx + r} ${ry + h}` +
    `C${rx + r - k} ${ry + h} ${rx} ${ry + h - r + k} ${rx} ${ry + h - r}` +
    'Z';
  return parsePath(d);
}

// ---------------------------------------------------------------------------
// Rasterizer
// ---------------------------------------------------------------------------

const SUBSAMPLES = 8; // Baris sampel per piksel; horizontal dihitung eksak.

/**
 * Menghitung liputan (0..1) tiap piksel untuk sekumpulan subpath, memakai
 * aturan nonzero winding. Sumbu X dihitung eksak lewat panjang potongan span,
 * sumbu Y disampel `SUBSAMPLES` kali — jauh lebih tajam daripada supersampling
 * titik biasa dengan biaya yang sama.
 *
 * @param {number[][][]} subpaths Subpath dalam koordinat piksel.
 * @param {number} size Sisi kanvas dalam piksel.
 * @returns {Float32Array} Liputan sepanjang size*size.
 */
function rasterize(subpaths, size) {
  const cov = new Float32Array(size * size);
  const edges = [];
  for (const pts of subpaths) {
    for (let j = 0; j + 1 < pts.length; j++) {
      const [x0, y0] = pts[j];
      const [x1, y1] = pts[j + 1];
      if (y0 !== y1) edges.push([x0, y0, x1, y1]);
    }
    // Tutup subpath yang tidak diakhiri Z.
    const first = pts[0];
    const last = pts[pts.length - 1];
    if (first[0] !== last[0] || first[1] !== last[1]) {
      edges.push([last[0], last[1], first[0], first[1]]);
    }
  }

  const weight = 1 / SUBSAMPLES;
  const hits = [];

  for (let row = 0; row < size; row++) {
    for (let s = 0; s < SUBSAMPLES; s++) {
      const sy = row + (s + 0.5) / SUBSAMPLES;
      hits.length = 0;
      for (const [x0, y0, x1, y1] of edges) {
        // Rentang setengah terbuka mencegah simpul terhitung dua kali.
        if ((sy >= y0 && sy < y1) || (sy >= y1 && sy < y0)) {
          hits.push([x0 + ((sy - y0) / (y1 - y0)) * (x1 - x0), y1 > y0 ? 1 : -1]);
        }
      }
      if (hits.length < 2) continue;
      hits.sort((a, b) => a[0] - b[0]);

      let winding = 0;
      for (let h = 0; h < hits.length - 1; h++) {
        winding += hits[h][1];
        if (winding === 0) continue;
        const spanStart = Math.max(hits[h][0], 0);
        const spanEnd = Math.min(hits[h + 1][0], size);
        if (spanEnd <= spanStart) continue;

        const base = row * size;
        const pxStart = Math.floor(spanStart);
        const pxEnd = Math.min(Math.ceil(spanEnd), size);
        for (let px = pxStart; px < pxEnd; px++) {
          const overlap =
            Math.min(spanEnd, px + 1) - Math.max(spanStart, px);
          if (overlap > 0) cov[base + px] += overlap * weight;
        }
      }
    }
  }
  return cov;
}

// ---------------------------------------------------------------------------
// Kanvas RGBA sederhana
// ---------------------------------------------------------------------------

/** @param {string} hex Warna `#RRGGBB`. @returns {number[]} [r, g, b]. */
function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

/**
 * Kanvas RGBA lurus (bukan premultiplied) berisi operasi gambar & hapus.
 */
class Canvas {
  /** @param {number} size Sisi kanvas. @param {?string} bg Warna latar, null = transparan. */
  constructor(size, bg) {
    this.size = size;
    this.data = new Uint8ClampedArray(size * size * 4);
    if (bg) {
      const [r, g, b] = hexToRgb(bg);
      for (let i = 0; i < size * size; i++) {
        this.data[i * 4] = r;
        this.data[i * 4 + 1] = g;
        this.data[i * 4 + 2] = b;
        this.data[i * 4 + 3] = 255;
      }
    }
  }

  /**
   * Menimpa bentuk di atas kanvas (source-over).
   *
   * @param {Float32Array} cov Liputan dari rasterize().
   * @param {string} hex Warna isi.
   */
  fill(cov, hex) {
    const [r, g, b] = hexToRgb(hex);
    for (let i = 0; i < cov.length; i++) {
      const a = Math.min(cov[i], 1);
      if (a <= 0) continue;
      const o = i * 4;
      const da = this.data[o + 3] / 255;
      const na = a + da * (1 - a);
      // Bagi dengan alpha hasil karena kanvas disimpan tidak premultiplied.
      this.data[o] = (r * a + this.data[o] * da * (1 - a)) / na;
      this.data[o + 1] = (g * a + this.data[o + 1] * da * (1 - a)) / na;
      this.data[o + 2] = (b * a + this.data[o + 2] * da * (1 - a)) / na;
      this.data[o + 3] = na * 255;
    }
  }

  /**
   * Melubangi kanvas (destination-out), dipakai ikon monokrom Android 13+.
   *
   * @param {Float32Array} cov Liputan dari rasterize().
   */
  erase(cov) {
    for (let i = 0; i < cov.length; i++) {
      const a = Math.min(cov[i], 1);
      if (a > 0) this.data[i * 4 + 3] *= 1 - a;
    }
  }
}

// ---------------------------------------------------------------------------
// Encoder PNG
// ---------------------------------------------------------------------------

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

/** @param {Buffer} buf Data. @returns {number} CRC-32 tak bertanda. */
function crc32(buf) {
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 255] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

/** @param {string} type Nama chunk. @param {Buffer} data Isi. @returns {Buffer} */
function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([len, body, crc]);
}

/**
 * Menulis kanvas jadi berkas PNG.
 *
 * Kanvas yang seluruhnya buram ditulis sebagai RGB tanpa kanal alpha: App Store
 * menolak ikon ber-alpha, dan berkasnya sekalian lebih kecil.
 *
 * @param {string} file Tujuan penulisan.
 * @param {Canvas} canvas Kanvas sumber.
 */
function writePng(file, canvas) {
  const { size, data } = canvas;
  let opaque = true;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] !== 255) {
      opaque = false;
      break;
    }
  }
  const channels = opaque ? 3 : 4;
  const raw = Buffer.alloc(size * (size * channels + 1));
  let p = 0;
  for (let y = 0; y < size; y++) {
    raw[p++] = 0; // Filter "none": PNG-nya kecil dan encoder-nya tetap sepele.
    for (let x = 0; x < size; x++) {
      const o = (y * size + x) * 4;
      raw[p++] = data[o];
      raw[p++] = data[o + 1];
      raw[p++] = data[o + 2];
      if (!opaque) raw[p++] = data[o + 3];
    }
  }

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = opaque ? 2 : 6;

  fs.writeFileSync(
    file,
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
      chunk('IEND', Buffer.alloc(0)),
    ])
  );
  return { channels, bytes: fs.statSync(file).size };
}

// ---------------------------------------------------------------------------
// Perakitan ikon
// ---------------------------------------------------------------------------

/**
 * Memindahkan subpath dari kanvas rancangan 96x96 ke koordinat piksel, dengan
 * logo terpusat dan selebar `logoWidth`.
 *
 * @param {number[][][]} subpaths Subpath asli.
 * @param {number} size Sisi kanvas keluaran.
 * @param {number} logoWidth Lebar kotak pembatas hati dalam piksel.
 * @returns {number[][][]} Subpath dalam koordinat piksel.
 */
function place(subpaths, size, logoWidth) {
  const scale = logoWidth / LOGO_W;
  const cx = size / 2;
  const cy = size / 2;
  return subpaths.map((pts) =>
    pts.map(([x, y]) => [cx + (x - LOGO_CX) * scale, cy + (y - LOGO_CY) * scale])
  );
}

/**
 * Menggambar logo lengkap (hati + tiga batang gelombang) ke kanvas baru.
 *
 * @param {object} opts Pilihan penggambaran.
 * @param {number} opts.size Sisi kanvas.
 * @param {number} opts.logoWidth Lebar logo dalam piksel.
 * @param {?string} opts.bg Warna latar, null untuk transparan.
 * @param {string} opts.heart Warna hati.
 * @param {?string} opts.wave Warna batang; null berarti batang dilubangi.
 * @returns {Canvas}
 */
function drawLogo({ size, logoWidth, bg, heart, wave }) {
  const canvas = new Canvas(size, bg);
  canvas.fill(rasterize(place(parsePath(HEART), size, logoWidth), size), heart);
  for (const [bx, by, bw, bh] of BARS) {
    const cov = rasterize(place(capsule(bx, by, bw, bh), size, logoWidth), size);
    if (wave) canvas.fill(cov, wave);
    else canvas.erase(cov);
  }
  return canvas;
}

/**
 * Satu berkas keluaran per baris.
 *
 * `foregroundWidth` sengaja lebih kecil dari `iconWidth`: gambar depan ikon
 * adaptif Android dipetakan ke 108dp sementara yang terlihat hanya 72dp di
 * tengah (66%), jadi logo yang pas di ikon biasa akan terpotong topeng.
 */
const ICON = 1024;
const iconWidth = Math.round(ICON * 0.52);
const foregroundWidth = Math.round(ICON * 0.46);

/**
 * @param {string} bg Warna latar ikon.
 * @param {string} wave Warna batang gelombang.
 * @returns {object[]} Rencana berkas untuk satu aplikasi.
 */
function plan(bg, wave) {
  return [
    {
      name: 'icon.png',
      canvas: () =>
        drawLogo({ size: ICON, logoWidth: iconWidth, bg, heart: WHITE, wave }),
    },
    {
      name: 'android-icon-foreground.png',
      canvas: () =>
        drawLogo({
          size: ICON,
          logoWidth: foregroundWidth,
          bg: null,
          heart: WHITE,
          wave,
        }),
    },
    {
      name: 'android-icon-background.png',
      canvas: () => new Canvas(ICON, bg),
    },
    {
      // Android 13+ mewarnai sendiri bentuk ini, jadi batangnya harus benar-benar
      // berlubang — diberi warna apa pun akan ikut tertimpa warna tema.
      name: 'android-icon-monochrome.png',
      canvas: () =>
        drawLogo({
          size: ICON,
          logoWidth: foregroundWidth,
          bg: null,
          heart: WHITE,
          wave: null,
        }),
    },
    {
      // Hati putih dengan batang berlubang: ditaruh di atas latar splash yang
      // sewarna merek, hasilnya persis ikon launcher — jadi ikon di layar depan
      // dan layar pembuka terbaca sebagai satu benda yang sama.
      name: 'splash-icon.png',
      canvas: () =>
        drawLogo({
          size: ICON,
          logoWidth: Math.round(ICON * 0.62),
          bg: null,
          heart: WHITE,
          wave: null,
        }),
    },
    {
      name: 'favicon.png',
      canvas: () =>
        drawLogo({ size: 48, logoWidth: 30, bg, heart: WHITE, wave }),
    },
  ];
}

const TARGETS = [
  { app: 'elder-app', bg: AMBER, wave: AMBER_DEEP },
  { app: 'family-app', bg: TEAL, wave: TEAL },
];

const root = path.resolve(__dirname, '..');
for (const { app, bg, wave } of TARGETS) {
  const dir = path.join(root, app, 'assets');
  fs.mkdirSync(dir, { recursive: true });
  console.log(`${app}  (latar ${bg}, gelombang ${wave})`);
  for (const { name, canvas } of plan(bg, wave)) {
    const out = path.join(dir, name);
    const { channels, bytes } = writePng(out, canvas());
    const kind = channels === 3 ? 'RGB ' : 'RGBA';
    console.log(`  ${name.padEnd(30)} ${kind}  ${(bytes / 1024).toFixed(1)} KB`);
  }
}
