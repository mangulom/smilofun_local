import { Routes } from '@angular/router';
import { authGuard } from './core/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./pages/login/login.component').then((m) => m.LoginComponent),
  },
  {
    path: '',
    loadComponent: () =>
      import('./layout/layout.component').then((m) => m.LayoutComponent),
    canActivate: [authGuard],
    children: [
      { path: '', pathMatch: 'full', redirectTo: 'dashboard' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./pages/dashboard/dashboard.component').then((m) => m.DashboardComponent),
      },
      {
        path: 'pacientes',
        loadComponent: () =>
          import('./pages/pacientes/pacientes.component').then((m) => m.PacientesComponent),
      },
      {
        path: 'pacientes/:id',
        loadComponent: () =>
          import('./pages/pacientes/paciente-detalle.component').then(
            (m) => m.PacienteDetalleComponent
          ),
      },
      {
        path: 'citas',
        loadComponent: () =>
          import('./pages/citas/citas.component').then((m) => m.CitasComponent),
      },
      {
        path: 'doctores',
        loadComponent: () =>
          import('./pages/doctores/doctores.component').then((m) => m.DoctoresComponent),
      },
      {
        path: 'tratamientos',
        loadComponent: () =>
          import('./pages/tratamientos/tratamientos.component').then(
            (m) => m.TratamientosComponent
          ),
      },
      {
        path: 'facturacion',
        loadComponent: () =>
          import('./pages/facturacion/facturacion.component').then(
            (m) => m.FacturacionComponent
          ),
      },
      {
        path: 'inventario',
        loadComponent: () =>
          import('./pages/inventario/inventario.component').then((m) => m.InventarioComponent),
      },
      {
        path: 'inventario/proveedores',
        loadComponent: () => import('./pages/inventario/proveedores.component').then((m) => m.ProveedoresComponent),
      },
      {
        path: 'inventario/compras',
        loadComponent: () => import('./pages/inventario/compras.component').then((m) => m.ComprasComponent),
      },
      {
        path: 'reportes',
        loadComponent: () =>
          import('./pages/reportes/reportes.component').then((m) => m.ReportesComponent),
      },
      {
        path: 'campanas',
        loadComponent: () => import('./pages/campanas/campanas.component').then((m) => m.CampanasComponent),
      },
      {
        path: 'ia/asistente',
        loadComponent: () =>
          import('./pages/ia/asistente.component').then((m) => m.IaAsistenteComponent),
      },
      {
        path: 'ia/no-show',
        loadComponent: () =>
          import('./pages/ia/no-show.component').then((m) => m.IaNoShowComponent),
      },
      {
        path: 'ia/ingresos',
        loadComponent: () =>
          import('./pages/ia/ingresos.component').then((m) => m.IaIngresosComponent),
      },
      {
        path: 'ia/pacientes',
        loadComponent: () =>
          import('./pages/ia/pacientes.component').then((m) => m.IaPacientesComponent),
      },
      {
        path: 'ia/inventario',
        loadComponent: () =>
          import('./pages/ia/inventario.component').then((m) => m.IaInventarioComponent),
      },
      {
        path: 'ia/agenda',
        loadComponent: () =>
          import('./pages/ia/agenda.component').then((m) => m.IaAgendaComponent),
      },
      {
        path: 'ia/historial',
        loadComponent: () =>
          import('./pages/ia/historial.component').then((m) => m.IaHistorialComponent),
      },
      {
        path: 'ia',
        loadComponent: () =>
          import('./pages/ia/ia.component').then((m) => m.IaComponent),
      },
      {
        path: 'diseno3d/catalogo',
        loadComponent: () =>
          import('./pages/diseno3d/catalogo.component').then(
            (m) => m.Diseno3DCatalogoComponent
          ),
      },
      {
        path: 'diseno3d/historial',
        loadComponent: () =>
          import('./pages/diseno3d/historial.component').then(
            (m) => m.Diseno3DHistorialComponent
          ),
      },
      {
        path: 'diseno3d',
        loadComponent: () =>
          import('./pages/diseno3d/diseno3d.component').then((m) => m.Diseno3DComponent),
      },
      {
        path: 'mantenimiento/respaldo',
        data: { modo: 'respaldo' },
        loadComponent: () =>
          import('./pages/respaldos/respaldos.component').then((m) => m.RespaldosComponent),
      },
      {
        path: 'mantenimiento/restaurar',
        data: { modo: 'restaurar' },
        loadComponent: () =>
          import('./pages/respaldos/respaldos.component').then((m) => m.RespaldosComponent),
      },
      {
        path: 'configuracion',
        loadComponent: () =>
          import('./pages/configuracion/configuracion.component').then(
            (m) => m.ConfiguracionComponent
          ),
      },
      {
        path: 'empresas',
        loadComponent: () =>
          import('./pages/empresas/empresas.component').then((m) => m.EmpresasComponent),
      },
      {
        path: 'usuarios',
        loadComponent: () =>
          import('./pages/usuarios/usuarios.component').then((m) => m.UsuariosComponent),
      },
      {
        path: 'contacto',
        loadComponent: () =>
          import('./pages/contacto/contacto.component').then((m) => m.ContactoComponent),
      },
    ],
  },
  { path: '**', redirectTo: 'dashboard' },
];
