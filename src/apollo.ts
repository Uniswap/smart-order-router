import { ApolloServer } from "apollo-server-express";
import { applyMiddleware } from "graphql-middleware";
import schema from "./api/schemas";
import { permissionsSchemaShield } from "./api/auth";

const apollo = new ApolloServer({
  schema: applyMiddleware(schema, permissionsSchemaShield),
  context: ({ req }) => {
    // ignore token for endpoints that do  not need tokens
    if (
      [
        // allow to get quote without token
        "GetQuoteQuery",
      ].includes(req?.body?.operationName)
    ) {
      return {
        quoteId: req?.headers?.["x-request-id"],
      };
    }

    return {};
  },
});

export default apollo;
