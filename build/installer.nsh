!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"

!define INSTALLER_BOOTSTRAP_FILE "installer-bootstrap.properties"
!define INSTALLER_BOOTSTRAP_PREVIOUS_FILE "installer-bootstrap.previous.properties"
!define COLOR_BG "F2EFE6"
!define COLOR_PANEL "FAF9F5"
!define COLOR_PANEL_ALT "EBE7DC"
!define COLOR_TEXT "141413"
!define COLOR_MUTED "5F5A52"
!define COLOR_ACCENT "D97757"
!define COLOR_ACCENT2 "6A9BCC"

!macro SetControlFont HANDLE FONT
  SendMessage ${HANDLE} ${WM_SETFONT} ${FONT} 1
!macroend

!macro StyleTextControl HANDLE FG BG FONT
  SetCtlColors ${HANDLE} ${FG} ${BG}
  !insertmacro SetControlFont ${HANDLE} ${FONT}
!macroend

LangString IntegrationPageTitle 1033 "Integration and temporary files"
LangString IntegrationPageTitle 2052 "集成与临时文件"
LangString IntegrationPageSubtitle 1033 "Choose whether SvnDiffTool should take over TortoiseSVN diffs and where session/temp files should live."
LangString IntegrationPageSubtitle 2052 "选择是否接管 TortoiseSVN 的差异查看，以及会话/临时文件的存放位置。"
LangString WelcomePageTitle 1033 "SvnDiffTool Setup"
LangString WelcomePageTitle 2052 "SvnDiffTool 安装向导"
LangString WelcomePageSubtitle 1033 "A workbook-aware SVN diff viewer for Windows and TortoiseSVN."
LangString WelcomePageSubtitle 2052 "面向 Windows 与 TortoiseSVN 的工作簿感知差异查看工具。"
LangString WelcomePageHighlightsTitle 1033 "What this installer will set up"
LangString WelcomePageHighlightsTitle 2052 "本次安装将完成"
LangString WelcomePageHighlightsBody 1033 "- Install the desktop app and workbook parser.$\r$\n- Let you choose the install location.$\r$\n- Optionally connect SvnDiffTool to TortoiseSVN.$\r$\n- Isolate session and temp files in a managed cache folder."
LangString WelcomePageHighlightsBody 2052 "- 安装桌面程序与工作簿解析组件。$\r$\n- 允许自定义安装位置。$\r$\n- 可选接入 TortoiseSVN Diff Viewer。$\r$\n- 将会话与临时文件隔离到受控缓存目录。"
LangString WelcomePageLead 1033 "Built for teams that diff text and Excel workbooks all day."
LangString WelcomePageLead 2052 "为频繁查看文本与 Excel 工作簿差异的团队而设计。"
LangString InstallPageTitle 1033 "Choose install location"
LangString InstallPageTitle 2052 "选择安装位置"
LangString InstallPageSubtitle 1033 "Choose where the SvnDiffTool application files should be installed."
LangString InstallPageSubtitle 2052 "选择 SvnDiffTool 程序文件的安装位置。"
LangString InstallLocationLabel 1033 "Install folder"
LangString InstallLocationLabel 2052 "安装目录"
LangString InstallLocationHint 1033 "This is where the application itself will be installed. It is separate from the session/temp cache folder."
LangString InstallLocationHint 2052 "这里是程序本体的安装位置，与会话/临时文件缓存目录分开。"
LangString InstallLocationRequiredMessage 1033 "Please choose an install folder."
LangString InstallLocationRequiredMessage 2052 "请选择安装目录。"
LangString InstallPageComponentsTitle 1033 "Included with this install"
LangString InstallPageComponentsTitle 2052 "本次安装包含"
LangString InstallPageComponentsBody 1033 "- SvnDiffTool desktop app$\r$\n- Rust workbook parser$\r$\n- Update and uninstall support"
LangString InstallPageComponentsBody 2052 "- SvnDiffTool 桌面程序$\r$\n- Rust 工作簿解析器$\r$\n- 更新与卸载支持"
LangString DesktopShortcutLabel 1033 "Create a desktop shortcut"
LangString DesktopShortcutLabel 2052 "创建桌面快捷方式"
LangString DesktopShortcutHint 1033 "You can still launch SvnDiffTool from the Start menu later."
LangString DesktopShortcutHint 2052 "之后仍可从开始菜单启动 SvnDiffTool。"
LangString DiffViewerLabel 1033 "Default diff viewer"
LangString DiffViewerLabel 2052 "设为默认 Diff Viewer"
LangString DiffViewerKeep 1033 "Keep current TortoiseSVN setup (default)"
LangString DiffViewerKeep 2052 "保持当前配置（默认）"
LangString DiffViewerKeepHint 1033 "Safest upgrade path. SvnDiffTool is installed but does not change TortoiseSVN rules."
LangString DiffViewerKeepHint 2052 "最安全的升级方式。安装 SvnDiffTool，但不改动当前 TortoiseSVN 规则。"
LangString DiffViewerExcelOnly 1033 "Use SvnDiffTool only for Excel and workbook files"
LangString DiffViewerExcelOnly 2052 "仅 Excel / 工作簿文件使用 SvnDiffTool"
LangString DiffViewerExcelOnlyHint 1033 "Workbook files open in SvnDiffTool, while existing text diff tools stay untouched."
LangString DiffViewerExcelOnlyHint 2052 "工作簿文件改由 SvnDiffTool 打开，其它文本差异工具保持不变。"
LangString DiffViewerAllFiles 1033 "Use SvnDiffTool for all file diffs"
LangString DiffViewerAllFiles 2052 "全部文件差异都使用 SvnDiffTool"
LangString DiffViewerAllFilesHint 1033 "Route all TortoiseSVN file diffs through SvnDiffTool."
LangString DiffViewerAllFilesHint 2052 "让 TortoiseSVN 的全部文件差异都通过 SvnDiffTool 打开。"
LangString CacheParentLabel 1033 "Session and temporary files parent folder"
LangString CacheParentLabel 2052 "会话与临时文件父目录"
LangString CacheParentHint 1033 "SvnDiffTool creates its managed Cache folder under the selected parent."
LangString CacheParentHint 2052 "SvnDiffTool 会在所选父目录下创建并管理自己的 Cache 目录。"
LangString CacheActualLabel 1033 "Managed path"
LangString CacheActualLabel 2052 "实际生效目录"
LangString CacheRequiredMessage 1033 "Please choose a parent folder for session and temporary files."
LangString CacheRequiredMessage 2052 "请选择会话与临时文件的父目录。"
LangString BrowseFolderAction 1033 "Browse..."
LangString BrowseFolderAction 2052 "浏览..."
LangString CacheNotice 1033 "Only session/temp files go there. Settings and update state stay in the normal app profile."
LangString CacheNotice 2052 "这里只保存会话/临时文件；设置和更新状态仍保存在正常应用配置目录。"
LangString UninstallSummaryTitle 1033 "Uninstall cleanup"
LangString UninstallSummaryTitle 2052 "卸载清理"
LangString UninstallSummarySubtitle 1033 "The uninstaller will remove SvnDiffTool and its managed data."
LangString UninstallSummarySubtitle 2052 "卸载程序将删除 SvnDiffTool 及其受控数据。"
LangString UninstallSummaryBody 1033 "This uninstall will restore the previous TortoiseSVN diff viewer, remove SvnDiffTool preferences, clear controlled cache/temp data, and delete the installed files."
LangString UninstallSummaryBody 2052 "本次卸载会恢复之前的 TortoiseSVN Diff Viewer，删除 SvnDiffTool 偏好配置，清理受控缓存/临时文件，并删除程序文件。"
LangString FinishPageTitle 1033 "Setup complete"
LangString FinishPageTitle 2052 "安装完成"
LangString FinishPageSubtitle 1033 "SvnDiffTool is installed and ready."
LangString FinishPageSubtitle 2052 "SvnDiffTool 已安装完成。"
LangString FinishPageBody 1033 "Next steps:$\r$\n- Launch SvnDiffTool to review or adjust TortoiseSVN integration.$\r$\n- Session and temp files will use the managed cache folder you selected.$\r$\n- You can uninstall later from Windows Apps or from the app About dialog."
LangString FinishPageBody 2052 "建议下一步：$\r$\n- 启动 SvnDiffTool，检查或调整 TortoiseSVN 接入方式。$\r$\n- 会话与临时文件会使用你选择的受控缓存目录。$\r$\n- 之后可从 Windows 应用列表或应用内 About 对话框发起卸载。"
LangString FinishLaunchLabel 1033 "Launch SvnDiffTool now"
LangString FinishLaunchLabel 2052 "立即启动 SvnDiffTool"

