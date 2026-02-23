// Chat tab — ported from prototype lines 793-893
import { useState, useEffect, useRef } from 'react';
import { Send } from 'lucide-react';
import { C, fonts } from '../styles/theme';
import { buildChatContext, sendChatMessage } from '../lib/claude';

export const ChatTab = ({ beans, tastings }) => {
  const [messages, setMessages] = useState([
    { role: 'assistant', content: "Hey Tal! Ask me anything about your rotation, inventory, or what to brew next. I can see your full coffee state." },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const scrollRef = useRef(null);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

  const handleSend = async () => {
    if (!input.trim() || loading) return;
    const userMsg = { role: 'user', content: input.trim() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const systemPrompt = buildChatContext(beans, tastings);
      const history = [...messages.filter(m => m.role !== 'system'), userMsg];
      const text = await sendChatMessage(systemPrompt, history);
      setMessages(prev => [...prev, { role: 'assistant', content: text }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: "Couldn't reach the AI. Try again in a sec." }]);
    }
    setLoading(false);
  };

  const accentBar = {
    width: 40, height: 3, background: C.accentLight, borderRadius: 2, marginBottom: 14,
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)', minHeight: 400 }}>
      <div style={{ fontFamily: fonts.title, fontSize: 30, color: C.text, marginBottom: 4 }}>Coffee Chat</div>
      <div style={accentBar} />
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 12 }}>AI with your real inventory data</div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', marginBottom: 12, display: 'flex', flexDirection: 'column', gap: 8 }}>
        {messages.map((m, i) => (
          <div
            key={i}
            style={{
              alignSelf: m.role === 'user' ? 'flex-end' : 'flex-start',
              maxWidth: '85%',
              background: m.role === 'user' ? C.accent : C.cream,
              color: m.role === 'user' ? '#fff' : C.text,
              borderRadius: m.role === 'user' ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
              padding: '10px 14px',
              fontSize: 14,
              lineHeight: 1.5,
              border: m.role === 'user' ? 'none' : `1px solid ${C.borderLight}`,
              whiteSpace: 'pre-wrap',
            }}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div style={{
            alignSelf: 'flex-start',
            background: C.cream,
            border: `1px solid ${C.borderLight}`,
            borderRadius: '16px 16px 16px 4px',
            padding: '10px 14px',
            fontSize: 14,
            color: C.textMuted,
          }}>
            Thinking...
          </div>
        )}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <input
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSend()}
          placeholder="What should I open next?"
          style={{
            flex: 1,
            padding: '12px 14px',
            borderRadius: 12,
            border: `1px solid ${C.border}`,
            fontFamily: fonts.body,
            fontSize: 14,
            background: C.card,
            color: C.text,
            outline: 'none',
          }}
        />
        <button
          onClick={handleSend}
          disabled={loading || !input.trim()}
          style={{
            background: C.accent,
            color: '#fff',
            border: 'none',
            borderRadius: 12,
            width: 44,
            height: 44,
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: loading || !input.trim() ? 0.5 : 1,
          }}
        >
          <Send size={18} />
        </button>
      </div>
    </div>
  );
};
