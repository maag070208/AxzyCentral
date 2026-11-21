import { config } from "./config";
import { createApp } from "./app";

createApp().listen(config.PORT, () => {
  console.log(`Axzy Central API en http://localhost:${config.PORT}/api/v1`);
});
