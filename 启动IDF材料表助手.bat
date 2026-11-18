@echo off
setlocal
set "APP_FILE=%~dp0dist\index.html"

if not exist "%APP_FILE%" (
  echo Cannot find: "%APP_FILE%"
  echo Please keep this launcher in the project root folder.
  pause
  exit /b 1
)

start "" "%APP_FILE%"
endlocal
