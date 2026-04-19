"use client";

// Screenshot generator index page.
//
// Shows a 2x2 grid of preview cards. Click any card to open the full-size
// slide route (1320x2868). From the Playwright capture script we navigate
// to /slide/<id> at different viewport sizes to export all 4 Apple sizes.

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Slide1, Slide2, Slide3, Slide4, Slide5 } from "./slides";

const W = 1320;
const H = 2868;

const SLIDES: {
  id: string;
  title: string;
  Component: () => React.ReactElement;
}[] = [
  { id: "01-hero-rotation", title: "Know when your beans peak", Component: Slide1 },
  { id: "02-scan-inventory", title: "Scan any bag, AI fills the rest", Component: Slide2 },
  { id: "03-tasting-coach", title: "Actually learn what you taste", Component: Slide3 },
  { id: "04-chat-professor", title: "Ask any coffee question", Component: Slide4 },
  { id: "05-brew-timer", title: "Brew with precision", Component: Slide5 },
];

export default function Page() {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f3f4f6",
        padding: "40px 32px 200px",
      }}
    >
      <header
        style={{
          maxWidth: 1400,
          margin: "0 auto 32px",
        }}
      >
        <h1
          style={{
            fontFamily: "var(--font-fraunces), serif",
            fontSize: 36,
            margin: "0 0 6px",
            color: "#111827",
          }}
        >
          2manybeans App Store Screenshots
        </h1>
        <p style={{ color: "#6b7280", margin: 0 }}>
          Click any slide to open it at full 1320x2868 canvas. Playwright
          capture script exports all 4 Apple sizes.
        </p>
      </header>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
          gap: 24,
          maxWidth: 1400,
          margin: "0 auto",
        }}
      >
        {SLIDES.map((slide) => (
          <SlidePreview
            key={slide.id}
            id={slide.id}
            title={slide.title}
            Component={slide.Component}
          />
        ))}
      </div>
    </div>
  );
}

function SlidePreview({
  id,
  title,
  Component,
}: {
  id: string;
  title: string;
  Component: () => React.ReactElement;
}) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0.2);

  useEffect(() => {
    if (!wrapRef.current) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setScale(entry.contentRect.width / W);
      }
    });
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);

  return (
    <Link
      href={`/slide/${id}`}
      style={{
        background: "#fff",
        border: "1px solid #e5e7eb",
        borderRadius: 16,
        overflow: "hidden",
        boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
        textDecoration: "none",
        color: "inherit",
        display: "block",
      }}
    >
      <div
        ref={wrapRef}
        style={{
          width: "100%",
          aspectRatio: `${W} / ${H}`,
          position: "relative",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            width: W,
            height: H,
            transform: `scale(${scale})`,
            transformOrigin: "top left",
            position: "absolute",
            top: 0,
            left: 0,
          }}
        >
          <Component />
        </div>
      </div>
      <div
        style={{
          padding: "14px 18px",
          borderTop: "1px solid #f3f4f6",
          color: "#374151",
          fontSize: 14,
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontWeight: 600 }}>{title}</span>
        <span style={{ color: "#9ca3af", fontSize: 12 }}>{id}</span>
      </div>
    </Link>
  );
}
