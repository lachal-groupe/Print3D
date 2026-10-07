@echo off
rem Desinstallation de l'agent d'impression de l'Atelier monture 3D (meme principe que l'installation).
title Atelier monture 3D - desinstallation de l'agent d'impression
chcp 65001 >nul
powershell -NoProfile -ExecutionPolicy Bypass -Command "$f='%~f0'; $s=[IO.File]::ReadAllText($f); $i=$s.IndexOf('#'+'#POWERSHELL#'+'#'); iex $s.Substring($i)"
echo.
pause
exit /b

##POWERSHELL##
$Dir = Join-Path $env:LOCALAPPDATA 'AtelierMonture'
try { Invoke-RestMethod -Method Post -Uri 'http://127.0.0.1:47913/quit' -TimeoutSec 2 | Out-Null; Start-Sleep 2 } catch {}
Remove-ItemProperty -Path 'HKCU:\Software\Microsoft\Windows\CurrentVersion\Run' -Name 'AtelierMonture' -ErrorAction SilentlyContinue
if (Test-Path $Dir) { Remove-Item $Dir -Recurse -Force -ErrorAction SilentlyContinue }
if (Test-Path $Dir) {
  Write-Host '  Certains fichiers sont encore utilises : redemarrez le PC puis relancez ce fichier.' -ForegroundColor Yellow
} else {
  Write-Host '  L''agent d''impression est desinstalle.' -ForegroundColor Green
}
