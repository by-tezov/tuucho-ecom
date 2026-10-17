import { useId, type CSSProperties } from 'react';
import { shopConfig } from '../../config/env';
import { splashSec } from './splashTiming';
import styles from './BootSplash.module.css';

const SPARKLES: Array<[number, number, number]> = [
  [64, 44, 1.1],
  [120, 30, 1.35],
  [176, 46, 1.55],
  [40, 96, 1.7],
  [210, 104, 1.85],
  [96, 70, 2.0],
  [150, 66, 1.2],
  [118, 110, 1.65],
  [186, 86, 1.45],
];

const STARS: Array<[number, number, number, number]> = [
  [8, 16, 9, 0.2],
  [18, 60, 7, 1.1],
  [27, 30, 11, 0.6],
  [35, 78, 6, 1.7],
  [46, 12, 8, 0.9],
  [54, 86, 10, 1.4],
  [63, 26, 7, 0.4],
  [72, 66, 11, 1.9],
  [82, 20, 8, 1.0],
  [88, 56, 6, 2.2],
  [92, 80, 9, 0.7],
  [14, 88, 7, 1.5],
  [23, 46, 4, 0.8],
  [40, 36, 3.5, 1.6],
  [58, 52, 4, 0.5],
  [68, 40, 3.5, 2.0],
  [78, 72, 4, 1.2],
  [33, 64, 3.5, 0.35],
  [50, 72, 4, 2.3],
  [86, 38, 3.5, 1.0],
  [12, 40, 4, 1.8],
  [96, 64, 3.5, 0.6],
];

const FLARES: Array<[number, number, number, number]> = [
  [27, 30, 1.4, 5.5],
  [72, 66, 3.4, 6],
];

function Blossom({ size = 5 }: { size?: number }) {
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
      {size >= 5 ? <circle r="1.3" fill="#fbf1d2" /> : null}
    </>
  );
}

function CornerOrnament({ gradientId }: { gradientId: string }) {
  return (
    <svg width="120" height="120" viewBox="0 0 120 120" fill="none" aria-hidden="true">
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
      <path
        d="M6 60 C6 46 10 40 20 40 C30 40 32 50 26 55 C22 58 16 56 18 50"
        stroke={`url(#${gradientId})`}
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
      />
      <g transform="translate(60 60)">
        <circle cx="0" cy="0" r="2.4" fill="#c7a766" />
        <path d="M0 -9 C3 -5 3 -2 0 0 C-3 -2 -3 -5 0 -9Z" fill="#d9bd77" opacity=".9" />
        <path d="M0 9 C3 5 3 2 0 0 C-3 2 -3 5 0 9Z" fill="#d9bd77" opacity=".9" />
        <path d="M-9 0 C-5 3 -2 3 0 0 C-2 -3 -5 -3 -9 0Z" fill="#d9bd77" opacity=".9" />
        <path d="M9 0 C5 3 2 3 0 0 C2 -3 5 -3 9 0Z" fill="#d9bd77" opacity=".9" />
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
      <svg width="160" height="44" viewBox="0 0 160 44" fill="none" style={{ overflow: 'visible' }}>
        <path
          d="M2 22 C30 22 30 10 46 15 C58 19 55 28 47 26 M46 15 C70 4 96 4 122 18 C134 24 150 20 158 22"
          stroke="#c7a766"
          strokeWidth="1.1"
          strokeLinecap="round"
          pathLength={1}
          className={styles.drawStroke}
          style={{ animationDuration: splashSec(1.7), animationDelay: splashSec(drawDelay) }}
        />
        <circle
          cx="47"
          cy="26"
          r="1.6"
          fill="#d9bd77"
          className={styles.vineDot}
          style={{ animationDelay: splashSec(drawDelay + 1.3) }}
        />
        <circle
          cx="158"
          cy="22"
          r="1.8"
          fill="#d9bd77"
          className={styles.vineDot}
          style={{ animationDelay: splashSec(drawDelay + 1.3) }}
        />
      </svg>
    </div>
  );
}

interface BootSplashProps {
  ariaLabel: string;
  markAria: string;
  tagline: string;
  /** Skip timed choreography (prefers-reduced-motion). */
  instant: boolean;
}

