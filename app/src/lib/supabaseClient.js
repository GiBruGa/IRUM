import { createClient } from '@supabase/supabase-js'

// Cle publique (publishable), sans danger cote client -- meme convention et
// meme projet Supabase que le reste d'UrBizia (voir Regles Generales de
// Conception des Modules UrBizia.md). IVQ est un outil admin (pas de flux
// usager anonyme comme SpotSan) : pas de assurerSession() ici, l'acces
// passe par une vraie session EkoMa via auth-gate.js (voir main.js).
const SUPABASE_URL = 'https://mnsfstjgrueyuvejfvvk.supabase.co'
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_KQWKxJs7tWgvI4lJQqSw3g_nIwmDXkT'

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY)
