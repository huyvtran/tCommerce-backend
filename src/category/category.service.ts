import { BadRequestException, forwardRef, Inject, Injectable, Logger, NotFoundException, OnApplicationBootstrap } from '@nestjs/common';
import { Category } from './models/category.model';
import { PageRegistryService } from '../page-registry/page-registry.service';
import { ProductService } from '../product/services/product.service';
import { InjectModel } from '@nestjs/mongoose';
import { DocumentType, ReturnModelType } from '@typegoose/typegoose';
import { AdminAddOrUpdateCategoryDto, AdminCategoryDto } from '../shared/dtos/admin/category.dto';
import { CounterService } from '../shared/services/counter/counter.service';
import { transliterate } from '../shared/helpers/transliterate.function';
import { plainToClass } from 'class-transformer';
import { ClientSession } from 'mongoose';
import { CategoryTreeItem } from '../shared/dtos/shared-dtos/category.dto';
import { Breadcrumb } from '../shared/models/breadcrumb.model';
import { ReorderPositionEnum } from '../shared/enums/reorder-position.enum';
import { __ } from '../shared/helpers/translate/translate.function';
import { PageTypeEnum } from '../shared/enums/page-type.enum';
import { MediaService } from '../shared/services/media/media.service';
import { Media } from '../shared/models/media.model';
import { FastifyRequest } from 'fastify';
import { ClientCategoryDto } from '../shared/dtos/client/category.dto';
import { ClientLinkedCategoryDto } from '../shared/dtos/client/linked-category.dto';
import { CronProdPrimaryInstance } from '../shared/decorators/primary-instance-cron.decorator';
import { getCronExpressionEarlyMorning } from '../shared/helpers/get-cron-expression-early-morning.function';
import { AdminSPFDto } from '../shared/dtos/admin/spf.dto';
import { SearchService } from '../shared/services/search/search.service';
import { ElasticCategory } from './models/elastic-category.model';
import { IFilter, ISorting } from '../shared/dtos/shared-dtos/spf.dto';

@Injectable()
export class CategoryService implements OnApplicationBootstrap {

  private logger = new Logger(CategoryService.name);

  constructor(@InjectModel(Category.name) private readonly categoryModel: ReturnModelType<typeof Category>,
              @Inject(forwardRef(() => ProductService)) private productService: ProductService,
              private readonly pageRegistryService: PageRegistryService,
              private readonly counterService: CounterService,
              private readonly mediaService: MediaService,
              private readonly searchService: SearchService
  ) { }

  async onApplicationBootstrap() {
    this.searchService.ensureCollection(Category.collectionName, new ElasticCategory());
  }

  async getAllCategories(): Promise<Category[]> { // todo cache
    let categories = await this.categoryModel.find().exec();
    categories = categories
      .sort((a, b) => a.reversedSortOrder - b.reversedSortOrder)
      .map(category => category.toJSON());

    return categories;
  }

  async getCategoriesTree(options: { onlyEnabled?: boolean, noClones?: boolean, adminTree?: boolean } = { }): Promise<CategoryTreeItem[]> {
    const treeItems: CategoryTreeItem[] = [];
    const childrenMap: { [parentId: number]: CategoryTreeItem[] } = {};

    const allCategories = await this.getAllCategories();
    for (let category of allCategories) {

      if (options.onlyEnabled && category.isEnabled === false) { continue; }
      if (options.noClones && CategoryService.isClone(category)) { continue; }

      category = this.handleCloneCategory(category, allCategories, options.adminTree);

      const item: CategoryTreeItem = plainToClass(CategoryTreeItem, category, { excludeExtraneousValues: true });
      item.children = [];

      if (category.parentId === 0) {
        treeItems.push(item);
        continue;
      }

      childrenMap[category.parentId] = childrenMap[category.parentId] || [];
      childrenMap[category.parentId].push(item);
    }

    const populateChildrenArray = (array: CategoryTreeItem[]) => {
      for (const arrayItem of array) {
        const children = childrenMap[arrayItem.id] || [];
        arrayItem.children.push(...children);

        populateChildrenArray(arrayItem.children);
      }
    };

    populateChildrenArray(treeItems);

    return treeItems;
  }

  async getCategoryById(id: string | number, session?: ClientSession): Promise<DocumentType<Category>> {
    id = parseInt(id as string);

    const found = await this.categoryModel.findById(id).session(session).exec();
    if (!found) {
      throw new NotFoundException(__('Category with id "$1" not found', 'ru', id));
    }

    return found;
  }

