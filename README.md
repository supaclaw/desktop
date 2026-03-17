# OpenClaw Desktop Wizard

A **Tauri 2** Windows desktop app that guides you through downloading, installing, configuring, and running [OpenClaw](https://github.com/supaclaw/openclaw) (e.g. [releases like v1.5.0](https://github.com/supaclaw/openclaw/releases/tag/v1.5.0)).

## What it does

- **Download** – Pick an OpenClaw version and Windows asset (the `.exe`) and download it.
- **Install** – Extract or copy the build to a chosen directory (default: `%LOCALAPPDATA%\OpenClaw`).
- **Configure** – Review install path and optional PATH setup.
- **Run gateway** – Start the OpenClaw gateway from the install directory.
- **Search Skills** – Search skills via the [SupaClaw Hub](https://github.com/supaclaw/hub) API (Hub at **http://localhost:3002**) or the ClawHub CLI (`clawhub search`, see `https://docs.openclaw.ai/tools/clawhub`) from within the wizard. For SupaClaw Hub, use the curl-based install commands shown in each skill card’s popup to download, unzip, and place skills into `~/.openclaw/workspace/skills` for the current OpenClaw workspace.

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

## SupaClaw Hub (local deployment)

The wizard’s “Search skills with SupaClaw Hub” step calls the Hub API (`GET /api/skills`) at **http://localhost:3002**. Run the hub locally so the wizard can search skills (see [supaclaw/hub](https://github.com/supaclaw/hub)):

**Quick start (Node):**

```bash
cd /path/to/supaclaw/hub
npm install
npm run init-db   # optional; server creates data/ and DB on first run
npm start
```

The hub serves at **http://localhost:3002** (browse and upload skills in a browser if desired).

**Docker:**

```bash
cd /path/to/supaclaw/hub
docker compose build
docker compose up -d
```

The hub runs on **http://localhost:3002**. Data is in the `hub-data` volume. Stop with `docker compose down`. Environment: `PORT` (default `3002`), `SQLITE_PATH` (default `data/hub.db`).

## Tech stack

- [Tauri 2](https://v2.tauri.app/) – desktop shell and native APIs.
- [Vite](https://vitejs.dev/) + [React](https://react.dev/) + TypeScript – wizard UI.
- GitHub API – list [supaclaw/openclaw](https://github.com/supaclaw/openclaw) releases and download assets.

## License

MIT (see repository root).
