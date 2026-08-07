import { buildApp } from "./app.js";
import { config } from "./config.js";

const app = await buildApp();

app.listen({ port: config.PORT, host: "0.0.0.0" }, (err, address) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
  app.log.info(`server listening at ${address}`);
});
