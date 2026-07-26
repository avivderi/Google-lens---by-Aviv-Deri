'use strict';

require('dotenv').config();

const {
    app,
    BrowserWindow,
    globalShortcut,
    Tray,
    Menu,
    ipcMain,
    nativeImage,
    screen,
    Notification,
    clipboard,
} = require('electron');

app.commandLine.appendSwitch('no-sandbox');
app.commandLine.appendSwitch('disable-gpu-sandbox');

const path = require('path');
const fs   = require('fs');
const os   = require('os');
const { exec } = require('child_process');
const StoreClass = require('electron-store').default || require('electron-store');

const { captureFullScreen, pingExtension, makeTempPath, listenForSignal } = require('./capture/screenshot');
const { cropByPath } = require('./crop/mask-crop');
const { openGoogleLensWithImage } = require('./lens/lens-uploader');
const { openTranslatePanel } = require('./translate/translate-opener');
const { extractText } = require('./ocr/ocr');

// ─── Persistent config ────────────────────────────────────────────────────────
const store = new StoreClass({
    defaults: {
        shortcut: process.env.CAPTURE_SHORTCUT || 'Super+Space',
    },
});

// ─── State ────────────────────────────────────────────────────────────────────
let tray              = null;
let overlayWin        = null;
let settingsWin       = null;
let lastSnapshotPath  = null;
let captureInProgress = false;
let lensCloseBrowser  = null; // holds the teardown fn for the current Chrome panel

// ─── App ready ────────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
    // Warm ping — show warning if extension missing, but don't block startup
    try {
        const ver = await pingExtension();
        console.log(`[main] GNOME extension OK: ${ver}`);
    } catch (e) {
        console.error(`[main] ⚠️  ${e.message}`);
    }

    // Warn if wmctrl absent (non-fatal)
    exec('which wmctrl', (err) => {
        if (err) {
            console.warn('[main] wmctrl missing');
        }
    });

    createTray();
    registerShortcut();
    if (store.get('autostart', true)) {
        enableAutostart();
    }
    installDesktopEntry();
    installChromeAppIcons();
    listenForSignal(startCapture);
});

function enableAutostart() {
    try {
        const autostartDir = path.join(os.homedir(), '.config', 'autostart');
        const desktopFile  = path.join(autostartDir, 'circle-ai.desktop');
        fs.mkdirSync(autostartDir, { recursive: true });
        const projectDir  = path.join(__dirname, '..');
        const electronCli = path.join(projectDir, 'node_modules', 'electron', 'cli.js');
        const content = `[Desktop Entry]
Type=Application
Name=Google Lens — Circle to Search
Exec="${process.execPath}" "${electronCli}" --no-sandbox "${projectDir}"
X-GNOME-Autostart-enabled=true
Icon=${path.join(projectDir, 'assets', 'tray-icon.png')}
Comment=Google Lens Circle to Search for Linux
`;
        fs.writeFileSync(desktopFile, content);
        console.log('[main] Autostart desktop file updated.');
    } catch (err) {
        console.error('[main] Autostart error:', err.message);
    }
}

// GNOME's dock/Alt-Tab looks up the running app's icon by matching its window's
// app-id (== app.getName(), "circle-ai" from package.json) against an installed
// .desktop file in ~/.local/share/applications — the autostart entry above is a
// different XDG directory and isn't used for this lookup, so without this the
// dock falls back to a generic icon.
function installDesktopEntry() {
    try {
        const appsDir     = path.join(os.homedir(), '.local', 'share', 'applications');
        const desktopFile = path.join(appsDir, 'circle-ai.desktop');
        fs.mkdirSync(appsDir, { recursive: true });
        const projectDir  = path.join(__dirname, '..');
        const electronCli = path.join(projectDir, 'node_modules', 'electron', 'cli.js');
        const content = `[Desktop Entry]
Type=Application
Name=Google Lens — Circle to Search
Exec="${process.execPath}" "${electronCli}" --no-sandbox "${projectDir}"
Icon=${path.join(projectDir, 'assets', 'tray-icon.png')}
Comment=Google Lens Circle to Search for Linux
StartupWMClass=circle-ai
Terminal=false
Categories=Utility;
NoDisplay=true
`;
        fs.writeFileSync(desktopFile, content);
        exec(`update-desktop-database "${appsDir}"`, () => {});
        console.log('[main] Application desktop entry installed.');
    } catch (err) {
        console.error('[main] Desktop entry error:', err.message);
    }
}

