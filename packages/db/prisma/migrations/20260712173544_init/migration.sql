-- CreateEnum
CREATE TYPE "Difficulty" AS ENUM ('easy', 'medium', 'hard', 'extreme');

-- CreateEnum
CREATE TYPE "RouteStatus" AS ENUM ('draft', 'published');

-- CreateEnum
CREATE TYPE "PoiType" AS ENUM ('rv_camp', 'ev_charge');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('draft', 'published');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "openid" TEXT NOT NULL,
    "nickname" TEXT NOT NULL DEFAULT '路书用户',
    "avatar_url" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Route" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "difficulty" "Difficulty" NOT NULL,
    "distance_km" DECIMAL(8,2) NOT NULL,
    "duration_hours" DECIMAL(6,2),
    "elevation_gain_m" INTEGER,
    "start_lat" DECIMAL(9,6) NOT NULL,
    "start_lng" DECIMAL(9,6) NOT NULL,
    "end_lat" DECIMAL(9,6) NOT NULL,
    "end_lng" DECIMAL(9,6) NOT NULL,
    "bounds_min_lat" DECIMAL(9,6) NOT NULL,
    "bounds_max_lat" DECIMAL(9,6) NOT NULL,
    "bounds_min_lng" DECIMAL(9,6) NOT NULL,
    "bounds_max_lng" DECIMAL(9,6) NOT NULL,
    "waypoints" JSONB NOT NULL DEFAULT '[]',
    "polyline" JSONB NOT NULL DEFAULT '[]',
    "cover_image_url" TEXT,
    "region" TEXT,
    "tags" JSONB NOT NULL DEFAULT '[]',
    "status" "RouteStatus" NOT NULL DEFAULT 'draft',
    "author_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "Route_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "POI" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "PoiType" NOT NULL,
    "lat" DECIMAL(9,6) NOT NULL,
    "lng" DECIMAL(9,6) NOT NULL,
    "description" TEXT,
    "images" JSONB NOT NULL DEFAULT '[]',
    "source" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "POI_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "cover_image_url" TEXT,
    "author_id" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'draft',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "published_at" TIMESTAMP(3),

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RouteCollection" (
    "user_id" TEXT NOT NULL,
    "route_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RouteCollection_pkey" PRIMARY KEY ("user_id","route_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_openid_key" ON "User"("openid");

-- CreateIndex
CREATE INDEX "Route_status_bounds_min_lat_bounds_max_lat_bounds_min_lng_b_idx" ON "Route"("status", "bounds_min_lat", "bounds_max_lat", "bounds_min_lng", "bounds_max_lng");

-- CreateIndex
CREATE INDEX "Route_author_id_idx" ON "Route"("author_id");

-- CreateIndex
CREATE INDEX "POI_type_lat_lng_idx" ON "POI"("type", "lat", "lng");

-- CreateIndex
CREATE INDEX "Article_status_published_at_idx" ON "Article"("status", "published_at");

-- AddForeignKey
ALTER TABLE "Route" ADD CONSTRAINT "Route_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_author_id_fkey" FOREIGN KEY ("author_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteCollection" ADD CONSTRAINT "RouteCollection_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RouteCollection" ADD CONSTRAINT "RouteCollection_route_id_fkey" FOREIGN KEY ("route_id") REFERENCES "Route"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
