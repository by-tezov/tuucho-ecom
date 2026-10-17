import { useEffect, useId, useState } from 'react';
import styles from './LoyaltyScene.module.css';

/**
 * Curved fall paths (cubic bezier). Y always increases — coins only go down
 * into the mouth. Driven by SVG animateMotion, not CSS translate keyframes.
 * Paths overshoot past the mouth lip (y 116) so the coin is swallowed by the
 * clip instead of dissolving in mid-air; `halfTurns` is how many 180 degree
 * tumbles it makes on the way down.
 */
const COINS = [
  { path: 'M 26 -14 C 76 16 118 56 152 116', dur: 1.12, begin: 1.3, scale: 1, halfTurns: 3, spin: 34 },
  { path: 'M 296 -16 C 246 14 202 54 170 116', dur: 1.18, begin: 1.62, scale: 0.94, halfTurns: 4, spin: -28 },
  { path: 'M 44 -10 C 88 22 126 62 158 114', dur: 1.05, begin: 1.94, scale: 0.86, halfTurns: 3, spin: 46 },
  { path: 'M 278 -12 C 238 18 198 58 164 115', dur: 1.1, begin: 2.26, scale: 0.9, halfTurns: 5, spin: -40 },
  { path: 'M 34 -18 C 82 12 122 52 146 116', dur: 1.22, begin: 2.62, scale: 0.82, halfTurns: 4, spin: 30 },
  { path: 'M 288 -8 C 244 22 204 60 176 114', dur: 1.08, begin: 2.98, scale: 0.78, halfTurns: 3, spin: -52 },
] as const;

/** When each coin crosses the front lip — drives the purse nudge and the glints. */
const LANDINGS = COINS.map((c) => Number((c.begin + c.dur * 0.88).toFixed(2)));
const LANDING_BEGINS = LANDINGS.map((t) => `${t}s`).join(';');

function landingAt(index: number): number {
  return LANDINGS[index] ?? 0;
}

/** Coins that stay visible in the mouth once they have dropped. */
const SETTLED = [
  { cx: 146, cy: 97, r: 8.6, rot: -12, at: landingAt(2) },
  { cx: 163, cy: 94, r: 9.2, rot: 8, at: landingAt(3) },
  { cx: 177, cy: 98, r: 8.2, rot: 16, at: landingAt(5) },
] as const;

function round(n: number): string {
  return Number(n.toFixed(4)).toString();
}

/**
 * scaleX follows |cos(theta)| — full face at every half turn, edge-on halfway
 * through it, with the visible face swapping exactly at the edge-on frame.
 */
function tumble(halfTurns: number) {
  const steps = halfTurns * 2;
  const scaleValues: string[] = [];
  const scaleKeyTimes: string[] = [];
  for (let i = 0; i <= steps; i += 1) {
    scaleKeyTimes.push(round(i / steps));
    scaleValues.push(i % 2 === 0 ? '1 1' : '0.16 1');
  }
  const faceKeyTimes = ['0'];
  const frontValues = ['1'];
  const backValues = ['0'];
  for (let k = 0; k < halfTurns; k += 1) {
    faceKeyTimes.push(round((k + 0.5) / halfTurns));
    const front = (k + 1) % 2 === 0 ? '1' : '0';
    frontValues.push(front);
    backValues.push(front === '1' ? '0' : '1');
  }
  return {
    scaleValues: scaleValues.join(';'),
    scaleKeyTimes: scaleKeyTimes.join(';'),
    scaleSplines: Array.from({ length: steps }, () => '0.36 0 0.64 1').join(';'),
    faceKeyTimes: faceKeyTimes.join(';'),
    frontValues: frontValues.join(';'),
    backValues: backValues.join(';'),
  };
}

/** Glints fire just after a coin lands, so the sparkle reads as the impact. */
const SPARKLES: Array<[number, number, number]> = [
  [118, 74, landingAt(0) + 0.04],
  [204, 72, landingAt(1) + 0.04],
  [132, 62, landingAt(2) + 0.05],
  [192, 60, landingAt(3) + 0.05],
  [160, 66, landingAt(5) + 0.06],
];

function sec(designSeconds: number): string {
  return `${designSeconds}s`;
}

