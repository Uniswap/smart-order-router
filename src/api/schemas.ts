import "graphql-import-node";
import { makeExecutableSchema } from "@graphql-tools/schema";
import { GraphQLSchema } from "graphql";
import { rootTypeDefs } from "./schemas/empty";
import { sharedTypeDefs } from "./schemas/shared.types";
import resolvers from "./resolvers";
import { RouterTypeDefs } from "./schemas/router";

const schema: GraphQLSchema = makeExecutableSchema({
  typeDefs: [rootTypeDefs, sharedTypeDefs, RouterTypeDefs],
  resolvers,
});

export default schema;
