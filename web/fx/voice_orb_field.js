const BUILD_TAG = "voice_orb_field / 2026-03-15 JST";

function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

function clamp255(v) {
  return v < 0 ? 0 : v > 255 ? 255 : (v | 0);
}

function addColor(out, offset, r, g, b) {
  out[offset + 0] = clamp255(out[offset + 0] + r);
  out[offset + 1] = clamp255(out[offset + 1] + g);
  out[offset + 2] = clamp255(out[offset + 2] + b);
}

function ensureWaveBuffers(state, total) {
  if (!state.waveMask || state.waveMask.length !== total) {
    state.waveMask = new Float32Array(total);
  }
  if (!state.waveAdd || state.waveAdd.length !== total * 3) {
    state.waveAdd = new Float32Array(total * 3);
  }
  state.waveMask.fill(0);
  state.waveAdd.fill(0);
}

function ensureAmbientBuffers(state, total) {
  if (!state.ambientMask || state.ambientMask.length !== total) {
    state.ambientMask = new Float32Array(total);
  }
  if (!state.ambientAdd || state.ambientAdd.length !== total * 3) {
    state.ambientAdd = new Float32Array(total * 3);
  }
  state.ambientMask.fill(0);
  state.ambientAdd.fill(0);
}

function normalizeColor(input, fallbackHex = "#00ff88") {
  if (input && typeof input === "object") {
    return {
      r: clamp255(input.r ?? 0),
      g: clamp255(input.g ?? 255),
      b: clamp255(input.b ?? 136),
    };
  }
  return hexToRgb(input || fallbackHex);
}

function hexToRgb(hex) {
  const s = String(hex || "#00ff88").trim();
  const m = s.match(/^#?([0-9a-fA-F]{6})$/);
  if (!m) return { r: 0, g: 255, b: 136 };
  const n = parseInt(m[1], 16);
  return {
    r: (n >> 16) & 255,
    g: (n >> 8) & 255,
    b: n & 255,
  };
}

function renderBase(out, geo, params) {
  const r = clamp255(Number(params.baseRed) || 0);
  const g = clamp255(Number(params.baseGreen) || 0);
  const b = clamp255(Number(params.baseBlue) || 2);
  for (let i = 0; i < geo.TOTAL; i++) {
    const o = i * 3;
    out[o + 0] = r;
    out[o + 1] = g;
    out[o + 2] = b;
  }
}

function ensureBounds(state, geo) {
  if (state.bounds) return state.bounds;
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  for (let i = 0; i < geo.TOTAL; i++) {
    const x = geo.worldX[i];
    const y = geo.worldY[i];
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  const padX = Math.max(80, (maxX - minX) * 0.06);
  const padY = Math.max(80, (maxY - minY) * 0.06);
  state.bounds = {
    minX: minX + padX,
    maxX: maxX - padX,
    minY: minY + padY,
    maxY: maxY - padY,
  };
  return state.bounds;
}

function randomRange(lo, hi) {
  return lo + Math.random() * (hi - lo);
}

function ensureSpawnZones(state, bounds) {
  if (state.spawnZones && state.spawnZonesBoundsKey === `${bounds.minX}:${bounds.maxX}:${bounds.minY}:${bounds.maxY}`) {
    return state.spawnZones;
  }

  const cols = 4;
  const rows = 3;
  const zones = [];
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const minX = bounds.minX + (width * col) / cols;
      const maxX = bounds.minX + (width * (col + 1)) / cols;
      const minY = bounds.minY + (height * row) / rows;
      const maxY = bounds.minY + (height * (row + 1)) / rows;
      zones.push({
        id: row * cols + col,
        minX,
        maxX,
        minY,
        maxY,
      });
    }
  }

  state.spawnZones = zones;
  state.spawnZonesBoundsKey = `${bounds.minX}:${bounds.maxX}:${bounds.minY}:${bounds.maxY}`;
  return zones;
}

