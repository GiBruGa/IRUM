// IVQ — Détection phase 1 : classification I&V / défauts d'entretien sur un
// lot de photos, via l'API Claude (vision).
//
// Architecture volontairement découplée (voir "Note - Propriete et
// Architecture IA.md" et CLAUDE.md, "Strategic goal") : la taxonomie et le
// prompt métier vivent en dehors de l'appel API lui-même. `classifierPhoto`
// est le seul endroit à réécrire pour changer de fournisseur d'IA plus tard
// (auto-hébergé ou développé en interne) — tout le reste (chargement des
// photos, écriture des résultats, calcul des métriques de dimensionnement)
// ne dépend pas de Claude.
//
// Dimensionnement (CLAUDE.md, section "Dimensionnement") : chaque exécution
// enregistre, par photo ET en agrégat — temps de traitement, tokens Claude,
// coût estimé, nb de types d'IVDER distincts, nb total d'IVDER, taux
// d'échec, répartition par confiance. Écrit dans un CSV (revue photo par
// photo) + un JSON récapitulatif (revue rapide, ce fichier ne se
// reconstitue pas après coup).
//
// Usage :
//   node detection_iv.js --dossier "D:\UrBizia - Anthropic\I&V" --limite 10 --modele claude-opus-5
//
// Nécessite : `npm install` dans ce dossier, et des identifiants Claude déjà
// configurés (ANTHROPIC_API_KEY, ou `ant auth login`) — voir CLAUDE.md.

import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import { z } from 'zod';
import fs from 'node:fs/promises';
import path from 'node:path';

const SUPABASE_URL = 'https://mnsfstjgrueyuvejfvvk.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im1uc2ZzdGpncnVleXV2ZWpmdnZrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODM5NDI2MDgsImV4cCI6MjA5OTUxODYwOH0.Nb8d-b3zvXYqbl95PjkNrR12WXnVanJMGJzRU2-UpI4';

// Repli si Supabase est injoignable — doit rester en phase avec la table
// Incivilites_Taxonomie ; ne pas laisser diverger longtemps si modifiée
// depuis l'onglet EkoMa > Administration > SitInZen > IVQ. criteres_detection
// volontairement vide ici : le repli n'a pas vocation à porter les critères
// affinés au fil des retours humains, seulement à éviter un plantage.
const TAXONOMIE_REPLI = [
  "Excès de papier / corps étranger",
  "Déchets/fluides non identifiés (lave-main)",
  "Défaut de nettoyage",
  "Dégradation matérielle",
  "Graffiti / Tag",
  "Déchets / encombrants abandonnés",
  "Équipement arraché",
  "Feu / Brûlure",
  "Salissures volontaires",
  "Serrure ou porte forcée",
  "Excréments au sol ou sur les murs",
  "Autre",
].map((tag) => ({ tag, criteres_detection: null }));

const MEDIA_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.png': 'image/png', '.gif': 'image/gif', '.webp': 'image/webp',
  // .heic/.heif volontairement absents : non acceptés par l'API vision Claude.
};

// Tarifs $/1M tokens — pour l'estimation de coût de dimensionnement.
const TARIFS = {
  'claude-opus-5': { entree: 5.00, sortie: 25.00 },
  'claude-sonnet-5': { entree: 2.00, sortie: 10.00 },
  'claude-haiku-4-5': { entree: 1.00, sortie: 5.00 },
};

const ResultatSchema = z.object({
  etat_normal: z.boolean().describe("true si aucune incivilité/vandalisme/défaut visible sur la photo"),
  tags: z.array(z.string()).describe("qualifications de la taxonomie fournie qui s'appliquent, ou un intitulé libre court si aucune ne correspond (voir consignes) ; vide si etat_normal=true"),
  confiance: z.enum(['haute', 'moyenne', 'basse']).describe("confiance dans ce constat, en tenant compte de la qualité de la photo (cadrage/luminosité/résolution) autant que de l'ambiguïté du contenu"),
  justification: z.string().describe("une phrase expliquant le constat"),
});

