import { Component, Input, OnInit, OnChanges, SimpleChanges } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, AlertController, ModalController } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { UserSelectComponent } from './user-select.component';

export type RoleKey = 'ADMINISTRATORS' | 'EXECUTOR' | 'SERVICE_DESK' | 'USER' | 'WATCHERS';

interface AuditUser {
  accountId: string;
  displayName: string;
  emailAddress: string;
  avatarUrl: string;
  active: boolean;
  groups: string[];
  roles: RoleKey[];
}

@Component({
  selector: 'app-people-audit',
  standalone: true,
  imports: [CommonModule, IonicModule, UserSelectComponent],
  template: `
    <div class="audit-container">
      <div class="header-actions ion-margin-bottom">
        <h2 class="ion-no-margin">People Audit</h2>
        <ion-button color="warning" fill="outline" (click)="normalize()" [disabled]="loading || normalizing">
          <ion-icon slot="start" name="hammer-outline"></ion-icon>
          Normalize Roles
        </ion-button>
      </div>

      <div *ngIf="loading" class="ion-text-center ion-padding">
        <ion-spinner></ion-spinner>
        <p>Loading audit data...</p>
      </div>

      <div *ngIf="!loading">
        <ion-accordion-group [multiple]="true" [value]="['ADMINISTRATORS', 'EXECUTOR', 'SERVICE_DESK', 'USER', 'WATCHERS']">
          
          <ng-container *ngFor="let role of roleDisplayOrder">
            <ion-accordion [value]="role">
              <ion-item slot="header" color="light">
                <ion-label>
                  <h3>{{ getRoleLabel(role) }}</h3>
                  <p class="role-group-name">{{ getRoleGroupName(role) }}</p>
                </ion-label>
                <ion-badge slot="end" color="medium">{{ getRoleUsers(role).length }}</ion-badge>
                <ion-button fill="clear" slot="end" (click)="$event.stopPropagation(); addUser(role)">
                  <ion-icon slot="icon-only" name="add-circle"></ion-icon>
                </ion-button>
              </ion-item>

              <div slot="content" class="ion-padding-start ion-padding-end user-list">
                <ion-list lines="full">
                  <ion-item *ngIf="getRoleUsers(role).length === 0" lines="none">
                    <ion-label color="medium" class="ion-text-center">No users in this role</ion-label>
                  </ion-item>

                  <ion-item *ngFor="let user of getRoleUsers(role)">
                    <ion-avatar slot="start">
                      <img [src]="user.avatarUrl" *ngIf="user.avatarUrl" />
                      <ion-icon name="person-circle-outline" *ngIf="!user.avatarUrl" size="large"></ion-icon>
                    </ion-avatar>
                    
                    <ion-label>
                      <h3>
                        {{ user.displayName }}
                        <ion-text color="danger" *ngIf="hasConflict(user)">
                          <ion-icon name="warning" title="User has multiple roles (Conflict)"></ion-icon>
                        </ion-text>
                        <ion-text color="medium" *ngIf="!user.active">
                          <ion-icon name="eye-off-outline" title="Inactive User"></ion-icon>
                        </ion-text>
                      </h3>
                      <p>{{ user.emailAddress }}</p>
                      <p *ngIf="hasConflict(user)" class="conflict-text">
                        Roles: {{ user.roles.join(', ') }}
                      </p>
                    </ion-label>

                    <ion-button slot="end" fill="clear" color="medium" (click)="removeUser(role, user)">
                      <ion-icon slot="icon-only" name="trash-outline"></ion-icon>
                    </ion-button>
                  </ion-item>
                </ion-list>
              </div>
            </ion-accordion>
          </ng-container>

        </ion-accordion-group>
      </div>
    </div>
  `,
  styles: [`
    .audit-container {
      margin-top: 10px;
    }
    .header-actions {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 8px;
    }
    .header-actions h2 {
      color: #222;
      font-weight: 600;
    }
    .header-actions ion-button {
      --color: #333;
      --border-color: #d9d9d9;
    }
    .role-group-name {
      font-size: 0.8em;
      opacity: 0.7;
    }
    .user-list {
      background: var(--ion-item-background, #fff);
      padding: 0 !important;
    }
    .user-list ion-list {
      margin: 0;
      padding: 0;
      background: #fff;
    }
    .conflict-text {
      color: var(--ion-color-danger);
      font-weight: 500;
    }
    .audit-container ion-accordion-group {
      background: #fff;
      border: 1px solid #e0e0e0;
      border-radius: 8px;
      overflow: hidden;
    }
    .audit-container ion-accordion-group::part(native) {
      border-color: #e0e0e0;
    }
    .audit-container ion-item {
      --background: #fff;
      --color: #222;
      --border-color: #e6e6e6;
    }
    .audit-container ion-item::part(native) {
      color: #222;
      background: #fff;
      border-color: #e6e6e6;
    }
    .audit-container ion-item.ion-color-light {
      --background: #f5f5f7;
      --color: #222;
    }
    .audit-container ion-item.ion-color-light::part(native) {
      color: #222;
      background: #f5f5f7;
    }
    .audit-container ion-item-divider {
      --background: #f5f5f7;
      --color: #333;
    }
    .audit-container ion-item-divider::part(native) {
      background: #f5f5f7;
      color: #333;
      border-color: #e0e0e0;
    }
    .audit-container ion-item-divider ion-label {
      color: #333;
    }
    .audit-container ion-item h3 {
      color: #222;
      font-weight: 600;
    }
    .audit-container ion-item p {
      color: #666;
    }
    .audit-container ion-label {
      color: #222;
    }
    .audit-container ion-label.ion-color-medium,
    .audit-container ion-item.ion-color-medium,
    .audit-container ion-item.ion-color-medium::part(native) {
      --color: #666;
      color: #666;
    }
    ::ng-deep .audit-container ion-item.ion-color-medium,
    ::ng-deep .audit-container ion-item.ion-color-medium::part(native),
    ::ng-deep .audit-container ion-item.ion-color-medium ion-label,
    ::ng-deep .audit-container ion-label.ion-color-medium {
      --color: #666 !important;
      color: #666 !important;
    }
    ::ng-deep .audit-container ion-item.ion-color-medium ion-label.ion-color-medium {
      --color: #666 !important;
      color: #666 !important;
    }
    .audit-container ion-badge {
      color: #333;
    }
    .audit-container ion-badge.ion-color-light {
      --color: #333;
      color: #333;
      background: #f0f0f0;
    }
    .audit-container ion-accordion ion-icon {
      color: #666;
    }
    .audit-container ion-accordion ion-icon svg,
    .audit-container ion-accordion ion-icon svg path {
      stroke: #666;
    }
    .audit-container ion-button {
      --color: #333;
    }
  `]
})
export class PeopleAuditComponent implements OnInit, OnChanges {
  @Input() projectKey: string = '';

