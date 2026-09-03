<script>
  import Catalogue from './lib/Catalogue.svelte'
  import Ponderation from './lib/Ponderation.svelte'
  import { supabase } from './lib/supabaseClient.js'

  let { user } = $props()
  let onglet = $state('catalogue')

  async function deconnexion() {
    await supabase.auth.signOut()
    location.reload()
  }
</script>

<div class="app">
  <header>
    <h1>IRUM</h1>
    <nav>
      <button class:actif={onglet === 'catalogue'} onclick={() => (onglet = 'catalogue')}>Catalogue Tag IVER</button>
      <button class:actif={onglet === 'ponderation'} onclick={() => (onglet = 'ponderation')}>Pondération</button>
    </nav>
    <div class="user">
      <span>{user.email}</span>
      <button class="lien" onclick={deconnexion}>Déconnexion</button>
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
  .user { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 0.8rem; color: #999; }
  .lien { background: none; border: none; color: #c55a7a; cursor: pointer; font-size: 0.8rem; padding: 0; }
</style>
