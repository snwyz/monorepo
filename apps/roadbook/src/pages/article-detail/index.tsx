// AI [2026-07-13]: 展示单篇户外知识文章内容
import { useEffect, useState } from "react";
import { ScrollView, Text, View } from "@tarojs/components";
import { useRouter } from "@tarojs/taro";
import type { ArticleDetail } from "@roadbook/types";
import { http } from "../../services/http";
export default function ArticleDetailPage() {
  const { params } = useRouter();
  const [article, setArticle] = useState<ArticleDetail | null>(null);
  useEffect(() => {
    http.get<ArticleDetail>(`/articles/${params.id}`).then(setArticle);
  }, [params.id]);
  return article ? (
    <ScrollView scrollY>
      <View>
        <Text>{article.title}</Text>
        <Text>{article.content}</Text>
      </View>
    </ScrollView>
  ) : (
    <View>
      <Text>加载中...</Text>
    </View>
  );
}
