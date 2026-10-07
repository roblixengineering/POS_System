'use client';
export function PrintButton() {
  return <button type="button" className="noprint" onClick={() => window.print()}>Print receipt</button>;
}
