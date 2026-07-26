'use strict';

const puppeteerExtra = require('puppeteer-extra');
const StealthPlugin = require('puppeteer-extra-plugin-stealth');
puppeteerExtra.use(StealthPlugin());

const path = require('path');
const os = require('os');
const fs = require('fs');

async function launchGoogleLogin() {
    const chromePath = '/usr/bin/google-chrome';
    if (!fs.existsSync(chromePath)) {
        console.error('Google Chrome (/usr/bin/google-chrome) not found on system.');
        process.exit(1);
    }

    const userDataDir = path.join(os.homedir(), '.config', 'google-chrome-circle-ai');

    console.log('========================================================');
    console.log('  Google Account Sign-In for Circle AI');
    console.log('========================================================');
    console.log('Opening Chrome window...');
    console.log('Please sign in to your Google account in the browser.');
    console.log('Once signed in, close the Chrome browser window.');
    console.log('========================================================');

    const browser = await puppeteerExtra.launch({
        executablePath: chromePath,
        headless: false,
        userDataDir,
        ignoreDefaultArgs: ['--enable-automation'],
        args: [
            '--no-sandbox',
            '--disable-blink-features=AutomationControlled',
            '--no-first-run',
            '--test-type',
        ],
    });

    const pages = await browser.pages();
    const page = pages.length > 0 ? pages[0] : await browser.newPage();

    await page.goto('https://accounts.google.com/ServiceLogin', { waitUntil: 'domcontentloaded' });

    browser.on('disconnected', () => {
        console.log('✅ Google account session saved successfully!');
        process.exit(0);
    });
}

launchGoogleLogin();
