/**
 * circle-ai-capture GNOME Shell Extension
 * =========================================
 * Runs INSIDE the GNOME Shell compositor (GJS), bypassing D-Bus restrictions.
 * Exports interface io.github.avivderi.CircleAI on org.gnome.Shell's session bus.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
import St from 'gi://St';
import Clutter from 'gi://Clutter';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import { Extension } from 'resource:///org/gnome/shell/extensions/extension.js';

const IFACE_XML = `
<node>
  <interface name="io.github.avivderi.CircleAI">
    <method name="Ping">
      <arg type="s" direction="out" name="version"/>
    </method>
    <method name="Capture">
      <arg type="s" direction="in"  name="filename"/>
      <arg type="b" direction="out" name="success"/>
      <arg type="s" direction="out" name="filename_used"/>
    </method>
    <signal name="TriggerCapture"/>
  </interface>
</node>`;

export default class CircleAIExtension extends Extension {
    enable() {
        console.log('[CircleAI] Extension enabling…');
        this._dbusImpl = Gio.DBusExportedObject.wrapJSObject(IFACE_XML, this);
        this._dbusImpl.export(Gio.DBus.session, '/io/github/avivderi/CircleAI');
        console.log('[CircleAI] D-Bus object exported at /io/github/avivderi/CircleAI');

        try {
            // dontCreateMenu = true so clicking acts as a direct button press
            this._indicator = new PanelMenu.Button(0.0, 'Google Lens — Circle to Search', true);
            const iconPath = GLib.build_filenamev([this.path, 'assets', 'tray-icon.png']);
            const gicon = Gio.icon_new_for_string(iconPath);
            const icon = new St.Icon({
                gicon: gicon,
                icon_size: 20,
                style_class: 'system-status-icon',
                style: 'color: unset;',
            });
            this._indicator.add_child(icon);

            const triggerCaptureSignal = () => {
                console.log('[CircleAI] Top bar Google Lens icon clicked!');
                try {
                    if (this._dbusImpl) {
                        this._dbusImpl.emit_signal('TriggerCapture', null);
                    }
                    Gio.DBus.session.emit_signal(
                        null,
                        '/io/github/avivderi/CircleAI',
                        'io.github.avivderi.CircleAI',
                        'TriggerCapture',
                        null
                    );
                } catch (e) {
                    console.error('[CircleAI] emit_signal failed:', e);
                }
            };

            this._indicator.connect('event', (actor, event) => {
                const type = event.type();
                if (type === Clutter.EventType.BUTTON_PRESS || type === Clutter.EventType.TOUCH_BEGIN) {
                    triggerCaptureSignal();
                    return Clutter.EVENT_STOP;
                }
                return Clutter.EVENT_PROPAGATE;
            });

            Main.panel.addToStatusArea('google-lens-indicator', this._indicator);
            console.log('[CircleAI] Top panel indicator added successfully.');
        } catch (err) {
            logError(err, 'CircleAI: Failed to create top panel indicator');
        }
    }

    disable() {
        console.log('[CircleAI] Extension disabling…');
        this._indicator?.destroy();
        this._indicator = null;
        this._dbusImpl?.unexport();
        this._dbusImpl = null;
    }

    Ping() {
        return 'circle-ai-capture@avivderi.github.io v3';
    }

    CaptureAsync(params, invocation) {
        const [filename] = params;
        log('CircleAI: Capture called with ' + filename);

        const dir = GLib.path_get_dirname(filename);
        GLib.mkdir_with_parents(dir, 0o755);

        let stream;
        try {
            const file = Gio.File.new_for_path(filename);
            stream = file.replace(
                null,
                false,
                Gio.FileCreateFlags.REPLACE_DESTINATION,
                null
            );
        } catch (e) {
            logError(e, 'CircleAI: failed to open stream');
            try {
                invocation.return_value(new GLib.Variant('(bs)', [false, '']));
            } catch (err) {
                logError(err, 'CircleAI: return_value failed');
            }
            return;
        }

        const screenshotter = new Shell.Screenshot();
        screenshotter.screenshot(
            false,
            stream,
            (obj, res) => {
                let success = false;
                try {
                    [success] = obj.screenshot_finish(res);
                } catch (e) {
                    logError(e, 'CircleAI: screenshot_finish threw');
                }

                try {
                    stream.close(null);
                } catch (e) {}

                try {
                    invocation.return_value(new GLib.Variant('(bs)', [success, filename]));
                } catch (e) {
                    logError(e, 'CircleAI: return_value threw');
                }
            }
        );
    }
}
