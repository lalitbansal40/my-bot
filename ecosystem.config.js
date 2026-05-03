module.exports = {
  apps: [
    {
      name: "autochatix-backend",
      script: "dist/index.js",
      node_args: "--max-old-space-size=1500",
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: "1600M",
      env: {
        NODE_ENV: "production",
        PORT: "5005",
      },
    },
  ],
};