  auditUsers: AuditUser[] = [];
  loading = false;
  normalizing = false;

  roleDisplayOrder: RoleKey[] = ['ADMINISTRATORS', 'EXECUTOR', 'SERVICE_DESK', 'USER', 'WATCHERS'];

  constructor(
    private http: HttpClient,
    private alertCtrl: AlertController,
    private modalCtrl: ModalController
  ) { }

  ngOnInit() {
    if (this.projectKey) {
      this.loadAudit();
    }
  }

  ngOnChanges(changes: SimpleChanges) {
    if (changes['projectKey'] && !changes['projectKey'].firstChange && this.projectKey) {
      this.loadAudit();
    }
  }

  async loadAudit() {
    this.loading = true;
    try {
      this.auditUsers = await firstValueFrom(this.http.get<AuditUser[]>(`/api/project/${this.projectKey}/people/audit`));
    } catch (e) {
      console.error('Failed to load audit', e);
      // alert('Failed to load people audit');
    } finally {
      this.loading = false;
    }
  }

  getRoleUsers(role: RoleKey): AuditUser[] {
    return this.auditUsers.filter(u => u.roles.includes(role));
  }

  hasConflict(user: AuditUser): boolean {
    // Conflict if more than 1 role.
    // Exception: If they have roles, and one is watchers, and typically we want simplified view.
    // The "Normalize" rule is 1 role per user (except watchers which is removed if other exists).
    // So distinct active roles > 1 is a conflict.
    return user.roles.length > 1;
  }

