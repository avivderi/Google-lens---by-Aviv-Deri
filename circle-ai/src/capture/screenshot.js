'use strict';

const { execFile } = require('child_process');
const os = require('os');
const path = require('path');

/**
 * capture/screenshot.js
 * =====================
 * Calls the Circle AI GNOME Shell Extension via gdbus to silently capture
 * the full screen — no permission dialog, no cursor, no flash.
 *
 * The extension exports its D-Bus object at:
 *   bus-name:    org.gnome.Shell   (extensions share the shell's bus name)
 *   object-path: /io/github/avivderi/CircleAI
 *   interface:   io.github.avivderi.CircleAI
 *   method:      Capture(in s filename, out b success, out s used_filename)
 *
 * If the extension is not loaded, the call fails with a clear error message.
 */

const DBUS_DEST         = 'org.gnome.Shell';
const DBUS_OBJECT       = '/io/github/avivderi/CircleAI';
const DBUS_INTERFACE    = 'io.github.avivderi.CircleAI';

/**
 * Ping the extension to verify it is alive.
 * @returns {Promise<string>} version string from the extension
 */
function pingExtension() {
    return new Promise((resolve, reject) => {
        execFile('gdbus', [
            'call', '--session',
            '--dest',        DBUS_DEST,
            '--object-path', DBUS_OBJECT,
            '--method',      `${DBUS_INTERFACE}.Ping`,
        ], (err, stdout) => {
            if (err) return reject(new Error(`Extension ping failed: ${err.message}`));
            // stdout: ('circle-ai-capture@avivderi.local v1',)
            const match = stdout.match(/'([^']+)'/);
            resolve(match ? match[1] : stdout.trim());
        });
    });
}

/**
 * Capture the full screen to a PNG file.
 * @param {string} outputPath  Absolute path for the output file.
 * @returns {Promise<string>}  The path actually written (may differ from outputPath).
 */
function captureFullScreen(outputPath) {
    return new Promise((resolve, reject) => {
        execFile('gdbus', [
            'call', '--session',
            '--dest',        DBUS_DEST,
            '--object-path', DBUS_OBJECT,
            '--method',      `${DBUS_INTERFACE}.Capture`,
            outputPath,
        ], { timeout: 10_000 }, (err, stdout, stderr) => {
            if (err) {
                const msg = stderr?.trim() || err.message;
                return reject(new Error(
                    `Screenshot failed.\n` +
                    `Make sure the Circle AI GNOME extension is installed and enabled.\n` +
                    `Error: ${msg}`
                ));
            }

            // stdout example: (true, '/tmp/circle-ai-snap-12345.png',)
            const successMatch = stdout.match(/\((true|false)/);
            const filenameMatch = stdout.match(/'([^']+\.png)'/);

            const success  = successMatch  ? successMatch[1]  === 'true' : false;
            const usedPath = filenameMatch ? filenameMatch[1] : outputPath;

            if (!success) {
                return reject(new Error(
                    `Shell.Screenshot reported failure.\n` +
                    `Check Looking Glass for errors (Alt+F2 → lg).`
                ));
            }

            resolve(usedPath);
        });
    });
}

/**
 * Listen for top panel icon click signal from GNOME extension.
 */
function listenForSignal(onTrigger) {
    const { spawn } = require('child_process');
    const child = spawn('gdbus', [
        'monitor', '--session',
        '--dest',        DBUS_DEST,
        '--object-path', DBUS_OBJECT,
    ]);

    child.stdout.on('data', (data) => {
        const text = data.toString();
        if (text.includes('TriggerCapture')) {
            onTrigger();
        }
    });

    child.on('error', (err) => {
        console.error('[screenshot] gdbus monitor error:', err.message);
    });

    return child;
}

/**
 * Helper: generate a unique temp path for each capture.
 */
function makeTempPath() {
    return path.join(os.tmpdir(), `circle-ai-snap-${Date.now()}.png`);
}

module.exports = { captureFullScreen, pingExtension, makeTempPath, listenForSignal };
