// 2manybeans onboarding redesign — R1/R2/R3
// Mascot-forward: video loop fills the top ~55% of the screen.
// Brand palette + type system pulled directly from src/styles/theme.js.

const C = {
  bg: "#FAF6F1",
  cream: "#FFF8F0",
  card: "#FFF8F0",
  cardMuted: "#EDE6DC",
  text: "#3B2417",
  textMuted: "#8B7B6F",
  textLight: "#A89888",
  accent: "#B07540",
  accentLight: "#C9A87C",
  accentDark: "#5C3D2E",
  border: "#E8DDD3",
  borderLight: "#F0E8DF",
  amber: "#C4943A",
  amberBg: "#FDF6E3"
};

const fonts = {
  title: "'Caveat', cursive",
  heading: "'Playfair Display', serif",
  body: "'Nunito', sans-serif"
};

// ─── Mascot stage ──────────────────────────────────────────────────
// The mascot loop is anchored to the FLOOR of the stage with object-fit:
// contain + object-position: bottom. This guarantees the head is never
// cropped — the mascot fills the height available, and any extra width
// becomes cream stage on the sides (which matches the app bg, so the
// video's white background blends in seamlessly).
//
// `mix-blend-mode: multiply` on the video drops the near-white pixels
// onto the cream stage so there's no visible "white box" boundary
// around the artwork.
// Each video has a near-white background. The cleanest, simplest fix:
// every screen is pure white, the video full-bleeds on top with no
// blend modes, no cards, no borders. The mascot stands on a white
// stage that is indistinguishable from the screen body.
function MascotStage({ src, height = 460, poster }) {
  return (
    <div style={{
      position: 'relative',
      width: '100%',
      height,
      flexShrink: 0,
      overflow: 'hidden',
      background: 'transparent'
    }}>
      <video
        src={src}
        poster={poster}
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          objectPosition: 'center bottom',
          display: 'block', borderStyle: "solid", borderWidth: "0px", borderRadius: "100px"
        }} />
      
    </div>);

}

// ─── Speech bubble — handwritten note style ──────────────────────────
// Same warm-mentor voice as the existing component, but a touch larger
// and wider so it can stand alone without an avatar (the mascot itself
// is on screen, animated). A small "tail" anchors it visually to the
// mascot above.
function NoteBubble({ children, tone = "amber", style = {} }) {
  const bg = tone === "amber" ? C.amberBg : C.cream;
  const border = tone === "amber" ? '#E8D5A0' : C.border;
  return (
    <div style={{
      position: 'relative',
      background: bg,
      border: `1px solid ${border}`,
      borderRadius: 18,
      padding: '14px 18px',
      fontFamily: fonts.title,
      fontSize: 19,
      lineHeight: 1.35,
      color: C.text,
      boxShadow: '0 1px 2px rgba(92,61,46,0.04), 0 8px 18px rgba(92,61,46,0.05)',
      ...style
    }}>
      {/* tail pointing up toward the mascot */}
      <div style={{
        position: 'absolute',
        top: -8,
        left: 28,
        width: 16, height: 16,
        background: bg,
        borderTop: `1px solid ${border}`,
        borderLeft: `1px solid ${border}`,
        transform: 'rotate(45deg)'
      }} />
      <div style={{ position: 'relative' }}>{children}</div>
    </div>);

}

// ─── Selection list ─────────────────────────────────────────────────
function OptionList({ options, value, onSelect, compact = false }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {options.map((opt) => {
        const selected = value === opt.key;
        const Icon = opt.icon;
        return (
          <button
            key={opt.key}
            onClick={() => onSelect(opt.key)}
            style={{
              width: '100%',
              minHeight: compact ? 50 : 56,
              padding: compact ? '12px 16px' : '14px 18px',
              display: 'flex',
              alignItems: 'center',
              gap: 14,
              textAlign: 'left',
              fontSize: 16,
              fontFamily: fonts.body,
              fontWeight: 600,
              color: selected ? C.accent : C.text,
              background: selected ? C.amberBg : C.card,
              border: `1.5px solid ${selected ? C.accent : C.borderLight}`,
              borderRadius: 12,
              cursor: 'pointer',
              transition: 'background .12s, border-color .12s, transform .08s',
              boxShadow: selected ? '0 1px 3px rgba(176,117,64,0.12)' : '0 1px 2px rgba(92,61,46,0.03)'
            }}
            onMouseDown={(e) => e.currentTarget.style.transform = 'scale(0.99)'}
            onMouseUp={(e) => e.currentTarget.style.transform = 'scale(1)'}
            onMouseLeave={(e) => e.currentTarget.style.transform = 'scale(1)'}>
            
            {Icon &&
            <span style={{
              width: 36, height: 36, flexShrink: 0,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 10,
              background: selected ? C.accent : C.amberBg,
              color: selected ? '#fff' : C.accent,
              border: selected ? 'none' : '1px solid #E8D5A0',
              transition: 'background .12s, color .12s'
            }}>
                <Icon size={20} strokeWidth={2} />
              </span>
            }
            <span style={{ flex: 1 }}>{opt.label}</span>
          </button>);

      })}
    </div>);

}

// ─── Top bar (back chevron + step pill) ─────────────────────────────
function TopBar({ step, onBack, hideBack, overlay = false }) {
  return (
    <div style={{
      position: overlay ? 'absolute' : 'relative',
      top: 0, left: 0, right: 0,
      display: 'flex', alignItems: 'center',
      minHeight: 44,
      padding: '8px 12px',
      zIndex: 10
    }}>
      {!hideBack ?
      <button
        onClick={onBack}
        aria-label="Back"
        style={{
          width: 40, height: 40, borderRadius: 20,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: overlay ? 'rgba(255,248,240,0.85)' : 'transparent',
          backdropFilter: overlay ? 'blur(8px)' : undefined,
          border: overlay ? `1px solid ${C.borderLight}` : 'none',
          cursor: 'pointer'
        }}>
        
          <ChevronLeft size={22} color={C.text} />
        </button> :
      <div style={{ width: 40, height: 40 }} />}
      <div style={{
        flex: 1, textAlign: 'center',
        fontSize: 11, color: C.textLight,
        letterSpacing: 1.5, textTransform: 'uppercase',
        fontFamily: fonts.body, fontWeight: 700
      }}>
        {step}
      </div>
      <div style={{ width: 40, height: 40 }} />
    </div>);

}

// ─── Bottom CTA bar ─────────────────────────────────────────────────
function CtaBar({ label, onClick, disabled }) {
  return (
    <div style={{
      padding: '12px 20px 24px',
      background: C.cream,
      borderTop: `1px solid ${C.borderLight}`,
      flexShrink: 0
    }}>
      <button
        onClick={onClick}
        disabled={disabled}
        style={{
          width: '100%',
          minHeight: 52,
          fontSize: 17, fontWeight: 700, fontFamily: fonts.body,
          background: C.accent,
          color: '#fff',
          border: 'none',
          borderRadius: 12,
          cursor: disabled ? 'not-allowed' : 'pointer',
          opacity: disabled ? 0.5 : 1,
          boxShadow: '0 1px 4px rgba(92,61,46,0.12), 0 4px 12px rgba(176,117,64,0.18)'
        }}>
        
        {label}
      </button>
    </div>);

}