function parseArgs() {
  const args = { dossier: 'D:\\UrBizia - Anthropic\\I&V', limite: 10, modele: 'claude-opus-5', sortie: null, supabase: true };
  const argv = process.argv.slice(2);
  for (let i = 0; i < argv.length; i++) {
    const cle = argv[i], val = argv[i + 1];
    if (cle === '--dossier') { args.dossier = val; i++; }
    else if (cle === '--limite') { args.limite = Number(val); i++; }
    else if (cle === '--modele') { args.modele = val; i++; }
    else if (cle === '--sortie') { args.sortie = val; i++; }
    else if (cle === '--sans-supabase') { args.supabase = false; }
  }
  if (!TARIFS[args.modele]) {
    throw new Error(`Modèle inconnu : ${args.modele}. Choix possibles : ${Object.keys(TARIFS).join(', ')}`);
  }
  return args;
}

async function chargerTaxonomie() {
  try {
    const url = `${SUPABASE_URL}/rest/v1/Incivilites_Taxonomie?select=tag,criteres_detection,categorie_ivder&actif=eq.true&order=ordre`;
    const res = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const rows = await res.json();
    if (rows.length) return rows;
  } catch (e) {
    console.warn(`Avertissement : taxonomie Supabase injoignable (${e.message}), repli sur la liste embarquée.`);
  }
  return TAXONOMIE_REPLI;
}

function construirePrompt(taxonomie) {
  // Les criteres_detection (retours de validation humaine, affinés au fil
  // des lots via l'onglet EkoMa > Administration > SitInZen > IVQ) sont
  // inclus quand ils existent -- c'est le canal pour corriger un angle mort
  // du modele sans toucher au code, ex. "Feu / Brûlure" (2026-09-02) :
  // jamais un feu actif, un constat de brulure (aureole, suie).
  //
  // Groupe par categorie IVDER (2026-09-02, demande de Gilles ; codes courts
  // I/V/E/R -- plus memorisables que les intitules complets) : incite le
  // modele a raisonner categorie par categorie plutot que sur une liste
  // plate -- pas de changement de schema de sortie (tags reste un simple
  // tableau de chaines), juste une meilleure structuration du prompt.
  const CATEGORIES = {
    I: 'Incivilité (comportement usager, sans destruction)',
    V: 'Vandalisme (destruction/dégradation volontaire)',
    E: "Défaut d'Entretien (propreté/nettoyage insuffisant)",
    R: 'Défaut de Réparation (élément cassé/défaillant à réparer)',
  };
  const parCategorie = Object.entries(CATEGORIES).map(([code, libelle]) => {
    const tags = taxonomie.filter((t) => t.categorie_ivder === code);
    if (!tags.length) return '';
    const liste = tags.map((t) => `  - ${t.tag}` + (t.criteres_detection ? ` (${t.criteres_detection})` : '')).join('\n');
    return `${code} — ${libelle} :\n${liste}`;
  }).filter(Boolean).join('\n\n');

  return (
    "Tu analyses une photo de sanitaire public pour UrBizia. Examine-la successivement selon les " +
    "4 catégories IVDER ci-dessous. Pour chaque catégorie, identifie zéro, une ou plusieurs des " +
    "qualifications listées qui s'appliquent :\n\n" +
    `${parCategorie}\n\n` +
    "Si un problème réel est visible mais ne correspond à AUCUNE qualification listée dans sa " +
    "catégorie, n'invente pas une correspondance approximative : propose plutôt un intitulé court " +
    "et précis (2 à 5 mots, en français, cohérent avec le style des libellés ci-dessus) décrivant " +
    "exactement ce que tu observes.\n\n" +
    "Si la photo montre un sanitaire en état normal, sans aucun problème visible, réponds " +
    "etat_normal=true et une liste de tags vide."
  );
}

