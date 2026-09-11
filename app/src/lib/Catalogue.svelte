<script>
  import { supabase } from './supabaseClient.js'
  import { onMount, untrack } from 'svelte'
  import TreeNode from './catalogue/TreeNode.svelte'
  import FicheIver from './catalogue/FicheIver.svelte'
  import { renumeroterSousArbre } from './catalogue/cle.js'

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
  //
  // Validation differee (2026-09-11, demande de Gilles suite a un bug reel :
  // une clé "I.2.1" restait affichee sur un tag redevenu racine, parce qu'une
  // ecriture partielle -- parent_tag ok, cle silencieusement en echec RLS --
  // avait desynchronise les deux). Toute action sur l'arborescence (glisser-
  // deposer, ajout, suppression, edition Fiche IVER, declaration d'equivalence)
  // ne modifie plus qu'une copie de travail locale ("brouillon"), jamais
  // Supabase directement -- la numerotation (cle) reste figee pendant l'edition.
  // Seul le bouton "Valider les modifications" ecrit reellement en base : a ce
  // moment-la, et seulement a ce moment-la, tout l'arbre est renumerote a
  // partir de sa structure finale, puis chaque ecriture est verifiee
  // (majOuErreur) avant rechargement. "Annuler" jette le brouillon.

  const CATEGORIES = [
    { code: 'I', libelle: 'Incivilités' },
    { code: 'V', libelle: 'Vandalismes' },
    { code: 'E', libelle: "Défauts d'entretien" },
    { code: 'R', libelle: 'Défauts de réparation' },
  ]

  let taxonomie = $state([]) // etat serveur (verite), rafraichi par charger()/apres validation
  let brouillon = $state([]) // copie de travail locale -- toutes les actions d'arborescence n'ecrivent qu'ici
  let suppressions = $state(new Set()) // tags marques pour suppression, appliquee a la validation
  // Equivalences (texte IA -> tag officiel) : meme principe brouillon/original
  // que le reste (demande de Gilles, 2026-09-11 -- "il faut compter
  // correctement et assurer le passage du cache vers Supabase seulement a la
  // validation"). equivalences = etat serveur ; equivalencesBrouillon = Map
  // texte_ia -> tag en cours d'edition (ajout, reassociation ET dissociation
  // sont juste des ecritures/suppressions dans cette Map, diffee contre
  // equivalences a la validation).
  let equivalences = $state([])
  let equivalencesBrouillon = $state(new Map())
  let chargement = $state(true)
  let erreur = $state('')
  let recherche = $state('')
  let ouverts = $state(new Set())
  let selection = $state(null)
  let sauvegarde = $state(false)
  let validation = $state(false)

  // Un UPDATE/INSERT Postgres filtre par une policy RLS qui echoue
  // silencieusement -- pas d'erreur, juste 0 ligne modifiee (vu en test,
  // 2026-09-04 : la Fiche IVER "enregistrait" sans rien changer). .select()
  // force Supabase a renvoyer les lignes touchees, pour distinguer "vraiment
  // enregistre" de "silencieusement refuse" et le signaler clairement plutot
  // que de laisser croire que ca a marche. Utilise uniquement au moment de
  // la validation maintenant (plus d'ecriture immediate par action).
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
    const [taxRes, eqRes] = await Promise.all([
      supabase
        .from('Incivilites_Taxonomie')
        .select('tag,actif,ordre,categorie_iver,criteres_detection,propose_par_ia,parent_tag,label,cle,propose_utilisateur')
        .order('ordre'),
      supabase.from('Tags_IA_Equivalences').select('texte_ia,tag'),
    ])
    if (taxRes.error) { erreur = taxRes.error.message; chargement = false; return }
    taxonomie = taxRes.data || []
    brouillon = taxonomie.map((t) => ({ ...t }))
    suppressions = new Set()
    equivalences = eqRes.data || []
    equivalencesBrouillon = new Map(equivalences.map((e) => [e.texte_ia, e.tag]))
    chargement = false
  }
  onMount(charger)

  // Toutes les vues derivees lisent le brouillon (pas taxonomie) -- c'est ce
  // que l'utilisateur voit et manipule pendant l'edition, avant validation.
  // Un tag marque pour suppression reste present (barre visuellement dans
  // TreeNode via noeud.supprime, cf. construireArbre) -- il ne disparait
  // qu'a la validation reelle, pour pouvoir annuler la suppression avant
  // (demande de Gilles, 2026-09-11).
  const parTag = $derived(new Map(brouillon.map((t) => [t.tag, t])))
  const enfantsParTag = $derived.by(() => {
    const m = {}
    brouillon.forEach((t) => { if (t.parent_tag) (m[t.parent_tag] ||= []).push(t) })
    return m
  })
  const suggeresIA = $derived(brouillon.filter((t) => t.propose_par_ia))

  const rechercheNorm = $derived(recherche.trim().toLowerCase())
  const tagsCorrespondants = $derived(
    rechercheNorm ? new Set(brouillon.filter((t) => t.label.toLowerCase().includes(rechercheNorm)).map((t) => t.tag)) : null
  )

  function construireArbre(tag) {
    const brut = parTag.get(tag)
    if (!brut) return null
    const enfants = (enfantsParTag[tag] || [])
      .slice()
      .sort((a, b) => a.ordre - b.ordre)
      .map((e) => construireArbre(e.tag))
      .filter(Boolean)
    return { noeud: { ...brut, supprime: suppressions.has(tag) }, enfants }
  }

  // Un tag propose_par_ia vit dans la colonne "Tags suggérés IA" tant qu'il
  // n'est ni promu (parent_tag/categorie fixes) ni fondu par équivalence --
  // il ne doit jamais apparaître aussi dans l'arbre, sinon il est visible
  // deux fois pour rien.
  function racinesCategorie(code) {
    return brouillon
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
    brouillon.filter((t) => !t.categorie_iver && !t.parent_tag && !t.propose_par_ia && t.actif)
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

  // Helpers d'ecriture sur le brouillon (jamais Supabase) -- toute action
  // d'arborescence passe par l'un des deux.
  function modifierBrouillon(tag, champs) {
    brouillon = brouillon.map((t) => (t.tag === tag ? { ...t, ...champs } : t))
  }
  function modifierPlusieurs(liste) {
    const parTagMaj = new Map(liste.map((m) => [m.tag, m.champs]))
    brouillon = brouillon.map((t) => (parTagMaj.has(t.tag) ? { ...t, ...parTagMaj.get(t.tag) } : t))
  }

  function reparenter(tagDeplace, cibleTag) {
    if (tagDeplace === cibleTag) return
    // Empeche de deplacer un noeud sous l'un de ses propres descendants.
    let v = cibleTag
    while (v) { if (v === tagDeplace) { erreur = 'Impossible : cible dans sa propre descendance.'; return }; v = parTag.get(v)?.parent_tag }

    const noeud = parTag.get(tagDeplace)
    const cible = parTag.get(cibleTag)
    if (!noeud || !cible) return
    const nouvellePosition = (enfantsParTag[cibleTag] || []).length + 1
    // Pas de recalcul de cle ici -- la numerotation reste figee jusqu'a la
    // validation (demande de Gilles, 2026-09-11) ; seule la structure
    // (parent_tag/ordre) bouge dans le brouillon.
    modifierBrouillon(tagDeplace, { parent_tag: cibleTag, categorie_iver: cible.categorie_iver, ordre: nouvellePosition })
    ouverts = new Set([...ouverts, cibleTag])
  }

  // Reordonner comme frere (avant/apres une cible), sans devenir son enfant
  // -- gap signale par Gilles, 2026-09-04 : avant, seul "devenir enfant"
  // existait au depot. Renumerote l'ordre de toute la fratrie dans le
  // brouillon (pas seulement le noeud deplace) puisque inserer au milieu
  // decale la position de chacun -- la cle, elle, ne bouge qu'a la validation.
  function reordonner(tagDeplace, cibleTag, avant) {
    if (tagDeplace === cibleTag) return
    const noeud = parTag.get(tagDeplace)
    const cible = parTag.get(cibleTag)
    if (!noeud || !cible) return
    let v = cible.parent_tag
    while (v) { if (v === tagDeplace) { erreur = 'Impossible : cible dans sa propre descendance.'; return }; v = parTag.get(v)?.parent_tag }

    const nouveauParentTag = cible.parent_tag
    const nouvelleCategorie = cible.categorie_iver

    const fratrieBrute = nouveauParentTag
      ? (enfantsParTag[nouveauParentTag] || [])
      // (t.categorie_iver ?? null) : Postgres renvoie null (pas undefined) pour
      // une colonne vide -- une comparaison stricte avec nouvelleCategorie
      // (undefined quand cible est "Non classé") ne matchait jamais, cassant
      // le reordonnancement dans "Non classé" silencieusement.
      : brouillon.filter((t) => (t.categorie_iver ?? null) === (nouvelleCategorie ?? null) && !t.parent_tag && !t.propose_par_ia)
    const fratrie = fratrieBrute.filter((t) => t.tag !== tagDeplace).sort((a, b) => a.ordre - b.ordre)
    const indexCible = fratrie.findIndex((t) => t.tag === cibleTag)
    fratrie.splice(avant ? indexCible : indexCible + 1, 0, noeud)

    modifierPlusieurs(fratrie.map((f, i) => ({
      tag: f.tag,
      champs: f.tag === tagDeplace
        ? { parent_tag: nouveauParentTag, categorie_iver: nouvelleCategorie, ordre: i + 1 }
        : { ordre: i + 1 },
    })))
  }

  function promouvoir(tagIA, categorieCode) {
    const noeud = parTag.get(tagIA)
    if (!noeud) return
    const position = racinesCategorie(categorieCode).length + 1
    modifierBrouillon(tagIA, { parent_tag: null, categorie_iver: categorieCode, ordre: position, propose_par_ia: false })
  }

  // Declare OU reassocie (meme operation : ecrase juste la cible dans la
  // Map) -- glisser un texte IA (Suggérés, ou deja Associé a un autre tag)
  // sur une ligne de l'arbre passe toujours par ici.
  function declarerEquivalence(texteIa, cibleTag) {
    modifierBrouillon(texteIa, { actif: false, propose_par_ia: false })
    equivalencesBrouillon = new Map(equivalencesBrouillon).set(texteIa, cibleTag)
  }

  // Dissocier (bouton "×" de l'encart Associés, 2026-09-11) : le texte IA
  // redevient un simple tag suggere, comme s'il n'avait jamais ete rattache.
  function dissocierEquivalence(texteIa) {
    modifierBrouillon(texteIa, { actif: true, propose_par_ia: true })
    const m = new Map(equivalencesBrouillon)
    m.delete(texteIa)
    equivalencesBrouillon = m
  }

  // Textes IA actuellement associes (dans le brouillon) au tag selectionne --
  // alimente l'encart "Tags IA Associés" (demande de Gilles, 2026-09-11 :
  // pouvoir verifier la pertinence des equivalences d'un tag apres coup, et
  // les reassocier/dissocier).
  const associesDuTagSelectionne = $derived(
    selection
      ? [...equivalencesBrouillon.entries()].filter(([, tag]) => tag === selection).map(([texteIa]) => texteIa)
      : []
  )

  function surGlisserDeposeArbre(action) {
    erreur = ''
    if (action.type === 'reparent') reparenter(action.tag, action.cibleTag)
    else if (action.type === 'reordonner') reordonner(action.tag, action.cibleTag, action.avant)
    else if (action.type === 'equivalence') declarerEquivalence(action.texteIa, action.cibleTag)
  }

  function surDragStartIA(e, tag) {
    e.dataTransfer.setData('text/x-irum-ia', tag)
    e.dataTransfer.effectAllowed = 'move'
  }

  let survoleAssocies = $state(false)
  function surDropAssocies(e) {
    e.preventDefault()
    survoleAssocies = false
    if (!selection) return
    const texteIa = e.dataTransfer.getData('text/x-irum-ia')
    if (texteIa) declarerEquivalence(texteIa, selection)
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
      modifierBrouillon(tagDeplace, { parent_tag: null, categorie_iver: code, ordre: position })
    }
  }

  function enregistrerFiche(tag, valeurs) {
    modifierBrouillon(tag, valeurs)
  }

  // Suppression differee : marquee dans "suppressions", appliquee seulement a
  // la validation -- le tag reste visible dans l'arbre (barre, cf.
  // TreeNode.svelte) jusque-la, pour pouvoir "Annuler la suppression" par
  // clic droit avant de valider (demande de Gilles, 2026-09-11). Le
  // detachement des enfants (parent_tag -> null, comme ON DELETE SET NULL
  // cote base) n'est calcule qu'a la validation, voir validerMiseAJour --
  // pas ici, pour ne rien avoir a "annuler" en cas de retour en arriere.
  function marquerPourSuppression(tag) {
    suppressions = new Set([...suppressions, tag])
  }
  function annulerSuppressionTag(tag) {
    const s = new Set(suppressions)
    s.delete(tag)
    suppressions = s
  }

  // Propose un vrai fichier a l'utilisateur (demande de Gilles, 2026-09-11 :
  // le bouton n'indiquait nulle part ou finissait la sauvegarde -- seul un
  // insert Supabase invisible se produisait). showSaveFilePicker ouvre une
  // fenetre "Enregistrer sous" native (Chrome/Edge) laissant choisir
  // l'emplacement ; a defaut (Firefox/Safari, ou fenetre annulee/indisponible),
  // repli sur un telechargement classique <a download> -- va dans le dossier
  // Telechargements par defaut du navigateur, exactement ce qui etait demande.
  async function telechargerJson(nomFichier, contenu) {
    const texte = JSON.stringify(contenu, null, 2)
    if (window.showSaveFilePicker) {
      try {
        const poignee = await window.showSaveFilePicker({
          suggestedName: nomFichier,
          types: [{ description: 'JSON', accept: { 'application/json': ['.json'] } }],
        })
        const flux = await poignee.createWritable()
        await flux.write(texte)
        await flux.close()
        return
      } catch (e) {
        if (e.name === 'AbortError') return // fenetre annulee par l'utilisateur -- pas une erreur
        // sinon on tente le repli ci-dessous
      }
    }
    const blob = new Blob([texte], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = nomFichier
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  async function sauvegarderVersion() {
    sauvegarde = true
    const maintenant = new Date()
    const titre = `Catalogue du ${maintenant.toLocaleDateString('fr-FR')} ${maintenant.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}`
    const pad = (n) => String(n).padStart(2, '0')
    const nomFichier = `catalogue-iver_${maintenant.getFullYear()}-${pad(maintenant.getMonth() + 1)}-${pad(maintenant.getDate())}_${pad(maintenant.getHours())}h${pad(maintenant.getMinutes())}.json`
    try {
      // Snapshot de l'etat serveur reel (taxonomie), pas du brouillon en
      // cours d'edition -- une version sauvegardee doit refleter ce qui est
      // effectivement en base, pas des modifications pas encore validees.
      //
      // telechargerJson AVANT l'ecriture Supabase, volontairement : l'API
      // showSaveFilePicker exige d'etre appelee pendant le geste utilisateur
      // (le clic) -- un premier `await` reseau avant elle ferait perdre cette
      // autorisation dans certains navigateurs.
      await telechargerJson(nomFichier, taxonomie)
      const { error: e2 } = await supabase.from('Catalogue_Versions').insert({ titre, contenu: taxonomie })
      if (e2) throw e2
      alert(`Version sauvegardée : "${titre}" (historique du Catalogue + fichier).`)
    } catch (e) { erreur = e.message } finally { sauvegarde = false }
  }

  const noeudSelectionne = $derived(selection ? parTag.get(selection) : null)

  // Menu contextuel (clic droit sur un tag) -- demande de Gilles, 2026-09-11 :
  // ajouter un tag juste en dessous du tag cliqué, ou le marquer pour
  // suppression (avec confirmation), sans passer par la Fiche IVER.
  let menuContextuel = $state(null) // { tag, x, y }
  function ouvrirMenuContextuel(tag, x, y) { menuContextuel = { tag, x, y } }
  function fermerMenuContextuel() { menuContextuel = null }

  function ajouterTagApres(tagRef) {
    fermerMenuContextuel()
    const cible = parTag.get(tagRef)
    if (!cible) return
    const parentTag = cible.parent_tag
    const categorie = cible.categorie_iver
    const fratrieBrute = parentTag
      ? (enfantsParTag[parentTag] || [])
      : brouillon.filter((t) => (t.categorie_iver ?? null) === (categorie ?? null) && !t.parent_tag && !t.propose_par_ia)
    const fratrie = fratrieBrute.slice().sort((a, b) => a.ordre - b.ordre)
    const indexCible = fratrie.findIndex((t) => t.tag === tagRef)
    const nouveauTag = `nouveau_${Date.now()}`
    // cle "?" en attente : comme pour tout le reste, la vraie cle n'est
    // calculee qu'a la validation.
    const nouveauNoeud = {
      tag: nouveauTag, label: 'Nouveau tag', cle: '?', parent_tag: parentTag, categorie_iver: categorie,
      ordre: indexCible + 2, actif: true, propose_par_ia: false, propose_utilisateur: false, criteres_detection: null,
    }
    brouillon = [...brouillon, nouveauNoeud]
    if (fratrie.length > indexCible + 1) {
      modifierPlusieurs(fratrie.slice(indexCible + 1).map((f, i) => ({ tag: f.tag, champs: { ordre: indexCible + 3 + i } })))
    }
    selection = nouveauTag
    ouverts = new Set([...ouverts, ...(parentTag ? [parentTag] : []), `cat:${categorie}`])
  }

  function supprimerAvecConfirmation(tagRef) {
    fermerMenuContextuel()
    const cible = parTag.get(tagRef)
    if (!cible) return
    if (!confirm(`Marquer le tag « ${cible.label} » pour suppression ? Elle sera appliquée lors de la validation du catalogue.`)) return
    marquerPourSuppression(tagRef)
  }

  function annulerSuppressionAvecMenu(tagRef) {
    fermerMenuContextuel()
    annulerSuppressionTag(tagRef)
  }

  // Nombre de modifications en attente -- pilote l'affichage de la barre de
  // validation et le texte du bouton. cle exclue volontairement : elle ne
  // compte jamais comme une "modification utilisateur" puisqu'elle n'est
  // jamais editee a la main, seulement recalculee a la validation.
  const nbModifications = $derived.by(() => {
    const original = new Map(taxonomie.map((t) => [t.tag, t]))
    const champs = ['parent_tag', 'categorie_iver', 'ordre', 'actif', 'propose_par_ia', 'label', 'criteres_detection', 'propose_utilisateur']
    let n = 0
    for (const b of brouillon) {
      if (suppressions.has(b.tag)) continue
      const o = original.get(b.tag)
      if (!o) { n++; continue }
      if (champs.some((c) => b[c] !== o[c])) n++
    }
    // Equivalences : ajoutees/reassociees (cible differente de l'original) +
    // dissociees (presentes dans l'original, absentes du brouillon).
    const equivOriginales = new Map(equivalences.map((e) => [e.texte_ia, e.tag]))
    let nEquiv = 0
    for (const [texteIa, tag] of equivalencesBrouillon) {
      if (equivOriginales.get(texteIa) !== tag) nEquiv++
    }
    for (const texteIa of equivOriginales.keys()) {
      if (!equivalencesBrouillon.has(texteIa)) nEquiv++
    }
    return n + suppressions.size + nEquiv
  })

  function annulerModifications() {
    brouillon = taxonomie.map((t) => ({ ...t }))
    suppressions = new Set()
    equivalencesBrouillon = new Map(equivalences.map((e) => [e.texte_ia, e.tag]))
    erreur = ''
  }

  // Seul point d'ecriture reelle vers Supabase pour toute l'arborescence
  // (demande de Gilles, 2026-09-11). Deroulement :
  //  1. construit l'etat final (brouillon moins les suppressions) ;
  //  2. renumerote TOUT l'arbre a partir de cette structure finale -- seul
  //     moment ou la cle change, jamais pendant l'edition ;
  //  3. n'ecrit que ce qui a reellement change (diff vs l'etat serveur
  //     d'origine), chaque ecriture verifiee (majOuErreur) ;
  //  4. applique les suppressions, puis les equivalences en attente ;
  //  5. recharge depuis le serveur (reinitialise aussi le brouillon).
  // En cas d'echec en cours de route, le brouillon n'est PAS jete : Gilles
  // peut corriger la session EkoMa puis re-cliquer Valider sans tout reperdre.
  async function validerMiseAJour() {
    if (!nbModifications) return
    if (!confirm(`Appliquer ${nbModifications} modification${nbModifications > 1 ? 's' : ''} au catalogue ?`)) return
    validation = true
    erreur = ''
    try {
      // Les enfants directs d'un tag supprime sont detaches a la validation
      // (parent_tag -> null), comme le fait ON DELETE SET NULL cote base --
      // calcule ici seulement (pas dans le brouillon pendant l'edition) pour
      // que "Annuler la suppression" n'ait rien a defaire (2026-09-11).
      // label/criteres_detection ne sont plus coupés (trim) à chaque frappe
      // dans FicheIver.svelte (ça effaçait les espaces tapés, cf. bug
      // 2026-09-11 ci-dessous) -- le nettoyage final n'a donc lieu qu'ici,
      // une seule fois, juste avant l'écriture réelle.
      const survivants = brouillon
        .filter((t) => !suppressions.has(t.tag))
        .map((t) => ({
          ...t,
          parent_tag: t.parent_tag && suppressions.has(t.parent_tag) ? null : t.parent_tag,
          label: typeof t.label === 'string' ? t.label.trim() : t.label,
          criteres_detection: typeof t.criteres_detection === 'string' ? (t.criteres_detection.trim() || null) : t.criteres_detection,
        }))
      const enfantsFinal = {}
      survivants.forEach((t) => { if (t.parent_tag) (enfantsFinal[t.parent_tag] ||= []).push(t) })

      const nouvellesCles = new Map()
      CATEGORIES.forEach((cat) => {
        const racines = survivants
          .filter((t) => t.categorie_iver === cat.code && !t.parent_tag && !t.propose_par_ia)
          .sort((a, b) => a.ordre - b.ordre)
        racines.forEach((racine, i) => {
          renumeroterSousArbre(racine, cat.code, i + 1, enfantsFinal).forEach(({ tag, cle }) => nouvellesCles.set(tag, cle))
        })
      })
      const racinesNC = survivants
        .filter((t) => !t.categorie_iver && !t.parent_tag && !t.propose_par_ia && t.actif)
        .sort((a, b) => a.ordre - b.ordre)
      racinesNC.forEach((racine, i) => {
        renumeroterSousArbre(racine, null, i + 1, enfantsFinal).forEach(({ tag, cle }) => nouvellesCles.set(tag, cle))
      })

      const original = new Map(taxonomie.map((t) => [t.tag, t]))
      const champsSurveilles = ['parent_tag', 'categorie_iver', 'ordre', 'actif', 'propose_par_ia', 'label', 'criteres_detection', 'propose_utilisateur']

      // Passe 0 : neutralise d'abord tout cle qui va changer, avec une valeur
      // temporaire garantie unique (prefixee "~", jamais produite par
      // calculerCle) -- `cle` porte une contrainte UNIQUE simple (pas
      // DEFERRABLE, et de toute facon chaque appel Supabase est sa propre
      // transaction auto-committee, donc un DEFERRABLE n'aiderait pas ici).
      // Sans cette passe, un reordonnancement qui echange deux cle (le
      // nouveau cle de A = l'ancien cle de B, pas encore ecrit) declenche une
      // violation de contrainte transitoire meme si l'etat final est valide
      // -- bug reel, 2026-09-11 ("duplicate key value violates unique
      // constraint incivilites_taxonomie_cle_key").
      for (const b of survivants) {
        const cle = nouvellesCles.get(b.tag) ?? b.cle
        const orig = original.get(b.tag)
        if (orig && cle !== orig.cle) {
          await majOuErreur(supabase.from('Incivilites_Taxonomie').update({ cle: `~${b.tag}` }).eq('tag', b.tag))
        }
      }

      for (const b of survivants) {
        const cle = nouvellesCles.get(b.tag) ?? b.cle
        const orig = original.get(b.tag)
        if (!orig) {
          await majOuErreur(supabase.from('Incivilites_Taxonomie').insert({ ...b, cle }))
          continue
        }
        const valeurs = {}
        champsSurveilles.forEach((c) => { if (b[c] !== orig[c]) valeurs[c] = b[c] })
        if (cle !== orig.cle) valeurs.cle = cle
        if (Object.keys(valeurs).length) {
          await majOuErreur(supabase.from('Incivilites_Taxonomie').update(valeurs).eq('tag', b.tag))
        }
      }
      for (const tag of suppressions) {
        await majOuErreur(supabase.from('Incivilites_Taxonomie').delete().eq('tag', tag))
      }

      // Equivalences : diff brouillon vs original, comme le reste --
      // ajouts/reassociations en upsert (texte_ia est la cle primaire, donc
      // un upsert couvre les deux cas d'un seul geste), dissociations en delete.
      const equivOriginales = new Map(equivalences.map((e) => [e.texte_ia, e.tag]))
      for (const [texteIa, tag] of equivalencesBrouillon) {
        if (equivOriginales.get(texteIa) !== tag) {
          const { error: eqErr } = await supabase.from('Tags_IA_Equivalences').upsert({ texte_ia: texteIa, tag })
          if (eqErr) throw eqErr
        }
      }
      for (const texteIa of equivOriginales.keys()) {
        if (!equivalencesBrouillon.has(texteIa)) {
          const { error: eqErr } = await supabase.from('Tags_IA_Equivalences').delete().eq('texte_ia', texteIa)
          if (eqErr) throw eqErr
        }
      }

      await charger()
    } catch (e) { erreur = e.message } finally { validation = false }
  }
</script>

<div class="catalogue">
  {#if erreur}<p class="erreur">Erreur : {erreur}</p>{/if}

  <div class="entete">
    <input class="recherche" placeholder="Recherche d'un tag…" bind:value={recherche} />
    <!-- Toujours visible (pas seulement quand il y a quelque chose en
         attente) -- demande de Gilles, 2026-09-11 : il veut voir ce bouton
         sur la meme ligne que "Sauvegarder le catalogue", desactive tant
         qu'il n'y a rien a valider plutot que d'apparaitre/disparaitre. -->
    <button class="btn-annuler" onclick={annulerModifications} disabled={validation || !nbModifications}>
      Annuler
    </button>
    <button class="btn-valider" onclick={validerMiseAJour} disabled={validation || !nbModifications}>
      {validation ? 'Validation…' : nbModifications ? `Valider les modifications (${nbModifications})` : 'Valider les modifications'}
    </button>
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

      <div class="col-droite">
      <section class="col-fiche">
        {#if noeudSelectionne}
          {#key noeudSelectionne.tag}
            <FicheIver noeud={noeudSelectionne} onEnregistrer={enregistrerFiche} />
          {/key}
        {:else}
          <p class="vide">Cliquez un tag dans l'arborescence pour voir sa fiche.</p>
        {/if}
      </section>

      <!-- Tags IA Associés (demande de Gilles, 2026-09-11) : liste, pour le
           tag actuellement sélectionné, les textes IA qui lui sont
           équivalents -- pour vérifier leur pertinence après coup et les
           réassocier (glisser vers un autre tag de l'arbre) ou les dissocier
           (×) sans avoir à fouiller la base. -->
      <section
        class="col-associes"
        class:survole={survoleAssocies}
        ondragover={(e) => { if (noeudSelectionne) { e.preventDefault(); survoleAssocies = true } }}
        ondragleave={() => (survoleAssocies = false)}
        ondrop={(e) => surDropAssocies(e)}
      >
        <h2>Tags IA Associés {noeudSelectionne ? `(${associesDuTagSelectionne.length})` : ''}</h2>
        {#if !noeudSelectionne}
          <p class="vide">Sélectionnez un tag pour voir ou associer des textes IA.</p>
        {:else}
          <div class="liste-associes" role="list">
            {#each associesDuTagSelectionne as texteIa (texteIa)}
              <div class="carte-ia carte-associee" role="listitem" draggable="true" ondragstart={(e) => surDragStartIA(e, texteIa)}>
                <span>{texteIa}</span>
                <button class="btn-dissocier" title="Dissocier" onclick={() => dissocierEquivalence(texteIa)}>×</button>
              </div>
            {/each}
            {#if !associesDuTagSelectionne.length}<p class="vide">Aucun texte IA associé. Glissez-en un ici depuis « Tags suggérés IA ».</p>{/if}
          </div>
        {/if}
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
                  surMenuContextuel={ouvrirMenuContextuel}
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
                surMenuContextuel={ouvrirMenuContextuel}
              />
            {/each}
          {/if}
        </div>
      </section>
      </div>
    </div>
  {/if}

  {#if menuContextuel}
    <button class="voile-menu" aria-label="Fermer le menu" onclick={fermerMenuContextuel} oncontextmenu={(e) => { e.preventDefault(); fermerMenuContextuel() }}></button>
    <div class="menu-contextuel" style:left="{menuContextuel.x}px" style:top="{menuContextuel.y}px" role="menu">
      <button role="menuitem" onclick={() => ajouterTagApres(menuContextuel.tag)}>+ Ajouter un tag en dessous</button>
      {#if suppressions.has(menuContextuel.tag)}
        <button role="menuitem" onclick={() => annulerSuppressionAvecMenu(menuContextuel.tag)}>↩ Annuler la suppression</button>
      {:else}
        <button role="menuitem" class="danger" onclick={() => supprimerAvecConfirmation(menuContextuel.tag)}>Supprimer ce tag</button>
      {/if}
    </div>
  {/if}
</div>

<style>
  /* min-height:0 en cascade (catalogue -> colonnes -> col-ia/col-droite ->
     col-arbre -> .arbre) : c'est ce qui permet a .liste-ia et .arbre de se
     caler sur la hauteur reelle de la fenetre en pur flexbox (voir App.svelte,
     ".app"/"main.pleine-hauteur") plutot qu'un max-height mesure en JS --
     demande de Gilles, 2026-09-11. Sans min-height:0 un enfant flex ne peut
     jamais devenir plus petit que son contenu, et deborde au lieu de scroller. */
  .catalogue { display: flex; flex-direction: column; gap: 0.6rem; height: 100%; min-height: 0; }
  .entete { display: flex; gap: 10px; align-items: center; flex-shrink: 0; }
  .recherche { flex: 1; padding: 8px 12px; border-radius: 8px; border: 1px solid #333; background: #1a1a1c; color: #e8e6e6; font-size: 0.9rem; }
  .btn-sauver { background: #1a1a1c; border: 1px solid #333; color: #e8e6e6; border-radius: 8px; padding: 8px 14px; cursor: pointer; font-size: 0.82rem; white-space: nowrap; }
  .btn-sauver:disabled { opacity: 0.5; cursor: default; }
  .avertissement { color: #f59e0b; font-size: 0.78rem; margin: 0; flex-shrink: 0; }
  .erreur { color: #f87171; flex-shrink: 0; }
  .info, .vide { color: #999; font-size: 0.85rem; }

  /* Annuler/Valider : sur la meme ligne que "Sauvegarder le catalogue",
     toujours visibles mais desactives tant qu'il n'y a rien en attente --
     demande de Gilles, 2026-09-11 (il ne voyait pas apparaitre le bouton). */
  .btn-annuler, .btn-valider {
    border-radius: 8px; padding: 8px 14px; cursor: pointer; font-size: 0.82rem; font-weight: 600; white-space: nowrap;
  }
  .btn-annuler { background: #1a1a1c; border: 1px solid #333; color: #e8e6e6; }
  .btn-valider { background: #1a1a1c; border: 1px solid #c55a7a; color: #c55a7a; }
  .btn-annuler:disabled, .btn-valider:disabled { opacity: 0.5; cursor: default; }

  /* Largeur IA fixe (demande de Gilles, 2026-09-04 : x2, 220->440) ; la
     colonne de droite (Fiche + Arborescence, demande du 2026-09-11) prend
     tout le reste de la largeur. */
  .colonnes { display: grid; grid-template-columns: 440px 1fr; gap: 1rem; flex: 1; min-height: 0; }
  @media (max-width: 1400px) { .colonnes { grid-template-columns: 1fr; height: auto; } }

  /* Fiche IVER au-dessus de l'Arborescence (demande de Gilles, 2026-09-11,
     remplace l'ancienne 3e colonne cote a cote) : Fiche garde sa hauteur
     naturelle (flex-shrink:0), Arborescence prend tout le reste. */
  .col-droite { display: flex; flex-direction: column; gap: 1rem; min-height: 0; }

  .col-ia, .col-arbre, .col-fiche, .col-associes {
    background: #17171a; border: 1px solid #2a2a2d; border-radius: 10px; padding: 0.7rem;
  }
  .col-ia { display: flex; flex-direction: column; min-height: 0; }
  .col-fiche { flex-shrink: 0; }
  /* Comme .col-fiche : hauteur naturelle, ne grandit pas -- l'Arborescence
     doit garder tout le reste de l'espace disponible. Scroll interne propre
     si beaucoup de textes IA sont associés au meme tag. */
  .col-associes { flex-shrink: 0; max-height: 220px; display: flex; flex-direction: column; }
  .col-associes.survole { border-color: #c55a7a; background: #1c1418; }
  .col-arbre { display: flex; flex-direction: column; flex: 1; min-height: 0; }
  h2 { font-size: 0.82rem; margin: 0 0 0.6rem; color: #e8e6e6; flex-shrink: 0; }

  .liste-associes { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; overflow-y: auto; padding-right: 4px; }
  .carte-associee {
    display: flex; align-items: center; justify-content: space-between; gap: 6px; cursor: grab;
  }
  .carte-associee span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .carte-associee:active { cursor: grabbing; }
  .btn-dissocier {
    background: transparent; border: none; color: #c55a7a; font-size: 0.95rem; line-height: 1; cursor: pointer;
    padding: 0 2px; flex-shrink: 0;
  }

  /* padding-right : les cartes en pointilles (border dashed) ne doivent pas
     toucher l'ascenseur vertical (demande de Gilles, 2026-09-04). */
  .liste-ia { display: flex; flex-direction: column; gap: 6px; flex: 1; min-height: 0; overflow-y: auto; padding-right: 8px; }
  .carte-ia {
    background: #1f1f22; border: 1px dashed #c55a7a; color: #e8e6e6; border-radius: 8px;
    padding: 6px 9px; font-size: 0.78rem; cursor: grab; box-sizing: border-box;
  }
  .carte-ia:active { cursor: grabbing; }

  .arbre { display: flex; flex-direction: column; gap: 1px; flex: 1; min-height: 0; overflow-y: auto; }
  .entete-categorie {
    display: flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 600; color: #ccc;
    padding: 6px 4px; margin-top: 6px; border-radius: 6px; border: 1px dashed transparent; cursor: pointer;
  }
  .entete-categorie.survole { border-color: #c55a7a; background: #24151c; }
  .bascule-cat { color: #888; font-size: 0.7rem; width: 12px; }
  .cat { font-size: 0.6rem; font-weight: 700; border-radius: 4px; padding: 0 4px; color: #fff; }
  .cat-I { background: #3b82f6; } .cat-V { background: #ef4444; } .cat-E { background: #f59e0b; } .cat-R { background: #8b5cf6; }

  /* Menu contextuel (clic droit sur un tag, demande de Gilles 2026-09-11) --
     voile plein-ecran transparent pour fermer au clic ailleurs, menu positionne
     au point de clic. Boutons : pas de fond plein par defaut (charte §7). */
  .voile-menu { position: fixed; inset: 0; background: transparent; border: none; z-index: 40; cursor: default; padding: 0; }
  .menu-contextuel {
    position: fixed; z-index: 41; background: #1f1f22; border: 1px solid #333; border-radius: 8px;
    padding: 4px; display: flex; flex-direction: column; min-width: 220px; box-shadow: 0 6px 20px rgba(0,0,0,0.4);
  }
  .menu-contextuel button {
    background: transparent; border: none; color: #e8e6e6; text-align: left; padding: 8px 10px;
    border-radius: 6px; font-size: 0.82rem; cursor: pointer;
  }
  .menu-contextuel button:hover { background: #2a2a2d; }
  .menu-contextuel button.danger { color: #c55a7a; }
</style>
