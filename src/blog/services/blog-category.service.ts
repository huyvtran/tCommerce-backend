import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { AdminBlogCategoryCreateOrUpdateDto, AdminBlogCategoryDto } from '../../shared/dtos/admin/blog-category.dto';
import { InjectModel } from '@nestjs/mongoose';
import { DocumentType, ReturnModelType } from '@typegoose/typegoose';
import { BlogCategory } from '../models/blog-category.model';
import { CounterService } from '../../shared/services/counter/counter.service';
import { PageRegistryService } from '../../page-registry/page-registry.service';
import { PageTypeEnum } from '../../shared/enums/page-type.enum';
import { BlogPostService } from './blog-post.service';
import { plainToClass } from 'class-transformer';
import { CronProdPrimaryInstance } from '../../shared/decorators/primary-instance-cron.decorator';
import { getCronExpressionEarlyMorning } from '../../shared/helpers/get-cron-expression-early-morning.function';
import { AdminSPFDto } from '../../shared/dtos/admin/spf.dto';
import { SearchService } from '../../shared/services/search/search.service';
import { ElasticBlogCategory } from '../models/elastic-blog-category.model';
import { ResponseDto } from '../../shared/dtos/shared-dtos/response.dto';
import { __ } from '../../shared/helpers/translate/translate.function';

@Injectable()
export class BlogCategoryService {

  private logger = new Logger(BlogCategoryService.name);

  constructor(@InjectModel(BlogCategory.name) private readonly blogCategoryModel: ReturnModelType<typeof BlogCategory>,
              private readonly counterService: CounterService,
              private readonly pageRegistryService: PageRegistryService,
              private readonly blogPostService: BlogPostService,
              private readonly searchService: SearchService
  ) { }

  onApplicationBootstrap(): any {
    this.searchService.ensureCollection(BlogCategory.collectionName, new ElasticBlogCategory());
    // this.reindexAllSearchData();
  }

  async getBlogCategoriesResponseDto(spf: AdminSPFDto): Promise<ResponseDto<AdminBlogCategoryDto[]>> {
    let blogCategorys: AdminBlogCategoryDto[];
    let itemsFiltered: number;

    if (spf.hasFilters()) {
      const searchResponse = await this.searchByFilters(spf);
      blogCategorys = searchResponse[0];
      itemsFiltered = searchResponse[1];
    } else {
      blogCategorys = await this.blogCategoryModel
        .find()
        .sort(spf.getSortAsObj())
        .skip(spf.skip)
        .limit(spf.limit)
        .exec();

      blogCategorys = plainToClass(AdminBlogCategoryDto, blogCategorys, { excludeExtraneousValues: true });
    }

    const itemsTotal = await this.countBlogCategorys();
    const pagesTotal = Math.ceil((itemsFiltered ?? itemsTotal) / spf.limit);
    return {
      data: blogCategorys,
      itemsTotal,
      itemsFiltered,
      pagesTotal
    };
  }

  async getBlogCategory(id: string): Promise<DocumentType<BlogCategory>> {
    const found = await this.blogCategoryModel.findById(id).exec();
    if (!found) {
      throw new NotFoundException(__('Blog сategory with id "$1" not found', 'ru', id));
    }

    return found;
  }

  async createBlogCategory(createDto: AdminBlogCategoryCreateOrUpdateDto): Promise<BlogCategory> {
    const session = await this.blogCategoryModel.db.startSession();
    session.startTransaction();

    try {
      const created = new this.blogCategoryModel(createDto);
      created.id = await this.counterService.getCounter(BlogCategory.collectionName, session);
      await created.save({ session });
      await this.pageRegistryService.createPageRegistry({ slug: created.slug, type: PageTypeEnum.BlogCategory }, session);

      await session.commitTransaction();
      return created.toJSON();
    } catch (e) {
      await session.abortTransaction();
      throw e;
    } finally {
      await session.endSession();
    }
  }

