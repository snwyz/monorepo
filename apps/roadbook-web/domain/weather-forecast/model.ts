export type WeatherSymbolName =
  | "sunny"
  | "partly-cloudy"
  | "overcast"
  | "light-rain"
  | "heavy-rain"
  | "thunderstorm"
  | "snowy"
  | "foggy"
  | "windy";

export interface DailyWeatherForecast {
  date: string;
  condition: string;
  symbol: WeatherSymbolName;
  highTemperatureCelsius: number;
  lowTemperatureCelsius: number;
}

export interface WeatherForecast {
  locationName: string;
  updatedAt: string;
  source: "tencent";
  days: DailyWeatherForecast[];
}

export interface WeatherForecastTarget {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
}
