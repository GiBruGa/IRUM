# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Cross-project design rules (stack, naming, visual identity, data-collection philosophy) live in
`..\Regles Generales de Conception des Modules UrBizia.md` — read that first, this file only covers
what's specific to IRUM.

## What this is

**IRUM (Incident, Repair & Upkeep Monitoring)** — renamed from "IVQ" on 2026-09-03, see "Naming
history" below — is the module of the SitInZen innovation axis that turns a raw sanitaire photo into
a qualified incident: detect IVER (Incivilités, Vandalismes, défauts d'Entretien, défauts de
Réparation), then score it as a "démérite" = quantité (nombre / surface / volume) × gravité (impact
AMDEC / dégradation du service rendu). It sits alongside SitInZen's other systems (sûreté intimité,
prise de vue, and the adjacent HiKleen automation / EkoMa alerting modules) but is being built as its
own chantier here.

## Naming history (2026-09-03)

Originally "IVQ" (Incivility & Vandalism Qualification), with the finding categories informally
called "I&V" then "IVDER". Renamed after discussion:

- **Module name**: IVQ → **IRUM** (*Incident, Repair & Upkeep Monitoring*) — "Incident" covers the
  user-behavior side (Incivilité + Vandalisme), "Repair & Upkeep" the maintenance side (défaut de
  Réparation + défaut d'Entretien), "Monitoring" covers the whole detect→qualify→quantify chain.
  **Deliberately reverses the earlier "Positionnement" decision** (see the general rules file): IVQ's
  name was chosen to stay vague about evaluating the cleaning/maintenance subcontractor, to avoid
  alarming evaluated parties. IRUM does the opposite on purpose — it names "Repair & Upkeep" openly.
  Gilles's call, 2026-09-03: the acronym should say plainly that upkeep defects are being monitored.
- **Category set name**: "I&V"/"IVDER" → **IVER** (Incivilités, Vandalismes, défauts d'Entretien,
  défauts de Réparation) — matches `Incivilites_Taxonomie.categorie_iver`'s `I`/`V`/`E`/`R` codes
  letter-for-letter (the old "IVDER" carried a spurious "D" for "Défaut", since renamed away). The E
  and R categories are implicitly negative (*manque d'*Entretien, *défaut de* Réparation), unlike I/V.
- Renamed everywhere as part of this change: GitHub repo (`GiBruGa/IVQ` → `GiBruGa/IRUM`, local folder
  to match), GitHub Pages URL (`/IVQ/` → `/IRUM/`), Supabase `tool_access.tool` key (`ivq` → `irum`),
  `Incivilites_Taxonomie.categorie_ivder` column (→ `categorie_iver`), `acronymes` row (id `IVQ` →
  `IRUM`), `lexique` entries (IVDER entry → IVER, new IRUM entry added), EkoMa's admin tab and all
  code/doc references. See git history for the exact commit.

## Strategic goal of this chantier (stated explicitly 2026-08-31)

The point of this conversation/chantier is not just "get IVER detection working via Claude" — it's to
build image-analysis AI capability for UrBizia **while keeping a documented path to eventually run this
on UrBizia's own infrastructure, or on an AI solution UrBizia develops itself**, rather than staying
permanently dependent on a third-party API. This is why the ownership/architecture question was raised
and answered early (see `Note - Propriete et Architecture IA.md` in this folder): code, prompts,
taxonomy, and data all stay UrBizia's, the Claude API is today's inference choice not a lock-in, and a
self-hosted or custom-trained model remains a live option once a labeled dataset exists (see Phase 2 in
Roadmap). Every design decision in this project should keep that migration path open, not just solve for
the immediate API-based build.

## Functional scope (clarified 2026-08-31, positioning reversed 2026-09-03)

Originally named to stay I&V-only on the surface, functionally broader underneath (see "Naming
history" above) — that deliberate ambiguity was the whole point of the old "IVQ" name (general rules
file, "Positionnement" section). **Reversed on 2026-09-03**: the new name "IRUM" openly names both
sides. In practice the module covers two families of findings from the same photo, sharing one
taxonomy table but routed differently downstream:

- **I/V (usager)**: alert the Exploitant in real time; can also deduct points from the reporting-user's
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
once the rest exists. Filed as a general UrBizia principle, not IRUM-specific — see the general rules
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
- Nb de types d'IVER distincts détectés dans le lot (voir `lexique.IVER` = Incivilités, Vandalismes,
  Défauts d'Entretien ou de Réparation).
- Nb total d'IVER détectés (occurrences, pas types).
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
4 types d'IVER distincts / 5 occurrences. Run with:
```
cd "D:\UrBizia - Anthropic\IRUM"; npm install   # once
node detection_iv.js --limite 3 --modele claude-opus-5
```
Writes a CSV (per-photo results) + a `_dimensionnement.json` (aggregate metrics, per the Dimensionnement
rule above) next to the source photos in `I&V\`.

**Writes results into Supabase/EkoMa too (2026-09-02)**: each successful classification also uploads the
photo to `PointSan-Incidents` and inserts `Incident_Reports`/`Incident_Report_Tags` under the virtual
sanitaire `UB-DETECIA` (`verifie_humain=false`), so it shows up as an orange "à vérifier" vignette in
EkoMa's Modération/IRUM tabs — that's the actual human-review surface, not the CSV. Requires
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

**Taxonomie à deux niveaux : catégorie IVER + qualification (2026-09-02, column renamed 2026-09-03)**:
`Incivilites_Taxonomie` got `categorie_iver` (short codes `I`/`V`/`E`/`R` — Incivilité/Vandalisme/Défaut
d'Entretien/Défaut de Réparation, chosen over full labels for memorability; column originally named
`categorie_ivder`, renamed alongside the IVQ→IRUM rename) and `propose_par_ia` (boolean). The AI's output
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
satisfy `Incident_Report_Tags.tag`'s foreign key) — EkoMa's IRUM tab flags these with a 🆕 badge and a
"Valider" button (clears the flag once Gilles has reviewed one). Point is for Gilles to periodically scan
these and decide whether to keep/rename/formalize them into SpotSan's default list, per his own call —
Claude doesn't promote a proposed tag to "official" on its own.

**Preserve the AI's original diagnosis, separate from human correction (2026-09-03)**: `Incident_Reports`
got `tags_ia_origine text[]`, snapshotted once at insert time by `detection_iv.js` and never touched again
— `Incident_Report_Tags` (edited via EkoMa's moderation modal) is the *current/corrected* state, so a
human edit no longer erases what the AI actually said. Necessary, not optional: without both states there
is no way to measure AI accuracy, mine recurring error patterns to improve the prompt (as already done
for "Feu / Brûlure"), or build a real training/eval set for a future self-hosted model — all three are
already-stated goals of this chantier. EkoMa's moderation fiche shows the frozen AI diagnosis (tags +
confiance) read-only above the editable checkboxes. (Note: this line and the tab name were "IVQ"
before the 2026-09-03 rename.)

**Review-queue usability (2026-09-03)**: the IRUM tab's checkbox list was unusable once the taxonomy grew
past ~200 AI-proposed entries — now filtered per-photo to official tags + whatever's actually linked to
that photo, not the full list. Gallery got a "Seulement à vérifier" filter (`verifie_humain=false`) and a
"Confiance basse d'abord" client-side sort (Postgres/alphabetical order doesn't match basse<moyenne<haute
severity), both as module-level toggles surviving tab switches. Vignettes show a small confidence dot
(rouge=basse/orange=moyenne/vert=haute) in addition to the existing verified/unverified badge.

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
touching code — EkoMa's taxonomy CRUD (IRUM tab) should eventually expose an edit field for it too (not
built yet, currently DB-only via SQL).

**Human-verification workflow "VerIA" (decided 2026-09-02)**: for spot-checking a specific detection
(cumulative-defect cases especially, or anything without a filename hint) against Gilles's own read of
the photo — reuses the existing Incident_Reports/Incident_Report_Tags pipeline rather than a disconnected
Excel trail, so findings stay structured and query-able (e.g. for a future AI-vs-human comparison).
Mechanics: a virtual sanitaire `UB-VERIA` in `SanitaryBlocks_Inventory` (`Exists=false`, so invisible to
real SpotSan users; geocoded at Gilles's own address, 76 avenue de Thouars, 33400 Talence — doesn't
functionally matter since this route bypasses SpotSan's proximity check entirely). EkoMa's IRUM tab got a
"+ Ajouter pour vérification humaine" button (local file picker + tag checkboxes + free-text remark →
uploads straight to the `PointSan-Incidents` bucket under `UB-VERIA/` and inserts the
Incident_Reports/Incident_Report_Tags rows) so Gilles never has to go through SpotSan's mobile flow for
this. Findable and editable from *either* the IRUM tab or the pre-existing Modération tab (built
2026-08-29, search-a-sanitaire-then-see-its-fiches) — both share the same `renderIncidentRow` component,
so there's no separate/duplicate UI to maintain for this.

**Photo source (decided 2026-08-30)**: IRUM consumes the IVER photos already captured by SpotSan's
"Signaler une Incivilité ou un Vandalisme" flow — SpotSan's core business purpose for UrBizia *is*
building this training dataset (see the general rules file, data-collection principle). Not a separate
collection effort. Bootstrapped today with ~100 photos taken manually before SpotSan existed, added by
Gilles. Plan: once the detection approach is validated, Gilles intends to tour all public sanitaires in
the Bordeaux area in the coming weeks specifically to bulk-collect more example photos via SpotSan.

**Admin UI (decided 2026-08-30, revised 2026-09-03)**: originally no standalone app for IVQ —
everything went under EkoMa, `Administration > SitInZen > IVQ`. Revised 2026-09-03: IRUM now has its
own independent Svelte/Vite app (`app/`, deployed to `gibruga.github.io/IRUM/`), mirroring FBS/RFQ/
SpotSan's pattern — see "Admin app (independent repo, 2026-09-03)" below. Intended to be re-attached
under EkoMa's `Administration > SitInZen` menu once mature; EkoMa's own IRUM tab stays in the meantime
for the review workflows not yet ported (VerIA upload, EXIF export).

Still open: where qualified démérite results get stored (own table? feeds into HiKleen/EkoMa alerting?),
and whether phase-1 vision-LLM calls go through the Anthropic API directly or some other path.

**Data pipeline built (2026-08-30)**: `Incivilites_Taxonomie` (shared reference table, replaces the old
hardcoded 12-item lists duplicated in SpotSan/EkoMa; public read, admin-only write via
`has_tool_access('fbs','admin')`) and `Incident_Report_Tags` (junction table — multi-tag per photo, a
single incident photo can carry several IVER types at once). RPC `signaler_incivilite` updated to
`p_tags text[]`. SpotSan's report form is multi-select (was single-select). EkoMa got a new admin tab
(`Administration > SitInZen > IRUM`, flat tab for now — the general rule's `SitInZen > <Module>` nesting
isn't built as real UI nesting yet, revisit if a second SitInZen module needs it) with: photo gallery +
inline multi-tag correction (signed URLs against the private `PointSan-Incidents` bucket), taxonomy
CRUD (soft-deactivate only, never hard-delete a tag — would orphan historical taggings), and a
EXIF+CSV export (`piexifjs` + `JSZip`, both loaded via CDN — embeds UB_id/date/tags in each JPEG's
`ImageDescription`/`UserComment`, plus a `manifest.csv` fallback since EXIF is commonly stripped by
image-processing tools downstream).

Local working copy of sample photos: `D:\UrBizia - Anthropic\I&V\` (not the Supabase bucket — bucket
stays private deliberately, to prevent third-party scraping of the training set; Gilles copies photos
there by hand, that's the agreed channel for Claude to actually look at real photos).

**Legacy data still needing manual correction** (use the new EkoMa IRUM tab): `Incident_Reports` rows
5, 7, 8, 11, 13 have no tag yet — row 5's source text was garbled ("Taf + auticilanr"), rows 7/8/13 are
ambiguously "Salissures" (`Salissures volontaires` vs `Défaut de nettoyage`, needs the actual photo to
judge), row 11 originally had two free-text tags at once (now exactly what the junction table supports,
just needs Gilles to check both boxes).

## Conventions specific to this codebase

- French throughout for domain terms and UI (consistent with the rest of the UrBizia project), English
  is fine for code identifiers.
- Follows the shared UrBizia stack: GitHub (`GiBruGa` account) + Supabase project `UrBizia-DataWareHouse`
  (`mnsfstjgrueyuvejfvvk`) unless a good reason emerges to do otherwise.
- Visual identity: registered in `acronymes` (id=`IRUM`, categorie=`Identite_Visuelle`, ordre=10,
  couleur=`#540E28` matching the SitInZen family; row was id=`IVQ` before the 2026-09-03 rename). No
  icon (`icon_svg`) supplied yet — placeholder, same convention as other not-yet-iconed rows in that
  table.

## Admin app (independent repo, 2026-09-03)

`app/` is IRUM's own Svelte 5 + Vite admin UI, gated behind EkoMa's Supabase Auth session via the
shared `initEkoGate` (see `EkoMa/auth-gate.js`, tool key `irum`) — same pattern as FBS/RFQ. Deployed
via GitHub Actions (`.github/workflows/deploy.yml`, root-level, `working-directory: app`) to
`gibruga.github.io/IRUM/` on push to `app/**`. Local dev: `.claude/launch.json` config `irum-app`
(port 5174).

**Catalogue Tag IVER — refonte arborescence (2026-09-04)**: replaced the original flat two-column
Actifs/En-attente UI with a real tree (`app/src/lib/Catalogue.svelte` + `catalogue/TreeNode.svelte` +
`catalogue/FicheIver.svelte` + `catalogue/cle.js`). Design agreed with Gilles, three load-bearing
principles:

1. **The `clé` (e.g. `I.3.2`) is not a permanent identity — it's just an address in the current tree,
   and it's expected to shift** when tags get reorganized. This is safe because of principle 2.
2. **Never retroactive.** `Incident_Report_Tags` got `cle_enregistree`/`label_enregistre` (nullable) —
   a *frozen snapshot* of the tag's clé+label written once at tagging time, never a live join to
   `Incivilites_Taxonomie`. Renaming, reclassifying, or moving a tag in the Catalogue never touches a
   single existing photo, no matter how many millions there eventually are — reordering only ever
   writes to the taxonomy table itself (a few hundred rows), which is why this scales fine. A gap
   between a photo's frozen label and that clé's current label in the live catalogue signals "this
   came from an earlier version of the catalogue" — `Catalogue_Versions` (full JSON snapshots, taken via
   the "💾 Sauvegarder le catalogue" button, titled with the save date) is where you'd go to look up
   what a clé meant as of a given date, if that ever needs auditing.
3. **No AI-suggested tag should stay in limbo.** The left column lists `propose_par_ia=true` rows
   (excluded from the tree itself — showing up in both places would be redundant). Dragging one onto
   an existing tree node declares an *equivalence* (`Tags_IA_Equivalences` table: free text → official
   tag; the AI-proposed row is then set `actif=false, propose_par_ia=false`, absorbed, never deleted).
   Dragging one onto a category (I/V/E/R) header instead *promotes* it directly as a new official node.
   Equivalences feed back into `detection_iv.js`'s prompt (see below) so the AI stops re-proposing a
   variant once it's been mapped, and into Pondération's arbitration screen as a one-click suggestion
   (see below) — but never rewrite history on their own.

Schema (migration `catalogue_iver_arborescence`, 2026-09-04): `Incivilites_Taxonomie` gained
`parent_tag` (self-referencing, nullable — hierarchy under each I/V/E/R root, which stays a virtual
grouping via `categorie_iver`, not real rows), `label` (≤50 chars, editable display name — `tag` itself
stays the immutable internal identifier/FK target, never shown or renamed), `cle` (unique). Existing 345
rows were backfilled as flat first-level children of their category (`label = tag`, `cle = "<catégorie>.<n>"`).
New tables `Tags_IA_Equivalences` and `Catalogue_Versions` (RLS: public read on equivalences, `fbs`-admin
write on both — same convention as the rest of this table family, see the `fbs`-vs-`irum` note in
"Naming history"). Any code that inserts into `Incivilites_Taxonomie` must set `label`/`cle` (NOT NULL) —
`detection_iv.js` and `DetailPhoto.svelte`'s "create new tag" path both use `label: tag.slice(0,25)`,
`cle: "?.<tag>"` for on-the-fly AI-proposed rows (unclassified until dragged into the tree).

Known Svelte gotcha hit while building this: an `$effect` that both reads and writes the same `$state`
(here, the search-driven "auto-expand ancestors" effect reading `ouverts` via spread to merge into it)
is an infinite loop in Svelte 5 — fixed by wrapping the write in `untrack()` so the effect depends only
on the search term, not on its own prior output.

**Equivalences wired into both consumers (2026-09-04)**: `detection_iv.js` gained `chargerEquivalences()`
(reads `Tags_IA_Equivalences`, called alongside `chargerTaxonomie()` in `main()`), injected into
`construirePrompt()` as a "these free-text variants mean X, use X instead" reminder block. `DetailPhoto.svelte`
(Pondération) computes `suggestionsEquivalence` from the photo's `tags_ia_origine` against the same table
and surfaces one-click "Appliquer « X »" chips above the tag decision — applying one only stages the
change locally, same Enregistrer/Annuler flow as everything else in that panel, so principle 2 above still
holds (nothing is retroactive until the pondérateur explicitly saves that specific photo).

**Pondération (built 2026-09-03)**: `app/src/lib/Ponderation.svelte` + `DetailPhoto.svelte`. Review
bandeau for photos needing expert arbitration. "En litige" is *derived automatically*, never manually
flagged (`estLitige()` in `Ponderation.svelte`) — either (a) a mismatch between `tags_utilisateur` and
`tags_ia_origine` on the same `Incident_Reports` row, or (b) a systematic 1-in-10 sample among rows
that went through AI detection, using `Report_id` (a monotonic sequence) as the "compteur" rather than
a dedicated column. Filterable by sanitaire (`UB_id` search) and date range for full browsing, with an
"en litige seulement" toggle (default on). Per-photo detail (`DetailPhoto.svelte`) shows the frozen AI
diagnosis and the user declaration side by side, and — only when both exist — a 3-way diff (confirmé /
ajouté par l'IA / retiré par l'IA); the editable decision starts from the current `Incident_Report_Tags`
state (not recomputed from scratch, so it never silently discards an earlier human correction), with a
tag-catalogue search before creating any new tag (mirrors Catalogue's anti-duplicate pattern) and
`Incivilites_Taxonomie` insert-on-create for genuinely new tags (required by `Incident_Report_Tags.tag`'s
foreign key, same as `detection_iv.js`'s auto-registration).

**Known gap (found while building, 2026-09-03)**: `tags_utilisateur` exists on every row but is 0/1077
populated today — the SpotSan user-reporting pipeline and the IRUM bulk AI-detection pipeline
(`UB-DETECIA`) are still two disjoint flows over different photos, not the same photo evaluated by both.
So litige mode (a) will surface nothing until AI detection also runs against real user-submitted
signalements; only mode (b) (the 1/10 sample) populates the queue for now. The code is written correctly
for when that gap closes — not a bug, just not wired up yet. Data model as specified: each tag carries up
to 3 "opinions" (Utilisateur = `tags_utilisateur`, IA = `tags_ia_origine`, Pondérateur = the edited
`Incident_Report_Tags`) — "officiel" by default when Utilisateur and IA agree (recoupé); on disagreement
(incohérence), the Pondérateur's saved decision is final. **Refined 2026-09-04** (see the general rules
file, "Réconciliation IA/Usager via la position dans l'arborescence"): "recoupé" isn't strict string
equality — an AI tag that's equivalent to or a more precise descendant of the user's tag in the
Catalogue tree also counts as agreement. `estLitige()` doesn't implement this yet (still a plain string
comparison) — no practical effect while `tags_utilisateur` stays empty, but needs doing before the two
pipelines converge on the same photos.

**Mise en forme + curation usager (2026-09-04)**: `App.svelte` wordmark now two-tone (`IRU`/`M`, charte
graphique `--wm-strong`/`--wm-soft`) plus a footer "IRUM est un service UrBizia" with the UrBizia mark
fetched live from `acronymes` (id `UrBizia`, same pattern as FBS — hardcoded SVG-in-code fallback, never
a bare static file, per the charte's §2 and the EkoMa-favicon incident in `feedback-read-general-rules-first`).
`.app` widened to 1700px; Catalogue's grid is now `440px 1.5fr 280px` (IA column ×2, arborescence ×1.5)
with `padding-right` on the IA list so the dashed cards don't touch the scrollbar.

Added `Incivilites_Taxonomie.propose_utilisateur` (default `false`) — see the general rules file,
"Curation des tags proposés aux usagers" — a toggle in Fiche IVER, separate from `actif`, controlling
whether SpotSan's tag picker offers that tag at all. Backfilled `true` only for the 19 pre-existing
curated tags (`actif=true and not propose_par_ia`); every AI-proposed tag defaults to hidden from users
until deliberately curated in. `SpotSan/src/lib/incidents.js`'s `chargerTaxonomieIncivilites()` now
filters on both `actif` and `propose_utilisateur`.

**Fiche IVER: two real bugs fixed (2026-09-04)**: (1) `label` cap was 25 chars but real pre-existing
labels routinely exceed that (backfill just copied `tag` verbatim, often 30+ chars) — Enregistrer's
client-side length guard fired silently on any unedited long label, discarding the whole save (label,
remarques, propose_utilisateur alike) with no visible error. Raised to 50 everywhere the cap is enforced
(`FicheIver.svelte`, `detection_iv.js`, `DetailPhoto.svelte`'s inline tag creation). (2) A Postgres
UPDATE blocked by RLS (no `fbs`-admin session — e.g. testing locally with no EkoMa login shared via
`gibruga.github.io`) returns `error: null` and 0 rows changed, not an error — silently discarded the
edit. `Catalogue.svelte` now has `majOuErreur()`, which appends `.select()` and throws a clear message
("vérifie que tu es bien connecté sur EkoMa...") when nothing came back, used by every write in that
file (reparent, promote, equivalence, Fiche save, delete). `DetailPhoto.svelte`/Pondération has the same
latent risk and doesn't have this guard yet — worth the same fix if it turns out to bite there too.

Also added: a **Supprimer** button in Fiche IVER (native `confirm()`, then deletes the
`Incivilites_Taxonomie` row) — protected for free by existing FK behavior:
`Incident_Report_Tags.tag → Incivilites_Taxonomie.tag` has no `ON DELETE` clause (defaults to `NO
ACTION`), so Postgres refuses if the tag is already used on a real photo, rather than silently orphaning
history — the raw Postgres FK error (`error.code === '23503'`) is caught in `supprimerTag()` and
replaced with a plain-language message pointing at the **Actif** checkbox (re-added to Fiche IVER,
2026-09-04 — dropped by mistake in the arborescence rewrite, this is how you "soft-delete" a tag that's
already in use) as the real alternative. A tag with children gets them promoted to root of the same
category (`parent_tag` → null via `ON DELETE SET NULL`), not orphaned into "Non classé". Category
headers in the tree are now plural ("Incivilités", "Vandalismes", "Défauts d'entretien", "Défauts de
réparation").

**Hard-delete resolved (2026-09-04)**: Gilles asked whether a tag could be deleted for real, given the
whole point of `cle_enregistree`/`label_enregistre` was "no retroactive effect." At the time, not quite
true — those frozen columns were only written by `detection_iv.js`/`DetailPhoto.svelte` (both added
that same day); every row from before, or written via EkoMa's moderation modal / SpotSan's
`signaler_incivilite` RPC (neither updated to populate the snapshot), had the live `tag` FK as its only
record of which tag applied. Resolved same day, three migrations:

1. **`backfill_snapshot_tags_photos`**: every `Incident_Report_Tags` row missing a snapshot (2856/2856
   at the time) got `cle_enregistree`/`label_enregistre` copied from the *current* live
   `Incivilites_Taxonomie` row for its `tag` — not a true historical value (never existed), but the best
   available, and it closes the gap in one pass.
2. **`cle_legacy_par_photo`**: revised the `cle_enregistree` half of that backfill per Gilles's refinement
   — a legacy `cle` should read as "from before the clé system existed," not borrow today's live
   position (which implies a precision that isn't real). Namespaced `0.0`, `0.1`, `0.2`... **numbered per
   photo** (`row_number() over (partition by report_id order by tag)`), not a stable per-tag mapping —
   "unicité pour la photo en cours, mais pas de lien dans le temps" (two tags on the same photo never
   collide; the same tag on two different photos can get different `0.N` values, deliberately — no
   claimed continuity). `label_enregistre` untouched by this step, still the real tag text.
3. **`incident_report_tags_surrogate_pk`**: `ON DELETE SET NULL` needs `tag` nullable, which was
   impossible — `tag` was part of the composite primary key `(report_id, tag)`, and PK columns can't be
   null. Added a surrogate `"Tag_id" bigint generated always as identity primary key` (named to match
   the schema's `Report_id`/`UB_id` convention, not a generic `id` — Gilles's call), kept `(report_id,
   tag)` as a plain `UNIQUE` constraint (same duplicate-tag-per-photo protection as before), then swapped
   the `tag` FK to `on delete set null`.

`Catalogue.svelte`'s `supprimerTag()` simplified back down accordingly — no more catching a
foreign-key-violation error, deletion just works and detaches cleanly.

**Actif checkbox removed again, same day**: added to Fiche IVER as the delete-alternative above, then
immediately called redundant by Gilles now that (a) delete genuinely works and (b) `propose_utilisateur`
already answers "should this be offered" for the case that actually matters (SpotSan's picker). Pulled
back out of `FicheIver.svelte` — the `actif` column and its other consumers (`detection_iv.js`'s
`chargerTaxonomie()` filter, `TreeNode.svelte`'s dimming) are untouched, just no UI writes it anymore.

**Reordonner comme frère, pas seulement "devenir enfant" (2026-09-04)**: `TreeNode.svelte` only
supported dropping *onto* a row (always reparents as a child) — no way to just reorder without changing
depth, reported by Gilles. Fixed with a 3-zone drop target per row (top 30%/middle/bottom 30% of the
row's height, via `dragover`'s `clientY` vs `getBoundingClientRect()`): top = insert as sibling before,
bottom = insert as sibling after, middle = existing "become child" behavior. `Catalogue.svelte`'s new
`reordonner()` renumbers the *whole* affected sibling group (not just the moved tag) — `renumeroterSousArbre()`
per sibling, since inserting in the middle shifts every subsequent sibling's `cle` (and thus its
descendants' `cle` prefixes) and `ordre`.

**Validation différée du Catalogue (2026-09-11)**: every tree action (drag reorder/reparent, promote,
equivalence, add, delete, Fiche IVER edits) now mutates a local draft (`brouillon` in `Catalogue.svelte`)
only — nothing touches Supabase until "Valider les modifications" is clicked, which renumbers the whole
tree from its final structure and applies a verified diff in one pass. Root cause this fixed: a silent
RLS no-op on an unverified `cle` write had left a tag's `cle` stale after it moved back to root (found by
inspecting live data: `parent_tag` was correctly `null` but `cle` still read "I.2.1" as if nested). Also
this session: Fiche IVER panel moved above Arborescence, both now fill real window height via CSS flexbox
(no JS-measured `max-height`), a right-click context menu (add tag below / delete) was added to tree rows
with clear before/child/after drop-zone labels, category badges show a fixed single color again with a
separate neutral dot for `propose_utilisateur` (two shades of the category hue read as "the category's
true color = valid", confusing — Gilles's call), and deletion is staged too: a marked tag stays visible
struck-through with an "à supprimer" badge, undoable via right-click, until Valider actually deletes it
(child detachment, i.e. `parent_tag → null`, is computed fresh at validation time, not eagerly in the
draft, so undo has nothing to reverse).

**Known bugs reported by Gilles, 2026-09-11 — all four fixed same day**:
1. ~~Dragging an AI-suggested tag onto an existing tree row silently absorbs it as an equivalence instead
   of inserting it as a new node~~ — resolved by design discussion, not a code fix: Gilles confirmed the
   underlying tension is that the *official* IVER list must stay small (needed for statistical
   aggregation), so every non-promoted AI proposal should always fold into an existing official tag via
   equivalence, never become a tree node of its own. The real gap was that this folding was invisible —
   see "Tags IA Associés" below, which is the actual fix.
2. ~~Cannot type a space in Fiche IVER's Label/Remarques fields~~ — fixed: `FicheIver.svelte` no longer
   trims on every keystroke (was staging the trimmed value into the draft, which round-tripped back through
   the `noeud`-sync `$effect` and erased the space the instant it was typed); trimming now happens once, in
   `validerMiseAJour`, right before the real write.
3. ~~SpotSan checkbox should come before the Label input~~ — reordered in the compact row.
4. ~~`duplicate key value violates unique constraint "incivilites_taxonomie_cle_key"` on Valider~~ — fixed:
   `validerMiseAJour()` now neutralizes every `cle` that's about to change to a unique temp placeholder
   (`"~" + tag`) in a first pass, before writing any final values in the second pass — avoids the transient
   collision when a reorder swaps `cle` values between siblings. (A `DEFERRABLE` constraint would not have
   helped: each Supabase REST call is its own auto-committed transaction, there's no single transaction
   spanning the write loop to defer within.)

**"Tags IA Associés" panel (2026-09-11)**: added between Fiche IVER and Arborescence in `Catalogue.svelte`.
Once an equivalence was declared it became invisible — no way to see, for a given official tag, which AI
free-text variants point to it, so no way to check they're still relevant after editing that tag, or to
fix a wrong association. This panel lists the AI texts currently equivalent to the *selected* tag; drag
one onto a different tree row to repoint it (reassociation is literally the same `declarerEquivalence()`
call as a fresh association — a `Map` naturally overwrites), or hit "×" to dissociate it back into "Tags
suggérés IA" as if it had never been rattached. Equivalences now follow the same draft/original diffing
as the rest of the file (`equivalences` = server truth, `equivalencesBrouillon` = `Map<texte_ia, tag>`
being edited) instead of a write-only pending list — so associate/reassociate/dissociate are all counted
correctly in `nbModifications` and only reach Supabase (`upsert`/`delete`) on Valider, per Gilles's explicit
requirement that this stay consistent with the deferred-validation model.

**"Autre" is a user-only fallback, never for the IA or a moderator (2026-09-11)**: the 3 generic
`Autre (Vandalisme)`/`Autre (Défaut d'entretien)`/`Autre (Défaut de réparation)` taxonomy rows exist so
SpotSan's picker always has *something* to offer an usager who can't qualify precisely what they saw — they
were never meant as a legitimate pick for the detection pipeline or a human moderator, both of which are
expected to qualify exactly what they observe (free text if nothing in the taxonomy fits, see the
"AI can propose a free-text tag" note above). Fixed same day: `detection_iv.js`'s `construirePrompt()` now
excludes any tag starting with `Autre` from what's listed to the model per category (it was contradicting
the very next sentence of the prompt, "propose un intitulé précis" instead of a catch-all), and
`DetailPhoto.svelte`'s moderator-facing tag-search suggestions do the same. `propose_utilisateur` on these
rows is untouched — SpotSan's own picker should keep offering them.

## Catalogue redesign & démérite scoring model — design session (2026-09-15)

Gilles is building his own IVER catalogue independently and asked Claude to do the same exercise in
parallel using the AI-suggested tags, to compare results ("voir si on se rejoint") before officializing
either. Not started yet — this section captures the design discussion that needs to be resolved first, so
none of it is lost if the work is picked up in a later session.

**Why the catalogue work is paused**: building it now, on only the 325 AI-proposed tags collected so far,
risks missing categories that would show up once the rest of the photo backlog is processed. Status of
the `I&V` folder as of 2026-09-15: 2020 photos total, 1065 already processed into `UB-DETECIA`, **955
remaining**. Gilles's call: process all 955 before building the catalogue (`node detection_iv.js --limite
955 --modele claude-opus-5` from `IRUM/`, run from the app's own directory) — estimated ~$35 and ~2h
sequential at the documented pilot rate (~$0.037/photo, ~7.7s/photo). **Launched 2026-09-15** (background
task, ~2h expected): `ANTHROPIC_API_KEY` already existed as a Windows user env var but was set *after*
this Claude session's shell had already started, so it wasn't inherited — fixed without a session restart
by reading the current value straight from the registry via PowerShell at the point of running the
command (see `Regles Generales de Conception des Modules UrBizia.md`, "Clé API Anthropic", for the exact
one-liner — reusable for any env var in the same situation). Once the batch finishes: re-pull the
AI-suggested tag list (was 325, pre-batch) before building the catalogue proposal below.

**Gilles's classification guidelines** (his own working rules, used to build his independent catalogue,
given to Claude as the brief for the parallel exercise):
1. Attach each tag to one and only one IVER category when possible.
2. I/V vs E/R positioning designates a "culprit" — either the usager (I/V) or the exploitant (E/R).
3. Don't force a tag into one category when there's a real chance it originated from the other — split
   into two distinct tags instead when needed. Example: "Trace d'excrément sur le sol" is cleanly
   Incivilité, but "Traces *anciennes* d'excrément" is clearly a défaut d'entretien — the age/staleness of
   the trace is the signal that flips responsibility from usager to exploitant, so these must be two
   different tags, not one ambiguous one.
4. Goal: statistical rollups on an IVER typology at multiple depth levels. Two worked examples Gilles gave:
   - "Excréments hors bol toilette ou urinoir" → sur le sol / sur les murs / sur l'assise toilette ou bord
     urinoir / sur les équipements (localisation) → Fèces / Urines / Sang (nature, deeper level).
   - "Défaut de nettoyage" → tartre / résidus d'excréments / détritus demeurant / fluides dispersés
     demeurant (type de défaut) → au sol / aux murs / sur l'assise toilette ou bord urinoir / sur les
     équipements (localisation) — note the nesting order is reversed vs. the first example (type-then-
     location vs. location-then-nature) — Gilles nests whichever axis makes more sense per branch, not a
     fixed cross-product order. Claude's catalogue must decide, per branch, which axis to nest first
     rather than assume one fixed order everywhere.
5. This implies the classification needs 2 "ghost" (implicit, not user-facing tags themselves) subdivisions
   plus 2 real axes (+ 1 possible extra, relevance unconfirmed):
   1. **Responsabilité** (ghost) + **Catégorie**: Utilisateur → I or V; Exploitant → E or R. (Whether
      Responsabilité needs to be an explicit tree layer above I/V/E/R, or stays purely implicit the way
      categorie_iver already encodes it today, is still open — not yet asked.)
   2. **Typologie de défaut** (nature of the defect, can go several levels deep).
   3. **Localisation**.
   4. **Circonstance** (relevance to confirm, see Permanence below) — after usager passage, after cleaning
      crew passage, or after maintenance crew passage.
6. Long characterization codes are the cost of this — so the *typologie de défaut* axis specifically needs
   to stay bounded, using an AMDEC-style Gravité tier, classified increasing, as the lever to keep it
   manageable rather than letting it grow unbounded. Gilles's own draft scale (before Claude's proposed
   fix, see below): inconfort visuel (1), difficultés d'utilisation (2), inconfort olfactif (4), utilisation
   limitée à la fonction principale (5), utilisation dégradée pour toutes les fonctions (7), utilisation
   fortement dégradée pour toutes les fonctions (7 — duplicate weight, flagged), utilisation impossible du
   fait de la dégradation globale du service (10).

**Le modèle de démérite** (Gilles, 2026-09-15) — four factors, not two:

```
Qualification (Quoi × Où) × Quantification  →  Gravité (dégradation du service / impact immédiat)
Gravité × Permanence(-risque)  =  Démérite
```

- **Qualification** = Typologie de défaut (Quoi) × Localisation (Où) — this *is* the catalogue: every
  leaf tag is one Qualification. In scope now.
- **Quantification** (nombre / surface / volume) — a **per-observation measurement**, not a property baked
  into the tag tree. Gilles: this is its own workstream, to pilot on a sample of IVER-positive photos, then
  generalize to all of them. Out of scope for the catalogue itself; deferred as a separate project.
- **Gravité** = f(Qualification, Quantification). Claude's working model, confirmed reasonable by Gilles
  pending Claude's own proposed scale (below): each leaf tag carries a **base Gravité tier**; Quantification
  then modulates it (a small/isolated instance stays at the base tier, an extensive one escalates a tier
  or two) rather than Gravité being computed by some other formula entirely.
- **Permanence** — refined twice by Gilles in this session. First cut: whether the defect persists despite
  automated treatment / cleaning crew / maintenance crew passing (linked to "Circonstance" above). Second,
  more precise cut: **not a constat (a fact observed on one photo) — a *risque de permanence*, an estimated
  likelihood** derived from Qualification × Quantification, which then gets *verified* later by an actual
  field/repeat observation. This is exactly why statistics matter here: the risk estimate needs calibrating
  against real recurrence data over time — which depends on the "outil de comparaison d'état" (avant/après,
  Phase 2 in the roadmap) not yet built. Deferred, and explicitly depends on Quantification being solved
  first (Gilles: "une fois d'accord sur les typologies et une quantification, je serais en mesure d'évaluer
  ... un risque de permanence").

**Purpose of the Démérite score** (why this matters enough to get this precise), per Gilles:
1. Tell the party at fault (usager, service Nettoyage, service Maintenance) how their action is being judged.
2. For usagers specifically: potentially justify deducting points from their "permis d'utilisation" (see
   the general rules file's points-permit principle).
3. Tell the Exploitant what's observed and its criticality, to prompt the right response: trigger a remote
   automatic wash, remotely condemn/shut down the sanitaire, urgently dispatch a cleaning crew, apply
   penalties to a maintenance subcontractor, etc.

**Claude's proposed Gravité scale** (asked for explicitly by Gilles, "j'attends que toi aussi tu proposes
une échelle qui te paraisse pertinente" — not yet confirmed by Gilles): keep Gilles's scale almost as-is,
it's already coherent (sensory/comfort criteria interleaved with functional-breadth criteria, deliberately
non-linear like a real AMDEC severity scale) — only fix the one real defect, the duplicate weight `7`:

| Tier | Libellé | Poids |
|---|---|---|
| 1 | Inconfort visuel (défaut esthétique, sans gêne d'usage) | 1 |
| 2 | Difficultés d'utilisation (usage possible mais avec friction) | 2 |
| 3 | Inconfort olfactif | 4 |
| 4 | Utilisation limitée à la fonction principale (fonctions secondaires perdues) | 5 |
| 5 | Utilisation dégradée pour toutes les fonctions | 7 |
| 6 | Utilisation fortement dégradée pour toutes les fonctions | **8** (était 7, en doublon) |
| 7 | Utilisation impossible du fait de la dégradation globale du service | 10 |

The gaps left at 3, 6, 9 are deliberate (Gilles's original spacing) — room to insert an intermediate tier
later without renumbering everything already assigned. Not yet confirmed by Gilles.

**Next steps, in order**: (1) Gilles sets `ANTHROPIC_API_KEY` in his own terminal and signals Claude to
launch the 955-photo batch. (2) Once it completes, re-pull the AI-suggested tag list (was 325, pre-batch)
and build the actual catalogue proposal — Qualification tree (typologie × localisation, deciding nesting
order per branch) with a base Gravité tier per leaf, following Gilles's 6 guidelines above. (3)
Quantification and Permanence-risque stay explicitly out of scope for that proposal — separate workstreams,
not to be improvised into the catalogue structure.
