import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';

import { WebAdminCategoriesRoutingModule } from './categories-routing.module';
import { WebAdminCategoriesComponent } from './categories.component';
import { WebAdminCategoryComponent } from './web-admin-category/web-admin-category.component';
import { WebAdminCategoriesService } from './categories.service';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';


@NgModule({
  declarations: [
    WebAdminCategoriesComponent,
    WebAdminCategoryComponent
  ],
  imports: [
    CommonModule,
    WebAdminCategoriesRoutingModule,
    ReactiveFormsModule,
    FormsModule
  ],
  providers: [
    WebAdminCategoriesService
  ]
})
export class WebAdminCategoriesModule { }