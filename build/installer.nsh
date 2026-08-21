!include "LogicLib.nsh"
!include "FileFunc.nsh"
!include "nsDialogs.nsh"
!include "WinMessages.nsh"
!include "${BUILD_RESOURCES_DIR}\installer-theme.nsh"

!define INSTALLER_BOOTSTRAP_FILE "installer-bootstrap.properties"
!define INSTALLER_BOOTSTRAP_PREVIOUS_FILE "installer-bootstrap.previous.properties"
!define INSTALLER_MAINTENANCE_PENDING_FILE "installer-maintenance.pending"
!define MUI_BGCOLOR "${COLOR_BG}"
!define MUI_TEXTCOLOR "${COLOR_TEXT}"
!define MUI_FINISHPAGE_LINK_COLOR "${COLOR_ACCENT}"
!define MUI_ABORTWARNING
!define /ifndef INSTALL_REGISTRY_KEY "Software\${APP_GUID}"
!define /ifndef UNINSTALL_REGISTRY_KEY "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}"

!ifndef BUILD_UNINSTALLER

!define MUI_CUSTOMFUNCTION_GUIINIT InstallerGuiInit
!include "getProcessInfo.nsh"

Var pid
Var ShouldCreateDesktopShortcut
Var SelectedDiffViewerMode
Var SelectedCacheParent
Var ExistingDiffViewerMode
Var ExistingCacheRoot
Var ExistingInstallDir
Var ExistingVersion
Var IsInAppUpdate
Var IsUpgradeInstall
Var InstallOptionsInstallDirText
Var InstallOptionsInstallBrowseButton
Var InstallOptionsDiffKeepRadio
Var InstallOptionsDiffTextRadio
Var InstallOptionsDiffWorkbookRadio
Var InstallOptionsDiffAllRadio
Var InstallOptionsCacheParentText
Var InstallOptionsCacheBrowseButton
Var InstallOptionsDesktopShortcutCheckbox
Var InstallerWidthDelta
Var InstallerHeightDelta
Var InstallerProgressOffset
Var InstallerProgressTextOffset
Var InstallerFinishRunCheckbox
Var InstallerUpgradePreserveLabel
Var InstallerBrandBitmap
Var InstallerBrandImageHandle
Var InstallerFontDisplay
Var InstallerFontSection
Var InstallerFontBody
Var InstallerFontMono
Var InstallerFontStrong
Var InstallerFontSmallStrong
Var InstallerOriginalWidth
Var InstallerOriginalHeight

!macro MoveResizeInstallerControl HWND PARENT DX DY DW DH
  System::Store "S"
  StrCpy $R9 ${HWND}
  StrCpy $R8 ${PARENT}
  StrCpy $R7 ${DX}
  StrCpy $R6 ${DY}
  StrCpy $R5 ${DW}
  StrCpy $R4 ${DH}

  ${If} $R9 != 0
    System::Call 'USER32::GetWindowRect(p$R9,@r0)i.r1'
    ${If} $1 != 0
      System::Call 'USER32::MapWindowPoints(p0,p$R8,pr0,i2)'
      System::Call '*$0(i.r1,i.r2,i.r3,i.r4)'
      IntOp $3 $3 - $1
      IntOp $4 $4 - $2
      IntOp $1 $1 + $R7
      IntOp $2 $2 + $R6
      IntOp $3 $3 + $R5
      IntOp $4 $4 + $R4
      System::Call 'USER32::SetWindowPos(p$R9,p0,ir1,ir2,ir3,ir4,i0x14)'
    ${EndIf}
  ${EndIf}
  System::Store "L"
!macroend

!macro CopyInstallerControlBounds TARGET SOURCE PARENT
  System::Store "S"
  StrCpy $R9 ${TARGET}
  StrCpy $R8 ${SOURCE}
  StrCpy $R7 ${PARENT}

  ${If} $R9 != 0
  ${AndIf} $R8 != 0
    System::Call 'USER32::GetWindowRect(p$R8,@r0)i.r1'
    ${If} $1 != 0
      System::Call 'USER32::MapWindowPoints(p0,p$R7,pr0,i2)'
      System::Call '*$0(i.r1,i.r2,i.r3,i.r4)'
      IntOp $3 $3 - $1
      IntOp $4 $4 - $2
      System::Call 'USER32::SetWindowPos(p$R9,p0,ir1,ir2,ir3,ir4,i0x14)'
    ${EndIf}
  ${EndIf}
  System::Store "L"
!macroend

!macro SetInstallerHeader TITLE SUBTITLE
  GetDlgItem $1 $HWNDPARENT 1037
  SendMessage $1 ${WM_SETTEXT} 0 "STR:${TITLE}"
  GetDlgItem $1 $HWNDPARENT 1038
  SendMessage $1 ${WM_SETTEXT} 0 "STR:${SUBTITLE}"
!macroend

!macro CreateInstallerBrandRail STEP SECTION
  ${NSD_CreateBitmap} 0 0 27% 100% ""
  Pop $InstallerBrandBitmap
  ${NSD_SetBitmap} $InstallerBrandBitmap "$PLUGINSDIR\installerPanel.bmp" $InstallerBrandImageHandle

  ${NSD_CreateLabel} 4% 83% 20% 7% "VERSORA"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $InstallerFontStrong 1
  SetCtlColors $1 "${COLOR_BRAND_TEXT}" "${COLOR_BRAND_SURFACE}"
  System::Call 'USER32::SetWindowPos(p$1,p0,i0,i0,i0,i0,i0x13)'

  ${NSD_CreateLabel} 4% 90% 21% 8% "${STEP}  ·  ${SECTION}"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $InstallerFontSmallStrong 1
  SetCtlColors $1 "${COLOR_BRAND_MUTED}" "${COLOR_BRAND_SURFACE}"
  System::Call 'USER32::SetWindowPos(p$1,p0,i0,i0,i0,i0,i0x13)'

  ${NSD_CreateLabel} 28% 0 1% 100% ""
  Pop $1
  SetCtlColors $1 "" "${COLOR_PANEL_ALT}"
!macroend

!macro CreateInstallerCard X Y W H TONE
  ${NSD_CreateLabel} ${X} ${Y} ${W} ${H} ""
  Pop $1
  SetCtlColors $1 "" "${COLOR_PANEL}"
  ${NSD_CreateLabel} ${X} ${Y} ${W} 1u ""
  Pop $1
  SetCtlColors $1 "" "${TONE}"
!macroend

!macro StyleInstallerControl HWND FONT TEXTCOLOR BGCOLOR
  SendMessage ${HWND} ${WM_SETFONT} ${FONT} 1
  SetCtlColors ${HWND} ${TEXTCOLOR} ${BGCOLOR}
!macroend

!macro ShowInstallerInteractiveControl HWND
  EnableWindow ${HWND} 1
  ShowWindow ${HWND} ${SW_SHOW}
  System::Call 'USER32::SetWindowPos(p${HWND},p0,i0,i0,i0,i0,i0x13)'
!macroend

