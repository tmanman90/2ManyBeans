/**
 * GrainOverlay — subtle fixed film grain for tactile, premium warmth.
 * Pure SVG feTurbulence baked into a data-URI; near-zero runtime cost,
 * GPU-composited, pointer-events: none. Purely decorative.
 */
const NOISE = `data:image/svg+xml;utf8,` + encodeURIComponent(
  `<svg xmlns='http://www.w3.org/2000/svg' width='160' height='160'>
     <filter id='n'>
       <feTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/>
       <feColorMatrix type='saturate' values='0'/>
     </filter>
     <rect width='100%' height='100%' filter='url(#n)'/>
   </svg>`
);

export default function GrainOverlay({ opacity = 0.035, blend = 'multiply', z = 1 }) {
  return (
    <div
      aria-hidden="true"
      style={{
        position: 'fixed',
        inset: 0,
        pointerEvents: 'none',
        zIndex: z,
        opacity,
        mixBlendMode: blend,
        backgroundImage: `url("${NOISE}")`,
        backgroundSize: '160px 160px',
        backgroundRepeat: 'repeat',
      }}
    />
  );
}
