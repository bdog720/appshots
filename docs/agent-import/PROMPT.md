# Breezel agent import — screenshot set brief

You are preparing App Store / Google Play screenshots for the app in this repository. Produce a folder containing the app's screenshots **and** an `breezel.json` file describing how Breezel should present them. The user will drop that folder (or a zip of it) into Breezel via **Project menu → Import from agent…** and get a finished, editable project.

## 1. Research the app first

- **Name and promise:** read the README, `fastlane/metadata`, `app.json` / `app.config.*`, `Info.plist`, `pubspec.yaml`, and any store listing copy. Write down the one-sentence promise and the 5–10 features users care about most.
- **Brand color:** look in the Tailwind config, theme or design-token files, `Assets.xcassets/*.colorset`, `res/values/colors.xml`, or the SwiftUI / Compose / Material theme. Choose one primary hex for `brand.primary`.
- **Font:** find the app's typeface. If it is not in the font table below, pick the nearest by feel (geometric sans → Poppins or Montserrat, neutral sans → Inter, rounded → Nunito or Quicksand, serif → Lora or Playfair Display).
- **Tone:** match the voice of the app's existing copy.

## 2. Screenshots

- Use the screenshots this repository's tooling already captures. One screen per feature, realistic demo data, no debug banners, empty states, or personal information.
- Order matters: the strongest "hero" feature goes first, and the first two or three screens must sell the app on their own.
- Use 5–10 screens, portrait, at the device's native resolution (see the device tables).
- Save every image next to `breezel.json` with a unique filename (`01-home.webp`, `02-stats.webp`, …). PNG, JPEG and WebP are accepted, but prefer WebP (quality about 90) or high-quality JPEG over PNG: Breezel stores projects in the browser (about 4–5 MB in total), so a large set of PNGs may not save.

## 3. Copy rules

- **Headline:** 2–5 words, at most ~28 characters, benefit first ("Plan your week in seconds", not "Calendar screen"). Start with a verb where it reads naturally.
- **Highlight:** at most one phrase per headline, wrapped in `<mark>…</mark>`. Highlighted text keeps the headline's text color, so `brand.highlightColor` must contrast with the text color (at least 3:1) — or omit it and Breezel picks one.
- **Subheadline:** optional, at most ~60 characters, adds a concrete detail. Omit it rather than repeat the headline.
- Keep tone and tense consistent. Make no claims the repository can't back up (no "#1", awards, or prices unless they are real).
- Only this inline HTML is kept: `<b>`, `<strong>`, `<i>`, `<em>`, `<u>`, `<mark>`, `<br>`, plus `color` / `background-color` styles on `<span>` and `background-color` on `<mark>`. Everything else is removed. A newline becomes a line break.

## 4. Visual rules

- Choose **one** `brand.style` for the whole set. From `brand.primary` it picks the font, sizes, background and a readable text color. `brand.style` requires `brand.primary`; without it the style is ignored. Override (`brand.font`, `brand.background`, …) only when the repository gives you a reason.
- Give `layout` a rhythm: hero `bleed-bottom`, then alternate (for example `tilt-left` / `tilt-right`), `perspective` at most twice, never the same layout more than three times in a row.
- Keep one background across the set. Use a per-screen `background` only as a deliberate accent, and set that screen's `text.color` so text stays readable.
- The device and `exportSize` must be the same platform (an iPhone with an iPhone size, a Pixel with a Play phone size). One `breezel.json` describes one device family; make a separate folder for an iPad or Android set.
- Dark text on light backgrounds, light text on dark. Breezel warns about contrast failures.

## 5. Reference

### Styles (`brand.style`)

