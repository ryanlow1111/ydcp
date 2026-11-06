# Security policy

## Supported versions

Only the latest release gets fixes. Please update before reporting.

## Reporting a problem

**Please don't open a public issue for security problems.** Report them privately:

- Use GitHub's **[Report a vulnerability](https://github.com/ryanlow1111/ydcp/security/advisories/new)** form (Security tab → Advisories), or
- Contact the maintainer privately through [GitHub](https://github.com/ryanlow1111).

Please include what you found, how to reproduce it, the YDCP version and OS, and the impact you think it has. You'll get a reply as soon as possible, usually within a week. Fixes are released for macOS and Windows together, and the reporter is credited unless they prefer not to be.

## What's in scope

- YDCP reading or writing files outside its own `~/.ydcp/` folder
- Any network access by the app
- A crafted `.vrm`, `.vrma`, `motions.json`, model profile or `state.json` that runs code, crashes the app in a harmful way, or escapes the folder
- Problems in the release pipeline or the published installers

## Verifying downloads

Every release includes `SHA256SUMS-*.txt` files. Once the repository is public, releases also carry GitHub build-provenance attestations, which you can check with `gh attestation verify <file> --repo ryanlow1111/ydcp`.
