#!/usr/bin/env python3
"""Visual regression test for buddy sprite alignment.

Screenshots every skin x hair combination from /dev/sprite-grid and compares it
with the stored baseline PNGs. Any layer that drifts (hair sliding off the head,
a body painted at a different size) shows up as a pixel difference and fails.

  python tests/visual/sprite-alignment.py            # compare against baselines
  python tests/visual/sprite-alignment.py --update   # re-record baselines

Optional: --url http://localhost:8080  --tolerance 0.004
Failures write side-by-side diffs to tests/visual/diffs/.
"""

import argparse
import asyncio
import sys
from pathlib import Path

from PIL import Image, ImageChops
from playwright.async_api import async_playwright

ROOT = Path(__file__).resolve().parent
BASELINES = ROOT / "baselines"
DIFFS = ROOT / "diffs"

SKINS = ["sand", "honey", "clay", "cocoa"]
HAIRS = ["short", "bob", "long", "buns", "curly"]


def diff_ratio(a: Image.Image, b: Image.Image) -> float:
    """Share of pixels that differ noticeably between two shots."""
    if a.size != b.size:
        return 1.0
    delta = ImageChops.difference(a.convert("RGB"), b.convert("RGB")).convert("L")
    changed = sum(count for value, count in enumerate(delta.histogram()) if value > 12)
    return changed / float(a.size[0] * a.size[1])


async def capture(url: str, out_dir: Path) -> list[str]:
    out_dir.mkdir(parents=True, exist_ok=True)
    names: list[str] = []
    async with async_playwright() as playwright:
        browser = await playwright.chromium.launch(headless=True)
        context = await browser.new_context(viewport={"width": 1280, "height": 1800})
        page = await context.new_page()
        await page.goto(f"{url}/dev/sprite-grid", wait_until="networkidle")
        await page.wait_for_selector("[data-combo]")
        await page.wait_for_timeout(1200)  # let painted PNG layers decode
        for skin in SKINS:
            for hair in HAIRS:
                name = f"{skin}-{hair}"
                await page.locator(f'[data-combo="{name}"]').screenshot(path=str(out_dir / f"{name}.png"))
                names.append(name)
        await browser.close()
    return names


async def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--url", default="http://localhost:8080")
    parser.add_argument("--tolerance", type=float, default=0.004)
    parser.add_argument("--update", action="store_true")
    args = parser.parse_args()

    if args.update:
        names = await capture(args.url, BASELINES)
        print(f"recorded {len(names)} baselines in {BASELINES}")
        return 0

    if not BASELINES.exists():
        print("no baselines yet — run with --update first")
        return 1

    current = ROOT / ".current"
    names = await capture(args.url, current)

    failures: list[str] = []
    for name in names:
        baseline = BASELINES / f"{name}.png"
        if not baseline.exists():
            failures.append(f"{name}: no baseline (run --update)")
            continue
        ratio = diff_ratio(Image.open(baseline), Image.open(current / f"{name}.png"))
        if ratio > args.tolerance:
            DIFFS.mkdir(parents=True, exist_ok=True)
            a, b = Image.open(baseline).convert("RGB"), Image.open(current / f"{name}.png").convert("RGB")
            sheet = Image.new("RGB", (a.width * 2 + 8, max(a.height, b.height)), "white")
            sheet.paste(a, (0, 0))
            sheet.paste(b, (a.width + 8, 0))
            sheet.save(DIFFS / f"{name}.png")
            failures.append(f"{name}: {ratio:.4%} of pixels moved")
        else:
            print(f"ok   {name} ({ratio:.4%})")

    if failures:
        print("\nsprite alignment changed:")
        for line in failures:
            print("  fail " + line)
        print(f"\nside-by-side diffs: {DIFFS}")
        return 1

    print(f"\nall {len(names)} skin x hair combinations match their baselines")
    return 0


if __name__ == "__main__":
    sys.exit(asyncio.run(main()))
