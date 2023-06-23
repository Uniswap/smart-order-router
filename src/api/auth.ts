import { IRules, shield, allow } from "graphql-shield";
import { Mutation, Query } from "./generated";

type PermissionsSchema = IRules & {
  Query: Partial<Record<keyof Query | "*", IRules>>;
  Mutation: Partial<Record<keyof Mutation | "*", IRules>>;
};

const permissionsSchema: PermissionsSchema = {
  Query: {
    // getQuote
    getQuote: allow,
  },
  Mutation: {},
};

export const permissionsSchemaShield = shield(permissionsSchema, {
  allowExternalErrors: true,
});
