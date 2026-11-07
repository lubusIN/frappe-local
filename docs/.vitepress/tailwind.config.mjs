import { fileURLToPath } from 'node:url'
import frappeUiPreset, { content as frappeUiContent } from 'frappe-ui/tailwind'

export default {
  // Espresso colors, typography, spacing, radii, and effects come from Frappe UI.
  presets: [frappeUiPreset],
  content: [
    fileURLToPath(new URL('../**/*.md', import.meta.url)),
    fileURLToPath(new URL('./theme/**/*.{vue,js,ts}', import.meta.url)),
    fileURLToPath(new URL('../../node_modules/frappe-ui/vitepress/**/*.{vue,js,ts}', import.meta.url)),
    ...frappeUiContent,
  ],
}
