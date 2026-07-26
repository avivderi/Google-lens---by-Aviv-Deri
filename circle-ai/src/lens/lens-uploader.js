'use strict';

const fs = require('fs');
const { launchPanel, attachPanelLifecycle } = require('./browser-panel');

/**
 * Opens Google Lens in an app-mode Chrome window, uploads the image crop,
 * waits for the search results to load, and repositions the window.
 *
 * @param {string} croppedImagePath  Absolute path to the PNG crop
 * @param {{ x:number, y:number, width:number, height:number }} panelBounds
 * @param {Function} [onBoundsChange] Optional callback triggered when user moves or resizes the window
 * @returns {Promise<{ browser: object, closeBrowser: Function }>}
 */
async function openGoogleLensWithImage(croppedImagePath, panelBounds, onBoundsChange) {
    if (!fs.existsSync(croppedImagePath)) {
        throw new Error(`File does not exist: ${croppedImagePath}`);
    }

    const { browser, page } = await launchPanel('https://lens.google.com', panelBounds);

    try {
        console.log('[Lens] Navigating to Google Lens...');

        // lens.google.com has multiple hidden file inputs — only "encoded_image" is
        // the one Google's backend actually processes; a generic input[type="file"]
        // match grabs the wrong one and silently uploads nothing.
        const fileInput = await page.waitForSelector('input[name="encoded_image"]', { timeout: 10000 }).catch(() => null);
        if (!fileInput) {
            throw new Error('Could not find file upload input on Google Lens interface');
        }

        console.log('[Lens] Uploading image crop...');
        await fileInput.uploadFile(croppedImagePath);

        console.log('[Lens] Waiting for Google Lens search results...');
        let searchUrl = null;
        for (let i = 0; i < 90; i++) {
            await new Promise(r => setTimeout(r, 300));
            const currentUrl = page.url();
            if (
                currentUrl.includes('search?vsrid') ||
                currentUrl.includes('searchbyimage') ||
                currentUrl.includes('udm=26') ||
                currentUrl.includes('lns_vfs')
            ) {
                searchUrl = currentUrl;
                break;
            }
            if (currentUrl.includes('accounts.google.com') || currentUrl.includes('ServiceLogin')) {
                console.log('[Lens] User is on login page... pausing timeout.');
                await new Promise(r => setTimeout(r, 2000));
                i = Math.max(0, i - 5);
            }
        }

        if (!searchUrl) {
            throw new Error('Timed out waiting for Lens search results');
        }

        console.log('[Lens] Search results loaded:', searchUrl);

        const closeBrowser = attachPanelLifecycle(browser, page, onBoundsChange);
        return { browser, closeBrowser };

    } catch (err) {
        await browser.close().catch(() => {});
        throw err;
    }
}

module.exports = { openGoogleLensWithImage };
