<script>
  import TreeNode from './TreeNode.svelte'

  let {
    noeud,
    enfants,
    profondeur,
    ouverts,
    selection,
    surGlisserDepose,
    surSelection,
    surBascule,
    surMenuContextuel,
  } = $props()

  const estOuvert = $derived(ouverts.has(noeud.tag))
  const aDesEnfants = $derived(enfants.length > 0)
  // 3 zones de depot dans la hauteur de la ligne : haut/bas = reordonner
  // comme frere avant/apres, milieu = devenir enfant -- avant, seul "devenir
  // enfant" existait, impossible de simplement reordonner (signale par
  // Gilles, 2026-09-04).
  let zone = $state(null) // 'avant' | 'enfant' | 'apres' | null

  function onDragStart(e) {
    e.dataTransfer.setData('text/x-irum-tag', noeud.tag)
    e.dataTransfer.effectAllowed = 'move'
  }
  function onDragOver(e) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const y = e.clientY - rect.top
    // Bande fixe (pas un ratio) : sur une ligne basse (~24px), 30% ne
    // laissait que ~7px pour viser "avant"/"après", trop imprécis et illisible
    // (signalé par Gilles, 2026-09-11 : "difficile de voir si l'élément va se
    // placer entre 2 existants ou sous l'un d'eux"). Min 8px, max 35% de la
    // hauteur, pour rester utilisable même sur une ligne haute.
    const bande = Math.min(10, rect.height * 0.35)
    zone = y < bande ? 'avant' : y > rect.height - bande ? 'apres' : 'enfant'
  }
  function onDrop(e) {
    e.preventDefault()
    const zoneDepot = zone
    zone = null
    const tagDeplace = e.dataTransfer.getData('text/x-irum-tag')
    const texteIa = e.dataTransfer.getData('text/x-irum-ia')
    if (tagDeplace && tagDeplace !== noeud.tag) {
      if (zoneDepot === 'avant') surGlisserDepose({ type: 'reordonner', tag: tagDeplace, cibleTag: noeud.tag, avant: true })
      else if (zoneDepot === 'apres') surGlisserDepose({ type: 'reordonner', tag: tagDeplace, cibleTag: noeud.tag, avant: false })
      else surGlisserDepose({ type: 'reparent', tag: tagDeplace, cibleTag: noeud.tag })
    } else if (texteIa) surGlisserDepose({ type: 'equivalence', texteIa, cibleTag: noeud.tag })
  }
  function onContextMenu(e) {
    e.preventDefault()
    surSelection(noeud.tag)
    surMenuContextuel(noeud.tag, e.clientX, e.clientY)
  }
</script>

