/**
 * circle-ai-capture Preferences Window for GNOME Shell
 */
import Adw from 'gi://Adw';
import Gtk from 'gi://Gtk';
import { ExtensionPreferences } from 'resource:///org/gnome/Shell/Extensions/js/uilib/extensionPreferences.js';

export default class CircleAIPreferences extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({
            title: 'Circle AI Settings',
            description: 'Configure Circle AI GNOME Shell integration',
        });
        page.add(group);

        const actionRow = new Adw.ActionRow({
            title: 'Electron Application Integration',
            subtitle: 'Circle AI uses D-Bus to communicate with the main desktop application.',
        });

        const openAppBtn = new Gtk.Button({
            label: 'Open Circle AI',
            valign: Gtk.Align.CENTER,
        });

        openAppBtn.connect('clicked', () => {
            try {
                const proc = new Gio.Subprocess({
                    argv: ['circle-ai'],
                    flags: Gio.SubprocessFlags.NONE,
                });
                proc.init(null);
            } catch (e) {
                console.error('[CircleAI Prefs] Failed to launch application:', e);
            }
        });

        actionRow.add_suffix(openAppBtn);
        group.add(actionRow);
        window.add(page);
    }
}
