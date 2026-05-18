#!/usr/bin/env python3
"""
Generuje ikony PNG dla PWA (192x192 i 512x512).
Użycie: python tools/generate_icons.py
"""
from PIL import Image, ImageDraw, ImageFont
import os

def create_icon(size, output_path):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)

    # Background circle
    margin = int(size * 0.05)
    draw.ellipse([margin, margin, size - margin, size - margin],
                 fill='#6366f1')

    # Inner circle (subtle)
    inner_m = int(size * 0.12)
    draw.ellipse([inner_m, inner_m, size - inner_m, size - inner_m],
                 fill='#5254cc')

    # Text "PM"
    try:
        font_size = int(size * 0.32)
        font = ImageFont.truetype('/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf', font_size)
    except Exception:
        font = ImageFont.load_default()

    text = 'PM'
    bbox = draw.textbbox((0, 0), text, font=font)
    text_w = bbox[2] - bbox[0]
    text_h = bbox[3] - bbox[1]
    x = (size - text_w) // 2 - bbox[0]
    y = (size - text_h) // 2 - bbox[1]
    draw.text((x, y), text, fill='white', font=font)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, 'PNG')
    print(f'Created {output_path} ({size}x{size})')


def main():
    create_icon(192, 'pmp-quiz-app/icons/icon-192.png')
    create_icon(512, 'pmp-quiz-app/icons/icon-512.png')


if __name__ == '__main__':
    main()
