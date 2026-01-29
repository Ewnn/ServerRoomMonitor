# Server Room Monitor

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
cd Backend
uvicorn script:app --host 0.0.0.0 --port 8000
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
