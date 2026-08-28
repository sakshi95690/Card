import React from 'react';

interface IskconLogoProps {
  className?: string;
  size?: number;
}

export const IskconLogo: React.FC<IskconLogoProps> = ({ className = 'w-10 h-10', size = 40 }) => {
  return (
    <svg
      viewBox="0 0 100 100"
      width={size}
      height={size}
      className={`shrink-0 ${className}`}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Official Logo"
    >
      <defs>
        <linearGradient id="blueLogoBg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#1E40AF" />
          <stop offset="50%" stopColor="#1D4ED8" />
          <stop offset="100%" stopColor="#0F294A" />
        </linearGradient>
        <linearGradient id="goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="#FFE082" />
          <stop offset="50%" stopColor="#FFD54F" />
          <stop offset="100%" stopColor="#FFB300" />
        </linearGradient>
      </defs>

      {/* Outer Circle Container */}
      <circle cx="50" cy="50" r="48" fill="url(#blueLogoBg)" stroke="#93C5FD" strokeWidth="2" />

      {/* Inner Decorative Ring */}
      <circle cx="50" cy="50" r="43" fill="none" stroke="#DBEAFE" strokeWidth="1" strokeDasharray="3 2" opacity="0.8" />

      {/* Gaudiya Vaishnava Tilak (Urdhva Pundra) */}
      {/* Left line of Tilak */}
      <path
        d="M44 20 C44 20 44 48 45 62 C45 64 47 66 50 66"
        stroke="url(#goldGrad)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />
      {/* Right line of Tilak */}
      <path
        d="M56 20 C56 20 56 48 55 62 C55 64 53 66 50 66"
        stroke="url(#goldGrad)"
        strokeWidth="3.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Central Tilak line */}
      <line x1="50" y1="24" x2="50" y2="52" stroke="#FFFFFF" strokeWidth="1.5" strokeLinecap="round" opacity="0.9" />

      {/* Tulasi Leaf at the base of Tilak */}
      <path
        d="M50 65 C45 69 44 75 50 78 C56 75 55 69 50 65 Z"
        fill="url(#goldGrad)"
        stroke="#FFE082"
        strokeWidth="0.8"
      />
      {/* Tulasi central vein */}
      <line x1="50" y1="67" x2="50" y2="76" stroke="#1E40AF" strokeWidth="1" strokeLinecap="round" />

      {/* Lotus Petal Base Motifs */}
      <path
        d="M34 76 C37 71 43 71 46 76"
        stroke="#93C5FD"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M66 76 C63 71 57 71 54 76"
        stroke="#93C5FD"
        strokeWidth="1.8"
        strokeLinecap="round"
        fill="none"
      />

      {/* Text arc banner ISKCON */}
      <text
        x="50"
        y="91"
        textAnchor="middle"
        fill="#FFFFFF"
        fontSize="8.5"
        fontWeight="800"
        letterSpacing="1.8"
        fontFamily="sans-serif"
      >
        ISKCON
      </text>
    </svg>
  );
};