| style | look |
| --- | --- |
| `minimal` | Inter, calm sizes. Soft near-white tint of the brand color. Clean utility and productivity apps. |
| `bold` | Poppins, large type. Gradient from the brand color to a darker shade. Confident consumer apps. |
| `warm` | Nunito, rounded. Warm cream tint of the brand color. Wellness, food, community. |
| `playful` | Quicksand, largest type. Gradient from the brand color to a shifted hue. Kids, games, social. |
| `elegant` | Playfair Display serif. Deep, dark shade of the brand color. Finance, luxury, premium. |
| `editorial` | Lora serif. Deep, narrow dark gradient. Reading, news, journaling. |

### Layouts (`screens[].layout`, default `bleed-bottom`)

| layout | what it does |
| --- | --- |
| `centered` | Upright device in the middle, text above. Safe default for any screen. |
| `bleed-bottom` | Large upright device running off the bottom edge, text above. Strong hero layout. |
| `bleed-top` | Large device running off the top edge, text below. Use to break rhythm mid-set. |
| `float-center` | Smaller floating device with generous space. Good for dense screens that need air. |
| `tilt-left` | Device rotated 15° counter-clockwise, text above. Adds energy; alternate with tilt-right. |
| `tilt-right` | Device rotated 15° clockwise, text above. Adds energy; alternate with tilt-left. |
| `perspective` | 3D device turned toward the viewer, text above. Premium feel; use once or twice per set. |
| `float-bottom` | Small device low on the canvas, text above with room for a longer subheadline. |

### Devices (`device.id` and its valid `device.color` values)

#### iPhone

| device.id | device | native px | device.color |
| --- | --- | --- | --- |
| `iphone-17-pro-max` | iPhone 17 Pro Max | 1320×2868 | `cosmic-orange`, `deep-blue`, `silver` |
| `iphone-17-pro` | iPhone 17 Pro | 1206×2622 | `cosmic-orange`, `deep-blue`, `silver` |
| `iphone-17` | iPhone 17 | 1206×2622 | `black`, `white`, `lavender`, `sage`, `mist-blue` |
| `iphone-air` | iPhone Air | 1260×2736 | `space-black`, `cloud-white`, `light-gold`, `sky-blue` |
| `iphone-16-pro-max` | iPhone 16 Pro Max | 1320×2868 | `black`, `natural`, `desert`, `white` |
| `iphone-16-pro` | iPhone 16 Pro | 1206×2622 | `black`, `natural`, `desert`, `white` |
| `iphone-16-plus` | iPhone 16 Plus | 1290×2796 | `black`, `white`, `ultramarine`, `teal`, `pink` |
| `iphone-16` | iPhone 16 | 1179×2556 | `black`, `white`, `ultramarine`, `teal`, `pink` |
| `iphone-15-pro-max` | iPhone 15 Pro Max | 1290×2796 | `black`, `natural`, `blue`, `white` |
| `iphone-15-pro` | iPhone 15 Pro | 1179×2556 | `black`, `natural`, `blue`, `white` |
| `iphone-14` | iPhone 14 | 1170×2532 | `midnight`, `purple`, `blue`, `red` |

#### iPad

| device.id | device | native px | device.color |
| --- | --- | --- | --- |
| `ipad-pro-12-9` | iPad Pro 12.9" | 2048×2732 | `black`, `space-gray`, `silver` |
| `ipad-pro-13-m4` | iPad Pro 13" (M4) | 2064×2752 | `space-black`, `silver` |
| `ipad-pro-11-m4` | iPad Pro 11" (M4) | 1668×2420 | `space-black`, `silver` |

#### Android phone

| device.id | device | native px | device.color |
| --- | --- | --- | --- |
| `samsung-galaxy-s24-ultra` | Samsung Galaxy S24 Ultra | 1440×3120 | `titanium-black`, `titanium-gray`, `titanium-violet`, `titanium-yellow` |
| `pixel-10-pro-xl` | Google Pixel 10 Pro XL | 1344×2992 | `obsidian`, `porcelain`, `moonstone`, `jade` |
| `pixel-10-pro` | Google Pixel 10 Pro | 1280×2856 | `obsidian`, `porcelain`, `moonstone`, `jade` |
| `pixel-10` | Google Pixel 10 | 1080×2424 | `obsidian`, `frost`, `indigo`, `lemongrass` |
| `pixel-9-pro-xl` | Google Pixel 9 Pro XL | 1344×2992 | `obsidian`, `porcelain`, `hazel`, `rose-quartz` |
| `pixel-9-pro` | Google Pixel 9 Pro | 1280×2856 | `obsidian`, `porcelain`, `hazel`, `rose-quartz` |
| `pixel-9` | Google Pixel 9 | 1080×2424 | `obsidian`, `porcelain`, `wintergreen`, `peony` |

