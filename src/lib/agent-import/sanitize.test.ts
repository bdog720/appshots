import { describe, expect, it } from "vitest";
import { applyHighlightColor, sanitizeRichText } from "./sanitize";

const firstElement = (html: string, selector: string) =>
  new DOMParser()
    .parseFromString(html, "text/html")
    .body.querySelector<HTMLElement>(selector);

describe("sanitizeRichText", () => {
  it("keeps allowed formatting untouched", () => {
    const input = "Plan <b>fast</b> <i>and</i> <u>well</u> <strong>now</strong><em>!</em> <mark>go</mark>";
    expect(sanitizeRichText(input)).toEqual({ html: input, stripped: false });
  });

  it("keeps color styles on spans", () => {
    const { html, stripped } = sanitizeRichText('<span style="color: #ff0000">red</span>');
    expect(stripped).toBe(false);
    expect(firstElement(html, "span")?.style.color).toBe("rgb(255, 0, 0)");
  });

  it("turns newlines into line breaks", () => {
    expect(sanitizeRichText("Line one\nLine two").html).toBe("Line one<br>Line two");
  });

  it("escapes plain text", () => {
    expect(sanitizeRichText("5 < 6 & 7")).toEqual({
      html: "5 &lt; 6 &amp; 7",
      stripped: false,
    });
  });

  it("removes scripts with their content", () => {
    expect(sanitizeRichText("Hi<script>alert(1)</script>")).toEqual({
      html: "Hi",
      stripped: true,
    });
  });

  it("removes images and event handlers", () => {
    expect(sanitizeRichText("<img src=x onerror=alert(1)>Hi")).toEqual({
      html: "Hi",
      stripped: true,
    });
  });

  it("unwraps disallowed elements but keeps their text", () => {
    expect(sanitizeRichText('<a href="javascript:alert(1)">tap</a>')).toEqual({
      html: "tap",
      stripped: true,
    });
  });

  it("drops non-style attributes from allowed tags", () => {
    expect(sanitizeRichText('<b onclick="x()" class="y">bold</b>')).toEqual({
      html: "<b>bold</b>",
      stripped: true,
    });
  });

  it("drops unsafe style declarations", () => {
    const { html, stripped } = sanitizeRichText(
      '<span style="background:url(https://evil.example/x.png)">x</span>',
    );
    expect(html).not.toContain("url");
    expect(stripped).toBe(true);
  });

  it("only keeps background-color on mark", () => {
    const { html, stripped } = sanitizeRichText(
      '<mark style="color: red; background-color: #00ff00">x</mark>',
    );
    const mark = firstElement(html, "mark");
    expect(mark?.style.color).toBe("");
    expect(mark?.style.backgroundColor).toBe("rgb(0, 255, 0)");
    expect(stripped).toBe(true);
  });
});

describe("applyHighlightColor", () => {
  it("colors unstyled marks", () => {
    const html = applyHighlightColor("Build <mark>habits</mark>", "#ffd60a");
    expect(firstElement(html, "mark")?.style.backgroundColor).toBe("rgb(255, 214, 10)");
  });

  it("keeps a mark's explicit color", () => {
    const html = applyHighlightColor(
      '<mark style="background-color: #00ff00">x</mark>',
      "#ffd60a",
    );
    expect(firstElement(html, "mark")?.style.backgroundColor).toBe("rgb(0, 255, 0)");
  });

  it("returns html without marks unchanged", () => {
    expect(applyHighlightColor("Plain <b>text</b>", "#ffd60a")).toBe("Plain <b>text</b>");
  });
});
