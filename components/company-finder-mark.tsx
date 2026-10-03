import type { SVGProps } from "react";

export function CompanyFinderMark(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 40 40" fill="none" aria-hidden="true" {...props}>
      <path
        d="M20 3 24.5 15.5 37 20 24.5 24.5 20 37 15.5 24.5 3 20 15.5 15.5 20 3Z"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinejoin="round"
      />
      <circle cx="20" cy="20" r="3.5" fill="currentColor" />
    </svg>
  );
}
