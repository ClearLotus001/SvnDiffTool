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
Var IsUpgradeInstall
Var InstallOptionsInstallDirText
Var InstallOptionsInstallBrowseButton
Var InstallOptionsDiffKeepRadio
Var InstallOptionsDiffTextRadio
Var InstallOptionsDiffWorkbookRadio
Var InstallOptionsDiffAllRadio
Var InstallOptionsCacheParentText
Var InstallOptionsDesktopShortcutCheckbox

LangString INSTALL_WELCOME_TITLE 1033 "Workbook-aware SVN diff viewer"
LangString INSTALL_WELCOME_TITLE 2052 "面向工作簿差异的 SVN 对比工具"
LangString INSTALL_WELCOME_DESC 1033 "SvnDiffTool is optimized for text and workbook compare workflows."
LangString INSTALL_WELCOME_DESC 2052 "SvnDiffTool 专注于文本与工作簿差异查看。"
LangString INSTALL_WELCOME_POINT1 1033 "• Review text and workbook diffs with one app"
LangString INSTALL_WELCOME_POINT1 2052 "• 一个应用同时处理文本与工作簿差异"
LangString INSTALL_WELCOME_POINT2 1033 "• Optionally connect TortoiseSVN Diff Viewer during install"
LangString INSTALL_WELCOME_POINT2 2052 "• 安装时可选择是否接管 TortoiseSVN Diff Viewer"
LangString INSTALL_WELCOME_POINT3 1033 "• Customize cache location and desktop shortcut creation"
LangString INSTALL_WELCOME_POINT3 2052 "• 可自定义缓存目录与桌面快捷方式"
LangString INSTALL_WELCOME_HINT 1033 "Click Next to continue."
LangString INSTALL_WELCOME_HINT 2052 "单击“下一步”继续。"

LangString INSTALL_OPTIONS_TITLE 1033 "Installation options"
LangString INSTALL_OPTIONS_TITLE 2052 "安装选项"
LangString INSTALL_OPTIONS_DESC 1033 "Choose the install location, SVN integration mode, and managed cache location."
LangString INSTALL_OPTIONS_DESC 2052 "配置安装位置、SVN 接入方式与受控缓存目录。"
LangString INSTALL_OPTIONS_INSTALL_DIR 1033 "Install location"
LangString INSTALL_OPTIONS_INSTALL_DIR 2052 "安装位置"
LangString INSTALL_OPTIONS_INSTALL_HELP 1033 "Choose a parent folder or the final app folder; SvnDiffTool is added automatically when needed."
LangString INSTALL_OPTIONS_INSTALL_HELP 2052 "可选择父级文件夹或最终安装目录；需要时会自动追加 SvnDiffTool。"
LangString INSTALL_OPTIONS_INSTALL_BROWSE 1033 "Browse..."
LangString INSTALL_OPTIONS_INSTALL_BROWSE 2052 "浏览..."
LangString INSTALL_OPTIONS_INSTALL_BROWSE_TITLE 1033 "Select where SvnDiffTool should be installed"
LangString INSTALL_OPTIONS_INSTALL_BROWSE_TITLE 2052 "选择 SvnDiffTool 的安装位置"
LangString INSTALL_OPTIONS_INSTALL_REQUIRED 1033 "Please choose an install location."
LangString INSTALL_OPTIONS_INSTALL_REQUIRED 2052 "请选择安装位置。"
LangString INSTALL_OPTIONS_DIFF_GROUP 1033 "TortoiseSVN Diff Viewer integration"
LangString INSTALL_OPTIONS_DIFF_GROUP 2052 "TortoiseSVN Diff Viewer 接入"
LangString INSTALL_OPTIONS_DIFF_KEEP 1033 "Keep the current TortoiseSVN Diff Viewer configuration"
LangString INSTALL_OPTIONS_DIFF_KEEP 2052 "保持当前 TortoiseSVN Diff Viewer 配置"
LangString INSTALL_OPTIONS_DIFF_TEXT 1033 "Use SvnDiffTool only for text diffs"
LangString INSTALL_OPTIONS_DIFF_TEXT 2052 "仅让文本差异使用 SvnDiffTool"
LangString INSTALL_OPTIONS_DIFF_WORKBOOK 1033 "Use SvnDiffTool only for workbook diffs"
LangString INSTALL_OPTIONS_DIFF_WORKBOOK 2052 "仅让工作簿 / 表格差异使用 SvnDiffTool"
LangString INSTALL_OPTIONS_DIFF_ALL 1033 "Use SvnDiffTool for all file diffs"
LangString INSTALL_OPTIONS_DIFF_ALL 2052 "让全部文件差异使用 SvnDiffTool"
LangString INSTALL_OPTIONS_CACHE_GROUP 1033 "Runtime data"
LangString INSTALL_OPTIONS_CACHE_GROUP 2052 "运行数据"
LangString INSTALL_OPTIONS_CACHE_PARENT 1033 "Parent folder for managed session/cache data"
LangString INSTALL_OPTIONS_CACHE_PARENT 2052 "受控会话 / 缓存目录的父级文件夹"
LangString INSTALL_OPTIONS_CACHE_HELP 1033 "The actual cache folder will be <selected folder>\SvnDiffTool\Cache."
LangString INSTALL_OPTIONS_CACHE_HELP 2052 "实际缓存目录为：<所选文件夹>\SvnDiffTool\Cache。"
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
  StrCpy $IsUpgradeInstall "0"
  Call ResolveExistingInstallDir

  ${If} $ExistingInstallDir != ""
    IfFileExists "$ExistingInstallDir\${APP_FILENAME}.exe" mark_upgrade 0
    IfFileExists "$ExistingInstallDir\${INSTALLER_BOOTSTRAP_FILE}" mark_upgrade 0
    Goto capture_previous_bootstrap

  mark_upgrade:
    StrCpy $IsUpgradeInstall "1"
    StrCpy $INSTDIR $ExistingInstallDir

  capture_previous_bootstrap:
    IfFileExists "$ExistingInstallDir\${INSTALLER_BOOTSTRAP_FILE}" 0 +3
      CopyFiles /SILENT "$ExistingInstallDir\${INSTALLER_BOOTSTRAP_FILE}" "$PLUGINSDIR\${INSTALLER_BOOTSTRAP_PREVIOUS_FILE}"
      Return
  ${EndIf}

  IfFileExists "$INSTDIR\${INSTALLER_BOOTSTRAP_FILE}" 0 done
    CopyFiles /SILENT "$INSTDIR\${INSTALLER_BOOTSTRAP_FILE}" "$PLUGINSDIR\${INSTALLER_BOOTSTRAP_PREVIOUS_FILE}"
  done:
