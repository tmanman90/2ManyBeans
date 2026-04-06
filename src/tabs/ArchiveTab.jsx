// Archive tab — ported from prototype lines 897-917
import { RotateCcw } from 'lucide-react';
import { C, fonts, journalCard } from '../styles/theme';
import { StarRating } from '../components/StarRating';
import { ProfessorRuphusSlideUp } from '../components/ProfessorRuphusSlideUp';
import { useProfessorRuphus } from '../hooks/useProfessorRuphus';

export const ArchiveTab = ({ beans, tastings = [], updateBean }) => {
  const finished = beans
    .filter(b => b.status === 'FINISHED')
    .sort((a, b) => (b.finishDate || '').localeCompare(a.finishDate || ''));

  const { handleLearn, ruphusProps } = useProfessorRuphus(updateBean, tastings);

  // Compute best rating per bean
  const bestRating = {};
  tastings.forEach(t => {
    if (t.rating && (!bestRating[t.beanId] || t.rating > bestRating[t.beanId])) {
      bestRating[t.beanId] = t.rating;
    }
  });

  const accentBar = {
    width: 40, height: 3, background: C.accentLight, borderRadius: 2, marginBottom: 14,
  };

  return (
    <div>
      <div style={{ fontFamily: fonts.title, fontSize: 30, color: C.text, marginBottom: 4 }}>Archive</div>
      <div style={accentBar} />
      <div style={{ fontSize: 13, color: C.textMuted, marginBottom: 20 }}>{finished.length} beans finished</div>
      {finished.map(bean => (
        <div key={bean.id} style={{
          ...journalCard,
          padding: 0,
          overflow: 'hidden',
          opacity: 0.85,
        }}>
          {bean.photoUrl && (
            <img
              src={bean.photoUrl}
              alt={`${bean.name} bag`}
              loading="lazy"
              style={{
                width: '100%', height: 160, objectFit: 'contain', objectPosition: 'center',
                display: 'block', background: C.cream,
              }}
            />
          )}
          <div style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: fonts.heading, fontSize: 16, color: C.text }}>{bean.name}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>
                {bean.roaster} · {bean.origin} · {bean.variety} {bean.process}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                onClick={() => handleLearn(bean)}
                style={{
                  background: 'none', border: 'none', cursor: 'pointer',
                  padding: 2, display: 'flex', alignItems: 'center', justifyContent: 'center',
                  minWidth: 44, minHeight: 44,
                }}
                title="Learn about this coffee"
              >
                <img src="/images/professor-ruphus.png" alt="Learn"
                  style={{ width: 20, height: 20, borderRadius: '50%', objectFit: 'cover' }} />
              </button>
              {bean.finishDate && (
                <span style={{ fontSize: 11, color: C.textLight, whiteSpace: 'nowrap' }}>Finished {bean.finishDate}</span>
              )}
            </div>
          </div>
          {bean.bagNotes && bean.bagNotes !== '' && (
            <div style={{ fontSize: 12, color: C.textLight, fontStyle: 'italic', marginTop: 4 }}>
              ☕ {bean.bagNotes}
            </div>
          )}
          {bestRating[bean.id] && (
            <div style={{ marginTop: 6 }}>
              <StarRating value={bestRating[bean.id]} size={16} />
            </div>
          )}
          <div style={{ marginTop: 8 }}>
            <span
              onClick={() => { if (confirm('Move back to inventory?')) updateBean(bean.id, { status: 'SEALED', finishDate: null }); }}
              style={{ fontSize: 12, color: C.textLight, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 4 }}
            >
              <RotateCcw size={12} /> Restore to Inventory
            </span>
          </div>
          </div>
        </div>
      ))}
      <ProfessorRuphusSlideUp {...ruphusProps} />
    </div>
  );
};
