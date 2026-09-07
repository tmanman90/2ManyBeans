import { useState } from 'react';
import { C, fonts, radius } from '../../styles/theme';
import { RuphusLifecycleCaption } from './RuphusLifecycleCaption';
import { RuphusMessage } from './RuphusMessage';
import { ArtifactRenderer } from './ArtifactRenderer';
import { RuphusOpening } from './RuphusOpening';
import { RuphusContinuePrevious } from './RuphusContinuePrevious';
import { continuePrevious, sessionPresentation, startNewChat } from '../../lib/ruphus/session';

const HARNESS_CLOCK = Date.now();
const HARNESS_STALE_AGE = 8 * 24 * 60 * 60 * 1000;
const createHarnessSession = () => ({ protocolVersion: 1, messages: [{ id: 'old-1', role: 'user', text: 'Tell me about my last cup.', createdAt: HARNESS_CLOCK - HARNESS_STALE_AGE }], contextRef: { surface: 'direct' }, ledger: { entries: [{ kind: 'evidence_read', namedCoffees: ['House Blend'] }] }, boundaryIndex: 0, lastActivityAt: HARNESS_CLOCK - HARNESS_STALE_AGE });

// Local rendered integration surface for the M1 browser contract. It uses the
// same entry, message, lifecycle, and artifact components as App/ChatTab but
// has no auth/provider dependency and cannot write Coffee data.
export function RuphusBrowserHarness({ legacy = false }) {
  const [context, setContext] = useState(null);
  const [frames, setFrames] = useState([]);
  const [focused, setFocused] = useState(false);
  const [writeCount, setWriteCount] = useState(0);
  const [lastAction, setLastAction] = useState('');
  const [proposalPending, setProposalPending] = useState(false);
  const [proposalStale, setProposalStale] = useState(false);
  const [dataLoaded, setDataLoaded] = useState(true);
  const [session, setSession] = useState(() => createHarnessSession());
  const presentation = sessionPresentation(session, { now: HARNESS_CLOCK });
  const agentEnabled = !legacy;
  const runStream = () => {
    setFrames([{ type: 'context_loading' }]);
    setTimeout(() => setFrames(prev => [...prev, { type: 'text_delta' }, { type: 'artifact_ready' }]), 0);
  };
  const artifact = { id: 'harness-proposal', type: 'recipe_proposal', status: 'proposed', coffeeId: 'bean-1', coffeeName: 'El Vergel', slotKey: 'kalita_hot', sourceRevisionId: 'revision-1', sourceHash: 'source-1', actions: ['apply_proposal', 'brew_once', 'keep_current'], before: { waterGrams: 215, coffeeGrams: 13, grindSize: { setting: '5.6' }, waterTemp: { celsius: 94 }, ratio: '1:16.5' }, after: { waterGrams: 205, coffeeGrams: 13, grindSize: { setting: '5.6' }, waterTemp: { celsius: 94 }, ratio: '1:15.8', kalitaSize: '155', steps: [{ time: '0:00', action: 'Bloom with 39g water.' }, { time: '0:30', action: 'Pour to 97g total.' }, { time: '1:15', action: 'Finish at 205g total.' }] } };
  const handleAction = ({ mode }) => { setLastAction(mode); setWriteCount(value => value + 1); };
  return <main data-ruphus-harness="true" data-agent-enabled={agentEnabled ? 'true' : 'false'} data-write-count={writeCount} data-last-action={lastAction} style={{ minHeight: '100vh', padding: 20, background: C.bg, color: C.text, fontFamily: fonts.body }}>
    <h1 style={{ fontFamily: fonts.heading }}>Ruphus browser harness</h1>
    <p data-legacy-route={legacy ? 'true' : 'false'}>{legacy ? 'Legacy Sonnet route' : 'Agent v3 dev route'}</p>
    <section aria-label="Contextual entries" style={{ display: 'grid', gap: 10 }}>
      <button type="button" data-ruphus-entry="direct" onClick={() => setContext({ surface: 'direct' })}>Open direct chat</button>
      <button type="button" data-ruphus-entry="bean-detail" onClick={() => setContext({ coffeeRef: 'bean-1', surface: 'bean_card' })}>Ask Professor Ruphus · bean detail</button>
      <button type="button" data-ruphus-entry="tasting-wizard-reveal" onClick={() => setContext({ coffeeRef: 'bean-1', surface: 'tasting_wizard' })}>Ask Professor Ruphus · tasting reveal</button>
      <button type="button" data-ruphus-hydration-toggle="true" onClick={() => setDataLoaded(value => !value)}>Toggle hydration</button>
      <button type="button" data-ruphus-make-stale="true" onClick={() => setSession(value => ({ ...value, lastActivityAt: HARNESS_CLOCK - HARNESS_STALE_AGE }))}>Make session stale</button>
      <button type="button" data-ruphus-new-chat="true" onClick={() => setSession(value => startNewChat(value, { now: HARNESS_CLOCK }))}>New chat boundary</button>
    </section>
    <RuphusOpening dataLoaded={dataLoaded} coffees={[{ name: 'House Blend', status: 'ACTIVE' }]} />
    {presentation.showContinue && <RuphusContinuePrevious session={session} firstLine={session.messages?.[0]?.text} onContinue={() => setSession(value => continuePrevious(value, { now: HARNESS_CLOCK }))} />}
    <div data-ruphus-boundary-state={presentation.state} data-ruphus-stored-messages={session.messages?.length || 0} data-ruphus-boundary-index={session.boundaryIndex || 0} data-ruphus-last-activity={session.lastActivityAt} />
    <section data-ruphus-stage="true" style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      <button type="button" data-ruphus-stream="true" onClick={runStream}>Simulate Agent stream</button>
      {frames.some(frame => frame.type === 'context_loading') && <RuphusLifecycleCaption frame={{ type: 'context_loading' }} />}
      {frames.some(frame => frame.type === 'text_delta') && <RuphusMessage text="I’m reading this cup in context." />}
      {frames.some(frame => frame.type === 'artifact_ready') && <ArtifactRenderer artifact={{ ...artifact, ...(proposalStale ? { status: 'stale' } : {}) }} onAction={handleAction} actionPending={proposalPending} />}
      {lastAction === 'apply_proposal' && <ArtifactRenderer artifact={{ type: 'action_receipt', status: 'succeeded', mode: 'apply_proposal', undoAvailable: true, executionAvailable: true, slotKey: 'kalita_hot' }} onAction={handleAction} />}
      {lastAction === 'brew_once' && <ArtifactRenderer artifact={{ id: 'trial-receipt', type: 'action_receipt', status: 'succeeded', mode: 'brew_once', promoteAvailable: true, attemptId: 'trial', coffeeId: 'bean-1', slotKey: 'kalita_hot' }} onAction={handleAction} actionPending={proposalPending} />}
      {lastAction === 'promote_attempt' && <ArtifactRenderer artifact={{ type: 'action_receipt', status: 'succeeded', mode: 'promote_attempt', undoAvailable: true }} onAction={handleAction} />}
      <button type="button" data-proposal-pending-toggle onClick={() => setProposalPending(value => !value)}>Toggle pending action</button>
      <button type="button" data-proposal-stale-toggle onClick={() => setProposalStale(value => !value)}>Toggle stale proposal</button>
      <input aria-label="Harness composer" data-keyboard-input="true" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      <div data-keyboard-visible={focused ? 'true' : 'false'} style={{ paddingBottom: focused ? 260 : 12 }}>Keyboard padding contract</div>
    </section>
  </main>;
}
