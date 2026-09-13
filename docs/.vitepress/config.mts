import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitepress'
// Bundle the preset: this release ships its Node entry as raw TypeScript.
import { defineDocsConfig } from '../../node_modules/frappe-ui/vitepress/index.node.ts'
import tailwindcss from 'tailwindcss'
import autoprefixer from 'autoprefixer'

const preset = defineDocsConfig({
  rootDir: fileURLToPath(new URL('..', import.meta.url)),
  name: 'Frappe Local',
  description: 'Desktop app for managing local Frappe benches and sites.',
  githubUrl: 'https://github.com/lubusIN/frappe-local',
  head: [
    ['link', { rel: 'icon', type: 'image/svg+xml', href: '/logo.svg' }],
  ],
  sidebar: [
    {
      text: 'Get started',
      items: [
        { text: 'Overview', link: '/user-guide/features' },
        { text: 'Installation', link: '/user-guide/installation' },
        { text: 'First steps', link: '/user-guide/how-to-use' },
      ],
    },
    {
      text: 'Using the app',
      items: [
        { text: 'Everyday workflows', link: '/user-guide/daily-work' },
        { text: 'Benches and sites', link: '/user-guide/benches-and-sites' },
        { text: 'Managing apps', link: '/user-guide/apps' },
        { text: 'Activity and logs', link: '/user-guide/activity' },
        { text: 'Settings', link: '/user-guide/settings' },
        { text: 'Troubleshooting', link: '/user-guide/troubleshooting' },
      ],
    },
    {
      text: 'Contributing',
      items: [
        { text: 'Architecture', link: '/technical/architecture' },
        { text: 'Local development', link: '/technical/development' },
        { text: 'Testing', link: '/technical/testing' },
      ],
    },
    {
      text: 'App internals',
      items: [
        { text: 'Lifecycle and recovery', link: '/technical/lifecycle' },
        { text: 'IPC and tasks', link: '/technical/ipc-and-tasks' },
        { text: 'Renderer state', link: '/technical/renderer-state' },
        { text: 'Podman runtime', link: '/technical/podman' },
        { text: 'Caddy routing', link: '/technical/caddy' },
        { text: 'Storage and data', link: '/technical/runtime-and-data' },
        { text: 'App installation', link: '/technical/app-internals' },
        { text: 'Commands and editor', link: '/technical/execution-and-editor' },
        { text: 'Diagnostics and logs', link: '/technical/diagnostics-and-logging' },
      ],
    },
    {
      text: 'Build and release',
      items: [
        { text: 'Bundling', link: '/technical/bundling' },
        { text: 'Releasing and updates', link: '/technical/releasing' },
      ],
    },
  ],
})

export default defineConfig({
  ...preset,
  // Keep the existing docs URLs and directory structure.
  srcDir: '.',
  vite: {
    ...preset.vite,
    css: {
      postcss: {
        plugins: [
          tailwindcss({
            config: fileURLToPath(new URL('./tailwind.config.mjs', import.meta.url)),
          }),
          autoprefixer(),
        ],
      },
    },
  },
})
