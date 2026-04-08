!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!define INSTALLER_BOOTSTRAP_FILE "installer-bootstrap.properties"
!define INSTALLER_BOOTSTRAP_PREVIOUS_FILE "installer-bootstrap.previous.properties"
!define INSTALLER_MAINTENANCE_PENDING_FILE "installer-maintenance.pending"
!define COLOR_BG "F2EFE6"
!define COLOR_PANEL "FAF9F5"
!define COLOR_PANEL_ALT "EBE7DC"
!define COLOR_TEXT "141413"
!define COLOR_MUTED "5F5A52"
!define COLOR_ACCENT "D97757"
!define COLOR_ACCENT2 "6A9BCC"
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"

!ifndef BUILD_UNINSTALLER

Var ShouldCreateDesktopShortcut
Var SelectedDiffViewerMode
Var SelectedCacheParent
Var ExistingDiffViewerMode
Var ExistingCacheRoot
Var ExistingInstallDir
Var InstallOptionsDiffKeepRadio
Var InstallOptionsDiffExcelRadio
Var InstallOptionsDiffAllRadio
Var InstallOptionsCacheParentText
Var InstallOptionsDesktopShortcutCheckbox

LangString INSTALL_WELCOME_TITLE 1033 "Workbook-aware SVN diff viewer"
LangString INSTALL_WELCOME_TITLE 2052 "面向工作簿差异的 SVN 对比工具"
LangString INSTALL_WELCOME_DESC 1033 "SvnDiffTool is optimized for text, Excel, and workbook compare workflows."
LangString INSTALL_WELCOME_DESC 2052 "SvnDiffTool 专注于文本、Excel 与工作簿差异查看。"
LangString INSTALL_WELCOME_POINT1 1033 "• Review text and workbook diffs with one app"
LangString INSTALL_WELCOME_POINT1 2052 "• 一个应用同时处理文本与工作簿差异"
LangString INSTALL_WELCOME_POINT2 1033 "• Optionally connect TortoiseSVN Diff Viewer during install"
LangString INSTALL_WELCOME_POINT2 2052 "• 安装时可选择是否接管 TortoiseSVN Diff Viewer"
LangString INSTALL_WELCOME_POINT3 1033 "• Customize cache location and desktop shortcut creation"
LangString INSTALL_WELCOME_POINT3 2052 "• 可自定义缓存目录与桌面快捷方式"
LangString INSTALL_WELCOME_HINT 1033 "Click Next to continue."
LangString INSTALL_WELCOME_HINT 2052 "单击“下一步”继续。"

LangString INSTALL_OPTIONS_TITLE 1033 "Choose how SvnDiffTool should integrate after installation."
LangString INSTALL_OPTIONS_TITLE 2052 "选择安装完成后的 SvnDiffTool 默认集成方式。"
LangString INSTALL_OPTIONS_DIFF_KEEP 1033 "Keep the current TortoiseSVN Diff Viewer configuration"
LangString INSTALL_OPTIONS_DIFF_KEEP 2052 "保持当前 TortoiseSVN Diff Viewer 配置"
LangString INSTALL_OPTIONS_DIFF_EXCEL 1033 "Use SvnDiffTool only for Excel and workbook diffs"
LangString INSTALL_OPTIONS_DIFF_EXCEL 2052 "仅让 Excel / 工作簿差异使用 SvnDiffTool"
LangString INSTALL_OPTIONS_DIFF_ALL 1033 "Use SvnDiffTool for all file diffs"
LangString INSTALL_OPTIONS_DIFF_ALL 2052 "让全部文件差异使用 SvnDiffTool"
LangString INSTALL_OPTIONS_CACHE_PARENT 1033 "Parent folder for managed session/cache data"
LangString INSTALL_OPTIONS_CACHE_PARENT 2052 "受控会话 / 缓存目录的父级文件夹"
LangString INSTALL_OPTIONS_CACHE_BROWSE 1033 "Browse..."
LangString INSTALL_OPTIONS_CACHE_BROWSE 2052 "浏览..."
LangString INSTALL_OPTIONS_CACHE_BROWSE_TITLE 1033 "Select the parent folder for SvnDiffTool managed cache data"
LangString INSTALL_OPTIONS_CACHE_BROWSE_TITLE 2052 "选择 SvnDiffTool 受控缓存目录的父级文件夹"
LangString INSTALL_OPTIONS_CACHE_REQUIRED 1033 "Please choose a parent folder for SvnDiffTool managed cache data."
LangString INSTALL_OPTIONS_CACHE_REQUIRED 2052 "请选择 SvnDiffTool 受控缓存目录的父级文件夹。"
LangString INSTALL_OPTIONS_DESKTOP_SHORTCUT 1033 "Create a desktop shortcut"
LangString INSTALL_OPTIONS_DESKTOP_SHORTCUT 2052 "创建桌面快捷方式"

