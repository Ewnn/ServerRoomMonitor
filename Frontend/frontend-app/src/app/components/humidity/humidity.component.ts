import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SensorService } from '../../sensor.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-humidity',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './humidity.component.html',
  styleUrl: './humidity.component.css'
})
export class HumidityComponent implements OnInit, OnDestroy {
  humidityCurrent = signal<number | null>(null);
  humidityLogs = signal<Array<{time: string, value: number}>>([]);
  showHumidityLogs = signal(false);
  lastUpdate = signal<string>('Chargement...');
  private subscription: Subscription = new Subscription();

  constructor(private sensorService: SensorService) {}

  ngOnInit() {
    this.subscription = this.sensorService.sensorData$.subscribe((data: any) => {
      const oldValue = this.humidityCurrent();
      const newValue = data.humidity.value;
      this.humidityCurrent.set(newValue);
      this.lastUpdate.set(new Date().toLocaleTimeString());

      // Noter le changement
      if (oldValue !== null && oldValue !== newValue && newValue !== null) {
        const now = new Date().toLocaleTimeString('fr-FR');
        this.humidityLogs.update((logs: Array<{time: string, value: number}>) => [...logs, {time: now, value: newValue}]);
      }
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  getHumidityLogs() {
    this.showHumidityLogs.set(!this.showHumidityLogs());
    if (this.showHumidityLogs() && this.humidityLogs().length === 0) {
      // Récupérer les logs depuis le backend
      this.sensorService.getSensorHistory(10).subscribe({
        next: (response) => {
          const logs = response.data['sensor.esptemp_humidite'] || [];
          this.humidityLogs.set(
            logs.map((log: any) => ({
              time: log.date_heure ? new Date(log.date_heure).toLocaleString('fr-FR') : 'N/A',
              value: parseFloat(log.state)
            }))
          );
        },
        error: (err) => {
          console.error('Erreur lors de la récupération de l\'historique humidité:', err);
        }
      });
    }
  }

  getBackgroundColor(): string {
    const hum = this.humidityCurrent();
    if (hum === null) return '#2F2F2F';
    if (hum < 30 || hum > 70) return '#FF0000'; // Red
    if (hum < 40 || hum > 60) return '#FFA500'; // Orange
    return '#00FF00'; // Green
  }
}