import type { Elements, EngineInterface as Engine, RenderElement, RenderNode, RenderSurface } from 'claude-code'

type UiOf<S extends RenderSurface> = { surface: S; el: Elements[S]; root: string }

export type Ui = { [S in RenderSurface]: UiOf<S> }[RenderSurface]

export type Tree = RenderElement | null | false | undefined | string

const DESKTOP_TEXT_SIZE = 'caption'

type Drawable = { surface: RenderSurface; component: string }

export function uiOf($: Engine, e: Drawable): Ui {
  const el = $.ui.resolve(e as Parameters<Engine['ui']['resolve']>[0])
  return { surface: e.surface, el, root: $.plugin.root } as Ui
}

function monospaced(node: RenderNode): RenderNode {
  if (typeof node === 'string') return node
  const withChildren =
    'children' in node && Array.isArray(node.children) ? { ...node, children: node.children.map(monospaced) } : node
  if (withChildren.type !== 'Text') return withChildren as RenderElement
  return { ...withChildren, props: { size: DESKTOP_TEXT_SIZE, ...withChildren.props, mono: true } } as RenderElement
}

export function forSurface(ui: Ui, tree: RenderElement): RenderElement {
  return ui.surface === 'terminal' ? tree : (monospaced(tree) as RenderElement)
}