  async updateBlogCategory(blogCategoryId: string, blogCategoryDto: AdminBlogCategoryCreateOrUpdateDto): Promise<DocumentType<BlogCategory>> {
    const blogCategory = await this.getBlogCategory(blogCategoryId);

    Object.keys(blogCategoryDto).forEach(key => blogCategory[key] = blogCategoryDto[key]);

    await blogCategory.save();
    this.updateSearchData(blogCategory);

    return blogCategory;
  }

  async deleteBlogCategory(blogCategoryId: string): Promise<DocumentType<BlogCategory>> {
    const deleted = await this.blogCategoryModel.findByIdAndDelete(blogCategoryId).exec();
    if (!deleted) {
      throw new NotFoundException(__('Blog сategory with id "$1" not found', 'ru', blogCategoryId));
    }
    this.deleteSearchData(deleted);

    return deleted;
  }

  countBlogCategorys(): Promise<number> {
    return this.blogCategoryModel.estimatedDocumentCount().exec();
  }

  async getAllEnabledCategories(): Promise<BlogCategory[]> {
    const categories = await this.blogCategoryModel.find({ isEnabled: true }).exec();

    return categories
      .map(c => c.toJSON())
      .sort(((a, b) => b.sortOrder - a.sortOrder));
  }

  async getEnabledCategoryBySlug(slug: string): Promise<BlogCategory> {
    const category = await this.blogCategoryModel.findOne({ slug, isEnabled: true }).exec();
    if (!category) {
      throw new NotFoundException();
    }

    return category.toJSON();
  }

  async populateCategoriesWithPostsCount(categories: BlogCategory[]): Promise<BlogCategory[] & { postsCount:number }[]> {
    const result = [];

    for (const category of categories) {
      const postsCount = await this.blogPostService.countPosts({ categoryId: category.id });
      result.push({
        ...category,
        postsCount
      });
    }

    return result;
  }

  private async addSearchData(blogCategory: BlogCategory) {
    const blogCategoryDto = plainToClass(AdminBlogCategoryDto, blogCategory, { excludeExtraneousValues: true });
    await this.searchService.addDocument(BlogCategory.collectionName, blogCategory.id, blogCategoryDto);
  }

  private updateSearchData(blogCategory: BlogCategory): Promise<any> {
    const blogCategoryDto = plainToClass(AdminBlogCategoryDto, blogCategory, { excludeExtraneousValues: true });
    return this.searchService.updateDocument(BlogCategory.collectionName, blogCategory.id, blogCategoryDto);
  }

  private deleteSearchData(blogCategory: BlogCategory): Promise<any> {
    return this.searchService.deleteDocument(BlogCategory.collectionName, blogCategory.id);
  }

  @CronProdPrimaryInstance(getCronExpressionEarlyMorning())
  private async reindexAllSearchData() {
    this.logger.log('Start reindex all search data');
    const blogCategorys = await this.blogCategoryModel.find().exec();

    await this.searchService.deleteCollection(BlogCategory.collectionName);
    await this.searchService.ensureCollection(BlogCategory.collectionName, new ElasticBlogCategory());

    for (const batch of getBatches(blogCategorys, 20)) {
      await Promise.all(batch.map(blogCategory => this.addSearchData(blogCategory)));
      this.logger.log(`Reindexed ids: ${batch.map(i => i.id).join()}`);
    }

    function getBatches<T = any>(arr: T[], size: number = 2): T[][] {
      const result = [];
      for (let i = 0; i < arr.length; i++) {
        if (i % size !== 0) {
          continue;
        }

        const resultItem = [];
        for (let k = 0; (resultItem.length < size && arr[i + k]); k++) {
          resultItem.push(arr[i + k]);
        }
        result.push(resultItem);
      }

      return result;
    }
  }

  private async searchByFilters(spf: AdminSPFDto) {
    return this.searchService.searchByFilters<AdminBlogCategoryDto>(
      BlogCategory.collectionName,
      spf.getNormalizedFilters(),
      spf.skip,
      spf.limit,
      spf.getSortAsObj(),
      undefined,
      new ElasticBlogCategory()
    );
  }
}
