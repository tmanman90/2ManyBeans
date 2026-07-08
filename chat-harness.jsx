// Chat "Ruphus's study" verification harness — renders the real ChatTab with a fixed
// PRO subscription value (so handleSend reaches the optimistic user bubble + thinking
// indicator) and mock beans/tastings. No live AI key — the send call errors after the
// bubbles render, which the verify script accounts for. Driven by scripts/verify-chat.mjs.
import { createRoot } from 'react-dom/client';
import './src/styles/global.css';
import { UserPreferencesProvider } from './src/hooks/useUserProfile';
import { SubscriptionContext } from './src/contexts/SubscriptionContext';
import { PaywallProvider } from './src/hooks/usePaywall.jsx';
import { AuthContext } from './src/contexts/AuthContext';
import { ChatTab } from './src/tabs/ChatTab';

const PRO = {
  hasPro: true, hasUltra: false, plan: 'pro', status: 'active', cancelAtPeriodEnd: false,
  freeUsage: { aiScans: 0, tasteTests: 0, productShots: 0 },
  loading: false, firestoreLoaded: true, rcHydrated: true,
};

const beans = [
  { id: 'b1', roaster: 'Arcane', name: 'Kotowa Estate', origin: 'Panama', process: 'Washed', status: 'ACTIVE', jarSlot: 1, openDate: '2026-06-25', roastDate: '2026-06-10', degasMin: 7, peakStart: 14, peakEnd: 45 },
  { id: 'b2', roaster: 'Nyeri Labs', name: 'Kiawamururu', origin: 'Kenya', process: 'Washed', status: 'ACTIVE', jarSlot: 2, openDate: '2026-06-28', roastDate: '2026-06-12', degasMin: 7, peakStart: 14, peakEnd: 45, bagNotes: 'Blackcurrant, citrus, molasses' },
  { id: 'b3', roaster: 'Onyx', name: 'Geometry Blend', origin: 'Ethiopia', process: 'Natural', status: 'SEALED' },
];
const tastings = [{ id: 't1', beanId: 'b1', date: '2026-06-20', rating: 5, oneWord: 'Silky' }];
const noop = () => {};
const noopAsync = async () => {};

window.__SPY__ = { startedTasting: null, navigatedToTasting: 0, addedBeans: [], updatedBeans: [] };
const streamReply = [
  'Good morning. ', 'Jar 2 is right in its peak window, ',
  'so I would brew the Kiawamururu today. ', 'Expect that blackcurrant ',
  'acidity to be at its brightest ', 'around a 1:16 ratio. ',
  'Slurp the first sip ', 'while it is warm, not hot, ', 'and tell me ',
  'what you find.',
];
const recipeMarker = '---RECIPE_CARD---{"title":"Kiawamururu Morning Pour","method":"V60","ratio":"1:16","temp":93,"grind":"finer: Ode 4.3","steps":["Bloom 40g, 35s","Pour to 150g by 1:00","Pour to 250g by 1:45","Drawdown by 2:45"],"reasoning":"Peak-window Kenyan wants bright extraction with a controlled finish."}---END_RECIPE---';
const searchMarkerParts = [
  '---NEEDS_',
  'SEARCH---{"query":"best kenyan releases 2026"}',
  '---END_SEARCH---',
];
const searchReply = [
  'I found one current Kenyan release worth watching. ',
  'Start with the washed Nyeri lot while it is fresh, ',
  'then compare it against a brighter Kirinyaga if you want more citrus snap.',
];
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

