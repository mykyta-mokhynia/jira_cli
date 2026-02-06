import { Component, OnInit } from '@angular/core';
import { Router } from '@angular/router';
import { InstanceService, JiraInstance } from '../services/instance.service';
import { HttpErrorResponse } from '@angular/common/http';
import { JiraService } from '../services/jira.service';

interface Automation {
  id: string;
  title: string;
  description: string;
  icon: string;
}

@Component({
  selector: 'app-home',
  templateUrl: 'home.page.html',
  styleUrls: ['home.page.scss'],
  standalone: false,
})
export class HomePage implements OnInit {
  instances: JiraInstance[] = [];
  selectedInstanceId: string | null = null;
  isModalOpen = false;
  isSaving = false;
  editingInstanceId: string | null = null;
  errorMessage = '';
  currentUserAvatarUrl = '';
  currentUserDisplayName = '';

  form = {
    name: '',
    host: '',
    email: '',
    apiToken: ''
  };

  automations: Automation[] = [
    {
      id: 'space-edit',
      title: 'Space Edit',
      description: 'Configure and manage Jira Space settings.',
      icon: 'settings-outline'
    },
    {
      id: 'apply-template',
      title: 'Apply Project Template',
      description: 'Standardize project groups and schemes.',
      icon: 'construct-outline'
    }
  ];

  constructor(
    private router: Router,
    private instanceService: InstanceService,
    private jiraService: JiraService
  ) { }

  ngOnInit() {
    this.loadInstances();
  }

  get activeInstance(): JiraInstance | undefined {
    return this.instances.find((instance) => instance.id === this.selectedInstanceId);
  }

  loadInstances() {
    this.instanceService.listInstances().subscribe({
      next: (instances) => {
        this.instances = instances;
        this.loadSelectedInstance();
      },
      error: () => {
        this.errorMessage = 'Failed to load instances.';
      }
    });
  }

  loadSelectedInstance() {
    this.instanceService.getSelectedInstance().subscribe({
      next: (instance) => {
        this.selectedInstanceId = instance?.id || null;
        if (this.selectedInstanceId) {
          this.loadCurrentUser();
        } else {
          this.currentUserAvatarUrl = '';
          this.currentUserDisplayName = '';
        }
      },
      error: () => {
        this.selectedInstanceId = null;
        this.currentUserAvatarUrl = '';
        this.currentUserDisplayName = '';
      }
    });
  }

  onSelectInstance(instanceId: string) {
    if (!instanceId) return;
    this.errorMessage = '';
    this.instanceService.selectInstance(instanceId).subscribe({
      next: () => {
        this.selectedInstanceId = instanceId;
        this.loadCurrentUser();
      },
      error: (error: HttpErrorResponse) => {
        const serverMessage = error?.error?.error;
        this.errorMessage = serverMessage || 'Failed to select instance.';
      }
    });
  }

  openInstanceModal() {
    this.isModalOpen = true;
    this.errorMessage = '';
  }

  closeInstanceModal() {
    this.isModalOpen = false;
    this.resetForm();
    this.errorMessage = '';
  }

  resetForm() {
    this.editingInstanceId = null;
    this.form = { name: '', host: '', email: '', apiToken: '' };
  }

  startEditInstance(instance: JiraInstance, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.editingInstanceId = instance.id;
    this.form = {
      name: instance.name,
      host: instance.host,
      email: instance.email,
      apiToken: instance.apiToken
    };
  }

  saveInstance() {
    this.errorMessage = '';
    const name = this.form.name.trim();
    const host = this.form.host.trim();
    const email = this.form.email.trim();
    const apiToken = this.form.apiToken.trim();
    if (!name || !host || !email || !apiToken) {
      this.errorMessage = 'Fill in name, host, email and API token.';
      return;
    }

    this.isSaving = true;
    if (this.editingInstanceId) {
      this.instanceService.updateInstance(this.editingInstanceId, { name, host, email, apiToken }).subscribe({
        next: (updated) => {
          this.instances = this.instances.map((item) => (item.id === updated.id ? updated : item));
          if (this.selectedInstanceId === updated.id) {
            this.loadCurrentUser();
          }
          this.resetForm();
          this.isSaving = false;
        },
        error: (error: HttpErrorResponse) => {
          const serverMessage = error?.error?.error;
          this.errorMessage = serverMessage || 'Failed to update instance.';
          this.isSaving = false;
        }
      });
      return;
    }

    this.instanceService.createInstance({ name, host, email, apiToken }).subscribe({
      next: (created) => {
        this.instances = [...this.instances, created];
        this.selectedInstanceId = created.id;
        this.resetForm();
        this.isSaving = false;
        this.loadCurrentUser();
      },
      error: (error: HttpErrorResponse) => {
        const serverMessage = error?.error?.error;
        this.errorMessage = serverMessage || 'Failed to save instance.';
        this.isSaving = false;
      }
    });
  }

  deleteInstance(instance: JiraInstance, event: Event) {
    event.preventDefault();
    event.stopPropagation();
    this.errorMessage = '';

    this.instanceService.deleteInstance(instance.id).subscribe({
      next: () => {
        this.instances = this.instances.filter((item) => item.id !== instance.id);
        if (this.selectedInstanceId === instance.id) {
          this.selectedInstanceId = this.instances[0]?.id || null;
          if (this.selectedInstanceId) {
            this.onSelectInstance(this.selectedInstanceId);
          } else {
            this.currentUserAvatarUrl = '';
            this.currentUserDisplayName = '';
          }
        }
      },
      error: (error: HttpErrorResponse) => {
        const serverMessage = error?.error?.error;
        this.errorMessage = serverMessage || 'Failed to delete instance.';
      }
    });
  }

  loadCurrentUser() {
    this.jiraService.getCurrentUser().subscribe({
      next: (user) => {
        this.currentUserDisplayName = user?.displayName || '';
        this.currentUserAvatarUrl = user?.avatarUrls?.['48x48'] || user?.avatarUrls?.['32x32'] || '';
      },
      error: () => {
        this.currentUserAvatarUrl = '';
        this.currentUserDisplayName = '';
      }
    });
  }

  runAutomation(auto: Automation) {
    if (!this.selectedInstanceId) {
      alert('Please select or create a Jira instance first.');
      return;
    }
    if (auto.id === 'space-edit') {
      this.router.navigate(['/space-edit']);
      return;
    }

    if (auto.id === 'apply-template') {
      this.router.navigate(['/apply-template']);
      return;
    }

  }

}
