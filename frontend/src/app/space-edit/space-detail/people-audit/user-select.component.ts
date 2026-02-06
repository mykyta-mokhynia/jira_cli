import { Component, Input, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule, ModalController } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-user-select',
  standalone: true,
  imports: [CommonModule, IonicModule, FormsModule],
  template: `
    <ion-header>
      <ion-toolbar>
        <ion-title>Select User</ion-title>
        <ion-buttons slot="end">
          <ion-button (click)="cancel()">Cancel</ion-button>
        </ion-buttons>
      </ion-toolbar>
      <ion-toolbar>
        <ion-searchbar 
          [(ngModel)]="searchQuery" 
          (ionInput)="filterList()" 
          placeholder="Search name or email"
          debounce="300"
        ></ion-searchbar>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div *ngIf="loading" class="ion-text-center ion-padding">
        <ion-spinner></ion-spinner>
      </div>

      <ion-list *ngIf="!loading">
        <ion-item *ngFor="let user of filteredUsers" button (click)="select(user)">
          <ion-avatar slot="start">
            <img [src]="user.avatarUrls?.['48x48']" *ngIf="user.avatarUrls?.['48x48']" />
            <ion-icon name="person-circle-outline" *ngIf="!user.avatarUrls?.['48x48']" size="large"></ion-icon>
          </ion-avatar>
          <ion-label>
            <h3>{{ user.displayName }}</h3>
            <p>{{ user.emailAddress }}</p>
          </ion-label>
        </ion-item>
        
        <ion-item *ngIf="filteredUsers.length === 0 && !loading" lines="none">
          <ion-label class="ion-text-center" color="medium">
            No users found
          </ion-label>
        </ion-item>
      </ion-list>
    </ion-content>
  `,
  styles: [`
    ion-avatar {
        --border-radius: 50%;
    }
  `]
})
export class UserSelectComponent implements OnInit {
  @Input() projectKey: string = '';

  allUsers: any[] = [];
  filteredUsers: any[] = [];
  searchQuery: string = '';
  loading = true;

  constructor(
    private modalCtrl: ModalController,
    private http: HttpClient
  ) { }

  async ngOnInit() {
    this.loadUsers();
  }

  async loadUsers() {
    this.loading = true;
    try {
      // NOTE: We fetch ALL assignable users first to allow client-side filtering.
      // If the list is huge (thousands), this might need server-side search instead.
      // But user requested "show all list with filter capability".
      // Assuming typical project size.
      // Passing empty query might return default set or we might need a specific endpoint to list all.
      // Switching to Global User Search as requested.
      // Fetches all users in the instance (up to 1000 limit from backend).
      // Filter: Active users only AND accountType == 'atlassian' (humans) to exclude bots/apps.
      const users = await firstValueFrom(this.http.get<any[]>('/api/users'));
      const rawList = Array.isArray(users) ? users : (users as any).values || [];

      this.allUsers = rawList.filter((u: any) => u.active && u.accountType === 'atlassian');
      this.filteredUsers = [...this.allUsers];
    } catch (e) {
      console.error('Failed to load users', e);
    } finally {
      this.loading = false;
    }
  }

  filterList() {
    if (!this.searchQuery) {
      this.filteredUsers = [...this.allUsers];
      return;
    }
    const q = this.searchQuery.toLowerCase();
    this.filteredUsers = this.allUsers.filter(u =>
      (u.displayName && u.displayName.toLowerCase().includes(q)) ||
      (u.emailAddress && u.emailAddress.toLowerCase().includes(q)) ||
      (u.name && u.name.toLowerCase().includes(q))
    );
  }

  cancel() {
    this.modalCtrl.dismiss();
  }

  select(user: any) {
    this.modalCtrl.dismiss({ selectedUser: user });
  }
}
