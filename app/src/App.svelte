<script>
  import Catalogue from './lib/Catalogue.svelte'
  import Ponderation from './lib/Ponderation.svelte'

  // Pas de session/compte pour l'instant (voir main.js) -- donc pas de
  // user.email/déconnexion a afficher ici tant que la gate n'est pas
  // reintroduite.
  let onglet = $state('catalogue')
</script>

<div class="app">
  <header>
    <h1>IRUM</h1>
    <nav>
      <button class:actif={onglet === 'catalogue'} onclick={() => (onglet = 'catalogue')}>Catalogue Tag IVER</button>
      <button class:actif={onglet === 'ponderation'} onclick={() => (onglet = 'ponderation')}>Pondération</button>
    </nav>
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
  .app { max-width: 1100px; margin: 0 auto; padding: 1rem; }
  header { display: flex; align-items: center; gap: 1.5rem; flex-wrap: wrap; margin-bottom: 1.5rem; }
  h1 { color: #c55a7a; font-size: 1.3rem; margin: 0; }
  nav { display: flex; gap: 0.5rem; }
  nav button {
    background: #1a1a1c; border: 1px solid #333; color: #e8e6e6; border-radius: 999px;
    padding: 6px 14px; font-size: 0.85rem; cursor: pointer;
  }
  nav button.actif { background: #c55a7a; border-color: #c55a7a; color: #fff; }
  nav button:disabled { opacity: 0.4; cursor: default; }
</style>
