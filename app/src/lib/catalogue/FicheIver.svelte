<script>
  // associes/onDeclarerEquivalence/onDissocier : "Tags IA Associés" (demande
  // de Gilles, 2026-09-11) -- rattaché ici plutôt qu'en encart séparé, "plus
  // évident" puisque c'est une info sur le tag sélectionné comme le reste de
  // cette fiche.
  let { noeud, onEnregistrer, associes, onDeclarerEquivalence, onDissocier } = $props()

  let survoleAssocies = $state(false)
  function surDragOverAssocies(e) { e.preventDefault(); survoleAssocies = true }
  function surDropAssocies(e) {
    e.preventDefault()
    survoleAssocies = false
    const texteIa = e.dataTransfer.getData('text/x-irum-ia')
    if (texteIa) onDeclarerEquivalence(texteIa)
  }
  function surDragStartAssocie(e, texteIa) {
    e.dataTransfer.setData('text/x-irum-ia', texteIa)
    e.dataTransfer.effectAllowed = 'move'
  }

  // Chaque champ applique directement au brouillon (onEnregistrer =
  // Catalogue.svelte's enregistrerFiche, une simple ecriture locale, jamais
  // Supabase) -- PAS de bouton "Enregistrer" separe. Corrige un vrai bug
  // signale par Gilles, 2026-09-11 : avec un bouton Enregistrer propre a la
  // Fiche, en plus du bouton global "Valider les modifications", cocher une
  // case sans cliquer sur CE bouton-ci ne mettait rien en attente -- deux
  // niveaux de brouillon distincts, confus, et la case cochee se perdait
  // silencieusement. Un seul niveau maintenant : tout champ modifie ici part
  // immediatement dans le brouillon global, seul "Valider" (dans l'entete du
  // Catalogue) ecrit reellement dans Supabase.
  //
  // Pas de bouton Supprimer ici (retire 2026-09-11, redondant avec le clic
  // droit sur le tag dans l'arborescence, seul point d'entree desormais).
  let label = $state(noeud.label)
  let remarques = $state(noeud.criteres_detection || '')
  let erreurLabel = $state('')

  $effect(() => {
    label = noeud.label
    remarques = noeud.criteres_detection || ''
    erreurLabel = ''
  })

  // IMPORTANT : ne jamais trim() ici (bug reel, 2026-09-11 -- "impossible de
  // taper une espace"). Modifier le brouillon reassigne Catalogue.svelte's
  // `brouillon`, ce qui redonne un `noeud` de reference differente a chaque
  // frappe et refait tourner le $effect ci-dessus -- si la valeur stagee
  // etait trim(), elle differait de ce que l'utilisateur venait de taper
  // (avec une espace en fin), et l'effet ecrasait aussitot l'espace tapee.
  // Le nettoyage final (trim) n'a lieu qu'une fois, a la validation
  // (Catalogue.svelte's validerMiseAJour), jamais ici.
  function surLabel() {
    if (!label.trim()) { erreurLabel = 'Le label ne peut pas être vide.'; return }
    if (label.length > 50) { erreurLabel = 'Le label doit faire au plus 50 caractères.'; return }
    erreurLabel = ''
    onEnregistrer(noeud.tag, { label })
  }
  function surRemarques() {
    onEnregistrer(noeud.tag, { criteres_detection: remarques })
  }
  function surProposeUtilisateur(e) {
    onEnregistrer(noeud.tag, { propose_utilisateur: e.currentTarget.checked })
  }
</script>

