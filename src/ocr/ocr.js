'use strict';

const os = require('os');
const path = require('path');
const fs = require('fs');
const Tesseract = require('tesseract.js');

// tesseract.js caches downloaded language data in cachePath (default: the
// process's cwd) — pin it outside the project folder so it doesn't dump
// eng.traineddata/heb.traineddata next to the source files.
const cachePath = path.join(os.tmpdir(), 'circle-ai-ocr-cache');
fs.mkdirSync(cachePath, { recursive: true });

/**
 * Runs local OCR on an image and returns the recognized text.
 * @param {string} imagePath  Absolute path to the cropped selection PNG.
 * @returns {Promise<string>} Recognized text, trimmed.
 */
async function extractText(imagePath) {
    const { data: { text } } = await Tesseract.recognize(imagePath, 'eng+heb', { cachePath });
    return text.trim();
}

module.exports = { extractText };
