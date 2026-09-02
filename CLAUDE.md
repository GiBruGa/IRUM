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

## Strategic goal of this chantier (stated explicitly 2026-08-31)

The point of this conversation/chantier is not just "get I&V detection working via Claude" — it's to
build image-analysis AI capability for UrBizia **while keeping a documented path to eventually run this
on UrBizia's own infrastructure, or on an AI solution UrBizia develops itself**, rather than staying
permanently dependent on a third-party API. This is why the ownership/architecture question was raised
and answered early (see `Note - Propriete et Architecture IA.md` in this folder): code, prompts,
taxonomy, and data all stay UrBizia's, the Claude API is today's inference choice not a lock-in, and a
self-hosted or custom-trained model remains a live option once a labeled dataset exists (see Phase 2 in
Roadmap). Every design decision in this project should keep that migration path open, not just solve for
the immediate API-based build.

## Functional scope (clarified 2026-08-31)

Officially I&V-only in name; functionally broader — see the general rules file, "Positionnement" section,
for why that gap is deliberate. In practice IVQ covers two families of findings from the same photo,
sharing one taxonomy table but routed differently downstream:

- **I&V (usager)**: alert the Exploitant in real time; can also deduct points from the reporting-user's
  or the offending-user's "permis d'utilisation" (see general rules file, points-permit principle — full
  mechanics TBD).
- **Défauts d'entretien/réglage** (calcaire, fuite de toit non réparée, crasse accumulée au sol/dans les
  cavités type lave-main, excès d'eau au sol — starting list, explicitly not exhaustive, more categories
  will be added as they come up): evaluates the cleaning/maintenance subcontractor, not the user.
  Anticipated to become a real ask from donneurs d'ordre wanting to audit that service — potential
  competitive angle for UrBizia, not just an internal QA tool.

Both need the same taxonomy table (`Incivilites_Taxonomie`) but distinguishable for routing — a
`categorie` column (or similar) will likely be needed there when this gets built; not added yet, this is
still requirements-gathering, not a build task.

