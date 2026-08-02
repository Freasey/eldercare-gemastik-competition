# Salin file ini jadi `build.env.ps1` lalu isi. File itu di-gitignore.
#
# Seluruh isinya OPSIONAL build-apk.ps1 jalan tanpa file ini sama sekali.
# Tidak ada kredensial di sini: APK ditandatangani dengan debug key bawaan
# template Expo, karena app ini tidak diunggah ke Play Store.

# Biarkan kosong dan build-apk.ps1 akan mencari sendiri JDK 17 (atau 21) di
# tempat-tempat yang lazim, termasuk JDK bawaan Android Studio. Isi hanya kalau
# JDK-mu ada di lokasi tidak lazim dan tidak ketemu otomatis.
# $JdkPath = "C:\Users\freax\android-build\jdk\jdk-17.0.19+10"
