import type { SVGProps } from "react";

type IconProps = SVGProps<SVGSVGElement> & { size?: number };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
});

/** Four corner brackets — the extension's mark: a frame around what it's about to analyze. */
export function BrandMark({ size = 20, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M3 8V4a1 1 0 0 1 1-1h4" />
      <path d="M16 3h4a1 1 0 0 1 1 1v4" />
      <path d="M21 16v4a1 1 0 0 1-1 1h-4" />
      <path d="M8 21H4a1 1 0 0 1-1-1v-4" />
    </svg>
  );
}

export function IconCopy({ size = 15, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="8.5" y="8.5" width="12" height="12" rx="2" />
      <path d="M15.5 8.5V5.5a2 2 0 0 0-2-2H5.5a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h3" />
    </svg>
  );
}

export function IconCheck({ size = 15, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M4 12.5 9.5 18 20 6" />
    </svg>
  );
}

export function IconSignOut({ size = 16, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </svg>
  );
}

export function IconImage({ size = 34, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <rect x="3" y="4" width="18" height="16" rx="2.5" />
      <circle cx="8.5" cy="10" r="1.6" />
      <path d="M21 16.5l-5.2-5.2a1.8 1.8 0 0 0-2.5 0L4 20" />
    </svg>
  );
}

export function IconAlert({ size = 30, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 8v5" />
      <path d="M12 16.2v.1" />
    </svg>
  );
}

export function IconClock({ size = 30, ...props }: IconProps) {
  return (
    <svg {...base(size)} {...props}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.2l3.6 2" />
    </svg>
  );
}
