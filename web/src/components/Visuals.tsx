// Built-in illustrations keyed by `card.visual`. Labels come from the lesson, never hard-coded.
import { COURSE_IMAGES_ENABLED } from "@/features/courses/catalog";

type Props = { labels?: string[]; className?: string };

const FRAME = "relative h-full w-full overflow-hidden rounded-[1.4rem] bg-gradient-to-br from-[#264d8f] via-[#2f6aa5] to-[#3f8fb8]";

export function CardVisual({ kind, labels = [], className = "" }: { kind?: string; labels?: string[]; className?: string }) {
  if (!COURSE_IMAGES_ENABLED) return null;
  switch (kind) {
    case "book":
      return <BookVisual className={className} />;
    case "compass":
      return <CompassVisual className={className} />;
    case "order":
      return <OrderVisual labels={labels} className={className} />;
    case "steps":
      return <StepsVisual className={className} />;
    default:
      return <LightVisual className={className} />;
  }
}

function BookVisual({ className }: Props) {
  return (
    <div className={`${FRAME} ${className}`}>
      <svg viewBox="0 0 640 360" className="h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="bv-glow" cx="50%" cy="40%" r="55%">
            <stop offset="0" stopColor="#fff6d8" stopOpacity=".55" />
            <stop offset="1" stopColor="#fff6d8" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="640" height="360" fill="url(#bv-glow)" />
        <g transform="translate(320 250)">
          <path d="M-150 30 L0 60 L150 30 L130 50 L0 80 L-130 50Z" fill="#7a4d2a" />
          <path d="M-140 30 L-10 55 L-120 -60 Z" fill="#a46a3b" opacity=".0" />
          <path d="M0 50 C-50 30 -110 30 -160 40 L-160 -70 C-110 -80 -50 -80 0 -55Z" fill="#fbf6ea" />
          <path d="M0 50 C50 30 110 30 160 40 L160 -70 C110 -80 50 -80 0 -55Z" fill="#f4ecda" />
          <g stroke="#c7b48a" strokeWidth="3" strokeLinecap="round" opacity=".8">
            <path d="M-135 -45 H-30 M-135 -25 H-30 M-135 -5 H-30 M-135 15 H-50" />
            <path d="M30 -45 H135 M30 -25 H135 M30 -5 H135 M50 15 H135" />
          </g>
          <path d="M0 -55 V50" stroke="#d9c9a6" strokeWidth="2" />
        </g>
        <g fill="#f1a287" opacity=".8">
          <circle cx="120" cy="80" r="3" />
          <circle cx="520" cy="110" r="2.5" />
          <circle cx="470" cy="60" r="2" />
          <circle cx="170" cy="140" r="2" />
        </g>
      </svg>
    </div>
  );
}

function CompassVisual({ className }: Props) {
  return (
    <div className={`${FRAME} ${className}`}>
      <svg viewBox="0 0 640 360" className="h-full w-full" aria-hidden>
        <g transform="translate(320 180)">
          <circle r="120" fill="#ffffff14" stroke="#ffffff66" strokeWidth="3" />
          <circle r="92" fill="none" stroke="#ffffff33" strokeWidth="2" strokeDasharray="4 10" />
          {[0, 90, 180, 270].map((a) => (
            <rect key={a} x="-2" y="-118" width="4" height="16" fill="#ffffffaa" transform={`rotate(${a})`} />
          ))}
          <g transform="rotate(32)">
            <path d="M0 -100 L14 0 L0 18 L-14 0Z" fill="#f1a287" />
            <path d="M0 100 L14 0 L0 -18 L-14 0Z" fill="#ffffff55" />
          </g>
          <circle r="9" fill="#fff" />
          <g transform="rotate(32) translate(0 -150)">
            <rect x="-16" y="-16" width="32" height="32" rx="3" fill="#0b1b33" />
            <rect x="-16" y="-8" width="32" height="5" fill="#d9b25a" />
          </g>
        </g>
      </svg>
    </div>
  );
}

function OrderVisual({ labels = [], className }: Props) {
  const pts = [
    [110, 205],
    [250, 135],
    [400, 245],
    [540, 175],
  ];
  return (
    <div className={`${FRAME} ${className}`}>
      <svg viewBox="0 0 640 360" className="h-full w-full" aria-hidden>
        <path d="M110 205 C180 120 220 120 250 135 S350 270 400 245 S500 150 540 175" fill="none" stroke="#f1a287" strokeWidth="7" strokeDasharray="3 14" strokeLinecap="round" />
        {pts.map(([x, y], i) => (
          <g key={i} transform={`translate(${x} ${y})`}>
            <circle r={i === 0 ? 40 : 34} fill={i === 0 ? "#6150ea" : "#ffffff22"} stroke="#fff" strokeWidth={i === 0 ? 5 : 3} />
            <text y="10" textAnchor="middle" fontSize="28" fontWeight="700" fill="#fff">{i + 1}</text>
          </g>
        ))}
      </svg>
      <ol className="absolute inset-x-4 bottom-3 grid grid-cols-4 gap-2 text-center text-[0.72rem] font-medium leading-tight text-white sm:text-sm">
        {labels.slice(0, 4).map((l, i) => (
          <li key={i} className="rounded-lg bg-white/10 px-1.5 py-1 backdrop-blur-sm">{l}</li>
        ))}
      </ol>
    </div>
  );
}

function StepsVisual({ className }: Props) {
  return (
    <div className={`${FRAME} ${className}`}>
      <svg viewBox="0 0 640 360" className="h-full w-full" aria-hidden>
        <defs>
          <linearGradient id="sv-w" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="1" stopColor="#bcd7f5" />
          </linearGradient>
        </defs>
        <path d="M60 300 C160 290 220 250 300 250 S470 290 580 280" fill="none" stroke="#ffffff55" strokeWidth="3" />
        {[0, 1, 2].map((i) => (
          <path
            key={i}
            transform={`translate(${200 + i * 120} ${110 + (i % 2) * 30}) scale(${1 - i * 0.12})`}
            d="M0 -60 C24 -26 40 0 40 24 a40 40 0 0 1 -80 0 C-40 0 -24 -26 0 -60Z"
            fill="url(#sv-w)"
            opacity={0.95 - i * 0.18}
          />
        ))}
        <g fill="#ffffff" opacity=".6">
          <circle cx="110" cy="90" r="3" />
          <circle cx="560" cy="80" r="3" />
          <circle cx="520" cy="200" r="2" />
        </g>
      </svg>
    </div>
  );
}

function LightVisual({ className }: Props) {
  return (
    <div className={`${FRAME} ${className}`}>
      <svg viewBox="0 0 640 360" className="h-full w-full" aria-hidden>
        <defs>
          <radialGradient id="lv" cx="50%" cy="38%" r="50%">
            <stop offset="0" stopColor="#fff3c4" stopOpacity=".9" />
            <stop offset=".45" stopColor="#fff3c4" stopOpacity=".18" />
            <stop offset="1" stopColor="#fff3c4" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="640" height="360" fill="url(#lv)" />
        <g fill="none" stroke="#ffffff" strokeOpacity=".5" strokeWidth="2.5">
          <rect x="285" y="105" width="70" height="70" rx="6" />
          <rect x="285" y="105" width="70" height="70" rx="6" transform="rotate(45 320 140)" />
        </g>
        <path d="M0 300 C120 270 220 290 320 280 S520 260 640 285 V360 H0Z" fill="#ffffff1c" />
        <path d="M0 325 C140 305 260 320 360 312 S540 300 640 318 V360 H0Z" fill="#ffffff22" />
      </svg>
    </div>
  );
}
