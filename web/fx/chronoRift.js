// fx/chronoRift.js
export default {
  id: "chronoRift",
  label: "Chrono Rift",
  desc: "人の座標(origin)の動きで、ネオンの時空リボン＋粒子＋干渉リングが発生する近未来FX",

  params: [
    { key: "base", label: "Base Glow", type: "range", min: 0, max: 40, step: 1, default: 6 },

    { key: "waveSpeed", label: "Wave Speed (mm/s)", type: "range", min: 30, max: 600, step: 1, default: 220 },
    { key: "wavePeriod", label: "Wave Period (mm)", type: "range", min: 40, max: 300, step: 1, default: 140 },
    { key: "waveWidth", label: "Wave Width (mm)", type: "range", min: 8, max: 120, step: 1, default: 36 },
    { key: "waveGain", label: "Wave Gain", type: "range", min: 0, max: 2.0, step: 0.01, default: 1.00 },

    { key: "ribbonLen", label: "Ribbon Length (mm)", type: "range", min: 40, max: 420, step: 1, default: 220 },
    { key: "ribbonWidth", label: "Ribbon Width (mm)", type: "range", min: 6, max: 120, step: 1, default: 26 },
    { key: "ribbonGain", label: "Ribbon Gain", type: "range", min: 0, max: 2.0, step: 0.01, default: 1.15 },

    { key: "particles", label: "Particles (max)", type: "range", min: 8, max: 80, step: 1, default: 34 },
    { key: "pLife", label: "Particle Life (s)", type: "range", min: 0.3, max: 3.5, step: 0.01, default: 1.35 },
    { key: "pGain", label: "Particle Gain", type: "range", min: 0, max: 2.0, step: 0.01, default: 1.00 },

    { key: "swirl", label: "Swirl", type: "range", min: 0, max: 2.0, step: 0.01, default: 1.00 },
    { key: "speedReact", label: "Speed React", type: "range", min: 0, max: 2.0, step: 0.01, default: 1.00 },
  ],

  init(state, params) {
    state.prevOX = 0;
    state.prevOY = 0;
    state.hasPrev = false;

    state.waveOffset = 0; // mm
    state.seed = 1337;

    // パーティクルプール
    state.p = [];
    state.pCap = Math.max(8, (params && params.particles) | 0 || 34);
    for (let i = 0; i < state.pCap; i++) {
      state.p.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, born: 0, life: 1, phase: 0 });
    }
  },

  render(ctx, out, state, params, geo) {
    const { TOTAL, worldX, worldY } = geo;

    // ---- helpers
    const clamp255 = (v) => (v < 0 ? 0 : v > 255 ? 255 : v | 0);
    const hypot = Math.hypot;

    // LCG乱数（state内完結）
    const rnd = () => {
      state.seed = (1664525 * state.seed + 1013904223) >>> 0;
      return state.seed / 4294967296;
    };

    // 距離 -> ガウスっぽい落ち方（軽量）
    const gauss = (d, w) => {
      // exp(- (d/w)^2 ) の近似：1 / (1 + (d/w)^2 * k)
      const x = d / Math.max(1e-6, w);
      const k = 1.35;
      return 1 / (1 + k * x * x);
    };

    // 線分への最短距離（点P→線分AB）
    const distPointToSeg = (px, py, ax, ay, bx, by) => {
      const abx = bx - ax, aby = by - ay;
      const apx = px - ax, apy = py - ay;
      const ab2 = abx * abx + aby * aby;
      let t = ab2 > 1e-9 ? (apx * abx + apy * aby) / ab2 : 0;
      if (t < 0) t = 0; else if (t > 1) t = 1;
      const cx = ax + abx * t, cy = ay + aby * t;
      return hypot(px - cx, py - cy);
    };

    // パレット（ネオン：cyan↔violet をsin合成）
    const neon = (phase01) => {
      const a = phase01 * Math.PI * 2;
      const r = 0.55 + 0.45 * Math.sin(a + 2.2);
      const g = 0.55 + 0.45 * Math.sin(a + 0.2);
      const b = 0.55 + 0.45 * Math.sin(a + 4.2);
      return [r, g, b];
    };

    // ---- まず out を必ず埋める（ベースの微光）
    const base = params.base | 0;
    for (let gi = 0; gi < TOTAL; gi++) {
      const k = gi * 3;
      out[k + 0] = base;
      out[k + 1] = base;
      out[k + 2] = base;
    }

    const ox = +ctx.originX || 0;
    const oy = +ctx.originY || 0;
    const dt = Math.max(1e-3, +ctx.dt || 1 / 60);
    const t = +ctx.t || 0;

    // ---- 速度推定（人の動きの強さ）
    let vx = 0, vy = 0;
    if (!state.hasPrev) {
      state.prevOX = ox; state.prevOY = oy; state.hasPrev = true;
    } else {
      vx = (ox - state.prevOX) / dt;
      vy = (oy - state.prevOY) / dt;
      // 少しスムージング
      state.prevOX = state.prevOX + (ox - state.prevOX) * 0.45;
      state.prevOY = state.prevOY + (oy - state.prevOY) * 0.45;
    }
    const speed = Math.min(1200, hypot(vx, vy)); // mm/s
    const speedN = Math.min(1, speed / 700);     // 0..1
    const react = Math.max(0, params.speedReact);

    // ---- Wave（干渉リング）
    state.waveOffset = (state.waveOffset + params.waveSpeed * dt) % Math.max(1, params.wavePeriod);
    const wavePeriod = Math.max(1, params.wavePeriod);
    const waveWidth = Math.max(1, params.waveWidth);
    const waveGain = Math.max(0, params.waveGain);

    // ---- Ribbon（速度方向に伸びる時空リボン）
    const ribbonLen = Math.max(1, params.ribbonLen);
    const ribbonWidth = Math.max(1, params.ribbonWidth);
    const ribbonGain = Math.max(0, params.ribbonGain);

    // 方向が取れない（停止）時は、リボンを短くする
    let dirx = 1, diry = 0;
    if (speed > 1e-3) { dirx = vx / speed; diry = vy / speed; }
    const lenNow = ribbonLen * (0.25 + 0.75 * speedN * react);
    const ax = ox;
    const ay = oy;
    const bx = ox - dirx * lenNow;
    const by = oy - diry * lenNow;

    // ---- Particles（ホログラム粒子）
    // 動くほどスポーン増
    const pCapWanted = Math.max(8, params.particles | 0);
    if (state.pCap !== pCapWanted) {
      // 変更があったらプールを作り直し（軽量な安全策）
      state.pCap = pCapWanted;
      state.p = [];
      for (let i = 0; i < state.pCap; i++) state.p.push({ alive: false, x: 0, y: 0, vx: 0, vy: 0, born: 0, life: 1, phase: 0 });
    }

    const pLife = Math.max(0.05, params.pLife);
    const pGain = Math.max(0, params.pGain);

    // スポーン数（1フレームあたり）
    const spawnF = (0.2 + 2.2 * speedN * react) * (dt * 60); // 60fps基準
    let spawnN = spawnF | 0;
    if (rnd() < (spawnF - spawnN)) spawnN++;

    for (let s = 0; s < spawnN; s++) {
      // 空きスロットを探す
      let slot = -1;
      for (let i = 0; i < state.p.length; i++) { if (!state.p[i].alive) { slot = i; break; } }
      if (slot < 0) break;

      const ang = rnd() * Math.PI * 2;
      const sp = (40 + 240 * rnd()) * (0.35 + 0.95 * speedN * react); // mm/s
      const jitter = 8 * (rnd() - 0.5) * (1 + 2 * speedN);

      // 速度方向へ少し偏らせると「追従感」が出る
      const bias = 0.55 * speedN * react;
      const bxv = dirx * sp * bias;
      const byv = diry * sp * bias;

      state.p[slot].alive = true;
      state.p[slot].x = ox + jitter;
      state.p[slot].y = oy + jitter;
      state.p[slot].vx = Math.cos(ang) * sp * (1 - bias) + bxv;
      state.p[slot].vy = Math.sin(ang) * sp * (1 - bias) + byv;
      state.p[slot].born = t;
      state.p[slot].life = pLife * (0.6 + 0.8 * rnd());
      state.p[slot].phase = rnd();
    }

    // 更新
    const swirl = Math.max(0, params.swirl);
    for (let i = 0; i < state.p.length; i++) {
      const p = state.p[i];
      if (!p.alive) continue;

      const age = t - p.born;
      if (age >= p.life) { p.alive = false; continue; }

      // ちょい渦（origin周りへ回す）
      const dxo = p.x - ox, dyo = p.y - oy;
      const r = hypot(dxo, dyo) + 1e-6;
      const tx = -dyo / r, ty = dxo / r; // 接線方向
      const swirlAcc = (80 * swirl) * (0.6 + 0.9 * speedN) / (1 + 0.02 * r);
      p.vx += tx * swirlAcc * dt;
      p.vy += ty * swirlAcc * dt;

      // 位置更新
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // 微減衰
      p.vx *= Math.pow(0.985, dt * 60);
      p.vy *= Math.pow(0.985, dt * 60);
    }

    // ---- 合成描画（LEDごと）
    for (let gi = 0; gi < TOTAL; gi++) {
      const x = worldX[gi], y = worldY[gi];
      const dx = x - ox, dy = y - oy;
      const r = hypot(dx, dy);

      // (1) 干渉リング
      // r に対してリング距離を取る
      let m = (r - state.waveOffset) % wavePeriod;
      if (m < 0) m += wavePeriod;
      // 0に近いほどリング中心（waveWidthでぼかす）
      const ring = Math.min(m, wavePeriod - m);
      let aRing = gauss(ring, waveWidth);

      // 角度干渉で「ホログラム感」
      const ang = Math.atan2(dy, dx);
      const shimmer = 0.55 + 0.45 * Math.sin(ang * 6 + r * 0.06 - t * 3.0);
      aRing *= shimmer * waveGain;

      // (2) リボン（点→線分距離）
      let aRib = 0;
      if (speedN > 0.02) {
        const dseg = distPointToSeg(x, y, ax, ay, bx, by);
        aRib = gauss(dseg, ribbonWidth) * (0.35 + 0.85 * speedN * react) * ribbonGain;

        // リボン内部の「走査線」っぽいノイズ
        const scan = 0.65 + 0.35 * Math.sin((x * 0.08 + y * 0.05) + t * 10.0);
        aRib *= scan;
      }

      // (3) 粒子（最大80想定でも 480*80=38400 でギリOK）
      let pr = 0, pg = 0, pb = 0;
      if (pGain > 0) {
        for (let i = 0; i < state.p.length; i++) {
          const p = state.p[i];
          if (!p.alive) continue;

          const age = t - p.born;
          const lifeN = 1 - age / p.life; // 1→0
          const ddx = x - p.x, ddy = y - p.y;
          const d = hypot(ddx, ddy);

          const aP = gauss(d, 26) * (lifeN * lifeN) * pGain;
          if (aP < 0.002) continue;

          const [nr, ng, nb] = neon((p.phase + age * 0.35) % 1);
          pr += aP * nr;
          pg += aP * ng;
          pb += aP * nb;
        }
      }

      // 色設計：リング＝青紫、リボン＝シアン寄り、粒子＝ネオン変調
      const [nr0, ng0, nb0] = neon((t * 0.10 + r * 0.002) % 1);

      const k = gi * 3;
      let R = out[k + 0], G = out[k + 1], B = out[k + 2];

      // リング
      R += 255 * aRing * (0.22 + 0.55 * nr0);
      G += 255 * aRing * (0.12 + 0.45 * ng0);
      B += 255 * aRing * (0.35 + 0.85 * nb0);

      // リボン（少し白っぽくして「発光体」感）
      if (aRib > 0) {
        R += 255 * aRib * (0.25 + 0.25 * nr0);
        G += 255 * aRib * (0.45 + 0.35 * ng0);
        B += 255 * aRib * (0.80 + 0.25 * nb0);
      }

      // 粒子
      R += 255 * pr;
      G += 255 * pg;
      B += 255 * pb;

      out[k + 0] = clamp255(R);
      out[k + 1] = clamp255(G);
      out[k + 2] = clamp255(B);
    }
  }
};
