# Journal manuscrit → Les notes (ingestion par courriel)

> **Statut : PLAN, rien n'est construit.** Écrit 2026-11-01 avec Marc, après une revue
> du marché des « e-writers » et une vérification de chaque porte d'intégration.
> Deux décisions restent à prendre (§6) — elles touchent le DNS et le modèle de données.

## 1. Ce qu'on veut

Marc veut tenir un journal **à la main** (le geste physique, le papier), mais que ça
atterrisse dans Babillard avec de **vrais mots-clés cherchables, par date**.

Décidé : **ça vit dans « Les notes » existantes** (`family_notes`, portée par
`member_id`) — pas de nouvelle table, pas de nouvel onglet. Donc une entrée de journal
**est** une note de membre, et elle hérite gratuitement de la recherche
(`SEARCH_INDEX.familyNote` : titre primaire, corps secondaire).

> **Ce n'est PAS privé, et c'est assumé.** `family_notes` est visible par la maisonnée ;
> il n'existe aucune confidentialité par membre dans le schéma (`habits` porte le
> commentaire « private-ish: filtered client-side by the picked face », ce qui est un
> filtre d'UI, pas une permission). N'importe qui choisissant ce visage sur le kiosque
> lit le journal. Marc l'a tranché en connaissance de cause.

## 2. L'architecture : Babillard reçoit du courriel

La trouvaille qui rend le reste simple. **Cloudflare Email Routing** peut router une
adresse vers un Worker, et Babillard **est** un Worker. Chaque e-writer sur le marché
sait déjà « envoyer par courriel ».

```
écrire à la main sur l'appareil
  → conversion manuscrit→texte SUR l'appareil (fr_CA, gratuit, hors ligne)
  → « envoyer par courriel » vers une adresse privée
  → Cloudflare Email Routing → le handler email() du Worker
  → PostalMime.parse(message.raw)
  → le TXT devient le corps cherchable · la page devient la pièce jointe
  → une ligne family_notes datée du jour de l'écriture
```

**Pourquoi c'est la bonne porte** (les autres ont été vérifiées et écartées) :

| Porte | Verdict |
| --- | --- |
| **Courriel → Email Worker** | ✅ Aucune infra nouvelle, aucune API inversée, aucune machine allumée en permanence. Marche avec les quatre marques. |
| WebDAV Supernote | ❌ C'est « NetVirtualDisk » — un **disque réseau à parcourir**, pas un service de synchro. |
| Private Cloud auto-hébergé | 🔶 Existe (firmware 3.28) et est inversé par `allenporter/supernote`, mais exige un serveur allumé **et** l'analyse du `.note` binaire, dont tous les parseurs sont en Python/C# — rien en TS pour un Worker. |
| API cloud reMarkable | ❌ Aucune API officielle ; clients communautaires qui cassent, abonnement Connect. |
| Écrire DANS Babillard sur e-ink | ❌ Un canvas de navigateur sur Boox accuse **200-300 ms** de retard : les apps natives gèlent Android et pilotent la dalle via le SDK Onyx, ce qu'une page web n'obtient pas. |

**L'OCR n'est jamais la source de vérité.** C'est l'appareil qui fait la
reconnaissance, chez lui, en `fr_CA`. On ne lit jamais une écriture manuscrite
nous-mêmes : pas de budget IA brûlé, pas de risque de cursive (un comparatif donne
63,4 % sur du cursif), et le corpus de recettes de ce dépôt a déjà mesuré notre lecteur
gratuit en échec sur de l'**imprimé** dense.

## 3. Matériel — recommandation

