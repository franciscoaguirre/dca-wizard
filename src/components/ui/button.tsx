import * as React from 'react';
import { cn } from '../../lib/utils';

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost' | 'danger';
  size?: 'default' | 'sm' | 'lg';
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', disabled, ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-small font-semibold transition-colors cursor-pointer',
          'disabled:opacity-50 disabled:cursor-not-allowed',
          {
            'bg-action-primary text-primary-inverted hover:bg-action-primary-hover': variant === 'default',
            'bg-action-secondary text-primary hover:bg-action-secondary-hover': variant === 'outline',
            'bg-transparent text-primary hover:bg-selection-container-hover': variant === 'ghost',
            'bg-status-error text-primary-inverted hover:bg-status-error-hover': variant === 'danger',
          },
          {
            'px-5 py-2.5 text-sm': size === 'default',
            'px-3 py-1.5 text-xs': size === 'sm',
            'px-6 py-3 text-base': size === 'lg',
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
