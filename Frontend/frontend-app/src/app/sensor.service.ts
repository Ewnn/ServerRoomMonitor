import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, interval } from 'rxjs';
import { HttpClient } from '@angular/common/http';

export interface SensorData {
  humidity: { value: number | null; timestamp: string | null };
  temperature: { value: number | null; timestamp: string | null };
  motion: { value: boolean | null; timestamp: string | null };
}

// Interface correspondant au JSON envoyé par le script Python
interface BackendMessage {
  entity_id: string;
  state: string;
  date_heure: string;
}

interface ApiResponse {
  data: {
    [entityId: string]: Array<{
      state: string;
      date_heure: string;
    }>;
  };
}

@Injectable({
  providedIn: 'root'
})
export class SensorService {
  private sensorDataSubject = new BehaviorSubject<SensorData>({
    humidity: { value: null, timestamp: null },
    temperature: { value: null, timestamp: null },
    motion: { value: null, timestamp: null }
  });

  public sensorData$: Observable<SensorData> = this.sensorDataSubject.asObservable();

  private ws: WebSocket | null = null;
  private pollingInterval = 2000; // Rafraîchir toutes les 2 secondes

  constructor(private http: HttpClient) {
    this.connect();
    this.startPolling();
  }

  private connect() {
    // Connexion au WebSocket du backend Python
    // Utilise dynamiquement l'hôte actuel (ex: l'IP du serveur) au lieu de 'localhost'
    const host = window.location.hostname; 
    this.ws = new WebSocket(`ws://${host}:8000/ws`);

    this.ws.onopen = () => {
      console.log('Connected to WebSocket');
    };

    this.ws.onmessage = (event) => {
      try {
        const message: BackendMessage = JSON.parse(event.data);
        this.updateSensorData(message);
      } catch (e) {
        console.error('Error parsing WebSocket data', e);
      }
    };

    this.ws.onclose = () => {
      console.log('WebSocket closed, reconnecting...');
      setTimeout(() => this.connect(), 1000);
    };

    this.ws.onerror = (error) => {
      console.error('WebSocket error', error);
    };
  }

  // Met à jour l'état partiel en fonction de l'entity_id reçu
  private updateSensorData(message: BackendMessage) {
    // On copie l'état actuel pour ne pas l'écraser
    const currentData = { ...this.sensorDataSubject.value };
    
    // Parsing de la valeur (le backend envoie souvent des strings)
    const val = message.state; 

    switch (message.entity_id) {
      case 'sensor.esptemp_humidite':
        currentData.humidity = {
          value: parseFloat(val),
          timestamp: message.date_heure
        };
        break;

      case 'sensor.esptemp_temperature':
        currentData.temperature = {
          value: parseFloat(val),
          timestamp: message.date_heure
        };
        break;

      case 'binary_sensor.espir_detection_mouvement':
        // En Home Assistant, 'on' signifie détecté, 'off' non détecté
        currentData.motion = {
          value: val === 'on' || val === 'true', 
          timestamp: message.date_heure
        };
        break;
      
      default:
        console.warn('Unknown entity_id received:', message.entity_id);
        return; // Ne rien faire si l'ID n'est pas reconnu
    }

    // Émettre le nouvel état global
    this.sensorDataSubject.next(currentData);
  }

  getCurrentData(): SensorData {
    return this.sensorDataSubject.value;
  }

  // Récupérer l'historique des capteurs
  getSensorHistory(limit: number = 10) {
    const host = window.location.hostname;
    return this.http.get<ApiResponse>(`http://${host}:8000/api/sensors?limit=${limit}`);
  }

  // Polling HTTP pour récupérer les données toutes les 2 secondes
  private startPolling() {
    const host = window.location.hostname;
    
    console.log('🔄 Démarrage du polling automatique (toutes les 2 secondes)');
    
    // Charger immédiatement les données
    this.fetchSensorData();
    
    // Puis rafraîchir automatiquement
    interval(this.pollingInterval).subscribe(() => {
      this.fetchSensorData();
    });
  }

  private fetchSensorData() {
    const host = window.location.hostname;
    console.log('📡 Récupération des données...', new Date().toLocaleTimeString());
    
    this.http.get<ApiResponse>(`http://${host}:8000/api/sensors`).subscribe({
      next: (response) => {
        console.log('✅ Données reçues:', response);
        
        // Créer un nouvel objet de données
        const updatedData: SensorData = {
          humidity: this.sensorDataSubject.value.humidity,
          temperature: this.sensorDataSubject.value.temperature,
          motion: this.sensorDataSubject.value.motion
        };
        
        // Traiter chaque capteur
        for (const [entityId, values] of Object.entries(response.data)) {
          if (values && values.length > 0) {
            // Prendre la valeur la plus récente (première dans la liste)
            const latest = values[0];
            const val = latest.state;
            
            switch (entityId) {
              case 'sensor.esptemp_humidite':
                updatedData.humidity = {
                  value: parseFloat(val),
                  timestamp: latest.date_heure
                };
                break;
              case 'sensor.esptemp_temperature':
                updatedData.temperature = {
                  value: parseFloat(val),
                  timestamp: latest.date_heure
                };
                break;
              case 'binary_sensor.espir_detection_mouvement':
                updatedData.motion = {
                  value: val === 'on' || val === 'true',
                  timestamp: latest.date_heure
                };
                break;
            }
          }
        }
        
        // Forcer une nouvelle émission pour déclencher la détection de changement Angular
        this.sensorDataSubject.next(updatedData);
      },
      error: (err) => {
        console.error('❌ Erreur lors de la récupération des données:', err);
      }
    });
  }
}