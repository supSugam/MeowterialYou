#!/usr/bin/env python3
"""Recolor an Xcursor theme directory with Material You fill and outline colors."""

from __future__ import annotations

import os
import shutil
import struct
import sys
import numpy as np

XCUR_IMAGE_TYPE = 0xFFFD0002
THEME_NAME = "MeowterialYou-Cursor"


def parse_hex(hex_color: str) -> tuple[float, float, float]:
    value = hex_color.strip().lstrip("#")
    if len(value) != 6:
        raise ValueError(f"Invalid hex color: {hex_color}")
    return (int(value[0:2], 16) / 255.0, int(value[2:4], 16) / 255.0, int(value[4:6], 16) / 255.0)


def detect_light_interior(cursors_dir: str) -> bool:
    """Detect whether the cursor pack uses a light fill + dark outline (e.g. Bibata Ice)."""
    probe = os.path.join(cursors_dir, "left_ptr")
    if not os.path.isfile(probe):
        return False
    with open(probe, "rb") as handle:
        data = handle.read()
    if len(data) < 16 or data[:4] != b"Xcur":
        return False
    _, hdr, _, ntoc = struct.unpack_from("<4sIII", data, 0)
    dark_count = 0
    light_count = 0
    for i in range(ntoc):
        t, sub, pos = struct.unpack_from("<III", data, hdr + i * 12)
        if t == XCUR_IMAGE_TYPE and sub >= 24:
            ihdr, _, _, _, w, h, _, _, _ = struct.unpack_from("<9I", data, pos)
            pix = np.frombuffer(data, dtype=np.uint8, count=w * h * 4, offset=pos + ihdr).reshape(-1, 4)
            opaque = pix[pix[:, 3] >= 240]
            if opaque.size == 0:
                return False
            lum = (0.2126 * opaque[:, 2] + 0.7152 * opaque[:, 1] + 0.0722 * opaque[:, 0]) / opaque[:, 3]
            dark_count = int(np.sum(lum < 0.25))
            light_count = int(np.sum(lum > 0.75))
            return light_count > dark_count * 1.15
    return False


def recolor_pixels(
    pix_bytes: bytes,
    w: int,
    h: int,
    fill_rgb: tuple[float, float, float],
    outline_rgb: tuple[float, float, float],
    preserve_shadow: bool,
) -> bytes:
    arr = np.frombuffer(pix_bytes, dtype=np.uint8).reshape(w * h, 4).astype(np.float32)
    alpha = arr[:, 3:4] / 255.0
    nz = alpha[:, 0] > 0.0
    if not np.any(nz):
        return pix_bytes

    rgb = np.zeros((w * h, 3), dtype=np.float32)
    rgb[nz] = np.clip(arr[nz, 2::-1] / np.maximum(arr[nz, 3:4], 1.0), 0.0, 1.0)

    cmax = rgb.max(axis=1)
    cmin = rgb.min(axis=1)
    chroma = cmax - cmin
    neutral = nz & (chroma <= 0.12)
    if not np.any(neutral):
        return pix_bytes

    lum = 0.2126 * rgb[:, 0] + 0.7152 * rgb[:, 1] + 0.0722 * rgb[:, 2]
    if preserve_shadow:
        shadow_mask = neutral & (lum < 0.2) & (arr[:, 3] < 160.0)
        neutral = neutral & (~shadow_mask)

    if not np.any(neutral):
        return pix_bytes

    t = np.clip(lum[neutral], 0.0, 1.0)[:, None]
    fill_arr = np.array(fill_rgb, dtype=np.float32)[None, :]
    out_arr = np.array(outline_rgb, dtype=np.float32)[None, :]
    mapped_rgb = fill_arr * (1.0 - t) + out_arr * t

    premul = np.clip(np.rint(mapped_rgb * arr[neutral, 3:4]), 0.0, 255.0).astype(np.uint8)
    out = np.frombuffer(pix_bytes, dtype=np.uint8).reshape(w * h, 4).copy()
    out[neutral, 0] = premul[:, 2]
    out[neutral, 1] = premul[:, 1]
    out[neutral, 2] = premul[:, 0]
    return out.tobytes()