  async getClientCategoryBySlug(slug: string): Promise<ClientCategoryDto> {
    const found = await this.categoryModel.findOne({ slug, isEnabled: true }).exec();
    if (!found) {
      throw new NotFoundException(__('Category with slug "$1" not found', 'ru', slug));
    }

    const siblingCategories: ClientLinkedCategoryDto[] = [];
    const childCategories: ClientLinkedCategoryDto[] = [];
    const allCategories = await this.getAllCategories();
    for (let category of allCategories) {
      if (!category.isEnabled) { continue; }

      category = this.handleCloneCategory(category, allCategories, false);

      const linked: ClientLinkedCategoryDto = {
        ...category,
        id: category.id,
        medias: category.medias.filter(media => !media.isHidden),
        isSelected: found.id === category.id
      };

      if (found.parentId === category.parentId) {
        siblingCategories.push(linked);
      } else if (found.id === category.parentId) {
        childCategories.push(linked);
      }
    }

    return plainToClass(ClientCategoryDto, { ...found.toJSON(), siblingCategories, childCategories }, { excludeExtraneousValues: true });
  }

  async getClientSiblingCategories(categoryId: number): Promise<ClientLinkedCategoryDto[]> {
    const found = await this.categoryModel.findById(categoryId).exec();

    const linkedCategories: ClientLinkedCategoryDto[] = [];
    const allCategories = await this.getAllCategories();
    for (let category of allCategories) {
      if (!category.isEnabled) { continue; }
      if (found.parentId !== category.parentId) { continue; }

      category = this.handleCloneCategory(category, allCategories, false);

      linkedCategories.push({
        ...category,
        id: category.id,
        medias: category.medias.filter(media => !media.isHidden),
        isSelected: found.id === category.id
      });
    }

    return linkedCategories;
  }

  async createCategory(categoryDto: AdminAddOrUpdateCategoryDto): Promise<Category> {
    categoryDto.slug = categoryDto.slug === '' ? transliterate(categoryDto.name) : categoryDto.slug;

    const session = await this.categoryModel.db.startSession();
    session.startTransaction();

    try {
      const newCategoryModel = new this.categoryModel(categoryDto);
      newCategoryModel.id = await this.counterService.getCounter(Category.collectionName, session);
      const isClone = Boolean(newCategoryModel.canonicalCategoryId);

      if (isClone) {
        newCategoryModel.slug = `clone-${newCategoryModel.id}`;
      }

      const lastSiblingOrder = await this.getLastSiblingOrder(categoryDto.parentId);
      if (lastSiblingOrder) {
        newCategoryModel.reversedSortOrder = lastSiblingOrder + 1;
      }

      newCategoryModel.breadcrumbs = await this.buildBreadcrumbs(newCategoryModel);

      const { tmpMedias, savedMedias } = await this.mediaService.checkTmpAndSaveMedias(categoryDto.medias, Category.collectionName);
      newCategoryModel.medias = savedMedias;

      await newCategoryModel.save({ session });
      if (!isClone) {
        await this.createCategoryPageRegistry(newCategoryModel.slug, session);
      }
      await session.commitTransaction();

      this.addSearchData(newCategoryModel).then();
      this.mediaService.deleteTmpMedias(tmpMedias, Category.collectionName).then();

      return plainToClass(Category, newCategoryModel.toJSON());
    } catch (ex) {
      await session.abortTransaction();
      throw ex;
    } finally {
      await session.endSession();
    }
  }

  async updateCategory(categoryId: number, categoryDto: AdminAddOrUpdateCategoryDto): Promise<Category> {
    const session = await this.categoryModel.db.startSession();
    session.startTransaction();

    try {
      const category = await this.getCategoryById(categoryId, session);
      const oldSlug = category.slug;
      const oldName = category.name;
      const oldIsEnabled = category.isEnabled;

      const mediasToDelete: Media[] = [];
      for (const media of category.medias) {
        const isMediaInDto = categoryDto.medias.find(dtoMedia => dtoMedia.variantsUrls.original === media.variantsUrls.original);
        if (!isMediaInDto) {
          mediasToDelete.push(media);
        }
      }

      const { tmpMedias, savedMedias } = await this.mediaService.checkTmpAndSaveMedias(categoryDto.medias, Category.collectionName);
      categoryDto.medias = savedMedias;

      Object.keys(categoryDto).forEach(key => {
        if (categoryDto[key] !== undefined && key !== 'id') {
          category[key] = categoryDto[key];
        }
      });

      if (category.parentId !== categoryDto.parentId) {
        category.breadcrumbs = await this.buildBreadcrumbs(category);
      }
      if (oldSlug !== categoryDto.slug) {
        await this.updateCategoryPageRegistry(oldSlug, categoryDto.slug, categoryDto.createRedirect, session);
      }
      if (oldSlug !== categoryDto.slug || oldName !== categoryDto.name || oldIsEnabled !== categoryDto.isEnabled) {
        await this.productService.updateProductCategory(categoryId, categoryDto.name, categoryDto.slug, categoryDto.isEnabled, session);
        await this.updateBreadcrumbs(categoryId, categoryDto.name, categoryDto.slug, categoryDto.isEnabled, session)
      }

      const saved = await category.save({ session });
      await session.commitTransaction();

      this.updateSearchData(saved).then();
      this.mediaService.deleteTmpMedias(tmpMedias, Category.collectionName).then();
      this.mediaService.deleteSavedMedias(mediasToDelete, Category.collectionName).then();

      return saved.toJSON();

    } catch (ex) {
      await session.abortTransaction();
      throw ex;
    } finally {
      session.endSession();
    }
  }

