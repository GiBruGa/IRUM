<script>
  let { noeud, onEnregistrer, onSupprimer } = $props()

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
  let label = $state(noeud.label)
  let remarques = $state(noeud.criteres_detection || '')
  let erreurLabel = $state('')
  let suppression = $state(false)

  $effect(() => {
    label = noeud.label
    remarques = noeud.criteres_detection || ''
    erreurLabel = ''
  })

  function surLabel() {
    if (!label.trim()) { erreurLabel = 'Le label ne peut pas être vide.'; return }
    if (label.length > 50) { erreurLabel = 'Le label doit faire au plus 50 caractères.'; return }
    erreurLabel = ''
    onEnregistrer(noeud.tag, { label: label.trim() })
  }
  function surRemarques() {
    onEnregistrer(noeud.tag, { criteres_detection: remarques.trim() || null })
  }
  function surProposeUtilisateur(e) {
    onEnregistrer(noeud.tag, { propose_utilisateur: e.currentTarget.checked })
  }

  async function supprimer() {
    if (!confirm(`Marquer le tag « ${noeud.label} » (clé ${noeud.cle}) pour suppression ? Elle sera appliquée lors de la validation du catalogue.`)) return
    suppression = true
    try {
      await onSupprimer(noeud.tag)
    } finally {
      suppression = false
    }
  }
</script>

<div class="fiche">
  <div class="titre">Fiche IVER</div>
  <div class="champ-cle">Clé : <span>{noeud.cle}</span></div>

  <label class="champ">
    <span>Label <span class="compteur">({label.length}/50)</span></span>
    <input bind:value={label} maxlength="50" oninput={surLabel} />
  </label>
  {#if erreurLabel}<p class="erreur">{erreurLabel}</p>{/if}

  <label class="champ">
    <span>Remarques</span>
    <textarea bind:value={remarques} rows="4" oninput={surRemarques}></textarea>
  </label>

  <label class="champ-case">
    <input type="checkbox" checked={noeud.propose_utilisateur || false} onchange={surProposeUtilisateur} />
    <span>Retenu pour Utilisateurs SpotSan</span>
  </label>

  <div class="actions">
    <button class="btn-supprimer" onclick={supprimer} disabled={suppression}>
      {suppression ? 'Suppression…' : 'Supprimer'}
    </button>
  </div>
</div>

<style>
  .fiche { display: flex; flex-direction: column; gap: 10px; }
  .titre { font-weight: 600; color: #e8e6e6; font-size: 0.95rem; }
  .champ-cle { font-size: 0.8rem; color: #999; font-family: ui-monospace, monospace; }
  .champ-cle span { color: #e8e6e6; }
  .champ { display: flex; flex-direction: column; gap: 4px; font-size: 0.78rem; color: #999; }
  .compteur { color: #666; }
  input, textarea {
    background: #1a1a1c; border: 1px solid #333; border-radius: 8px; color: #e8e6e6;
    padding: 7px 10px; font-family: inherit; font-size: 0.85rem; resize: vertical;
  }
  .champ-case { display: flex; align-items: center; gap: 8px; font-size: 0.8rem; color: #e8e6e6; cursor: pointer; }
  .erreur { color: #f87171; font-size: 0.78rem; margin: 0; }
  .actions { display: flex; gap: 8px; }
  /* Charte graphique §7 (2026-09-04) : jamais de fond plein par defaut sur
     un bouton d'action -- le fond reste neutre, seule la couleur du texte
     distingue banal (neutre) de mis en exergue (#C55A7A). */
  .btn-supprimer {
    background: #1a1a1c; border: 1px solid #c55a7a; color: #c55a7a; border-radius: 999px; padding: 9px 16px;
    cursor: pointer; font-size: 0.85rem; font-weight: 600;
  }
  .btn-supprimer:disabled { opacity: 0.5; cursor: default; }
</style>
