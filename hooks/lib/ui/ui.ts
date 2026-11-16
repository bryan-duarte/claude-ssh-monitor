import type { Elements, EngineInterface as Engine, RenderElement, RenderSurface } from 'claude-code'

type UiOf<S extends RenderSurface> = { surface: S; el: Elements[S]; root: string }

export type Ui = { [S in RenderSurface]: UiOf<S> }[RenderSurface]

export type Tree = RenderElement | null | false | undefined | string

type Drawable = { surface: RenderSurface; component: string }

export function uiOf($: Engine, e: Drawable): Ui {
  const el = $.ui.resolve(e as Parameters<Engine['ui']['resolve']>[0])
  return { surface: e.surface, el, root: $.plugin.root } as Ui
}
