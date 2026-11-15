// Connects to an Acaia scale over Bluetooth LE (@capacitor-community/bluetooth-le)
// or, in a QA build, to a fake scale. Both transports expose the same shape:
//   scan(onFound, onError) -> stop()
//   connect(device, { onMessage, onDisconnect }) -> { protocol, tare(), disconnect() }
// Messages are the decoded objects from acaiaProtocol.js.

import { Capacitor } from '@capacitor/core';
import {
  acaiaModelName,
  COMMANDS,
  createFrameReader,
  detectGeneration,
  HEARTBEAT_MS,
  heartbeatCommands,
  isAcaiaName,
  sessionStartCommands,
} from './acaiaProtocol';
import { createFakeTransport } from './fakeScale';

// iPhone app only: iOS Safari has no Web Bluetooth, and a new JS bundle on an
// older binary without the plugin simply hides the feature.
export function scaleTransport() {
  // QA builds for the simulator (no Bluetooth there) set VITE_FAKE_SCALE=1;
  // in every other build this branch and the fake scale are compiled out.
  if (import.meta.env.VITE_FAKE_SCALE === '1') return createFakeTransport();
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable('BluetoothLe')) return bleTransport;
  return null;
}

let blePromise = null;
function ble() {
  blePromise ||= import('@capacitor-community/bluetooth-le').then(async (module) => {
    await module.BleClient.initialize();
    return module.BleClient;
  }).catch((error) => {
    blePromise = null;
    throw error;
  });
  return blePromise;
}

const toDataView = (bytes) => new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

function writerFor(client, deviceId, services, link) {
  const characteristic = services
    .find((service) => service.uuid.toLowerCase() === link.service)?.characteristics
    .find((item) => item.uuid.toLowerCase() === link.write);
  const withResponse = Boolean(characteristic?.properties?.write);
  return (bytes) => (withResponse
    ? client.write(deviceId, link.service, link.write, toDataView(bytes))
    : client.writeWithoutResponse(deviceId, link.service, link.write, toDataView(bytes)));
}

const bleTransport = {
  scan(onFound, onError) {
    let stopped = false;
    ble().then((client) => {
      if (stopped) return null;
      return client.requestLEScan({ allowDuplicates: false }, (result) => {
        const name = result.localName || result.device?.name;
        if (!isAcaiaName(name)) return;
        onFound({ deviceId: result.device.deviceId, name, model: acaiaModelName(name), rssi: result.rssi ?? null });
      });
    }).catch((error) => onError(error));
    return () => {
      stopped = true;
      ble().then((client) => client.stopLEScan()).catch(() => {});
    };
  },

  async connect(device, { onMessage, onDisconnect }) {
    const client = await ble();
    // A remembered scale must be looked up before iOS will connect to it.
    await client.getDevices([device.deviceId]);
    await client.connect(device.deviceId, () => onDisconnect?.(), { timeout: 10000 });
    let heartbeat = null;
    try {
      const services = await client.getServices(device.deviceId);
      const link = detectGeneration(services);
      if (!link) throw new Error('This device does not speak the Acaia protocol.');
      const write = writerFor(client, device.deviceId, services, link);
      const read = createFrameReader();
      await client.startNotifications(device.deviceId, link.service, link.notify, (value) => {
        const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
        for (const message of read(bytes)) onMessage(message);
      });
      for (const command of sessionStartCommands(link.generation)) await write(command);
      heartbeat = setInterval(() => {
        heartbeatCommands(link.generation).reduce((chain, command) => chain.then(() => write(command)), Promise.resolve())
          .catch(() => {});
      }, HEARTBEAT_MS[link.generation]);
      return {
        protocol: `acaia-${link.generation}`,
        tare: () => write(COMMANDS.tare),
        async disconnect() {
          clearInterval(heartbeat);
          await client.disconnect(device.deviceId).catch(() => {});
        },
      };
    } catch (error) {
      clearInterval(heartbeat);
      await client.disconnect(device.deviceId).catch(() => {});
      throw error;
    }
  },
};
