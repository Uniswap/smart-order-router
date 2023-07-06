import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import apollo from "./apollo";
import { QuoteService } from "./services/quote_service";

(async () => {
  const port = process.env.SMART_ORDER_ROUTER_PORT || 3000;

  const app = express();
  app.use(cors());
  app.use(bodyParser.json({ limit: "50mb" }));
  app.use(bodyParser.urlencoded({ limit: "50mb", extended: true }));

  await QuoteService.init();
  
  await apollo.start();
  apollo.applyMiddleware({ app, path: "/" });
  app.listen(port, () => {
    console.log(`Server running at port ${port}`);
  });

})();
