# Night Sky VR

The real sky for your place and moment, on a phone, with an optional VR headset view.
Open **https://kirtimanghosh.github.io/night-sky-vr/** in Chrome on Android, then ⋮ → *Add to Home screen* to install it as an app (works offline).

## Features
- **Exact sky**: GPS location, live clock or any date/time and speed; precession, nutation and refraction; 41,487 bright stars (HYG, to magnitude 8, moved to the current epoch with proper motions) plus 2,507,225 fainter stars to about magnitude 13–14 (AT-HYG v3.2: Tycho-2 with Gaia DR3), loaded in 10° declination strips as you zoom.
- **Solar System**: Sun, Moon, Mercury–Neptune and Jupiter's four large moons as lit 3D globes with real surface maps, IAU rotation (correct face toward Earth), true phases, Saturn's rings with ring/globe shadows, Jupiter-moon shadows and eclipses, Great Red Spot at its current longitude, Earth's shadow in lunar eclipses. Comets (Oct 2026–Jan 2027) and active meteor-shower radiants.
- **Telescope-like zoom** to an 18″ field with sidereal tracking; photographs of 674 nebulae and galaxies placed at their catalogue coordinates.
- **Freeze**: ❄ Freeze stops the view and lists the named objects in it. Tap or say a number to fly there, or say the name of anything in the sky (planet, Moon, Jupiter's moons, comet, named star, constellation, Messier object such as "M42"; English, বাংলা, हिन्दी or ଓଡ଼ିଆ). If it is below the horizon, the ground is hidden and the app says when it rises.
- **Views**: plain screen (drag or turn the phone) and split-screen headset view with adjustable lens distance; *Night view* (always dark) or *Actual view* (daylight/twilight as it really is).
- **Voice and narration** in English, বাংলা, हिन्दी and ଓଡ଼ିଆ (🌐 button on the main bar). Narration is off by default; say **explain / describe** (ব্যাখ্যা করো, समझाओ) to hear about the objects in view, **stop** (থামো, रुको) to end it, **closer / back / home** to zoom. Head tilt right/left also zooms. Constellation lines, nebula outlines and planet paths appear only during an explanation.

## Files
| Path | Content |
|---|---|
| `index.html`, `app.js`, `i18n.js` | App, rendering, narration texts (en/bn/hi/or) |
| `sw.js`, `manifest.webmanifest`, `icon-*.png` | Installable offline web app |
| `lib/` | three.js r128, Astronomy Engine 2.1.19 |
| `data/skydata.js` | Stars, constellations, deep-sky objects, nebula image placements |
| `data/deep/b00–b17.bin` | AT-HYG faint stars, 7 bytes per star (RA, Dec, magnitude, colour) |
| `data/comets.js` | Comet positions from Minor Planet Center ephemerides |
| `tex/` | Planet, moon, ring and Milky Way maps |

## Data and credits
- Positions and rotation: [Astronomy Engine](https://github.com/cosinekitty/astronomy) (MIT)
- Stars: [HYG database v3.8](https://github.com/astronexus/HYG-Database) and [AT-HYG v3.2](https://github.com/astronexus/ATHYG-Database) (Hipparcos, Tycho-2, Gaia DR3, Yale, Gliese; CC BY-SA 4.0)
- Constellation lines, Messier and bright deep-sky lists: [d3-celestial](https://github.com/ofrohn/d3-celestial) (BSD)
- Planet/moon/ring maps (Björn Jónsson and others), Milky Way panorama, nebula photographs (credited per image): [Stellarium](https://github.com/Stellarium/stellarium) (GPL-2.0)
- Comets: Minor Planet Center Ephemeris Service; JPL Small-Body Database
- Great Red Spot longitude model: estimate of 91.0° (System II) on 1 June 2026, drifting +1.75°/month ([davidastro.com](https://tools.davidastro.com/en/tools/jupiter-grs-transit-calculator)); can be set manually in Settings

## Accuracy check
Planet, Sun and Moon positions (astrometric, topocentric, Bhubaneswar) were compared with NASA JPL Horizons (DE441) on six dates between 2020 and 2035: all agree within 20″ (Sun and Mars within 2″; the Moon within 20″, about 1% of its diameter).

For personal, non-commercial use.