// ─────────────────────────────────────────────────────────────────────
// R1 — Welcome
// Layout: full-bleed mascot loop top, brand line in script font under,
// short subline, single CTA. Ruphus speaks via a centered note bubble
// that overlaps the mascot's bottom edge so it feels like he's
// addressing you directly.
// ─────────────────────────────────────────────────────────────────────
function R1Welcome({ tweaks }) {
  const stageHeight = tweaks.mascotHeight;
  return (
    <div style={{
      width: '100%', height: '100%',
      background: "#FFFFFF",
      display: 'flex', flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <TopBar step="R1 · WELCOME" hideBack overlay />

      <div style={{
        position: 'relative', flexShrink: 0,
        // Soft feathered mask so the video bleeds into the white page on
        // every edge instead of meeting it with a hard rectangle. Bottom
        // is the strongest fade because the mascot stands on the floor.
        WebkitMaskImage: 'radial-gradient(ellipse 95% 92% at 50% 42%, #000 55%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0) 100%)',
        maskImage: 'radial-gradient(ellipse 95% 92% at 50% 42%, #000 55%, rgba(0,0,0,0.85) 70%, rgba(0,0,0,0) 100%)'
      }}>
        <MascotStage src="assets/ruphus-welcome.mp4" height={stageHeight} />
      </div>

      <div style={{
        flex: 1,
        padding: '4px 24px 8px',
        display: 'flex', flexDirection: 'column',
        gap: 14,
        minHeight: 0
      }}>
        <div style={{
          fontFamily: fonts.title,
          fontSize: 38, lineHeight: 1.0,
          color: C.accent,
          textAlign: 'center',
          marginTop: -4
        }}>
          Brew coffee you're proud of
        </div>
        <div style={{
          fontSize: 15, color: C.textMuted,
          textAlign: 'center',
          marginTop: -6
        }}>
          Let me show you around.
        </div>

        <NoteBubble style={{ marginTop: 6 }}>
          I'm Professor Ruphus. Glad you're here. Give me a minute to learn how
          you brew — I'll take good care of you.
        </NoteBubble>
      </div>

      <CtaBar label="Get started" onClick={tweaks.onAdvance} />
    </div>);

}

// ─────────────────────────────────────────────────────────────────────
// R2 — Brew Goal
// Mascot is celebrating (anticipation that you're about to share).
// Mascot fills top ~50%, speech bubble + question stacked below,
// scrollable list of 6 brew methods. No bottom CTA — selection
// auto-advances (matches existing flow).
// ─────────────────────────────────────────────────────────────────────
const GOAL_OPTIONS = [
{ key: 'aiden', label: 'Fellow Aiden', icon: IconCpu },
{ key: 'v60', label: 'V60 / Pour Over', icon: IconDrop },
{ key: 'aeropress', label: 'Aeropress', icon: IconFlask },
{ key: 'french_press', label: 'French Press', icon: IconCoffee },
{ key: 'espresso', label: 'Espresso', icon: IconBolt },
{ key: 'all', label: 'All of them', icon: IconSparkle }];


function R2Goal({ tweaks, value, onSelect }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: "#FFFFFF",
      display: 'flex', flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <TopBar step="R2 · BREW GOAL" onBack={tweaks.onBack} overlay />

      <MascotStage
        src="assets/ruphus-thinking.mp4"
        height={tweaks.mascotHeight} />
      

      <div style={{
        flex: 1,
        padding: '4px 20px 16px',
        display: 'flex', flexDirection: 'column',
        gap: 14,
        minHeight: 0,
        overflowY: 'auto'
      }}>
        <NoteBubble>
          Right — tell me what you're chasing. I'll tailor everything around it.
        </NoteBubble>

        <div style={{
          fontFamily: fonts.heading,
          fontSize: 24, lineHeight: 1.15,
          color: C.text,
          marginTop: 4
        }}>
          What do you want to brew better?
        </div>

        <OptionList options={GOAL_OPTIONS} value={value} onSelect={onSelect} compact />
      </div>
    </div>);

}

// ─────────────────────────────────────────────────────────────────────
// R3 — Pain Point
// Mascot is taking notes (he's listening). Same layout language as R2
// for consistency. Text-only options (no icons), matches the original.
// ─────────────────────────────────────────────────────────────────────
const PAIN_OPTIONS = [
{ key: 'inconsistent', label: 'My brews are inconsistent' },
{ key: 'forget_freshness', label: 'I forget which beans are fresh' },
{ key: 'too_many_beans', label: 'I have 2manybeans to keep track of' },
{ key: 'taste_more', label: 'I want to actually taste what\u2019s in the cup' },
{ key: 'brew_like_pro', label: 'I want to brew like a pro' }];


function R3Pain({ tweaks, value, onSelect }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: "#FFFFFF",
      display: 'flex', flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <TopBar step="R3 · PAIN POINT" onBack={tweaks.onBack} overlay />

      <MascotStage
        src="assets/ruphus-listening.mp4"
        height={tweaks.mascotHeight} />
      

      <div style={{
        flex: 1,
        padding: '4px 20px 16px',
        display: 'flex', flexDirection: 'column',
        gap: 14,
        minHeight: 0,
        overflowY: 'auto'
      }}>
        <NoteBubble>
          No judgement here. Pick the one that bugs you most — I've got you.
        </NoteBubble>

        <div style={{
          fontFamily: fonts.heading,
          fontSize: 24, lineHeight: 1.15,
          color: C.text,
          marginTop: 4
        }}>
          What bugs you most right now?
        </div>

        <OptionList options={PAIN_OPTIONS} value={value} onSelect={onSelect} compact />
      </div>
    </div>);

}

// ─────────────────────────────────────────────────────────────────────
// SHARED — compact "header peek" mascot stage for dense interactive
// screens. Mascot is smaller (~35% of screen), still never cropped at
// the head. Used on R5/R7/R8/R10/R12/R13.
// ─────────────────────────────────────────────────────────────────────
function MascotPeek({ src, height = 220 }) {
  return <MascotStage src={src} height={height} />;
}

// Generic intro screen — full-bleed mascot, headline, optional subline,
// optional note bubble, single CTA. Used by R4, R6, R9, R11, R13b.
function IntroScreen({ step, hideBack, onBack, video, mascotHeight, headline, subline, note, ctaLabel, onCta, ctaDisabled, children, scriptHeadline }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#FFFFFF',
      display: 'flex', flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <TopBar step={step} hideBack={hideBack} onBack={onBack} overlay />

      <MascotStage src={video} height={mascotHeight} />

      <div style={{
        flex: 1,
        padding: '4px 24px 8px',
        display: 'flex', flexDirection: 'column',
        gap: 12,
        minHeight: 0,
        overflowY: 'auto'
      }}>
        {scriptHeadline ?
        <div style={{
          fontFamily: fonts.title,
          fontSize: 36, lineHeight: 1.0,
          color: C.accent,
          textAlign: 'center',
          marginTop: -4
        }}>
            {scriptHeadline}
          </div> :

        <div style={{
          fontFamily: fonts.heading,
          fontSize: 26, lineHeight: 1.15,
          color: C.text,
          textAlign: 'center'
        }}>
            {headline}
          </div>
        }
        {subline &&
        <div style={{
          fontSize: 15, color: C.textMuted,
          textAlign: 'center',
          marginTop: -4,
          lineHeight: 1.4
        }}>
            {subline}
          </div>
        }
        {note && <NoteBubble style={{ marginTop: 4 }}>{note}</NoteBubble>}
        {children}
      </div>

      {ctaLabel &&
      <CtaBar label={ctaLabel} onClick={onCta} disabled={ctaDisabled} />
      }
    </div>);

}

