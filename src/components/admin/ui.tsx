import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";

export function AdminPageHeader({
  eyebrow,
  title,
  subtitle,
  icon,
  actions,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  icon?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-col gap-4 border-b border-white/[0.06] pb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex items-start gap-4">
        {icon && (
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#FF3B3B]/30 bg-[#FF3B3B]/10 text-[#FF3B3B]">
            {icon}
          </span>
        )}
        <div>
          {eyebrow && (
            <div className="mb-1 text-[11px] font-bold uppercase tracking-[0.25em] text-[#FF3B3B]">
              {eyebrow}
            </div>
          )}
          <h1 className="font-display text-2xl font-bold text-white sm:text-3xl">{title}</h1>
          {subtitle && <p className="mt-1.5 max-w-xl text-sm text-white/45">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Panel({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={`rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 sm:p-6 ${className}`}
    >
      {children}
    </div>
  );
}

export function PanelTitle({
  icon,
  title,
  sub,
  right,
}: {
  icon?: ReactNode;
  title: string;
  sub?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <span className="shrink-0 text-[#FF3B3B]">{icon}</span>}
        <div className="min-w-0">
          <h2 className="font-display text-base font-bold text-white">{title}</h2>
          {sub && <p className="mt-0.5 text-xs text-white/40">{sub}</p>}
        </div>
      </div>
      {right && <div className="flex shrink-0 items-center gap-2">{right}</div>}
    </div>
  );
}

export function EmptyNotice({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-white/[0.08] bg-white/[0.01] px-6 py-14 text-center">
      {icon && <span className="text-white/25">{icon}</span>}
      <p className="max-w-sm text-sm text-white/40">{children}</p>
    </div>
  );
}

export function AdminButton({
  children,
  onClick,
  type = "button",
  variant = "primary",
  disabled,
  className = "",
}: {
  children: ReactNode;
  onClick?: () => void;
  type?: "button" | "submit";
  variant?: "primary" | "ghost" | "danger";
  disabled?: boolean;
  className?: string;
}) {
  const styles =
    variant === "primary"
      ? "border-transparent bg-gradient-to-r from-[#FF3B3B] to-[#C72C2C] text-white hover:brightness-110"
      : variant === "danger"
        ? "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20"
        : "border-white/10 bg-white/[0.04] text-white/70 hover:border-white/25 hover:text-white";
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      // shrink-0 + nowrap: never let a flex row squeeze the button or wrap its
      // label onto a second line (that is what made buttons look crooked).
      className={`inline-flex h-10 shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg border px-4 text-[12px] font-bold uppercase leading-none tracking-[0.12em] transition-[filter,background-color,border-color,color,transform] duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B3B]/60 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:shrink-0 ${styles} ${className}`}
    >
      {children}
    </button>
  );
}

/** Square icon-only action button (edit, delete, confirm, reject …). */
export function AdminIconButton({
  children,
  label,
  onClick,
  tone = "neutral",
  disabled,
  busy,
}: {
  children: ReactNode;
  /** Accessible name + tooltip. */
  label: string;
  onClick?: () => void;
  tone?: "neutral" | "success" | "danger" | "dangerSolid";
  disabled?: boolean;
  /** Shows a spinner instead of the icon. */
  busy?: boolean;
}) {
  const tones = {
    neutral: "border-white/10 bg-white/[0.03] text-white/60 hover:border-white/25 hover:text-white",
    success: "border-emerald-500/30 bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/20",
    danger: "border-red-500/30 bg-red-500/10 text-red-300 hover:bg-red-500/20",
    dangerSolid: "border-red-500 bg-red-500 text-white hover:bg-red-600",
  } as const;
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      onClick={onClick}
      disabled={disabled || busy}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B3B]/60 enabled:active:scale-[0.96] disabled:cursor-not-allowed disabled:opacity-50 [&_svg]:h-4 [&_svg]:w-4 [&_svg]:shrink-0 ${tones[tone]}`}
    >
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
      ) : (
        children
      )}
    </button>
  );
}

/** Accessible on/off switch. The whole row (track + label) is clickable. */
export function AdminToggle({
  label,
  description,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  description?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className="group flex w-full items-center justify-between gap-4 rounded-lg border border-white/10 bg-black/30 px-3.5 py-2.5 text-left transition-colors hover:border-white/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#FF3B3B]/60 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-white/85">{label}</span>
        {description && <span className="mt-0.5 block text-xs text-white/35">{description}</span>}
      </span>
      {/* Track: the knob is anchored with left-0.5 and only translated, so it
          can never drift out of the rail. */}
      <span
        aria-hidden="true"
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 ${
          checked ? "bg-[#FF3B3B]" : "bg-white/15"
        }`}
      >
        <span
          className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </button>
  );
}

export function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: ReactNode;
  hint?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[11px] font-bold uppercase tracking-[0.14em] text-white/50">
        {label}
      </span>
      {children}
      {hint && <span className="mt-1 block text-xs text-white/30">{hint}</span>}
    </label>
  );
}

export const inputClass =
  "w-full rounded-lg border border-white/10 bg-black/30 px-3.5 py-2.5 text-sm text-white placeholder:text-white/25 outline-none transition-colors focus:border-[#FF3B3B]/50";

// Styled <select>: hides the dull native chrome, adds a red-tinted custom
// caret and forces dark, readable option rows across browsers.
export const selectClass =
  "admin-select-caret w-full cursor-pointer appearance-none rounded-lg border border-white/10 bg-black/30 px-3.5 py-2.5 pr-10 text-sm text-white outline-none transition-colors hover:border-white/20 focus:border-[#FF3B3B]/50 [&>option]:bg-[#0C0C0D] [&>option]:text-white";

export function NoAccess({ children }: { children?: ReactNode }) {
  return (
    <EmptyNotice
      icon={
        <svg viewBox="0 0 24 24" fill="none" className="h-8 w-8" stroke="currentColor" strokeWidth={1.6}>
          <rect x="3" y="11" width="18" height="11" rx="2" />
          <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
      }
    >
      {children ?? "Dir fehlt die Berechtigung für diesen Bereich."}
    </EmptyNotice>
  );
}

export function ChipLink({ to, children }: { to: string; children: ReactNode }) {
  return (
    <Link
      to={to}
      className="text-[#FF3B3B] underline-offset-4 transition-colors hover:text-[#ff6a3d] hover:underline"
    >
      {children}
    </Link>
  );
}
