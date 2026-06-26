import * as React from 'react'
import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap text-sm font-mono font-medium transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-[var(--color-ring)] disabled:pointer-events-none disabled:opacity-40 cursor-pointer uppercase tracking-widest',
  {
    variants: {
      variant: {
        default:
          'bg-[var(--color-primary)] text-[var(--color-primary-foreground)] hover:bg-[var(--color-primary)]/80 border border-[var(--color-primary)]',
        destructive:
          'bg-[var(--color-destructive)] text-[var(--color-destructive-foreground)] hover:bg-[var(--color-destructive)]/80',
        outline:
          'border border-[var(--color-primary)] text-[var(--color-primary)] bg-transparent hover:bg-[var(--color-primary)]/10',
        secondary:
          'border border-[var(--color-border)] text-[var(--color-foreground)] bg-[var(--color-secondary)] hover:bg-[var(--color-secondary)]/80',
        ghost:
          'text-[var(--color-foreground)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-primary)]',
        link:
          'text-[var(--color-primary)] underline-offset-4 hover:underline',
        warning:
          'border border-[var(--color-alert-passive)] text-[var(--color-alert-passive)] bg-transparent hover:bg-[var(--color-alert-passive)]/10',
        danger:
          'border border-[var(--color-alert-active)] text-[var(--color-alert-active)] bg-transparent hover:bg-[var(--color-alert-active)]/10',
      },
      size: {
        default: 'h-8 px-4 py-1',
        sm:      'h-6 px-3 text-xs',
        lg:      'h-10 px-6',
        icon:    'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button'
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    )
  },
)
Button.displayName = 'Button'

export { Button, buttonVariants }
