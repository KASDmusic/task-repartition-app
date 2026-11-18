# À deux

Application web de partage des tâches entre Kenzo et Albane.

## Démarrage avec Docker

Avec Docker Desktop démarré, exécutez cette commande depuis le dossier du projet.

```sh
docker compose up --build -d
```

Ouvrez [À deux](http://localhost:8000). Le fichier Compose publie le service sur la boucle locale de la machine. Le port peut être changé en définissant `APP_PORT` avant de lancer Compose.

```sh
docker compose down
```

Le volume Docker `task-data` conserve la base SQLite au-delà des redémarrages et des recréations du conteneur. L’option `--volumes` de `docker compose down` efface cette base.

## Utilisation

- **Journalier** ouvre aujourd’hui par défaut. Choisissez une date, puis validez une tâche en sélectionnant Kenzo, Albane ou les deux. Les tâches hebdomadaires peuvent également être validées depuis cette vue.
- **Hebdomadaire** présente les tâches de chaque jour du lundi au dimanche et les tâches à faire une fois dans la semaine. Cliquez sur un jour pour ouvrir sa vue journalière.
- **Mensuel** indique le nombre de réalisations par fréquence, le temps estimé, la répartition et l’historique. Les tâches mensuelles se valident dans cette vue.
- **Mes tâches** permet de modifier le nom ou la durée d’une tâche, ou de l’archiver. **Nouvelle tâche** permet de choisir la fréquence et de renseigner la durée en minutes.

L’application initialise les trois listes avec des exemples modifiables. Chaque tâche peut être validée une fois par période. Les tâches validées ensemble comptent une fois, et leur durée estimée est répartie à parts égales. Les réalisations gardent le nom et la durée enregistrés lors de leur validation, y compris après l’archivage de la tâche.

## Démarrage sans Docker

Python 3.11 ou supérieur suffit.

```sh
python app.py
```

L’application écoute sur [localhost:8000](http://localhost:8000) et enregistre ses données dans `data/tasks.sqlite3`. Ce fichier est indépendant du volume Docker.
