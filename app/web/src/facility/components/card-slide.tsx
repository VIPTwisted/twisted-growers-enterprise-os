/** Card width slider. Max is half the viewport so the card can be used as a page. */

export function cardMax() {
  if (typeof window === "undefined") return 720;
  return Math.max(480, Math.round(window.innerWidth * 0.5));
}

export function clampCardW(n: number, max = cardMax()) {
  return Math.min(max, Math.max(280, n));
}

export function CardSlide({ w, max, onW }: { w: number; max: number; onW: (n: number) => void }) {
  return (
    <label className="fac-card-slide">
      <span className="sr-only">Card width — drag to half the screen</span>
      <input title="Field"
        type="range"
        min={280}
        max={max}
        step={8}
        value={Math.min(w, max)}
        onInput={(e) => onW(Number((e.target as HTMLInputElement).value))}
        onChange={(e) => onW(Number(e.target.value))}
      />
      <em>{Math.round((Math.min(w, max) / max) * 100)}%</em>
    </label>
  );
}
