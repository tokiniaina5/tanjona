@echo off
rem Mitahiry sy mandefa ny fanovana any amin ny GitHub.
cd /d "%~dp0.."
git add .
git commit -m "Vite + build minify"
git push
echo.
pause
