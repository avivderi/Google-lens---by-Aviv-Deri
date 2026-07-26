/**
 * circle-ai-capture GNOME Shell Extension
 * =========================================
 * Runs INSIDE the GNOME Shell compositor (GJS), bypassing D-Bus restrictions.
 * Exports interface io.github.avivderi.CircleAI on org.gnome.Shell's session bus.
 */

import Gio from 'gi://Gio';
import GLib from 'gi://GLib';
import Shell from 'gi://Shell';
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
    }

    disable() {
        console.log('[CircleAI] Extension disabling…');
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
