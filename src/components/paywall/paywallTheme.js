// Paywall design tokens — "Ruphus Paywall" (approved mockup 2026-08-16).
//
// The paywall screens are ALWAYS dark regardless of app theme: a five-rung
// warm surface ladder (s0-s4), a three-step text ramp, and ONE gold accent
// sampled from the MFP reference. Gold is budgeted to exactly five surfaces:
// CTA gradient fill, value-row icon glyphs, the headline tail phrase,
// text badges (Save 17% / Best value), and the selected plan border + check.
//
// This file is intentionally separate from src/styles/theme.js — that palette
// is consumed by ~60 files and stays untouched. Nothing here overlaps its keys.
//
// Contrast (verified against the mockup):
//   gold #F0B449 on s0 #170D06  -> 10.33:1 (passes AA as text/glyph)
//   ctaInk #241710 on gold      ->  9.40:1 (passes AA)

export const PW = {
  // Surface ladder — elevation is a surface step, never a box-shadow.
  s0: '#170D06', // page base, canvas gradient top
  s1: '#21130A', // wells, canvas gradient bottom
  s2: '#2B1A0E', // card resting, icon discs
  s3: '#33200F', // hover
  s4: '#3D280F', // pressed

  // Hairlines
  line: 'rgba(255,255,255,0.09)',
  lineStrong: 'rgba(255,255,255,0.14)',

  // Text ramp
  text: '#F6EFE6',  // primary, compare checks
  text2: '#C3B2A2', // subcopy
  text3: '#9C8A78', // fineprint, legal, absent-feature dashes

  // The one gold accent (MFP-sampled) + its dark ink
  gold: '#F0B449',   // glyphs, headline tail, badges, selected border/check
  goldLt: '#F7D274', // CTA gradient partner (horizontal, gold -> goldLt)
  ctaInk: '#241710', // text on gold

  // Hero band ground — baked into hero-ruphus-flat.webp, must match exactly
  heroBg: '#211008',

  // Shared easing for every entrance and step push
  ease: 'cubic-bezier(0.22, 1, 0.36, 1)',
};

// Spread onto the paywall root as inline style so src/styles/paywall.css
// can consume the vars: <div className="pw-root" style={PW_CSS_VARS}>
export const PW_CSS_VARS = {
  '--pw-s0': PW.s0,
  '--pw-s1': PW.s1,
  '--pw-s2': PW.s2,
  '--pw-s3': PW.s3,
  '--pw-s4': PW.s4,
  '--pw-line': PW.line,
  '--pw-line-strong': PW.lineStrong,
  '--pw-text': PW.text,
  '--pw-text-2': PW.text2,
  '--pw-text-3': PW.text3,
  '--pw-gold': PW.gold,
  '--pw-gold-lt': PW.goldLt,
  '--pw-cta-ink': PW.ctaInk,
  '--pw-hero-bg': PW.heroBg,
  '--pw-ease': PW.ease,
};

export default PW;
