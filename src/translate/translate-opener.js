'use strict';

const { launchPanel, attachPanelLifecycle } = require('../lens/browser-panel');

/**
 * Opens Google Translate in an app-mode Chrome window with the given text
 * pre-filled, translating into Hebrew by default.
 *
 * @param {string} text
 * @param {{ x:number, y:number, width:number, height:number }} panelBounds
 * @param {Function} [onBoundsChange]
 * @returns {Promise<{ browser: object, closeBrowser: Function }>}
 */
async function openTranslatePanel(text, panelBounds, onBoundsChange) {
    const url = `https://translate.google.com/?sl=auto&tl=iw&text=${encodeURIComponent(text)}&op=translate`;
    const { browser, page } = await launchPanel(url, panelBounds);

    try {
        console.log('[Translate] Navigating to Google Translate...');
        await page.waitForSelector('body', { timeout: 10000 });
        const closeBrowser = attachPanelLifecycle(browser, page, onBoundsChange);
        return { browser, closeBrowser };
    } catch (err) {
        await browser.close().catch(() => {});
        throw err;
    }
}

module.exports = { openTranslatePanel };
