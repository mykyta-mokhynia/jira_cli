import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController } from '@ionic/angular';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';
import { PeopleAuditComponent } from './people-audit/people-audit.component';

@Component({
  selector: 'app-space-detail',
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/space-edit"></ion-back-button>
        </ion-buttons>
        <ion-title>{{ projectKey }} Details</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <div *ngIf="loading" class="ion-text-center ion-padding">
        <ion-spinner></ion-spinner>
        <p>Loading details...</p>
      </div>

      <div *ngIf="!loading && project">
        <ion-card>
          <ion-card-header>
            <ion-card-title>{{ project.name }}</ion-card-title>
            <ion-card-subtitle>{{ project.key }}</ion-card-subtitle>
          </ion-card-header>
          <ion-card-content>
            <ion-list>
              <ion-item-divider color="light"><ion-label>Schemes</ion-label></ion-item-divider>
              <ion-item>
                <ion-label>
                  <h3>Permission Scheme</h3>
                  <p>{{ project.permissionScheme?.name || 'Default' }}</p>
                </ion-label>
              </ion-item>
              <ion-item>
                <ion-label>
                  <h3>Security Scheme</h3>
                  <p>{{ project.issueSecurityScheme?.name || 'None' }}</p>
                </ion-label>
              </ion-item>
            </ion-list>
          </ion-card-content>
        </ion-card>

        <app-people-audit [projectKey]="projectKey"></app-people-audit>
                  
         <h3 class="ion-padding-start ion-margin-top">Automations</h3>
         <ion-card color="light">
           <ion-card-content>
             <p color="medium" class="ion-margin-bottom">Dangerous actions that affect all issues in this project.</p>
             <ion-button expand="block" color="danger" (click)="clearSecurityLevels()" [disabled]="isClearingSecurity">
               <ion-icon name="shield-outline" slot="start"></ion-icon>
               {{ isClearingSecurity ? 'Clearing Security Levels...' : 'Clear All Security Levels' }}
             </ion-button>
           </ion-card-content>
         </ion-card>
 
         <h3 class="ion-padding-start ion-margin-top">Configuration (Preview)</h3>
          <ion-card color="light">
            <ion-card-content>
              <p>Workflows, Screens, Fields - Coming Soon</p>
            </ion-card-content>
          </ion-card>
       </div>
     </ion-content>
   `,
  styles: [],
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule, PeopleAuditComponent]
})
export class SpaceDetailComponent implements OnInit {
  projectKey: string = '';
  project: any = null;
  loading = true;
  isClearingSecurity = false;

  constructor(
    private route: ActivatedRoute,
    private http: HttpClient,
    private alertCtrl: AlertController
  ) { }

  ngOnInit() {
    this.projectKey = this.route.snapshot.paramMap.get('key') || '';
    if (this.projectKey) {
      this.fetchData();
    }
  }

  fetchData() {
    forkJoin({
      project: this.http.get<any>(`/api/project/${this.projectKey}`)
    }).subscribe({
      next: (data) => {
        this.project = data.project;
        this.loading = false;
      },
      error: (err) => {
        console.error('Error fetching project details', err);
        alert('Failed to load project details');
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
