import { buildSourceContextHash, normalizeSourceInsights } from './sourceInsights.js';
import { MARKER_FAMILIES } from './streamChat.js';

const BEAN_SCAN_MARKER = MARKER_FAMILIES.find(family => family.key === 'beanScan');
const BEAN_SCAN_RE = new RegExp(`${BEAN_SCAN_MARKER.open}([\\s\\S]*?)${BEAN_SCAN_MARKER.close}`);

export function parseBeanScan(text, { stopReason } = {}) {
  const source = String(text || '');
  const openIdx = source.indexOf(BEAN_SCAN_MARKER.open);
  if (openIdx === -1) return { cleanText: source, scannedBean: null, scanMarkerStripped: false };

  const match = source.match(BEAN_SCAN_RE);
  if (!match) {
    let cleanText = source.slice(0, openIdx).trim();
    if (stopReason === 'max_tokens') {
      cleanText = `${cleanText}\n\n(The scan ran long — send the photos again and I'll retry.)`.trim();
    }
    return { cleanText, scannedBean: null, scanMarkerStripped: true };
  }

  try {
    const json = match[1].trim();
    const scannedBean = JSON.parse(json);
    scannedBean.sourceInsights = normalizeSourceInsights(scannedBean.sourceInsights);
    const sourceContextHash = buildSourceContextHash(scannedBean);
    if (sourceContextHash) scannedBean.sourceContextHash = sourceContextHash;
    const cleanText = source.replace(BEAN_SCAN_RE, '').trim();
    return { cleanText, scannedBean, scanMarkerStripped: true };
  } catch {
    const cleanText = source.replace(BEAN_SCAN_RE, '').trim();
    return { cleanText, scannedBean: null, scanMarkerStripped: true };
  }
}

// Strip base64 image data from older API messages to prevent memory bloat
export function trimApiMessages(messages, keepRecent = 6) {
  if (messages.length <= keepRecent) return messages;
  return messages.map((msg, i) => {
    if (i >= messages.length - keepRecent) return msg;
    if (Array.isArray(msg.content)) {
      return {
        ...msg,
        content: msg.content.map(block =>
          block.type === 'image' ? { type: 'text', text: '[image]' } : block
        ),
      };
    }
    return msg;
  });
}
