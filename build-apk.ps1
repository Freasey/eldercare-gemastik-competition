<#
.SYNOPSIS
    Build APK release untuk kedua app AI Caretaker, sekali jalan.

.DESCRIPTION
    Menyiapkan file yang tidak ikut git, prebuild, lalu assembleRelease untuk
    family-app dan elder-app, dan menyalin hasilnya ke dist\.

    Kenapa hanya release, tidak ada pilihan debug: APK debug memuat JS dari
    Metro, jadi mati begitu laptop yang membuildnya dimatikan. Yang bisa
    dibagikan ke orang lain hanya release.

    TANDA TANGAN: memakai debug keystore bawaan template Expo. App ini tidak
    diunggah ke Play Store, jadi tidak ada gunanya mengurus keystore sendiri 
    template Expo SDK 57 sudah menulis `signingConfig signingConfigs.debug` pada
    buildType release, dan `expo prebuild` menyediakan `debug.keystore`-nya.
    APK-nya tetap sah dipasang di HP mana pun.

    Konsekuensi yang harus disadari kalau suatu hari berubah pikiran: APK
    ber-debug-key TIDAK bisa diunggah ke Play Store, dan begitu nanti diganti
    keystore sungguhan, APK lama harus di-uninstall dulu sebelum yang baru bisa
    dipasang Android menolak update yang kuncinya berbeda.

.PARAMETER App
    'semua' (bawaan), 'family', atau 'elder'.

.PARAMETER LewatiPrebuild
    Pakai folder android\ yang sudah ada. Jauh lebih cepat, tapi TIDAK boleh
    dipakai kalau app.json atau daftar dependency berubah.

.EXAMPLE
    .\build-apk.ps1
    .\build-apk.ps1 -App elder -LewatiPrebuild
