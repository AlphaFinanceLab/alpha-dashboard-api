module.exports = {
    apps : [{
      name: "app",
      script: "./build/api.js",
      env: {
        NODE_ENV: "development",
      },
      env_production: {
        NODE_ENV: "production",
      }
    }]
}