#!/usr/bin/env python3
"""
build.py — generuje hash z wszystkich cache'owanych assetów aplikacji
           i wstrzykuje APP_VERSION do service-worker.js oraz app.js
           przed deployem.

Dlaczego hash ze WSZYSTKICH assetów (a nie tylko questions.json)?
    Service Worker cache'uje cały zestaw plików (index.html, app.js,
    styles.css, questions.json, manifest.json, ikony). Gdyby wersja
    zależała tylko od questions.json, deploy zmieniający SAM app.js lub
    styles.css nie zmieniłby APP_VERSION → użytkownicy zostaliby ze
    starym kodem w cache. Hash liczony ze wszystkich assetów gwarantuje,
    że KAŻDA realna zmiana treści unieważnia cache.

Idempotencja:
    Linia APP_VERSION jest normalizowana do placeholdera PRZED liczeniem
    hasha, więc wynik nie zależy od tego, jaka wersja jest aktualnie
    wstrzyknięta. Uruchomienie build.py wielokrotnie daje ten sam hash.

Użycie:
    python tools/build.py
"""
import hashlib
import re
import sys
from pathlib import Path

ROOT = Path(__file__).parent.parent / 'pmp-quiz-app'

# Pliki, do których wstrzykujemy APP_VERSION.
INJECT_TARGETS = [
    ROOT / 'service-worker.js',
    ROOT / 'app.js',
]

# Assety wchodzące do hasha — odpowiadają liście ASSETS w service-worker.js.
# (service-worker.js NIE jest tu — nie jest cache'owanym assetem, a jego
#  zmiana i tak jest wykrywana przez przeglądarkę po bajtach pliku SW.)
HASH_INPUTS = [
    ROOT / 'index.html',
    ROOT / 'app.js',
    ROOT / 'styles.css',
    ROOT / 'questions.json',
    ROOT / 'manifest.json',
    ROOT / 'icons' / 'icon-192.png',
    ROOT / 'icons' / 'icon-512.png',
]

PLACEHOLDER = 'build-00000000'
VERSION_RE = re.compile(r"(const APP_VERSION\s*=\s*')[^']+'")
# Rozszerzenia plików tekstowych, w których normalizujemy APP_VERSION.
TEXT_SUFFIXES = {'.js', '.html'}


def normalized_bytes(path: Path) -> bytes:
    """Zwraca bajty pliku z APP_VERSION znormalizowanym do placeholdera.

    Dzięki temu hash zależy wyłącznie od realnej treści, a nie od aktualnie
    wstrzykniętej wersji (kluczowe dla idempotencji)."""
    data = path.read_bytes()
    if path.suffix.lower() in TEXT_SUFFIXES:
        try:
            text = data.decode('utf-8')
        except UnicodeDecodeError:
            return data
        text = VERSION_RE.sub(r"\g<1>" + PLACEHOLDER + "'", text)
        return text.encode('utf-8')
    return data


def compute_version() -> str:
    """SHA-256 ze wszystkich assetów (pierwsze 8 znaków, prefiks build-)."""
    h = hashlib.sha256()
    for path in HASH_INPUTS:
        if not path.exists():
            print(f"BŁĄD: brak pliku do hasha: {path}")
            sys.exit(1)
        # Nazwa pliku w hashu — żeby przesunięcie treści między plikami
        # nie dało przypadkiem tego samego hasha.
        h.update(path.name.encode('utf-8'))
        h.update(b'\0')
        h.update(normalized_bytes(path))
        h.update(b'\0')
    return f"build-{h.hexdigest()[:8]}"


def inject_version(path: Path, version: str) -> None:
    content = path.read_text(encoding='utf-8')
    # Obsługuje zarówno 'x.y.z' jak i 'build-xxxxxxxx'
    updated = VERSION_RE.sub(r"\g<1>" + version + "'", content)
    if updated == content and f"'{version}'" not in content:
        print(f"  UWAGA: APP_VERSION nie znaleziono w {path.name}")
        sys.exit(1)
    path.write_text(updated, encoding='utf-8')
    print(f"  ✓ {path.name}  →  APP_VERSION = '{version}'")


def main() -> None:
    version = compute_version()
    print(f"\nHash assetów: {version}")

    for target in INJECT_TARGETS:
        if not target.exists():
            print(f"BŁĄD: nie znaleziono {target}")
            sys.exit(1)
        inject_version(target, version)

    print(f"\n✅ Gotowe. Deploy z wersją: {version}\n")


if __name__ == '__main__':
    main()