LangString INSTALL_WELCOME_BADGE 1033 "VERSORA  /  VERSION ${VERSION}"
LangString INSTALL_WELCOME_BADGE 2052 "VERSORA  /  版本 ${VERSION}"
LangString INSTALL_WELCOME_TITLE 1033 "Install Versora"
LangString INSTALL_WELCOME_TITLE 2052 "安装 Versora"
LangString INSTALL_WELCOME_DESC 1033 "A focused comparison workspace for files, Git, and SVN."
LangString INSTALL_WELCOME_DESC 2052 "面向文件、Git 与 SVN 的专注比较工作台。"
LangString INSTALL_WELCOME_FEATURES_TITLE 1033 "Included"
LangString INSTALL_WELCOME_FEATURES_TITLE 2052 "安装内容"
LangString INSTALL_WELCOME_POINT1 1033 "Text, Excel, and Git changes in one focused workspace"
LangString INSTALL_WELCOME_POINT1 2052 "在同一工作台查看文本、Excel 与 Git 变化"
LangString INSTALL_WELCOME_POINT2 1033 "Optional TortoiseSVN Diff Viewer integration"
LangString INSTALL_WELCOME_POINT2 2052 "可选接入 TortoiseSVN Diff Viewer"
LangString INSTALL_WELCOME_POINT3 1033 "Updates preserve personal settings and managed data"
LangString INSTALL_WELCOME_POINT3 2052 "后续更新会保留个人设置与受控数据"
LangString INSTALL_WELCOME_HINT 1033 "Continue to review installation options."
LangString INSTALL_WELCOME_HINT 2052 "继续查看安装选项。"
LangString INSTALL_WELCOME_CARD_TITLE 1033 "See every change, without the noise"
LangString INSTALL_WELCOME_CARD_TITLE 2052 "更清晰地看见每一次变化"
LangString INSTALL_STEP_OVERVIEW 1033 "OVERVIEW"
LangString INSTALL_STEP_OVERVIEW 2052 "概览"
LangString INSTALL_STEP_LOCATION 1033 "LOCATION"
LangString INSTALL_STEP_LOCATION 2052 "位置"
LangString INSTALL_STEP_INTEGRATION 1033 "INTEGRATION"
LangString INSTALL_STEP_INTEGRATION 2052 "集成"
LangString INSTALL_STEP_UPDATE 1033 "UPDATE"
LangString INSTALL_STEP_UPDATE 2052 "更新"
LangString INSTALL_STEP_COMPLETE 1033 "READY"
LangString INSTALL_STEP_COMPLETE 2052 "就绪"

LangString INSTALL_UPGRADE_TITLE 1033 "Update Versora"
LangString INSTALL_UPGRADE_TITLE 2052 "更新 Versora"
LangString INSTALL_REPAIR_TITLE 1033 "Reinstall Versora"
LangString INSTALL_REPAIR_TITLE 2052 "重新安装 Versora"
LangString INSTALL_UPGRADE_SUBTITLE 1033 "Review the update details before continuing."
LangString INSTALL_UPGRADE_SUBTITLE 2052 "继续前请确认更新信息。"
LangString INSTALL_REPAIR_SUBTITLE 1033 "Review the reinstall details before continuing."
LangString INSTALL_REPAIR_SUBTITLE 2052 "继续前请确认覆盖安装信息。"
LangString INSTALL_UPGRADE_UNKNOWN_VERSION 1033 "installed"
LangString INSTALL_UPGRADE_UNKNOWN_VERSION 2052 "已安装版本"
LangString INSTALL_UPGRADE_DESC 1033 "Versora will close if needed before the installed files are replaced. Installation progress remains visible throughout."
LangString INSTALL_UPGRADE_DESC 2052 "如有需要，安装程序会先关闭 Versora，再替换现有文件；全过程显示安装进度。"
LangString INSTALL_UPGRADE_SUMMARY_TITLE 1033 "Installation summary"
LangString INSTALL_UPGRADE_SUMMARY_TITLE 2052 "安装摘要"
LangString INSTALL_UPGRADE_CURRENT_LABEL 1033 "Current version"
LangString INSTALL_UPGRADE_CURRENT_LABEL 2052 "当前版本"
LangString INSTALL_UPGRADE_TARGET_LABEL 1033 "New version"
LangString INSTALL_UPGRADE_TARGET_LABEL 2052 "目标版本"
LangString INSTALL_UPGRADE_LOCATION_LABEL 1033 "Install location"
LangString INSTALL_UPGRADE_LOCATION_LABEL 2052 "安装位置"
LangString INSTALL_UPGRADE_PRESERVE_LABEL 1033 "Preserved"
LangString INSTALL_UPGRADE_PRESERVE_LABEL 2052 "保留内容"
LangString INSTALL_UPGRADE_PRESERVE_VALUE 1033 "Settings, shortcuts, cache, and TortoiseSVN preference"
LangString INSTALL_UPGRADE_PRESERVE_VALUE 2052 "设置、快捷方式、缓存路径与 TortoiseSVN 偏好"
LangString INSTALL_UPGRADE_ACTION 1033 "&Update"
LangString INSTALL_UPGRADE_ACTION 2052 "更新(&U)"
LangString INSTALL_REPAIR_ACTION 1033 "&Reinstall"
LangString INSTALL_REPAIR_ACTION 2052 "覆盖安装(&R)"

LangString INSTALL_PROGRESS_INSTALL_TITLE 1033 "Installing Versora"
LangString INSTALL_PROGRESS_INSTALL_TITLE 2052 "正在安装 Versora"
LangString INSTALL_PROGRESS_UPDATE_TITLE 1033 "Updating Versora"
LangString INSTALL_PROGRESS_UPDATE_TITLE 2052 "正在更新 Versora"
LangString INSTALL_PROGRESS_SUBTITLE 1033 "Please wait while app files and integrations are configured."
LangString INSTALL_PROGRESS_SUBTITLE 2052 "正在配置应用文件和集成选项，请稍候。"
LangString INSTALL_PROGRESS_STATUS 1033 "Installation is in progress. You can keep this window open."
LangString INSTALL_PROGRESS_STATUS 2052 "安装正在进行，请保持此窗口打开。"
LangString INSTALL_PROGRESS_FINALIZING 1033 "Finalizing setup and restoring integrations..."
LangString INSTALL_PROGRESS_FINALIZING 2052 "正在完成安装并恢复集成配置..."
LangString INSTALL_CLOSE_PROMPT 1033 "Versora is still running. Setup needs to close it before replacing application files.$\r$\n$\r$\nContinue?"
LangString INSTALL_CLOSE_PROMPT 2052 "Versora 仍在运行，安装程序需要先关闭它才能替换应用文件。$\r$\n$\r$\n是否继续？"
LangString INSTALL_CLOSE_PROGRESS 1033 "Closing Versora and its helper processes..."
LangString INSTALL_CLOSE_PROGRESS 2052 "正在关闭 Versora 及其辅助进程..."
LangString INSTALL_CLOSE_FAILED 1033 "Setup still cannot close every Versora process.$\r$\n$\r$\nSave your work and end Versora.exe in Task Manager, then click Retry. If Versora is running as administrator, run this installer as administrator too."
LangString INSTALL_CLOSE_FAILED 2052 "安装程序仍无法关闭全部 Versora 进程。$\r$\n$\r$\n请保存工作并在任务管理器中结束 Versora.exe，然后单击“重试”。如果 Versora 正以管理员权限运行，请也以管理员身份运行本安装程序。"
LangString INSTALL_MAINTENANCE_FAILED 1033 "Versora files were installed, but setup could not finish configuring managed data and integrations. Retry now, or cancel and run setup again later."
LangString INSTALL_MAINTENANCE_FAILED 2052 "Versora 文件已安装，但未能完成受控数据与集成配置。请选择立即重试，或取消并稍后重新运行安装程序。"
LangString INSTALL_FINISH_HEADER_TITLE 1033 "Installation complete"
LangString INSTALL_FINISH_HEADER_TITLE 2052 "安装完成"
LangString INSTALL_FINISH_TITLE 1033 "Versora is ready"
LangString INSTALL_FINISH_TITLE 2052 "Versora 已准备就绪"
LangString INSTALL_FINISH_TEXT 1033 "Installation completed successfully. Choose whether to open Versora now, then select Finish."
LangString INSTALL_FINISH_TEXT 2052 "安装已成功完成。请选择是否立即打开 Versora，然后单击“完成”。"
LangString INSTALL_FINISH_AFTER_TITLE 1033 "After setup"
LangString INSTALL_FINISH_AFTER_TITLE 2052 "完成后"
LangString INSTALL_FINISH_RUN 1033 "Open Versora"
LangString INSTALL_FINISH_RUN 2052 "打开 Versora"
LangString INSTALL_FINISH_ACTION 1033 "&Finish"
LangString INSTALL_FINISH_ACTION 2052 "完成(&F)"

