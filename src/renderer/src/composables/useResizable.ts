import { ref, watch, type Ref } from 'vue'

export interface PanelConfig {
  defaultSize: number
  minSize: number
  maxSize: number
}

export function useResizable(
  containerRef: Ref<HTMLElement | null>,
  panels: Ref<PanelConfig[]>,
  direction: 'horizontal' | 'vertical' = 'horizontal'
) {
  // sizes 存储每个面板的 flex-grow 比例值
  const sizes = ref<number[]>(panels.value.map((p) => p.defaultSize))
  const dragHandleIndex = ref<number | null>(null)
  let startPos = 0
  let startSizes: number[] = []
  let cachedPanels: PanelConfig[] = [...panels.value]

  watch(panels, (newPanels) => {
    cachedPanels = [...newPanels]
    if (sizes.value.length !== newPanels.length) {
      sizes.value = newPanels.map((p) => p.defaultSize)
    }
  })

  function getPos(e: MouseEvent | TouchEvent): number {
    if ('touches' in e) {
      return direction === 'horizontal' ? e.touches[0].clientX : e.touches[0].clientY
    }
    return direction === 'horizontal' ? e.clientX : e.clientY
  }

  function onPointerDown(index: number, e: MouseEvent | TouchEvent): void {
    e.preventDefault()
    dragHandleIndex.value = index
    startPos = getPos(e)
    startSizes = [...sizes.value]
    document.addEventListener('mousemove', onPointerMove)
    document.addEventListener('mouseup', onPointerUp)
    document.addEventListener('touchmove', onPointerMove, { passive: false })
    document.addEventListener('touchend', onPointerUp)
  }

  function onPointerMove(e: MouseEvent | TouchEvent): void {
    if (dragHandleIndex.value === null) return
    const i = dragHandleIndex.value
    const container = containerRef.value
    if (!container) return

    const rect = container.getBoundingClientRect()
    const totalWidth = rect.width

    // 估算当前 flex-basis:0 下，每单位比例值对应多少像素
    const totalRatio = startSizes.reduce((a, b) => a + b, 0)
    if (totalRatio <= 0) return

    const currentPos = getPos(e)
    const delta = currentPos - startPos

    // 计算左面板像素宽度变化对应的比例值变化
    // 在 flex-basis:0 下，面板宽度 = (flex-grow / sum(flex-grow)) * (container - handles)
    // 但我们简化为：delta / (totalWidth / totalRatio)
    const unitWidth = totalWidth / totalRatio
    if (unitWidth <= 0) return

    const deltaRatio = delta / unitWidth

    const newSizes = [...startSizes]

    // 左面板新大小
    const leftCandidate = Math.max(
      cachedPanels[i].minSize,
      Math.min(cachedPanels[i].maxSize, newSizes[i] + deltaRatio)
    )
    const actualDelta = leftCandidate - newSizes[i]
    newSizes[i] = leftCandidate

    // 右面板补偿
    const rightIndex = i + 1
    if (rightIndex < cachedPanels.length) {
      newSizes[rightIndex] = Math.max(
        cachedPanels[rightIndex].minSize,
        Math.min(cachedPanels[rightIndex].maxSize, newSizes[rightIndex] - actualDelta)
      )
      // 如果右面板被 clamp，重新校准左面板
      const rightActualDelta = newSizes[rightIndex] - (startSizes[rightIndex] - actualDelta)
      newSizes[i] = Math.max(
        cachedPanels[i].minSize,
        Math.min(cachedPanels[i].maxSize, newSizes[i] + rightActualDelta)
      )
    }

    sizes.value = newSizes
  }

  function onPointerUp(): void {
    dragHandleIndex.value = null
    document.removeEventListener('mousemove', onPointerMove)
    document.removeEventListener('mouseup', onPointerUp)
    document.removeEventListener('touchmove', onPointerMove)
    document.removeEventListener('touchend', onPointerUp)
  }

  function getPanelStyle(index: number): Record<string, string> {
    const size = sizes.value[index]
    if (size === undefined) return { display: 'none' }
    return {
      flex: `${Math.max(size, 0)} 1 0%`,
      overflow: 'hidden',
      minWidth: '0'
    }
  }

  return {
    sizes,
    dragHandleIndex,
    onPointerDown,
    getPanelStyle
  }
}
