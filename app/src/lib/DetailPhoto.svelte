<script>
  import { supabase } from './supabaseClient.js'

  let { report, taxonomie, onFermer, urlPhoto } = $props()

  const tagsIa = $derived(report.tags_ia_origine || [])
  const tagsUt = $derived(report.tags_utilisateur || [])
  const aDeclarationUtilisateur = $derived(tagsUt.length > 0)

  // Diff usager/IA -- seulement affichable quand les deux existent (voir
  // Ponderation.svelte). "Confirmé" = recoupé, devient officiel par defaut ;
  // les deux autres groupes sont exactement le desaccord que le pondérateur
  // doit trancher.
  const confirmes = $derived(tagsUt.filter((t) => tagsIa.includes(t)))
  const ajoutesParIa = $derived(tagsIa.filter((t) => !tagsUt.includes(t)))
  const retiresParIa = $derived(tagsUt.filter((t) => !tagsIa.includes(t)))

  // Decision editable : part de l'etat actuel (Incident_Report_Tags), pas
  // d'un recalcul depuis IA/utilisateur -- si une correction humaine existe
  // deja (verifie_humain=true revu une premiere fois), on ne veut pas
  // l'ecraser silencieusement.
  let selection = $state(new Set(report.tags_actuels || []))
  let recherche = $state('')
  let remarque = $state(report.Description || '')
  let verifie = $state(true)
  let enregistrement = $state(false)
  let erreur = $state('')

  const rechercheNorm = $derived(recherche.trim().toLowerCase())
  const suggestions = $derived(
    taxonomie.filter((t) => !selection.has(t.tag) && (!rechercheNorm || t.tag.toLowerCase().includes(rechercheNorm)))
  )
  const exactMatch = $derived(taxonomie.some((t) => t.tag.toLowerCase() === rechercheNorm))

  function basculer(tag) {
    const s = new Set(selection)
    if (s.has(tag)) s.delete(tag); else s.add(tag)
    selection = s
  }

  async function creerEtAjouter() {
    const val = recherche.trim()
    if (!val || exactMatch) return
    const maxOrdre = taxonomie.reduce((m, t) => Math.max(m, t.ordre), 0)
    const { error } = await supabase.from('Incivilites_Taxonomie').insert({ tag: val, ordre: maxOrdre + 1, actif: true })
    if (error) { erreur = error.message; return }
    taxonomie.push({ tag: val, actif: true, ordre: maxOrdre + 1, categorie_iver: null, propose_par_ia: false })
    basculer(val)
    recherche = ''
  }

  async function enregistrer() {
    enregistrement = true
    erreur = ''
    const avant = new Set(report.tags_actuels || [])
    const apres = selection
    const aSupprimer = [...avant].filter((t) => !apres.has(t))
    const aAjouter = [...apres].filter((t) => !avant.has(t))
    try {
      const upd = await supabase.from('Incident_Reports')
        .update({ Description: remarque.trim() || null, verifie_humain: verifie })
        .eq('Report_id', report.Report_id)
      if (upd.error) throw upd.error
      if (aSupprimer.length) {
        const d = await supabase.from('Incident_Report_Tags').delete().eq('report_id', report.Report_id).in('tag', aSupprimer)
        if (d.error) throw d.error
      }
      if (aAjouter.length) {
        const i = await supabase.from('Incident_Report_Tags').insert(aAjouter.map((tag) => ({ report_id: report.Report_id, tag })))
        if (i.error) throw i.error
      }
      onFermer()
    } catch (e) {
      erreur = e.message
    } finally {
      enregistrement = false
    }
  }

  function formatDate(iso) {
    return new Date(iso).toLocaleString('fr-FR', { dateStyle: 'medium', timeStyle: 'short' })
  }
</script>

