# Aloha 16: design notes

## Brief
A one-page site for Aloha 16, a whole-house, self-catering beach house on the
Aloha Estate at Ponta Mamoli, southern Mozambique. The people booking it are
organising a group (families, friends, up to 18) and usually driving up from
KwaZulu-Natal or Gauteng in a 4x4. One goal: get them to **check dates**
(WhatsApp first, email second). Everything else is there to answer the
questions that stop a booking: what the house has, what it costs, what the
rules are, and how on earth you get there.

## Reference site
**Not opened.** This session's network policy blocked every outside site
(including aloha16.co.za itself, Landdding, Whipsaw, Modulify and Wedoflow),
so no live reference was viewed and nothing was borrowed from one. Before the
next round, pick one Landdding *Travel* reference, open the live site, and
record three moves here.

Instead, the direction comes from the place's own vernacular:

1. **The rally roadbook.** The drive in (sand tracks, trip-meter resets, "turn
   right at the Aloha sign") is the most Ponta Mamoli thing about the stay. The
   directions are set as a roadbook: trip-meter box, tulip turn diagram, note.
   It is the one bold element on the page, and it prints on one A4 sheet.
2. **Road-sign type.** Barlow is drawn from California highway signage, so the
   condensed cut reads like a road marker for the house number and headings.
3. **Coordinates as a credential.** The GPS sits under the hero and in its own
   box under Getting here, because the guest will need it.

## Layout source
Own structure, following the guesthouse pointer in the design-resources skill:
hero, the house, photos, rates, getting here, good to know, reviews, check
dates. (No house-style mockups folder was available in this environment.)

## Icon set
Hand-drawn inline SVG, one style: 24px grid, 1.75 stroke, round caps and
joins. Phone, mail, pin, copy, print, chat bubble, camera, arrows. No brand
marks (the WhatsApp button uses a plain chat bubble and says "WhatsApp").

## Type
- **Barlow Condensed** 600 / 800: headings, the spec sheet, trip-meter numbers.
- **Barlow** 400 / 400 italic / 600: body text, labels, buttons.
- Self-hosted woff2 (`fonts/`), SIL Open Font License. No Google Fonts call,
  so no third-party request and nothing to declare for POPIA.
- Scale: 14 / 16 / 18 (body) / 21 / 24 / 28 / 36 / 48 / 72, with the hero name
  up to 168px.

## Palette
| Name | Hex | Use |
|---|---|---|
| Ink | `#10294A` | Text, header, dark sections (Indian Ocean at depth) |
| Tide | `#1F6A86` | Links on light, photo placeholders |
| Foam | `#F5F7F6` | Page background (cool, not cream) |
| Mist | `#E4ECEC` | Reviews band |
| Dune | `#E8D6B6` | Getting here section (sand) |
| Sun | `#F2B705` | The only action colour, and the roadbook meter boxes |

Ink on Sun and Foam on Ink both pass WCAG AA by a wide margin; Sun is never
used for text on a light background.

## Checks done
- 1440, 1280 and 375px widths: no horizontal scroll; hero button above the fold
  on a 1280×720 laptop.
- 375px header: logo and Menu button only; the main action and WhatsApp/call
  live in a bottom dock, so nothing crowds the name.
- axe-core (WCAG 2 A/AA + best practice): 0 violations at desktop and phone.
- Keyboard: skip link, visible focus on every control, Escape closes the menu
  and photo viewer, arrow keys page through photos.
- `prefers-reduced-motion` turns off smooth scrolling and transitions.
- Print: "Print directions" gives a one-page A4 sheet with the roadbook, GPS,
  address and phone number.

## Round 2: ui-ux-pro-max review
The skill's design-system search for hospitality confirmed the navy + gold
direction. Its serif pairing (Playfair Display SC / Karla), aurora gradients
and scroll reveals on every section were not adopted: they would undo the
road-sign identity and add motion with no meaning. Changes made from its UX
rules:

- **Forms:** errors sit under their own field (`aria-describedby`), the
  first invalid field takes focus, fields are checked when the guest leaves
  them, check-in/out times show as helper text, −/+ steppers for guests, and
  a confirmation appears once the WhatsApp/email message is ready.
- **One primary action on screen:** the header "Check dates" and the phone
  dock wait until the hero's button has scrolled away; the dock also steps
  aside while the form is showing.
- **Navigation:** the section on screen is marked in the menu.
- **Scannability:** amenity icon list in The house; icons on the Good to
  know headings (same 1.75-stroke set).
- **Motion, kept to cause and effect:** roadbook rows arrive in order once;
  the photo viewer and phone menu open with a short fade; none of it runs
  under reduced motion, and print shows the final state.
- **Details:** the hero name is set on one line to the width of its column
  at every size; press feedback and `touch-action: manipulation` on
  controls; the lightbox uses `100dvh`.
- axe-core: 0 violations at 1440px and 375px (after animations settle).
