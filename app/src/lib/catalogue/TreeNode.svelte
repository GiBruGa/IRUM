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
    const ratio = (e.clientY - rect.top) / rect.height
    zone = ratio < 0.3 ? 'avant' : ratio > 0.7 ? 'apres' : 'enfant'
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
</script>

<div class="noeud">
  <div
    class="ligne"
    class:selectionne={selection === noeud.tag}
    class:survole-enfant={zone === 'enfant'}
    class:survole-avant={zone === 'avant'}
    class:survole-apres={zone === 'apres'}
    class:inactif={!noeud.actif}
    style:padding-left="{profondeur * 18}px"
    draggable="true"
    ondragstart={onDragStart}
    ondragover={onDragOver}
    ondragleave={() => (zone = null)}
    ondrop={onDrop}
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
    <span class="cle">{noeud.cle}</span>
    <span class="label">{noeud.label}{noeud.propose_par_ia ? ' 🆕' : ''}</span>
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
      />
    {/each}
  {/if}
</div>

<style>
  .noeud { display: contents; }
  .ligne {
    display: flex; align-items: center; gap: 6px; padding: 4px 6px; border-radius: 6px;
    cursor: pointer; font-size: 0.82rem; border: 1px solid transparent;
  }
  .ligne:hover { background: #1c1c1f; }
  .ligne.selectionne { background: #2a1620; border-color: #c55a7a; }
  .ligne.survole-enfant { border-color: #c55a7a; background: #24151c; }
  .ligne.survole-avant { border-top: 2px solid #c55a7a; }
  .ligne.survole-apres { border-bottom: 2px solid #c55a7a; }
  .ligne.inactif { opacity: 0.45; }
  .bascule {
    background: none; border: none; color: #888; width: 14px; flex-shrink: 0; cursor: pointer;
    font-size: 0.7rem; padding: 0;
  }
  .bascule.invisible { visibility: hidden; }
  .cat { font-size: 0.6rem; font-weight: 700; border-radius: 4px; padding: 0 4px; color: #fff; flex-shrink: 0; }
  .cat-I { background: #3b82f6; } .cat-V { background: #ef4444; } .cat-E { background: #f59e0b; } .cat-R { background: #8b5cf6; }
  .cle { color: #888; font-size: 0.72rem; font-family: ui-monospace, monospace; flex-shrink: 0; }
  .label { flex: 1; color: #e8e6e6; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
</style>