LangString INSTALL_OPTIONS_TITLE 1033 "Installation options"
LangString INSTALL_OPTIONS_TITLE 2052 "安装选项"
LangString INSTALL_OPTIONS_DESC 1033 "Choose where the app is installed and which shortcuts are created."
LangString INSTALL_OPTIONS_DESC 2052 "选择应用的安装位置和需要创建的快捷方式。"
LangString INSTALL_INTEGRATION_TITLE 1033 "Integration and runtime data"
LangString INSTALL_INTEGRATION_TITLE 2052 "集成与运行数据"
LangString INSTALL_INTEGRATION_DESC 1033 "Choose how Versora works with TortoiseSVN and where managed cache data is stored."
LangString INSTALL_INTEGRATION_DESC 2052 "选择 Versora 与 TortoiseSVN 的协作方式及受控缓存位置。"
LangString INSTALL_OPTIONS_INSTALL_DIR 1033 "Install location"
LangString INSTALL_OPTIONS_INSTALL_DIR 2052 "安装位置"
LangString INSTALL_OPTIONS_INSTALL_HELP 1033 "Choose a parent folder or the final app folder; Versora is added automatically when needed."
LangString INSTALL_OPTIONS_INSTALL_HELP 2052 "可选择父级文件夹或最终安装目录；需要时会自动追加 Versora。"
LangString INSTALL_OPTIONS_INSTALL_BROWSE 1033 "Browse..."
LangString INSTALL_OPTIONS_INSTALL_BROWSE 2052 "浏览..."
LangString INSTALL_OPTIONS_INSTALL_BROWSE_TITLE 1033 "Select where Versora should be installed"
LangString INSTALL_OPTIONS_INSTALL_BROWSE_TITLE 2052 "选择 Versora 的安装位置"
LangString INSTALL_OPTIONS_INSTALL_REQUIRED 1033 "Please choose an install location."
LangString INSTALL_OPTIONS_INSTALL_REQUIRED 2052 "请选择安装位置。"
LangString INSTALL_OPTIONS_SHORTCUTS 1033 "Shortcuts"
LangString INSTALL_OPTIONS_SHORTCUTS 2052 "快捷方式"
LangString INSTALL_OPTIONS_DIFF_GROUP 1033 "TortoiseSVN Diff Viewer integration"
LangString INSTALL_OPTIONS_DIFF_GROUP 2052 "TortoiseSVN Diff Viewer 接入"
LangString INSTALL_OPTIONS_DIFF_KEEP 1033 "Keep the current TortoiseSVN Diff Viewer configuration"
LangString INSTALL_OPTIONS_DIFF_KEEP 2052 "保持当前 TortoiseSVN Diff Viewer 配置"
LangString INSTALL_OPTIONS_DIFF_TEXT 1033 "Use Versora only for text diffs"
LangString INSTALL_OPTIONS_DIFF_TEXT 2052 "仅让文本差异使用 Versora"
LangString INSTALL_OPTIONS_DIFF_WORKBOOK 1033 "Use Versora only for workbook diffs"
LangString INSTALL_OPTIONS_DIFF_WORKBOOK 2052 "仅让工作簿 / 表格差异使用 Versora"
LangString INSTALL_OPTIONS_DIFF_ALL 1033 "Use Versora for all file diffs"
LangString INSTALL_OPTIONS_DIFF_ALL 2052 "让全部文件差异使用 Versora"
LangString INSTALL_OPTIONS_CACHE_GROUP 1033 "Runtime data"
LangString INSTALL_OPTIONS_CACHE_GROUP 2052 "运行数据"
LangString INSTALL_OPTIONS_CACHE_PARENT 1033 "Parent folder for managed session/cache data"
LangString INSTALL_OPTIONS_CACHE_PARENT 2052 "受控会话 / 缓存目录的父级文件夹"
LangString INSTALL_OPTIONS_CACHE_HELP 1033 "The actual cache folder will be <selected folder>\Versora\Cache."
LangString INSTALL_OPTIONS_CACHE_HELP 2052 "实际缓存目录为：<所选文件夹>\Versora\Cache。"
LangString INSTALL_OPTIONS_CACHE_BROWSE 1033 "Browse..."
LangString INSTALL_OPTIONS_CACHE_BROWSE 2052 "浏览..."
LangString INSTALL_OPTIONS_CACHE_BROWSE_TITLE 1033 "Select the parent folder for Versora managed cache data"
LangString INSTALL_OPTIONS_CACHE_BROWSE_TITLE 2052 "选择 Versora 受控缓存目录的父级文件夹"
LangString INSTALL_OPTIONS_CACHE_REQUIRED 1033 "Please choose a parent folder for Versora managed cache data."
LangString INSTALL_OPTIONS_CACHE_REQUIRED 2052 "请选择 Versora 受控缓存目录的父级文件夹。"
LangString INSTALL_OPTIONS_DESKTOP_SHORTCUT 1033 "Create a desktop shortcut"
LangString INSTALL_OPTIONS_DESKTOP_SHORTCUT 2052 "创建桌面快捷方式"

Function InstallerAlignHeaderTitle
  System::Store "S"
  GetDlgItem $R9 $HWNDPARENT 1037
  GetDlgItem $R8 $HWNDPARENT 1038

  ${If} $R9 != 0
  ${AndIf} $R8 != 0
    System::Call 'USER32::GetWindowRect(p$R8,@r0)i.r1'
    ${If} $1 != 0
      System::Call 'USER32::MapWindowPoints(p0,p$HWNDPARENT,pr0,i2)'
      System::Call '*$0(i.r2,i.r3,i.r4,i.r5)'
      IntOp $R7 $4 - $2

      System::Call 'USER32::GetWindowRect(p$R9,@r0)i.r1'
      ${If} $1 != 0
        System::Call 'USER32::MapWindowPoints(p0,p$HWNDPARENT,pr0,i2)'
        System::Call '*$0(i.r4,i.r3,i.r5,i.r6)'
        IntOp $R6 $6 - $3
        System::Call 'USER32::SetWindowPos(p$R9,p0,ir2,ir3,i$R7,i$R6,i0x14)'
      ${EndIf}
    ${EndIf}
  ${EndIf}
  System::Store "L"
FunctionEnd

