<script>
  import { supabase } from './supabaseClient.js'
  import { onMount } from 'svelte'

  // Catalogue Tag IVER : deux listes paralleles (Actifs / En attente), on
  // fait glisser un tag de l'une a l'autre pour l'activer/desactiver.
  // "Actif" = seule liste exposee aux usagers SpotSan (pas de tag libre
  // cote usager -- seule l'IA peut proposer un intitule libre, cf.
  // detection_iv.js). Recherche en tete pour reperer un doublon proche
  // avant d'activer un nouveau tag propose par l'IA (demande de Gilles).

  const LIBELLE_CATEGORIE = { I: 'Incivilité', V: 'Vandalisme', E: "Défaut d'entretien", R: 'Défaut de réparation' }

  let taxonomie = $state([])
  let chargement = $state(true)
  let erreur = $state('')
  let recherche = $state('')
  let survole = $state(null) // 'actifs' | 'attente' | null -- pour le retour visuel pendant le survol

  let nouveauTag = $state('')
  let nouvelleCategorie = $state('I')

  async function charger() {
    chargement = true
    const { data, error } = await supabase
      .from('Incivilites_Taxonomie')
      .select('tag,actif,ordre,categorie_iver,propose_par_ia,criteres_detection')
      .order('ordre')
    if (error) { erreur = error.message; chargement = false; return }
    taxonomie = data || []
    chargement = false
  }
  onMount(charger)

  const rechercheNorm = $derived(recherche.trim().toLowerCase())
  const filtree = $derived(
    rechercheNorm ? taxonomie.filter((t) => t.tag.toLowerCase().includes(rechercheNorm)) : taxonomie
  )
  const actifs = $derived(filtree.filter((t) => t.actif))
  const enAttente = $derived(filtree.filter((t) => !t.actif))

  async function basculerActif(tag, nouvelEtat) {
    const { error } = await supabase.from('Incivilites_Taxonomie').update({ actif: nouvelEtat }).eq('tag', tag)
    if (error) { alert('Erreur : ' + error.message); return }
    const item = taxonomie.find((t) => t.tag === tag)
    if (item) item.actif = nouvelEtat
  }

  function surDragStart(e, tag) {
    e.dataTransfer.setData('text/plain', tag)
  }
  function surDragOver(e, colonne) {
    e.preventDefault()
    survole = colonne
  }
  function surDrop(e, colonne) {
    e.preventDefault()
    survole = null
    const tag = e.dataTransfer.getData('text/plain')
    if (!tag) return
    basculerActif(tag, colonne === 'actifs')
  }

  async function ajouterTag() {
    const val = nouveauTag.trim()
    if (!val) return
    if (taxonomie.some((t) => t.tag.toLowerCase() === val.toLowerCase())) {
      alert('Ce tag (ou un très proche) existe déjà — vérifiez la recherche avant de le recréer.')
      return
    }
    const maxOrdre = taxonomie.reduce((m, t) => Math.max(m, t.ordre), 0)
    const { error } = await supabase
      .from('Incivilites_Taxonomie')
      .insert({ tag: val, ordre: maxOrdre + 1, categorie_iver: nouvelleCategorie, actif: true })
    if (error) { alert('Erreur : ' + error.message); return }
    nouveauTag = ''
    await charger()
  }
</script>