// Seul point d'appel au fournisseur d'IA — à réécrire ici uniquement si on
// change de fournisseur (auto-hébergé, modèle maison...).
async function classifierPhoto(client, modele, cheminImage, taxonomie) {
  const ext = path.extname(cheminImage).toLowerCase();
  const mediaType = MEDIA_TYPES[ext];
  if (!mediaType) throw new Error(`extension non gérée : ${ext}`);

  const donnees = (await fs.readFile(cheminImage)).toString('base64');
  if (donnees.length > 10_485_760) {
    // Limite de l'API vision Claude constatee le 2026-09-02 sur un lot de
    // 500 (1 cas/500) -- verifiee cote client pour echouer vite et clair
    // plutot que de payer un aller-retour reseau pour un 400 garanti.
    throw new Error(`photo trop lourde pour l'API vision (${(donnees.length / 1_048_576).toFixed(1)} Mo encodée en base64, limite 10 Mo) — à compresser/redimensionner manuellement`);
  }
  const debut = performance.now();

  const reponse = await client.beta.messages.parse({
    model: modele,
    max_tokens: 2048,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: mediaType, data: donnees } },
        { type: 'text', text: construirePrompt(taxonomie) },
      ],
    }],
    output_format: betaZodOutputFormat(ResultatSchema),
  });

  const tempsMs = performance.now() - debut;

  let resultat = reponse.parsed;
  if (!resultat) {
    // Repli : le SDK (v0.70.1) ne peuple pas toujours .parsed quand un bloc
    // "thinking" precede le texte (constate le 2026-09-02, Opus 5 -- la
    // reflexion est activee par defaut). Le JSON est neanmoins present et
    // conforme dans le dernier bloc texte : on l'extrait et le valide
    // nous-memes avec le meme schema Zod plutot que de dependre de ce
    // detail d'implementation du SDK.
    const blocTexte = [...(reponse.content || [])].reverse().find((b) => b.type === 'text');
    if (!blocTexte) throw new Error(`aucun bloc texte dans la reponse (stop_reason=${reponse.stop_reason})`);
    let brut;
    try {
      brut = JSON.parse(blocTexte.text);
    } catch (e) {
      throw new Error(`JSON invalide dans la reponse : ${e.message} — texte: ${blocTexte.text.slice(0, 200)}`);
    }
    const validation = ResultatSchema.safeParse(brut);
    if (!validation.success) throw new Error(`réponse hors schéma : ${validation.error.message}`);
    resultat = validation.data;
  }

  return { resultat, usage: reponse.usage, tempsMs };
}

