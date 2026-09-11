<script>
  import { supabase } from './supabaseClient.js'

  let { report, taxonomie, equivalences, urlPhoto, nomModerateurActuel, onEnregistre } = $props()

  const tagsIa = $derived(report.tags_ia_origine || [])
  const tagsUt = $derived(report.tags_utilisateur || [])
  const aDeclarationUtilisateur = $derived(tagsUt.length > 0)

  // Diff usager/IA -- seulement affichable quand les deux existent (voir
  // Ponderation.svelte). "Confirmé" = recoupé, devient officiel par defaut ;
  // les deux autres groupes sont exactement le desaccord que le pondérateur
  // doit trancher.
  const confirmes = $derived(tagsUt.filter((t) => tagsIa.includes(t)))
  const ajoutesParIa = $derived(tagsIa.filter((t) => !tagsUt.includes(t)))
  const retiresParIa = $derived(tagsUt.filter((t) => !tagsIa.includes(t)))

  // Decision editable : part de l'etat actuel (Incident_Report_Tags), pas
  // d'un recalcul depuis IA/utilisateur -- si une correction humaine existe
  // deja (verifie_humain=true revu une premiere fois), on ne veut pas
  // l'ecraser silencieusement.
  let selection = $state(new Set(report.tags_actuels || []))
  let recherche = $state('')
  let remarque = $state(report.Description || '')
  let enregistrement = $state(false)
  let erreur = $state('')
  // Zoom manuel de la photo (demande de Gilles, 2026-09-11) -- pour pouvoir
  // faire sa propre expertise visuelle avant de trancher. origineX/Y pilote
  // le transform-origin : molette+Ctrl recentre le zoom sous le curseur
  // (comme un logiciel d'image), pas seulement un zoom centre sur l'image --
  // les boutons +/- restent un zoom centre simple, plus previsible au clic.
  let zoom = $state(1)
  let origineX = $state(50)
  let origineY = $state(50)

  function surMolette(e) {
    if (!e.ctrlKey && !e.metaKey) return // laisse le scroll normal de la fenetre tranquille
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    origineX = ((e.clientX - rect.left) / rect.width) * 100
    origineY = ((e.clientY - rect.top) / rect.height) * 100
    const pas = e.deltaY < 0 ? 0.2 : -0.2
    zoom = Math.min(4, Math.max(1, +(zoom + pas).toFixed(2)))
  }

  // Suggestion automatique (2026-09-04, demande de Gilles) : si un tag IA
  // d'origine a une equivalence connue (declaree dans le Catalogue) qui n'est
  // pas deja dans la decision courante, proposer l'application en un clic --
  // ne touche rien tant que le pondérateur n'a pas clique et enregistré.
  const equivalencesParTexte = $derived(new Map((equivalences || []).map((e) => [e.texte_ia, e.tag])))
  const suggestionsEquivalence = $derived(
    tagsIa
      .map((t) => equivalencesParTexte.get(t))
      .filter((tagOfficiel) => tagOfficiel && !selection.has(tagOfficiel))
  )
  function appliquerSuggestion(tag) { basculer(tag) }

  const rechercheNorm = $derived(recherche.trim().toLowerCase())
  const suggestions = $derived(
    taxonomie.filter((t) => !selection.has(t.tag) && (!rechercheNorm || t.tag.toLowerCase().includes(rechercheNorm)))
  )
  const exactMatch = $derived(taxonomie.some((t) => t.tag.toLowerCase() === rechercheNorm))

  function basculer(tag) {
    const s = new Set(selection)
    if (s.has(tag)) s.delete(tag); else s.add(tag)
    selection = s
  }

  async function creerEtAjouter() {
    const val = recherche.trim()
    if (!val || exactMatch) return
    const maxOrdre = taxonomie.reduce((m, t) => Math.max(m, t.ordre), 0)
    const label = val.slice(0, 50)
    const cle = `?.${val}`
    const { error } = await supabase.from('Incivilites_Taxonomie').insert({ tag: val, ordre: maxOrdre + 1, actif: true, label, cle })
    if (error) { erreur = error.message; return }
    taxonomie.push({ tag: val, actif: true, ordre: maxOrdre + 1, categorie_iver: null, propose_par_ia: false, label, cle })
    basculer(val)
    recherche = ''
  }

  async function enregistrer() {
    enregistrement = true
    erreur = ''
    const avant = new Set(report.tags_actuels || [])
    const apres = selection
    const aSupprimer = [...avant].filter((t) => !apres.has(t))
    const aAjouter = [...apres].filter((t) => !avant.has(t))
    try {
      // pondere_par/pondere_le : identite + date du DERNIER moderateur
      // seulement, ecrasees a chaque enregistrement -- pas d'historique
      // (demande explicite de Gilles, 2026-09-11).
      const { data: { user } } = await supabase.auth.getUser()
      // verifie_humain force a true : enregistrer une decision ICI est en
      // soi l'acte de verification -- plus de case a cocher separee, qui
      // faisait doublon avec "pondere_par/pondere_le" (retour de Gilles,
      // 2026-09-11).
      const upd = await supabase.from('Incident_Reports')
        .update({
          Description: remarque.trim() || null,
          verifie_humain: true,
          pondere_par: user?.id ?? null,
          pondere_le: new Date().toISOString(),
        })
        .eq('Report_id', report.Report_id)
      if (upd.error) throw upd.error
      if (aSupprimer.length) {
        const d = await supabase.from('Incident_Report_Tags').delete().eq('report_id', report.Report_id).in('tag', aSupprimer)
        if (d.error) throw d.error
      }
      if (aAjouter.length) {
        // cle_enregistree/label_enregistre : copie figee au moment du tag,
        // jamais une reference live -- voir Catalogue.svelte pour le principe.
        const parTag = new Map(taxonomie.map((t) => [t.tag, t]))
        const i = await supabase.from('Incident_Report_Tags').insert(aAjouter.map((tag) => ({
          report_id: report.Report_id,
          tag,
          cle_enregistree: parTag.get(tag)?.cle ?? null,
          label_enregistre: parTag.get(tag)?.label ?? null,
        })))
        if (i.error) throw i.error
      }
      onEnregistre()
    } catch (e) {
      erreur = e.message
    } finally {
      enregistrement = false
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
  }
</script>

<div class="detail">
  <div class="col-photo">
    <div class="barre-zoom">
      <button onclick={() => (zoom = Math.max(1, +(zoom - 0.25).toFixed(2)))} disabled={zoom <= 1}>−</button>
      <span>{Math.round(zoom * 100)}%</span>
      <button onclick={() => (zoom = Math.min(4, +(zoom + 0.25).toFixed(2)))} disabled={zoom >= 4}>+</button>
      {#if zoom !== 1}<button onclick={() => (zoom = 1)}>Réinitialiser</button>{/if}
      <span class="astuce-zoom">Ctrl+molette pour zoomer sous le curseur</span>
    </div>
    <div class="cadre-photo" onwheel={surMolette}>
      {#await urlPhoto(report.Photo) then url}
        {#if url}
          <img
            class="photo"
            src={url}
            alt=""
            style:transform="scale({zoom})"
            style:transform-origin="{origineX}% {origineY}%"
          />
        {:else}
          <div class="pas-photo"></div>
        {/if}
      {/await}
    </div>
  </div>

  <div class="col-info">
    <div class="entete">
      <span class="ub">{report.UB_id}</span>
      <span class="date">{formatDate(report.Reported_at)}</span>
      {#if report.litige}<span class="tag-litige">En litige</span>{/if}
    </div>

    <div class="bloc">
      <div class="bloc-titre">Ce qui a été vu par l'utilisateur</div>
      <div class="bloc-corps">
        {#if aDeclarationUtilisateur}
          {tagsUt.join(', ')}
        {:else}
          <span class="muted">(aucune déclaration utilisateur associée à cette photo)</span>
        {/if}
      </div>
    </div>

    <div class="bloc">
      <div class="bloc-titre">Ce qui a été détecté par l'IA</div>
      <div class="bloc-corps">
        {tagsIa.length ? tagsIa.join(', ') : '(rien détecté)'}
        {#if report.confiance_ia} — confiance {report.confiance_ia}{/if}
      </div>
    </div>

    {#if aDeclarationUtilisateur}
      <div class="diff">
        <div class="diff-grp confirme">
          <div class="diff-titre">Confirmé (usager ∩ IA) — officiel par défaut</div>
          <div class="diff-liste">{confirmes.length ? confirmes.join(', ') : '—'}</div>
        </div>
        <div class="diff-grp ajoute">
          <div class="diff-titre">Ajouté par l'IA (absent de la déclaration usager)</div>
          <div class="diff-liste">{ajoutesParIa.length ? ajoutesParIa.join(', ') : '—'}</div>
        </div>
        <div class="diff-grp retire">
          <div class="diff-titre">Retiré par l'IA (déclaré par l'usager, non confirmé)</div>
          <div class="diff-liste">{retiresParIa.length ? retiresParIa.join(', ') : '—'}</div>
        </div>
      </div>
    {/if}

    {#if suggestionsEquivalence.length}
      <div class="bloc suggestion-eq">
        <div class="bloc-titre">Suggestion (équivalence connue depuis le Catalogue)</div>
        <div class="chips">
          {#each suggestionsEquivalence as tag}
            <button class="chip suggere" onclick={() => appliquerSuggestion(tag)}>+ Appliquer « {tag} »</button>
          {/each}
        </div>
      </div>
    {/if}

    <div class="bloc">
      <div class="bloc-titre">
        Ce qui a été retenu par un Modérateur Humain
        {#if nomModerateurActuel && report.pondere_le}
          <span class="statut-verif">— Vérifié par {nomModerateurActuel}, le {formatDate(report.pondere_le)}</span>
        {:else}
          <span class="statut-verif non-verifie">— Pas encore vérifié par un modérateur</span>
        {/if}
      </div>
      <div class="chips">
        {#each [...selection] as tag}
          <button class="chip actif" onclick={() => basculer(tag)}>{tag} ×</button>
        {/each}
      </div>
      <input class="recherche" placeholder="Chercher un tag du catalogue avant d'en créer un nouveau…" bind:value={recherche} />
      <div class="suggestions">
        {#each suggestions.slice(0, 12) as t (t.tag)}
          <button class="chip" onclick={() => basculer(t.tag)}>
            {#if t.categorie_iver}<span class="cat cat-{t.categorie_iver}">{t.categorie_iver}</span>{/if}
            {t.tag}{t.propose_par_ia ? ' 🆕' : ''}
          </button>
        {/each}
        {#if rechercheNorm && !exactMatch}
          <button class="chip nouveau" onclick={creerEtAjouter}>+ Créer « {recherche.trim()} »</button>
        {/if}
      </div>
    </div>

    <div class="bloc">
      <div class="bloc-titre">Remarque</div>
      <textarea bind:value={remarque} rows="2"></textarea>
    </div>

    {#if erreur}<p class="erreur">Erreur : {erreur}</p>{/if}

    <div class="actions">
      <button class="btn" onclick={enregistrer} disabled={enregistrement}>{enregistrement ? 'Enregistrement…' : 'Enregistrer'}</button>
    </div>
  </div>
</div>

<style>
  /* Photo a gauche (pleine hauteur du bloc), infos a droite -- refonte
     demandee par Gilles, 2026-09-11 (remplace l'ancien empilement vertical
     "photo au-dessus, infos en dessous"). */
  .detail { display: flex; gap: 1rem; height: 100%; min-height: 0; }

  .col-photo { flex: 0 0 46%; display: flex; flex-direction: column; gap: 6px; min-height: 0; }
  .barre-zoom { display: flex; align-items: center; gap: 8px; flex-shrink: 0; }
  .barre-zoom button {
    background: #1a1a1c; border: 1px solid #333; color: #e8e6e6; border-radius: 6px; width: 26px; height: 26px;
    cursor: pointer; font-size: 0.9rem; line-height: 1; padding: 0;
  }
  .barre-zoom button:nth-child(4) { width: auto; padding: 0 10px; font-size: 0.75rem; }
  .barre-zoom button:disabled { opacity: 0.4; cursor: default; }
  .barre-zoom span { font-size: 0.78rem; color: #999; min-width: 3.2em; text-align: center; }
  .astuce-zoom { color: #666 !important; font-size: 0.72rem !important; min-width: 0 !important; margin-left: 4px; }
  .cadre-photo {
    flex: 1; min-height: 0; overflow: auto; display: flex; align-items: center; justify-content: center;
    background: #0a0a0b; border-radius: 8px;
  }
  .photo { max-width: 100%; max-height: 100%; object-fit: contain; transform-origin: center center; transition: transform 0.15s ease; }
  .pas-photo { width: 100%; height: 100%; background: #1a1a1c; }

  .col-info { flex: 1; min-width: 0; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 0.7rem; padding-right: 4px; }

  .entete { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: #999; flex-shrink: 0; }
  .ub { color: #e8e6e6; font-weight: 600; }
  .tag-litige { background: #c55a7a; color: #fff; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; }

  .bloc { background: #17171a; border: 1px solid #2a2a2d; border-radius: 8px; padding: 0.6rem 0.8rem; flex-shrink: 0; }
  /* Titres plus gros/en evidence (retour de Gilles, 2026-09-11) : "qui a dit
     quoi" doit se lire d'un coup d'oeil, pas se deviner dans un petit gris. */
  .bloc-titre { font-size: 0.92rem; font-weight: 700; color: #e8e6e6; margin-bottom: 6px; }
  .statut-verif { font-size: 0.72rem; font-weight: 400; color: #22c55e; }
  .statut-verif.non-verifie { color: #666; font-style: italic; }
  .bloc-corps { font-size: 0.85rem; color: #e8e6e6; }
  .muted { color: #666; font-style: italic; }

  .diff { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; flex-shrink: 0; }
  @media (max-width: 900px) { .diff { grid-template-columns: 1fr; } }
  .diff-grp { border-radius: 8px; padding: 0.5rem 0.7rem; font-size: 0.78rem; }
  .diff-grp.confirme { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.35); }
  .diff-grp.ajoute { background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.35); }
  .diff-grp.retire { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.35); }
  .diff-titre { font-size: 0.68rem; color: #aaa; margin-bottom: 3px; }

  .chips, .suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .chip {
    background: #1f1f22; border: 1px solid #333; color: #e8e6e6; border-radius: 999px; padding: 4px 10px;
    font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
  }
  .chip.actif { background: #c55a7a; border-color: #c55a7a; color: #fff; }
  .chip.suggere { border-color: #3b82f6; color: #93c5fd; }
  .suggestion-eq { border-color: rgba(59,130,246,0.4); }
  .chip.nouveau { border-style: dashed; color: #c55a7a; border-color: #c55a7a; }
  .cat { font-size: 0.6rem; font-weight: 700; border-radius: 4px; padding: 0 4px; color: #fff; }
  .cat-I { background: #3b82f6; } .cat-V { background: #ef4444; } .cat-E { background: #f59e0b; } .cat-R { background: #8b5cf6; }
  .recherche { width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px; border: 1px solid #333; background: #1a1a1c; color: #e8e6e6; font-size: 0.82rem; }

  textarea { width: 100%; box-sizing: border-box; background: #1a1a1c; border: 1px solid #333; border-radius: 8px; color: #e8e6e6; padding: 8px; font-family: inherit; font-size: 0.82rem; resize: vertical; }

  .erreur { color: #f87171; font-size: 0.8rem; flex-shrink: 0; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; flex-shrink: 0; }
  /* Charte graphique §7 (2026-09-04) : jamais de fond plein par defaut --
     Enregistrer reste banal (texte neutre), pas de traitement "deja actif". */
  .btn { background: #1a1a1c; border: 1px solid #333; color: #e8e6e6; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 0.85rem; }
  .btn:disabled { opacity: 0.5; cursor: default; }
</style>
