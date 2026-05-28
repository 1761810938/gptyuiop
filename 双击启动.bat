@echo off
setlocal
cd /d "%~dp0"

set "PORT=8787"
set "HOST=127.0.0.1"
set "URL=http://%HOST%:%PORT%"
set "PORTABLE_NODE=%~dp0runtime\node\node.exe"
set "NODE_CMD="

if exist "%PORTABLE_NODE%" (
  set "NODE_CMD=%PORTABLE_NODE%"
) else (
  where node >nul 2>nul
  if not errorlevel 1 set "NODE_CMD=node"
)

if not defined NODE_CMD (
  echo.
  echo 未找到 Node.js 运行时。
  echo.
  echo 推荐做法：
  echo 1. 下载 Windows 版 Node.js 压缩包
  echo 2. 解压后把整个 Node 文件夹放到 runtime\node
  echo 3. 确保存在 runtime\node\node.exe
  echo.
  echo 也可以在系统里安装 Node.js 后再双击本文件。
  echo.
  pause
  exit /b 1
)

curl -s "%URL%" >nul 2>nul
if not errorlevel 1 (
  echo 检测到聊天网页已经在运行，正在打开浏览器...
  start "" "%URL%"
  exit /b 0
)

netstat -ano | findstr /R /C:":%PORT% .*LISTENING" >nul 2>nul
if not errorlevel 1 (
  echo.
  echo 端口 %PORT% 已被其他程序占用，未启动新的服务。
  echo 请关闭占用 %PORT% 的程序，或者修改 server.js 里的端口后再试。
  echo.
  pause
  exit /b 1
)

echo 正在启动本地聊天网页...
start "" "%URL%"
set "PORT=%PORT%"
"%NODE_CMD%" server.js
