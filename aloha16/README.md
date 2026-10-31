# Aloha 16: new website

A one-page replacement for the current www.aloha16.co.za. Plain HTML, CSS and
a little JavaScript: no build step, no plugins, no database. It works on any
web host, including the PHP host the current site runs on.

| File | What it is |
|---|---|
| `index.html` | The whole site |
| `styles.css`, `site.js` | Look and behaviour |
| `fonts/` | Barlow and Barlow Condensed (free licence, `fonts/OFL.txt`) |
| `img/` | **Photos go here** (see below) |
| `.htaccess` | Sends the old `.php` page addresses to the right part of the new page |
| `robots.txt`, `sitemap.xml`, `favicon.svg` | For Google and the browser tab |
| `DESIGN-NOTES.md` | Why it looks the way it does |

To preview it on a computer: open a terminal in this folder, run
`python3 -m http.server`, and visit http://localhost:8000.

---

## 1. Add the photos

Until a photo is added, its spot shows a blue panel that says
"Photo to come: …". Drop a JPG in with **exactly** this name and it appears;
nothing else needs changing.

| File name | What to show |
|---|---|
| `img/hero.jpg` | The best photo you have: the deck and pool looking out to sea. Also the preview picture when the link is shared on WhatsApp/Facebook. |
| `img/gallery/pool-deck.jpg` | The rim-flow pool on the deck (shown biggest) |
| `img/gallery/view-from-deck.jpg` | The view from the deck |
| `img/gallery/beach.jpg` | The beach in front of the house |
| `img/gallery/lounge.jpg` | The open-plan lounge (shown tall: an upright photo works best) |
| `img/gallery/kitchen.jpg` | The kitchen |
| `img/gallery/dining.jpg` | The dining table |
| `img/gallery/bedroom-king.jpg` | One of the king bedrooms (shown wide) |
| `img/gallery/bedroom-bunks.jpg` | A bedroom with the queen bed and bunks |
| `img/gallery/outdoor-shower.jpg` | A private outdoor shower |
| `img/gallery/cottage.jpg` | The cottage |
| `img/gallery/braai.jpg` | The braai area |

Size: about 1600px on the long side, saved at around 80% quality (roughly
200–400 KB each). Phone photos straight off the camera are far bigger than
that, so resize them first or the page will load slowly on a weak signal.

If a photo isn't what its line says, change the matching `alt="…"` text in
`index.html` too. That's what screen readers and Google read.

## 2. Confirm these facts before it goes live

Everything on the page comes from the current aloha16.co.za or from the
house's listings on booking sites. Where they disagree, the page follows
aloha16.co.za, but these need the owner's yes or no:

| On the page | Says | Why check |
|---|---|---|
| Sleeps | **Up to 18** | aloha16.co.za says 18. Some agents say 16 maximum (cottage only if the total stays at 16); one says the beds sleep 20. If it's 16, change "18" in `index.html` (hero, meta description, form `data-max-guests`, the adults `max`) |
| Bed layout | Bedrooms 1–3 extra-length king; 4 and 5 queen + two bunks; cottage two singles | From one agent listing only |
| Deposit | 60% when you book | aloha16.co.za says 60%; agents say 50% (maybe their own terms) |
| Minimum stay | 7 nights in high season | From aloha16.co.za; agents mention 2–5 nights in low season |
| Staff tip | Cash per housekeeper per day, "your quote shows the amount" | Agents quote R70 and R140, so no figure is shown |
| Wi-Fi | "Wi-Fi" | A guest review said it doesn't reach the downstairs rooms |
| Braai | Tools **and charcoal** provided | From one agent listing |
| GPS | -26.727559, 32.899866 | aloha16.co.za uses this; the old directions PDF says -26.734948, 32.899933. Check which one drops a pin on the house |
| Drive time | "About an hour from the Kosi Bay border" | Listings say 40 minutes to an hour |
| Tyre pressure | 1.2 to 1.5 bar | From an agent listing for the estate |
| WhatsApp | Uses 082 807 9334 | Confirm that number is on WhatsApp |
| Children under 6 | Not mentioned | One agent says under-6s aren't accepted. Add to House rules if that's the owner's rule |
| 2.25% estate admin fee | Not mentioned | Agents add it; unclear whether direct bookings pay it |

The **reviews** section has two "Review to come" panels. Paste in real guest
reviews (with permission, first name and month of stay); never write them.

## 3. Go live

1. Back up the current site from the hosting control panel.
2. Upload the *contents* of this folder (including `.htaccess`, a hidden file)
   to the web root, next to or instead of the old `.php` files.
3. Keep `directions.pdf` on the server if other sites link to it.
4. Test the old addresses: `/photo-gallery.php`, `/rates.php`, `/location.php`
   and the rest should land on the matching section of the new page.
5. In Google Search Console, submit `https://www.aloha16.co.za/sitemap.xml`.
6. Update the Google Business Profile with the photos and the same rates and
   rules, so the two say the same thing.

## What changed from the current site

- Eight separate `.php` pages become one page that scrolls, with the main
  action ("Check dates") always in reach, pinned to the bottom of the screen
  on phones.
- **Check dates** form: guests pick dates and a head count, and the site
  writes the WhatsApp or email message for them. It warns about the 7-night
  minimum and stops a group bigger than the house sleeps.
- **Getting here** as a roadbook: trip-meter distances, turn diagrams, the GPS
  with "Open in Google Maps" and "Copy GPS", and a **Print directions** button
  that prints one A4 sheet for the car.
- **Photos**: a proper grid that opens full size, with swipe and arrow keys.
- Fast and light: about 130 KB to download before photos (fonts plus
  compressed code), no third-party scripts or trackers.
- Built for Google: page title and description, a schema.org `LodgingBusiness`
  entry (address, GPS, phone, check-in times), sharing preview, sitemap, and
  redirects so the old pages keep their search rankings.
- Accessible: tested with axe-core (no issues), keyboard-friendly, readable
  contrast, respects reduced motion.

## Sources used for the facts

- [aloha16.co.za](https://www.aloha16.co.za/) pages: accommodation, rates,
  location, general information, contact, and the directions PDF (via search
  results; the site itself couldn't be opened from the build environment)
- [Up and Go: Aloha 16](https://upandgo.co.za/aloha-16/establishment)
- [Ponta Malongane Accommodation: Aloha 16](https://pontamalongane.com/property/aloha-16/)
- [GoBundu: Aloha 16](https://www.gobundu.com/aloha-16/establishment)
- [Accommodation Mozambique: Aloha 16](https://www.accommodationmozambique.co.za/maputo/ponta-mamoli/aloha-16/)
- [Where to Stay: Aloha 16](https://www.wheretostay.co.za/aloha-16-self-catering-accommodation-ponta-mamoli-mozambique)
- [LekkeSlaap: Aloha 16](https://www.lekkeslaap.co.za/accommodation/aloha-16/rates)
- [Instagram @alohasixteen_ponta_mamoli](https://www.instagram.com/alohasixteen_ponta_mamoli/)
