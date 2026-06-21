'use client';

import { Button as ButtonPrimitive } from "@base-ui/react/button";
import { cva, type VariantProps } from "class-variance-authority";
import { useState, useCallback, useRef, type MouseEvent } from "react";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "group/button relative overflow-hidden inline-flex shrink-0 items-center justify-center rounded-lg border border-transparent bg-clip-padding text-sm font-medium whitespace-nowrap outline-none select-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary text-primary-foreground hover:shadow-[0_0_45px_-2px_rgba(59,130,246,0.65)] hover:-translate-y-0.5 active:shadow-[0_0_30px_-1px_rgba(59,130,246,0.8)] active:brightness-150",
        outline:
          "border-border bg-background hover:border-[var(--color-accent)] hover:text-[var(--color-accent-hover)] hover:shadow-[0_0_35px_-4px_rgba(59,130,246,0.55)] active:bg-[var(--color-accent-muted)] active:brightness-125 dark:border-input dark:bg-input/30 dark:hover:bg-input/50",
        secondary:
          "bg-secondary text-secondary-foreground hover:shadow-[0_0_35px_-4px_rgba(59,130,246,0.5)] hover:-translate-y-0.5 active:brightness-150",
        ghost:
          "hover:bg-muted hover:text-foreground hover:shadow-[0_0_30px_-6px_rgba(59,130,246,0.35)] dark:hover:bg-muted/50",
        destructive:
          "bg-destructive/10 text-destructive hover:bg-destructive/20 hover:shadow-[0_0_35px_-3px_rgba(239,68,68,0.55)] active:shadow-[0_0_25px_-1px_rgba(239,68,68,0.7)] active:brightness-150 dark:bg-destructive/20 dark:hover:bg-destructive/30",
        link:
          "text-primary underline-offset-4 hover:underline hover:text-[var(--color-accent-hover)] active:text-[var(--color-accent)]",
      },
      size: {
        default: "h-8 gap-1.5 px-2.5",
        xs: "h-6 gap-1 px-2 text-xs [&_svg:not([class*='size-'])]:size-3",
        sm: "h-7 gap-1 px-2.5 text-[0.8rem] [&_svg:not([class*='size-'])]:size-3.5",
        lg: "h-9 gap-1.5 px-2.5",
        icon: "size-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

const RIPPLE_COLORS: Record<string, string> = {
  destructive: "rgba(239,68,68,0.6)",
  outline: "rgba(232,232,240,0.4)",
  ghost: "rgba(232,232,240,0.3)",
  link: "rgba(59,130,246,0.4)",
};

function Ripple({ ripples, variant }: { ripples: { id: number; x: number; y: number }[]; variant: string }) {
  return (
    <>
      {ripples.map((r) => (
        <span
          key={r.id}
          className="pointer-events-none absolute rounded-full"
          style={{
            left: r.x, top: r.y,
            width: 40, height: 40,
            marginLeft: -20, marginTop: -20,
            background: `radial-gradient(circle, ${RIPPLE_COLORS[variant] ?? 'rgba(59,130,246,0.4)'} 0%, transparent 70%)`,
            animation: 'ripple 0.45s ease-out forwards',
          }}
        />
      ))}
    </>
  );
}

function Spinner() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 16 16" fill="none">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.15" />
      <path d="M14 8A6 6 0 0 0 2 8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
        <animateTransform attributeName="transform" type="rotate" from="0 8 8" to="360 8 8" dur="0.6s" repeatCount="indefinite" />
      </path>
    </svg>
  );
}

function ShimmerOverlay({ show, variant }: { show: boolean; variant: string }) {
  if (variant === 'ghost' || variant === 'link') return null;
  return (
    <span aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden rounded-[inherit]">
      <span
        className="absolute inset-0"
        style={{
          background: 'linear-gradient(110deg, transparent, rgba(59,130,246,0.15), transparent)',
          backgroundSize: '200% 100%',
          animation: show ? 'shimmer 1.5s linear infinite' : 'none',
          opacity: show ? 1 : 0,
          transition: 'opacity 0.2s ease',
        }}
      />
    </span>
  );
}

function Button({
  className,
  variant = "default",
  size = "default",
  loading = false,
  children,
  onClick,
  disabled,
  ...props
}: ButtonPrimitive.Props & VariantProps<typeof buttonVariants> & { loading?: boolean }) {
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);
  const [hovered, setHovered] = useState(false);
  const timerRef = useRef(0);

  const addRipple = useCallback((e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = performance.now();
    setRipples((prev) => [...prev, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      setRipples([]);
    }, 450);
  }, []);

  const handleClick = useCallback(
    (e: MouseEvent<HTMLButtonElement>) => {
      addRipple(e);
      onClick?.(e as unknown as Parameters<NonNullable<typeof onClick>>[0]);
    },
    [addRipple, onClick]
  );

  return (
    <ButtonPrimitive
      data-slot="button"
      className={cn(
        buttonVariants({ variant, size, className }),
        "transition-all duration-100 ease-out active:scale-[0.93]"
      )}
      onClick={handleClick}
      disabled={disabled || loading}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      {...props}
    >
      <ShimmerOverlay show={loading || (hovered && variant !== 'ghost' && variant !== 'link' && variant !== 'outline')} variant={variant!} />
      {loading && <Spinner />}
      <span className={cn("inline-flex items-center gap-1.5", loading && "opacity-60")}>{children}</span>
      <Ripple ripples={ripples} variant={variant!} />
    </ButtonPrimitive>
  );
}

export { Button, buttonVariants };
