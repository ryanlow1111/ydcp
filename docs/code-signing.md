# Code signing policy

**Status:** Windows releases so far are **not code-signed**. YDCP is applying for free code signing through SignPath Foundation. Once it is approved, Windows releases are signed as described below, and each release's notes say whether it is signed. macOS releases are not signed or notarized by Apple.

Free code signing provided by [SignPath.io](https://about.signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## What is signed

- Only files built from this repository's source code, by the [Release workflow](../.github/workflows/release.yml) on GitHub Actions. Nothing is signed on a personal computer.
- On Windows: the app (`ydcp.exe`) first, then the installers that contain it (`YDCP_<version>_x64-setup.exe`, `YDCP_<version>_x64_en-US.msi`, `YDCP_<version>_arm64-setup.exe`).
- Signed files name the publisher as **SignPath Foundation** and the product as **YDCP**.
- You can check any download against the `SHA256SUMS-*.txt` files on its release page.

## Team and roles

| Role | Who |
|---|---|
| Authors (committers) | [Ryan Low Jun Yen (@ryanlow1111)](https://github.com/ryanlow1111) |
| Reviewers | [Ryan Low Jun Yen (@ryanlow1111)](https://github.com/ryanlow1111) |
| Approvers (approve every signing request) | [Ryan Low Jun Yen (@ryanlow1111)](https://github.com/ryanlow1111) |

Changes from anyone else come in as pull requests and are reviewed before they are merged. Every team member uses multi-factor authentication on GitHub and SignPath.

## Privacy

This program will not transfer any information to other networked systems unless specifically requested by the user or the person installing or operating it.

In detail: YDCP has no account, no internet access, no analytics, no tracking and no automatic updates. Your models, motions, lines and settings stay in `~/.ydcp/` on your computer. The only network use is outside the app: if your Windows PC doesn't have Microsoft Edge WebView2 yet (Windows 11 and up-to-date Windows 10 do), the installer downloads it once from Microsoft, under [Microsoft's privacy statement](https://privacy.microsoft.com/privacystatement).

## Reporting a problem

If you think a signed file is malicious or was signed by mistake, please follow [SECURITY.md](../SECURITY.md).
