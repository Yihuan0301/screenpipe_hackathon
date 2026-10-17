# launch-shadow

Lit les commentaires de la page de note Xiaohongshu (小红书) actuellement au premier plan dans les enregistrements d'écran de screenpipe, les structure avec un modèle de vision (via l'API locale de screenpipe), et reconstitue autant que possible « qui répond à qui » et si l'auteur a déjà répondu.

Pour l'instant, seule la plateforme Xiaohongshu (page de note dans Chrome) est activée. Le code contient un adaptateur `PLATFORMS` prêt à accueillir d'autres plateformes, comme X ou Reddit.

## Fonctionnement

1. Interroge l'API locale de screenpipe (`http://localhost:3030`) pour récupérer, dans les 30 dernières minutes, les images OCR où Chrome est au premier plan et dont l'URL est une page de note Xiaohongshu (`/explore/<id>`).
2. Regroupe ces images par identifiant de note, puis garde toutes les images du note le plus récent, triées par date.
3. Envoie chaque image (`/frames/<id>`) au modèle de vision (`/v1/chat/completions`) pour extraire la liste des commentaires : nom d'utilisateur, texte, indicateur auteur, niveau (0 = commentaire principal, 1 = réponse), préfixe `回复 X :`, et nombre de « réponses masquées » (`展开 N 条回复`).
4. Assemble les images consécutives en une seule séquence grâce à un alignement flou des chevauchements. Quand aucun chevauchement n'est trouvé, une rupture («断层 ») est enregistrée, et aucune relation de fil n'est déduite de part et d'autre.
5. Applique la règle suivante : la première réponse d'un fil n'a pas de préfixe et répond au commentaire principal ; les réponses suivantes portent le préfixe `回复 X :` et répondent à X. On en déduit `replyToUser`, `parentId` et `hasAuthorReply` (`true` / `false` / `null` = indéterminé).
6. La version actuelle affiche seulement le résultat en JSON dans la console. Elle n'enregistre rien en base et n'envoie aucune notification.

## Prérequis

- macOS (la détection de fenêtre et `node-notifier` dépendent de l'environnement de bureau)
- Node.js 18 ou plus récent (environnement de développement : v25.2.1)
- [screenpipe](https://screenpi.pe) installé et lancé, avec l'enregistrement d'écran et la capture des fenêtres et URL activés
- Google Chrome, pour ouvrir les pages de notes Xiaohongshu

## Installation

```bash
git clone git@github.com:Yihuan0301/screenpipe_hackathon.git launch-shadow
cd launch-shadow
npm install
```

## Configuration

Créez un fichier `.env` à la racine du projet (**ne le committez jamais** ; il est déjà ignoré par `.gitignore`) :

```env
SCREENPIPE_KEY=votre_cle_api_locale_screenpipe
# Optionnel : nom du modèle de vision, par défaut claude-sonnet-5
# LAUNCHSHADOW_MODEL=claude-sonnet-5
# Optionnel : adresse de l'API locale screenpipe, par défaut http://localhost:3030
# SCREENPIPE_LOCAL_API_URL=http://localhost:3030
```

- `SCREENPIPE_KEY` : le jeton Bearer de l'API locale de screenpipe, à récupérer dans les réglages de screenpipe. Le code accepte aussi `SCREENPIPE_LOCAL_API_KEY` comme nom de variable de remplacement.
- Sans clé, les requêtes renvoient une erreur 401 et tous les appels au modèle échouent.

## Exécution

```bash
node index.js
```

Au lancement, le programme attend environ 6 secondes. Pendant ce temps, passez Chrome sur une page de note Xiaohongshu et arrêtez-vous dans la zone des commentaires. Ensuite, le programme récupère les images des 30 dernières minutes concernant la note et affiche le résultat structuré.

Si la sortie est `当前焦点不在已启用平台，或没有读到评论` (« le premier plan n'est pas sur une plateforme activée, ou aucun commentaire n'a été lu »), cela signifie en général que :

- le premier plan n'est pas sur une page de note (page d'accueil, profil utilisateur, etc. ne sont pas traités comme des notes) ;
- aucune image de page de note au premier plan n'a été enregistrée dans les 30 dernières minutes ;
- le titre de la fenêtre ou l'URL n'a pas été capturé par screenpipe (`browser_url` vide).

## Champs de sortie

| Champ | Signification |
|---|---|
| `id` | Numéro de l'enregistrement pour cette exécution, par ex. `小红书-0` |
| `user` / `text` | Nom de l'auteur du commentaire et texte du commentaire |
| `isAuthor` | Indique si l'auteur est l'auteur de la note |
| `level` | `0` commentaire principal, `1` réponse |
| `replyToUser` / `replyToId` | La personne à qui ce commentaire répond, et l'id du commentaire auquel il répond |
| `parentId` / `parentUser` | Le commentaire principal auquel il est rattaché |
| `hasAuthorReply` | L'auteur a-t-il répondu à ce commentaire : `true` oui, `false` confirmé non, `null` indéterminé (par ex. des réponses sont encore masquées, ou une rupture empêche de rattacher le commentaire) |
| `hiddenReplies` | Nombre de réponses du fil non dépliées et non capturées |
| `collapsedReplies` | Nombre total de réponses affiché sur le commentaire principal |
| `firstSeen` / `lastSeen` | Horodatage de la première et de la dernière image où ce commentaire apparaît |

## Limites connues

- **Dépend du modèle de vision** : pour une même image, le nom d'utilisateur ou les emojis peuvent varier légèrement d'une exécution à l'autre. Le modèle renvoie parfois une réponse vide ou un contenu non JSON ; l'image est alors comptée comme « image manquante », ce qui crée une rupture.
- **Seul le contenu défilé est visible** : les commentaires jamais défilés n'apparaissent pas. Si un commentaire principal n'apparaît dans aucune image, les réponses qui s'y rattachent ont un rattachement `null`.
- **Ruptures** : deux images consécutives doivent partager du contenu. Un défilement trop rapide crée une rupture ; de part et d'autre, aucun fil n'est déduit. Le programme préfère `null` à une supposition.
- **Déduplication** : seul un chevauchement d'une seule ligne entre images consécutives, à moins de 60 secondes d'écart, avec le même nom et le même texte, est fusionné. Une même personne qui écrit le même texte à un autre moment reste en deux exemplaires.
- **Pas encore pleinement validé** : la fusion et la logique des fils sont encore en cours de mise au point. La dernière exécution réelle a renvoyé un résultat vide, car le premier plan n'était pas sur une page de note ; le fonctionnement de bout en bout sur une note complète n'a pas encore été vérifié.
- **macOS uniquement** : la détection de fenêtre repose sur le titre de la fenêtre Chrome et sur la capture OCR de screenpipe.

## Structure du dépôt

```
index.js          Programme principal (capture, extraction par modèle, fusion, calcul des fils)
package.json      Déclaration des dépendances
package-lock.json Versions figées des dépendances
.gitignore        Ignore node_modules, .env, etc.
README.md         Documentation (chinois)
README.fr.md      Documentation (français)
```
