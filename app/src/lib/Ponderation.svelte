<script>
  import { supabase } from './supabaseClient.js'
  import { onMount } from 'svelte'
  import DetailPhoto from './DetailPhoto.svelte'

  // Pondération : bandeau de revue pour les photos nécessitant un arbitrage
  // expert. Le statut "en litige" est TOUJOURS dérivé automatiquement, jamais
  // marqué à la main (demande explicite de Gilles, 2026-09-03) :
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
  const PAGE = 60

  let chargement = $state(true)
  let erreur = $state('')
  let reports = $state([])
  let taxonomie = $state([])
  let limite = $state(PAGE)

  let litigeSeulement = $state(true)
  let rechercheUb = $state('')
  let dateDe = $state('')
  let dateA = $state('')

  let selection = $state(null) // report actuellement ouvert en detail, ou null

  async function charger() {
    chargement = true
    erreur = ''
    let requete = supabase
      .from('Incident_Reports')
      .select('Report_id,UB_id,Photo,Description,Reported_at,verifie_humain,confiance_ia,tags_ia_origine,tags_utilisateur')
      .order('Reported_at', { ascending: false })
      .limit(limite)
    if (rechercheUb.trim()) requete = requete.ilike('UB_id', `%${rechercheUb.trim()}%`)
    if (dateDe) requete = requete.gte('Reported_at', dateDe)
    if (dateA) requete = requete.lte('Reported_at', dateA + 'T23:59:59')

    const [repRes, taxRes] = await Promise.all([
      requete,
      supabase.from('Incivilites_Taxonomie').select('tag,actif,ordre,categorie_iver,propose_par_ia,criteres_detection').order('ordre'),
    ])
    if (repRes.error) { erreur = repRes.error.message; chargement = false; return }
    taxonomie = taxRes.data || []

    const ids = (repRes.data || []).map((r) => r.Report_id)
    const tagsRes = ids.length
      ? await supabase.from('Incident_Report_Tags').select('report_id,tag').in('report_id', ids)
      : { data: [] }
    const tagsByReport = {}
    ;(tagsRes.data || []).forEach((t) => { (tagsByReport[t.report_id] ||= []).push(t.tag) })

    reports = (repRes.data || []).map((r) => ({ ...r, tags_actuels: tagsByReport[r.Report_id] || [] }))
    chargement = false
  }
  onMount(charger)

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

  function formatDate(iso) {
    return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })
  }

  const urlCache = new Map()
  function urlPhoto(chemin) {
    if (!chemin) return Promise.resolve(null)
    if (urlCache.has(chemin)) return urlCache.get(chemin)
    const p = supabase.storage.from('PointSan-Incidents').createSignedUrl(chemin, 3600).then((res) => res.data?.signedUrl || null)
    urlCache.set(chemin, p)
    return p
  }

  function ouvrir(r) { selection = r }
  function fermer() { selection = null; charger() }
</script>

{#snippet vignette(r)}
  <button class="carte-photo" class:litige={r.litige} onclick={() => ouvrir(r)}>
    {#await urlPhoto(r.Photo) then url}
      {#if url}<img src={url} alt="" />{:else}<div class="pas-photo"></div>{/if}
    {/await}
    <div class="badge-verif" class:ok={r.verifie_humain}></div>
    {#if r.confiance_ia}<div class="badge-conf" style:background={COULEUR_CONFIANCE[r.confiance_ia]}></div>{/if}
    {#if r.litige}<div class="ruban">litige</div>{/if}
    <div class="legende">{r.UB_id} · {formatDate(r.Reported_at)}</div>
  </button>
{/snippet}

<div class="ponderation">
  {#if erreur}<p class="erreur">Erreur : {erreur}</p>{/if}

  {#if selection}
    {@render detail(selection)}
  {:else}
    <div class="barre">
      <label class="chk">
        <input type="checkbox" bind:checked={litigeSeulement} />
        En litige seulement ({enrichis.filter((r) => r.litige).length})
      </label>
      <input class="recherche" placeholder="Sanitaire (UB_id)…" bind:value={rechercheUb} onchange={charger} />
      <input type="date" bind:value={dateDe} onchange={charger} title="Du" />
      <input type="date" bind:value={dateA} onchange={charger} title="Au" />
    </div>

    {#if chargement}
      <p class="info">Chargement…</p>
    {:else}
      <div class="grille">
        {#each filtres as r (r.Report_id)}
          {@render vignette(r)}
        {/each}
      </div>
      {#if !filtres.length}<p class="vide">Aucune photo {litigeSeulement ? 'en litige' : ''} pour ces filtres.</p>{/if}
      {#if reports.length === limite}
        <button class="charger-plus" onclick={() => { limite += PAGE; charger() }}>Charger plus</button>
      {/if}
    {/if}
  {/if}
</div>

{#snippet detail(r)}
  <DetailPhoto report={r} {taxonomie} onFermer={fermer} {urlPhoto} />
{/snippet}

<style>
  .ponderation { display: flex; flex-direction: column; gap: 1rem; }
  .barre { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .chk { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #e8e6e6; cursor: pointer; white-space: nowrap; }
  .recherche, input[type="date"] {
    padding: 7px 10px; border-radius: 8px; border: 1px solid #333; background: #1a1a1c; color: #e8e6e6; font-size: 0.82rem;
  }
  .recherche { flex: 1; min-width: 140px; }
  .info, .vide { color: #999; font-size: 0.85rem; }
  .erreur { color: #f87171; }

  .grille { display: grid; grid-template-columns: repeat(auto-fill, minmax(96px, 1fr)); gap: 10px; }
  .carte-photo {
    position: relative; width: 100%; aspect-ratio: 1; border-radius: 8px; overflow: hidden; cursor: pointer;
    border: 2px solid transparent; background: #1a1a1c; padding: 0;
  }
  .carte-photo.litige { border-color: #c55a7a; }
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
  .charger-plus {
    align-self: center; background: #1a1a1c; border: 1px solid #333; color: #e8e6e6; border-radius: 8px;
    padding: 8px 16px; cursor: pointer; font-size: 0.82rem;
  }
</style>
