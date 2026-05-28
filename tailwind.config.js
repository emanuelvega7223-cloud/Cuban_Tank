/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './index.html',
    './privacy.html',
    './terms.html',
  ],
  theme: {
    extend: {
      colors: {
        ink:    '#0B0B0C',
        ink2:   '#141416',
        ink3:   '#1E1E22',
        paper:  '#FFFFFF',
        paper2: '#141416',
        rule:   '#26262A',
        mute:   '#9A9A9F',
        lime:   '#E5283D',
        lime2:  '#B81626',
        cream:  '#1A1A1D',
      },
      fontFamily: {
        display: ['"Bricolage Grotesque"', 'system-ui', 'sans-serif'],
        serif:   ['"Instrument Serif"', 'Georgia', 'serif'],
        sans:    ['Geist', 'system-ui', 'sans-serif'],
        mono:    ['"Geist Mono"', 'ui-monospace', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.045em',
        ultra: '-0.06em',
      },
      boxShadow: {
        'diffuse': '0 30px 60px -30px rgba(11,11,12,0.18), 0 8px 24px -12px rgba(11,11,12,0.10)',
        'inner-edge': 'inset 0 1px 0 rgba(255,255,255,0.12), inset 0 -1px 0 rgba(0,0,0,0.25)',
        'inner-edge-light': 'inset 0 1px 0 rgba(255,255,255,0.7), inset 0 -1px 0 rgba(11,11,12,0.06)',
      },
      borderRadius: {
        '4xl': '2.5rem',
        '5xl': '3rem',
      },
    },
  },
  plugins: [],
};