Function InstallerLayoutFooterButtons
  System::Store "S"
  GetDlgItem $R9 $HWNDPARENT 2
  ${If} $R9 == 0
    Goto footer_done
  ${EndIf}

  System::Call 'USER32::GetWindowRect(p$R9,@r0)i.r1'
  ${If} $1 == 0
    Goto footer_done
  ${EndIf}
  System::Call 'USER32::MapWindowPoints(p0,p$HWNDPARENT,pr0,i2)'
  System::Call '*$0(i.r1,i.r2,i.r3,i.r4)'
  IntOp $R8 $3 - $1
  IntOp $R8 $R8 + 20
  IntOp $R7 $4 - $2
  IntOp $R6 $2 + $InstallerHeightDelta

  System::Call 'USER32::GetClientRect(p$HWNDPARENT,@r0)i.r1'
  ${If} $1 == 0
    Goto footer_done
  ${EndIf}
  System::Call '*$0(i.r1,i.r2,i.r3,i.r4)'
  IntOp $R5 $3 - $R8
  IntOp $R5 $R5 - 16
  IntOp $R4 $R5 - $R8
  IntOp $R4 $R4 - 12
  IntOp $R3 $R4 - $R8
  IntOp $R3 $R3 - 12

  GetDlgItem $0 $HWNDPARENT 2
  System::Call 'USER32::SetWindowPos(p$0,p0,i$R5,i$R6,i$R8,i$R7,i0x14)'
  GetDlgItem $0 $HWNDPARENT 1
  System::Call 'USER32::SetWindowPos(p$0,p0,i$R4,i$R6,i$R8,i$R7,i0x14)'
  GetDlgItem $0 $HWNDPARENT 3
  System::Call 'USER32::SetWindowPos(p$0,p0,i$R3,i$R6,i$R8,i$R7,i0x14)'

  footer_done:
  System::Store "L"
FunctionEnd

Function InstallerGuiInit
  InitPluginsDir
  File /oname=$PLUGINSDIR\installerPanel.bmp "${BUILD_RESOURCES_DIR}\installerPanel.bmp"

  CreateFont $InstallerFontDisplay "Microsoft YaHei UI" "11" "700"
  CreateFont $InstallerFontSection "Microsoft YaHei UI" "10" "700"
  CreateFont $InstallerFontBody "Microsoft YaHei UI" "9" "400"
  CreateFont $InstallerFontMono "Consolas" "9" "400"
  CreateFont $InstallerFontStrong "Microsoft YaHei UI" "9" "700"
  CreateFont $InstallerFontSmallStrong "Microsoft YaHei UI" "8" "600"

  System::Store "S"
  System::Call 'USER32::GetWindowRect(p$HWNDPARENT,@r0)i.r1'
  ${If} $1 != 0
    System::Call '*$0(i.r1,i.r2,i.r3,i.r4)'
    IntOp $5 $3 - $1
    IntOp $6 $4 - $2
    StrCpy $InstallerOriginalWidth $5
    StrCpy $InstallerOriginalHeight $6

    IntOp $7 $5 * 500
    IntOp $7 $7 / 331
    IntOp $8 $6 * 315
    IntOp $8 $8 / 222

    System::Call 'USER32::SystemParametersInfo(i0x30,i0,@r9,i0)i.r0'
    ${If} $0 != 0
      System::Call '*$9(i.r1,i.r2,i.r3,i.r4)'
      IntOp $5 $3 - $1
      IntOp $6 $4 - $2
      IntOp $5 $5 - 40
      IntOp $6 $6 - 40
      ${If} $7 > $5
        StrCpy $7 $5
      ${EndIf}
      ${If} $8 > $6
        StrCpy $8 $6
      ${EndIf}
      IntOp $5 $3 - $1
      IntOp $5 $5 - $7
      IntOp $5 $5 / 2
      IntOp $5 $5 + $1
      IntOp $6 $4 - $2
      IntOp $6 $6 - $8
      IntOp $6 $6 / 2
      IntOp $6 $6 + $2
    ${Else}
      StrCpy $5 $1
      StrCpy $6 $2
    ${EndIf}

    IntOp $InstallerWidthDelta $7 - $InstallerOriginalWidth
    IntOp $InstallerHeightDelta $8 - $InstallerOriginalHeight
    System::Call 'USER32::SetWindowPos(p$HWNDPARENT,p0,ir5,ir6,ir7,ir8,i0x14)'
  ${EndIf}
  System::Store "L"

  GetDlgItem $0 $HWNDPARENT 1034
  !insertmacro MoveResizeInstallerControl $0 $HWNDPARENT 0 0 $InstallerWidthDelta 0
  !insertmacro StyleInstallerControl $0 $InstallerFontStrong "${COLOR_TEXT}" "${COLOR_PANEL}"
  GetDlgItem $0 $HWNDPARENT 1036
  !insertmacro MoveResizeInstallerControl $0 $HWNDPARENT 0 0 $InstallerWidthDelta 0
  SetCtlColors $0 "" "${COLOR_PANEL_ALT}"
  GetDlgItem $0 $HWNDPARENT 1037
  !insertmacro MoveResizeInstallerControl $0 $HWNDPARENT 0 -2 $InstallerWidthDelta 8
  !insertmacro StyleInstallerControl $0 $InstallerFontDisplay "${COLOR_TEXT}" "${COLOR_PANEL}"
  GetDlgItem $0 $HWNDPARENT 1038
  !insertmacro MoveResizeInstallerControl $0 $HWNDPARENT 0 7 $InstallerWidthDelta 2
  !insertmacro StyleInstallerControl $0 $InstallerFontBody "${COLOR_MUTED}" "${COLOR_PANEL}"

  GetDlgItem $0 $HWNDPARENT 1039
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 1046
  ShowWindow $0 0

  GetDlgItem $0 $HWNDPARENT 1018
  !insertmacro MoveResizeInstallerControl $0 $HWNDPARENT 0 0 $InstallerWidthDelta $InstallerHeightDelta
  GetDlgItem $0 $HWNDPARENT 1044
  !insertmacro MoveResizeInstallerControl $0 $HWNDPARENT 0 0 $InstallerWidthDelta $InstallerHeightDelta

  GetDlgItem $0 $HWNDPARENT 1028
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 1256
  ShowWindow $0 0
  GetDlgItem $0 $HWNDPARENT 1035
  !insertmacro MoveResizeInstallerControl $0 $HWNDPARENT 0 $InstallerHeightDelta $InstallerWidthDelta 0
  SetCtlColors $0 "" "${COLOR_PANEL}"
  GetDlgItem $0 $HWNDPARENT 1045
  !insertmacro MoveResizeInstallerControl $0 $HWNDPARENT 0 $InstallerHeightDelta $InstallerWidthDelta 0
  SetCtlColors $0 "" "${COLOR_PANEL_ALT}"

  GetDlgItem $0 $HWNDPARENT 1
  SendMessage $0 ${WM_SETFONT} $InstallerFontStrong 1
  SetCtlColors $0 "${COLOR_ACCENT_STRONG}" "${COLOR_PANEL}"
  GetDlgItem $0 $HWNDPARENT 2
  SendMessage $0 ${WM_SETFONT} $InstallerFontStrong 1
  SetCtlColors $0 "${COLOR_TEXT}" "${COLOR_PANEL}"
  GetDlgItem $0 $HWNDPARENT 3
  SendMessage $0 ${WM_SETFONT} $InstallerFontStrong 1
  SetCtlColors $0 "${COLOR_TEXT}" "${COLOR_PANEL}"
  Call InstallerLayoutFooterButtons

  Call InstallerAlignHeaderTitle
  SetAutoClose true
FunctionEnd

