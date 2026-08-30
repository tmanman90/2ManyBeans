import { useState } from 'react';
import { C, fonts, radius } from '../../styles/theme';
import { RuphusLifecycleCaption } from './RuphusLifecycleCaption';
import { RuphusMessage } from './RuphusMessage';
import { ArtifactRenderer } from './ArtifactRenderer';
import { RuphusOpening } from './RuphusOpening';
import { RuphusContinuePrevious } from './RuphusContinuePrevious';
import { continuePrevious, sessionPresentation, startNewChat } from '../../lib/ruphus/session';

// Local rendered integration surface for the M1 browser contract. It uses the
// same entry, message, lifecycle, and artifact components as App/ChatTab but
// has no auth/provider dependency and cannot write Coffee data.
export function RuphusBrowserHarness({ legacy = false }) {
  const [context, setContext] = useState(null);
  const [frames, setFrames] = useState([]);
  const [focused, setFocused] = useState(false);
  const [writeCount, setWriteCount] = useState(0);
  const [dataLoaded, setDataLoaded] = useState(true);
  const [session, setSession] = useState({ protocolVersion: 1, messages: [{ id: 'old-1', role: 'user', text: 'Tell me about my last cup.', createdAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }], contextRef: { surface: 'direct' }, ledger: { entries: [{ kind: 'evidence_read', namedCoffees: ['House Blend'] }] }, boundaryIndex: 0, lastActivityAt: Date.now() - 8 * 24 * 60 * 60 * 1000 });
  const presentation = sessionPresentation(session);
  const agentEnabled = !legacy;
  const runStream = () => {
    setFrames([{ type: 'context_loading' }]);
    setTimeout(() => setFrames(prev => [...prev, { type: 'text_delta' }, { type: 'artifact_ready' }]), 0);
  };
  const artifact = { id: 'harness-proposal', type: 'recipe_proposal', status: 'proposed', before: { ratio: 16 }, after: { ratio: 16.5 } };
  return <main data-ruphus-harness="true" data-agent-enabled={agentEnabled ? 'true' : 'false'} data-write-count={writeCount} style={{ minHeight: '100vh', padding: 20, background: C.bg, color: C.text, fontFamily: fonts.body }}>
    <h1 style={{ fontFamily: fonts.heading }}>Ruphus browser harness</h1>
    <p data-legacy-route={legacy ? 'true' : 'false'}>{legacy ? 'Legacy Sonnet route' : 'Agent v3 dev route'}</p>
    <section aria-label="Contextual entries" style={{ display: 'grid', gap: 10 }}>
      <button type="button" data-ruphus-entry="direct" onClick={() => setContext({ surface: 'direct' })}>Open direct chat</button>
      <button type="button" data-ruphus-entry="bean-detail" onClick={() => setContext({ coffeeRef: 'bean-1', surface: 'bean_card' })}>Ask Professor Ruphus · bean detail</button>
      <button type="button" data-ruphus-entry="tasting-wizard-reveal" onClick={() => setContext({ coffeeRef: 'bean-1', surface: 'tasting_wizard' })}>Ask Professor Ruphus · tasting reveal</button>
      <button type="button" data-ruphus-hydration-toggle="true" onClick={() => setDataLoaded(value => !value)}>Toggle hydration</button>
      <button type="button" data-ruphus-make-stale="true" onClick={() => setSession(value => ({ ...value, lastActivityAt: Date.now() - 8 * 24 * 60 * 60 * 1000 }))}>Make session stale</button>
      <button type="button" data-ruphus-new-chat="true" onClick={() => setSession(value => startNewChat(value))}>New chat boundary</button>
    </section>
    <RuphusOpening dataLoaded={dataLoaded} coffees={[{ name: 'House Blend', status: 'ACTIVE' }]} />
    {presentation.showContinue && <RuphusContinuePrevious session={session} firstLine={session.messages?.[0]?.text} onContinue={() => setSession(value => continuePrevious(value))} />}
    <div data-ruphus-boundary-state={presentation.state} data-ruphus-stored-messages={session.messages?.length || 0} data-ruphus-boundary-index={session.boundaryIndex || 0} />
    <section data-ruphus-stage="true" style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      <button type="button" data-ruphus-stream="true" onClick={runStream}>Simulate Agent stream</button>
      {frames.some(frame => frame.type === 'context_loading') && <RuphusLifecycleCaption frame={{ type: 'context_loading' }} />}
      {frames.some(frame => frame.type === 'text_delta') && <RuphusMessage text="I’m reading this cup in context." />}
      {frames.some(frame => frame.type === 'artifact_ready') && <ArtifactRenderer artifact={artifact} />}
      <input aria-label="Harness composer" data-keyboard-input="true" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      <div data-keyboard-visible={focused ? 'true' : 'false'} style={{ paddingBottom: focused ? 260 : 12 }}>Keyboard padding contract</div>
      <button type="button" data-command-write="true" disabled onClick={() => setWriteCount(value => value + 1)}>Apply change (unavailable in M1)</button>
    </section>
  </main>;
}
