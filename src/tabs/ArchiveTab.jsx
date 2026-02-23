// Archive tab — ported from prototype lines 897-917
import { C, fonts, journalCard } from '../styles/theme';

export const ArchiveTab = ({ beans }) => {
  const finished = beans
    .filter(b => b.status === 'FINISHED')
    .sort((a, b) => (b.finishDate || '').localeCompare(a.finishDate || ''));

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
          opacity: 0.85,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontFamily: fonts.heading, fontSize: 16, color: C.text }}>{bean.name}</div>
              <div style={{ fontSize: 12, color: C.textMuted }}>
                {bean.roaster} · {bean.origin} · {bean.variety} {bean.process}
              </div>
            </div>
            {bean.finishDate && (
              <span style={{ fontSize: 11, color: C.textLight }}>Finished {bean.finishDate}</span>
            )}
          </div>
          {bean.bagNotes && bean.bagNotes !== '' && (
            <div style={{ fontSize: 12, color: C.textLight, fontStyle: 'italic', marginTop: 4 }}>
              ☕ {bean.bagNotes}
            </div>
          )}
        </div>
      ))}
    </div>
  );
};
