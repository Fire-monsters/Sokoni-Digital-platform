module.exports = ({ config }) => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  return {
    ...config,
    plugins: [...(config.plugins ?? []), "expo-font", "expo-image", "expo-web-browser"],
    ios: {
      ...config.ios,
      ...(googleMapsApiKey ? { config: { ...config.ios?.config, googleMapsApiKey } } : {}),
    },
    android: {
      ...config.android,
      ...(googleMapsApiKey
        ? {
            config: {
              ...config.android?.config,
              googleMaps: { ...config.android?.config?.googleMaps, apiKey: googleMapsApiKey },
            },
          }
        : {}),
    },
  };
};
