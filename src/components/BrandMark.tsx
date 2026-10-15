/** 서비스 로고(public/icon-mono.svg와 같은 도형). 색은 글자색(currentColor)을 따른다. */
export function BrandMark({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="32" cy="32" r="21" />
      <path d="M32 9 L37.4 26.6 L55 32 L37.4 37.4 L32 55 L26.6 37.4 L9 32 L26.6 26.6 Z" />
    </svg>
  )
}