Function InstallerRefreshUpgradeSummary
  ${NSD_KillTimer} InstallerRefreshUpgradeSummary
  ${If} $InstallerUpgradePreserveLabel != 0
    SendMessage $InstallerUpgradePreserveLabel ${WM_SETTEXT} 0 "STR:$(INSTALL_UPGRADE_PRESERVE_LABEL)"
    System::Call 'USER32::RedrawWindow(p$InstallerUpgradePreserveLabel,p0,p0,i0x185)'
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

Function ResolveExistingInstallDir
  StrCpy $ExistingInstallDir ""
  StrCpy $ExistingVersion ""

  ReadRegStr $ExistingInstallDir SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${If} $ExistingInstallDir == ""
    ReadRegStr $ExistingInstallDir HKCU "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}
  ${If} $ExistingInstallDir == ""
    ReadRegStr $ExistingInstallDir HKLM "${INSTALL_REGISTRY_KEY}" InstallLocation
  ${EndIf}

  ReadRegStr $ExistingVersion SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
  ${If} $ExistingVersion == ""
    ReadRegStr $ExistingVersion HKCU "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
  ${EndIf}
  ${If} $ExistingVersion == ""
    ReadRegStr $ExistingVersion HKLM "${UNINSTALL_REGISTRY_KEY}" DisplayVersion
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
  FileWrite $0 "cacheRoot=$SelectedCacheParent\Versora\Cache$\r$\n"
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
  ${AndIf} $IsInAppUpdate == "1"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  SetCtlColors $0 "${COLOR_TEXT}" "${COLOR_BG}"

  ${If} $IsUpgradeInstall == "1"
    !insertmacro CreateInstallerBrandRail "01 / 01" "$(INSTALL_STEP_UPDATE)"

    ${If} $ExistingVersion == ""
      StrCpy $ExistingVersion "$(INSTALL_UPGRADE_UNKNOWN_VERSION)"
    ${EndIf}

    ${If} $ExistingVersion == "${VERSION}"
      !insertmacro SetInstallerHeader "$(INSTALL_REPAIR_TITLE)" "$(INSTALL_REPAIR_SUBTITLE)"
      GetDlgItem $1 $HWNDPARENT 1
      SendMessage $1 ${WM_SETTEXT} 0 "STR:$(INSTALL_REPAIR_ACTION)"
    ${Else}
      !insertmacro SetInstallerHeader "$(INSTALL_UPGRADE_TITLE)" "$(INSTALL_UPGRADE_SUBTITLE)"
      GetDlgItem $1 $HWNDPARENT 1
      SendMessage $1 ${WM_SETTEXT} 0 "STR:$(INSTALL_UPGRADE_ACTION)"
    ${EndIf}

    ${NSD_CreateLabel} 32% 2u 68% 30u "$(INSTALL_UPGRADE_DESC)"
    Pop $1
    !insertmacro StyleInstallerControl $1 $InstallerFontBody "${COLOR_MUTED}" "${COLOR_BG}"

    !insertmacro CreateInstallerCard 32% 42u 68% 156u "${COLOR_ACCENT}"

    ${NSD_CreateLabel} 36% 56u 60% 16u "$(INSTALL_UPGRADE_SUMMARY_TITLE)"
    Pop $1
    SendMessage $1 ${WM_SETFONT} $InstallerFontSection 1
    SetCtlColors $1 "${COLOR_TEXT}" "${COLOR_PANEL}"

    ${NSD_CreateLabel} 36% 84u 14% 16u "$(INSTALL_UPGRADE_CURRENT_LABEL)"
    Pop $1
    SendMessage $1 ${WM_SETFONT} $InstallerFontStrong 1
    SetCtlColors $1 "${COLOR_MUTED}" "${COLOR_PANEL}"
    ${NSD_CreateLabel} 52% 84u 44% 16u "$ExistingVersion"
    Pop $1
    !insertmacro StyleInstallerControl $1 $InstallerFontMono "${COLOR_TEXT}" "${COLOR_PANEL}"

    ${NSD_CreateLabel} 36% 108u 14% 16u "$(INSTALL_UPGRADE_TARGET_LABEL)"
    Pop $1
    SendMessage $1 ${WM_SETFONT} $InstallerFontStrong 1
    SetCtlColors $1 "${COLOR_MUTED}" "${COLOR_PANEL}"
    ${NSD_CreateLabel} 52% 108u 44% 16u "${VERSION}"
    Pop $1
    !insertmacro StyleInstallerControl $1 $InstallerFontMono "${COLOR_ACCENT_STRONG}" "${COLOR_PANEL}"

    ${NSD_CreateLabel} 36% 132u 14% 18u "$(INSTALL_UPGRADE_LOCATION_LABEL)"
    Pop $1
    SendMessage $1 ${WM_SETFONT} $InstallerFontStrong 1
    SetCtlColors $1 "${COLOR_MUTED}" "${COLOR_PANEL}"
    ${NSD_CreateLabel} 52% 132u 44% 18u "$INSTDIR"
    Pop $1
    ${NSD_AddStyle} $1 ${SS_PATHELLIPSIS}
    !insertmacro StyleInstallerControl $1 $InstallerFontMono "${COLOR_TEXT}" "${COLOR_PANEL}"

    ${NSD_CreateLabel} 36% 158u 60% 1u ""
    Pop $1
    SetCtlColors $1 "" "${COLOR_PANEL_ALT}"

    ${NSD_CreateLabel} 36% 170u 14% 24u "$(INSTALL_UPGRADE_PRESERVE_LABEL)"
    Pop $InstallerUpgradePreserveLabel
    SendMessage $InstallerUpgradePreserveLabel ${WM_SETFONT} $InstallerFontStrong 1
    SetCtlColors $InstallerUpgradePreserveLabel "${COLOR_MUTED}" "${COLOR_PANEL}"
    ${NSD_CreateLabel} 52% 170u 44% 26u "$(INSTALL_UPGRADE_PRESERVE_VALUE)"
    Pop $1
    !insertmacro StyleInstallerControl $1 $InstallerFontBody "${COLOR_TEXT}" "${COLOR_PANEL}"
    ${NSD_CreateTimer} InstallerRefreshUpgradeSummary 10
  ${Else}
    !insertmacro SetInstallerHeader "$(INSTALL_WELCOME_TITLE)" "$(INSTALL_WELCOME_BADGE)"
    !insertmacro CreateInstallerBrandRail "01 / 03" "$(INSTALL_STEP_OVERVIEW)"

    ${NSD_CreateLabel} 32% 2u 68% 20u "$(INSTALL_WELCOME_CARD_TITLE)"
    Pop $1
    SendMessage $1 ${WM_SETFONT} $InstallerFontSection 1
    SetCtlColors $1 "${COLOR_TEXT}" "${COLOR_BG}"

    ${NSD_CreateLabel} 32% 28u 68% 24u "$(INSTALL_WELCOME_DESC)"
    Pop $1
    !insertmacro StyleInstallerControl $1 $InstallerFontBody "${COLOR_MUTED}" "${COLOR_BG}"

    !insertmacro CreateInstallerCard 32% 62u 68% 116u "${COLOR_ACCENT}"

    ${NSD_CreateLabel} 36% 76u 60% 16u "$(INSTALL_WELCOME_FEATURES_TITLE)"
    Pop $1
    SendMessage $1 ${WM_SETFONT} $InstallerFontStrong 1
    SetCtlColors $1 "${COLOR_TEXT}" "${COLOR_PANEL}"

    ${NSD_CreateLabel} 36% 102u 7% 16u "01"
    Pop $1
    SendMessage $1 ${WM_SETFONT} $InstallerFontSmallStrong 1
    SetCtlColors $1 "${COLOR_ACCENT_STRONG}" "${COLOR_PANEL}"
    ${NSD_CreateLabel} 44% 100u 52% 20u "$(INSTALL_WELCOME_POINT1)"
    Pop $1
    !insertmacro StyleInstallerControl $1 $InstallerFontBody "${COLOR_TEXT}" "${COLOR_PANEL}"

    ${NSD_CreateLabel} 36% 130u 7% 16u "02"
    Pop $1
    SendMessage $1 ${WM_SETFONT} $InstallerFontSmallStrong 1
    SetCtlColors $1 "${COLOR_SUCCESS}" "${COLOR_PANEL}"
    ${NSD_CreateLabel} 44% 128u 52% 20u "$(INSTALL_WELCOME_POINT2)"
    Pop $1
    !insertmacro StyleInstallerControl $1 $InstallerFontBody "${COLOR_TEXT}" "${COLOR_PANEL}"

    ${NSD_CreateLabel} 36% 158u 7% 16u "03"
    Pop $1
    SendMessage $1 ${WM_SETFONT} $InstallerFontSmallStrong 1
    SetCtlColors $1 "${COLOR_ACCENT_STRONG}" "${COLOR_PANEL}"
    ${NSD_CreateLabel} 44% 156u 52% 20u "$(INSTALL_WELCOME_POINT3)"
    Pop $1
    !insertmacro StyleInstallerControl $1 $InstallerFontBody "${COLOR_TEXT}" "${COLOR_PANEL}"

    ${NSD_CreateLabel} 32% 190u 68% 18u "$(INSTALL_WELCOME_HINT)"
    Pop $1
    !insertmacro StyleInstallerControl $1 $InstallerFontBody "${COLOR_MUTED}" "${COLOR_BG}"
  ${EndIf}

  nsDialogs::Show
