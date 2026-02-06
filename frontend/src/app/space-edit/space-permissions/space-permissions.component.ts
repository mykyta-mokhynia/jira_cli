import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';

interface Grant {
  type: string;
  parameter: string;
  display: string;
}

interface PermissionDiff {
  key: string;
  name: string;
  description: string;
  type: string;
  category: string;
  currentGrants: Grant[];
  blankGrants: Grant[];
  isDifferent: boolean;
}

interface DiffResponse {
  project: { key: string; name: string };
  schemeName: string;
  diffs: PermissionDiff[];
}

interface AuditSection {
  id: string;
  title: string;
  items: PermissionDiff[];
  differentCount: number;
}

interface SummaryStats {
  total: number;
  deviations: number;
  critical: number;
  criticalItems: PermissionDiff[];
}

@Component({
  selector: 'app-space-permissions',
  template: `
    <ion-header class="ion-no-border">
      <ion-toolbar class="audit-toolbar">
        <ion-buttons slot="start">
          <ion-back-button [defaultHref]="'/space-edit/' + projectKey" color="dark"></ion-back-button>
        </ion-buttons>
        <div class="header-info" *ngIf="data">
            <div class="space-info">
                <span class="label">Space:</span> <span class="value">{{ data.project.name }} ({{ data.project.key }})</span>
                <span class="separator">|</span>
                <span class="label">Permission Scheme:</span> <span class="value">{{ data.schemeName }}</span>
            </div>
            <div class="comparison-info">
                <span class="label">Compared to corporate standard:</span> <span class="badge-blank">.Blank</span>
            </div>
        </div>
      </ion-toolbar>
    </ion-header>

    <ion-content class="audit-content">
      <ion-toast
        [isOpen]="toastOpen"
        [message]="toastMessage"
        [color]="toastColor"
        [duration]="3500"
        (didDismiss)="toastOpen = false">
      </ion-toast>
      <div *ngIf="loading" class="loading-state">
        <ion-spinner></ion-spinner>
        <p>Running compliance audit...</p>
      </div>

      <div class="audit-layout" *ngIf="!loading && data">
        <!-- Sidebar Navigation -->
        <aside class="audit-sidebar">
            <ion-button
              class="normalize-button"
              expand="block"
              color="primary"
              [disabled]="isNormalizing || loading"
              (click)="normalizePermissions()">
              <ion-spinner *ngIf="isNormalizing" name="dots" slot="start"></ion-spinner>
              Normalize
            </ion-button>
            <div class="sidebar-header">CONTENTS</div>
            <nav>
                <a (click)="scrollTo('summary')" [class.active]="activeSection === 'summary'">Summary</a>
                <a *ngFor="let section of sections" 
                   (click)="scrollTo(section.id)" 
                   [class.active]="activeSection === section.id">
                   {{ section.title }}
                   <span class="count-badge" *ngIf="section.differentCount > 0">{{ section.differentCount }}</span>
                </a>
            </nav>
        </aside>

        <!-- Main Content -->
        <main class="audit-main">
            <!-- Summary Section -->
            <section id="summary" class="audit-section">
                <h2 class="section-title">Summary</h2>
                <div class="summary-cards">
                    <div class="summary-card">
                        <div class="card-value">{{ stats.total }}</div>
                        <div class="card-label">Permissions Total</div>
                    </div>
                    <div class="summary-card warning" [class.active]="stats.deviations > 0">
                        <div class="card-value">{{ stats.deviations }}</div>
                        <div class="card-label">Deviations from .Blank</div>
                    </div>
                    <div class="summary-card critical" [class.active]="stats.critical > 0">
                        <div class="card-value">{{ stats.critical }}</div>
                        <div class="card-label">Critical Deviations</div>
                    </div>
                </div>

                <div class="critical-deviations" *ngIf="stats.criticalItems.length > 0">
                    <h3>Critical Findings</h3>
                    <div class="deviation-item" *ngFor="let item of stats.criticalItems" (click)="scrollToItem(item.key)">
                        <ion-icon name="warning" color="danger"></ion-icon>
                        <span class="dev-name">{{ item.name }}</span>
                        <span class="dev-tag">Differs</span>
                    </div>
                </div>
            </section>

            <!-- Dynamic Sections -->
            <section *ngFor="let section of sections" [id]="section.id" class="audit-section">
                <h2 class="section-title">{{ section.title }}</h2>
                <div class="section-container">
                    
                    <div class="permission-table">
                        <div class="table-header">
                            <div class="col-name">Permission</div>
                            <div class="col-grant">Current Project</div>
                            <div class="col-grant">Standard (.Blank)</div>
                        </div>
                        <div class="table-row" *ngFor="let item of section.items" [class.diff-row]="item.isDifferent">
                            <div class="col-name">
                                <div class="perm-name">{{ item.name }}</div>
                                <div class="perm-desc" *ngIf="item.description">{{ item.description }}</div>
                            </div>
                            <div class="col-grant">
                                <ng-container *ngTemplateOutlet="grantsList; context: { grants: item.currentGrants }"></ng-container>
                            </div>
                            <div class="col-grant border-left">
                                <ng-container *ngTemplateOutlet="grantsList; context: { grants: item.blankGrants }"></ng-container>
                            </div>
                        </div>
                    </div>

                </div>
            </section>
        </main>
      </div>

      <ng-template #grantsList let-grants="grants">
          <div *ngIf="!grants || grants.length === 0" class="empty-grant">None</div>
          <div *ngFor="let grant of grants" class="grant-pill" [class.role-grant]="grant.type === 'projectRole'">
            {{ grant.display }}
          </div>
      </ng-template>

    </ion-content>
  `,
  styles: [`
    :host {
        --sidebar-width: 240px;
        --header-height: 60px;
        --warning-bg: #fff8e1;
        --warning-border: #ffc107;
        --critical-color: #d32f2f;
    }

    .audit-toolbar {
        --background: #ffffff;
        border-bottom: 1px solid #e0e0e0;
        height: var(--header-height);
    }
    .audit-toolbar ion-back-button {
        --color: #111;
        color: #111;
    }
    .audit-toolbar ion-back-button::part(native) {
        color: #111;
    }
    .audit-toolbar ion-back-button::part(icon) {
        color: #111;
    }
    .audit-toolbar ion-back-button ion-icon {
        color: #111;
    }
    .audit-toolbar ion-back-button ion-icon svg,
    .audit-toolbar ion-back-button ion-icon svg path {
        stroke: #111;
    }
    
    .header-info {
        display: flex;
        flex-direction: column;
        font-size: 0.9em;
        margin-left: 10px;
    }

    .space-info {
        font-weight: 500;
        color: #333;
    }

    .comparison-info {
        color: #666;
        font-size: 0.85em;
        margin-top: 2px;
    }

    .separator { margin: 0 8px; color: #ccc; }
    .badge-blank { 
        background: #f0f0f0; 
        padding: 1px 6px; 
        border-radius: 4px; 
        font-family: monospace; 
        font-weight: bold;
    }

    .audit-content {
        --background: #f9f9fb;
    }

    .audit-layout {
        display: flex;
        min-height: 100%;
        max-width: 1400px;
        margin: 0 auto;
    }

    .audit-sidebar {
        width: var(--sidebar-width);
        position: sticky;
        top: 0;
        height: calc(100vh - var(--header-height));
        padding: 20px;
        border-right: 1px solid #eee;
        background: #fff;
    }

    .normalize-button {
        margin-bottom: 12px;
    }

    .sidebar-header {
        font-size: 0.75em;
        text-transform: uppercase;
        letter-spacing: 1px;
        color: #999;
        margin-bottom: 16px;
        border-bottom: 1px solid #eee;
        padding-bottom: 8px;
    }

    .audit-sidebar nav a {
        display: flex;
        align-items: center;
        justify-content: space-between;
        padding: 8px 12px;
        color: #555;
        text-decoration: none;
        border-radius: 6px;
        cursor: pointer;
        margin-bottom: 4px;
        font-size: 0.95em;
        transition: background 0.2s;
    }
    .audit-sidebar nav a:hover {
        background: #f5f5f7;
        color: #000;
    }
    .audit-sidebar nav a.active {
        background: #e3f2fd;
        color: #1976d2;
        font-weight: 500;
    }
    
    .count-badge {
        background: #ffc107;
        color: #000;
        font-size: 0.75em;
        padding: 2px 6px;
        border-radius: 10px;
        font-weight: bold;
    }

    .audit-main {
        flex: 1;
        padding: 30px 40px;
        overflow-y: auto;
    }

    .audit-section {
        margin-bottom: 50px;
        scroll-margin-top: 20px;
    }

    .section-title {
        font-size: 1.5em;
        font-weight: 600;
        margin-bottom: 20px;
        color: #333;
        border-bottom: 2px solid #333;
        padding-bottom: 10px;
        width: 100%;
    }

    /* Summary Cards */
    .summary-cards {
        display: flex;
        gap: 20px;
        margin-bottom: 30px;
    }
    .summary-card {
        background: #fff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        padding: 20px;
        min-width: 180px;
        text-align: center;
        box-shadow: 0 2px 4px rgba(0,0,0,0.02);
    }
    .summary-card.warning.active {
        border-color: #ffc107;
        background: #fffbf0;
    }
    .summary-card.critical.active {
        border-color: #d32f2f;
        background: #fff5f5;
    }
    .card-value {
        font-size: 2.2em;
        font-weight: 700;
        color: #333;
        margin-bottom: 5px;
    }
    .card-label {
        font-size: 0.9em;
        color: #666;
        text-transform: uppercase;
        letter-spacing: 0.5px;
    }
    
    .deviation-item {
        display: flex;
        align-items: center;
        padding: 10px;
        background: white;
        border: 1px solid #ffebee;
        margin-bottom: 8px;
        border-radius: 4px;
        cursor: pointer;
    }
    .deviation-item ion-icon { margin-right: 10px; }
    .dev-name { font-weight: 500; flex: 1; color: #333; }
    .dev-tag { font-size: 0.8em; color: #d32f2f; background: #ffebee; padding: 2px 6px; border-radius: 4px; }
    .critical-deviations,
    .critical-deviations h3 {
        color: #333;
    }

    /* Tables */
    .permission-table {
        background: #fff;
        border: 1px solid #e0e0e0;
        border-radius: 8px;
        overflow: hidden;
    }
    .table-header {
        display: flex;
        background: #f5f5f7;
        padding: 12px 16px;
        border-bottom: 1px solid #e0e0e0;
        font-weight: 600;
        color: #555;
        font-size: 0.85em;
        text-transform: uppercase;
    }
    .table-row {
        display: flex;
        padding: 16px;
        border-bottom: 1px solid #f0f0f0;
        transition: background 0.1s;
    }
    .table-row:last-child { border-bottom: none; }
    .table-row.diff-row {
        background: var(--warning-bg);
    }

    .col-name { flex: 2; padding-right: 15px; }
    .col-grant { flex: 1.5; }
    .border-left { border-left: 1px solid #eee; padding-left: 15px; }

    .perm-name { font-weight: 600; color: #333; margin-bottom: 4px; }
    .perm-desc { font-size: 0.85em; color: #777; }
    
    .grant-pill {
        display: inline-block;
        font-size: 0.9em;
        color: #333;
        margin-bottom: 4px;
        display: block; /* Stack them */
    }
    .empty-grant { color: #aaa; font-style: italic; font-size: 0.9em; }

    /* Accordion */
    .diff-accordion {
        border-left: 4px solid var(--warning-border);
        background: var(--warning-bg);
    }
    .accordion-header-label {
        font-weight: 500;
        display: flex;
        align-items: center;
    }
    .comparison-grid {
        display: flex;
        gap: 20px;
        margin-top: 15px;
    }
    .comparison-col { flex: 1; background: white; padding: 15px; border-radius: 6px; border: 1px solid #eee; }
    .col-label {
        font-size: 0.8em;
        text-transform: uppercase;
        color: #888;
        margin-bottom: 10px;
        font-weight: 600;
    }
    .perm-full-desc { color: #555; font-size: 0.95em; line-height: 1.4; }
    .ml-2 { margin-left: 10px; }

    .loading-state {
        height: 100%;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        color: #666;
    }
  `],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule]
})
export class SpacePermissionsComponent implements OnInit {
  projectKey: string = '';
  loading = true;
  data: DiffResponse | null = null;