#### Android tablet

| device.id | device | native px | device.color |
| --- | --- | --- | --- |
| `samsung-galaxy-tab-s10-ultra` | Samsung Galaxy Tab S10 Ultra | 1848×2960 | `moonstone-gray`, `platinum-silver` |
| `samsung-galaxy-tab-s10-plus` | Samsung Galaxy Tab S10+ | 1752×2800 | `moonstone-gray`, `platinum-silver` |
| `samsung-galaxy-tab-s9` | Samsung Galaxy Tab S9 | 1600×2560 | `graphite`, `beige` |

### Export sizes (`exportSize`; defaults to the device's platform)

| exportSize | use for | px |
| --- | --- | --- |
| `6.9` | 6.9 inch (iPhone 16 Pro Max) | 1320×2868 |
| `6.7` | 6.7 inch (iPhone 13/12 Pro Max) | 1284×2778 |
| `6.5` | 6.5 inch (iPhone 11 Pro Max) | 1242×2688 |
| `5.5` | 5.5 inch (iPhone 8 Plus) | 1242×2208 |
| `ipad-13` | 13 inch (iPad Pro M4) | 2064×2752 |
| `ipad` | 12.9 inch (iPad Pro) | 2048×2732 |
| `play-phone-16-9` | Play Store — Phone 9:16 (1080 × 1920) | 1080×1920 |
| `play-phone-20-9` | Play Store — Phone 20:9 (1080 × 2400) | 1080×2400 |
| `play-tablet-7` | Play Store — 7" Tablet (1200 × 1920) | 1200×1920 |
| `play-tablet-10` | Play Store — 10" Tablet (1600 × 2560) | 1600×2560 |

### Fonts (`brand.font`, `screens[].text.font`)

| font | category |
| --- | --- |
| Inter | sans-serif |
| Roboto | sans-serif |
| Open Sans | sans-serif |
| Montserrat | sans-serif |
| Poppins | sans-serif |
| Lato | sans-serif |
| Oswald | sans-serif |
| Raleway | sans-serif |
| Nunito | sans-serif |
| Playfair Display | serif |
| Merriweather | serif |
| Rubik | sans-serif |
| Ubuntu | sans-serif |
| Roboto Mono | monospace |
| Source Code Pro | monospace |
| Lora | serif |
| Work Sans | sans-serif |
| DM Sans | sans-serif |
| Quicksand | sans-serif |
| Bebas Neue | display |

### Gradient presets (`{ "type": "preset", "id": … }`)

| preset id | gradient |
| --- | --- |
| `sunset` | Sunset: #ff7e5f → #feb47b |
| `ocean` | Ocean: #2b5876 → #4e4376 |
| `mint` | Mint: #00b09b → #96c93d |
| `berry` | Berry: #e1eec3 → #f05053 |
| `royal` | Royal: #141E30 → #243B55 |
| `rose` | Rose: #f4c4f3 → #fc67fa |

### Units

- `x` / `y` are percent of the canvas. For devices and overlays they are the center point; for text they are the top-center of the text box. Device `x` may go below 0 or above 100 to bleed off the edge.
- `scale`, text `width` and overlay `width` are percent. Rotations are degrees. Font sizes are px at editor scale (headlines are typically 60–80).
- Backgrounds: `{ "type": "solid", "color": "#hex" }`, `{ "type": "gradient", "from": "#hex", "to": "#hex" }`, or a preset.

