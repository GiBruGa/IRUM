<script>
  let { noeud, onEnregistrer, onSupprimer } = $props()

  let label = $state(noeud.label)
  let remarques = $state(noeud.criteres_detection || '')
  let proposeUtilisateur = $state(noeud.propose_utilisateur || false)
  let enregistrement = $state(false)
  let suppression = $state(false)
  let erreur = $state('')

  $effect(() => {
    label = noeud.label
    remarques = noeud.criteres_detection || ''
    proposeUtilisateur = noeud.propose_utilisateur || false
    erreur = ''
  })

  async function enregistrer() {
    if (!label.trim()) { erreur = 'Le label ne peut pas être vide.'; return }
    if (label.length > 50) { erreur = 'Le label doit faire au plus 50 caractères.'; return }
    enregistrement = true
    erreur = ''
    try {
      await onEnregistrer(noeud.tag, { label: label.trim(), criteres_detection: remarques.trim() || null, propose_utilisateur: proposeUtilisateur })
    } catch (e) {
      erreur = e.message
    } finally {
      enregistrement = false
    }
  }

  async function supprimer() {
    if (!confirm(`Supprimer le tag « ${noeud.label} » (clé ${noeud.cle}) ? Cette action est définitive.`)) return
    suppression = true
    erreur = ''
    try {
      await onSupprimer(noeud.tag)
    } catch (e) {
      erreur = e.message
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
    <input bind:value={label} maxlength="50" />
  </label>

  <label class="champ">
    <span>Remarques (critères de détection, utilisés par l'IA)</span>
    <textarea bind:value={remarques} rows="4"></textarea>
  </label>

  <label class="champ-case">
    <input type="checkbox" bind:checked={proposeUtilisateur} />
    <span>Retenu pour Utilisateurs SpotSan</span>
  </label>

  {#if erreur}<p class="erreur">{erreur}</p>{/if}

  <div class="actions">
    <button class="btn-supprimer" onclick={supprimer} disabled={enregistrement || suppression}>
      {suppression ? 'Suppression…' : 'Supprimer'}
    </button>
    <button class="btn-enregistrer" onclick={enregistrer} disabled={enregistrement || suppression}>
      {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
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
  .btn-enregistrer {
    background: #1a1a1c; border: 1px solid #333; color: #e8e6e6; border-radius: 999px; padding: 9px 16px;
    cursor: pointer; font-size: 0.85rem; font-weight: 600;
  }
  .btn-supprimer {
    background: #1a1a1c; border: 1px solid #c55a7a; color: #c55a7a; border-radius: 999px; padding: 9px 16px;
    cursor: pointer; font-size: 0.85rem; font-weight: 600;
  }
  .btn-enregistrer:disabled, .btn-supprimer:disabled { opacity: 0.5; cursor: default; }
</style>
