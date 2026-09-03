export function stickySourcePin(
  sourceOffsets: readonly number[],
  scrollOffset: number,
  rowHeight: number
): { sourceIndex: number; translateY: number } | null {
  if (rowHeight <= 0 || sourceOffsets.length === 0) return null
  let sourceIndex = -1
  for (let i = 0; i < sourceOffsets.length; i++) {
    const offset = sourceOffsets[i]
    if (offset == null) break
    if (offset + rowHeight <= scrollOffset) sourceIndex = i
    else break
  }
  if (sourceIndex < 0) return null
  const next = sourceOffsets[sourceIndex + 1]
  let translateY = 0
  if (next != null) {
    const untilNext = next - scrollOffset
    if (untilNext < rowHeight) translateY = untilNext - rowHeight
  }
  if (translateY <= -rowHeight) return null
  return { sourceIndex, translateY }
}