function getMixedColor(state, fallbackColor) {
  const mix = state.colorMix;
  if (!mix || mix.total <= 0.001) {
    return normalizeColor(fallbackColor, "#31d7ff");
  }

  const r = mix.r / mix.total;
  const g = mix.g / mix.total;
  const b = mix.b / mix.total;
  const maxC = Math.max(r, g, b, 0.001);
  return {
    r: clamp255((r / maxC) * 255),
    g: clamp255((g / maxC) * 255),
    b: clamp255((b / maxC) * 255),
  };
}

function ensureColorHistory(state) {
  if (!Array.isArray(state.colorHistory)) {
    state.colorHistory = [];
  }
  return state.colorHistory;
}

function pickHistoryColor(state, fallbackColor) {
  const history = ensureColorHistory(state).filter((entry) => entry.weight > 0.01);
  if (history.length === 0) {
    return getMixedColor(state, fallbackColor);
  }

  const total = history.reduce((sum, entry) => sum + entry.weight, 0);
  let target = Math.random() * total;
  for (const entry of history) {
    target -= entry.weight;
    if (target <= 0) {
      return normalizeColor(entry.color, fallbackColor);
    }
  }
  return normalizeColor(history[history.length - 1].color, fallbackColor);
}

function blendColor(a, b, t) {
  const k = clamp(t, 0, 1);
  return {
    r: clamp255(a.r * (1 - k) + b.r * k),
    g: clamp255(a.g * (1 - k) + b.g * k),
    b: clamp255(a.b * (1 - k) + b.b * k),
  };
}

function noteArrivalColor(state, color) {
  const c = normalizeColor(color, "#31d7ff");
  if (!state.colorMix) {
    state.colorMix = { r: 0, g: 0, b: 0, total: 0 };
  }
  state.colorMix.r += c.r / 255;
  state.colorMix.g += c.g / 255;
  state.colorMix.b += c.b / 255;
  state.colorMix.total += 1;

  const history = ensureColorHistory(state);
  history.push({
    color: c,
    weight: 1,
  });
  if (history.length > 24) {
    history.splice(0, history.length - 24);
  }
}

function decayArrivalColorMix(state, dt) {
  if (!state.colorMix || state.colorMix.total <= 0.001) return;
  const keep = Math.exp(-dt / 30);
  state.colorMix.r *= keep;
  state.colorMix.g *= keep;
  state.colorMix.b *= keep;
  state.colorMix.total *= keep;

  const history = ensureColorHistory(state);
  for (const entry of history) {
    entry.weight *= keep;
  }
  state.colorHistory = history.filter((entry) => entry.weight > 0.02);
}

function pickSpawnZone(state, bounds) {
  const zones = ensureSpawnZones(state, bounds);
  if (!state.zoneSpawnCounts || state.zoneSpawnCounts.length !== zones.length) {
    state.zoneSpawnCounts = new Float32Array(zones.length);
  }

  const activeCounts = new Float32Array(zones.length);
  for (const orb of state.orbs || []) {
    if (orb.state !== "dormant" && Number.isInteger(orb.zoneId) && orb.zoneId >= 0 && orb.zoneId < zones.length) {
      activeCounts[orb.zoneId] += 1;
    }
  }

  let bestScore = Infinity;
  const candidates = [];
  for (const zone of zones) {
    const spawnHistory = state.zoneSpawnCounts[zone.id] || 0;
    const score = activeCounts[zone.id] * 3 + spawnHistory;
    if (score < bestScore - 0.001) {
      bestScore = score;
      candidates.length = 0;
      candidates.push(zone);
    } else if (Math.abs(score - bestScore) < 0.001) {
      candidates.push(zone);
    }
  }

  const zone = candidates[(Math.random() * candidates.length) | 0] || zones[0];
  state.zoneSpawnCounts[zone.id] += 1;
  return zone;
}

function chooseBehavior() {
  const roll = Math.random();
  if (roll < 0.22) return "linger";
  if (roll < 0.38) return "orbit";
  return "wander";
}