FunctionEnd

Function NormalizeSelectedInstallDir
  ${If} $INSTDIR == ""
    Return
  ${EndIf}

  trim_trailing_slash:
    StrLen $1 "$INSTDIR"
    ${If} $1 <= 3
      Goto append_app_dir
    ${EndIf}
    StrCpy $0 "$INSTDIR" 1 -1
    ${If} $0 == "\"
      StrCpy $INSTDIR "$INSTDIR" -1
      Goto trim_trailing_slash
    ${EndIf}

  append_app_dir:
  ${GetFileName} "$INSTDIR" $0
  ${If} $0 != "${APP_FILENAME}"
    StrCpy $0 "$INSTDIR" 1 -1
    ${If} $0 == "\"
      StrCpy $INSTDIR "$INSTDIR${APP_FILENAME}"
    ${Else}
      StrCpy $INSTDIR "$INSTDIR\${APP_FILENAME}"
    ${EndIf}
  ${EndIf}
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
    ${ElseIf} $1 == "text-only"
      StrCpy $SelectedDiffViewerMode "text-only"
    ${ElseIf} $1 == "workbook-only"
      StrCpy $SelectedDiffViewerMode "workbook-only"
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

Function InstallerOptionsBrowseInstallDir
  nsDialogs::SelectFolderDialog "$(INSTALL_OPTIONS_INSTALL_BROWSE_TITLE)" "$INSTDIR"
  Pop $0

  ${If} $0 == error
    Return
  ${EndIf}
  ${If} $0 == ""
    Return
  ${EndIf}

  StrCpy $INSTDIR $0
  Call NormalizeSelectedInstallDir
  ${NSD_SetText} $InstallOptionsInstallDirText $INSTDIR
FunctionEnd