!ifndef BUILD_UNINSTALLER

Var FontHero
Var FontTitle
Var FontBody
Var FontMeta
Var InstallDirInput
Var InstallDirDetailsValue
Var DesktopShortcutCheckbox
Var LaunchAfterInstallCheckbox
Var DiffViewerKeepRadio
Var DiffViewerExcelRadio
Var DiffViewerAllRadio
Var CacheParentInput
Var CachePreviewValue
Var ShouldCreateDesktopShortcut
Var ShouldLaunchAfterInstall
Var SelectedDiffViewerMode
Var SelectedCacheParent
Var ExistingDiffViewerMode
Var ExistingCacheRoot

Function EnsureInstallerFonts
  ${If} $FontHero == ""
    CreateFont $FontHero "Segoe UI" 16 700
    CreateFont $FontTitle "Segoe UI" 11 700
    CreateFont $FontBody "Segoe UI" 9 400
    CreateFont $FontMeta "Segoe UI" 8 400
  ${EndIf}
FunctionEnd

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

Function UpdateManagedCachePreview
  ${NSD_GetText} $CacheParentInput $0
  ${If} $0 == ""
    ${NSD_SetText} $CachePreviewValue ""
    Return
  ${EndIf}
  ${NSD_SetText} $CachePreviewValue "$0\SvnDiffTool\Cache"
