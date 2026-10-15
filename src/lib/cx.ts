/** className 조합: 거짓값은 건너뛴다. */
export function cx(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ')
}
