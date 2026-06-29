// Brew button with long-press support — tap for default, long-press for method menu
import { useCallback } from 'react';
import { Coffee } from 'lucide-react';
import { useLongPress } from '../hooks/useLongPress';
import { BrewMethodMenu } from './BrewMethodMenu';
import { GlassButton } from './GlassButton';
import { fonts } from '../styles/theme';
import { m, spring } from '../lib/motion';

const renderLabel = (label, aidenSize) => {
  // Editorial treatment for the Aiden product name: "Brew with [Aiden]" with
  // Aiden set in Fraunces italic (refined serif emphasis, not casual script).
  const aidenMatch = label.match(/^(.*?)\bAiden\b(.*)$/);
  if (!aidenMatch) return label;
  const [, before, after] = aidenMatch;
  return (
    <>
      {before}
      <span style={{
        fontFamily: fonts.heading,
        fontStyle: 'italic',
        fontWeight: 600,
        fontSize: aidenSize,
        marginLeft: 3,
        marginRight: 1,
        letterSpacing: '0',
      }}>Aiden</span>
      {after}
    </>
  );
};

export const BrewButton = ({ bean, label, isHandBrew, brewMenuBean, setBrewMenuBean, onAiden, onHandBrew, compact = true }) => {
  const handleTap = useCallback(() => {
    isHandBrew ? onHandBrew(bean) : onAiden(bean);
  }, [bean, isHandBrew, onAiden, onHandBrew]);

  const handleLongPress = useCallback(() => {
    setBrewMenuBean(bean);
  }, [bean, setBrewMenuBean]);

  const longPressHandlers = useLongPress({ onTap: handleTap, onLongPress: handleLongPress });

  const iconSize = compact ? 12 : 18;
  const aidenSize = compact ? '1.08em' : 16;
  const btnStyle = compact
    ? undefined
    : { padding: '11px 16px', fontSize: 14, gap: 7, flexShrink: 0 };

  return (
    <div style={{ position: 'relative', width: compact ? undefined : '100%' }}>
      <GlassButton
        fullWidth={!compact}
        compact={compact}
        aria-label={label}
        {...longPressHandlers}
      >
        <Coffee size={iconSize} /> {renderLabel(label, aidenSize)}
      </GlassButton>
      <BrewMethodMenu
        open={brewMenuBean?.id === bean.id}
        onClose={() => setBrewMenuBean(null)}
        onAiden={() => onAiden(bean)}
        onHandBrew={(deviceKey) => onHandBrew(bean, null, false, deviceKey)}
      />
    </div>
  );
};
