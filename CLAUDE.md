# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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

Repo initialized 2026-08-30. No code yet — pre-implementation/scoping stage. Waiting on: sample I&V
photos from the user to validate detection approach, and a decision on data flow (where photos come
from — likely PointSan Mobile/SpotSan capture — and where qualified results are stored/surfaced).

## Conventions specific to this codebase

- French throughout for domain terms and UI (consistent with the rest of the UrBizia project), English
  is fine for code identifiers.
- Follows the shared UrBizia stack: GitHub (`GiBruGa` account) + Supabase project `UrBizia-DataWareHouse`
  (`mnsfstjgrueyuvejfvvk`) unless a good reason emerges to do otherwise.
- Visual identity: registered in `acronymes` (id=`IVQ`, categorie=`Identite_Visuelle`, ordre=10,
  couleur=`#540E28` matching the SitInZen family). No icon (`icon_svg`) supplied yet — placeholder,
  same convention as other not-yet-iconed rows in that table.
