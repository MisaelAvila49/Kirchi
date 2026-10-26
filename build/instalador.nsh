; Página final del instalador: abrir Kirchi y, opcional (sin marcar), un acceso directo en el escritorio.
; Reemplaza la página por omisión de electron-builder, así que repite su función StartApp.
!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Function CrearAccesoEscritorio
    CreateShortCut "$DESKTOP\Kirchi.lnk" "$INSTDIR\Kirchi.exe"
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_FINISHPAGE_SHOWREADME_NOTCHECKED
  !define MUI_FINISHPAGE_SHOWREADME_TEXT "Crear un acceso directo en el escritorio"
  !define MUI_FINISHPAGE_SHOWREADME_FUNCTION CrearAccesoEscritorio
  !insertmacro MUI_PAGE_FINISH
!macroend

; El desinstalador quita el acceso del escritorio solo si apunta a esta instalacion: WinShell::UninstShortcut (el que usa
; electron-builder con sus propios accesos) comprueba el destino del .lnk en vez de borrar cualquier Kirchi.lnk.
!macro customUnInstall
  WinShell::UninstShortcut "$DESKTOP\Kirchi.lnk"
!macroend