// Header layout used by dense interactive screens — peek mascot, then
// note bubble + headline + body content stacked vertically. Used by R5,
// R7, R8, R10, R12.
function PeekScreen({ step, onBack, video, peekHeight, note, headline, ctaLabel, onCta, ctaDisabled, children }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#FFFFFF',
      display: 'flex', flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <TopBar step={step} onBack={onBack} overlay />
      <MascotPeek src={video} height={peekHeight} />
      <div style={{
        flex: 1,
        padding: '4px 20px 16px',
        display: 'flex', flexDirection: 'column',
        gap: 12,
        minHeight: 0,
        overflowY: 'auto'
      }}>
        {note && <NoteBubble>{note}</NoteBubble>}
        {headline &&
        <div style={{
          fontFamily: fonts.heading,
          fontSize: 23, lineHeight: 1.2,
          color: C.text,
          marginTop: 2
        }}>
            {headline}
          </div>
        }
        {children}
      </div>
      {ctaLabel &&
      <CtaBar label={ctaLabel} onClick={onCta} disabled={ctaDisabled} />
      }
    </div>);

}

// ─────────────────────────────────────────────────────────────────────
// R4 — Social Proof
// Full-bleed mascot reading a book (looks up impressed). Three short
// testimonials in soft cream cards. CTA: Continue.
// ─────────────────────────────────────────────────────────────────────
const R4_TESTIMONIALS = [
{ quote: "I was dialing in my V60 by vibes. Ruphus walked me through grind, dose, and pour, and every cup since has tasted like the last good one.", author: 'Dan R.' },
{ quote: "Two weeks in and I'm hitting the same brew every morning. I didn't realize how much I was flying blind before.", author: 'Maya K.' },
{ quote: "The recipes are tuned to my actual grinder and beans, not some generic ratio.", author: 'Sam T.' }];


function R4Social({ tweaks }) {
  return (
    <IntroScreen
      step="R4 · YOU'RE IN GOOD COMPANY"
      onBack={tweaks.onBack}
      video="assets/ruphus-reading-book.mp4"
      mascotHeight={tweaks.mascotHeight}
      headline="You're in good company."
      note="I'm not the only one who believes in this — look what brewers are saying."
      ctaLabel="Continue"
      onCta={tweaks.onAdvance}>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        {R4_TESTIMONIALS.map((t, i) =>
        <div key={i} style={{
          background: C.card,
          border: `1px solid ${C.borderLight}`,
          borderRadius: 12,
          padding: '12px 14px'
        }}>
            <div style={{
            fontSize: 14, lineHeight: 1.45, color: C.text,
            marginBottom: 6
          }}>
              &ldquo;{t.quote}&rdquo;
            </div>
            <div style={{ fontSize: 12, color: C.textMuted, fontWeight: 700 }}>
              — {t.author}
            </div>
          </div>
        )}
      </div>
    </IntroScreen>);

}

// ─────────────────────────────────────────────────────────────────────
// R5 — Palate Tinder
// Mascot is sniffing beans (peek size — needs room for the swipe card).
// Card with prompt, Yes / Not for me buttons.
// ─────────────────────────────────────────────────────────────────────
const R5_CARDS = [
{ id: 'c1_sweetness', prompt: 'I want my coffee to taste sweet, not sharp.' },
{ id: 'c2_acidity', prompt: 'I want bright, fruity acidity — lemon, apricot, berries.' },
{ id: 'c3_body', prompt: 'I want a heavy, syrupy mouthfeel.' },
{ id: 'c4_clean_funky', prompt: 'I trust washed coffees over naturals and anaerobics.' },
{ id: 'c5_fruit_nutty', prompt: "I'd rather taste chocolate and nuts than fruit." }];


function R5Tinder({ tweaks, cardIndex, onSwipe }) {
  const card = R5_CARDS[cardIndex] || R5_CARDS[0];
  return (
    <PeekScreen
      step={`R5 · PALATE  ·  ${cardIndex + 1} / ${R5_CARDS.length}`}
      onBack={tweaks.onBack}
      video="assets/ruphus-sniffing-beans.mp4"
      peekHeight={tweaks.peekHeight || 240}
      note="Quick round. Swipe right if it sounds like you, left if it doesn't. There's no wrong answer.">
      
      <div style={{
        marginTop: 4,
        display: 'flex', justifyContent: 'center'
      }}>
        <div style={{
          width: '100%',
          minHeight: 160,
          background: C.card,
          border: `1.5px solid ${C.borderLight}`,
          borderRadius: 18,
          boxShadow: '0 2px 8px rgba(92,61,46,0.06), 0 12px 28px rgba(92,61,46,0.08)',
          padding: '24px 22px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          textAlign: 'center'
        }}>
          <div style={{
            fontFamily: fonts.heading,
            fontSize: 21, lineHeight: 1.3,
            color: C.text
          }}>
            {card.prompt}
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
        <button
          onClick={() => onSwipe && onSwipe('no')}
          style={{
            flex: 1, minHeight: 50,
            fontSize: 15, fontWeight: 700, fontFamily: fonts.body,
            color: C.textMuted, background: C.card,
            border: `1.5px solid ${C.borderLight}`,
            borderRadius: 12, cursor: 'pointer'
          }}>
          
          Not for me
        </button>
        <button
          onClick={() => onSwipe && onSwipe('yes')}
          style={{
            flex: 1, minHeight: 50,
            fontSize: 15, fontWeight: 700, fontFamily: fonts.body,
            color: '#fff', background: C.accent,
            border: 'none',
            borderRadius: 12, cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(92,61,46,0.12), 0 4px 10px rgba(176,117,64,0.16)'
          }}>
          
          Yes
        </button>
      </div>
    </PeekScreen>);

}

// ─────────────────────────────────────────────────────────────────────
// R6 — Personalized
// Mascot presenting (whiteboard ta-da). Three "honest feature" cards
// pulled directly from R06Personalized.jsx defaults.
// ─────────────────────────────────────────────────────────────────────
const R6_FEATURES = [
{ title: 'Recipes tuned to you',
  body: "I've read every coffee book worth reading and I use all of it to pull a brew recipe tuned to your bean and your grinder. No generic ratios." },
{ title: 'Finally a home for every bag',
  body: "No whiteboards. No spreadsheets. I track every bag and tell you which one to grab this morning." },
{ title: 'Guided tasting coach',
  body: "Step-by-step coaching that meets you where you are. Real, scaffolded notes you can act on." }];


