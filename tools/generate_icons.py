#!/usr/bin/env python3
"""
Generuje ikony PNG dla PWA (192x192 i 512x512).
Użycie: python tools/generate_icons.py
"""
from PIL import Image, ImageDraw
import os

BG = '#4F46E5'
MARK = '#FFFFFF'

def draw_mark(draw, size):
    s = size / 64
    width = max(2, int(6 * s))
    p_path = [(12*s, 52*s), (12*s, 12*s), (27*s, 12*s), (34*s, 13*s),
              (39*s, 18*s), (40*s, 25*s), (39*s, 30*s), (37*s, 34*s)]
    m_path = [(22*s, 52*s), (22*s, 39*s), (32*s, 29*s),
              (42*s, 39*s), (54*s, 27*s), (54*s, 52*s)]
    draw.line(p_path, fill=MARK, width=width, joint='curve')
    draw.line(m_path, fill=MARK, width=width, joint='curve')

def create_icon(size, output_path):
    img = Image.new('RGBA', (size, size), BG)
    draw = ImageDraw.Draw(img)
    draw_mark(draw, size)

    os.makedirs(os.path.dirname(output_path), exist_ok=True)
    img.save(output_path, 'PNG')
    print(f'Created {output_path} ({size}x{size})')


def main():
    create_icon(192, 'pmp-quiz-app/icons/icon-192.png')
    create_icon(512, 'pmp-quiz-app/icons/icon-512.png')


if __name__ == '__main__':
    main()
