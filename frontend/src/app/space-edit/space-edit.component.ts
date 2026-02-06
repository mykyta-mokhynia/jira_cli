import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IonicModule } from '@ionic/angular';
import { HttpClient } from '@angular/common/http';
import { forkJoin } from 'rxjs';

interface Project {
  id: string;
  key: string;
  name: string;
  boards?: Board[];
}

interface Board {
  id: number;
  name: string;
  location?: {
    projectId: number;
    projectKey?: string;
  };
}

import { RouterModule } from '@angular/router';

@Component({
  selector: 'app-space-edit',
  template: `
    <ion-header>
      <ion-toolbar color="primary">
        <ion-buttons slot="start">
          <ion-back-button defaultHref="/home"></ion-back-button>
        </ion-buttons>
        <ion-title>Space Edit</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-grid *ngIf="!loading; else loader">
        <ion-row>
          <ion-col size="12" size-md="6" size-lg="4" *ngFor="let project of projects">
            <ion-card [routerLink]="['/space-edit', project.key]" button>
              <ion-card-header>
                <ion-card-title>{{ project.name }}</ion-card-title>
                <ion-card-subtitle>{{ project.key }}</ion-card-subtitle>
              </ion-card-header>
              <ion-card-content>
                <ion-list lines="none">
                  <ion-item *ngIf="!project.boards?.length">
                    <ion-label color="medium">No boards</ion-label>
                  </ion-item>
                  <ion-item *ngFor="let board of project.boards">
                    <ion-icon name="list-outline" slot="start" size="small"></ion-icon>
                    <ion-label>{{ board.name }}</ion-label>
                  </ion-item>
                </ion-list>
              </ion-card-content>
            </ion-card>
          </ion-col>
        </ion-row>
      </ion-grid>

      <ng-template #loader>
        <div class="ion-text-center ion-padding">
          <ion-spinner></ion-spinner>
          <p>Loading projects and boards...</p>
        </div>
      </ng-template>
    </ion-content>
  `,
  standalone: true,
  imports: [CommonModule, IonicModule, RouterModule],
  styleUrls: ['./space-edit.component.scss']
})
export class SpaceEditComponent implements OnInit {
  projects: Project[] = [];
  loading = true;

  constructor(private http: HttpClient) { }

  ngOnInit() {
    this.fetchData();
  }

  fetchData() {
    forkJoin({
      projects: this.http.get<any[]>('/api/projects'),
      boards: this.http.get<any>('/api/boards')
    }).subscribe({
      next: (data) => {
        // Projects from searchProjects are in .values
        const rawProjects = data.projects.values || data.projects;
        const rawBoards = data.boards.values || data.boards || [];

        if (!Array.isArray(rawProjects)) {
          console.error("Expected array for projects but got:", rawProjects);
          this.loading = false;
          return;
        }

        // Map boards to projects
        this.projects = rawProjects.map((p: any) => {
          const boardsArray = Array.isArray(rawBoards) ? rawBoards : [];
          const projectBoards = boardsArray.filter((b: any) =>
            (b.location?.projectKey === p.key) || (b.location?.projectId === p.id)
          );
          return { ...p, boards: projectBoards };
        });

        this.loading = false;
      },
      error: (err) => {
        console.error('Error fetching data', err);
        alert('Failed to load data. See console.');
        this.loading = false;
      }
    });
  }
}
