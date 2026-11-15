// Scale connection for the brew timer: scan, connect, remember, tare, and keep
// the link honest. Status:
//   off          no Bluetooth scale support here (web, or an older app binary)
//   idle         nothing connected
//   scanning     the pair sheet is looking for scales
//   connecting   connecting (or reconnecting) to a chosen or remembered scale
//   connected    weight is arriving
//   silent       connected but no weight for 3 s, even after one reconnect
//   lost         could not connect, or the link dropped and did not come back
// Weight samples live in a ref (10 a second); `grams` is the latest for display.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { scaleTransport } from '../lib/scale/scaleTransport';

const REMEMBERED_KEY = 'coffeehub:scale:v1';
export const WATCHDOG_MS = 3000;
// aioacaia waits 15 s before reconnecting; mid-brew that is too long to stand
// with a kettle. 5 s is a guess to tune against a real scale.
export const RECONNECT_DELAY_MS = 5000;

export function readRememberedScale() {
  try {
    const saved = JSON.parse(localStorage.getItem(REMEMBERED_KEY));
    return saved?.deviceId ? saved : null;
  } catch {
    return null;
  }
}

function rememberScale(device) {
  try {
    localStorage.setItem(REMEMBERED_KEY, JSON.stringify({ deviceId: device.deviceId, name: device.name, model: device.model }));
  } catch { /* The scale just will not auto-connect next time. */ }
}

export function useScale(open, { pourPlan = null } = {}) {
  const transport = useMemo(() => scaleTransport(), []);
  const [status, setStatus] = useState(transport ? 'idle' : 'off');
  const [device, setDevice] = useState(() => (transport ? readRememberedScale() : null));
  const [found, setFound] = useState([]);
  const [scanError, setScanError] = useState(false);
  const [battery, setBattery] = useState(null);
  const [grams, setGrams] = useState(null);
  const [protocol, setProtocol] = useState(null);

  const linkRef = useRef(null);
  const samplesRef = useRef([]);
  const lastWeightAtRef = useRef(0);
  const retriedRef = useRef(false);
  const closingRef = useRef(false);
  const timersRef = useRef(new Set());
  const pourPlanRef = useRef(pourPlan);
  useLayoutEffect(() => { pourPlanRef.current = pourPlan; }, [pourPlan]);
  const connectRef = useRef(null);

  const later = useCallback((fn, ms) => {
    const id = setTimeout(() => {
      timersRef.current.delete(id);
      fn();
    }, ms);
    timersRef.current.add(id);
  }, []);

  const onMessage = useCallback((message) => {
    if (message.kind === 'settings') setBattery(message.battery);
    const weight = message.grams;
    if (!Number.isFinite(weight)) return;
    const atMs = Date.now();
    lastWeightAtRef.current = atMs;
    samplesRef.current.push({ atMs, grams: weight });
    setGrams(weight);
    setStatus((current) => (current === 'silent' || current === 'connecting' ? 'connected' : current));
  }, []);

  const dropLink = useCallback(async () => {
    const link = linkRef.current;
    linkRef.current = null;
    if (!link) return;
    closingRef.current = true;
    await link.disconnect().catch(() => {});
    closingRef.current = false;
  }, []);

  const connect = useCallback(async (target, { isRetry = false } = {}) => {
    if (!transport || !target) return;
    if (!isRetry) retriedRef.current = false;
    await dropLink();
    setDevice(target);
    setStatus('connecting');
    try {
      const link = await transport.connect(target, {
        onMessage,
        pourPlan: pourPlanRef.current,
        onDisconnect: () => {
          if (closingRef.current || linkRef.current !== link) return;
          linkRef.current = null;
          if (retriedRef.current) {
            setStatus('lost');
            return;
          }
          retriedRef.current = true;
          setStatus('connecting');
          later(() => connectRef.current?.(target, { isRetry: true }), RECONNECT_DELAY_MS);
        },
      });
      linkRef.current = link;
      lastWeightAtRef.current = Date.now();
      setProtocol(link.protocol);
      rememberScale(target);
    } catch {
      setStatus('lost');
    }
  }, [dropLink, later, onMessage, transport]);
  useLayoutEffect(() => { connectRef.current = connect; }, [connect]);

  // Watchdog: connected but no weight for 3 s means one reconnect, then a
  // plain "connected but silent" state with a Reconnect button. No pop-ups.
  useEffect(() => {
    if (!open || !['connecting', 'connected'].includes(status) || !linkRef.current) return undefined;
    const id = setInterval(() => {
      if (!linkRef.current || Date.now() - lastWeightAtRef.current < WATCHDOG_MS) return;
      if (retriedRef.current) {
        setStatus('silent');
        return;
      }
      retriedRef.current = true;
      connectRef.current?.(device, { isRetry: true });
    }, 500);
    return () => clearInterval(id);
  }, [open, status, device, protocol]);

  // A remembered scale connects when the timer opens; everything closes with it.
  useEffect(() => {
    if (!open || !transport) return undefined;
    const remembered = readRememberedScale();
    if (remembered) connectRef.current?.(remembered);
    const timers = timersRef.current;
    return () => {
      timers.forEach(clearTimeout);
      timers.clear();
      dropLink();
      samplesRef.current = [];
      setStatus('idle');
      setGrams(null);
      setFound([]);
    };
  }, [open, transport, dropLink]);

  const stopScanRef = useRef(null);
  const stopScan = useCallback(() => {
    stopScanRef.current?.();
    stopScanRef.current = null;
    setStatus((current) => (current === 'scanning' ? 'idle' : current));
  }, []);

  const startScan = useCallback(() => {
    if (!transport) return;
    stopScanRef.current?.();
    setFound([]);
    setScanError(false);
    setStatus((current) => (['connected', 'connecting'].includes(current) ? current : 'scanning'));
    stopScanRef.current = transport.scan((result) => {
      setFound((list) => (list.some((item) => item.deviceId === result.deviceId) ? list : [...list, result]));
    }, () => {
      // Bluetooth off, not allowed, or not on this device (the simulator).
      setScanError(true);
      setStatus((current) => (current === 'scanning' ? 'idle' : current));
    });
  }, [transport]);

  useEffect(() => () => stopScanRef.current?.(), []);

  const choose = useCallback((target) => {
    stopScan();
    connect(target);
  }, [connect, stopScan]);

  // Tare zeroes the scale; samples restart so detection only sees water.
  const tare = useCallback(async () => {
    samplesRef.current = [];
    await linkRef.current?.tare();
  }, []);

  const reconnect = useCallback(() => {
    if (device) connect(device);
  }, [connect, device]);

  const release = useCallback(async () => {
    await dropLink();
    setStatus(transport ? 'idle' : 'off');
    setGrams(null);
  }, [dropLink, transport]);

  return {
    available: Boolean(transport),
    status,
    device,
    found,
    scanError,
    battery,
    grams,
    protocol,
    samplesRef,
    startScan,
    stopScan,
    choose,
    tare,
    reconnect,
    release,
  };
}
