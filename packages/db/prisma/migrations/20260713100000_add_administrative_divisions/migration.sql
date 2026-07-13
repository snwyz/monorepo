CREATE TABLE "AdministrativeDivision" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "level" INTEGER NOT NULL,
    "parent_code" TEXT,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "coordinate_system" TEXT NOT NULL DEFAULT 'gcj02',
    "source" TEXT NOT NULL DEFAULT 'tencent-map',
    "synced_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AdministrativeDivision_pkey" PRIMARY KEY ("code")
);

CREATE INDEX "AdministrativeDivision_parent_code_level_idx"
ON "AdministrativeDivision"("parent_code", "level");