// Each site opened via `--app=URL` (Lens, Translate) is its own separate
// "application" to GNOME, with an app-id Chrome derives from the URL's host
// (e.g. chrome-lens.google.com__-Default) — completely unrelated to the
// circle-ai entry above. Without a matching .desktop file for each of these,
// their windows fall back to a generic icon too.
function installChromeAppIcons() {
    const chromeApps = [
        { appId: 'chrome-lens.google.com__-Default',      name: 'Google Lens' },
        { appId: 'chrome-translate.google.com__-Default', name: 'Google Translate' },
    ];
    try {
        const appsDir     = path.join(os.homedir(), '.local', 'share', 'applications');
        const iconPath    = path.join(__dirname, '..', 'assets', 'tray-icon.png');
        const userDataDir = path.join(os.homedir(), '.config', 'google-chrome-circle-ai');
        fs.mkdirSync(appsDir, { recursive: true });

        for (const { appId, name } of chromeApps) {
            const url = 'https://' + appId.replace(/^chrome-/, '').replace(/__-Default$/, '');
            const content = `[Desktop Entry]
Version=1.0
Type=Application
Name=${name}
Exec=/usr/bin/google-chrome --app=${url}/ --user-data-dir=${userDataDir}
Icon=${iconPath}
Comment=${name}
NoDisplay=true
StartupWMClass=${appId}
Categories=Network;
`;
            fs.writeFileSync(path.join(appsDir, `${appId}.desktop`), content);
        }
        exec(`update-desktop-database "${appsDir}"`, () => {});
        console.log('[main] Chrome app-window desktop entries installed.');
    } catch (err) {
        console.error('[main] Chrome app icon error:', err.message);
    }
}

app.on('window-all-closed', (e) => e.preventDefault());
app.on('will-quit', () => {
    globalShortcut.unregisterAll();
    if (lensCloseBrowser) lensCloseBrowser();
});

// ─── Tray ─────────────────────────────────────────────────────────────────────
function createTray() {
    const iconPath = path.join(__dirname, '..', 'assets', 'tray-icon.png');
    const icon = fs.existsSync(iconPath)
        ? nativeImage.createFromPath(iconPath)
        : nativeImage.createEmpty();

    tray = new Tray(icon);
    tray.setToolTip('Circle AI — Circle to Search');

    const shortcut = store.get('shortcut', 'Super+Space');
    const contextMenu = Menu.buildFromTemplate([
        { label: `🔍 סריקה וחיפוש (${shortcut})`, click: startCapture },
        { label: '⚙️ הגדרות', click: openSettingsWindow },
        { type: 'separator' },
        { label: 'יציאה', click: () => app.exit(0) },
    ]);

    tray.on('click',       () => startCapture());
    tray.on('right-click', () => tray.popUpContextMenu(contextMenu));
}

// ─── Settings Window ──────────────────────────────────────────────────────────
function openSettingsWindow() {
    if (settingsWin && !settingsWin.isDestroyed()) {
        settingsWin.focus();
        return;
    }

    settingsWin = new BrowserWindow({
        width: 680,
        height: 720,
        title: 'Circle AI — הגדרות',
        icon: path.join(__dirname, '..', 'assets', 'tray-icon.png'),
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true,
            preload: path.join(__dirname, 'settings', 'settings-preload.js'),
        },
    });

    settingsWin.loadFile(path.join(__dirname, 'settings', 'settings.html'));
    settingsWin.on('closed', () => { settingsWin = null; });
}

// ─── IPC Handlers for Settings ───────────────────────────────────────────────
ipcMain.handle('get-settings', () => {
    return store.store;
});

