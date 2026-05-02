import frappeUiPreset from 'frappe-ui/tailwind';

export default {
  presets: [frappeUiPreset],
  content: [
    './src/renderer/**/*.{vue,js,ts,jsx,tsx}',
    './src/preload/**/*.{js,ts}',
    './node_modules/frappe-ui/src/**/*.{vue,js,ts}',
  ],
};
