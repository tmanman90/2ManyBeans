"use client";

// Full-size slide renderer. Navigate to /slide/01-hero-rotation for slide 1
// at exactly 1320x2868 with no chrome. Playwright uses this route to
// capture clean exports.

import { use } from "react";
import { Slide1, Slide2, Slide3, Slide4, Slide5 } from "../../slides";

const CANVAS_W = 1320;
const CANVAS_H = 2868;

const MAP: Record<string, () => React.ReactElement> = {
  "01-hero-rotation": Slide1,
  "02-scan-inventory": Slide2,
  "03-tasting-coach": Slide3,
  "04-chat-professor": Slide4,
  "05-brew-timer": Slide5,
};

export default function SlidePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const Component = MAP[id];
  if (!Component) {
    return <div style={{ padding: 40 }}>Unknown slide: {id}</div>;
  }
  return (
    <div
      style={{
        margin: 0,
        padding: 0,
        width: CANVAS_W,
        height: CANVAS_H,
        position: "relative",
        overflow: "hidden",
      }}
    >
      <Component />
    </div>
  );
}
