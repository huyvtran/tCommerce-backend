import { Expose } from 'class-transformer';

export class SettlementDto {

  @Expose()
  id: string;

  @Expose()
  fullName: string;

  @Expose()
  name: string;

  ruName: string;

  priority?: number;

}
