# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Cross-project design rules (stack, naming, visual identity, data-collection philosophy) live in
`..\Regles Generales de Conception des Modules UrBizia.md` — read that first, this file only covers
what's specific to IVQ.

## What this is

IVQ (Incivility & Vandalism Qualification) is the module of the SitInZen innovation axis that turns
a raw sanitaire photo into a qualified incident: detect I&V (incivilités et vandalisme), then score
it as a "démérite" = quantité (nombre / surface / volume) × gravité (impact AMDEC / dégradation du
service rendu). It sits alongside SitInZen's other systems (sûreté intimité, prise de vue, and the
adjacent HiKleen automation / EkoMa alerting modules) but is being built as its own chantier here.

## Roadmap (phases, not yet both built)

- **Phase 1 (current)**: detection only, single photo, human pre-validation/counter-check before any
  action is taken on the result. No labeled training dataset exists yet — the working assumption is
  a vision-capable LLM (zero-shot/few-shot classification + reasoning) rather than a custom-trained
  CV model, to avoid needing a labeled dataset up front.
- **Phase 2 (planned)**: before/after photo comparison (same location, two timestamps) to detect what
  changed, feeding the same qualification (démérite) logic.

## Status

Repo initialized 2026-08-30. No code yet — pre-implementation/scoping stage.

**Photo source (decided 2026-08-30)**: IVQ consumes the I&V photos already captured by SpotSan's
"Signaler une Incivilité ou un Vandalisme" flow — SpotSan's core business purpose for UrBizia *is*
building this training dataset (see the general rules file, data-collection principle). Not a separate
collection effort. Bootstrapped today with ~100 photos taken manually before SpotSan existed, added by
Gilles. Plan: once the detection approach is validated, Gilles intends to tour all public sanitaires in
the Bordeaux area in the coming weeks specifically to bulk-collect more example photos via SpotSan.

**Admin UI (decided 2026-08-30)**: no standalone app for IVQ — settings/results/anything IVQ needs to
expose to a human goes under EkoMa, `Administration > SitInZen > IVQ` (see the general rules file,
Architecture des IHM). Not a separate app like SpotSan.

Still open: where qualified démérite results get stored (own table? feeds into HiKleen/EkoMa alerting?),
and whether phase-1 vision-LLM calls go through the Anthropic API directly or some other path.

**Data pipeline built (2026-08-30)**: `Incivilites_Taxonomie` (shared reference table, replaces the old
hardcoded 12-item lists duplicated in SpotSan/EkoMa; public read, admin-only write via
`has_tool_access('fbs','admin')`) and `Incident_Report_Tags` (junction table — multi-tag per photo, a
single incident photo can carry several I&V types at once). RPC `signaler_incivilite` updated to
`p_tags text[]`. SpotSan's report form is multi-select (was single-select). EkoMa got a new admin tab
(`Administration > SitInZen > IVQ`, flat tab for now — the general rule's `SitInZen > <Module>` nesting
isn't built as real UI nesting yet, revisit if a second SitInZen module needs it) with: photo gallery +
inline multi-tag correction (signed URLs against the private `PointSan-Incidents` bucket), taxonomy
CRUD (soft-deactivate only, never hard-delete a tag — would orphan historical taggings), and a
EXIF+CSV export (`piexifjs` + `JSZip`, both loaded via CDN — embeds UB_id/date/tags in each JPEG's
`ImageDescription`/`UserComment`, plus a `manifest.csv` fallback since EXIF is commonly stripped by
image-processing tools downstream).

Local working copy of sample photos: `D:\UrBizia - Anthropic\I&V\` (not the Supabase bucket — bucket
stays private deliberately, to prevent third-party scraping of the training set; Gilles copies photos
there by hand, that's the agreed channel for Claude to actually look at real photos).

**Legacy data still needing manual correction** (use the new EkoMa IVQ tab): `Incident_Reports` rows
5, 7, 8, 11, 13 have no tag yet — row 5's source text was garbled ("Taf + auticilanr"), rows 7/8/13 are
ambiguously "Salissures" (`Salissures volontaires` vs `Défaut de nettoyage`, needs the actual photo to
judge), row 11 originally had two free-text tags at once (now exactly what the junction table supports,
just needs Gilles to check both boxes).

## Conventions specific to this codebase

- French throughout for domain terms and UI (consistent with the rest of the UrBizia project), English
  is fine for code identifiers.
- Follows the shared UrBizia stack: GitHub (`GiBruGa` account) + Supabase project `UrBizia-DataWareHouse`
  (`mnsfstjgrueyuvejfvvk`) unless a good reason emerges to do otherwise.
- Visual identity: registered in `acronymes` (id=`IVQ`, categorie=`Identite_Visuelle`, ordre=10,
  couleur=`#540E28` matching the SitInZen family). No icon (`icon_svg`) supplied yet — placeholder,
  same convention as other not-yet-iconed rows in that table.
