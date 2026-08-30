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

## Estimation du coût de l'API Claude (phase 1)

*Addendum du 2026-08-30, en réponse à la question : « combien cela coûtera d'utiliser l'API de Claude ? »*

L'API Claude est facturée au token consommé, sans abonnement mensuel fixe — le coût dépend directement du volume de photos analysées. Ce qui compose un appel « une photo → un résultat qualifié » :

- L'image elle-même : environ 1 000 à 1 600 tokens selon sa résolution (l'API la redimensionne automatiquement ; ~750 pixels = 1 token).
- Le prompt d'instructions (taxonomie I&V, règles de démérite) : quelques centaines de tokens, réductibles de ~90% via le cache de prompt puisque ce bloc ne change pas d'une photo à l'autre.
- La réponse structurée (type d'incivilité, score de démérite, justification courte) : environ 200 à 400 tokens de sortie.

*Hypothèse retenue pour les estimations ci-dessous : ~1 500 tokens en entrée et ~300 en sortie par photo, hors cache.*

**Tarifs par modèle (par million de tokens) :**

| Modèle | Entrée ($/1M) | Sortie ($/1M) | Coût estimé / photo |
|---|---|---|---|
| Haiku 4.5 (le plus léger) | $1,00 | $5,00 | ≈ $0,003 |
| Sonnet 5 | $2,00 | $10,00 | ≈ $0,006 |
| Opus 5 (le plus capable) | $5,00 | $25,00 | ≈ $0,015 |

**Projection mensuelle (ordre de grandeur, ~1$ ≈ 0,92€) :**

| Volume / mois | Haiku 4.5 | Sonnet 5 | Opus 5 |
|---|---|---|---|
| 1 000 photos | ≈ 3 $ (2,8 €) | ≈ 6 $ (5,5 €) | ≈ 15 $ (14 €) |
| 10 000 photos | ≈ 30 $ (28 €) | ≈ 60 $ (55 €) | ≈ 150 $ (138 €) |

Pour une tâche de classification comme celle-ci (pas du raisonnement complexe), Haiku 4.5 ou Sonnet 5 suffisent probablement — pas besoin d'Opus 5 a priori, à réserver au cas où la fiabilité de détection s'avère insuffisante sur les modèles plus légers. À confirmer empiriquement une fois les photos d'exemple disponibles pour tester la précision réelle sur chaque modèle.

*Ces chiffres sont des ordres de grandeur, pas une facture — le coût réel dépendra de la taille effective des photos et de la longueur finale du prompt, à mesurer une fois le premier prototype branché. Ils n'incluent pas l'hébergement Supabase (reste en free tier comme le reste du projet UrBizia).*

## Question ouverte

L'indépendance vis-à-vis d'un fournisseur d'IA est-elle déjà un critère important dès maintenant, ou peut-on avancer avec l'approche API en phase 1 et réévaluer plus tard ?