function respawnOrb(orb, bounds, params, sourceX = null, sourceY = null, color = null) {
  const speedMin = Number(params.speedMin) || 70;
  const speedMax = Number(params.speedMax) || 210;
  const angle = Math.random() * Math.PI * 2;
  const speed = randomRange(speedMin, speedMax);
  if (Number.isFinite(sourceX) && Number.isFinite(sourceY)) {
    orb.x = sourceX;
    orb.y = sourceY;
    orb.zoneId = -1;
  } else {
    const zone = pickSpawnZone(params.__stateRef, bounds);
    orb.zoneId = zone.id;
    orb.x = randomRange(zone.minX, zone.maxX);
    orb.y = randomRange(zone.minY, zone.maxY);
  }
  orb.vx = Math.cos(angle) * speed;
  orb.vy = Math.sin(angle) * speed;
  orb.life = 0;
  orb.state = "active";
  orb.ttl = randomRange(Number(params.lifeMinSec) || 2.8, Number(params.lifeMaxSec) || 6.5);
  orb.radius = randomRange(Number(params.radiusMinMm) || 180, Number(params.radiusMaxMm) || 340);
  orb.gain = randomRange(0.72, 1.05);
  orb.seed = Math.random() * Math.PI * 2;
  orb.behavior = chooseBehavior();
  orb.homeX = orb.x;
  orb.homeY = orb.y;
  orb.orbitRadius = randomRange(40, 180);
  orb.orbitSpeed = randomRange(0.18, 0.65);
  orb.dormantFor = 0;
  orb.color = color || orb.color || pickHistoryColor(params.__stateRef, params.defaultColor || "#31d7ff");
  orb.respawns = (orb.respawns || 0) + 1;
}

function trimOrbsSoftly(state, maxOrbs) {
  if (state.orbs.length <= maxOrbs) {
    return;
  }

  const overflow = state.orbs.length - maxOrbs;
  state.orbs.sort((a, b) => {
    const aDormant = a.state === "dormant" ? 1 : 0;
    const bDormant = b.state === "dormant" ? 1 : 0;
    if (aDormant !== bDormant) return bDormant - aDormant;
    return (b.life / Math.max(0.01, b.ttl)) - (a.life / Math.max(0.01, a.ttl));
  });
  state.orbs.splice(0, overflow);
}

function spawnBurst(state, params, bounds, sourceX, sourceY, color, count) {
  const total = Math.max(1, count | 0);
  for (let i = 0; i < total; i++) {
    const orb = {
      x: sourceX,
      y: sourceY,
      vx: 0,
      vy: 0,
      life: 0,
      ttl: 0,
      radius: 0,
      gain: 1,
      seed: Math.random() * Math.PI * 2,
      color,
      respawns: -1,
    };
    respawnOrb(
      orb,
      bounds,
      { ...params, __stateRef: state },
      sourceX + randomRange(-28, 28),
      sourceY + randomRange(-28, 28),
      color,
    );
    orb.respawns = 0;
    state.orbs.push(orb);
  }
}

function spawnDistributedBurst(state, params, bounds, color, count) {
  const total = Math.max(1, count | 0);
  for (let i = 0; i < total; i++) {
    const orb = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      ttl: 0,
      radius: 0,
      gain: 1,
      seed: Math.random() * Math.PI * 2,
      color,
      respawns: -1,
    };
    respawnOrb(orb, bounds, { ...params, __stateRef: state }, null, null, color);
    orb.respawns = 0;
    state.orbs.push(orb);
  }
}