FunctionEnd

Function OnCacheParentChanged
  Call UpdateManagedCachePreview
FunctionEnd

Function OnBrowseCacheParent
  ${NSD_GetText} $CacheParentInput $0
  nsDialogs::SelectFolderDialog "$(CacheParentLabel)" "$0"
  Pop $1

  ${If} $1 == "error"
    Return
  ${EndIf}

  ${NSD_SetText} $CacheParentInput $1
  Call UpdateManagedCachePreview
FunctionEnd

Function OnBrowseInstallDir
  ${NSD_GetText} $InstallDirInput $0
  nsDialogs::SelectFolderDialog "$(InstallLocationLabel)" "$0"
  Pop $1

  ${If} $1 == "error"
    Return
  ${EndIf}

  ${NSD_SetText} $InstallDirInput $1
FunctionEnd

Function WelcomePageCreate
  Call EnsureInstallerFonts
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 100% ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_BG}

  ${NSD_CreateLabel} 0 0 100% 4u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_ACCENT}

  ${NSD_CreateLabel} 0 12u 100% 14u "$(WelcomePageTitle)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_BG} $FontHero

  ${NSD_CreateLabel} 0 28u 100% 12u "$(WelcomePageSubtitle)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_BG} $FontBody

  ${NSD_CreateLabel} 0 44u 100% 12u "$(WelcomePageLead)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_ACCENT2} ${COLOR_BG} $FontBody

  ${NSD_CreateLabel} 0 68u 100% 96u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_PANEL}

  ${NSD_CreateLabel} 0 68u 3% 96u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_ACCENT2}

  ${NSD_CreateLabel} 8u 80u 88% 10u "$(WelcomePageHighlightsTitle)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_PANEL} $FontTitle

  ${NSD_CreateLabel} 8u 96u 88% 56u "$(WelcomePageHighlightsBody)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_PANEL} $FontBody

  ${NSD_CreateLabel} 82% 80u 14% 38u "SVN$\r$\nDiff"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_PANEL_ALT} $FontTitle

  nsDialogs::Show
FunctionEnd

Function WelcomePageLeave
FunctionEnd

