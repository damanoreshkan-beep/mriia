export const CONFIG = {
  api: "https://air-quality-api.open-meteo.com/v1/air-quality",
  fields: "&current=european_aqi,pm2_5,pm10,ozone,nitrogen_dioxide,sulphur_dioxide,alder_pollen,birch_pollen,grass_pollen,mugwort_pollen,ragweed_pollen,olive_pollen"
    + "&hourly=european_aqi&timezone=auto&forecast_days=2",
  hours: 24,
  pollMs: 300000,
};
