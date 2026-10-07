"use client";

import { useId, useRef, useState } from "react";
import { Popover, PopoverClose, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { CloseIcon, HelpIcon, ChevronDownIcon } from "@/components/ui/icons";

const questions = [
  {
    question: "如何生成路线海拔？",
    answer: "先生成驾车路线，再展开路线海拔面板。系统会沿当前路线读取海拔并生成曲线。当前功能在桌面和平板宽屏界面提供。",
  },
  {
    question: "为什么生成海拔需要等待？",
    answer: "系统约每100米采样一次，并分批读取海拔。路线越长、需要读取的新位置越多，等待时间通常越长。进度达到100%后，还可能需要短暂整理曲线。",
  },
  {
    question: "海拔数据来自哪里，准确吗？",
    answer: "当前使用Open Topo Data提供的SRTM地表高程，属于试验接入数据，仅供了解沿途起伏。它并非实际道路测量，桥梁、隧道等位置可能与行驶路面的海拔不同。",
  },
  {
    question: "曲线连续，是否表示数据完整？",
    answer: "不一定。为方便查看整体趋势，曲线会连接有效海拔点之间的缺口。连接部分只是视觉过渡，不代表该位置已经取得海拔数据。",
  },
  {
    question: "为什么有些位置的高程不可用？",
    answer: "可能是数据来源没有返回海拔、部分查询失败，或数据变化异常而被排除。系统不会把这些位置当作零米海拔，也不会通过曲线连接生成读数。",
  },
  {
    question: "如何查看具体位置或某一路段？",
    answer: "将指针移到曲线上，或使用左右方向键查看里程与海拔。选择地图中的已有路段后，图表会切换到该段；横轴仍使用从全程起点累计的公里数。",
  },
  {
    question: "修改路线后，海拔会更新吗？",
    answer: "会。路线更新后，展开面板会按新路线生成海拔。有效缓存中的相同位置可以复用，再次查看或切换路段通常更快；缓存数据不代表实时测量。",
  },
  {
    question: "海拔生成失败怎么办？",
    answer: "检查网络，并根据提示点击重新尝试。服务繁忙、超时、查询额度用完或试验服务未启用，都可能导致失败。当前最多支持约2500公里的海拔分析；海拔失败不影响路线编辑和保存。",
  },
] as const;

export function RouteElevationHelp() {
  const [open, setOpen] = useState(false);
  const id = useId();
  const content = useRef<HTMLDivElement>(null);

  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild>
      <button type="button" className="elevation-help__trigger" aria-label="路线海拔常见问题">
        <HelpIcon />
      </button>
    </PopoverTrigger>
    <PopoverContent ref={content} placement="topLeft" alignOffset={-12} hideWhenDetached
      aria-labelledby={`${id}-title`} tabIndex={-1} data-glass="overlay" className="elevation-help"
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        content.current?.focus({ preventScroll: true });
      }}
      onEscapeKeyDown={(event) => event.stopPropagation()}
      onFocusOutside={(event) => {
        const target = event.detail.originalEvent.target;
        // 页面恢复焦点到body不等同于用户移到另一个控件。
        if (target === document.body || target === document.documentElement) event.preventDefault();
      }}>
      <header className="elevation-help__header">
        <div><h2 id={`${id}-title`}>路线海拔常见问题</h2><p>了解生成方式与数据边界</p></div>
        <PopoverClose asChild>
          <button type="button" aria-label="关闭海拔常见问题"><CloseIcon /></button>
        </PopoverClose>
      </header>
      <div className="elevation-help__questions">
        {questions.map(({ question, answer }) => <details key={question}>
          <summary><span>{question}</span><ChevronDownIcon /></summary>
          <p>{answer}</p>
        </details>)}
      </div>
    </PopoverContent>
  </Popover>;
}