function Blossom({ size = 4 }: { size?: number }) {
  const s = size;
  const h = s * 0.8;
  return (
    <>
      <path
        d={`M0 ${-s} C${h} ${-h} ${h} ${-s * 0.2} 0 0 C${-h} ${-s * 0.2} ${-h} ${-h} 0 ${-s}Z`}
        fill="#e6c260"
      />
      <path
        d={`M0 ${s} C${h} ${h} ${h} ${s * 0.2} 0 0 C${-h} ${s * 0.2} ${-h} ${h} 0 ${s}Z`}
        fill="#e6c260"
      />
      <path
        d={`M${-s} 0 C${-h} ${h} ${-s * 0.2} ${h} 0 0 C${-s * 0.2} ${-h} ${-h} ${-h} ${-s} 0Z`}
        fill="#e6c260"
      />
      <path
        d={`M${s} 0 C${h} ${h} ${s * 0.2} ${h} 0 0 C${s * 0.2} ${-h} ${h} ${-h} ${s} 0Z`}
        fill="#e6c260"
      />
      <circle r="1" fill="#fbf1d2" />
    </>
  );
}

function CornerOrnament({ gradientId }: { gradientId: string }) {
  return (
    <svg width="52" height="52" viewBox="0 0 120 120" fill="none" aria-hidden="true">
      <path
        d="M6 60 C6 30 30 6 60 6"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path
        d="M14 60 C14 34 34 14 60 14"
        stroke={`url(#${gradientId})`}
        strokeWidth="1"
        strokeLinecap="round"
        opacity=".7"
      />
      <g transform="translate(60 60)">
        <circle cx="0" cy="0" r="2.2" fill="#c7a766" />
        <path d="M0 -8 C2.6 -4.4 2.6 -1.8 0 0 C-2.6 -1.8 -2.6 -4.4 0 -8Z" fill="#d9bd77" opacity=".9" />
        <path d="M0 8 C2.6 4.4 2.6 1.8 0 0 C-2.6 1.8 -2.6 4.4 0 8Z" fill="#d9bd77" opacity=".9" />
        <path d="M-8 0 C-4.4 2.6 -1.8 2.6 0 0 C-1.8 -2.6 -4.4 -2.6 -8 0Z" fill="#d9bd77" opacity=".9" />
        <path d="M8 0 C4.4 2.6 1.8 2.6 0 0 C1.8 -2.6 4.4 -2.6 8 0Z" fill="#d9bd77" opacity=".9" />
      </g>
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="120" y2="120" gradientUnits="userSpaceOnUse">
          <stop stopColor="#b8912f" />
          <stop offset=".5" stopColor="#e6c260" />
          <stop offset="1" stopColor="#b8912f" />
        </linearGradient>
      </defs>
    </svg>
  );
}

function Vine({ className, drawDelay }: { className: string; drawDelay: number }) {
  return (
    <div className={`${styles.vine} ${className}`} aria-hidden="true">
      <svg width="140" height="28" viewBox="0 0 160 44" fill="none" style={{ overflow: 'visible' }}>
        <path
          d="M2 22 C30 22 30 10 46 15 C58 19 55 28 47 26 M46 15 C70 4 96 4 122 18 C134 24 150 20 158 22"
          stroke="#c7a766"
          strokeWidth="1.1"
          strokeLinecap="round"
          pathLength={1}
          className={styles.drawStroke}
          style={{ animationDuration: sec(1.1), animationDelay: sec(drawDelay) }}
        />
        <circle
          cx="47"
          cy="26"
          r="1.5"
          fill="#d9bd77"
          className={styles.vineDot}
          style={{ animationDelay: sec(drawDelay + 0.85) }}
        />
        <circle
          cx="158"
          cy="22"
          r="1.6"
          fill="#d9bd77"
          className={styles.vineDot}
          style={{ animationDelay: sec(drawDelay + 0.85) }}
        />
      </svg>
    </div>
  );
}

