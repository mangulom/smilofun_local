import { Injectable } from '@angular/core';
import Swal, { SweetAlertIcon, SweetAlertOptions } from 'sweetalert2';

export interface DialogOptions {
  title?: string;
  text?: string;
  html?: string;
  confirmText?: string;
  cancelText?: string;
  icon?: SweetAlertIcon;
  danger?: boolean;
}

@Injectable({ providedIn: 'root' })
export class DialogService {
  private readonly base: SweetAlertOptions = {
    buttonsStyling: false,
    customClass: {
      popup: 'smilofun-dialog',
      title: 'smilofun-dialog-title',
      htmlContainer: 'smilofun-dialog-body',
      confirmButton: 'smilofun-dialog-confirm',
      cancelButton: 'smilofun-dialog-cancel',
      denyButton: 'smilofun-dialog-cancel',
      actions: 'smilofun-dialog-actions',
    },
    confirmButtonText: 'Aceptar',
    cancelButtonText: 'Cancelar',
    heightAuto: false,
    reverseButtons: true,
    focusCancel: true,
  };

  private readonly successToast = Swal.mixin({
    toast: true,
    position: 'top-end',
    showConfirmButton: false,
    timer: 3200,
    timerProgressBar: true,
    buttonsStyling: false,
    customClass: { popup: 'smilofun-toast' },
  });

  async confirm(options: DialogOptions): Promise<boolean> {
    const result = await Swal.fire({
      ...this.base,
      title: options.title ?? '¿Confirmas esta acción?',
      text: options.text,
      html: options.html,
      icon: options.icon ?? 'question',
      showCancelButton: true,
      confirmButtonText: options.confirmText ?? 'Confirmar',
      cancelButtonText: options.cancelText ?? 'Cancelar',
      customClass: {
        ...this.base.customClass,
        confirmButton: options.danger ? 'smilofun-dialog-confirm smilofun-dialog-danger' : 'smilofun-dialog-confirm',
      },
    });
    return result.isConfirmed;
  }

  async success(options: DialogOptions): Promise<void> {
    await this.message({ ...options, icon: options.icon ?? 'success' });
  }

  async error(options: DialogOptions): Promise<void> {
    await this.message({ ...options, icon: options.icon ?? 'error' });
  }

  async warning(options: DialogOptions): Promise<void> {
    await this.message({ ...options, icon: options.icon ?? 'warning' });
  }

  async info(options: DialogOptions): Promise<void> {
    await this.message({ ...options, icon: options.icon ?? 'info' });
  }

  toast(options: DialogOptions): void {
    void this.successToast.fire({ title: options.title ?? options.text, icon: options.icon ?? 'info' });
  }

  async apiError(error: unknown, fallback = 'Ocurrió un error inesperado.'): Promise<void> {
    const err = error as { error?: { detail?: unknown; message?: unknown }; message?: unknown };
    const detail = err?.error?.detail ?? err?.error?.message ?? err?.message;
    const message = this.stringifyError(detail) || fallback;
    await this.error({ title: 'No se pudo completar', text: message });
  }

  private async message(options: DialogOptions): Promise<void> {
    await Swal.fire({
      ...this.base,
      title: options.title,
      text: options.text,
      html: options.html,
      icon: options.icon,
      confirmButtonText: options.confirmText ?? 'Entendido',
      showCancelButton: false,
      focusConfirm: true,
    });
  }

  private stringifyError(value: unknown): string {
    if (typeof value === 'string') return value;
    if (Array.isArray(value)) {
      return value.map((item) => {
        if (typeof item === 'string') return item;
        const loc = Array.isArray(item?.loc) ? `${item.loc.join(' → ')}: ` : '';
        return `${loc}${item?.msg ?? item?.message ?? JSON.stringify(item)}`;
      }).join('\n');
    }
    if (value && typeof value === 'object') {
      const record = value as { msg?: unknown; message?: unknown; detail?: unknown };
      return this.stringifyError(record.detail ?? record.msg ?? record.message ?? JSON.stringify(value));
    }
    return '';
  }
}