Function InstallLocationPageCreate
  Call EnsureInstallerFonts
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 100% ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_BG}

  ${NSD_CreateLabel} 0 0 100% 4u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_ACCENT}

  ${NSD_CreateLabel} 0 12u 100% 12u "$(InstallPageTitle)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_BG} $FontTitle

  ${NSD_CreateLabel} 0 26u 100% 12u "$(InstallPageSubtitle)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_BG} $FontBody

  ${NSD_CreateLabel} 0 48u 100% 82u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_PANEL}
  ${NSD_CreateLabel} 0 48u 3% 82u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_ACCENT}

  ${NSD_CreateLabel} 8u 60u 88% 10u "$(InstallLocationLabel)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_PANEL} $FontTitle

  ${NSD_CreateLabel} 8u 74u 88% 16u "$(InstallLocationHint)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_PANEL} $FontBody

  ${NSD_CreateText} 8u 96u 72% 12u "$INSTDIR"
  Pop $InstallDirInput
  !insertmacro StyleTextControl $InstallDirInput ${COLOR_TEXT} ${COLOR_PANEL_ALT} $FontBody

  ${NSD_CreateBrowseButton} 84% 96u 16% 12u "$(BrowseFolderAction)"
  Pop $0
  !insertmacro SetControlFont $0 $FontBody
  ${NSD_OnClick} $0 OnBrowseInstallDir

  ${NSD_CreateLabel} 0 140u 48% 58u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_PANEL}
  ${NSD_CreateLabel} 0 140u 2% 58u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_ACCENT2}
  ${NSD_CreateLabel} 6u 150u 38% 10u "$(InstallPageComponentsTitle)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_PANEL} $FontTitle

  ${NSD_CreateLabel} 6u 164u 38% 24u "$(InstallPageComponentsBody)"
  Pop $InstallDirDetailsValue
  !insertmacro StyleTextControl $InstallDirDetailsValue ${COLOR_MUTED} ${COLOR_PANEL} $FontBody

  ${NSD_CreateLabel} 52% 140u 48% 58u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_PANEL}
  ${NSD_CreateLabel} 52% 140u 2% 58u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_ACCENT}
  ${NSD_CreateLabel} 56% 150u 36% 10u "$(DesktopShortcutLabel)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_PANEL} $FontTitle

  ${NSD_CreateCheckBox} 56% 166u 34% 10u "$(DesktopShortcutLabel)"
  Pop $DesktopShortcutCheckbox
  ${If} $ShouldCreateDesktopShortcut == "0"
    ${NSD_Uncheck} $DesktopShortcutCheckbox
  ${Else}
    ${NSD_Check} $DesktopShortcutCheckbox
  ${EndIf}
  !insertmacro StyleTextControl $DesktopShortcutCheckbox ${COLOR_TEXT} ${COLOR_PANEL} $FontBody

  ${NSD_CreateLabel} 56% 180u 36% 10u "$(DesktopShortcutHint)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_PANEL} $FontMeta

  nsDialogs::Show
FunctionEnd

Function InstallLocationPageLeave
  ${NSD_GetText} $InstallDirInput $0
  ${If} $0 == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "$(InstallLocationRequiredMessage)"
    Abort
  ${EndIf}

  StrCpy $INSTDIR $0

  ${NSD_GetState} $DesktopShortcutCheckbox $0
  ${If} $0 <> 0
    StrCpy $ShouldCreateDesktopShortcut "1"
  ${Else}
    StrCpy $ShouldCreateDesktopShortcut "0"
  ${EndIf}
FunctionEnd