#>
#Requires -Version 5.1
[CmdletBinding()]
param(
    [ValidateSet('semua', 'family', 'elder')]
    [string]$App = 'semua',
    [switch]$LewatiPrebuild
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot

<#
    Penangkap error tak terduga.

    Tanpa ini, kesalahan apa pun yang tidak diantisipasi muncul sebagai
    "At line:1 char:1 + .\build-apk.ps1" yang menunjuk ke pemanggilan script,
    bukan ke baris yang benar-benar bermasalah, dan praktis tidak bisa
    didiagnosis dari jarak jauh.
#>
trap {
    Write-Host "`nGAGAL (tidak terduga): $($_.Exception.Message)" -ForegroundColor Red
    Write-Host "  baris $($_.InvocationInfo.ScriptLineNumber): $($_.InvocationInfo.Line.Trim())" -ForegroundColor DarkGray
    if ($root) { Set-Location $root }
    exit 1
}

function Tulis-Tahap($teks) { Write-Host "`n=== $teks ===" -ForegroundColor Cyan }
function Tulis-Ok($teks) { Write-Host "  OK  $teks" -ForegroundColor Green }
function Tulis-Ingat($teks) { Write-Host "  !   $teks" -ForegroundColor Yellow }
function Berhenti($teks) {
    Write-Host "`nGAGAL: $teks" -ForegroundColor Red
    # `exit` melompati blok finally yang memegang Pop-Location, jadi tanpa baris
    # ini shell ditinggalkan di dalam folder android\ milik salah satu app.
    Set-Location $root
    exit 1
}

# ------------------------------------------------------------- konfigurasi --

<#
    Dibaca di sini, di level script, bukan di dalam fungsi: dot-source menaruh
    variabelnya di scope pemanggil, jadi kalau dilakukan di dalam fungsi
    nilainya ikut hilang begitu fungsi itu selesai. Dan `JdkPath` sudah
    dibutuhkan sebelum urusan keystore dimulai.
#>
$script:PathKonfigurasi = Join-Path $root 'build.env.ps1'
$script:AdaKonfigurasi = Test-Path $script:PathKonfigurasi
if ($script:AdaKonfigurasi) { . $script:PathKonfigurasi }

# ------------------------------------------------------------------- JDK --

<#
    Versi JDK yang boleh dipakai, berurut dari yang paling disukai.

    17 adalah yang disebut dokumen Expo SDK 57. 21 tetap diterima karena
    Android Gradle Plugin 8.x mendukungnya dan Android Studio versi baru
    membundel JBR 21 memblokirnya berarti menyuruh orang memasang JDK kedua
    padahal yang ada kemungkinan besar sudah jalan. Kalau 21 yang terpilih,
    script memberi tahu supaya 17 jadi tersangka pertama saat Gradle rewel.
#>
$script:JdkDiterima = @(17, 21)

<#
    Baca versi major sebuah folder JDK dari berkas `release` di dalamnya.
    Lebih murah dan lebih andal daripada menjalankan java.exe sekali per
    kandidat, dan tidak terpengaruh stderr yang aneh-aneh.
#>
function Baca-VersiJdk($folder) {
    $release = Join-Path $folder 'release'
    if (Test-Path $release) {
        $baris = Select-String -Path $release -Pattern '^JAVA_VERSION="?(\d+)' | Select-Object -First 1
        if ($baris) { return [int]$baris.Matches[0].Groups[1].Value }
    }

    $exe = Join-Path $folder 'bin\java.exe'
    if (-not (Test-Path $exe)) { return 0 }

    # `2>&1` di PowerShell 5.1 membungkus stderr native jadi ErrorRecord dan
    # membuat $? bernilai false walau exit code 0. Lewat cmd.exe tidak begitu.
    $keluaran = cmd /c "`"$exe`" -version 2>&1"
    $cocok = [regex]::Match(($keluaran -join ' '), 'version "(\d+)')
    if ($cocok.Success) { return [int]$cocok.Groups[1].Value }
    return 0
}

<# Semua tempat JDK biasa mendarat di Windows, termasuk bawaan Android Studio. #>
function Cari-SemuaJdk {
    $folder = New-Object System.Collections.Generic.List[string]

    if ($env:JAVA_HOME) { $folder.Add($env:JAVA_HOME) }

    # Android Studio membundel JetBrains Runtime sering satu-satunya JDK yang
    # dipunya orang yang tidak pernah sengaja memasang Java.
    foreach ($studio in @(
            "$env:ProgramFiles\Android\Android Studio\jbr",
            "${env:ProgramFiles(x86)}\Android\Android Studio\jbr",
            "$env:LOCALAPPDATA\Programs\Android Studio\jbr")) {
        if (Test-Path $studio) { $folder.Add($studio) }
    }

    foreach ($induk in @(
            "$env:ProgramFiles\Microsoft",
            "$env:ProgramFiles\Eclipse Adoptium",
            "$env:ProgramFiles\Amazon Corretto",
            "$env:ProgramFiles\Zulu",
            "$env:ProgramFiles\Java",
            "${env:ProgramFiles(x86)}\Java",
            "$env:LOCALAPPDATA\Programs\Eclipse Adoptium")) {
        if (-not (Test-Path $induk)) { continue }
        Get-ChildItem $induk -Directory -ErrorAction SilentlyContinue | ForEach-Object {
            if (Test-Path (Join-Path $_.FullName 'bin\java.exe')) { $folder.Add($_.FullName) }
        }
    }

    $hasil = @()
    foreach ($f in ($folder | Select-Object -Unique)) {
        $versi = Baca-VersiJdk $f
        if ($versi -gt 0) { $hasil += [pscustomobject]@{ Path = $f; Versi = $versi } }
    }
    return $hasil
}

function Pilih-Jdk {
    # Override manual dari build.env.ps1 menang atas segalanya.
    if ($script:JdkPath) {
        $versi = Baca-VersiJdk $script:JdkPath
        if ($versi -eq 0) { Berhenti "JdkPath di build.env.ps1 bukan folder JDK: $($script:JdkPath)" }
        return [pscustomobject]@{ Path = $script:JdkPath; Versi = $versi }
    }

    $semua = Cari-SemuaJdk
    foreach ($mau in $script:JdkDiterima) {
        $cocok = $semua | Where-Object { $_.Versi -eq $mau } | Select-Object -First 1
        if ($cocok) { return $cocok }
    }

    $daftar = if ($semua) {
        ($semua | ForEach-Object { "  - JDK $($_.Versi) di $($_.Path)" }) -join "`n"
    } else {
        '  (tidak ada JDK yang ditemukan sama sekali)'
    }

    Berhenti @"
Tidak ada JDK 17 (atau 21) di komputer ini.

Yang ketemu:
$daftar

JDK 25 TIDAK bisa dipakai Gradle untuk React Native belum mendukungnya, dan
errornya akan muncul jauh di dalam build sebagai pesan yang tidak menyebut Java
sama sekali.

Pasang JDK 17 tanpa mengganggu Java yang sudah ada:

  winget install --id Microsoft.OpenJDK.17

Lalu buka PowerShell baru dan jalankan script ini lagi ia akan menemukannya
sendiri, JAVA_HOME tidak perlu diset manual.

Kalau JDK-nya ada di tempat tidak lazim, isi JdkPath di build.env.ps1.
"@
}

