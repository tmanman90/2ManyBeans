// Shared motion primitives for the redesign — token-driven so every screen
// animates consistently. Built on framer-motion. Honors prefers-reduced-motion
// via <MotionConfig reducedMotion="user"> mounted once at the app root.
import { motion as fmMotion } from "framer-motion";
import { motion as tokens } from "../styles/theme";

export const spring = tokens.spring;
export const ease = tokens.ease;
export const dur = tokens.dur;

// Re-export the framer namespace so screens can `import { m } from lib/motion`.
export const m = fmMotion;

// --- Reusable variants ---------------------------------------------------

// Tactile press for buttons/cards (use with whileTap).
export const pressable = {
  whileTap: { scale: 0.97 },
  transition: spring.snappy,
};

// Card press — subtle scale + lift removal.
export const cardPress = {
  whileTap: { scale: 0.985 },
  transition: spring.soft,
};

// Fade + rise on mount.
export const fadeUp = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: 8 },
  transition: { duration: dur.base, ease: ease.out },
};

// Scale + fade (for chips, badges, popovers).
export const popIn = {
  initial: { opacity: 0, scale: 0.94 },
  animate: { opacity: 1, scale: 1 },
  exit: { opacity: 0, scale: 0.96 },
  transition: spring.snappy,
};

// Bottom-sheet presentation.
export const sheet = {
  initial: { y: "100%" },
  animate: { y: 0 },
  exit: { y: "100%" },
  transition: spring.soft,
};

// Backdrop scrim fade.
export const scrim = {
  initial: { opacity: 0 },
  animate: { opacity: 1 },
  exit: { opacity: 0 },
  transition: { duration: dur.base, ease: ease.out },
};

// Staggered list container + item (use container on parent, item on children).
export const listContainer = {
  initial: {},
  animate: { transition: { staggerChildren: 0.05, delayChildren: 0.04 } },
};
export const listItem = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0, transition: spring.soft },
};

// Tab/page cross-fade-slide.
export const pageSwap = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: dur.base, ease: ease.out },
};