FunctionEnd

Function InstallerLocationPageCreate
  ${If} $IsUpgradeInstall == "1"
    Abort
  ${EndIf}

  Call NormalizeSelectedInstallDir

  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  SetCtlColors $0 "${COLOR_TEXT}" "${COLOR_BG}"
  !insertmacro SetInstallerHeader "$(INSTALL_OPTIONS_TITLE)" "$(INSTALL_OPTIONS_DESC)"
  !insertmacro CreateInstallerBrandRail "02 / 03" "$(INSTALL_STEP_LOCATION)"

  !insertmacro CreateInstallerCard 32% 4u 68% 112u "${COLOR_ACCENT}"

  ${NSD_CreateLabel} 36% 20u 60% 16u "$(INSTALL_OPTIONS_INSTALL_DIR)"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $InstallerFontSection 1
  SetCtlColors $0 "${COLOR_TEXT}" "${COLOR_PANEL}"

  ${NSD_CreateText} 36% 46u 46% 20u "$INSTDIR"
  Pop $InstallOptionsInstallDirText
  !insertmacro StyleInstallerControl $InstallOptionsInstallDirText $InstallerFontMono "${COLOR_TEXT}" "${COLOR_PANEL}"
  !insertmacro ShowInstallerInteractiveControl $InstallOptionsInstallDirText
  ${NSD_CreateButton} 84% 45u 12% 22u "$(INSTALL_OPTIONS_INSTALL_BROWSE)"
  Pop $InstallOptionsInstallBrowseButton
  SendMessage $InstallOptionsInstallBrowseButton ${WM_SETFONT} $InstallerFontSmallStrong 1
  ${NSD_OnClick} $InstallOptionsInstallBrowseButton InstallerOptionsBrowseInstallDir
  !insertmacro ShowInstallerInteractiveControl $InstallOptionsInstallBrowseButton
  ${NSD_CreateLabel} 36% 78u 60% 26u "$(INSTALL_OPTIONS_INSTALL_HELP)"
  Pop $0
  !insertmacro StyleInstallerControl $0 $InstallerFontBody "${COLOR_MUTED}" "${COLOR_PANEL}"

  !insertmacro CreateInstallerCard 32% 132u 68% 68u "${COLOR_SUCCESS}"

  ${NSD_CreateLabel} 36% 148u 60% 16u "$(INSTALL_OPTIONS_SHORTCUTS)"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $InstallerFontSection 1
  SetCtlColors $0 "${COLOR_TEXT}" "${COLOR_PANEL}"

  ${NSD_CreateCheckbox} 36% 176u 60% 18u "$(INSTALL_OPTIONS_DESKTOP_SHORTCUT)"
  Pop $InstallOptionsDesktopShortcutCheckbox
  !insertmacro StyleInstallerControl $InstallOptionsDesktopShortcutCheckbox $InstallerFontBody "${COLOR_TEXT}" "${COLOR_PANEL}"
  ${If} $ShouldCreateDesktopShortcut == "0"
    ${NSD_SetState} $InstallOptionsDesktopShortcutCheckbox ${BST_UNCHECKED}
  ${Else}
    ${NSD_SetState} $InstallOptionsDesktopShortcutCheckbox ${BST_CHECKED}
  ${EndIf}
  !insertmacro ShowInstallerInteractiveControl $InstallOptionsDesktopShortcutCheckbox

  nsDialogs::Show
FunctionEnd

Function InstallerLocationPageLeave
  ${NSD_GetText} $InstallOptionsInstallDirText $INSTDIR
  ${If} $INSTDIR == ""
    MessageBox MB_ICONEXCLAMATION|MB_OK "$(INSTALL_OPTIONS_INSTALL_REQUIRED)"
    Abort
  ${EndIf}
  Call NormalizeSelectedInstallDir

  ${NSD_GetState} $InstallOptionsDesktopShortcutCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    StrCpy $ShouldCreateDesktopShortcut "1"
  ${Else}
    StrCpy $ShouldCreateDesktopShortcut "0"
  ${EndIf}
FunctionEnd

