const appJson = require("./app.json");

module.exports = () => {
  const googleMapsApiKey = process.env.GOOGLE_MAPS_API_KEY;
  const expo = appJson.expo;
  return {
    ...expo,
    ios: {
      ...expo.ios,
      ...(googleMapsApiKey ? { config: { googleMapsApiKey } } : {}),
    },
    android: {
      ...expo.android,
      ...(googleMapsApiKey ? { config: { googleMaps: { apiKey: googleMapsApiKey } } } : {}),
    },
  };
};
