import { useRef, useEffect } from 'react';

/**
 * SteamGradient — animated warm caramel/espresso flow-field rendered in WebGL.
 * A branded, abstract "steam over coffee" hero background that replaces stock art.
 *
 * Safe by construction:
 *  - Caps device-pixel-ratio (perf on Retina iPhones)
 *  - Pauses rAF when offscreen (IntersectionObserver) or tab hidden
 *  - Honors prefers-reduced-motion (renders one static frame, no loop)
 *  - Falls back to a CSS gradient if WebGL is unavailable or context is lost
 *
 * Purely decorative — no data, no interactivity. Drop behind header content.
 */
const FRAG = `
precision mediump float;
uniform vec2 u_res;
uniform float u_time;
uniform vec3 u_c1; // base paper-dark
uniform vec3 u_c2; // caramel
uniform vec3 u_c3; // espresso highlight

// hash + value noise + fbm (domain warped) for soft flowing steam
float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
float noise(vec2 p){
  vec2 i = floor(p); vec2 f = fract(p);
  vec2 u = f*f*(3.0-2.0*f);
  return mix(mix(hash(i+vec2(0,0)), hash(i+vec2(1,0)), u.x),
             mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
}
float fbm(vec2 p){
  float v = 0.0; float a = 0.5;
  for(int i=0;i<5;i++){ v += a*noise(p); p *= 2.02; a *= 0.5; }
  return v;
}
void main(){
  vec2 uv = gl_FragCoord.xy / u_res.xy;
  vec2 p = uv * vec2(u_res.x/u_res.y, 1.0) * 2.2;
  float t = u_time * 0.06;
  // domain warp for organic curling steam
  vec2 q = vec2(fbm(p + vec2(0.0, t)), fbm(p + vec2(3.7, -t*0.8)));
  vec2 r = vec2(fbm(p + 2.0*q + vec2(1.7, 9.2) + 0.15*t),
                fbm(p + 2.0*q + vec2(8.3, 2.8) - 0.12*t));
  float f = fbm(p + 2.5*r);
  // warm vertical falloff so the top is lighter (steam rising)
  float vfall = smoothstep(0.0, 1.0, uv.y);
  vec3 col = mix(u_c1, u_c2, smoothstep(0.25, 0.85, f));
  col = mix(col, u_c3, smoothstep(0.55, 1.0, f*r.x) * 0.5);
  col = mix(col, u_c2, (1.0 - vfall) * 0.18);
  // subtle grain
  col += (hash(uv * u_res.xy + t) - 0.5) * 0.025;
  gl_FragColor = vec4(col, 1.0);
}
`;

const VERT = `
attribute vec2 a_pos;
void main(){ gl_Position = vec4(a_pos, 0.0, 1.0); }
`;

// Default warm coffee palette (paper-dark, caramel, espresso)
const DEFAULT = {
  c1: [0.36, 0.27, 0.20],
  c2: [0.66, 0.42, 0.22],
  c3: [0.29, 0.18, 0.11],
};

function hexToRgb01(arr) { return arr; }

export default function SteamGradient({ colors = DEFAULT, speed = 1, style, className }) {
  const canvasRef = useRef(null);
  const fallbackRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const prefersReduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let gl;
    try {
      gl = canvas.getContext('webgl', { antialias: false, depth: false, premultipliedAlpha: false, powerPreference: 'low-power' })
        || canvas.getContext('experimental-webgl');
    } catch (_) { gl = null; }
    if (!gl) { if (fallbackRef.current) fallbackRef.current.style.opacity = '1'; return; }

    const compile = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      return s;
    };
    const prog = gl.createProgram();
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
      if (fallbackRef.current) fallbackRef.current.style.opacity = '1';
      return;
    }
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1, 3,-1, -1,3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'a_pos');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uRes = gl.getUniformLocation(prog, 'u_res');
    const uTime = gl.getUniformLocation(prog, 'u_time');
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_c1'), hexToRgb01(colors.c1));
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_c2'), hexToRgb01(colors.c2));
    gl.uniform3fv(gl.getUniformLocation(prog, 'u_c3'), hexToRgb01(colors.c3));

    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    const resize = () => {
      const w = Math.max(1, Math.floor(canvas.clientWidth * dpr));
      const h = Math.max(1, Math.floor(canvas.clientHeight * dpr));
      if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.uniform2f(uRes, canvas.width, canvas.height);
    };
    resize();

    let raf = 0, start = performance.now(), visible = true, running = true;
    // Sizing is handled by ResizeObserver only — the draw loop never reads
    // layout (avoids per-frame reflow in WKWebView).
    const frame = (now) => {
      if (!running) return;
      gl.uniform1f(uTime, ((now - start) / 1000) * speed);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!prefersReduced && visible) raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const io = new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (visible && !prefersReduced) { cancelAnimationFrame(raf); raf = requestAnimationFrame(frame); }
    }, { threshold: 0 });
    io.observe(canvas);

    const onLost = (e) => { e.preventDefault(); running = false; cancelAnimationFrame(raf); if (fallbackRef.current) fallbackRef.current.style.opacity = '1'; };
    canvas.addEventListener('webglcontextlost', onLost);

    const ro = new ResizeObserver(() => resize());
    ro.observe(canvas);

    return () => {
      running = false; cancelAnimationFrame(raf);
      io.disconnect(); ro.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
    };
  }, [colors, speed]);

  return (
    <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', ...style }} className={className} aria-hidden="true">
      <div
        ref={fallbackRef}
        style={{
          position: 'absolute', inset: 0, opacity: 0, transition: 'opacity 0.3s',
          background: 'linear-gradient(160deg, #5C4636 0%, #A86A38 55%, #4A2F1E 100%)',
        }}
      />
      <canvas ref={canvasRef} style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', display: 'block' }} />
    </div>
  );
}