Function InstallerWelcomePageCreate
  ${If} $IsUpgradeInstall == "1"
    Abort
  ${EndIf}

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
  ${If} $IsUpgradeInstall == "1"
    Abort
  ${EndIf}

  Call NormalizeSelectedInstallDir

  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 16u "$(INSTALL_OPTIONS_TITLE)"
  Pop $0
  CreateFont $2 "$(^Font)" "12" "700"
  SendMessage $0 ${WM_SETFONT} $2 1

  ${NSD_CreateLabel} 0 18u 100% 13u "$(INSTALL_OPTIONS_DESC)"
  Pop $0

  ${NSD_CreateGroupBox} 0 38u 100% 44u "$(INSTALL_OPTIONS_INSTALL_DIR)"
  Pop $0
  ${NSD_CreateText} 10u 53u 76% 12u "$INSTDIR"
  Pop $InstallOptionsInstallDirText
  ${NSD_CreateButton} 80% 52u 18% 14u "$(INSTALL_OPTIONS_INSTALL_BROWSE)"
  Pop $InstallOptionsInstallBrowseButton
  ${NSD_OnClick} $InstallOptionsInstallBrowseButton InstallerOptionsBrowseInstallDir
  ${NSD_CreateLabel} 10u 68u 88% 10u "$(INSTALL_OPTIONS_INSTALL_HELP)"
  Pop $0

  ${NSD_CreateGroupBox} 0 88u 100% 68u "$(INSTALL_OPTIONS_DIFF_GROUP)"
  Pop $0
  ${NSD_CreateRadioButton} 10u 103u 88% 10u "$(INSTALL_OPTIONS_DIFF_KEEP)"
  Pop $InstallOptionsDiffKeepRadio
  ${NSD_CreateRadioButton} 10u 116u 88% 10u "$(INSTALL_OPTIONS_DIFF_TEXT)"
  Pop $InstallOptionsDiffTextRadio
  ${NSD_CreateRadioButton} 10u 129u 88% 10u "$(INSTALL_OPTIONS_DIFF_WORKBOOK)"
  Pop $InstallOptionsDiffWorkbookRadio
  ${NSD_CreateRadioButton} 10u 142u 88% 10u "$(INSTALL_OPTIONS_DIFF_ALL)"
  Pop $InstallOptionsDiffAllRadio

  ${If} $SelectedDiffViewerMode == "text-only"
    ${NSD_SetState} $InstallOptionsDiffTextRadio ${BST_CHECKED}
  ${ElseIf} $SelectedDiffViewerMode == "workbook-only"
    ${NSD_SetState} $InstallOptionsDiffWorkbookRadio ${BST_CHECKED}
  ${ElseIf} $SelectedDiffViewerMode == "all-files"
    ${NSD_SetState} $InstallOptionsDiffAllRadio ${BST_CHECKED}
  ${Else}
    ${NSD_SetState} $InstallOptionsDiffKeepRadio ${BST_CHECKED}
  ${EndIf}

  ${NSD_CreateGroupBox} 0 162u 100% 54u "$(INSTALL_OPTIONS_CACHE_GROUP)"
  Pop $0
  ${NSD_CreateLabel} 10u 176u 88% 10u "$(INSTALL_OPTIONS_CACHE_PARENT)"
  Pop $0
  ${NSD_CreateText} 10u 188u 76% 12u "$SelectedCacheParent"
  Pop $InstallOptionsCacheParentText
  ${NSD_CreateButton} 80% 187u 18% 14u "$(INSTALL_OPTIONS_CACHE_BROWSE)"
  Pop $1
  ${NSD_OnClick} $1 InstallerOptionsBrowseCacheParent
  ${NSD_CreateLabel} 10u 203u 88% 10u "$(INSTALL_OPTIONS_CACHE_HELP)"
  Pop $0

  ${NSD_CreateCheckbox} 0 222u 100% 12u "$(INSTALL_OPTIONS_DESKTOP_SHORTCUT)"
  Pop $InstallOptionsDesktopShortcutCheckbox
  ${If} $ShouldCreateDesktopShortcut == "0"
    ${NSD_SetState} $InstallOptionsDesktopShortcutCheckbox ${BST_UNCHECKED}
  ${Else}
    ${NSD_SetState} $InstallOptionsDesktopShortcutCheckbox ${BST_CHECKED}
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function InstallerOptionsPageLeave
  ${NSD_GetText} $InstallOptionsInstallDirText $INSTDIR
  ${If} $INSTDIR == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "$(INSTALL_OPTIONS_INSTALL_REQUIRED)"
    Abort
  ${EndIf}
  Call NormalizeSelectedInstallDir

  ${NSD_GetText} $InstallOptionsCacheParentText $SelectedCacheParent
  ${If} $SelectedCacheParent == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "$(INSTALL_OPTIONS_CACHE_REQUIRED)"
    Abort
  ${EndIf}

  ${NSD_GetState} $InstallOptionsDiffTextRadio $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $SelectedDiffViewerMode "text-only"
  ${Else}
    ${NSD_GetState} $InstallOptionsDiffWorkbookRadio $0
    ${If} $0 == ${BST_CHECKED}
      StrCpy $SelectedDiffViewerMode "workbook-only"
    ${Else}
      ${NSD_GetState} $InstallOptionsDiffAllRadio $0
      ${If} $0 == ${BST_CHECKED}
        StrCpy $SelectedDiffViewerMode "all-files"
      ${Else}
        StrCpy $SelectedDiffViewerMode "keep"
      ${EndIf}
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
  ${If} $IsUpgradeInstall != "1"
    Call NormalizeSelectedInstallDir
  ${EndIf}
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

  StrCpy $launchLink "$INSTDIR\${APP_EXECUTABLE_FILENAME}"

  Delete "$INSTDIR\${INSTALLER_MAINTENANCE_PENDING_FILE}"
  FileOpen $0 "$INSTDIR\${INSTALLER_MAINTENANCE_PENDING_FILE}" w
  FileClose $0

  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 done
    DetailPrint "Running post-install maintenance..."
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--maintenance=post-install"' $0
    DetailPrint "Post-install maintenance exit code: $0"
  done:
!macroend

!macro customFinishPage
  Function StartApp
    ${If} $IsUpgradeInstall == "1"
      StrCpy $1 "--updated"
    ${ElseIf} ${isUpdated}
      StrCpy $1 "--updated"
    ${Else}
      StrCpy $1 ""
    ${EndIf}
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

  SetOutPath "$TEMP"
  RMDir /r "$INSTDIR"
!macroend

!endif
