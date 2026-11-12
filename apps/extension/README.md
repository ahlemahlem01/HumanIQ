# HumanIQ — Extension Chrome « Sourcing »

Ajoute le profil ouvert dans l'onglet (LinkedIn ou page de démonstration) au pipeline d'une offre HumanIQ, avec son score de matching.

## Installation (mode développeur)

1. Démarrez l'API (`http://localhost:4100`) et le site (`http://localhost:3100`).
2. Ouvrez `chrome://extensions` et activez **Mode développeur**.
3. **Charger l'extension non empaquetée** → choisissez le dossier `apps/extension`.
4. Épinglez l'icône HumanIQ dans la barre d'outils.

## Utilisation

1. Ouvrez un profil `linkedin.com/in/…` (ou `http://localhost:3100/demo/linkedin` pour tester sans LinkedIn).
2. Cliquez sur l'icône HumanIQ, connectez-vous avec un compte **recruteur** (une seule fois).
3. Vérifiez nom, titre, lieu ; choisissez l'**offre cible** ; **Ajouter au pipeline**.
4. Le profil arrive à l'étape *Sourcing* du Kanban avec son score. « Ouvrir le pipeline » ouvre l'offre.

Si LinkedIn a changé sa page et que peu d'informations sont lues, **sélectionnez le texte du profil** avant d'ouvrir l'extension : la sélection est envoyée et analysée à la place.

## Fonctionnement

- `extract.js` : lit la page. Il est injecté **uniquement au clic** sur l'icône (permission `activeTab`) : aucun script ne tourne en arrière-plan ni sur toutes les pages.
- `popup.js` : connexion (`POST /auth/login`), liste des offres publiées (`GET /jobs/mine`), import (`POST /sourcing/linkedin`).
- Le jeton est gardé dans `chrome.storage.local` ; le mot de passe n'est jamais enregistré.
- Réglages (⚙) : adresse de l'API et du site. Une adresse autre que `localhost` déclenche une demande d'autorisation du navigateur.

## Limites connues

- Les sélecteurs LinkedIn sont « au mieux » : LinkedIn modifie souvent son HTML. Le repli par sélection de texte existe pour cela.
- Les conditions d'utilisation de LinkedIn restreignent l'extraction automatisée : l'extension ne lit que la page que le recruteur consulte, à sa demande, profil par profil. Elle ne parcourt rien.
- Données personnelles : le profil importé n'a pas de compte et n'a pas donné son accord. Il est stocké avec sa source (LinkedIn). À traiter avant une mise en production (information de la personne au premier contact, suppression sur demande — voir l'espace RGPD de l'administration).
- Non publiée sur le Chrome Web Store ; testée avec la page démo, pas encore sur un vrai profil LinkedIn.
