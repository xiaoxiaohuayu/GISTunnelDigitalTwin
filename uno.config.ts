import { defineConfig, presetWind3 } from 'unocss'

export default defineConfig({
  presets: [
    // Tailwind 3 / Windi CSS compatible utilities without global reset preflights,
    // keeping Element Plus and Cesium widget styles intact.
    presetWind3(),
  ],
  theme: {
    colors: {
      twin: {
        accent: '#6cbaff',
        violet: '#aa96ff',
        ink: '#eef5ff',
        text: '#cfe1f7',
        muted: '#9ec0e6',
        sub: '#8faed3',
        warn: '#ffd89c',
        danger: '#ffb4a9',
      },
    },
  },
  rules: [
    ['tabular', { 'font-variant-numeric': 'tabular-nums' }],
    ['bg-twin-glass', { background: 'var(--twin-glass-bg)' }],
    ['bg-twin-header', { background: 'var(--twin-glass-header)' }],
    ['bg-twin-dock', { background: 'var(--twin-glass-dock)' }],
    ['shadow-twin', { 'box-shadow': 'var(--twin-shadow)' }],
    ['backdrop-twin', { 'backdrop-filter': 'blur(22px) saturate(150%)', '-webkit-backdrop-filter': 'blur(22px) saturate(150%)' }],
    ['backdrop-twin-bar', { 'backdrop-filter': 'blur(20px) saturate(155%)', '-webkit-backdrop-filter': 'blur(20px) saturate(155%)' }],
  ],
  shortcuts: {
    'twin-dock': 'flex flex-col min-h-0 rounded-[14px] bg-twin-glass backdrop-twin border border-solid border-[var(--twin-border)] shadow-twin overflow-hidden pointer-events-auto',
    'twin-topbar': 'flex items-center justify-between flex-wrap gap-2.5 px-3 py-2 rounded-[12px] bg-twin-dock backdrop-twin-bar border border-solid border-[var(--twin-border-strong)] shadow-twin pointer-events-auto',
    'twin-card': 'rounded-[8px] bg-[#0e1c3a]/68 border border-solid border-[#78b6fc]/24',
    'twin-section-title': 'm-0 text-[12px] font-600 tracking-[0.05em] text-[#9ed0ff]',
    'twin-divider-b': 'border-0 border-b border-solid border-[#7cb6f8]/15',
  },
})
