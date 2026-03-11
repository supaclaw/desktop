# OpenClaw Desktop Wizard

A **Tauri 2** Windows desktop app that guides you through downloading, installing, configuring, and running [OpenClaw](https://github.com/supaclaw/openclaw) (e.g. [releases like v1.5.0](https://github.com/supaclaw/openclaw/releases/tag/v1.5.0)).

## What it does

- **Download** – Pick an OpenClaw version and Windows asset (e.g. `openclaw-v1.5.0-windows-x64-portable.zip` or `.exe`) and download it.
- **Install** – Extract or copy the build to a chosen directory (default: `%LOCALAPPDATA%\OpenClaw`).
- **Configure** – Review install path and optional PATH setup.
- **Run gateway** – Start the OpenClaw gateway from the install directory.
- **Install Skills & Tools (Coming soon)** – Not yet available in the wizard.

## Prerequisites

- [Node.js](https://nodejs.org/) (LTS)
- [Rust](https://rustup.rs/)
- [Windows SDK](https://developer.microsoft.com/en-us/windows/downloads/windows-sdk/) (for building on Windows)
- [Visual Studio Build Tools](https://visualstudio.microsoft.com/visual-cpp-build-tools/) or VS with “Desktop development with C++” (for Windows build)

## Development

From the project root:

```bash
npm install
npm run tauri dev
```

This starts the Vite dev server and opens the Tauri window.

## Build Windows desktop

```bash
npm run tauri build
```

Outputs:

- **NSIS installer**: `src-tauri/target/release/bundle/nsis/OpenClaw Desktop Wizard_1.0.0_x64-setup.exe`
- **MSI**: `src-tauri/target/release/bundle/msi/...`

If you change the app icon or see a stale/gray icon in the EXE or taskbar, clean old Rust/Tauri binaries before rebuilding:

```bash
cd src-tauri
cargo clean
cd ..
npm run tauri build
```

## Branding & icons

- **Desktop icon (Windows)**: generated from `src-tauri/icons/supaclaw.png` into `src-tauri/icons/icon.ico` via Tauri.
- To re-generate icons after changing the source image, run:

  ```bash
  npm run icon
  ```

  Then rebuild with `npm run tauri build` and reinstall the app.

## Project layout

- `src/` – React + Vite frontend (wizard UI).
- `src-tauri/` – Tauri 2 Rust app and commands (fetch releases, download, install, run gateway, open URL).
- `src-tauri/capabilities/` – Tauri capabilities (permissions for shell, http, fs, process).

## Tech stack

- [Tauri 2](https://v2.tauri.app/) – desktop shell and native APIs.
- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + TypeScript – wizard UI.
- GitHub API – list [supaclaw/openclaw](https://github.com/supaclaw/openclaw) releases and download assets.

## License

MIT (see repository root).
