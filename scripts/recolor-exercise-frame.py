#!/usr/bin/env python3
"""Re-theme exercise animation frames to match Asc3end's look.

Reads raw RGB24 frames on stdin (W*H*3 bytes each) and writes the same on stdout, so it sits
between two ffmpeg processes in scripts/build-exercise-media.mjs:

  * the white studio background (every near-white pixel connected to the frame edge) becomes the
    app's card surface, with a soft blend at the edge so the figure isn't cut out jaggedly;
  * the red/orange "working muscle" highlight becomes the app's green, keeping its shading.

Skin, hair, shorts, equipment and white parts *inside* the figure are left alone.

Usage: recolor-exercise-frame.py WIDTH HEIGHT THEME   (THEME = dark | light)
"""
import sys

import numpy as np

THEMES = {
    # bg = --bg-elev2, muscle = --brass (dark) / a slightly deeper green for the light surface
    "dark": {"bg": (0x1B, 0x28, 0x22), "muscle": (0x3E, 0xCF, 0x8E)},
    "light": {"bg": (0xE9, 0xEF, 0xEB), "muscle": (0x17, 0xA0, 0x63)},
}


def edge_connected(mask: np.ndarray) -> np.ndarray:
    """Pixels of `mask` reachable from the frame border through `mask` (4-connected flood fill)."""
    seed = np.zeros_like(mask)
    seed[0, :], seed[-1, :], seed[:, 0], seed[:, -1] = mask[0, :], mask[-1, :], mask[:, 0], mask[:, -1]
    filled = seed
    while True:
        grown = filled.copy()
        grown[1:, :] |= filled[:-1, :]
        grown[:-1, :] |= filled[1:, :]
        grown[:, 1:] |= filled[:, :-1]
        grown[:, :-1] |= filled[:, 1:]
        grown &= mask
        if np.array_equal(grown, filled):
            return filled
        filled = grown


def blur3(a: np.ndarray) -> np.ndarray:
    p = np.pad(a, 1, mode="edge")
    return sum(p[dy:dy + a.shape[0], dx:dx + a.shape[1]] for dy in range(3) for dx in range(3)) / 9.0


def recolor(frame: np.ndarray, theme: dict) -> np.ndarray:
    f = frame.astype(np.float32)
    r, g, b = f[..., 0], f[..., 1], f[..., 2]
    mx, mn = f.max(axis=2), f.min(axis=2)
    sat = (mx - mn) / np.maximum(mx, 1)

    # --- Muscle highlight: saturated red/orange (hue roughly -25..35 degrees) -----------------
    # Skin is orange too but far less saturated, so saturation is what separates them.
    hue_redish = (r >= g) & (r >= b) & ((g - b) < 0.75 * (r - b + 1))
    strength = np.clip((sat - 0.42) / 0.18, 0, 1) * hue_redish * np.clip((r - 90) / 40, 0, 1)
    shade = (mx / 255.0)[..., None]  # keep the muscle's own light/shadow
    target = np.array(theme["muscle"], np.float32)[None, None, :]
    green = np.clip(target * (0.35 + 0.85 * shade), 0, 255)
    f = f * (1 - strength[..., None]) + green * strength[..., None]

    # --- Background: near-white, unsaturated, connected to the frame edge ----------------------
    # The backdrop colour is read from the frame border (usually white or a faint grey gradient),
    # and closeness to it is measured on a lightly blurred copy so GIF dithering and compression
    # noise don't break the flood fill into speckles.
    sm = np.stack([blur3(blur3(f[..., c])) for c in range(3)], axis=2)
    border = np.concatenate([sm[0], sm[-1], sm[:, 0], sm[:, -1]])
    ref = np.median(border, axis=0)
    dist = np.abs(sm - ref[None, None, :]).max(axis=2)
    mn_s = sm.min(axis=2)
    whiteish = (dist < 26) & ((sm.max(axis=2) - mn_s) < 18) & (mn_s > 200)
    bg = edge_connected(whiteish)
    # A band a few pixels wide around the background holds the figure's anti-aliased edge. There,
    # un-blend the white ("colour to alpha") so the edge sits cleanly on the new surface instead
    # of leaving a white halo; everywhere inside the figure stays fully opaque.
    near = blur3(blur3(blur3(bg.astype(np.float32)))) > 0
    # How "not backdrop" a pixel is, biased toward the new surface so no light halo is left.
    ca = np.clip(dist / 255.0 * 2.6, 0, 1) ** 1.8
    alpha_fig = np.where(bg, 0.0, np.where(near, ca, 1.0))[..., None]
    fig_col = np.where(alpha_fig > 0.02, (f - ref[None, None, :] * (1 - alpha_fig)) / np.maximum(alpha_fig, 0.02), 0)
    # The outline itself is grey in these renders; GIF palettes often snap it to an off-colour
    # (yellow, pink), so neutralise colour in the edge band and darken it slightly.
    luma = (0.299 * fig_col[..., 0] + 0.587 * fig_col[..., 1] + 0.114 * fig_col[..., 2])[..., None]
    fig_col = np.where(near[..., None] & ~bg[..., None], np.clip(luma * 0.85, 0, 255).repeat(3, axis=2), f)
    surface = np.array(theme["bg"], np.float32)[None, None, :]
    f = fig_col * alpha_fig + surface * (1 - alpha_fig)
    return np.clip(f, 0, 255).astype(np.uint8)


def main() -> None:
    w, h, theme_name = int(sys.argv[1]), int(sys.argv[2]), sys.argv[3]
    theme = THEMES[theme_name]
    size = w * h * 3
    src, dst = sys.stdin.buffer, sys.stdout.buffer
    while True:
        buf = src.read(size)
        if len(buf) < size:
            break
        frame = np.frombuffer(buf, np.uint8).reshape(h, w, 3)
        dst.write(recolor(frame, theme).tobytes())


if __name__ == "__main__":
    main()