function R6Personalized({ tweaks }) {
  return (
    <IntroScreen
      step="R6 · YOUR PLAN"
      onBack={tweaks.onBack}
      video="assets/ruphus-presenting.mp4"
      mascotHeight={tweaks.mascotHeight}
      headline="Here's how I'll help."
      subline="We'll focus on chasing consistency together — starting today."
      note="Here's how I'll actually help — starting today."
      ctaLabel="Sounds good"
      onCta={tweaks.onAdvance}>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 4 }}>
        {R6_FEATURES.map((f) =>
        <div key={f.title} style={{
          background: C.card,
          border: `1px solid ${C.borderLight}`,
          borderRadius: 12,
          padding: '12px 14px'
        }}>
            <div style={{
            fontFamily: fonts.heading, fontSize: 16, color: C.text,
            marginBottom: 3
          }}>
              {f.title}
            </div>
            <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.4 }}>
              {f.body}
            </div>
          </div>
        )}
      </div>
    </IntroScreen>);

}

// ─────────────────────────────────────────────────────────────────────
// R7 — Kit Setup
// Mascot is cranking grinder handle (peek size — heavy form below).
// Display name + grinder dropdown + brew method 2x3 grid.
// ─────────────────────────────────────────────────────────────────────
const R7_GRINDERS = [
{ key: 'fellow-ode-gen2', label: 'Fellow Ode Gen 2' },
{ key: 'fellow-opus', label: 'Fellow Opus' },
{ key: 'baratza-encore-esp', label: 'Baratza Encore ESP' },
{ key: 'comandante-c40', label: 'Comandante C40 MK4' },
{ key: '1zpresso-jx-pro', label: '1Zpresso JX-Pro' },
{ key: 'baratza-virtuoso-plus', label: 'Baratza Virtuoso+' },
{ key: 'other', label: 'Other / Manual entry' }];

const R7_BREW = [
{ key: 'aiden', label: 'Fellow Aiden' },
{ key: 'v60', label: 'Hario V60' },
{ key: 'kalita', label: 'Kalita Wave' },
{ key: 'chemex', label: 'Chemex' },
{ key: 'aeropress', label: 'Aeropress' },
{ key: 'french', label: 'French Press' }];


function R7Kit({ tweaks, displayName, onName, grinder, onGrinder, brew, onBrew }) {
  return (
    <PeekScreen
      step="R7 · YOUR KIT"
      onBack={tweaks.onBack}
      video="assets/ruphus-holding-grinder.mp4"
      peekHeight={tweaks.peekHeight || 220}
      note="Last bit. Tell me what you've got and I'll set up your kit."
      headline="Set up your kit"
      ctaLabel="Continue"
      onCta={tweaks.onAdvance}
      ctaDisabled={!displayName?.trim()}>
      
      <FieldLabel>What should I call you?</FieldLabel>
      <input
        type="text"
        value={displayName || ''}
        onChange={(e) => onName && onName(e.target.value)}
        placeholder="Your name"
        style={inputStyle} />
      

      <FieldLabel style={{ marginTop: 6 }}>What's your grinder?</FieldLabel>
      <select value={grinder} onChange={(e) => onGrinder && onGrinder(e.target.value)} style={selectStyle}>
        {R7_GRINDERS.map((g) => <option key={g.key} value={g.key}>{g.label}</option>)}
      </select>

      <FieldLabel style={{ marginTop: 6 }}>How do you brew?</FieldLabel>
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
        {R7_BREW.map((m) => {
          const selected = brew === m.key;
          return (
            <button
              key={m.key}
              onClick={() => onBrew && onBrew(m.key)}
              style={{
                minHeight: 72,
                padding: 8,
                background: selected ? C.amberBg : C.card,
                border: `${selected ? 2 : 1.5}px solid ${selected ? C.accent : C.borderLight}`,
                borderRadius: 12,
                cursor: 'pointer',
                fontFamily: fonts.body,
                fontSize: 12,
                fontWeight: 700,
                color: selected ? C.accent : C.text,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                textAlign: 'center',
                lineHeight: 1.2
              }}>
              
              {m.label}
            </button>);

        })}
      </div>
    </PeekScreen>);

}

function FieldLabel({ children, style = {} }) {
  return (
    <div style={{
      fontSize: 12, color: C.textMuted, fontWeight: 700,
      fontFamily: fonts.body,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
      marginBottom: 4,
      ...style
    }}>{children}</div>);

}
const inputStyle = {
  width: '100%', minHeight: 48, padding: '12px 14px',
  fontSize: 15, fontFamily: fonts.body,
  borderRadius: 12, border: `1px solid ${C.border}`,
  background: C.card, color: C.text, outline: 'none',
  boxSizing: 'border-box'
};
const selectStyle = {
  ...inputStyle,
  appearance: 'none', WebkitAppearance: 'none',
  backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%238B7B6F' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 14px center'
};

// ─────────────────────────────────────────────────────────────────────
// R8 — Camera Permission
// Mascot peering through magnifying glass. Big "why" copy + Allow CTA.
// ─────────────────────────────────────────────────────────────────────
function R8Camera({ tweaks }) {
  return (
    <IntroScreen
      step="R8 · CAMERA"
      onBack={tweaks.onBack}
      video="assets/ruphus-magnifying-glass.mp4"
      mascotHeight={tweaks.mascotHeight}
      headline="Give me a peek at your bags."
      note="I'll need your camera to read the back labels on your bags. It's how I learn what you're drinking."
      ctaLabel="Allow camera"
      onCta={tweaks.onAdvance}>
      
      <div style={{
        background: C.amberBg,
        border: `1px solid #E8D5A0`,
        borderRadius: 12,
        padding: '12px 14px',
        marginTop: 2,
        fontSize: 13, color: C.textMuted, lineHeight: 1.45,
        textAlign: 'center'
      }}>
        Photos are sent to our AI to read the label, then discarded. We never store your images.
      </div>
    </IntroScreen>);

}

// ─────────────────────────────────────────────────────────────────────
// R9 — Processing
// Mascot celebrating with pour-over held overhead. Progress bar + quip.
// ─────────────────────────────────────────────────────────────────────
function R9Processing({ tweaks, progress = 0.6, quip = 'Studying your palate…' }) {
  return (
    <IntroScreen
      step="R9 · BUILDING YOUR PLAN"
      hideBack
      video="assets/ruphus-processing-celebrating.mp4"
      mascotHeight={tweaks.mascotHeight}
      headline="Building your brew plan"
      note={quip}>
      
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 4 }}>
        <div style={{
          width: '100%', maxWidth: 280, height: 10,
          background: C.cardMuted,
          borderRadius: 999, overflow: 'hidden',
          border: `1px solid ${C.borderLight}`
        }}>
          <div style={{
            width: `${Math.round(progress * 100)}%`, height: '100%',
            background: C.accent, borderRadius: 999,
            transition: 'width .3s'
          }} />
        </div>
        <div style={{ marginTop: 10, fontSize: 12, color: C.textMuted }}>
          Just a moment…
        </div>
      </div>
    </IntroScreen>);

}

