'use strict';

/**
 * crop/mask-crop.js
 * =================
 * Uses `sharp` to crop the screenshot to the freehand polygon the user drew.
 *
 * Process:
 *  1. Extract the bounding-box sub-image from the full screenshot (fast first pass).
 *  2. Generate an SVG polygon mask matching the path points (offset to bounding-box coords).
 *  3. Apply the mask via composite('dest-in') — pixels outside the polygon become transparent.
 *  4. Return both a Buffer and a base64 string for the Claude API.
 */

const sharp = require('sharp');

/**
 * @param {string}   screenshotPath  Absolute path to the full-screen PNG.
 * @param {{x:number,y:number}[]} points  Polygon vertices in screen coordinates.
 * @param {{minX,minY,maxX,maxY,width,height}} boundingBox
 * @returns {Promise<{buffer: Buffer, base64: string}>}
 */
async function cropByPath(screenshotPath, points, boundingBox) {
    const { minX, minY, width, height } = boundingBox;

    // Guard: degenerate selection
    if (width < 4 || height < 4) {
        throw new Error('Selection too small to crop.');
    }

    // 1. Translate polygon points into bounding-box–local coordinates
    const localPoints = points.map(p => ({
        x: Math.round(p.x - minX),
        y: Math.round(p.y - minY),
    }));

    // 2. Build an SVG mask the same size as the bounding box
    //    The polygon is white on black — sharp 'dest-in' keeps only white areas.
    const polyStr = localPoints.map(p => `${p.x},${p.y}`).join(' ');
    const svgMask = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}">` +
        `<polygon points="${polyStr}" fill="white"/>` +
        `</svg>`
    );

    // 3. Extract bounding box from screenshot, apply mask, encode to PNG
    const buffer = await sharp(screenshotPath)
        .extract({ left: minX, top: minY, width, height })
        .composite([{
            input:   svgMask,
            blend:   'dest-in',
        }])
        .png()
        .toBuffer();

    const base64 = buffer.toString('base64');
    return { buffer, base64 };
}

module.exports = { cropByPath };