function renderArrivalRipple(out, geo, params, ctx, state) {
  const arrivals = Array.isArray(ctx.tapeArrivals) ? ctx.tapeArrivals : [];
  for (const arrival of arrivals) {
    state.pulses.push({
      startSec: Number(arrival?.timeSec) || Number(ctx.t) || 0,
      color: normalizeColor(arrival?.color, params.defaultColor || "#31d7ff"),
    });
  }

  const sourceX = Number.isFinite(ctx.sharedEntryX) ? ctx.sharedEntryX : Number(ctx.originX) || 0;
  const sourceY = Number.isFinite(ctx.sharedEntryY) ? ctx.sharedEntryY : Number(ctx.originY) || 0;
  const speed = Math.max(1, Number(params.waveSpeed) || 420);
  const width = Math.max(1, Number(params.waveWidth) || 52);
  const spacing = Math.max(1, Number(params.waveSpacing) || 88);
  const ringCount = Math.max(1, Math.round(Number(params.waveCount) || 4));
  const decaySec = Math.max(0.05, Number(params.waveDecaySec) || 1.15);
  const ringGain = Math.max(0, Number(params.waveGain) || 235);
  const ringFalloff = clamp(Number(params.waveFalloff) || 0.58, 0.05, 0.99);
  const coreRadius = Math.max(1, Number(params.waveCoreRadius) || 44);
  const coreGain = Math.max(0, Number(params.waveCoreGain) || 120);
  const tailGlow = Math.max(0, Number(params.waveTailGlow) || 22);
  const baseCut = clamp(Number(params.waveBaseCut) || 0.88, 0, 1);
  const baseFloor = clamp(Number(params.waveBaseFloor) || 0.12, 0, 1);

  const active = [];
  ensureWaveBuffers(state, geo.TOTAL);
  const waveMask = state.waveMask;
  const waveAdd = state.waveAdd;

  for (const pulse of state.pulses) {
    const ageSec = Number(ctx.t) - pulse.startSec;
    if (ageSec < 0) continue;

    const fade = Math.exp(-ageSec / decaySec);
    const radius = ageSec * speed;
    const color = normalizeColor(pulse.color, params.defaultColor || "#31d7ff");

    if (fade > 0.01) active.push(pulse);

    for (let i = 0; i < geo.TOTAL; i++) {
      const dx = geo.worldX[i] - sourceX;
      const dy = geo.worldY[i] - sourceY;
      const dist = Math.hypot(dx, dy);

      let ringSum = 0;
      for (let ringIndex = 0; ringIndex < ringCount; ringIndex++) {
        const ringRadius = radius - ringIndex * spacing;
        if (ringRadius < -width * 2) continue;
        const ringAlpha = Math.exp(-((dist - ringRadius) ** 2) / (2 * width * width));
        ringSum += ringAlpha * Math.pow(ringFalloff, ringIndex);
      }

      const ringGlow = ringSum * fade;
      const coreAlpha = Math.exp(-(dist * dist) / (2 * coreRadius * coreRadius)) * fade * 0.8;
      const tailAlpha = dist <= radius
        ? Math.exp(-(radius - dist) / Math.max(1, width * 1.1)) * fade * 0.45
        : 0;

      if (ringGlow < 0.002 && coreAlpha < 0.002 && tailAlpha < 0.002) continue;

      const strength =
        (ringGlow * ringGain / 255) +
        (coreAlpha * coreGain / 255) +
        (tailAlpha * tailGlow / 255);
      const mask = clamp(ringGlow * 1.05 + coreAlpha * 0.9 + tailAlpha * 0.6, 0, 1);
      const o = i * 3;
      if (mask > waveMask[i]) waveMask[i] = mask;
      waveAdd[o + 0] += color.r * strength;
      waveAdd[o + 1] += color.g * strength;
      waveAdd[o + 2] += color.b * strength;
    }
  }

  for (let i = 0; i < geo.TOTAL; i++) {
    const mask = waveMask[i];
    if (mask <= 0.001) continue;

    const keep = Math.max(baseFloor, 1 - mask * baseCut);
    const o = i * 3;
    out[o + 0] = clamp255(out[o + 0] * keep);
    out[o + 1] = clamp255(out[o + 1] * keep);
    out[o + 2] = clamp255(out[o + 2] * keep);
    addColor(out, o, waveAdd[o + 0], waveAdd[o + 1], waveAdd[o + 2]);
  }

  state.pulses = active.slice(-12);
}

