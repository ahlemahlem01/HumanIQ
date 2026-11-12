# Mettre HumanIQ en ligne

Une seule commande lance toute la pile sur un serveur : base de données, moteur de recherche, API, site et HTTPS automatique.

```
Internet ──▶ Caddy (80/443, HTTPS) ──┬─▶ web  (Next.js)         https://VOTRE-DOMAINE/
                                      └─▶ api  (NestJS)          https://VOTRE-DOMAINE/api et /uploads
                                            ├─▶ postgres (pgvector)
                                            └─▶ meilisearch
```

Seul Caddy est exposé. Postgres et Meilisearch ne sont joignables que depuis le réseau Docker.

## Ce qu'il vous faut

| Élément | Détail |
|---|---|
| Un serveur Linux | 2 vCPU et 4 Go de RAM au minimum (un VPS suffit pour démarrer). Docker et Docker Compose installés. |
| Un nom de domaine | Un enregistrement DNS `A` vers l'adresse IP du serveur, avant le premier lancement (sinon le certificat HTTPS échoue). |
| Les ports 80 et 443 | Ouverts dans le pare-feu du serveur. |
| Une boîte e-mail d'envoi | SMTP de votre boîte professionnelle, ou un compte Resend. Sans cela, ni confirmation d'adresse ni réinitialisation de mot de passe ne partent. |

## Premier déploiement

```bash
git clone https://github.com/ahlemahlem01/HumanIQ.git && cd HumanIQ
cp deploy/.env.production.example .env
nano .env        # remplir DOMAIN, les trois secrets et la messagerie (voir le fichier)
docker compose -f docker-compose.prod.yml up -d --build
```

Générer chaque secret : `openssl rand -base64 48`. Ne réutilisez jamais un secret entre deux variables.

Les migrations de la base sont appliquées automatiquement au démarrage de l'API. Quand tout est « healthy » (`docker compose -f docker-compose.prod.yml ps`), créez le premier administrateur :

```bash
docker compose -f docker-compose.prod.yml exec \
  -e ADMIN_EMAIL=admin@votre-domaine.com -e ADMIN_PASSWORD='12 caractères minimum' api npm run admin:create
```

Ouvrez ensuite `https://VOTRE-DOMAINE` et connectez-vous. Ne lancez **jamais** `npm run seed` en production : il efface toute la base (il refuse de s'exécuter si `NODE_ENV=production`).

## Vérifier que tout marche

- `https://VOTRE-DOMAINE/api/health` répond `{"status":"ok"}`.
- Créez un compte candidat de test : l'e-mail de confirmation doit arriver (sinon vérifiez `SMTP_*` / `RESEND_API_KEY` : `docker compose -f docker-compose.prod.yml logs api`).
- Connexion administrateur, puis la page d'administration.

## Mettre à jour

```bash
git pull
docker compose -f docker-compose.prod.yml up -d --build
```

L'adresse du site est écrite dans le code du navigateur à la construction : si vous changez `DOMAIN`, relancez avec `--build`.

## Sauvegardes (à mettre en place vous-même)

Les données vivent dans trois volumes Docker. Sans sauvegarde, une panne de disque les perd.

```bash
# Base de données (à planifier chaque nuit, avec cron)
docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U humaniq humaniq | gzip > humaniq-$(date +%F).sql.gz

# Photos de profil et couvertures
docker run --rm -v humaniq_uploads:/data -v "$PWD":/backup alpine tar czf /backup/uploads-$(date +%F).tgz -C /data .
```

Restauration de la base : `gunzip -c humaniq-AAAA-MM-JJ.sql.gz | docker compose -f docker-compose.prod.yml exec -T postgres psql -U humaniq humaniq` (sur une base vide). L'index de recherche se reconstruit tout seul à partir de la base ; copiez les sauvegardes hors du serveur.

## Protections déjà en place

- HTTPS automatique et en-têtes de sécurité (HSTS, anti-framing, `nosniff`).
- Limitation de requêtes par adresse IP : 10 tentatives de connexion par minute, 5 pour l'inscription et les e-mails de réinitialisation, 300 requêtes par minute au total.
- L'API n'accepte les appels de navigateur que depuis `https://VOTRE-DOMAINE` ; une extension Chrome n'est acceptée que si son identifiant figure dans `EXTENSION_ORIGINS`.
- L'API refuse de démarrer en production sans `JWT_SECRET`.

## À faire de votre côté avant d'ouvrir au public

- **Pare-feu et accès SSH :** n'ouvrir que les ports 22, 80 et 443 ; connexion SSH par clé ; mises à jour de sécurité automatiques.
- **Mentions légales et politique de confidentialité :** aucune page n'existe encore dans le site (RGPD / INPDP). Les profils importés par l'extension doivent y être mentionnés.
- **Dépôt GitHub en privé.**
- **Surveillance :** une alerte sur `/api/health` (UptimeRobot, Better Stack…).
- **Anciens identifiants de démonstration :** ils n'existent pas en production (la base démarre vide), mais changez tout mot de passe qui a déjà circulé.

## Limites connues

- Une seule instance de l'API : la limitation de requêtes est gardée en mémoire, elle n'est pas partagée entre plusieurs instances.
- Les photos sont stockées sur le disque du serveur, pas sur un stockage objet.
- Sans clé OpenAI ou Anthropic, l'IA utilise le modèle local et des gabarits : les scores de similarité sont plus bas et moins nuancés.
- Pas d'intégration continue ni de déploiement automatique : la mise à jour se fait à la main (ci-dessus).
