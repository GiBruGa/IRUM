<script>
  let { noeud, onEnregistrer } = $props()

  let label = $state(noeud.label)
  let remarques = $state(noeud.criteres_detection || '')
  let enregistrement = $state(false)
  let erreur = $state('')

  $effect(() => {
    label = noeud.label
    remarques = noeud.criteres_detection || ''
    erreur = ''
  })

  async function enregistrer() {
    if (!label.trim()) { erreur = 'Le label ne peut pas être vide.'; return }
    if (label.length > 25) { erreur = 'Le label doit faire au plus 25 caractères.'; return }
    enregistrement = true
    erreur = ''
    try {
      await onEnregistrer(noeud.tag, { label: label.trim(), criteres_detection: remarques.trim() || null })
    } catch (e) {
      erreur = e.message
    } finally {
      enregistrement = false
    }
  }
</script>

<div class="fiche">
  <div class="titre">Fiche IVER</div>
  <div class="champ-cle">Clé : <span>{noeud.cle}</span></div>

  <label class="champ">
    <span>Label <span class="compteur">({label.length}/25)</span></span>
    <input bind:value={label} maxlength="25" />
  </label>

  <label class="champ">
    <span>Remarques (critères de détection, utilisés par l'IA)</span>
    <textarea bind:value={remarques} rows="4"></textarea>
  </label>

  {#if erreur}<p class="erreur">{erreur}</p>{/if}

  <button class="btn-enregistrer" onclick={enregistrer} disabled={enregistrement}>
    {enregistrement ? 'Enregistrement…' : 'Enregistrer'}
  </button>
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
  .erreur { color: #f87171; font-size: 0.78rem; margin: 0; }
  .btn-enregistrer {
    background: #c55a7a; border: none; color: #fff; border-radius: 999px; padding: 9px 16px;
    cursor: pointer; font-size: 0.85rem; font-weight: 600;
  }
  .btn-enregistrer:disabled { opacity: 0.5; cursor: default; }
</style>