function renderAmbientFieldTint(out, geo, params, ctx, state) {
  const arrivals = Array.isArray(ctx.tapeArrivals) ? ctx.tapeArrivals : [];
  for (const arrival of arrivals) {
    state.ambientPulses.push({
      startSec: Number(arrival?.timeSec) || Number(ctx.t) || 0,
      color: normalizeColor(arrival?.color, params.defaultColor || "#31d7ff"),
    });
  }

  if (!state.ambientPulses || state.ambientPulses.length === 0) {
    return;
  }

  const sourceX = Number.isFinite(ctx.sharedEntryX) ? ctx.sharedEntryX : Number(ctx.originX) || 0;
  const sourceY = Number.isFinite(ctx.sharedEntryY) ? ctx.sharedEntryY : Number(ctx.originY) || 0;
  const bounds = ensureBounds(state, geo);
  const farDx = Math.max(Math.abs(bounds.minX - sourceX), Math.abs(bounds.maxX - sourceX));
  const farDy = Math.max(Math.abs(bounds.minY - sourceY), Math.abs(bounds.maxY - sourceY));
  const maxDist = Math.max(1, Math.hypot(farDx, farDy));
  const spreadSpeed = Math.max(40, Number(params.ambientSpreadSpeed) || 260);
  const bandWidth = Math.max(60, Number(params.ambientBandWidth) || 340);
  const decaySec = Math.max(0.4, Number(params.ambientDecaySec) || 5.8);
  const gain = clamp(Number(params.ambientGain) || 0.12, 0, 1.2);
  const baseCut = clamp(Number(params.ambientBaseCut) || 0.08, 0, 1);

  ensureAmbientBuffers(state, geo.TOTAL);
  const ambientMask = state.ambientMask;
  const ambientAdd = state.ambientAdd;
  const active = [];

  for (const pulse of state.ambientPulses) {
    const ageSec = Number(ctx.t) - pulse.startSec;
    if (ageSec < 0) continue;

    const fade = Math.exp(-ageSec / decaySec);
    if (fade > 0.01) {
      active.push(pulse);
    }

    const front = Math.min(maxDist + bandWidth * 1.4, ageSec * spreadSpeed);
    const color = normalizeColor(pulse.color, params.defaultColor || "#31d7ff");

    for (let i = 0; i < geo.TOTAL; i++) {
      const dx = geo.worldX[i] - sourceX;
      const dy = geo.worldY[i] - sourceY;
      const dist = Math.hypot(dx, dy);
      const reach = clamp((front - dist) / bandWidth, 0, 1);
      if (reach <= 0.001) continue;

      const softness = 1 - Math.exp(-reach * 2.8);
      const tint = softness * fade * gain;
      if (tint <= 0.001) continue;

      const o = i * 3;
      if (tint > ambientMask[i]) ambientMask[i] = tint;
      ambientAdd[o + 0] += color.r * tint;
      ambientAdd[o + 1] += color.g * tint;
      ambientAdd[o + 2] += color.b * tint;
    }
  }

  for (let i = 0; i < geo.TOTAL; i++) {
    const mask = ambientMask[i];
    if (mask <= 0.001) continue;

    const keep = Math.max(0, 1 - mask * baseCut);
    const o = i * 3;
    out[o + 0] = clamp255(out[o + 0] * keep);
    out[o + 1] = clamp255(out[o + 1] * keep);
    out[o + 2] = clamp255(out[o + 2] * keep);
    addColor(out, o, ambientAdd[o + 0], ambientAdd[o + 1], ambientAdd[o + 2]);
  }

  state.ambientPulses = active.slice(-10);
}

