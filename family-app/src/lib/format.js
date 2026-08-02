/**
 * Format tanggal/jam berbahasa Indonesia. Dipindahkan dari mockup HTML
 * (`mockup-keluarga/app.js`) supaya tampilan tetap sama.
 */

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

export const MOOD_LABEL = {
  1: 'Sangat kurang',
  2: 'Kurang',
  3: 'Biasa',
  4: 'Baik',
  5: 'Sangat baik',
};

/** Urutan tampilan mulai Senin. 0=Minggu..6=Sabtu, sama seperti kolom `days_of_week`. */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
export const DAY_LABEL = { 0: 'Min', 1: 'Sen', 2: 'Sel', 3: 'Rab', 4: 'Kam', 5: 'Jum', 6: 'Sab' };
const DAY_NAME_FULL = {
  0: 'Minggu', 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu',
};
export const DAY_PRESETS = {
  all: [0, 1, 2, 3, 4, 5, 6],
  weekday: [1, 2, 3, 4, 5],
  weekend: [0, 6],
};

export function sameDays(a, b) {
  if (a.length !== b.length) return false;
  const key = (arr) => [...arr].sort((x, y) => x - y).join(',');
  return key(a) === key(b);
}

/** Ubah array hari jadi teks ringkas untuk ditampilkan di daftar jadwal. */
export function formatDays(days) {
  if (!days?.length) return 'Setiap hari';
  if (sameDays(days, DAY_PRESETS.all)) return 'Setiap hari';
  if (sameDays(days, DAY_PRESETS.weekday)) return 'Hari kerja (Sen–Jum)';
  if (sameDays(days, DAY_PRESETS.weekend)) return 'Akhir pekan (Sab–Min)';
  if (days.length === 1) return `Setiap ${DAY_NAME_FULL[days[0]]}`;
  return DAY_ORDER.filter((d) => days.includes(d)).map((d) => DAY_LABEL[d]).join(', ');
}

/** "19.00" titik sebagai pemisah jam, konvensi Indonesia. */
export function jam(input) {
  const d = new Date(input);
  return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "Sen, 4 Agu" */
export function tanggal(input) {
  const d = toDate(input);
  return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
}

export function relatif(input) {
  const diff = (Date.now() - new Date(input).getTime()) / 60000;
  if (diff < 1) return 'baru saja';
  if (diff < 60) return `${Math.round(diff)} menit lalu`;
  if (diff < 24 * 60) return `${Math.round(diff / 60)} jam lalu`;
  const hari = Math.round(diff / (60 * 24));
  return hari === 1 ? 'kemarin' : `${hari} hari lalu`;
}

export function isToday(input) {
  return new Date(input).toDateString() === new Date().toDateString();
}

/**
 * Postgres `DATE` datang sebagai "2026-07-29". `new Date()` membacanya sebagai
 * UTC tengah malam, yang bisa mundur sehari di zona WIB jadi tanggal polos
 * dirakit manual sebagai waktu lokal.
 */
export function toDate(input) {
  if (input instanceof Date) return input;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(input));
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(input);
}

/** "2026-07-29" dari sebuah Date, memakai tanggal lokal (bukan UTC). */
export function dateKey(d = new Date()) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Menit sejak sebuah waktu. Negatif berarti belum lewat. */
export function lateMinutes(input) {
  return (Date.now() - new Date(input).getTime()) / 60000;
}

/** "07:00:00" (kolom TIME) atau "07:00" -> "07.00" */
export function jamDariTime(timeOfDay) {
  return String(timeOfDay).slice(0, 5).replace(':', '.');
}

/** "07:00:00" -> "07:00" untuk dikirim balik ke backend. */
export function trimTime(timeOfDay) {
  return String(timeOfDay).slice(0, 5);
}

/** "Ibu Sumarni" -> "SU". Dipakai sebagai avatar teks. */
export function initials(name) {
  return String(name || '?')
    .replace(/^(Ibu|Bapak|Pak|Bu)\s+/i, '')
    .slice(0, 2)
    .toUpperCase();
}

/**
 * "Ibu Sumarni" -> "Bu Sumarni". Cerminan `shortName()` di
 * `backend/src/services/contextEngine.js` dipakai untuk menyapa lansia.
 */
export function shortName(fullName) {
  const parts = String(fullName || '').trim().split(/\s+/);
  if (/^(ibu|bapak|pak|bu)$/i.test(parts[0])) {
    const sapaan = /^ibu$/i.test(parts[0]) ? 'Bu' : /^bapak$/i.test(parts[0]) ? 'Pak' : parts[0];
    return [sapaan, ...parts.slice(1)].join(' ');
  }
  return parts[0] || '';
}

export function umur(birthYear) {
  return birthYear ? new Date().getFullYear() - birthYear : null;
}