def process_xcur_file(
    src_path: str,
    dst_path: str,
    fill_rgb: tuple[float, float, float],
    outline_rgb: tuple[float, float, float],
    preserve_shadow: bool,
) -> None:
    with open(src_path, "rb") as handle:
        data = handle.read()

    if len(data) < 16 or data[:4] != b"Xcur":
        shutil.copy2(src_path, dst_path)
        return

    magic, hdr_size, version, ntoc = struct.unpack_from("<4sIII", data, 0)
    chunks: list[tuple[int, int, bytes]] = []

    for i in range(ntoc):
        ctype, subtype, pos = struct.unpack_from("<III", data, hdr_size + i * 12)
        next_pos = struct.unpack_from("<I", data, hdr_size + (i + 1) * 12 + 8)[0] if i + 1 < ntoc else len(data)
        if ctype == XCUR_IMAGE_TYPE:
            ihdr, it, isub, iver, w, h, xh, yh, delay = struct.unpack_from("<9I", data, pos)
            pix_len = w * h * 4
            recolored = recolor_pixels(
                data[pos + ihdr : pos + ihdr + pix_len], w, h, fill_rgb, outline_rgb, preserve_shadow
            )
            chunk_bytes = struct.pack("<9I", ihdr, it, isub, iver, w, h, xh, yh, delay) + recolored
            chunks.append((ctype, subtype, chunk_bytes))
        else:
            chunks.append((ctype, subtype, data[pos:next_pos]))

    toc_offset = 16
    data_offset = toc_offset + ntoc * 12
    toc_entries = bytearray()
    body = bytearray()
    cur = data_offset
    for ctype, subtype, cbytes in chunks:
        toc_entries.extend(struct.pack("<III", ctype, subtype, cur))
        body.extend(cbytes)
        cur += len(cbytes)

    with open(dst_path, "wb") as out:
        out.write(struct.pack("<4sIII", magic, 16, version, ntoc))
        out.write(toc_entries)
        out.write(body)


def write_metadata(src_dir: str, tmp_dir: str, fallback_inherits: str) -> None:
    index_content = (
        f"[Icon Theme]\nName={THEME_NAME}\n"
        f"Comment=Material You dynamic cursor pack\nInherits={fallback_inherits}\n"
    )
    with open(os.path.join(tmp_dir, "index.theme"), "w", encoding="utf-8") as f:
        f.write(index_content)
    cursor_theme_src = os.path.join(src_dir, "cursor.theme")
    if os.path.isfile(cursor_theme_src):
        with open(os.path.join(tmp_dir, "cursor.theme"), "w", encoding="utf-8") as f:
            f.write(f"[Icon Theme]\nName={THEME_NAME}\nInherits={fallback_inherits}\n")


def main() -> int:
    if len(sys.argv) < 6:
        print("Usage: recolor_cursors.py <src_dir> <dest_dir> <fill_hex> <outline_hex> <preserve_shadow>", file=sys.stderr)
        return 2

    src_dir, dest_dir, fill_hex, outline_hex = sys.argv[1:5]
    preserve_shadow = sys.argv[5] == "1"
    src_cursors = os.path.join(src_dir, "cursors")
    if not os.path.isdir(src_cursors):
        return 1

    fill_rgb = parse_hex(fill_hex)
    outline_rgb = parse_hex(outline_hex)
    if detect_light_interior(src_cursors):
        fill_rgb, outline_rgb = outline_rgb, fill_rgb

    tmp_dir = f"{dest_dir}.tmp.{os.getpid()}"
    old_dir = f"{dest_dir}.old.{os.getpid()}"
    shutil.rmtree(tmp_dir, ignore_errors=True)
    tmp_cursors = os.path.join(tmp_dir, "cursors")
    os.makedirs(tmp_cursors, exist_ok=True)

    fallback = os.path.basename(os.path.normpath(src_dir))
    write_metadata(src_dir, tmp_dir, fallback)

    for entry in os.listdir(src_cursors):
        src_item = os.path.join(src_cursors, entry)
        dst_item = os.path.join(tmp_cursors, entry)
        if os.path.islink(src_item):
            os.symlink(os.readlink(src_item), dst_item)
        elif os.path.isfile(src_item):
            process_xcur_file(src_item, dst_item, fill_rgb, outline_rgb, preserve_shadow)

    if os.path.exists(dest_dir):
        os.replace(dest_dir, old_dir)
    os.replace(tmp_dir, dest_dir)
    shutil.rmtree(old_dir, ignore_errors=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
