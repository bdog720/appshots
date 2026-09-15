/**
 * The brief an AI agent receives. Generated from live data so it can never
 * list a device, font, layout or style AppShots doesn't support.
 */

import { devices, exportSizes, gradientPresets } from "../../constants";
import { VIBES } from "../brand-guide";
import { googleFonts } from "../google-fonts";
import { LAYOUT_PRESETS } from "../layout-presets";
import { EXAMPLE_MANIFEST } from "./example";
import { deviceFamily, type DeviceFamily } from "./resolve";

export const STYLE_DESCRIPTIONS: Record<string, string> = {
  minimal: "Inter, calm sizes. Soft near-white tint of the brand color. Clean utility and productivity apps.",
  bold: "Poppins, large type. Gradient from the brand color to a darker shade. Confident consumer apps.",
  warm: "Nunito, rounded. Warm cream tint of the brand color. Wellness, food, community.",
  playful: "Quicksand, largest type. Gradient from the brand color to a shifted hue. Kids, games, social.",
  elegant: "Playfair Display serif. Deep, dark shade of the brand color. Finance, luxury, premium.",
  editorial: "Lora serif. Deep, narrow dark gradient. Reading, news, journaling.",
};

const FAMILY_LABELS: Record<DeviceFamily, string> = {
  "apple-phone": "iPhone",
  "apple-tablet": "iPad",
  "android-phone": "Android phone",
  "android-tablet": "Android tablet",
};

const code = (value: string) => `\`${value}\``;

const table = (header: string[], rows: string[][]): string =>
  [
    `| ${header.join(" | ")} |`,
    `| ${header.map(() => "---").join(" | ")} |`,
    ...rows.map((row) => `| ${row.join(" | ")} |`),
  ].join("\n");

const stylesTable = () =>
  table(
    ["style", "look"],
    VIBES.map((v) => [code(v.id), STYLE_DESCRIPTIONS[v.id] ?? v.label]),
  );

const layoutsTable = () =>
  table(
    ["layout", "what it does"],
    LAYOUT_PRESETS.map((p) => [code(p.id), p.description]),
  );

const devicesSection = () =>
  (Object.keys(FAMILY_LABELS) as DeviceFamily[])
    .map((family) => {
      const rows = devices
        .filter((d) => deviceFamily(d.id) === family)
        .map((d) => [
          code(d.id),
          d.label,
          `${d.width}×${d.height}`,
          d.colors.map((c) => code(c.id)).join(", "),
        ]);
      return `#### ${FAMILY_LABELS[family]}\n\n${table(["device.id", "device", "native px", "device.color"], rows)}`;
    })
    .join("\n\n");

/** Landscape store art, not a size for a portrait screenshot set. */
const NON_SCREENSHOT_EXPORT_SIZES = new Set(["play-feature-graphic"]);

const exportSizesTable = () =>
  table(
    ["exportSize", "use for", "px"],
    exportSizes
      .filter((s) => !NON_SCREENSHOT_EXPORT_SIZES.has(s.id))
      .map((s) => [code(s.id), s.label, `${s.width}×${s.height}`]),
  );

const fontsTable = () =>
  table(
    ["font", "category"],
    googleFonts.map((f) => [f.family, f.category]),
  );

const presetsTable = () =>
  table(
    ["preset id", "gradient"],
    gradientPresets.map((p) => [code(p.id), `${p.label}: ${p.from} → ${p.to}`]),
  );

