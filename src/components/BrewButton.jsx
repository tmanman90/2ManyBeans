// Brew button with long-press support — tap for default, long-press for method menu
import { useCallback } from 'react';
import { Coffee } from 'lucide-react';
import { useLongPress } from '../hooks/useLongPress';
import { BrewMethodMenu } from './BrewMethodMenu';
import { Btn } from './Btn';

const renderLabel = (label, aidenSize) => {
  // Inline-script treatment for Aiden: "Brew with [Aiden]" with Aiden in Caveat
  const aidenMatch = label.match(/^(.*?)\bAiden\b(.*)$/);
  if (!aidenMatch) return label;
  const [, before, after] = aidenMatch;
  return (
    <>
      {before}
      <span style={{
        fontFamily: "'Caveat', cursive",
        fontWeight: 600,
        fontSize: aidenSize,
        lineHeight: 0.85,
        marginLeft: 1,
        marginRight: 1,
        position: 'relative',
        top: 1,
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
  const aidenSize = compact ? '1.7em' : 22;
  const btnStyle = compact
    ? undefined
    : { padding: '11px 16px', fontSize: 14, gap: 7, flexShrink: 0 };

  return (
    <div style={{ position: 'relative' }}>
      <Btn
        variant="primary"
        size={compact ? 'sm' : undefined}
        aria-label={label}
        style={btnStyle}
        {...longPressHandlers}
      >
        <Coffee size={iconSize} /> {renderLabel(label, aidenSize)}
      </Btn>
      <BrewMethodMenu
        open={brewMenuBean?.id === bean.id}
        onClose={() => setBrewMenuBean(null)}
        onAiden={() => onAiden(bean)}
        onHandBrew={(deviceKey) => onHandBrew(bean, null, false, deviceKey)}
      />
    </div>
  );
};