Function IntegrationOptionsPageCreate
  Call EnsureInstallerFonts

  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 100% ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_BG}

  ${NSD_CreateLabel} 0 0 100% 4u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_ACCENT}

  ${NSD_CreateLabel} 0 12u 100% 12u "$(IntegrationPageTitle)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_BG} $FontTitle

  ${NSD_CreateLabel} 0 26u 100% 12u "$(IntegrationPageSubtitle)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_BG} $FontBody

  ${NSD_CreateLabel} 0 48u 100% 88u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_PANEL}
  ${NSD_CreateLabel} 0 48u 3% 88u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_ACCENT}

  ${NSD_CreateLabel} 8u 58u 88% 10u "$(DiffViewerLabel)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_PANEL} $FontTitle

  ${NSD_CreateRadioButton} 8u 74u 88% 10u "$(DiffViewerKeep)"
  Pop $DiffViewerKeepRadio
  !insertmacro StyleTextControl $DiffViewerKeepRadio ${COLOR_TEXT} ${COLOR_PANEL} $FontBody
  ${NSD_CreateLabel} 14u 86u 80% 10u "$(DiffViewerKeepHint)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_PANEL} $FontMeta

  ${NSD_CreateRadioButton} 8u 96u 88% 10u "$(DiffViewerExcelOnly)"
  Pop $DiffViewerExcelRadio
  !insertmacro StyleTextControl $DiffViewerExcelRadio ${COLOR_TEXT} ${COLOR_PANEL} $FontBody
  ${NSD_CreateLabel} 14u 108u 80% 10u "$(DiffViewerExcelOnlyHint)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_PANEL} $FontMeta

  ${NSD_CreateRadioButton} 8u 118u 88% 10u "$(DiffViewerAllFiles)"
  Pop $DiffViewerAllRadio
  !insertmacro StyleTextControl $DiffViewerAllRadio ${COLOR_TEXT} ${COLOR_PANEL} $FontBody
  ${NSD_CreateLabel} 14u 130u 80% 10u "$(DiffViewerAllFilesHint)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_PANEL} $FontMeta

  ${If} $SelectedDiffViewerMode == "all-files"
    ${NSD_Check} $DiffViewerAllRadio
  ${ElseIf} $SelectedDiffViewerMode == "excel-only"
    ${NSD_Check} $DiffViewerExcelRadio
  ${Else}
    ${NSD_Check} $DiffViewerKeepRadio
  ${EndIf}

  ${NSD_CreateLabel} 0 146u 100% 74u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_PANEL}
  ${NSD_CreateLabel} 0 146u 3% 74u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_ACCENT2}

  ${NSD_CreateLabel} 8u 156u 88% 10u "$(CacheParentLabel)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_PANEL} $FontTitle

  ${NSD_CreateLabel} 8u 170u 88% 14u "$(CacheParentHint)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_PANEL} $FontBody

  ${NSD_CreateText} 8u 188u 72% 12u "$SelectedCacheParent"
  Pop $CacheParentInput
  !insertmacro StyleTextControl $CacheParentInput ${COLOR_TEXT} ${COLOR_PANEL_ALT} $FontBody
  ${NSD_OnChange} $CacheParentInput OnCacheParentChanged

  ${NSD_CreateBrowseButton} 84% 188u 16% 12u "$(BrowseFolderAction)"
  Pop $0
  !insertmacro SetControlFont $0 $FontBody
  ${NSD_OnClick} $0 OnBrowseCacheParent

  ${NSD_CreateLabel} 8u 204u 88% 10u "$(CacheActualLabel)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_PANEL} $FontMeta

  ${NSD_CreateLabel} 8u 214u 88% 12u ""
  Pop $CachePreviewValue
  !insertmacro StyleTextControl $CachePreviewValue ${COLOR_ACCENT2} ${COLOR_PANEL} $FontBody

  ${NSD_CreateLabel} 8u 226u 88% 10u "$(CacheNotice)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_PANEL} $FontMeta

  Call UpdateManagedCachePreview
  nsDialogs::Show
FunctionEnd

Function IntegrationOptionsPageLeave
  ${NSD_GetText} $CacheParentInput $SelectedCacheParent
  ${If} $SelectedCacheParent == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "$(CacheRequiredMessage)"
    Abort
  ${EndIf}

  ${NSD_GetState} $DiffViewerAllRadio $0
  ${If} $0 <> 0
    StrCpy $SelectedDiffViewerMode "all-files"
    Return
  ${EndIf}

  ${NSD_GetState} $DiffViewerExcelRadio $0
  ${If} $0 <> 0
    StrCpy $SelectedDiffViewerMode "excel-only"
    Return
  ${EndIf}

  StrCpy $SelectedDiffViewerMode "keep"
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

  ClearErrors
  ${GetOptions} $0 "/LAUNCHAFTERINSTALL=" $1
  ${IfNot} ${Errors}
    ${If} $1 == "0"
      StrCpy $ShouldLaunchAfterInstall "0"
    ${Else}
      StrCpy $ShouldLaunchAfterInstall "1"
    ${EndIf}
  ${EndIf}
FunctionEnd

