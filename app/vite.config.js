import { defineConfig } from 'vite'
import { svelte } from '@sveltejs/vite-plugin-svelte'

// Base servie par GitHub Pages : https://gibruga.github.io/IVQ/
// (repo racine IVQ ; ce dossier app/ est la seule chose deployee, voir
// .github/workflows/deploy.yml -- le script de detection Node vit a cote,
// hors du bundle Vite.)
export default defineConfig({
  base: '/IVQ/',
  plugins: [svelte()],
})