# ---------------------------------------------------------------- prasyarat --

function Uji-Prasyarat {
    Tulis-Tahap 'Memeriksa prasyarat'

    $jdk = Pilih-Jdk

    # Diset untuk proses ini saja, tidak menyentuh environment variable milik
    # sistem: Gradle membaca JAVA_HOME, dan JDK lain yang terlanjur ada di PATH
    # tidak boleh menang atas pilihan kita.
    $env:JAVA_HOME = $jdk.Path
    $env:PATH = "$($jdk.Path)\bin;$env:PATH"

    Tulis-Ok "JDK $($jdk.Versi): $($jdk.Path)"
    if ($jdk.Versi -ne 17) {
        Tulis-Ingat "Dokumen Expo SDK 57 menyebut JDK 17. JDK $($jdk.Versi) umumnya jalan, tapi kalau Gradle gagal dengan pesan yang membingungkan, pasang JDK 17 dan coba lagi."
    }

    $sdk = $env:ANDROID_HOME
    if (-not $sdk) { $sdk = $env:ANDROID_SDK_ROOT }
    if (-not $sdk) { Berhenti 'ANDROID_HOME (atau ANDROID_SDK_ROOT) belum diset.' }
    if (-not (Test-Path $sdk)) { Berhenti "ANDROID_HOME menunjuk ke folder yang tidak ada: $sdk" }
    Tulis-Ok "Android SDK: $sdk"

    # Sengaja bertele-tele: `node -v` bisa mengembalikan NULL walau `node` ada di
    # PATH mis. shim nvm/volta yang belum menunjuk versi mana pun, atau stub
    # App Execution Alias bawaan Windows. Versi pertama script ini langsung
    # memanggil .TrimStart() pada hasilnya dan meledak dengan pesan yang tidak
    # menyebut Node sama sekali.
    $nodeRaw = $null
    if (Get-Command node -ErrorAction SilentlyContinue) {
        try {
            $nodeRaw = & node -v 2>$null | Select-Object -First 1
        } catch {
            $nodeRaw = $null
        }
    }

    if (-not $nodeRaw) {
        # Here-string SINGLE-quote, bukan double: di dalam @"..."@ backtick adalah
        # karakter escape, sehingga menulis `node (dengan backtick, seperti di
        # markdown) berubah jadi newline + "ode" dan pesannya patah di tengah.
        Berhenti @'
Node ada di PATH tapi tidak menjawab "node -v".

Penyebab tersering di Windows: nvm-windows sudah mencatat sebuah versi sebagai
aktif, tapi symlink-nya tidak pernah benar-benar dibuat pembuatannya butuh hak
Administrator, dan tanpa itu nvm gagal diam-diam.

Perbaikannya, di PowerShell yang dibuka SEBAGAI ADMINISTRATOR:

  nvm use 22.22.3

lalu buka PowerShell biasa lagi dan cek "node -v" sebelum menjalankan script ini.

Untuk memastikan sumber masalahnya:

  nvm list
  Get-Command node -All | Select-Object Source
  where.exe node
'@
    }

    $nodeRaw = $nodeRaw.ToString().Trim().TrimStart('v')
    $node = $null
    try {
        $node = [version]($nodeRaw -replace '-.*$', '')
    } catch {
        Tulis-Ingat "Versi Node tidak terbaca ('$nodeRaw') dilewati, bukan penghenti."
    }

    if ($node -and $node -lt [version]'20.19.4') {
        # Peringatan, bukan penghenti: bundling tetap jalan di versi ini, yang
        # belum tentu jalan adalah tahap native-nya.
        Tulis-Ingat "Node $nodeRaw di bawah 20.19.4 yang diminta React Native 0.86. Kalau Gradle gagal di tahap aneh, ini tersangka pertama."
    } elseif ($node) {
        Tulis-Ok "Node $nodeRaw"
    }
}

