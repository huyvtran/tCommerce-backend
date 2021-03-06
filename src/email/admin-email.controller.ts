import { BadRequestException, Body, Controller, Param, Post, UseGuards } from '@nestjs/common';
import { EmailService } from './email.service';
import { OrderService } from '../order/order.service';
import { UserJwtGuard } from '../auth/guards/user-jwt.guard';
import { ModuleRef } from '@nestjs/core';
import { __ } from '../shared/helpers/translate/translate.function';
import { ProductReviewService } from '../reviews/product-review/product-review.service';
import { StoreReviewService } from '../reviews/store-review/store-review.service';

@UseGuards(UserJwtGuard)
@Controller('admin/email-test')
export class AdminEmailController {

  private testFirstName = 'Тарас';
  private testLastName = 'Шевченко';

  constructor(private readonly emailService: EmailService,
              private readonly moduleRef: ModuleRef) {
  }

  @Post('order-confirmation/:orderId')
  async sendTestOrderConfirmEmail(@Param('orderId') orderId: number, @Body() body: any) {
    if (!body.email) {
      throw new BadRequestException(__('No "email" in payload', 'ru'));
    }

    const orderService = this.moduleRef.get(OrderService, { strict: false });
    const order = await orderService.getOrderById(parseInt(orderId as any));
    order.customerEmail = body.email;

    return this.emailService.sendOrderConfirmationEmail(order, false);
  }

  @Post('leave-review/:orderId')
  async sendTestLeaveReviewEmail(@Param('orderId') orderId: number, @Body() body: any) {
    if (!body.email) {
      throw new BadRequestException(__('No "email" in payload', 'ru'));
    }

    const orderService = this.moduleRef.get(OrderService, { strict: false });
    const order = await orderService.getOrderById(parseInt(orderId as any));
    order.customerEmail = body.email;

    return this.emailService.sendLeaveReviewEmail(order);
  }

  @Post('email-confirmation')
  async sendEmailConfirmationEmail(@Body() body: any) {
    if (!body.email) {
      throw new BadRequestException(__('No "email" in payload', 'ru'));
    }

    const customer: any = {
      email: body.email,
      firstName: this.testFirstName,
      lastName: this.testLastName
    };

    return this.emailService.sendEmailConfirmationEmail(customer, 'token');
  }

  @Post('registration-success')
  async sendRegisterSuccessEmail(@Body() body: any) {
    if (!body.email) {
      throw new BadRequestException(__('No "email" in payload', 'ru'));
    }

    const customer: any = {
      email: body.email,
      firstName: this.testFirstName,
      lastName: this.testLastName
    };

    return this.emailService.sendRegisterSuccessEmail(customer, 'token');
  }

  @Post('reset-password')
  async sendResetPasswordEmail(@Body() body: any) {
    if (!body.email) {
      throw new BadRequestException(__('No "email" in payload', 'ru'));
    }

    const customer: any = {
      email: body.email,
      firstName: this.testFirstName,
      lastName: this.testLastName
    };

    return this.emailService.sendResetPasswordEmail(customer, 'token');
  }

  @Post('new-product-review/:reviewId')
  async sendTestNewProductReviewEmail(@Param('reviewId') reviewId: string, @Body() body: any) {
    if (!body.email) {
      throw new BadRequestException(__('No "email" in payload', 'ru'));
    }

    const productReviewService = this.moduleRef.get(ProductReviewService, { strict: false });
    const review = await productReviewService.findReview(reviewId);

    return this.emailService.sendNewProductReviewEmail(review, body.email);
  }

  @Post('new-store-review/:reviewId')
  async sendTestNewStoreReviewEmail(@Param('reviewId') reviewId: string, @Body() body: any) {
    if (!body.email) {
      throw new BadRequestException(__('No "email" in payload', 'ru'));
    }

    const storeReviewService = this.moduleRef.get(StoreReviewService, { strict: false });
    const review = await storeReviewService.findReview(reviewId);

    return this.emailService.sendNewStoreReviewEmail(review, body.email);
  }
}
