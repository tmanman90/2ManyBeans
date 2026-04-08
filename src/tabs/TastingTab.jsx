// Tasting tab — ported from prototype lines 500-789
// 3 modes: list, form, chat
import { useState, useEffect, useRef } from 'react';
import { MessageCircle, Plus, Check, Send, Pencil, Trash2, Share2 } from 'lucide-react';
import { C, fonts, journalCard } from '../styles/theme';
import { today } from '../lib/peakStatus';
import { buildTastingSystemPrompt, sendTastingMessage } from '../lib/claude';
import { convertTastingScores } from '../lib/professorRuphus';
import { StarRating } from '../components/StarRating';
import { Btn } from '../components/Btn';
import { TastingForm } from '../components/TastingForm';
import { TastingShareCard, captureShareCard, offScreenStyle } from '../components/ShareCard';
import { shareImage } from '../lib/share';

export const TastingTab = ({ beans, tastings, onAddTasting, onUpdateTasting, onDeleteTasting }) => {
  const active = beans.filter(b => b.status === 'ACTIVE');
  const [sel, setSel] = useState(active[0]?.id || '');
  // Background tasting score conversion for spider chart overlay
  const convertScoresInBackground = (tastingId, tastingData) => {
    const bean = beans.find(b => b.id === tastingData.beanId);
    if (!bean) return;
    // Only convert if there's meaningful text to convert
    const hasText = tastingData.aroma || tastingData.acidity || tastingData.sweetness ||
      tastingData.body || tastingData.firstSip || tastingData.finish;
    if (!hasText) return;
    convertTastingScores(tastingData, bean)
      .then(scores => { onUpdateTasting(tastingId, { tastingScores: scores }); })
      .catch(err => console.log('Score conversion skipped:', err.message));
  };
  const [mode, setMode] = useState('list');
  const [sortBy, setSortBy] = useState('rating');
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);

  // Chat tasting state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  const [chatLoading, setChatLoading] = useState(false);
  const [chatExtracted, setChatExtracted] = useState(null);
  const chatScrollRef = useRef(null);

  const tastingFields = {
    aroma: 'Aroma', firstSip: 'First sip', acidity: 'Acidity', sweetness: 'Sweetness',
    body: 'Body', finish: 'Finish', oneWord: 'One-word score', notes: 'Notes', changeTomorrow: 'Change tomorrow?',
  };
  const inputStyle = {
    width: '100%', padding: '8px 10px', borderRadius: 8,
    border: `1px solid ${C.border}`, fontFamily: fonts.body,
    fontSize: 16, background: C.bg, color: C.text, boxSizing: 'border-box',
  };

  useEffect(() => {
    if (chatScrollRef.current) chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
  }, [chatMessages]);

  const getBeanName = (id) => {
    const b = beans.find(x => x.id === id);
    return b ? `${b.name} (${b.roaster})` : 'Unknown';
  };

  const handleFormSubmit = async (formData) => {
    const tastingData = { date: today(), ...formData };
    try {
      const tastingId = await onAddTasting(tastingData);
      if (tastingId) convertScoresInBackground(tastingId, tastingData);
      setMode('list');
    } catch (err) {
      alert("Couldn't save tasting. Check your connection and try again.");
    }
  };

  const sorted = [...tastings].sort((a, b) => {
    if (sortBy === 'rating') return (b.rating || 0) - (a.rating || 0);
    return b.date > a.date ? 1 : -1;
  });

  const updateRating = async (id, rating) => {
    try { await onUpdateTasting(id, { rating }); }
    catch { alert("Couldn't update rating. Check your connection."); }
  };

  const startEdit = (t) => { setEditingId(t.id); setEditForm({ ...t }); };
  const saveEdit = async () => {
    if (!editForm) return;
    const { id, createdAt, updatedAt, ...fields } = editForm;
    try {
      await onUpdateTasting(editingId, fields);
      setEditingId(null);
      setEditForm(null);
    } catch {
      alert("Couldn't save changes. Check your connection and try again.");
    }
  };
  const cancelEdit = () => { setEditingId(null); setEditForm(null); };

  // Build the tasting chat opening message for a given bean
  const buildOpeningMessage = (bean) => {
    const beanName = bean ? `${bean.name} (${bean.roaster})` : 'your coffee';
    const beanContext = bean ? [bean.process, bean.origin].filter(Boolean) : [];
    const contextLine = beanContext.length > 0
      ? ` This is a ${beanContext.join(' coffee from ')}.`
      : '';
    return `Let's taste ${beanName}!${contextLine}\n\nStep 1: Smell it first. Bring the cup to your nose and breathe in slowly. What do you get?\n\n- Fruity (berries, citrus, tropical)?\n- Floral (jasmine, rose, tea-like)?\n- Sweet (chocolate, caramel, honey)?\n- Nutty or earthy?\n- Funky or fermented?\n\nOr just describe it in your own words.`;
  };

  // Chat tasting flow
  const startChat = () => {
    const bean = beans.find(b => b.id === sel);
    setMode('chat');
    setChatMessages([{ role: 'assistant', content: buildOpeningMessage(bean) }]);
    setChatExtracted(null);
  };

  // Reset chat when bean changes mid-session
  useEffect(() => {
    if (mode === 'chat' && sel && chatMessages.length > 0) {
      const bean = beans.find(b => b.id === sel);
      setChatMessages([{ role: 'assistant', content: buildOpeningMessage(bean) }]);
      setChatExtracted(null);
    }
  }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps -- intentionally only resets on selection change, not data changes

  const handleChatSend = async () => {
    if (!chatInput.trim() || chatLoading) return;
    const userMsg = { role: 'user', content: chatInput.trim() };
    setChatMessages(prev => [...prev, userMsg]);
    setChatInput('');
    setChatLoading(true);

    try {
      const selectedBean = beans.find(b => b.id === sel);
      const beanName = sel ? getBeanName(sel) : 'unknown bean';
      const systemPrompt = buildTastingSystemPrompt(beanName, beans, selectedBean, tastings);
      const history = [...chatMessages.filter(m => m.role !== 'system'), userMsg];
      const text = await sendTastingMessage(systemPrompt, history);

      const extractMatch = text.match(/---EXTRACT---\s*([\s\S]*?)\s*---END---/);
      if (extractMatch) {
        try {
          const extracted = JSON.parse(extractMatch[1].trim());
          // Auto-match bean if AI extracted a beanName
          if (extracted.beanName) {
            const match = beans.find(b => b.name.toLowerCase() === extracted.beanName.toLowerCase());
            if (match) setSel(match.id);
          }
          setChatExtracted(extracted);
          const cleanText = text.replace(/---EXTRACT---[\s\S]*?---END---/, '').trim();
          setChatMessages(prev => [...prev, { role: 'assistant', content: cleanText || 'Great session! Review below and save when ready.' }]);
        } catch {
          setChatMessages(prev => [...prev, { role: 'assistant', content: text.replace(/---EXTRACT---[\s\S]*?---END---/, '').trim() }]);
        }
      } else {
        setChatMessages(prev => [...prev, { role: 'assistant', content: text }]);
      }
    } catch {
      setChatMessages(prev => [...prev, { role: 'assistant', content: "Couldn't reach the AI. Try again." }]);
    }
    setChatLoading(false);
  };

  const saveChatTasting = async () => {
    if (!chatExtracted || !sel) return;
    const tastingData = { beanId: sel, date: today(), ...chatExtracted, rating: chatExtracted.rating || null };
    try {
      const tastingId = await onAddTasting(tastingData);
      if (tastingId) convertScoresInBackground(tastingId, tastingData);
      setChatExtracted(null);
      setChatMessages([]);
      setMode('list');
    } catch (err) {
      alert("Couldn't save tasting. Check your connection and try again.");
    }
  };

  // Share tasting state
  const [sharingId, setSharingId] = useState(null);
  const shareCardRef = useRef(null);
  const shareDataRef = useRef(null);

  const handleShareTasting = async (tasting) => {
    if (sharingId) return;
    const bean = beans.find(b => b.id === tasting.beanId);
    shareDataRef.current = { tasting, bean };
    setSharingId(tasting.id);
    // Wait for render of off-screen card
    await new Promise(r => setTimeout(r, 50));
    try {
      const dataUrl = await captureShareCard(shareCardRef);
      if (!dataUrl) return;
      const beanName = bean ? `${bean.name} by ${bean.roaster}` : 'my coffee';
      await shareImage(dataUrl, `My tasting of ${beanName} on 2manybeans`);
    } catch (e) {
      if (e.name !== 'AbortError') console.error('Share failed:', e);
    } finally {
      setSharingId(null);
      shareDataRef.current = null;
    }
  };

  const accentBar = {
    width: 40, height: 3, background: C.accentLight, borderRadius: 2, marginBottom: 14,
  };

  return (
    <div>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
        <div>
          <div style={{ fontFamily: fonts.title, fontSize: 30, color: C.text }}>Tasting Log</div>
        </div>
        {mode === 'list' ? (
          <div style={{ display: 'flex', gap: 6 }}>
            <Btn variant="ghost" onClick={startChat} style={{ fontSize: 12, padding: '6px 10px' }}>
              <MessageCircle size={13} /> Chat It
            </Btn>
            <Btn variant="primary" onClick={() => setMode('form')} style={{ fontSize: 12, padding: '6px 10px' }}>
              <Plus size={13} /> Log
            </Btn>
          </div>
        ) : (
          <Btn variant="ghost" onClick={() => { setMode('list'); setChatMessages([]); setChatExtracted(null); }}>Cancel</Btn>
        )}
      </div>
      <div style={accentBar} />
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>{tastings.length} tastings logged</div>

      {/* Bean selector for chat mode */}
      {mode === 'chat' && (
        <div style={{ marginBottom: 14 }}>
          <label style={{ fontSize: 12, fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: 4 }}>Bean</label>
          <select value={sel} onChange={e => setSel(e.target.value)} style={inputStyle}>
            {active.map(b => <option key={b.id} value={b.id}>{b.name} (#{b.jarSlot})</option>)}
          </select>
        </div>
      )}

      {/* Form Mode */}
      {mode === 'form' && (
        <TastingForm beans={active} onSubmit={handleFormSubmit} submitLabel="Save Tasting" />
      )}

      {/* Chat Mode */}
      {mode === 'chat' && (
        <div style={{ ...journalCard, padding: 0, overflow: 'hidden' }}>
          <div ref={chatScrollRef} style={{ maxHeight: 320, overflowY: 'auto', padding: 16 }}>
            {chatMessages.map((m, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: m.role === 'user' ? 'flex-end' : 'flex-start', marginBottom: 8 }}>
                <div style={{
                  maxWidth: '80%', padding: '10px 14px', borderRadius: 14, fontSize: 14, lineHeight: 1.5,
                  background: m.role === 'user' ? C.accent : C.cream,
                  color: m.role === 'user' ? '#fff' : C.text,
                  borderBottomRightRadius: m.role === 'user' ? 4 : 14,
                  borderBottomLeftRadius: m.role === 'user' ? 14 : 4,
                  whiteSpace: 'pre-wrap',
                }}>
                  {m.content}
                </div>
              </div>
            ))}
            {chatLoading && <div style={{ fontSize: 13, color: C.textMuted, padding: '4px 0' }}>Thinking...</div>}
          </div>

          {chatExtracted && (
            <div style={{ padding: '12px 16px', borderTop: `1px solid ${C.border}`, background: C.greenBg }}>
              <div style={{ fontSize: 12, fontWeight: 600, color: C.green, marginBottom: 8 }}>✓ Tasting captured — review & save</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                <StarRating value={chatExtracted.rating || 0} onChange={r => setChatExtracted(p => ({ ...p, rating: r }))} size={22} />
                {chatExtracted.oneWord && <span style={{ fontSize: 13, color: C.text }}>"{chatExtracted.oneWord}"</span>}
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', fontSize: 12, color: C.textMuted, marginBottom: 8 }}>
                {chatExtracted.aroma && <span>Aroma: {chatExtracted.aroma}</span>}
                {chatExtracted.acidity && <span>Acidity: {chatExtracted.acidity}</span>}
                {chatExtracted.body && <span>Body: {chatExtracted.body}</span>}
                {chatExtracted.finish && <span>Finish: {chatExtracted.finish}</span>}
              </div>
              {chatExtracted.notes && <div style={{ fontSize: 12, color: C.textMuted, marginBottom: 8 }}>{chatExtracted.notes}</div>}
              <Btn variant="primary" onClick={saveChatTasting} style={{ width: '100%', justifyContent: 'center' }}>
                <Check size={14} /> Save Tasting
              </Btn>
            </div>
          )}

          {!chatExtracted && (
            <div style={{ display: 'flex', gap: 8, padding: '10px 12px', borderTop: `1px solid ${C.border}` }}>
              <input
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Describe your cup..."
                onKeyDown={e => e.key === 'Enter' && handleChatSend()}
                onFocus={e => { const t = e.target; setTimeout(() => t.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350); }}
                style={{ ...inputStyle, flex: 1 }}
              />
              <Btn variant="primary" onClick={handleChatSend} disabled={chatLoading} style={{ padding: '8px 12px' }}>
                <Send size={14} />
              </Btn>
            </div>
          )}
        </div>
      )}

      {/* Sort Controls */}
      {mode === 'list' && tastings.length > 0 && (
        <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
          {[['rating', '★ Top Rated'], ['date', '📅 Recent']].map(([k, l]) => (
            <Btn key={k} variant={sortBy === k ? 'primary' : 'ghost'} onClick={() => setSortBy(k)} style={{ fontSize: 12, padding: '5px 12px' }}>
              {l}
            </Btn>
          ))}
        </div>
      )}

      {/* Tasting Cards */}
      {mode === 'list' && sorted.map(t => {
        const isEditing = editingId === t.id;

        if (isEditing && editForm) return (
          <div key={t.id} style={{ ...journalCard, border: `1px solid ${C.accent}`, borderLeft: `3px solid ${C.accent}`, padding: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
              <div style={{ flex: 1, marginRight: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: 3 }}>Bean</label>
                <select value={editForm.beanId} onChange={e => setEditForm(p => ({ ...p, beanId: e.target.value }))} style={inputStyle}>
                  {beans.map(b => <option key={b.id} value={b.id}>{b.name} ({b.roaster})</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', gap: 6, paddingTop: 16 }}>
                <Btn variant="primary" onClick={saveEdit} style={{ fontSize: 11, padding: '4px 10px' }}><Check size={12} /> Save</Btn>
                <Btn variant="ghost" onClick={cancelEdit} style={{ fontSize: 11, padding: '4px 10px' }}>Cancel</Btn>
              </div>
            </div>
            <div style={{ marginBottom: 10 }}>
              <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: 4 }}>Rating</label>
              <StarRating value={editForm.rating || 0} onChange={r => setEditForm(p => ({ ...p, rating: r }))} size={26} />
            </div>
            {Object.entries(tastingFields).map(([key, label]) => (
              <div key={key} style={{ marginBottom: 8 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: C.textMuted, display: 'block', marginBottom: 3 }}>{label}</label>
                {key === 'notes' ? (
                  <textarea value={editForm[key] || ''} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                ) : (
                  <input value={editForm[key] || ''} onChange={e => setEditForm(p => ({ ...p, [key]: e.target.value }))} style={inputStyle} />
                )}
              </div>
            ))}
          </div>
        );

        return (
          <div key={t.id} style={journalCard}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
              <div style={{ fontFamily: fonts.heading, fontSize: 16, color: C.text }}>{getBeanName(t.beanId)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <span style={{ fontSize: 12, color: C.textMuted }}>{t.date}</span>
                <span onClick={() => handleShareTasting(t)} style={{ cursor: 'pointer', color: C.accent, padding: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', opacity: sharingId === t.id ? 0.5 : 1 }}>
                  <Share2 size={14} />
                </span>
                <span onClick={() => startEdit(t)} style={{ cursor: 'pointer', color: C.textMuted, padding: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Pencil size={14} />
                </span>
                <span onClick={async () => { if (confirm('Delete this tasting?')) try { await onDeleteTasting(t.id); } catch { alert("Couldn't delete. Check your connection."); } }} style={{ cursor: 'pointer', color: C.red, padding: 10, display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
                  <Trash2 size={14} />
                </span>
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
              <StarRating value={t.rating || 0} onChange={r => updateRating(t.id, r)} size={18} />
              {t.oneWord && <span style={{ fontSize: 12, color: C.textMuted }}>"{t.oneWord}"</span>}
            </div>
            {t.notes && <div style={{ fontSize: 13, color: C.textMuted, marginTop: 4 }}>{t.notes}</div>}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '2px 10px', marginTop: 6, fontSize: 12, color: C.textLight }}>
              {t.aroma && <span>Aroma: {t.aroma}</span>}
              {t.acidity && <span>Acidity: {t.acidity}</span>}
              {t.body && <span>Body: {t.body}</span>}
              {t.finish && <span>Finish: {t.finish}</span>}
            </div>
          </div>
        );
      })}

      {mode === 'list' && tastings.length === 0 && (
        <div style={{ textAlign: 'center', color: C.textMuted, padding: 40 }}>No tastings yet. Brew something!</div>
      )}

      {/* Off-screen share card for capture */}
      {sharingId && shareDataRef.current && (
        <div style={offScreenStyle}>
          <TastingShareCard
            ref={shareCardRef}
            bean={shareDataRef.current.bean}
            tasting={shareDataRef.current.tasting}
          />
        </div>
      )}
    </div>
  );
};
