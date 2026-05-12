import { createContext, type ElementType, type ReactNode, type RefObject, useContext } from 'react';
import LiquidGlass from 'liquid-glass-react';

export type LiquidSurfaceVariant = 'hero' | 'panel' | 'nav';

type LiquidMouseContainer = RefObject<HTMLElement | null> | null;

const LiquidMouseContext = createContext<LiquidMouseContainer>(null);

export function LiquidMouseProvider({ value, children }: { value: LiquidMouseContainer; children: ReactNode }) {
  return <LiquidMouseContext.Provider value={value}>{children}</LiquidMouseContext.Provider>;
}

interface LiquidSurfaceProps {
  as?: ElementType;
  variant?: LiquidSurfaceVariant;
  className?: string;
  contentClassName?: string;
  children: ReactNode;
}

const variantConfig: Record<LiquidSurfaceVariant, {
  displacementScale: number;
  blurAmount: number;
  saturation: number;
  aberrationIntensity: number;
  elasticity: number;
  cornerRadius: number;
  mode: 'standard' | 'polar' | 'prominent';
  overLight: boolean;
}> = {
  hero: {
    displacementScale: 130,
    blurAmount: 0.045,
    saturation: 185,
    aberrationIntensity: 5.8,
    elasticity: 0.38,
    cornerRadius: 8,
    mode: 'prominent',
    overLight: false,
  },
  panel: {
    displacementScale: 90,
    blurAmount: 0.05,
    saturation: 165,
    aberrationIntensity: 4.2,
    elasticity: 0.28,
    cornerRadius: 8,
    mode: 'standard',
    overLight: true,
  },
  nav: {
    displacementScale: 82,
    blurAmount: 0.045,
    saturation: 155,
    aberrationIntensity: 3.8,
    elasticity: 0.24,
    cornerRadius: 8,
    mode: 'polar',
    overLight: true,
  },
};

export function LiquidSurface({
  as: Component = 'div',
  variant = 'panel',
  className = '',
  contentClassName = '',
  children,
}: LiquidSurfaceProps) {
  const mouseContainer = useContext(LiquidMouseContext);
  const config = variantConfig[variant];

  return (
    <Component className={`liquid-surface liquid-surface-${variant} ${className}`}>
      <LiquidGlass
        className="liquid-surface-effect pointer-events-none"
        mouseContainer={mouseContainer}
        displacementScale={config.displacementScale}
        blurAmount={config.blurAmount}
        saturation={config.saturation}
        aberrationIntensity={config.aberrationIntensity}
        elasticity={config.elasticity}
        cornerRadius={config.cornerRadius}
        overLight={config.overLight}
        mode={config.mode}
        padding="0"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          width: '100%',
          height: '100%',
          pointerEvents: 'none',
        }}
      >
        <span className="liquid-surface-fill" aria-hidden="true" />
      </LiquidGlass>
      <div className={`liquid-surface-content ${contentClassName}`}>{children}</div>
    </Component>
  );
}
