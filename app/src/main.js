import { mount } from 'svelte'
import App from './App.svelte'

document.title = 'IRUM'

// Volontairement SANS verification de compte pour l'instant (decide par
// Gilles le 2026-09-03) : FBS/RFQ ont demarre avec leur propre ecran de
// connexion et n'ont ete rattaches a la gate EkoMa (auth-gate.js,
// initEkoGate) qu'ensuite -- IRUM suit le meme ordre, pas l'inverse. Ne pas
// reintroduire initEkoGate ici sans consigne explicite ; ce sera l'etape du
// rattachement a EkoMa (voir CLAUDE.md, "Admin app").
mount(App, {
  target: document.getElementById('app'),
})
