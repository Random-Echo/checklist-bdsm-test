CHECKLIST BDSM — V1.1.90 DEV

Base de développement nettoyée après la refonte V2 du modèle interne.

Runtime public :
- index.html : accueil ;
- checklist.html : application unique ;
- app.js / app.css : interface Édition + Lecture ;
- profiles.js : pseudos, anatomie pertinente et dynamique D/s ;
- interaction-model.js : modèle single / donner-recevoir / dominant-soumis ;
- practice-catalog.js : catalogue généré de 623 entités ;
- storage.js : stockage actif schema 4 + migrations ;
- bootstrap.js : langue et porte 18+.

Développement :
- tools/build-practice-catalog.js : reconstruit practice-catalog.js depuis legacy-data/ ;
- tests/ : tests de modèle, stockage, migration, runtime, UI, scroll et responsive ;
- legacy-data/ : sources V1.1.55 conservées uniquement pour reconstruction/migration.

Validation : exécuter tous les fichiers tests/*.js avec Node.js.
