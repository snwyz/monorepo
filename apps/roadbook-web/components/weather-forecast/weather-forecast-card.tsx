"use client";

import { useEffect, useId } from "react";

import type {
  WeatherForecastTarget,
  WeatherSymbolName,
} from "@/domain/weather-forecast/model";
import { useWeatherForecast } from "@/hooks/use-weather-forecast";

import styles from "./weather-forecast-card.module.css";

interface WeatherForecastCardProps {
  target: WeatherForecastTarget;
  onClose: () => void;
}

const weekdayFormatter = new Intl.DateTimeFormat("zh-CN", {
  weekday: "short",
});

function formatDayLabel(date: string, index: number) {
  if (index === 0) return "今天";
  const value = new Date(`${date}T12:00:00`);
  return Number.isNaN(value.getTime()) ? `第 ${index + 1} 天` : weekdayFormatter.format(value);
}

function formatUpdateTime(value: string) {
  const match = value.match(/\b\d{2}:\d{2}\b/);
  return match?.[0] ?? "时间未知";
}

function CloudShape() {
  return (
    <path
      className={styles.cloudFill}
      d="M6.6 18.2h10.8a4.1 4.1 0 0 0 .65-8.15A6.15 6.15 0 0 0 6.35 8.4 4.9 4.9 0 0 0 6.6 18.2Z"
    />
  );
}

function SunShape({ partlyCloudy = false }: { partlyCloudy?: boolean }) {
  if (partlyCloudy) {
    return (
      <>
        <circle className={styles.sunFill} cx="8.1" cy="8" r="3.45" />
        <path className={styles.sunStroke} d="M8.1 2.1v1.55M3.9 3.8 5 4.9M2.1 8h1.6M12.3 3.8l-1.1 1.1" />
      </>
    );
  }
  return (
    <>
      <path className={styles.sunStroke} d="M12 2.2v2.2M12 19.6v2.2M2.2 12h2.2M19.6 12h2.2M5.07 5.07l1.56 1.56M17.37 17.37l1.56 1.56M18.93 5.07l-1.56 1.56M6.63 17.37l-1.56 1.56" />
      <circle className={styles.sunFill} cx="12" cy="12" r="4.35" />
    </>
  );
}

