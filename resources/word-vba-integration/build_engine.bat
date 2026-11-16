@echo off
chcp 65001 > nul
echo ==============================================================================
echo Compilador Standalone do Bibliografia Word Integration Engine (PyInstaller)
echo ==============================================================================
echo.

if not exist "venv_build" (
    echo [1/3] Criando ambiente virtual limpo...
    python -m venv venv_build
)

echo [2/3] Instalando dependencias necessarias (FastAPI, Uvicorn, PyInstaller)...
call .\venv_build\Scripts\activate.bat
pip install --quiet fastapi "uvicorn[standard]" pydantic pyinstaller

echo [3/3] Compilando executavel unico sem console (--onefile --noconsole)...
pyinstaller --onefile ^
            --noconsole ^
            --name "BibliografiaWordEngine" ^
            --clean ^
            --hidden-import "uvicorn.logging" ^
            --hidden-import "uvicorn.loops" ^
            --hidden-import "uvicorn.loops.auto" ^
            --hidden-import "uvicorn.protocols" ^
            --hidden-import "uvicorn.protocols.http" ^
            --hidden-import "uvicorn.protocols.http.auto" ^
            --hidden-import "uvicorn.protocols.websockets" ^
            --hidden-import "uvicorn.protocols.websockets.auto" ^
            --hidden-import "uvicorn.lifespan" ^
            --hidden-import "uvicorn.lifespan.on" ^
            engine_server.py

echo.
echo ==============================================================================
echo Concluido com sucesso!
echo Executavel gerado em: dist\BibliografiaWordEngine.exe
echo ==============================================================================
pause
