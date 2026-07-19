/** Small color-math helpers for deriving brand palettes. Hues in degrees, s/l in %. */

export interface Hsl {
  h: number;
  s: number;
  l: number;
}

const clampByte = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));

export const hexToRgb = (hex: string): { r: number; g: number; b: number } => {
  let h = hex.replace("#", "");
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  const num = parseInt(h, 16);
  return { r: (num >> 16) & 255, g: (num >> 8) & 255, b: num & 255 };
};

export const rgbToHex = (r: number, g: number, b: number): string =>
  "#" + [r, g, b].map((v) => clampByte(v).toString(16).padStart(2, "0")).join("");

export const hexToHsl = (hex: string): Hsl => {
  const { r, g, b } = hexToRgb(hex);
  const rn = r / 255, gn = g / 255, bn = b / 255;
  const max = Math.max(rn, gn, bn), min = Math.min(rn, gn, bn);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0, s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case rn: h = (((gn - bn) / d) % 6 + 6) % 6; break;
      case gn: h = (bn - rn) / d + 2; break;
      default: h = (rn - gn) / d + 4;
    }
    h *= 60;
  }
  return { h, s: s * 100, l: l * 100 };
};

export const hslToHex = ({ h, s, l }: Hsl): string => {
  const sn = s / 100, ln = l / 100;
  const c = (1 - Math.abs(2 * ln - 1)) * sn;
  const hp = ((((h % 360) + 360) % 360)) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g, b] = [c, x, 0];
  else if (hp < 2) [r, g, b] = [x, c, 0];
  else if (hp < 3) [r, g, b] = [0, c, x];
  else if (hp < 4) [r, g, b] = [0, x, c];
  else if (hp < 5) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  const m = ln - c / 2;
  return rgbToHex((r + m) * 255, (g + m) * 255, (b + m) * 255);
};

export const adjustLightness = (hex: string, deltaL: number): string => {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, l: Math.max(0, Math.min(100, hsl.l + deltaL)) });
};

export const rotateHue = (hex: string, deg: number): string => {
  const hsl = hexToHsl(hex);
  return hslToHex({ ...hsl, h: hsl.h + deg });
};

export const mix = (a: string, b: string, t: number): string => {
  const ca = hexToRgb(a), cb = hexToRgb(b);
  const k = Math.max(0, Math.min(1, t));
  return rgbToHex(
    ca.r + (cb.r - ca.r) * k,
    ca.g + (cb.g - ca.g) * k,
    ca.b + (cb.b - ca.b) * k,
  );
};
