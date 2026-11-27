# VITE — Back-office (React)

Back-office web au **design inspiré des apps Apple** (barre latérale macOS, grands titres, cartes et listes, fiches en panneau latéral, police système, mode sombre). Thème au choix dans la barre latérale : Automatique, Clair ou Sombre.

## Super Admin (SA)

| Page | Contenu |
|---|---|
| Vue d’ensemble | Indicateurs (courses, volume, livreurs en ligne, litiges, montants à reverser), activité sur 14 jours, classements, points à traiter |
| Courses | Recherche, filtres (statut, entreprise, période), export CSV, fiche détaillée (carte, chronologie, arrêts, preuves), annulation avec motif |
| Carte en direct | Positions des livreurs en temps réel (disponible / en course / hors ligne) |
| Litiges | Échecs de livraison avec preuves (GPS, attente, photo) ; trancher les contestations |
| Encaissements | Paiements à la livraison encaissés, à reverser par entreprise |
| Entreprises | Création (avec gérant), modification, suspension ; **fiche complète** : chiffres clés, activité 30 jours, gérants, courses, livreurs, encaissements, litiges |
| Livreurs · Clients | Activité, statut, blocage immédiat |
| Tarifs et règles | Grille de prix, offres actives, coefficients de délai, frais, arrêts max, attente avant absence, simulateur |

## Gérant d’entreprise

Vue d’ensemble, Courses, Carte en direct, Litiges (arbitrage), Encaissements (marquer « reversé »), Livreurs (ajout, blocage).

## Démarrer

```bash
npm install
npm run dev              # http://localhost:5173 (API : VITE_API_URL, par défaut http://localhost:3000)
```