Function LoadExistingInstallerBootstrap
  StrCpy $ExistingDiffViewerMode "keep"
  StrCpy $ExistingCacheRoot ""
  StrCpy $0 "$PLUGINSDIR\${INSTALLER_BOOTSTRAP_PREVIOUS_FILE}"

  IfFileExists "$0" +2 0
    StrCpy $0 "$INSTDIR\${INSTALLER_BOOTSTRAP_FILE}"

  IfFileExists "$0" 0 done

  FileOpen $1 "$0" r
  loop:
    ClearErrors
    FileRead $1 $2
    IfErrors close
    StrCpy $2 $2 -2

    StrCpy $3 $2 15
    ${If} $3 == "diffViewerMode="
      StrCpy $ExistingDiffViewerMode $2 "" 15
    ${Else}
      StrCpy $3 $2 10
      ${If} $3 == "cacheRoot="
        StrCpy $ExistingCacheRoot $2 "" 10
      ${EndIf}
    ${EndIf}
    Goto loop

  close:
    FileClose $1
  done:
FunctionEnd

Function ResolveExistingInstallDir
  StrCpy $ExistingInstallDir ""

  ReadRegStr $ExistingInstallDir SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $ExistingInstallDir == ""
    ReadRegStr $ExistingInstallDir HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
  ${If} $ExistingInstallDir == ""
    ReadRegStr $ExistingInstallDir HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
FunctionEnd

Function CapturePreviousInstallerBootstrap
  Call ResolveExistingInstallDir

  ${If} $ExistingInstallDir != ""
    IfFileExists "$ExistingInstallDir\${INSTALLER_BOOTSTRAP_FILE}" 0 +3
      CopyFiles /SILENT "$ExistingInstallDir\${INSTALLER_BOOTSTRAP_FILE}" "$PLUGINSDIR\${INSTALLER_BOOTSTRAP_PREVIOUS_FILE}"
      Return
  ${EndIf}

  IfFileExists "$INSTDIR\${INSTALLER_BOOTSTRAP_FILE}" 0 done
    CopyFiles /SILENT "$INSTDIR\${INSTALLER_BOOTSTRAP_FILE}" "$PLUGINSDIR\${INSTALLER_BOOTSTRAP_PREVIOUS_FILE}"
  done:
FunctionEnd

Function EnsureSelectedInstallDefaults
  Call LoadExistingInstallerBootstrap

  ${If} $ExistingDiffViewerMode == ""
    StrCpy $SelectedDiffViewerMode "keep"
  ${Else}
    StrCpy $SelectedDiffViewerMode $ExistingDiffViewerMode
  ${EndIf}

  ${If} $ExistingCacheRoot == ""
    StrCpy $SelectedCacheParent "$LOCALAPPDATA"
    Return
  ${EndIf}

  ${GetParent} "$ExistingCacheRoot" $0
  ${GetParent} "$0" $1
  ${If} $1 == ""
    StrCpy $SelectedCacheParent "$LOCALAPPDATA"
  ${Else}
    StrCpy $SelectedCacheParent $1
  ${EndIf}
