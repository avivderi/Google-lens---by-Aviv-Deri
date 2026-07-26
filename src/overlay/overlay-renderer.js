'use strict';

// ─── DOM refs ──────────────────────────────────────────────────────────────
const canvas        = document.getElementById('canvas');
const ctx           = canvas.getContext('2d');
const topPill       = document.getElementById('top-pill');
const pillClose     = document.getElementById('pill-close');
const centerTooltip = document.getElementById('center-tooltip');
const cursorHint    = document.getElementById('cursor-hint');
const selectionMenu = document.getElementById('selection-menu');

const copyTextBtn   = document.getElementById('copy-text-btn');
const translateBtn  = document.getElementById('translate-btn');
const copyImgBtn    = document.getElementById('copy-img-btn');

// ─── State ─────────────────────────────────────────────────────────────────
let snapshot   = null;   // ImageBitmap of the screen capture
let startX = 0, startY = 0;
let currentX = 0, currentY = 0;
let isSelecting = false;
let isSelected  = false;
let selectedBox = null;  // { minX, minY, maxX, maxY, width, height }
let animAngle   = 0;
let animId      = null;

// ─── Init from main process ────────────────────────────────────────────────
window.circleAI.onInit(({ imagePath }) => {
    const img = new Image();
    img.onload = async () => {
        canvas.width  = window.innerWidth;
        canvas.height = window.innerHeight;
        snapshot = await createImageBitmap(img);
        render();
    };
    img.src = `file://${imagePath}`;
});

window.addEventListener('resize', () => {
    canvas.width  = window.innerWidth;
    canvas.height = window.innerHeight;
    render();
});

// ─── Mouse ─────────────────────────────────────────────────────────────────
canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    if (isSelected) resetSelection();

    isSelecting = true;
    startX = currentX = e.clientX;
    startY = currentY = e.clientY;

    topPill.classList.add('hidden');
    if (centerTooltip) centerTooltip.classList.add('hidden');
    if (cursorHint) cursorHint.classList.remove('visible');
    selectionMenu.classList.remove('visible');
    startAnimation();
});

canvas.addEventListener('mousemove', (e) => {
    if (!isSelecting) {
        if (!isSelected && cursorHint) {
            cursorHint.style.transform = `translate3d(${e.clientX + 16}px, ${e.clientY + 16}px, 0)`;
            cursorHint.classList.add('visible');
        }
        return;
    }

    if (cursorHint) cursorHint.classList.remove('visible');
    currentX = e.clientX;
    currentY = e.clientY;
    render();
});

canvas.addEventListener('mouseleave', () => {
    if (cursorHint) cursorHint.classList.remove('visible');
});

canvas.addEventListener('mouseup', () => {
    if (!isSelecting) return;
    isSelecting = false;

    const w = Math.abs(currentX - startX);
    const h = Math.abs(currentY - startY);

    if (w < 10 || h < 10) { resetSelection(); return; }

    isSelected = true;
    const minX = Math.min(startX, currentX);
    const minY = Math.min(startY, currentY);
    const maxX = Math.max(startX, currentX);
    const maxY = Math.max(startY, currentY);
    selectedBox = {
        minX, minY, maxX, maxY,
        width:  maxX - minX,
        height: maxY - minY,
    };

    if (cursorHint) cursorHint.classList.remove('visible');
    render();
    showSelectionMenu();
    // Selection stays open here — the menu buttons decide what happens next.
    // (Submitting immediately used to close this window before you could click one.)
});

// ─── Animation loop ────────────────────────────────────────────────────────
function startAnimation() {
    if (animId) return;
    function loop() {
        animAngle = (animAngle + 0.03) % (Math.PI * 2);
        render();
        if (isSelecting || isSelected) {
            animId = requestAnimationFrame(loop);
        } else {
            animId = null;
        }
    }
    animId = requestAnimationFrame(loop);
}