**Baseline/onboarding workflow** (for bringing an *existing* sanitaire — "dans son jus" — under
supervision, not a newly-installed one): capture an initial état de fait, get the Exploitant to formally
validate it as the accepted baseline (explicitly including degradation that won't be fixed), then only
flag *new* degradation relative to that baseline going forward — plus communicate the resulting detection
capability under those baseline conditions (see the calibration caveat below, this is exactly where it
bites).

**Scoring dimensions**: absolu ("ce qu'on voit" now) + relatif (degradation since 1yr/3yr ago) — the
relatif axis is broader than Phase 2's original before/after-incident framing (see Roadmap). Confirmed
2026-08-31: this is the *same* état-vs-état comparison mechanism as the baseline/onboarding workflow
above, just comparing against a later reference point instead of the initial one — not extra difficulty
once the rest exists. Filed as a general UrBizia principle, not IVQ-specific — see the general rules
file, "Outil de comparaison d'état". Delivery cadence (times/year, quarterly floated as one example, not
decided) is deferred until the rest is built.

**Detection-capability calibration limit**: detectability depends on the interior cladding/color chosen
at install (ex.: burns on black tiling are probably undetectable). Needs its own validation procedure —
planned for *after* the model has learned more from the dark-cell photos already in the sample (or new
ones fetched specifically for this), not now.

## Dimensionnement (règle permanente, posée 2026-08-31)

Chaque lancement d'analyse d'image (même un petit lot pilote) doit enregistrer les grandeurs
permettant de dimensionner progressivement le futur service — impossible à reconstituer après coup,
donc à capter en direct à chaque exécution, jamais en option :

- Temps de traitement par photo (et total du lot).
- Équivalent tokens Claude consommés (entrée + sortie), par photo et total.
- Nb de types d'IVDER distincts détectés dans le lot (voir `lexique.IVDER` = Incivilités, Vandalismes,
  Défauts d'Entretien ou de Réparation).
- Nb total d'IVDER détectés (occurrences, pas types).
- Taux d'échec (photos non traitées : erreur API, format non supporté, etc.).

Deux ajoutés à la demande initiale de Gilles, pour la même raison (aide au dimensionnement, pas
seulement à la qualité) :
- **Coût en euros/dollars** — complément direct du compte de tokens, directement actionnable pour
  budgéter le service.
- **Répartition par niveau de confiance** (haute/moyenne/basse) — un lot avec beaucoup de "confiance
  basse" implique plus de relecture humaine à grande échelle ; c'est aussi une ressource à dimensionner,
  pas seulement un signal qualité.

Objectif : se poser systématiquement la question de ces grandeurs avant tout traitement de masse, pour
apprendre au fil des lots ce que ça coûte réellement en temps/argent/ressources humaines de relecture —
pas juste valider que la détection marche.

## Roadmap (phases, not yet both built)

- **Phase 1 (current)**: detection only, single photo, human pre-validation/counter-check before any
  action is taken on the result. No labeled training dataset exists yet — the working assumption is
  a vision-capable LLM (zero-shot/few-shot classification + reasoning) rather than a custom-trained
  CV model, to avoid needing a labeled dataset up front.
- **Phase 2 (planned)**: before/after photo comparison (same location, two timestamps) to detect what
  changed, feeding the same qualification (démérite) logic.

## Status

Repo initialized 2026-08-30.

**Phase 1 detection script working end-to-end (2026-09-02)**: `detection_iv.js` (Node, `npm install`
first) calls `client.beta.messages.parse` with a Zod schema (`betaZodOutputFormat`) for structured
output. First real pilot (3 photos, `claude-opus-5`): 3/3 success, 0% échec, $0.0368/photo, ~7.7s/photo,
4 types d'IVDER distincts / 5 occurrences. Run with:
```
cd "D:\UrBizia - Anthropic\IVQ"; npm install   # once
node detection_iv.js --limite 3 --modele claude-opus-5
```
Writes a CSV (per-photo results) + a `_dimensionnement.json` (aggregate metrics, per the Dimensionnement
rule above) next to the source photos in `I&V\`.

**Writes results into Supabase/EkoMa too (2026-09-02)**: each successful classification also uploads the
photo to `PointSan-Incidents` and inserts `Incident_Reports`/`Incident_Report_Tags` under the virtual
sanitaire `UB-DETECIA` (`verifie_humain=false`), so it shows up as an orange "à vérifier" vignette in
EkoMa's Modération/IVQ tabs — that's the actual human-review surface, not the CSV. Requires
`SUPABASE_SERVICE_ROLE_KEY` as an environment variable (Supabase dashboard → the project → Project
Settings → API → "service_role" key — **secret, never the same as the public anon key, never commit it**)
— the public anon key isn't enough because `Incident_Reports`/`Incident_Report_Tags` inserts require an
`authenticated` role by RLS design, and creating an auth session is reserved for Gilles, not something
Claude does itself. Script refuses to start (before spending on Claude) if this var is missing and
`--sans-supabase` wasn't passed. `--sans-supabase` forces CSV-only mode (no EkoMa write).

**Resume journal (2026-09-02, added for unattended/unreliable-network runs)**: `_deja_traites.log` next
to the source photos — lists filenames already fully processed (classified *and* sent to EkoMa) for that
folder; skipped automatically on the next run of the same folder. Shared across models today (no
per-model suffix) — delete/rename it to force reprocessing with a different model.

**Taxonomie à deux niveaux : catégorie IVDER + qualification (2026-09-02)**: `Incivilites_Taxonomie` got
`categorie_ivder` (short codes `I`/`V`/`E`/`R` — Incivilité/Vandalisme/Défaut d'Entretien/Défaut de
Réparation, chosen over full labels for memorability) and `propose_par_ia` (boolean). The AI's output
schema itself didn't change (`tags` stays a flat string array — simpler, no Zod/CSV/Incident_Report_Tags
rework needed) — instead the *prompt* now groups the taxonomy listing by I/V/E/R category and asks the
model to reason category-by-category, and each tag's `categorie_ivder` makes it queryable/groupable
after the fact (EkoMa's taxonomy list now shows `[I]`/`[V]`/`[E]`/`[R]` per tag). The generic "Autre" tag
was replaced by 4 category-specific ones (`Autre (Incivilité)` etc., soft-deactivated the old one, never
hard-deleted). Also added the "Défaut d'entretien"/"Défaut de réparation" tags that were only discussed
on 2026-08-31 but never actually created until now (calcaire, crasse accumulée, excès d'eau, fuite de
toit) — starting set, not exhaustive.

**AI can propose a free-text tag instead of forcing "Autre" (2026-09-02)**: when nothing in the taxonomy
fits, the prompt now asks for a short precise label (2-5 words) instead of a generic bucket — richer
signal to review than "Autre, unspecified". `enregistrerDansSupabase` auto-creates any tag the AI returns
that isn't already known, as an `Incivilites_Taxonomie` row with `propose_par_ia=true` (needed anyway to
satisfy `Incident_Report_Tags.tag`'s foreign key) — EkoMa's IVQ tab flags these with a 🆕 badge and a
"Valider" button (clears the flag once Gilles has reviewed one). Point is for Gilles to periodically scan
these and decide whether to keep/rename/formalize them into SpotSan's default list, per his own call —
Claude doesn't promote a proposed tag to "official" on its own.

**SDK gotcha (installed `@anthropic-ai/sdk` 0.70.1)**: `zodOutputFormat`/`output_config.format` from the
skill's cached docs don't exist in this version — the real path is `betaZodOutputFormat` from
`@anthropic-ai/sdk/helpers/beta/zod`, used via `client.beta.messages.parse({..., output_format: ...})`.
Its `.parsed` field is not reliably populated when a `thinking` block precedes the text block (normal on
Opus 5, thinking is on by default) — the script falls back to manually extracting the last text block and
validating it against the same Zod schema itself. Re-check this against the installed SDK version if it
gets upgraded; don't trust the skill's cached example verbatim.

**First human-validation finding**: one pilot photo ("Feu dans la cuvette.jpg") was tagged only
"Défaut de nettoyage", not "Feu / Brûlure" as the filename implies — flagged for Gilles to check by eye
(filename may be misleading, or a real model blind spot; either way this is exactly what phase 1's
human pre-validation step is for).

**Détection criteria per tag (added 2026-09-02)**: `Incivilites_Taxonomie.criteres_detection` (text,
nullable) — human-validation feedback on what a category actually looks like, fed straight into the
detection prompt (`construirePrompt` in `detection_iv.js`) when present. First entry, from Gilles after
the finding above: "Feu / Brûlure" is *never* an active fire in these photos — it's burn evidence (a hot
spot or brownish halo, soot deposit trailing upward on the wall, a soot halo on the ceiling). This is the
intended channel for correcting model blind spots discovered via human review, one tag at a time, without
touching code — EkoMa's taxonomy CRUD (IVQ tab) should eventually expose an edit field for it too (not
built yet, currently DB-only via SQL).

**Human-verification workflow "VerIA" (decided 2026-09-02)**: for spot-checking a specific detection
(cumulative-defect cases especially, or anything without a filename hint) against Gilles's own read of
the photo — reuses the existing Incident_Reports/Incident_Report_Tags pipeline rather than a disconnected
Excel trail, so findings stay structured and query-able (e.g. for a future AI-vs-human comparison).
Mechanics: a virtual sanitaire `UB-VERIA` in `SanitaryBlocks_Inventory` (`Exists=false`, so invisible to
real SpotSan users; geocoded at Gilles's own address, 76 avenue de Thouars, 33400 Talence — doesn't
functionally matter since this route bypasses SpotSan's proximity check entirely). EkoMa's IVQ tab got a
"+ Ajouter pour vérification humaine" button (local file picker + tag checkboxes + free-text remark →
uploads straight to the `PointSan-Incidents` bucket under `UB-VERIA/` and inserts the
Incident_Reports/Incident_Report_Tags rows) so Gilles never has to go through SpotSan's mobile flow for
this. Findable and editable from *either* the IVQ tab or the pre-existing Modération tab (built
2026-08-29, search-a-sanitaire-then-see-its-fiches) — both share the same `renderIncidentRow` component,
so there's no separate/duplicate UI to maintain for this.

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
