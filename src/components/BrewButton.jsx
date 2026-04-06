// Brew button with long-press support — tap for default, long-press for method menu
import { useCallback } from 'react';
import { Coffee } from 'lucide-react';
import { useLongPress } from '../hooks/useLongPress';
import { BrewMethodMenu } from './BrewMethodMenu';
import { Btn } from './Btn';

export const BrewButton = ({ bean, label, isHandBrew, brewMenuBean, setBrewMenuBean, onAiden, onHandBrew }) => {
  const handleTap = useCallback(() => {
    isHandBrew ? onHandBrew(bean) : onAiden(bean);
  }, [bean, isHandBrew, onAiden, onHandBrew]);

  const handleLongPress = useCallback(() => {
    setBrewMenuBean(bean);
  }, [bean, setBrewMenuBean]);

  const longPressHandlers = useLongPress({ onTap: handleTap, onLongPress: handleLongPress });

  return (
    <div style={{ position: 'relative' }}>
      <Btn variant="small" aria-label={label} {...longPressHandlers}>
        <Coffee size={12} /> {label}
      </Btn>
      <BrewMethodMenu
        open={brewMenuBean?.id === bean.id}
        onClose={() => setBrewMenuBean(null)}
        onAiden={() => onAiden(bean)}
        onHandBrew={() => onHandBrew(bean)}
      />
    </div>
  );
};
