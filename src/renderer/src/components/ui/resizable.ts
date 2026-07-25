import type { Component } from 'vue'
import { SplitterGroup, SplitterPanel, SplitterResizeHandle } from 'reka-ui'

export const ResizablePanelGroup: Component = SplitterGroup as unknown as Component
export const ResizablePanel: Component = SplitterPanel as unknown as Component
export const ResizableHandle: Component = SplitterResizeHandle as unknown as Component
