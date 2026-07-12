// AI [2026-07-13]: 查询已发布文章的分页列表与详情
import { Injectable, NotFoundException } from "@nestjs/common";
import { DbService } from "../db/db.service";
@Injectable()
export class ArticlesService {
  constructor(private db: DbService) {}
  async findAll(page = 1, pageSize = 20) {
    const [data, total] = await Promise.all([
      this.db.article.findMany({
        where: { status: "published" },
        orderBy: { published_at: "desc" },
        skip: (page - 1) * pageSize,
        take: pageSize,
        select: {
          id: true,
          title: true,
          cover_image_url: true,
          published_at: true,
        },
      }),
      this.db.article.count({ where: { status: "published" } }),
    ]);
    return { data, total, page, page_size: pageSize };
  }
  async findOne(id: string) {
    const article = await this.db.article.findUnique({
      where: { id, status: "published" },
    });
    if (!article) throw new NotFoundException("Article not found");
    return article;
  }
}
