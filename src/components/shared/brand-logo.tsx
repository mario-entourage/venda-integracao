import Image from 'next/image';
import { cn } from '@/lib/utils';

type BrandLogoVariant = 'light' | 'dark' | 'color';

const ICON_SRC: Record<BrandLogoVariant, string> = {
  light: '/icon-255-255-255.png',
  dark: '/icon-000-000-000.png',
  color: '/icon-color.png',
};

interface BrandLogoProps {
  /** Which icon color variant to use */
  variant?: BrandLogoVariant;
  /** Additional classes for the wrapper */
  className?: string;
  /** Icon size in pixels (default 28) */
  size?: number;
  /** Whether to show the brand text (default true) */
  showText?: boolean;
}

export function BrandLogo({
  variant = 'color',
  className,
  size = 28,
  showText = true,
}: BrandLogoProps) {
  return (
    <span className={cn('inline-flex items-center gap-2', className)}>
      <Image
        src={ICON_SRC[variant]}
        alt="Entourage"
        width={size}
        height={size}
        className="object-contain"
      />
      {showText && (
        <span className="font-headline text-lg font-bold tracking-wide">
          ENTOURΛGE
        </span>
      )}
    </span>
  );
}
