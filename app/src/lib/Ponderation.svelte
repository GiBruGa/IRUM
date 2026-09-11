<script>
  import { supabase } from './supabaseClient.js'
  import { onMount } from 'svelte'
  import DetailPhoto from './DetailPhoto.svelte'

  // "Modération Détection IVER" (ex-"Pondération", renommé 2026-09-11) :
  // poste de travail persistant, pas une liste puis une page de détail --
  // photo + infos d'une sélection toujours affichées en haut, bandeau de
  // vignettes en bas pour changer de photo sans perdre le contexte (refonte
  // demandée par Gilles, 2026-09-11).
  //
  // Le statut "en litige" est TOUJOURS dérivé automatiquement, jamais marqué
  // à la main (demande explicite de Gilles, 2026-09-03) :
  //   (a) écart entre tags_utilisateur (déclaration usager, SpotSan) et
  //       tags_ia_origine (diagnostic IA figé) sur la même photo, ou
  //   (b) échantillon systématique 1/10 des évaluations IA, pour un contrôle
  //       qualité même quand usager et IA sont d'accord.
  // Constat au 2026-09-03 (voir IRUM/CLAUDE.md) : tags_utilisateur n'est
  // aujourd'hui jamais rempli en pratique (le flux SpotSan "usager" et le
  // flux IRUM "détection IA en masse" sont encore deux pipelines disjoints,
  // pas encore les mêmes photos) -- (a) ne produira donc rien tant que ça
  // n'a pas changé, seul (b) alimente la file pour l'instant. Le code reste
  // correct pour le jour où les deux se rejoignent, pas la peine de le
  // réécrire à ce moment-là.

  const COULEUR_CONFIANCE = { haute: '#22c55e', moyenne: '#f59e0b', basse: '#ef4444' }
  // Palier de recuperation, et nombre de vignettes vise pour remplir le
  // bandeau du bas -- charger() complete automatiquement par paliers tant
  // que le filtre courant ("en litige seulement" par defaut) laisse le
  // bandeau trop clairsemé, au lieu d'afficher un compte de cache qui ne
  // correspond pas a ce qui est visible (ex. "60 en cache" pour 6 vignettes
  // affichees une fois le filtre applique -- retour de Gilles, 2026-09-11).
  const PAGE = 40
  const OBJECTIF_VIGNETTES = 30
  const LIMITE_MAX = 600

  let chargement = $state(true)
  let erreur = $state('')
  let reports = $state([])
  let taxonomie = $state([])
  let equivalences = $state([])
  let profils = $state(new Map()) // id moderateur -> {prenom, nom}
  let limite = $state(PAGE)
  let totalAExpertiser = $state(null)

  let litigeSeulement = $state(true)
  let rechercheUb = $state('')
  let dateDe = $state('')
  let dateA = $state('')

  let selection = $state(null) // Report_id affiche dans le bloc photo+infos

  // Profil du modérateur connecté -- proposé au premier usage si prénom/nom
  // manquent. Aucun champ de ce genre n'existait avant cette refonte
  // (2026-09-11) : ni display_name (jamais rempli), ni email/nom sur le
  // compte de Gilles lui-même (identité tel+password uniquement) --
  // nécessaire pour afficher "qui a pondéré" sur chaque photo.
  let profilCourant = $state(null)
  let profilPrenom = $state('')
  let profilNom = $state('')
  let profilEnregistrement = $state(false)

  async function chargerProfil() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    const { data } = await supabase.from('profiles').select('id,prenom,nom').eq('id', user.id).maybeSingle()
    profilCourant = data || { id: user.id, prenom: null, nom: null }
    profilPrenom = profilCourant.prenom || ''
    profilNom = profilCourant.nom || ''
  }
  async function enregistrerProfil() {
    profilEnregistrement = true
    erreur = ''
    try {
      const { error } = await supabase.from('profiles')
        .upsert({ id: profilCourant.id, prenom: profilPrenom.trim() || null, nom: profilNom.trim() || null })
      if (error) throw error
      profilCourant = { ...profilCourant, prenom: profilPrenom.trim() || null, nom: profilNom.trim() || null }
      profils = new Map(profils).set(profilCourant.id, { prenom: profilCourant.prenom, nom: profilCourant.nom })
    } catch (e) { erreur = e.message } finally { profilEnregistrement = false }
  }

  function appliquerFiltres(requete) {
    let r = requete
    if (rechercheUb.trim()) r = r.ilike('UB_id', `%${rechercheUb.trim()}%`)
    if (dateDe) r = r.gte('Reported_at', dateDe)
    if (dateA) r = r.lte('Reported_at', dateA + 'T23:59:59')
    return r
  }

  // "A expertiser au total" = pas encore verifie par un humain, sur les
  // memes filtres UB/date/litige que le bandeau -- Gilles voulait un vrai
  // total, pas seulement ce qui est charge en cache (2026-09-11), *et* que
  // ce total respecte bien "en litige seulement" (2026-09-11, suite).
  // Passe par le RPC compter_a_expertiser() : le critere (b) de estLitige()
  // (Report_id % 10 = 0) n'est pas exprimable via le query builder
  // PostgREST du client JS (pas d'operateur modulo), donc calcule cote base
  // -- reproduit fidelement les deux criteres de estLitige() ci-dessous.
  async function compterTotal() {
    const { data, error } = await supabase.rpc('compter_a_expertiser', {
      p_litige_seulement: litigeSeulement,
      p_ub: rechercheUb.trim() || null,
      p_date_de: dateDe || null,
      p_date_a: dateA || null,
    })
    if (error) { totalAExpertiser = null; return }
    totalAExpertiser = data ?? null
  }

  let taxonomieChargee = false
  async function chargerTaxonomieEquivalences() {
    if (taxonomieChargee) return
    const [taxRes, eqRes] = await Promise.all([
      supabase.from('Incivilites_Taxonomie').select('tag,actif,ordre,categorie_iver,propose_par_ia,criteres_detection,cle,label').order('ordre'),
      supabase.from('Tags_IA_Equivalences').select('texte_ia,tag'),
    ])
    taxonomie = taxRes.data || []
    equivalences = eqRes.data || []
    taxonomieChargee = true
  }

  // Un seul aller-retour reseau : recupere les Incident_Reports a la limite
  // courante + leurs tags + les profils des moderateurs deja presents.
  // Renvoie le nombre de lignes brutes recues (pour savoir si on a atteint
  // la fin des resultats disponibles).
  async function chargerLot() {
    let requete = supabase
      .from('Incident_Reports')
      .select('Report_id,UB_id,Photo,Description,Reported_at,verifie_humain,confiance_ia,tags_ia_origine,tags_utilisateur,pondere_par,pondere_le')
      .order('Reported_at', { ascending: false })
      .limit(limite)
    requete = appliquerFiltres(requete)
    const repRes = await requete
    if (repRes.error) { erreur = repRes.error.message; return 0 }

    const ids = (repRes.data || []).map((r) => r.Report_id)
    const tagsRes = ids.length
      ? await supabase.from('Incident_Report_Tags').select('report_id,tag').in('report_id', ids)
      : { data: [] }
    const tagsByReport = {}
    ;(tagsRes.data || []).forEach((t) => { (tagsByReport[t.report_id] ||= []).push(t.tag) })

    // Profils des modérateurs déjà présents sur ce lot -- un seul aller-retour.
    const idsModerateurs = [...new Set((repRes.data || []).map((r) => r.pondere_par).filter(Boolean))]
    if (idsModerateurs.length) {
      const { data: profData } = await supabase.from('profiles').select('id,prenom,nom').in('id', idsModerateurs)
      const m = new Map(profils)
      ;(profData || []).forEach((p) => m.set(p.id, { prenom: p.prenom, nom: p.nom }))
      profils = m
    }

    reports = (repRes.data || []).map((r) => ({ ...r, tags_actuels: tagsByReport[r.Report_id] || [] }))
    if (selection === null && reports.length) selection = reports[0].Report_id
    return repRes.data ? repRes.data.length : 0
  }

  // Chargement complet (montage initial, changement de filtre) : repart de
  // zero puis complete automatiquement par paliers de PAGE tant que le
  // bandeau du bas reste trop clairsemé pour le filtre courant, au lieu de
  // s'arrêter à un compte de cache qui ne correspond pas à ce qui est
  // affiché (retour de Gilles, 2026-09-11).
  async function charger() {
    chargement = true
    erreur = ''
    await chargerTaxonomieEquivalences()
    limite = PAGE
    let recues = await chargerLot()
    while (filtres.length < OBJECTIF_VIGNETTES && recues === limite && limite < LIMITE_MAX) {
      limite += PAGE
      recues = await chargerLot()
    }
    chargement = false
    compterTotal()
  }
  onMount(() => { chargerProfil(); charger() })

  // Reaffiche a la limite courante (pas de reinitialisation) -- utilisé après
  // l'enregistrement d'une photo, pour ne pas perdre une pagination déjà
  // étendue manuellement via "Charger un lot de plus".
  async function rafraichir() {
    await chargerLot()
    compterTotal()
  }

  // Bouton "Charger un lot de plus" : un seul palier supplémentaire, geste
  // explicite de l'utilisateur -- pas besoin de la boucle automatique de
  // charger() ici.
  async function chargerPlus() {
    limite += PAGE
    await chargerLot()
    compterTotal()
  }

  // (a) ecart utilisateur/IA -- seulement calculable si les deux existent.
  // (b) 1/10 systematique parmi les photos passees par l'IA -- Report_id
  // fait office de "compteur" (sequence globale, deja monotone), pas besoin
  // d'une colonne dediee tant que l'echantillonnage reste approximatif.
  function estLitige(r) {
    if (r.tags_utilisateur && r.tags_utilisateur.length && r.tags_ia_origine) {
      const setIa = new Set(r.tags_ia_origine)
      const setUt = new Set(r.tags_utilisateur)
      const ecart = r.tags_utilisateur.some((t) => !setIa.has(t)) || r.tags_ia_origine.some((t) => !setUt.has(t))
      if (ecart) return true
    }
    if (r.tags_ia_origine && Number(r.Report_id) % 10 === 0) return true
    return false
  }

  const enrichis = $derived(reports.map((r) => ({ ...r, litige: estLitige(r) })))
  const filtres = $derived(litigeSeulement ? enrichis.filter((r) => r.litige) : enrichis)
  const reportSelectionne = $derived(enrichis.find((r) => r.Report_id === selection) || null)

  function formatDate(iso) {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }
  function nomModerateur(id) {
    if (!id) return null
    const p = profils.get(id)
    if (!p) return null
    const nom = [p.prenom, p.nom].filter(Boolean).join(' ')
    return nom || null
  }

  const urlCache = new Map()
  function urlPhoto(chemin) {
    if (!chemin) return Promise.resolve(null)
    if (urlCache.has(chemin)) return urlCache.get(chemin)
    const p = supabase.storage.from('PointSan-Incidents').createSignedUrl(chemin, 3600).then((res) => res.data?.signedUrl || null)
    urlCache.set(chemin, p)
    return p
  }

  function apresEnregistrement() { rafraichir() }
