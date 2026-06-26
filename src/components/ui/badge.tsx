import * as React from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const badgeVariants = cva(
  'inline-flex items-center border px-1.5 py-0.5 text-[10px] font-mono font-semibold uppercase tracking-widest transition-colors',
  {
    variants: {
      variant: {
        default:     'border-[var(--color-primary)] text-[var(--color-primary)] bg-[var(--color-primary)]/10',
        secondary:   'border-[var(--color-border)] text-[var(--color-muted-foreground)] bg-transparent',
        destructive: 'border-[var(--color-destructive)] text-[var(--color-destructive)] bg-[var(--color-destructive)]/10',
        warning:     'border-[var(--color-alert-passive)] text-[var(--color-alert-passive)] bg-[var(--color-alert-passive)]/10',
        blue:        'border-[var(--color-sec-blue)] text-[var(--color-sec-blue)] bg-[var(--color-sec-blue)]/10',
        green:       'border-[var(--color-sec-green)] text-[var(--color-sec-green)] bg-[var(--color-sec-green)]/10',
        orange:      'border-[var(--color-sec-orange)] text-[var(--color-sec-orange)] bg-[var(--color-sec-orange)]/10',
        red:         'border-[var(--color-sec-red)] text-[var(--color-sec-red)] bg-[var(--color-sec-red)]/10',
        uv:          'border-[var(--color-sec-uv)] text-[var(--color-sec-uv)] bg-[var(--color-sec-uv)]/10',
      },
    },
    defaultVariants: { variant: 'default' },
  },
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
