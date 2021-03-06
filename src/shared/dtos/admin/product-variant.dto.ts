import { Exclude, Expose, Transform, Type } from 'class-transformer';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, ValidateNested } from 'class-validator';
import { AdminMediaDto } from './media.dto';
import { AdminProductSelectedAttributeDto } from './product-selected-attribute.dto';
import { transliterate } from '../../helpers/transliterate.function';
import { CurrencyCodeEnum } from '../../enums/currency.enum';
import { MetaTagsDto } from '../shared-dtos/meta-tags.dto';
import { ProductVariantWithQty } from '../../../product/models/product-with-qty.model';
import { AdminLinkedProductDto } from './linked-product.dto';
import { TrimString } from '../../decorators/trim-string.decorator';

export class AdminAddOrUpdateProductVariantDto {
  @Exclude()
  _id: string;

  @Expose()
  @Transform(((value, obj) => obj._id || value))
  id: string;

  @Expose()
  @IsString()
  @TrimString()
  name: string;

  @Expose()
  sku: string;

  @Expose()
  @IsOptional()
  @IsString()
  @TrimString()
  vendorCode: string;

  @Expose()
  @IsOptional()
  @IsString()
  @TrimString()
  gtin: string;

  @Expose()
  @IsString()
  @TrimString()
  @Transform((slug, variant) => slug === '' ? transliterate(variant.name) : slug)
  slug: string;

  @IsBoolean()
  @IsOptional()
  createRedirect: boolean;

  @Expose()
  @ValidateNested({ each: true })
  @Type(() => AdminProductSelectedAttributeDto)
  attributes: AdminProductSelectedAttributeDto[];

  @Expose()
  @IsBoolean()
  isEnabled: boolean;

  @Expose()
  @Transform(price => parseFloat(price))
  @IsNumber()
  price: number;

  @Expose()
  @IsOptional()
  @Transform(oldPrice => oldPrice ? parseFloat(oldPrice) : oldPrice)
  @IsNumber()
  oldPrice: number;

  @Expose()
  @IsEnum(CurrencyCodeEnum)
  currency: CurrencyCodeEnum;

  @Expose()
  @IsOptional()
  @IsNumber()
  priceInDefaultCurrency: number;

  @Expose()
  @IsOptional()
  @IsNumber()
  oldPriceInDefaultCurrency: number;

  @Expose()
  @ValidateNested({ each: true })
  @Type(() => AdminMediaDto)
  medias: AdminMediaDto[];

  @Expose()
  @IsString()
  @TrimString()
  fullDescription: string;

  @Expose()
  @IsString()
  @TrimString()
  shortDescription: string;

  @Expose()
  @ValidateNested()
  metaTags: MetaTagsDto;

  @Expose()
  @Transform((price, obj: ProductVariantWithQty) => price ? parseFloat(price) : obj.qtyInStock)
  @IsNumber()
  qtyInStock: number;

  @Expose()
  @Transform((price, obj: ProductVariantWithQty) => obj.qtyInStock - obj.reserved?.reduce((sum, ordered) => sum + ordered.qty, 0))
  sellableQty: number;

  @Expose()
  @IsBoolean()
  isDiscountApplicable: boolean;

  @Expose()
  @IsOptional()
  @IsNumber()
  salesCount: number;

  @Expose()
  @IsOptional()
  @IsBoolean()
  isIncludedInShoppingFeed: boolean;

  @Expose()
  @IsOptional()
  @IsString()
  @TrimString()
  googleAdsProductTitle: string;

  @Expose()
  @ValidateNested({ each: true })
  @Type(() => AdminLinkedProductDto)
  relatedProducts: AdminLinkedProductDto[];

  @Expose()
  @ValidateNested({ each: true })
  @Type(() => AdminLinkedProductDto)
  crossSellProducts: AdminLinkedProductDto[];
}

export class AdminProductVariantDto extends AdminAddOrUpdateProductVariantDto {
}
