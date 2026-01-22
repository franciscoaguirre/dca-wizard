import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', disabled, ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-semibold transition-colors shadow-md',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500',
          {
            'bg-primary-400 text-black hover:bg-primary-500 active:bg-primary-600': variant === 'default' && !disabled,
            'bg-neutral-300 text-neutral-500 cursor-not-allowed': variant === 'default' && disabled,
            'border-2 border-neutral-300 bg-white text-neutral-900 hover:bg-neutral-100': variant === 'outline' && !disabled,
            'border-2 border-neutral-200 bg-neutral-100 text-neutral-400 cursor-not-allowed': variant === 'outline' && disabled,
            'text-neutral-900 hover:bg-neutral-100': variant === 'ghost' && !disabled,
            'text-neutral-400 cursor-not-allowed': variant === 'ghost' && disabled,
          },
          {
            'px-5 py-2.5': size === 'default',
            'px-4 py-2 text-sm': size === 'sm',
            'px-8 py-3 text-lg': size === 'lg',
          },
          className
        )}
        ref={ref}
        disabled={disabled}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
