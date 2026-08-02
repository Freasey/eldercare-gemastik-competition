/**
 * Pengingat lewat notifikasi LOKAL, bukan push (PLAN §2.6).
 *
 * Keputusannya begini karena jaringan di rumah lansia tidak bisa diandalkan,
 * dan pengingat obat adalah fitur yang paling tidak boleh ikut mati saat
 * internet mati. Push dari server butuh sambungan tepat pada detik itu;
 * notifikasi lokal sudah tersimpan di HP sejak sinkron terakhir.
 *
 * Konsekuensinya: jadwal harus di-cache dan dijadwalkan ulang setiap kali app
 * berhasil menghubungi backend.
 */
import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { fetchReminders } from '../api/caretaker.js';
import { loadReminders, saveReminders } from '../lib/store.js';

const CHANNEL_ID = 'pengingat';

/** Sama dengan `SNOOZE_MINUTES` di backend (`services/reminders.js`). */
const SNOOZE_MENIT = 15;

/**
 * Notifikasi tetap berbunyi walau app sedang terbuka. Pada app biasa ini
 * mengganggu; di sini justru diperlukan layar app tidak menampilkan daftar
 * apa pun, jadi notifikasi adalah satu-satunya penanda visual bahwa ada
 * jadwal yang jatuh tempo.
 */
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: true,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/** Siapkan izin + channel Android. Aman dipanggil berkali-kali. */
export async function siapkanNotifikasi() {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync(CHANNEL_ID, {
      name: 'Pengingat',
      // MAX supaya muncul sebagai heads-up dan berbunyi walau HP disenyapkan
      // sebagian. Ini kanal untuk obat, bukan untuk kabar biasa.
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 400, 200, 400],
      lightColor: '#0e7c6b',
    });
  }

  const { status } = await Notifications.getPermissionsAsync();
  if (status === 'granted') return true;

  const diminta = await Notifications.requestPermissionsAsync();
  return diminta.status === 'granted';
}

/**
 * Ambil jadwal terbaru, simpan sebagai cache, lalu jadwalkan ulang seluruh
 * notifikasi lokal.
 *
 * Dijadwalkan ULANG seluruhnya, bukan ditambal: keluarga bisa mengubah atau
 * menghapus jadwal kapan saja dari app mereka, dan notifikasi lama yang tidak
 * ikut terhapus akan menagih obat yang sudah dibatalkan dokter.
 *
 * @param {number} elderId
 * @returns {Promise<{dijadwalkan: number}>}
 */
export async function sinkronPengingat(elderId) {
  const { reminders } = await fetchReminders(elderId, 2);
  await saveReminders(reminders);
  return jadwalkanUlang(reminders.map(sederhanakan));
}

/** Jadwalkan ulang dari cache dipakai saat app dibuka tanpa sambungan. */
export async function jadwalkanUlangDariCache() {
  return jadwalkanUlang(await loadReminders());
}

async function jadwalkanUlang(daftar) {
  await Notifications.cancelAllScheduledNotificationsAsync();

  const menunggu = daftar.filter(
    (r) => ['pending', 'snoozed'].includes(r.status) && new Date(r.dueAt).getTime() > Date.now(),
  );

  for (const r of menunggu) await jadwalkanSatu(r, new Date(r.dueAt));

  return { dijadwalkan: menunggu.length };
}

/**
 * Penundaan saat offline. Jawaban "nanti ya" baru benar-benar menggeser
 * `due_at` setelah antrean terkirim, jadi tanpa ini pengingatnya tidak pernah
 * kembali selama sinyal belum ada.
 */
export async function snoozeLokal(reminder) {
  const kembali = new Date(Date.now() + SNOOZE_MENIT * 60 * 1000);
  await jadwalkanSatu(reminder, kembali);
}

async function jadwalkanSatu(reminder, waktu) {
  await Notifications.scheduleNotificationAsync({
    content: {
      title: reminder.title,
      // Isinya bukan instruksi teknis: yang dibaca lansia harus berupa ajakan,
      // karena menjawabnya dilakukan dengan bicara, bukan dengan mengetuk menu.
      body: reminder.isCritical
        ? 'Ini penting. Ketuk untuk menjawab lewat suara.'
        : 'Ketuk untuk menjawab lewat suara.',
      data: { type: 'reminder', reminderId: reminder.id },
      sound: true,
    },
    trigger: {
      type: Notifications.SchedulableTriggerInputTypes.DATE,
      date: waktu,
      channelId: CHANNEL_ID,
    },
  });
}

const sederhanakan = (r) => ({
  id: r.id,
  title: r.title,
  isCritical: r.is_critical,
  dueAt: r.due_at,
  status: r.status,
});

/**
 * Panggil callback saat notifikasi diketuk. Dipakai layar sesi untuk membuka
 * percakapan dengan trigger `scheduled`, bukan `button`.
 */
export function saatNotifikasiDiketuk(callback) {
  const langganan = Notifications.addNotificationResponseReceivedListener((response) => {
    callback(response.notification.request.content.data);
  });
  return () => langganan.remove();
}

/**
 * Notifikasi yang membuka app dari keadaan mati. Listener di atas tidak
 * menangkapnya kejadiannya sudah lewat sebelum React sempat memasang
 * langganan.
 */
export async function notifikasiPembuka() {
  const terakhir = await Notifications.getLastNotificationResponseAsync();
  return terakhir?.notification?.request?.content?.data ?? null;
}
