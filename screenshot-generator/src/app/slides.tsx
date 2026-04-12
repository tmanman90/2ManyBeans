"use client";

// Slide components. Each renders a full-canvas (1320x2868) ad-style
// composition with a phone mockup overlaid on the app screenshot.

// ---------- Phone mockup ------------------------------------------------

const MK_W = 1022;
const MK_H = 2082;
const SC_L = (52 / MK_W) * 100;
const SC_T = (46 / MK_H) * 100;
const SC_W = (918 / MK_W) * 100;
const SC_H = (1990 / MK_H) * 100;
const SC_RX = (126 / 918) * 100;
const SC_RY = (126 / 1990) * 100;

const BRAND = {
  bg: "#efe7db",
  bgDark: "#2b1d17",
  bgDeep: "#1a0f09",
  text: "#2b1d17",
  textOnDark: "#f6f1e9",
  muted: "#7c5a47",
  accent: "#a0714b",
  highlight: "#d4a574",
};

function Phone({
  src,
  alt,
  style,
}: {
  src: string;
  alt: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      style={{
        position: "relative",
        aspectRatio: `${MK_W}/${MK_H}`,
        ...style,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src="/mockup.png"
        alt=""
        style={{ display: "block", width: "100%", height: "100%" }}
        draggable={false}
      />
      <div
        style={{
          position: "absolute",
          zIndex: 10,
          overflow: "hidden",
          left: `${SC_L}%`,
          top: `${SC_T}%`,
          width: `${SC_W}%`,
          height: `${SC_H}%`,
          borderRadius: `${SC_RX}% / ${SC_RY}%`,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt={alt}
          style={{
            display: "block",
            width: "100%",
            height: "100%",
            objectFit: "cover",
            objectPosition: "top",
          }}
          draggable={false}
        />
      </div>
    </div>
  );
}

function Headline({
  children,
  color = BRAND.text,
  maxWidth = 960,
}: {
  children: React.ReactNode;
  color?: string;
  maxWidth?: number;
}) {
  return (
    <h2
      style={{
        fontFamily: "var(--font-fraunces), serif",
        fontSize: 138,
        lineHeight: 1.02,
        fontWeight: 600,
        color,
        margin: 0,
        maxWidth,
        textAlign: "center",
        letterSpacing: "-0.02em",
      }}
    >
      {children}
    </h2>
  );
}

function Kicker({
  children,
  color = BRAND.accent,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <div
      style={{
        fontFamily: "var(--font-inter), sans-serif",
        fontSize: 36,
        fontWeight: 700,
        letterSpacing: "0.22em",
        textTransform: "uppercase",
        color,
        marginBottom: 28,
      }}
    >
      {children}
    </div>
  );
}

function Subtext({
  children,
  color = BRAND.muted,
}: {
  children: React.ReactNode;
  color?: string;
}) {
  return (
    <p
      style={{
        fontFamily: "var(--font-inter), sans-serif",
        fontSize: 40,
        lineHeight: 1.35,
        color,
        margin: "38px 0 0",
        maxWidth: 900,
        textAlign: "center",
        fontWeight: 500,
      }}
    >
      {children}
    </p>
  );
}

// ---------- Slide 1: Rotation hero --------------------------------------

export function Slide1() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: `linear-gradient(180deg, ${BRAND.bg} 0%, #e4d7c2 100%)`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 180,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -280,
          left: -220,
          width: 900,
          height: 900,
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, rgba(212,165,116,0.45), rgba(212,165,116,0))",
          filter: "blur(12px)",
          pointerEvents: "none",
        }}
      />
      <Kicker>2manybeans</Kicker>
      <Headline>
        Know when<br />your beans peak.
      </Headline>
      <Subtext>
        The specialty coffee journal<br />that actually coaches you.
      </Subtext>
      <Phone
        src="/screenshots/en/01-rotation.png"
        alt="Rotation tab"
        style={{
          position: "absolute",
          bottom: -160,
          left: "50%",
          transform: "translateX(-50%)",
          width: "78%",
        }}
      />
    </div>
  );
}

// ---------- Slide 2: Scan inventory -------------------------------------

export function Slide2() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: `linear-gradient(160deg, ${BRAND.bgDeep} 0%, ${BRAND.bgDark} 100%)`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 180,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 140,
          right: -160,
          width: 720,
          height: 720,
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, rgba(212,165,116,0.35), rgba(212,165,116,0))",
          filter: "blur(10px)",
        }}
      />
      <Kicker color={BRAND.highlight}>Scan &middot; Research &middot; Log</Kicker>
      <Headline color={BRAND.textOnDark}>
        Scan any bag.<br />AI fills the rest.
      </Headline>
      <Subtext color="rgba(246,241,233,0.72)">
        Origin, altitude, process,<br />tasting notes. No typing.
      </Subtext>
      <Phone
        src="/screenshots/en/02-inventory.png"
        alt="Inventory tab"
        style={{
          position: "absolute",
          bottom: -160,
          left: "50%",
          transform: "translateX(-50%)",
          width: "78%",
        }}
      />
    </div>
  );
}

// ---------- Slide 3: Tasting coach --------------------------------------

export function Slide3() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: `linear-gradient(180deg, #f7e8da 0%, ${BRAND.bg} 100%)`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 180,
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -180,
          right: -200,
          width: 860,
          height: 860,
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, rgba(148,163,136,0.35), rgba(148,163,136,0))",
          filter: "blur(12px)",
        }}
      />
      <Kicker>A cupping mentor</Kicker>
      <Headline>
        Actually learn<br />what you taste.
      </Headline>
      <Subtext>
        An AI coach walks you through<br />aroma, acidity, body, finish.
      </Subtext>
      <Phone
        src="/screenshots/en/03-tasting-log.png"
        alt="Tasting log"
        style={{
          position: "absolute",
          bottom: -160,
          left: "50%",
          transform: "translateX(-50%)",
          width: "78%",
        }}
      />
    </div>
  );
}

// ---------- Slide 4: Coffee chat ----------------------------------------

export function Slide4() {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        position: "relative",
        background: `linear-gradient(180deg, ${BRAND.bg} 0%, #e8dcc6 100%)`,
        overflow: "hidden",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        paddingTop: 180,
      }}
    >
      <div
        style={{
          position: "absolute",
          bottom: 400,
          left: -220,
          width: 760,
          height: 760,
          borderRadius: "50%",
          background:
            "radial-gradient(closest-side, rgba(160,113,75,0.32), rgba(160,113,75,0))",
          filter: "blur(10px)",
        }}
      />
      <Kicker>Professor Ruphus</Kicker>
      <Headline>
        Ask any<br />coffee question.
      </Headline>
      <Subtext>
        Built on the World Atlas of Coffee<br />
        and a library of specialty writing.
      </Subtext>
      <Phone
        src="/screenshots/en/04-chat.png"
        alt="Chat tab"
        style={{
          position: "absolute",
          bottom: -160,
          left: "50%",
          transform: "translateX(-50%)",
          width: "78%",
        }}
      />
    </div>
  );
}
