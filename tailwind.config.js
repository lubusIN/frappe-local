import frappeUiPreset, { content as frappeUiContent } from 'frappe-ui/tailwind';

export default {
  presets: [frappeUiPreset],
  content: [
    './src/renderer/**/*.{vue,js,ts,jsx,tsx}',
    './src/main/preload.ts',
    ...frappeUiContent,
  ],
};
