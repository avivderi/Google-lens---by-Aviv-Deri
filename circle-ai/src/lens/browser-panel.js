'use strict';

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());

const fs = require('fs');
const path = require('path');
const os = require('os');

/**
 * Launches Chrome in App Mode (stealth, persistent profile) pointed at a URL.
 * Shared by the Lens and Translate panels so window-launch/positioning logic
 * lives in one place.
 *
 * @param {string} url
 * @param {{ x:number, y:number, width:number, height:number }} panelBounds
 * @returns {Promise<{ browser: object, page: object }>}
 */
async function launchPanel(url, panelBounds) {
    const chromePath = '/usr/bin/google-chrome';
    if (!fs.existsSync(chromePath)) {
        throw new Error('Google Chrome (/usr/bin/google-chrome) not found on system.');
    }

    // Dedicated profile directory for Circle AI (persistent login session)
    const userDataDir = path.join(os.homedir(), '.config', 'google-chrome-circle-ai');
    fs.mkdirSync(userDataDir, { recursive: true });

    const { x, y, width, height } = panelBounds;

    const browser = await puppeteerExtra.launch({
        executablePath: chromePath,
        headless: false,
        userDataDir,
        env: {
            ...process.env,
            GDK_BACKEND: 'x11',
        },
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
            `--app=${url}`,
            `--window-size=${width},${height}`,
            `--window-position=${x},${y}`,
            '--disable-infobars',
            '--no-first-run',
            '--test-type',
            '--force-device-scale-factor=0.9',
            '--disable-features=Translate',
        ],
    });

    try {
        const pages = await browser.pages();
        const page = pages.length > 0 ? pages[0] : await browser.newPage();

        await page.evaluateOnNewDocument(() => {
            Object.defineProperty(navigator, 'webdriver', { get: () => false });
        });

        return { browser, page };
    } catch (err) {
        await browser.close().catch(() => {});
        throw err;
    }
}

/**
 * Wires up window-resize tracking and returns a teardown function.
 * @param {object} browser
 * @param {object} page
 * @param {Function} [onBoundsChange]
 * @returns {Function} closeBrowser
 */
function attachPanelLifecycle(browser, page, onBoundsChange) {
    let boundsInterval = null;
    if (typeof onBoundsChange === 'function') {
        boundsInterval = setInterval(async () => {
            try {
                if (!page.isClosed()) {
                    const cur = await page.evaluate(() => ({
                        x: window.screenX,
                        y: window.screenY,
                        width: window.outerWidth,
                        height: window.outerHeight,
                    }));
                    if (cur && cur.width > 100 && cur.height > 100) {
                        onBoundsChange(cur);
                    }
                }
            } catch (_) {}
        }, 1000);
    }

    const closeBrowser = () => {
        if (boundsInterval) clearInterval(boundsInterval);
        return browser.close().catch(() => {});
    };

    browser.on('disconnected', () => {
        if (boundsInterval) clearInterval(boundsInterval);
    });

    return closeBrowser;
}

module.exports = { launchPanel, attachPanelLifecycle };