FunctionEnd

Function WriteInstallerBootstrap
  FileOpen $0 "$INSTDIR\${INSTALLER_BOOTSTRAP_FILE}" w
  FileWrite $0 "version=1$\r$\n"
  FileWrite $0 "diffViewerMode=$SelectedDiffViewerMode$\r$\n"
  FileWrite $0 "cacheRoot=$SelectedCacheParent\SvnDiffTool\Cache$\r$\n"
  FileClose $0
FunctionEnd

Function ApplyInstallerArgumentOverrides
  ${GetParameters} $0

  ClearErrors
  ${GetOptions} $0 "/DIFFMODE=" $1
  ${IfNot} ${Errors}
    ${If} $1 == "all-files"
      StrCpy $SelectedDiffViewerMode "all-files"
    ${ElseIf} $1 == "excel-only"
      StrCpy $SelectedDiffViewerMode "excel-only"
    ${Else}
      StrCpy $SelectedDiffViewerMode "keep"
    ${EndIf}
  ${EndIf}

  ClearErrors
  ${GetOptions} $0 "/CACHEPARENT=" $1
  ${IfNot} ${Errors}
    ${If} $1 != ""
      StrCpy $SelectedCacheParent $1
    ${EndIf}
  ${EndIf}

  ClearErrors
  ${GetOptions} $0 "/DESKTOPSHORTCUT=" $1
  ${IfNot} ${Errors}
    ${If} $1 == "0"
      StrCpy $ShouldCreateDesktopShortcut "0"
    ${Else}
      StrCpy $ShouldCreateDesktopShortcut "1"
    ${EndIf}
  ${EndIf}

  ClearErrors
  ${GetOptions} $0 "/NODESKTOPSHORTCUT" $1
  ${IfNot} ${Errors}
    StrCpy $ShouldCreateDesktopShortcut "0"
  ${EndIf}
FunctionEnd

Function InstallerOptionsBrowseCacheParent
  nsDialogs::SelectFolderDialog "$(INSTALL_OPTIONS_CACHE_BROWSE_TITLE)" "$SelectedCacheParent"
  Pop $0

  ${If} $0 == error
    Return
  ${EndIf}
  ${If} $0 == ""
    Return
  ${EndIf}

  StrCpy $SelectedCacheParent $0
  ${NSD_SetText} $InstallOptionsCacheParentText $SelectedCacheParent
FunctionEnd

Function InstallerWelcomePageCreate
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 4u 100% 16u "$(INSTALL_WELCOME_TITLE)"
  Pop $1
  CreateFont $2 "$(^Font)" "15" "700"
  SendMessage $1 ${WM_SETFONT} $2 1

  ${NSD_CreateLabel} 0 28u 100% 18u "$(INSTALL_WELCOME_DESC)"
  Pop $1
  ${NSD_CreateLabel} 0 56u 100% 12u "$(INSTALL_WELCOME_POINT1)"
  Pop $1
  ${NSD_CreateLabel} 0 72u 100% 12u "$(INSTALL_WELCOME_POINT2)"
  Pop $1
  ${NSD_CreateLabel} 0 88u 100% 12u "$(INSTALL_WELCOME_POINT3)"
  Pop $1
  ${NSD_CreateLabel} 0 116u 100% 12u "$(INSTALL_WELCOME_HINT)"
  Pop $1

  nsDialogs::Show
FunctionEnd