function csvEchapper(val) {
  const s = String(val ?? '');
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// Enregistre un constat dans Supabase (bucket PointSan-Incidents +
// Incident_Reports + Incident_Report_Tags) sous le sanitaire virtuel
// UB-DETECIA, verifie_humain=false — c'est ce qui rend chaque photo
// cliquable/corrigeable dans EkoMa (onglet IVQ ou Modération, badge orange
// "à vérifier") au lieu de rester seulement dans le CSV local. Ecrit en
// REST brut (pas de dependance au SDK supabase-js) pour rester coherent
// avec chargerTaxonomie plus haut, et parce que ce n'est que 2 endpoints.
// N'importe quelle erreur ici est non-bloquante pour le lot (le CSV local
// reste la trace de secours).
//
// Cle utilisee (2026-09-02) : la cle publique (anon) suffit pour le depot
// de la photo (bucket-only policy) mais PAS pour creer les lignes
// Incident_Reports/Incident_Report_Tags -- ces policies exigent un role
// "authenticated" (une vraie session), pas juste la cle anon statique.
// Plutot que de creer une session moi-meme (reserve a Gilles, cf. regles de
// securite), on utilise la cle service_role (contourne RLS), fournie par
// Gilles via SUPABASE_SERVICE_ROLE_KEY -- jamais codee en dur ici, cle
// sensible cote serveur uniquement, ne jamais l'exposer cote client/app.
const UB_ID_DETECTIONS = 'UB-DETECIA';
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function enregistrerDansSupabase(cheminImage, resultat, modele, tempsMs, taxonomie) {
  if (!SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error("variable d'environnement SUPABASE_SERVICE_ROLE_KEY absente (voir CLAUDE.md) — pas d'envoi possible vers EkoMa");
  }
  const donnees = await fs.readFile(cheminImage);
  const ext = path.extname(cheminImage).toLowerCase().replace('.', '') || 'jpg';
  const nomSafe = path.basename(cheminImage, path.extname(cheminImage)).replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 80);
  const cheminStockage = `${UB_ID_DETECTIONS}/${Date.now()}_${nomSafe}.${ext}`;

  const up = await fetch(`${SUPABASE_URL}/storage/v1/object/PointSan-Incidents/${cheminStockage}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': MEDIA_TYPES[path.extname(cheminImage).toLowerCase()] || 'application/octet-stream',
    },
    body: donnees,
  });
  if (!up.ok) throw new Error(`upload storage HTTP ${up.status} : ${await up.text()}`);

  const description = `[IA ${modele}, confiance ${resultat.confiance}, ${Math.round(tempsMs)}ms] ${resultat.justification}`;
  const insRes = await fetch(`${SUPABASE_URL}/rest/v1/Incident_Reports`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
    },
    body: JSON.stringify({ UB_id: UB_ID_DETECTIONS, Photo: cheminStockage, Description: description, verifie_humain: false, confiance_ia: resultat.confiance }),
  });
  if (!insRes.ok) throw new Error(`insert Incident_Reports HTTP ${insRes.status} : ${await insRes.text()}`);
  const [ligne] = await insRes.json();

  if (resultat.tags.length) {
    // Intitulés libres proposés par l'IA (2026-09-02, demande de Gilles :
    // plutôt qu'un générique "Autre", l'IA peut proposer un court intitulé
    // précis quand rien dans la taxonomie ne correspond -- cf. construirePrompt).
    // On les crée à la volée dans Incivilites_Taxonomie, marqués
    // propose_par_ia=true (revue humaine ensuite dans EkoMa, onglet IVQ,
    // pour décider de les garder/renommer/les ajouter à SpotSan) -- aussi
    // nécessaire pour satisfaire la clé étrangère sur Incident_Report_Tags.tag.
    const connus = new Set(taxonomie.map((t) => t.tag));
    for (const tag of resultat.tags) {
      if (connus.has(tag)) continue;
      const insTax = await fetch(`${SUPABASE_URL}/rest/v1/Incivilites_Taxonomie?on_conflict=tag`, {
        method: 'POST',
        headers: {
          apikey: SUPABASE_SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
          'Content-Type': 'application/json',
          Prefer: 'resolution=ignore-duplicates',
        },
        body: JSON.stringify({ tag, ordre: 999, actif: true, propose_par_ia: true }),
      });
      if (!insTax.ok) throw new Error(`insert Incivilites_Taxonomie (tag proposé "${tag}") HTTP ${insTax.status} : ${await insTax.text()}`);
      connus.add(tag);
    }

    const insTags = await fetch(`${SUPABASE_URL}/rest/v1/Incident_Report_Tags`, {
      method: 'POST',
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(resultat.tags.map((tag) => ({ report_id: ligne.Report_id, tag }))),
    });
    if (!insTags.ok) throw new Error(`insert Incident_Report_Tags HTTP ${insTags.status} : ${await insTags.text()}`);
  }
}

async function main() {
  const args = parseArgs();
  if (args.supabase && !SUPABASE_SERVICE_ROLE_KEY) {
    console.error(
      "ERREUR : --sans-supabase n'est pas passé mais SUPABASE_SERVICE_ROLE_KEY n'est pas défini.\n" +
      "Sans cette variable, rien n'apparaîtra dans EkoMa (voir CLAUDE.md pour où la trouver/la définir) --\n" +
      "arrêt avant de dépenser des tokens Claude pour rien. Relancez après l'avoir définie, ou ajoutez\n" +
      "--sans-supabase si vous voulez explicitement un lot local-seulement (CSV uniquement)."
    );
    process.exit(1);
  }
  const dossier = args.dossier;
  const entrees = await fs.readdir(dossier, { withFileTypes: true });
  let photos = entrees
    .filter((e) => e.isFile() && MEDIA_TYPES[path.extname(e.name).toLowerCase()])
    .map((e) => path.join(dossier, e.name))
    .sort();

  // Journal de reprise (2026-09-02, reseau instable constate) : une photo
  // deja classifiee ET envoyee a EkoMa (les deux, pas juste l'un des deux --
  // plus simple/sur, quitte a re-classifier si seul l'envoi Supabase avait
  // echoue) est sautee au prochain lancement sur le meme dossier. Partage
  // entre modeles pour l'instant (pas de suffixe --modele dans le nom) :
  // pour reprocesser volontairement avec un autre modele, renommer/supprimer
  // ce fichier.
  const journalPath = path.join(dossier, '_deja_traites.log');
  let dejaTraites = new Set();
  try {
    const contenu = await fs.readFile(journalPath, 'utf8');
    dejaTraites = new Set(contenu.split('\n').map((l) => l.trim()).filter(Boolean));
  } catch { /* pas de journal existant -- premier lancement sur ce dossier */ }
  const avantReprise = photos.length;
  photos = photos.filter((p) => !dejaTraites.has(path.basename(p)));
  if (dejaTraites.size) {
    console.log(`Reprise : ${dejaTraites.size} photo(s) déjà traitée(s) (voir ${journalPath}) — ${photos.length}/${avantReprise} restante(s).`);
  }

  if (args.limite > 0) photos = photos.slice(0, args.limite);
  if (!photos.length) {
    console.error('Aucune photo restante à traiter (extensions supportées : jpg/jpeg/png/gif/webp).');
    process.exit(1);
  }

  const taxonomie = await chargerTaxonomie();
  console.log(`${taxonomie.length} catégories chargées, ${photos.length} photo(s) à analyser avec ${args.modele}.`);

  const client = new Anthropic();
  const horodatage = new Date().toISOString().replace(/[:.]/g, '-');
  const sortieCsv = args.sortie || path.join(dossier, `_resultats_${args.modele}_${horodatage}.csv`);
  const sortieJson = sortieCsv.replace(/\.csv$/, '') + '_dimensionnement.json';

  const lignes = ['fichier,temps_ms,etat_normal,tags,confiance,justification,tokens_entree,tokens_sortie,erreur'];
  const ivderVus = new Set();
  let nbIvderTotal = 0;
  let tempsTotal = 0, tokensEntreeTotal = 0, tokensSortieTotal = 0;
  let succes = 0, echecs = 0, echecsSupabase = 0;
  const parConfiance = { haute: 0, moyenne: 0, basse: 0 };

  for (let i = 0; i < photos.length; i++) {
    const photo = photos[i];
    const nom = path.basename(photo);
    try {
      const { resultat, usage, tempsMs } = await classifierPhoto(client, args.modele, photo, taxonomie);
      // Tout ce qui suit peut encore echouer (champ inattendu) -- ne compter
      // succes qu'une fois la ligne effectivement ecrite, pas avant.
      tempsTotal += tempsMs;
      tokensEntreeTotal += usage.input_tokens;
      tokensSortieTotal += usage.output_tokens;
      resultat.tags.forEach((t) => ivderVus.add(t));
      nbIvderTotal += resultat.tags.length;
      parConfiance[resultat.confiance] = (parConfiance[resultat.confiance] || 0) + 1;

      lignes.push([nom, Math.round(tempsMs), resultat.etat_normal, resultat.tags.join('; '), resultat.confiance, resultat.justification, usage.input_tokens, usage.output_tokens, '']
        .map(csvEchapper).join(','));
      succes++;

      let noteSupabase = '';
      if (args.supabase) {
        try {
          await enregistrerDansSupabase(photo, resultat, args.modele, tempsMs, taxonomie);
        } catch (e) {
          echecsSupabase++;
          noteSupabase = ` [ATTENTION : pas envoyé à EkoMa — ${e.message}]`;
        }
      }
      // Journalisee seulement si tout a reussi (classification + envoi
      // EkoMa quand demande) -- voir le commentaire sur journalPath.
      if (!noteSupabase) {
        try { await fs.appendFile(journalPath, nom + '\n', 'utf8'); } catch { /* non bloquant */ }
      }
      console.log(`[${i + 1}/${photos.length} de ce lot — ${dejaTraites.size + i + 1}/${avantReprise} au total] ${nom} -> ${resultat.etat_normal ? 'RAS' : resultat.tags.join(', ')} (${Math.round(tempsMs)}ms, confiance ${resultat.confiance})${noteSupabase}`);
    } catch (e) {
      echecs++;
      const msg = e instanceof Anthropic.NotFoundError ? `modèle/endpoint introuvable : ${e.message}`
        : e instanceof Anthropic.RateLimitError ? `limite de débit atteinte : ${e.message}`
        : e instanceof Anthropic.APIConnectionError ? `erreur réseau : ${e.message}`
        : e instanceof Anthropic.APIError ? `erreur API (${e.status}) : ${e.message}`
        : e.message;
      lignes.push([nom, '', '', '', '', '', '', '', msg].map(csvEchapper).join(','));
      console.error(`[${i + 1}/${photos.length} de ce lot — ${dejaTraites.size + i + 1}/${avantReprise} au total] ${nom} -> ERREUR : ${msg}`);
    }
  }

  await fs.writeFile(sortieCsv, '\uFEFF' + lignes.join('\n'), 'utf8');

  const tarif = TARIFS[args.modele];
  const coutEstime = (tokensEntreeTotal / 1_000_000) * tarif.entree + (tokensSortieTotal / 1_000_000) * tarif.sortie;
  const dimensionnement = {
    date: new Date().toISOString(),
    modele: args.modele,
    dossier,
    nb_photos: photos.length,
    nb_succes: succes,
    nb_echecs: echecs,
    taux_echec: photos.length ? echecs / photos.length : 0,
    supabase_active: args.supabase,
    nb_echecs_supabase: echecsSupabase,
    temps_ms_total: Math.round(tempsTotal),
    temps_ms_moyen_par_photo: succes ? Math.round(tempsTotal / succes) : null,
    tokens_entree_total: tokensEntreeTotal,
    tokens_sortie_total: tokensSortieTotal,
    tokens_moyen_par_photo: succes ? Math.round((tokensEntreeTotal + tokensSortieTotal) / succes) : null,
    cout_estime_usd: Number(coutEstime.toFixed(4)),
    cout_estime_usd_par_photo: succes ? Number((coutEstime / succes).toFixed(4)) : null,
    nb_types_ivder_distincts: ivderVus.size,
    types_ivder_distincts: [...ivderVus].sort(),
    nb_ivder_total: nbIvderTotal,
    repartition_confiance: parConfiance,
  };
  await fs.writeFile(sortieJson, JSON.stringify(dimensionnement, null, 2), 'utf8');

  console.log('\n--- Dimensionnement ---');
  console.log(`Photos : ${succes} réussies / ${photos.length} (taux d'échec ${(dimensionnement.taux_echec * 100).toFixed(1)}%)`);
  console.log(`Temps : ${(tempsTotal / 1000).toFixed(1)}s total, ${dimensionnement.temps_ms_moyen_par_photo ?? '-'}ms/photo en moyenne`);
  console.log(`Tokens : ${tokensEntreeTotal} entrée + ${tokensSortieTotal} sortie`);
  console.log(`Coût estimé : $${coutEstime.toFixed(4)} (${succes ? (coutEstime / succes).toFixed(4) : '-'}$/photo)`);
  console.log(`IVDER : ${ivderVus.size} type(s) distinct(s), ${nbIvderTotal} occurrence(s) au total`);
  console.log(`Confiance : haute=${parConfiance.haute} moyenne=${parConfiance.moyenne} basse=${parConfiance.basse}`);
  if (args.supabase) {
    console.log(`EkoMa : ${succes - echecsSupabase}/${succes} envoyées à EkoMa (Administration > Modération ou SitInZen · IVQ, sanitaire "${UB_ID_DETECTIONS}")${echecsSupabase ? ` — ${echecsSupabase} échec(s) d'envoi, voir les lignes marquées ci-dessus` : ''}.`);
  } else {
    console.log('EkoMa : envoi désactivé (--sans-supabase) — résultats disponibles seulement dans le CSV.');
  }
  console.log(`\nRésultats : ${sortieCsv}`);
  console.log(`Dimensionnement : ${sortieJson}`);
}

main().catch((e) => { console.error(e); process.exit(1); });
