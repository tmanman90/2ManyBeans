// The bean card's swipe decisions. The axis is chosen once, early in the gesture, and
// the release obeys it, so what the card showed is always what the swipe commits.
const AXIS_LOCK_DISTANCE = 10;
const NAVIGATE_DISTANCE = 90;
const NAVIGATE_VELOCITY = 500;
const DISMISS_DISTANCE = 110;
const DISMISS_VELOCITY = 650;

// Null until the finger has moved far enough to tell. A tie goes to y (dismiss axis).
export function lockSwipeAxis({ x, y }) {
  if (Math.max(Math.abs(x), Math.abs(y)) <= AXIS_LOCK_DISTANCE) return null;
  return Math.abs(x) > Math.abs(y) ? 'x' : 'y';
}

// Returns 'next', 'prev', 'dismiss', or null (snap back).
export function resolveCardSwipe({ axis, offset, velocity, hasPrev, hasNext }) {
  if (axis === 'x') {
    const goingNext = offset.x < 0;
    if (!(goingNext ? hasNext : hasPrev)) return null;
    const committed = Math.abs(offset.x) > NAVIGATE_DISTANCE || Math.abs(velocity.x) > NAVIGATE_VELOCITY;
    if (!committed) return null;
    return goingNext ? 'next' : 'prev';
  }
  return offset.y > DISMISS_DISTANCE || velocity.y > DISMISS_VELOCITY ? 'dismiss' : null;
}
