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
    <ScrollView className="h-screen bg-slate-50" scrollY>
      <View className="p-4">
        <Text className="mb-4 block text-2xl font-bold text-slate-900">
          {article.title}
        </Text>
        <Text className="text-base leading-7 text-slate-700">{article.content}</Text>
      </View>
    </ScrollView>
  ) : (
    <View className="flex min-h-screen items-center justify-center bg-slate-50">
      <Text className="text-slate-500">加载中...</Text>
    </View>
  );
}
