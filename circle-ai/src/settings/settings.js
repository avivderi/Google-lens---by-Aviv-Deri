'use strict';

document.addEventListener('DOMContentLoaded', async () => {
  const shortcutInput = document.getElementById('shortcutInput');
  const autostartToggle = document.getElementById('autostartToggle');
  const geminiApiKeyInput = document.getElementById('geminiApiKey');
  const anthropicApiKeyInput = document.getElementById('anthropicApiKey');
  const panelWidthInput = document.getElementById('panelWidth');
  const panelHeightInput = document.getElementById('panelHeight');

  const extStatusDot = document.getElementById('extStatusDot');
  const extStatusText = document.getElementById('extStatusText');
  const installExtBtn = document.getElementById('installExtBtn');

  const saveBtn = document.getElementById('saveBtn');
  const cancelBtn = document.getElementById('cancelBtn');
  const toastMessage = document.getElementById('toastMessage');

  // Load existing settings
  try {
    const settings = await window.api.getSettings();
    if (settings) {
      shortcutInput.value = settings.shortcut || 'Super+Space';
      autostartToggle.checked = settings.autostart !== false;
      geminiApiKeyInput.value = settings.geminiApiKey || '';
      anthropicApiKeyInput.value = settings.anthropicApiKey || '';
      
      const panelSize = settings.panelSize || { width: 1150, height: 760 };
      panelWidthInput.value = panelSize.width || 1150;
      panelHeightInput.value = panelSize.height || 760;
    }
  } catch (err) {
    showToast('שגיאה שטעינת ההגדרות: ' + err.message, 'error');
  }

  // Password visibility toggle
  document.querySelectorAll('.toggle-vis-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const targetId = btn.getAttribute('data-target');
      const input = document.getElementById(targetId);
      if (input.type === 'password') {
        input.type = 'text';
        btn.textContent = '🔒';
      } else {
        input.type = 'password';
        btn.textContent = '👁️';
      }
    });
  });

  // Check GNOME Shell Extension Status
  async function checkExtension() {
    extStatusDot.className = 'status-dot';
    extStatusText.textContent = 'בודק סטטוס הרחבה...';
    try {
      const res = await window.api.checkGnomeExtension();
      if (res && res.success) {
        extStatusDot.className = 'status-dot active';
        extStatusText.textContent = `הרחבה פעילה: ${res.version}`;
      } else {
        extStatusDot.className = 'status-dot inactive';
        extStatusText.textContent = 'ההרחבה אינה מותקנת / אינה פעילה';
      }
    } catch (e) {
      extStatusDot.className = 'status-dot inactive';
      extStatusText.textContent = 'לא נתמך / הרחבה לא מותקנת';
    }
  }

  checkExtension();

  // Install / Update GNOME Extension button
  installExtBtn.addEventListener('click', async () => {
    installExtBtn.disabled = true;
    installExtBtn.textContent = 'מתקין הרחבה...';
    try {
      const res = await window.api.installGnomeExtension();
      if (res.success) {
        showToast('הרחבת GNOME הותקנה בהצלחה! יש לבצע התנתקות מהמערכת (Log Out) במידת הצורך.', 'success');
        checkExtension();
      } else {
        showToast('ההתקנה נכשלה: ' + res.error, 'error');
      }
    } catch (e) {
      showToast('שגיאה בהתקנה: ' + e.message, 'error');
    } finally {
      installExtBtn.disabled = false;
      installExtBtn.textContent = '⚙️ התקן / עדכן הרחבה ב-GNOME';
    }
  });

  // Save Settings
  saveBtn.addEventListener('click', async () => {
    const newSettings = {
      shortcut: shortcutInput.value.trim() || 'Super+Space',
      autostart: autostartToggle.checked,
      geminiApiKey: geminiApiKeyInput.value.trim(),
      anthropicApiKey: anthropicApiKeyInput.value.trim(),
      panelSize: {
        width: parseInt(panelWidthInput.value, 10) || 1150,
        height: parseInt(panelHeightInput.value, 10) || 760,
      }
    };

    saveBtn.disabled = true;
    saveBtn.textContent = 'שומר...';

    try {
      const res = await window.api.saveSettings(newSettings);
      if (res.success) {
        showToast('ההגדרות נשמרו בהצלחה!', 'success');
        setTimeout(() => {
          window.api.closeWindow();
        }, 1200);
      } else {
        showToast('שגיאה בשמירה: ' + res.error, 'error');
      }
    } catch (err) {
      showToast('שגיאה בשמירה: ' + err.message, 'error');
    } finally {
      saveBtn.disabled = false;
      saveBtn.textContent = 'שמור הגדרות';
    }
  });

  cancelBtn.addEventListener('click', () => {
    window.api.closeWindow();
  });

  function showToast(msg, type = 'success') {
    toastMessage.textContent = msg;
    toastMessage.className = `toast ${type}`;
    setTimeout(() => {
      toastMessage.className = 'toast hidden';
    }, 4000);
  }
});
