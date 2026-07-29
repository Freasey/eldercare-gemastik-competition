/* ============================================================
 * AI Caretaker — mockup app keluarga
 *
 * Prototipe UI, bukan aplikasi produksi: semua data dari data.js,
 * tidak ada network call. Struktur layar & state di sini dipakai
 * sebagai acuan saat dipindah ke React Native.
 * ============================================================ */

(function () {
  'use strict';

  const { USER, ELDERS, OPENING_LABELS, SCHEDULE_TYPES } = DEMO;

  const state = {
    loggedIn: false,
    tab: 'beranda',
    elderId: ELDERS[0].id,
    overlay: null,     // { type, id }
    sheet: null,       // { type }
    call: null,        // { name, muted, speaker, startedAt }
    push: null,        // { title, body }
    range: 7,          // rentang grafik riwayat
    scheduleFilter: 'all',
    tables: {},        // id grafik -> tampilkan tabel?
    toast: null,
  };

  const root = document.getElementById('root');
  const device = document.getElementById('device');
  let callTimer = null;
  let toastTimer = null;

  /* ---------------------------------------------------------
   * Ikon
   * ------------------------------------------------------- */

  const PATHS = {
    check: '<polyline points="20 6 9 17 4 12"/>',
    clock: '<circle cx="12" cy="12" r="9"/><polyline points="12 7 12 12 15.5 14"/>',
    alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><line x1="12" y1="9" x2="12" y2="13.5"/><line x1="12" y1="17" x2="12.01" y2="17"/>',
    minus: '<line x1="6" y1="12" x2="18" y2="12"/>',
    pill: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z"/><path d="m8.5 8.5 7 7"/>',
    walk: '<circle cx="13" cy="4" r="1.6"/><path d="m9 20 2.5-6-2-1.5V9l4-1.5 2.5 3 2.5 1"/><path d="M11.5 13 8 16.5"/>',
    moon: '<path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/>',
    bed: '<path d="M3 20V8m0 5h18v7"/><path d="M21 13a3 3 0 0 0-3-3h-7v3"/><circle cx="7" cy="11" r="2"/>',
    bowl: '<path d="M3 11h18a9 9 0 0 1-18 0Z"/><path d="M12 7c0-1.5-1.5-1.5-1.5-3"/>',
    stethoscope: '<path d="M5 3v5a4 4 0 0 0 8 0V3"/><path d="M9 12v3a5 5 0 0 0 10 0v-2"/><circle cx="19" cy="10" r="2"/>',
    chat: '<path d="M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-5A8 8 0 1 1 21 12Z"/>',
    phone: '<path d="M6.6 3.5 9 3l2 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2L21 15l-.5 2.4A2 2 0 0 1 18.4 19 15.5 15.5 0 0 1 5 5.6a2 2 0 0 1 1.6-2.1Z"/>',
    phoneOff: '<path d="M6.6 3.5 9 3l2 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2L21 15l-.5 2.4A2 2 0 0 1 18.4 19 15.5 15.5 0 0 1 5 5.6a2 2 0 0 1 1.6-2.1Z"/><line x1="3" y1="3" x2="21" y2="21"/>',
    mic: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><line x1="12" y1="17.5" x2="12" y2="21"/>',
    micOff: '<rect x="9" y="2.5" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0"/><line x1="12" y1="17.5" x2="12" y2="21"/><line x1="3" y1="3" x2="21" y2="21"/>',
    speaker: '<path d="M11 5 6.5 9H3v6h3.5L11 19Z"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M18.5 5.5a9 9 0 0 1 0 13"/>',
    chevron: '<polyline points="9 5 16 12 9 19"/>',
    back: '<polyline points="15 5 8 12 15 19"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    close: '<line x1="6" y1="6" x2="18" y2="18"/><line x1="18" y1="6" x2="6" y2="18"/>',
    home: '<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4v-6H9v6H5a1 1 0 0 1-1-1Z"/>',
    calendar: '<rect x="3" y="5" width="18" height="16" rx="2.5"/><line x1="3" y1="10" x2="21" y2="10"/><line x1="8" y1="3" x2="8" y2="6.5"/><line x1="16" y1="3" x2="16" y2="6.5"/>',
    chart: '<line x1="4" y1="20" x2="20" y2="20"/><rect x="6" y="11" width="3.4" height="6" rx="1"/><rect x="12" y="7" width="3.4" height="10" rx="1"/>',
    siren: '<path d="M6 19v-6a6 6 0 0 1 12 0v6"/><rect x="3.5" y="19" width="17" height="3" rx="1.5"/><line x1="12" y1="3" x2="12" y2="5"/><line x1="5" y1="6" x2="6.4" y2="7.4"/><line x1="19" y1="6" x2="17.6" y2="7.4"/>',
    user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20.5a7.5 7.5 0 0 1 15 0"/>',
    lock: '<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.8a4 4 0 0 1 8 0v2.7"/>',
    shield: '<path d="M12 3 5 6v5.5c0 4.3 2.9 8.2 7 9.5 4.1-1.3 7-5.2 7-9.5V6Z"/>',
    bell: '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 4 1.5 5.5 1.5 5.5H5S6.5 14 6.5 10Z"/><path d="M10 19a2.2 2.2 0 0 0 4 0"/>',
    heart: '<path d="M12 20s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 7.7a4.4 4.4 0 0 1 7.5 2.7C19.5 15.4 12 20 12 20Z"/>',
    sync: '<path d="M4 11a8 8 0 0 1 13.3-5.9L20 7.5"/><polyline points="20 3 20 8 15 8"/><path d="M20 13a8 8 0 0 1-13.3 5.9L4 16.5"/><polyline points="4 21 4 16 9 16"/>',
    battery: '<rect x="2.5" y="7.5" width="16" height="9" rx="2.5"/><path d="M21 11v2"/>',
    info: '<circle cx="12" cy="12" r="9"/><line x1="12" y1="11" x2="12" y2="16.5"/><line x1="12" y1="7.7" x2="12.01" y2="7.7"/>',
    trash: '<path d="M5 7h14"/><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7"/><path d="M6.5 7 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7"/>',
    edit: '<path d="M4 20h4l10-10-4-4L4 16Z"/><path d="m14.5 5.5 4 4"/>',
    google: '<path d="M21 12.2c0-.7-.06-1.2-.2-1.8H12v3.4h5.1a4.4 4.4 0 0 1-1.9 2.9v2.4h3.1c1.8-1.7 2.7-4.1 2.7-6.9Z" fill="#4285F4" stroke="none"/><path d="M12 21.5c2.4 0 4.5-.8 6-2.2l-3-2.3a5.6 5.6 0 0 1-8.4-3H3.5v2.4A9.5 9.5 0 0 0 12 21.5Z" fill="#34A853" stroke="none"/><path d="M6.6 14a5.7 5.7 0 0 1 0-3.6V8H3.5a9.5 9.5 0 0 0 0 8.5Z" fill="#FBBC05" stroke="none"/><path d="M12 6.4c1.3 0 2.5.5 3.5 1.4l2.6-2.6A9.5 9.5 0 0 0 3.5 8l3.1 2.4A5.6 5.6 0 0 1 12 6.4Z" fill="#EA4335" stroke="none"/>',
  };

  function icon(name, size) {
    const s = size || 18;
    const filled = name === 'google';
    return (
      `<svg width="${s}" height="${s}" viewBox="0 0 24 24" fill="none" ` +
      `stroke="${filled ? 'none' : 'currentColor'}" stroke-width="1.8" ` +
      `stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${PATHS[name] || ''}</svg>`
    );
  }

  /* ---------------------------------------------------------
   * Helper
   * ------------------------------------------------------- */

  const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];
  const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const MOOD_LABEL = { 1: 'Sangat kurang', 2: 'Kurang', 3: 'Biasa', 4: 'Baik', 5: 'Sangat baik' };

  // Urutan tampilan mulai Senin. 0=Minggu..6=Sabtu, sama seperti backend.
  const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0];
  const DAY_LABEL = { 0: 'Min', 1: 'Sen', 2: 'Sel', 3: 'Rab', 4: 'Kam', 5: 'Jum', 6: 'Sab' };
  const DAY_NAME_FULL = { 0: 'Minggu', 1: 'Senin', 2: 'Selasa', 3: 'Rabu', 4: 'Kamis', 5: 'Jumat', 6: 'Sabtu' };
  const DAY_PRESETS = {
    all: [0, 1, 2, 3, 4, 5, 6],
    weekday: [1, 2, 3, 4, 5],
    weekend: [0, 6],
  };

  function sameDays(a, b) {
    if (a.length !== b.length) return false;
    const sa = [...a].sort((x, y) => x - y).join(',');
    const sb = [...b].sort((x, y) => x - y).join(',');
    return sa === sb;
  }

  /** Ubah array hari jadi teks ringkas untuk ditampilkan di daftar jadwal. */
  function formatDays(days) {
    if (sameDays(days, DAY_PRESETS.all)) return 'Setiap hari';
    if (sameDays(days, DAY_PRESETS.weekday)) return 'Hari kerja (Sen–Jum)';
    if (sameDays(days, DAY_PRESETS.weekend)) return 'Akhir pekan (Sab–Min)';
    if (days.length === 1) return `Setiap ${DAY_NAME_FULL[days[0]]}`;
    return DAY_ORDER.filter((d) => days.includes(d)).map((d) => DAY_LABEL[d]).join(', ');
  }

  const elder = () => ELDERS.find((e) => e.id === state.elderId);
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const initials = (name) => name.replace(/^(Ibu|Bapak|Pak|Bu)\s+/i, '').slice(0, 2).toUpperCase();

  function jam(iso) {
    const d = new Date(iso);
    return `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function tanggal(input) {
    const d = new Date(input);
    return `${HARI[d.getDay()]}, ${d.getDate()} ${BULAN[d.getMonth()]}`;
  }

  function relatif(iso) {
    const diff = (Date.now() - new Date(iso)) / 60000;
    if (diff < 1) return 'baru saja';
    if (diff < 60) return `${Math.round(diff)} menit lalu`;
    if (diff < 24 * 60) return `${Math.round(diff / 60)} jam lalu`;
    const hari = Math.round(diff / (60 * 24));
    return hari === 1 ? 'kemarin' : `${hari} hari lalu`;
  }

  const isToday = (iso) => new Date(iso).toDateString() === new Date().toDateString();

  /** Menit sejak jadwal HH:MM hari ini (negatif = belum waktunya). */
  function lewatMenit(hhmm) {
    const [h, m] = hhmm.split(':').map(Number);
    const due = new Date();
    due.setHours(h, m, 0, 0);
    return (Date.now() - due) / 60000;
  }

  /* ---------------------------------------------------------
   * Context engine versi ringkas
   * Mencerminkan aturan prioritas di backend
   * (backend/src/services/contextEngine.js). Ditampilkan supaya
   * keluarga tahu apa yang akan diucapkan app ke lansia.
   * ------------------------------------------------------- */

  function hitungPrioritas(e) {
    const aktif = e.today.filter((r) => r.status === 'pending' || r.status === 'spoken');
    const overdue = aktif
      .filter((r) => lewatMenit(r.time) >= 30)
      .sort((a, b) => (b.isCritical - a.isCritical) || (lewatMenit(b.time) - lewatMenit(a.time)));
    const dueNow = aktif.filter((r) => {
      const m = lewatMenit(r.time);
      return m >= -15 && m < 30;
    });

    const nama = e.shortName;
    const terlambat = (r) => {
      const m = Math.round(lewatMenit(r.time));
      if (m >= 120) return `${Math.floor(m / 60)} jam yang lalu`;
      if (m >= 60) return 'satu jam yang lalu';
      return `${m} menit yang lalu`;
    };

    const kritis = overdue.find((r) => r.isCritical);
    if (kritis) {
      return {
        kind: 'reminder_overdue_critical',
        reminder: kritis,
        speech: `${nama}, ${terlambat(kritis)} waktunya ${kritis.title.toLowerCase()}. Ini penting, sudah dilakukan belum?`,
      };
    }
    if (overdue.length) {
      const r = overdue[0];
      return { kind: 'reminder_overdue', reminder: r, speech: `${nama}, ${terlambat(r)} waktunya ${r.title.toLowerCase()}. Sudah atau belum?` };
    }
    if (dueNow.length) {
      const r = dueNow[0];
      return { kind: 'reminder_due_now', reminder: r, speech: `${nama}, sekarang waktunya ${r.title.toLowerCase()}.` };
    }

    const moodTerakhir = e.conversations.find((c) => isToday(c.at));
    if (!moodTerakhir) {
      return { kind: 'mood_checkin_overdue', speech: `Halo ${nama}. Hari ini perasaannya bagaimana?` };
    }

    const h = new Date().getHours();
    const sapaan = h < 11 ? 'Selamat pagi,' : h < 15 ? 'Selamat siang,' : h < 18 ? 'Selamat sore,' : 'Selamat malam,';
    return { kind: 'general_greeting', speech: `${sapaan} ${nama}. Ada yang ingin diceritakan?` };
  }

  /* ---------------------------------------------------------
   * Grafik
   * ------------------------------------------------------- */

  const VW = 326; // lebar viewBox, kira-kira sama dengan lebar konten

  /**
   * Bar: kepatuhan obat per hari (0-100%).
   * Satu seri, jadi tidak perlu legenda warna seri. Hari yang ada
   * obat terlewat memakai warna status + ikon + keterangan, tidak
   * pernah mengandalkan warna saja.
   */
  function chartKepatuhan(data, id) {
    const H = 132, padL = 26, padR = 4, padT = 12, padB = 20;
    const plotW = VW - padL - padR, plotH = H - padT - padB;
    const n = data.length;
    const slot = plotW / n;
    const barW = Math.min(20, slot - 5);

    let grid = '';
    [0, 50, 100].forEach((v) => {
      const y = padT + plotH - (v / 100) * plotH;
      grid +=
        `<line x1="${padL}" y1="${y}" x2="${VW - padR}" y2="${y}" stroke="var(--grid)" stroke-width="1"/>` +
        `<text x="${padL - 7}" y="${y + 3.5}" text-anchor="end" font-size="9" fill="var(--ink-3)">${v}</text>`;
    });

    let bars = '';
    data.forEach((d, i) => {
      const pct = d.total ? (d.taken / d.total) * 100 : 0;
      const h = Math.max(2, (pct / 100) * plotH);
      const x = padL + i * slot + (slot - barW) / 2;
      const y = padT + plotH - h;
      const kurang = d.taken < d.total;
      const warna = kurang ? 'var(--critical)' : 'var(--series-1)';
      const r = Math.min(4, h);

      // ujung atas membulat 4px, dasar menempel ke baseline
      bars +=
        `<path d="M${x} ${y + h} L${x} ${y + r} Q${x} ${y} ${x + r} ${y} L${x + barW - r} ${y} ` +
        `Q${x + barW} ${y} ${x + barW} ${y + r} L${x + barW} ${y + h} Z" fill="${warna}"/>`;

      if (kurang) {
        bars += `<circle cx="${x + barW / 2}" cy="${y - 6}" r="2.6" fill="var(--critical)"/>`;
      }

      bars +=
        `<rect x="${padL + i * slot}" y="${padT}" width="${slot}" height="${plotH}" fill="transparent" ` +
        `data-tip="${esc(tanggal(d.date))} · ${d.taken} dari ${d.total} dosis${kurang ? ' · ada yang terlewat' : ''}"/>`;

      if (n <= 7 || i % 2 === 0) {
        const dd = new Date(d.date);
        bars += `<text x="${padL + i * slot + slot / 2}" y="${H - 5}" text-anchor="middle" font-size="9" fill="var(--ink-3)">${dd.getDate()}</text>`;
      }
    });

    const baseline = `<line x1="${padL}" y1="${padT + plotH}" x2="${VW - padR}" y2="${padT + plotH}" stroke="var(--axis)" stroke-width="1"/>`;

    return chartShell(
      id,
      `<svg class="chart" viewBox="0 0 ${VW} ${H}" role="img" aria-label="Kepatuhan minum obat harian dalam persen">${grid}${baseline}${bars}</svg>`,
      `<span>${swatch('var(--series-1)')} Lengkap</span>` +
        `<span>${swatch('var(--critical)')} ${icon('alert', 12)} Ada yang terlewat</span>`,
      () =>
        tabel(
          ['Tanggal', 'Diminum', 'Total'],
          data.map((d) => [tanggal(d.date), d.taken, d.total]),
        ),
    );
  }

  /** Garis: suasana hati harian (skala 1-5). Satu seri, judul kartu yang menamainya. */
  function chartMood(data, id) {
    const H = 128, padL = 26, padR = 8, padT = 14, padB = 20;
    const plotW = VW - padL - padR, plotH = H - padT - padB;
    const n = data.length;
    const x = (i) => padL + (n === 1 ? plotW / 2 : (i / (n - 1)) * plotW);
    const y = (v) => padT + plotH - ((v - 1) / 4) * plotH;

    let grid = '';
    [1, 3, 5].forEach((v) => {
      grid +=
        `<line x1="${padL}" y1="${y(v)}" x2="${VW - padR}" y2="${y(v)}" stroke="var(--grid)" stroke-width="1"/>` +
        `<text x="${padL - 7}" y="${y(v) + 3.5}" text-anchor="end" font-size="9" fill="var(--ink-3)">${v}</text>`;
    });

    const d = data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ');
    const area =
      `M${x(0)} ${padT + plotH} ` +
      data.map((p, i) => `L${x(i).toFixed(1)} ${y(p.score).toFixed(1)}`).join(' ') +
      ` L${x(n - 1)} ${padT + plotH} Z`;

    let dots = '';
    data.forEach((p, i) => {
      const rendah = p.score <= 2;
      dots +=
        `<circle cx="${x(i)}" cy="${y(p.score)}" r="${rendah ? 4.5 : 3.4}" fill="${rendah ? 'var(--warning)' : 'var(--series-1)'}" ` +
        `stroke="var(--surface)" stroke-width="2"/>`;
      dots +=
        `<rect x="${x(i) - plotW / n / 2}" y="${padT}" width="${plotW / n}" height="${plotH}" fill="transparent" ` +
        `data-tip="${esc(tanggal(p.date))} · ${p.score} dari 5 · ${MOOD_LABEL[p.score]}"/>`;
      if (i === 0 || i === n - 1) {
        dots += `<text x="${x(i)}" y="${H - 5}" text-anchor="${i === 0 ? 'start' : 'end'}" font-size="9" fill="var(--ink-3)">${tanggal(p.date).split(', ')[1]}</text>`;
      }
    });

    return chartShell(
      id,
      `<svg class="chart" viewBox="0 0 ${VW} ${H}" role="img" aria-label="Suasana hati harian, skala 1 sampai 5">` +
        `${grid}<path d="${area}" fill="var(--series-1)" fill-opacity="0.08"/>` +
        `<path d="${d}" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>` +
        `${dots}</svg>`,
      `<span>${swatch('var(--warning)')} ${icon('alert', 12)} Hari dengan suasana hati rendah</span>`,
      () =>
        tabel(
          ['Tanggal', 'Skor', 'Keterangan'],
          data.map((p) => [tanggal(p.date), `${p.score}/5`, MOOD_LABEL[p.score]]),
        ),
    );
  }

  function swatch(color) {
    return `<i class="legend-swatch" style="background:${color}"></i>`;
  }

  function tabel(head, rows) {
    return (
      '<table class="data-table"><thead><tr>' +
      head.map((h) => `<th>${esc(h)}</th>`).join('') +
      '</tr></thead><tbody>' +
      rows.map((r) => `<tr>${r.map((c) => `<td>${esc(c)}</td>`).join('')}</tr>`).join('') +
      '</tbody></table>'
    );
  }

  /** Bungkus grafik: area hover + legenda + tautan "lihat tabel". */
  function chartShell(id, svg, legend, tableFn) {
    const open = !!state.tables[id];
    return (
      `<div class="chart-wrap" data-chart="${id}">${svg}<div class="tooltip" data-tooltip></div></div>` +
      `<div class="chart-legend">${legend}</div>` +
      `<div class="table-toggle"><button class="link-btn" data-action="toggle-table" data-id="${id}">` +
      `${open ? 'Sembunyikan tabel' : 'Lihat sebagai tabel'}</button></div>` +
      (open ? tableFn() : '')
    );
  }

  /* ---------------------------------------------------------
   * Layar: login
   * ------------------------------------------------------- */

  function viewLogin() {
    return `
      <div class="login">
        <div class="login-mark">${icon('heart', 30)}</div>
        <h1>Tetap dekat<br />dengan orang tua</h1>
        <p>Atur pengingat obat, lihat kabar harian, dan terima peringatan darurat — tanpa harus terus menelepon.</p>
        <div class="login-actions">
          <button class="btn btn-google btn-block" data-action="login">${icon('google', 18)} Masuk dengan Google</button>
          <button class="btn btn-ghost btn-block" data-action="login">Coba sebagai demo</button>
        </div>
        <p class="login-foot">Data kesehatan hanya dibagikan sesuai izin yang diberikan lansia.</p>
      </div>`;
  }

  /* ---------------------------------------------------------
   * Layar: beranda
   * ------------------------------------------------------- */

  function viewBeranda(e) {
    const prioritas = hitungPrioritas(e);
    const obat = e.today.filter((r) => r.type === 'medication');
    const obatSelesai = obat.filter((r) => r.status === 'confirmed').length;
    const moodHariIni = e.mood[e.mood.length - 1].score;
    const ngobrol = e.conversations.filter((c) => isToday(c.at)).length;
    const perluPerhatian = e.redFlags.length > 0;

    const berikutnya = e.today.filter((r) => r.status === 'pending' || r.status === 'spoken');

    return `
      <div class="content">
        <div class="card">
          <div class="hero">
            <div class="hero-avatar">${initials(e.name)}</div>
            <div style="flex:1 1 auto;min-width:0">
              <p class="hero-name">${esc(e.name)}</p>
              <p class="hero-meta">${new Date().getFullYear() - e.birthYear} tahun · ${esc(e.relation)}</p>
              <p class="hero-meta">Terakhir aktif ${relatif(e.lastActiveAt)} · baterai ${e.deviceBattery}%</p>
            </div>
            <span class="pill ${perluPerhatian ? 'pill-warning' : 'pill-good'}">
              <i class="pill-dot"></i>${perluPerhatian ? 'Perlu perhatian' : 'Aman'}
            </span>
          </div>

          <div class="stat-row">
            <div class="stat">
              <div class="stat-value">${obatSelesai}<small>/${obat.length}</small></div>
              <div class="stat-label">Obat hari ini</div>
            </div>
            <div class="stat">
              <div class="stat-value">${moodHariIni}<small>/5</small></div>
              <div class="stat-label">Suasana hati</div>
            </div>
            <div class="stat">
              <div class="stat-value">${ngobrol}<small>×</small></div>
              <div class="stat-label">Ngobrol</div>
            </div>
          </div>
        </div>

        <div class="priority">
          <span class="priority-tag">${icon('chat', 13)} ${esc(OPENING_LABELS[prioritas.kind])}</span>
          <p class="priority-speech">“${esc(prioritas.speech)}”</p>
          <p class="priority-foot">Kalimat ini yang akan diucapkan asisten ke ${esc(e.shortName)} saat tombol ditekan berikutnya.</p>
        </div>

        ${e.redFlags.length ? `
          <div>
            <p class="section-title">Perlu diperhatikan</p>
            <div style="margin-top:12px">
              ${e.redFlags.map((f) => `
                <div class="flag flag-${f.severity}">
                  <span class="flag-icon">${icon('alert', 15)}</span>
                  <div>
                    <p class="flag-title">${esc(f.label)}</p>
                    <p class="flag-detail">${esc(f.detail)}</p>
                  </div>
                </div>`).join('')}
            </div>
          </div>` : ''}

        <div class="card">
          <div class="card-head">
            <h2 class="card-title">Sisa jadwal hari ini</h2>
            <button class="link-btn" data-action="tab" data-tab="jadwal">Semua jadwal</button>
          </div>
          ${berikutnya.length
            ? `<div class="rows">${berikutnya.map(rowJadwal).join('')}</div>`
            : `<p class="empty" style="padding:14px 0">Semua jadwal hari ini sudah selesai.</p>`}
        </div>

        <div class="card">
          <div class="card-head">
            <h2 class="card-title">Aktivitas terbaru</h2>
            <button class="link-btn" data-action="tab" data-tab="riwayat">Lihat riwayat</button>
          </div>
          <div class="rows">${timelineItems(e).slice(0, 4).join('')}</div>
        </div>
      </div>`;
  }

  function rowJadwal(r) {
    const meta = SCHEDULE_TYPES[r.type] || SCHEDULE_TYPES.activity;
    const telat = (r.status === 'pending' || r.status === 'spoken') && lewatMenit(r.time) >= 30;
    return `
      <div class="row">
        <span class="row-time">${r.time.replace(':', '.')}</span>
        <span class="row-icon">${icon(meta.icon, 16)}</span>
        <div class="row-body">
          <div class="row-title">${esc(r.title)}</div>
          <div class="row-sub">${meta.label}${r.isCritical ? ' · penting' : ''}${telat ? ' · belum dikonfirmasi' : ''}</div>
        </div>
        <div class="row-end">${statusIcon(telat ? 'missed' : r.status)}</div>
      </div>`;
  }

  function statusIcon(status) {
    const map = {
      confirmed: ['status-confirmed', 'check', 'Sudah dikonfirmasi'],
      pending: ['status-pending', 'clock', 'Belum waktunya'],
      spoken: ['status-pending', 'clock', 'Sudah diingatkan'],
      missed: ['status-missed', 'alert', 'Terlewat'],
      skipped: ['status-skipped', 'minus', 'Dilewati'],
    };
    const [cls, ic, label] = map[status] || map.pending;
    return `<span class="status-icon ${cls}" title="${label}">${icon(ic, 13)}<span class="sr-only">${label}</span></span>`;
  }

  /* ---------------------------------------------------------
   * Layar: jadwal
   * ------------------------------------------------------- */

  function viewJadwal(e) {
    const filters = [
      ['all', 'Semua'],
      ['medication', 'Obat'],
      ['prayer', 'Ibadah'],
      ['activity', 'Aktivitas'],
      ['sleep', 'Istirahat'],
    ];

    const list = e.schedules.filter((s) => state.scheduleFilter === 'all' || s.type === state.scheduleFilter);

    return `
      <div class="content">
        <div class="chips">
          ${filters.map(([v, l]) => `<button class="chip" aria-pressed="${state.scheduleFilter === v}" data-action="filter" data-value="${v}">${l}</button>`).join('')}
        </div>

        <div class="card">
          <div class="card-head">
            <h2 class="card-title">Jadwal berulang</h2>
            <p class="card-note">${list.length} jadwal aktif</p>
          </div>
          ${list.length ? `<div class="rows">${list.map((s) => {
            const meta = SCHEDULE_TYPES[s.type] || SCHEDULE_TYPES.activity;
            return `
              <button class="row" data-action="edit-schedule" data-id="${s.id}">
                <span class="row-time">${s.timeOfDay.replace(':', '.')}</span>
                <span class="row-icon">${icon(meta.icon, 16)}</span>
                <div class="row-body">
                  <div class="row-title">${esc(s.title)}</div>
                  <div class="row-sub">${esc(formatDays(s.daysOfWeek))}${s.dosage ? ` · ${esc(s.dosage)}` : ''}${s.isCritical ? ' · penting' : ''}</div>
                </div>
                <div class="row-end">${icon('chevron', 16)}</div>
              </button>`;
          }).join('')}</div>` : `<p class="empty">Belum ada jadwal untuk kategori ini.</p>`}
        </div>

        <button class="btn btn-primary btn-block" data-action="add-schedule">${icon('plus', 17)} Tambah jadwal</button>

        <div class="card" style="display:flex;gap:11px;align-items:flex-start">
          <span class="row-icon" style="background:var(--accent-soft);color:var(--accent-ink)">${icon('sync', 16)}</span>
          <div>
            <p class="card-title" style="margin-bottom:4px">Langsung tersinkron</p>
            <p class="card-note" style="line-height:1.5">Perubahan jadwal langsung dikirim ke HP ${esc(e.shortName)}. Beliau tidak perlu melakukan apa pun — asisten yang akan mengingatkan sesuai jam baru.</p>
          </div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------
   * Layar: riwayat
   * ------------------------------------------------------- */

  function viewRiwayat(e) {
    const n = state.range;
    const adh = e.adherence.slice(-n);
    const mood = e.mood.slice(-n);

    const totalTaken = adh.reduce((s, d) => s + d.taken, 0);
    const totalDose = adh.reduce((s, d) => s + d.total, 0);
    const persen = totalDose ? Math.round((totalTaken / totalDose) * 100) : 0;
    const moodAvg = (mood.reduce((s, d) => s + d.score, 0) / mood.length).toFixed(1);

    return `
      <div class="content">
        <div class="chips">
          ${[7, 14].map((v) => `<button class="chip" aria-pressed="${state.range === v}" data-action="range" data-value="${v}">${v} hari terakhir</button>`).join('')}
        </div>

        <div class="card">
          <div class="card-head">
            <h2 class="card-title">Kepatuhan minum obat</h2>
          </div>
          <div class="chart-hero"><b>${persen}%</b><span>${totalTaken} dari ${totalDose} dosis</span></div>
          ${chartKepatuhan(adh, 'kepatuhan')}
        </div>

        <div class="card">
          <div class="card-head">
            <h2 class="card-title">Suasana hati</h2>
          </div>
          <div class="chart-hero"><b>${moodAvg}</b><span>rata-rata dari skala 5</span></div>
          ${chartMood(mood, 'mood')}
        </div>

        <div class="card">
          <div class="card-head">
            <h2 class="card-title">Pola bicara</h2>
            <span class="pill ${e.cognitive.trend === 'stabil' ? 'pill-good' : 'pill-warning'}"><i class="pill-dot"></i>${esc(e.cognitive.trend)}</span>
          </div>
          <p class="card-note" style="line-height:1.55">${esc(e.cognitive.note)}</p>
        </div>

        <div class="card">
          <div class="card-head"><h2 class="card-title">Percakapan</h2></div>
          <div class="rows">
            ${e.conversations.map((c) => `
              <button class="row" data-action="open-transcript" data-id="${c.id}">
                <span class="row-icon">${icon('chat', 16)}</span>
                <div class="row-body">
                  <div class="row-title">${esc(OPENING_LABELS[c.openingKind])}</div>
                  <div class="row-sub">${tanggal(c.at)} ${jam(c.at)} · ${c.durationMin} menit</div>
                </div>
                <div class="row-end">${c.transcriptShared ? '' : `<span class="status-icon status-pending" title="Transkrip tidak dibagikan">${icon('lock', 12)}</span>`}${icon('chevron', 16)}</div>
              </button>`).join('')}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><h2 class="card-title">Ringkasan harian</h2></div>
          <div class="rows">
            ${e.dailySummaries.map((s) => `
              <div class="row">
                <div class="row-body">
                  <div class="row-title">${tanggal(s.date)}</div>
                  <div class="row-sub">${s.highlights.map(esc).join(' · ')}</div>
                </div>
                <div class="row-end">
                  <span class="pill ${s.taken === s.total ? 'pill-good' : 'pill-critical'}"><i class="pill-dot"></i>${s.taken}/${s.total} obat</span>
                </div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------
   * Layar: darurat
   * ------------------------------------------------------- */

  function viewDarurat(e) {
    const aktif = e.emergencies.filter((x) => x.status !== 'resolved');

    return `
      <div class="content">
        <div class="card" style="text-align:center">
          <span class="status-icon ${aktif.length ? 'status-missed' : 'status-confirmed'}" style="width:44px;height:44px;margin:2px auto 12px">
            ${icon(aktif.length ? 'siren' : 'shield', 22)}
          </span>
          <p class="card-title" style="font-size:16px">${aktif.length ? 'Ada kejadian yang perlu ditangani' : 'Tidak ada kejadian darurat'}</p>
          <p class="card-note" style="margin-top:6px;line-height:1.5">
            ${aktif.length
              ? 'Buka detail kejadian untuk menghubungi langsung.'
              : `${e.emergencies.length ? `Kejadian terakhir ${relatif(e.emergencies[0].at)} dan sudah ditangani.` : 'Belum pernah ada kejadian.'} Asisten akan mengirim notifikasi ke HP Anda begitu ada tanda bahaya.`}
          </p>
          <div style="display:flex;gap:9px;margin-top:15px">
            <button class="btn btn-primary" style="flex:1" data-action="call">${icon('phone', 17)} Telepon</button>
            <button class="btn btn-ghost" style="flex:1" data-action="simulate-push">${icon('bell', 17)} Simulasi alarm</button>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2 class="card-title">Bagaimana alurnya</h2>
          </div>
          ${[
            ['siren', 'Terdeteksi', 'Kata "tolong", deteksi jatuh, atau pengingat penting diabaikan berulang.'],
            ['chat', 'Dikonfirmasi dulu', `Asisten bertanya ke ${esc(e.shortName)} sebelum membangunkan keluarga — supaya tidak salah alarm.`],
            ['bell', 'Notifikasi ke keluarga', 'Semua anggota keluarga yang terhubung menerima notifikasi prioritas tinggi.'],
            ['phone', 'Panggilan dalam aplikasi', 'Kalau tidak direspons, panggilan suara langsung terbuka di dalam aplikasi.'],
          ].map(([ic, judul, isi], i) => `
            <div class="row">
              <span class="row-icon" style="background:var(--accent-soft);color:var(--accent-ink)">${icon(ic, 15)}</span>
              <div class="row-body">
                <div class="row-title">${i + 1}. ${judul}</div>
                <div class="row-sub">${isi}</div>
              </div>
            </div>`).join('')}
        </div>

        <div class="card">
          <div class="card-head"><h2 class="card-title">Riwayat kejadian</h2></div>
          ${e.emergencies.length ? `<div class="rows">${e.emergencies.map((x) => `
            <button class="row" data-action="open-emergency" data-id="${x.id}">
              <span class="row-icon" style="background:var(--critical-soft);color:var(--critical)">${icon('siren', 15)}</span>
              <div class="row-body">
                <div class="row-title">${x.triggerType === 'keyword' ? 'Kata bahaya terdeteksi' : x.triggerType === 'fall_detection' ? 'Terdeteksi jatuh' : 'Pengingat penting terlewat'}</div>
                <div class="row-sub">${tanggal(x.at)} ${jam(x.at)} · selesai ditangani</div>
              </div>
              <div class="row-end">${icon('chevron', 16)}</div>
            </button>`).join('')}</div>` : `<p class="empty">Belum pernah ada kejadian darurat. Semoga tetap begitu.</p>`}
        </div>

        <div class="card">
          <div class="card-head"><h2 class="card-title">Kontak darurat</h2></div>
          <div class="rows">
            ${e.contacts.map((c) => `
              <div class="row">
                <span class="row-icon">${initials(c.name)}</span>
                <div class="row-body">
                  <div class="row-title">${esc(c.name)}</div>
                  <div class="row-sub">${esc(c.relation)} · ${esc(c.phone)}</div>
                </div>
                <div class="row-end">${c.inApp ? `<span class="pill pill-good"><i class="pill-dot"></i>Dalam app</span>` : ''}</div>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------
   * Layar: profil
   * ------------------------------------------------------- */

  function viewProfil(e) {
    return `
      <div class="content">
        <div class="card">
          <div class="hero">
            <div class="hero-avatar">${initials(e.name)}</div>
            <div>
              <p class="hero-name">${esc(e.name)}</p>
              <p class="hero-meta">${esc(e.address)}</p>
              <p class="hero-meta">${esc(e.phone)}</p>
            </div>
          </div>
          <div class="rows" style="margin-top:12px">
            <div class="row"><div class="row-body"><div class="row-sub">Tahun lahir</div><div class="row-title">${e.birthYear} (${new Date().getFullYear() - e.birthYear} tahun)</div></div></div>
            <div class="row"><div class="row-body"><div class="row-sub">Pengingat ibadah</div><div class="row-title">${e.prayerReminder ? 'Aktif — jadwal sholat' : 'Tidak aktif'}</div></div></div>
            <div class="row"><div class="row-body"><div class="row-sub">Perangkat terhubung</div><div class="row-title">Sejak ${tanggal(e.pairedAt)}</div></div></div>
          </div>
        </div>

        <div class="card">
          <div class="card-head">
            <h2 class="card-title">Privasi &amp; izin</h2>
            <span class="pill">${icon('lock', 12)} Dikunci</span>
          </div>
          <p class="card-note" style="margin:-6px 0 12px;line-height:1.5">
            Hanya ${esc(e.shortName)} yang bisa mengubah izin ini, dari perangkatnya sendiri. Anda bisa melihat, tapi tidak bisa menyalakan.
          </p>
          ${e.consents.map((c) => `
            <div class="consent-row">
              <div class="consent-body">
                <div class="consent-label">${esc(c.label)}</div>
                <div class="consent-state">${c.granted ? 'Diizinkan' : 'Tidak diizinkan'}</div>
              </div>
              <button class="switch" data-on="${c.granted}" data-action="consent-locked" aria-label="${esc(c.label)}"></button>
            </div>`).join('')}
        </div>

        <div class="card">
          <div class="card-head"><h2 class="card-title">Akun Anda</h2></div>
          <div class="rows">
            <div class="row">
              <span class="row-icon">${initials(USER.name)}</span>
              <div class="row-body">
                <div class="row-title">${esc(USER.name)}</div>
                <div class="row-sub">${esc(USER.email)} · keluarga</div>
              </div>
            </div>
            <div class="row">
              <span class="row-icon">${icon('bell', 16)}</span>
              <div class="row-body">
                <div class="row-title">Notifikasi darurat</div>
                <div class="row-sub">Aktif · prioritas tinggi, bunyi walau mode senyap</div>
              </div>
              <div class="row-end"><span class="switch" data-on="true"></span></div>
            </div>
          </div>
        </div>

        <button class="btn btn-ghost btn-block" data-action="logout">Keluar</button>
        <p class="card-note" style="text-align:center">AI Caretaker · mockup v0.1</p>
      </div>`;
  }

  /* ---------------------------------------------------------
   * Timeline
   * ------------------------------------------------------- */

  function timelineItems(e) {
    const items = [];

    e.today.forEach((r) => {
      const telat = (r.status === 'pending' || r.status === 'spoken') && lewatMenit(r.time) >= 30;
      if (r.status === 'confirmed' || telat) {
        items.push({
          at: new Date().setHours(...r.time.split(':').map(Number), 0, 0),
          icon: (SCHEDULE_TYPES[r.type] || SCHEDULE_TYPES.activity).icon,
          title: r.title,
          sub: telat ? 'Belum dikonfirmasi' : 'Dikonfirmasi sudah dilakukan',
          status: telat ? 'missed' : 'confirmed',
        });
      }
    });

    e.conversations.forEach((c) => {
      items.push({
        at: new Date(c.at).getTime(),
        icon: 'chat',
        title: OPENING_LABELS[c.openingKind],
        sub: c.summary,
        action: `data-action="open-transcript" data-id="${c.id}"`,
      });
    });

    e.emergencies.forEach((x) => {
      items.push({
        at: new Date(x.at).getTime(),
        icon: 'siren',
        title: 'Kejadian darurat',
        sub: x.detail,
        action: `data-action="open-emergency" data-id="${x.id}"`,
      });
    });

    return items
      .sort((a, b) => b.at - a.at)
      .map((it) => {
        const inner =
          `<span class="row-icon">${icon(it.icon, 16)}</span>` +
          `<div class="row-body"><div class="row-title">${esc(it.title)}</div>` +
          `<div class="row-sub">${esc(it.sub)}</div></div>` +
          `<div class="row-end">${it.status ? statusIcon(it.status) : `<span class="row-sub">${relatif(it.at)}</span>`}</div>`;
        return it.action
          ? `<button class="row" ${it.action}>${inner}</button>`
          : `<div class="row">${inner}</div>`;
      });
  }

  /* ---------------------------------------------------------
   * Overlay
   * ------------------------------------------------------- */

  function overlayTranscript(e, id) {
    const c = e.conversations.find((x) => x.id === Number(id));
    const start = new Date(c.at);

    const body = c.transcriptShared
      ? `<div class="bubble-list">${c.messages.map((m) => `
          <div class="bubble bubble-${m.role === 'elder' ? 'elder' : 'assistant'}">
            ${esc(m.text)}
            <div class="bubble-time" style="${m.role === 'elder' ? 'color:rgba(255,255,255,.65)' : ''}">${jam(new Date(start.getTime() + m.min * 60000))}</div>
          </div>`).join('')}</div>`
      : `<div class="locked">
           <span class="row-icon">${icon('lock', 16)}</span>
           <div>
             <p class="card-title" style="margin-bottom:4px">Transkrip tidak dibagikan</p>
             <p class="card-note" style="line-height:1.5">${esc(e.shortName)} belum mengizinkan isi percakapan dibagikan ke keluarga. Anda tetap menerima ringkasannya.</p>
           </div>
         </div>`;

    return overlayShell('Percakapan', `
      <div class="card">
        <div class="card-head">
          <h2 class="card-title">${esc(OPENING_LABELS[c.openingKind])}</h2>
          <p class="card-note">${c.durationMin} menit</p>
        </div>
        <p class="card-note" style="line-height:1.55">${tanggal(c.at)} pukul ${jam(c.at)} · dibuka ${c.trigger === 'button' ? 'oleh lansia (tombol)' : 'otomatis oleh jadwal'}</p>
      </div>
      <div class="card">
        <div class="card-head"><h2 class="card-title">Ringkasan</h2></div>
        <p class="card-note" style="line-height:1.6;font-size:13.5px;color:var(--ink)">${esc(c.summary)}</p>
      </div>
      <p class="section-title">Isi percakapan</p>
      ${body}`);
  }

  function overlayEmergency(e, id) {
    const x = e.emergencies.find((v) => v.id === Number(id));
    const judul = { keyword: 'Kata bahaya terdeteksi', fall_detection: 'Terdeteksi jatuh', missed_critical: 'Pengingat penting terlewat' }[x.triggerType];

    return overlayShell('Kejadian darurat', `
      <div class="card">
        <div class="card-head">
          <h2 class="card-title">${esc(judul)}</h2>
          <span class="pill pill-good"><i class="pill-dot"></i>Selesai</span>
        </div>
        <p class="card-note" style="line-height:1.6;color:var(--ink);font-size:13.5px">${esc(x.detail)}</p>
      </div>

      <div class="card">
        <div class="card-head"><h2 class="card-title">Kronologi</h2></div>
        <div class="rows">
          <div class="row"><span class="row-time">${jam(x.at)}</span><div class="row-body"><div class="row-title">Terdeteksi</div><div class="row-sub">Asisten menangkap tanda bahaya</div></div></div>
          ${x.confirmedByElder !== undefined ? `<div class="row"><span class="row-time">${jam(new Date(new Date(x.at).getTime() + 60000))}</span><div class="row-body"><div class="row-title">Dikonfirmasi ${esc(e.shortName)}</div><div class="row-sub">${x.confirmedByElder ? 'Membenarkan butuh bantuan' : 'Menyatakan baik-baik saja'}</div></div></div>` : ''}
          <div class="row"><span class="row-time">${jam(new Date(new Date(x.at).getTime() + 3 * 60000))}</span><div class="row-body"><div class="row-title">Notifikasi terkirim</div><div class="row-sub">Ke ${e.contacts.filter((c) => c.inApp).length} anggota keluarga</div></div></div>
          <div class="row"><span class="row-time">${jam(x.resolvedAt)}</span><div class="row-body"><div class="row-title">Ditutup</div><div class="row-sub">Ditangani ${esc(x.handledBy)}</div></div></div>
        </div>
      </div>

      <button class="btn btn-primary btn-block" data-action="call">${icon('phone', 17)} Telepon ${esc(e.shortName)}</button>`);
  }

  function overlayShell(title, body) {
    return `
      <div class="overlay">
        <div class="overlay-bar">
          <button class="icon-btn" data-action="close-overlay" aria-label="Kembali">${icon('back', 17)}</button>
          <h2>${esc(title)}</h2>
        </div>
        <div class="overlay-body">${body}</div>
      </div>`;
  }

  /* ---------------------------------------------------------
   * Sheet
   * ------------------------------------------------------- */

  function sheetAddSchedule(e) {
    const editing = state.sheet.id != null;
    const s = editing ? e.schedules.find((x) => x.id === state.sheet.id) : null;
    const days = state.sheet.days;

    return sheetShell(`
      <h2>${editing ? 'Ubah jadwal' : 'Tambah jadwal'}</h2>
      <p class="lead">Jadwal ${editing ? 'yang diubah' : 'baru'} langsung dikirim ke HP ${esc(e.shortName)}.</p>
      <div class="field">
        <label for="s-type">Jenis</label>
        <select id="s-type">
          ${Object.entries(SCHEDULE_TYPES).map(([v, m]) =>
            `<option value="${v}" ${s ? (s.type === v ? 'selected' : '') : (v === 'medication' ? 'selected' : '')}>${esc(m.label)}</option>`,
          ).join('')}
        </select>
      </div>
      <div class="field">
        <label for="s-title">Nama jadwal</label>
        <input id="s-title" type="text" placeholder="Contoh: Minum Candesartan" value="${esc(s?.title || '')}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="s-time">Jam</label>
          <input id="s-time" type="time" value="${s?.timeOfDay || '07:00'}" />
        </div>
        <div class="field">
          <label for="s-dose">Dosis</label>
          <input id="s-dose" type="text" placeholder="8 mg" value="${esc(s?.dosage || '')}" />
        </div>
      </div>

      <div class="field">
        <label>Hari</label>
        <div class="chips">
          <button class="chip" aria-pressed="${sameDays(days, DAY_PRESETS.all)}" data-action="schedule-days-preset" data-value="all">Setiap hari</button>
          <button class="chip" aria-pressed="${sameDays(days, DAY_PRESETS.weekday)}" data-action="schedule-days-preset" data-value="weekday">Hari kerja</button>
          <button class="chip" aria-pressed="${sameDays(days, DAY_PRESETS.weekend)}" data-action="schedule-days-preset" data-value="weekend">Akhir pekan</button>
        </div>
        <div class="day-picker">
          ${DAY_ORDER.map((d) => `<button class="day-toggle" aria-pressed="${days.includes(d)}" data-action="schedule-day-toggle" data-day="${d}">${DAY_LABEL[d]}</button>`).join('')}
        </div>
        <p class="field-hint" data-days-summary>Berlaku: ${esc(formatDays(days))}</p>
      </div>

      <div class="toggle-line">
        <div>
          <div class="consent-label">Tandai penting</div>
          <div class="consent-state">Kalau terlewat, keluarga langsung diberi tahu</div>
        </div>
        <button class="switch" id="s-critical" data-on="${s ? !!s.isCritical : true}" data-action="toggle-switch"></button>
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:14px" data-action="save-schedule">${editing ? 'Simpan perubahan' : 'Simpan jadwal'}</button>
      <button class="btn btn-ghost btn-block" style="margin-top:9px" data-action="close-sheet">Batal</button>`);
  }

  /** Sinkronkan tampilan preset/toggle hari tanpa render ulang seluruh sheet
   *  (supaya isian judul/dosis yang sudah diketik tidak ikut hilang). */
  function syncDayPicker(sheetEl) {
    if (!sheetEl) return;
    const days = state.sheet.days;

    sheetEl.querySelectorAll('[data-action="schedule-days-preset"]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(sameDays(days, DAY_PRESETS[btn.dataset.value])));
    });
    sheetEl.querySelectorAll('[data-action="schedule-day-toggle"]').forEach((btn) => {
      btn.setAttribute('aria-pressed', String(days.includes(Number(btn.dataset.day))));
    });
    const summary = sheetEl.querySelector('[data-days-summary]');
    if (summary) summary.textContent = `Berlaku: ${formatDays(days)}`;
  }

  function sheetAddElder() {
    return sheetShell(`
      <h2>Tambah lansia</h2>
      <p class="lead">Buat profil dulu, lalu masukkan kode ini di HP beliau untuk menghubungkan.</p>
      <div class="field">
        <label for="e-name">Nama panggilan</label>
        <input id="e-name" type="text" placeholder="Contoh: Ibu Sumarni" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="e-year">Tahun lahir</label>
          <input id="e-year" type="number" placeholder="1953" />
        </div>
        <div class="field">
          <label for="e-rel">Hubungan</label>
          <input id="e-rel" type="text" placeholder="Ibu kandung" />
        </div>
      </div>
      <div class="card" style="text-align:center;background:var(--accent-soft);border-color:transparent">
        <p class="card-note" style="margin-bottom:6px">Kode penghubung</p>
        <p style="font-size:29px;font-weight:700;letter-spacing:0.18em;margin:0;color:var(--accent-ink)">K7M2QD</p>
        <p class="card-note" style="margin-top:8px;line-height:1.5">Berlaku 24 jam. Sebutkan lewat telepon atau ketikkan langsung di HP beliau.</p>
      </div>
      <button class="btn btn-primary btn-block" style="margin-top:14px" data-action="close-sheet">Selesai</button>`);
  }

  function sheetShell(inner) {
    return `<div class="scrim" data-action="close-sheet"><div class="sheet" data-stop><div class="sheet-grip"></div>${inner}</div></div>`;
  }

  /* ---------------------------------------------------------
   * Layar panggilan (simulasi LiveKit)
   * ------------------------------------------------------- */

  function viewCall() {
    const e = elder();
    const detik = Math.floor((Date.now() - state.call.startedAt) / 1000);
    const mm = String(Math.floor(detik / 60)).padStart(2, '0');
    const ss = String(detik % 60).padStart(2, '0');

    return `
      <div class="call">
        <span class="call-tag">Panggilan dalam aplikasi</span>
        <div class="call-avatar">${initials(e.name)}</div>
        <div class="call-name">${esc(e.name)}</div>
        <div class="call-status">${detik < 3 ? 'Menghubungkan…' : `${mm}.${ss}`}</div>
        <p class="call-note">Panggilan berjalan lewat internet di dalam aplikasi, jadi tidak memakai pulsa dan ${esc(e.shortName)} cukup menekan satu tombol untuk menjawab.</p>
        <div class="call-actions">
          <button class="call-btn" data-active="${!!state.call.muted}" data-action="toggle-mute" aria-label="Bisukan mikrofon">${icon(state.call.muted ? 'micOff' : 'mic', 22)}</button>
          <button class="call-btn end" data-action="end-call" aria-label="Akhiri panggilan">${icon('phoneOff', 24)}</button>
          <button class="call-btn" data-active="${!!state.call.speaker}" data-action="toggle-speaker" aria-label="Pengeras suara">${icon('speaker', 22)}</button>
        </div>
      </div>`;
  }

  /* ---------------------------------------------------------
   * Render
   * ------------------------------------------------------- */

  const TABS = [
    ['beranda', 'Beranda', 'home'],
    ['jadwal', 'Jadwal', 'calendar'],
    ['riwayat', 'Riwayat', 'chart'],
    ['darurat', 'Darurat', 'siren'],
    ['profil', 'Profil', 'user'],
  ];

  const JUDUL = {
    beranda: ['Kabar hari ini', tanggal(new Date())],
    jadwal: ['Jadwal', 'Atur pengingat harian'],
    riwayat: ['Riwayat', 'Pola dua minggu terakhir'],
    darurat: ['Darurat', 'Status dan kontak penting'],
    profil: ['Profil', 'Data lansia dan akun Anda'],
  };

  function render() {
    if (!state.loggedIn) {
      root.innerHTML = viewLogin();
      return;
    }

    const e = elder();
    const [judul, sub] = JUDUL[state.tab];

    const view = {
      beranda: viewBeranda,
      jadwal: viewJadwal,
      riwayat: viewRiwayat,
      darurat: viewDarurat,
      profil: viewProfil,
    }[state.tab](e);

    root.innerHTML = `
      <div class="screen" id="screen">
        <header class="appbar">
          <div class="appbar-row">
            <div>
              <h1>${esc(judul)}</h1>
              <p class="sub">${esc(sub)}</p>
            </div>
            <div class="avatar" title="${esc(USER.name)}">${initials(USER.name)}</div>
          </div>
          <div class="elder-strip">
            ${ELDERS.map((x) => `
              <button class="elder-chip" aria-pressed="${x.id === state.elderId}" data-action="elder" data-id="${x.id}">
                <span class="mini">${initials(x.name)}</span>${esc(x.shortName)}
              </button>`).join('')}
            <button class="elder-chip add" data-action="add-elder">${icon('plus', 15)} Tambah</button>
          </div>
        </header>
        ${view}
      </div>

      <nav class="tabbar">
        ${TABS.map(([id, label, ic]) => {
          const badge = id === 'beranda' && e.redFlags.length ? `<span class="tab-badge">${e.redFlags.length}</span>` : '';
          return `<button class="tab" aria-selected="${state.tab === id}" data-action="tab" data-tab="${id}">${icon(ic, 21)}${badge}<span>${label}</span></button>`;
        }).join('')}
      </nav>

      ${state.overlay ? (state.overlay.type === 'transcript' ? overlayTranscript(e, state.overlay.id) : overlayEmergency(e, state.overlay.id)) : ''}
      ${state.sheet ? (state.sheet.type === 'schedule' ? sheetAddSchedule(e) : sheetAddElder()) : ''}
      ${state.call ? viewCall() : ''}
      ${state.push ? `
        <div class="push" data-action="open-push">
          <span class="push-icon">${icon('siren', 17)}</span>
          <div>
            <div class="push-title">${esc(state.push.title)}</div>
            <div class="push-body">${esc(state.push.body)}</div>
          </div>
        </div>` : ''}
      ${state.toast ? `<div class="push" style="background:var(--ink);cursor:default"><span class="push-icon" style="background:var(--accent)">${icon('lock', 16)}</span><div><div class="push-title">${esc(state.toast)}</div></div></div>` : ''}`;

    wireCharts();
  }

  /** Tooltip hover untuk semua grafik yang sedang tampil. */
  function wireCharts() {
    document.querySelectorAll('.chart-wrap').forEach((wrap) => {
      const tip = wrap.querySelector('[data-tooltip]');

      wrap.querySelectorAll('[data-tip]').forEach((hit) => {
        const show = () => {
          const wr = wrap.getBoundingClientRect();
          const hr = hit.getBoundingClientRect();
          tip.textContent = hit.getAttribute('data-tip');
          tip.classList.add('show');
          const x = Math.min(Math.max(hr.left - wr.left + hr.width / 2, 54), wr.width - 54);
          tip.style.left = `${x}px`;
          tip.style.top = `${Math.max(hr.top - wr.top + 4, 26)}px`;
        };
        hit.addEventListener('mouseenter', show);
        hit.addEventListener('touchstart', show, { passive: true });
        hit.addEventListener('mouseleave', () => tip.classList.remove('show'));
      });

      wrap.addEventListener('mouseleave', () => tip.classList.remove('show'));
    });
  }

  function toast(msg) {
    state.toast = msg;
    render();
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      state.toast = null;
      render();
    }, 2600);
  }

  /* ---------------------------------------------------------
   * Interaksi
   * ------------------------------------------------------- */

  document.addEventListener('click', (ev) => {
    const el = ev.target.closest('[data-action]');
    if (!el) return;

    // Scrim hanya menutup sheet kalau yang diklik memang di luar sheet.
    if (el.classList.contains('scrim') && ev.target.closest('.sheet')) return;

    const action = el.dataset.action;

    switch (action) {
      case 'login':
        state.loggedIn = true;
        break;
      case 'logout':
        state.loggedIn = false;
        state.tab = 'beranda';
        break;
      case 'tab':
        state.tab = el.dataset.tab;
        if (typeof history !== 'undefined' && history.replaceState) {
          history.replaceState(null, '', `#${state.tab}`);
        }
        break;
      case 'elder':
        state.elderId = Number(el.dataset.id);
        break;
      case 'filter':
        state.scheduleFilter = el.dataset.value;
        break;
      case 'range':
        state.range = Number(el.dataset.value);
        break;
      case 'toggle-table':
        state.tables[el.dataset.id] = !state.tables[el.dataset.id];
        break;
      case 'open-transcript':
        state.overlay = { type: 'transcript', id: el.dataset.id };
        break;
      case 'open-emergency':
        state.overlay = { type: 'emergency', id: el.dataset.id };
        break;
      case 'close-overlay':
        state.overlay = null;
        break;
      case 'add-schedule':
        state.sheet = { type: 'schedule', id: null, days: DAY_PRESETS.all.slice() };
        break;
      case 'edit-schedule': {
        const s = elder().schedules.find((x) => x.id === Number(el.dataset.id));
        state.sheet = { type: 'schedule', id: s.id, days: s.daysOfWeek.slice() };
        break;
      }
      case 'schedule-days-preset':
        state.sheet.days = DAY_PRESETS[el.dataset.value].slice();
        syncDayPicker(el.closest('.sheet'));
        return;
      case 'schedule-day-toggle': {
        const day = Number(el.dataset.day);
        const days = state.sheet.days;
        const i = days.indexOf(day);
        if (i >= 0) {
          if (days.length > 1) days.splice(i, 1); // minimal satu hari harus aktif
        } else {
          days.push(day);
        }
        syncDayPicker(el.closest('.sheet'));
        return;
      }
      case 'add-elder':
        state.sheet = { type: 'elder' };
        break;
      case 'close-sheet':
        state.sheet = null;
        break;
      case 'save-schedule': {
        const sheetEl = el.closest('.sheet');
        const e2 = elder();
        const type = sheetEl.querySelector('#s-type').value;
        const title = sheetEl.querySelector('#s-title').value.trim();
        const timeOfDay = sheetEl.querySelector('#s-time').value || '07:00';
        const dosage = sheetEl.querySelector('#s-dose').value.trim();
        const isCritical = sheetEl.querySelector('#s-critical').dataset.on === 'true';
        const days = state.sheet.days.slice();

        if (state.sheet.id != null) {
          const s = e2.schedules.find((x) => x.id === state.sheet.id);
          Object.assign(s, {
            type,
            title: title || s.title,
            timeOfDay,
            dosage: dosage || s.dosage,
            isCritical,
            daysOfWeek: days,
          });
        } else {
          const nextId = Math.max(0, ...e2.schedules.map((x) => x.id)) + 1;
          e2.schedules.push({ id: nextId, type, title: title || 'Jadwal baru', timeOfDay, dosage: dosage || undefined, isCritical, daysOfWeek: days });
        }

        state.sheet = null;
        toast(`Jadwal tersimpan · ${formatDays(days)}`);
        return;
      }
      case 'toggle-switch':
        el.dataset.on = el.dataset.on === 'true' ? 'false' : 'true';
        return;
      case 'consent-locked':
        toast('Hanya lansia yang bisa mengubah izin ini');
        return;
      case 'call':
        state.push = null;
        state.call = { startedAt: Date.now(), muted: false, speaker: true };
        clearInterval(callTimer);
        callTimer = setInterval(render, 1000);
        break;
      case 'end-call':
        state.call = null;
        clearInterval(callTimer);
        break;
      case 'toggle-mute':
        state.call.muted = !state.call.muted;
        break;
      case 'toggle-speaker':
        state.call.speaker = !state.call.speaker;
        break;
      case 'simulate-push':
        state.push = {
          title: `Darurat: ${elder().name}`,
          body: 'Butuh bantuan sekarang. Ketuk untuk menghubungi.',
        };
        break;
      case 'open-push':
        state.push = null;
        state.call = { startedAt: Date.now(), muted: false, speaker: true };
        clearInterval(callTimer);
        callTimer = setInterval(render, 1000);
        break;
      default:
        return;
    }

    render();
  });

  /* ---------------------------------------------------------
   * Alamat: #beranda, #jadwal, #riwayat, #darurat, #profil
   * Memudahkan membuka satu layar langsung saat mereview mockup.
   * ------------------------------------------------------- */

  const NAMA_TAB = TABS.map(([id]) => id);

  function bacaHash() {
    const h = (location.hash || '').replace('#', '');
    if (NAMA_TAB.includes(h)) {
      state.loggedIn = true;
      state.tab = h;
    }
  }

  window.addEventListener('hashchange', () => {
    bacaHash();
    render();
  });

  /* ---------------------------------------------------------
   * Jam pada status bar
   * ------------------------------------------------------- */

  function tickClock() {
    const d = new Date();
    document.getElementById('clock').textContent =
      `${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
  }

  tickClock();
  setInterval(tickClock, 20000);
  bacaHash();
  render();
})();
