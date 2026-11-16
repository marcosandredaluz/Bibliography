; ==============================================================================
; Script Inno Setup: Instalador Silencioso da Integração Microsoft Word 365
; Copia o template .dotm para %APPDATA%\Microsoft\Word\STARTUP e registra o Engine no Boot.
; ==============================================================================

#define MyAppName "Bibliografia Word Integration"
#define MyAppVersion "2.0.0"
#define MyAppPublisher "Bibliografia Científica"
#define MyAppExeName "BibliografiaWordEngine.exe"

[Setup]
AppId={{D37F8E41-84B2-4A6F-9C1D-89F12A6C449E}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={userpf}\BibliografiaWordEngine
DisableDirPage=yes
DisableProgramGroupPage=yes
PrivilegesRequired=lowest
OutputDir=dist_installer
OutputBaseFilename=Instalador_Word_Bibliografia_v2.0
Compression=lzma2/ultra64
SolidCompression=yes
CloseApplications=yes
CloseApplicationsFilter=WINWORD.EXE

[Languages]
Name: "brazilianportuguese"; MessagesFile: "compiler:Languages\BrazilianPortuguese.isl"

[Files]
; 1. Executável do Motor Local (compilado via PyInstaller)
Source: "dist\BibliografiaWordEngine.exe"; DestDir: "{app}"; Flags: ignoreversion

; 2. Template Word .dotm copiado diretamente para a pasta STARTUP do Word
Source: "Bibliografia.dotm"; DestDir: "{userappdata}\Microsoft\Word\STARTUP"; Flags: ignoreversion uninsneveruninstall

[Icons]
Name: "{userstartup}\BibliografiaWordEngine"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"

[Registry]
; Inicia o motor automaticamente ao logar no Windows sem abrir janelas
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "BibliografiaWordEngine"; ValueData: """{app}\{#MyAppExeName}"""; Flags: uninsdeletevalue

[Run]
; Inicia o serviço local imediatamente ao concluir a instalação
Filename: "{app}\{#MyAppExeName}"; Flags: nowait postinstall skipifsilent

[Code]
// Garante encerramento gracioso do Microsoft Word caso esteja rodando
function InitializeSetup(): Boolean;
begin
  Result := True;
end;
