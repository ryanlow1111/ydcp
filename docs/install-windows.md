# Installing YDCP on Windows

**Needs:** Windows 10 or 11.

| Your PC | Download |
|---|---|
| Most PCs (Intel / AMD) | `YDCP_<version>_x64-setup.exe` (or the `.msi`) |
| Windows on ARM (Snapdragon laptops, Surface Pro X, Windows in Parallels/UTM on a Mac) | `YDCP_<version>_arm64-setup.exe` |

Not sure? **Settings → System → About → System type** shows "x64-based" or "ARM-based".

1. Download the file from the [latest release](https://github.com/ryanlow1111/ydcp/releases/latest).
2. Optional but recommended: check the file. In PowerShell, run the command below and compare with the matching `SHA256SUMS-windows-*.txt` on the release page:
   ```powershell
   Get-FileHash $HOME\Downloads\YDCP_*_x64-setup.exe
   ```
3. Run the installer. It installs **just for you**, with no admin rights needed.

## "Windows protected your PC"

Early versions of YDCP aren't code-signed yet, so Microsoft SmartScreen doesn't recognise them. Click **More info → Run anyway**.

If your antivirus blocks the installer, try the `.msi` instead, or report it to your antivirus as a false positive. The code and the build are public, so you can check exactly what's inside.

## WebView2

YDCP shows its window with Microsoft Edge **WebView2**. Windows 11 and up-to-date Windows 10 already have it. If yours doesn't, the installer downloads it once from Microsoft.

## Where is it?

YDCP has **no taskbar button**. Look for its icon in the **notification area** (bottom right, next to the clock). Click **^** if it's hidden, and drag it out to keep it visible.

## Next

Add your model: see [README → Add your model](../README.md#add-your-model).

## Uninstall

**Settings → Apps → Installed apps → YDCP → Uninstall**. Then delete `%USERPROFILE%\.ydcp\` if you also want to remove your models and settings.
