import { NgModule } from '@angular/core';
import { PreloadAllModules, RouterModule, Routes } from '@angular/router';

const routes: Routes = [
  {
    path: 'home',
    loadChildren: () => import('./home/home.module').then(m => m.HomePageModule)
  },
  {
    path: 'space-edit',
    loadComponent: () => import('./space-edit/space-edit.component').then(m => m.SpaceEditComponent)
  },
  {
    path: 'space-edit/:key',
    loadComponent: () => import('./space-edit/space-detail/space-detail.component').then(m => m.SpaceDetailComponent)
  },
  {
    path: 'space-edit/:key/permissions',
    loadComponent: () => import('./space-edit/space-permissions/space-permissions.component').then(m => m.SpacePermissionsComponent)
  },
  {
    path: 'apply-template',
    loadComponent: () => import('./apply-template/apply-template.component').then(m => m.ApplyTemplateComponent)
  },
  {
    path: '',
    redirectTo: 'home',
    pathMatch: 'full'
  },
];

@NgModule({
  imports: [
    RouterModule.forRoot(routes, { preloadingStrategy: PreloadAllModules })
  ],
  exports: [RouterModule]
})
export class AppRoutingModule { }
