# 📚 Pronote Scraper V2 - Documentation

## 🎯 Nouvelles fonctionnalités

### ✨ Changements majeurs par rapport à V1

#### 1. **Navigation améliorée**
- ✅ Navigation vers "Cahier de textes > Travail à faire"
- ✅ Sélection automatique de la date du jour
- ✅ Scraping organisé par matière

#### 2. **Scraping par matière**
Le script parcourt maintenant chaque matière individuellement :
- Clic sur chaque matière dans la sidebar
- Extraction des devoirs affichés pour cette matière
- Meilleure structuration des données

#### 3. **Données plus complètes**
Chaque devoir contient maintenant :
```javascript
{
  matiere: "FRANCAIS",
  datePour: "lundi 05 janvier",
  donneLe: "lun. 15 déc.",
  joursRestants: "21",
  statut: "Fait" | "Non Fait",
  contenu: "...",
  boutonCours: true | false,
  timestamp: "2026-01-02T..."
}
```

#### 4. **Date dynamique**
- Le script sélectionne automatiquement la date du jour
- Parfait pour l'automatisation quotidienne via cron

---

## 🚀 Utilisation

### Tester pour un seul enfant (Kélia)
```bash
node testScraperV2.js kelia
```

### Tester pour tous les enfants
```bash
node testScraperV2.js
```

---

## 📁 Structure des fichiers

### Nouveaux fichiers
- **scrapePronoteV2.js** - Nouvelle logique de scraping
- **testScraperV2.js** - Script de test pour la V2

### Fichiers conservés (V1)
- **scrapePronote.js** - Ancienne version (backup)
- **loginSSOMultiEnfants.js** - Ancienne version (backup)

---

## 🔄 Migration depuis V1

### Différences clés

| Aspect | V1 | V2 |
|--------|----|----|
| Navigation | Page d'accueil | Cahier de textes > Travail à faire |
| Scraping | Global sur la page | Par matière (boucle) |
| Date | Date par défaut | Sélection dynamique du jour |
| Données | Structure simple | Structure enrichie |

### Avantages de V2
- ✅ **Plus fiable** : Navigation vers la vue correcte
- ✅ **Plus complet** : Tous les devoirs par matière
- ✅ **Plus précis** : Date du jour automatique
- ✅ **Mieux structuré** : Données organisées par matière

---

## 📊 Structure Firestore

Les données sont sauvegardées dans :

```
children/{childId}/pronote/devoirs
{
  devoirs: [
    {
      matiere: "...",
      datePour: "...",
      donneLe: "...",
      joursRestants: "...",
      statut: "...",
      contenu: "...",
      boutonCours: true/false,
      timestamp: "..."
    },
    ...
  ],
  count: 10,
  stats: {
    totalDevoirs: 10,
    parMatiere: {
      "FRANCAIS": 4,
      "MATHEMATIQUES": 2,
      ...
    }
  },
  childId: "...",
  childName: "...",
  lastUpdate: Timestamp
}
```

---

## ⚙️ Automatisation

### Cron quotidien (à 7h du matin)
```bash
0 7 * * * cd /path/to/pronote-scraper && node testScraperV2.js >> logs/scraper.log 2>&1
```

### Variables d'environnement (.env)
```env
PRONOTE_URL=https://...
SSO_USERNAME=...
SSO_PASSWORD=...
```

---

## 🐛 Debugging

### Captures d'écran générées
Le script génère automatiquement des screenshots :
- `screenshot_travail_a_faire.png` - Après navigation
- `screenshot_after_date_selection.png` - Après sélection de date
- Screenshots d'erreur en cas de problème

### Logs détaillés
Chaque étape est loggée :
- ✅ Navigation réussie
- 🎯 Clic sur matière
- 📖 Devoirs scrapés
- 💾 Sauvegarde Firestore

---

## 🔍 Sélecteurs utilisés

### Navigation
- Menu "Cahier de textes" : Cherche dans les éléments avec innerText
- Sous-menu "Travail à faire" : Cherche dans les éléments de menu

### Datepicker
- Champ de date : input avec label/placeholder "depuis"
- Jours du calendrier : Éléments td/div/span avec texte numérique

### Matières
- Sidebar gauche : li, div avec noms de matières
- Ignore "Toutes les matières"

### Devoirs
- Titres de date : Commence par "Pour "
- Infos devoir : "Donné le", "[X Jours]", "Fait"/"Non Fait"

---

## 📝 Notes importantes

### Ce que le script fait
✅ Scrape le texte des devoirs
✅ Extrait les métadonnées (date, statut, etc.)
✅ Détecte le bouton "Voir le cours"

### Ce que le script ne fait PAS
❌ Ne télécharge pas les pièces jointes
❌ Ne capture pas les images
❌ Ne clique pas sur "Voir le cours"

---

## 🆘 Support

En cas de problème :
1. Vérifier les screenshots générés
2. Consulter les logs du script
3. Vérifier que les sélecteurs sont toujours valides (interface Pronote peut changer)

---

## 📅 Changelog

### Version 2.0 (02/01/2026)
- ✨ Navigation vers "Cahier de textes > Travail à faire"
- ✨ Sélection automatique de la date du jour
- ✨ Scraping organisé par matière
- ✨ Structure de données enrichie
- 🐛 Meilleure gestion des erreurs
- 📸 Screenshots de debugging améliorés

### Version 1.0
- Scraping basique depuis la page d'accueil
