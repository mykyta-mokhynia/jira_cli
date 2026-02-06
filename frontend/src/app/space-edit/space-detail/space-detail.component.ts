import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { PeopleAuditComponent } from './people-audit/people-audit.component';

interface SchemeRef {
  id: string | number;
  name: string;
  description?: string;
}

interface ProjectWorkConfig {
  project: {
    key: string;
    name: string;
  };
  permissions: {
    permissionScheme: SchemeRef;
    securityScheme: SchemeRef | null;
    isStandard?: boolean;
    diffCount?: number;
  };
  types: {
    issueTypeScheme: SchemeRef & { issueTypes?: any[] };
  };
  screens: {
    screenScheme: SchemeRef & { screens?: any };
  };
  fields: {
    fieldConfigScheme: SchemeRef;
    fieldConfigurationIds?: any[];
  };
}

@Component({
  selector: 'app-space-detail',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar class="config-toolbar">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/space-edit" color="dark"></ion-back-button>
        </ion-buttons>
        <div class="header-info">
          <div class="header-title" *ngIf="config">{{ config.project.name }} ({{ config.project.key }})</div>
          <div class="header-title" *ngIf="!config">{{ projectKey }}</div>
          <div class="header-subtitle">Configuration</div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="config-content">
      <div *ngIf="loading" class="ion-text-center ion-padding">
        <ion-spinner></ion-spinner>
        <p>Loading configuration...</p>
      </div>

      <div *ngIf="!loading && config" class="config-layout">
        <section class="config-section">
          <h2 class="section-title">Work Types & Permissions</h2>
          <ion-card class="config-card">
            <ion-list lines="full">
            <!-- Permissions Group -->
            <ion-item-divider class="light-divider">
              <ion-label>Permissions & Security</ion-label>
            </ion-item-divider>
            
            <ion-item button [routerLink]="['/space-edit', projectKey, 'permissions']" detail="true">
              <ion-label>
                <h3>Permission Scheme</h3>
                <p class="scheme-name" [class.warning]="!config.permissions.isStandard || !config.permissions.permissionScheme">
                  {{ config.permissions.permissionScheme?.name || 'Default' }}
                  <ion-icon *ngIf="!config.permissions.permissionScheme" name="alert-circle-outline" color="warning" title="Missing Scheme"></ion-icon>
                  <ion-icon *ngIf="config.permissions.permissionScheme && !config.permissions.isStandard" name="flag-outline" color="medium" title="Non-standard Scheme"></ion-icon>
                </p>
                <p *ngIf="config.permissions.permissionScheme && !config.permissions.isStandard" class="sub-info warning-text">
                  <ion-icon name="alert-circle-outline" style="vertical-align: text-bottom; margin-right: 4px;"></ion-icon>
                  Differs from Standard ({{ config.permissions.diffCount }} changes)
                </p>
              </ion-label>
            </ion-item>

            <ion-item button [routerLink]="['/space-edit', projectKey, 'security']" detail="true">
              <ion-label>
                <h3>Security Scheme</h3>
                <p class="scheme-name" [class.warning]="!config.permissions.securityScheme">
                  {{ config.permissions.securityScheme?.name || 'None' }}
                  <ion-icon *ngIf="!config.permissions.securityScheme" name="warning-outline" color="warning"></ion-icon>
                </p>
              </ion-label>
            </ion-item>

            <!-- Work Types Group -->
            <ion-item-divider class="light-divider">
              <ion-label>Work Types</ion-label>
            </ion-item-divider>

            <ion-item button [routerLink]="['/space-edit', projectKey, 'types']" detail="true">
              <ion-label>
                <h3>Issue Type Scheme</h3>
                <p class="scheme-name">{{ config.types.issueTypeScheme?.name || 'Default' }}</p>
                <p color="medium" class="sub-info" *ngIf="config.types.issueTypeScheme?.issueTypes?.length as count">
                  {{ count }} issue types
                </p>
              </ion-label>
            </ion-item>

            <!-- Screens Group -->
            <ion-item-divider class="light-divider">
              <ion-label>Screens</ion-label>
            </ion-item-divider>

            <ion-item button [routerLink]="['/space-edit', projectKey, 'screens']" detail="true">
              <ion-label>
                <h3>Screen Scheme</h3>
                <p class="scheme-name">{{ config.screens.screenScheme?.name || 'Default' }}</p>
              </ion-label>
              <div slot="end" class="screen-icons">
                 <ion-badge color="light" class="ion-margin-end">Edit</ion-badge>
                 <ion-badge color="light" class="ion-margin-end">Create</ion-badge>
                 <ion-badge color="light">View</ion-badge>
              </div>
            </ion-item>

            <!-- Fields Group -->
            <ion-item-divider class="light-divider">
              <ion-label>Fields</ion-label>
            </ion-item-divider>

            <ion-item button [routerLink]="['/space-edit', projectKey, 'fields']" detail="true">
              <ion-label>
                <h3>Field Config Scheme</h3>
                <p class="scheme-name">{{ config.fields.fieldConfigScheme?.name || 'Default' }}</p>
                <p color="medium" class="sub-info" *ngIf="config.fields.fieldConfigurationIds?.length as count">
                  {{ count }} configurations
                </p>
              </ion-label>
            </ion-item>

            </ion-list>
          </ion-card>
        </section>

        <!-- People Audit (Restored) -->
        <section class="config-section">
          <h2 class="section-title">People</h2>
          <app-people-audit [projectKey]="projectKey"></app-people-audit>
        </section>

        <!-- Automations (Restored) -->
        <section class="config-section">
          <h2 class="section-title">Automations</h2>
          <ion-card color="light" class="config-card danger-card">
            <ion-card-content>
              <p class="muted-text ion-margin-bottom">Dangerous actions that affect all issues in this project.</p>
              <ion-button expand="block" color="danger" (click)="clearSecurityLevels()" [disabled]="isClearingSecurity">
                <ion-icon name="shield-outline" slot="start"></ion-icon>
                {{ isClearingSecurity ? 'Clearing Security Levels...' : 'Clear All Security Levels' }}
              </ion-button>
            </ion-card-content>
          </ion-card>
        </section>
      </div>
    </ion-content>
  `,
  styles: [`
    :host {
      --header-height: 60px;
      --page-bg: #f9f9fb;
    }
    .config-toolbar {
      --background: #ffffff;
      border-bottom: 1px solid #e0e0e0;
      height: var(--header-height);
    }
    .config-toolbar ion-back-button {
      --color: #111;
      color: #111;
    }
    .config-toolbar ion-back-button::part(native),
    .config-toolbar ion-back-button::part(icon) {
      color: #111;
    }
    .header-info {
      display: flex;
      flex-direction: column;
      gap: 2px;
      margin-left: 6px;
    }
    .header-title {
      font-weight: 600;
      color: #222;
      font-size: 1rem;
    }
    .header-subtitle {
      color: #666;
      font-size: 0.85rem;
    }
    .config-content {
      --background: var(--page-bg);
    }
    .config-layout {
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px 24px 40px;
    }
    .config-section {
      margin-bottom: 28px;
    }
    .section-title {
      font-size: 1.2rem;
      font-weight: 600;
      margin: 0 0 12px;
      color: #333;
      border-bottom: 2px solid #333;
      padding-bottom: 8px;
    }
    .config-card {
      margin: 0;
      border: 1px solid #e0e0e0;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
    }
    ion-card {
      --background: #fff;
      border: 1px solid #e0e0e0;
      box-shadow: 0 2px 4px rgba(0, 0, 0, 0.02);
    }
    .danger-card {
      border-color: #f3d7d7;
      background: #fff5f5;
    }
    .muted-text {
      color: #666;
      font-size: 0.9rem;
    }
    .scheme-name {
      font-weight: 600;
      font-size: 1.1em;
      margin-top: 4px;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .scheme-name.warning {
      color: var(--ion-color-warning-shade);
    }
    .warning-text {
      color: var(--ion-color-warning-shade);
      font-weight: 500;
      opacity: 0.9;
    }
    .sub-info {
      font-size: 0.9em;
      margin-top: 2px;
    }
    ion-list {
      padding-top: 0;
      padding-bottom: 0;
    }
    ion-item-divider,
    .light-divider {
      margin-top: 0;
    }
    /* Compact view adjustments */
    h3 {
      font-size: 0.9em;
      color: var(--ion-color-medium);
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin-bottom: 4px;
    }
    .screen-icons {
      display: flex;
      align-items: center;
    }
    ion-item-divider,
    .light-divider {
      --background: #f5f5f7;
      font-weight: 600;
      --color: #333;
    }
    ion-item-divider::part(native),
    .light-divider::part(native) {
      color: #333;
      background: #f5f5f7;
      border-color: #e0e0e0;
    }
    ion-item-divider ion-label,
    .light-divider ion-label {
      color: #333;
    }
    ion-item-divider .item-divider-inner,
    ion-item-divider .item-divider-wrapper,
    .light-divider .item-divider-inner,
    .light-divider .item-divider-wrapper {
      color: #333;
    }
    ::ng-deep ion-item-divider,
    ::ng-deep .light-divider {
      --color: #333 !important;
      color: #333 !important;
    }
    ::ng-deep ion-item-divider::part(native),
    ::ng-deep .light-divider::part(native) {
      color: #333 !important;
      background: #f5f5f7 !important;
      border-color: #e0e0e0 !important;
    }
    ::ng-deep ion-item-divider ion-label,
    ::ng-deep ion-item-divider .item-divider-inner,
    ::ng-deep ion-item-divider .item-divider-wrapper,
    ::ng-deep .light-divider ion-label,
    ::ng-deep .light-divider .item-divider-inner,
    ::ng-deep .light-divider .item-divider-wrapper {
      color: #333 !important;
    }
    ion-item {
      --background: #fff;
      --color: #222;
      --border-color: #e6e6e6;
    }
    ion-item::part(native) {
      color: #222;
      background: #fff;
      border-color: #e6e6e6;
    }
    ion-item h3,
    ion-item p,
    ion-item ion-label {
      color: #222;
    }
    ion-item p {
      color: #666;
    }
    ion-badge {
      color: #333;
    }
    ion-badge.ion-color-light {
      --color: #333;
      color: #333;
      background: #f0f0f0;
    }
    ion-icon {
      color: #666;
    }
    ion-icon svg,
    ion-icon svg path {
      stroke: #666;
    }
  `],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, PeopleAuditComponent]
})
export class SpaceDetailComponent implements OnInit {
  projectKey: string = '';
  config: ProjectWorkConfig | null = null;
  loading = true;
  isClearingSecurity = false;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient
  ) { }

  ngOnInit() {
    this.projectKey = this.route.snapshot.paramMap.get('key') || '';
    if (this.projectKey) {
      this.fetchData();
    }
  }

  fetchData() {
    this.http.get<ProjectWorkConfig>(`/api/project/${this.projectKey}/config-schemes`)
      .subscribe({
        next: (data) => {
          this.config = data;
          this.loading = false;
        },
        error: (err) => {
          console.error('Error fetching project config', err);
          this.loading = false;
        }
      });
  }

  async clearSecurityLevels() {
    if (!confirm('Are you absolutely sure you want to remove Security Levels from ALL issues in this project? This cannot be easily undone.')) {
      return;
    }

    this.isClearingSecurity = true;
    this.http.post<any>(`/api/project/${this.projectKey}/clear-security`, {}).subscribe({
      next: (res) => {
        this.isClearingSecurity = false;
        console.log('Bulk clear result:', res);
        alert(`Finished! Total found: ${res.total}. Cleared: ${res.cleared}. Errors: ${res.errors.length}`);
      },
      error: (err) => {
        this.isClearingSecurity = false;
        console.error('Failed to clear security levels. Server error details:', err.error || err);
        alert(`Action failed: ${err.error?.error || err.message || 'Unknown error'}`);
      }
    });
  }
}
