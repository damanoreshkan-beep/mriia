export const CONFIG = {
  fallback: { lat: 50.4501, lng: 30.5234, place: null },
  lastFixKey: "ms-weather-fix",
  geo: { timeout: 6000, maximumAge: 600000 },
  geocode: "https://api.bigdatacloud.net/data/reverse-geocode-client",
  forecast: {
    base: "https://api.open-meteo.com/v1/forecast",
    query: "&current=temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,wind_gusts_10m,cloud_cover,precipitation,precipitation_probability,is_day,visibility,uv_index&hourly=temperature_2m,weather_code&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=5",
  },
};
