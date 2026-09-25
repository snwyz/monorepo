"use client";

import { useCallback, useEffect, useState } from "react";

import type {
  WeatherForecast,
  WeatherForecastTarget,
} from "@/domain/weather-forecast/model";
import {
  fetchWeatherForecast,
  readCachedWeatherForecast,
} from "@/infrastructure/weather-forecast/weather-forecast-client";

type WeatherForecastState =
  | { status: "loading"; forecast: WeatherForecast | null; error: null }
  | { status: "ready"; forecast: WeatherForecast; error: null }
  | { status: "failed"; forecast: null; error: string };

export function useWeatherForecast(target: WeatherForecastTarget) {
  const { id, name, latitude, longitude } = target;
  const [retrySequence, setRetrySequence] = useState(0);
  const [state, setState] = useState<WeatherForecastState>(() => {
    const cached = readCachedWeatherForecast(target);
    return cached
      ? { status: "ready", forecast: cached, error: null }
      : { status: "loading", forecast: null, error: null };
  });

  useEffect(() => {
    const controller = new AbortController();
    const requestTarget = { id, name, latitude, longitude };
    void fetchWeatherForecast(requestTarget, controller.signal, retrySequence > 0)
      .then((forecast) => {
        setState({ status: "ready", forecast, error: null });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        setState({
          status: "failed",
          forecast: null,
          error: error instanceof Error ? error.message : "天气预报暂不可用",
        });
      });
    return () => controller.abort();
  }, [id, latitude, longitude, name, retrySequence]);

  const retry = useCallback(() => {
    setState({ status: "loading", forecast: null, error: null });
    setRetrySequence((sequence) => sequence + 1);
  }, []);

  return { ...state, retry };
}
