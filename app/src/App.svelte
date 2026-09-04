<script>
  import { onMount } from 'svelte'
  import Catalogue from './lib/Catalogue.svelte'
  import Ponderation from './lib/Ponderation.svelte'
  import { supabase } from './lib/supabaseClient.js'

  // Pas de session/compte pour l'instant (voir main.js) -- donc pas de
  // user.email/déconnexion a afficher ici tant que la gate n'est pas
  // reintroduite.
  let onglet = $state('catalogue')

  // Repli hors-ligne obligatoire (Charte Graphique §2) : copie figee du SVG
  // UrBizia (acronymes.id='UrBizia'), pour le cas ou le fetch echoue --
  // jamais un fichier .svg statique charge en dur comme seule source (voir
  // l'incident EkoMa/favicon du 2026-09-04, memoire "read-general-rules-first").
  const URBIZIA_SVG_REPLI = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="1652.081 89.128 557.381 562.262"><path fill="#5F4324" d="M1934.362,551.13c8.141,4.689,10.931,15.09,6.229,23.229l-31.92,55.271c-7.591,13.159-21.63,21.26-36.82,21.26h-117.829c-15.189,0-29.229-8.1-36.82-21.26l-58.92-102.04c-7.601-13.16-7.601-29.37,0-42.521l137.471-238.11c7.6-13.159,21.63-21.26,36.819-21.26h54.011c9.39,0,17.01,7.609,17.01,17.01c0,9.391-7.62,17-17.01,17h-44.19c-9.109,0-17.529,4.87-22.09,12.761L1692.653,493.57c-4.561,7.891-4.561,17.619,0,25.511l49.09,85.039c4.561,7.899,12.979,12.761,22.101,12.761h98.189c9.12,0,17.54-4.86,22.101-12.761l27-46.771C1915.832,549.219,1926.232,546.429,1934.362,551.13z"/><path fill="#009126" d="M2046.152,348.999c7.59,13.16,7.59,29.37,0,42.521l-27.011,46.78c-4.689,8.13-15.09,10.92-23.229,6.22c-8.13-4.689-10.92-15.1-6.22-23.229l22.09-38.271c4.561-7.891,4.561-17.619,0-25.511l-127.649-221.1c-4.561-7.9-12.979-12.76-22.101-12.76h-98.189c-9.12,0-17.54,4.858-22.101,12.76l-49.09,85.04c-4.561,7.89-4.561,17.609,0,25.51l27,46.771c4.699,8.131,1.91,18.54-6.229,23.229c-8.13,4.7-18.53,1.91-23.229-6.22l-31.91-55.28c-7.601-13.149-7.601-29.359,0-42.521l58.921-102.05c7.59-13.149,21.63-21.261,36.819-21.261h117.829c15.189,0,29.23,8.11,36.82,21.261L2046.152,348.999z"/><path fill="#81093C" d="M1964.172,353.259c9.399,0,17.01,7.61,17.01,17c0,9.4-7.609,17.011-17.01,17.011h-43.221c-12.149,0-23.38,6.489-29.46,17.011l-21.609,37.431c-4.7,8.14-15.101,10.93-23.229,6.229c-8.141-4.699-10.931-15.1-6.229-23.229l21.609-37.44c6.08-10.521,6.08-23.489,0-34.011l-21.609-37.438c-4.7-8.131-1.91-18.53,6.229-23.23c8.13-4.699,18.529-1.909,23.229,6.23l21.609,37.43c6.08,10.521,17.311,17.011,29.46,17.011h43.221V353.259z"/><path fill="#3F88F3" d="M2203.262,348.999c7.601,13.16,7.601,29.37,0,42.521l-58.92,102.051c-7.59,13.159-21.63,21.26-36.819,21.26h-274.95c-15.189,0-29.221-8.101-36.819-21.26l-27-46.771c-4.7-8.131-1.91-18.54,6.22-23.229c8.141-4.7,18.54-1.91,23.24,6.22l22.09,38.271c4.561,7.891,12.979,12.761,22.09,12.761h255.311c9.12,0,17.54-4.87,22.09-12.761l49.101-85.04c4.562-7.891,4.562-17.619,0-25.511l-49.101-85.04c-4.55-7.89-12.97-12.76-22.09-12.76h-54.01c-9.391,0-17-7.609-17-17c0-9.399,7.609-17.01,17-17.01h63.83c15.189,0,29.229,8.1,36.819,21.26L2203.262,348.999z"/></svg>`
  let logoUrbizia = $state('data:image/svg+xml;utf8,' + encodeURIComponent(URBIZIA_SVG_REPLI))

  onMount(async () => {
    try {
      const { data, error } = await supabase.from('acronymes').select('icon_svg').eq('id', 'UrBizia').single()
      if (!error && data?.icon_svg) logoUrbizia = 'data:image/svg+xml;utf8,' + encodeURIComponent(data.icon_svg)
    } catch { /* repli deja affiche */ }
  })
</script>

<div class="app">
  <header>
    <div class="titre">
      <h1><span class="wm-strong">IRU</span><span class="wm-soft">M</span></h1>
      <p class="signification">Incident, Repair &amp; Upkeep Monitoring</p>
    </div>
    <nav>
      <button class:actif={onglet === 'catalogue'} onclick={() => (onglet = 'catalogue')}>Catalogue Tag IVER</button>
      <button class:actif={onglet === 'ponderation'} onclick={() => (onglet = 'ponderation')}>Pondération</button>
    </nav>
    <div class="marque">
      <span class="marque-texte">
        <span class="wm-strong">IRU</span><span class="wm-soft">M</span> est un service
        <span class="wm-strong">Ur</span><span class="wm-soft">Bizia</span>
      </span>
      <img alt="UrBizia" src={logoUrbizia} />
    </div>
  </header>

  <main>
    {#if onglet === 'catalogue'}
      <Catalogue />
    {:else if onglet === 'ponderation'}
      <Ponderation />
    {/if}
  </main>
</div>

<style>
  /* Charte graphique UrBizia — wordmark deux couleurs (mode sombre). */
  :root { --wm-strong: #C55A7A; --wm-soft: #FFC3D5; }
  @media (prefers-color-scheme: light) { :root { --wm-strong: #540E28; --wm-soft: #C55A7A; } }

  .app { max-width: 1700px; margin: 0 auto; padding: 1rem; }
  header { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  .titre { display: flex; flex-direction: column; gap: 1px; }
  h1 { font-size: 1.3rem; margin: 0; font-weight: 700; }
  h1 .wm-strong { color: var(--wm-strong); }
  h1 .wm-soft { color: var(--wm-soft); }
  .signification { margin: 0; font-size: 0.68rem; color: #6a7a80; letter-spacing: 0.02em; }
  nav { display: flex; gap: 0.5rem; }
  nav button {
    background: #1a1a1c; border: 1px solid #333; color: #e8e6e6; border-radius: 999px;
    padding: 6px 14px; font-size: 0.85rem; cursor: pointer;
  }
  nav button.actif { background: #c55a7a; border-color: #c55a7a; color: #fff; }
  nav button:disabled { opacity: 0.4; cursor: default; }

  .marque { display: flex; align-items: center; gap: 8px; margin-left: auto; }
  .marque-texte { font-size: 12.5px; color: #6a7a80; }
  .marque-texte .wm-strong { color: var(--wm-strong); }
  .marque-texte .wm-soft { color: var(--wm-soft); }
  .marque img { height: 28px; width: auto; opacity: .85; flex-shrink: 0; }
</style>