# ------------------------------------------------------------ berkas gitignore --

function Siapkan-Berkas($appDir, $butuhGoogleServices) {
    $envPath = Join-Path $appDir '.env'
    if (-not (Test-Path $envPath)) {
        Copy-Item (Join-Path $appDir '.env.example') $envPath
        Tulis-Ingat '.env dibuat dari .env.example'
    }

    if ($butuhGoogleServices) {
        $tujuan = Join-Path $appDir 'google-services.json'
        if (-not (Test-Path $tujuan)) {
            $asal = Join-Path $root 'google-services.json'
            if (-not (Test-Path $asal)) {
                Berhenti 'google-services.json tidak ada di root repo. Tanpa file itu token FCM tidak pernah terbit dan notifikasi darurat diam-diam tidak akan datang.'
            }
            Copy-Item $asal $tujuan
            Tulis-Ingat 'google-services.json disalin dari root'
        }
    }

    <#
        @expo/env memuat .env.local dengan prioritas LEBIH TINGGI dari .env
        (dipakai PLAN.md sebagai pola resmi untuk kerja lokal — lihat §6).
        Kalau file itu ada dan mendefinisikan EXPO_PUBLIC_API_URL, ITULAH
        nilai yang benar-benar ditanam ke build, bukan isi .env. Memeriksa
        .env saja di sini berarti pengecekan bisa bilang "aman" sementara
        APK-nya diam-diam menanam alamat lain (mis. http://localhost yang
        ketinggalan dari sesi dev lokal).
    #>
    $envLocalPath = Join-Path $appDir '.env.local'
    $sumberUrl = $envPath
    if (Test-Path $envLocalPath) {
        $barisLocal = Select-String -Path $envLocalPath -Pattern '^EXPO_PUBLIC_API_URL=(.+)$' | Select-Object -First 1
        if ($barisLocal) { $sumberUrl = $envLocalPath }
    }

    # Nilai ini DITANAM ke bundle saat build, bukan dibaca saat runtime. Salah di
    # sini berarti APK-nya mati total tanpa pesan yang jelas, jadi ditampilkan
    # supaya ketahuan sebelum menunggu Gradle setengah jam.
    $baris = Select-String -Path $sumberUrl -Pattern '^EXPO_PUBLIC_API_URL=(.+)$' | Select-Object -First 1
    if (-not $baris) { Berhenti "EXPO_PUBLIC_API_URL tidak ada di $sumberUrl" }
    $url = $baris.Matches[0].Groups[1].Value.Trim()

    Write-Host "  ->  Backend yang akan ditanam: $url (dari $(Split-Path $sumberUrl -Leaf))"
    if ($sumberUrl -eq $envLocalPath) {
        Tulis-Ingat ".env.local ada dan menang atas .env — kalau ini bukan yang dimaksud untuk APK yang dibagikan, hapus atau kosongkan dulu."
    }
    if ($url -notmatch '^https://') {
        Berhenti @"
Alamat backend bukan https.

Build release memblokir cleartext HTTP, jadi APK-nya akan gagal menghubungi
server di HP mana pun. Ubah EXPO_PUBLIC_API_URL di $sumberUrl jadi alamat https.
"@
    }
}

