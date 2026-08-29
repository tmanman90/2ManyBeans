import { useState } from 'react';
import { C, fonts, radius } from '../../styles/theme';
import { RuphusContextHeader } from './RuphusContextHeader';
import { RuphusLifecycleCaption } from './RuphusLifecycleCaption';
import { RuphusMessage } from './RuphusMessage';
import { ArtifactRenderer } from './ArtifactRenderer';
import { DataGapCard } from './artifacts/DataGapCard';

// Local rendered integration surface for the M1 browser contract. It uses the
// same entry, message, lifecycle, and artifact components as App/ChatTab but
// has no auth/provider dependency and cannot write Coffee data.
export function RuphusBrowserHarness({ legacy = false }) {
  const [context, setContext] = useState(null);
  const [frames, setFrames] = useState([]);
  const [chosenSymptom, setChosenSymptom] = useState('');
  const [focused, setFocused] = useState(false);
  const [writeCount, setWriteCount] = useState(0);
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
      <button type="button" data-ruphus-entry="bean-detail" onClick={() => setContext({ coffeeId: 'bean-1', coffeeName: 'House Blend', method: 'v60', slotKey: 'v60_hot' })}>Ask Professor Ruphus · bean detail</button>
      <button type="button" data-ruphus-entry="tasting-wizard-reveal" onClick={() => setContext({ coffeeId: 'bean-1', coffeeName: 'House Blend', method: 'v60', slotKey: 'v60_hot' })}>Ask Professor Ruphus · tasting reveal</button>
    </section>
    <RuphusContextHeader context={context} onClear={() => setContext(null)} />
    <section data-ruphus-stage="true" style={{ display: 'grid', gap: 10, marginTop: 16 }}>
      <button type="button" data-ruphus-stream="true" onClick={runStream}>Simulate Agent stream</button>
      {frames.some(frame => frame.type === 'context_loading') && <RuphusLifecycleCaption frame={{ type: 'context_loading' }} />}
      {frames.some(frame => frame.type === 'text_delta') && <RuphusMessage text="I’m reading this cup in context." />}
      {frames.some(frame => frame.type === 'artifact_ready') && <ArtifactRenderer artifact={artifact} />}
      <DataGapCard title="What did you notice?" options={['Bitter', 'Sour', 'Thin'].map(value => ({ value, label: value }))} onSelect={option => setChosenSymptom(option.value)} />
      {chosenSymptom && <output data-symptom-choice="true">{chosenSymptom}</output>}
      <input aria-label="Harness composer" data-keyboard-input="true" onFocus={() => setFocused(true)} onBlur={() => setFocused(false)} />
      <div data-keyboard-visible={focused ? 'true' : 'false'} style={{ paddingBottom: focused ? 260 : 12 }}>Keyboard padding contract</div>
      <button type="button" data-command-write="true" disabled onClick={() => setWriteCount(value => value + 1)}>Apply change (unavailable in M1)</button>
    </section>
  </main>;
}
