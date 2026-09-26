"use client";

import type { PlaceCandidate } from "@roadbook/map/web";
import Image from "next/image";
import { createPortal, flushSync } from "react-dom";
import {
  lazy,
  Suspense,
  useCallback,
  useImperativeHandle,
  type Ref,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

import { RoadbookMark } from "@/components/branding/roadbook-mark";
import {
  CloseIcon,
  FilledLocationIcon,
  SearchIcon,
} from "@/components/ui/icons";
import type {
  FeaturedDrivingRoute,
  FeaturedRouteCategory,
} from "@/domain/featured-driving-route/model";
import { LocalSearchHistoryRepository } from "@/infrastructure/map-search/local-search-history-repository";

const FeaturedRoutePreviewDialog = lazy(() =>
  import("@/components/featured-driving-route/featured-route-preview-dialog").then(
    (module) => ({ default: module.FeaturedRoutePreviewDialog }),
  ),
);

type GlobalSearchState = "closed" | "discovering" | "filtering" | "preview-dialog";
type PlaceSearchStatus = "idle" | "loading" | "empty" | "failed" | "unavailable";

export interface GlobalSearchHandle {
  open: () => void;
}

interface GlobalSearchProps {
  ref?: Ref<GlobalSearchHandle>;
  insertionLabel?: string;
  onClose?: () => void;
  onOpenChange?: (open: boolean) => void;
  onPreviewChange?: (open: boolean) => void;
  placeholder: string;
  placeSearchDisabled?: boolean;
  placeSearchDisabledReason?: string;
  featuredRoutes: FeaturedDrivingRoute[];
  categories: FeaturedRouteCategory[];
  onSearchPlaces: (keyword: string) => Promise<PlaceCandidate[]>;
  onSelectPlace: (candidate: PlaceCandidate) => void | Promise<void>;
  onLoadFeaturedRoute: (route: FeaturedDrivingRoute) => void | Promise<void>;
}

const mobileQuery = "(max-width: 760px)";
function subscribeMobile(onChange: () => void) {
  const query = window.matchMedia(mobileQuery);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

function updatePreviewUrl(routeId: string | null) {
  const url = new URL(window.location.href);
  if (routeId) url.searchParams.set("routePreview", routeId);
  else url.searchParams.delete("routePreview");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

export function GlobalSearch({
  ref,
  insertionLabel,
  onClose,
  onOpenChange,
  onPreviewChange,
  placeholder,
  placeSearchDisabled,
  placeSearchDisabledReason,
  featuredRoutes,
  categories,
  onSearchPlaces,
  onSelectPlace,
  onLoadFeaturedRoute,
}: GlobalSearchProps) {
  const isMobile = useSyncExternalStore(subscribeMobile, () => window.matchMedia(mobileQuery).matches, () => false);
  const historyRepository = useMemo(() => new LocalSearchHistoryRepository(), []);
  const rootRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const requestIdRef = useRef(0);
  const initialUrlHandledRef = useRef(false);
  const shouldFocusInputRef = useRef(false);
  const closeTimerRef = useRef<number | null>(null);
  const [state, setState] = useState<GlobalSearchState>("closed");
  const [isClosing, setIsClosing] = useState(false);
  const [query, setQuery] = useState("");
  const [recentQueries, setRecentQueries] = useState<string[]>(() => (
    historyRepository.list()
  ));
  const [placeItems, setPlaceItems] = useState<PlaceCandidate[]>([]);
  const [placeStatus, setPlaceStatus] = useState<PlaceSearchStatus>("idle");
  const [placeError, setPlaceError] = useState("");
  const [previewRoute, setPreviewRoute] = useState<FeaturedDrivingRoute | null>(null);

  const isSearchOpen = state === "discovering" || state === "filtering";
  useEffect(() => { onOpenChange?.(isSearchOpen || state === "preview-dialog"); onPreviewChange?.(state === "preview-dialog"); }, [isSearchOpen, state, onOpenChange, onPreviewChange]);
  const normalizedQuery = query.trim().toLocaleLowerCase("zh-CN");
  const matchedRoutes = useMemo(() => {
    if (!normalizedQuery) return featuredRoutes;
    return featuredRoutes.filter((route) => (
      [route.name, route.description, ...route.keywords]
        .join(" ")
        .toLocaleLowerCase("zh-CN")
        .includes(normalizedQuery)
    ));
  }, [featuredRoutes, normalizedQuery]);

  const recordQuery = useCallback((value: string) => {
    try {
      setRecentQueries(historyRepository.record(value));
    } catch {
      // 搜索历史不可写不应阻断搜索和路线浏览。
    }
  }, [historyRepository]);

  const closeSearch = useCallback((restoreFocus = true) => {
    requestIdRef.current += 1;
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    setIsClosing(true);
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const finishClose = () => {
      closeTimerRef.current = null;
      onClose?.();
      setState("closed");
      setIsClosing(false);
      setQuery("");
      setPlaceItems([]);
      setPlaceStatus("idle");
      setPlaceError("");
      inputRef.current?.blur();
      if (restoreFocus) {
        window.requestAnimationFrame(() => triggerRef.current?.focus());
      }
    };
    if (reducedMotion || window.matchMedia("(max-width: 760px)").matches) finishClose();
    else closeTimerRef.current = window.setTimeout(finishClose, 160);
  }, [onClose]);

  const openDiscovering = useCallback(() => {
    requestIdRef.current += 1;
    setQuery("");
    setPlaceItems([]);
    setPlaceStatus("idle");
    if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    closeTimerRef.current = null;
    setIsClosing(false);
    flushSync(() => { setState("discovering"); onOpenChange?.(true); });
    inputRef.current?.focus();
  }, [onOpenChange]);

  useImperativeHandle(ref, () => ({ open: openDiscovering }), [openDiscovering]);

  const closePreview = useCallback((loaded = false) => {
    updatePreviewUrl(null);
    setPreviewRoute(null);
    setState(loaded ? "closed" : "discovering");
    if (loaded) window.requestAnimationFrame(() => triggerRef.current?.focus());
  }, []);

  const openPreview = useCallback((route: FeaturedDrivingRoute) => {
    recordQuery(route.name);
    setPreviewRoute(route);
    setState("preview-dialog");
    inputRef.current?.blur();
    updatePreviewUrl(route.id);
  }, [recordQuery]);

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) window.clearTimeout(closeTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (initialUrlHandledRef.current) return;
    const routeId = new URL(window.location.href).searchParams.get("routePreview");
    const route = featuredRoutes.find((item) => item.id === routeId);
    if (!route) return;
    const timer = window.setTimeout(() => {
      if (initialUrlHandledRef.current) return;
      initialUrlHandledRef.current = true;
      setPreviewRoute(route);
      setState("preview-dialog");
    }, 0);
    return () => window.clearTimeout(timer);
  }, [featuredRoutes]);

  useEffect(() => {
    if (!isSearchOpen || !shouldFocusInputRef.current) return;
    shouldFocusInputRef.current = false;
    window.requestAnimationFrame(() => inputRef.current?.focus());
  }, [isSearchOpen, state]);

  useEffect(() => {
    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (state === "closed") openDiscovering();
        else if (state !== "preview-dialog") closeSearch();
        return;
      }
      if (event.key === "Escape" && isSearchOpen) {
        event.preventDefault();
        closeSearch();
      }
    };
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [closeSearch, isSearchOpen, openDiscovering, state]);

  const runPlaceSearch = useCallback(async (value: string) => {
    const keyword = value.trim();
    if (!keyword) return;
    if (placeSearchDisabled) {
      setPlaceItems([]);
      setPlaceStatus("unavailable");
      return;
    }
    const requestId = ++requestIdRef.current;
    setPlaceStatus("loading");
    setPlaceError("");
    try {
      const results = await onSearchPlaces(keyword);
      if (requestIdRef.current !== requestId) return;
      setPlaceItems(results);
      setPlaceStatus(results.length ? "idle" : "empty");
    } catch (error) {
      if (requestIdRef.current !== requestId) return;
      setPlaceItems([]);
      setPlaceStatus("failed");
      setPlaceError(error instanceof Error ? error.message : "地点搜索失败，请稍后重试");
    }
  }, [onSearchPlaces, placeSearchDisabled]);

  useEffect(() => {
    if (state !== "filtering" || !query.trim()) return;
    const timer = window.setTimeout(() => void runPlaceSearch(query), 280);
    return () => window.clearTimeout(timer);
  }, [query, runPlaceSearch, state]);

  const applyQuery = useCallback((value: string) => {
    requestIdRef.current += 1;
    setPlaceItems([]);
    setPlaceStatus("idle");
    setQuery(value);
    setState(value.trim() ? "filtering" : "discovering");
    shouldFocusInputRef.current = true;
  }, []);

  const choosePlace = useCallback((item: PlaceCandidate) => {
    recordQuery(query || item.name);
    void onSelectPlace(item);
    closeSearch(false);
  }, [closeSearch, onSelectPlace, query, recordQuery]);

  const focusSearchOption = (direction: 1 | -1, current?: HTMLElement) => {
    const options = Array.from(
      rootRef.current?.querySelectorAll<HTMLElement>("[data-search-option]") ?? [],
    );
    if (!options.length) return;
    const currentIndex = current ? options.indexOf(current) : -1;
    const nextIndex = currentIndex < 0
      ? direction === 1 ? 0 : options.length - 1
      : (currentIndex + direction + options.length) % options.length;
    options[nextIndex]?.focus();
  };

  const handleInputKeyDown = (event: ReactKeyboardEvent<HTMLInputElement>) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      focusSearchOption(event.key === "ArrowDown" ? 1 : -1);
      return;
    }
    if (event.key !== "Enter" || state !== "filtering") return;
    event.preventDefault();
    if (matchedRoutes[0]) openPreview(matchedRoutes[0]);
    else if (placeItems[0]) choosePlace(placeItems[0]);
    else recordQuery(query);
  };

  const handleOptionKeyDown = (event: ReactKeyboardEvent<HTMLElement>) => {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    focusSearchOption(event.key === "ArrowDown" ? 1 : -1, event.currentTarget);
  };

  const clearQuery = () => {
    requestIdRef.current += 1;
    setPlaceItems([]);
    setPlaceStatus("idle");
    applyQuery("");
    inputRef.current?.focus();
  };
  const clearHistory = () => {
    historyRepository.clear();
    setRecentQueries([]);
  };

  const insertionContext = insertionLabel ? (
    <div className="search-insertion-context" role="status">
      <span>{insertionLabel}</span>
      <button type="button" onClick={() => closeSearch()}>取消</button>
    </div>
  ) : null;

  return (
    <>
      <section
        ref={rootRef}
        className={`global-search is-${state}${isClosing ? " is-closing" : ""}`}
        data-state={state}
        aria-label="全局搜索"
      >
        {isSearchOpen ? (
          <button
            type="button"
            className={`global-search-overlay${isClosing ? " is-closing" : ""}`}
            aria-label="关闭全局搜索"
            tabIndex={-1}
            onClick={() => closeSearch()}
          />
        ) : null}
        {state === "preview-dialog" ? null : isSearchOpen ? (
          <form
            className="global-search__bar"
            role="search"
            onSubmit={(event) => event.preventDefault()}
          >
            <SearchIcon />
            <input
              ref={inputRef}
              type="search"
              autoComplete="off"
              value={query}
              aria-label="搜索地点或热门自驾路线"
              placeholder={insertionLabel ? "搜索地点，添加到此路段" : placeholder}
              onChange={(event) => applyQuery(event.target.value)}
              onKeyDown={handleInputKeyDown}
            />
            {query ? (
              <button
                type="button"
                className="global-search__clear"
                aria-label="清空搜索"
                onClick={clearQuery}
              >
                <CloseIcon />
              </button>
            ) : <kbd>⌘ K</kbd>}
            <button type="button" className="global-search__cancel" onClick={() => closeSearch()}>取消</button>
          </form>
        ) : (
          <button
            ref={triggerRef}
            type="button"
            className="global-search__trigger"
            aria-label="打开全局搜索"
            onClick={openDiscovering}
          >
            <SearchIcon />
            <span>搜索地点或路线</span>
            <kbd>⌘ K</kbd>
          </button>
        )}

        {state === "discovering" ? (
          <div className="global-search__panel global-search__discover-panel">
            {insertionContext}
            {recentQueries.length ? (
              <section className="search-discovery-section">
                <header className="search-discovery-heading">
                  <h2>最近搜索</h2>
                  <button type="button" onClick={clearHistory}>清除</button>
                </header>
                <div className="search-history-row">
                  {recentQueries.map((item) => (
                    <button key={item} type="button" onClick={() => applyQuery(item)}>
                      {item}
                    </button>
                  ))}
                </div>
              </section>
            ) : null}

            <section className="search-discovery-section">
              <header className="search-discovery-heading"><h2>分类浏览</h2></header>
              <div className="search-category-row">
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => applyQuery(category.query)}
                  >
                    <span>{category.label}</span>
                    {category.count > 1 ? <small>{category.count}</small> : null}
                  </button>
                ))}
              </div>
            </section>

            {!insertionLabel ? <section className="search-discovery-section">
              <header className="search-discovery-heading"><h2>热门自驾路线</h2></header>
              <div className="featured-route-card-row">
                {featuredRoutes.map((route) => (
                  <button
                    key={route.id}
                    type="button"
                    className="featured-route-card"
                    onClick={() => openPreview(route)}
                  >
                    <span className="featured-route-card__preview">
                      <Image
                        src={route.previewImageSrc}
                        alt=""
                        width={132}
                        height={132}
                        loading="lazy"
                        unoptimized
                      />
                    </span>
                    <strong>{route.name}</strong>
                    <small>约 {route.estimatedDistanceKilometers.toLocaleString("en-US")} km</small>
                  </button>
                ))}
              </div>
            </section> : null}
          </div>
        ) : null}

        {state === "filtering" ? (
          <div className="global-search__panel global-search__filter-panel">
            {insertionContext}
            <header className="search-filter-summary">
              <span>搜索结果</span>
              {!insertionLabel ? <strong>{matchedRoutes.length} of {featuredRoutes.length} 条热门路线</strong> : null}
            </header>
            {matchedRoutes.map((route) => (
              <button
                key={route.id}
                type="button"
                className="search-route-result"
                data-search-option
                onClick={() => openPreview(route)}
                onKeyDown={handleOptionKeyDown}
              >
                <span className="search-route-result__icon"><RoadbookMark /></span>
                <span><strong>{route.name}</strong><small>{route.roadCodes.join(" · ")}</small></span>
              </button>
            ))}
            <div className="search-filter-divider"><span>地点</span></div>
            {placeStatus === "loading" ? <p className="search-message"><span className="spinner" />正在搜索地点…</p> : null}
            {placeStatus === "unavailable" ? <p className="search-message">{placeSearchDisabledReason ?? "当前无法搜索地点"}</p> : null}
            {placeStatus === "empty" ? <p className="search-message">没有找到匹配地点。</p> : null}
            {placeStatus === "failed" ? (
              <div className="search-message search-message--error" role="status">
                <span>{placeError}</span>
                <button type="button" onClick={() => void runPlaceSearch(query)}>重试</button>
              </div>
            ) : null}
            {placeItems.map((item) => (
              <button
                type="button"
                className="search-place-result"
                data-search-option
                key={item.id}
                onClick={() => choosePlace(item)}
                onKeyDown={handleOptionKeyDown}
              >
                <FilledLocationIcon />
                <span><strong>{item.name}</strong><small>{item.address}</small></span>
              </button>
            ))}
          </div>
        ) : null}
      </section>

      {state === "preview-dialog" && previewRoute ? (isMobile ? (
        <Suspense fallback={<p role="status">正在加载路线介绍…</p>}>
          <FeaturedRoutePreviewDialog route={previewRoute} inline onClose={() => closePreview()}
            onLoad={async () => { await onLoadFeaturedRoute(previewRoute); closePreview(true); }} />
        </Suspense>
      ) : createPortal(
        <Suspense fallback={null}>
          <FeaturedRoutePreviewDialog route={previewRoute} onClose={() => closePreview()}
            onLoad={async () => { await onLoadFeaturedRoute(previewRoute); closePreview(true); }} />
        </Suspense>, document.body,
      )) : null}
    </>
  );
}