function MotionCoin({
  path,
  dur,
  begin,
  scale,
  halfTurns,
  spin,
  coinFill,
  backFill,
  play,
}: {
  path: string;
  dur: number;
  begin: number;
  scale: number;
  halfTurns: number;
  spin: number;
  coinFill: string;
  backFill: string;
  play: boolean;
}) {
  const r = 10 * scale;
  if (!play) return null;

  const t = tumble(halfTurns);

  return (
    <g opacity="0">
      {/* No tail fade: the coin is cut off by the mouth clip, not dissolved. */}
      <animate
        attributeName="opacity"
        values="0;1;1"
        keyTimes="0;0.07;1"
        calcMode="linear"
        dur={`${dur}s`}
        begin={`${begin}s`}
        fill="freeze"
      />
      <animateMotion
        path={path}
        dur={`${dur}s`}
        begin={`${begin}s`}
        fill="freeze"
        calcMode="spline"
        keyTimes="0;1"
        /* Accelerating, not ease-in-out — the fall has to gain speed. */
        keySplines="0.5 0.02 0.86 0.44"
      />
      {/* Perspective: the coin drops away from the camera into the bag. */}
      <g>
        <animateTransform
          attributeName="transform"
          type="scale"
          values="1;0.82"
          dur={`${dur}s`}
          begin={`${begin}s`}
          fill="freeze"
          calcMode="spline"
          keyTimes="0;1"
          keySplines="0.5 0.02 0.86 0.44"
        />
        <g>
          <animateTransform
            attributeName="transform"
            type="rotate"
            values={`0;${spin}`}
            dur={`${dur}s`}
            begin={`${begin}s`}
            fill="freeze"
            calcMode="linear"
          />
          <g>
            <animateTransform
              attributeName="transform"
              type="scale"
              values={t.scaleValues}
              keyTimes={t.scaleKeyTimes}
              dur={`${dur}s`}
              begin={`${begin}s`}
              fill="freeze"
              calcMode="spline"
              keySplines={t.scaleSplines}
            />
            <g opacity="1">
              <animate
                attributeName="opacity"
                values={t.frontValues}
                keyTimes={t.faceKeyTimes}
                calcMode="discrete"
                dur={`${dur}s`}
                begin={`${begin}s`}
                fill="freeze"
              />
              <circle r={r} fill={coinFill} stroke="#a9832a" strokeWidth="1.15" />
              <circle r={r * 0.68} fill="none" stroke="#fff6d4" strokeWidth="0.85" opacity=".75" />
              <text
                textAnchor="middle"
                dominantBaseline="central"
                fill="#5c4518"
                fontSize={8.5 * scale}
                fontWeight="700"
                fontFamily="var(--font-display), Georgia, serif"
              >
                P
              </text>
            </g>
            <g opacity="0">
              <animate
                attributeName="opacity"
                values={t.backValues}
                keyTimes={t.faceKeyTimes}
                calcMode="discrete"
                dur={`${dur}s`}
                begin={`${begin}s`}
                fill="freeze"
              />
              <circle r={r} fill={backFill} stroke="#8a6a28" strokeWidth="1.15" />
              <circle r={r * 0.72} fill="none" stroke="#8a6a28" strokeWidth="0.7" opacity=".6" />
              <g transform={`scale(${scale * 0.72})`} opacity=".85">
                <Blossom size={4.6} />
              </g>
            </g>
          </g>
        </g>
      </g>
    </g>
  );
}

/** A coin that has come to rest in the mouth, half swallowed by the front lip. */
function SettledCoin({
  cx,
  cy,
  r,
  rot,
  at,
  coinFill,
  play,
}: {
  cx: number;
  cy: number;
  r: number;
  rot: number;
  at: number;
  coinFill: string;
  play: boolean;
}) {
  if (!play) return null;
  return (
    <g transform={`translate(${cx} ${cy}) rotate(${rot})`} opacity="0">
      <animate
        attributeName="opacity"
        values="0;1"
        keyTimes="0;1"
        calcMode="discrete"
        dur="0.12s"
        begin={`${at}s`}
        fill="freeze"
      />
      <g>
        {/* Lands flat, squashes once, settles. */}
        <animateTransform
          attributeName="transform"
          type="scale"
          values="1 0.72;1 1.08;1 1"
          keyTimes="0;0.55;1"
          dur="0.3s"
          begin={`${at}s`}
          fill="freeze"
          calcMode="spline"
          keySplines="0.2 0 0.3 1;0.3 0 0.2 1"
        />
        <ellipse rx={r} ry={r * 0.42} fill="#2a1d14" opacity=".45" transform="translate(0 2.4)" />
        <ellipse rx={r} ry={r * 0.4} fill={coinFill} stroke="#a9832a" strokeWidth="1" />
        <ellipse rx={r * 0.62} ry={r * 0.24} fill="none" stroke="#fff6d4" strokeWidth="0.7" opacity=".6" />
      </g>
    </g>
  );
}

