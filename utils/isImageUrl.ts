// True when a store/product "image" field holds a real image reference —
// either a remote URL (http/https) or an app-hosted path (/img/...) — rather
// than an emoji placeholder like "🍽️". Used to decide whether to render an
// <img> or fall back to the emoji tile.
export function isImageUrl(value: unknown): value is string {
  return typeof value === 'string' && (/^https?:\/\//i.test(value) || value.startsWith('/'));
}