**Supernote A5 X2 Manta.** `fr_CA` nommé explicitement, reconnaissance sur l'appareil,
**sans abonnement**, export **TXT** (l'analyse triviale), dalle Carta 1300 souple, et
ni IA ni magasin d'applications — le seul des quatre qui partage la thèse calme de
Babillard. Prix relevé par Marc : **910 $ CA** rendu (vérifier si le stylet est inclus ;
sinon ~65 $ US de plus).

Écartés, avec la raison : **Boox** est le plus automatisable (Android 15 + Play Store,
et `einktab.ca` le distribue au Canada — pas de taxes frontalières, garantie
canadienne), mais son moteur ne tient **qu'une langue par session**, démarre en
chinois + anglais, et **ne convertit pas une page mêlant français et anglais** — une
taxe quotidienne dans une maison qui alterne. **reMarkable** a la meilleure surface
d'écriture mais met la conversion derrière Connect (39,90 $/an) et sort du PDF, pas du
texte. **Kindle Scribe** liste officiellement le français (Canada) et sait
convertir-puis-envoyer : l'outsider sur le prix, pénalisé par l'écosystème Amazon.

> **L'essai de 45 jours remboursable ne traverse pas la frontière proprement :** le
> retour est à nos frais et la TPS/TVQ payée à l'import ne revient pas d'elle-même (il
> faut une demande de remboursement occasionnel à l'ASFC). D'où la phase 1 ci-dessous,
> qui se teste à 0 $ avec un téléphone.

## 4. Phase 1 — le texte seul (petite, livrable, aucune migration)

Livre déjà la demande telle qu'énoncée : de vrais mots-clés, cherchables, par date.

- **`functions/_lib/journalAddress.ts`** — l'adresse est un jeton HMAC, sur le modèle
  exact de `issueGuestToken`/`verifyGuestToken` (`_lib/auth.ts`, même clé
  `SESSION_SECRET`). `jrnl-<b64url>@<zone>` encode `household_id` + `member_id`.
  **Une adresse entrante n'est pas authentifiée** : sans jeton infalsifiable,
  n'importe qui écrit dans le journal. Plus une liste blanche d'expéditeurs.
- **`functions/_lib/journalMail.ts`** — la fonction **pure** (donc testable sans
  déployer) : MIME analysé → `{ title, text, at }`. Sujet → titre ; à défaut, la
  première ligne, sinon « Journal du <date> ». L'en-tête `Date` → `created_at`, pour
  que l'entrée porte le jour **où elle a été écrite**, pas celui de l'ingestion.
- **`email()` dans `worker/index.ts`** — à côté de `fetch` et `scheduled` (le cron
  nocturne), même forme. Mince : analyse, vérifie, insère, rien d'autre.
- **L'insertion réutilise `functions/api/family-notes.ts`**, elle ne la recopie pas.
- **Dépendance : `postal-mime`.** Côté Worker, donc hors du plafond de
  `check:bundle` (qui borne le chunk FR **eager** du client) — à confirmer quand même.
- **Tests.** `journalMail` et `journalAddress` sont purs → unitaires. Le handler
  `email()` ne tourne pas sous `wrangler dev` (limite connue de Wrangler) : d'où la
  règle de garder la logique dans les helpers purs et le handler squelettique.

**Ce que Marc teste à 0 $, avant d'acheter :** il s'envoie une note tapée, ou la photo
d'une page de papier, depuis son téléphone à l'adresse privée. Si une entrée datée et
cherchable apparaît dans « Les notes », la chaîne est prouvée.

## 5. Phase 2 — la page manuscrite comme pièce jointe (après la phase 1)

Volontairement **repoussée**, parce qu'elle dépend d'un fait qu'on n'a pas : **ce que
le Manta met vraiment dans un courriel.** La doc dit PDF / DOCX / TXT — donc
probablement **pas** de PNG.

Et ça compte, parce que `media_kind` est une union `'audio' | 'drawing' | 'image'`
consommée à une vingtaine d'endroits (`board/types.ts` est la porte de compilation, donc
`tsc` les énumérerait tous). Un `'pdf'` nouveau est borné mais réel, et il faut une vue
pour l'afficher.

**Donc : ne rien construire ici avant d'avoir vu un vrai courriel du Manta.** Si
l'appareil sait envoyer du PNG, `media_kind: 'image'` existe déjà et la phase 2 est
presque gratuite. S'il n'envoie que du PDF, le nouveau `kind` se justifie — et la
loupe `PanZoom` (`initialScale` + `minimap`, construite pour la vérification des
recettes) est déjà là pour lire une page.

## 6. Les deux décisions qui restent

1. **Est-ce que `marcportal.com` reçoit du courriel aujourd'hui ?** Activer Email
   Routing pose des enregistrements **MX** sur la zone. Resend n'a besoin que de TXT
   (SPF/DKIM) pour **envoyer**, donc l'envoi n'est pas touché — mais s'il existe des
   boîtes sur ce domaine, les MX de Cloudflare les cassent. Si oui → un sous-domaine
   ou une zone dédiée.
2. **Phase 2 : quel `media_kind`** — attendre de voir un courriel réel (recommandé), ou
   ajouter `'pdf'` tout de suite en pariant sur la doc.

## 7. Les barrières à respecter (CLAUDE.md)

- Une ligne **PARITY** Part 1 sans trou + la porte Part 6 collée dans le commit.
- Les portes de **ACTIONS.md** Part 1 pour chaque action nouvelle.
- `useWrite()` pour toute écriture client ; `api()` pour les lectures.
- **Jamais `PHOTOS.put`** depuis un handler : `uploadR2Media()`. Il prend une `Request`,
  donc une pièce jointe se présente comme `new Request(url, { body, headers })` — ce qui
  garde intact l'agrégat quotidien (migration 0137) qu'aucun site d'appel ne voit.
- Un **guard planté rouge puis restauré** avant d'être cru (§5 de STATE.md).
- `STATE.md` mis à jour **dans le même commit** que le travail.
- Copie FR-CA d'abord, et `glossary.ts` décide du mot avant `i18n.ts`.
