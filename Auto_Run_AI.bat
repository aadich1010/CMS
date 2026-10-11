@echo off
title Common Free AI Tool Launcher
echo =======================================================
echo [AI AUTO-LAUNCHER] Project folder detect ho raha hai...
echo =======================================================

:: Yeh line usi folder ke path me switch karegi jahan file rakhi hui hai
cd /d "%~dp0"

echo Current Folder: %CD%
echo.
echo [AI AUTO-LAUNCHER] Local Free Model (Qwen 7B) connect ho raha hai...
echo.

:: Yeh environment variable safety check ko bypass karke automatically trust kar lega
set CLAUDE_CODE_TRUST_FOLDER=1

:: Free model launch karne ki command
ollama launch claude --model qwen2.5-coder:7b

pause