// ─── Render ────────────────────────────────────────────────────────────────
function render() {
    const W = canvas.width;
    const H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // 1. Draw captured screen
    if (snapshot) {
        ctx.drawImage(snapshot, 0, 0, W, H);
    }

    // 2. Dim backdrop (Google Lens vignette: blue-grey tint)
    ctx.fillStyle = 'rgba(0, 0, 20, 0.38)';
    ctx.fillRect(0, 0, W, H);

    if (!isSelecting && !isSelected) return;

    const minX = Math.min(startX, currentX);
    const minY = Math.min(startY, currentY);
    const w    = Math.abs(currentX - startX);
    const h    = Math.abs(currentY - startY);

    if (w < 2 || h < 2) return;

    // 3. Clear dim over selection area to reveal bright pixels
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    roundedRectPath(ctx, minX, minY, w, h, 14);
    ctx.fillStyle = 'rgba(0,0,0,1)';
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalCompositeOperation = 'destination-atop';
    if (snapshot) ctx.drawImage(snapshot, 0, 0, W, H);
    ctx.restore();

    // 4. Google 4-Color Glowing Aura (Blue, Red, Yellow, Green gradient)
    ctx.save();
    const grad = ctx.createConicGradient(animAngle, minX + w / 2, minY + h / 2);
    grad.addColorStop(0.00, '#4285F4');
    grad.addColorStop(0.25, '#EA4335');
    grad.addColorStop(0.50, '#FBBC05');
    grad.addColorStop(0.75, '#34A853');
    grad.addColorStop(1.00, '#4285F4');

    ctx.strokeStyle = grad;
    ctx.lineWidth = 3.5;
    ctx.shadowColor = 'rgba(66, 133, 244, 0.4)';
    ctx.shadowBlur = 12;
    roundedRectPath(ctx, minX - 1, minY - 1, w + 2, h + 2, 14);
    ctx.stroke();
    ctx.restore();

    // 5. White L-corner brackets (Handles)
    ctx.save();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 3.5;
    ctx.lineCap = 'round';
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = 4;

    const arm = Math.min(18, Math.min(w, h) / 3);
    const r = 14;

    // Top-Left corner bracket
    ctx.beginPath();
    ctx.moveTo(minX, minY + arm);
    ctx.lineTo(minX, minY + r);
    ctx.quadraticCurveTo(minX, minY, minX + r, minY);
    ctx.lineTo(minX + arm, minY);
    ctx.stroke();

    // Top-Right corner bracket
    ctx.beginPath();
    ctx.moveTo(minX + w - arm, minY);
    ctx.lineTo(minX + w - r, minY);
    ctx.quadraticCurveTo(minX + w, minY, minX + w, minY + r);
    ctx.lineTo(minX + w, minY + arm);
    ctx.stroke();

    // Bottom-Right corner bracket
    ctx.beginPath();
    ctx.moveTo(minX + w, minY + h - arm);
    ctx.lineTo(minX + w, minY + h - r);
    ctx.quadraticCurveTo(minX + w, minY + h, minX + w - r, minY + h);
    ctx.lineTo(minX + w - arm, minY + h);
    ctx.stroke();

    // Bottom-Left corner bracket
    ctx.beginPath();
    ctx.moveTo(minX + arm, minY + h);
    ctx.lineTo(minX + r, minY + h);
    ctx.quadraticCurveTo(minX, minY + h, minX, minY + h - r);
    ctx.lineTo(minX, minY + h - arm);
    ctx.stroke();

    ctx.restore();
}

// ─── Helpers ───────────────────────────────────────────────────────────────
function roundedRectPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y,     x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h,     x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y,         x + r, y);
    ctx.closePath();
}

function showSelectionMenu() {
    const { minX, minY, maxX, maxY } = selectedBox;
    const w = maxX - minX;
    const h = maxY - minY;

    selectionMenu.classList.add('visible');

    requestAnimationFrame(() => {
        const mw = selectionMenu.offsetWidth  || 320;
        const mh = selectionMenu.offsetHeight || 48;

        let px = minX + w / 2 - mw / 2;
        let py = maxY + 16;

        if (px < 16) px = 16;
        if (px + mw > window.innerWidth - 16) px = window.innerWidth - mw - 16;
        if (py + mh > window.innerHeight - 16) py = minY - mh - 16;

        selectionMenu.style.left = `${px}px`;
        selectionMenu.style.top  = `${py}px`;
    });
}

function resetSelection() {
    isSelecting = false;
    isSelected  = false;
    selectedBox = null;
    selectionMenu.classList.remove('visible');
    topPill.classList.remove('hidden');
    if (centerTooltip) centerTooltip.classList.remove('hidden');
    if (cursorHint) cursorHint.classList.remove('visible');
    render();
}

function submitSelection(mode = 'search') {
    if (!selectedBox) return;
    const { minX, minY, maxX, maxY } = selectedBox;
    window.circleAI.sendRegionSelected({
        points: [
            { x: minX, y: minY },
            { x: maxX, y: minY },
            { x: maxX, y: maxY },
            { x: minX, y: maxY },
        ],
        boundingBox: selectedBox,
        mode,
    });
}

// ─── Button events ─────────────────────────────────────────────────────────
if (copyTextBtn)  copyTextBtn.addEventListener('click',  () => submitSelection('text'));
if (translateBtn) translateBtn.addEventListener('click', () => submitSelection('translate'));
if (copyImgBtn)   copyImgBtn.addEventListener('click',   () => submitSelection('image'));
pillClose.addEventListener('click', () => window.circleAI.sendCancelled());

// ─── Keyboard ──────────────────────────────────────────────────────────────
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.circleAI.sendCancelled();
    // Enter = default action (Lens search) once a selection is finalized.
    if (e.key === 'Enter' && isSelected) submitSelection('search');
});