## 6. Output contract

- Write `breezel.json` (UTF-8) in the same folder as the images.
- Required: `"format": "breezel-import"`, `"version": 1`, and `screens`. Each screen needs `headline` and **exactly one** of `image` (one device) or `devices` (a list, for multi-device screens).
- Give each `devices[]` entry its own `x`, `y` and `scale` (for two devices, roughly `x` 32 and 68 with `scale` 55), or they overlap.
- Image references are bare filenames of files in that folder.
- Unknown keys are rejected. Validate against the JSON Schema: download it from Breezel's **Import from agent** dialog, or use `docs/agent-import/breezel-import.schema.json` in the Breezel repository. The schema cannot check the exactly-one-of `image` / `devices` rule, so check that by hand.
- Everything else is optional. Per-screen `text`, `device` and `background` override the brand and layout for that screen only (`device` is ignored when a screen uses `devices`; put per-device settings on each `devices[]` entry instead).

Worked example:

```json
{
  "format": "breezel-import",
  "version": 1,
  "name": "Habitly — App Store",
  "exportSize": "6.9",
  "brand": {
    "primary": "#5B5BD6",
    "style": "bold"
  },
  "device": {
    "id": "iphone-17-pro",
    "color": "cosmic-orange",
    "style": "flat",
    "shadow": true
  },
  "screens": [
    {
      "image": "01-today.png",
      "headline": "Build habits <mark>that stick</mark>",
      "subheadline": "Tiny daily wins, tracked for you",
      "layout": "bleed-bottom",
      "overlays": [
        {
          "image": "badge.png",
          "x": 82,
          "y": 30,
          "width": 18,
          "layer": "front"
        }
      ]
    },
    {
      "image": "02-streaks.png",
      "headline": "Watch streaks grow",
      "layout": "tilt-left"
    },
    {
      "image": "03-reminders.png",
      "headline": "Never miss a day",
      "subheadline": "Gentle nudges at the right time",
      "layout": "tilt-right"
    },
    {
      "image": "04-insights.png",
      "headline": "Insights that <mark>motivate</mark>",
      "layout": "perspective"
    },
    {
      "image": "05-focus.png",
      "headline": "Focus on one thing",
      "layout": "centered"
    },
    {
      "image": "06-journal.png",
      "headline": "Reflect in seconds",
      "subheadline": "A private journal for every habit",
      "layout": "bleed-top",
      "background": {
        "type": "solid",
        "color": "#0F172A"
      },
      "text": {
        "color": "#F8FAFC"
      }
    },
    {
      "image": "07-widgets.png",
      "headline": "Widgets everywhere",
      "layout": "float-center"
    },
    {
      "image": "08-share.png",
      "headline": "Share your progress",
      "subheadline": "Invite friends and keep each other on track",
      "layout": "float-bottom"
    },
    {
      "headline": "Light or dark, your call",
      "devices": [
        {
          "image": "09a-light.png",
          "x": 32,
          "y": 40,
          "scale": 55,
          "rotation": -8
        },
        {
          "image": "09b-dark.png",
          "x": 68,
          "y": 44,
          "scale": 55,
          "rotation": 8
        }
      ]
    }
  ]
}
```

## 7. Self-check before you finish

- [ ] Every `image`, `devices[].image` and `overlays[].image` exists in the folder with exactly that name.
- [ ] Every `layout`, `brand.style`, `device.id`, `device.color`, `exportSize`, font and preset id appears in the tables above.
- [ ] Each screen has exactly one of `image` or `devices`.
- [ ] Headlines are at most ~28 characters with at most one `<mark>`; subheadlines at most ~60.
- [ ] Text is readable on its background: every screen with its own `background` also sets a readable `text.color`.
- [ ] The device and export size are the same platform.
- [ ] The hero screen is first and there are 5–10 screens.
- [ ] `breezel.json` parses and validates against the schema.