  sections: AuditSection[] = [];
  stats: SummaryStats = { total: 0, deviations: 0, critical: 0, criticalItems: [] };
  activeSection: string = 'summary';
  isNormalizing = false;
  toastOpen = false;
  toastMessage = '';
  toastColor: 'success' | 'danger' | 'warning' | 'medium' = 'medium';

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient
  ) { }

  ngOnInit() {
    this.projectKey = this.route.snapshot.paramMap.get('key') || '';
    if (this.projectKey) {
      this.fetchDiff();
    }
  }

  fetchDiff() {
    this.loading = true;
    this.http.get<DiffResponse>(`/api/project/${this.projectKey}/permissions/diff`)
      .subscribe({
        next: (res) => {
          this.data = res;
          this.processData(res);
          this.loading = false;
        },
        error: (err) => {
          console.error('Failed to fetch diff', err);
          this.loading = false;
        }
      });
  }

  normalizePermissions() {
    if (!this.projectKey || this.isNormalizing) return;
    this.isNormalizing = true;
    this.http.post(`/api/project/${this.projectKey}/permissions/normalize`, {})
      .subscribe({
        next: () => {
          this.toastMessage = 'Normalize started. Refreshing diff...';
          this.toastColor = 'success';
          this.toastOpen = true;
          this.fetchDiff();
        },
        error: (err) => {
          const message = err?.error?.error || err?.message || 'Failed to normalize permissions';
          console.error('Failed to normalize permissions', err);
          this.toastMessage = message;
          this.toastColor = 'danger';
          this.toastOpen = true;
          this.isNormalizing = false;
        },
        complete: () => {
          this.isNormalizing = false;
        }
      });
  }

  processData(data: DiffResponse) {
    // Categories from backend:
    // 'Project Permissions', 'Issue Permissions', 'Voters & Watchers Permissions'
    // 'Comments Permissions', 'Attachments Permissions', 'Time Tracking Permissions'
    // 'Administration Permissions'

    const mapping: Record<string, string> = {
      'Administration Permissions': 'global',
      'Project Permissions': 'project',
      'Issue Permissions': 'issue',
      'Comments Permissions': 'collaboration',
      'Attachments Permissions': 'collaboration',
      'Voters & Watchers Permissions': 'collaboration',
      'Time Tracking Permissions': 'issue', // Group with Issue
      'Other Permissions': 'system'
    };

    const sectionMap = new Map<string, PermissionDiff[]>();
    const criticalDeviations: PermissionDiff[] = [];
    let total = 0;
    let deviations = 0;

    // Initialize sections in order
    const sectionOrder = ['global', 'project', 'issue', 'collaboration', 'service', 'discovery', 'system'];
    sectionOrder.forEach(key => sectionMap.set(key, []));

    data.diffs.forEach(diff => {
      total++;
      if (diff.isDifferent) {
        deviations++;
        // Check if critical
        if (['ADMINISTER_PROJECTS', 'EDIT_WORKFLOW', 'MANAGE_WATCHERS'].includes(diff.key)) {
          criticalDeviations.push(diff);
        }
      }

      // Map key prefixes to sections if not covered by category
      let sectionKey = mapping[diff.category] || 'system';

      // Overrides for Service Desk & Discovery based on Key
      if (diff.key.startsWith('SERVICEDESK_') || diff.category.includes('Service')) {
        sectionKey = 'service';
      } else if (diff.key.includes('DISCOVERY') || diff.name.toLowerCase().includes('discovery')) {
        sectionKey = 'discovery';
      }

      const list = sectionMap.get(sectionKey);
      if (list) list.push(diff);
      else {
        // Should not happen with pre-init, but fallback
        sectionMap.set('system', [...(sectionMap.get('system') || []), diff]);
      }
    });

    // Build Sections Array
    this.sections = [
      { id: 'global', title: 'Global & Admin', items: sectionMap.get('global') || [] },
      { id: 'project', title: 'Project Admin', items: sectionMap.get('project') || [] },
      { id: 'issue', title: 'Issue Lifecycle', items: sectionMap.get('issue') || [] },
      { id: 'collaboration', title: 'Collaboration', items: sectionMap.get('collaboration') || [] },
      { id: 'service', title: 'Service Management', items: sectionMap.get('service') || [] },
      { id: 'discovery', title: 'Product Discovery', items: sectionMap.get('discovery') || [] },
      { id: 'system', title: 'System / Apps', items: sectionMap.get('system') || [] }
    ]
      .filter(s => s.items.length > 0)
      .map(s => ({
        ...s,
        differentCount: s.items.filter(i => i.isDifferent).length
      }));

    this.stats = {
      total,
      deviations,
      critical: criticalDeviations.length,
      criticalItems: criticalDeviations
    };
  }

  isTableView(sectionId: string): boolean {
    return ['global', 'project', 'collaboration', 'system'].includes(sectionId);
  }

  scrollTo(id: string) {
    this.activeSection = id;
    const el = document.getElementById(id);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }

  scrollToItem(key: string) {
    // Find which section this key belongs to
    for (const section of this.sections) {
      if (section.items.find(i => i.key === key)) {
        this.scrollTo(section.id);
        // Ideally scroll to specific item, but section is good for now
        break;
      }
    }
  }
}
