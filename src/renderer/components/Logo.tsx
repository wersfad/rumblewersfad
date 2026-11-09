import React from 'react';

interface LogoProps {
  size?: number; // размер буквы в px
  className?: string;
}

/**
 * Монограмма «RW», нарисованная с нуля как SVG: буквы стоят по диагонали
 * (R слева сверху, W справа снизу), наклон, белая заливка, тёмно-фиолетовая
 * обводка, объёмная тень и фиолетовое свечение. Без подписей.
 */
const Logo: React.FC<LogoProps> = ({ size = 44, className = '' }) => {
  const w = size * 2.05;
  const h = size * 1.5;

  return (
    <svg
      width={w}
      height={h}
      viewBox={`0 0 ${w} ${h}`}
      className={className}
      role="img"
      aria-label="Rumblewersfad logo"
    >
      <defs>
        <linearGradient id="rwf-glow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="100%" stopColor="#e9e2ff" />
        </linearGradient>
        <filter id="rwf-shadow" x="-30%" y="-30%" width="160%" height="170%">
          <feDropShadow dx="0" dy={size * 0.055} stdDeviation={size * 0.025} style={{ floodColor: 'var(--logo-stroke)' }} floodOpacity="0.9" />
          <feDropShadow dx="0" dy="0" stdDeviation={size * 0.09} style={{ floodColor: 'var(--logo-glow)' }} floodOpacity="0.6" />
        </filter>
      </defs>
      <g transform={`skewX(-8)`}>
        <text
          x={size * 0.1}
          y={size * 0.78}
          fontFamily="var(--font-display)"
          fontStyle="italic"
          fontSize={size}
          fill="url(#rwf-glow)"
          stroke="var(--logo-stroke)"
          strokeWidth={size * 0.08}
          paintOrder="stroke"
          filter="url(#rwf-shadow)"
        >
          R
        </text>
        <text
          x={size * 0.92}
          y={size * 1.34}
          fontFamily="var(--font-display)"
          fontStyle="italic"
          fontSize={size}
          fill="url(#rwf-glow)"
          stroke="var(--logo-stroke)"
          strokeWidth={size * 0.08}
          paintOrder="stroke"
          filter="url(#rwf-shadow)"
        >
          W
        </text>
      </g>
    </svg>
  );
};

export default Logo;
