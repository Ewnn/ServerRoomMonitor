import asyncio
import json
from datetime import datetime, timezone
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import pymysql
from pymysqlreplication import BinLogStreamReader
from pymysqlreplication.row_event import WriteRowsEvent
from urllib.parse import urlparse
from dotenv import load_dotenv
import os
import random
import time

load_dotenv()

MARIADB_URL = os.getenv("MARIADB_URL", "")
# Récupération d'un ID unique par client (par défaut aléatoire entre 100 et 65535 si pas défini)
SERVER_ID = int(os.getenv("SERVER_ID", random.randint(100, 65535)))

def parse_mariadb_url(url: str):
    u = urlparse(url)
    return {
        "host": u.hostname,
        "port": u.port,
        "user": u.username,
        "passwd": u.password,
        "db": (u.path or "").lstrip("/"),
        "charset": "utf8mb4",
        "autocommit": True,
    }

MARIADB = parse_mariadb_url(MARIADB_URL)

TARGET_ENTITY_IDS = {
    "sensor.esptemp_temperature",
    "sensor.esptemp_humidite",
    "binary_sensor.espir_detection_mouvement",
}

app = FastAPI()

# Configuration CORS pour autoriser les requêtes depuis le frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Autoriser toutes les origines
    allow_credentials=True,
    allow_methods=["*"],  # Autoriser toutes les méthodes (GET, POST, etc.)
    allow_headers=["*"],  # Autoriser tous les headers
)

clients = set()

# Fonction utilitaire pour décoder sans planter
def safe_decode(val):
    """Décode les valeurs bytes en strings de manière robuste."""
    if val is None:
        return None
    if isinstance(val, bytes):
        # Essayer UTF-8 d'abord, puis latin-1 en fallback
        try:
            return val.decode('utf-8')
        except UnicodeDecodeError:
            try:
                return val.decode('latin-1')
            except Exception:
                return val.decode('utf-8', errors='replace')
    return str(val)

@app.get("/api/sensors")
async def get_sensors(limit: int = 5):
    """Récupère les dernières valeurs de chaque capteur."""
    try:
        conn = pymysql.connect(**MARIADB)
        with conn.cursor() as cursor:
            results = {}
            
            # Pour chaque capteur ciblé, récupérer les N dernières valeurs
            for entity_id in TARGET_ENTITY_IDS:
                cursor.execute("""
                    SELECT s.state, s.last_updated_ts
                    FROM states s
                    JOIN states_meta sm ON s.metadata_id = sm.metadata_id
                    WHERE sm.entity_id = %s
                    ORDER BY s.last_updated_ts DESC
                    LIMIT %s
                """, (entity_id, limit))
                
                values = []
                rows = cursor.fetchall()
                print(f"[DB] {entity_id}: {len(rows)} lignes trouvées")
                for row in rows:
                    state = safe_decode(row[0])
                    timestamp = ts_to_iso(row[1])
                    values.append({
                        "state": state,
                        "date_heure": timestamp
                    })
                    print(f"  - {entity_id}: {state} (ts: {timestamp})")
                
                results[entity_id] = values
            
            return {"data": results}
    except Exception as e:
        print(f"[ERROR] Erreur lors de la récupération des données: {e}")
        import traceback
        traceback.print_exc()
        return {"error": str(e), "data": {}}
    finally:
        if conn:
            conn.close()

@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket):
    await ws.accept()
    clients.add(ws)
    
    # Envoyer les 5 dernières données initiales pour chaque capteur
    try:
        conn = pymysql.connect(**MARIADB)
        with conn.cursor() as cursor:
            for entity_id in TARGET_ENTITY_IDS:
                cursor.execute("""
                    SELECT s.state, s.last_updated_ts
                    FROM states s
                    JOIN states_meta sm ON s.metadata_id = sm.metadata_id
                    WHERE sm.entity_id = %s
                    ORDER BY s.last_updated_ts DESC
                    LIMIT 5
                """, (entity_id,))
                
                for row in cursor.fetchall():
                    state = safe_decode(row[0])
                    timestamp = ts_to_iso(row[1])
                    
                    payload = {
                        "entity_id": entity_id,
                        "state": state,
                        "date_heure": timestamp
                    }
                    try:
                        await ws.send_text(json.dumps(payload))
                    except Exception as e:
                        print(f"[ERROR] Erreur lors de l'envoi initial: {e}")
                        break
        conn.close()
    except Exception as e:
        print(f"[ERROR] Erreur lors du chargement des données initiales: {e}")
    
    try:
        while True:
            await ws.receive_text()
    except WebSocketDisconnect:
        print("Client disconnected cleanly")
    except Exception as e:
        print(f"Error: {e}")
    finally:
        clients.discard(ws)

async def broadcast(message: str):
    dead = []
    for ws in clients:
        try:
            await ws.send_text(message)
        except Exception:
            dead.append(ws)
    for ws in dead:
        clients.discard(ws)

def ts_to_iso(ts):
    if ts is None:
        return datetime.now(timezone.utc).isoformat()
    return datetime.fromtimestamp(float(ts), tz=timezone.utc).isoformat()

