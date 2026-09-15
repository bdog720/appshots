/**
 * Headline/subheadline HTML from an imported manifest is untrusted and is later
 * rendered with dangerouslySetInnerHTML. Rebuild it from scratch, keeping only
 * a subset of the tags and styles `rich-text-canvas.ts` understands, so the
 * preview and the export agree and nothing executable survives.
 */

const ALLOWED_TAGS = new Set(["b", "strong", "i", "em", "u", "mark", "br", "span"]);

/** Elements removed together with everything inside them. */
const REMOVE_WITH_CONTENT = new Set([
  "script", "style", "iframe", "object", "embed", "template",
  "noscript", "svg", "math", "img", "video", "audio", "input", "textarea", "select", "button",
]);

const CSS_WIDE_KEYWORDS = new Set(["", "initial", "inherit", "unset", "revert", "revert-layer"]);

/** The canvas export can't resolve these against the DOM, so preview and export would differ. */
const isUnresolvableColor = (normalized: string): boolean =>
  normalized.includes("var(") || normalized.includes("currentcolor");

const usableColor = (value: string): string | null => {
  const normalized = value.trim().toLowerCase();
  if (CSS_WIDE_KEYWORDS.has(normalized) || isUnresolvableColor(normalized)) return null;
  return value;
};

const LINE_BREAK = /\r\n|\r|\n/;

/** Declarations written in a raw style attribute, including ones the CSS parser rejects. */
const countDeclarations = (styleAttribute: string | null): number =>
  (styleAttribute ?? "").split(";").filter((part) => part.trim() !== "").length;

export interface SanitizeResult {
  html: string;
  stripped: boolean;
}

export const sanitizeRichText = (input: string): SanitizeResult => {
  const doc = new DOMParser().parseFromString(input, "text/html");
  const output = doc.createElement("div");
  let stripped = doc.head.childNodes.length > 0;

  const copyChildren = (from: Node, to: Node) => {
    for (const child of Array.from(from.childNodes)) {
      if (child.nodeType === Node.TEXT_NODE) {
        const lines = (child.textContent ?? "").split(LINE_BREAK);
        lines.forEach((line, index) => {
          if (index > 0) to.appendChild(doc.createElement("br"));
          if (line) to.appendChild(doc.createTextNode(line));
        });
        continue;
      }
      if (child.nodeType !== Node.ELEMENT_NODE) {
        stripped = true; // comments, processing instructions
        continue;
      }

      const element = child as HTMLElement;
      const tag = element.tagName.toLowerCase();

      if (REMOVE_WITH_CONTENT.has(tag)) {
        stripped = true;
        continue;
      }
      if (!ALLOWED_TAGS.has(tag)) {
        stripped = true;
        copyChildren(element, to);
        continue;
      }

      const clean = doc.createElement(tag);
      let keptStyles = 0;
      const color = tag === "span" ? usableColor(element.style.color) : null;
      const background =
        tag === "span" || tag === "mark"
          ? usableColor(element.style.backgroundColor)
          : null;
      if (color) {
        clean.style.color = color;
        keptStyles += 1;
      }
      if (background) {
        clean.style.backgroundColor = background;
        keptStyles += 1;
      }

      const styleAttributeCount = element.hasAttribute("style") ? 1 : 0;
      if (
        element.attributes.length > styleAttributeCount ||
        element.style.length > keptStyles ||
        countDeclarations(element.getAttribute("style")) > keptStyles
      ) {
        stripped = true;
      }

      if (tag !== "br") copyChildren(element, clean);
      to.appendChild(clean);
    }
  };

  copyChildren(doc.body, output);
  return { html: output.innerHTML, stripped };
};

export const applyHighlightColor = (html: string, color: string): string => {
  if (!/<mark[\s>]/i.test(html)) return html;
  const doc = new DOMParser().parseFromString(html, "text/html");
  for (const mark of Array.from(doc.body.querySelectorAll<HTMLElement>("mark"))) {
    if (!mark.style.backgroundColor) mark.style.backgroundColor = color;
  }
  return doc.body.innerHTML;
};
