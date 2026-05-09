import * as React from 'react';
import { Input, type InputProps } from './input';

export interface NumberInputProps
  extends Omit<InputProps, 'value' | 'onChange' | 'type'> {
  value: number;
  onChange: (value: number) => void;
  /** parseInt for integers, parseFloat for decimals. Defaults to parseFloat. */
  parse?: (raw: string) => number;
}

export const NumberInput = React.forwardRef<HTMLInputElement, NumberInputProps>(
  ({ value, onChange, parse = parseFloat, onBlur, onFocus, ...props }, ref) => {
    const [text, setText] = React.useState<string>(String(value));
    const focused = React.useRef(false);

    React.useEffect(() => {
      if (!focused.current) setText(String(value));
    }, [value]);

    return (
      <Input
        {...props}
        ref={ref}
        type="number"
        value={text}
        onFocus={(e) => {
          focused.current = true;
          onFocus?.(e);
        }}
        onChange={(e) => {
          const raw = e.target.value;
          setText(raw);
          if (raw === '') return;
          const n = parse(raw);
          if (!Number.isNaN(n)) onChange(n);
        }}
        onBlur={(e) => {
          focused.current = false;
          if (text === '' || Number.isNaN(parse(text))) setText(String(value));
          onBlur?.(e);
        }}
      />
    );
  },
);
NumberInput.displayName = 'NumberInput';