<div class="catalogue">
  {#if erreur}<p class="erreur">Erreur : {erreur}</p>{/if}

  <div class="barre">
    <input placeholder="Rechercher (avant de créer un nouveau tag, vérifier qu'il n'existe pas déjà)…" bind:value={recherche} />
  </div>

  {#if chargement}
    <p class="info">Chargement…</p>
  {:else}
    <div class="colonnes">
      <section
        class="colonne"
        class:survole={survole === 'actifs'}
        role="list"
        aria-label="Tags actifs"
        ondragover={(e) => surDragOver(e, 'actifs')}
        ondragleave={() => (survole = null)}
        ondrop={(e) => surDrop(e, 'actifs')}
      >
        <h2>Actifs ({actifs.length}) <span class="sous">— disponibles pour les usagers SpotSan</span></h2>
        {#each actifs as t (t.tag)}
          <div class="carte" role="listitem" draggable="true" ondragstart={(e) => surDragStart(e, t.tag)}>
            {#if t.categorie_iver}<span class="badge cat-{t.categorie_iver}">{t.categorie_iver}</span>{/if}
            <span class="libelle">{t.tag}</span>
            {#if t.criteres_detection}<span class="critere" title={t.criteres_detection}>ℹ️</span>{/if}
            <button class="fleche" onclick={() => basculerActif(t.tag, false)} title="Désactiver">→</button>
          </div>
        {/each}
        {#if !actifs.length}<p class="vide">Rien ici — glissez un tag depuis "En attente".</p>{/if}
      </section>

      <section
        class="colonne"
        class:survole={survole === 'attente'}
        role="list"
        aria-label="Tags en attente"
        ondragover={(e) => surDragOver(e, 'attente')}
        ondragleave={() => (survole = null)}
        ondrop={(e) => surDrop(e, 'attente')}
      >
        <h2>En attente ({enAttente.length}) <span class="sous">— inactifs, ou proposés par l'IA non encore validés</span></h2>
        {#each enAttente as t (t.tag)}
          <div class="carte" role="listitem" draggable="true" ondragstart={(e) => surDragStart(e, t.tag)}>
            <button class="fleche" onclick={() => basculerActif(t.tag, true)} title="Activer">←</button>
            {#if t.categorie_iver}<span class="badge cat-{t.categorie_iver}">{t.categorie_iver}</span>{/if}
            <span class="libelle">{t.tag}{t.propose_par_ia ? ' 🆕' : ''}</span>
          </div>
        {/each}
        {#if !enAttente.length}<p class="vide">Rien ici.</p>{/if}
      </section>
    </div>

    <div class="ajout">
      <input placeholder="Ajouter un nouveau tag officiel…" bind:value={nouveauTag} onkeydown={(e) => e.key === 'Enter' && ajouterTag()} />
      <select bind:value={nouvelleCategorie}>
        {#each Object.entries(LIBELLE_CATEGORIE) as [code, libelle]}
          <option value={code}>{code} — {libelle}</option>
        {/each}
      </select>
      <button onclick={ajouterTag}>+ Ajouter (actif)</button>
    </div>
  {/if}
</div>

<style>
  .catalogue { display: flex; flex-direction: column; gap: 1rem; }
  .barre input { width: 100%; box-sizing: border-box; padding: 8px 12px; border-radius: 8px; border: 1px solid #333; background: #1a1a1c; color: #e8e6e6; font-size: 0.9rem; }
  .colonnes { display: grid; grid-template-columns: 1fr 1fr; gap: 1rem; }
  @media (max-width: 720px) { .colonnes { grid-template-columns: 1fr; } }
  .colonne { background: #17171a; border: 1px solid #2a2a2d; border-radius: 10px; padding: 0.8rem; min-height: 200px; transition: background 0.15s; }
  .colonne.survole { background: #24151c; border-color: #c55a7a; }
  h2 { font-size: 0.9rem; margin: 0 0 0.6rem; }
  .sous { font-weight: 400; color: #888; font-size: 0.75rem; }
  .carte {
    display: flex; align-items: center; gap: 6px; background: #1f1f22; border: 1px solid #333;
    border-radius: 8px; padding: 6px 8px; margin-bottom: 6px; cursor: grab; font-size: 0.82rem;
  }
  .carte:active { cursor: grabbing; }
  .libelle { flex: 1; }
  .fleche { background: none; border: 1px solid #444; color: #ccc; border-radius: 6px; width: 22px; height: 22px; cursor: pointer; font-size: 0.8rem; }
  .badge { font-size: 0.65rem; font-weight: 700; border-radius: 4px; padding: 1px 5px; color: #fff; }
  .cat-I { background: #3b82f6; }
  .cat-V { background: #ef4444; }
  .cat-E { background: #f59e0b; }
  .cat-R { background: #8b5cf6; }
  .critere { cursor: help; }
  .vide { color: #666; font-size: 0.8rem; font-style: italic; }
  .ajout { display: flex; gap: 8px; }
  .ajout input { flex: 1; padding: 8px 10px; border-radius: 8px; border: 1px solid #333; background: #1a1a1c; color: #e8e6e6; }
  .ajout select { border-radius: 8px; border: 1px solid #333; background: #1a1a1c; color: #e8e6e6; padding: 8px; }
  .ajout button { background: #c55a7a; color: #fff; border: none; border-radius: 8px; padding: 8px 14px; cursor: pointer; }
  .erreur { color: #f87171; }
  .info { color: #999; }
</style>
