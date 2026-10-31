import { ref } from 'vue'

export function useDraggableOverlay(ignoreInteractiveTargets = false) {
  const offset = ref({ x: 0, y: 0 })
  const isDragging = ref(false)
  let pointerId: number | null = null
  let startPoint = { x: 0, y: 0 }
  let startOffset = { x: 0, y: 0 }
  let startBounds = { left: 0, top: 0, right: 0, bottom: 0 }
  let parentBounds = { left: 0, top: 0, right: 0, bottom: 0 }
  let moved = false

  const positionStyle = () => ({
    transform: `translate3d(${offset.value.x}px, ${offset.value.y}px, 0)`,
  })

  const onPointerDown = (event: PointerEvent) => {
    if (event.button !== 0 || pointerId !== null) return
    if (
      ignoreInteractiveTargets &&
      event.target instanceof Element &&
      event.target.closest('button, a, input, select, textarea')
    ) return

    const handle = event.currentTarget as HTMLElement
    const overlay = handle.closest<HTMLElement>('[data-draggable-overlay]') ?? handle
    const bounds = overlay.getBoundingClientRect()
    const parent = overlay.parentElement?.getBoundingClientRect() ?? bounds
    pointerId = event.pointerId
    startPoint = { x: event.clientX, y: event.clientY }
    startOffset = { ...offset.value }
    startBounds = { left: bounds.left, top: bounds.top, right: bounds.right, bottom: bounds.bottom }
    parentBounds = { left: parent.left, top: parent.top, right: parent.right, bottom: parent.bottom }
    moved = false
    handle.setPointerCapture(event.pointerId)
  }

  const onPointerMove = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return
    const deltaX = event.clientX - startPoint.x
    const deltaY = event.clientY - startPoint.y
    if (!moved && Math.hypot(deltaX, deltaY) < 4) return

    moved = true
    isDragging.value = true
    const minX = parentBounds.left + 8 - startBounds.left
    const maxX = parentBounds.right - 8 - startBounds.right
    const minY = parentBounds.top + 8 - startBounds.top
    const maxY = parentBounds.bottom - 8 - startBounds.bottom
    offset.value = {
      x: startOffset.x + Math.min(Math.max(deltaX, minX), maxX),
      y: startOffset.y + Math.min(Math.max(deltaY, minY), maxY),
    }
  }

  const onPointerUp = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return
    pointerId = null
    isDragging.value = false
  }

  const onPointerCancel = (event: PointerEvent) => {
    if (event.pointerId !== pointerId) return
    pointerId = null
    isDragging.value = false
    moved = false
  }

  const consumeDragClick = () => {
    if (!moved) return false
    moved = false
    return true
  }

  return {
    positionStyle,
    isDragging,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    onPointerCancel,
    consumeDragClick,
  }
}