export const buildAgentPrompt = (): string => `# AppShots agent import — screenshot set brief

You are preparing App Store / Google Play screenshots for the app in this repository. Produce a folder containing the app's screenshots **and** an \`appshots.json\` file describing how AppShots should present them. The user will drop that folder (or a zip of it) into AppShots via **Project menu → Import from agent…** and get a finished, editable project.

## 1. Research the app first

- **Name and promise:** read the README, \`fastlane/metadata\`, \`app.json\` / \`app.config.*\`, \`Info.plist\`, \`pubspec.yaml\`, and any store listing copy. Write down the one-sentence promise and the 5–10 features users care about most.
- **Brand color:** look in the Tailwind config, theme or design-token files, \`Assets.xcassets/*.colorset\`, \`res/values/colors.xml\`, or the SwiftUI / Compose / Material theme. Choose one primary hex for \`brand.primary\`.
- **Font:** find the app's typeface. If it is not in the font table below, pick the nearest by feel (geometric sans → Poppins or Montserrat, neutral sans → Inter, rounded → Nunito or Quicksand, serif → Lora or Playfair Display).
- **Tone:** match the voice of the app's existing copy.

## 2. Screenshots

- Use the screenshots this repository's tooling already captures. One screen per feature, realistic demo data, no debug banners, empty states, or personal information.
- Order matters: the strongest "hero" feature goes first, and the first two or three screens must sell the app on their own.
- Use 5–10 screens, portrait, at the device's native resolution (see the device tables).
- Save every image next to \`appshots.json\` with a unique filename (\`01-home.png\`, \`02-stats.png\`, …). PNG, JPEG or WebP.

## 3. Copy rules

- **Headline:** 2–5 words, at most ~28 characters, benefit first ("Plan your week in seconds", not "Calendar screen"). Start with a verb where it reads naturally.
- **Highlight:** at most one phrase per headline, wrapped in \`<mark>…</mark>\`.
- **Subheadline:** optional, at most ~60 characters, adds a concrete detail. Omit it rather than repeat the headline.
- Keep tone and tense consistent. Make no claims the repository can't back up (no "#1", awards, or prices unless they are real).
- Only this inline HTML is kept: \`<b>\`, \`<strong>\`, \`<i>\`, \`<em>\`, \`<u>\`, \`<mark>\`, \`<br>\`, and \`<span style="color: #hex">\`. Everything else is removed. A newline becomes a line break.

## 4. Visual rules

- Choose **one** \`brand.style\` for the whole set. From \`brand.primary\` it picks the font, sizes, background and a readable text color. \`brand.style\` requires \`brand.primary\`; without it the style is ignored. Override (\`brand.font\`, \`brand.background\`, …) only when the repository gives you a reason.
- Give \`layout\` a rhythm: hero \`bleed-bottom\`, then alternate (for example \`tilt-left\` / \`tilt-right\`), \`perspective\` at most twice, never the same layout more than three times in a row.
- Keep one background across the set. Use a per-screen \`background\` only as a deliberate accent, and set that screen's \`text.color\` so text stays readable.
- The device and \`exportSize\` must be the same platform (an iPhone with an iPhone size, a Pixel with a Play phone size). One \`appshots.json\` describes one device family; make a separate folder for an iPad or Android set.
- Dark text on light backgrounds, light text on dark. AppShots warns about contrast failures.

## 5. Reference

### Styles (\`brand.style\`)

${stylesTable()}

### Layouts (\`screens[].layout\`, default \`bleed-bottom\`)

${layoutsTable()}

### Devices (\`device.id\` and its valid \`device.color\` values)

${devicesSection()}

### Export sizes (\`exportSize\`; defaults to the device's platform)

${exportSizesTable()}

### Fonts (\`brand.font\`, \`screens[].text.font\`)

${fontsTable()}

### Gradient presets (\`{ "type": "preset", "id": … }\`)

${presetsTable()}

### Units

- \`x\` / \`y\` are percent of the canvas. For devices and overlays they are the center point; for text they are the top-center of the text box. Device \`x\` may go below 0 or above 100 to bleed off the edge.
- \`scale\`, text \`width\` and overlay \`width\` are percent. Rotations are degrees. Font sizes are px at editor scale (headlines are typically 60–80).
- Backgrounds: \`{ "type": "solid", "color": "#hex" }\`, \`{ "type": "gradient", "from": "#hex", "to": "#hex" }\`, or a preset.

## 6. Output contract

- Write \`appshots.json\` (UTF-8) in the same folder as the images.
- Required: \`"format": "appshots-import"\`, \`"version": 1\`, and \`screens\`. Each screen needs \`headline\` and **exactly one** of \`image\` (one device) or \`devices\` (a list, for multi-device screens).
- Give each \`devices[]\` entry its own \`x\`, \`y\` and \`scale\` (for two devices, roughly \`x\` 32 and 68 with \`scale\` 55), or they overlap.
- Image references are bare filenames of files in that folder.
- Unknown keys are rejected. Validate against the JSON Schema: download it from AppShots' **Import from agent** dialog, or use \`docs/agent-import/appshots-import.schema.json\` in the AppShots repository. The schema cannot check the exactly-one-of \`image\` / \`devices\` rule, so check that by hand.
- Everything else is optional. Per-screen \`text\`, \`device\` and \`background\` override the brand and layout for that screen only (\`device\` is ignored when a screen uses \`devices\`; put per-device settings on each \`devices[]\` entry instead).

Worked example:

\`\`\`json
${JSON.stringify(EXAMPLE_MANIFEST, null, 2)}
\`\`\`

## 7. Self-check before you finish

- [ ] Every \`image\`, \`devices[].image\` and \`overlays[].image\` exists in the folder with exactly that name.
- [ ] Every \`layout\`, \`brand.style\`, \`device.id\`, \`device.color\`, \`exportSize\`, font and preset id appears in the tables above.
- [ ] Each screen has exactly one of \`image\` or \`devices\`.
- [ ] Headlines are at most ~28 characters with at most one \`<mark>\`; subheadlines at most ~60.
- [ ] Text is readable on its background: every screen with its own \`background\` also sets a readable \`text.color\`.
- [ ] The device and export size are the same platform.
- [ ] The hero screen is first and there are 5–10 screens.
- [ ] \`appshots.json\` parses and validates against the schema.
`;