Function InstallerOptionsPageCreate
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 18u "$(INSTALL_OPTIONS_TITLE)"
  Pop $0

  ${NSD_CreateRadioButton} 0 24u 100% 12u "$(INSTALL_OPTIONS_DIFF_KEEP)"
  Pop $InstallOptionsDiffKeepRadio
  ${NSD_CreateRadioButton} 0 42u 100% 12u "$(INSTALL_OPTIONS_DIFF_EXCEL)"
  Pop $InstallOptionsDiffExcelRadio
  ${NSD_CreateRadioButton} 0 60u 100% 12u "$(INSTALL_OPTIONS_DIFF_ALL)"
  Pop $InstallOptionsDiffAllRadio

  ${If} $SelectedDiffViewerMode == "excel-only"
    ${NSD_SetState} $InstallOptionsDiffExcelRadio ${BST_CHECKED}
  ${ElseIf} $SelectedDiffViewerMode == "all-files"
    ${NSD_SetState} $InstallOptionsDiffAllRadio ${BST_CHECKED}
  ${Else}
    ${NSD_SetState} $InstallOptionsDiffKeepRadio ${BST_CHECKED}
  ${EndIf}

  ${NSD_CreateLabel} 0 90u 100% 12u "$(INSTALL_OPTIONS_CACHE_PARENT)"
  Pop $0
  ${NSD_CreateText} 0 104u 78% 12u "$SelectedCacheParent"
  Pop $InstallOptionsCacheParentText
  ${NSD_CreateButton} 82% 103u 18% 14u "$(INSTALL_OPTIONS_CACHE_BROWSE)"
  Pop $1
  ${NSD_OnClick} $1 InstallerOptionsBrowseCacheParent

  ${NSD_CreateCheckbox} 0 130u 100% 12u "$(INSTALL_OPTIONS_DESKTOP_SHORTCUT)"
  Pop $InstallOptionsDesktopShortcutCheckbox
  ${If} $ShouldCreateDesktopShortcut == "0"
    ${NSD_SetState} $InstallOptionsDesktopShortcutCheckbox ${BST_UNCHECKED}
  ${Else}
    ${NSD_SetState} $InstallOptionsDesktopShortcutCheckbox ${BST_CHECKED}
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function InstallerOptionsPageLeave
  ${NSD_GetText} $InstallOptionsCacheParentText $SelectedCacheParent
  ${If} $SelectedCacheParent == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "$(INSTALL_OPTIONS_CACHE_REQUIRED)"
    Abort
  ${EndIf}

  ${NSD_GetState} $InstallOptionsDiffExcelRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $SelectedDiffViewerMode "excel-only"
  ${Else}
    ${NSD_GetState} $InstallOptionsDiffAllRadio $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $SelectedDiffViewerMode "all-files"
    ${Else}
      StrCpy $SelectedDiffViewerMode "keep"
    ${EndIf}
  ${EndIf}

  ${NSD_GetState} $InstallOptionsDesktopShortcutCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ShouldCreateDesktopShortcut "1"
  ${Else}
    StrCpy $ShouldCreateDesktopShortcut "0"
  ${EndIf}
FunctionEnd

!macro customInit
  StrCpy $ShouldCreateDesktopShortcut "1"
  Call CapturePreviousInstallerBootstrap
  Call EnsureSelectedInstallDefaults
  Call ApplyInstallerArgumentOverrides
!macroend

!macro customWelcomePage
  Page custom InstallerWelcomePageCreate
!macroend

!macro customPageAfterChangeDir
  Page custom InstallerOptionsPageCreate InstallerOptionsPageLeave
!macroend

!macro customInstall
  Delete "$INSTDIR\${INSTALLER_BOOTSTRAP_PREVIOUS_FILE}"
  IfFileExists "$PLUGINSDIR\${INSTALLER_BOOTSTRAP_PREVIOUS_FILE}" 0 +2
    CopyFiles /SILENT "$PLUGINSDIR\${INSTALLER_BOOTSTRAP_PREVIOUS_FILE}" "$INSTDIR\${INSTALLER_BOOTSTRAP_PREVIOUS_FILE}"

  ${If} $ShouldCreateDesktopShortcut == "0"
    WinShell::UninstShortcut "$newDesktopLink"
    Delete "$newDesktopLink"
  ${EndIf}

  Call WriteInstallerBootstrap

  Delete "$INSTDIR\${INSTALLER_MAINTENANCE_PENDING_FILE}"
  FileOpen $0 "$INSTDIR\${INSTALLER_MAINTENANCE_PENDING_FILE}" w
  FileClose $0

  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 done
    DetailPrint "Starting post-install maintenance in the background..."
    Exec '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--maintenance=post-install"'
  done:
