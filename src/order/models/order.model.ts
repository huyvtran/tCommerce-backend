import { arrayProp, getModelForClass, prop } from '@typegoose/typegoose';
import { OrderItem } from './order-item.model';
import { OrderStatusEnum } from '../../shared/enums/order-status.enum';
import { Shipment } from './shipment.model';
import { PaymentTypeEnum } from '../../shared/enums/payment-type.enum';
import { __ } from '../../shared/helpers/translate/translate.function';
import { Log } from '../../shared/models/log.model';
import { OrderPrices } from '../../shared/models/order-prices.model';

export class Order {
  @prop()
  _id: number;

  set id(id: number) { this._id = id; }
  get id(): number { return this._id; }

  @prop()
  idForCustomer: string;

  @prop({ index: true })
  customerId: number;

  @prop()
  customerFirstName: string;

  @prop()
  customerLastName: string;

  @prop({ default: '' })
  customerEmail: string;

  @prop({ default: '' })
  customerPhoneNumber: string;

  @prop({ default: '' })
  customerNote: string;

  @prop()
  shouldSaveAddress: boolean;

  @prop({ default: new Date() })
  createdAt: Date;

  @prop({ default: new Date() })
  updatedAt: Date;

  @prop()
  paymentMethodId: string;

  @prop()
  paymentType: PaymentTypeEnum;

  @prop()
  paymentMethodClientName: string;

  @prop()
  paymentMethodAdminName: string;

  @prop()
  shippingMethodName: string;

  @prop()
  isCallbackNeeded: boolean;

  @prop({ default: new Shipment() })
  shipment: Shipment;

  @arrayProp({ items: OrderItem })
  items: OrderItem[];

  @prop()
  state: any;

  @prop()
  status: OrderStatusEnum;

  get statusDescription(): string { return __(this.status, 'ru'); }

  @prop()
  clientNote: string;

  @prop()
  adminNote: string;

  @arrayProp({ items: Log, default: [] })
  logs: Log[];

  @prop()
  prices: OrderPrices;

  @prop({ default: false })
  isOrderPaid: boolean;

  @prop()
  source: 'client' | 'manager';


  static collectionName: string = 'order';
}

export const OrderModel = getModelForClass(Order, {
  schemaOptions: {
    toJSON: {
      virtuals: true
    },
    timestamps: true
  }
});
