import { gql } from "apollo-server-express";

export const rootTypeDefs = gql`
  type Query {
    _empty: String
  }

  type Mutation {
    _empty: String
  }

  interface Node {
    id: ID!
  }
`;
