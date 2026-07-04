declare module '*.vue' {
  import type { DefineComponent } from 'vue';

  const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
  export default component;
}

interface Window {
  readonly frappeLocal?: import('@frappe-local/shared/core').RendererBridge;
}

declare const __APP_VERSION__: string;