<div class="detail">
  <button class="retour" onclick={onFermer}>← Retour</button>

  <div class="entete">
    <span class="ub">{report.UB_id}</span>
    <span class="date">{formatDate(report.Reported_at)}</span>
    {#if report.litige}<span class="tag-litige">En litige</span>{/if}
  </div>

  {#await urlPhoto(report.Photo) then url}
    {#if url}<img class="photo" src={url} alt="" />{/if}
  {/await}

  <div class="col-diag">
    <div class="bloc">
      <div class="bloc-titre">Diagnostic IA d'origine (figé)</div>
      <div class="bloc-corps">
        {tagsIa.length ? tagsIa.join(', ') : '(rien détecté)'}
        {#if report.confiance_ia} — confiance {report.confiance_ia}{/if}
      </div>
    </div>

    <div class="bloc">
      <div class="bloc-titre">Déclaration utilisateur</div>
      <div class="bloc-corps">
        {#if aDeclarationUtilisateur}
          {tagsUt.join(', ')}
        {:else}
          <span class="muted">(aucune déclaration utilisateur associée à cette photo)</span>
        {/if}
      </div>
    </div>
  </div>

  {#if aDeclarationUtilisateur}
    <div class="diff">
      <div class="diff-grp confirme">
        <div class="diff-titre">Confirmé (usager ∩ IA) — officiel par défaut</div>
        <div class="diff-liste">{confirmes.length ? confirmes.join(', ') : '—'}</div>
      </div>
      <div class="diff-grp ajoute">
        <div class="diff-titre">Ajouté par l'IA (absent de la déclaration usager)</div>
        <div class="diff-liste">{ajoutesParIa.length ? ajoutesParIa.join(', ') : '—'}</div>
      </div>
      <div class="diff-grp retire">
        <div class="diff-titre">Retiré par l'IA (déclaré par l'usager, non confirmé)</div>
        <div class="diff-liste">{retiresParIa.length ? retiresParIa.join(', ') : '—'}</div>
      </div>
    </div>
  {/if}

  <div class="bloc">
    <div class="bloc-titre">Décision du pondérateur</div>
    <div class="chips">
      {#each [...selection] as tag}
        <button class="chip actif" onclick={() => basculer(tag)}>{tag} ×</button>
      {/each}
    </div>
    <input class="recherche" placeholder="Chercher un tag du catalogue avant d'en créer un nouveau…" bind:value={recherche} />
    <div class="suggestions">
      {#each suggestions.slice(0, 12) as t (t.tag)}
        <button class="chip" onclick={() => basculer(t.tag)}>
          {#if t.categorie_iver}<span class="cat cat-{t.categorie_iver}">{t.categorie_iver}</span>{/if}
          {t.tag}{t.propose_par_ia ? ' 🆕' : ''}
        </button>
      {/each}
      {#if rechercheNorm && !exactMatch}
        <button class="chip nouveau" onclick={creerEtAjouter}>+ Créer « {recherche.trim()} »</button>
      {/if}
    </div>
  </div>

  <div class="bloc">
    <div class="bloc-titre">Remarque</div>
    <textarea bind:value={remarque} rows="2"></textarea>
  </div>

  <label class="chk">
    <input type="checkbox" bind:checked={verifie} />
    Vérifié par un humain (pondérateur)
  </label>

  {#if erreur}<p class="erreur">Erreur : {erreur}</p>{/if}

  <div class="actions">
    <button class="btn" onclick={onFermer} disabled={enregistrement}>Annuler</button>
    <button class="btn primary" onclick={enregistrer} disabled={enregistrement}>{enregistrement ? 'Enregistrement…' : 'Enregistrer'}</button>
  </div>
</div>

<style>
  .detail { display: flex; flex-direction: column; gap: 0.8rem; }
  .retour { align-self: flex-start; background: none; border: none; color: #c55a7a; cursor: pointer; font-size: 0.85rem; padding: 0; }
  .entete { display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: #999; }
  .ub { color: #e8e6e6; font-weight: 600; }
  .tag-litige { background: #c55a7a; color: #fff; font-size: 0.65rem; font-weight: 700; text-transform: uppercase; padding: 2px 7px; border-radius: 999px; }
  .photo { width: 100%; max-height: 340px; object-fit: contain; border-radius: 8px; background: #1a1a1c; }

  .col-diag { display: grid; grid-template-columns: 1fr 1fr; gap: 0.8rem; }
  @media (max-width: 640px) { .col-diag { grid-template-columns: 1fr; } }
  .bloc { background: #17171a; border: 1px solid #2a2a2d; border-radius: 8px; padding: 0.6rem 0.8rem; }
  .bloc-titre { font-size: 0.72rem; color: #999; margin-bottom: 4px; }
  .bloc-corps { font-size: 0.85rem; color: #e8e6e6; }
  .muted { color: #666; font-style: italic; }

  .diff { display: grid; grid-template-columns: repeat(3, 1fr); gap: 0.6rem; }
  @media (max-width: 640px) { .diff { grid-template-columns: 1fr; } }
  .diff-grp { border-radius: 8px; padding: 0.5rem 0.7rem; font-size: 0.78rem; }
  .diff-grp.confirme { background: rgba(34,197,94,0.1); border: 1px solid rgba(34,197,94,0.35); }
  .diff-grp.ajoute { background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.35); }
  .diff-grp.retire { background: rgba(239,68,68,0.1); border: 1px solid rgba(239,68,68,0.35); }
  .diff-titre { font-size: 0.68rem; color: #aaa; margin-bottom: 3px; }

  .chips, .suggestions { display: flex; flex-wrap: wrap; gap: 6px; margin: 6px 0; }
  .chip {
    background: #1f1f22; border: 1px solid #333; color: #e8e6e6; border-radius: 999px; padding: 4px 10px;
    font-size: 0.78rem; cursor: pointer; display: inline-flex; align-items: center; gap: 4px;
  }
  .chip.actif { background: #c55a7a; border-color: #c55a7a; color: #fff; }
  .chip.nouveau { border-style: dashed; color: #c55a7a; border-color: #c55a7a; }
  .cat { font-size: 0.6rem; font-weight: 700; border-radius: 4px; padding: 0 4px; color: #fff; }
  .cat-I { background: #3b82f6; } .cat-V { background: #ef4444; } .cat-E { background: #f59e0b; } .cat-R { background: #8b5cf6; }
  .recherche { width: 100%; box-sizing: border-box; padding: 7px 10px; border-radius: 8px; border: 1px solid #333; background: #1a1a1c; color: #e8e6e6; font-size: 0.82rem; }

  textarea { width: 100%; box-sizing: border-box; background: #1a1a1c; border: 1px solid #333; border-radius: 8px; color: #e8e6e6; padding: 8px; font-family: inherit; font-size: 0.82rem; resize: vertical; }

  .chk { display: flex; align-items: center; gap: 6px; font-size: 0.85rem; color: #e8e6e6; cursor: pointer; }
  .erreur { color: #f87171; font-size: 0.8rem; }
  .actions { display: flex; gap: 8px; justify-content: flex-end; }
  .btn { background: #1a1a1c; border: 1px solid #333; color: #e8e6e6; border-radius: 8px; padding: 8px 16px; cursor: pointer; font-size: 0.85rem; }
  .btn.primary { background: #c55a7a; border-color: #c55a7a; color: #fff; }
  .btn:disabled { opacity: 0.5; cursor: default; }
</style>