!macro customInit
  StrCpy $ShouldCreateDesktopShortcut "1"
  StrCpy $ShouldLaunchAfterInstall "1"
  IfFileExists "$INSTDIR\${INSTALLER_BOOTSTRAP_FILE}" 0 +2
    CopyFiles /SILENT "$INSTDIR\${INSTALLER_BOOTSTRAP_FILE}" "$PLUGINSDIR\${INSTALLER_BOOTSTRAP_PREVIOUS_FILE}"
  Call EnsureSelectedInstallDefaults
  Call ApplyInstallerArgumentOverrides
!macroend

!macro customWelcomePage
  Page custom WelcomePageCreate WelcomePageLeave
!macroend

!macro customPageAfterChangeDir
  Page custom InstallLocationPageCreate InstallLocationPageLeave
  Page custom IntegrationOptionsPageCreate IntegrationOptionsPageLeave
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

  IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 done
    DetailPrint "Running post-install maintenance..."
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--maintenance=post-install"' $0
    DetailPrint "Post-install maintenance exit code: $0"
  done:
!macroend

Function FinishPageCreate
  Call EnsureInstallerFonts
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 100% ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_BG}

  ${NSD_CreateLabel} 0 0 100% 4u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_ACCENT}

  ${NSD_CreateLabel} 0 12u 100% 12u "$(FinishPageTitle)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_BG} $FontTitle

  ${NSD_CreateLabel} 0 26u 100% 12u "$(FinishPageSubtitle)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_BG} $FontBody

  ${NSD_CreateLabel} 0 48u 100% 112u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_PANEL}
  ${NSD_CreateLabel} 0 48u 3% 112u ""
  Pop $0
  SetCtlColors $0 "" ${COLOR_ACCENT2}

  ${NSD_CreateLabel} 8u 60u 88% 10u "$(FinishPageTitle)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_TEXT} ${COLOR_PANEL} $FontTitle

  ${NSD_CreateLabel} 8u 76u 88% 56u "$(FinishPageBody)"
  Pop $0
  !insertmacro StyleTextControl $0 ${COLOR_MUTED} ${COLOR_PANEL} $FontBody

  ${NSD_CreateCheckBox} 8u 140u 88% 10u "$(FinishLaunchLabel)"
  Pop $LaunchAfterInstallCheckbox
  ${If} $ShouldLaunchAfterInstall == "0"
    ${NSD_Uncheck} $LaunchAfterInstallCheckbox
  ${Else}
    ${NSD_Check} $LaunchAfterInstallCheckbox
  ${EndIf}
  !insertmacro StyleTextControl $LaunchAfterInstallCheckbox ${COLOR_TEXT} ${COLOR_PANEL} $FontBody

  nsDialogs::Show
FunctionEnd

Function FinishPageLeave
  ${NSD_GetState} $LaunchAfterInstallCheckbox $0
  ${If} $0 <> 0
    StrCpy $ShouldLaunchAfterInstall "1"
    HideWindow
    ExecShell "open" "$INSTDIR\${PRODUCT_FILENAME}.exe"
  ${Else}
    StrCpy $ShouldLaunchAfterInstall "0"
  ${EndIf}
FunctionEnd

!macro customFinishPage
  Page custom FinishPageCreate FinishPageLeave
!macroend

!else

Function un.UninstallSummaryPageCreate
  nsDialogs::Create 1018
  Pop $0
  ${If} $0 == error
    Abort
  ${EndIf}

  ${NSD_CreateLabel} 0 0 100% 10u "$(UninstallSummaryTitle)"
  Pop $1
  ${NSD_CreateLabel} 0 12u 100% 18u "$(UninstallSummarySubtitle)"
  Pop $1
  ${NSD_CreateLabel} 0 40u 100% 56u "$(UninstallSummaryBody)"
  Pop $1

  nsDialogs::Show
FunctionEnd

Function un.UninstallSummaryPageLeave
FunctionEnd

!macro customUnWelcomePage
  UninstPage custom un.UninstallSummaryPageCreate un.UninstallSummaryPageLeave
!macroend

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
    IfFileExists "$INSTDIR\${APP_EXECUTABLE_FILENAME}" 0 +4
      DetailPrint "Running pre-uninstall maintenance..."
      ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--maintenance=prepare-uninstall"' $0
      DetailPrint "Pre-uninstall maintenance exit code: $0"
  ${endif}

  RMDir /r $INSTDIR
!macroend

!endif
