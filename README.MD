# Server Room Monitor
## Contexte : Optimisation et Sécurisation d'une Salle Serveur (Data Room)

Ce plan illustre l'agencement d'une salle technique informatique (salle serveur) conçue selon les meilleures pratiques de l'industrie. L'objectif de cette disposition est de répondre à trois impératifs critiques : la gestion thermique, la continuité de service et la surveillance active.

### Plan de la Salle Serveur
![Plan Salle Serveur](docs/server_room_plan.png)

### Spécificités Techniques à Respecter

#### La Gestion des Flux d'Air (Aéraulique)

Le point central de ce plan est la création d'une "Allée Chaude" confinée.

- **Le Principe** : Les baies de serveurs (Racks bleus) sont disposées face à face ou dos à dos de manière stratégique. Ici, l'espace central est une Allée Chaude. Les serveurs aspirent l'air frais depuis l'extérieur des rangées (côté mur) et rejettent l'air chaud vers le centre de la pièce.

- **Pourquoi ?** : Cela évite le mélange entre l'air froid (nécessaire au refroidissement) et l'air chaud (rejeté). Mélanger les deux rendrait la climatisation inefficace et coûteuse.

- **Rôle des Clims** : Les unités de climatisation (en haut) soufflent de l'air froid vers les zones extérieures pour qu'il soit aspiré par la façade avant des serveurs.

#### Le Monitoring Environnemental (Les Capteurs)

Dans un espace clos générant autant de chaleur, l'environnement peut changer brutalement. Le plan intègre une surveillance multi-points :

- **Capteurs Température/Humidité (Points Orange)** : Placés sur les racks, ils vérifient que l'air entrant dans les serveurs est assez frais et pas trop humide (risque de corrosion) ou trop sec (risque d'électricité statique).

- **Capteur de point chaud (Point Rose)** : Situé au cœur de l'allée chaude, il surveille la zone la plus critique pour détecter une surchauffe anormale avant qu'elle n'endommage le matériel.

#### La Continuité Électrique (Zone Rouge)

- **Les Onduleurs** : La zone rouge n'est pas seulement du stockage. Les onduleurs (UPS) sont positionnés pour prendre le relais instantanément en cas de coupure de courant, garantissant que les serveurs ne s'éteignent jamais brutalement, ce qui préserve l'intégrité des données.

#### La Sécurité Physique (Point Jaune)

- **Détection d'intrusion** : Une salle serveur est une zone sensible. Le capteur de mouvement (jaune) assure que toute présence humaine est détectée, activant l'éclairage ou une alerte de sécurité. Cela protège contre les accès non autorisés ou le vol de données physiques.

---
Surveillance temps réel d’une salle serveur à partir d’ESPHome/Home Assistant. Les états sont persistés dans MariaDB, consommés via binlog par un backend FastAPI et diffusés en WebSocket vers un frontend Angular.

## Points clés
- Temps réel via WebSocket.
- Détection température, humidité et mouvement.
- Déploiement Docker prêt à l’emploi.
- Architecture simple, extensible et maintenable.

## Architecture
1. ESPHome publie les états vers Home Assistant.
2. Home Assistant écrit dans MariaDB (tables `states` et `states_meta`).
3. FastAPI lit le binlog et pousse les événements ciblés via `/ws`.
4. Angular consomme le WebSocket et affiche les cartes capteurs.

## Stack technique
- Backend : FastAPI, Uvicorn, PyMySQL, mysql-replication.
- Frontend : Angular (v21+), Nginx.
- Base : MariaDB avec binlog ROW activé.
- Transport : WebSocket.

## Prérequis
- MariaDB avec binlog activé (format ROW).
- Home Assistant configuré pour utiliser MariaDB.
- Python 3.11+ (si exécution locale).
- Node.js 20+ et npm 10+ (si exécution locale).
- Docker et Docker Compose (recommandé).

## Démarrage rapide avec Docker
1. Renseigner la variable `MARIADB_URL` dans [.env.docker](.env.docker).
2. Démarrer les services :
   ```bash
   docker-compose up -d --build
   ```

Accès :
- Frontend : http://localhost
- Backend : http://localhost:8000
- Docs API : http://localhost:8000/docs

## Configuration MariaDB (binlog ROW)
Exemple de configuration :
```yaml
databases:
  - homeassistant
logins:
  - password: {PASSWORD_MARIADB}
    username: {USERNAME_MARIADB}
rights:
  - database: homeassistant
    username: homeassistant
mariadb_server_args:
  - "--server-id=10"
  - "--log-bin=mysql-bin"
  - "--binlog-format=ROW"
  - "--expire-logs-days=3"
  - "--max-binlog-size=100M"

```

Créer un utilisateur MariaDB avec droits de réplication :
```sql
CREATE USER 'homeassistant'@'%' IDENTIFIED BY 'password';
GRANT ALL PRIVILEGES ON homeassistant.* TO 'homeassistant'@'%';
GRANT REPLICATION SLAVE, REPLICATION CLIENT ON *.* TO 'homeassistant'@'%';
FLUSH PRIVILEGES;
```

## Variables d’environnement
| Variable | Description | Exemple |
| --- | --- | --- |
| `MARIADB_URL` | URL de connexion MariaDB | `mysql://user:pass@host:3306/homeassistant` |

## Exécution locale (optionnel)
### Backend
```bash
cd Backend
python -m venv .venv
source .venv/bin/activate    # Linux/macOS
.venv\Scripts\activate       # Windows
pip install -r requirements.txt
set MARIADB_URL=mysql://user:pass@host:3306/homeassistant   # Windows
export MARIADB_URL=...                                      # Linux/macOS
docker-compose up --build
```

### Frontend
```bash
cd Frontend/frontend-app
npm install
npm run start
```
Accès : http://localhost:4200

## WebSocket
- Endpoint : `ws://<backend>:8000/ws`
- Payload : `{ "entity_id": "...", "state": "...", "date_heure": "..." }`

## Sécurité (recommandations)
- Restreindre l’accès réseau aux ports 80/8000.
- Utiliser HTTPS/WSS si exposition hors LAN.
- Mettre en place une authentification WebSocket si usage multi‑utilisateur.
- Limiter l’utilisateur MariaDB à l’IP du backend.

## Dépannage rapide
- `MARIADB_URL` absent : vérifier [.env.docker](.env.docker).
- Pas d’événements : vérifier `binlog_format=ROW` et les droits REPLICATION.
- WebSocket instable : vérifier la connectivité réseau et le firewall.

## Feuille de route
- Historique côté frontend.
- Alertes (mail, webhook, notifications HA).
- Authentification WebSocket.
- Observabilité (metrics, logs structurés).
