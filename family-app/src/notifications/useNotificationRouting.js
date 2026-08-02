/**
 * Membuka layar yang benar saat notifikasi diketuk.
 *
 * Dua jalan masuk yang harus ditangani terpisah:
 *
 *   app hidup di latar  → listener `saatNotifikasiDiketuk`
 *   app sedang mati     → `notifikasiPembuka`, karena responsnya sudah lewat
 *                         sebelum React sempat memasang listener apa pun
 *
 * Yang kedua justru kasus paling penting: kabar darurat datang saat HP di saku
 * dan app tidak sedang dibuka. Kalau hanya listener yang dipasang, ketukan itu
 * cuma membuka Beranda dan keluarga harus mencari sendiri kejadiannya.
 */
import { useEffect, useRef } from 'react';
import { useNavigation } from '@react-navigation/native';
import { useElders } from '../context/ElderContext.js';
import { notifikasiPembuka, saatNotifikasiDiketuk } from './push.js';

export function useNotificationRouting() {
  const nav = useNavigation();
  const { setElderId } = useElders();

  // Notifikasi pembuka hanya boleh dipakai sekali. Tanpa penanda ini, kembali
  // ke layar ini setelah menutup kejadian akan membukanya lagi.
  const pembukaTerpakai = useRef(false);

  useEffect(() => {
    /** @param {Record<string, string>} data payload dari backend */
    function buka(data) {
      if (!data || data.type !== 'emergency') return;
      // Nilai dari FCM selalu string, dan id dari Postgres juga sampai sebagai
      // string ("7"). Jadi keduanya sudah sebentuk — jangan diubah ke number,
      // pembanding `===` di layar lain memakai bentuk string.
      const { elderId, emergencyId } = data;
      if (!elderId || !emergencyId) return;

      setElderId(elderId);
      nav.navigate('KejadianDarurat', { elderId, eventId: emergencyId });
    }

    const lepas = saatNotifikasiDiketuk(buka);

    if (!pembukaTerpakai.current) {
      pembukaTerpakai.current = true;
      notifikasiPembuka()
        .then((data) => data && buka(data))
        .catch(() => {});
    }

    return lepas;
  }, [nav, setElderId]);
}