function WeatherIcon({ symbol }: { symbol: WeatherSymbolName }) {
  return (
    <svg className={styles.icon} viewBox="0 0 24 24" aria-hidden="true">
      {symbol === "sunny" ? <SunShape /> : null}
      {symbol === "partly-cloudy" ? <><SunShape partlyCloudy /><CloudShape /></> : null}
      {symbol === "overcast" ? (
        <>
          <path className={styles.cloudBack} d="M4.2 15.3h9.1a3.5 3.5 0 0 0 .6-6.95A5.15 5.15 0 0 0 4.1 7.2a4.05 4.05 0 0 0 .1 8.1Z" />
          <path className={styles.cloudFill} d="M8 19.2h10a3.65 3.65 0 0 0 .6-7.25A5.5 5.5 0 0 0 8.15 10.5 4.35 4.35 0 0 0 8 19.2Z" />
        </>
      ) : null}
      {symbol === "light-rain" ? (
        <><CloudShape /><path className={styles.rain} d="m8.1 19.9-.65 1.2M12.2 19.9l-.65 1.2M16.3 19.9l-.65 1.2" /></>
      ) : null}
      {symbol === "heavy-rain" ? (
        <><CloudShape /><path className={styles.rainHeavy} d="m7.4 19.7-1 1.85M12.1 19.7l-1 1.85M16.8 19.7l-1 1.85" /></>
      ) : null}
      {symbol === "thunderstorm" ? (
        <>
          <CloudShape />
          <path className={styles.lightning} d="m12.7 17.2-2.15 3.1h1.75l-.85 2.35 3-3.75h-1.8l1.15-1.7Z" />
          <path className={styles.rain} d="m7.35 19.5-.7 1.35M17.35 19.5l-.7 1.35" />
        </>
      ) : null}
      {symbol === "snowy" ? (
        <>
          <CloudShape />
          <path className={styles.snow} d="M8.2 20.3h2.6M9.5 19v2.6M8.58 19.38l1.84 1.84M10.42 19.38l-1.84 1.84M14.2 20.3h2.6M15.5 19v2.6M14.58 19.38l1.84 1.84M16.42 19.38l-1.84 1.84" />
        </>
      ) : null}
      {symbol === "foggy" ? (
        <><CloudShape /><path className={styles.fog} d="M5.7 20.2h7.3M14.8 20.2h3.5M7.5 22.2h4.2M13.5 22.2h4.8" /></>
      ) : null}
      {symbol === "windy" ? (
        <path className={styles.wind} d="M3.2 8.3h10.3c2.7 0 2.7-3.75.15-3.75-1.15 0-1.9.58-2.25 1.42M3.2 12h15.15c3.05 0 3.05 4.25.15 4.25-1.3 0-2.15-.62-2.55-1.52M3.2 15.7h8.4" />
      ) : null}
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true">
      <path d="m5.5 5.5 9 9m0-9-9 9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}

function ForecastSkeleton() {
  return (
    <div className={styles.daysViewport} role="status" aria-label="正在加载七天天气">
      <div className={styles.skeletonDays}>
        {Array.from({ length: 7 }, (_, index) => (
          <span className={styles.skeletonDay} key={index} />
        ))}
      </div>
    </div>
  );
}

export function WeatherForecastCard({ target, onClose }: WeatherForecastCardProps) {
  const titleId = useId();
  const { status, forecast, error, retry } = useWeatherForecast(target);

  useEffect(() => {
    const closeWithEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || document.querySelector('[role="alertdialog"]')) return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", closeWithEscape);
    return () => window.removeEventListener("keydown", closeWithEscape);
  }, [onClose]);

  const dayCount = forecast?.days.length ?? 7;

  return (
    <div className={styles.layer}>
      <aside
        className={styles.card}
        aria-busy={status === "loading"}
        aria-labelledby={titleId}
      >
        <header className={styles.header}>
          <div className={styles.heading} id={titleId}>
            <strong>{target.name}</strong>
            <span>
              {forecast ? `${forecast.locationName} · ` : ""}
              未来 {dayCount} 天（含今天）
            </span>
          </div>
          <button
            className={styles.close}
            type="button"
            onClick={onClose}
            aria-label="关闭天气预报"
            title="关闭"
          >
            <CloseIcon />
          </button>
        </header>

        {status === "loading" ? <ForecastSkeleton /> : null}

        {status === "failed" ? (
          <div className={styles.status} role="alert">
            <strong>天气暂不可用</strong>
            <span>{error}</span>
            <button className={styles.retry} type="button" onClick={retry}>
              重新加载
            </button>
          </div>
        ) : null}

        {status === "ready" ? (
          <>
            <div className={styles.daysViewport} aria-live="polite">
              <div className={styles.days}>
                {forecast.days.map((day, index) => (
                  <div
                    className={`${styles.day}${index === 0 ? ` ${styles.today}` : ""}`}
                    key={day.date}
                  >
                    <span className={styles.dayName}>{formatDayLabel(day.date, index)}</span>
                    <WeatherIcon symbol={day.symbol} />
                    <span className={styles.condition} title={day.condition}>{day.condition}</span>
                    <span className={styles.temperature}>
                      {Math.round(day.highTemperatureCelsius)}°
                      <span>{Math.round(day.lowTemperatureCelsius)}°</span>
                    </span>
                  </div>
                ))}
              </div>
            </div>
            <footer className={styles.footer}>
              {formatUpdateTime(forecast.updatedAt)} 更新 · 腾讯天气
            </footer>
          </>
        ) : null}
      </aside>
    </div>
  );
}
