"use client";

import type { PlaceCandidate } from "@roadbook/map/web";
import { useCallback, useEffect, useRef, useState } from "react";

import { CloseIcon, FilledLocationIcon, SearchIcon } from "@/components/ui/icons";

interface PlaceSearchProps {
  disabled?: boolean;
  placeholder?: string;
  onSearch: (keyword: string) => Promise<PlaceCandidate[]>;
  onSelect: (candidate: PlaceCandidate) => void;
}

export function PlaceSearch({
  disabled,
  placeholder = "搜索地点，添加路线控制点",
  onSearch,
  onSelect,
}: PlaceSearchProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const [query, setQuery] = useState("");
  const [items, setItems] = useState<PlaceCandidate[]>([]);
  const [status, setStatus] = useState<"idle" | "loading" | "empty" | "failed">("idle");
  const [errorMessage, setErrorMessage] = useState("");

  const runSearch = useCallback(async (value: string) => {
    const keyword = value.trim();
    if (keyword.length < 2 || disabled) return;
    const requestId = ++requestIdRef.current;
    setStatus("loading");
    setErrorMessage("");
    try {
      const results = await onSearch(keyword);
      if (requestIdRef.current !== requestId) return;
      setItems(results);
      setStatus(results.length ? "idle" : "empty");
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setItems([]);
      setStatus("failed");
      setErrorMessage(error instanceof Error ? error.message : "地点搜索失败，请稍后重试");
    }
  }, [disabled, onSearch]);

  useEffect(() => {
    if (query.trim().length < 2 || disabled) return;
    const timer = window.setTimeout(() => void runSearch(query), 320);
    return () => window.clearTimeout(timer);
  }, [disabled, query, runSearch]);

  useEffect(() => {
    const focusSearch = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  const clear = () => {
    requestIdRef.current += 1;
    setQuery("");
    setItems([]);
    setStatus("idle");
    setErrorMessage("");
    inputRef.current?.focus();
  };

  const choose = (item: PlaceCandidate) => {
    onSelect(item);
    clear();
  };

  return (
    <section className="place-search widget" aria-label="地点搜索">
      <form className="place-search__input" onSubmit={(event) => { event.preventDefault(); void runSearch(query); }}>
        <SearchIcon />
        <input
          ref={inputRef}
          value={query}
          disabled={disabled}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (value.trim().length < 2) {
              requestIdRef.current += 1;
              setItems([]);
              setStatus("idle");
              setErrorMessage("");
            }
          }}
          placeholder={disabled ? "地图服务连接后可搜索" : placeholder}
          aria-label="搜索地点"
          aria-autocomplete="list"
        />
        {query ? <button className="place-search__clear" type="button" aria-label="清空搜索" onClick={clear}><CloseIcon /></button> : <kbd>⌘ K</kbd>}
        <button className="place-search__submit" type="submit" disabled={disabled || query.trim().length < 2}>搜索</button>
      </form>
      {items.length > 0 || status !== "idle" && query.trim().length >= 2 ? (
        <div className="place-search__results" role="listbox">
          {status === "loading" ? <p className="search-message"><span className="spinner" />正在搜索附近地点…</p> : null}
          {status === "empty" ? <p className="search-message">没有找到匹配地点，请换个关键词。</p> : null}
          {status === "failed" ? (
            <div className="search-message search-message--error" role="status">
              <span>{errorMessage}</span>
              <button type="button" onClick={() => void runSearch(query)}>重试</button>
            </div>
          ) : null}
          {items.map((item) => (
            <button type="button" role="option" aria-selected="false" key={item.id} onClick={() => choose(item)}>
              <FilledLocationIcon className="candidate-pin" />
              <span><strong>{item.name}</strong><small>{item.address}</small></span>
            </button>
          ))}
        </div>
      ) : null}
    </section>
  );
}