function inlineStreamResponse(parts, { errorMid = false } = {}) {
  const encoder = new TextEncoder();
  return new Response(new ReadableStream({
    async start(controller) {
      let i = 0;
      for (const text of parts) {
        controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'delta', text })}\n`));
        i += 1;
        if (errorMid && i === 3) {
          controller.enqueue(encoder.encode(`${JSON.stringify({ type: 'error', code: 'overloaded', message: 'Upstream overloaded mid-stream.' })}\n`));
          controller.close();
          return;
        }
        await sleep(120);
      }
      controller.enqueue(encoder.encode(`${JSON.stringify({
        type: 'usage',
        usage: { input_tokens: 420, output_tokens: 96, cache_read_input_tokens: 380, cache_creation_input_tokens: 0 },
        stop_reason: 'end_turn',
      })}\n`));
      controller.close();
    },
  }), { status: 200, headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8' } });
}

window.__STREAM_TEST__ = {
  enabled: new URLSearchParams(window.location.search).get('stream') === '1',
  inline: new URLSearchParams(window.location.search).get('inline') === '1',
  searchCount: 0,
};
if (window.__STREAM_TEST__.enabled) {
  const originalFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    const url = new URL(typeof input === 'string' ? input : input.url, window.location.href);
    if (url.pathname === '/api/claude-stream') {
      const params = new URLSearchParams(window.location.search);
      if (window.__STREAM_TEST__.inline) {
        const withSearch = params.get('search') === '1';
        if (withSearch) window.__STREAM_TEST__.searchCount += 1;
        const parts = withSearch && window.__STREAM_TEST__.searchCount === 1
          ? searchMarkerParts
          : (withSearch ? searchReply : (params.get('recipe') ? [...streamReply, '\n\n', recipeMarker] : streamReply));
        return inlineStreamResponse(parts, { errorMid: params.get('error') === 'mid' });
      }
      const target = new URL('http://localhost:5197/api/claude-stream');
      if (params.get('error')) target.searchParams.set('error', params.get('error'));
      if (params.get('recipe')) target.searchParams.set('recipe', params.get('recipe'));
      if (params.get('search')) target.searchParams.set('search', params.get('search'));
      return originalFetch(target.toString(), init);
    }
    if (url.pathname === '/api/gemini' && new URLSearchParams(window.location.search).get('search') === '1') {
      if (window.__STREAM_TEST__.inline) {
        return Promise.resolve(new Response(JSON.stringify({
          text: 'Kenyan release roundup: washed Nyeri lots are showing blackcurrant, citrus, and molasses this season.',
          groundingMetadata: {
            groundingChunks: [
              { web: { title: 'Kenyan Releases 2026', uri: 'https://example.com/kenya-2026' } },
              { web: { title: 'Bad Script', uri: 'javascript:alert(1)' } },
              { web: { title: 'App Link', uri: 'someapp://x' } },
            ],
          },
        }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
      }
      return originalFetch('http://localhost:5197/api/gemini', init);
    }
    return originalFetch(input, init);
  };
}
const addBean = async (bean) => {
  window.__SPY__.addedBeans.push(bean);
  return 'new-bean-id';
};
const updateBean = async (beanId, updates) => {
  window.__SPY__.updatedBeans.push({ beanId, updates });
  await new Promise(resolve => setTimeout(resolve, 300));
};
const onStartTastingSession = (beanId) => { window.__SPY__.startedTasting = beanId; };
const onNavigateToTasting = () => { window.__SPY__.navigatedToTasting += 1; };
const chatStorageKey = (uid) => `chat_${uid}`;
const loadHarnessSession = () => {
  const raw = localStorage.getItem(chatStorageKey('harness-user'));
  return raw ? JSON.parse(raw) : null;
};
const chatSessionAdapter = {
  loadRemote: async () => loadHarnessSession(),
  saveRemote: async (session) => {
    localStorage.setItem(chatStorageKey('harness-user'), JSON.stringify(session));
  },
  deleteRemote: async () => {},
  loadLocal: async () => loadHarnessSession(),
  saveLocal: async (session) => {
    localStorage.setItem(chatStorageKey('harness-user'), JSON.stringify(session));
  },
  deleteLocal: async () => {
    localStorage.removeItem(chatStorageKey('harness-user'));
  },
};

createRoot(document.getElementById('root')).render(
  <AuthContext value={{ user: null, logOut: () => {} }}>
    <SubscriptionContext value={PRO}>
      <PaywallProvider>
        <UserPreferencesProvider value={{ preferences: { brewMethod: 'aiden', canisterCount: 3 } }}>
          <ChatTab
            beans={beans} tastings={tastings}
            addBean={addBean} updateBean={updateBean} addTasting={noopAsync} updateTasting={noopAsync}
            profile={{ displayName: 'Tal M' }} uid="harness-user"
            chatSessionAdapter={chatSessionAdapter}
            isActive={true} onStartTastingSession={onStartTastingSession} onNavigateToTasting={onNavigateToTasting} isDemo={false} onDemoAction={noop}
          />
        </UserPreferencesProvider>
      </PaywallProvider>
    </SubscriptionContext>
  </AuthContext>
);
