/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// Stockholm Coordinates
const LAT = 59.3293;
const LON = 18.0686;

export interface WeatherData {
  windSpeed: number; // m/s
  cloudCover: number; // 0-100%
  isDay: boolean;
  temperature: number;
}

export const fetchStockholmWeather = async (): Promise<WeatherData | null> => {
  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${LAT}&longitude=${LON}&current=temperature_2m,is_day,wind_speed_10m,cloud_cover&wind_speed_unit=ms&timezone=Europe%2FStockholm`;
    
    const response = await fetch(url);
    if (!response.ok) throw new Error('Weather API failed');
    
    const data = await response.json();
    const current = data.current;

    return {
      windSpeed: current.wind_speed_10m,
      cloudCover: current.cloud_cover,
      isDay: current.is_day === 1,
      temperature: current.temperature_2m
    };
  } catch (error) {
    console.error("Failed to fetch Stockholm weather:", error);
    return null;
  }
};