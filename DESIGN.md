# Design: Focused

The locked system. Change it on purpose; the file is the rule.

## System
- Style: achromatic ledger (tasteskill app style), light
- Ground: blue-grey `#f2f4f7`; white cards with a 1px `#e6e8ec` border, 12px radius, no shadows
- Canvas: centred 1100px column, 16px gap.
- Home (`#/`): one card per activity, 3 across (2 on tablet, 1 on phone): name, today's time, week and streak, a 28-day strip in the heat ramp; a dashed New activity card last.
- Activity (`#/<id>`, `#/<id>/<yyyy-mm-dd>`): 12 columns. Row 1: timer 8 + figures 4. Row 2: calendar 8 + day log 4. Rename and Delete sit in the header.
- Type: Geist only. Timer at weight 200, `clamp(72px, 10vw, 136px)`; figures 30px/400; titles 16-20px/600; body 14px; meta 12px.

## Logo
A 2.5px ink ring (r 12 on a 32 grid) around a blue dot (r 4.5, `--accent`): the running-session dot, held in focus. `logo.svg` is the mark; `favicon.svg` switches the ring to light on dark browser chrome; `apple-touch-icon.png` sets it on the ground colour. In the app it sits beside the title on the home screen only.

## Tokens
`tokens.css` is the source of truth.

Colour roles: chrome is ink and greys only. The one hue, `--accent: #1d5fbf`, goes on data: the calendar heat ramp (accent mixed into white at 14, 34, 68 and 100%) and the running-state dot. The primary button is near-black.

## Controls
- Primary: near-black pill, 48px tall (full width under 40rem)
- Secondary: 32px bordered control, 8px radius; month arrows are icon-only with `aria-label`
- Row action: grey text, turns red on hover

## Focus mode
While a session runs, a full-screen view on the app's ground (`#f2f4f7`) takes over: a label ("Since 18:05" or "Paused", no activity name), the timer at weight 200 `clamp(88px, 19vw, 260px)` in ink, quiet outlined Pause/Resume and a text Finish, today's total at the foot. Paused: the time turns grey. Each running segment is saved as its own session.

## Motion
Feedback only: press scale, hover tone, a slow pulse on the running dot. Reduced motion stops all of it.
