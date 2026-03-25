# Build BandChat IPA From Windows

This project already contains an iOS Xcode app. The GitHub Actions workflow is at `.github/workflows/ios-ipa.yml`.

## 1. Put this folder in a GitHub repo

Run these commands in `C:\Users\nolan\Downloads\BandChat\src`:

```powershell
git init
git add .
git commit -m "Add iOS GitHub Actions build"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

## 2. Add GitHub repository secrets

Open your GitHub repo:

- `Settings` -> `Secrets and variables` -> `Actions` -> `New repository secret`

Create these secrets:

- `BUILD_CERTIFICATE_BASE64`
- `BUILD_CERTIFICATE_PASSWORD`
- `BUILD_PROVISION_PROFILE_BASE64`
- `KEYCHAIN_PASSWORD`

## 3. Convert your signing files to base64 on Windows

If you already have:

- a signing certificate `.p12`
- a provisioning profile `.mobileprovision`

encode them with PowerShell:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\ios_distribution.p12")) | Set-Clipboard
```

Paste that into `BUILD_CERTIFICATE_BASE64`.

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes("C:\path\to\BandChat.mobileprovision")) | Set-Clipboard
```

Paste that into `BUILD_PROVISION_PROFILE_BASE64`.

Set:

- `BUILD_CERTIFICATE_PASSWORD` = the password used when the `.p12` was exported
- `KEYCHAIN_PASSWORD` = any strong random password you choose for the temporary CI keychain

## 4. Run the workflow

In GitHub:

- `Actions` -> `Build iOS IPA` -> `Run workflow`

Recommended first run:

- `export_method`: `ad-hoc`
- `configuration`: `Release`

## 5. Download the IPA

When the workflow finishes:

- open the workflow run
- download the artifact named like `BandChat-ad-hoc-ipa`

## Notes

- The workflow uses:
  - workspace: `BandChat.xcworkspace`
  - scheme: `BandChat`
  - bundle id: `app.vercel.band-msg`
- If you change the bundle id in Xcode later, also update `.github/workflows/ios-ipa.yml`.
- If the build fails on signing, your provisioning profile and `.p12` do not match the same Apple team/certificate.
