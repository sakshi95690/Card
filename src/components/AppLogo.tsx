import React, { useState } from 'react';
import { IskconLogo } from './IskconLogo';

interface AppLogoProps {
  className?: string;
  size?: number;
  alt?: string;
}

export const AppLogo: React.FC<AppLogoProps> = ({
  className = 'w-10 h-10',
  size = 40,
  alt = 'Organization Logo',
}) => {
  const [imgError, setImgError] = useState(false);

  if (imgError) {
    return <IskconLogo className={className} size={size} />;
  }

  return (
    <img
      src="/logo.png"
      alt={alt}
      width={size}
      height={size}
      className={`object-contain shrink-0 ${className}`}
      onError={() => setImgError(true)}
    />
  );
};
