import { Injectable, computed, signal } from '@angular/core';

interface LoadingState { id: number; message: string; }

@Injectable({ providedIn: 'root' })
export class LoadingService {
  private nextId = 1;
  private readonly tasks = signal<LoadingState[]>([]);
  readonly active = computed(() => this.tasks().length > 0);
  readonly message = computed(() => this.tasks().at(-1)?.message ?? 'CARGANDO');

  async track<T>(message: string, operation: Promise<T>): Promise<T> {
    const id = this.show(message);
    try { return await operation; }
    finally { this.hide(id); }
  }

  show(message = 'CARGANDO'): number {
    const id = this.nextId++;
    this.tasks.update(list => [...list, { id, message: this.normalize(message) }]);
    return id;
  }

  hide(id?: number): void {
    this.tasks.update(list => id === undefined ? list.slice(0, -1) : list.filter(task => task.id !== id));
  }

  clear(): void { this.tasks.set([]); }

  private normalize(message: string): string { return message.trim().toLocaleUpperCase('es') || 'CARGANDO'; }
}
