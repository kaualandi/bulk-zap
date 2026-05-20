module.exports = {
  apps: [
    {
      name: "bulkzap-api",
      cwd: "./apps/api",
      script: "bun",
      args: "run src/index.ts",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "768M",
      restart_delay: 2000,
    },
    {
      name: "bulkzap-web",
      cwd: "./apps/web",
      script: "bun",
      args: "run start",
      env: {
        NODE_ENV: "production",
      },
      max_memory_restart: "512M",
      restart_delay: 2000,
    },
  ],
};