  getRoleLabel(role: RoleKey): string {
    switch (role) {
      case 'ADMINISTRATORS': return 'Administrators';
      case 'EXECUTOR': return 'Executor';
      case 'SERVICE_DESK': return 'Service Desk Team';
      case 'USER': return 'User';
      case 'WATCHERS': return 'Watchers';
      default: return role;
    }
  }

  getRoleGroupName(role: RoleKey): string {
    if (!this.projectKey) return '';
    const key = this.projectKey;
    switch (role) {
      case 'ADMINISTRATORS': return key + 'group_admin';
      case 'EXECUTOR': return key + 'group_executor';
      case 'SERVICE_DESK': return key + 'group';
      case 'USER': return key + 'group_user';
      case 'WATCHERS': return key + 'group_watchers';
      default: return '';
    }
  }

  async addUser(role: RoleKey) {
    const modal = await this.modalCtrl.create({
      component: UserSelectComponent,
      componentProps: {
        projectKey: this.projectKey
      }
    });

    await modal.present();

    const { data } = await modal.onDidDismiss();

    if (data && data.selectedUser) {
      await this.executeAddUser(role, data.selectedUser);
    }
  }

  async executeAddUser(role: RoleKey, user: any) {
    try {
      await firstValueFrom(this.http.post(`/api/project/${this.projectKey}/people/role/${role}/user`, {
        accountId: user.accountId
      }));
      await this.loadAudit();
    } catch (e) {
      console.error(e);
      const alert = await this.alertCtrl.create({ header: 'Error', message: 'Failed to add user.', buttons: ['OK'] });
      await alert.present();
    }
  }

  async removeUser(role: RoleKey, user: AuditUser) {
    const confirm = await this.alertCtrl.create({
      header: 'Remove User?',
      message: `Remove ${user.displayName} from ${this.getRoleLabel(role)}?`,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Remove',
          role: 'destructive',
          handler: async () => {
            try {
              await firstValueFrom(this.http.delete(`/api/project/${this.projectKey}/people/role/${role}/user/${user.accountId}`));
              await this.loadAudit();
            } catch (e) {
              const err = await this.alertCtrl.create({ header: 'Error', message: 'Failed to remove user.', buttons: ['OK'] });
              await err.present();
            }
          }
        }
      ]
    });
    await confirm.present();
  }

  async normalize() {
    const confirm = await this.alertCtrl.create({
      header: 'Normalize Roles?',
      message: `
        This will enforce the canonical role model:\n
        \u2022 Keep only the highest priority role per user.\n
        \u2022 Remove users from conflicting lower roles.\n
        \u2022 Clean up Watchers (remove if other role exists).\n
        \n
        Priority: Admin > Executor > Service Desk > User > Watchers
      `,
      buttons: [
        { text: 'Cancel', role: 'cancel' },
        {
          text: 'Normalize',
          role: 'destructive',
          handler: async () => {
            this.normalizing = true;
            try {
              const res: any = await firstValueFrom(this.http.post(`/api/project/${this.projectKey}/people/normalize`, {}));
              this.normalizing = false;

              const resultAlert = await this.alertCtrl.create({
                header: 'Normalization Complete',
                message: `Processed ${res.processed} users.\nRules enforced on ${res.changed} users.`,
                buttons: ['OK']
              });
              await resultAlert.present();
              await this.loadAudit();
            } catch (e) {
              this.normalizing = false;
              const err = await this.alertCtrl.create({ header: 'Error', message: 'Normalization failed.', buttons: ['OK'] });
              await err.present();
            }
          }
        }
      ]
    });
    await confirm.present();
  }
}
