# Design: Focused

The locked system. Change it on purpose; the file is the rule.

## System
- Style: achromatic ledger (tasteskill app style), light
- Ground: blue-grey `#f2f4f7`; white cards with a 1px `#e6e8ec` border, 12px radius, no shadows
- Canvas: centred 1100px column, 16px gap.
- Home (`#/`): one card per activity, 3 across (2 on tablet, 1 on phone): name, today's time, week and streak, a 28-day strip in the heat ramp; a dashed New activity card last.
- Activity (`#/<id>`, `#/<id>/<yyyy-mm-dd>`): 12 columns. Row 1: timer 8 + figures 4. Row 2: calendar 8 + day log 4. Rename and Delete sit in the header.
- Type: Geist only. Timer at weight 200, `clamp(72px, 10vw, 136px)`; figures 30px/400; titles 16-20px/600; body 14px; meta 12px.

## Tokens
`tokens.css` is the source of truth.

Colour roles: chrome is ink and greys only. The one hue, `--accent: #1d5fbf`, goes on data: the calendar heat ramp (accent mixed into white at 14, 34, 68 and 100%) and the running-state dot. The primary button is near-black.

## Controls
- Primary: near-black pill, 48px tall (full width under 40rem)
- Secondary: 32px bordered control, 8px radius; month arrows are icon-only with `aria-label`
- Row action: grey text, turns red on hover

## Focus mode
While a session runs, a full-screen near-black view (`#0b0b0c`) takes over: label, timer at weight 200 `clamp(88px, 19vw, 260px)`, a white Pause pill, today's total at the foot. Paused: timer greys, Resume + Finish. Each running segment is saved as its own session.

## Motion
Feedback only: press scale, hover tone, a slow pulse on the running dot. Reduced motion stops all of it.