function updateOrbs(state, ctx, params, geo) {
  const bounds = ensureBounds(state, geo);
  const arrivals = Array.isArray(ctx.tapeArrivals) ? ctx.tapeArrivals : [];
  const sourceX = Number.isFinite(ctx.sharedEntryX) ? ctx.sharedEntryX : (bounds.minX + bounds.maxX) * 0.5;
  const sourceY = Number.isFinite(ctx.sharedEntryY) ? ctx.sharedEntryY : bounds.minY;
  const paramsWithState = { ...params, __stateRef: state };
  const dt = Math.max(1 / 120, Number(ctx.dt) || 1 / 60);

  decayArrivalColorMix(state, dt);

  for (const arrival of arrivals) {
    const color = normalizeColor(arrival?.color, params.defaultColor || "#31d7ff");
    noteArrivalColor(state, color);
    spawnBurst(state, params, bounds, sourceX, sourceY, color, Number(params.spawnCount) || 8);
    spawnDistributedBurst(
      state,
      params,
      bounds,
      pickHistoryColor(state, color),
      Math.max(2, Math.round((Number(params.spawnCount) || 8) * 0.35)),
    );
  }

  const wander = Number(params.wanderStrength) || 46;
  const maxLight = clamp(Number(params.maxLight) || 18, 12, 20);
  const maxRespawns = Math.max(1, Math.round(Number(params.maxRespawns) || 6));
  const maxOrbs = Math.max(4, Math.round(Number(params.maxOrbs) || 42));
  const mixedColor = getMixedColor(state, params.defaultColor || "#31d7ff");
  trimOrbsSoftly(state, maxOrbs);

  for (const orb of state.orbs) {
    if (orb.state === "dormant") {
      orb.dormantFor -= dt;
      if (orb.dormantFor <= 0) {
        respawnOrb(orb, bounds, paramsWithState, null, null, pickHistoryColor(state, mixedColor));
      }
      continue;
    }

    orb.life += dt;
    orb.color = blendColor(orb.color || mixedColor, pickHistoryColor(state, mixedColor), 0.004);

    const swayX = Math.sin(ctx.t * (0.6 + orb.gain * 0.4) + orb.seed * 1.7) * wander;
    const swayY = Math.cos(ctx.t * (0.95 + orb.gain * 0.35) + orb.seed * 0.9) * wander;

    if (orb.behavior === "linger") {
      orb.homeX += Math.sin(ctx.t * 0.22 + orb.seed) * 3 * dt;
      orb.homeY += Math.cos(ctx.t * 0.18 + orb.seed * 1.3) * 3 * dt;
      orb.vx += (orb.homeX - orb.x) * 1.8 * dt + swayX * dt * 0.22;
      orb.vy += (orb.homeY - orb.y) * 1.8 * dt + swayY * dt * 0.22;
      orb.vx *= 0.9;
      orb.vy *= 0.9;
    } else if (orb.behavior === "orbit") {
      const orbitAngle = ctx.t * (0.8 + orb.orbitSpeed) + orb.seed;
      const orbitTargetX = orb.homeX + Math.cos(orbitAngle) * orb.orbitRadius;
      const orbitTargetY = orb.homeY + Math.sin(orbitAngle * 1.2) * orb.orbitRadius * 0.6;
      orb.vx += (orbitTargetX - orb.x) * 1.4 * dt + swayX * dt * 0.35;
      orb.vy += (orbitTargetY - orb.y) * 1.4 * dt + swayY * dt * 0.35;
      orb.vx *= 0.94;
      orb.vy *= 0.94;
    } else {
      orb.vx += swayX * dt;
      orb.vy += swayY * dt;
    }

    const speed = Math.hypot(orb.vx, orb.vy);
    const softMin = Number(params.speedMin) || 70;
    const softMax = Number(params.speedMax) || 210;
    if (speed > softMax) {
      const k = softMax / Math.max(1, speed);
      orb.vx *= k;
      orb.vy *= k;
    } else if (speed < softMin) {
      const boost = (softMin - speed) * 0.18;
      orb.vx += Math.cos(orb.seed + ctx.t * 0.8) * boost;
      orb.vy += Math.sin(orb.seed * 1.2 + ctx.t) * boost;
    }

    orb.x += orb.vx * dt;
    orb.y += orb.vy * dt;

    if (orb.x < bounds.minX || orb.x > bounds.maxX) {
      orb.vx *= -1;
      orb.x = clamp(orb.x, bounds.minX, bounds.maxX);
    }
    if (orb.y < bounds.minY || orb.y > bounds.maxY) {
      orb.vy *= -1;
      orb.y = clamp(orb.y, bounds.minY, bounds.maxY);
    }

    if (orb.life >= orb.ttl) {
      const fate = Math.random();
      if (fate < 0.24) {
        orb.state = "dormant";
        orb.dormantFor = randomRange(0.8, 3.8);
        orb.life = 0;
        orb.ttl = randomRange(1.6, 4.4);
      } else if (fate < 0.52) {
        orb.life = 0;
        orb.ttl = randomRange(4.5, 10.5);
        orb.behavior = "linger";
        orb.homeX = orb.x;
        orb.homeY = orb.y;
        orb.vx *= 0.2;
        orb.vy *= 0.2;
      } else if (orb.respawns >= maxRespawns && Math.random() < 0.3) {
        orb.state = "dormant";
        orb.dormantFor = randomRange(2.2, 6.5);
        orb.life = 0;
      } else {
        respawnOrb(orb, bounds, paramsWithState, null, null, pickHistoryColor(state, mixedColor));
      }
    }

    orb.maxLight = maxLight;
  }
}

