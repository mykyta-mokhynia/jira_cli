import { Component, OnInit } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-apply-template',
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-title>Apply Project Template</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      
      <!-- STEP 1: SELECT -->
      <div *ngIf="step === 1">
        <ion-card>
          <ion-card-header>
            <ion-card-title>Step 1: Selection</ion-card-title>
          </ion-card-header>
          <ion-card-content>
            
            <ion-list>
              <ion-list-header>
                <ion-label>Select Project</ion-label>
              </ion-list-header>
              <ion-item class="interactive-item">
                <ion-label position="stacked">Project</ion-label>
                <ion-select [(ngModel)]="selectedProjectKey" (ionChange)="onProjectChange()" placeholder="Choose Project" interface="popover">
                  <ion-select-option *ngFor="let p of projects" [value]="p.key">
                    {{ p.name }} ({{ p.key }})
                  </ion-select-option>
                </ion-select>
              </ion-item>

              <ion-list-header class="ion-margin-top">
                <ion-label>Template Options</ion-label>
              </ion-list-header>
              <ion-item lines="none" *ngIf="selectedProjectKey">
                <ion-label>
                  <h3>Project Type</h3>
                  <ion-badge color="tertiary" *ngIf="projectType === 'team'">Team Managed (Next-Gen)</ion-badge>
                  <ion-badge color="secondary" *ngIf="projectType === 'non-team'">Company Managed (Classic)</ion-badge>
                </ion-label>
              </ion-item>
            </ion-list>

            <div class="user-selection-section ion-margin-top" style="position: relative;">
               <ion-list-header>
                 <ion-label>Project Leader (Executor)</ion-label>
               </ion-list-header>

               <div *ngIf="!selectedLeaderAccountId">
                 <ion-searchbar [(ngModel)]="leaderSearchQuery" 
                              (ionInput)="filterUsers($event, 'leader')" 
                              placeholder="Search Lead"
                              class="user-searchbar"></ion-searchbar>
                 
                 <ion-list *ngIf="filteredLeaderUsers.length > 0" class="search-results dark-theme-list">
                   <ion-item *ngFor="let u of filteredLeaderUsers" 
                            button 
                            detail="false"
                            (click)="selectLeader(u)"
                            class="interactive-item user-item">
                     <ion-avatar slot="start">
                       <img [src]="u.avatarUrls?.['24x24']" />
                     </ion-avatar>
                     <ion-label>
                       <h3>{{ u.displayName }}</h3>
                       <p>{{ u.emailAddress }}</p>
                     </ion-label>
                   </ion-item>
                 </ion-list>
               </div>

               <ion-item *ngIf="selectedLeaderAccountId" lines="none" class="selected-leader-item">
                 <ion-avatar slot="start">
                   <img [src]="selectedLeader?.avatarUrls?.['48x48']" />
                 </ion-avatar>
                 <ion-label>
                    <h3 style="color: white !important;">{{ selectedLeader?.displayName }}</h3>
                    <p style="color: #ccc !important;">{{ selectedLeader?.emailAddress }}</p>
                    <ion-badge color="success" *ngIf="isAutoSelected">Current Lead</ion-badge>
                 </ion-label>
                 <ion-button slot="end" fill="clear" (click)="clearLeader()" color="light">
                   <ion-icon name="close-circle" slot="icon-only"></ion-icon>
                 </ion-button>
               </ion-item>
            </div>

            <div class="ion-margin-top ion-text-end">
               <ion-button (click)="goToStep2()" 
                          [disabled]="!selectedProjectKey || !projectType || !selectedLeaderAccountId"
                          class="next-button">
                 Next <ion-icon name="arrow-forward" slot="end"></ion-icon>
               </ion-button>
            </div>
          </ion-card-content>
        </ion-card>
      </div>

      <!-- STEP 2: PREVIEW & MEMBER CONFIG -->
      <div *ngIf="step === 2">
        <ion-card>
            <ion-card-header>
                <ion-card-title>Template Preview & Configuration</ion-card-title>
                <ion-card-subtitle>Review audit results and manage group members</ion-card-subtitle>
            </ion-card-header>
            <ion-card-content *ngIf="auditResult; else loadingAudit">
                
                <ion-list>
                    <ion-list-header>
                        <ion-label>Project Leader (New)</ion-label>
                    </ion-list-header>
                    <ion-item lines="none" class="preview-item">
                        <ion-avatar slot="start">
                          <img [src]="selectedLeader?.avatarUrls?.['24x24']" />
                        </ion-avatar>
                        <ion-label>
                            <h3>{{ selectedLeader?.displayName }}</h3>
                            <p>Will be set as Leader & added to <strong>{{ selectedProjectKey }}group_executor</strong></p>
                        </ion-label>
                        <ion-icon name="person-circle" color="primary" slot="end"></ion-icon>
                    </ion-item>

                    <ion-list-header color="light" class="ion-margin-top">
                        <ion-label>Group Membership Management</ion-label>
                    </ion-list-header>

                    <!-- Admin Section -->
                    <div class="user-selection-section ion-margin-top" style="position: relative;">
                      <ion-label style="margin-left: 16px; font-weight: bold;">Administrators</ion-label>

                      <ion-searchbar [(ngModel)]="adminSearchQuery" 
                                    (ionInput)="filterUsers($event, 'admin')" 
                                    placeholder="Add member to Admin group"
                                    class="user-searchbar"></ion-searchbar>
                      
                      <ion-list *ngIf="filteredAdminUsers.length > 0" class="search-results dark-theme-list">
                        <ion-item *ngFor="let u of filteredAdminUsers" button detail="false" (click)="addMember(u, 'admin')" class="interactive-item user-item">
                          <ion-avatar slot="start"><img [src]="u.avatarUrls?.['24x24']" /></ion-avatar>
                          <ion-label><h3>{{ u.displayName }}</h3><p>{{ u.emailAddress }}</p></ion-label>
                        </ion-item>
                      </ion-list>

                      <ion-list *ngIf="adminMembers.length > 0">
                        <ion-item *ngFor="let m of adminMembers" class="selected-member-item" lines="full">
                          <ion-avatar slot="start"><img [src]="m.avatarUrls?.['24x24']" /></ion-avatar>
                          <ion-label><h3>{{ m.displayName }}</h3><p>{{ m.emailAddress }}</p></ion-label>
                          <ion-button slot="end" fill="clear" color="danger" (click)="removeMember(m, 'admin')">
                            <ion-icon name="trash" slot="icon-only"></ion-icon>
                          </ion-button>
                        </ion-item>
                      </ion-list>
                      <ion-item *ngIf="adminMembers.length === 0" lines="none">
                        <ion-label color="medium" class="ion-text-center">No administrators selected</ion-label>
                      </ion-item>
                    </div>

                    <!-- Service Desk Section -->
                    <div class="user-selection-section ion-margin-top" style="position: relative;">
                      <ion-label style="margin-left: 16px; font-weight: bold;">Service Desk Users</ion-label>

                      <ion-searchbar [(ngModel)]="sdSearchQuery" 
                                    (ionInput)="filterUsers($event, 'sd')" 
                                    placeholder="Add member to Service Desk"
                                    class="user-searchbar"></ion-searchbar>
                      
                      <ion-list *ngIf="filteredSdUsers.length > 0" class="search-results dark-theme-list">
                        <ion-item *ngFor="let u of filteredSdUsers" button detail="false" (click)="addMember(u, 'sd')" class="interactive-item user-item">
                          <ion-avatar slot="start"><img [src]="u.avatarUrls?.['24x24']" /></ion-avatar>
                          <ion-label><h3>{{ u.displayName }}</h3><p>{{ u.emailAddress }}</p></ion-label>
                        </ion-item>
                      </ion-list>

                      <ion-list *ngIf="serviceDeskMembers.length > 0">
                        <ion-item *ngFor="let m of serviceDeskMembers" class="selected-member-item" lines="full">
                          <ion-avatar slot="start"><img [src]="m.avatarUrls?.['24x24']" /></ion-avatar>
                          <ion-label><h3>{{ m.displayName }}</h3><p>{{ m.emailAddress }}</p></ion-label>
                          <ion-button slot="end" fill="clear" color="danger" (click)="removeMember(m, 'sd')">
                            <ion-icon name="trash" slot="icon-only"></ion-icon>
                          </ion-button>
                        </ion-item>
                      </ion-list>
                      <ion-item *ngIf="serviceDeskMembers.length === 0" lines="none">
                        <ion-label color="medium" class="ion-text-center">No service desk members selected</ion-label>
                      </ion-item>
                    </div>

                    <!-- Users Section -->
                    <div class="user-selection-section ion-margin-top" style="position: relative;">
                       <ion-label style="margin-left: 16px; font-weight: bold;">Users</ion-label>
                       
                       <ion-searchbar [(ngModel)]="usersSearchQuery" 
                                     (ionInput)="filterUsers($event, 'users')" 
                                     placeholder="Add member to Users"
                                     class="user-searchbar"></ion-searchbar>
                       
                       <ion-list *ngIf="filteredUsersSub.length > 0" class="search-results dark-theme-list">
                         <ion-item *ngFor="let u of filteredUsersSub" button detail="false" (click)="addMember(u, 'users')" class="interactive-item user-item">
                           <ion-avatar slot="start"><img [src]="u.avatarUrls?.['24x24']" /></ion-avatar>
                           <ion-label><h3>{{ u.displayName }}</h3><p>{{ u.emailAddress }}</p></ion-label>
                         </ion-item>
                       </ion-list>

                       <ion-list *ngIf="userMembers.length > 0">
                         <ion-item *ngFor="let m of userMembers" class="selected-member-item" lines="full">
                           <ion-avatar slot="start"><img [src]="m.avatarUrls?.['24x24']" /></ion-avatar>
                           <ion-label><h3>{{ m.displayName }}</h3><p>{{ m.emailAddress }}</p></ion-label>
                           <ion-button slot="end" fill="clear" color="danger" (click)="removeMember(m, 'users')">
                             <ion-icon name="trash" slot="icon-only"></ion-icon>
                           </ion-button>
                         </ion-item>
                       </ion-list>
                       <ion-item *ngIf="userMembers.length === 0" lines="none">
                         <ion-label color="medium" class="ion-text-center">No user members selected</ion-label>
                       </ion-item>
                    </div>

                    <ion-list-header color="light" class="ion-margin-top">
                        <ion-label>Schemes Information</ion-label>
                    </ion-list-header>
                    
                    <!-- Groups Calibration -->
                    <ion-item *ngFor="let g of auditResult.groups.notInProject">
                        <ion-icon name="arrow-forward-circle" color="primary" slot="start"></ion-icon>
                        <ion-label>
                          <h3>{{ g }}</h3>
                          <p>Will be added to Project Role</p>
                        </ion-label>
                    </ion-item>
                    <ion-item *ngFor="let g of auditResult.groups.missing">
                        <ion-icon name="add-circle" color="warning" slot="start"></ion-icon>
                        <ion-label>
                          <h3>{{ g }}</h3>
                          <p>Will be CREATED and added to Project Role</p>
                        </ion-label>
                    </ion-item>

                    <ion-item lines="none">
                       <ion-icon [name]="auditResult.permissionScheme.action === 'ok' ? 'checkmark-circle' : 'arrow-forward-circle'" 
                                 [color]="auditResult.permissionScheme.action === 'ok' ? 'success' : 'primary'" slot="start"></ion-icon>
                       <ion-label>
                           <h3>Permission Scheme: {{ auditResult.permissionScheme.target }}</h3>
                           <p *ngIf="auditResult.permissionScheme.action !== 'ok'">Current: {{ auditResult.permissionScheme.current }}</p>
                       </ion-label>
                    </ion-item>
                    <ion-item lines="none">
                        <ion-icon [name]="auditResult.securityScheme.action === 'ok' ? 'checkmark-circle' : 'arrow-forward-circle'"
                                  [color]="auditResult.securityScheme.action === 'ok' ? 'success' : 'primary'" slot="start"></ion-icon>
                        <ion-label>
                            <h3>Security Scheme: {{ auditResult.securityScheme.target }}</h3>
                            <p *ngIf="auditResult.securityScheme.action !== 'ok'">Current: {{ auditResult.securityScheme.current }}</p>
                        </ion-label>
                    </ion-item>
                </ion-list>

                <div class="ion-margin-top ion-text-end">
                    <ion-button fill="outline" (click)="step = 1" class="ion-margin-end">Back</ion-button>
                    <ion-button (click)="goToStep3()">Apply Template</ion-button>
                </div>
            </ion-card-content>
            
            <ng-template #loadingAudit>
                <div class="ion-padding ion-text-center">
                    <ion-spinner></ion-spinner>
                    <p>Auditing project...</p>
                </div>
            </ng-template>
        </ion-card>
      </div>

      <!-- STEP 3: APPLY -->
      <div *ngIf="step === 3">
        <div class="ion-text-center ion-padding apply-loading">
           <ion-spinner name="crescent" size="large"></ion-spinner>
           <h2>Applying Template...</h2>
           <p>This may take a moment. We're creating groups, configuring schemes, and setting the leader.</p>
        </div>
      </div>

    </ion-content>
  `,
  styles: [`
    .interactive-item {
      cursor: pointer;
      --transition: 0.2s ease-in-out;
    }
    .interactive-item:hover {
      --background: #2b2f3a;
      --color: white;
      transform: scale(1.01);
    }
    .interactive-item:hover h3, .interactive-item:hover p {
      color: white !important;
    }
    .user-item {
      --padding-start: 16px;
    }
    .search-results {
      position: absolute;
      z-index: 1000;
      width: 100%;
      max-height: 250px;
      overflow-y: auto;
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
      border-radius: 8px;
    }
    .dark-theme-list {
      background: #1e2128;
    }
    .selected-leader-item {
      --background: #2b2f3a;
      border: 1px solid #1c1f26;
      border-radius: 8px;
    }
    .selected-member-item {
      --background: #232730;
      border-bottom: 1px solid #1c1f26;
      --padding-start: 8px;
    }
    .next-button {
      height: 44px;
      --border-radius: 8px;
    }
    .apply-loading {
      margin-top: 50px;
    }
  `],
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule, RouterModule]
})
export class ApplyTemplateComponent implements OnInit {
  step = 1;
  projects: any[] = [];
  users: any[] = [];
  filteredLeaderUsers: any[] = [];
  filteredAdminUsers: any[] = [];
  filteredSdUsers: any[] = [];
  filteredUsersSub: any[] = [];

  adminMembers: any[] = [];
  serviceDeskMembers: any[] = [];
  userMembers: any[] = [];

  selectedProjectKey = '';
  projectType = 'team';

  leaderSearchQuery = '';
  adminSearchQuery = '';
  sdSearchQuery = '';
  usersSearchQuery = '';

  selectedLeaderAccountId = '';
  selectedLeader: any = null;
  auditResult: any = null;
  isAutoSelected = false;

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.loadProjects();
  }

  loadProjects() {
    this.http.get<any[]>('/api/projects').subscribe({
      next: (data: any) => {
        this.projects = Array.isArray(data) ? data : (data.values || []);
      },
      error: (err) => console.error('Failed to load projects', err)
    });
  }

  loadUsers(projectKey: string) {
    if (!projectKey) return;
    this.http.get<any[]>(`/api/project/${projectKey}/assignable-users`).subscribe({
      next: (data: any) => {
        const list = Array.isArray(data) ? data : (data.values || []);
        console.log("Assignable users loaded:", list.length);
        this.users = list;
      },
      error: (err) => console.error('Failed to load assignable users', err)
    });
  }

  onProjectChange() {
    if (!this.selectedProjectKey) return;
    this.loadUsers(this.selectedProjectKey);

    // Auto-identify leader and project type
    this.http.get<any>(`/api/project/${this.selectedProjectKey}`).subscribe({
      next: (project) => {
        // Auto-detect project type
        if (project.style === 'next-gen') {
          this.projectType = 'team';
        } else if (project.style === 'classic') {
          this.projectType = 'non-team';
        }

        if (project.lead) {
          const lead = project.lead;
          // Try to find in our users list for consistency, otherwise use what we got
          const matchedUser = this.users.find(u => u.accountId === lead.accountId);
          if (matchedUser) {
            this.selectLeader(matchedUser);
            this.isAutoSelected = true;
          } else {
            // If not found in bulk list, use lead info directly
            this.selectedLeader = lead;
            this.selectedLeaderAccountId = lead.accountId;
            this.leaderSearchQuery = lead.displayName;
            this.isAutoSelected = true;
          }
        }
      },
      error: (err) => console.error('Failed to fetch project details for lead identification', err)
    });

    // Also fetch current members if they are not already in audit (proactive pre-population)
    // Actually we will get them from audit in goToStep2, but let's clear current state
    this.adminMembers = [];
    this.serviceDeskMembers = [];
    this.userMembers = [];
  }

  filterUsers(event: any, type: 'leader' | 'sd' | 'users' | 'admin') {
    const query = (event.target.value || '').toLowerCase();
    if (!query) {
      if (type === 'leader') this.filteredLeaderUsers = [];
      if (type === 'admin') this.filteredAdminUsers = [];
      if (type === 'sd') this.filteredSdUsers = [];
      if (type === 'users') this.filteredUsersSub = [];
      return;
    }
    const filtered = this.users.filter(u =>
      (u.displayName || '').toLowerCase().includes(query) ||
      (u.emailAddress || '').toLowerCase().includes(query)
    ).slice(0, 5);

    if (type === 'leader') this.filteredLeaderUsers = filtered;
    if (type === 'admin') this.filteredAdminUsers = filtered;
    if (type === 'sd') this.filteredSdUsers = filtered;
    if (type === 'users') this.filteredUsersSub = filtered;
  }

  addMember(user: any, type: 'sd' | 'users' | 'admin') {
    if (type === 'admin') {
      if (!this.adminMembers.find(m => m.accountId === user.accountId)) {
        this.adminMembers.push(user);
      }
      this.adminSearchQuery = '';
      this.filteredAdminUsers = [];
    } else if (type === 'sd') {
      if (!this.serviceDeskMembers.find(m => m.accountId === user.accountId)) {
        this.serviceDeskMembers.push(user);
      }
      this.sdSearchQuery = '';
      this.filteredSdUsers = [];
    } else {
      if (!this.userMembers.find(m => m.accountId === user.accountId)) {
        this.userMembers.push(user);
      }
      this.usersSearchQuery = '';
      this.filteredUsersSub = [];
    }
  }

  removeMember(user: any, type: 'sd' | 'users' | 'admin') {
    if (type === 'admin') {
      this.adminMembers = this.adminMembers.filter(m => m.accountId !== user.accountId);
    } else if (type === 'sd') {
      this.serviceDeskMembers = this.serviceDeskMembers.filter(m => m.accountId !== user.accountId);
    } else {
      this.userMembers = this.userMembers.filter(m => m.accountId !== user.accountId);
    }
  }

  selectLeader(user: any) {
    this.selectedLeader = user;
    this.selectedLeaderAccountId = user.accountId;
    this.leaderSearchQuery = user.displayName;
    this.filteredLeaderUsers = [];
    this.isAutoSelected = false;
  }

  clearLeader() {
    this.selectedLeader = null;
    this.selectedLeaderAccountId = '';
    this.leaderSearchQuery = '';
    this.isAutoSelected = false;
  }

  goToStep2() {
    this.step = 2;
    this.auditResult = null;
    this.http.get<any>(`/api/project/${this.selectedProjectKey}/audit?type=${this.projectType}`)
      .subscribe({
        next: (res) => {
          this.auditResult = res;
          // Pre-populate members from audit proposed migration
          if (res.proposedMembers) {
            this.adminMembers = res.proposedMembers.admin || [];
            this.serviceDeskMembers = res.proposedMembers.serviceDesk || [];
            this.userMembers = res.proposedMembers.users || [];
          }
        },
        error: (err) => {
          console.error('Audit failed', err);
          alert('Audit failed. See console.');
          this.step = 1;
        }
      });
  }

  goToStep3() {
    this.step = 3;
    this.http.post(`/api/project/${this.selectedProjectKey}/apply-template`, {
      projectType: this.projectType,
      leaderAccountId: this.selectedLeaderAccountId,
      serviceDeskMembers: this.serviceDeskMembers.map(m => m.accountId),
      userMembers: this.userMembers.map(m => m.accountId),
      adminMembers: this.adminMembers.map(m => m.accountId)
    })
      .subscribe({
        next: () => {
          alert('Template Applied Successfully!');
          this.step = 1;
          this.clearLeader();
          this.selectedProjectKey = '';
        },
        error: (err) => {
          console.error('Apply failed', err);
          alert('Failed to apply template. See console.');
          this.step = 2;
        }
      });
  }
}
