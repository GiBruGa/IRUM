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

Still open: where qualified démérite results get stored/surfaced (own table? feeds into HiKleen/EkoMa
alerting?), and whether phase-1 vision-LLM calls go through the Anthropic API directly or some other
path.

## Conventions specific to this codebase

- French throughout for domain terms and UI (consistent with the rest of the UrBizia project), English
  is fine for code identifiers.
- Follows the shared UrBizia stack: GitHub (`GiBruGa` account) + Supabase project `UrBizia-DataWareHouse`
  (`mnsfstjgrueyuvejfvvk`) unless a good reason emerges to do otherwise.
- Visual identity: registered in `acronymes` (id=`IVQ`, categorie=`Identite_Visuelle`, ordre=10,
  couleur=`#540E28` matching the SitInZen family). No icon (`icon_svg`) supplied yet — placeholder,
  same convention as other not-yet-iconed rows in that table.
