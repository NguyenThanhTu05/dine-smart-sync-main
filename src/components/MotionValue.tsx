import { type ReactNode } from 'react'

// Render the authoritative value immediately; never interpolate financial amounts.
export function MotionValue({ value, children }: { value: string | number; children?: ReactNode }) {
  return <span key={value} className="motion-value">{children ?? value}</span>
}

export function SuccessMark() {
  return <svg className="motion-success" width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="1.7"/>
    <path d="m7 12 3 3 7-7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
}
