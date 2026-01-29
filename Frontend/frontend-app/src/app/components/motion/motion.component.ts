import { Component, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SensorService } from '../../sensor.service';
import { Subscription } from 'rxjs';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-motion',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './motion.component.html',
  styleUrl: './motion.component.css'
})
export class MotionComponent implements OnInit, OnDestroy {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef;

  motionCurrent = signal<boolean | null>(null);
  motionLogs = signal<Array<{time: string, detected: boolean}>>([]);
  showMotionLogs = signal(false);
  showMotionChart = signal(false);
  lastUpdate = signal<string>('Chargement...');
  private subscription: Subscription = new Subscription();
  private chart: Chart | null = null;

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
        // Mettre à jour le graphique si visible
        if (this.showMotionChart() && this.chart) {
          this.updateChart();
        }
      }
    });
  }

  ngOnDestroy() {
    this.subscription.unsubscribe();
    if (this.chart) {
      this.chart.destroy();
    }
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

  toggleMotionChart() {
    this.showMotionChart.set(!this.showMotionChart());
    if (this.showMotionChart()) {
      // Récupérer les logs si vides
      if (this.motionLogs().length === 0) {
        this.sensorService.getSensorHistory(20).subscribe({
          next: (response) => {
            const logs = response.data['binary_sensor.espir_detection_mouvement'] || [];
            this.motionLogs.set(
              logs.map((log: any) => ({
                time: log.date_heure ? new Date(log.date_heure).toLocaleString('fr-FR') : 'N/A',
                detected: log.state === 'on' || log.state === 'true'
              }))
            );
            // Créer le graphique après avoir les données
            setTimeout(() => this.createChart(), 100);
          }
        });
      } else {
        setTimeout(() => this.createChart(), 100);
      }
    } else if (this.chart) {
      this.chart.destroy();
      this.chart = null;
    }
  }

  private createChart() {
    if (this.chart) {
      this.chart.destroy();
    }

    const canvas = this.chartCanvas?.nativeElement;
    if (!canvas) return;

    const logs = this.motionLogs();
    const labels = logs.map(l => l.time).reverse();
    const data = logs.map(l => l.detected ? 1 : 0).reverse();

    this.chart = new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Mouvement détecté',
          data: data,
          backgroundColor: data.map(val => val === 1 ? '#FF0000' : '#00FF00'),
          borderColor: data.map(val => val === 1 ? '#CC0000' : '#00CC00'),
          borderWidth: 1
        }]
      },
      options: {
        indexAxis: 'y',
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          x: {
            beginAtZero: true,
            max: 1,
            ticks: {
              callback: function(value) {
                return value === 1 ? 'Détecté' : 'Non détecté';
              }
            }
          }
        }
      }
    });
  }

  private updateChart() {
    if (!this.chart) return;

    const logs = this.motionLogs();
    this.chart.data.labels = logs.map(l => l.time).reverse();
    const data = logs.map(l => l.detected ? 1 : 0).reverse();
    this.chart.data.datasets[0].data = data;
    this.chart.data.datasets[0].backgroundColor = data.map(val => val === 1 ? '#FF0000' : '#00FF00');
    this.chart.update();
  }

  getBackgroundColor(): string {
    const motion = this.motionCurrent();
    if (motion === null) return '#2F2F2F';
    return motion ? '#FF0000' : '#00FF00'; // Red if motion, green if no
  }
}
