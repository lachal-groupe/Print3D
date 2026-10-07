@echo off
cd /d "%~dp0"
start "" http://localhost:8790/
python serve.py 8790
