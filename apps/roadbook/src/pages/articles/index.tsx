// AI [2026-07-13]: 展示可阅读的户外知识文章列表
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import type { ArticleSummary } from "@roadbook/types";
import { http } from "../../services/http";
export default function ArticlesPage() {
  const [articles, setArticles] = useState<ArticleSummary[]>([]);
  useEffect(() => {
    http
      .get<{ data: ArticleSummary[] }>("/articles?page=1&page_size=20")
      .then((r) => setArticles(r.data));
  }, []);
  return (
    <ScrollView scrollY>
      <Text>户外知识</Text>
      {articles.map((a) => (
        <View
          key={a.id}
          onClick={() =>
            Taro.navigateTo({ url: `/pages/article-detail/index?id=${a.id}` })
          }
        >
          <Text>{a.title}</Text>
        </View>
      ))}
    </ScrollView>
  );
}
