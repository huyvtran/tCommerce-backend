import { Expose } from 'class-transformer';
import { IsString } from 'class-validator';

export class CityDto {

  @Expose()
  @IsString()
  id: string;

  @Expose()
  @IsString()
  fullName: string;

  name: string;

  ruName: string;

}
