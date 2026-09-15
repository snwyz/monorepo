import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsIn,
  IsNumber,
  IsNotEmpty,
  IsString,
  ValidateNested,
} from "class-validator";

class DivisionDto {
  @IsString() @IsNotEmpty() code!: string;
  @IsString() @IsNotEmpty() name!: string;
  @IsString() @IsNotEmpty() fullName!: string;
  @Type(() => Number) @IsNumber() latitude!: number;
  @Type(() => Number) @IsNumber() longitude!: number;
}

class SichuanDistrictDto extends DivisionDto {
  @IsString() @IsNotEmpty() cityCode!: string;
  @IsString() @IsNotEmpty() cityName!: string;
}

export class SichuanSyncDto {
  @IsIn(["gcj02"]) coordinateSystem!: "gcj02";
  @ValidateNested() @Type(() => DivisionDto) province!: DivisionDto;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => DivisionDto)
  cities!: DivisionDto[];
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => SichuanDistrictDto)
  districts!: SichuanDistrictDto[];
}
