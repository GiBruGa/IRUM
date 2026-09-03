import { mount } from 'svelte'
import App from './App.svelte'
import { supabase } from './lib/supabaseClient.js'

document.title = 'IRUM'

// initEkoGate est fourni par le script global charge dans index.html (voir
// EkoMa/auth-gate.js) -- on ne monte l'app Svelte qu'une fois l'acces
// confirme, pour ne jamais interroger Supabase avant d'avoir une session
// valide. Meme pattern que FBS/RFQ (voir leur CLAUDE.md).
window.initEkoGate({
  sb: supabase,
  tool: 'irum',
  onGranted: async (user) => {
    mount(App, {
      target: document.getElementById('app'),
      props: { user },
    })
  },
})
