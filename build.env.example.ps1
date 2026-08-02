# Salin file ini jadi `build.env.ps1` lalu isi. File itu di-gitignore.
#
# Kalau `build.env.ps1` tidak ada, build-apk.ps1 tetap jalan — passwordnya
# ditanyakan saat itu juga dan tidak disimpan ke mana pun. File ini cuma untuk
# menghemat ketikan kalau kamu sering build.
#
# JANGAN commit build.env.ps1, dan jangan tempel isinya ke chat atau issue.

# Lokasi keystore. Sengaja DI LUAR folder repo supaya tidak ikut ter-commit
# karena kelalaian. Kalau app pernah dibagikan, ini WAJIB keystore yang sama —
# Android menolak update yang ditandatangani kunci berbeda.
$KeystorePath = "$env:USERPROFILE\.caretaker-keys\caretaker.jks"

$KeyAlias = 'caretaker'

$KeystorePassword = 'ganti-dengan-password-keystore'

# Boleh dikosongkan kalau sama dengan password keystore.
$KeyPassword = ''

# Opsional. Biarkan kosong dan build-apk.ps1 akan mencari sendiri JDK 17 (atau
# 21) di tempat-tempat yang lazim, termasuk JDK bawaan Android Studio. Isi hanya
# kalau JDK-mu ada di lokasi tidak lazim dan tidak ketemu otomatis.
# $JdkPath = "C:\Program Files\Microsoft\jdk-17.0.13.11-hotspot"
