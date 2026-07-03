# ChronoTrade - Connexion Supabase

Ce fichier sert a transformer ChronoTrade en base de plateforme, sans casser les formulaires actuels.

## 1. Creer le projet Supabase

1. Va sur Supabase.
2. Cree un nouveau projet.
3. Ouvre `SQL Editor`.
4. Colle tout le contenu de `supabase.sql`.
5. Clique sur `Run`.

Les tables creees sont :

- `users`
- `partners`
- `business_requests`
- `partner_matches`
- `projects`

Les candidats partenaires arrivent avec le statut `pending`. Ils ne deviennent visibles publiquement que si tu les passes en `approved`.

## 2. Variables a mettre dans Render

Dans Render, service `chronotrade-form-system`, onglet `Environment`, ajoute :

```txt
SUPABASE_URL=https://TON-PROJET.supabase.co
SUPABASE_SERVICE_ROLE_KEY=ta-cle-service-role
```

Ou les trouver :

- `SUPABASE_URL` : Supabase > Project Settings > API > Project URL
- `SUPABASE_SERVICE_ROLE_KEY` : Supabase > Project Settings > API > service_role secret

Important : ne mets jamais `SUPABASE_SERVICE_ROLE_KEY` dans `index.html`, Netlify ou du code public. Elle doit rester uniquement cote serveur Render.

## 3. Ce que le backend fait automatiquement

Quand un formulaire arrive :

- Il garde le prospect dans le stockage existant.
- Il garde l'automatisation Notion existante.
- Il garde les emails Outlook existants.
- Il garde la generation du devis existante.
- Il ajoute une copie structuree dans Supabase si les variables Supabase sont presentes.

Mapping actuel :

- Formulaire ChronoTrade Launch -> `projects`, univers `launch`
- Formulaire partenaire -> `partners`, statut `pending`
- Formulaire ChronoTrade Business -> `business_requests`, statut `new`
- Formulaire ChronoTrade OS -> `projects`, univers `os`
- Formulaire ChronoTrade Studio -> `projects`, univers `studio`

Si Supabase n'est pas configure, le site continue de fonctionner normalement.

## 4. Regles de securite

Le fichier `supabase.sql` active RLS sur toutes les tables.

Lecture publique autorisee uniquement pour :

- les partenaires `approved`
- les projets `completed` ou `prototype`

Les donnees privees des prospects et candidats restent protegees. Le backend Render utilise la cle `service_role` pour ecrire.

## 5. Tests a faire

1. Remplir le formulaire ChronoTrade Business depuis le site.
2. Verifier que le mail client part.
3. Verifier que la notification interne arrive.
4. Verifier que Notion recoit ou met a jour la fiche.
5. Verifier dans Supabase > Table Editor > `business_requests` qu'une ligne est creee.
6. Remplir le formulaire ChronoTrade Launch.
7. Verifier que la ligne arrive dans `projects` avec `universe = launch`.
8. Remplir le formulaire partenaire.
9. Verifier que la ligne arrive dans `partners` avec `status = pending`.
10. Passer manuellement un partenaire en `approved`.
11. Verifier que seul ce partenaire peut etre lu via la vue `approved_partners_public`.

## 6. Evolution admin

La prochaine etape logique est un espace admin qui lit :

- `partners` pour valider/refuser les candidats
- `business_requests` pour suivre les demandes reseau
- `projects` pour construire le portfolio ChronoLab
- les prospects existants via l'API Render

Pour rester securise, l'admin devra etre protege par authentification avant d'exposer ces donnees.
