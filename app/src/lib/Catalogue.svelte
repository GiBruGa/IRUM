<script>
  import { supabase } from './supabaseClient.js'
  import { onMount, untrack } from 'svelte'
  import TreeNode from './catalogue/TreeNode.svelte'
  import FicheIver from './catalogue/FicheIver.svelte'
  import { calculerCle, renumeroterSousArbre } from './catalogue/cle.js'

  // Catalogue Tag IVER -- arborescence (2026-09-04, refonte discutee avec
  // Gilles). Principes actes :
  //  - la cle ("I.3.2") n'est PAS une identite permanente : elle se decale
  //    quand on reorganise l'arbre. Ce n'est pas un probleme car chaque
  //    photo garde une copie figee (cle_enregistree/label_enregistre sur
  //    Incident_Report_Tags), jamais une reference live -- aucune photo
  //    existante n'a donc besoin d'etre retouchee quand le catalogue evolue.
  //  - un tag suggere par l'IA (propose_par_ia=true) glisse sur l'arbre soit
  //    pour declarer une equivalence avec un tag officiel existant (absorbe,
  //    desactive), soit pour etre promu directement comme nouveau noeud
  //    (glisse sur l'entete d'une categorie I/V/E/R). Objectif : plus aucun
  //    tag IA en attente une fois le catalogue a jour.
  //  - aucune de ces actions n'est retroactive sur Incident_Report_Tags.

  const CATEGORIES = [
    { code: 'I', libelle: 'Incivilités' },
    { code: 'V', libelle: 'Vandalismes' },
    { code: 'E', libelle: "Défauts d'entretien" },
    { code: 'R', libelle: 'Défauts de réparation' },
  ]

  let taxonomie = $state([])
  let chargement = $state(true)
  let erreur = $state('')
  let recherche = $state('')
  let ouverts = $state(new Set())
  let selection = $state(null)
  let sauvegarde = $state(false)

  // Un UPDATE Postgres filtre par une policy RLS qui echoue silencieusement
  // -- pas d'erreur, juste 0 ligne modifiee (vu en test, 2026-09-04 : la
  // Fiche IVER "enregistrait" sans rien changer). .select() force Supabase a
  // renvoyer les lignes touchees, pour distinguer "vraiment enregistre" de
  // "silencieusement refuse" et le signaler clairement plutot que de laisser
  // croire que ca a marche.
  async function majOuErreur(requete) {
    const { data, error } = await requete.select()
    if (error) throw error
    if (!data || !data.length) {
      throw new Error("Rien n'a été modifié — vérifie que tu es bien connecté sur EkoMa dans ce même navigateur (les écritures nécessitent une session partagée).")
    }
    return data
  }

  async function charger() {
    chargement = true
    const { data, error } = await supabase
      .from('Incivilites_Taxonomie')
      .select('tag,actif,ordre,categorie_iver,criteres_detection,propose_par_ia,parent_tag,label,cle,propose_utilisateur')
      .order('ordre')
    if (error) { erreur = error.message; chargement = false; return }
    taxonomie = data || []
    chargement = false
  }
  onMount(charger)

  const parTag = $derived(new Map(taxonomie.map((t) => [t.tag, t])))
  const enfantsParTag = $derived.by(() => {
    const m = {}
    taxonomie.forEach((t) => { if (t.parent_tag) (m[t.parent_tag] ||= []).push(t) })
    return m
  })
  const suggeresIA = $derived(taxonomie.filter((t) => t.propose_par_ia))

  const rechercheNorm = $derived(recherche.trim().toLowerCase())
  const tagsCorrespondants = $derived(
    rechercheNorm ? new Set(taxonomie.filter((t) => t.label.toLowerCase().includes(rechercheNorm)).map((t) => t.tag)) : null
  )

  function construireArbre(tag) {
    const noeud = parTag.get(tag)
    if (!noeud) return null
    const enfants = (enfantsParTag[tag] || [])
      .slice()
      .sort((a, b) => a.ordre - b.ordre)
      .map((e) => construireArbre(e.tag))
      .filter(Boolean)
    return { noeud, enfants }
  }

  // Un tag propose_par_ia vit dans la colonne "Tags suggérés IA" tant qu'il
  // n'est ni promu (parent_tag/categorie fixes) ni fondu par équivalence --
  // il ne doit jamais apparaître aussi dans l'arbre, sinon il est visible
  // deux fois pour rien.
  function racinesCategorie(code) {
    return taxonomie
      .filter((t) => t.categorie_iver === code && !t.parent_tag && !t.propose_par_ia)
      .sort((a, b) => a.ordre - b.ordre)
      .map((t) => construireArbre(t.tag))
      .filter(Boolean)
  }
  // "Non classé" ne doit montrer que ce qui a réellement besoin d'être
  // organisé -- un tag inactif ici est une relique déjà remplacée (ex.
  // l'ancien "Autre" générique, désactivé le 2026-09-02 au profit des 4
  // "Autre (I/V/E/R)"), pas quelque chose à ranger.
  const racinesSansCategorie = $derived(
    taxonomie.filter((t) => !t.categorie_iver && !t.parent_tag && !t.propose_par_ia && t.actif)
      .sort((a, b) => a.ordre - b.ordre)
      .map((t) => construireArbre(t.tag))
      .filter(Boolean)
  )

  // Auto-ouverture des ancetres d'un tag qui matche la recherche, jusqu'a la
  // categorie racine (I/V/E/R) incluse.
  $effect(() => {
    if (!tagsCorrespondants) return
    const aOuvrir = new Set()
    tagsCorrespondants.forEach((tag) => {
      let courant = parTag.get(tag)
      if (courant?.categorie_iver) aOuvrir.add(`cat:${courant.categorie_iver}`)
      while (courant?.parent_tag) { aOuvrir.add(courant.parent_tag); courant = parTag.get(courant.parent_tag) }
    })
    // untrack : cet effet ne doit reagir qu'a la recherche/la taxonomie, pas
    // a ses propres ecritures sur ouverts (sinon boucle infinie -- vu en
    // test, 2026-09-04).
    untrack(() => { ouverts = new Set([...ouverts, ...aOuvrir]) })
  })

  function surBascule(tag) {
    const s = new Set(ouverts)
    s.has(tag) ? s.delete(tag) : s.add(tag)
    ouverts = s
  }
  function surSelection(tag) { selection = tag }

  async function ecrireCles(maj) {
    for (const { tag, cle } of maj) {
      const { error } = await supabase.from('Incivilites_Taxonomie').update({ cle }).eq('tag', tag)
      if (error) throw error
    }
  }

  async function reparenter(tagDeplace, cibleTag) {
    if (tagDeplace === cibleTag) return
    // Empeche de deplacer un noeud sous l'un de ses propres descendants.
    let v = cibleTag
    while (v) { if (v === tagDeplace) { erreur = 'Impossible : cible dans sa propre descendance.'; return }; v = parTag.get(v)?.parent_tag }

    const noeud = parTag.get(tagDeplace)
    const cible = parTag.get(cibleTag)
    if (!noeud || !cible) return
    const nouvellePosition = (enfantsParTag[cibleTag] || []).length + 1
    const sousArbre = construireArbre(tagDeplace)
    const maj = renumeroterSousArbre(sousArbre.noeud, cible.cle, nouvellePosition, {
      ...enfantsParTag,
      [cibleTag]: [...(enfantsParTag[cibleTag] || [])],
    })
    // renumeroterSousArbre recalcule aussi les enfants existants du noeud
    // deplace via enfantsParTag global -- deja coherent, pas besoin de refaire.
    try {
      await majOuErreur(supabase
        .from('Incivilites_Taxonomie')
        .update({ parent_tag: cibleTag, ordre: nouvellePosition, categorie_iver: cible.categorie_iver })
        .eq('tag', tagDeplace))
      await ecrireCles(maj)
      ouverts = new Set([...ouverts, cibleTag])
      await charger()
    } catch (e) { erreur = e.message }
  }

  async function promouvoir(tagIA, categorieCode) {
    const noeud = parTag.get(tagIA)
    if (!noeud) return
    const position = racinesCategorie(categorieCode).length + 1
    const cle = calculerCle(categorieCode, position)
    try {
      await majOuErreur(supabase
        .from('Incivilites_Taxonomie')
        .update({ parent_tag: null, categorie_iver: categorieCode, ordre: position, cle, propose_par_ia: false })
        .eq('tag', tagIA))
      await charger()
    } catch (e) { erreur = e.message }
  }

  async function declarerEquivalence(texteIa, cibleTag) {
    try {
      const { error: eqErr } = await supabase.from('Tags_IA_Equivalences').insert({ texte_ia: texteIa, tag: cibleTag })
      if (eqErr) throw eqErr
      await majOuErreur(supabase
        .from('Incivilites_Taxonomie')
        .update({ actif: false, propose_par_ia: false })
        .eq('tag', texteIa))
      await charger()
    } catch (e) { erreur = e.message }
  }

  function surGlisserDeposeArbre(action) {
    erreur = ''
    if (action.type === 'reparent') reparenter(action.tag, action.cibleTag)
    else if (action.type === 'equivalence') declarerEquivalence(action.texteIa, action.cibleTag)
  }

  function surDragStartIA(e, tag) {
    e.dataTransfer.setData('text/x-irum-ia', tag)
    e.dataTransfer.effectAllowed = 'move'
  }

  let survoleCategorie = $state(null)
  function surDropCategorie(e, code) {
    e.preventDefault()
    survoleCategorie = null
    const texteIa = e.dataTransfer.getData('text/x-irum-ia')
    const tagDeplace = e.dataTransfer.getData('text/x-irum-tag')
    if (texteIa) promouvoir(texteIa, code)
    else if (tagDeplace) {
      // Deplacer un noeud existant directement en racine d'une categorie.
      const position = racinesCategorie(code).length + 1
      const cle = calculerCle(code, position)
      majOuErreur(supabase.from('Incivilites_Taxonomie').update({ parent_tag: null, categorie_iver: code, ordre: position, cle }).eq('tag', tagDeplace))
        .then(() => charger())
        .catch((e) => { erreur = e.message })
    }
  }

  async function enregistrerFiche(tag, valeurs) {
    await majOuErreur(supabase.from('Incivilites_Taxonomie').update(valeurs).eq('tag', tag))
    await charger()
  }

  async function supprimerTag(tag) {
    // Les photos deja taguees protegent naturellement contre la suppression
    // (Incident_Report_Tags.tag -> Incivilites_Taxonomie.tag, ON DELETE
    // par defaut = NO ACTION) : Postgres refuse avec une erreur claire si ce
    // tag est deja utilise sur une photo, plutot que de casser l'historique.
    await majOuErreur(supabase.from('Incivilites_Taxonomie').delete().eq('tag', tag))
    selection = null
    await charger()
  }

  async function sauvegarderVersion() {
    sauvegarde = true
    const maintenant = new Date()
    const titre = `Catalogue du ${maintenant.toLocaleDateString('fr-FR')} ${maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    try {
      const { error: e2 } = await supabase.from('Catalogue_Versions').insert({ titre, contenu: taxonomie })
      if (e2) throw e2
      alert(`Version sauvegardée : "${titre}"`)
    } catch (e) { erreur = e.message } finally { sauvegarde = false }
  }

  const noeudSelectionne = $derived(selection ? parTag.get(selection) : null)
</script>

<div class="catalogue">
  {#if erreur}<p class="erreur">Erreur : {erreur}</p>{/if}

  <div class="entete">
    <input class="recherche" placeholder="Recherche d'un tag…" bind:value={recherche} />
    <button class="btn-sauver" onclick={sauvegarderVersion} disabled={sauvegarde}>
      {sauvegarde ? 'Sauvegarde…' : '💾 Sauvegarder le catalogue'}
    </button>
  </div>
  <p class="avertissement">Attention : la modification du Catalogue des Tag IVER n'a pas d'effet rétroactif sur la base IRUM !</p>

  {#if chargement}
    <p class="info">Chargement…</p>
  {:else}
    <div class="colonnes">
      <section class="col-ia">
        <h2>Tags suggérés IA ({suggeresIA.length})</h2>
        <div class="liste-ia" role="list">
          {#each suggeresIA as t (t.tag)}
            <div class="carte-ia" role="listitem" draggable="true" ondragstart={(e) => surDragStartIA(e, t.tag)}>{t.label}</div>
          {/each}
          {#if !suggeresIA.length}<p class="vide">Aucun tag en attente.</p>{/if}
        </div>
      </section>

      <section class="col-arbre" role="tree">
        <h2>Arborescence Tag IVER</h2>
        <div class="arbre">
          {#each CATEGORIES as cat}
            <div
              class="entete-categorie"
              class:survole={survoleCategorie === cat.code}
              role="button"
              tabindex="0"
              aria-label={cat.libelle}
              aria-expanded={ouverts.has(`cat:${cat.code}`)}
              ondragover={(e) => { e.preventDefault(); survoleCategorie = cat.code }}
              ondragleave={() => (survoleCategorie = null)}
              ondrop={(e) => surDropCategorie(e, cat.code)}
              onclick={() => surBascule(`cat:${cat.code}`)}
              onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); surBascule(`cat:${cat.code}`) } }}
            >
              <span class="bascule-cat">{ouverts.has(`cat:${cat.code}`) ? '▾' : '▸'}</span>
              <span class="cat cat-{cat.code}">{cat.code}</span> {cat.libelle}
            </div>
            {#if ouverts.has(`cat:${cat.code}`)}
              {#each racinesCategorie(cat.code) as racine (racine.noeud.tag)}
                <TreeNode
                  noeud={racine.noeud}
                  enfants={racine.enfants}
                  profondeur={1}
                  {ouverts}
                  {selection}
                  surGlisserDepose={surGlisserDeposeArbre}
                  {surSelection}
                  {surBascule}
                />
              {/each}
            {/if}
          {/each}
          {#if racinesSansCategorie.length}
            <div class="entete-categorie">Non classé</div>
            {#each racinesSansCategorie as racine (racine.noeud.tag)}
              <TreeNode
                noeud={racine.noeud}
                enfants={racine.enfants}
                profondeur={1}
                {ouverts}
                {selection}
                surGlisserDepose={surGlisserDeposeArbre}
                {surSelection}
                {surBascule}
              />
            {/each}
          {/if}
        </div>
      </section>

      <section class="col-fiche">
        {#if noeudSelectionne}
          {#key noeudSelectionne.tag}
            <FicheIver noeud={noeudSelectionne} onEnregistrer={enregistrerFiche} onSupprimer={supprimerTag} />
          {/key}
        {:else}
          <p class="vide">Cliquez un tag dans l'arborescence pour voir sa fiche.</p>
        {/if}
      </section>
    </div>
  {/if}
</div>

<style>
  .catalogue { display: flex; flex-direction: column; gap: 0.6rem; }
  .entete { display: flex; gap: 10px; align-items: center; }
  .recherche { flex: 1; padding: 8px 12px; border-radius: 8px; border: 1px solid #333; background: #1a1a1c; color: #e8e6e6; font-size: 0.9rem; }
  .btn-sauver { background: #1a1a1c; border: 1px solid #333; color: #e8e6e6; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-size: 0.82rem; white-space: nowrap; }
  .btn-sauver:disabled { opacity: 0.5; cursor: default; }
  .avertissement { color: #f59e0b; font-size: 0.78rem; margin: 0; }
  .erreur { color: #f87171; }
  .info, .vide { color: #999; font-size: 0.85rem; }

  /* Largeurs demandées par Gilles (2026-09-04) : IA x2 (220->440), Arborescence
     x1.5 (etait 1fr, cf. poids relatif) -- Fiche inchangee (280px). */
  .colonnes { display: grid; grid-template-columns: 440px 1.5fr 280px; gap: 1rem; align-items: start; }
  @media (max-width: 1400px) { .colonnes { grid-template-columns: 1fr; } }

  .col-ia, .col-arbre, .col-fiche {
    background: #17171a; border: 1px solid #2a2a2d; border-radius: 10px; padding: 0.7rem;
  }
  h2 { font-size: 0.82rem; margin: 0 0 0.6rem; color: #e8e6e6; }

  /* padding-right : les cartes en pointilles (border dashed) ne doivent pas
     toucher l'ascenseur vertical (demande de Gilles, 2026-09-04). */
  .liste-ia { display: flex; flex-direction: column; gap: 6px; max-height: 460px; overflow-y: auto; padding-right: 8px; }
  .carte-ia {
    background: #1f1f22; border: 1px dashed #c55a7a; color: #e8e6e6; border-radius: 8px;
    padding: 6px 9px; font-size: 0.78rem; cursor: grab; box-sizing: border-box;
  }
  .carte-ia:active { cursor: grabbing; }

  .arbre { display: flex; flex-direction: column; gap: 1px; max-height: 520px; overflow-y: auto; }
  .entete-categorie {
    display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 600; color: #ccc;
    padding: 6px 4px; margin-top: 6px; border-radius: 6px; border: 1px dashed transparent; cursor: pointer;
  }
  .entete-categorie.survole { border-color: #c55a7a; background: #24151c; }
  .bascule-cat { color: #888; font-size: 0.7rem; width: 12px; }
  .cat { font-size: 0.6rem; font-weight: 700; border-radius: 4px; padding: 0 4px; color: #fff; }
  .cat-I { background: #3b82f6; } .cat-V { background: #ef4444; } .cat-E { background: #f59e0b; } .cat-R { background: #8b5cf6; }
</style>