def load_metadata_cache():
    """Charge la table states_meta en mémoire."""
    print("Initialisation : Chargement des métadonnées (states_meta)...")
    cache = {}
    conn = None
    try:
        conn = pymysql.connect(**MARIADB)
        with conn.cursor() as cursor:
            cursor.execute("SELECT metadata_id, entity_id FROM states_meta")
            for row in cursor.fetchall():
                metadata_id = row[0]
                entity_id = safe_decode(row[1])
                cache[metadata_id] = entity_id
        print(f"-> Succès : {len(cache)} capteurs chargés dans le cache.")
    except Exception as e:
        print(f"-> Erreur lors du chargement des métadonnées: {e}")
    finally:
        if conn:
            conn.close()
    return cache

def binlog_listener(loop):
    # 1. On charge le cache
    meta_cache = load_metadata_cache()

    print(f"Démarrage de l'écoute du flux de réplication (BinLog) avec ServerID={SERVER_ID}...")
    
    max_retry_attempts = 3
    retry_count = 0
    
    while retry_count < max_retry_attempts:
        stream = None
        try:
            stream = BinLogStreamReader(
                connection_settings=MARIADB,
                server_id=SERVER_ID,
                blocking=True,
                resume_stream=True,
                only_events=[WriteRowsEvent],
                only_tables=["states", "states_meta"],
            )

            for binlogevent in stream:
                try:
                    for row in binlogevent.rows:
                        try:
                            values = row.get("values", {})

                            # Mise à jour du cache si un nouveau capteur est créé
                            if binlogevent.table == "states_meta":
                                metadata_id = values.get("metadata_id")
                                entity_id = safe_decode(values.get("entity_id"))
                                if metadata_id and entity_id:
                                    meta_cache[metadata_id] = entity_id
                                    print(f"[META] Nouveau capteur enregistré : {metadata_id} -> {entity_id}")

                            # Traitement des changements d'état
                            elif binlogevent.table == "states":
                                metadata_id = values.get("metadata_id")
                                entity_id = meta_cache.get(metadata_id)
                                
                                # Décodage sûr de la valeur d'état
                                state_val = safe_decode(values.get("state"))
                                
                                # AFFICHAGE DE CHAQUE CHANGEMENT
                                entity_display = entity_id if entity_id else f"Unknown_ID_{metadata_id}"

                                if entity_id in TARGET_ENTITY_IDS:
                                    print(f"   >>> CIBLE DETECTÉE ({entity_display}) : {state_val} >>>")
                                    payload = {
                                        "entity_id": entity_id,
                                        "state": state_val,
                                        "date_heure": ts_to_iso(values.get("last_updated_ts")),
                                    }
                                    asyncio.run_coroutine_threadsafe(
                                        broadcast(json.dumps(payload)), loop
                                    )
                        except UnicodeDecodeError as e:
                            # Skip silencieusement les erreurs d'encodage
                            continue
                        except Exception as e:
                            print(f"[ERROR] Erreur lors du traitement d'une ligne: {e}")
                            continue
                except UnicodeDecodeError as e:
                    # Skip silencieusement les événements avec erreurs d'encodage
                    continue
                except Exception as e:
                    print(f"[ERROR] Erreur lors du traitement d'un événement: {e}")
                    continue
            
            # Si on sort de la boucle sans erreur critique, on réinitialise
            retry_count = 0
            
        except pymysql.err.OperationalError as e:
            error_code = e.args[0] if e.args else None
            # 4052 = slave avec même server_id
            if error_code == 4052:
                print(f"[WARN] Erreur 4052 détectée (server_id en conflit). Utilisation d'un nouveau server_id...")
                # Générer un nouveau server_id unique
                globals()['SERVER_ID'] = random.randint(100, 65535)
                print(f"[INFO] Nouveau SERVER_ID: {SERVER_ID}")
                retry_count += 1
                time.sleep(2)
            else:
                print(f"[ERROR] Erreur MySQL critique: {e}")
                retry_count += 1
                time.sleep(5)
        except Exception as e:
            print(f"[ERROR] Erreur critique BinLogStreamReader: {e}")
            retry_count += 1
            time.sleep(5)
        finally:
            if stream:
                try:
                    stream.close()
                except Exception as e:
                    print(f"[WARN] Erreur lors de la fermeture du stream: {e}")
    
    print(f"[CRITICAL] BinLog listener: nombre max de tentatives ({max_retry_attempts}) atteint.")

@app.on_event("startup")
async def startup():
    loop = asyncio.get_event_loop()
    print("[STARTUP] Démarrage de l'application en cours...")
    
    async def binlog_listener_wrapper():
        """Wrapper avec reconnexion automatique en cas d'erreur."""
        print("[STARTUP] Wrapper BinLog en démarrage...")
        while True:
            try:
                print("[STARTUP] Lancement du listener BinLog dans un thread...")
                # Exécuter le listener dans un thread séparé
                await asyncio.get_event_loop().run_in_executor(None, binlog_listener, loop)
                print("[INFO] BinLog listener redémarrage après sortie...")
                await asyncio.sleep(5)
            except Exception as e:
                print(f"[ERROR] Erreur dans binlog_listener_wrapper: {e}")
                import traceback
                traceback.print_exc()
                await asyncio.sleep(5)
    
    # Lancer le wrapper en tâche de fond
    print("[STARTUP] Création de la tâche BinLog...")
    asyncio.create_task(binlog_listener_wrapper())
    print("[STARTUP] Application démarrée ✅")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)