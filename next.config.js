import("./src/env.mjs");

/** @type {import("next").NextConfig} */
const config = {
  output: "standalone",
  logging: {
    fetches: {
      fullUrl: true,
    },
  },
};

module.exports = config;
