# PWA Icon Generation Guide

## Quick Setup

The PWA requires icons in various sizes. Here's how to generate them:

### Option 1: Using Online Tools (Easiest)

1. Create your logo/icon (512x512 recommended)
2. Visit: https://realfavicongenerator.net/
3. Upload your icon
4. Download the generated zip
5. Extract to `/public/icons/` folder

### Option 2: Using ImageMagick (Command Line)

If you have ImageMagick installed:

```bash
# Starting with a 512x512 source icon (source.png)
cd public/icons

convert source.png -resize 72x72 icon-72x72.png
convert source.png -resize 96x96 icon-96x96.png
convert source.png -resize 128x128 icon-128x128.png
convert source.png -resize 144x144 icon-144x144.png
convert source.png -resize 152x152 icon-152x152.png
convert source.png -resize 192x192 icon-192x192.png
convert source.png -resize 384x384 icon-384x384.png
convert source.png -resize 512x512 icon-512x512.png
```

### Option 3: Placeholder Icons (For Development)

For now, you can use placeholder SVGs:

1. Create a simple SVG icon
2. Name it appropriately
3. The manifest will still work (browsers will scale)

## Current Status

The following icon sizes are referenced in `manifest.json`:
- icon-72x72.png
- icon-96x96.png
- icon-128x128.png
- icon-144x144.png
- icon-152x152.png
- icon-192x192.png (also used for shortcuts)
- icon-384x384.png
- icon-512x512.png

## Existing Icons

The project already has:
- icon-192.svg
- icon-512.svg
- icon-maskable.svg

You can convert these to PNG if needed, or update the manifest to use SVG instead.

## Recommended Icon Design

For a Discord-like app:
- Use your server/community logo
- Keep it simple and recognizable
- Use brand colors (#5865F2 for Band Chat blue)
- Ensure it works at small sizes (72x72)
- Consider a "maskable" version with safe area

## Maskable Icons

Maskable icons have extra padding for adaptive icons on Android:
- Create with 20% safe area around edges
- Use tools like https://maskable.app/ to test
