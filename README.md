# LETO — Frontend (tableau de bord web)

Back-office React (Vite) pour :

- **les entreprises de livraison** : suivi des courses, chiffre d'affaires, ajout / désactivation des livreurs ;
- **le Super Admin (SA)** de la plateforme : toutes les courses, création / suspension des entreprises.

Onglets : **Courses**, **Carte en direct** (positions des livreurs en temps réel via Socket.IO), **Livreurs** (gérant) ; **Entreprises** et **Utilisateurs** (SA : bloquer / débloquer clients, livreurs, gérants).

Les clients et les livreurs utilisent l'application mobile.

## Démarrer

```bash
cp .env.example .env     # VITE_API_URL=http://localhost:3000
npm install
npm run dev              # http://localhost:5173
```