interface LoyaltySceneProps {
  active: boolean;
}

/**
 * Finite purse scene. Coin arcs use SVG animateMotion on cubic paths —
 * not CSS multi-point translates (those lerp in broken straight segments).
 */
export function LoyaltyScene({ active }: LoyaltySceneProps) {
  const rawId = useId().replace(/:/g, '');
  const [playKey, setPlayKey] = useState(0);
  const [instant, setInstant] = useState(
    () => typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  );

  useEffect(() => {
    if (!active) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    setInstant(reduce);
    setPlayKey((k) => k + 1);
  }, [active]);

  const snap = instant || !active;
  const playCoins = !snap;
  const rootClass = `${styles.scene} ${snap ? styles.sceneInstant : ''}`.trim();

  return (
    <div key={active ? playKey : 'idle'} className={rootClass} aria-hidden="true">
      <div className={styles.glow} />

      <div className={`${styles.corner} ${styles.cornerTl}`}>
        <CornerOrnament gradientId={`${rawId}-g0`} />
      </div>
      <div className={`${styles.corner} ${styles.cornerTr}`}>
        <CornerOrnament gradientId={`${rawId}-g1`} />
      </div>
      <div className={`${styles.corner} ${styles.cornerBl}`}>
        <CornerOrnament gradientId={`${rawId}-g2`} />
      </div>
      <div className={`${styles.corner} ${styles.cornerBr}`}>
        <CornerOrnament gradientId={`${rawId}-g3`} />
      </div>

      <Vine className={styles.vineTop ?? ''} drawDelay={0.15} />
      <Vine className={styles.vineBottom ?? ''} drawDelay={0.3} />

      <div className={styles.stage}>
        <svg className={styles.canvas} viewBox="0 0 320 180" fill="none">
          <defs>
            <linearGradient id={`${rawId}-leather`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#f7efe4" />
              <stop offset=".45" stopColor="#ead7c4" />
              <stop offset="1" stopColor="#d4b89a" />
            </linearGradient>
            <linearGradient id={`${rawId}-flapFront`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#fbf4ea" />
              <stop offset="1" stopColor="#e6d2bc" />
            </linearGradient>
            <linearGradient id={`${rawId}-flapBack`} x1="0" y1="1" x2="0" y2="0">
              <stop offset="0" stopColor="#c9a882" />
              <stop offset="1" stopColor="#e2c9ae" />
            </linearGradient>
            <linearGradient id={`${rawId}-interior`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" stopColor="#6b4e36" />
              <stop offset="1" stopColor="#3f2d20" />
            </linearGradient>
            <linearGradient id={`${rawId}-gold`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#f7e7b0" />
              <stop offset=".5" stopColor="#e6c260" />
              <stop offset="1" stopColor="#a9832a" />
            </linearGradient>
            <linearGradient id={`${rawId}-coin`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#fff4c8" />
              <stop offset=".4" stopColor="#e6c260" />
              <stop offset="1" stopColor="#b8912f" />
            </linearGradient>
            <linearGradient id={`${rawId}-coinBack`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#e0c073" />
              <stop offset=".5" stopColor="#c19b3d" />
              <stop offset="1" stopColor="#8f6c22" />
            </linearGradient>
            {/* Everything above the front lip of the mouth. A falling coin is
                swallowed by this edge instead of fading out over the leather. */}
            <clipPath id={`${rawId}-mouth`}>
              <path d="M-200 -200 H520 V88 H210 A50 13 0 0 1 110 88 H-200 Z" />
            </clipPath>
            <filter id={`${rawId}-soft`} x="-20%" y="-20%" width="140%" height="140%">
              <feDropShadow dx="0" dy="3" stdDeviation="2.2" floodColor="#5c4330" floodOpacity="0.22" />
            </filter>
          </defs>

          <g className={styles.swayL}>
            <g className={styles.blossom} transform="translate(34 72)" style={{ animationDelay: sec(0.9) }}>
              <Blossom />
            </g>
            <g className={styles.blossom} transform="translate(48 104)" style={{ animationDelay: sec(1.05) }}>
              <Blossom size={3.2} />
            </g>
          </g>
          <g className={styles.swayR}>
            <g className={styles.blossom} transform="translate(286 72)" style={{ animationDelay: sec(0.95) }}>
              <Blossom />
            </g>
            <g className={styles.blossom} transform="translate(272 104)" style={{ animationDelay: sec(1.1) }}>
              <Blossom size={3.2} />
            </g>
          </g>

          <g className={styles.purse} style={{ animationDelay: sec(0.15) }} filter={`url(#${rawId}-soft)`}>
            {/* One nudge per coin landing — the bag takes the weight. */}
            {playCoins ? (
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0;0 1.6;0 -0.35;0 0"
                keyTimes="0;0.28;0.62;1"
                dur="0.42s"
                begin={LANDING_BEGINS}
                calcMode="spline"
                keySplines="0.2 0 0.4 1;0.3 0 0.3 1;0.3 0 0.3 1"
                additive="sum"
              />
            ) : null}
            {/* The bag settles when the flap snaps shut (86% of loyaltyFlap). */}
            {playCoins ? (
              <animateTransform
                attributeName="transform"
                type="translate"
                values="0 0;0 1.9;0 -0.5;0 0"
                keyTimes="0;0.26;0.6;1"
                dur="0.5s"
                begin="5.05s"
                calcMode="spline"
                keySplines="0.2 0 0.4 1;0.3 0 0.3 1;0.3 0 0.3 1"
                additive="sum"
              />
            ) : null}
            <path
              d="M118 78 C118 48 142 34 160 34 C178 34 202 48 202 78"
              stroke={`url(#${rawId}-gold)`}
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
            />
            <circle cx="118" cy="78" r="2.2" fill="#c7a766" />
            <circle cx="202" cy="78" r="2.2" fill="#c7a766" />
            <circle cx="136" cy="46" r="1.35" fill="#d9bd77" opacity=".9" />
            <circle cx="148" cy="38" r="1.35" fill="#d9bd77" opacity=".9" />
            <circle cx="160" cy="35" r="1.35" fill="#d9bd77" opacity=".9" />
            <circle cx="172" cy="38" r="1.35" fill="#d9bd77" opacity=".9" />
            <circle cx="184" cy="46" r="1.35" fill="#d9bd77" opacity=".9" />

            <path
              d="M104 86
                 C104 80 112 76 122 76
                 H198
                 C208 76 216 80 216 86
                 V138
                 C216 150 204 158 190 158
                 H130
                 C116 158 104 150 104 138
                 Z"
              fill={`url(#${rawId}-leather)`}
            />

            <ellipse cx="160" cy="88" rx="50" ry="13" fill={`url(#${rawId}-interior)`} />
            <ellipse cx="160" cy="86" rx="44" ry="8" fill="#2a1d14" opacity=".45" />
            {/* Back rim of the opening: coins pass in front of it on the way in. */}
            <path
              d="M114 90
                 C120 84 130 82 140 82
                 H180
                 C190 82 200 84 206 90"
              stroke="#d4b89a"
              strokeWidth="3"
              strokeLinecap="round"
              fill="none"
              opacity=".9"
            />

            <path
              d="M108 92 C108 128 114 150 130 156"
              stroke="#c9a882"
              strokeWidth="1"
              opacity=".35"
              fill="none"
            />
            <path
              d="M212 92 C212 128 206 150 190 156"
              stroke="#c9a882"
              strokeWidth="1"
              opacity=".35"
              fill="none"
            />
            <path d="M116 108 H204" stroke="#c7a766" strokeWidth="0.7" strokeDasharray="2 3" opacity=".4" />
            <path d="M118 148 H202" stroke="#c7a766" strokeWidth="0.7" strokeDasharray="2 3" opacity=".4" />
          </g>

          {/* Coins live inside the mouth clip: they disappear behind the front
              lip on the way down, then a few of them stay visible in the bag. */}
          <g clipPath={`url(#${rawId}-mouth)`}>
            {COINS.map((c, i) => (
              <MotionCoin
                key={`coin-${i}`}
                path={c.path}
                dur={c.dur}
                begin={c.begin}
                scale={c.scale}
                halfTurns={c.halfTurns}
                spin={c.spin}
                coinFill={`url(#${rawId}-coin)`}
                backFill={`url(#${rawId}-coinBack)`}
                play={playCoins}
              />
            ))}
            {SETTLED.map((c, i) => (
              <SettledCoin
                key={`settled-${i}`}
                cx={c.cx}
                cy={c.cy}
                r={c.r}
                rot={c.rot}
                at={c.at}
                coinFill={`url(#${rawId}-coin)`}
                play={playCoins}
              />
            ))}
            {/* Light bouncing off the interior as each coin drops in. */}
            {playCoins ? (
              <ellipse cx="160" cy="90" rx="30" ry="7" fill="#ffeab8" opacity="0">
                <animate
                  attributeName="opacity"
                  values="0;0.4;0"
                  keyTimes="0;0.2;1"
                  dur="0.4s"
                  begin={LANDING_BEGINS}
                  calcMode="spline"
                  keySplines="0.2 0 0.4 1;0.3 0 0.6 1"
                />
              </ellipse>
            ) : null}
          </g>

          {/* Front lip, drawn over the clip edge so the cut reads as an edge. */}
          <path
            d="M110 88 A50 13 0 0 1 210 88"
            stroke="#e2c9ae"
            strokeWidth="2.4"
            strokeLinecap="round"
            fill="none"
          />
          <path
            d="M112 87 A50 13 0 0 1 208 87"
            stroke="#f7efe4"
            strokeWidth="0.8"
            strokeLinecap="round"
            fill="none"
            opacity=".6"
          />

          <g className={styles.flap}>
            <path
              d="M112 78
                 C112 70 124 64 140 64
                 H180
                 C196 64 208 70 208 78
                 C208 96 196 110 180 114
                 H140
                 C124 110 112 96 112 78
                 Z"
              fill={`url(#${rawId}-flapFront)`}
              stroke="#c9a882"
              strokeWidth="1"
            />
            <path
              d="M118 72 H202"
              stroke={`url(#${rawId}-flapBack)`}
              strokeWidth="4"
              strokeLinecap="round"
              opacity=".55"
            />
            <path d="M128 88 H192" stroke="#c7a766" strokeWidth="0.7" strokeDasharray="2 2.5" opacity=".4" />
            <ellipse
              cx="160"
              cy="100"
              rx="9"
              ry="7"
              fill={`url(#${rawId}-gold)`}
              stroke="#a9832a"
              strokeWidth="1"
              className={styles.claspShine}
            />
            <rect
              x="157.2"
              y="94"
              width="5.6"
              height="10"
              rx="1.4"
              fill="#f7e7b0"
              stroke="#a9832a"
              strokeWidth="0.7"
            />
            <circle cx="160" cy="99" r="1.6" fill="#8a6a28" />
            <path
              d="M188 106 C190 102 194 102 196 106 C194 110 190 110 188 106Z"
              fill="#e6c260"
              opacity=".9"
            />
          </g>

          {SPARKLES.map(([x, y, delay], i) => (
            <path
              key={`sparkle-${i}`}
              d="M0 -5 L1.2 -1.2 L5 0 L1.2 1.2 L0 5 L-1.2 1.2 L-5 0 L-1.2 -1.2 Z"
              fill="#e6c260"
              transform={`translate(${x} ${y}) scale(${0.65 + (i % 3) * 0.2})`}
              className={i % 2 === 0 ? styles.sparkle : styles.twinkle}
              style={{
                animationDuration: sec(1.3),
                animationDelay: sec(delay),
              }}
            />
          ))}
        </svg>
      </div>
    </div>
  );
}
