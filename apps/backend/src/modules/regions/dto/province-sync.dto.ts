import { IsNotEmpty, IsString } from "class-validator";

export class ProvinceSyncDto {
  @IsString() @IsNotEmpty() province_code!: string;
}