// ─────────────────────────────────────────────────────────────────────
// R10 — Scan Demo
// Mascot writing notes (clipboard). Scanner-style frame on a soft card,
// with a sweeping accent-colored beam.
// ─────────────────────────────────────────────────────────────────────
function R10Scan({ tweaks }) {
  return (
    <PeekScreen
      step="R10 · SCAN DEMO"
      onBack={tweaks.onBack}
      video="assets/ruphus-writing-notes.mp4"
      peekHeight={tweaks.peekHeight || 230}
      note="Just tap a bag and I'll read the label for you."
      headline="Here's what a scan looks like."
      ctaLabel="Got it"
      onCta={tweaks.onAdvance}>
      
      <div style={{
        position: 'relative',
        width: '100%',
        aspectRatio: '16 / 10',
        background: '#F5EFE6',
        border: `1px solid ${C.borderLight}`,
        borderRadius: 16,
        overflow: 'hidden',
        marginTop: 6
      }}>
        {/* placeholder bag */}
        <div style={{
          position: 'absolute',
          inset: '14% 28%',
          background: 'linear-gradient(180deg, #C9A87C 0%, #B07540 100%)',
          borderRadius: 8,
          boxShadow: 'inset 0 -10px 20px rgba(0,0,0,0.15)'
        }} />
        {/* corner brackets */}
        {[
        { top: 10, left: 10, borderTop: 1, borderLeft: 1 },
        { top: 10, right: 10, borderTop: 1, borderRight: 1 },
        { bottom: 10, left: 10, borderBottom: 1, borderLeft: 1 },
        { bottom: 10, right: 10, borderBottom: 1, borderRight: 1 }].
        map((pos, i) =>
        <div key={i} style={{
          position: 'absolute',
          width: 22, height: 22,
          ...['borderTop', 'borderRight', 'borderBottom', 'borderLeft'].reduce((a, k) => {
            if (pos[k]) a[k] = `2px solid ${C.accent}`;
            return a;
          }, {}),
          ...pos
        }} />
        )}
        {/* scan beam */}
        <div style={{
          position: 'absolute', left: 0, right: 0, height: 2,
          background: C.accent,
          boxShadow: `0 0 12px ${C.accent}, 0 0 22px ${C.accent}aa`,
          animation: 'r10-scan 2.6s ease-in-out infinite',
          top: 0
        }} />
        <style>{`
          @keyframes r10-scan {
            0% { top: 6%; opacity: 0; }
            10% { opacity: 1; }
            90% { opacity: 1; }
            100% { top: 92%; opacity: 0; }
          }
        `}</style>
      </div>
      <div style={{
        fontSize: 13, color: C.textMuted,
        textAlign: 'center', marginTop: 8, lineHeight: 1.4
      }}>
        No typing. No guessing. Just the back of the bag, turned into something useful.
      </div>
    </PeekScreen>);

}

// ─────────────────────────────────────────────────────────────────────
// R11 — Value Delivery
// Mascot cupping/sipping. SVG palate chart from R5 results, mentor letter.
// ─────────────────────────────────────────────────────────────────────
function PalateChart({ chart, size = 220 }) {
  // Default chart matches the typical "first-pass" palate from R5.
  const c = chart || { sweetness: 0.6, acidity: 0.6, body: -0.6, clean_funky: 0.6, fruit_nutty: -0.6 };
  const axes = [
  { key: 'sweetness', label: 'Sweet' },
  { key: 'acidity', label: 'Bright' },
  { key: 'body', label: 'Heavy' },
  { key: 'clean_funky', label: 'Clean' },
  { key: 'fruit_nutty', label: 'Nutty' }];

  const cx = size / 2,cy = size / 2;
  const radius = size / 2 - 28;
  const points = axes.map((a, i) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / axes.length;
    // value range -0.6..0.6 → 0..1 fraction of radius
    const v = (c[a.key] + 0.6) / 1.2;
    const r = radius * (0.2 + 0.8 * v);
    return [cx + Math.cos(angle) * r, cy + Math.sin(angle) * r];
  });
  const labelPoints = axes.map((_, i) => {
    const angle = -Math.PI / 2 + i * 2 * Math.PI / axes.length;
    return [cx + Math.cos(angle) * (radius + 14), cy + Math.sin(angle) * (radius + 14)];
  });
  const polygon = points.map(([x, y]) => `${x},${y}`).join(' ');
  const gridRings = [0.25, 0.5, 0.75, 1.0];
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ display: 'block', margin: '0 auto' }}>
      {gridRings.map((g, i) => {
        const pts = axes.map((_, j) => {
          const angle = -Math.PI / 2 + j * 2 * Math.PI / axes.length;
          return `${cx + Math.cos(angle) * radius * g},${cy + Math.sin(angle) * radius * g}`;
        }).join(' ');
        return <polygon key={i} points={pts} fill="none" stroke={C.borderLight} strokeWidth="1" />;
      })}
      {axes.map((_, i) => {
        const angle = -Math.PI / 2 + i * 2 * Math.PI / axes.length;
        return (
          <line key={i}
          x1={cx} y1={cy}
          x2={cx + Math.cos(angle) * radius}
          y2={cy + Math.sin(angle) * radius}
          stroke={C.borderLight} strokeWidth="1" />);

      })}
      <polygon points={polygon} fill={C.accent} fillOpacity="0.18" stroke={C.accent} strokeWidth="2" />
      {points.map(([x, y], i) =>
      <circle key={i} cx={x} cy={y} r="3.5" fill={C.accent} />
      )}
      {axes.map((a, i) =>
      <text key={a.key}
      x={labelPoints[i][0]}
      y={labelPoints[i][1]}
      textAnchor="middle"
      dominantBaseline="middle"
      fontFamily={fonts.body}
      fontSize="11"
      fontWeight="700"
      fill={C.textMuted}>
          {a.label}
        </text>
      )}
    </svg>);

}

function R11Value({ tweaks }) {
  return (
    <IntroScreen
      step="R11 · YOUR PALATE"
      onBack={tweaks.onBack}
      video="assets/ruphus-cupping.mp4"
      mascotHeight={tweaks.mascotHeight}
      headline="Your palate, in five axes."
      ctaLabel="Scan my first bag"
      onCta={tweaks.onAdvance}>
      
      <div style={{ marginTop: 4 }}>
        <PalateChart size={220} />
      </div>
      <div style={{
        textAlign: 'center', fontFamily: fonts.heading,
        fontSize: 16, color: C.text, lineHeight: 1.3,
        marginTop: 4
      }}>
        sweet · bright and fruity
      </div>
      <NoteBubble>
        You're a V60 brewer who cares about every pour. We'll lock in your routine
        so your next cup tastes like the last one — on purpose.
      </NoteBubble>
    </IntroScreen>);

}

// ─────────────────────────────────────────────────────────────────────
// R12 — Trial Timeline
// Mascot thumbs up. Three-beat timeline with checkmark/sparkle/bell.
// ─────────────────────────────────────────────────────────────────────
const R12_STEPS = [
{ dot: '✓', title: 'Today', body: 'Full access. Scan, taste, brew — see if we click.' },
{ dot: '★', title: 'In 3 days', body: "I'll check in and show you what we've tracked together." },
{ dot: '!', title: 'Day 7', body: "Trial ends. Cancel anytime before then and you won't be charged." }];


