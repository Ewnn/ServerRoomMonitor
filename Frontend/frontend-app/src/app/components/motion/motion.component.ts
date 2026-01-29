import { Component, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SensorService } from '../../sensor.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-motion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './motion.component.html',
  styleUrl: './motion.component.css'
})
export class MotionComponent implements OnInit, OnDestroy {
  motionCurrent = signal<boolean | null>(null);
  motionLogs = signal<Array<{time: string, detected: boolean}>>([]);
  showMotionLogs = signal(false);
  lastUpdate = signal<string>('Chargement...');
  private subscription: Subscription = new Subscription();

  constructor(private sensorService: SensorService) {}

  ngOnInit() {
    this.subscription = this.sensorService.sensorData$.subscribe(data => {
      const oldValue = this.motionCurrent();
      const newValue = data.motion.value;
      this.motionCurrent.set(newValue);
      this.lastUpdate.set(new Date().toLocaleTimeString());

      // Noter le changement
      if (oldValue !== null && oldValue !== newValue && newValue !== null) {
        const now = new Date().toLocaleTimeString('fr-FR');
        this.motionLogs.update(logs => [...logs, {time: now, detected: newValue}]);
      }
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
  }

  getMotionLogs() {
    this.showMotionLogs.set(!this.showMotionLogs());
    if (this.showMotionLogs() && this.motionLogs().length === 0) {
      // Récupérer les logs depuis le backend
      this.sensorService.getSensorHistory(10).subscribe({
        next: (response) => {
          const logs = response.data['binary_sensor.espir_detection_mouvement'] || [];
          this.motionLogs.set(
            logs.map((log: any) => ({
              time: log.date_heure ? new Date(log.date_heure).toLocaleString('fr-FR') : 'N/A',
              detected: log.state === 'on' || log.state === 'true'
            }))
          );
        },
        error: (err) => {
          console.error('Erreur lors de la récupération de l\'historique mouvement:', err);
        }
      });
    }
  }

  getBackgroundColor(): string {
    const motion = this.motionCurrent();
    if (motion === null) return '#2F2F2F';
    return motion ? '#FF0000' : '#00FF00'; // Red if motion, green if no
  }
}