<div class="fiche">
  <div class="titre">Fiche IVER</div>

  <!-- Clé + case SpotSan + Label sur une seule ligne pour plus de compacité
       (demande de Gilles, 2026-09-11) -- la case juste après la clé pour la
       mettre en évidence, avant le Label pour plus d'ergonomie (reprécisé
       le même jour : la case se manipule plus souvent que le texte du label
       n'est relu). -->
  <div class="ligne-principale">
    <span class="cle" title="Clé">{noeud.cle}</span>
    <label class="case-spotsan" title="Retenu pour Utilisateurs SpotSan">
      <input type="checkbox" checked={noeud.propose_utilisateur || false} onchange={surProposeUtilisateur} />
      <span>SpotSan</span>
    </label>
    <input class="entree-label" bind:value={label} maxlength="50" oninput={surLabel} placeholder="Label" />
    <span class="compteur">{label.length}/50</span>
  </div>
  {#if erreurLabel}<p class="erreur">{erreurLabel}</p>{/if}

  <label class="champ">
    <span>Remarques</span>
    <textarea bind:value={remarques} rows="4" oninput={surRemarques}></textarea>
  </label>

  <div
    class="associes"
    class:survole={survoleAssocies}
    ondragover={surDragOverAssocies}
    ondragleave={() => (survoleAssocies = false)}
    ondrop={surDropAssocies}
  >
    <span class="champ-titre">Tags IA Associés ({associes.length})</span>
    <div class="liste-associes" role="list">
      {#each associes as texteIa (texteIa)}
        <div class="carte-associee" role="listitem" draggable="true" ondragstart={(e) => surDragStartAssocie(e, texteIa)}>
          <span>{texteIa}</span>
          <button class="btn-dissocier" title="Dissocier" onclick={() => onDissocier(texteIa)}>×</button>
        </div>
      {/each}
      {#if !associes.length}<p class="vide">Aucun texte IA associé. Glissez-en un ici depuis « Tags suggérés IA ».</p>{/if}
    </div>
  </div>
</div>

<style>
  .fiche { display: flex; flex-direction: column; gap: 10px; }
  .titre { font-weight: 600; color: #e8e6e6; font-size: 0.95rem; }
  .ligne-principale { display: flex; align-items: center; gap: 8px; }
  .cle { color: #888; font-size: 0.75rem; font-family: ui-monospace, monospace; flex-shrink: 0; }
  .entree-label { flex: 1; min-width: 0; }
  .compteur { color: #666; font-size: 0.68rem; flex-shrink: 0; }
  .case-spotsan { display: flex; align-items: center; gap: 4px; font-size: 0.75rem; color: #e8e6e6; cursor: pointer; flex-shrink: 0; white-space: nowrap; }
  .champ { display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; color: #999; }
  input, textarea {
    background: #1a1a1c; border: 1px solid #333; border-radius: 8px; color: #e8e6e6;
    padding: 7px 10px; font-family: inherit; font-size: 0.85rem; resize: vertical;
  }
  .erreur { color: #f87171; font-size: 0.78rem; margin: 0; }

  /* Tags IA Associés : rattaché à la fiche (demande de Gilles, 2026-09-11),
     avec son propre ascenseur vertical -- sinon une fiche avec beaucoup
     d'équivalences pousserait tout le panneau (et l'Arborescence en dessous)
     à n'importe quelle hauteur. */
  .associes { display: flex; flex-direction: column; gap: 4px; border-radius: 8px; border: 1px solid transparent; padding: 2px; }
  .associes.survole { border-color: #c55a7a; background: #1c1418; }
  .champ-titre { font-size: 0.78rem; color: #999; }
  .liste-associes { display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto; padding-right: 4px; }
  .carte-associee {
    display: flex; align-items: center; justify-content: space-between; gap: 6px;
    background: #1f1f22; border: 1px dashed #c55a7a; color: #e8e6e6; border-radius: 8px;
    padding: 6px 9px; font-size: 0.78rem; cursor: grab; box-sizing: border-box;
  }
  .carte-associee span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .carte-associee:active { cursor: grabbing; }
  .btn-dissocier {
    background: transparent; border: none; color: #c55a7a; font-size: 0.95rem; line-height: 1; cursor: pointer;
    padding: 0 2px; flex-shrink: 0;
  }
  .vide { color: #666; font-size: 0.78rem; margin: 0; }
</style>