function R12Trial({ tweaks, consent, onConsent }) {
  return (
    <PeekScreen
      step="R12 · YOUR TRIAL"
      onBack={tweaks.onBack}
      video="assets/ruphus-thumbs-up.mp4"
      peekHeight={tweaks.peekHeight || 220}
      note="Here's what the next few days look like. No surprises."
      headline="Your free trial, briefly."
      ctaLabel="Continue"
      onCta={tweaks.onAdvance}>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 0, marginTop: 4 }}>
        {R12_STEPS.map((s, i) => {
          const last = i === R12_STEPS.length - 1;
          return (
            <div key={s.title} style={{ display: 'flex', gap: 12 }}>
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                flexShrink: 0, width: 36
              }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: C.amberBg,
                  border: `1.5px solid #E8D5A0`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: C.accent, fontSize: 15, fontWeight: 800,
                  fontFamily: fonts.body
                }}>{s.dot}</div>
                {!last &&
                <div style={{
                  width: 2, flex: 1, minHeight: 22,
                  background: C.borderLight,
                  marginTop: 3, marginBottom: 3
                }} />
                }
              </div>
              <div style={{ flex: 1, paddingBottom: last ? 0 : 14 }}>
                <div style={{
                  fontFamily: fonts.heading, fontSize: 16, color: C.text,
                  marginBottom: 2
                }}>{s.title}</div>
                <div style={{ fontSize: 13, color: C.textMuted, lineHeight: 1.4 }}>
                  {s.body}
                </div>
              </div>
            </div>);

        })}
      </div>
      <label style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '10px 12px',
        background: C.card,
        border: `1px solid ${C.borderLight}`,
        borderRadius: 12,
        cursor: 'pointer',
        marginTop: 6
      }}>
        <input
          type="checkbox"
          checked={!!consent}
          onChange={(e) => onConsent && onConsent(e.target.checked)}
          style={{ marginTop: 2, width: 18, height: 18, accentColor: C.accent }} />
        
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, color: C.text, fontWeight: 700, lineHeight: 1.3 }}>
            Send me brewing tips by email
          </div>
          <div style={{ fontSize: 11, color: C.textMuted, lineHeight: 1.3, marginTop: 2 }}>
            Occasional emails. Unsubscribe anytime.
          </div>
        </div>
      </label>
    </PeekScreen>);

}

// ─────────────────────────────────────────────────────────────────────
// R13 — Paywall
// Two tiers (Pro + Ultra) shown side-by-side with annual+monthly each.
// Pricing & feature lists pulled from Coffee-App-Build/PaywallSheet.jsx.
// Two layouts:
//   - "sheet"  → bottom sheet, mascot peek above (the existing pattern)
//   - "immersive" → mascot animation full-screen, content overlays on top
// Toggle via tweaks.paywallVariant.
// ─────────────────────────────────────────────────────────────────────
const R13_TIERS = [
{
  key: 'pro',
  label: 'PRO',
  annualPrice: '$39.99/yr',
  monthlyPrice: '$4.99/mo',
  save: 'Save 17%',
  features: [
  'AI tasting coach with guided scoring',
  'Unlimited bean scanning',
  'Personalized hand brew recipes',
  'Coffee chat with expert knowledge']

},
{
  key: 'ultra',
  label: 'ULTRA',
  annualPrice: '$79.99/yr',
  monthlyPrice: '$9.99/mo',
  save: 'Save 17%',
  badge: 'BEST VALUE',
  features: [
  'Everything in Pro, unlimited',
  'Push recipes directly to Fellow Aiden',
  'Multi-brewer support (V60, Chemex, AeroPress)',
  'Priority model routing']

}];


function R13Paywall({ tweaks, plan, onPlan, variant = 'sheet' }) {
  if (variant === 'immersive') {
    return <R13Immersive tweaks={tweaks} plan={plan} onPlan={onPlan} />;
  }
  return <R13Sheet tweaks={tweaks} plan={plan} onPlan={onPlan} />;
}

// ── Variant A: bottom-sheet style (matches the screenshot you sent) ──
function R13Sheet({ tweaks, plan, onPlan }) {
  const selectedTier = plan && plan.startsWith('ultra') ? 'ultra' : 'pro';
  const selectedCycle = plan && plan.endsWith('monthly') ? 'monthly' : 'annual';
  const tier = R13_TIERS.find((t) => t.key === selectedTier);
  const trialLabel = `Start 3-day free trial → ${tier.label.charAt(0) + tier.label.slice(1).toLowerCase()} ${selectedCycle === 'annual' ? 'Annual' : 'Monthly'}`;
  const fineprint = `3-day free trial, then ${selectedCycle === 'annual' ? tier.annualPrice.replace('/yr', '/year') : tier.monthlyPrice.replace('/mo', '/month')}. Cancel anytime.`;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#FFFFFF',
      display: 'flex', flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative',
      overflow: 'hidden'
    }}>
      <TopBar step="R13 · UNLOCK" onBack={tweaks.onBack} overlay />

      <MascotStage src="assets/ruphus-confident.mp4" height={tweaks.peekHeight || 240} />

      <div style={{
        flex: 1,
        padding: '4px 18px 12px',
        display: 'flex', flexDirection: 'column',
        gap: 10,
        minHeight: 0,
        overflowY: 'auto'
      }}>
        <div style={{
          fontFamily: fonts.heading,
          fontSize: 24, lineHeight: 1.2,
          color: C.text,
          textAlign: 'center',
          marginTop: 2
        }}>
          Want me to guide you all the way?
        </div>
        <div style={{
          fontSize: 13, color: C.textMuted,
          textAlign: 'center', lineHeight: 1.4
        }}>
          Unlimited scans, the tasting coach, Aiden recipes — this is where we shake on it.
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: 8,
          marginTop: 6
        }}>
          {R13_TIERS.map((t) =>
          <TierCard
            key={t.key}
            tier={t}
            selectedTier={selectedTier}
            selectedCycle={selectedCycle}
            onSelect={(cycle) => onPlan && onPlan(`${t.key}_${cycle}`)} />

          )}
        </div>
      </div>

      <div style={{
        padding: '10px 18px 18px',
        background: '#FFFFFF',
        borderTop: `1px solid ${C.borderLight}`,
        flexShrink: 0
      }}>
        <button
          onClick={tweaks.onAdvance}
          style={{
            width: '100%', minHeight: 52,
            fontSize: 15, fontWeight: 800, fontFamily: fonts.body,
            background: C.accent, color: '#fff', border: 'none',
            borderRadius: 12, cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(92,61,46,0.12), 0 4px 12px rgba(176,117,64,0.18)'
          }}>
          
          {trialLabel}
        </button>
        <div style={{
          fontSize: 11, color: C.textLight,
          textAlign: 'center', marginTop: 8, lineHeight: 1.3
        }}>
          {fineprint}
        </div>
        <div style={{
          display: 'flex', gap: 12, justifyContent: 'center',
          marginTop: 6,
          fontSize: 11, color: C.textLight,
          textDecorationLine: 'underline'
        }}>
          <span style={{ textDecoration: 'underline' }}>Terms of Use</span>
          <span style={{ color: C.borderLight }}>·</span>
          <span style={{ textDecoration: 'underline' }}>Privacy Policy</span>
          <span style={{ color: C.borderLight }}>·</span>
          <span style={{ textDecoration: 'underline' }}>Restore Purchases</span>
        </div>
      </div>
    </div>);

}