  async deleteCategory(categoryId: number): Promise<DocumentType<Category>> {
    const session = await this.categoryModel.db.startSession();
    session.startTransaction();

    try {
      const deleted = await this.categoryModel.findByIdAndDelete(categoryId).session(session).exec();
      if (deleted === null) {
        throw new NotFoundException(__('Category with id "$1" not found', 'ru', categoryId));
      }

      await this.categoryModel
        .updateMany({ parentId: deleted._id }, { parentId: deleted.parentId })
        .session(session)
        .exec();

      await this.productService.removeCategoryId(categoryId, session);
      await this.deleteCategoryPageRegistry(deleted.slug, session);
      await session.commitTransaction();

      this.deleteSearchData(deleted).then();
      this.mediaService.deleteSavedMedias(deleted.medias, Category.collectionName).then();

      return deleted.toJSON();
    } catch (ex) {
      await session.abortTransaction();
      throw ex;
    } finally {
      session.endSession();
    }
  }

  async searchEnabledByName(spf: AdminSPFDto, name: string): Promise<AdminCategoryDto[]> {
    const nameProp: keyof AdminCategoryDto = 'name';
    const isEnabledProp: keyof AdminCategoryDto = 'isEnabled';
    const sortProp: keyof AdminCategoryDto = 'reversedSortOrder';

    const filters: IFilter[] = [
      { fieldName: nameProp, values: [name] },
      { fieldName: isEnabledProp, values: [true] }
    ];
    const sorting: ISorting = { [sortProp]: 'asc' };

    const [categories] = await this.searchByFilters(spf, filters, sorting);

    return categories;
  }

  private createCategoryPageRegistry(slug: string, session: ClientSession) {
    return this.pageRegistryService.createPageRegistry({
      slug,
      type: PageTypeEnum.Category
    }, session);
  }

  private updateCategoryPageRegistry(oldSlug: string, newSlug: string, createRedirect: boolean, session: ClientSession) {
    return this.pageRegistryService.updatePageRegistry({
      oldSlug,
      newSlug,
      type: PageTypeEnum.Category,
      createRedirect
    }, session);
  }

  private deleteCategoryPageRegistry(slug: string, session: ClientSession) {
    return this.pageRegistryService.deletePageRegistry(slug, session);
  }

  private async buildBreadcrumbs(category: Category, allCategories?: Category[]): Promise<Breadcrumb[]> {
    if (!category.parentId) { return []; }

    if (!allCategories) {
      allCategories = await this.getAllCategories();
    }
    const breadcrumbs: Breadcrumb[] = [];
    let parentId = category.parentId;

    while (parentId) {
      let parent = allCategories.find(c => c.id === parentId);
      parent = this.handleCloneCategory(parent, allCategories, false);

      breadcrumbs.unshift({
        id: parent.id,
        name: parent.name,
        slug: parent.slug,
        isEnabled: parent.isEnabled
      });

      parentId = parent.parentId;
    }

    return breadcrumbs;
  }