ipcMain.handle('save-settings', async (_event, newSettings) => {
    try {
        if (newSettings.shortcut) store.set('shortcut', newSettings.shortcut);
        if (typeof newSettings.autostart === 'boolean') {
            store.set('autostart', newSettings.autostart);
            if (newSettings.autostart) enableAutostart();
        }
        if (typeof newSettings.geminiApiKey === 'string') store.set('geminiApiKey', newSettings.geminiApiKey);
        if (typeof newSettings.anthropicApiKey === 'string') store.set('anthropicApiKey', newSettings.anthropicApiKey);
        if (newSettings.panelSize) store.set('panelSize', newSettings.panelSize);

        registerShortcut();
        if (tray) createTray();

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('check-gnome-extension', async () => {
    try {
        const ver = await pingExtension();
        return { success: true, version: ver };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('install-gnome-extension', async () => {
    return new Promise((resolve) => {
        const scriptPath = path.join(__dirname, '..', 'install-extension.sh');
        exec(`bash "${scriptPath}"`, (err, stdout, stderr) => {
            if (err) {
                resolve({ success: false, error: stderr || err.message });
            } else {
                resolve({ success: true, output: stdout });
            }
        });
    });
});

ipcMain.on('close-settings-window', () => {
    if (settingsWin && !settingsWin.isDestroyed()) {
        settingsWin.close();
    }
});

// ─── Global shortcut ──────────────────────────────────────────────────────────
function registerShortcut() {
    globalShortcut.unregisterAll();
    const shortcut = store.get('shortcut', 'Super+Space');
    const ok = globalShortcut.register(shortcut, startCapture);
    if (!ok) {
        console.error(`[main] Failed to register shortcut: ${shortcut}`);
        new Notification({
            title: 'Circle AI — Shortcut Conflict',
            body:  `Could not register "${shortcut}". Change it in the config.`,
        }).show();
    } else {
        console.log(`[main] Shortcut registered: ${shortcut}`);
    }
}

// ─── Main flow ────────────────────────────────────────────────────────────────
async function startCapture() {
    if (captureInProgress) return;
    captureInProgress = true;

    // Close any open Lens panel from a previous search
    if (lensCloseBrowser) {
        lensCloseBrowser();
        lensCloseBrowser = null;
    }

    // Previous run's full-screen snapshot is no longer needed — temp files
    // otherwise accumulate forever in /tmp across sessions.
    if (lastSnapshotPath) {
        fs.unlink(lastSnapshotPath, () => {});
        lastSnapshotPath = null;
    }

    // Health check GNOME extension
    try {
        await pingExtension();
    } catch (e) {
        console.error(`[main] Extension health check failed: ${e.message}`);
        captureInProgress = false;
        return;
    }

    closeOverlay();

    try {
        const snapPath = makeTempPath();
        console.log(`[main] Capturing screen → ${snapPath}`);
        lastSnapshotPath = await captureFullScreen(snapPath);
        console.log(`[main] Snapshot ready: ${lastSnapshotPath}`);
        openOverlay(lastSnapshotPath);
    } catch (err) {
        console.error(`[main] Capture failed: ${err.message}`);
        captureInProgress = false;
    }
}

// ─── Side Panel — Chrome window via Puppeteer ───────────────────────────────
// Floating result card (not a full-height docked strip): fixed comfortable size,
// anchored next to wherever the user circled so it reads like Android's Circle to Search.
function computePanelBounds(boundingBox, displayBounds) {
    const { width: sw, height: sh, x: sx, y: sy } = displayBounds;
    const margin = 16;

    const savedSize = store.get('panelSize');
    const width  = (savedSize && savedSize.width)  || Math.min(1150, Math.round(sw * 0.6));
    const height = (savedSize && savedSize.height) || Math.min(760, Math.round(sh * 0.75));

    let x = boundingBox ? boundingBox.maxX + margin : sx + sw - width - margin;
    if (x + width > sx + sw - margin) {
        x = boundingBox ? boundingBox.minX - width - margin : x;
    }
    x = Math.max(sx + margin, Math.min(x, sx + sw - width - margin));

    let y = boundingBox ? boundingBox.minY : sy + margin;
    y = Math.max(sy + margin, Math.min(y, sy + sh - height - margin));

    return { x: Math.round(x), y: Math.round(y), width, height };
}

// Generic panel host: shared by Lens search and Translate results, since both
// are just "open an app-mode Chrome window anchored next to the selection".
async function openBrowserPanel(boundingBox, opener, label) {
    if (lensCloseBrowser) {
        lensCloseBrowser();
        lensCloseBrowser = null;
    }

    const primaryDisplay = screen.getPrimaryDisplay();
    const panelBounds = computePanelBounds(boundingBox, primaryDisplay.workArea);

    // Only remember the user's preferred SIZE — position is re-anchored to each new
    // selection, so persisting x/y would fight the "appears next to what you circled" UX.
    const onBoundsChange = ({ width, height }) => {
        store.set('panelSize', { width, height });
    };

    try {
        console.log(`[main] Opening ${label} panel...`);
        const { closeBrowser } = await opener(panelBounds, onBoundsChange);
        lensCloseBrowser = closeBrowser;
        console.log(`[main] ${label} panel open.`);
    } catch (err) {
        console.error(`[main] ${label} panel failed: ${err.message}`);
    }
}

function notify(body) {
    new Notification({ title: 'Circle AI', body }).show();
}

// ─── IPC: overlay → crop → search/text/translate/image ──────────────────────
ipcMain.on('region-selected', async (_event, { points, boundingBox, mode }) => {
    closeOverlay();
    captureInProgress = false;

    if (!lastSnapshotPath || !points || points.length < 3) return;

    try {
        console.log('[main] Cropping selection…');
        const { buffer } = await cropByPath(lastSnapshotPath, points, boundingBox);

        if (mode === 'image') {
            clipboard.writeImage(nativeImage.createFromBuffer(buffer));
            console.log('[main] Image copied to clipboard.');
            notify('התמונה הועתקה ללוח');
            return;
        }

        if (mode === 'text' || mode === 'translate') {
            const ocrPath = path.join(os.tmpdir(), `circle-ai-ocr-${Date.now()}.png`);
            fs.writeFileSync(ocrPath, buffer);

            console.log(`[main] Running OCR (mode=${mode})…`);
            const text = await extractText(ocrPath).finally(() => fs.unlink(ocrPath, () => {}));

            if (!text) {
                notify('לא זוהה טקסט בתמונה');
                return;
            }

            if (mode === 'text') {
                clipboard.writeText(text);
                console.log('[main] Text copied to clipboard.');
                notify('הטקסט הועתק ללוח');
            } else {
                console.log('[main] Opening translate panel…');
                await openBrowserPanel(
                    boundingBox,
                    (bounds, onChange) => openTranslatePanel(text, bounds, onChange),
                    'Translate'
                );
            }
            return;
        }

        const cropPath = path.join(os.tmpdir(), `circle-ai-crop-${Date.now()}.png`);
        fs.writeFileSync(cropPath, buffer);

        console.log('[main] Launching Google Lens side panel…');
        await openBrowserPanel(
            boundingBox,
            (bounds, onChange) => openGoogleLensWithImage(cropPath, bounds, onChange),
            'Google Lens'
        );

        // Chrome has already read the file by the time uploadFile() resolves inside
        // openGoogleLensWithImage — safe to remove now instead of leaving it in /tmp forever.
        fs.unlink(cropPath, () => {});
    } catch (err) {
        console.error(`[main] Selection handling error: ${err.message}`);
    }
});

ipcMain.on('overlay-cancelled', () => {
    closeOverlay();
    captureInProgress = false;
});

ipcMain.on('close-lens-panel', () => {
    if (lensCloseBrowser) {
        lensCloseBrowser();
        lensCloseBrowser = null;
    }
});

// ─── Overlay window ───────────────────────────────────────────────────────────
function openOverlay(imagePath) {
    if (overlayWin) closeOverlay();

    const { width, height } = screen.getPrimaryDisplay().bounds;

    overlayWin = new BrowserWindow({
        x: 0, y: 0,
        width, height,
        fullscreen:  true,
        frame:       false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        hasShadow:   false,
        resizable:   false,
        movable:     false,
        focusable:   true,
        type:        'panel',
        icon:        path.join(__dirname, '..', 'assets', 'tray-icon.png'),
        webPreferences: {
            nodeIntegration:  false,
            contextIsolation: true,
            preload:          path.join(__dirname, 'overlay', 'overlay-preload.js'),
        },
    });

    overlayWin.loadFile(path.join(__dirname, 'overlay', 'overlay.html'));
    overlayWin.once('ready-to-show', () => {
        overlayWin.show();
        overlayWin.focus();
        overlayWin.webContents.send('init', { imagePath });
    });
    overlayWin.on('closed', () => { overlayWin = null; });
}

function closeOverlay() {
    if (overlayWin && !overlayWin.isDestroyed()) overlayWin.close();
    overlayWin = null;
}