export function BootSplash({ ariaLabel, markAria, tagline, instant }: BootSplashProps) {
  const rawId = useId().replace(/:/g, '');
  const brand = shopConfig.brandName;
  const subtitle = shopConfig.brandSuffix;
  const rootStyle = {
    '--boot-splash-speed': String(shopConfig.bootSplashSpeed),
  } as CSSProperties;

  return (
    <div
      className={`${styles.root} ${instant ? styles.rootInstant : ''}`.trim()}
      style={rootStyle}
      role="status"
      aria-label={ariaLabel}
      aria-busy="true"
    >
      {STARS.map(([left, top, size, delay], i) => (
        <span
          key={`star-${i}`}
          className={styles.star}
          style={{ left: `${left}%`, top: `${top}%` }}
          aria-hidden="true"
        >
          <svg
            width={size}
            height={size}
            viewBox="0 0 12 12"
            className={styles.twinkle}
            style={{
              animationDuration: splashSec(1.4 + (i % 3) * 0.25),
              animationDelay: splashSec(delay),
            }}
          >
            <path d="M6 0 L7.4 4.6 L12 6 L7.4 7.4 L6 12 L4.6 7.4 L0 6 L4.6 4.6 Z" fill="#d9bd77" />
          </svg>
        </span>
      ))}

      {FLARES.map(([left, top, delay, duration], i) => (
        <div
          key={`flare-${i}`}
          className={styles.flareWrap}
          style={{ left: `${left}%`, top: `${top}%` }}
          aria-hidden="true"
        >
          <div
            className={styles.flare}
            style={{ animationDuration: splashSec(duration), animationDelay: splashSec(delay) }}
          >
            <span className={styles.flareH} />
            <span className={styles.flareV} />
            <span className={styles.flareGlow} />
          </div>
        </div>
      ))}

      <Vine className={styles.vineTop ?? ''} drawDelay={0.5} />
      <Vine className={styles.vineBottom ?? ''} drawDelay={0.7} />
      <Vine className={styles.vineLeft ?? ''} drawDelay={0.9} />
      <Vine className={styles.vineRight ?? ''} drawDelay={1.1} />

      <div className={styles.tree} aria-hidden="true">
        <svg viewBox="0 0 400 320" className={styles.treeSvg} fill="none" strokeLinecap="round">
          <path
            d="M200 320 C197 292 203 262 200 232"
            stroke="#b8912f"
            strokeWidth="2.6"
            pathLength={1}
            className={styles.drawStroke}
            style={{ animationDuration: splashSec(1.3), animationDelay: splashSec(0.3) }}
          />
          <g className={styles.swayL}>
            <path
              d="M200 236 C168 218 146 210 118 190 C100 178 86 172 68 158"
              stroke="#bf9a38"
              strokeWidth="1.8"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1.4), animationDelay: splashSec(1.3) }}
            />
            <path
              d="M150 213 C136 198 130 190 120 174"
              stroke="#c7a766"
              strokeWidth="1.2"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1), animationDelay: splashSec(2.3) }}
            />
            <path
              d="M118 190 C108 176 102 166 96 150"
              stroke="#c7a766"
              strokeWidth="1.2"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1), animationDelay: splashSec(2.5) }}
            />
            <path
              d="M86 170 C78 160 74 152 72 140"
              stroke="#c7a766"
              strokeWidth="1.1"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1), animationDelay: splashSec(2.7) }}
            />
            <path
              d="M118 190 C110 202 108 210 112 222"
              stroke="#c7a766"
              strokeWidth="1.1"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1), animationDelay: splashSec(2.8) }}
            />
            <path
              d="M96 178 C84 174 76 172 62 174"
              stroke="#c7a766"
              strokeWidth="1"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1), animationDelay: splashSec(2.95) }}
            />
            <path
              d="M150 213 C142 224 140 232 144 244"
              stroke="#c7a766"
              strokeWidth="1"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(0.9), animationDelay: splashSec(3) }}
            />
            <g className={styles.blossoms} style={{ animationDelay: splashSec(3.4) }}>
              <g transform="translate(68 158)">
                <Blossom />
              </g>
              <g transform="translate(96 150)">
                <Blossom />
              </g>
              <g transform="translate(72 140)">
                <Blossom />
              </g>
              <g transform="translate(120 174)">
                <Blossom size={4} />
              </g>
              <g transform="translate(62 174)">
                <Blossom size={4} />
              </g>
              <g transform="translate(112 222)">
                <Blossom size={4} />
              </g>
            </g>
          </g>
          <g className={styles.swayR}>
            <path
              d="M200 236 C232 218 254 210 282 190 C300 178 314 172 332 158"
              stroke="#bf9a38"
              strokeWidth="1.8"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1.4), animationDelay: splashSec(1.35) }}
            />
            <path
              d="M250 213 C264 198 270 190 280 174"
              stroke="#c7a766"
              strokeWidth="1.2"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1), animationDelay: splashSec(2.35) }}
            />
            <path
              d="M282 190 C292 176 298 166 304 150"
              stroke="#c7a766"
              strokeWidth="1.2"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1), animationDelay: splashSec(2.55) }}
            />
            <path
              d="M314 170 C322 160 326 152 328 140"
              stroke="#c7a766"
              strokeWidth="1.1"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1), animationDelay: splashSec(2.75) }}
            />
            <path
              d="M282 190 C290 202 292 210 288 222"
              stroke="#c7a766"
              strokeWidth="1.1"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1), animationDelay: splashSec(2.85) }}
            />
            <path
              d="M304 178 C316 174 324 172 338 174"
              stroke="#c7a766"
              strokeWidth="1"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(1), animationDelay: splashSec(3) }}
            />
            <path
              d="M250 213 C258 224 260 232 256 244"
              stroke="#c7a766"
              strokeWidth="1"
              pathLength={1}
              className={styles.drawStroke}
              style={{ animationDuration: splashSec(0.9), animationDelay: splashSec(3.05) }}
            />
            <g className={styles.blossoms} style={{ animationDelay: splashSec(3.45) }}>
              <g transform="translate(332 158)">
                <Blossom />
              </g>
              <g transform="translate(304 150)">
                <Blossom />
              </g>
              <g transform="translate(328 140)">
                <Blossom />
              </g>
              <g transform="translate(280 174)">
                <Blossom size={4} />
              </g>
              <g transform="translate(338 174)">
                <Blossom size={4} />
              </g>
              <g transform="translate(288 222)">
                <Blossom size={4} />
              </g>
            </g>
          </g>
        </svg>
      </div>

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

      <div className={styles.center}>
        <div className={styles.glow} aria-hidden="true" />

        <div className={styles.atelierMark} role="img" aria-label={markAria}>
          <svg viewBox="0 0 240 150" className={styles.atelierMarkSvg}>
            <defs>
              <linearGradient id={`${rawId}-markFill`} x1="0" y1="1" x2="0" y2="0">
                <stop offset="0" stopColor="#e9cf8f" />
                <stop offset=".55" stopColor="#f0dfa8" />
                <stop offset="1" stopColor="#fbf1d2" />
              </linearGradient>
              <linearGradient id={`${rawId}-markStroke`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0" stopColor="#e6c260" />
                <stop offset="1" stopColor="#a9832a" />
              </linearGradient>
            </defs>
            <g transform="translate(78 18)">
              <path
                d="M42 8 L76 58 L42 108 L8 58 Z"
                fill="#f3ead6"
                opacity=".45"
              />
              <path
                d="M42 8 L76 58 L42 108 L8 58 Z"
                fill={`url(#${rawId}-markFill)`}
                className={styles.paintRise}
                style={{ animationDuration: splashSec(1.6), animationDelay: splashSec(0.8) }}
              />
              <path
                d="M42 8 L76 58 L42 108 L8 58 Z"
                fill="none"
                stroke={`url(#${rawId}-markStroke)`}
                strokeWidth="2.2"
                pathLength={1}
                className={styles.drawStroke}
                style={{ animationDuration: splashSec(1.4), animationDelay: splashSec(0.2) }}
              />
              <circle cx="42" cy="58" r="7" fill="#fbf1d2" opacity=".85" />
            </g>
            {SPARKLES.map(([x, y, delay], i) => (
              <path
                key={`sparkle-${i}`}
                d="M0 -6 L1.4 -1.4 L6 0 L1.4 1.4 L0 6 L-1.4 1.4 L-6 0 L-1.4 -1.4 Z"
                fill="#e6c260"
                transform={`translate(${x} ${y}) scale(${0.7 + (i % 3) * 0.25})`}
                className={styles.sparkle}
                style={{
                  animationDuration: splashSec(1.6 + (i % 3) * 0.5),
                  animationDelay: splashSec(delay * 2),
                }}
              />
            ))}
          </svg>
        </div>

        <div className={styles.wordmark}>
          <div className={styles.letters} aria-hidden="true">
            {brand.split('').map((ch, i) => (
              <span
                key={`letter-${i}`}
                className={styles.letter}
                style={{
                  animationDuration: splashSec(1.2),
                  animationDelay: splashSec(2.3 + i * 0.15),
                  width: ch === ' ' ? '0.3em' : undefined,
                }}
              >
                {ch}
              </span>
            ))}
          </div>
          <span className="visuallyHidden">{brand}</span>
          <div className={styles.shimmerMask} aria-hidden="true">
            <div className={styles.shimmer} />
          </div>
        </div>

        <div className={styles.rule} aria-hidden="true" />

        <div className={styles.tagBlock}>
          <div className={styles.subtitle}>{subtitle}</div>
          <p className={styles.tagline}>{tagline}</p>
        </div>
      </div>
    </div>
  );
}