function renderOrbs(out, geo, params, state, ctx) {
  if (!state.orbs || state.orbs.length === 0) return;
  const orbLight = 20;
  const replacedBase = new Uint8Array(geo.TOTAL);

  for (const orb of state.orbs) {
    if (orb.state === "dormant") {
      continue;
    }
    const pulse = 0.72 + 0.28 * Math.sin(ctx.t * (1.2 + orb.gain * 0.6) + orb.seed * 3.1);
    const fadeIn = clamp(orb.life / 0.45, 0, 1);
    const fadeOut = clamp((orb.ttl - orb.life) / 0.9, 0, 1);
    const gain = Math.min(fadeIn, fadeOut, 1) * pulse * orb.gain;
    const sigma = Math.max(20, orb.radius * 0.55);
    const radius = orb.radius * (0.9 + 0.2 * pulse);
    const color = orb.color;

    for (let i = 0; i < geo.TOTAL; i++) {
      const dx = geo.worldX[i] - orb.x;
      const dy = geo.worldY[i] - orb.y;
      const dist = Math.hypot(dx, dy);
      if (dist > radius) continue;

      const intensity = Math.exp(-(dist * dist) / (2 * sigma * sigma)) * gain;
      const o = i * 3;
      if (!replacedBase[i]) {
        replacedBase[i] = 1;
        out[o + 0] = 0;
        out[o + 1] = 0;
        out[o + 2] = 0;
      }
      out[o + 0] = clamp255(Math.min(orbLight, out[o + 0] + (color.r / 255) * orbLight * intensity));
      out[o + 1] = clamp255(Math.min(orbLight, out[o + 1] + (color.g / 255) * orbLight * intensity));
      out[o + 2] = clamp255(Math.min(orbLight, out[o + 2] + (color.b / 255) * orbLight * intensity));
    }
  }
}

