import * as React from 'react';
import { cva, type VariantProps } from 'class-variance-authority';
import { cn } from '@/lib/utils';

// Hover-lift applied only to the solid/bordered variants — a text link or ghost
// button shouldn't jump and cast a shadow on hover. `will-change-transform`
// rides along so it isn't paid on the non-lifting variants.
const LIFT =
  'will-change-transform hover:-translate-y-0.5 hover:shadow-lg active:translate-y-0';

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-round text-sm font-medium transition-[color,background-color,border-color,box-shadow,transform] duration-300 ease-[var(--ease-out)] active:duration-100 motion-reduce:transform-none motion-reduce:transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        // Primary — navy (#00223F) solid; inverts in dark/contrast via tokens.
        default: `bg-btn-primary text-btn-primary-foreground shadow hover:bg-btn-primary/90 ${LIFT}`,
        destructive: `bg-destructive text-destructive-foreground shadow-sm hover:bg-destructive/90 ${LIFT}`,
        outline: `border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground ${LIFT}`,
        // Secondary — white fill + navy border (inverts in dark/contrast).
        secondary: `border border-btn-secondary-border bg-btn-secondary text-btn-secondary-foreground shadow-sm hover:bg-btn-secondary-border/10 ${LIFT}`,
        ghost: 'hover:bg-accent hover:text-accent-foreground',
        link: 'text-primary underline-offset-4 hover:underline',
      },
      size: {
        // Default height matches Input (h-11 / 44px) so they align in a row.
        default: 'h-11 px-5 py-2',
        sm: 'h-9 rounded-round px-3 text-xs',
        lg: 'h-12 rounded-round px-8',
        icon: 'h-11 w-11',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, ...props }, ref) => (
    <button
      ref={ref}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  ),
);
Button.displayName = 'Button';

export { Button, buttonVariants };
