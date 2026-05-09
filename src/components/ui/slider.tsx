import * as React from 'react';
import { cn } from '../../lib/utils';

export interface SliderProps {
  id?: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
  disabled?: boolean;
}

const Slider = React.forwardRef<HTMLInputElement, SliderProps>(
  ({ id, value, onChange, min = 0, max = 100, step = 1, className, disabled }, ref) => {
    const percentage = ((value - min) / (max - min)) * 100;

    return (
      <input
        id={id}
        ref={ref}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        disabled={disabled}
        className={cn(
          'w-full h-1.5 rounded-full appearance-none cursor-pointer',
          '[&::-webkit-slider-thumb]:appearance-none',
          '[&::-webkit-slider-thumb]:w-5',
          '[&::-webkit-slider-thumb]:h-5',
          '[&::-webkit-slider-thumb]:rounded-full',
          '[&::-webkit-slider-thumb]:bg-[var(--bg-surface-container)]',
          '[&::-webkit-slider-thumb]:border-2',
          '[&::-webkit-slider-thumb]:border-[var(--fg-primary)]',
          '[&::-webkit-slider-thumb]:cursor-pointer',
          '[&::-webkit-slider-thumb]:transition-transform',
          '[&::-webkit-slider-thumb]:hover:scale-110',
          '[&::-moz-range-thumb]:w-5',
          '[&::-moz-range-thumb]:h-5',
          '[&::-moz-range-thumb]:rounded-full',
          '[&::-moz-range-thumb]:bg-[var(--bg-surface-container)]',
          '[&::-moz-range-thumb]:border-2',
          '[&::-moz-range-thumb]:border-[var(--fg-primary)]',
          '[&::-moz-range-thumb]:cursor-pointer',
          'disabled:cursor-not-allowed disabled:opacity-50',
          className
        )}
        style={{
          background: `linear-gradient(to right, var(--fg-primary) 0%, var(--fg-primary) ${percentage}%, var(--bg-surface-nested) ${percentage}%, var(--bg-surface-nested) 100%)`,
        }}
      />
    );
  }
);
Slider.displayName = 'Slider';

export { Slider };
