// Reads `capgo bundle compatibility --text` output and decides how the
// Capgo upload treats native-package differences.
//
// Capgo flags a JS bundle as incompatible when it ships with a native plugin
// the channel's current baseline lacks. Installed binaries without that plugin
// still get the bundle, so it is only safe when the JS checks
// Capacitor.isPluginAvailable() before using the plugin. Plugins listed here do;
// anything else that Capgo flags still stops the upload.
export const RUNTIME_GUARDED_PLUGINS = {
  // Acaia scale. src/lib/scale/scaleTransport.js returns no transport unless
  // Capacitor.isPluginAvailable('BluetoothLe'), so the Scale pill stays hidden
  // on binaries built before PR 25 (build 41 and older).
  '@capacitor-community/bluetooth-le': 'BluetoothLe',
};

// eslint-disable-next-line no-control-regex
const ANSI = /\u001b\[[0-9;]*m/g;

export function parseCompatibility(text) {
  const rows = [];
  for (const line of String(text || '').replace(ANSI, '').split('\n')) {
    const cells = line.split('│').map((cell) => cell.trim()).filter(Boolean);
    if (cells.length < 4) continue;
    const status = cells.find((cell) => cell === 'OK' || cell === 'FAIL');
    if (!status || !/^(@[\w.-]+\/)?[\w.-]+$/.test(cells[0])) continue;
    rows.push({ name: cells[0], ok: status === 'OK', details: cells[cells.length - 1] });
  }
  return rows;
}

// Returns the Capgo upload flag to use, or throws when the upload must stop.
export function compatibilityUploadFlag(text, guarded = RUNTIME_GUARDED_PLUGINS) {
  const rows = parseCompatibility(text);
  if (rows.length === 0) {
    throw new Error('Could not read the Capgo compatibility table. Refusing upload.');
  }
  const failing = rows.filter((row) => !row.ok);
  const unguarded = failing.filter((row) => !Object.hasOwn(guarded, row.name));
  if (unguarded.length > 0) {
    const list = unguarded.map((row) => `${row.name} (${row.details})`).join(', ');
    throw new Error(`Capgo says this bundle needs native code the installed app lacks: ${list}. Ship a new native build first, or guard the plugin at runtime and list it in RUNTIME_GUARDED_PLUGINS.`);
  }
  return {
    flag: failing.length > 0 ? '--accept-incompatible' : '--fail-on-incompatible',
    accepted: failing.map((row) => row.name),
  };
}