# ------------------------------------------------------------------- build --

function Build-App($nama, $folder, $butuhGoogleServices) {
    Tulis-Tahap "Build $nama"
    $appDir = Join-Path $root $folder

    Siapkan-Berkas $appDir $butuhGoogleServices

    Push-Location $appDir
    try {
        <#
            $ErrorActionPreference diturunkan ke 'Continue' cuma di sekitar
            pemanggilan proses native (npm/expo/gradle). Dengan 'Stop' (nilai
            script ini di level atas), PowerShell 5.1 mempromosikan SETIAP
            baris stderr proses native jadi terminating error begitu output
            tidak mengarah ke konsol interaktif (persis situasi saat script
            dijalankan lewat automation/background) — termasuk baris yang
            cuma catatan/warning tidak berbahaya (mis. "Note: ... deprecated
            API" dari javac). Trap di atas lalu keburu menangkapnya duluan
            sebelum baris pengecekan $LASTEXITCODE di bawah ini sempat
            jalan, jadi build yang sebenarnya sukses (atau gagal karena
            alasan lain) malah dilaporkan gagal dengan pesan yang tidak
            menjelaskan apa-apa.
        #>
        $ErrorActionPreference = 'Continue'

        # npm install harus duluan: tanpa node_modules, `npx expo` belum bisa
        # memakai CLI lokal dan akan mengunduh versi lain.
        <#
            Setiap panggilan native di bawah dipipa lewat 2>&1 ke Out-Host
            secara eksplisit. Bukan kosmetik: kalau script ini sendiri
            dipanggil lewat redirection di level pemanggil (`*>&1 |
            Tee-Object`, `Start-Transcript`, dsb. — persis situasi paling
            masuk akal untuk menyimpan log build), output konsol native yang
            biasanya lewat begitu saja ke terminal malah ikut tertangkap
            sebagai object pipeline (baik stream sukses maupun stream error
            yang sudah diturunkan jadi non-terminating oleh 'Continue' di
            atas), dan karena function ini tidak eksplisit menampungnya,
            SEMUA baris itu ikut jadi bagian dari `return $tujuan` di bawah —
            $hasil di `main` berubah dari dua path APK jadi ribuan baris log
            (teramati sendiri: 2565 baris "adb install" bukan 2). Out-Host
            menghabiskan pipeline-nya di tempat, jadi tidak ada yang bisa
            bocor ke nilai balik function ini apa pun cara pemanggilnya.
            `2>&1` di sini aman walau ada catatan di atas soal PS 5.1: yang
            dipengaruhi cuma nilai $? (tidak dipakai di sini), $LASTEXITCODE
            tetap apa adanya dari proses native-nya.
        #>
        Write-Host '  ->  npm install'
        & npm install --silent 2>&1 | Out-Host
        if ($LASTEXITCODE -ne 0) { $ErrorActionPreference = 'Stop'; Berhenti "npm install gagal di $folder" }

        if ($LewatiPrebuild -and (Test-Path (Join-Path $appDir 'android'))) {
            Tulis-Ingat 'Prebuild dilewati, memakai folder android\ yang sudah ada'
        } else {
            Write-Host '  ->  expo prebuild (android, clean)'
            # --no-install karena npm install sudah dijalankan di atas.
            & npx expo prebuild --platform android --clean --no-install 2>&1 | Out-Host
            if ($LASTEXITCODE -ne 0) { $ErrorActionPreference = 'Stop'; Berhenti "expo prebuild gagal di $folder" }
        }

        Write-Host '  ->  gradlew assembleRelease (bisa 20-40 menit pada build pertama)'
        Push-Location (Join-Path $appDir 'android')
        try {
            <#
                gradlew memanggil task bundling JS lewat @expo/env, yang
                mengharuskan NODE_ENV terisi untuk tahu urutan prioritas
                .env.production / .env.local / .env. `npx expo` biasa
                menyetel ini sendiri, tapi gradlew.bat dipanggil langsung di
                sini sehingga tidak pernah diset tanpa baris ini.
            #>
            $env:NODE_ENV = 'production'
            # Tidak ada konfigurasi signing di sini, dan itu disengaja: template
            # Expo SDK 57 sudah menulis `signingConfig signingConfigs.debug` pada
            # buildType release, dan `expo prebuild` ikut menaruh debug.keystore
            # di android\app\. Hasilnya APK yang sah dipasang tanpa satu pun
            # kredensial yang perlu diurus cukup untuk app yang tidak diunggah
            # ke Play Store.
            & .\gradlew.bat assembleRelease --console=plain 2>&1 | Out-Host
            $ErrorActionPreference = 'Stop'
            if ($LASTEXITCODE -ne 0) {
                Berhenti @"
Gradle gagal di $folder.

Tersangka pertama: expo-speech-recognition@56.0.1 dipakai di atas Expo SDK 57
(belum ada rilis 57.x). Kalau pesan errornya menyebut modul itu, ini bukan
salah konfigurasi kamu.
"@
            }
        } finally {
            Pop-Location
        }

        $apk = Join-Path $appDir 'android\app\build\outputs\apk\release\app-release.apk'
        if (-not (Test-Path $apk)) { Berhenti "APK tidak ditemukan di $apk" }

        $distDir = Join-Path $root 'dist'
        if (-not (Test-Path $distDir)) { New-Item -ItemType Directory -Force -Path $distDir | Out-Null }

        $versi = (Get-Content (Join-Path $appDir 'app.json') -Raw | ConvertFrom-Json).expo.version
        $stempel = Get-Date -Format 'yyyyMMdd-HHmm'
        $tujuan = Join-Path $distDir "$nama-v$versi-$stempel.apk"
        Copy-Item $apk $tujuan -Force

        $mb = [math]::Round((Get-Item $tujuan).Length / 1MB, 1)
        Tulis-Ok "$tujuan ($mb MB)"
        return $tujuan
    } finally {
        Pop-Location
    }
}

# -------------------------------------------------------------------- main --

Uji-Prasyarat

$hasil = @()
if ($App -eq 'semua' -or $App -eq 'family') {
    $hasil += Build-App 'family-app' 'family-app' $true
}
if ($App -eq 'semua' -or $App -eq 'elder') {
    # elder-app tidak memakai push notification, jadi tidak butuh Firebase.
    $hasil += Build-App 'elder-app' 'elder-app' $false
}

Tulis-Tahap 'Selesai'
foreach ($h in $hasil) { Write-Host "  $h" }

Write-Host "`nPasang ke HP yang tersambung:" -ForegroundColor Cyan
foreach ($h in $hasil) { Write-Host "  adb install -r `"$h`"" }

Write-Host @"

APK ini ditandatangani dengan debug key bawaan Expo cukup untuk dipasang dan
dibagikan, tapi TIDAK bisa diunggah ke Play Store. Saat memasang lewat berkas
(bukan adb), Play Protect mungkin menahannya sekali dan perlu diizinkan manual.

Yang masih harus diuji di HP sungguhan (tidak ada yang bisa membuktikannya dari
laptop): TTS, STT, wake word, deteksi jatuh, notifikasi darurat, dan audio
panggilan. Ambang deteksi jatuh kemungkinan perlu ditera ulang.
"@ -ForegroundColor DarkGray
