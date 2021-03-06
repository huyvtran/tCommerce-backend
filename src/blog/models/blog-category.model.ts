import { getModelForClass, prop } from '@typegoose/typegoose';
import { Expose } from 'class-transformer';
import { MetaTags } from '../../shared/models/meta-tags.model';

export class BlogCategory {
  @prop()
  _id: number;

  @Expose()
  set id(id: number) { this._id = id; }
  get id(): number { return this._id; }

  @prop({ required: true })
  name: string;

  @prop({ required: true })
  slug: string;

  @prop({ default: true })
  isEnabled: boolean;

  @prop({ default: 0 })
  sortOrder: number;

  @prop({ _id: false })
  metaTags: MetaTags;

  @prop()
  content: string;


  static collectionName: string = 'blog-category';
}

export const BlogCategoryModel = getModelForClass(BlogCategory, {
  schemaOptions: {
    toJSON: {
      virtuals: true
    },
    timestamps: true
  }
})
