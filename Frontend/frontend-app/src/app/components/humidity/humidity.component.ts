import { Component, signal, OnInit, OnDestroy, ViewChild, ElementRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { SensorService } from '../../sensor.service';
import { Subscription } from 'rxjs';
import { Chart, registerables } from 'chart.js';

Chart.register(...registerables);

@Component({
  selector: 'app-humidity',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './humidity.component.html',
  styleUrl: './humidity.component.css'
})
export class HumidityComponent implements OnInit, OnDestroy {
  @ViewChild('chartCanvas') chartCanvas!: ElementRef;

  humidityCurrent = signal<number | null>(null);
  humidityLogs = signal<Array<{time: string, value: number}>>([]);
  showHumidityLogs = signal(false);
  showHumidityChart = signal(false);
  lastUpdate = signal<string>('Chargement...');
  private subscription: Subscription = new Subscription();
  private chart: Chart | null = null;

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
        // Mettre à jour le graphique si visible
        if (this.showHumidityChart() && this.chart) {
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

  toggleHumidityChart() {
    this.showHumidityChart.set(!this.showHumidityChart());
    if (this.showHumidityChart()) {
      // Récupérer les logs si vides
      if (this.humidityLogs().length === 0) {
        this.sensorService.getSensorHistory(20).subscribe({
          next: (response) => {
            const logs = response.data['sensor.esptemp_humidite'] || [];
            this.humidityLogs.set(
              logs.map((log: any) => ({
                time: log.date_heure ? new Date(log.date_heure).toLocaleString('fr-FR') : 'N/A',
                value: parseFloat(log.state)
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

    const logs = this.humidityLogs();
    const labels = logs.map(l => l.time).reverse();
    const data = logs.map(l => l.value).reverse();

    this.chart = new Chart(canvas, {
      type: 'line',
      data: {
        labels: labels,
        datasets: [{
          label: 'Humidité (%)',
          data: data,
          borderColor: '#4ecdc4',
          backgroundColor: 'rgba(78, 205, 196, 0.1)',
          tension: 0.1,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: 'top'
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            max: 100,
            title: {
              display: true,
              text: 'Humidité (%)'
            }
          }
        }
      }
    });
  }

  private updateChart() {
    if (!this.chart) return;

    const logs = this.humidityLogs();
    this.chart.data.labels = logs.map(l => l.time).reverse();
    this.chart.data.datasets[0].data = logs.map(l => l.value).reverse();
    this.chart.update();
  }

  getBackgroundColor(): string {
    const hum = this.humidityCurrent();
    if (hum === null) return '#2F2F2F';
    if (hum < 30 || hum > 70) return '#FF0000'; // Red
    if (hum < 40 || hum > 60) return '#FFA500'; // Orange
    return '#00FF00'; // Green
  }
}