!macroend

!macro customFinishPage
  Function StartApp
    ${if} ${isUpdated}
      StrCpy $1 "--updated"
    ${Else}
      StrCpy $1 ""
    ${endif}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  !define MUI_FINISHPAGE_RUN
  !define MUI_FINISHPAGE_RUN_FUNCTION "StartApp"
  !insertmacro MUI_PAGE_FINISH
!macroend

!else

Var ShouldDeletePersonalConfig
Var UninstallOptionsDeleteCheckbox

LangString UNINSTALL_OPTIONS_TITLE 1033 "Choose what to remove during uninstall."
LangString UNINSTALL_OPTIONS_TITLE 2052 "选择卸载时需要移除的内容。"
LangString UNINSTALL_OPTIONS_DELETE_PERSONAL 1033 "Delete SvnDiffTool personal settings, cache, and backup data"
LangString UNINSTALL_OPTIONS_DELETE_PERSONAL 2052 "同时删除 SvnDiffTool 个人配置、缓存和备份数据"

!macro customUnInit
  StrCpy $ShouldDeletePersonalConfig "0"

  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "--delete-app-data" $1
  ${IfNot} ${Errors}
    StrCpy $ShouldDeletePersonalConfig "1"
  ${EndIf}
!macroend

!macro customUnWelcomePage
  !insertmacro MUI_UNPAGE_WELCOME
  UninstPage custom un.UninstallOptionsPageCreate un.UninstallOptionsPageLeave
!macroend

Function un.UninstallOptionsPageCreate
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 18u "$(UNINSTALL_OPTIONS_TITLE)"
  Pop $0
  ${NSD_CreateCheckbox} 0 28u 100% 12u "$(UNINSTALL_OPTIONS_DELETE_PERSONAL)"
  Pop $UninstallOptionsDeleteCheckbox

  ${If} $ShouldDeletePersonalConfig == "1"
    ${NSD_SetState} $UninstallOptionsDeleteCheckbox ${BST_CHECKED}
  ${Else}
    ${NSD_SetState} $UninstallOptionsDeleteCheckbox ${BST_UNCHECKED}
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function un.UninstallOptionsPageLeave
  ${NSD_GetState} $UninstallOptionsDeleteCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ShouldDeletePersonalConfig "1"
  ${Else}
    StrCpy $ShouldDeletePersonalConfig "0"
  ${EndIf}
FunctionEnd

!macro customRemoveFiles
  ${if} ${isUpdated}
    CreateDirectory "$PLUGINSDIR\old-install"

    Push ""
    Call un.atomicRMDir
    Pop $R0

    ${if} $R0 != 0
      DetailPrint "File is busy, aborting: $R0"

      Push ""
      Call un.restoreFiles
      Pop $R0

      Abort `Can't rename "$INSTDIR" to "$PLUGINSDIR\old-install".`
    ${endif}
  ${else}
    IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 +7
      DetailPrint "Running pre-uninstall maintenance..."
      ${If} $ShouldDeletePersonalConfig == "1"
        ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--maintenance=prepare-uninstall" "--delete-app-data"' $0
      ${Else}
        ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--maintenance=prepare-uninstall"' $0
      ${EndIf}
      DetailPrint "Pre-uninstall maintenance exit code: $0"
  ${endif}

  RMDir /r $INSTDIR
!macroend

!endif
