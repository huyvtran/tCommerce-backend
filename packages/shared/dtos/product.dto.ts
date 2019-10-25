import { MetaTags } from '../../backend/src/shared/models/meta-tags.model';

export class ProductDto {
  name: string;
  slug?: string;
  sku: string;
  qty?: number;
  isEnabled?: boolean;
  categoryIds: string[];
  price?: number;
  meta?: MetaTags;
  fullDescription?: string;
  shortDescription?: string;
  mediaUrls?: string[];
}
