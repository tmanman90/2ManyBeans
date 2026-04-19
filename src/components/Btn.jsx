// Button system — tactile depth, clearer hierarchy.
// Variants: primary | secondary | ghost | danger | icon
// Size modifier: size="sm" (applies to primary | secondary | danger)
// Legacy: variant="small" maps to variant="secondary" size="sm" for backward compat.
import { haptic } from '../lib/haptics';

export const Btn = ({
  children,
  onClick,
  variant = 'primary',
  size,
  style = {},
  disabled = false,
  ...rest
}) => {
  let resolvedVariant = variant;
  let resolvedSize = size;
  if (variant === 'small') {
    resolvedVariant = 'secondary';
    resolvedSize = 'sm';
  }

  const handleClick = (e) => {
    if (disabled || !onClick) return;
    if (resolvedVariant === 'primary') haptic.light();
    else if (resolvedVariant === 'danger') haptic.medium();
    onClick(e);
  };

  const classes = ['btnp', `btnp-${resolvedVariant}`];
  if (resolvedSize === 'sm' && resolvedVariant !== 'icon' && resolvedVariant !== 'ghost') {
    classes.push('btnp-sm');
  }

  return (
    <button
      className={classes.join(' ')}
      onClick={handleClick}
      disabled={disabled}
      style={{ opacity: disabled ? 0.45 : undefined, ...style }}
      {...rest}
    >
      {children}
    </button>
  );
};