function TierCard({ tier, selectedTier, selectedCycle, onSelect }) {
  const selected = selectedTier === tier.key;
  return (
    <div style={{
      background: selected ? '#FFFFFF' : C.amberBg,
      border: `${selected ? 2 : 1}px solid ${selected ? C.accent : '#F0E2C8'}`,
      borderRadius: 14,
      padding: '12px 10px',
      display: 'flex', flexDirection: 'column',
      position: 'relative',
      cursor: 'pointer'
    }}
    onClick={() => onSelect(selectedCycle)}>
      {tier.badge &&
      <div style={{
        position: 'absolute', top: -10, left: '50%',
        transform: 'translateX(-50%)',
        background: C.accent, color: '#fff',
        fontSize: 9, fontWeight: 800,
        letterSpacing: 0.6,
        padding: '3px 8px', borderRadius: 999,
        whiteSpace: 'nowrap'
      }}>{tier.badge}</div>
      }
      <div style={{
        textAlign: 'center',
        fontSize: 11, fontWeight: 800,
        letterSpacing: 1.5,
        color: selected ? C.accent : C.textMuted,
        marginBottom: 8,
        marginTop: tier.badge ? 2 : 0
      }}>{tier.label}</div>

      <button
        onClick={(e) => {e.stopPropagation();onSelect('annual');}}
        style={{
          width: '100%',
          background: selected && selectedCycle === 'annual' ? C.accent : 'transparent',
          color: selected && selectedCycle === 'annual' ? '#fff' : C.text,
          border: 'none',
          padding: '8px 6px',
          borderRadius: 10,
          textAlign: 'center',
          cursor: 'pointer',
          marginBottom: 4
        }}>
        
        <div style={{ fontSize: 14, fontWeight: 800, fontFamily: fonts.body }}>{tier.annualPrice}</div>
        <div style={{
          fontSize: 10,
          color: selected && selectedCycle === 'annual' ? 'rgba(255,255,255,0.85)' : C.textMuted,
          marginTop: 1
        }}>{tier.save}</div>
      </button>

      <div style={{
        height: 1, background: selected ? C.borderLight : '#EEDFC4',
        margin: '4px 0 6px'
      }} />

      <button
        onClick={(e) => {e.stopPropagation();onSelect('monthly');}}
        style={{
          width: '100%',
          background: selected && selectedCycle === 'monthly' ? C.accent : 'transparent',
          color: selected && selectedCycle === 'monthly' ? '#fff' : C.text,
          border: 'none',
          padding: '6px',
          borderRadius: 10,
          fontSize: 13, fontWeight: 800, fontFamily: fonts.body,
          cursor: 'pointer',
          marginBottom: 8
        }}>
        
        {tier.monthlyPrice}
      </button>

      <ul style={{
        listStyle: 'none', padding: 0, margin: 0,
        display: 'flex', flexDirection: 'column',
        gap: 6
      }}>
        {tier.features.map((f, i) =>
        <li key={i} style={{
          fontSize: 11,
          color: C.text,
          lineHeight: 1.35,
          paddingTop: i === 0 ? 0 : 6,
          borderTop: i === 0 ? 'none' : `1px solid ${selected ? C.borderLight : '#EEDFC4'}`
        }}>
            {f}
          </li>
        )}
      </ul>
    </div>);

}

// ── Variant B: immersive — mascot full-bleed, content overlays on top ──
function R13Immersive({ tweaks, plan, onPlan }) {
  const selectedTier = plan && plan.startsWith('ultra') ? 'ultra' : 'pro';
  const selectedCycle = plan && plan.endsWith('monthly') ? 'monthly' : 'annual';
  const tier = R13_TIERS.find((t) => t.key === selectedTier);
  const trialLabel = `Start 3-day free trial`;
  const fineprint = `${selectedCycle === 'annual' ? tier.annualPrice.replace('/yr', '/year') : tier.monthlyPrice.replace('/mo', '/month')} after trial. Cancel anytime.`;

  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#FFFFFF',
      position: 'relative',
      overflow: 'hidden',
      fontFamily: fonts.body
    }}>
      {/* Full-bleed mascot loop, behind everything */}
      <video
        src="assets/ruphus-confident.mp4"
        autoPlay muted loop playsInline preload="auto"
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%',
          objectFit: 'cover',
          objectPosition: 'center 30%'
        }} />
      

      {/* Soft gradient at the bottom so text overlay reads cleanly without
                  covering the mascot's head/upper body */}
      <div style={{
        position: 'absolute', left: 0, right: 0, bottom: 0,
        height: '74%',
        background: 'linear-gradient(180deg, rgba(255,255,255,0) 0%, rgba(255,255,255,0.92) 22%, #FFFFFF 50%)',
        pointerEvents: 'none'
      }} />

      {/* Top close button */}
      <div style={{
        position: 'absolute', top: 6, left: 0, right: 0,
        display: 'flex', justifyContent: 'space-between',
        alignItems: 'center',
        padding: '8px 12px'
      }}>
        <div style={{
          background: 'rgba(255,255,255,0.85)',
          backdropFilter: 'blur(8px)',
          border: `1px solid ${C.borderLight}`,
          color: C.accent,
          padding: '6px 12px',
          borderRadius: 999,
          fontSize: 11, fontWeight: 800, letterSpacing: 1,
          display: 'flex', alignItems: 'center', gap: 6
        }}>
          <span style={{ fontSize: 14 }}>✦</span> 2MANYBEANS · PRO
        </div>
        <button
          onClick={tweaks.onBack}
          style={{
            width: 36, height: 36, borderRadius: '50%',
            background: 'rgba(0,0,0,0.45)',
            border: 'none', color: '#fff',
            fontSize: 18, cursor: 'pointer',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
          ×</button>
      </div>

      {/* Content overlay anchored to bottom */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0,
        padding: '0 18px 14px',
        display: 'flex', flexDirection: 'column', gap: 9
      }}>
        <div style={{
          fontFamily: fonts.heading,
          fontSize: 26, lineHeight: 1.08,
          color: C.text,
          textAlign: 'left',
          fontWeight: 800
        }}>
          Brew like you mean it.
        </div>

        {/* Feature list — checks for Pro features, sparkles for Ultra-only */}
        <ul style={{
          listStyle: 'none', padding: 0, margin: 0,
          display: 'flex', flexDirection: 'column', gap: 5
        }}>
          {R13_FEATURE_LIST.map((f, i) =>
          <li key={i} style={{
            display: 'flex', alignItems: 'center', gap: 9,
            fontSize: 12.5, color: C.text, fontWeight: 600,
            lineHeight: 1.3
          }}>
              <FeatureGlyph ultraOnly={f.ultraOnly} />
              <span style={{ flex: 1 }}>{f.label}</span>
              {f.ultraOnly &&
            <span style={{
              fontSize: 9, fontWeight: 800, letterSpacing: 0.6,
              color: C.accent,
              background: 'rgba(176,117,64,0.12)',
              padding: '2px 6px', borderRadius: 999,
              flexShrink: 0
            }}>ULTRA</span>
            }
            </li>
          )}
        </ul>

        {/* Plan rows — selected tier goes black-on-white, both visible */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 2 }}>
          {R13_TIERS.map((t) => {
            const isSelected = selectedTier === t.key;
            return (
              <button
                key={t.key}
                onClick={() => onPlan && onPlan(`${t.key}_annual`)}
                style={{
                  width: '100%',
                  padding: '10px 12px',
                  background: isSelected ? '#1A0F08' : '#FFFFFF',
                  color: isSelected ? '#FFFFFF' : C.text,
                  border: `1.5px solid ${isSelected ? '#1A0F08' : C.borderLight}`,
                  borderRadius: 12,
                  textAlign: 'left',
                  display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                  cursor: 'pointer',
                  fontFamily: fonts.body
                }}>
                
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span style={{
                    width: 16, height: 16, borderRadius: 8,
                    border: `2px solid ${isSelected ? '#fff' : C.border}`,
                    background: isSelected ? '#fff' : 'transparent',
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    flexShrink: 0
                  }}>
                    {isSelected &&
                    <span style={{ width: 7, height: 7, borderRadius: 4, background: '#1A0F08' }} />
                    }
                  </span>
                  <div>
                    <div style={{
                      display: 'flex', alignItems: 'center', gap: 6,
                      fontSize: 13, fontWeight: 800
                    }}>
                      {t.label.charAt(0) + t.label.slice(1).toLowerCase()}
                      {t.badge &&
                      <span style={{
                        background: C.accent, color: '#fff',
                        fontSize: 8.5, fontWeight: 800, letterSpacing: 0.6,
                        padding: '2px 6px', borderRadius: 999
                      }}>{t.badge}</span>
                      }
                    </div>
                    <div style={{
                      fontSize: 10.5,
                      color: isSelected ? 'rgba(255,255,255,0.7)' : C.textMuted,
                      marginTop: 1
                    }}>
                      {t.annualPrice} · {t.save}
                    </div>
                  </div>
                </div>
                <div style={{ fontSize: 13, fontWeight: 800 }}>
                  {t.monthlyPrice}
                </div>
              </button>);

          })}
        </div>

        <button
          onClick={tweaks.onAdvance}
          style={{
            width: '100%', minHeight: 50,
            fontSize: 15, fontWeight: 800, fontFamily: fonts.body,
            background: C.accent, color: '#fff', border: 'none',
            borderRadius: 25, cursor: 'pointer',
            marginTop: 2,
            boxShadow: '0 1px 4px rgba(92,61,46,0.12), 0 8px 20px rgba(176,117,64,0.25)'
          }}>
          
          {trialLabel} →
        </button>
        <div style={{
          fontSize: 10, color: C.textMuted,
          textAlign: 'center', lineHeight: 1.3
        }}>
          {fineprint}
        </div>
        <div style={{
          display: 'flex', gap: 14, justifyContent: 'center',
          fontSize: 10, color: C.textLight
        }}>
          <span style={{ textDecoration: 'underline' }}>Restore</span>
          <span style={{ textDecoration: 'underline' }}>Terms</span>
          <span style={{ textDecoration: 'underline' }}>Privacy</span>
        </div>
      </div>
    </div>);

}