<div class="noeud">
  <div
    class="ligne"
    class:selectionne={selection === noeud.tag}
    class:survole-enfant={zone === 'enfant'}
    class:survole-avant={zone === 'avant'}
    class:survole-apres={zone === 'apres'}
    class:inactif={!noeud.actif}
    class:supprime={noeud.supprime}
    style:padding-left="{profondeur * 18}px"
    draggable="true"
    ondragstart={onDragStart}
    ondragover={onDragOver}
    ondragleave={() => (zone = null)}
    ondrop={onDrop}
    oncontextmenu={onContextMenu}
    onclick={() => surSelection(noeud.tag)}
    onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); surSelection(noeud.tag) } }}
    role="treeitem"
    aria-selected={selection === noeud.tag}
    tabindex="0"
  >
    <button
      class="bascule"
      class:invisible={!aDesEnfants}
      onclick={(e) => { e.stopPropagation(); surBascule(noeud.tag) }}
      tabindex="-1"
    >{aDesEnfants ? (estOuvert ? '▾' : '▸') : ''}</button>
    {#if noeud.categorie_iver}<span class="cat cat-{noeud.categorie_iver}">{noeud.categorie_iver}</span>{/if}
    <span
      class="marque-spotsan"
      class:actif={noeud.propose_utilisateur}
      title={noeud.propose_utilisateur ? 'Retenu pour Utilisateurs SpotSan' : 'Non retenu pour Utilisateurs SpotSan'}
    ></span>
    <span class="cle">{noeud.cle}</span>
    <span class="label">{noeud.label}{noeud.propose_par_ia ? ' 🆕' : ''}</span>
    {#if noeud.supprime}<span class="etiquette-supprime">à supprimer</span>{/if}
    {#if zone}
      <span class="etiquette-depot etiquette-{zone}">
        {zone === 'avant' ? '↑ avant' : zone === 'apres' ? '↓ après' : '→ enfant de « ' + noeud.label + ' »'}
      </span>
    {/if}
  </div>
  {#if aDesEnfants && estOuvert}
    {#each enfants as enfant (enfant.noeud.tag)}
      <TreeNode
        noeud={enfant.noeud}
        enfants={enfant.enfants}
        profondeur={profondeur + 1}
        {ouverts}
        {selection}
        {surGlisserDepose}
        {surSelection}
        {surBascule}
        {surMenuContextuel}
      />
    {/each}
  {/if}
</div>

<style>
  .noeud { display: contents; }
  .ligne {
    position: relative; display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 6px;
    cursor: pointer; font-size: 0.82rem; border: 1px solid transparent;
  }
  .ligne:hover { background: #1c1c1f; }
  .ligne.selectionne { background: #2a1620; border-color: #c55a7a; }
  .ligne.survole-enfant { border-color: #c55a7a; background: #24151c; }
  /* Barre d'insertion en dehors de la ligne (pas juste une bordure de 2px sur
     la ligne elle-meme) : se lit sans ambiguite comme "entre 2 lignes", pas
     comme un simple survol -- retour de Gilles, 2026-09-11. */
  .ligne.survole-avant::before, .ligne.survole-apres::after {
    content: ''; position: absolute; left: 0; right: 0; height: 3px; background: #c55a7a; border-radius: 2px;
  }
  .ligne.survole-avant::before { top: -2px; }
  .ligne.survole-apres::after { bottom: -2px; }
  .ligne.inactif { opacity: 0.45; }
  /* Suppression differee (2026-09-11) : le tag reste visible -- barre plutot
     que retire -- jusqu'a la validation, pour pouvoir "Annuler la
     suppression" par clic droit avant que ce soit definitif. */
  .ligne.supprime .label { text-decoration: line-through; color: #888; }
  .etiquette-supprime {
    flex-shrink: 0; font-size: 0.64rem; font-weight: 700; padding: 1px 7px; border-radius: 999px;
    background: transparent; border: 1px solid #f87171; color: #f87171; white-space: nowrap;
  }
  .etiquette-depot {
    margin-left: auto; flex-shrink: 0; font-size: 0.66rem; font-weight: 700; padding: 2px 8px;
    border-radius: 999px; background: #c55a7a; color: #fff; white-space: nowrap; pointer-events: none;
  }
  .bascule {
    background: none; border: none; color: #888; width: 14px; flex-shrink: 0; cursor: pointer;
    font-size: 0.7rem; padding: 0;
  }
  .bascule.invisible { visibility: hidden; }
  /* Badge catégorie : une seule couleur fixe par lettre (identique aux
     entêtes de Catalogue.svelte) -- ne varie plus selon "retenu SpotSan"
     (retour de Gilles, 2026-09-11 : associer ça à une nuance de la couleur
     catégorie prêtait à confusion, "la couleur de la catégorie = ce qui est
     valide/opérationnel" est une lecture instinctive à ne pas casser). */
  .cat { font-size: 0.6rem; font-weight: 700; border-radius: 4px; padding: 0 4px; color: #fff; flex-shrink: 0; }
  .cat-I { background: #3b82f6; } .cat-V { background: #ef4444; } .cat-E { background: #f59e0b; } .cat-R { background: #8b5cf6; }
  /* Indicateur "retenu pour SpotSan" séparé de la catégorie, toujours visible
     dans une couleur neutre sans rapport avec la teinte de catégorie -- un
     point plein vert = retenu, un point creux gris = pas retenu. */
  .marque-spotsan {
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0; box-sizing: border-box;
    background: transparent; border: 1.5px solid #666;
  }
  .marque-spotsan.actif { background: #22c55e; border-color: #22c55e; }
  .cle { color: #888; font-size: 0.72rem; font-family: ui-monospace, monospace; flex-shrink: 0; }
  .label { flex: 1; color: #e8e6e6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
