@echo off
echo ========================================================
echo     選擇權回測系統 PRO - 手機遠端連線啟動器
echo ========================================================
echo.
echo [1] 正在啟動後端伺服器 (讀取 CSV 中...)
start /B node server.js
echo.
echo [2] 正在為您產生「手機專用」的公開網址...
echo (如果看到 your url is: https://xxx，請在手機瀏覽器直接輸入該網址！)
echo.
call npx --yes localtunnel --port 3000
pause
