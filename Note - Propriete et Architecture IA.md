# IVQ — Propriété et architecture IA

*Note rédigée le 2026-08-30, en réponse à la question : « que va-t-on produire, et à qui cela appartiendra-t-il ? »*

## Le cadrage en une phrase

Ce qu'on construit n'est pas un "modèle d'IA" au sens strict, mais une **configuration** (code + prompts + taxonomie + règles de scoring + données) qui pilote un modèle de vision existant via son API. La configuration appartient à UrBizia ; le modèle sous-jacent reste la propriété de son éditeur (Anthropic, Google, etc.), exactement comme pour n'importe quel service cloud tiers.

## Les options envisagées

**1. Un module qui appartiendrait à Anthropic** — ce cas n'existe pas. Tout ce qui est écrit dans le cadre de ce projet (code, prompts, logique) va dans le repo GitHub d'UrBizia, comme le reste du projet. Seul le modèle Claude lui-même (les poids du réseau de neurones) reste la propriété d'Anthropic — c'est vrai pour n'importe quel modèle fermé utilisé via API (Claude, GPT, Gemini…), pas une particularité de ce projet.

**2. Un modèle propriétaire à UrBizia, mais qui ne fonctionnerait qu'avec Claude** — c'est en réalité ce qui est construit en phase 1, sous réserve de vocabulaire : il n'y a pas de modèle entraîné, mais une **configuration** propre à UrBizia : le prompt de détection, la taxonomie des types d'I&V, la formule de démérite (quantité × gravité), les exemples de référence, le code d'appel, le format de sortie. Tout cela est versionné dans le repo IVQ et appartient à UrBizia. L'inférence elle-même passe par l'API Claude, mais rien dans cette configuration n'est techniquement verrouillé à Claude.

**3. Un modèle emporté et installé sur un serveur au choix d'UrBizia** — impossible avec Claude spécifiquement : c'est un modèle à poids fermés, non téléchargeable, non auto-hébergeable, chez aucun éditeur ni aucun accord commercial. Pour un vrai modèle auto-hébergé, il faudrait entraîner un modèle de zéro ou fine-tuner un modèle à poids ouverts (Llama, Mistral open-weight, un VLM open-source type LLaVA/Qwen-VL). Cela suppose un dataset labellisé (qu'on n'a pas encore), une infrastructure GPU dédiée, et des compétences ML spécifiques — un projet à part entière, distinct de la phase 1.

**4. Une information portable, utilisable avec l'IA de son choix (Claude, Gemini, Mistral…)** — c'est le bon cadrage, et c'est la même chose que le point 2 vu sous un autre angle : si le prompt, la taxonomie, la formule de démérite et le code d'orchestration sont écrits proprement (sans fonctionnalité propriétaire spécifique à un éditeur), ils sont portables par construction. Changer de fournisseur d'IA demande de réécrire la couche d'appel API (quelques lignes), pas de refaire le travail de fond.

## Recommandation retenue

Combiner les points 2 et 4 : tout le code, les prompts, la taxonomie I&V, la formule de démérite et les données (photos + résultats) appartiennent entièrement à UrBizia, dans le repo IVQ et la base Supabase. L'inférence passe par l'API Claude au démarrage (cohérence avec le reste de l'écosystème UrBizia), tout en gardant une architecture suffisamment découplée pour changer de fournisseur si besoin.

Un modèle réellement auto-hébergé (point 3) reste une option pour plus tard, si l'indépendance vis-à-vis de tout fournisseur d'API devient un critère prioritaire — mais cela suppose d'abord d'avoir constitué un dataset labellisé via les résultats de la phase 1, ce qui n'existe pas encore aujourd'hui.

## Question ouverte

L'indépendance vis-à-vis d'un fournisseur d'IA est-elle déjà un critère important dès maintenant, ou peut-on avancer avec l'approche API en phase 1 et réévaluer plus tard ?