// Feature list for the immersive paywall. Pro features get a check;
// Ultra-only features get a sparkle glyph + a small "ULTRA" tag at the
// end of the row, so the differentiation is visible without leaving
// the original stacked layout.
const R13_FEATURE_LIST = [
{ label: 'Unlimited bean scans · no daily cap', ultraOnly: false },
{ label: 'AI tasting coach with guided scoring', ultraOnly: false },
{ label: 'Personalized hand brew recipes', ultraOnly: false },
{ label: 'Coffee chat with expert knowledge', ultraOnly: false },
{ label: 'Recipes pushed straight to Fellow Aiden', ultraOnly: true },
{ label: 'Multi-brewer support · V60, Chemex, AeroPress', ultraOnly: true },
{ label: 'Priority model routing', ultraOnly: true }];


function FeatureGlyph({ ultraOnly }) {
  return (
    <span style={{
      width: 18, height: 18, borderRadius: 9,
      background: ultraOnly ? 'transparent' : C.accent,
      border: ultraOnly ? `1.5px solid ${C.accent}` : 'none',
      color: ultraOnly ? C.accent : '#fff',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      fontSize: ultraOnly ? 10 : 11, fontWeight: 800,
      flexShrink: 0
    }}>
      {ultraOnly ? '✦' : '✓'}
    </span>);

}

// ─────────────────────────────────────────────────────────────────────
// R13b — Nudge (post-paywall dismiss)
// Mascot waving. Soft retention beat with one CTA + maybe later link.
// ─────────────────────────────────────────────────────────────────────
function R13bNudge({ tweaks }) {
  return (
    <div style={{
      width: '100%', height: '100%',
      background: '#FFFFFF',
      display: 'flex', flexDirection: 'column',
      fontFamily: fonts.body,
      position: 'relative', overflow: 'hidden'
    }}>
      <TopBar step="R13b · ONE LAST THING" hideBack overlay />
      <MascotStage src="assets/ruphus-waving.mp4" height={tweaks.mascotHeight} />
      <div style={{
        flex: 1, padding: '4px 24px 8px',
        display: 'flex', flexDirection: 'column', gap: 12,
        minHeight: 0
      }}>
        <div style={{
          fontFamily: fonts.title, fontSize: 36, lineHeight: 1.0,
          color: C.accent, textAlign: 'center', marginTop: -4
        }}>
          One more tiny thing
        </div>
        <NoteBubble style={{ marginTop: 4 }}>
          No worries, brewer. Your first scan is on me — want to try it now?
          It's the fastest way to see how this all fits together.
        </NoteBubble>
      </div>
      <div style={{
        padding: '10px 20px 20px',
        background: C.cream,
        borderTop: `1px solid ${C.borderLight}`,
        display: 'flex', flexDirection: 'column', gap: 8
      }}>
        <button
          onClick={tweaks.onAdvance}
          style={{
            width: '100%', minHeight: 50,
            fontSize: 16, fontWeight: 700, fontFamily: fonts.body,
            background: C.accent, color: '#fff', border: 'none',
            borderRadius: 12, cursor: 'pointer',
            boxShadow: '0 1px 4px rgba(92,61,46,0.12), 0 4px 12px rgba(176,117,64,0.18)'
          }}>
          
          Yes, let's scan
        </button>
        <button
          onClick={tweaks.onAdvance}
          style={{
            width: '100%', minHeight: 44,
            fontSize: 14, fontWeight: 700, fontFamily: fonts.body,
            background: 'transparent', color: C.textMuted, border: 'none',
            cursor: 'pointer'
          }}>
          
          Maybe later
        </button>
      </div>
    </div>);

}

Object.assign(window, {
  R1Welcome, R2Goal, R3Pain,
  R4Social, R5Tinder, R6Personalized, R7Kit,
  R8Camera, R9Processing, R10Scan, R11Value,
  R12Trial, R13Paywall, R13bNudge
});