import { Component, signal, OnInit, OnDestroy, ViewChild, ElementRef } from "@angular/core";
import { CommonModule } from "@angular/common";
import { SensorService } from "../../sensor.service";
import { Subscription } from "rxjs";
import { Chart, registerables } from "chart.js";

Chart.register(...registerables);

@Component({
  selector: "app-temperature",
  standalone: true,
  imports: [CommonModule],
  templateUrl: "./temperature.component.html",
  styleUrl: "./temperature.component.css"
})
export class TemperatureComponent implements OnInit, OnDestroy {
  @ViewChild("chartCanvas") chartCanvas!: ElementRef;
  
  temperatureCurrent = signal<number | null>(null);
  temperatureLogs = signal<Array<{time: string, value: number}>>([]);
  showTemperatureLogs = signal(false);
  showTemperatureChart = signal(false);
  lastUpdate = signal<string>("Chargement...");
  private subscription: Subscription = new Subscription();
  private chart: Chart | null = null;

  constructor(private sensorService: SensorService) {}

  ngOnInit() {
    this.subscription = this.sensorService.sensorData$.subscribe(data => {
      const oldValue = this.temperatureCurrent();
      const newValue = data.temperature.value !== null ? Math.round(data.temperature.value) : null;
      this.temperatureCurrent.set(newValue);
      this.lastUpdate.set(new Date().toLocaleTimeString());
      if (oldValue !== null && oldValue !== newValue && newValue !== null) {
        const now = new Date().toLocaleTimeString("fr-FR");
        this.temperatureLogs.update(logs => [...logs, {time: now, value: newValue}]);
        if (this.showTemperatureChart() && this.chart) {
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

  getTemperatureLogs() {
    this.showTemperatureLogs.set(!this.showTemperatureLogs());
    if (this.showTemperatureLogs() && this.temperatureLogs().length === 0) {
      this.sensorService.getSensorHistory(10).subscribe({
        next: (response) => {
          const logs = response.data["sensor.esptemp_temperature"] || [];
          this.temperatureLogs.set(
            logs.map((log: any) => ({
              time: log.date_heure ? new Date(log.date_heure).toLocaleString("fr-FR") : "N/A",
              value: Math.round(parseFloat(log.state))
            }))
          );
        },
        error: (err) => {
          console.error("Erreur lors de la récupération de l'historique température:", err);
        }
      });
    }
  }

  toggleTemperatureChart() {
    this.showTemperatureChart.set(!this.showTemperatureChart());
    if (this.showTemperatureChart()) {
      if (this.temperatureLogs().length === 0) {
        this.sensorService.getSensorHistory(20).subscribe({
          next: (response) => {
            const logs = response.data["sensor.esptemp_temperature"] || [];
            this.temperatureLogs.set(
              logs.map((log: any) => ({
                time: log.date_heure ? new Date(log.date_heure).toLocaleString("fr-FR") : "N/A",
                value: Math.round(parseFloat(log.state))
              }))
            );
            setTimeout(() => this.createChart(), 100);
          },
          error: (err) => {
            console.error("Erreur lors de la récupération du graphique température:", err);
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

    const logs = this.temperatureLogs();
    const labels = logs.map(l => l.time).reverse();
    const data = logs.map(l => l.value).reverse();

    this.chart = new Chart(canvas, {
      type: "line",
      data: {
        labels: labels,
        datasets: [{
          label: "Température (°C)",
          data: data,
          borderColor: "#ff6b6b",
          backgroundColor: "rgba(255, 107, 107, 0.1)",
          tension: 0.1,
          fill: true
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            display: true,
            position: "top"
          }
        },
        scales: {
          y: {
            beginAtZero: false,
            title: {
              display: true,
              text: "Température (°C)"
            }
          }
        }
      }
    });
  }

  private updateChart() {
    if (!this.chart) return;

    const logs = this.temperatureLogs();
    this.chart.data.labels = logs.map(l => l.time).reverse();
    this.chart.data.datasets[0].data = logs.map(l => l.value).reverse();
    this.chart.update();
  }

  getBackgroundColor(): string {
    const temp = this.temperatureCurrent();
    if (temp === null) return "#CCCCCC";
    if (temp < 15) return "#0099ff";
    if (temp < 20) return "#00ff00";
    if (temp < 25) return "#ffff00";
    if (temp < 30) return "#ff9900";
    return "#ff0000";
  }
}
