import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SensorService } from '../../sensor.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-temperature',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './temperature.component.html',
  styleUrl: './temperature.component.css'
})
export class TemperatureComponent implements OnInit, OnDestroy {
  temperatureCurrent = signal<number | null>(null);
  temperatureLogs = signal<Array<{time: string, value: number}>>([]);
  showTemperatureLogs = signal(false);
  lastUpdate = signal<string>('Chargement...');
  private subscription: Subscription = new Subscription();

  constructor(private sensorService: SensorService) {}

  ngOnInit() {
    this.subscription = this.sensorService.sensorData$.subscribe(data => {
      const oldValue = this.temperatureCurrent();
      const newValue = data.temperature.value !== null ? Math.round(data.temperature.value) : null;
      this.temperatureCurrent.set(newValue);
      this.lastUpdate.set(new Date().toLocaleTimeString());
      // Noter le changement
      if (oldValue !== null && oldValue !== newValue && newValue !== null) {
        const now = new Date().toLocaleTimeString('fr-FR');
        this.temperatureLogs.update(logs => [...logs, {time: now, value: newValue}]);
      }
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  getTemperatureLogs() {
    this.showTemperatureLogs.set(!this.showTemperatureLogs());
    if (this.showTemperatureLogs() && this.temperatureLogs().length === 0) {
      // Récupérer les logs depuis le backend
      this.sensorService.getSensorHistory(10).subscribe({
        next: (response) => {
          const logs = response.data['sensor.esptemp_temperature'] || [];
          this.temperatureLogs.set(
            logs.map((log: any) => ({
              time: log.date_heure ? new Date(log.date_heure).toLocaleString('fr-FR') : 'N/A',
              value: Math.round(parseFloat(log.state))
            }))
          );
        },
        error: (err) => {
          console.error('Erreur lors de la récupération de l\'historique température:', err);
        }
      });
    }
  }

  getBackgroundColor(): string {
    const temp = this.temperatureCurrent();
    if (temp === null) return '#2F2F2F';
    if (temp < 18 || temp > 30) return '#FF0000'; // Red
    if (temp >= 25) return '#FFA500'; // Orange
    return '#00FF00'; // Green
  }
}