import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface JiraInstance {
  id: string;
  name: string;
  host: string;
  email: string;
  apiToken: string;
  createdAt?: string;
  updatedAt?: string;
}

@Injectable({
  providedIn: 'root'
})
export class InstanceService {
  private readonly baseUrl = '/api/instances';

  constructor(private http: HttpClient) { }

  listInstances(): Observable<JiraInstance[]> {
    return this.http.get<JiraInstance[]>(this.baseUrl);
  }

  getSelectedInstance(): Observable<JiraInstance | null> {
    return this.http.get<JiraInstance | null>(`${this.baseUrl}/selected`);
  }

  createInstance(payload: Omit<JiraInstance, 'id' | 'createdAt' | 'updatedAt'>): Observable<JiraInstance> {
    return this.http.post<JiraInstance>(this.baseUrl, payload);
  }

  updateInstance(id: string, payload: Partial<Omit<JiraInstance, 'id' | 'createdAt' | 'updatedAt'>>): Observable<JiraInstance> {
    return this.http.put<JiraInstance>(`${this.baseUrl}/${id}`, payload);
  }

  deleteInstance(id: string): Observable<{ success: boolean }> {
    return this.http.delete<{ success: boolean }>(`${this.baseUrl}/${id}`);
  }

  selectInstance(id: string): Observable<{ success: boolean; selectedInstanceId: string }> {
    return this.http.post<{ success: boolean; selectedInstanceId: string }>(`${this.baseUrl}/${id}/select`, {});
  }
}
