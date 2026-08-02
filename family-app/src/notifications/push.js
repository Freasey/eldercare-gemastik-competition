/**
 * Push notification ke HP keluarga langkah terakhir jalur darurat (PLAN §2.4).
 *
 * Yang dikirim ke backend adalah **token FCM mentah** (`getDevicePushTokenAsync`),
 * bukan `ExponentPushToken[...]`. Bedanya penting: token Expo baru sampai ke
 * Android setelah service account FCM diunggah ke project Expo lewat
 * `eas credentials` satu langkah interaktif lagi yang harus diingat orang.
 * Token FCM langsung dilayani `firebase-admin` di backend memakai service
 * account yang sudah kita punya, jadi rantainya lebih pendek dan lebih sedikit
 * yang bisa lupa dikerjakan. Backend menerima kedua bentuk (`services/push.js`),
 * jadi ini keputusan yang bisa dibalik tanpa mengubah server.
 *
 * Konsekuensi: `google-services.json` WAJIB ada di root project ini dan
 * ditunjuk `android.googleServicesFile` di app.json. Tanpa itu token-nya tidak
 * pernah terbit dan notifikasi diam-diam tidak akan pernah datang.
 */
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import { deleteDevice, registerDevice } from '../api/caretaker.js';

/**
 * Dua kanal, bukan satu.
 *
 * Kanal `emergency` sengaja MAX importance dan menembus mode senyap. Kalau
 * kabar harian dan panggilan darurat berbagi satu kanal, keluarga hanya punya
 * dua pilihan: diganggu terus-menerus, atau membisukan keduanya dan yang
 * kedua itulah yang biasanya terjadi.
 */
const KANAL = {
  emergency: {
    name: 'Darurat',
    importance: Notifications.AndroidImportance.MAX,
    vibrationPattern: [0, 500, 250, 500, 250, 500],
    lightColor: '#D64545',
    bypassDnd: true,
    sound: 'default',
  },
  default: {
    name: 'Kabar harian',
    importance: Notifications.AndroidImportance.DEFAULT,
    lightColor: '#0E7C6B',
    sound: 'default',
  },
};

/**
 * Notifikasi darurat tetap muncul walau app sedang dibuka. Untuk kabar biasa
 * itu mengganggu, tapi kejadian darurat yang cuma menambah baris di layar
 * riwayat sama saja dengan tidak diberitahu.
 */
Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const darurat = notification.request.content.data?.type === 'emergency';
    return {
      shouldPlaySound: darurat,
      shouldSetBadge: false,
      shouldShowBanner: darurat,
      shouldShowList: true,
    };
  },
});

/** Buat kanal Android. Aman dipanggil berkali-kali. */
export async function siapkanKanal() {
  if (Platform.OS !== 'android') return;
  await Promise.all(
    Object.entries(KANAL).map(([id, cfg]) => Notifications.setNotificationChannelAsync(id, cfg)),
  );
}

/**
 * Minta izin lalu daftarkan token ke backend.
 *
 * @returns {Promise<{ok: true, token: string} | {ok: false, alasan: string}>}
 *   Sengaja mengembalikan alasan, bukan melempar: layar Profil menampilkannya
 *   apa adanya supaya "notifikasi mati" bisa dibedakan dari "izin ditolak".
 */
export async function daftarkanPush() {
  if (!Device.isDevice) {
    return { ok: false, alasan: 'Notifikasi tidak jalan di emulator tanpa Google Play Services.' };
  }

  await siapkanKanal();

  const { status: statusAwal } = await Notifications.getPermissionsAsync();
  let status = statusAwal;
  if (status !== 'granted') {
    status = (await Notifications.requestPermissionsAsync()).status;
  }
  if (status !== 'granted') {
    return { ok: false, alasan: 'Izin notifikasi ditolak. Nyalakan lewat Pengaturan Android.' };
  }

  let token;
  try {
    const hasil = await Notifications.getDevicePushTokenAsync();
    token = hasil.data;
  } catch (err) {
    // Paling sering: google-services.json belum ikut ter-build, atau HP tanpa
    // Google Play Services.
    return { ok: false, alasan: `Gagal mengambil token FCM: ${err.message}` };
  }

  try {
    await registerDevice(token, Platform.OS);
  } catch (err) {
    return { ok: false, alasan: `Token didapat tapi gagal didaftarkan: ${err.message}` };
  }

  return { ok: true, token };
}

/**
 * Cabut pendaftaran saat logout kalau tidak, HP ini tetap menerima kabar
 * darurat lansia milik akun yang sudah ditinggalkan.
 */
export async function batalkanPush() {
  try {
    const { data: token } = await Notifications.getDevicePushTokenAsync();
    await deleteDevice(token);
  } catch {
    // Tidak apa-apa: token yang tidak terhapus akan dibuang backend sendiri
    // begitu FCM menyatakannya tidak berlaku lagi.
  }
}

/** Status izin sekarang, untuk ditampilkan di layar Profil. */
export async function statusIzin() {
  const { status } = await Notifications.getPermissionsAsync();
  return status; // 'granted' | 'denied' | 'undetermined'
}

/**
 * Pasang dua listener sekaligus dan kembalikan pelepasnya.
 *
 * @param {(data: object) => void} onKetuk dipanggil saat notifikasi diketuk
 */
export function saatNotifikasiDiketuk(onKetuk) {
  const langganan = Notifications.addNotificationResponseReceivedListener((res) => {
    onKetuk(res.notification.request.content.data ?? {});
  });
  return () => langganan.remove();
}

/**
 * Notifikasi yang membuka app dari keadaan mati. Listener di atas tidak
 * menangkapnya responsnya sudah lewat sebelum React sempat memasang
 * langganan. Ini justru kasus yang paling penting untuk darurat: HP di saku,
 * app tertutup.
 */
export async function notifikasiPembuka() {
  const terakhir = await Notifications.getLastNotificationResponseAsync();
  return terakhir?.notification?.request?.content?.data ?? null;
}
