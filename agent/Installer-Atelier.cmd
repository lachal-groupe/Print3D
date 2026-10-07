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
echo   Ne fermez pas cette fenetre.
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
$Site = 'https://lachal-groupe.github.io'
$PythonUrl = 'https://www.python.org/ftp/python/3.12.8/python-3.12.8-embed-amd64.zip'
$OrcaUrl = 'https://github.com/OrcaSlicer/OrcaSlicer/releases/download/v2.4.2/OrcaSlicer_Windows_V2.4.2_x64_portable.zip'
$Dir = if ($env:ATELIER_APP_DIR) { $env:ATELIER_APP_DIR } else { Join-Path $env:LOCALAPPDATA 'AtelierMonture' }
$Local = Split-Path -Parent $f   # dossier du fichier .cmd (installation hors ligne si les fichiers y sont)
$Profiles = @('machines.json', 'p1s.machine.json', 'p1s.process.json', 'p1s.process.fine.json', 'p1s.process.rapide.json',
  'p1s.filament.json', 'k1max.machine.json', 'k1max.process.json', 'k1max.process.fine.json', 'k1max.process.rapide.json',
  'k1max.filament.json')

function Step($t) { Write-Host "  - $t" }
function Fetch($url, $dest) { Invoke-WebRequest -Uri $url -OutFile $dest -UseBasicParsing }

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
    Fetch $PythonUrl "$Dir\python.zip"
    Expand-Archive "$Dir\python.zip" "$Dir\python" -Force
    Remove-Item "$Dir\python.zip"
  }

  if (-not (Get-ChildItem "$Dir\orca" -Recurse -Filter 'orca-slicer.exe' -ErrorAction SilentlyContinue)) {
    Step 'Moteur d''impression OrcaSlicer (170 Mo, patience...)'
    Fetch $OrcaUrl "$Dir\orca.zip"
    Expand-Archive "$Dir\orca.zip" "$Dir\orca" -Force
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
