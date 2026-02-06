import { ComponentFixture, TestBed, waitForAsync } from '@angular/core/testing';

import { ApplyTemplateComponent } from './apply-template.component';

describe('ApplyTemplateComponent', () => {
  let component: ApplyTemplateComponent;
  let fixture: ComponentFixture<ApplyTemplateComponent>;

  beforeEach(waitForAsync(() => {
    TestBed.configureTestingModule({
      imports: [ApplyTemplateComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ApplyTemplateComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  }));

  it('should create', () => {
    expect(component).toBeTruthy();
  });
});
