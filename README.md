# Milos

Milos is the assessor-side companion to Evia. It keeps Evia's quiet avatar-led interface, uses the Milos blue (`#2C85F7`), and runs as an installable offline-first web app.

## Included in v1.1

- **Learners:** create local learner profiles; select one of the seven current Evia course routes; scan or paste a privacy-safe Evia progress QR; view course dates, time on course, KSB/AC coverage, OTJ/GLH and current targets.
- **Reviews:** import the latest Evia position, conduct a structured three-way apprenticeship progress review, agree dated actions, collect provider/apprentice/employer signatures and download a professional PDF.
- **Observation:** select several category → job → evidence-opportunity sections from Evia before starting, add more observed sections while the visit is underway without losing the record, judge their combined KSB/AC mapping, add notes and optional local media, sign, download a compiled PDF and generate the privacy-safe QR that tells Evia which criteria receive a blue `o`.
- **More:** assessor details, privacy explanation and a stable home for future tools.

All app data is local to the browser. Observation media uses IndexedDB. There is no account, analytics endpoint or application database.

The interoperable QR protocol is documented in [QR-CONTRACT.md](./QR-CONTRACT.md). Evia must implement the matching progress exporter and observation importer for live cross-app exchange.

## Run locally

Serve the repository over HTTP (camera access requires HTTPS or localhost):

```bash
python3 -m http.server 4173
```

Then open `http://localhost:4173/`.

## GitHub Pages

The repository includes a Pages deployment workflow. A new repository needs one GitHub setting before the first deployment: open **Settings → Pages**, set **Source** to **GitHub Actions**, then rerun **Deploy Milos to GitHub Pages**. Later pushes to `main` deploy automatically.

## Course packs

The app includes the current Evia packs for Bricklayer ST0095, Site Carpenter and Architectural Joiner ST0264, and the four Trowel Occupations 6570-05 pathways.

## Review record

The review form follows the current apprenticeship funding-rule structure: three-way participation, previous actions and training, evidence outside provider control, training-plan and learning-hour progress, concerns/support, comments, agreed actions and signatures. Providers remain responsible for applying the funding rules appropriate to each learner's start date.