  async reoderCategory(categoryId: number, targetCategoryId: number, position: ReorderPositionEnum) {
    const category = await this.categoryModel.findById(categoryId).exec();
    if (!category) { throw new BadRequestException(__('Category with id "$1" not found', 'ru', categoryId)); }

    const targetCategory = await this.categoryModel.findById(targetCategoryId).exec();
    if (!targetCategory) { throw new BadRequestException(__('Category with id "$1" not found', 'ru', targetCategoryId)); }

    const session = await this.categoryModel.db.startSession();
    session.startTransaction();

    try {

      if (position === ReorderPositionEnum.Inside) {

        if (category.parentId !== targetCategoryId) {
          category.parentId = targetCategoryId;
          const lastSiblingOrder = await this.getLastSiblingOrder(category.parentId);
          category.reversedSortOrder = lastSiblingOrder ? lastSiblingOrder + 1 : 0;
          await category.save({ session });
        }

      } else {
        let filterOperator;
        let newOrder;
        if (position === ReorderPositionEnum.Start) {
          filterOperator = '$gte';
          newOrder = targetCategory.reversedSortOrder;
        } else if (position === ReorderPositionEnum.End) {
          filterOperator = '$gt';
          newOrder = targetCategory.reversedSortOrder + 1;
        }

        const sortProp: keyof Category = 'reversedSortOrder';
        await this.categoryModel.updateMany(
          { [sortProp]: { [filterOperator]: targetCategory.reversedSortOrder } },
          { $inc: { [sortProp]: 1 } }
        ).session(session).exec();

        category.parentId = targetCategory.parentId;
        category.reversedSortOrder = newOrder;
        await category.save({ session });
      }

      this.reindexAllSearchData();

      await session.commitTransaction();
    } catch (ex) {
      await session.abortTransaction();
      throw ex;
    } finally {
      await session.endSession();
    }
  }

  private async getLastSiblingOrder(parentId: number): Promise<number | undefined> {
    const sortProp: keyof Category = 'reversedSortOrder';
    const lastSibling = await this.categoryModel
      .findOne({ parentId })
      .sort({ [sortProp]: 'desc' })
      .exec();

    if (lastSibling) {
      return lastSibling.reversedSortOrder + 1;
    }
  }

  uploadMedia(request: FastifyRequest): Promise<Media> {
    return this.mediaService.upload(request, Category.collectionName);
  }

  private async updateBreadcrumbs(categoryId: number, name: string, slug: string, isEnabled: boolean, session: ClientSession): Promise<void> {
    const breadcrumbsProp: keyof Category = 'breadcrumbs';
    const breadcrumbIdProp: keyof Breadcrumb = 'id';
    const breadcrumbNameProp: keyof Breadcrumb = 'name';
    const breadcrumbSlugProp: keyof Breadcrumb = 'slug';
    const breadcrumbIsEnabledProp: keyof Breadcrumb = 'isEnabled';

    await this.categoryModel.updateMany(
      { [`${breadcrumbsProp}.${breadcrumbIdProp}`]: categoryId },
      {
        $set: {
          [`${breadcrumbsProp}.$.${breadcrumbNameProp}`]: name,
          [`${breadcrumbsProp}.$.${breadcrumbSlugProp}`]: slug,
          [`${breadcrumbsProp}.$.${breadcrumbIsEnabledProp}`]: isEnabled
        }
      }
    ).session(session).exec();
  }

  private async addSearchData(category: Category) {
    const categoryDto = plainToClass(AdminCategoryDto, category, { excludeExtraneousValues: true });
    await this.searchService.addDocument(Category.collectionName, category.id, categoryDto);
  }

  private updateSearchData(category: Category): Promise<any> {
    const categoryDto = plainToClass(AdminCategoryDto, category, { excludeExtraneousValues: true });
    return this.searchService.updateDocument(Category.collectionName, category.id, categoryDto);
  }

  private deleteSearchData(category: Category): Promise<any> {
    return this.searchService.deleteDocument(Category.collectionName, category.id);
  }

  @CronProdPrimaryInstance(getCronExpressionEarlyMorning())
  private async reindexAllSearchData() {
    this.logger.log('Start reindex all search data');
    const categorys = await this.categoryModel.find().exec();

    await this.searchService.deleteCollection(Category.collectionName);
    await this.searchService.ensureCollection(Category.collectionName, new ElasticCategory());

    for (const batch of getBatches(categorys, 20)) {
      await Promise.all(batch.map(category => this.addSearchData(category)));
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

  private async searchByFilters(spf: AdminSPFDto, filters?: IFilter[], sorting?: ISorting) {
    if (!filters) {
      filters = spf.getNormalizedFilters();
    }
    if (!sorting) {
      sorting = spf.getSortAsObj();
    }

    return this.searchService.searchByFilters<AdminCategoryDto>(
      Category.collectionName,
      filters,
      spf.skip,
      spf.limit,
      sorting,
      undefined,
      new ElasticCategory()
    );
  }

  private handleCloneCategory(category: Category, allCategories: Category[], adminView: boolean): Category {
    if (!CategoryService.isClone(category)) {
      return category;
    }

    let source = allCategories.find(c => c.id === category.canonicalCategoryId);
    if (!source) {
      return category;
    }

    source = plainToClass(Category, source);
    source.name = category.name;
    source.parentId = category.parentId;
    if (adminView) {
      source.id = category.id;
      source._id = category.id;
    }

    return source;
  }

  private static isClone(category: Category): boolean {
    return Boolean(category.canonicalCategoryId);
  }
}
