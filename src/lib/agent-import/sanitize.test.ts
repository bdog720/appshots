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

  it("keeps markup whose tag has a newline between attributes", () => {
    const { html } = sanitizeRichText('<span\nstyle="color: red">x</span>');
    const body = new DOMParser().parseFromString(html, "text/html").body;
    expect(body.textContent).toBe("x");
    expect(firstElement(html, "span")?.style.color).toBe("red");
  });

  it("keeps a color whose style value contains a newline", () => {
    const { html, stripped } = sanitizeRichText('<span style="color:\n red">x</span>');
    expect(stripped).toBe(false);
    expect(firstElement(html, "span")?.style.color).toBe("red");
  });

  it("turns carriage returns and CRLF into single line breaks", () => {
    expect(sanitizeRichText("a\rb").html).toBe("a<br>b");
    expect(sanitizeRichText("a\r\nb").html).toBe("a<br>b");
  });

  it("turns newlines inside allowed tags into line breaks", () => {
    expect(sanitizeRichText("<b>a\nb</b>").html).toBe("<b>a<br>b</b>");
  });

  it("drops var() colors the canvas export cannot resolve", () => {
    const { html, stripped } = sanitizeRichText('<span style="color: var(--brand)">x</span>');
    expect(html).toBe("<span>x</span>");
    expect(stripped).toBe(true);
  });

  it("drops currentcolor highlights", () => {
    const { html, stripped } = sanitizeRichText(
      '<mark style="background-color: currentColor">x</mark>',
    );
    expect(html).toBe("<mark>x</mark>");
    expect(stripped).toBe(true);
  });

  it("flags style declarations the CSS parser rejects", () => {
    expect(sanitizeRichText('<b style="bogus">b</b>')).toEqual({
      html: "<b>b</b>",
      stripped: true,
    });
  });

  it("flags an invalid color value", () => {
    expect(sanitizeRichText('<span style="color: expression(alert(1))">x</span>')).toEqual({
      html: "<span>x</span>",
      stripped: true,
    });
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
