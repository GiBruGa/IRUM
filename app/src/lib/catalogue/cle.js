// Calcul et propagation de la clé hiérarchique ("I.3.2") -- voir Catalogue.svelte.
// La clé n'est PAS une identité permanente : elle peut se décaler quand on
// réorganise l'arborescence. Ce n'est pas un problème puisque chaque photo
// garde une COPIE FIGÉE de (clé, label) au moment du tag (voir
// Incident_Report_Tags.cle_enregistree/label_enregistre) -- décision du
// 2026-09-04 avec Gilles, pour ne jamais avoir à retoucher des millions de
// photos quand le catalogue évolue.

export function calculerCle(clePrefixe, position) {
  return clePrefixe ? `${clePrefixe}.${position}` : String(position)
}

// Renumérote un noeud et toute sa descendance après un déplacement (reparent
// ou réordonnancement). Retourne la liste des { tag, cle } à écrire en base --
// ne touche jamais Incident_Report_Tags, seulement Incivilites_Taxonomie.
export function renumeroterSousArbre(noeud, clePrefixeParent, position, enfantsParTag) {
  const cle = calculerCle(clePrefixeParent, position)
  const maj = [{ tag: noeud.tag, cle }]
  const enfants = (enfantsParTag[noeud.tag] || []).slice().sort((a, b) => a.ordre - b.ordre)
  enfants.forEach((enfant, i) => {
    maj.push(...renumeroterSousArbre(enfant, cle, i + 1, enfantsParTag))
  })
  return maj
}
