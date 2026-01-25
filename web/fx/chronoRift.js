// fx/chronoRift.js
export default {
  id: "chronoRift",
  label: "Chrono Rift (Shard Lattice)",
  desc: "origin更新(距離しきい値)で局所バースト。結晶シャード＋位相格子＋高速スキャンで『ダイナミック&繊細』に",

  params: [
    { key: "base", label: "Base Glow", type: "range", min: 0, max: 40, step: 1, default: 2 },

    // 残像（弱い蓄積 + 減衰）
    { key: "layerAdd", label: "Trail Add (0..1)", type: "range", min: 0.00, max: 0.40, step: 0.01, default: 0.18 },
    { key: "trailHalfLife", label: "Trail Half-life (s)", type: "range", min: 0.10, max: 4.00, step: 0.01, default: 0.95 },

    // origin更新
    { key: "holdDist", label: "Origin Update Distance (mm)", type: "range", min: 10, max: 900, step: 1, default: 200 },

    // 局所性
    { key: "maskRadius", label: "Local Radius (mm)", type: "range", min: 60, max: 1600, step: 1, default: 560 },

    // バースト基礎
    { key: "burstLife", label: "Burst Life (s)", type: "range", min: 0.20, max: 4.00, step: 0.01, default: 1.45 },
    { key: "burstSpeed", label: "Burst Ring Speed (mm/s)", type: "range", min: 40, max: 2000, step: 1, default: 620 },
    { key: "burstPeriod", label: "Burst Ring Period (mm)", type: "range", min: 30, max: 520, step: 1, default: 160 },
    { key: "burstWidth", label: "Burst Ring Width (mm)", type: "range", min: 6, max: 200, step: 1, default: 34 },
    { key: "burstGain", label: "Burst Gain", type: "range", min: 0.00, max: 3.00, step: 0.01, default: 1.55 },

    // リボン（高速スキャンも含む）
    { key: "ribbonLen", label: "Ribbon Length (mm)", type: "range", min: 40, max: 1400, step: 1, default: 520 },
    { key: "ribbonWidth", label: "Ribbon Width (mm)", type: "range", min: 4, max: 260, step: 1, default: 26 },
    { key: "ribbonGain", label: "Ribbon Gain", type: "range", min: 0.00, max: 3.00, step: 0.01, default: 1.25 },
    { key: "scanGain", label: "Scan Streak Gain", type: "range", min: 0.00, max: 3.00, step: 0.01, default: 1.10 },

    // シャード（結晶片）
    { key: "shards", label: "Shards (count)", type: "range", min: 2, max: 20, step: 1, default: 10 },
    { key: "shardGain", label: "Shard Gain", type: "range", min: 0.00, max: 3.00, step: 0.01, default: 1.20 },
    { key: "shardWidth", label: "Shard Width (mm)", type: "range", min: 4, max: 120, step: 1, default: 14 },
    { key: "shardBend", label: "Shard Bend", type: "range", min: 0.00, max: 2.00, step: 0.01, default: 1.00 },

    // 位相格子（ホログラムっぽい繊細さ）
    { key: "latticeGain", label: "Lattice Gain", type: "range", min: 0.00, max: 3.00, step: 0.01, default: 1.00 },
    { key: "latticeScale", label: "Lattice Scale", type: "range", min: 0.02, max: 0.30, step: 0.001, default: 0.085 },

    // 粒子（イベント時）
    { key: "particles", label: "Particles (max)", type: "range", min: 0, max: 100, step: 1, default: 28 },
    { key: "pLife", label: "Particle Life (s)", type: "range", min: 0.20, max: 3.50, step: 0.01, default: 1.10 },
    { key: "pGain", label: "Particle Gain", type: "range", min: 0.00, max: 2.50, step: 0.01, default: 0.85 },
    { key: "swirl", label: "Swirl", type: "range", min: 0.00, max: 2.50, step: 0.01, default: 1.05 },

    // 白飛び抑制
    { key: "toneK", label: "Tone K (anti-white)", type: "range", min: 160, max: 1600, step: 1, default: 720 },
    { key: "master", label: "Master Gain", type: "range", min: 0.10, max: 2.50, step: 0.01, default: 1.00 },
  ],

  init(state, params) {
    state.seed = 1337;

    state.prevRawX = 0;
    state.prevRawY = 0;
    state.hasPrevRaw = false;

    state.anchorX = 0;
    state.anchorY = 0;
    state.hasAnchor = false;
    state.prevAnchorX = 0;
    state.prevAnchorY = 0;

    state.acc = null;

    // bursts: {x,y,t0,dx,dy,phase,shardSeed}
    state.bursts = [];

    // particles
    state.p = [];
    state.pCap = Math.max(0, (params && params.particles) | 0 || 0);
    for (let i = 0; i < state.pCap; i++) {
      state.p.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, born: 0, life: 1, phase: 0 });
    }
  },

  render(ctx, out, state, params, geo) {
    const { TOTAL, worldX, worldY } = geo;

    if (!state.acc || state.acc.length !== TOTAL * 3) {
      state.acc = new Float32Array(TOTAL * 3);
      for (let i = 0; i < state.acc.length; i++) state.acc[i] = 0;
    }

    const hypot = Math.hypot;
    const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);

    const rnd = () => {
      state.seed = (1664525 * state.seed + 1013904223) >>> 0;
      return state.seed / 4294967296;
    };

    const hash01 = (n) => {
      // 0..1 の擬似乱数（イベント内で決定的に）
      let x = (n ^ 0x9e3779b9) >>> 0;
      x = (x ^ (x >>> 16)) >>> 0;
      x = (x * 0x7feb352d) >>> 0;
      x = (x ^ (x >>> 15)) >>> 0;
      x = (x * 0x846ca68b) >>> 0;
      x = (x ^ (x >>> 16)) >>> 0;
      return x / 4294967296;
    };

    const gauss = (d, w) => {
      const x = d / Math.max(1e-6, w);
      const k = 1.35;
      return 1 / (1 + k * x * x);
    };

    const distPointToSeg = (px, py, ax, ay, bx, by) => {
      const abx = bx - ax, aby = by - ay;
      const apx = px - ax, apy = py - ay;
      const ab2 = abx * abx + aby * aby;
      let t = ab2 > 1e-9 ? (apx * abx + apy * aby) / ab2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = ax + abx * t, cy = ay + aby * t;
      return hypot(px - cx, py - cy);
    };

    const neon = (phase01) => {
      const a = phase01 * Math.PI * 2;
      const r = 0.55 + 0.45 * Math.sin(a + 2.2);
      const g = 0.55 + 0.45 * Math.sin(a + 0.2);
      const b = 0.55 + 0.45 * Math.sin(a + 4.2);
      return [r, g, b];
    };

    const tone = (v) => {
      const x = Math.max(0, v);
      const K = Math.max(1, +params.toneK || 720);
      return 255 * (x / (x + K));
    };

    const rawX = +ctx.originX || 0;
    const rawY = +ctx.originY || 0;
    const dt = Math.max(1e-3, +ctx.dt || 1 / 60);
    const t = +ctx.t || 0;

    // base
    const base = params.base | 0;
    for (let gi = 0; gi < TOTAL; gi++) {
      const k = gi * 3;
      out[k + 0] = base;
      out[k + 1] = base;
      out[k + 2] = base;
    }

    // raw velocity (direction hint)
    let vx = 0, vy = 0;
    if (!state.hasPrevRaw) {
      state.prevRawX = rawX; state.prevRawY = rawY; state.hasPrevRaw = true;
    } else {
      vx = (rawX - state.prevRawX) / dt;
      vy = (rawY - state.prevRawY) / dt;
      state.prevRawX = rawX;
      state.prevRawY = rawY;
    }

    // anchor update
    const holdDist = Math.max(1, +params.holdDist || 200);
    let anchorUpdated = false;

    if (!state.hasAnchor) {
      state.anchorX = rawX; state.anchorY = rawY; state.hasAnchor = true;
      state.prevAnchorX = state.anchorX; state.prevAnchorY = state.anchorY;
      anchorUpdated = true;
    } else {
      const dxA = rawX - state.anchorX;
      const dyA = rawY - state.anchorY;
      if (hypot(dxA, dyA) >= holdDist) {
        state.prevAnchorX = state.anchorX;
        state.prevAnchorY = state.anchorY;
        state.anchorX = rawX;
        state.anchorY = rawY;
        anchorUpdated = true;
      }
    }

    // burst emit
    if (anchorUpdated) {
      const dxm = state.anchorX - state.prevAnchorX;
      const dym = state.anchorY - state.prevAnchorY;
      const len = hypot(dxm, dym) || 1;
      const ndx = dxm / len;
      const ndy = dym / len;

      const b = {
        x: state.anchorX,
        y: state.anchorY,
        t0: t,
        dx: ndx,
        dy: ndy,
        phase: rnd(),
        shardSeed: (state.seed ^ ((t * 1000) | 0)) >>> 0
      };
      state.bursts.push(b);
      if (state.bursts.length > 8) state.bursts.splice(0, state.bursts.length - 8);

      // particles on event
      const pCapWanted = Math.max(0, params.particles | 0);
      if (state.pCap !== pCapWanted) {
        state.pCap = pCapWanted;
        state.p = [];
        for (let i = 0; i < state.pCap; i++) state.p.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, born: 0, life: 1, phase: 0 });
      }

      const pLife = Math.max(0.05, +params.pLife || 1.0);
      const spawn = Math.min(pCapWanted, 14 + (pCapWanted > 0 ? 12 : 0));
      for (let s = 0; s < spawn; s++) {
        let slot = -1;
        for (let i = 0; i < state.p.length; i++) { if (!state.p[i].alive) { slot = i; break; } }
        if (slot < 0) break;

        const ang = rnd() * Math.PI * 2;
        const sp = 140 + 520 * rnd();
        const jitter = 12 * (rnd() - 0.5);

        const bias = 0.55;
        const p = state.p[slot];
        p.alive = true;
        p.x = state.anchorX + jitter;
        p.y = state.anchorY + jitter;
        p.vx = Math.cos(ang) * sp * (1 - bias) + ndx * sp * bias;
        p.vy = Math.sin(ang) * sp * (1 - bias) + ndy * sp * bias;
        p.born = t;
        p.life = pLife * (0.65 + 0.75 * rnd());
        p.phase = rnd();
      }
    }

    // particle update
    const swirl = Math.max(0, +params.swirl || 0);
    for (let i = 0; i < state.p.length; i++) {
      const p = state.p[i];
      if (!p.alive) continue;

      const age = t - p.born;
      if (age >= p.life) { p.alive = false; continue; }

      const dxo = p.x - state.anchorX, dyo = p.y - state.anchorY;
      const rr = hypot(dxo, dyo) + 1e-6;
      const tx = -dyo / rr, ty = dxo / rr;
      const swirlAcc = (95 * swirl) / (1 + 0.02 * rr);
      p.vx += tx * swirlAcc * dt;
      p.vy += ty * swirlAcc * dt;

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      p.vx *= Math.pow(0.985, dt * 60);
      p.vy *= Math.pow(0.985, dt * 60);
    }

    // trail decay (EMA)
    const halfLife = Math.max(0.05, +params.trailHalfLife || 0.95);
    const decay = Math.pow(0.5, dt / halfLife);
    const add = Math.min(0.40, Math.max(0.00, +params.layerAdd || 0.18));
    const alpha = (1 - decay) * add;
    const master = Math.max(0.0, +params.master || 1.0);

    // params
    const maskRadius = Math.max(10, +params.maskRadius || 560);

    const burstLife = Math.max(0.05, +params.burstLife || 1.45);
    const burstSpeed = Math.max(1, +params.burstSpeed || 620);
    const burstPeriod = Math.max(1, +params.burstPeriod || 160);
    const burstWidth = Math.max(1, +params.burstWidth || 34);
    const burstGain = Math.max(0, +params.burstGain || 1.0);

    const ribbonLen = Math.max(1, +params.ribbonLen || 520);
    const ribbonWidth = Math.max(1, +params.ribbonWidth || 26);
    const ribbonGain = Math.max(0, +params.ribbonGain || 1.0);
    const scanGain = Math.max(0, +params.scanGain || 0);

    const shards = Math.max(2, params.shards | 0);
    const shardGain = Math.max(0, +params.shardGain || 0);
    const shardWidth = Math.max(1, +params.shardWidth || 14);
    const shardBend = Math.max(0, +params.shardBend || 0);

    const latticeGain = Math.max(0, +params.latticeGain || 0);
    const latticeScale = Math.max(0.001, +params.latticeScale || 0.085);

    const pGain = Math.max(0, +params.pGain || 0);

    const ringStrength = (r, phase, age) => {
      const ro = age * burstSpeed;
      let m = (r - ro) % burstPeriod;
      if (m < 0) m += burstPeriod;
      const d = Math.min(m, burstPeriod - m);
      let a = gauss(d, burstWidth);
      a *= 0.62 + 0.38 * Math.sin(r * 0.065 + age * 8.2 + phase * 6.0);
      return a;
    };

    // shard: a set of moving "ray segments" that bend over time
    const shardField = (x, y, b, age, local) => {
      // returns intensity 0..something
      let a = 0;
      const fade = Math.max(0, 1 - age / burstLife);
      const f2 = fade * fade;

      // event-based deterministic shards
      for (let i = 0; i < shards; i++) {
        const h = hash01((b.shardSeed + i * 1013) >>> 0);
        const h2 = hash01((b.shardSeed + i * 8179 + 33) >>> 0);

        // base angle around burst direction, with some spread
        const spread = 1.35;
        const baseAng = Math.atan2(b.dy, b.dx);
        const ang0 = baseAng + (h - 0.5) * spread * Math.PI;

        // bend over time (refraction 느낌)
        const bend = (h2 - 0.5) * shardBend * 1.2;
        const ang = ang0 + bend * Math.sin(age * (5.0 + 3.0 * h) + h2 * 6.0);

        const ux = Math.cos(ang), uy = Math.sin(ang);

        // shard head travels outward
        const head = age * (520 + 520 * h);
        const len = (180 + 520 * h2) * (0.35 + 0.65 * f2);

        // segment endpoints
        const ax = b.x + ux * (head - len);
        const ay = b.y + uy * (head - len);
        const bx = b.x + ux * (head);
        const by = b.y + uy * (head);

        const dseg = distPointToSeg(x, y, ax, ay, bx, by);
        const w = shardWidth * (0.75 + 0.6 * h);
        const g = gauss(dseg, w);

        // micro scan on shard
        const micro = 0.70 + 0.30 * Math.sin((x * 0.09 + y * 0.07) + age * (12.0 + 6.0 * h) + h2 * 10.0);

        a += g * micro * f2;
      }

      return a * local;
    };

    // lattice: hologram grid interference (local only)
    const lattice = (x, y, b, age, local) => {
      if (latticeGain <= 0) return 0;
      const fade = Math.max(0, 1 - age / burstLife);
      const f = fade * (0.35 + 0.65 * fade);

      // two rotated grid axes
      const theta = (b.phase * 2 - 1) * 0.5; // -0.5..0.5 rad
      const c = Math.cos(theta), s = Math.sin(theta);
      const rx = x * c - y * s;
      const ry = x * s + y * c;

      const k = latticeScale;
      const g1 = Math.sin(rx * k + age * 8.0 + b.phase * 6.0);
      const g2 = Math.sin(ry * k * 1.17 - age * 6.2 + b.phase * 3.0);

      // thin lines: abs(sin) -> near 0 is line
      const l1 = 1 - Math.min(1, Math.abs(g1) * 3.0);
      const l2 = 1 - Math.min(1, Math.abs(g2) * 3.0);

      // shimmering interference
      const inter = (0.55 + 0.45 * Math.sin((rx + ry) * k * 0.8 + age * 12.0));
      const a = (l1 * 0.55 + l2 * 0.55) * inter;

      return a * f * local * latticeGain;
    };

    // LED loop
    for (let gi = 0; gi < TOTAL; gi++) {
      const x = worldX[gi], y = worldY[gi];

      let R = 0, G = 0, B = 0;

      for (let bi = 0; bi < state.bursts.length; bi++) {
        const b = state.bursts[bi];
        const age = t - b.t0;
        if (age < 0 || age > burstLife) continue;

        const dx = x - b.x, dy = y - b.y;
        const rr = hypot(dx, dy);

        // local mask
        const local = gauss(rr, maskRadius);

        const fade = Math.max(0, 1 - age / burstLife);
        const f2 = fade * fade;

        // ring
        const aRing = ringStrength(rr, b.phase, age) * local * burstGain * f2;

        // ribbon segment
        const ax = b.x;
        const ay = b.y;
        const bx = b.x - b.dx * ribbonLen * (0.35 + 0.65 * fade);
        const by = b.y - b.dy * ribbonLen * (0.35 + 0.65 * fade);
        const dseg = distPointToSeg(x, y, ax, ay, bx, by);
        let aRib = gauss(dseg, ribbonWidth) * local * ribbonGain * f2;
        aRib *= 0.70 + 0.30 * Math.sin((x * 0.07 + y * 0.05) + age * 10.0);

        // scan streak: a super thin fast line that outruns ring (very "wow")
        let aScan = 0;
        if (scanGain > 0) {
          const head = age * (burstSpeed * 2.2);
          const ax2 = b.x;
          const ay2 = b.y;
          const bx2 = b.x + b.dx * head;
          const by2 = b.y + b.dy * head;
          const dseg2 = distPointToSeg(x, y, ax2, ay2, bx2, by2);
          aScan = gauss(dseg2, 10) * local * scanGain * (fade * 0.9);
          aScan *= 0.65 + 0.35 * Math.sin(age * 22.0 + (x + y) * 0.02);
        }

        // shards
        const aShard = shardGain > 0 ? shardField(x, y, b, age, local) * shardGain : 0;

        // lattice
        const aLat = latticeGain > 0 ? lattice(x, y, b, age, local) : 0;

        // color palette
        const [nr0, ng0, nb0] = neon((b.phase + age * 0.18 + rr * 0.0015) % 1);

        // energy scale (avoid white)
        const S = 210 * master;

        // ring (violet-ish)
        R += S * aRing * (0.16 + 0.45 * nr0);
        G += S * aRing * (0.08 + 0.32 * ng0);
        B += S * aRing * (0.46 + 0.95 * nb0);

        // ribbon (cyan-ish)
        R += S * aRib * (0.10 + 0.18 * nr0);
        G += S * aRib * (0.34 + 0.42 * ng0);
        B += S * aRib * (0.56 + 0.35 * nb0);

        // scan streak (almost white but thin)
        if (aScan > 0) {
          R += S * aScan * 0.55;
          G += S * aScan * 0.75;
          B += S * aScan * 0.95;
        }

        // shards (crisp highlights)
        if (aShard > 0) {
          R += S * aShard * (0.35 + 0.35 * nr0);
          G += S * aShard * (0.18 + 0.45 * ng0);
          B += S * aShard * (0.55 + 0.55 * nb0);
        }

        // lattice (fine shimmer)
        if (aLat > 0) {
          R += S * aLat * (0.18 + 0.20 * nr0);
          G += S * aLat * (0.26 + 0.24 * ng0);
          B += S * aLat * (0.34 + 0.38 * nb0);
        }
      }

      // particles (local to anchor)
      if (pGain > 0 && state.p.length) {
        const dxA = x - state.anchorX, dyA = y - state.anchorY;
        const localA = gauss(hypot(dxA, dyA), maskRadius);

        let pr = 0, pg = 0, pb = 0;
        for (let i = 0; i < state.p.length; i++) {
          const p = state.p[i];
          if (!p.alive) continue;

          const age = t - p.born;
          const lifeN = 1 - age / p.life;
          if (lifeN <= 0) continue;

          const ddx = x - p.x, ddy = y - p.y;
          const d = hypot(ddx, ddy);

          const aP = gauss(d, 18) * (lifeN * lifeN) * pGain * localA;
          if (aP < 0.0025) continue;

          const [nr, ng, nb] = neon((p.phase + age * 0.35) % 1);
          pr += aP * nr;
          pg += aP * ng;
          pb += aP * nb;
        }

        const S = 180 * master;
        R += S * pr;
        G += S * pg;
        B += S * pb;
      }

      // tone map
      R = tone(R);
      G = tone(G);
      B = tone(B);

      // trail EMA
      const k = gi * 3;
      state.acc[k + 0] = state.acc[k + 0] * decay + R * alpha;
      state.acc[k + 1] = state.acc[k + 1] * decay + G * alpha;
      state.acc[k + 2] = state.acc[k + 2] * decay + B * alpha;

      out[k + 0] = clamp255(out[k + 0] + state.acc[k + 0]);
      out[k + 1] = clamp255(out[k + 1] + state.acc[k + 1]);
      out[k + 2] = clamp255(out[k + 2] + state.acc[k + 2]);
    }

    // prune old bursts
    if (state.bursts.length) {
      const keep = [];
      const burstLife = Math.max(0.05, +params.burstLife || 1.45);
      for (let i = 0; i < state.bursts.length; i++) {
        const b = state.bursts[i];
        if ((t - b.t0) <= burstLife) keep.push(b);
      }
      state.bursts = keep;
    }
  }
};
