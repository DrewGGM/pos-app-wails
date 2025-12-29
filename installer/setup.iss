; Inno Setup Script para Restaurant POS System
; https://jrsoftware.org/isinfo.php

#define MyAppName "Restaurant POS System"
; MyAppVersion can be passed from command line using /DMyAppVersion=x.x.x
; If not provided, use default version
#ifndef MyAppVersion
  #define MyAppVersion "3.2.0"
#endif
#define MyAppPublisher "Andrew Garcia Mosquera"
#define MyAppURL "https://github.com/DrewGGM/pos-app-wails"
#define MyAppExeName "RestaurantPOS.exe"

[Setup]
; Información básica
AppId={{B8F5E2A1-9C3D-4E1F-8F7A-2D3E4F5A6B7C}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
AppPublisherURL={#MyAppURL}
AppSupportURL={#MyAppURL}
AppUpdatesURL={#MyAppURL}
DefaultDirName={autopf}\{#MyAppName}
DefaultGroupName={#MyAppName}
AllowNoIcons=yes
LicenseFile=..\LICENSE
OutputDir=..\build\installer
OutputBaseFilename=RestaurantPOS-Setup-{#MyAppVersion}
Compression=lzma
SolidCompression=yes
WizardStyle=modern

; Permisos de administrador REQUERIDOS
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

; Configuración de Windows
MinVersion=10.0
ArchitecturesAllowed=x64
ArchitecturesInstallIn64BitMode=x64

; Desinstalador
UninstallDisplayIcon={app}\{#MyAppExeName}
UninstallDisplayName={#MyAppName}

; Iconos
SetupIconFile=..\build\windows\icon.ico

[Languages]
Name: "spanish"; MessagesFile: "compiler:Languages\Spanish.isl"
Name: "english"; MessagesFile: "compiler:Default.isl"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked
Name: "quicklaunchicon"; Description: "{cm:CreateQuickLaunchIcon}"; GroupDescription: "{cm:AdditionalIcons}"; Flags: unchecked; OnlyBelowVersion: 6.1; Check: not IsAdminInstallMode

[Files]
; Ejecutable principal
Source: "..\build\bin\{#MyAppExeName}"; DestDir: "{app}"; Flags: ignoreversion

; Archivos de documentación
Source: "..\README.md"; DestDir: "{app}"; Flags: ignoreversion isreadme

[Icons]
; Acceso directo en menú inicio
Name: "{group}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"
Name: "{group}\{cm:UninstallProgram,{#MyAppName}}"; Filename: "{uninstallexe}"

; Acceso directo en escritorio (opcional)
Name: "{autodesktop}\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: desktopicon

; Acceso directo en barra de inicio rápido (opcional)
Name: "{userappdata}\Microsoft\Internet Explorer\Quick Launch\{#MyAppName}"; Filename: "{app}\{#MyAppExeName}"; Tasks: quicklaunchicon

[Registry]
; Agregar a PATH (opcional)
; Root: HKLM; Subkey: "SYSTEM\CurrentControlSet\Control\Session Manager\Environment"; ValueType: expandsz; ValueName: "Path"; ValueData: "{olddata};{app}"; Check: NeedsAddPath('{app}')

[Run]
; Ejecutar la app después de instalar (opcional)
; IMPORTANTE: shellexec ejecuta sin permisos elevados para que %APPDATA% apunte al usuario correcto
Filename: "{app}\{#MyAppExeName}"; Description: "{cm:LaunchProgram,{#StringChange(MyAppName, '&', '&&')}}"; Flags: nowait postinstall skipifsilent shellexec

[UninstallDelete]
; NOTA: Los archivos de datos están en %APPDATA%\PosApp\ (específico por usuario)
; No se eliminan automáticamente al desinstalar para preservar la configuración
; El usuario puede eliminarlos manualmente desde: C:\Users\<usuario>\AppData\Roaming\PosApp\

[Code]
// Verificar si WebView2 Runtime está instalado
function IsWebView2Installed: Boolean;
var
  ResultCode: Integer;
begin
  Result := RegKeyExists(HKEY_LOCAL_MACHINE, 'SOFTWARE\WOW6432Node\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}') or
            RegKeyExists(HKEY_CURRENT_USER, 'SOFTWARE\Microsoft\EdgeUpdate\Clients\{F3017226-FE2A-4295-8BDF-00C3A9A7E4C5}');
end;

// Página de advertencia si WebView2 no está instalado
function InitializeSetup: Boolean;
begin
  Result := True;

  if not IsWebView2Installed then
  begin
    if MsgBox('WebView2 Runtime no está instalado. Esta aplicación lo requiere para funcionar.' + #13#10 + #13#10 +
              '¿Desea continuar con la instalación? Deberá instalar WebView2 manualmente después.',
              mbConfirmation, MB_YESNO) = IDNO then
    begin
      Result := False;
    end;
  end;
end;

// Verificar si necesita agregar al PATH
function NeedsAddPath(Param: string): boolean;
var
  OrigPath: string;
begin
  if not RegQueryStringValue(HKEY_LOCAL_MACHINE,
    'SYSTEM\CurrentControlSet\Control\Session Manager\Environment',
    'Path', OrigPath)
  then begin
    Result := True;
    exit;
  end;
  Result := Pos(';' + Param + ';', ';' + OrigPath + ';') = 0;
end;

// Mensaje después de la instalación
procedure CurStepChanged(CurStep: TSetupStep);
begin
  if CurStep = ssPostInstall then
  begin
    MsgBox('Instalación completada exitosamente!' + #13#10 + #13#10 +
           'Al ejecutar la aplicación por primera vez, se mostrará un asistente de configuración.' + #13#10 + #13#10 +
           'Credenciales por defecto:' + #13#10 +
           '  Usuario: admin' + #13#10 +
           '  Contraseña: admin' + #13#10 +
           '  PIN: 12345' + #13#10 + #13#10 +
           '⚠️ IMPORTANTE: Cambie estas credenciales después del primer login.',
           mbInformation, MB_OK);
  end;
end;