export default {
  id: "voiceOrbField",
  label: "Voice Orb Field",
  desc: "LED tape 到達時に水面のような波紋を広げ、そのあと色の玉を基板エリアへ放ち続ける。",

  params: [
    { key: "baseRed", label: "Base R", type: "range", min: 0, max: 12, step: 1, default: 0 },
    { key: "baseGreen", label: "Base G", type: "range", min: 0, max: 12, step: 1, default: 0 },
    { key: "baseBlue", label: "Base B", type: "range", min: 0, max: 12, step: 1, default: 2 },
    { key: "defaultColor", label: "Default Color", type: "color", default: "#31d7ff" },
    { key: "spawnCount", label: "Spawn Count", type: "range", min: 2, max: 16, step: 1, default: 8 },
    { key: "maxOrbs", label: "Max Orbs", type: "range", min: 8, max: 72, step: 1, default: 42 },
    { key: "maxRespawns", label: "Max Respawns", type: "range", min: 1, max: 12, step: 1, default: 6 },
    { key: "speedMin", label: "Speed Min", type: "range", min: 20, max: 180, step: 5, default: 70 },
    { key: "speedMax", label: "Speed Max", type: "range", min: 80, max: 340, step: 5, default: 210 },
    { key: "wanderStrength", label: "Wander", type: "range", min: 10, max: 120, step: 1, default: 46 },
    { key: "radiusMinMm", label: "Radius Min", type: "range", min: 60, max: 360, step: 5, default: 180 },
    { key: "radiusMaxMm", label: "Radius Max", type: "range", min: 120, max: 520, step: 5, default: 340 },
    { key: "lifeMinSec", label: "Life Min", type: "range", min: 0.5, max: 6, step: 0.1, default: 2.8 },
    { key: "lifeMaxSec", label: "Life Max", type: "range", min: 1, max: 10, step: 0.1, default: 6.5 },
    { key: "waveSpeed", label: "Wave Speed", type: "range", min: 40, max: 1400, step: 10, default: 420 },
    { key: "waveWidth", label: "Wave Width", type: "range", min: 8, max: 180, step: 2, default: 52 },
    { key: "waveSpacing", label: "Wave Spacing", type: "range", min: 20, max: 180, step: 2, default: 88 },
    { key: "waveCount", label: "Wave Count", type: "range", min: 1, max: 8, step: 1, default: 4 },
    { key: "waveDecaySec", label: "Wave Decay", type: "range", min: 0.1, max: 3, step: 0.05, default: 1.15 },
    { key: "waveGain", label: "Wave Gain", type: "range", min: 20, max: 255, step: 1, default: 235 },
    { key: "waveFalloff", label: "Wave Falloff", type: "range", min: 0.05, max: 0.99, step: 0.01, default: 0.58 },
    { key: "waveCoreRadius", label: "Wave Core Radius", type: "range", min: 4, max: 160, step: 2, default: 44 },
    { key: "waveCoreGain", label: "Wave Core Gain", type: "range", min: 0, max: 220, step: 1, default: 120 },
    { key: "waveTailGlow", label: "Wave Tail Glow", type: "range", min: 0, max: 120, step: 1, default: 22 },
    { key: "waveBaseCut", label: "Wave Base Cut", type: "range", min: 0, max: 1, step: 0.01, default: 0.88 },
    { key: "waveBaseFloor", label: "Wave Base Floor", type: "range", min: 0, max: 1, step: 0.01, default: 0.12 },
    { key: "ambientSpreadSpeed", label: "Ambient Spread", type: "range", min: 40, max: 800, step: 10, default: 260 },
    { key: "ambientBandWidth", label: "Ambient Width", type: "range", min: 60, max: 900, step: 10, default: 340 },
    { key: "ambientDecaySec", label: "Ambient Decay", type: "range", min: 0.5, max: 12, step: 0.1, default: 5.8 },
    { key: "ambientGain", label: "Ambient Gain", type: "range", min: 0, max: 1.2, step: 0.02, default: 0.12 },
    { key: "ambientBaseCut", label: "Ambient Base Cut", type: "range", min: 0, max: 1, step: 0.01, default: 0.08 },
    { key: "maxLight", label: "Max Light", type: "range", min: 20, max: 20, step: 1, default: 20 },
  ],

  init(state) {
    state.orbs = [];
    state.pulses = [];
    state.bounds = null;
    state.spawnZones = null;
    state.spawnZonesBoundsKey = "";
    state.zoneSpawnCounts = null;
    state.waveMask = null;
    state.waveAdd = null;
    state.ambientPulses = [];
    state.ambientMask = null;
    state.ambientAdd = null;
    state.colorMix = { r: 0, g: 0, b: 0, total: 0 };
    state.colorHistory = [];
    state.logged = false;
  },

  render(ctx, out, state, params, geo) {
    if (!state.logged) {
      state.logged = true;
      try {
        console.log("[FX BUILD]", BUILD_TAG);
      } catch {}
    }

    renderBase(out, geo, params);
    renderArrivalRipple(out, geo, params, ctx, state);
    renderAmbientFieldTint(out, geo, params, ctx, state);
    updateOrbs(state, ctx, params, geo);
    renderOrbs(out, geo, params, state, ctx);
  },
};