</script>

{#snippet vignette(r)}
  <button class="carte-photo" class:litige={r.litige} class:actif={r.Report_id === selection} onclick={() => (selection = r.Report_id)}>
    {#await urlPhoto(r.Photo) then url}
      {#if url}<img src={url} alt="" />{:else}<div class="pas-photo"></div>{/if}
    {/await}
    <div class="badge-verif" class:ok={r.verifie_humain}></div>
    {#if r.confiance_ia}<div class="badge-conf" style:background={COULEUR_CONFIANCE[r.confiance_ia]}></div>{/if}
    {#if r.litige}<div class="ruban">litige</div>{/if}
    <div class="legende">{r.UB_id} · {formatDate(r.Reported_at)}</div>
  </button>
{/snippet}

<div class="moderation">
  {#if erreur}<p class="erreur">Erreur : {erreur}</p>{/if}

  {#if profilCourant && (!profilCourant.prenom || !profilCourant.nom)}
    <div class="banniere-profil">
      <span>Complète ton nom pour qu'il apparaisse sur les photos que tu pondères :</span>
      <input placeholder="Prénom" bind:value={profilPrenom} />
      <input placeholder="Nom" bind:value={profilNom} />
      <button onclick={enregistrerProfil} disabled={profilEnregistrement}>{profilEnregistrement ? 'Enregistrement…' : 'Enregistrer'}</button>
    </div>
  {/if}

  <div class="barre">
    <label class="chk">
      <input type="checkbox" bind:checked={litigeSeulement} onchange={charger} />
      En litige seulement
    </label>
    <input class="recherche" placeholder="Sanitaire (UB_id)…" bind:value={rechercheUb} onchange={charger} />
    <input type="date" bind:value={dateDe} onchange={charger} title="Du" />
    <input type="date" bind:value={dateA} onchange={charger} title="Au" />
  </div>

  {#if chargement}
    <p class="info">Chargement…</p>
  {:else}
    <div class="corps">
      {#if reportSelectionne}
        {#key reportSelectionne.Report_id}
          <DetailPhoto
            report={reportSelectionne}
            {taxonomie}
            {equivalences}
            {urlPhoto}
            nomModerateurActuel={nomModerateur(reportSelectionne.pondere_par)}
            onEnregistre={apresEnregistrement}
          />
        {/key}
      {:else}
        <p class="vide">Aucune photo {litigeSeulement ? 'en litige ' : ''}pour ces filtres.</p>
      {/if}
    </div>

    <div class="bandeau-vignettes">
      <div class="entete-vignettes">
        <!-- Seul compte affiché désormais (demande de Gilles, 2026-09-11) :
             plus de doublon avec la case à cocher, ni de "X en cache" qui ne
             correspondait jamais à ce qui est réellement visible -- et il
             respecte bien le filtre "en litige seulement" en cours (via le
             RPC compter_a_expertiser, cf. compterTotal() ci-dessus). -->
        <span>
          {totalAExpertiser !== null ? `${totalAExpertiser} photo${totalAExpertiser > 1 ? 's' : ''} à expertiser au total${litigeSeulement ? ' (en litige)' : ''}` : '…'}
        </span>
        {#if reports.length === limite}
          <button class="charger-plus" onclick={chargerPlus}>Charger un lot de plus</button>
        {/if}
      </div>
      <div class="grille-vignettes">
        {#each filtres as r (r.Report_id)}
          {@render vignette(r)}
        {/each}
        {#if !filtres.length}<p class="vide">Aucune photo {litigeSeulement ? 'en litige' : ''} pour ces filtres.</p>{/if}
      </div>
    </div>
  {/if}
</div>

<style>
  /* min-height:0 en cascade, meme principe que Catalogue.svelte : permet au
     bandeau de vignettes de rester a hauteur fixe et au bloc photo+infos de
     prendre tout le reste, sur la hauteur reelle de la fenetre. */
  .moderation { display: flex; flex-direction: column; gap: 0.6rem; height: 100%; min-height: 0; }
  .barre { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; flex-shrink: 0; }
  .chk { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #e8e6e6; cursor: pointer; white-space: nowrap; }
  .recherche, input[type="date"] {
    padding: 7px 10px; border-radius: 8px; border: 1px solid #333; background: #1a1a1c; color: #e8e6e6; font-size: 0.82rem;
  }
  .recherche { flex: 1; min-width: 140px; }
  .info, .vide { color: #999; font-size: 0.85rem; }
  .erreur { color: #f87171; flex-shrink: 0; }

  .banniere-profil {
    display: flex; align-items: center; gap: 8px; flex-wrap: wrap; flex-shrink: 0; font-size: 0.82rem; color: #e8e6e6;
    background: #24151c; border: 1px solid #c55a7a; border-radius: 8px; padding: 8px 12px;
  }
  .banniere-profil input {
    padding: 6px 9px; border-radius: 6px; border: 1px solid #333; background: #1a1a1c; color: #e8e6e6; font-size: 0.8rem; width: 130px;
  }
  .banniere-profil button {
    background: #1a1a1c; border: 1px solid #c55a7a; color: #c55a7a; border-radius: 6px; padding: 6px 12px; cursor: pointer; font-size: 0.8rem;
  }
  .banniere-profil button:disabled { opacity: 0.5; cursor: default; }

  .corps { flex: 1; min-height: 0; }

  /* Bandeau de vignettes en bas, pleine largeur, hauteur limitee a ~2 rangees
     (demande de Gilles, 2026-09-11) -- scroll interne si plus de photos. */
  .bandeau-vignettes {
    flex-shrink: 0; display: flex; flex-direction: column; gap: 6px;
    background: #17171a; border: 1px solid #2a2a2d; border-radius: 10px; padding: 0.6rem 0.7rem;
  }
  .entete-vignettes { display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 0.78rem; color: #999; }
  .charger-plus {
    background: #1a1a1c; border: 1px solid #333; color: #e8e6e6; border-radius: 8px;
    padding: 6px 12px; cursor: pointer; font-size: 0.78rem; white-space: nowrap;
  }

  .grille-vignettes {
    display: grid; grid-template-columns: repeat(auto-fill, minmax(90px, 1fr)); grid-auto-rows: 90px; gap: 8px;
    max-height: 188px; overflow-y: auto; padding-right: 4px;
  }
  .carte-photo {
    position: relative; width: 100%; height: 100%; border-radius: 8px; overflow: hidden; cursor: pointer;
    border: 2px solid transparent; background: #1a1a1c; padding: 0;
  }
  .carte-photo.litige { border-color: #c55a7a; }
  .carte-photo.actif { border-color: #e8e6e6; box-shadow: 0 0 0 2px #17171a, 0 0 0 4px #e8e6e6; }
  .carte-photo img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .pas-photo { width: 100%; height: 100%; background: #26262a; }
  .badge-verif {
    position: absolute; top: 4px; right: 4px; width: 12px; height: 12px; border-radius: 50%;
    background: #f59e0b; border: 2px solid #1a1a1c;
  }
  .badge-verif.ok { background: #22c55e; }
  .badge-conf { position: absolute; bottom: 4px; left: 4px; width: 8px; height: 8px; border-radius: 50%; border: 1px solid #1a1a1c; }
  .ruban {
    position: absolute; top: 0; left: 0; background: #c55a7a; color: #fff; font-size: 0.55rem; font-weight: 700;
    text-transform: uppercase; padding: 1px 5px; border-bottom-right-radius: 6px; letter-spacing: 0.03em;
  }
  .legende {
    position: absolute; bottom: 0; left: 0; right: 0; background: rgba(0,0,0,0.65); color: #fff; font-size: 0.55rem;
    padding: 2px 4px; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  }
</style>
