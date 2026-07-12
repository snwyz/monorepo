// AI [2026-07-13]: 定义路书前后端共用的数据模型与接口
export type Difficulty = "easy" | "medium" | "hard" | "extreme";
export type RouteStatus = "draft" | "published";
export type PoiType = "rv_camp" | "ev_charge";
export type ArticleStatus = "draft" | "published";

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface RouteMarker {
  id: string;
  title: string;
  start_lat: number;
  start_lng: number;
  difficulty: Difficulty;
  distance_km: number;
}

export interface RouteDetail extends RouteMarker {
  description: string;
  duration_hours: number;
  elevation_gain_m: number;
  waypoints: Coordinate[];
  polyline: Coordinate[];
  cover_image_url: string | null;
  region: string | null;
  tags: string[];
  published_at: string | null;
  is_collected: boolean;
}

export interface PoiItem {
  id: string;
  name: string;
  type: PoiType;
  lat: number;
  lng: number;
  description: string | null;
  images: string[];
}

export interface ArticleSummary {
  id: string;
  title: string;
  cover_image_url: string | null;
  published_at: string | null;
}

export interface ArticleDetail extends ArticleSummary {
  content: string;
}

export interface UserProfile {
  id: string;
  nickname: string;
  avatar_url: string | null;
}

export interface ApiResponse<T> {
  data: T;
}

export interface PaginatedResponse<T> {
  data: T[];
  total: number;
  page: number;
  page_size: number;
}
