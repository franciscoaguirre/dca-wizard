import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost';
  size?: 'default' | 'sm' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-lg font-medium transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary-500',
          'disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-primary-500 text-white hover:bg-primary-600': variant === 'default',
            'border-2 border-neutral-300 bg-transparent text-neutral-700 hover:bg-neutral-100': variant === 'outline',
            'text-neutral-700 hover:bg-neutral-100': variant === 'ghost',
          },
          {
            'px-5 py-2.5': size === 'default',
            'px-4 py-2 text-sm': size === 'sm',
            'px-8 py-3': size === 'lg',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = 'Button';

export { Button };
