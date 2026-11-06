# Installing YDCP on macOS

**Needs:** macOS 13 Ventura or newer, Apple Silicon or Intel (one universal download).

1. Download `YDCP_<version>_universal.dmg` from the [latest release](https://github.com/ryanlow1111/ydcp/releases/latest).
2. Optional but recommended: check the file. In Terminal, run the command below and compare the result with the line for this file in `SHA256SUMS-macos-universal.txt` on the release page:
   ```bash
   shasum -a 256 ~/Downloads/YDCP_*_universal.dmg
   ```
3. Open the `.dmg` and drag **YDCP** into **Applications**.
4. Open YDCP from Applications.

## "YDCP can't be opened" / "Apple could not verify…"

Early versions of YDCP aren't notarized by Apple yet (that needs a paid Apple developer account). macOS blocks the first open of apps like this. To allow it **once**:

1. Try to open YDCP and close the warning.
2. Open **System Settings → Privacy & Security**.
3. Scroll down to the message about YDCP and click **Open Anyway**, then confirm with your password or Touch ID.

**Or**, in Terminal:
```bash
xattr -dr com.apple.quarantine /Applications/YDCP.app
```

If macOS says the app **"is damaged"**, it's the same block, not real damage. Use the Terminal command above.

## Where is it?

YDCP has **no Dock icon**. Look for its icon in the **menu bar** (top right). If you have many menu bar icons, it may be hidden behind the notch. Quit some icons or use a menu bar manager.

## Next

Add your model: see [README → Add your model](../README.md#add-your-model).

## Uninstall

Quit YDCP, delete `/Applications/YDCP.app`, and delete `~/.ydcp/` if you also want to remove your models and settings.
