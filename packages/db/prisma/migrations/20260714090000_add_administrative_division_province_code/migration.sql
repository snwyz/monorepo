ALTER TABLE "AdministrativeDivision" ADD COLUMN "province_code" TEXT;

-- 已同步的历史数据来自四川省；新同步任务会为任意省份写入其根行政区划编码。
UPDATE "AdministrativeDivision" SET "province_code" = '510000' WHERE "province_code" IS NULL;

ALTER TABLE "AdministrativeDivision" ALTER COLUMN "province_code" SET NOT NULL;

CREATE INDEX "AdministrativeDivision_province_code_level_idx"
ON "AdministrativeDivision"("province_code", "level");
