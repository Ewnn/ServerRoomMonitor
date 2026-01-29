import { Component, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HumidityComponent } from './components/humidity/humidity.component';
import { TemperatureComponent } from './components/temperature/temperature.component';
import { MotionComponent } from './components/motion/motion.component';

@Component({
  selector: 'app-root',
  imports: [CommonModule, HumidityComponent, TemperatureComponent, MotionComponent],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('JYEG Solution');
}
