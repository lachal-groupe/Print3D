@echo off
rem ============================================================================
rem  Installation de l'agent d'impression de l'Atelier monture 3D
rem  - Python officiel (version embarquee, python.org) pour faire tourner l'agent
rem  - OrcaSlicer (version portable, jamais affichee) pour creer les fichiers d'impression
rem  - l'agent et ses profils, puis demarrage automatique avec Windows
rem  Tout est installe pour l'utilisateur courant dans %LOCALAPPDATA%\AtelierMonture :
rem  pas de droits administrateur, rien dans Program Files.
rem ============================================================================
title Atelier monture 3D - installation de l'agent d'impression
chcp 65001 >nul
echo.
echo   Atelier monture 3D - agent d'impression
echo   ---------------------------------------
echo   Installation en cours, cela prend 1 a 3 minutes selon la connexion.
echo   Ne fermez pas cette fenetre : les barres de progression montrent l'avancement.
echo.
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; $s=[IO.File]::ReadAllText($f); $i=$s.IndexOf('#'+'#POWERSHELL#'+'#'); iex $s.Substring($i)"
echo.
pause
exit /b

##POWERSHELL##
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

# Adresse du site de l'atelier (fichiers de l'agent). Remplie lors de la mise en ligne.
$Site = 'https://lachal-groupe.github.io/Print3D'
$PythonUrl = 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-embed-amd64.zip'
$OrcaUrl = 'https://github.com/OrcaSlicer/OrcaSlicer/releases/download/v2.4.2/OrcaSlicer_Windows_V2.4.2_x64_portable.zip'
$Dir = if ($env:ATELIER_APP_DIR) { $env:ATELIER_APP_DIR } else { Join-Path $env:LOCALAPPDATA 'AtelierMonture' }
$Local = Split-Path -Parent $f   # dossier du fichier .cmd (installation hors ligne si les fichiers y sont)
$Profiles = @('machines.json', 'p1s.machine.json', 'p1s.process.json', 'p1s.process.fine.json', 'p1s.process.rapide.json',
  'p1s.filament.json', 'k1max.machine.json', 'k1max.process.json', 'k1max.process.fine.json', 'k1max.process.rapide.json',
  'k1max.filament.json')

function Step($t) { Write-Host "  - $t" }
function Fetch($url, $dest) { Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing }

# barre de progression sur une ligne : [#########...........]  42 %  71 / 170 Mo
function Bar($done, $total, $info) {
  $p = [int][math]::Floor(100 * $done / [math]::Max($total, 1))
  if ($p -eq $script:LastP) { return }
  $script:LastP = $p
  $n = [int][math]::Floor($p / 4)
  Write-Host -NoNewline ("`r    [" + ('#' * $n) + ('.' * (25 - $n)) + '] ' + "$p %".PadLeft(5) + "  $info      ")
}

# téléchargement en flux, avec avancement en Mo
function Download($url, $dest) {
  $script:LastP = -1
  $resp = [Net.WebRequest]::Create($url).GetResponse()
  $total = $resp.ContentLength
  $in = $resp.GetResponseStream(); $out = [IO.File]::Create($dest)
  $buf = New-Object byte[] 1048576; $done = 0
  try {
    while (($r = $in.Read($buf, 0, $buf.Length)) -gt 0) {
      $out.Write($buf, 0, $r); $done += $r
      Bar $done $total ('{0} / {1} Mo' -f [int]($done / 1MB), [int]($total / 1MB))
    }
  } finally { $out.Close(); $in.Close(); $resp.Close() }
  Write-Host ''
}

# décompression fichier par fichier (bien plus rapide qu'Expand-Archive), avec avancement
function Unzip($zip, $dest) {
  Add-Type -AssemblyName System.IO.Compression.FileSystem
  $script:LastP = -1
  $a = [IO.Compression.ZipFile]::OpenRead($zip)
  try {
    $files = @($a.Entries | Where-Object { $_.Name })
    $i = 0
    foreach ($e in $files) {
      $target = Join-Path $dest $e.FullName
      [IO.Directory]::CreateDirectory((Split-Path -Parent $target)) | Out-Null
      [IO.Compression.ZipFileExtensions]::ExtractToFile($e, $target, $true)
      $i++
      Bar $i $files.Count "decompression"
    }
  } finally { $a.Dispose() }
  Write-Host ''
}

try {
  New-Item -ItemType Directory -Force $Dir, "$Dir\profiles" | Out-Null

  # arrêt d'un agent déjà en marche (mise à jour)
  try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:47913/quit' -TimeoutSec 2 | Out-Null; Start-Sleep 1 } catch {}

  Step 'Agent et profils d''impression'
  if (Test-Path (Join-Path $Local 'agent.py')) {
    Copy-Item (Join-Path $Local 'agent.py') "$Dir\agent.py" -Force
    foreach ($p in $Profiles) { Copy-Item (Join-Path $Local "profiles\$p") "$Dir\profiles\$p" -Force }
  } else {
    Fetch "$Site/agent/agent.py" "$Dir\agent.py"
    foreach ($p in $Profiles) { Fetch "$Site/agent/profiles/$p" "$Dir\profiles\$p" }
  }

  if (-not (Test-Path "$Dir\python\pythonw.exe")) {
    Step 'Python (version officielle embarquee)'
    Download $PythonUrl "$Dir\python.zip"
    Unzip "$Dir\python.zip" "$Dir\python"
    Remove-Item "$Dir\python.zip"
  }

  if (-not (Get-ChildItem "$Dir\orca" -Recurse -Filter 'orca-slicer.exe' -ErrorAction SilentlyContinue)) {
    Step 'Moteur d''impression OrcaSlicer (170 Mo, c''est l''etape la plus longue)'
    Download $OrcaUrl "$Dir\orca.zip"
    Unzip "$Dir\orca.zip" "$Dir\orca"
    Remove-Item "$Dir\orca.zip"
  }

  Step 'Demarrage automatique avec Windows'
  $cmd = "`"$Dir\python\pythonw.exe`" `"$Dir\agent.py`" --agent"
  if (-not $env:ATELIER_APP_DIR) {
    New-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'AtelierMonture' -Value $cmd -PropertyType String -Force | Out-Null
  }

  Step 'Lancement de l''agent'
  $env:ATELIER_APP_DIR = $Dir
  Start-Process -FilePath "$Dir\python\pythonw.exe" -ArgumentList "`"$Dir\agent.py`"", '--agent' -WindowStyle Hidden
  Start-Sleep 3
  $st = Invoke-RestMethod 'http://127.0.0.1:47913/status' -TimeoutSec 5
  if (-not $st.orca) { throw 'OrcaSlicer introuvable apres installation.' }
  Write-Host ''
  Write-Host '  C''est pret ! Vous pouvez fermer cette fenetre et utiliser l''atelier.' -ForegroundColor Green
} catch {
  Write-Host ''
  Write-Host "  L'installation a echoue : $($_.Exception.Message)" -ForegroundColor Red
  Write-Host '  Verifiez la connexion internet puis relancez ce fichier.'
}