Function InstallerIntegrationPageCreate
  ${If} $IsUpgradeInstall == "1"
    Abort
  ${EndIf}

  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  SetCtlColors $0 "${COLOR_TEXT}" "${COLOR_BG}"
  !insertmacro SetInstallerHeader "$(INSTALL_INTEGRATION_TITLE)" "$(INSTALL_INTEGRATION_DESC)"
  !insertmacro CreateInstallerBrandRail "03 / 03" "$(INSTALL_STEP_INTEGRATION)"

  !insertmacro CreateInstallerCard 32% 4u 68% 118u "${COLOR_ACCENT}"

  ${NSD_CreateLabel} 36% 16u 60% 16u "$(INSTALL_OPTIONS_DIFF_GROUP)"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $InstallerFontSection 1
  SetCtlColors $0 "${COLOR_TEXT}" "${COLOR_PANEL}"

  ${NSD_CreateRadioButton} 36% 40u 60% 17u "$(INSTALL_OPTIONS_DIFF_KEEP)"
  Pop $InstallOptionsDiffKeepRadio
  ${NSD_CreateRadioButton} 36% 59u 60% 17u "$(INSTALL_OPTIONS_DIFF_TEXT)"
  Pop $InstallOptionsDiffTextRadio
  ${NSD_CreateRadioButton} 36% 78u 60% 17u "$(INSTALL_OPTIONS_DIFF_WORKBOOK)"
  Pop $InstallOptionsDiffWorkbookRadio
  ${NSD_CreateRadioButton} 36% 97u 60% 17u "$(INSTALL_OPTIONS_DIFF_ALL)"
  Pop $InstallOptionsDiffAllRadio
  SetCtlColors $InstallOptionsDiffKeepRadio "${COLOR_TEXT}" "${COLOR_PANEL}"
  SetCtlColors $InstallOptionsDiffTextRadio "${COLOR_TEXT}" "${COLOR_PANEL}"
  SetCtlColors $InstallOptionsDiffWorkbookRadio "${COLOR_TEXT}" "${COLOR_PANEL}"
  SetCtlColors $InstallOptionsDiffAllRadio "${COLOR_TEXT}" "${COLOR_PANEL}"
  SendMessage $InstallOptionsDiffKeepRadio ${WM_SETFONT} $InstallerFontBody 1
  SendMessage $InstallOptionsDiffTextRadio ${WM_SETFONT} $InstallerFontBody 1
  SendMessage $InstallOptionsDiffWorkbookRadio ${WM_SETFONT} $InstallerFontBody 1
  SendMessage $InstallOptionsDiffAllRadio ${WM_SETFONT} $InstallerFontBody 1

  ${If} $SelectedDiffViewerMode == "text-only"
    ${NSD_SetState} $InstallOptionsDiffTextRadio ${BST_CHECKED}
  ${ElseIf} $SelectedDiffViewerMode == "workbook-only"
    ${NSD_SetState} $InstallOptionsDiffWorkbookRadio ${BST_CHECKED}
  ${ElseIf} $SelectedDiffViewerMode == "all-files"
    ${NSD_SetState} $InstallOptionsDiffAllRadio ${BST_CHECKED}
  ${Else}
    ${NSD_SetState} $InstallOptionsDiffKeepRadio ${BST_CHECKED}
  ${EndIf}
  !insertmacro ShowInstallerInteractiveControl $InstallOptionsDiffKeepRadio
  !insertmacro ShowInstallerInteractiveControl $InstallOptionsDiffTextRadio
  !insertmacro ShowInstallerInteractiveControl $InstallOptionsDiffWorkbookRadio
  !insertmacro ShowInstallerInteractiveControl $InstallOptionsDiffAllRadio

  !insertmacro CreateInstallerCard 32% 138u 68% 92u "${COLOR_SUCCESS}"

  ${NSD_CreateLabel} 36% 150u 60% 16u "$(INSTALL_OPTIONS_CACHE_GROUP)"
  Pop $0
  SendMessage $0 ${WM_SETFONT} $InstallerFontSection 1
  SetCtlColors $0 "${COLOR_TEXT}" "${COLOR_PANEL}"
  ${NSD_CreateLabel} 36% 174u 60% 14u "$(INSTALL_OPTIONS_CACHE_PARENT)"
  Pop $0
  !insertmacro StyleInstallerControl $0 $InstallerFontBody "${COLOR_MUTED}" "${COLOR_PANEL}"
  ${NSD_CreateText} 36% 192u 46% 20u "$SelectedCacheParent"
  Pop $InstallOptionsCacheParentText
  !insertmacro StyleInstallerControl $InstallOptionsCacheParentText $InstallerFontMono "${COLOR_TEXT}" "${COLOR_PANEL}"
  !insertmacro ShowInstallerInteractiveControl $InstallOptionsCacheParentText
  ${NSD_CreateButton} 84% 191u 12% 22u "$(INSTALL_OPTIONS_CACHE_BROWSE)"
  Pop $InstallOptionsCacheBrowseButton
  SendMessage $InstallOptionsCacheBrowseButton ${WM_SETFONT} $InstallerFontSmallStrong 1
  ${NSD_OnClick} $InstallOptionsCacheBrowseButton InstallerOptionsBrowseCacheParent
  !insertmacro ShowInstallerInteractiveControl $InstallOptionsCacheBrowseButton
  ${NSD_CreateLabel} 36% 216u 60% 12u "$(INSTALL_OPTIONS_CACHE_HELP)"
  Pop $0
  !insertmacro StyleInstallerControl $0 $InstallerFontBody "${COLOR_MUTED}" "${COLOR_PANEL}"

  nsDialogs::Show
FunctionEnd

Function InstallerIntegrationPageLeave
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
FunctionEnd

Function InstallerProgressPageShow
  FindWindow $0 "#32770" "" $HWNDPARENT
  ${If} $0 == 0
    Return
  ${EndIf}

  System::Call 'USER32::GetClientRect(p$0,@r1)i.r2'
  ${If} $2 != 0
    System::Call '*$1(i,i,i.r2,i.r3)'
    IntOp $InstallerProgressOffset $3 / 2
    IntOp $InstallerProgressTextOffset $InstallerProgressOffset - 18
  ${Else}
    StrCpy $InstallerProgressOffset 0
    StrCpy $InstallerProgressTextOffset 0
  ${EndIf}

  !insertmacro MoveResizeInstallerControl $0 $HWNDPARENT 0 0 $InstallerWidthDelta $InstallerHeightDelta
  SetCtlColors $0 "${COLOR_TEXT}" "${COLOR_BG}"

  ${If} $IsUpgradeInstall == "1"
    !insertmacro SetInstallerHeader "$(INSTALL_PROGRESS_UPDATE_TITLE)" "$(INSTALL_PROGRESS_SUBTITLE)"
  ${Else}
    !insertmacro SetInstallerHeader "$(INSTALL_PROGRESS_INSTALL_TITLE)" "$(INSTALL_PROGRESS_SUBTITLE)"
  ${EndIf}

  GetDlgItem $1 $0 1006
  SendMessage $1 ${WM_SETTEXT} 0 "STR:$(INSTALL_PROGRESS_STATUS)"
  !insertmacro StyleInstallerControl $1 $InstallerFontBody "${COLOR_MUTED}" "${COLOR_BG}"
  !insertmacro MoveResizeInstallerControl $1 $0 0 $InstallerProgressTextOffset $InstallerWidthDelta 0

  GetDlgItem $1 $0 1004
  !insertmacro MoveResizeInstallerControl $1 $0 0 $InstallerProgressOffset $InstallerWidthDelta 0
  GetDlgItem $1 $0 1016
  !insertmacro MoveResizeInstallerControl $1 $0 0 0 $InstallerWidthDelta $InstallerHeightDelta
  GetDlgItem $1 $0 1027
  !insertmacro MoveResizeInstallerControl $1 $0 $InstallerWidthDelta $InstallerHeightDelta 0 0
FunctionEnd

Function InstallerFinishPageCreate
  nsDialogs::Create 1018
  Pop $0

  ${If} $0 == error
    Abort
  ${EndIf}

  SetCtlColors $0 "${COLOR_TEXT}" "${COLOR_BG}"
  !insertmacro SetInstallerHeader "$(INSTALL_FINISH_HEADER_TITLE)" "$(INSTALL_FINISH_TITLE)"
  !insertmacro CreateInstallerBrandRail "DONE" "$(INSTALL_STEP_COMPLETE)"

  GetDlgItem $1 $HWNDPARENT 1
  GetDlgItem $2 $HWNDPARENT 2
  !insertmacro CopyInstallerControlBounds $1 $2 $HWNDPARENT
  SendMessage $1 ${WM_SETTEXT} 0 "STR:$(INSTALL_FINISH_ACTION)"
  EnableWindow $1 1
  ${NSD_SetFocus} $1
  ShowWindow $2 0
  GetDlgItem $2 $HWNDPARENT 3
  ShowWindow $2 0

  !insertmacro CreateInstallerCard 32% 20u 68% 205u "${COLOR_SUCCESS}"

  ${NSD_CreateLabel} 36% 46u 60% 24u "$(INSTALL_FINISH_TITLE)"
  Pop $1
  SendMessage $1 ${WM_SETFONT} $InstallerFontDisplay 1
  SetCtlColors $1 "${COLOR_TEXT}" "${COLOR_PANEL}"

  ${NSD_CreateLabel} 36% 86u 60% 38u "$(INSTALL_FINISH_TEXT)"
  Pop $1
  !insertmacro StyleInstallerControl $1 $InstallerFontBody "${COLOR_MUTED}" "${COLOR_PANEL}"

  ${NSD_CreateLabel} 36% 140u 60% 1u ""
  Pop $1
  SetCtlColors $1 "" "${COLOR_PANEL_ALT}"

  ${NSD_CreateLabel} 36% 156u 60% 16u "$(INSTALL_FINISH_AFTER_TITLE)"
  Pop $1
  !insertmacro StyleInstallerControl $1 $InstallerFontStrong "${COLOR_MUTED}" "${COLOR_PANEL}"

  ${NSD_CreateCheckbox} 36% 182u 60% 22u "$(INSTALL_FINISH_RUN)"
  Pop $InstallerFinishRunCheckbox
  !insertmacro StyleInstallerControl $InstallerFinishRunCheckbox $InstallerFontBody "${COLOR_TEXT}" "${COLOR_PANEL}"
  ${NSD_SetState} $InstallerFinishRunCheckbox ${BST_UNCHECKED}
  EnableWindow $InstallerFinishRunCheckbox 1
  ShowWindow $InstallerFinishRunCheckbox ${SW_SHOW}
  System::Call 'USER32::SetWindowPos(p$InstallerFinishRunCheckbox,p0,i0,i0,i0,i0,i0x13)'

  nsDialogs::Show
FunctionEnd

Function InstallerFinishPageLeave
  ${NSD_GetState} $InstallerFinishRunCheckbox $0
  ${If} $0 == ${BST_CHECKED}
    Call StartApp
  ${EndIf}
FunctionEnd

!macro customCheckAppRunning
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  ${If} $3 != "${APP_EXECUTABLE_FILENAME}"
    !insertmacro IS_POWERSHELL_AVAILABLE
    StrCpy $R2 0

    !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
    ${If} $R0 != 0
      Goto versora_close_done
    ${EndIf}

      ${If} $R2 == 0
        ${If} $IsInAppUpdate == "1"
          StrCpy $R3 0
          versora_close_graceful_wait:
            Sleep 250
            !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
            ${If} $R0 != 0
              Goto versora_close_done
            ${EndIf}
            IntOp $R3 $R3 + 1
            ${If} $R3 < 16
              Goto versora_close_graceful_wait
            ${EndIf}
        ${Else}
          MessageBox MB_OKCANCEL|MB_ICONEXCLAMATION "$(INSTALL_CLOSE_PROMPT)" /SD IDCANCEL IDOK versora_close_request IDCANCEL versora_close_abort
        ${EndIf}
      ${EndIf}

    versora_close_request:
      DetailPrint "$(INSTALL_CLOSE_PROGRESS)"
      nsExec::Exec `"$CmdPath" /C taskkill /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "PID ne $pid" /FI "USERNAME eq %USERNAME%"`
      Pop $0
      !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 0
      Sleep 750

    versora_close_force:
      DetailPrint "$(INSTALL_CLOSE_PROGRESS)"
      !insertmacro KILL_PROCESS "${APP_EXECUTABLE_FILENAME}" 1
      nsExec::Exec `"$CmdPath" /C taskkill /F /T /IM "${APP_EXECUTABLE_FILENAME}" /FI "PID ne $pid" /FI "USERNAME eq %USERNAME%"`
      Pop $0

      StrCpy $R3 0
      versora_close_force_wait:
        Sleep 500
        !insertmacro FIND_PROCESS "${APP_EXECUTABLE_FILENAME}" $R0
        ${If} $R0 != 0
          Goto versora_close_done
        ${EndIf}
        IntOp $R3 $R3 + 1
        ${If} $R3 < 20
          Goto versora_close_force_wait
        ${EndIf}

      IntOp $R2 $R2 + 1
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(INSTALL_CLOSE_FAILED)" /SD IDCANCEL IDRETRY versora_close_force IDCANCEL versora_close_abort

    versora_close_abort:
      Quit

    versora_close_done:
  ${EndIf}
!macroend

!macro customInit
  StrCpy $ShouldCreateDesktopShortcut "1"
  StrCpy $IsInAppUpdate "0"
  ${GetParameters} $0
  ClearErrors
  ${GetOptions} $0 "--updated" $1
  ${IfNot} ${Errors}
    StrCpy $IsInAppUpdate "1"
  ${EndIf}
  Call CapturePreviousInstallerBootstrap
  ${If} $IsUpgradeInstall != "1"
    Call NormalizeSelectedInstallDir
  ${EndIf}
  Call EnsureSelectedInstallDefaults
  Call ApplyInstallerArgumentOverrides
!macroend

!macro customInstallMode
  ${If} $IsUpgradeInstall == "1"
    ${If} $hasPerMachineInstallation == "1"
    ${AndIf} $hasPerUserInstallation == "0"
      StrCpy $isForceMachineInstall "1"
    ${Else}
      StrCpy $isForceCurrentInstall "1"
    ${EndIf}
  ${EndIf}
!macroend

!macro customWelcomePage
  Page custom InstallerWelcomePageCreate
!macroend

!macro customPageAfterChangeDir
  Page custom InstallerLocationPageCreate InstallerLocationPageLeave
  Page custom InstallerIntegrationPageCreate InstallerIntegrationPageLeave
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW InstallerProgressPageShow
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
  maintenance_retry:
    SetDetailsPrint textonly
    DetailPrint "$(INSTALL_PROGRESS_FINALIZING)"
    ExecWait '"$INSTDIR\${APP_EXECUTABLE_FILENAME}" "--maintenance=post-install"' $0
    ${If} $0 != 0
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "$(INSTALL_MAINTENANCE_FAILED)" /SD IDCANCEL IDRETRY maintenance_retry
      SetDetailsPrint none
      SetErrorLevel 2
      Abort
    ${EndIf}
    SetDetailsPrint listonly
    DetailPrint "Post-install maintenance exit code: $0"
    SetDetailsPrint none
  done:
!macroend

!macro customFinishPage
  Function StartApp
    ${If} $IsUpgradeInstall == "1"
      StrCpy $1 "--updated"
    ${Else}
      StrCpy $1 ""
    ${EndIf}
    ${StdUtils.ExecShellAsUser} $0 "$launchLink" "open" "$1"
  FunctionEnd

  Page custom InstallerFinishPageCreate InstallerFinishPageLeave
!macroend

!else

Var ShouldDeletePersonalConfig
Var UninstallOptionsDeleteCheckbox

LangString UNINSTALL_OPTIONS_TITLE 1033 "Choose what to remove during uninstall."
LangString UNINSTALL_OPTIONS_TITLE 2052 "选择卸载时需要移除的内容。"
LangString UNINSTALL_OPTIONS_DELETE_PERSONAL 1033 "Delete Versora personal settings, cache, and backup data"
LangString UNINSTALL_OPTIONS_DELETE_PERSONAL 2052 "同时删除 Versora 个人配置、缓存和备份数据"

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
